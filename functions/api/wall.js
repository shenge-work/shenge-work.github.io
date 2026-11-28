/* ──────────────────────────────────────────────────────────────────────
   留言板 API · Cloudflare Pages Function（路由 /api/wall）
   ──────────────────────────────────────────────────────────────────────
   2026-11-19 改版：从「全站公开墙」变成「按设备隔离的私密留言本」。

   为什么要设备隔离：
     · 访客不想让陌生人看到自己写的话，但又不愿留联系方式；
     · 网页读不到 MAC 地址（浏览器没有这个 API，手机 MAC 还会随机化），
       所以用 crypto.randomUUID() 生成的 device_id 代替：前端存 localStorage，
       每个请求带 X-Device-Id，服务端只存 HMAC 后的 device_hash。
     · 因此这里的隔离是「隐私分区」，不是安全认证：清缓存 / 换浏览器 = 新设备，
       同一人的手机与电脑算两台设备，device_id 也能被伪造。

   接口：
     GET    /api/wall?limit=20&offset=0     → 本设备的留言分页（每条带 replies 对话）
     GET    /api/wall?peek=1                → 本设备总数 + 最新 id + 最新站长回复时间
     POST   /api/wall {name?, text}         → 写留言（绑定当前设备）
     POST   /api/wall {replyTo, text}       → 在本设备某条留言下评论 / 追问（2026-11-23）
     DELETE /api/wall {id} + X-Admin-Token  → 站长应急删除（后台正式入口走后台项目的 /api/messages/*）
     OPTIONS                                → CORS 预检（允许 X-Device-Id / X-Admin-Token）

   为什么评论复用 POST /api/wall 而不是新开路由：
     · 设备校验、内容净化、来源白名单、Turnstile、CORS、D1 连接全都能直接复用；
     · 返回体仍是「本设备整页」，前端 applyPage() 一行就能刷新对话；
     · body.replyTo 存在即走 handleVisitorReply，原留言路径一行不改。
     站长回复由独立后台项目的 /api/messages/reply 写入，公开端只读不写 owner。

   存储（D1，表结构见 db/schema.sql）：
     wall_devices    device_hash / first_seen / last_seen / post_count / ua / status / note
     wall_messages   + device_hash / status / admin_note / updated_at
     wall_replies    message_id / author(owner|visitor) / text / device_hash / status
     rate_limits     仍按 IP 与全站日额度限流

   历史数据：迁移前的留言 device_hash = 'legacy'，公开端查不到，只在后台可见。

   环境变量：
     DEVICE_HASH_PEPPER  设备哈希盐（务必配置；未配置时用内置默认值，仅够本地开发）
     ALLOWED_ORIGINS     可选，逗号分隔来源白名单
     WALL_ADMIN_TOKEN    应急删除令牌
     TURNSTILE_SECRET    Turnstile 服务端密钥

   新留言通知（写入成功后旁路发信，失败不影响访客）：
     RESEND_API_KEY      与简历转发共用；未配置则跳过通知
     RESEND_FROM         与简历转发共用（默认 onboarding@resend.dev）
     WALL_NOTIFY_TO      收件人，默认 hi@chenpeisheng.cn（Resend 未验证域名时只能发注册邮箱）
     WALL_NOTIFY_FROM    可选，单独指定留言通知的发件人
   ────────────────────────────────────────────────────────────────────── */

import { notifyWallMessage, notifyWallReply } from '../lib/wall-notify.js';
import { secretValue } from '../lib/secret.js';

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };

const MAX_TEXT = 300;         // 留言 / 评论正文上限（按 Unicode 码点计，emoji 算 1 个）
const MIN_TEXT = 2;           // 正文最少字数
const MAX_NAME = 16;          // 称呼长度上限
const MAX_REPLIES_PER_MESSAGE = 20; // 单条留言下最多保留 20 条对话（站长 + 访客合计）
const REPLY_IP_LIMIT = 6;     // 评论限流：每 IP 每 10 分钟 6 条（与留言额度分开）
const REPLY_DAY_LIMIT = 40;   // 评论限流：全站每天 40 条
const REPLY_DUP_WINDOW_MS = 300000; // 5 分钟内同一留言相同正文视为重复
const PER_DEVICE_CAP = 20;    // 单设备最多保留 20 条（超出滚掉自己最旧的）
const GLOBAL_CAP = 500;       // 全站兜底上限，只做库体量控制，不按人裁剪
const DEFAULT_LIMIT = 20;     // 每页默认条数
const MAX_LIMIT = 50;         // 单页上限
const IP_WINDOW_MS = 600000;  // 每 IP 限流窗口 10 分钟（固定窗，不是滑窗）
const IP_LIMIT = 3;           // 每 IP 每窗口最多 3 条
const DAY_LIMIT = 30;         // 全站每日最多 30 条（私密留言，量本来就小）
const IP_STRICT_WINDOW_MS = 3600000; // 未通过人机校验：每 IP 每小时最多 1 条
const IP_STRICT_LIMIT = 1;
const DAY_STRICT_LIMIT = 10;
const DUP_WINDOW_MS = 300000; // 5 分钟内同设备相同「称呼 + 内容」视为重复
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

/* 设备 ID：前端 crypto.randomUUID() 生成，也接受 8–64 位的 URL-safe 串。
   宽松一点是为了让 curl / 自检脚本能用一个固定串（如 device-a）做验收。 */
const DEVICE_RE = /^[A-Za-z0-9_-]{8,64}$/;

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

function corsHeaders(origin, allow) {
  const acao = isAllowedOrigin(origin, allow) ? String(origin).trim() : '';
  const h = {
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Device-Id, X-Admin-Token',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (acao) h['Access-Control-Allow-Origin'] = acao;
  return h;
}

/* 公开读接口不设来源白名单（谁都能读，但只能读自己设备的），
   但要把 X-Device-Id 放进允许头，否则跨域 GET 会被预检拦下。 */
const PUBLIC_CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Device-Id',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
};

function json(body, extra, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign({}, JSON_HEADERS, extra || {}),
  });
}

function intParam(v, min, max, fallback) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/* 内容净化：
   · 归一换行、保留 \n / \t
   · 剔除其余控制字符与零宽字符（防隐藏文本 / 排版攻击）
   · 按 Unicode 码点截断，避免在 emoji 代理对中间切一刀产生乱码
   · 连续 3 个以上空行收敛为 2 个，防止刷屏 */
function clean(s, max) {
  return Array.from(String(s == null ? '' : s)
    .replace(/\r\n?/g, '\n')
    /* 保留 \u200d（ZWJ），否则 👨‍👩‍👧 这类组合 emoji 会被拆散 */
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f\u200b\u200c\u200e\u200f\u2060\u202a-\u202e\ufeff]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim())
    .slice(0, max).join('');
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

/* 设备 ID → 不可逆哈希。只存哈希的好处：库被拖走也还原不出某台设备的 ID，
   也就没法拿它去伪造别人的留言本。pepper 换了等于所有设备重新分区。 */
async function deviceHashOf(id, env) {
  const pepper = secretValue(env, ['DEVICE_HASH_PEPPER'], 'dev-only-pepper-change-me');
  if (!pepper) throw new Error('DEVICE_HASH_PEPPER 未配置');
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(pepper), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(String(id)));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

function deviceIdOf(request) {
  const raw = String(request.headers.get('X-Device-Id') || '').trim();
  return DEVICE_RE.test(raw) ? raw : '';
}

/* 固定窗口计数：条件 UPDATE 只在未达上限时自增，返回 null 表示被限。
   被拒请求不再写库，也就不会把计数越堆越高、把访客永久锁死。 */
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

/* 人机校验（Cloudflare Turnstile）：返回 'ok' | 'unconfigured' | 'missing' | 'failed' */
async function verifyTurnstile(env, token, ip) {
  const secret = env.TURNSTILE_SECRET;
  if (!secret) return 'unconfigured';
  if (!token) return 'missing';
  try {
    const form = new FormData();
    form.append('secret', secret);
    form.append('response', String(token).slice(0, 2048));
    if (ip && ip !== 'unknown') form.append('remoteip', ip);
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
    });
    const d = await r.json();
    return d && d.success ? 'ok' : 'failed';
  } catch (e) {
    return 'failed';
  }
}

const COLS = 'id, name, text, created_at AS ts';

function pageOf(messages, total, limit, offset) {
  const n = Number(total) || 0;
  return {
    ok: true,
    open: true,
    messages: messages,
    total: n,
    limit: limit,
    offset: offset,
    hasMore: offset + messages.length < n,
  };
}

/* 批量给本页留言挂上对话：一次 IN 查询，避免一条留言一次 SQL。
   只取 visible；后台把某条评论设为 hidden 时不影响原留言与其它回复。
   wall_replies 尚未迁移的老环境降级为空对话，不让整个留言墙 500。 */
async function attachReplies(db, messages) {
  const list = messages || [];
  const byId = {};
  list.forEach((m) => { byId[m.id] = []; });
  if (list.length) {
    const holes = list.map(() => '?').join(',');
    let rows = [];
    try {
      const r = await db.prepare(
        `SELECT message_id, id, author, text, created_at AS ts FROM wall_replies
          WHERE message_id IN (${holes}) AND status = 'visible' ORDER BY seq ASC`
      ).bind(...list.map((m) => m.id)).all();
      rows = r.results || [];
    } catch (e) {
      rows = [];
    }
    rows.forEach((r) => {
      if (!byId[r.message_id]) return;
      byId[r.message_id].push({ id: r.id, author: r.author, text: r.text, ts: r.ts });
    });
  }
  return list.map((m) => Object.assign({}, m, { replies: byId[m.id] || [] }));
}

/* 只返回「当前设备 + 正常状态」的留言。
   历史迁移数据 device_hash='legacy'、后台隐藏的 status='hidden' 都不会出现在这里。
   回复按所属留言返回，设备归属由留言本身保证（回复表 device_hash 与留言一致）。 */
async function listPage(db, dh, limit, offset) {
  const rows = await db.prepare(
    `SELECT ${COLS} FROM wall_messages
      WHERE device_hash = ? AND status = 'visible'
      ORDER BY seq DESC LIMIT ? OFFSET ?`
  ).bind(dh, limit, offset).all();
  const cnt = await db.prepare(
    `SELECT COUNT(*) AS n FROM wall_messages WHERE device_hash = ? AND status = 'visible'`
  ).bind(dh).first();
  const messages = await attachReplies(db, rows.results || []);
  return pageOf(messages, cnt ? cnt.n : 0, limit, offset);
}

/* 裁剪：先按设备裁（只动自己的），再按全站兜底裁（防止库无限增长）。
   原版是「全站只留 100 条」，设备隔离后那样会误删别人的留言。 */
async function trim(db, dh) {
  await db.prepare(
    `DELETE FROM wall_messages
      WHERE device_hash = ? AND seq < (SELECT MIN(seq) FROM (
        SELECT seq FROM wall_messages WHERE device_hash = ? ORDER BY seq DESC LIMIT ?
      ))`
  ).bind(dh, dh, PER_DEVICE_CAP).run();
  await db.prepare(
    `DELETE FROM wall_messages
      WHERE seq < (SELECT MIN(seq) FROM (
        SELECT seq FROM wall_messages ORDER BY seq DESC LIMIT ?
      ))`
  ).bind(GLOBAL_CAP).run();
  /* 级联清理：留言被裁掉后，它的对话不该继续占库。反查孤儿比在两条 DELETE
     之前逐一收集 id 简单，全站留言上限 500、量很小。表未迁移时静默跳过。 */
  try {
    await db.prepare('DELETE FROM wall_replies WHERE message_id NOT IN (SELECT id FROM wall_messages)').run();
  } catch (e) { /* noop：老库没有 wall_replies */ }
}

async function upsertDevice(db, dh, now, ua) {
  await db.prepare(
    `INSERT INTO wall_devices (device_hash, first_seen, last_seen, post_count, ua)
     VALUES (?, ?, ?, 1, ?)
     ON CONFLICT (device_hash) DO UPDATE SET
       last_seen = excluded.last_seen,
       post_count = wall_devices.post_count + 1,
       ua = COALESCE(excluded.ua, wall_devices.ua)`
  ).bind(dh, now, now, ua).run();
}

function safeEqual(a, b) {
  const x = String(a || ''), y = String(b || '');
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

/* ── 访客评论 / 追问 ──────────────────────────────────────────────────
   POST /api/wall { replyTo, text }：在本设备某条留言下追加一条 visitor 回复。
   关键约束：
     · 设备归属：parent.device_hash 必须等于当前 dh，否则任何人都不能给别人的
       私密留言写评论（设备隔离不是认证，但足以挡住串台与恶意刷屏）；
     · hidden 的留言不可评论，被拉黑的设备不可评论；
     · 独立限流（不与留言额度共用）、5 分钟同文去重、单条留言 20 条对话上限；
     · 成功后发一封「新评论」给站长，邮件带后台 ?focus= 直达链接；
     · 返回本设备整页（含 replies），前端复用 applyPage() 即可刷新对话。 */
async function handleVisitorReply({ request, env, ctx, db, dh, cors, body, text }) {
  const messageId = clean(body.replyTo, 64);
  if (!messageId) {
    return json({ ok: false, error: 'bad_request', message: '缺少要评论的留言' }, cors, 400);
  }
  const now = Date.now();
  try {
    const dev = await db.prepare('SELECT status FROM wall_devices WHERE device_hash = ?').bind(dh).first();
    if (dev && dev.status === 'blocked') {
      return json({ ok: false, error: 'device_blocked', message: '这台设备的留言功能已被关闭' }, cors, 403);
    }

    const parent = await db.prepare(
      'SELECT id, name, text, device_hash, status FROM wall_messages WHERE id = ?'
    ).bind(messageId).first();
    if (!parent || parent.status !== 'visible') {
      return json({ ok: false, error: 'not_found', message: '这条留言不存在或已被隐藏' }, cors, 404);
    }
    if (parent.device_hash !== dh) {
      return json({ ok: false, error: 'forbidden', message: '只能评论本设备的留言' }, cors, 403);
    }

    const cnt = await db.prepare(
      `SELECT COUNT(*) AS n FROM wall_replies WHERE message_id = ?`
    ).bind(messageId).first();
    if (cnt && Number(cnt.n) >= MAX_REPLIES_PER_MESSAGE) {
      return json({ ok: false, error: 'rate_limited', message: '这条留言下的对话已经满啦，另写一条留言吧' }, cors, 429);
    }

    const dup = await db.prepare(
      `SELECT 1 AS hit FROM wall_replies
        WHERE message_id = ? AND author = 'visitor' AND text = ? AND created_at > ? LIMIT 1`
    ).bind(messageId, text, now - REPLY_DUP_WINDOW_MS).first();
    if (dup) {
      return json(Object.assign(await listPage(db, dh, DEFAULT_LIMIT, 0),
        { duplicate: true, kind: 'reply' }), cors, 200);
    }

    const ipKey = await ipHash(request);
    const win = Math.floor(now / IP_WINDOW_MS);
    const winEnd = (win + 1) * IP_WINDOW_MS;
    const ipOk = await gate(db, 'wall:reply:ip:' + ipKey, String(win), REPLY_IP_LIMIT,
      Math.ceil((winEnd - now) / 1000) + 60);
    if (ipOk === null) {
      return json({
        ok: false, error: 'rate_limited', message: '评论有点频繁，稍后再试',
        retryAfter: Math.max(1, Math.ceil((winEnd - now) / 1000)),
      }, cors, 429);
    }
    const dayStart = new Date(now);
    const dayKey = dayStart.toISOString().slice(0, 10);
    const dayEnd = Date.UTC(dayStart.getUTCFullYear(), dayStart.getUTCMonth(), dayStart.getUTCDate() + 1);
    const dayOk = await gate(db, 'wall:reply:day', dayKey, REPLY_DAY_LIMIT,
      Math.ceil((dayEnd - now) / 1000) + 3600);
    if (dayOk === null) {
      return json({ ok: false, error: 'rate_limited', message: '今日评论已达上限，明天再来' }, cors, 429);
    }

    const item = {
      id: 'r' + now.toString(36) + Math.random().toString(36).slice(2, 7),
      messageId: messageId,
      author: 'visitor',
      text: text,
      created_at: now,
      device_hash: dh,
    };
    const ins = await db.prepare(
      `INSERT INTO wall_replies (id, message_id, author, text, created_at, device_hash, status)
       VALUES (?, ?, 'visitor', ?, ?, ?, 'visible')`
    ).bind(item.id, item.messageId, item.text, item.created_at, item.device_hash).run();
    if (!ins || !ins.success) return json({ ok: false, error: 'db_error' }, cors, 500);
    await db.prepare('UPDATE wall_messages SET updated_at = ? WHERE id = ?').bind(now, messageId).run();

    const notice = notifyWallReply(env, {
      messageId: messageId,
      messageText: parent.text,
      name: parent.name,
      text: item.text,
      created_at: item.created_at,
    }, { origin: request.headers.get('Origin') || '', deviceHash: dh });
    if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(notice);
    else await notice;

    return json(Object.assign(await listPage(db, dh, DEFAULT_LIMIT, 0), { kind: 'reply' }), cors, 201);
  } catch (e) {
    return json({ ok: false, error: 'db_error', message: '评论没能保存，稍后再试' }, cors, 500);
  }
}

export async function onRequestOptions({ request, env }) {
  const allow = allowedOrigins(env);
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin'), allow) });
}

export async function onRequestGet({ request, env }) {
  const db = env.DB;
  if (!db) {
    return json({
      ok: true, open: false, reason: 'db_not_bound', messages: [],
      total: 0, limit: 0, offset: 0, hasMore: false,
    }, PUBLIC_CORS);
  }

  const url = new URL(request.url);
  const flags = { turnstile: !!env.TURNSTILE_SECRET };

  const did = deviceIdOf(request);
  if (!did) {
    /* 浏览器没带设备头：多半是旧版前端缓存或脚本直连。返回空态而不是报错，
       前端据此显示「本设备还没有留言」。 */
    return json({
      ok: true, open: true, reason: 'device_required', messages: [],
      total: 0, limit: 0, offset: 0, hasMore: false,
    }, PUBLIC_CORS);
  }
  const dh = await deviceHashOf(did, env);

  try {
    if (url.searchParams.get('peek') === '1') {
      const cnt = await db.prepare(
        `SELECT COUNT(*) AS n FROM wall_messages WHERE device_hash = ? AND status = 'visible'`
      ).bind(dh).first();
      const first = await db.prepare(
        `SELECT id, created_at AS ts FROM wall_messages
          WHERE device_hash = ? AND status = 'visible' ORDER BY seq DESC LIMIT 1`
      ).bind(dh).first();
      /* 站长回复不会改变留言 id，单看 latest 发现不了；单独返回最新 owner 回复时间，
         前端据此提示「站长回复了你」。表未迁移时给 0。 */
      let latestReply = 0;
      try {
        const lr = await db.prepare(
          `SELECT MAX(created_at) AS ts FROM wall_replies
            WHERE device_hash = ? AND author = 'owner' AND status = 'visible'`
        ).bind(dh).first();
        latestReply = lr && lr.ts ? Number(lr.ts) : 0;
      } catch (e) { latestReply = 0; }
      return json({
        ok: true, open: true, total: cnt ? cnt.n : 0,
        latest: first ? { id: first.id, ts: first.ts } : null,
        latestReply: latestReply,
        turnstile: flags.turnstile,
      }, PUBLIC_CORS);
    }

    const limit = intParam(url.searchParams.get('limit'), 1, MAX_LIMIT, DEFAULT_LIMIT);
    const offset = intParam(url.searchParams.get('offset'), 0, PER_DEVICE_CAP - 1, 0);
    return json(Object.assign(await listPage(db, dh, limit, offset), flags), PUBLIC_CORS);
  } catch (e) {
    return json({ ok: false, open: false, error: 'db_error' }, PUBLIC_CORS, 500);
  }
}

export async function onRequestPost({ request, env, ctx }) {
  const origin = request.headers.get('Origin') || '';
  const allow = allowedOrigins(env);
  if (!isAllowedOrigin(origin, allow)) {
    return json({ ok: false, error: 'origin_not_allowed' }, corsHeaders(origin, allow), 403);
  }
  const cors = corsHeaders(origin, allow);
  const db = env.DB;
  if (!db) return json({ ok: false, error: 'wall_not_configured', message: '留言板存储未配置（D1 绑定缺失）' }, cors, 503);

  const did = deviceIdOf(request);
  if (!did) {
    return json({
      ok: false, error: 'device_required',
      message: '没有拿到设备标识，请刷新页面后重试（浏览器禁用 localStorage 时会这样）',
    }, cors, 400);
  }
  const dh = await deviceHashOf(did, env);

  let body = {};
  try { body = await request.json(); } catch (e) { body = null; }
  if (!body || typeof body !== 'object') {
    return json({ ok: false, error: 'bad_request', message: '请求体不是合法 JSON' }, cors, 400);
  }

  const text = clean(body.text, MAX_TEXT);
  if (!text) return json({ ok: false, error: 'bad_request', message: '留言内容不能为空' }, cors, 400);
  if (Array.from(text).length < MIN_TEXT) {
    return json({ ok: false, error: 'bad_request', message: '再多写两个字吧（至少 2 个字）' }, cors, 400);
  }

  /* body.replyTo 存在 = 在这条留言下评论，不是新开一条留言。
     放在主写入路径之前，避免评论去占用「新留言」的限流与去重额度。 */
  if (body.replyTo != null && String(body.replyTo).trim() !== '') {
    return handleVisitorReply({ request, env, ctx, db, dh, cors, body, text });
  }

  const name = clean(body.name, MAX_NAME) || '匿名访客';

  const now = Date.now();
  const trust = await verifyTurnstile(env, body.turnstileToken, ipOf(request));
  const strict = trust !== 'ok' && trust !== 'unconfigured';
  const ipKey = await ipHash(request);
  const ipWindow = strict ? IP_STRICT_WINDOW_MS : IP_WINDOW_MS;
  const win = Math.floor(now / ipWindow);
  const winEnd = (win + 1) * ipWindow;
  const dayStart = new Date(now);
  const dayKey = dayStart.toISOString().slice(0, 10);
  const dayEnd = Date.UTC(dayStart.getUTCFullYear(), dayStart.getUTCMonth(), dayStart.getUTCDate() + 1);

  try {
    /* 后台拉黑的设备直接拒写：留言本被刷时，封设备比封 IP 精准 */
    const dev = await db.prepare('SELECT status FROM wall_devices WHERE device_hash = ?').bind(dh).first();
    if (dev && dev.status === 'blocked') {
      return json({ ok: false, error: 'device_blocked', message: '这台设备的留言功能已被关闭' }, cors, 403);
    }

    const ipOk = await gate(db, (strict ? 'wall:ip:strict:' : 'wall:ip:') + ipKey, String(win),
      strict ? IP_STRICT_LIMIT : IP_LIMIT, Math.ceil((winEnd - now) / 1000) + 60);
    if (ipOk === null) {
      return json({
        ok: false, error: 'rate_limited', message: '留言有点频繁，稍后再试',
        verifyRequired: strict,
        retryAfter: Math.max(1, Math.ceil((winEnd - now) / 1000)),
      }, cors, 429);
    }
    const dayOk = await gate(db, strict ? 'wall:day:strict' : 'wall:day', dayKey,
      strict ? DAY_STRICT_LIMIT : DAY_LIMIT, Math.ceil((dayEnd - now) / 1000) + 3600);
    if (dayOk === null) {
      return json({
        ok: false, error: 'rate_limited', message: '今日留言已达上限，明天再来',
        verifyRequired: strict,
      }, cors, 429);
    }

    const dup = await db.prepare(
      `SELECT 1 AS hit FROM wall_messages
        WHERE device_hash = ? AND name = ? AND text = ? AND created_at > ? LIMIT 1`
    ).bind(dh, name, text, now - DUP_WINDOW_MS).first();
    if (dup) {
      return json(Object.assign({ duplicate: true }, await listPage(db, dh, DEFAULT_LIMIT, 0)), cors, 200);
    }

    const item = {
      id: 'w' + now.toString(36) + Math.random().toString(36).slice(2, 7),
      name: name,
      text: text,
      created_at: now,
    };

    const ins = await db.prepare(
      `INSERT INTO wall_messages (id, name, text, created_at, device_hash, status, updated_at)
       VALUES (?, ?, ?, ?, ?, 'visible', ?)`
    ).bind(item.id, item.name, item.text, item.created_at, dh, now).run();
    if (!ins || !ins.success) {
      return json({ ok: false, error: 'db_error' }, cors, 500);
    }

    await upsertDevice(db, dh, now, clean(request.headers.get('User-Agent'), 120));
    await trim(db, dh);

    /* 新留言通知：只在真正写库成功后触发（重复提交 / 限流 / 校验失败都不会走到这里）。
       线上用 ctx.waitUntil 挂在请求后执行，访客不用等 Resend 响应；
       本地 dev server / 单测没有 ctx，就直接 await，方便断言发信结果。
       notifyWallMessage 内部吞掉所有异常，失败只留日志。 */
    const notice = notifyWallMessage(env, item, {
      origin: request.headers.get('Origin') || '',
      deviceHash: dh,
    });
    if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(notice);
    else await notice;

    return json(await listPage(db, dh, DEFAULT_LIMIT, 0), cors, 201);
  } catch (e) {
    return json({ ok: false, error: 'db_error' }, cors, 500);
  }
}

/* 站长应急删除：只在 WALL_ADMIN_TOKEN 配置时可用；正式管理走 /api/admin/wall/*（会话鉴权）。 */
export async function onRequestDelete({ request, env }) {
  const origin = request.headers.get('Origin') || '';
  const allow = allowedOrigins(env);
  if (!isAllowedOrigin(origin, allow)) {
    return json({ ok: false, error: 'origin_not_allowed' }, corsHeaders(origin, allow), 403);
  }
  const cors = corsHeaders(origin, allow);

  const token = env.WALL_ADMIN_TOKEN;
  if (!token) return json({ ok: false, error: 'not_found' }, cors, 404);
  if (!safeEqual(request.headers.get('X-Admin-Token'), token)) {
    return json({ ok: false, error: 'forbidden' }, cors, 403);
  }

  const db = env.DB;
  if (!db) return json({ ok: false, error: 'wall_not_configured' }, cors, 503);

  let body = {};
  try { body = await request.json(); } catch (e) { body = {}; }
  let id = String((body && body.id) || '');
  if (!id) {
    try { id = String(new URL(request.url).searchParams.get('id') || ''); } catch (e) { id = ''; }
  }
  if (!id) return json({ ok: false, error: 'bad_request', message: '缺少 id' }, cors, 400);

  try {
    /* 先删对话再删留言：留言没了，挂在它下面的回复也不该留在库里 */
    try { await db.prepare('DELETE FROM wall_replies WHERE message_id = ?').bind(id).run(); } catch (e) {}
    const del = await db.prepare('DELETE FROM wall_messages WHERE id = ?').bind(id).run();
    if (!del || !del.meta || del.meta.changes === 0) {
      return json({ ok: false, error: 'not_found', message: '留言不存在' }, cors, 404);
    }
    return json({ ok: true, deleted: id }, cors);
  } catch (e) {
    return json({ ok: false, error: 'db_error' }, cors, 500);
  }
}
