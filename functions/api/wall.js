/* ──────────────────────────────────────────────────────────────────────
   留言墙 API · Cloudflare Pages Function（路由 /api/wall）
   ──────────────────────────────────────────────────────────────────────
   用途：主页「留言墙」板块——不想直接联系站长的人，匿名留言表达看法。

   接口：
     GET  /api/wall                      → { ok, messages }   公开读（CORS *）
     POST /api/wall {name?, text}        → { ok, messages }   提交留言（来源白名单 + 限流）
     DELETE /api/wall {id} + X-Admin-Token → { ok, messages }  管理员删留言
     OPTIONS                            → 204                CORS 预检

   存储：KV（Pages 项目绑定的 SITE_KV）
     wall:messages        JSON 数组，最新在前，最多留 100 条
     wall:rl:<iph>        每 IP 滑窗计数（TTL 10 分钟，上限 3 条）
     wall:day:<yyyymmdd>  全局每日计数（TTL 48h，上限 50 条）

   环境变量（Cloudflare Pages → Settings → Variables）：
     ALLOWED_ORIGINS   可选，逗号分隔（默认 github.io / pages.dev / localhost）
     WALL_ADMIN_TOKEN  可选，管理删除令牌；未配置时 DELETE 一律 404

   绑定：KV namespace 绑定名 SITE_KV（Settings → Functions → KV bindings）。
   未绑定时：GET 返回空列表（页面提示「留言墙暂未开放」），POST 返回 503。
   ────────────────────────────────────────────────────────────────────── */

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };

const MAX_TEXT = 300;   // 留言正文字数上限
const MAX_NAME = 16;    // 称呼长度上限
const CAP = 100;        // 墙上最多保留条数
const IP_WINDOW_TTL = 600;         // 每 IP 限流窗口 10 分钟
const IP_LIMIT = 3;                // 每 IP 每窗口最多 3 条
const DAY_LIMIT = 50;              // 全局每日最多 50 条
const DAY_TTL = 172800;            // 每日计数键留 48h
const DEFAULT_ORIGINS = [
  'https://shenge-work.github.io',
  'https://shenge-work.pages.dev',
  '*.shenge-work.pages.dev',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
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

function corsHeaders(origin, allow) {
  const acao = isAllowedOrigin(origin, allow) ? String(origin).trim() : '';
  const h = {
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (acao) h['Access-Control-Allow-Origin'] = acao;
  return h;
}

function json(body, extra, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign({}, JSON_HEADERS, extra || {}),
  });
}

/* KV 计数：返回自增后的次数；KV 不可用时返回 null（调用方自行降级放行） */
async function bump(kv, key, ttl) {
  if (!kv) return null;
  try {
    const cur = Number(await kv.get(key)) || 0;
    const next = cur + 1;
    await kv.put(key, String(next), { expirationTtl: ttl });
    return next;
  } catch (e) {
    return null;
  }
}

async function readMessages(kv) {
  if (!kv) return null;
  try {
    const raw = await kv.get('wall:messages');
    const arr = JSON.parse(raw || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

async function writeMessages(kv, arr) {
  await kv.put('wall:messages', JSON.stringify(arr));
}

function ipOf(request) {
  const xff = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || '';
  return (xff.split(',')[0] || 'unknown').trim();
}

/* 内容净化：去控制字符与首尾空白；防 XSS 由前端渲染时统一 escape */
function clean(s, max) {
  return String(s == null ? '' : s)
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/^\s+|\s+$/g, '')
    .slice(0, max);
}

export async function onRequestOptions({ request, env }) {
  const allow = allowedOrigins(env);
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin'), allow) });
}

export async function onRequestGet({ request, env }) {
  const messages = await readMessages(env.SITE_KV);
  if (messages === null) {
    /* 未绑定 KV：给空列表 + open=false，前端显示「留言墙暂未开放」 */
    return json({ ok: true, open: false, messages: [] }, { 'Access-Control-Allow-Origin': '*' });
  }
  return json(
    { ok: true, open: true, messages: messages.slice(0, 50) },
    { 'Access-Control-Allow-Origin': '*', Vary: 'Origin' }
  );
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('Origin') || '';
  const allow = allowedOrigins(env);
  if (!isAllowedOrigin(origin, allow)) {
    return json({ ok: false, error: 'origin_not_allowed' }, corsHeaders(origin, allow), 403);
  }
  const cors = corsHeaders(origin, allow);
  const kv = env.SITE_KV;
  if (!kv) return json({ ok: false, error: 'wall_not_configured', message: '留言墙存储未配置（Pages KV 绑定缺失）' }, cors, 503);

  let body = {};
  try { body = await request.json(); } catch (e) { body = null; }
  if (!body || typeof body !== 'object') {
    return json({ ok: false, error: 'bad_request', message: '请求体不是合法 JSON' }, cors, 400);
  }

  const text = clean(body.text, MAX_TEXT);
  if (!text) return json({ ok: false, error: 'bad_request', message: '留言内容不能为空' }, cors, 400);
  const name = clean(body.name, MAX_NAME) || '匿名访客';

  /* 限流：每 IP 每窗口 + 全局每日（KV 计数失败不拦正常用户） */
  const ip = ipOf(request);
  const win = await bump(kv, 'wall:rl:' + ip, IP_WINDOW_TTL);
  if (win != null && win > IP_LIMIT) {
    return json({ ok: false, error: 'rate_limited', message: '留言有点频繁，稍后再试' }, cors, 429);
  }
  const dayKey = 'wall:day:' + new Date().toISOString().slice(0, 10);
  const day = await bump(kv, dayKey, DAY_TTL);
  if (day != null && day > DAY_LIMIT) {
    return json({ ok: false, error: 'rate_limited', message: '今日留言已达上限，明天再来' }, cors, 429);
  }

  const messages = await readMessages(kv);
  const item = {
    id: 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    name: name,
    text: text,
    ts: Date.now(),
  };
  const next = [item].concat(messages || []).slice(0, CAP);
  await writeMessages(kv, next);

  return json({ ok: true, open: true, messages: next.slice(0, 50) }, cors, 201);
}

export async function onRequestDelete({ request, env }) {
  const origin = request.headers.get('Origin') || '';
  const allow = allowedOrigins(env);
  const cors = corsHeaders(origin, allow);

  const token = env.WALL_ADMIN_TOKEN;
  if (!token) return json({ ok: false, error: 'not_found' }, cors, 404); /* 未配置管理令牌：能力不暴露 */
  if (request.headers.get('X-Admin-Token') !== token) {
    return json({ ok: false, error: 'forbidden' }, cors, 403);
  }

  const kv = env.SITE_KV;
  if (!kv) return json({ ok: false, error: 'wall_not_configured' }, cors, 503);

  let body = {};
  try { body = await request.json(); } catch (e) { body = {}; }
  const id = String(body.id || '');
  if (!id) return json({ ok: false, error: 'bad_request', message: '缺少 id' }, cors, 400);

  const messages = (await readMessages(kv)) || [];
  const next = messages.filter((m) => m && m.id !== id);
  if (next.length === messages.length) {
    return json({ ok: false, error: 'not_found', message: '留言不存在' }, cors, 404);
  }
  await writeMessages(kv, next);
  return json({ ok: true, open: true, messages: next.slice(0, 50) }, cors);
}
