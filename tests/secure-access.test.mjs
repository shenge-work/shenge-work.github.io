/* 加密材料通用能力回归测试
   覆盖：资源白名单 / 审批状态 / 签名链接 TTL 与防篡改 / 私有对象存储读取 /
   申请→审批→实时下发签名链接→代理取流 全链路 / 限流 / 前端静态接线。 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  APPROVAL_TTL_MS, ASSET_URL_TTL_SEC, approvalState, assetSecret,
  isValidResource, issueAssets, parseResource, resourceLabel, resourceTitle,
  signAssetToken, verifyAssetToken,
} from '../functions/lib/secure-access.js';
import { availableMaterials, findMaterial, listMaterials, readAsset } from '../functions/lib/secure-assets.js';
import { onRequestPost as submitPost, onRequestGet as statusGet } from '../functions/api/verify-access.js';
import { onRequestPost as approvePost } from '../functions/api/verify-access-approve.js';
import { onRequestGet as assetGet } from '../functions/api/secure-asset.js';
import { signApproval } from '../functions/lib/verify-access-token.js';

const SCHEMA = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
const ORIGIN = 'http://127.0.0.1:8877';
const DEVICE = 'device-A';
const RESOURCE = 'company-material:comein';
const AID = 'leaving-comein';
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

function liveDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(SCHEMA);
  return {
    prepare(sql) {
      const stmt = sqlite.prepare(sql);
      const make = (params) => ({
        all: async () => ({ results: stmt.all(...params), success: true, meta: {} }),
        first: async () => stmt.all(...params)[0] || null,
        run: async () => ({ success: true, meta: { changes: Number(stmt.run(...params).changes) || 0 } }),
      });
      return Object.assign(make([]), { bind: (...params) => make(params) });
    },
  };
}

function envOf(db = liveDb(), withKv = true) {
  const meta = JSON.stringify({
    id: AID, backend: 'kv', contentType: 'image/jpeg', size: JPEG.length,
    sha256: 'test', uploadedAt: '2026-11-25T00:00:00Z',
  });
  const env = {
    DB: db,
    ALLOWED_ORIGINS: ORIGIN,
    DEVICE_HASH_PEPPER: 'test-pepper',
    VERIFY_ACCESS_SECRET: 'test-approval-secret',
    RESEND_API_KEY: 're_test_key',
    RESEND_FROM: 'Portfolio <onboarding@resend.dev>',
  };
  if (withKv) {
    env.SITE_KV = {
      get: async (key, opts) => {
        if (key === 'secure-asset-meta:' + AID) return meta;
        if (key === 'secure-asset:' + AID) {
          const buf = new ArrayBuffer(JPEG.length);
          new Uint8Array(buf).set(JPEG);
          return buf;
        }
        return null;
      },
    };
  }
  return env;
}

function mockResend(t) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ id: 'em_test' }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  };
  t.after(() => { globalThis.fetch = original; });
  return calls;
}

const BODY = {
  resource: RESOURCE,
  name: '李四', identity: 'hr', org: '某某科技', contact: 'hr@example.com',
  purpose: 'background', reason: '我是某某科技 HR，正在推进录用背调，需要核验离职证明。',
  consent: true, origin: ORIGIN + '/company.html?c=comein',
};

async function submit(env, body = BODY) {
  return submitPost({
    env,
    request: new Request(ORIGIN + '/api/verify-access', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', Origin: ORIGIN,
        'User-Agent': 'Mozilla/5.0 TestBrowser/1.0', 'X-Device-Id': DEVICE,
        Referer: ORIGIN + '/company.html?c=comein',
      },
      body: JSON.stringify(body),
    }),
  });
}

async function status(env, id, device = DEVICE) {
  const res = await statusGet({
    env,
    request: new Request(ORIGIN + '/api/verify-access?id=' + id, {
      headers: { Origin: ORIGIN, 'X-Device-Id': device },
    }),
  });
  return { res, body: await res.json() };
}

/* 提交申请 → 用签名链接批准 → 返回申请 id */
async function approvedRequest(env, t) {
  const calls = mockResend(t);
  const res = await submit(env);
  const d = await res.json();
  assert.equal(d.ok, true);
  assert.match(d.requestId, /^[0-9a-f]{32}$/);
  const mail = JSON.parse(calls[0].init.body);
  assert.match(mail.subject, /【任职佐证材料】/);
  assert.match(mail.text, /申请资源：进门财经 · 任职佐证材料/);
  assert.match(mail.text, /5 分钟失效/);
  const token = await signApproval(d.requestId, env);
  const ok = await approvePost({
    env,
    request: new Request(ORIGIN + '/api/verify-access-approve', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id: d.requestId, exp: String(token.exp), sig: token.sig, decision: 'approve' }),
    }),
  });
  assert.match(await ok.text(), /已批准解锁/);
  return d.requestId;
}

/* ── 资源与注册表 ─────────────────────────────────────────── */

test('资源解析：白名单、旧数据兼容、非法资源拒绝', () => {
  assert.equal(parseResource('company-material:comein'), RESOURCE);
  assert.equal(parseResource('xinhua'), 'school-verify:xinhua');
  assert.equal(parseResource(''), 'school-verify:xinhua');
  assert.equal(parseResource('../../etc/passwd'), 'school-verify:xinhua');
  assert.equal(isValidResource(RESOURCE), true);
  assert.equal(isValidResource('school-verify:xinhua'), true);
  assert.equal(isValidResource('company-material:not-exist'), false);
  assert.equal(isValidResource('company-material:comein;drop'), false);
  assert.equal(resourceLabel(RESOURCE), '任职佐证材料');
  assert.match(resourceTitle(RESOURCE), /进门财经/);
});

test('材料注册表：4 家公司，3 份已归档 + 1 份待补充', () => {
  assert.equal(listMaterials(RESOURCE)[0].id, AID);
  assert.equal(availableMaterials('company-material:chowsang').length, 0);
  assert.equal(availableMaterials(RESOURCE).length, 1);
  assert.equal(findMaterial(RESOURCE, 'leaving-zhishu'), null);  // 不能跨资源取材料
  assert.equal(findMaterial('company-material:zhishu', 'leaving-zhishu').status, 'available');
});

test('审批状态：设备绑定、24 小时过期、旧记录放行', () => {
  const now = Date.now();
  const row = {
    status: 'approved', approved_at: now - 3600_000,
    meta: JSON.stringify({ deviceId: DEVICE }), school_id: RESOURCE,
  };
  const ok = approvalState(row, now, DEVICE);
  assert.equal(ok.status, 'approved');
  assert.equal(ok.expiresAt, now - 3600_000 + APPROVAL_TTL_MS);
  assert.equal(approvalState(row, now, 'other-device').deviceMismatch, true);
  const expired = approvalState({ ...row, approved_at: now - APPROVAL_TTL_MS - 1 }, now, DEVICE);
  assert.equal(expired.status, 'expired');
  const legacy = approvalState({ status: 'approved', approved_at: now, meta: '{}' }, now, '');
  assert.equal(legacy.deviceMismatch, false);   // 历史数据没记设备 ID 时放行
});

/* ── 签名链接 ─────────────────────────────────────────────── */

test('签名链接：5 分钟有效，篡改任一字段 / 过期 / 超长有效期都拒绝', async () => {
  const env = envOf();
  const now = Date.now();
  const exp = Math.floor(now / 1000) + ASSET_URL_TTL_SEC;
  const o = { rid: 'a'.repeat(32), aid: AID, exp, dev: DEVICE, resource: RESOURCE };
  const sig = await signAssetToken(o, env);
  assert.equal(await verifyAssetToken({ ...o, sig }, env, now), true);
  for (const patch of [
    { aid: 'leaving-zhishu' }, { rid: 'b'.repeat(32) }, { dev: 'other' },
    { resource: 'company-material:zhishu' }, { sig: '0'.repeat(64) },
  ]) {
    assert.equal(await verifyAssetToken({ ...o, sig, ...patch }, env, now), false, JSON.stringify(patch));
  }
  assert.equal(await verifyAssetToken({ ...o, sig }, env, now + (ASSET_URL_TTL_SEC + 1) * 1000), false);
  assert.equal(await verifyAssetToken({ ...o, exp: exp + 99999, sig }, env, now), false);
  assert.equal(await verifyAssetToken({ ...o, sig }, { ...env, VERIFY_ACCESS_SECRET: 'another' }, now), false);
  assert.notEqual(assetSecret(env), assetSecret({ VERIFY_ACCESS_SECRET: 'another' }));
});

test('签发：URL 带签名与过期秒，只发已归档材料，pending 资源不发链接', async () => {
  const env = envOf();
  const now = Date.now();
  const issued = await issueAssets({ origin: ORIGIN, rid: 'c'.repeat(32), dev: DEVICE, resource: RESOURCE, env, now });
  assert.equal(issued.assets.length, 1);
  assert.equal(issued.ttl, 300);
  assert.equal(issued.refreshIn, 120);
  const u = new URL(issued.assets[0].url);
  assert.equal(u.pathname, '/api/secure-asset');
  assert.equal(u.searchParams.get('rid'), 'c'.repeat(32));
  assert.equal(u.searchParams.get('aid'), AID);
  assert.match(u.searchParams.get('sig'), /^[0-9a-f]{64}$/);
  assert.equal(Number(u.searchParams.get('exp')), Math.floor(now / 1000) + 300);
  assert.equal(issued.assets[0].expiresAt, Number(u.searchParams.get('exp')) * 1000);
  assert.ok(!issued.assets[0].url.includes('myqcloud.com'), '绝不能暴露对象存储裸地址');
  const none = await issueAssets({ origin: ORIGIN, rid: 'd'.repeat(32), dev: DEVICE, resource: 'company-material:chowsang', env, now });
  assert.equal(none.assets.length, 0);
});

test('私有存储读取：KV 二进制 + 元数据，缺文件时返回 null', async () => {
  const env = envOf();
  const a = await readAsset(env, AID);
  assert.equal(a.contentType, 'image/jpeg');
  assert.deepEqual(Array.from(a.bytes), Array.from(JPEG));
  assert.equal(await readAsset(env, 'not-exist'), null);
  assert.equal((await readAsset(envOf(liveDb(), false), AID)), null);
});

/* ── 端到端：申请 → 批准 → 实时下发签名链接 → 代理取流 ─────── */

test('端到端：批准后状态接口实时返回签名链接，代理接口只认有效签名', async (t) => {
  const env = envOf();
  const id = await approvedRequest(env, t);

  const s = await status(env, id);
  assert.equal(s.body.status, 'approved');
  assert.equal(s.body.resource, RESOURCE);
  assert.equal(s.body.assets.length, 1);
  assert.equal(s.body.assetUrlTtl, 300);
  const url = s.body.assets[0].url;

  const hit = await assetGet({ env, request: new Request(url) });
  assert.equal(hit.status, 200);
  assert.equal(hit.headers.get('Content-Type'), 'image/jpeg');
  assert.match(hit.headers.get('Cache-Control'), /no-store/);
  assert.equal(hit.headers.get('X-Robots-Tag'), 'noindex, nofollow');
  assert.equal(hit.headers.get('X-Asset-Expires-At'), String(s.body.assets[0].expiresAt));
  assert.deepEqual(Array.from(new Uint8Array(await hit.arrayBuffer())), Array.from(JPEG));

  /* 换设备 / 篡改签名 / 换材料 / 换申请 ID：一律拒绝 */
  const cases = [
    [url.replace(/(dev=)[^&]+/, '$1other-device'), 403],
    [url.replace(/sig=[0-9a-f]{64}/, 'sig=' + '0'.repeat(64)), 403],
    [url.replace(/aid=[a-z0-9_-]+/, 'aid=leaving-zhishu'), 403],
    [url.replace(/rid=[0-9a-f]{32}/, 'rid=' + 'e'.repeat(32)), 404],
    [url.replace(/exp=\d+/, 'exp=1000000000'), 403], // 过期时间戳（签名随之失配）
    [url.replace(/exp=\d+/, 'exp=1'), 400],          // 非法格式直接拒绝
  ];
  for (const [bad, code] of cases) {
    const r = await assetGet({ env, request: new Request(bad) });
    assert.equal(r.status, code, bad);
  }
});

test('未批准 / 已过期 / 材料非本资源，都不能取到原件', async (t) => {
  const env = envOf();
  const calls = mockResend(t);   // 不批准，只提交
  const submitted = await submit(env);
  const { requestId } = await submitted.json();
  assert.equal(calls.length, 1);

  const s = await status(env, requestId);
  assert.equal(s.body.status, 'pending');
  assert.equal(s.body.assets, undefined);   // 未批准不下发任何链接

  /* 手工伪造一条「已批准」但资源不匹配 / 已过期的记录 */
  const now = Date.now();
  const fakeId = 'f'.repeat(32);
  await env.DB.prepare(
    `INSERT INTO verify_access_requests (id, school_id, name, identity, purpose, reason, meta, created_at, status, approved_at)
     VALUES (?, ?, 'x', 'hr', 'background', 'test', ?, ?, 'approved', ?)`
  ).bind(fakeId, 'company-material:chowsang', JSON.stringify({ deviceId: DEVICE }), now, now).run();
  const issued = await issueAssets({ origin: ORIGIN, rid: fakeId, dev: DEVICE, resource: 'company-material:chowsang', env, now });
  assert.equal(issued.assets.length, 0);   // pending 材料根本不会签发

  /* 拿别的资源的签名链接去请求，服务端以库里的 resource 为准 */
  const other = await issueAssets({ origin: ORIGIN, rid: fakeId, dev: DEVICE, resource: RESOURCE, env, now });
  const r = await assetGet({ env, request: new Request(other.assets[0].url) });
  assert.equal(r.status, 403);
});

test('防刷：同一授权每分钟取流超过上限返回 429', async (t) => {
  const env = envOf();
  const id = await approvedRequest(env, t);
  const s = await status(env, id);
  const url = s.body.assets[0].url;
  let last = null;
  for (let i = 0; i < 41; i++) {
    last = await assetGet({ env, request: new Request(url) });
  }
  assert.equal(last.status, 429);
  assert.equal((await last.json()).error, 'rate_limited');
});

/* ── 前端 / 构建接线（静态断言） ───────────────────────────── */

test('前端通用组件与公司档案已接线，且签名 URL 不落本地存储', () => {
  const sa = readFileSync(new URL('../js/secure-access.js', import.meta.url), 'utf8');
  for (const needle of [
    'data-secure-access', "headers['X-Device-Id']", 'assetRefreshIn',
    'scheduleRefresh', 'readUnlock', 'data-sa-zoom', 'visibilitychange',
  ]) assert.ok(sa.includes(needle), '通用组件缺少：' + needle);
  assert.ok(!/saveUnlock[\s\S]{0,400}url:/.test(sa), '解锁态绝不能缓存签名 URL');

  const cp = readFileSync(new URL('../js/company-profile.js', import.meta.url), 'utf8');
  assert.match(cp, /secureMaterialsBlock\(c\)/);
  assert.match(cp, /SecureAccess\.mountAll\(drawer\)/);
  const data = JSON.parse(readFileSync(new URL('../data/company-profiles.json', import.meta.url), 'utf8'));
  for (const cid of ['comein', 'zhishu', 'fanggeek', 'chowsang']) {
    assert.equal(data.companies[cid].secureMaterials.resource, 'company-material:' + cid);
  }
  assert.equal(data.companies.chowsang.secureMaterials.items[0].status, 'pending');

  for (const f of ['index.html', 'company.html', 'templates/resume.template.html', 'resume.html']) {
    const html = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    /* 首页把公司档案 5 个脚本改为按需加载：由 company-lazy.js 注入 secure-access，
       其余页面仍直接引入。两种接线方式都算「已接入通用组件」。 */
    const wired = /js\/secure-access\.js/.test(html) ||
      (/company-lazy\.js/.test(html) &&
        readFileSync(new URL('../js/company-lazy.js', import.meta.url), 'utf8').includes('js/secure-access.js'));
    assert.ok(wired, f + ' 未引入通用组件（直接或经加载器）');
    assert.match(html, /css\/secure-access\.css/, f + ' 未引入组件样式');
  }
  const build = readFileSync(new URL('../scripts/pages-build.sh', import.meta.url), 'utf8');
  assert.match(build, /js\/secure-access\.js/);
  assert.match(build, /functions\/api\/secure-asset\.js/);
});
