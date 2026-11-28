/* ──────────────────────────────────────────────────────────────────────
   学历核验审批链接签名（HMAC-SHA256）
   ──────────────────────────────────────────────────────────────────────
   邮件里的链接形如：
     /api/verify-access-approve?id=<申请ID>&exp=<unix秒>&sig=<hex>
   id 是随机 128-bit，访客轮询也用它；但没有服务端密钥就伪造不出 sig，
   所以访客拿到 id 并不能自己批准。exp 让旧邮件链接自动失效（默认 7 天）。

   密钥优先级：VERIFY_ACCESS_SECRET → DEVICE_HASH_PEPPER + 命名空间。
   生产环境强烈建议单独配置 VERIFY_ACCESS_SECRET，避免与设备哈希共用。
   ────────────────────────────────────────────────────────────────────── */

import { secretValue } from './secret.js';

const DEFAULT_TTL = 7 * 24 * 3600; // 7 天

function secretOf(env) {
  const explicit = String((env && env.VERIFY_ACCESS_SECRET) || '').trim();
  if (explicit) return explicit;
  const pepper = secretValue(env, ['DEVICE_HASH_PEPPER'], 'dev-only-pepper-change-me');
  return pepper ? pepper + ':verify-access-approval' : '';
}

async function hmac(text, env) {
  const secret = secretOf(env);
  if (!secret) throw new Error('VERIFY_ACCESS_SECRET 未配置');
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function equalHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function newRequestId() {
  if (crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '');
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  return Array.from(buf).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* 返回 { exp, sig, ttl }，exp 为 unix 秒 */
export async function signApproval(id, env, now = Date.now()) {
  const ttl = DEFAULT_TTL;
  const exp = Math.floor(now / 1000) + ttl;
  const sig = await hmac(id + '|' + exp, env);
  return { exp, sig, ttl };
}

export async function verifyApproval(id, exp, sig, env, now = Date.now()) {
  if (!secretOf(env)) return false;      // 没密钥 = 谁都不批，绝不退回公开 dev 串
  if (!id || !/^[0-9a-f]{32}$/i.test(String(id))) return false;
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum <= Math.floor(now / 1000)) return false;
  const expected = await hmac(String(id) + '|' + expNum, env);
  return equalHex(String(sig || '').toLowerCase(), expected);
}
