/* 后台公共库：会话签名、鉴权、限流、JSON 响应
   ──────────────────────────────────────────────────────────────
   后台是独立 Pages 项目（shenge-work-admin.pages.dev），跟公开站同一个 D1。
   鉴权：密码换一个签名 cookie（HMAC-SHA256），不建 session 表，成本为零。
   后面接 GitHub OAuth 时，只需把 login.js 换成跳转 + 回调，verify 逻辑不变。
   ────────────────────────────────────────────────────────────── */

export const COOKIE = 'pa_sess';
/* 登录票据 30 天有效：cookie Max-Age 与签名里的 exp 同值。
   浏览器重启后仍保留，30 天内进后台不再要求验证码；到期自动回登录页。 */
export const TTL = 30 * 24 * 60 * 60; // 2592000 秒（30 天）

const enc = new TextEncoder();

function b64url(bytes) {
  let s = '';
  const a = new Uint8Array(bytes);
  for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function json(body, status, extra) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign({
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    }, extra || {}),
  });
}

export function fail(error, message, status) {
  return json({ ok: false, error, message }, status || 400);
}

export function intParam(v, min, max, fallback) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/* 定时安全比较：长度不同也走完整循环，避免用时间差猜口令 */
export function safeEqual(a, b) {
  const x = String(a == null ? '' : a);
  const y = String(b == null ? '' : b);
  let diff = x.length === y.length ? 0 : 1;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) {
    diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  }
  return diff === 0;
}

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', enc.encode(String(secret)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

/* 会话密钥：ADMIN_SESSION_SECRET → ADMIN_PASSWORD（历史兼容）。
   绝不再退到 RESEND_API_KEY：邮件发送密钥泄露过一次就等于后台会话可伪造。
   两个都没配就 fail-closed，后台一律不认会话。 */
function sessionSecret(env) {
  return String((env && (env.ADMIN_SESSION_SECRET || env.ADMIN_PASSWORD)) || '');
}

export async function signSession(env, exp) {
  const secret = sessionSecret(env);
  if (!secret) throw new Error('ADMIN_SESSION_SECRET / ADMIN_PASSWORD 未配置');
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode('v1|' + exp));
  return exp + '.' + b64url(sig);
}

export async function verifySession(env, value) {
  const secret = sessionSecret(env);
  if (!secret) return false;                  // 没配密钥 = 谁都不放行，绝不默认通过
  const raw = String(value || '');
  const dot = raw.indexOf('.');
  if (dot < 1) return false;
  const exp = Number(raw.slice(0, dot));
  const sig = raw.slice(dot + 1);
  if (!Number.isFinite(exp) || exp < Date.now() / 1000) return false;
  const expected = await signSession(env, exp);
  return safeEqual(expected.slice(dot + 1), sig);
}

export function readCookie(request, name) {
  const c = request.headers.get('Cookie') || '';
  const parts = c.split(';');
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i].trim();
    if (p.indexOf(name + '=') === 0) return decodeURIComponent(p.slice(name.length + 1));
  }
  return '';
}

export function sessionCookie(env, value, maxAge) {
  const secure = ' Secure;';
  return COOKIE + '=' + value + '; Path=/; HttpOnly;' + secure + ' SameSite=Lax; Max-Age=' + maxAge;
}

export function clearCookie() {
  return COOKIE + '=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
}

/* 会话或应急令牌二选一；返回 true 表示放行 */
export async function isAdmin(request, env) {
  if (await verifySession(env, readCookie(request, COOKIE))) return true;
  const token = env.WALL_ADMIN_TOKEN;
  if (token && safeEqual(request.headers.get('X-Admin-Token'), token)) return true;
  return false;
}

export async function requireAdmin(request, env) {
  if (!env.DB) return fail('db_not_bound', '后台没有绑定 D1', 503);
  if (!(await isAdmin(request, env))) return fail('unauthorized', '需要登录', 401);
  return null;
}

/* 写操作除依赖 SameSite=Lax，还要求带自定义头 + Origin 同源：
   跨站表单无法伪造自定义头，能挡住绝大多数 CSRF。 */
export function assertCsrf(request) {
  if (request.method === 'GET') return null;
  if (request.headers.get('X-Admin-Request') !== '1') return fail('csrf', '缺少 X-Admin-Request', 403);
  const origin = request.headers.get('Origin');
  if (!origin) return null; // curl / 脚本
  let host = '';
  try { host = new URL(request.url).host; } catch (e) { host = ''; }
  let ohost = '';
  try { ohost = new URL(origin).host; } catch (e) { ohost = ''; }
  if (host && ohost && host !== ohost) return fail('csrf', '来源不匹配', 403);
  return null;
}

export async function ipHash(request) {
  const ip = (request.headers.get('CF-Connecting-IP') || 'unknown').trim();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(ip));
  return b64url(new Uint8Array(buf).slice(0, 8));
}

/* 登录限流：固定窗口，失败不累加（只在尝试时 +1，超过就拒） */
export async function gate(db, bucket, window, limit, ttlSeconds) {
  const expires = Date.now() + Math.max(60, ttlSeconds) * 1000;
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

export function csvCell(v) {
  const s = String(v == null ? '' : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
