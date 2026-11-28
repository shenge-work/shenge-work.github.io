/* ──────────────────────────────────────────────────────────────────────
   自动投递 · 发送前真实预览（/api/deliver-preview）
   ──────────────────────────────────────────────────────────────────────
   与 /api/deliver 共用同一套请求解析、附件探测与正文生成逻辑，
   因此预览里看到的就是点击「确认投递」后实际发出的内容。

   POST {同 /api/deliver 的 payload，含 verify 凭证}
     → {ok:true, to, subject, html, text, attachments, replyTo, pending,
        zipName, zipEntries}
   只读预览：不调用 Resend、不消耗发信限额、不需要 RESEND_API_KEY。
   但会真实读取 PDF / 证书并打包，属于重资源接口，因此同样要求凭证，
   并按 IP（30 次/小时）与全站（200 次/小时）限流。
   OPTIONS → 204（CORS 预检）
   ────────────────────────────────────────────────────────────────────── */

import {
  allowedOrigins, corsHeaders, isAllowedOrigin, json,
  parseDelivery, probeAttachments,
} from './deliver.js';
import { buildDeliveryEmail, buildSubject } from '../lib/deliver-content.js';
import { dayKey, hourKey, ipTag, limit, tooLarge, verifyProof } from '../lib/guard.js';

const PREVIEW_IP_HOUR_LIMIT = 30;
const PREVIEW_HOUR_LIMIT = 200;

export async function onRequestOptions({ request, env }) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request.headers.get('Origin'), allowedOrigins(env)),
  });
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('Origin') || '';
  const allow = allowedOrigins(env);
  if (!isAllowedOrigin(origin, allow)) {
    return json({ ok: false, error: 'origin_not_allowed' }, corsHeaders(origin, allow), 403);
  }
  const cors = corsHeaders(origin, allow);

  if (tooLarge(request)) {
    return json({ ok: false, error: 'payload_too_large', message: '提交内容过大，请精简后再试' }, cors, 413);
  }

  let body = {};
  try { body = await request.json(); } catch (e) { body = null; }
  if (!body || typeof body !== 'object') {
    return json({ ok: false, error: 'bad_request', message: '请求体不是合法 JSON' }, cors, 400);
  }

  const proof = await verifyProof(env, request, body.verify, 'deliver');
  if (!proof.ok) {
    if (proof.error === 'server_misconfigured') {
      return json({ ok: false, error: proof.error, message: '服务端签名密钥未配置，已拒绝预览' }, cors, 503);
    }
    return json({
      ok: false,
      error: proof.error,
      message: proof.error === 'verification_expired'
        ? '验证已过期，请重新点击投递'
        : '验证未通过，请刷新页面后重试',
    }, cors, 403);
  }

  const iph = await ipTag(request, env, 12);
  const hit = await limit(env, [
    { bucket: 'preview:ip:' + iph, window: hourKey(), limit: PREVIEW_IP_HOUR_LIMIT, ttl: 4200 },
    { bucket: 'preview:h', window: hourKey(), limit: PREVIEW_HOUR_LIMIT, ttl: 4200 },
    { bucket: 'preview:d', window: dayKey(), limit: PREVIEW_HOUR_LIMIT * 10, ttl: 172800 },
  ]);
  if (hit) {
    return json({ ok: false, error: 'rate_limited', message: '预览请求过于频繁，请稍后再试' }, cors, 429);
  }

  const parsed = parseDelivery(body);
  if (parsed.error) return json({ ok: false, error: parsed.error, message: parsed.message }, cors, 400);
  const d = parsed.d;

  /* withData=false：只探测文件是否存在，不把 PDF 转成 base64 传回来 */
  const { names } = await probeAttachments(request, d, false, env);
  const mail = buildDeliveryEmail(d);

  return json({
    ok: true,
    to: d.to,
    subject: buildSubject(d),
    html: mail.html,
    text: mail.text,
    attachments: names,
    zipName: d.zipName || '',
    zipEntries: d.zipEntries || [],
    pending: d.pendingLabels,
    replyTo: d.email || '',
  }, cors, 200);
}
