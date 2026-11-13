/* ──────────────────────────────────────────────────────────────────────
   简历转发 API · Cloudflare Pages Function（路由 /api/deliver）
   ──────────────────────────────────────────────────────────────────────
   用途：resume.html「转发到邮箱」——浏览简历的人（HR / 面试官 / 猎头 / 朋友）
   不用下载简历，填收件人邮箱就能把「陈培胜的在线简历」发到该收件人
   （自己、同事或指定的人），邮件正文含简历直达链接与附言。

   ⚠️ 方向：收件人 = 访客填写的邮箱，不是站长邮箱。
   站长只可选收一份 BCC 备案（DELIVER_BCC），默认不发。

   为什么不墙：发信调用发生在 Cloudflare 节点（Pages Functions 运行时），
   访问 api.resend.com 无网络障碍；国内访客只访问 shenge-work.pages.dev。
   Resend API Key 只放 Cloudflare 环境变量（RESEND_API_KEY），永不进前端。

   接口：
     POST /api/deliver { to, name?, email?, note? }  → { ok, id, to: [收件人] }
       to      收件人邮箱，可用逗号 / 分号 / 空格分隔多个（最多 3 个）
       name    发件人称呼（可选，如「张 HR / 某某公司」）
       email   发件人邮箱（可选，作为 Reply-To，收件人可直接回复）
       note    附言（可选，最多 500 字）
     OPTIONS → 204

   环境变量（Cloudflare Pages → Settings → Variables）：
     RESEND_API_KEY   必填，未配置返回 503（前端自动走 mailto 兜底）
     RESEND_FROM      可选，默认 'Portfolio Resume <onboarding@resend.dev>'。
                      ⚠️ Resend 未验证域名时，onboarding@resend.dev 只能发给
                      Resend 账号注册邮箱；要发给任意收件人，必须先在 Resend
                      验证自有域名，再把这里改成 '陈培胜简历 <resume@你的域名>'
     DELIVER_BCC      可选，站长收一份备案（如 shenge.work@gmail.com），留空则不发
     ALLOWED_ORIGINS  可选，逗号分隔（默认 github.io / pages.dev / localhost）

   绑定：SITE_KV（与留言墙共用；未绑定时跳过限额，不阻塞发信）

   限额（KV，防被当成发垃圾邮件的跳板）：
     每个收件人每日 2 封（deliver:to:<邮箱>:<yyyymmdd>）
     每个 IP 每日 5 封（deliver:ip:<ip>:<yyyymmdd>）
     全站每日 30 封（deliver:day:<yyyymmdd>）
   ────────────────────────────────────────────────────────────────────── */

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };

const RESEND_URL = 'https://api.resend.com/emails';
const DEFAULT_FROM = 'Portfolio Resume <onboarding@resend.dev>';

const MAX_NAME = 24;
const MAX_NOTE = 500;
const MAX_RECIPIENTS = 3;
const TO_DAY_LIMIT = 2;
const IP_DAY_LIMIT = 5;
const DAY_LIMIT = 30;
const DAY_TTL = 172800;

const DEFAULT_ORIGINS = [
  'https://shenge-work.github.io',
  'https://shenge-work.pages.dev',
  '*.shenge-work.pages.dev',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
];

const RESUME_PRIMARY = 'https://shenge-work.github.io/resume.html';
const RESUME_BACKUP = 'https://shenge-work.pages.dev/resume.html';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || DEFAULT_ORIGINS.join(','))
    .split(',').map((s) => s.trim()).filter(Boolean);
}

function isAllowedOrigin(origin, allow) {
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

function corsHeaders(origin, allow) {
  const acao = isAllowedOrigin(origin, allow) ? String(origin).trim() : '';
  const h = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (acao) h['Access-Control-Allow-Origin'] = acao;
  return h;
}

function json(body, extra, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign({}, JSON_HEADERS, extra || {}),
  });
}

function clean(s, max) {
  return String(s == null ? '' : s)
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/^\s+|\s+$/g, '')
    .slice(0, max);
}

/* HTML 转义（邮件模板用） */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function ipOf(request) {
  const xff = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || '';
  return (xff.split(',')[0] || 'unknown').trim();
}

async function bump(kv, key, ttl) {
  if (!kv) return null;
  try {
    const cur = Number(await kv.get(key)) || 0;
    const next = cur + 1;
    await kv.put(key, String(next), { expirationTtl: ttl });
    return next;
  } catch (e) {
    return null;
  }
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

/* ── 邮件模板：Neo-brutalism 纸感卡片（table 布局，邮件客户端兼容） ── */
function buildEmail(d) {
  const time = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const row = (k, v) =>
    '<tr>' +
    '<td style="padding:6px 14px 6px 0;font:bold 13px/1.5 \'Courier New\',monospace;color:#4A463F;white-space:nowrap;vertical-align:top;">' + k + '</td>' +
    '<td style="padding:6px 0;font:14px/1.5 \'PingFang SC\',\'Microsoft YaHei\',sans-serif;color:#141311;vertical-align:top;">' + v + '</td>' +
    '</tr>';

  const hasNote = d.note && d.note.length;
  const noteRow = hasNote
    ? '<tr><td colspan="2" style="padding:14px 16px;background:#FFFCF4;border:3px solid #141311;font:14px/1.8 \'PingFang SC\',\'Microsoft YaHei\',sans-serif;color:#141311;">' +
      '<div style="font:bold 11px/1 \'Courier New\',monospace;letter-spacing:.12em;color:#FF5A1E;margin-bottom:10px;">NOTE / 附言</div>' +
      esc(d.note).replace(/\n/g, '<br>') + '</td></tr>'
    : '';

  const senderRows =
    (d.name ? row('FROM / 转发人', esc(d.name)) : '') +
    (d.email ? row('REPLY / 回复地址', '<a href="mailto:' + esc(d.email) + '" style="color:#2B4BE0;text-decoration:none;font-weight:bold;">' + esc(d.email) + '</a>') : '') +
    row('TO / 收件人', esc(d.to.join('、')));

  return '' +
'<!DOCTYPE html><html><body style="margin:0;padding:0;background:#F3EEE2;">' +
'<div style="display:none;max-height:0;overflow:hidden;">陈培胜的在线简历：AI Agent 工程师，5 年经验，点击即可查看。</div>' +
'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3EEE2;padding:28px 12px;"><tr><td align="center">' +
'<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">' +

/* 头条 */
'<tr><td style="background:#141311;color:#FFFCF4;padding:14px 18px;border:4px solid #141311;">' +
'<span style="font:bold 13px/1 \'Courier New\',monospace;letter-spacing:.18em;color:#FF5A1E;">ONLINE&nbsp;RESUME</span>' +
'<div style="font:900 22px/1.2 \'PingFang SC\',\'Microsoft YaHei\',sans-serif;margin-top:6px;color:#FFFCF4;">陈培胜 · AI Agent 工程师</div>' +
'<div style="font:13px/1.6 \'PingFang SC\',\'Microsoft YaHei\',sans-serif;color:#CFC7B6;margin-top:4px;">5 年研发 · Agent 开发 / AI 工程化 / 企业 AI 基建</div>' +
'</td></tr>' +

/* 说明 */
'<tr><td style="border:4px solid #141311;border-top:none;background:#FFFCF4;padding:18px 22px 10px;">' +
'<p style="margin:0 0 12px;font:14px/1.8 \'PingFang SC\',\'Microsoft YaHei\',sans-serif;color:#141311;">这是一个在线简历的转发邮件。无需下载附件，点下面的按钮即可直接查看完整简历（含项目经历、技能与联系方式）。</p>' +
'<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + senderRows + '</table></td></tr>' +

/* 附言 */
(noteRow ? '<tr><td style="padding:12px 0 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + noteRow + '</table></td></tr>' : '') +

/* 简历入口 */
'<tr><td style="border:4px solid #141311;background:#FF5A1E;padding:18px 22px;">' +
'<div style="font:bold 11px/1 \'Courier New\',monospace;letter-spacing:.12em;color:#FFFCF4;margin-bottom:10px;">RESUME&nbsp;/&nbsp;简历入口（点击直达）</div>' +
'<a href="' + RESUME_PRIMARY + '" style="display:inline-block;background:#141311;color:#FFFCF4;text-decoration:none;font:bold 15px/1 \'PingFang SC\',\'Microsoft YaHei\',sans-serif;padding:12px 22px;border:3px solid #141311;">查看在线简历 ▶</a>' +
'&nbsp;&nbsp;<a href="' + RESUME_BACKUP + '" style="display:inline-block;background:#FFFCF4;color:#141311;text-decoration:none;font:bold 13px/1 \'PingFang SC\',\'Microsoft YaHei\',sans-serif;padding:12px 16px;border:3px solid #141311;">备用线路</a>' +
'<div style="font:12px/1.6 \'Courier New\',monospace;color:#FFFCF4;margin-top:12px;word-break:break-all;">' + RESUME_PRIMARY + '</div>' +
'</td></tr>' +

/* 提示 */
'<tr><td style="border:4px solid #141311;border-top:none;background:#FFFCF4;padding:12px 22px;">' +
(d.email
  ? '<span style="font:bold 12px/1.6 \'PingFang SC\',\'Microsoft YaHei\',sans-serif;color:#141311;">↩&nbsp;直接「回复」本邮件即可联系转发人</span>'
  : '<span style="font:bold 12px/1.6 \'PingFang SC\',\'Microsoft YaHei\',sans-serif;color:#141311;">简历作者邮箱：shenge.work@gmail.com</span>') +
'</td></tr>' +

/* 脚注 */
'<tr><td style="padding:16px 4px 0;text-align:center;">' +
'<span style="font:11px/1.6 \'Courier New\',monospace;color:#4A463F;">来自 shenge-work.github.io 在线简历 · ' + time + '</span>' +
'</td></tr>' +

'</table></td></tr></table></body></html>';
}

function buildSubject(d) {
  const by = d.name ? '（' + d.name + ' 转发）' : '';
  return '陈培胜 · AI Agent 工程师 · 在线简历' + by;
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

  const parsed = parseRecipients(body.to);
  if (parsed.error === 'empty') {
    return json({ ok: false, error: 'bad_request', message: '请填写收件人邮箱' }, cors, 400);
  }
  if (parsed.error === 'too_many') {
    return json({ ok: false, error: 'bad_request', message: '一次最多发给 ' + MAX_RECIPIENTS + ' 个收件人' }, cors, 400);
  }
  if (parsed.error === 'invalid') {
    return json({ ok: false, error: 'bad_request', message: '收件人邮箱格式不正确' }, cors, 400);
  }

  const d = {
    to: parsed.list,
    name: clean(body.name, MAX_NAME),
    email: clean(body.email, 120).toLowerCase(),
    note: clean(body.note, MAX_NOTE),
  };
  if (d.email && !EMAIL_RE.test(d.email)) {
    return json({ ok: false, error: 'bad_request', message: '你的邮箱格式不正确（可留空）' }, cors, 400);
  }

  /* 限额：每个收件人 / 每 IP / 全站（KV 未绑定则跳过，不阻塞发信） */
  const kv = env.SITE_KV;
  const today = new Date().toISOString().slice(0, 10);
  for (const addr of d.to) {
    const cnt = await bump(kv, 'deliver:to:' + addr + ':' + today, DAY_TTL);
    if (cnt != null && cnt > TO_DAY_LIMIT) {
      return json({ ok: false, error: 'rate_limited', message: '该邮箱今天已收到多封同样邮件，换个邮箱或明天再试' }, cors, 429);
    }
  }
  const day = await bump(kv, 'deliver:day:' + today, DAY_TTL);
  if (day != null && day > DAY_LIMIT) {
    return json({ ok: false, error: 'rate_limited', message: '今日转发已达上限，请明日再试或直接邮件联系' }, cors, 429);
  }
  const ipCnt = await bump(kv, 'deliver:ip:' + ipOf(request) + ':' + today, DAY_TTL);
  if (ipCnt != null && ipCnt > IP_DAY_LIMIT) {
    return json({ ok: false, error: 'rate_limited', message: '你今天已转发多次，请直接邮件联系' }, cors, 429);
  }

  const payload = {
    from: env.RESEND_FROM || DEFAULT_FROM,
    to: d.to,
    subject: buildSubject(d),
    html: buildEmail(d),
  };
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