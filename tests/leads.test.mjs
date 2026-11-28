/* 提问记录 → 线索：意图判定、按人聚合、后台接口
   ──────────────────────────────────────────────────────────────
   全部用内存 D1 + 假会话，不连云函数、不碰生产库。
   口径：只认招聘 / 合作 / 求职询问三类意图；带否定的句子不算；
   同一个人（同 IP 哈希）的多条意向提问并成一条线索，优先级取最紧急的那次。
   ────────────────────────────────────────────────────────────── */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { signSession, COOKIE, TTL } from '../functions/lib/admin-auth.js';
import { classify, buildLeads, followUp, toText, isPreset } from '../functions/lib/leads.js';
import { onRequestGet } from '../functions/api/admin/leads.js';

const ORIGIN = 'https://chenpeisheng.cn';
const SCHEMA = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
const SECRET = 'test-admin-session-secret';

function fakeDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(SCHEMA);
  return {
    raw: sqlite,
    prepare(sql) {
      const stmt = sqlite.prepare(sql);
      const make = (params) => ({
        all: async () => ({ results: stmt.all(...params), success: true, meta: {} }),
        first: async (col) => {
          const row = stmt.all(...params)[0];
          if (!row) return null;
          return col ? (row[col] === undefined ? null : row[col]) : row;
        },
        run: async () => {
          const info = stmt.run(...params);
          return { success: true, meta: { changes: Number(info && info.changes) || 0 } };
        },
      });
      return Object.assign(make([]), { bind: (...params) => make(params) });
    },
  };
}

function envOf(db) {
  return {
    DB: db || fakeDb(),
    ADMIN_SESSION_SECRET: SECRET,
    ADMIN_PASSWORD: 'unused-emergency-password',
    ALLOWED_ORIGINS: ORIGIN,
  };
}

async function cookieOf(env) {
  const exp = Math.floor(Date.now() / 1000) + TTL;
  return COOKIE + '=' + (await signSession(env, exp));
}

function req(path, opts = {}) {
  return new Request(ORIGIN + path, { method: opts.method || 'GET', headers: opts.headers || {} });
}

function seed(db, rows) {
  for (const r of rows) {
    db.prepare(
      'INSERT INTO qa_logs (ts, query, answer, hit_ids, hit_count, empty, model, ms, ip_hash, device_hash) VALUES (?,?,?,?,?,?,?,?,?,?)'
    ).bind(r.ts, r.query || r.q, '', '', 1, 0, 'm', 100, r.ip || '', 'dev').run();
  }
}

/* ── 意图判定 ─────────────────────────────────────────────────── */

test('classify：招聘类问法命中「到岗 / 期望薪资」', () => {
  const r = classify('你什么时候能到岗，期望薪资多少？');
  assert.equal(r.key, 'hire');
  assert.equal(r.priority, 1);
  assert.ok(r.signals.includes('到岗'));
  assert.ok(r.signals.includes('期望薪资'));
});

test('classify：外包报价归到合作类', () => {
  const r = classify('帮我们做一个 Agent 系统，大概什么报价？');
  assert.equal(r.key, 'collab');
  assert.equal(r.priority, 2);
});

test('classify：求职者问「招人吗」不算招聘线索', () => {
  const r = classify('你们团队还招人吗，有没有 hc');
  assert.equal(r.key, 'jobseek');
  assert.equal(r.priority, 3);
});

test('classify：带否定的句子不算线索', () => {
  assert.equal(classify('我不接受外包，只考虑全职'), null);
  assert.equal(classify('我们这边不内推，请勿打扰'), null);
});

test('classify：纯技术好奇不算线索', () => {
  assert.equal(classify('这个多智能体系统的沙箱是怎么做的'), null);
  assert.equal(classify('你会做饭吗'), null);
  assert.equal(classify('你好'), null);
});

test('classify：第三人称打听算外部在评估，归招聘', () => {
  /* 线上真实记录里就有「他会 Kubernetes 吗」「他现在的联系方式」——本人不会这么说自己 */
  const r = classify('他会 Kubernetes 吗');
  assert.equal(r.key, 'hire');
  assert.equal(r.priority, 1);
  assert.ok(r.signals.includes('第三人称提问'));
  /* 「其他」里的他、带「你」的对话式反问都不算 */
  assert.equal(classify('其他项目还有吗'), null);
  const chat = classify('你怎么看他的架构');
  assert.equal(chat, null);
});

test('classify：只要联系方式算弱线索，事由不明', () => {
  const r = classify('联系方式？');
  assert.equal(r.key, 'contact');
  assert.equal(r.weak, true);
  assert.equal(r.priority, 4);
});

test('isPreset：分身那排快捷问题原文不当作意向', () => {
  assert.equal(isPreset('怎么联系你？'), true);
  assert.equal(isPreset(' 技术栈 与 方向。'), true);   // 空白与标点抹掉后仍判得出
  assert.equal(isPreset('你主导过哪些 0→1 系统？'), true);
  assert.equal(isPreset('他现在的联系方式'), false);
});

test('classify：一句里同时有合作与到岗，按更紧急的招聘算', () => {
  const r = classify('能接活吗？另外你什么时候能到岗');
  assert.equal(r.key, 'hire');
  assert.equal(r.priority, 1);
});

/* ── 聚合 ──────────────────────���──────────────────────────────── */

test('buildLeads：同 IP 的多条意向问合成一个人，priority 取最紧急', () => {
  const rows = [
    { ts: 1000, query: '帮我们做个小程序，报价多少', ip_hash: 'aaa' },
    { ts: 2000, query: '你什么时候能到岗', ip_hash: 'aaa' },
    { ts: 1500, query: '他做过哪些 0→1 系统', ip_hash: 'aaa' },
    { ts: 1800, query: '怎么联系你？', ip_hash: 'aaa' },          // 点的快捷问题，不算线索
    { ts: 1900, query: '这个多智能体系统怎么搭的', ip_hash: 'aaa' }, // 纯技术好奇，也不算
  ];
  const { leads, stats } = buildLeads(rows);
  assert.equal(leads.length, 1);
  assert.equal(leads[0].count, 3);
  assert.equal(leads[0].presetClicks, 1);
  assert.equal(leads[0].priority, 1);         // 后来问到岗，整条线索提到招聘
  assert.equal(leads[0].intentKey, 'hire');
  assert.ok(leads[0].signals.includes('到岗'));
  assert.ok(leads[0].signals.includes('报价'));
  assert.equal(stats.hire, 2);
  assert.equal(stats.collab, 1);
  assert.equal(stats.total, 3);
  assert.equal(stats.presets, 1);
  assert.equal(stats.scanned, 5);
  assert.equal(stats.presetOnly, 0);          // 这个人留下了意向，不算「只点按钮」
});

test('buildLeads：只点快捷问题的人不进线索，记成「在翻但没表态」', () => {
  const rows = [
    { ts: 100, query: '怎么联系你？', ip_hash: 'ip-p' },
    { ts: 200, query: '技术栈与方向？', ip_hash: 'ip-p' },
    { ts: 300, query: '你主导过哪些 0→1 系统？', ip_hash: 'ip-q' },
  ];
  const { leads, stats } = buildLeads(rows);
  assert.equal(leads.length, 0);
  assert.equal(stats.presets, 3);
  assert.equal(stats.presetOnly, 2);
});

test('buildLeads：不同 IP 各自成条，按优先级再按最近活跃排序', () => {
  const rows = [
    { ts: 300, query: '能接受内推吗', ip_hash: 'ip-b' },
    { ts: 100, query: '期望薪资多少', ip_hash: 'ip-a' },
    { ts: 900, query: '这个项目报价多少', ip_hash: 'ip-c' },
  ];
  const { leads } = buildLeads(rows);
  assert.equal(leads.length, 3);
  assert.equal(leads[0].ip, 'ip-a');   // 招聘优先级最高
  assert.equal(leads[1].ip, 'ip-c');   // 合作次之
  assert.equal(leads[2].ip, 'ip-b');
});

test('buildLeads：没有 ip_hash 的老记录单独成条，不塞进同一个桶', () => {
  const rows = [
    { ts: 100, query: '方便电话聊吗', ip_hash: '' },
    { ts: 200, query: '方便电话聊吗', ip_hash: '' },
  ];
  const { leads } = buildLeads(rows);
  assert.equal(leads.length, 2);
});

test('followUp / toText：给得出可直接用的话术', () => {
  const lead = {
    intentKey: 'hire', intentLabel: '招聘', ip: 'aaa', count: 2, lastTs: 1700000000000,
    queries: [{ ts: 1, q: '你什么时候能到岗' }],
  };
  const text = followUp(lead);
  assert.ok(text.includes('你什么时候能到岗'));
  assert.ok(text.includes('简历'));
  const all = toText([lead]);
  assert.ok(all.includes('[招聘]'));
  assert.ok(all.includes('话术：'));
});

/* ── 接口 ─────────────────────────────────────────────────────── */

test('/api/admin/leads：未登录被拒', async () => {
  const res = await onRequestGet({ request: req('/api/admin/leads'), env: envOf() });
  assert.notEqual(res.status, 200);
  const d = await res.json();
  assert.equal(d.ok, false);
});

test('/api/admin/leads：登录后返回线索、统计与话术', async () => {
  const env = envOf();
  const cookie = await cookieOf(env);
  const now = Date.now();
  seed(env.DB, [
    { ts: now - 1000, query: '你什么时候能到岗', ip: 'ip-a' },
    { ts: now - 500, query: '报价多少，能接吗', ip: 'ip-a' },
    { ts: now - 100, query: '这个系统怎么做的', ip: 'ip-b' },
    { ts: now - 60 * 86400000, query: '期望薪资多少', ip: 'ip-c' },   // 60 天前，超出 30 天窗口
  ]);

  const res = await onRequestGet({
    request: req('/api/admin/leads?days=30', { headers: { Cookie: cookie, Origin: ORIGIN } }),
    env,
  });
  assert.equal(res.status, 200);
  const d = await res.json();
  assert.equal(d.ok, true);
  assert.equal(d.total_leads, 1);          // ip-a 一个人；ip-b 不是线索；ip-c 超窗口
  assert.equal(d.stats.total, 2);
  assert.equal(d.stats.hire, 1);
  assert.equal(d.stats.collab, 1);
  assert.equal(d.leads[0].count, 2);
  assert.equal(d.leads[0].intentKey, 'hire');
  assert.equal(typeof d.leads[0].followUp, 'string');
  assert.ok(d.leads[0].followUp.length > 20);
});

test('/api/admin/leads：days 与 limit 越界会被夹到合法范围', async () => {
  const env = envOf();
  const cookie = await cookieOf(env);
  const now = Date.now();
  seed(env.DB, [
    { ts: now - 10, query: '期望薪资多少', ip: 'ip-x' },
    { ts: now - 20, query: '报价多少', ip: 'ip-y' },
  ]);
  const d1 = await (await onRequestGet({
    request: req('/api/admin/leads?days=999&limit=1', { headers: { Cookie: cookie } }), env,
  })).json();
  assert.equal(d1.days, 90);
  assert.equal(d1.leads.length, 1);
  assert.equal(d1.total_leads, 2);

  const d2 = await (await onRequestGet({
    request: req('/api/admin/leads?days=0', { headers: { Cookie: cookie } }), env,
  })).json();
  assert.equal(d2.days, 1);
});
