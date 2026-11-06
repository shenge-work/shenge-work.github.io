/* ──────────────────────────────────────────────────────────────────────
   作品集全站访客计数器 · Cloudflare Worker + KV
   ──────────────────────────────────────────────────────────────────────
   接口：
     GET  /stats  → { visitors, total }   只读，用于已计过数的会话
     POST /hit    → { visitors, total }   计数（同一 visitor id 只算一次访客）
     OPTIONS      → 204                   CORS 预检

   设计取舍：
     · visitors 用客户端持久化的 visitor id 去重（KV 里留 180 天），用来显示
       「你是第 N 位访客」；
     · total 是页面访问次数（PV），放在悬浮框的 title 里；
     · 只对白名单 Origin 开放，避免被别的站拿去当免费计数接口；
     · KV 的读改写不是原子的，同一秒并发命中会有个位数漂移——作品集流量下
       可以接受。要严格精确得换 Durable Objects（需付费计划）。
   ────────────────────────────────────────────────────────────────────── */

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

const VISITOR_TTL = 60 * 60 * 24 * 180; // 180 天

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(body, cors, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign({}, JSON_HEADERS, cors),
  });
}

function allowedOrigins(env) {
  return (env.ALLOWED_ORIGINS || 'https://shenge-work.github.io')
    .split(',')
    .map(function (s) { return s.trim(); })
    .filter(Boolean);
}

/* 归一化 visitor id：只留小写字母、数字、连字符，最长 64 位 */
function normalizeId(raw) {
  return String(raw == null ? '' : raw)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 64);
}

async function readNum(kv, key) {
  var v = await kv.get(key);
  var n = Number(v);
  return isFinite(n) && n > 0 ? n : 0;
}

export default {
  async fetch(request, env) {
    var url = new URL(request.url);
    var origin = request.headers.get('Origin') || '';
    var allow = allowedOrigins(env);
    var route = url.pathname.replace(/\/+$/, '') || '/';

    /* 预检 */
    if (request.method === 'OPTIONS') {
      if (allow.indexOf(origin) === -1) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    /* 非白名单来源直接拒绝 */
    if (allow.indexOf(origin) === -1) {
      return json({ error: 'origin_not_allowed' }, {}, 403);
    }

    var cors = corsHeaders(origin);
    var kv = env.VISITS;

    if (!kv) return json({ error: 'kv_not_bound' }, cors, 500);

    if (route === '/stats' || (route === '/' && request.method === 'GET')) {
      return json(
        { visitors: await readNum(kv, 'visitors'), total: await readNum(kv, 'total') },
        cors
      );
    }

    if (route === '/hit') {
      if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, cors, 405);

      var body = {};
      try { body = await request.json(); } catch (e) { body = {}; }

      var id = normalizeId(body && body.id);
      var total = (await readNum(kv, 'total')) + 1;
      var visitors = await readNum(kv, 'visitors');

      await kv.put('total', String(total));

      if (id && !(await kv.get('v:' + id))) {
        visitors += 1;
        await kv.put('visitors', String(visitors));
        await kv.put('v:' + id, '1', { expirationTtl: VISITOR_TTL });
      }

      return json({ visitors: visitors, total: total }, cors);
    }

    if (route === '/') return json({ ok: true, hint: 'GET /stats 或 POST /hit' }, cors);

    return json({ error: 'not_found' }, cors, 404);
  },
};
