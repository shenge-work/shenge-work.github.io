/* 全站访问计数：总量/访客数的一致性回归
   ──────────────────────────────────────────────────────────────
   线上曾出现 visitors = total + 1（历史脏数据），主页「全站访问」下面
   显示的却是访客数，于是「第 306 位访客 / 累计访问 305 次」长期并存。
   本文件锁住两条口径：写路径不会让访客数反超，读路径也不会展示反超值。 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { onRequestGet, onRequestPost } from '../functions/api/visits.js';
import { onRequestGet as statsGet } from '../functions/api/admin/stats.js';
import { signSession, COOKIE } from '../functions/lib/admin-auth.js';
import { JSDOM } from 'jsdom';

const ORIGIN = 'https://chenpeisheng.cn';
const SCHEMA = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
const SECRET = 'test-admin-session-secret';

function fakeDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(SCHEMA);
  const db = {
    raw: sqlite,
    prepare(sql) {
      const stmt = sqlite.prepare(sql);
      const make = (params) => ({
        all: async () => ({ results: stmt.all(...params), success: true }),
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
  return db;
}

function envOf(db) {
  return { DB: db, ALLOWED_ORIGINS: ORIGIN, ADMIN_SESSION_SECRET: SECRET };
}

function req(path, init = {}) {
  const headers = Object.assign({ Origin: ORIGIN }, init.headers || {});
  return new Request(ORIGIN + path, Object.assign({}, init, { headers }));
}

async function hit(db, id) {
  return onRequestPost({
    request: req('/api/visits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    }),
    env: envOf(db),
  });
}

function counters(db) {
  const rows = db.raw.prepare("SELECT name, value FROM counters ORDER BY name").all();
  return Object.fromEntries(rows.map((r) => [r.name, r.value]));
}

test('新访客 total / visitors 各 +1；同一访客回访只加 total', async () => {
  const db = fakeDb();
  const a = await (await hit(db, 'visitor-00000001')).json();
  assert.deepEqual({ total: a.total, visitors: a.visitors, isNew: a.isNew },
    { total: 1, visitors: 1, isNew: true });

  const b = await (await hit(db, 'visitor-00000001')).json();
  assert.deepEqual({ total: b.total, visitors: b.visitors, isNew: b.isNew },
    { total: 2, visitors: 1, isNew: false });

  const c = await (await hit(db, 'visitor-00000002')).json();
  assert.deepEqual({ total: c.total, visitors: c.visitors, isNew: c.isNew },
    { total: 3, visitors: 2, isNew: true });
  assert.ok(c.visitors <= c.total);
});

test('GET 遇到存量脏数据只展示修正值，不让访客数反超访问数', async () => {
  const db = fakeDb();
  db.raw.prepare("UPDATE counters SET value = 12 WHERE name = 'visitors'").run();
  db.raw.prepare("UPDATE counters SET value = 10 WHERE name = 'total'").run();

  const res = await onRequestGet({ request: req('/api/visits'), env: envOf(db) });
  const d = await res.json();
  assert.equal(res.status, 200);
  assert.deepEqual(d, { ok: true, total: 10, visitors: 10 });
});

test('POST 会落库修正存量脏数据，后台概览与主页随后同口径', async () => {
  const db = fakeDb();
  db.raw.prepare("UPDATE counters SET value = 12 WHERE name = 'visitors'").run();
  db.raw.prepare("UPDATE counters SET value = 10 WHERE name = 'total'").run();

  const d = await (await hit(db, 'visitor-00000003')).json();
  assert.deepEqual({ total: d.total, visitors: d.visitors }, { total: 11, visitors: 11 });
  assert.deepEqual(counters(db), { visitors: 11, total: 11 });
});

test('total 更新失败时不会留下 visitors > total（旧顺序会）', async () => {
  const db = fakeDb();
  const realPrepare = db.prepare;
  db.prepare = (sql) => {
    if (sql.includes("UPDATE counters SET value = value + 1 WHERE name = 'total'")) {
      return { first: async () => { throw new Error('simulated db failure'); } };
    }
    return realPrepare(sql);
  };

  const res = await hit(db, 'visitor-00000004');
  assert.equal(res.status, 500);
  assert.deepEqual(counters(db), { total: 0, visitors: 0 });
});

test('主页里程表显示「全站访问」= total，不是访客数', async () => {
  const dom = new JSDOM(
    '<!doctype html><div id="hitCounter"><div id="hitCounterDigits"></div></div>',
    { url: 'https://chenpeisheng.cn/' },
  );
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.location = dom.window.location;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ ok: true, total: 305, visitors: 306, counted: true, isNew: false }),
  });

  await import('../js/visitor-count.js?visits-test=1');
  await new Promise((r) => setTimeout(r, 0));

  const el = document.getElementById('hitCounter');
  assert.equal(el.querySelector('#hitCounterDigits').textContent, '000305');
  assert.match(el.title, /全站累计访问 305 次/);
  assert.match(el.title, /第 306 位访客/);
});

test('后台概览也兜住历史脏数据，不显示「访客 > 浏览」', async () => {
  const db = fakeDb();
  db.raw.prepare("UPDATE counters SET value = 12 WHERE name = 'visitors'").run();
  db.raw.prepare("UPDATE counters SET value = 10 WHERE name = 'total'").run();
  const cookie = COOKIE + '=' + await signSession(envOf(db), Math.floor(Date.now() / 1000) + 300);

  const res = await statsGet({ request: req('/api/admin/stats', { headers: { Cookie: cookie } }), env: envOf(db) });
  assert.equal(res.status, 200);
  const d = await res.json();
  assert.equal(d.stats.pv, 10);
  assert.equal(d.stats.uv, 10);
});
