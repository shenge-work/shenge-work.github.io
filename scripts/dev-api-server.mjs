/* 本地联调服务器：静态文件 + 真实 functions/api 逻辑
   （D1 用 node:sqlite 内存库模拟，KV 用内存 Map，Resend 发信被拦截）
   2026-11-19：留言墙 / 访问计数迁到 D1，本文件同步加了一层最小 D1 适配器，
   表结构与线上一致（db/schema.sql），保证本地测的是同一套 SQL。 */
import http from 'node:http';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createHmac } from 'node:crypto';
import { onRequestGet as wallGet, onRequestPost as wallPost, onRequestDelete as wallDel, onRequestOptions as wallOpt } from '../functions/api/wall.js';
import { onRequestGet as visitsGet, onRequestPost as visitsPost, onRequestOptions as visitsOpt } from '../functions/api/visits.js';
import { onRequestPost as deliverPost, onRequestOptions as deliverOpt } from '../functions/api/deliver.js';
import { onRequestPost as deliverPreviewPost, onRequestOptions as deliverPreviewOpt } from '../functions/api/deliver-preview.js';
import { onRequestGet as socialGet, onRequestPost as socialPost, onRequestOptions as socialOpt } from '../functions/api/company-social.js';
import { onRequestGet as verifyAccessGet, onRequestPost as verifyAccessPost, onRequestOptions as verifyAccessOpt } from '../functions/api/verify-access.js';
import { onRequestGet as verifyApproveGet, onRequestPost as verifyApprovePost } from '../functions/api/verify-access-approve.js';
import { onRequestGet as secureAssetGet } from '../functions/api/secure-asset.js';
import { onRequestGet as challengeGet, onRequestOptions as challengeOpt } from '../functions/api/challenge.js';
import { onRequestGet as greetingGet, onRequestOptions as greetingOpt } from '../functions/api/greeting.js';
import { onRequestGet as contributionsGet } from '../functions/api/contributions.js';

/* ── /api/admin/**（M1 起本地联调后台，与线上同一套 handlers/SQL）── */
import * as admStats from '../functions/api/admin/stats.js';
import * as admDevices from '../functions/api/admin/devices.js';
import * as admDevicesBlock from '../functions/api/admin/devices/block.js';
import * as admExport from '../functions/api/admin/export.js';
import * as admMessages from '../functions/api/admin/messages.js';
import * as admReply from '../functions/api/admin/messages/reply.js';
import * as admMsgStatus from '../functions/api/admin/messages/status.js';
import * as admQa from '../functions/api/admin/qa.js';
import * as admQaTopics from '../functions/api/admin/qa/topics.js';
import * as admQaTrend from '../functions/api/admin/qa/trend.js';
import * as admConfig from '../functions/api/admin/config.js';
import * as admTheme from '../functions/api/admin/theme.js';
import * as admGender from '../functions/api/admin/gender.js';
import * as admVoice from '../functions/api/admin/voice.js';
import * as admVoicePreview from '../functions/api/admin/voice/preview.js';
import * as admGreeting from '../functions/api/admin/greeting.js';
import * as admContent from '../functions/api/admin/site-content.js';
import * as admKb from '../functions/api/admin/kb.js';
import * as admVariant from '../functions/api/admin/variant.js';
import * as admAuthLogout from '../functions/api/admin/auth/logout.js';
import * as admAuthMe from '../functions/api/admin/auth/me.js';
import * as admAuthMethods from '../functions/api/admin/auth/methods.js';
import * as admAuthEmailSend from '../functions/api/admin/auth/email/send.js';
import * as admAuthEmailVerify from '../functions/api/admin/auth/email/verify.js';
import * as admAuthMiniQr from '../functions/api/admin/auth/mini/qr.js';
import * as admAuthMiniPoll from '../functions/api/admin/auth/mini/poll.js';
import * as admAuthMiniConfirm from '../functions/api/admin/auth/mini/confirm.js';

const ADM_ROUTES = [
  ['/api/admin/stats', admStats],
  ['/api/admin/devices', admDevices],
  ['/api/admin/devices/block', admDevicesBlock],
  ['/api/admin/export', admExport],
  ['/api/admin/messages', admMessages],
  ['/api/admin/messages/reply', admReply],
  ['/api/admin/messages/status', admMsgStatus],
  ['/api/admin/qa', admQa],
  ['/api/admin/qa/topics', admQaTopics],
  ['/api/admin/qa/trend', admQaTrend],
  ['/api/admin/config', admConfig],
  ['/api/admin/theme', admTheme],
  ['/api/admin/gender', admGender],
  ['/api/admin/voice', admVoice],
  ['/api/admin/voice/preview', admVoicePreview],
  ['/api/admin/greeting', admGreeting],
  ['/api/admin/site-content', admContent],
  ['/api/admin/kb', admKb],
  ['/api/admin/variant', admVariant],
  ['/api/admin/auth/logout', admAuthLogout],
  ['/api/admin/auth/me', admAuthMe],
  ['/api/admin/auth/methods', admAuthMethods],
  ['/api/admin/auth/email/send', admAuthEmailSend],
  ['/api/admin/auth/email/verify', admAuthEmailVerify],
  ['/api/admin/auth/mini/qr', admAuthMiniQr],
  ['/api/admin/auth/mini/poll', admAuthMiniPoll],
  ['/api/admin/auth/mini/confirm', admAuthMiniConfirm],
];
const METHOD_KEY = { GET: 'onRequestGet', POST: 'onRequestPost', DELETE: 'onRequestDelete', PUT: 'onRequestPut', OPTIONS: 'onRequestOptions' };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 8877);

/* ── D1 的最小本地实现：接口形状对齐 Cloudflare（prepare/bind/all/first/run） ──
   D1 的 first() 对 UPDATE ... RETURNING 也要能取到行，所以统一走 all() 再取首行。 */
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(await fs.readFile(path.join(ROOT, 'db', 'schema.sql'), 'utf8'));

const DB = {
  prepare(sql) {
    const stmt = sqlite.prepare(sql);
    const make = (params) => ({
      all: async () => ({ results: stmt.all(...params), success: true, meta: {} }),
      first: async (col) => {
        const rows = stmt.all(...params);
        const r = rows && rows[0];
        if (!r) return null;
        return col ? (r[col] === undefined ? null : r[col]) : r;
      },
      run: async () => {
        const info = stmt.run(...params);
        return { success: true, meta: { changes: Number(info && info.changes) || 0 } };
      },
    });
    return Object.assign(make([]), { bind: (...params) => make(params) });
  },
};

/* 内存 KV：模拟 expirationTtl，deliver.js 的发信限额仍用它
   （线上也保持 KV，写量可控：日上限 30 封 ≈ 90 写/天） */
const KV = new Map();
/* 私密材料本地联调：SECURE_ASSET_LOCAL_DIR 指向 .temp/secure-assets 时，
   直接读上传脚本处理好的图片，模拟线上 KV 里的二进制与元数据。 */
const LOCAL_ASSET_DIR = process.env.SECURE_ASSET_LOCAL_DIR || '';
const SITE_KV = {
  async get(k, opts) {
    if (LOCAL_ASSET_DIR && k.startsWith('secure-asset:')) {
      const id = k.slice('secure-asset:'.length);
      try {
        const buf = await fs.readFile(path.join(ROOT, LOCAL_ASSET_DIR, id + '.jpg'));
        if (opts && opts.type === 'arrayBuffer') {
          return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
        }
        return buf.toString('base64');
      } catch (e) { return null; }
    }
    if (LOCAL_ASSET_DIR && k.startsWith('secure-asset-meta:')) {
      const id = k.slice('secure-asset-meta:'.length);
      try { return await fs.readFile(path.join(ROOT, LOCAL_ASSET_DIR, id + '.meta.json'), 'utf8'); }
      catch (e) { return null; }
    }
    const e = KV.get(k);
    if (!e) return null;
    if (e.expiresAt && e.expiresAt <= Date.now()) { KV.delete(k); return null; }
    return e.value;
  },
  async put(k, v, opts) {
    const ttl = opts && Number(opts.expirationTtl) > 0 ? Number(opts.expirationTtl) : 0;
    KV.set(k, { value: String(v), expiresAt: ttl ? Date.now() + ttl * 1000 : 0 });
  },
};

/* 设备隔离联调数据
   WALL_SEED=<n>        预置 n 条「本设备」留言（验收分页 / 加载更多）
   WALL_SEED_DEVICE=xx  指定这批留言归属的设备 ID（默认 dev-device-0001）
   另外固定写入 2 条 legacy 旧留言：它们在公开端不该出现，只在后台可见。
   设备哈希与线上同算法：HMAC-SHA256(DEVICE_HASH_PEPPER, device_id) 取前 32 位 hex。 */
const PEPPER = process.env.DEVICE_HASH_PEPPER || 'dev-only-pepper-change-me';
const hashDevice = (id) => createHmac('sha256', PEPPER).update(String(id)).digest('hex').slice(0, 32);

const SEED_DEVICE = process.env.WALL_SEED_DEVICE || 'dev-device-0001';
const SEED = Number(process.env.WALL_SEED || 0);
if (SEED > 0) {
  const now = Date.now();
  const n = Math.min(SEED, 100);
  const dh = hashDevice(SEED_DEVICE);
  const ins = sqlite.prepare(
    'INSERT INTO wall_messages (id, name, text, created_at, device_hash, status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  for (let i = 0; i < n; i++) {
    ins.run(
      'wseed' + i,
      i % 4 === 0 ? '匿名访客' : '访客' + (i + 1),
      '这是本地联调用的第 ' + (i + 1) + ' 条留言，用来检查分页与加载更多是否正常。',
      now - i * 3600000,
      dh, 'visible', now - i * 3600000
    );
  }
  sqlite.prepare('INSERT INTO wall_devices (device_hash, first_seen, last_seen, post_count, ua) VALUES (?, ?, ?, ?, ?)')
    .run(dh, now - n * 3600000, now, n, 'local-seed');
  for (let i = 0; i < 2; i++) {
    ins.run('wlegacy' + i, '旧访客', '迁移前的公开墙旧留言 #' + (i + 1) + '（公开端不可见，仅后台可见）',
      now - (n + i) * 3600000, 'legacy', 'visible', now - (n + i) * 3600000);
  }
  console.log('[seed] 设备 ' + SEED_DEVICE + ' 预置 ' + n + ' 条留言 + 2 条 legacy 旧留言');
}

/* 本地模拟 Resend：只记录，不发真实邮件。
   MOCK_RESEND=unverified 时模拟「域名未验证」→ 422，用来验收 mailto 兜底。
   MOCK_RESEND=nokey 时模拟未配置 API Key → 503。 */
const MOCK = process.env.MOCK_RESEND || '';
const ENV = {
  DB,
  SITE_KV,
  ALLOWED_ORIGINS: 'http://127.0.0.1:' + PORT + ',http://localhost:' + PORT,
  RESEND_FROM: process.env.RESEND_FROM || '',
  DELIVER_BCC: process.env.DELIVER_BCC || '',
  /* 本地默认给一个测试令牌，方便验收 DELETE；不设就等于线上「未配置」形态 */
  WALL_ADMIN_TOKEN: process.env.WALL_ADMIN_TOKEN || 'local-admin-token',
  /* 允许本地使用内置的 dev-only 兜底密钥；生产绝不能设这一项。 */
  ALLOW_DEV_SECRETS: '1',
  /* 设备哈希盐：本地与线上必须各自配置；这里给的默认值只够本地联调 */
  DEVICE_HASH_PEPPER: PEPPER,
  VERIFY_ACCESS_SECRET: process.env.VERIFY_ACCESS_SECRET || '',
  /* 人机校验：默认不配 → 走正常额度（与线上未配置 secret 时一致）。
     想验严格档就 TURNSTILE_SECRET=test 起服务，此时不带 token 的 POST 会降到每 IP 每小时 1 条。 */
  TURNSTILE_SECRET: process.env.TURNSTILE_SECRET || '',
  /* 后台登录（M1 本地联调）：会话盐 + 邮箱白名单，验证码邮件走 mock resend（终端打印） */
  ADMIN_SESSION_SECRET: process.env.ADMIN_SESSION_SECRET || 'dev-session-secret-0123456789abcdef',
  ADMIN_EMAILS: process.env.ADMIN_EMAILS || 'dev@local.test',
};
if (MOCK !== 'nokey') ENV.RESEND_API_KEY = 're_local_test';
/* WALL_NO_DB=1 模拟「Pages 里忘了绑定 D1」的线上形态，用来验收关闭态 */
if (process.env.WALL_NO_DB === '1' || process.env.WALL_NO_KV === '1') {
  delete ENV.DB;
  console.log('[mock] 未绑定 D1：/api/wall 将返回 open=false, reason=db_not_bound');
}

const REAL_FETCH = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).includes('api.resend.com')) {
    const payload = init && init.body ? String(init.body) : '';
    console.log('[mock resend]', payload);
    if (MOCK === 'unverified') {
      return new Response(JSON.stringify({ name: 'validation_error', message: 'You can only send testing emails to your own email address' }), { status: 422, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ id: 'em_local_test' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  return REAL_FETCH(url, init);
};

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.mp4': 'video/mp4', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.mjs': 'text/javascript' };

async function handler(fn, nodeReq) {
  const request = await toReq(nodeReq);
  return await fn({ request, env: ENV });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:' + PORT);
  const p = url.pathname;
  try {
    if (p === '/api/wall') {
      const r = req.method === 'GET' ? await handler(wallGet, req)
        : req.method === 'POST' ? await handler(wallPost, req)
        : req.method === 'DELETE' ? await handler(wallDel, req)
        : await handler(wallOpt, req);
      return send(res, r);
    }
    if (p === '/api/visits') {
      const r = req.method === 'POST' ? await handler(visitsPost, req)
        : req.method === 'GET' ? await handler(visitsGet, req)
        : await handler(visitsOpt, req);
      return send(res, r);
    }
    if (p === '/api/challenge') {
      const r = req.method === 'GET' ? await handler(challengeGet, req) : await handler(challengeOpt, req);
      return send(res, r);
    }
    if (p === '/api/greeting') {
      const r = req.method === 'OPTIONS' ? await handler(greetingOpt, req) : await handler(greetingGet, req);
      return send(res, r);
    }
    if (p === '/api/contributions') {
      return send(res, await handler(contributionsGet, req));
    }
    if (p === '/api/deliver') {
      const r = req.method === 'POST' ? await handler(deliverPost, req) : await handler(deliverOpt, req);
      return send(res, r);
    }
    if (p === '/api/deliver-preview') {
      const r = req.method === 'POST' ? await handler(deliverPreviewPost, req) : await handler(deliverPreviewOpt, req);
      return send(res, r);
    }
    if (p === '/api/company-social') {
      const r = req.method === 'GET' ? await handler(socialGet, req)
        : req.method === 'POST' ? await handler(socialPost, req)
        : await handler(socialOpt, req);
      return send(res, r);
    }
    if (p === '/api/verify-access') {
      const r = req.method === 'POST' ? await handler(verifyAccessPost, req)
        : req.method === 'GET' ? await handler(verifyAccessGet, req)
        : await handler(verifyAccessOpt, req);
      return send(res, r);
    }
    if (p === '/api/verify-access-approve') {
      const r = req.method === 'POST' ? await handler(verifyApprovePost, req)
        : await handler(verifyApproveGet, req);
      return send(res, r);
    }
    if (p === '/api/secure-asset') {
      return send(res, await handler(secureAssetGet, req));
    }

    /* ── /api/admin/**（M1）：同源同 handler，会话/限流/SQL 与线上同套 ── */
    if (p.indexOf('/api/admin/') === 0) {
      const mod = ADM_ROUTES.find(([route]) => p === route)?.[1];
      if (!mod) { res.writeHead(404).end('not found'); return; }
      const fn = mod[METHOD_KEY[req.method || 'GET'] || 'onRequestGet'];
      if (!fn) { res.writeHead(405).end('method not allowed'); return; }
      return send(res, await handler(fn, req));
    }

    let file = p === '/' ? '/index.html' : p;
    /* M1：React 版后台页面与 bundle 住在 dist-react/（pnpm build 产物）。
       路径映射：/admin(.html|/) → admin.html；/login → login.html；
       /_astro/** → dist-react/_astro/**；/admin/assets/** → admin/public/assets/**。
       M2：/jd.html /company.html /school.html /404(.html) → dist-react 同名产物。
       其余路径（css/js/data/images 等）回落仓库根，与线上混排结果等价。 */
    const DIST = path.join(ROOT, 'dist-react');
    const M2_REACT_PAGES = {
      '/jd.html': 'jd.html',
      '/company.html': 'company.html',
      '/school.html': 'school.html',
      '/404': '404.html',
      '/404.html': '404.html',
    };
    let abs = null;
    let status = 200;
    const m2page = M2_REACT_PAGES[p];
    if (m2page && fsSync.existsSync(path.join(DIST, m2page))) {
      abs = path.join(DIST, m2page);
      /* /404（无扩展）对齐 CF Pages 语义：404.html 兜底 + 404 状态码 */
      if (p === '/404') status = 404;
    } else if (p === '/admin' || p === '/admin/' || p === '/admin/index.html' || p === '/admin.html') {
      abs = path.join(DIST, 'admin.html');
    } else if (p === '/login' || p === '/login/' || p === '/login/index.html') {
      abs = path.join(DIST, 'login.html');
    } else if (p.indexOf('/_astro/') === 0) {
      const cand = path.join(DIST, decodeURIComponent(p));
      if (!cand.startsWith(DIST)) { res.writeHead(403).end('forbidden'); return; }
      abs = cand;
    } else if (p.indexOf('/admin/assets/') === 0) {
      const cand = path.join(ROOT, 'admin', 'public', decodeURIComponent(p).replace(/^\/admin\//, ''));
      if (!cand.startsWith(path.join(ROOT, 'admin', 'public'))) { res.writeHead(403).end('forbidden'); return; }
      abs = cand;
    }
    if (!abs) {
      abs = path.join(ROOT, decodeURIComponent(file));
      if (!abs.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }
    }
    const data = await fs.readFile(abs);
    res.writeHead(status, { 'Content-Type': MIME[path.extname(abs)] || 'application/octet-stream' });
    res.end(data);
  } catch (e) {
    if (e && e.code === 'ENOENT') { res.writeHead(404).end('not found'); return; }
    res.writeHead(500).end(String(e && e.stack || e));
  }
}).listen(PORT, () => console.log('ready http://127.0.0.1:' + PORT));

async function toReq(nodeReq) {
  const chunks = [];
  for await (const c of nodeReq) chunks.push(c);
  const body = Buffer.concat(chunks);
  const headers = new Headers();
  for (const [k, v] of Object.entries(nodeReq.headers)) if (v != null) headers.set(k, Array.isArray(v) ? v.join(',') : v);
  if (!headers.get('origin')) headers.set('Origin', 'http://127.0.0.1:' + PORT);
  return new Request('http://127.0.0.1:' + PORT + nodeReq.url, {
    method: nodeReq.method,
    headers,
    body: body.length ? body : undefined,
  });
}

async function send(res, r) {
  const headers = {};
  r.headers.forEach((v, k) => { headers[k] = v; });
  res.writeHead(r.status, headers);
  res.end(Buffer.from(await r.arrayBuffer()));
}
