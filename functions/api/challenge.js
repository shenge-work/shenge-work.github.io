/* ──────────────────────────────────────────────────────────────────────
   投递凭证签发（/api/challenge）
   ──────────────────────────────────────────────────────────────────────
   前端打开投递弹窗时先取一张凭证：它绑定当前来源、IP 与用途，
   15 分钟过期，并附带工作量（PoW）——只有真正跑过 JS 的页面拿得到
   能通过校验的凭证，纯脚本直接 POST 会被拒。

   GET → {ok:true, token, difficulty, expiresAt}
   校验失败时 /api/deliver 返回 verification_required / verification_failed
   / verification_expired，前端据此重新取证并重试一次。

   说明：签发本身不落库（凭证自校验），因此这里只做轻量限流，
   防止有人把签发接口当成压测靶子。
   ────────────────────────────────────────────────────────────────────── */

import {
  allowedOrigins, corsHeaders, isAllowedOrigin, issueProof, ipTag, limit, hourKey, json,
} from '../lib/guard.js';

export async function onRequestOptions({ request, env }) {
  const allow = allowedOrigins(env);
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin'), allow, 'GET, OPTIONS') });
}

export async function onRequestGet({ request, env }) {
  const origin = request.headers.get('Origin') || '';
  const allow = allowedOrigins(env);
  if (!isAllowedOrigin(origin, allow)) {
    return json({ ok: false, error: 'origin_not_allowed' }, corsHeaders(origin, allow, 'GET, OPTIONS'), 403);
  }
  const cors = corsHeaders(origin, allow, 'GET, OPTIONS');

  const hit = await limit(env, [
    { bucket: 'challenge:ip:' + (await ipTag(request, env, 12)), window: hourKey(), limit: 80, ttl: 4200 },
  ]);
  if (hit) {
    return json({ ok: false, error: 'rate_limited', message: '请求过于频繁，请稍后再试' }, cors, 429);
  }

  let proof;
  try {
    proof = await issueProof(env, request, 'deliver');
  } catch (e) {
    return json({ ok: false, error: 'server_misconfigured', message: '签名密钥未配置，已拒绝签发凭证' }, cors, 503);
  }
  return json({ ok: true, token: proof.token, difficulty: proof.difficulty, expiresAt: proof.expiresAt }, cors, 200);
}
