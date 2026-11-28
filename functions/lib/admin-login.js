/* 后台免密登录的公共件：邮箱验证码 + 微信授权
   ──────────────────────────────────────────────────────────────
   为什么不用口令：站长自己也不想记第二个密码；邮箱验证码与微信
   都是「证明你是你」，比口令更难被撞库。

   安全底线（任何一条都不能松）：
   · 邮箱必须在 ADMIN_EMAILS 白名单里，否则后台就成了公共注册站；
   · 验证码只存 HMAC，库里拿不到明文；6 位、10 分钟、最多试 5 次；
   · 微信 openid/unionid 同样必须命中白名单，白名单为空 = 谁都进不来；
   · 所有失败路径都不下发会话，只回错误码。
   ────────────────────────────────────────────────────────────── */

const enc = new TextEncoder();
const RESEND_URL = 'https://api.resend.com/emails';
const DEFAULT_FROM = '作品集后台 <code@chenpeisheng.cn>';
const DEFAULT_ADMIN_EMAIL = 'hi@chenpeisheng.cn';

/* ── 基础工具 ─────────────────────────────────────────────────── */

export function normalizeEmail(v) {
  return String(v || '').trim().toLowerCase().slice(0, 160);
}

/* 只做形状校验：真正的有效性靠「能收到验证码」证明 */
export function looksLikeEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(String(v || ''));
}

/* 支持 Gmail / QQ / 163 等任意邮箱，只是必须先在环境变量里登记 */
export function adminEmails(env) {
  const raw = String((env && env.ADMIN_EMAILS) || DEFAULT_ADMIN_EMAIL);
  return raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export function isAllowedEmail(env, email) {
  const e = normalizeEmail(email);
  return !!e && adminEmails(env).indexOf(e) >= 0;
}

/* 给前端看的脱敏邮箱：ch***@gmail.com —— 让站长确认「发到的是这个」，又不把全称写在页面上 */
export function maskEmail(email) {
  const e = normalizeEmail(email);
  const at = e.indexOf('@');
  if (at < 1) return '';
  const name = e.slice(0, at);
  const head = name.slice(0, 2);
  return head + '***' + e.slice(at);
}

function b64url(bytes) {
  let s = '';
  const a = new Uint8Array(bytes);
  for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(secret, text) {
  const key = await crypto.subtle.importKey('raw', enc.encode(String(secret)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(text));
  return b64url(sig);
}

/* 与 admin-auth.js 的 sessionSecret 保持同一套优先级。
   RESEND_API_KEY 已从兜底链移除：邮件密钥不能拿来签后台会话/验证码。 */
function loginSecret(env) {
  return String((env && (env.ADMIN_SESSION_SECRET || env.ADMIN_PASSWORD)) || '');
}

/* ── 邮箱验证码 ───────────────────────────────────────────────── */

export const CODE_TTL_MS = 10 * 60 * 1000;
export const CODE_MAX_ATTEMPTS = 5;
export const CODE_RESEND_COOLDOWN_MS = 60 * 1000;

export function randomCode() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0] % 1000000).padStart(6, '0');
}

/* 存库前的哈希：绑邮箱，避免同一串码在不同邮箱之间通用 */
export async function codeHash(env, email, code) {
  const secret = loginSecret(env);
  if (!secret) throw new Error('ADMIN_SESSION_SECRET / ADMIN_PASSWORD 未配置');
  return hmac(secret, 'email-code|' + normalizeEmail(email) + '|' + String(code));
}

/* 定时安全比较：必须同步。写成 async 会让 `safeEqualStr(...) ? a : b` 永远取真值 */
export function safeEqualStr(a, b) {
  const x = String(a == null ? '' : a);
  const y = String(b == null ? '' : b);
  let diff = x.length === y.length ? 0 : 1;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return diff === 0;
}

function codeMailHtml(code, email) {
  return `<!doctype html><html><body style="margin:0;padding:28px 16px;background:#F3EEE2;font-family:'PingFang SC','Microsoft YaHei',-apple-system,sans-serif;color:#14110E">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#FBF8F1;border:2px solid #14110E">
    <tr><td style="padding:26px 24px 8px">
      <p style="margin:0 0 18px;font:11px/1.4 ui-monospace,Menlo,monospace;letter-spacing:.18em;color:#E8501E">PRIVATE CONSOLE</p>
      <h1 style="margin:0 0 8px;font-size:20px;line-height:1.35">后台登录验证码</h1>
      <p style="margin:0 0 20px;font-size:13px;line-height:1.7;color:#4A423A">有人在 ${escapeHtml(email)} 上请求登录后台。是你就把下面的码填回去，10 分钟内有效，只能用一次。</p>
      <p style="margin:0 0 22px;font:700 34px/1.2 ui-monospace,Menlo,monospace;letter-spacing:.32em;color:#14110E">${code}</p>
      <p style="margin:0 0 4px;font-size:12px;line-height:1.7;color:#4A423A">不是你操作的？忽略这封邮件即可，后台不会因此解锁。</p>
    </td></tr>
    <tr><td style="padding:18px 24px 24px;border-top:1px solid #D8CFBF">
      <p style="margin:0;font-size:11px;line-height:1.7;color:#7A7168">chenpeisheng.cn · 后台登录通知，请勿转发</p>
    </td></tr>
  </table>
</body></html>`;
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* 发信：Resend 是唯一通道，没配就明确告诉前端，不要假装成功 */
export async function sendCodeMail(env, email, code) {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: 'mail_not_configured' };
  const from = env.ADMIN_EMAIL_FROM || DEFAULT_FROM;
  let r;
  try {
    r = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [email],
        subject: '后台登录验证码 ' + code,
        html: codeMailHtml(code, email),
        text: '后台登录验证码：' + code + '\n10 分钟内有效，只能用一次。不是你操作的请忽略这封邮件。',
      }),
    });
  } catch (e) {
    return { ok: false, error: 'mail_network' };
  }
  if (!r.ok) {
    const detail = await r.text().catch(() => '');
    return { ok: false, error: 'mail_rejected', status: r.status, detail: detail.slice(0, 300) };
  }
  return { ok: true };
}

/* ── 微信授权 ───────────────────────────────────────────────────
   qr：开放平台「网站应用」扫码登录（桌面端）
   mp：公众号「网页授权」，只能在微信内置浏览器里跑（手机点开）
   两套 AppID 不通用，所以分开配；没配的那条路径直接视为不可用。 */

export function wechatConfig(env, mode) {
  if (mode === 'mp') {
    return {
      appId: String(env.WECHAT_MP_APP_ID || ''),
      secret: String(env.WECHAT_MP_APP_SECRET || ''),
    };
  }
  return {
    appId: String(env.WECHAT_APP_ID || ''),
    secret: String(env.WECHAT_APP_SECRET || ''),
  };
}

export function wechatEnabled(env) {
  const qr = wechatConfig(env, 'qr');
  const mp = wechatConfig(env, 'mp');
  return {
    qr: !!(qr.appId && qr.secret && wechatAllowList(env).length),
    mp: !!(mp.appId && mp.secret && wechatAllowList(env).length),
  };
}

/* openid + unionid 都接受：同一个人的 openid 在不同应用下不一样，unionid 才是唯一的 */
export function wechatAllowList(env) {
  const raw = String((env && (env.WECHAT_ALLOW_OPENIDS || '')) || '');
  const uni = String((env && (env.WECHAT_ALLOW_UNIONIDS || '')) || '');
  return (raw + ',' + uni).split(',').map((s) => s.trim()).filter(Boolean);
}

export function wechatAllowed(env, openid, unionid) {
  const list = wechatAllowList(env);
  if (!list.length) return false;             // 没配白名单 = 谁都别进
  const id = String(openid || '');
  const uid = String(unionid || '');
  return (!!id && list.indexOf(id) >= 0) || (!!uid && list.indexOf(uid) >= 0);
}

/* state 用会话密钥签名，带 mode 与 10 分钟有效期，防 CSRF 与串用 */
export async function signState(env, mode) {
  const secret = loginSecret(env);
  if (!secret) throw new Error('登录密钥未配置');
  const ts = String(Date.now());
  const nonce = crypto.randomUUID().slice(0, 8);
  const sig = await hmac(secret, 'state|' + mode + '|' + ts + '|' + nonce);
  return [mode, ts, nonce, sig].join('.');
}

export async function verifyState(env, state) {
  const parts = String(state || '').split('.');
  if (parts.length !== 4) return null;
  const [mode, ts, nonce, sig] = parts;
  if (mode !== 'qr' && mode !== 'mp') return null;
  const age = Date.now() - Number(ts);
  if (!Number.isFinite(age) || age < 0 || age > 600000) return null;
  const secret = loginSecret(env);
  if (!secret) return null;
  const expect = await hmac(secret, 'state|' + mode + '|' + ts + '|' + nonce);
  return safeEqualStr(expect, sig) ? mode : null;
}
