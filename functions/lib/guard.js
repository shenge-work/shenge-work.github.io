/* ──────────────────────────────────────────────────────────────────────
   公共防护库（Cloudflare Pages Functions 与中间件共用）
   ──────────────────────────────────────────────────────────────────────
   目的：把「来源校验 / IP 脱敏 / 一次性凭证 / 限流」收敛到一处，
   让所有对外接口用同一套规则，避免每个接口各写一份、松紧不一。

   三层防护：
     1. 来源白名单（Origin）——挡住第三方站点直接调接口；
     2. 签名凭证（proof）——必须先 GET /api/challenge 取证，凭证绑定
        来源、IP 与用途，带过期时间，并附 PoW 工作量，挡住只发 POST
        的脚本；
     3. 多维限流（限流键 + 时间窗）——每 IP / 全站 / 每收件人，
        优先走 D1（rate_limits 表，单语句原子自增），无 D1 时退 KV。

   环境变量：
     DELIVER_CHALLENGE_SECRET  签名密钥；留空依次退
                               VERIFY_ACCESS_SECRET → DEVICE_HASH_PEPPER。
                               全部缺失时 fail-closed，不再用仓库里的 dev 串。
     DELIVER_POW_DIFFICULTY    可选，PoW 难度（前导 0 的十六进制位数），
                               默认 3，范围 0–5；0 表示只要凭证不算力
   ────────────────────────────────────────────────────────────────────── */

import { secretValue } from './secret.js';

export const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

export const DEFAULT_ORIGINS = [
  'https://chenpeisheng.cn',
  'https://shenge-work.pages.dev',
  '*.shenge-work.pages.dev',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
  /* 本地联调服务器 scripts/dev-api-server.mjs 的默认端口，与 wall.js 保持一致 */
  'http://localhost:8877',
  'http://127.0.0.1:8877',
];

const DEV_SECRET = 'dev-only-proof-secret-change-me';
const PROOF_TTL_SEC = 900;          // 凭证 15 分钟有效
const POW_DEFAULT = 3;
const POW_MAX = 5;

export function allowedOrigins(env) {
  return String((env && env.ALLOWED_ORIGINS) || DEFAULT_ORIGINS.join(','))
    .split(',').map((s) => s.trim()).filter(Boolean);
}

export function isAllowedOrigin(origin, allow) {
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

export function corsHeaders(origin, allow, methods) {
  const acao = isAllowedOrigin(origin, allow) ? String(origin).trim() : '';
  const h = {
    'Access-Control-Allow-Methods': methods || 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Device-Id',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (acao) h['Access-Control-Allow-Origin'] = acao;
  return h;
}

export function json(body, extra, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign({}, JSON_HEADERS, extra || {}),
  });
}

export function clientIp(request) {
  const xff = request.headers.get('CF-Connecting-IP')
    || request.headers.get('X-Forwarded-For')
    || request.headers.get('X-Real-IP')
    || '';
  return (xff.split(',')[0] || 'unknown').trim() || 'unknown';
}

/* ── 加解密基础（Workers 无 Buffer，统一走 WebCrypto） ─────────────── */

function bytesToHex(buf) {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function bytesToB64url(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function hmacHex(secret, text) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(String(secret)),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(String(text)));
  return bytesToHex(sig);
}

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
  return bytesToHex(buf);
}

/* IP → 带 pepper 的 HMAC 前缀：既做限流键，也可进邮件，绝不落明文 */
export async function ipTag(request, env, len) {
  try {
    const pepper = secretValue(
      env,
      ['DEVICE_HASH_PEPPER', 'VERIFY_ACCESS_SECRET', 'DELIVER_CHALLENGE_SECRET'],
      DEV_SECRET,
    );
    if (!pepper) return 'unknown';   // 没密钥就坍缩到同一个桶，绝不静默放行
    return (await hmacHex(pepper, clientIp(request))).slice(0, len || 16);
  } catch (e) {
    return 'unknown';
  }
}

/* ── 签名凭证 ──────────────────────────────────────────────────────── */

export function proofSecret(env) {
  return secretValue(
    env,
    ['DELIVER_CHALLENGE_SECRET', 'VERIFY_ACCESS_SECRET', 'DEVICE_HASH_PEPPER'],
    DEV_SECRET,
  );
}

export function powDifficulty(env) {
  const raw = env && env.DELIVER_POW_DIFFICULTY;
  if (raw == null || raw === '') return POW_DEFAULT;   // 未配置 → 用默认难度，不要当成 0
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return POW_DEFAULT;
  return Math.min(POW_MAX, Math.floor(n));
}

/* 凭证格式：<用途>.<过期秒>.<IP 标签>.<随机串>.<HMAC>
   绑定用途与 IP，服务端无需存储即可校验；过期时间取服务端时间。 */
export async function issueProof(env, request, purpose) {
  const secret = proofSecret(env);
  if (!secret) throw new Error('签名密钥未配置（DELIVER_CHALLENGE_SECRET / VERIFY_ACCESS_SECRET / DEVICE_HASH_PEPPER）');
  const exp = Math.floor(Date.now() / 1000) + PROOF_TTL_SEC;
  const tag = await ipTag(request, env, 12);
  const rand = bytesToB64url(crypto.getRandomValues(new Uint8Array(9)));
  const payload = [purpose, exp, tag, rand].join('.');
  const sig = (await hmacHex(secret, payload)).slice(0, 32);
  return {
    token: payload + '.' + sig,
    difficulty: powDifficulty(env),
    expiresAt: exp * 1000,
  };
}

function safeEqual(a, b) {
  const x = String(a || '');
  const y = String(b || '');
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

/* 校验凭证。proof 可以是字符串，也可以是 {token, nonce}。
   返回 {ok:true} 或 {ok:false, error}，error 供前端区分提示。 */
export async function verifyProof(env, request, proof, purpose) {
  const token = typeof proof === 'string' ? proof : (proof && proof.token);
  const nonce = (proof && typeof proof === 'object' && proof.nonce != null) ? String(proof.nonce) : '';
  if (!token) return { ok: false, error: 'verification_required' };

  const secret = proofSecret(env);
  if (!secret) return { ok: false, error: 'server_misconfigured' };

  const parts = String(token).split('.');
  if (parts.length !== 5) return { ok: false, error: 'verification_failed' };
  const [gotPurpose, expRaw, tag, rand, sig] = parts;
  const payload = [gotPurpose, expRaw, tag, rand].join('.');

  const expect = (await hmacHex(secret, payload)).slice(0, 32);
  if (!safeEqual(expect, sig)) return { ok: false, error: 'verification_failed' };
  if (gotPurpose !== purpose) return { ok: false, error: 'verification_failed' };

  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) {
    return { ok: false, error: 'verification_expired' };
  }

  const tagNow = await ipTag(request, env, 12);
  if (!safeEqual(tagNow, tag)) return { ok: false, error: 'verification_failed' };

  const diff = powDifficulty(env);
  if (diff > 0) {
    if (!nonce) return { ok: false, error: 'verification_required' };
    const hex = await sha256Hex(String(token) + ':' + nonce);
    if (hex.slice(0, diff) !== '0'.repeat(diff)) return { ok: false, error: 'verification_failed' };
  }
  return { ok: true };
}

/* ── 限流 ──────────────────────────────────────────────────────────── */

export function hourKey(at) {
  return 'h' + Math.floor((at || Date.now()) / 3600000);
}

export function minuteKey(at) {
  return 'm' + Math.floor((at || Date.now()) / 60000);
}

export function dayKey(at) {
  return 'd' + new Date(at || Date.now()).toISOString().slice(0, 10);
}

/* D1：复用 db/schema.sql 的 rate_limits，单语句完成自增 + 判定。
   返回：>=1 当前计数；0 = 已超限（RETURNING 无行）；null = 存储异常。
   让「超限」和「出错」可区分，避免限流把正常请求一起误杀或漏放。 */
export async function gate(db, bucket, window, limit, ttlSeconds) {
  try {
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
    return row ? Number(row.count) : 0;
  } catch (e) {
    return null;
  }
}

/* KV 兜底：读写非原子，只用于没有 D1 的本地 / 降级场景 */
export async function kvBump(kv, key, ttlSeconds) {
  if (!kv) return null;
  try {
    const cur = Number(await kv.get(key)) || 0;
    const next = cur + 1;
    await kv.put(key, String(next), { expirationTtl: Math.max(60, ttlSeconds) });
    return next;
  } catch (e) {
    return null;
  }
}

/* 统一限流入口：entries = [{bucket, window, limit, ttl}]
   返回 null 表示放行；返回命中的那条 entry 表示超限。
   存储异常一律放行（可用性优先），避免防护把正常投递打死。 */
export async function limit(env, entries) {
  const list = (entries || []).filter(Boolean);
  if (!list.length) return null;
  for (const it of list) {
    let count = null;
    try {
      if (env && env.DB) count = await gate(env.DB, it.bucket, it.window, it.limit, it.ttl);
      else if (env && env.SITE_KV) count = await kvBump(env.SITE_KV, it.bucket + ':' + it.window, it.ttl);
    } catch (e) {
      count = null;
    }
    if (count == null) continue;                 // 存储异常：放行，可用性优先
    if (count === 0 || count > it.limit) return it;
  }
  return null;
}

/* 请求体大小上限：先看 Content-Length，避免把超大 JSON 读进内存 */
export const MAX_BODY_BYTES = 64 * 1024;

export function tooLarge(request) {
  const raw = request.headers.get('Content-Length');
  if (!raw) return false;
  const n = Number(raw);
  return Number.isFinite(n) && n > MAX_BODY_BYTES;
}

/* 私密附件（简历证书）的签名头：只有服务端读取附件时算得出来并带上，
   中间件据此拒绝任何直接访问。两边用同一密钥，配置缺失时同为开发密钥。 */
export async function certToken(env, pathname) {
  try {
    const secret = proofSecret(env);
    if (!secret) return '';   // 中间件看到空 token 会 404，宁可挡住也不裸奔
    return (await hmacHex(secret, 'cert:' + pathname)).slice(0, 32);
  } catch (e) {
    return '';
  }
}

