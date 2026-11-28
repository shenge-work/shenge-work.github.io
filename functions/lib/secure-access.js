/* ──────────────────────────────────────────────────────────────────────
   加密材料访问控制 · 通用核心（资源 / 审批状态 / 签名短链）
   ──────────────────────────────────────────────────────────────────────
   这套模块与具体页面无关。任何「访客申请 → 本人邮件批准 → 页面实时解锁 →
   短时效签名链接读取私密材料」的场景，都只需要：
     1. 在 functions/lib/secure-assets.js 的 MATERIALS 注册资源与材料；
     2. 前端容器上写 data-secure-access="<resource>"，由 js/secure-access.js 挂载；
     3. 展示数据里加 secureMaterials 段（只有展示用的公开元数据，没有存储地址）。

   安全模型：
     · 申请 ID 是 128-bit 随机数，只用于轮询；批准必须另有 HMAC 签名链接
       （functions/lib/verify-access-token.js）。
     · 审批状态绑定申请设备，批准后 24 小时自动过期。
     · 材料链接是本站 /api/secure-asset 的签名 URL，签名绑定
       申请 ID + 材料 ID + 设备 + 过期秒，默认 5 分钟失效；前端定时续签，
       旧链接自动作废。服务端每次读取都会复查审批状态并限流，
       因此拿到旧链接既看不了内容，也刷不动底层对象存储。
   ────────────────────────────────────────────────────────────────────── */

import { hmacHex } from './guard.js';
import { secretValue } from './secret.js';
import { availableMaterials, listMaterials } from './secure-assets.js';

export const APPROVAL_TTL_MS = 24 * 3600 * 1000;   // 批准后 24 小时
export const ASSET_URL_TTL_SEC = 300;              // 签名链接 5 分钟
export const ASSET_REFRESH_SEC = 120;              // 前端提前续签间隔
export const ASSET_RATE_PER_MIN = 40;              // 单个授权每分钟最多取流次数

export const RESOURCE_TYPES = Object.freeze({
  'school-verify': '学历核验',
  'company-material': '任职佐证材料',
});

/* 审批邮件 / 审批页里的可读公司名（只用于展示，不参与鉴权） */
const TARGET_LABELS = Object.freeze({
  comein: '进门财经', zhishu: '指数引力 / Lessie',
  fanggeek: '房极客', chowsang: '周生生', xinhua: '新华',
});

const RESOURCE_RE = /^([a-z][a-z0-9-]{1,30}):([a-z0-9_-]{1,40})$/i;

/* 旧数据 school_id 存的是裸 id（如 'xinhua'），统一归一化为 type:target */
export function parseResource(raw, fallback = 'school-verify:xinhua') {
  const s = String(raw || '').trim();
  const m = RESOURCE_RE.exec(s);
  if (m && Object.prototype.hasOwnProperty.call(RESOURCE_TYPES, m[1])) {
    return m[1] + ':' + m[2];
  }
  if (!s && fallback) return fallback;
  if (/^[a-z0-9_-]{1,40}$/i.test(s) && !s.includes(':')) {
    return 'school-verify:' + s;
  }
  return fallback;
}

export function resourceLabel(resource) {
  const r = parseResource(resource);
  return RESOURCE_TYPES[r.split(':')[0]] || '私密材料';
}

/* 申请入口的资源白名单：学历核验沿用旧的任意 school id，
   其它类型必须在 MATERIALS 里注册过，避免凭空造资源发审批邮件。 */
export function isValidResource(resource) {
  const r = parseResource(resource, '');
  if (!r || r !== String(resource).trim()) return false;
  const type = r.split(':')[0];
  if (type === 'school-verify') return true;
  return listMaterials(r).length > 0;
}

export function resourceTitle(resource) {
  const r = parseResource(resource);
  const target = r.split(':')[1] || '';
  const name = TARGET_LABELS[target] || target;
  return name + ' · ' + resourceLabel(r);
}

/* 审批状态判定：设备绑定 + 24 小时过期，服务端与前端共用同一套语义。
   返回 {status, approvedAt, expiresAt, deviceMismatch}。 */
export function approvalState(row, now = Date.now(), device = '') {
  let savedDevice = '';
  try { savedDevice = String((JSON.parse((row && row.meta) || '{}').deviceId) || ''); } catch (e) {}
  const given = String(device || '').trim();
  const deviceMismatch = !!(savedDevice && given !== savedDevice);
  const approvedAt = Number((row && row.approved_at) || 0);
  let status = (row && row.status) || 'pending';
  let expiresAt = 0;
  if (status === 'approved') {
    expiresAt = approvedAt + APPROVAL_TTL_MS;
    if (!approvedAt || now > expiresAt) status = 'expired';
  }
  return { status, approvedAt, expiresAt, deviceMismatch };
}

/* 签名密钥：独立配置优先，未配置时沿用审批密钥 / pepper 加命名空间 */
export function assetSecret(env) {
  const explicit = String((env && env.SECURE_ASSET_SECRET) || '').trim();
  if (explicit) return explicit;
  const verify = String((env && env.VERIFY_ACCESS_SECRET) || '').trim();
  if (verify) return verify + ':secure-asset';
  const pepper = secretValue(env, ['DEVICE_HASH_PEPPER'], 'dev-only-pepper-change-me');
  return pepper ? pepper + ':secure-asset' : '';
}

function tokenText(o) {
  return ['secure-asset', o.rid, o.aid, o.exp, o.dev, o.resource].join('|');
}

export async function signAssetToken(o, env) {
  const secret = assetSecret(env);
  if (!secret) throw new Error('SECURE_ASSET_SECRET 未配置');
  return hmacHex(secret, tokenText(o));
}

export async function verifyAssetToken(o, env, now = Date.now()) {
  const secret = assetSecret(env);
  if (!secret) return false;
  const exp = Number(o.exp);
  if (!Number.isFinite(exp) || exp <= Math.floor(now / 1000)) return false;
  /* 服务端自己只会签 5 分钟的链接；防止有人拿旧密钥签出超长有效期 */
  if (exp > Math.floor(now / 1000) + ASSET_URL_TTL_SEC + 60) return false;
  const expected = await signAssetToken(o, env);
  const given = String(o.sig || '');
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/* 批准后签发短时效链接。资源没有「已上传」材料时返回空数组（学历核验等
   静态解锁场景不依赖材料链接，行为与改造前完全一致）。 */
export async function issueAssets(o) {
  const { origin, rid, dev, resource, env, now = Date.now() } = o;
  const mats = availableMaterials(resource);
  const exp = Math.floor(now / 1000) + ASSET_URL_TTL_SEC;
  const assets = [];
  for (const m of mats) {
    const sig = await signAssetToken({ rid, aid: m.id, exp, dev, resource }, env);
    const u = new URL('/api/secure-asset', origin);
    u.searchParams.set('rid', rid);
    u.searchParams.set('aid', m.id);
    u.searchParams.set('exp', String(exp));
    if (dev) u.searchParams.set('dev', dev);
    u.searchParams.set('sig', sig);
    assets.push({
      id: m.id, label: m.label, issuer: m.issuer || '', date: m.date || '',
      contentType: m.contentType, url: u.toString(), expiresAt: exp * 1000,
    });
  }
  return {
    assets,
    refreshIn: ASSET_REFRESH_SEC,
    ttl: ASSET_URL_TTL_SEC,
    approvalExpiresAt: (o.approvalExpiresAt || 0),
  };
}
