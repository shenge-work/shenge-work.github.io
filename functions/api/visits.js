/* ──────────────────────────────────────────────────────────────────────
   全站访客计数 API · Cloudflare Pages Function（路由 /api/visits）
   ──────────────────────────────────────────────────────────────────────
   用途：主页顶栏「复古里程表」的真实全站访问量，替代第三方 abacus。

   为什么放在 Pages 而不是独立 Worker：
     · 独立 Worker 只能挂在 *.workers.dev 域（境内被墙实测超时）或自有域名
       （站长因支付问题暂未购买域名），两条路都走不通；
     · Pages 项目本身的 shenge-work.pages.dev 是既有可用链路，函数与站点同域，
       顺带省掉一层跨域往返；github.io 主站调用时按白名单放行 CORS。

   接口：
     GET  /api/visits                → { ok, total, visitors }
     POST /api/visits { id }         → { ok, total, visitors, counted, isNew }
     OPTIONS                        → 204  CORS 预检

   存储：D1（绑定名 DB，表结构见 db/schema.sql）
     counters         name='total' / name='visitors' 两行汇总
     visitors         visitor id 去重，180 天未活跃即清理
     rate_limits      每 IP 每小时写入上限，防脚本刷计数

   设计取舍：
     · total 用单条 UPDATE ... RETURNING 原子自增，不再有 KV 读改写的漂移；
     · visitors 先 INSERT OR IGNORE，再看 meta.changes 决定是否 +1，
       极端并发下同一新访客可能双计 1 次，对展示数字无影响，故不加事务；
     · 计数接口的 Origin 校验是「有则校验、无则放行」：浏览器同源 POST 一定带
       Origin，curl / 服务端调用不带；真正防刷靠 IP 限流，而不是 Origin；
     · GET 公开可读（只有两个数字，不含任何个人信息）。
   ────────────────────────────────────────────────────────────────────── */

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };

const VISITOR_TTL_MS = 180 * 24 * 60 * 60 * 1000; // 180 天不活跃即清掉
const IP_WINDOW_MS = 60 * 60 * 1000;              // 每 IP 限流窗口 1 小时
const IP_LIMIT = 60;                             // 每 IP 每小时最多 60 次计数写入
const DEFAULT_ORIGINS = [
  'https://chenpeisheng.cn',
  'https://shenge-work.pages.dev',
  '*.shenge-work.pages.dev',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
  'http://localhost:8877',
  'http://127.0.0.1:8877',
];

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || DEFAULT_ORIGINS.join(','))
    .split(',').map((s) => s.trim()).filter(Boolean);
}

function isAllowedOrigin(origin, allow) {
  const o = String(origin || '').trim();
  if (!o) return false;
  const host = o.replace(/^https?:\/\//, '');
  return allow.some((rule) => {
    if (rule === o) return true;
    if (rule.indexOf('*.') === 0) {
      const suffix = rule.slice(1);
      return host.length > suffix.length && host.slice(-suffix.length) === suffix;
    }
    return false;
  });
}

function corsHeaders(origin) {
  const h = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (origin) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

function json(body, extra, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign({}, JSON_HEADERS, extra || {}),
  });
}

/* 归一化 visitor id：只留小写字母、数字、连字符，最长 64 位 */
function normalizeId(raw) {
  return String(raw == null ? '' : raw)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 64);
}

function ipOf(request) {
  const xff = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || '';
  return (xff.split(',')[0] || 'unknown').trim();
}

/* 限流键只留 IP 的 SHA-256 前 8 字节，库里不落明文 IP */
async function ipHash(request) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ipOf(request)));
    return Array.from(new Uint8Array(buf)).slice(0, 8)
      .map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    return 'unknown';
  }
}

async function readCounters(db) {
  const rows = await db.prepare('SELECT name, value FROM counters').all();
  const out = { total: 0, visitors: 0 };
  for (const r of (rows.results || [])) {
    if (r && r.name === 'total') out.total = Number(r.value) || 0;
    if (r && r.name === 'visitors') out.visitors = Number(r.value) || 0;
  }
  /* 历史脏数据（2026-11-19 上线初期曾留下 visitors = total + 1）先在读路径兜住，
     展示上不能出现「第 306 位访客 / 累计访问 305 次」；写路径会在下次计数时落库修正。 */
  if (out.visitors > out.total) out.visitors = out.total;
  return out;
}

/* 固定窗口计数：条件 UPDATE 只在未达上限时自增，返回 null 表示被限。
   这样被拒绝的请求不会把 count 越堆越高，窗口过期后自动从 1 重新开始。 */
async function gate(db, bucket, window, limit, ttlSeconds) {
  const ttl = Math.max(60, ttlSeconds);
  const expires = Date.now() + ttl * 1000;
  const row = await db.prepare(
    `INSERT INTO rate_limits (bucket, window, count, expires_at)
     VALUES (?, ?, 1, ?)
     ON CONFLICT (bucket, window) DO UPDATE SET
       count = rate_limits.count + 1,
       expires_at = excluded.expires_at
     WHERE rate_limits.count < ?
     RETURNING count`
  ).bind(bucket, window, expires, limit).first();
  return row ? Number(row.count) : null;
}

export async function onRequestOptions({ request, env }) {
  const origin = request.headers.get('Origin');
  if (!isAllowedOrigin(origin, allowedOrigins(env))) {
    return new Response(null, { status: 403 });
  }
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

export async function onRequestGet({ request, env }) {
  const origin = request.headers.get('Origin');
  const allow = allowedOrigins(env);
  if (origin && !isAllowedOrigin(origin, allow)) {
    return json({ ok: false, error: 'origin_not_allowed' }, {}, 403);
  }
  const cors = corsHeaders(origin && isAllowedOrigin(origin, allow) ? origin : '');
  const db = env.DB;
  if (!db) return json({ ok: false, error: 'db_not_bound' }, cors, 503);

  try {
    const c = await readCounters(db);
    return json({ ok: true, total: c.total, visitors: c.visitors }, cors);
  } catch (e) {
    return json({ ok: false, error: 'db_error' }, cors, 500);
  }
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('Origin');
  const allow = allowedOrigins(env);
  if (origin && !isAllowedOrigin(origin, allow)) {
    return json({ ok: false, error: 'origin_not_allowed' }, {}, 403);
  }
  const cors = corsHeaders(origin ? origin : '');

  const db = env.DB;
  if (!db) return json({ ok: false, error: 'db_not_bound' }, cors, 503);

  let body = {};
  try { body = await request.json(); } catch (e) { body = null; }
  if (!body || typeof body !== 'object') {
    return json({ ok: false, error: 'bad_request', message: '请求体不是合法 JSON' }, cors, 400);
  }

  const id = normalizeId(body.id);
  if (!id || id.length < 8) {
    return json({ ok: false, error: 'bad_request', message: '缺少合法的 visitor id' }, cors, 400);
  }

  const now = Date.now();
  const win = Math.floor(now / IP_WINDOW_MS);
  const winEnd = (win + 1) * IP_WINDOW_MS;

  try {
    const ipOk = await gate(db, 'visits:ip:' + (await ipHash(request)), String(win), IP_LIMIT,
      Math.ceil((winEnd - now) / 1000) + 60);
    if (ipOk === null) {
      return json({
        ok: false, error: 'rate_limited',
        retryAfter: Math.max(1, Math.ceil((winEnd - now) / 1000)),
      }, cors, 429);
    }

    /* 过期访客清理：counters 只看数字，但 visitors 表会一直长，顺手删掉 */
    await db.prepare('DELETE FROM visitors WHERE last_seen < ?')
      .bind(now - VISITOR_TTL_MS).run();

    /* 注意：这里必须用 INSERT OR IGNORE，而不是 ON CONFLICT DO UPDATE。
       后者在「已存在」时也会执行一次 UPDATE，meta.changes 恒为 1，
       会让「新访客」判断永远成立、visitors 随每次 PV 疯狂增长（实测踩过）。 */
    const ins = await db.prepare(
      'INSERT OR IGNORE INTO visitors (id, first_seen, last_seen) VALUES (?, ?, ?)'
    ).bind(id, now, now).run();

    const isNew = !!(ins.meta && ins.meta.changes > 0);

    /* 先加 total 再加 visitors。旧顺序反过来时，total 更新中途失败会留下
       visitors > total 的脏数据（线上从 11-19 起一直是 +1，11-28 才发现）。
       调换顺序后，最坏情况是 visitors 少 1，绝不会让访客数反超访问数。 */
    const totalRow = await db.prepare(
      `UPDATE counters SET value = value + 1 WHERE name = 'total' RETURNING value`
    ).first();
    const total = totalRow ? Number(totalRow.value) : 0;

    if (isNew) {
      await db.prepare(
        `UPDATE counters SET value = value + 1 WHERE name = 'visitors'`
      ).run();
    } else {
      /* 老访客只刷新最近活跃时间，供 180 天清理使用 */
      await db.prepare('UPDATE visitors SET last_seen = ? WHERE id = ?').bind(now, id).run();
    }

    const visitorsRow = await db.prepare(
      `SELECT value FROM counters WHERE name = 'visitors'`
    ).first();
    let visitors = visitorsRow ? Number(visitorsRow.value) : 0;

    /* 存量脏数据自愈：把多出来的访客数拉回 total，后台概览与主页里程表随即一致。 */
    if (visitors > total) {
      await db.prepare("UPDATE counters SET value = ? WHERE name = 'visitors'")
        .bind(total).run();
      visitors = total;
    }

    return json({
      ok: true,
      counted: true,
      isNew: isNew,
      total: total,
      visitors: visitors,
    }, cors);
  } catch (e) {
    return json({ ok: false, error: 'db_error' }, cors, 500);
  }
}
