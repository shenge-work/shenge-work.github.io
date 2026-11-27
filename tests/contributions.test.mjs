import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_LOGIN, calcStreaks, fromDays, levelForCount, parseDays, payloadFromSvg,
} from '../functions/lib/contributions.js';
import { onRequestGet } from '../functions/api/contributions.js';

/* 构造 GitHub 日历 SVG：53 列 × 7 行，末几天故意留空，覆盖属性乱序与非格子 <g>。 */
function fakeSvg(days) {
  const cells = days.map((d, i) => {
    const level = levelForCount(d.count);
    if (i % 5 === 0) {
      return '<g data-date="' + d.date + '" data-level="' + level + '" data-count="' + d.count + '"><rect/></g>';
    }
    return '<g class="day" data-count="' + d.count + '" data-date="' + d.date + '" data-level="' + level + '"><rect/></g>';
  });
  return '<svg><g class="months"><text>Jan</text></g>' + cells.join('') + '</svg>';
}

function fakeDays(n = 366) {
  const out = [];
  const start = Date.UTC(2025, 10, 27);
  for (let i = 0; i < n; i += 1) {
    const date = new Date(start + i * 86400000).toISOString().slice(0, 10);
    out.push({ date, count: i % 9 === 0 ? 3 : 0, level: i % 9 === 0 ? 2 : 0 });
  }
  return out;
}

test('levelForCount：空、低、中、高按 GitHub 口径分级，SVG 自带 level 优先', () => {
  assert.equal(levelForCount(0), 0);
  assert.equal(levelForCount(2), 1);
  assert.equal(levelForCount(5), 2);
  assert.equal(levelForCount(11), 3);
  assert.equal(levelForCount(12), 4);
  assert.equal(levelForCount(99, 2), 2);
  assert.equal(levelForCount(0, '4'), 4);
});

test('parseDays：属性顺序无关，忽略非日期 <g>，按日期升序去重', () => {
  const svg = '<svg><g data-date="2026-01-02" data-count="4" data-level="3"></g>' +
    '<g class="months"><text>Jan</text></g>' +
    '<g data-count="1" data-level="1" data-date="2026-01-01"></g>' +
    '<g data-date="bad" data-count="2"></g>' +
    '<g data-date="2026-01-02" data-count="9" data-level="4"></g></svg>';
  const days = parseDays(svg);
  assert.equal(days.length, 2);
  assert.deepEqual(days[0], { date: '2026-01-01', count: 1, level: 1 });
  assert.deepEqual(days[1], { date: '2026-01-02', count: 9, level: 4 });
});

test('parseDays：GitHub 现行 HTML 从 <tool-tip for=id> 取贡献数', () => {
  const html = '<table><tr>' +
    '<td data-ix="0" data-date="2026-01-02" id="contribution-day-component-4-1" data-level="2"></td>' +
    '<tool-tip for="contribution-day-component-4-1">4 contributions on January 2nd.</tool-tip>' +
    '<td data-ix="1" data-date="2026-01-03" id="contribution-day-component-5-1" data-level="0"></td>' +
    '<tool-tip for="contribution-day-component-5-1">No contributions on January 3rd.</tool-tip>' +
    '</tr></table>';
  const days = parseDays(html);
  assert.equal(days.length, 2);
  assert.deepEqual(days.map((d) => d.count), [4, 0]);
  assert.deepEqual(days.map((d) => d.level), [2, 0]);
});

test('parseDays：GitHub 真实写法从 <title> 文本取贡献数，没有 data-count 也能解析', () => {
  const svg = '<svg><g transform="translate(10, 0)">' +
    '<rect x="0" y="0" data-level="2" data-date="2026-01-02"><title>4 contributions on January 2nd</title></rect>' +
    '<rect x="0" y="16" data-level="0" data-date="2026-01-03"><title>No contributions on January 3rd</title></rect>' +
    '<rect x="0" y="32" data-level="1" data-date="2026-01-04"><title>1 contribution on January 4th</title></rect>' +
    '</g></svg>';
  const days = parseDays(svg);
  assert.equal(days.length, 3);
  assert.deepEqual(days.map((d) => d.count), [4, 0, 1]);
  assert.deepEqual(days.map((d) => d.level), [2, 0, 1]);
});

test('calcStreaks：今天未提交不中断当前连续，最长连续独立计算', () => {
  const days = [
    { count: 1 }, { count: 2 }, { count: 1 }, { count: 0 },
    { count: 3 }, { count: 4 }, { count: 5 }, { count: 0 },
  ].map((d) => ({ date: '2026-01-01', count: d.count }));
  assert.deepEqual(calcStreaks(days), { currentStreak: 3, longestStreak: 3 });
  days[days.length - 1].count = 6;
  assert.deepEqual(calcStreaks(days), { currentStreak: 4, longestStreak: 4 });
});

test('fromDays/weeks：53 列 7 行，周日为首行，空缺补 null，total 与 days 对齐', () => {
  const days = fakeDays(20);
  const payload = fromDays(days, DEFAULT_LOGIN, '2026-11-28T00:00:00Z');
  assert.equal(payload.username, 'shenge-work');
  assert.equal(payload.total, days.reduce((n, d) => n + d.count, 0));
  assert.equal(payload.days.length, 20);
  assert.equal(payload.weeks.length, 4);
  assert.ok(payload.weeks.every((w) => w.length === 7));
  assert.equal(payload.weeks[0][0], null); // 2025-11-27 是周四，首列前三天为空
  assert.ok(payload.weeks[0][4]);
  assert.equal(payload.weeks[0][4].date, '2025-11-27');
});

test('payloadFromSvg：完整日历生成 payload，太短的输入直接报错', () => {
  const days = fakeDays();
  const payload = payloadFromSvg(fakeSvg(days), DEFAULT_LOGIN);
  assert.equal(payload.days.length, days.length);
  assert.equal(payload.total, days.reduce((n, d) => n + d.count, 0));
  assert.equal(payload.weeks.length, 53);
  assert.throws(() => payloadFromSvg('<svg><g data-date="2026-01-01" data-count="1"></g></svg>'),
    /too_short/);
});

test('/api/contributions：KV 命中直接返回 cache，不再访问 GitHub', async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('不应访问 GitHub'); };
  t.after(() => { globalThis.fetch = originalFetch; });
  const payload = fromDays(fakeDays(310), DEFAULT_LOGIN);
  const kv = {
    get: async () => ({ fetchedAt: new Date().toISOString(), payload }),
    put: async () => { throw new Error('不应写 KV'); },
  };
  const res = await onRequestGet({
    request: new Request('https://example.com/api/contributions'),
    env: { SITE_KV: kv },
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('x-contributions-source'), 'cache');
  const body = await res.json();
  assert.equal(body.source, 'cache');
  assert.equal(body.days.length, 310);
});

test('/api/contributions：缓存未命中时现拉 GitHub 并写回 KV', async (t) => {
  const originalFetch = globalThis.fetch;
  const days = fakeDays();
  let put = null;
  globalThis.fetch = async (url) => {
    assert.match(String(url), /github\.com\/users\/shenge-work\/contributions$/);
    return new Response(fakeSvg(days), { status: 200 });
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const kv = {
    get: async () => null,
    put: async (key, value, opts) => { put = { key, value: JSON.parse(value), opts }; },
  };
  const res = await onRequestGet({
    request: new Request('https://example.com/api/contributions'),
    env: { SITE_KV: kv },
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('x-contributions-source'), 'live');
  const body = await res.json();
  assert.equal(body.source, 'live');
  assert.equal(body.total, days.reduce((n, d) => n + d.count, 0));
  assert.equal(put.key, 'contrib:live:v1:shenge-work');
  assert.equal(put.opts.expirationTtl, 300);
  assert.equal(put.value.payload.total, body.total);
});

test('/api/contributions：GitHub 挂了回退 D1 快照，标记 stale 且不缓存', async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('github down'); };
  t.after(() => { globalThis.fetch = originalFetch; });
  const days = fakeDays(310);
  const env = {
    DB: {
      prepare: () => ({
        bind: () => ({
          first: async () => ({
            payload: JSON.stringify({ days, total: 999 }),
            updated_at: '2026-11-25T04:56:17+00:00',
            updated_by: '',
          }),
        }),
      }),
    },
  };
  const res = await onRequestGet({
    request: new Request('https://example.com/api/contributions'),
    env,
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('x-contributions-source'), 'stale');
  assert.match(res.headers.get('cache-control'), /no-store/);
  const body = await res.json();
  assert.equal(body.source, 'stale');
  assert.equal(body.total, 999);
  assert.equal(body.days.length, 310);
});
