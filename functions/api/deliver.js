/* ──────────────────────────────────────────────────────────────────────
   简历自动投递 API · Cloudflare Pages Function（路由 /api/deliver）
   ──────────────────────────────────────────────────────────────────────
   用途：resume.html「自动投递」——浏览简历的人（HR / 面试官 / 猎头 / 朋友）
   填表单，把「陈培胜的简历」发到指定邮箱：正文含动态称呼、简历提炼、可选 JD、
   在线简历入口，附件含 PDF 简历 + 可选证书（文件缺失则标注待补充）。

   ⚠️ 方向：收件人 = 访客填写的邮箱，不是站长邮箱。
   站长只可选收一份 BCC 备案（DELIVER_BCC），默认不发。

   为什么不墙：发信调用发生在 Cloudflare 节点（Pages Functions 运行时），
   访问 api.resend.com 无网络障碍；国内访客只访问 shenge-work.pages.dev。
   Resend API Key 只放 Cloudflare 环境变量（RESEND_API_KEY），永不进前端。

   接口：
     POST /api/deliver { to, recipient?, name?, email?, note?, jd?, attachments?,
                         fileNames?, fileOrder?, zip?, verify }
       to           收件人邮箱，逗号 / 分号 / 空格分隔多个（最多 3 个）
       recipient    投递对象称呼（可选，如「张经理」；留空正文显示「您好」）
       name         投递人称呼（可选，如「张 HR / 某某公司」）
       email        投递人邮箱（可选，作为 Reply-To）
       note         附言（可选，最多 500 字）
       jd           岗位 JD（可选，最多 4000 字；无则不渲染 JD 区块）
       attachments  勾选的证书 key 数组（可选：idCard/diploma/degree/other）
       fileNames    {key: '自定义文件名.pdf'}，未给的用默认名
       fileOrder    证书 key 数组，决定附件顺序（未列出的排在后面）
       zip          {enabled:boolean, name?:string}；开启后邮件只附一个 ZIP，
                    内含 PDF 简历 + 已备好的证书，名字缺省按 年份_岗位_应聘材料_姓名.zip
       verify       {token, nonce}，由 GET /api/challenge 签发并本地解出 PoW；
                    缺失 / 过期 / 被篡改 / 换 IP 一律拒绝（防脚本直接刷发信）
     OPTIONS → 204

   环境变量（Cloudflare Pages → Settings → Variables）：
     RESEND_API_KEY   必填，未配置返回 503（前端自动走 mailto 兜底）
     DELIVER_FROM     可选，简历投递专用发件身份（默认 jobs@chenpeisheng.cn）
     RESEND_FROM      可选，仅作兼容兜底，勿再填 hi@ 本人邮箱
     DELIVER_BCC      可选，站长收一份备案（如 hi@chenpeisheng.cn），留空则不发
     ALLOWED_ORIGINS  可选，逗号分隔（默认 github.io / pages.dev / localhost）

   绑定：SITE_KV（与留言墙共用；未绑定时跳过限额，不阻塞发信）

   防护（详见 functions/lib/guard.js）：
     · 来源白名单：只接受本站 / 白名单来源的 Origin
     · 签名凭证：必须先用 /api/challenge 取证并解出 PoW，凭证绑定 IP、15 分钟过期
     · 限流（优先 D1 rate_limits，无 D1 退 KV）：
         每 IP 每小时 3 封、每日 5 封
         全站每小时 12 封、每日 30 封
         每个收件人每日 2 封
     · 请求体上限 64KB（JD 最长 4000 字，正常投递远低于此）
   ────────────────────────────────────────────────────────────────────── */

import {
  CERT_SLOTS, RESUME_PDF_NAME, RESUME_PDF_PATH,
  buildDeliveryEmail, buildSubject, defaultZipName,
} from '../lib/deliver-content.js';
import { createZip } from '../lib/zip.js';
import { readResumePdfFromKv } from '../lib/resume-pdf.js';
import {
  allowedOrigins, corsHeaders, isAllowedOrigin, json,
  certToken, dayKey, hourKey, ipTag, limit, tooLarge, verifyProof,
} from '../lib/guard.js';

/* 预览接口与投递接口共用同一套来源 / CORS 规则，从这里再导出一次 */
export { allowedOrigins, corsHeaders, isAllowedOrigin, json };

const RESEND_URL = 'https://api.resend.com/emails';
const DEFAULT_FROM = '陈培胜 · 简历投递 <jobs@chenpeisheng.cn>';

const MAX_NAME = 24;
const MAX_NOTE = 500;
const MAX_RECIPIENTS = 3;
const TO_DAY_LIMIT = 2;
const IP_HOUR_LIMIT = 3;
const IP_DAY_LIMIT = 5;
const HOUR_LIMIT = 12;
const DAY_LIMIT = 30;
const HOUR_TTL = 4200;
const DAY_TTL = 172800;

const MAX_RECIPIENT = 40;
const MAX_JD = 4000;
const MAX_ATTACH_BYTES = 12 * 1024 * 1024; // 单附件上限，远低于 Resend 40MB/封
const MAX_FILE_NAME = 100;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* 文件名清洗：去控制字符与路径分隔符，强制扩展名，挡住 ../ 之类的穿越尝试 */
function cleanFileName(raw, fallback, ext) {
  let s = String(raw == null ? '' : raw)
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/^\s+|\s+$/g, '')
    .slice(0, MAX_FILE_NAME);
  if (!s) s = fallback;
  if (ext && s.toLowerCase().slice(-ext.length) !== ext) s += ext;
  return s;
}

/* 来源白名单 / CORS / JSON 响应统一由 functions/lib/guard.js 提供 */

/* 多行文本清洗：保留换行（JD / 附言要靠它分段），其余控制字符照旧剔除 */
function cleanMultiline(s, max) {
  return String(s == null ? '' : s)
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+|\s+$/g, '')
    .slice(0, max);
}

function clean(s, max) {
  return String(s == null ? '' : s)
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/^\s+|\s+$/g, '')
    .slice(0, max);
}


/* 解析收件人：支持逗号 / 分号 / 空格分隔；去重、小写、逐个校验 */
function parseRecipients(raw) {
  const list = String(raw || '')
    .split(/[,;，；\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const uniq = [];
  for (const e of list) if (uniq.indexOf(e) < 0) uniq.push(e);
  if (!uniq.length) return { error: 'empty' };
  if (uniq.length > MAX_RECIPIENTS) return { error: 'too_many' };
  if (uniq.some((e) => e.length > 120 || !EMAIL_RE.test(e))) return { error: 'invalid' };
  return { list: uniq };
}

/* 邮件模板与主题已移至 functions/lib/deliver-content.js（纯函数、可测试） */

/* ArrayBuffer → base64（Workers 无 Buffer，分块避免栈溢出） */
function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

/* 从本站静态资源取一个附件字节；取不到返回 null（不阻塞发信）。
   证书目录受中间件保护，服务端读取时必须带上签名头，否则会被当直连盗取拦掉。 */
async function fetchAttachmentBytes(request, path, env) {
  try {
    const url = new URL(path, request.url);
    const headers = {};
    if (path.indexOf('/assets/resume/certificates/') === 0) {
      const token = await certToken(env, path);
      if (token) headers['X-Cert-Token'] = token;
    }
    const resp = await fetch(url, { headers });
    if (!resp.ok) return null;
    const buf = await resp.arrayBuffer();
    if (!buf.byteLength || buf.byteLength > MAX_ATTACH_BYTES) return null;
    return new Uint8Array(buf);
  } catch (e) {
    return null;
  }
}

/* 解析勾选的证书 key：只认白名单内的、去重；fileOrder 决定顺序，未列出的追加在后 */
function parseCertKeys(raw, order) {
  const picked = [];
  const add = (k) => {
    const key = String(k == null ? '' : k).trim();
    if (key in CERT_SLOTS && picked.indexOf(key) < 0) picked.push(key);
  };
  if (Array.isArray(order)) order.forEach(add);
  if (Array.isArray(raw)) raw.forEach(add);
  return picked;
}

/* 请求体归一化：发信与预览共用，保证预览所见即实际所发 */
export function parseDelivery(body) {
  if (!body || typeof body !== 'object') {
    return { error: 'bad_request', message: '请求体不是合法 JSON' };
  }
  const parsed = parseRecipients(body.to);
  if (parsed.error === 'empty') return { error: 'bad_request', message: '请填写收件人邮箱' };
  if (parsed.error === 'too_many') {
    return { error: 'bad_request', message: '一次最多发给 ' + MAX_RECIPIENTS + ' 个收件人' };
  }
  if (parsed.error === 'invalid') return { error: 'bad_request', message: '收件人邮箱格式不正确' };

  const fileNames = {};
  const rawNames = body.fileNames && typeof body.fileNames === 'object' ? body.fileNames : {};
  for (const key of Object.keys(CERT_SLOTS)) {
    if (Object.prototype.hasOwnProperty.call(rawNames, key)) {
      fileNames[key] = cleanFileName(rawNames[key], CERT_SLOTS[key].filename, '.pdf');
    }
  }
  const zip = body.zip && typeof body.zip === 'object' ? body.zip : {};

  const d = {
    to: parsed.list,
    recipient: clean(body.recipient, MAX_RECIPIENT),
    name: clean(body.name, MAX_NAME),
    email: clean(body.email, 120).toLowerCase(),
    note: cleanMultiline(body.note, MAX_NOTE),
    jd: cleanMultiline(body.jd, MAX_JD),
    certs: parseCertKeys(body.attachments, body.fileOrder),
    fileNames,
    zipEnabled: !!zip.enabled,
    zipName: cleanFileName(zip.name, defaultZipName(clean(body.jd, MAX_JD), ''), '.zip'),
    zipEntries: [],
    attachedLabels: [],
    pendingLabels: [],
  };
  if (d.email && !EMAIL_RE.test(d.email)) {
    return { error: 'bad_request', message: '你的邮箱格式不正确（可留空）' };
  }
  return { d };
}

/* 探测实际会随信附上的文件。withData=false 只取文件名，供预览使用（不转 base64）。
   开启 zip 时把 PDF + 已备好的证书打成一个包，邮件只挂这一个附件。 */
export async function probeAttachments(request, d, withData = true, env) {
  const files = [];
  /* PDF 是固定附件，不在正文「另申请」清单里重复列一次。
     优先取 KV 里的真实版（带手机号）；没上传才回落到仓库的脱敏副本。 */
  const kvPdf = await readResumePdfFromKv(env);
  const pdfBytes = (kvPdf && kvPdf.byteLength <= MAX_ATTACH_BYTES)
    ? kvPdf
    : await fetchAttachmentBytes(request, RESUME_PDF_PATH, env);
  if (pdfBytes) files.push({ name: RESUME_PDF_NAME, bytes: pdfBytes });

  for (const key of d.certs) {
    const slot = CERT_SLOTS[key];
    const bytes = await fetchAttachmentBytes(request, slot.path, env);
    if (bytes) {
      const name = (d.fileNames && d.fileNames[key]) || slot.filename;
      files.push({ name, bytes });
      d.attachedLabels.push(name);
    } else {
      d.pendingLabels.push(slot.label);
    }
  }

  if (d.zipEnabled && files.length) {
    d.zipEntries = files.map((f) => f.name);
    return {
      attachments: [withData
        ? { filename: d.zipName, content: toBase64(createZip(files)) }
        : { filename: d.zipName }],
      names: [d.zipName],
    };
  }
  /* 没有可打包的文件时不要声称附了 ZIP */
  d.zipName = '';
  return {
    attachments: files.map((f) => withData
      ? { filename: f.name, content: toBase64(f.bytes) }
      : { filename: f.name }),
    names: files.map((f) => f.name),
  };
}

export async function onRequestOptions({ request, env }) {
  const allow = allowedOrigins(env);
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin'), allow) });
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('Origin') || '';
  const allow = allowedOrigins(env);
  if (!isAllowedOrigin(origin, allow)) {
    return json({ ok: false, error: 'origin_not_allowed' }, corsHeaders(origin, allow), 403);
  }
  const cors = corsHeaders(origin, allow);

  /* 请求体上限：先看 Content-Length，别把超大 JSON 读进内存 */
  if (tooLarge(request)) {
    return json({ ok: false, error: 'payload_too_large', message: '提交内容过大，请精简后再试' }, cors, 413);
  }

  /* Resend 未配置：引导前端走 mailto 兜底 */
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    return json({ ok: false, error: 'resend_not_configured', message: '自动发信尚未配置（缺 RESEND_API_KEY），可用邮件客户端发送' }, cors, 503);
  }

  let body = {};
  try { body = await request.json(); } catch (e) { body = null; }
  if (!body || typeof body !== 'object') {
    return json({ ok: false, error: 'bad_request', message: '请求体不是合法 JSON' }, cors, 400);
  }

  /* 凭证校验：必须是本站在 15 分钟内签发、绑定当前 IP 且解出 PoW 的凭证 */
  const proof = await verifyProof(env, request, body.verify, 'deliver');
  if (!proof.ok) {
    if (proof.error === 'server_misconfigured') {
      return json({ ok: false, error: proof.error, message: '服务端签名密钥未配置，已拒绝投递' }, cors, 503);
    }
    return json({
      ok: false,
      error: proof.error,
      message: proof.error === 'verification_expired'
        ? '验证已过期，请重新点击投递'
        : '验证未通过，请刷新页面后重试',
    }, cors, 403);
  }

  const parsed = parseDelivery(body);
  if (parsed.error) return json({ ok: false, error: parsed.error, message: parsed.message }, cors, 400);
  const d = parsed.d;

  /* 限流：收件人 / IP（小时 + 日）/ 全站（小时 + 日），任一超限即拒 */
  const iph = await ipTag(request, env, 12);
  const hit = await limit(env, [].concat(
    d.to.map((addr) => ({ bucket: 'deliver:to:' + addr, window: dayKey(), limit: TO_DAY_LIMIT, ttl: DAY_TTL })),
    [
      { bucket: 'deliver:ip:h:' + iph, window: hourKey(), limit: IP_HOUR_LIMIT, ttl: HOUR_TTL },
      { bucket: 'deliver:ip:d:' + iph, window: dayKey(), limit: IP_DAY_LIMIT, ttl: DAY_TTL },
      { bucket: 'deliver:h', window: hourKey(), limit: HOUR_LIMIT, ttl: HOUR_TTL },
      { bucket: 'deliver:d', window: dayKey(), limit: DAY_LIMIT, ttl: DAY_TTL },
    ],
  ));
  if (hit) {
    let message = '今日转发已达上限，请明日再试或直接邮件联系';
    if (hit.bucket.indexOf('deliver:to:') === 0) message = '该邮箱今天已收到多封同样邮件，换个邮箱或明天再试';
    else if (hit.bucket.indexOf('deliver:ip:') === 0) message = '你今天已转发多次，请直接邮件联系';
    return json({ ok: false, error: 'rate_limited', message }, cors, 429);
  }

  /* 附件：PDF 简历始终附上；勾选的证书文件缺失时标注「待补充」，不阻塞发信 */
  const { attachments } = await probeAttachments(request, d, true, env);

  const mail = buildDeliveryEmail(d);
  const payload = {
    from: env.DELIVER_FROM || DEFAULT_FROM,
    to: d.to,
    subject: buildSubject(d),
    html: mail.html,
    text: mail.text,
  };
  if (attachments.length) payload.attachments = attachments;
  if (d.email) payload.reply_to = d.email;
  if (env.DELIVER_BCC) payload.bcc = [String(env.DELIVER_BCC).trim()];

  let resp;
  try {
    resp = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return json({ ok: false, error: 'resend_network', message: '发信请求失败（网络异常）' }, cors, 502);
  }

  if (resp.status >= 400) {
    let detail = '';
    try { detail = (await resp.text()).slice(0, 200); } catch (e) {}
    /* 403/422 常见于「未验证域名 / 收件人不在测试白名单」——前端据此切 mailto */
    const restricted = resp.status === 403 || resp.status === 422;
    return json({
      ok: false,
      error: restricted ? 'recipient_not_verified' : 'resend_error',
      status: resp.status,
      message: restricted
        ? '自动发信仅支持已验证域名，先用邮件客户端发送'
        : 'Resend 返回错误' + (detail ? '：' + detail : ''),
    }, cors, 502);
  }

  let id = '';
  try { id = (await resp.json()).id || ''; } catch (e) {}

  return json({ ok: true, id: id, to: d.to }, cors, 201);
}