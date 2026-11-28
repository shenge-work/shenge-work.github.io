/* 后台路由守卫回归：/admin 全部路由要求登录、未登录 302 到 /login、
   已登录访问 /login 回控制台、静态资源未登录不返回 HTML、
   以及后台接口自身的 401 / 登录限流。

   直接调用 functions/_middleware.js 与 functions/api/admin/*，
   D1 用 node:sqlite 内存库模拟，不连生产。 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { onRequest, isAdminPath, isLoginPath } from '../functions/_middleware.js';
import { signSession, verifySession, COOKIE, TTL } from '../functions/lib/admin-auth.js';
import { onRequestPost as loginPost } from '../functions/api/admin/auth/login.js';
import { onRequestGet as meGet } from '../functions/api/admin/auth/me.js';
import { onRequestGet as statsGet } from '../functions/api/admin/stats.js';
import { onRequestPost as logoutPost } from '../functions/api/admin/auth/logout.js';

const ORIGIN = 'https://chenpeisheng.cn';
const SCHEMA = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
const SECRET = 'test-admin-session-secret';
const PASSWORD = 'correct-horse-battery';

function fakeDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(SCHEMA);
  return {
    raw: sqlite,
    prepare(sql) {
      const stmt = sqlite.prepare(sql);
      const make = (params) => ({
        all: async () => ({ results: stmt.all(...params), success: true, meta: {} }),
        first: async (col) => {
          const row = stmt.all(...params)[0];
          if (!row) return null;
          return col ? (row[col] === undefined ? null : row[col]) : row;
        },
        run: async () => {
          const info = stmt.run(...params);
          return { success: true, meta: { changes: Number(info && info.changes) || 0 } };
        },
      });
      return Object.assign(make([]), { bind: (...params) => make(params) });
    },
  };
}

function envOf(db, extra = {}) {
  return Object.assign({
    DB: db,
    ADMIN_PASSWORD: PASSWORD,
    ADMIN_SESSION_SECRET: SECRET,
    ALLOWED_ORIGINS: ORIGIN,
  }, extra);
}

function ctx(path, headers = {}, env = envOf(fakeDb())) {
  return {
    request: new Request(ORIGIN + path, { headers }),
    env,
    next: async () => new Response('PAGE', { status: 200, headers: { 'Content-Type': 'text/html' } }),
    waitUntil() {},
    passThroughOnException() {},
  };
}

async function cookieOf(env = envOf(fakeDb()), ttl = TTL) {
  const exp = Math.floor(Date.now() / 1000) + ttl;
  return COOKIE + '=' + (await signSession(env, exp));
}

/* ── 路径归类 ───────────────────────────────────────────────────── */

test('后台路径判定：/admin 及其子路径命中，接口与公开站不误伤', () => {
  assert.equal(isAdminPath('/admin'), true);
  assert.equal(isAdminPath('/admin/'), true);
  assert.equal(isAdminPath('/admin/index.html'), true);
  assert.equal(isAdminPath('/admin/assets/admin.js'), true);
  assert.equal(isAdminPath('/administrator'), false);
  assert.equal(isAdminPath('/api/admin/stats'), false);
  assert.equal(isAdminPath('/index.html'), false);

  assert.equal(isLoginPath('/login'), true);
  assert.equal(isLoginPath('/login/'), true);
  assert.equal(isLoginPath('/login.html'), true);
  assert.equal(isLoginPath('/loginx'), false);
});

/* ── 未登录 ─────────────────────────────────────────────────────── */

test('未登录访问后台主页 → 302 到 /login，并带上 next', async () => {
  const res = await onRequest(ctx('/admin'));
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('Location'), '/login?next=%2Fadmin');
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
});

test('未登录访问后台子页面与带查询串的直达链接 → 302 且保留原路径', async () => {
  const a = await onRequest(ctx('/admin/index.html'));
  assert.equal(a.status, 302);
  assert.equal(a.headers.get('Location'), '/login?next=%2Fadmin%2Findex.html');

  const b = await onRequest(ctx('/admin/?focus=abc123'));
  assert.equal(b.status, 302);
  assert.equal(b.headers.get('Location'), '/login?next=' + encodeURIComponent('/admin/?focus=abc123'));
});

test('未登录请求后台静态资源 → 404，不把登录页 HTML 当 JS/CSS 返回', async () => {
  for (const p of ['/admin/assets/admin.js', '/admin/assets/admin.css', '/admin/assets/models/MaleRigged.glb']) {
    const res = await onRequest(ctx(p));
    assert.equal(res.status, 404, p);
  }
});

test('没配会话密钥时后台仍然拒绝，不抛 500', async () => {
  const env = { DB: fakeDb(), ALLOWED_ORIGINS: ORIGIN };  // 没有 ADMIN_PASSWORD / SECRET
  const res = await onRequest(ctx('/admin', {}, env));
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('Location'), '/login?next=%2Fadmin');
  assert.equal(await verifySession(env, '9999999999.abc'), false);
});

test('伪造 / 过期会话一律视为未登录', async () => {
  const env = envOf(fakeDb());
  const forged = await onRequest(ctx('/admin', { Cookie: COOKIE + '=9999999999.forged' }, env));
  assert.equal(forged.status, 302);

  const expired = await cookieOf(env, -10);
  const res = await onRequest(ctx('/admin', { Cookie: expired }, env));
  assert.equal(res.status, 302);
});

function parseCsp(csp) {
  const out = {};
  for (const part of String(csp || '').split(';')) {
    const bits = part.trim().split(/\s+/).filter(Boolean);
    if (bits.length) out[bits[0].toLowerCase()] = bits.slice(1);
  }
  return out;
}

/* ── 已登录 ─────────────────────────────────────────────────────── */

test('后台 CSP 放行 data: 音频：AI 语音试听的 base64 mp3 不会被拦', async () => {
  const env = envOf(fakeDb());
  const res = await onRequest(ctx('/admin', { Cookie: await cookieOf(env) }, env));
  const live = parseCsp(res.headers.get('Content-Security-Policy'));
  assert.ok(live['media-src'], '后台 CSP 必须显式声明 media-src');
  assert.ok(live['media-src'].includes("'self'"));
  assert.ok(live['media-src'].includes('data:'), '试听音频是 data: URL，必须放行');

  /* 静态兜底（Pages 读 admin/public/_headers）不能与中间件漂掉 */
  const raw = readFileSync(new URL('../admin/public/_headers', import.meta.url), 'utf8');
  const line = raw.split('\n').map((s) => s.trim())
    .find((s) => /^Content-Security-Policy:/i.test(s));
  assert.ok(line, '_headers 缺少 Content-Security-Policy');
  const staticDirs = parseCsp(line.replace(/^Content-Security-Policy:\s*/i, ''));
  assert.ok(staticDirs['media-src'] && staticDirs['media-src'].includes('data:'));
  assert.deepEqual(Object.keys(staticDirs).sort(), Object.keys(live).sort(),
    '_headers 与中间件 ADMIN_CSP 的指令集必须一致');
});

test('已登录访问 /admin → 放行，并补上后台专用安全头', async () => {
  const env = envOf(fakeDb());
  const res = await onRequest(ctx('/admin', { Cookie: await cookieOf(env) }, env));
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'PAGE');
  assert.equal(res.headers.get('X-Frame-Options'), 'DENY');
  assert.match(res.headers.get('X-Robots-Tag') || '', /noindex/);
  assert.match(res.headers.get('Content-Security-Policy') || '', /frame-ancestors 'none'/);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
});

test('已登录访问 /login → 直接送回控制台，避免重复登录', async () => {
  const env = envOf(fakeDb());
  const res = await onRequest(ctx('/login', { Cookie: await cookieOf(env) }, env));
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('Location'), '/admin/');
});

test('登录页本身可匿名访问，带登录页专用 CSP', async () => {
  const res = await onRequest(ctx('/login'));
  assert.equal(res.status, 200);
  assert.match(res.headers.get('Content-Security-Policy') || '', /frame-ancestors 'none'/);
  assert.match(res.headers.get('Content-Security-Policy') || '', /script-src 'self' 'unsafe-inline'/);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
});

/* ── 接口层 ─────────────────────────────────────────────────────── */

test('后台接口未登录 → 401，不泄漏任何数据', async () => {
  const env = envOf(fakeDb());
  const res = await statsGet({ request: new Request(ORIGIN + '/api/admin/stats'), env });
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, 'unauthorized');
});

test('me 接口如实反映登录态', async () => {
  const env = envOf(fakeDb());
  const anon = await meGet({ request: new Request(ORIGIN + '/api/admin/auth/me'), env });
  assert.equal((await anon.json()).authed, false);

  const authed = await meGet({
    request: new Request(ORIGIN + '/api/admin/auth/me', { headers: { Cookie: await cookieOf(env) } }),
    env,
  });
  assert.equal((await authed.json()).authed, true);
});

test('登录：口令正确发 HttpOnly 会话 cookie，错误口令 401', async () => {
  const env = envOf(fakeDb());
  const ok = await loginPost({
    request: new Request(ORIGIN + '/api/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Request': '1', Origin: ORIGIN },
      body: JSON.stringify({ password: PASSWORD }),
    }),
    env,
  });
  assert.equal(ok.status, 200);
  const setCookie = ok.headers.get('Set-Cookie') || '';
  assert.match(setCookie, /pa_sess=/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /Secure/);
  assert.match(setCookie, /SameSite=Lax/);
  assert.match(setCookie, /Max-Age=2592000/); // 30 天免登录

  const bad = await loginPost({
    request: new Request(ORIGIN + '/api/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Request': '1', Origin: ORIGIN },
      body: JSON.stringify({ password: 'wrong' }),
    }),
    env,
  });
  assert.equal(bad.status, 401);
  assert.equal((await bad.json()).error, 'bad_password');
});

test('登录：缺 CSRF 自定义头直接 403', async () => {
  const env = envOf(fakeDb());
  const res = await loginPost({
    request: new Request(ORIGIN + '/api/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ password: PASSWORD }),
    }),
    env,
  });
  assert.equal(res.status, 403);
});

test('登录限流：15 分钟内第 9 次起 429', async () => {
  const env = envOf(fakeDb());
  const attempt = () => loginPost({
    request: new Request(ORIGIN + '/api/admin/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', 'X-Admin-Request': '1', Origin: ORIGIN,
        'CF-Connecting-IP': '203.0.113.9',
      },
      body: JSON.stringify({ password: 'wrong' }),
    }),
    env,
  });

  for (let i = 0; i < 8; i++) {
    const r = await attempt();
    assert.equal(r.status, 401, '第 ' + (i + 1) + ' 次应仍是口令错误');
  }
  const ninth = await attempt();
  assert.equal(ninth.status, 429);
  assert.equal((await ninth.json()).error, 'rate_limited');
});

test('退出登录清空 cookie', async () => {
  const env = envOf(fakeDb());
  const res = await logoutPost({
    request: new Request(ORIGIN + '/api/admin/auth/logout', {
      method: 'POST',
      headers: { 'X-Admin-Request': '1', Origin: ORIGIN },
    }),
    env,
  });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('Set-Cookie') || '', /Max-Age=0/);
});

/* ── 公开站不受影响 ─────────────────────────────────────────────── */

test('公开页面不需要登录，正常 200', async () => {
  for (const p of ['/', '/resume.html', '/jd.html']) {
    const res = await onRequest(ctx(p));
    assert.equal(res.status, 200, p);
  }
  /* 数据文件本来就有同源要求（跟后台无关），带上同源信号才放行 */
  const data = await onRequest(ctx('/data/site-data.json', { 'Sec-Fetch-Site': 'same-origin' }));
  assert.equal(data.status, 200);
});
