/* 自动投递接口回归：动态称呼 / JD 有无 / PDF+证书附件 / 转义 / 限额
   mock Resend 与本站静态资源，不真发邮件、不依赖磁盘上的 PDF。 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { onRequestPost, onRequestOptions } from '../functions/api/deliver.js';
import { issueProof } from '../functions/lib/guard.js';
import { onRequestPost as previewPost, onRequestOptions as previewOpt } from '../functions/api/deliver-preview.js';
import {
  buildDeliveryEmail, buildSubject, greetingOf, resumeDigest,
  defaultZipName, roleFromJd, CERT_SLOTS, RESUME_PDF_NAME,
} from '../functions/lib/deliver-content.js';

const ORIGIN = 'http://127.0.0.1:8877';
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]); // %PDF-1.7

function envOf(extra = {}) {
  return Object.assign({
    DELIVER_CHALLENGE_SECRET: 'test-deliver-secret',
    RESEND_API_KEY: 're_test_key',
    RESEND_FROM: 'Portfolio Resume <onboarding@resend.dev>',
    ALLOWED_ORIGINS: ORIGIN,
    SITE_KV: null,
  }, extra);
}

/* 捕获 Resend 请求；站点静态资源按路径返回假 PDF / 404 */
function mockNet(availablePaths = ['/assets/resume/chen-peisheng-resume-2026.pdf']) {
  const calls = { resend: null };
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('api.resend.com')) {
      calls.resend = { url: u, opts, body: JSON.parse(opts.body) };
      return new Response(JSON.stringify({ id: 'msg_test' }), { status: 200 });
    }
    const path = new URL(u).pathname;
    if (availablePaths.includes(path)) {
      return new Response(PDF_BYTES, { status: 200 });
    }
    return new Response('not found', { status: 404 });
  };
  return { calls, restore: () => { globalThis.fetch = orig; } };
}

/* 投递接口要求凭证：测试里按同一算法现取现解，模拟真实页面行为 */
async function proofOf(env) {
  const p = await issueProof(env, new Request(ORIGIN + '/api/challenge', { headers: { Origin: ORIGIN } }), 'deliver');
  let nonce = '';
  if (p.difficulty > 0) {
    const prefix = '0'.repeat(p.difficulty);
    for (let i = 0; i < 500000; i++) {
      const n = i.toString(36);
      if (createHash('sha256').update(p.token + ':' + n).digest('hex').startsWith(prefix)) { nonce = n; break; }
    }
  }
  return { token: p.token, nonce };
}
async function withProof(body, env) {
  if (body && Object.prototype.hasOwnProperty.call(body, 'verify')) return body;
  return Object.assign({}, body, { verify: await proofOf(env) });
}

async function post(body, env = envOf(), headers = {}) {
  const payload = await withProof(body, env);
  return onRequestPost({
    env,
    request: new Request(ORIGIN + '/api/deliver', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json', Origin: ORIGIN }, headers),
      body: JSON.stringify(payload),
    }),
  });
}

const BASE = { to: 'hr@example.com' };

/* ── 纯内容函数 ────────────────────────────────────────────────── */

test('称呼：填写则「某某，您好」，留空则泛化「您好」', () => {
  assert.equal(greetingOf(''), '您好');
  assert.equal(greetingOf('   '), '您好');
  assert.equal(greetingOf('张经理'), '张经理，您好');
});

test('主题写法与真人投递一致，不带「自动」痕迹', () => {
  assert.equal(buildSubject({ recipient: '' }), '应聘 AI Agent 工程师 · 陈培胜');
  assert.match(buildSubject({ recipient: '李 HR' }), /致 李 HR/);
  assert.ok(!buildSubject({ recipient: '李 HR' }).includes('自动'));
});

test('简历提炼信息来自数据源，含姓名/能力/项目', () => {
  const d = resumeDigest();
  assert.equal(d.name, '陈培胜');
  assert.ok(d.role.includes('AI Agent'));
  assert.ok(d.skills.length >= 3);
  assert.ok(d.projects.length >= 1);
});

test('JD 为空不渲染区块；有 JD 显示 details 折叠且标签被剥离', () => {
  const base = { to: [], recipient: '', note: '', jd: '', attachedLabels: [], pendingLabels: [] };
  assert.ok(!buildDeliveryEmail(base).html.includes('TARGET JD'));
  const withJd = buildDeliveryEmail({ ...base, jd: '<script>alert(1)</script>\n岗位要求：5 年' });
  assert.match(withJd.html, /TARGET JD/);
  assert.match(withJd.html, /<details>/);
  assert.ok(!withJd.html.includes('<script>')); // 输入标签被 plain() 剥离，剩纯文本
  assert.match(withJd.html, /alert\(1\)<br>岗位要求：5 年/); // 换行保留，供邮件里分段显示
});

test('正文始终列附件清单，标注待补充项', () => {
  const m = buildDeliveryEmail({
    to: [], recipient: '', note: '', jd: '',
    attachedLabels: ['学历证书'], pendingLabels: ['学位证书'],
  });
  assert.match(m.html, /附件清单/);
  assert.match(m.html, new RegExp(RESUME_PDF_NAME.replace('-', '\\-')));
  assert.match(m.html, /学历证书/);
  assert.match(m.html, /学位证书.*待补充/);
  assert.match(m.text, /附件：/);
});

test('XSS 注入：投递人/称呼/附言都被转义', () => {
  const m = buildDeliveryEmail({
    to: ['a@b.com'],
    recipient: '<b>张</b>',
    name: '<img src=x onerror=alert(1)>',
    note: '<script>bad()</script>',
    jd: '', attachedLabels: [], pendingLabels: [],
  });
  assert.ok(!m.html.includes('<script>'));
  assert.ok(!m.html.includes('onerror=alert'));
  assert.match(m.html, /张，您好/); // 标签被剥离，只留纯文本「张」
});

/* ── 接口端到端 ────────────────────────────────────────────────── */

test('OPTIONS 返回 CORS', async () => {
  const res = await onRequestOptions({ request: new Request(ORIGIN + '/api/deliver', {
    method: 'OPTIONS', headers: { Origin: ORIGIN },
  }), env: envOf() });
  assert.equal(res.status, 204);
  assert.match(res.headers.get('Access-Control-Allow-Methods'), /POST/);
});

test('来源不在白名单 → 403', async () => {
  const res = await post(BASE, envOf(), { Origin: 'https://evil.example' });
  assert.equal(res.status, 403);
});

test('空收件人 / 非法邮箱 → 400', async () => {
  assert.equal((await post({ to: '' })).status, 400);
  assert.equal((await post({ to: 'not-an-email' })).status, 400);
});

test('未配置 Resend → 503', async () => {
  const res = await post(BASE, envOf({ RESEND_API_KEY: '' }));
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, 'resend_not_configured');
});

test('成功发送：正文含动态称呼、PDF 附件、JD、在线简历入口', async () => {
  const net = mockNet();
  try {
    const res = await post({
      ...BASE, recipient: '王经理', jd: '岗位：Agent 工程师', note: '请查收', attachments: ['idCard'],
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.deepEqual(body.to, ['hr@example.com']);

    const sent = net.calls.resend.body;
    assert.match(sent.subject, /致 王经理/);
    assert.match(sent.html, /王经理，您好/);
    assert.match(sent.html, /TARGET JD/);
    assert.match(sent.html, /resume\.html/);
    assert.match(sent.html, /附件清单/);
    assert.ok(Array.isArray(sent.attachments) && sent.attachments.length === 1);
    assert.equal(sent.attachments[0].filename, RESUME_PDF_NAME);
    assert.equal(Buffer.from(sent.attachments[0].content, 'base64').toString(), '%PDF-1.7');
    /* 身份证文件不存在 → 正文标注待补充，不阻塞发信 */
    assert.match(sent.html, /身份证复印件.*待补充/);
    assert.equal(sent.text.includes('岗位：Agent 工程师'), true);
  } finally {
    net.restore();
  }
});

test('勾选多个证书：有的附上、缺的标注；未勾选不渲染', async () => {
  const dipPath = CERT_SLOTS.diploma.path;
  const net = mockNet(['/assets/resume/chen-peisheng-resume-2026.pdf', dipPath]);
  try {
    const res = await post({ ...BASE, attachments: ['diploma', 'degree', 'other'] });
    assert.equal(res.status, 201);
    const sent = net.calls.resend.body;
    assert.equal(sent.attachments.length, 2); // PDF + 学历证书
    assert.deepEqual(sent.attachments.map((a) => a.filename), [RESUME_PDF_NAME, CERT_SLOTS.diploma.filename]);
    assert.match(sent.html, /学历证书/);
    assert.match(sent.html, /学位证书.*待补充/);
    assert.match(sent.html, /其他相关资质证书.*待补充/);
  } finally {
    net.restore();
  }
});

test('无效证书 key 被忽略（只认白名单）', async () => {
  const net = mockNet();
  try {
    const res = await post({ ...BASE, attachments: ['../../etc/passwd', 'idCard', 123] });
    assert.equal(res.status, 201);
    const sent = net.calls.resend.body;
    assert.equal(sent.attachments.length, 1); // 只有 PDF，非法 key 全丢弃
  } finally {
    net.restore();
  }
});

test('JD 留空不渲染区块；称呼留空显示「您好」', async () => {
  const net = mockNet();
  try {
    const res = await post(BASE);
    assert.equal(res.status, 201);
    const sent = net.calls.resend.body;
    assert.ok(!sent.html.includes('TARGET JD'));
    assert.match(sent.html, /您好/);
    assert.ok(!sent.subject.includes('致 '));
  } finally {
    net.restore();
  }
});

test('Resend 403/422 → recipient_not_verified（前端走 mailto 兜底）', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes('api.resend.com')) return new Response('{"message":"not verified"}', { status: 403 });
    return new Response(PDF_BYTES, { status: 200 });
  };
  try {
    const res = await post(BASE);
    assert.equal(res.status, 502);
    assert.equal((await res.json()).error, 'recipient_not_verified');
  } finally {
    globalThis.fetch = orig;
  }
});

/* ── 发送前真实预览 ────────────────────────────────────────────── */

async function preview(body, env = envOf(), headers = {}) {
  const payload = await withProof(body, env);
  return previewPost({
    env,
    request: new Request(ORIGIN + '/api/deliver-preview', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json', Origin: ORIGIN }, headers),
      body: JSON.stringify(payload),
    }),
  });
}

test('预览返回真实正文与附件清单，且不调用 Resend、不消耗限额', async () => {
  const net = mockNet();
  const kvGet = [];
  const env = envOf({ SITE_KV: {
    async get(k) { kvGet.push(k); return null; },
    async put() {},
  } });
  try {
    const res = await preview({
      ...BASE, recipient: '王经理', jd: '岗位名称：Agent 工程师', attachments: ['idCard'],
    }, env);
    assert.equal(res.status, 200);
    const d = await res.json();
    assert.equal(d.ok, true);
    assert.deepEqual(d.to, ['hr@example.com']);
    assert.match(d.subject, /致 王经理/);
    assert.match(d.html, /王经理，您好/);
    assert.match(d.html, /TARGET JD/);
    assert.match(d.html, /身份证复印件.*待补充/);
    assert.deepEqual(d.attachments, [RESUME_PDF_NAME]);
    assert.deepEqual(d.pending, ['身份证复印件']);
    assert.equal(net.calls.resend, null);
    assert.equal(kvGet.filter((k) => k.indexOf('deliver:') === 0).length, 0, '预览不得消耗发信额度');
  } finally {
    net.restore();
  }
});

test('预览内容与实发邮件逐字一致', async () => {
  const net = mockNet();
  try {
    const payload = { ...BASE, recipient: '李 HR', jd: '岗位要求：5 年', note: '请查收' };
    const pv = await (await preview(payload)).json();
    assert.equal((await post(payload)).status, 201);
    const sent = net.calls.resend.body;
    assert.equal(pv.subject, sent.subject);
    assert.equal(pv.html, sent.html);
    assert.equal(pv.text, sent.text);
    assert.deepEqual(pv.attachments, sent.attachments.map((a) => a.filename));
  } finally {
    net.restore();
  }
});

test('预览接口：未配置 Resend 仍可预览；来源白名单与 OPTIONS', async () => {
  const net = mockNet();
  try {
    assert.equal((await preview(BASE, envOf({ RESEND_API_KEY: '' }))).status, 200);
    assert.equal((await preview(BASE, envOf(), { Origin: 'https://evil.example' })).status, 403);
    const res = await previewOpt({
      env: envOf(),
      request: new Request(ORIGIN + '/api/deliver-preview', { method: 'OPTIONS', headers: { Origin: ORIGIN } }),
    });
    assert.equal(res.status, 204);
    assert.match(res.headers.get('Access-Control-Allow-Methods'), /POST/);
  } finally {
    net.restore();
  }
});

/* ── 附件重命名 / 排序 / ZIP 打包 ──────────────────────────────── */

test('压缩包默认命名：有岗位带岗位段，无 JD 则省略；岗位名从 JD 提取', () => {
  const withRole = defaultZipName('岗位名称：AI Agent 工程师\n岗位职责：开发', '陈培胜');
  assert.match(withRole, /^\d{4}_AI Agent 工程师_应聘材料_陈培胜\.zip$/);
  assert.match(defaultZipName('', '陈培胜'), /^\d{4}_应聘材料_陈培胜\.zip$/);
  assert.equal(roleFromJd('岗位职责：写代码'), '');
  assert.equal(roleFromJd('岗位：后端工程师'), '后端工程师');
});

test('自定义文件名 + fileOrder 决定实发附件的名字与顺序', async () => {
  const dip = CERT_SLOTS.diploma.path;
  const deg = CERT_SLOTS.degree.path;
  const net = mockNet(['/assets/resume/chen-peisheng-resume-2026.pdf', dip, deg]);
  try {
    const res = await post({
      ...BASE,
      attachments: ['degree', 'diploma'],
      fileOrder: ['diploma', 'degree'],
      fileNames: {
        diploma: '学历证书_陈培胜.pdf',
        degree: '学位证件\\说明:2026.pdf', // 特殊字符会被清洗成下划线
      },
    });
    assert.equal(res.status, 201);
    const sent = net.calls.resend.body;
    assert.deepEqual(sent.attachments.map((a) => a.filename), [
      RESUME_PDF_NAME,
      '学历证书_陈培胜.pdf',
      '学位证件_说明_2026.pdf',
    ]);
    assert.match(sent.html, /学历证书_陈培胜\.pdf/);
    assert.match(sent.html, /学位证件_说明_2026\.pdf/);
  } finally {
    net.restore();
  }
});

test('打包开启：只附一个 ZIP，内含按序文件，正文列出内含清单', async () => {
  const id = CERT_SLOTS.idCard.path;
  const dip = CERT_SLOTS.diploma.path;
  const net = mockNet(['/assets/resume/chen-peisheng-resume-2026.pdf', id, dip]);
  const zipName = '2026_AI Agent工程师_应聘材料_陈培胜.zip';
  try {
    const res = await post({
      ...BASE,
      attachments: ['idCard', 'diploma'],
      fileOrder: ['diploma', 'idCard'],
      fileNames: { diploma: '学历证书_陈培胜.pdf' },
      zip: { enabled: true, name: zipName },
    });
    assert.equal(res.status, 201);
    const sent = net.calls.resend.body;
    assert.equal(sent.attachments.length, 1);
    assert.equal(sent.attachments[0].filename, zipName);
    assert.match(sent.html, new RegExp(zipName.replace(/[.[\]()]/g, '\\$&') + '（内含：'));
    assert.match(sent.text, /附件：2026_AI Agent工程师/);

    /* 用系统 zipfile 独立验证二进制：名字、顺序、内容都能被标准工具读出 */
    const r = spawnSync('python3', ['-c',
      'import sys,zipfile,io;z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()));' +
      'print("|".join(z.namelist()));print(z.read("学历证书_陈培胜.pdf").decode())',
    ], { input: Buffer.from(sent.attachments[0].content, 'base64'), encoding: 'utf8' });
    if (r.status === 0) {
      const lines = r.stdout.trim().split('\n');
      assert.equal(lines[0], [RESUME_PDF_NAME, '学历证书_陈培胜.pdf', CERT_SLOTS.idCard.filename].join('|'));
      assert.equal(lines[1], '%PDF-1.7');
    }
  } finally {
    net.restore();
  }
});

test('ZIP 场景：预览与实发的主题/正文/附件名逐字一致', async () => {
  const net = mockNet(['/assets/resume/chen-peisheng-resume-2026.pdf', CERT_SLOTS.idCard.path]);
  try {
    const payload = {
      ...BASE, recipient: '王经理',
      attachments: ['idCard'],
      fileNames: { idCard: '身份证复印件_陈培胜.pdf' },
      zip: { enabled: true, name: '测试包.zip' },
    };
    const pv = await (await preview(payload)).json();
    assert.equal((await post(payload)).status, 201);
    const sent = net.calls.resend.body;
    assert.equal(pv.subject, sent.subject);
    assert.equal(pv.html, sent.html);
    assert.equal(pv.text, sent.text);
    assert.deepEqual(pv.attachments, sent.attachments.map((a) => a.filename));
    assert.deepEqual(pv.attachments, ['测试包.zip']);
    assert.deepEqual(pv.zipEntries, [RESUME_PDF_NAME, '身份证复印件_陈培胜.pdf']);
  } finally {
    net.restore();
  }
});

test('打包但取不到任何文件时，不虚报 ZIP 附件', async () => {
  const net = mockNet([]);
  try {
    const res = await post({ ...BASE, zip: { enabled: true, name: '不该出现.zip' } });
    assert.equal(res.status, 201);
    const sent = net.calls.resend.body;
    assert.equal(sent.attachments, undefined);
    assert.ok(!sent.html.includes('不该出现.zip'));
  } finally {
    net.restore();
  }
});

test('fileNames 里的未勾选项不会被误附上', async () => {
  const net = mockNet(['/assets/resume/chen-peisheng-resume-2026.pdf', CERT_SLOTS.idCard.path]);
  try {
    const res = await post({ ...BASE, attachments: [], fileNames: { idCard: '不要附上.pdf' } });
    assert.equal(res.status, 201);
    assert.deepEqual(net.calls.resend.body.attachments.map((a) => a.filename), [RESUME_PDF_NAME]);
  } finally {
    net.restore();
  }
});

/* ── 防刷：凭证与请求体 ─────────────────────────────────────────── */

test('不带凭证直接 POST → 403 verification_required（脚本刷不进）', async () => {
  const net = mockNet();
  try {
    const res = await post({ ...BASE, verify: null }, envOf(), {});
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error, 'verification_required');
    assert.equal(net.calls.resend, null, '未通过验证绝不能触达 Resend');
  } finally {
    net.restore();
  }
});

test('伪造 / 篡改凭证 → 403 verification_failed', async () => {
  const net = mockNet();
  try {
    const p = await proofOf(envOf());
    const parts = p.token.split('.');
    const forged = await post({
      ...BASE,
      verify: { token: parts.slice(0, 4).join('.') + '.00000000000000000000000000000000', nonce: p.nonce },
    });
    assert.equal(forged.status, 403);
    assert.equal((await forged.json()).error, 'verification_failed');

    const noPow = await post({ ...BASE, verify: { token: p.token, nonce: '' } });
    assert.equal(noPow.status, 403);
    assert.equal(net.calls.resend, null);
  } finally {
    net.restore();
  }
});

test('预览同样要凭证，缺了直接 403', async () => {
  const net = mockNet();
  try {
    const res = await preview({ ...BASE, verify: null });
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error, 'verification_required');
  } finally {
    net.restore();
  }
});

test('请求体超过 64KB → 413', async () => {
  const res = await onRequestPost({
    env: envOf(),
    request: new Request(ORIGIN + '/api/deliver', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'Content-Length': '70000' },
      body: JSON.stringify(BASE),
    }),
  });
  assert.equal(res.status, 413);
  assert.equal((await res.json()).error, 'payload_too_large');
});

test('邮件正文与纯文本都不出现「自动投递 / AUTO DELIVERY」', async () => {
  const net = mockNet();
  try {
    const res = await post({ ...BASE, recipient: '王经理', jd: '岗位名称：Agent 工程师', note: '盼复' });
    assert.equal(res.status, 201);
    const sent = net.calls.resend.body;
    for (const field of [sent.subject, sent.html, sent.text]) {
      assert.ok(!/自动投递/.test(field), '不能出现「自动投递」');
      assert.ok(!/AUTO\s*DELIVERY/i.test(field), '不能出现 AUTO DELIVERY');
    }
    assert.match(sent.subject, /^应聘 /);
    assert.match(sent.html, /APPLICATION/);
    assert.match(sent.html, /感谢您抽出时间阅读我的简历/);
    assert.match(sent.html, /求职申请/);
  } finally {
    net.restore();
  }
});

test('JD 与附言的换行穿过接口层仍保留（邮件里分段，不被压成一行）', async () => {
  const net = mockNet();
  try {
    const res = await post({
      ...BASE,
      jd: '岗位名称：AI Agent 工程师\n岗位职责：\n1. 负责 Agent 应用开发',
      note: '第一行\n第二行',
    });
    assert.equal(res.status, 201);
    const html = net.calls.resend.body.html;
    assert.match(html, /岗位名称：AI Agent 工程师<br>岗位职责：<br>1\. 负责 Agent 应用开发/);
    assert.match(html, /第一行<br>第二行/);
    assert.match(net.calls.resend.body.text, /岗位名称：AI Agent 工程师\n岗位职责：/);
  } finally {
    net.restore();
  }
});
