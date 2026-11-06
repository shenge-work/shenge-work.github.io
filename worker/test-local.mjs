/* 本地自测：用内存版 KV 跑一遍 Worker 的计数逻辑，验证完再部署。
   运行：node worker/test-local.mjs */

import worker from './index.mjs';

const BASE = 'https://portfolio-visits.example.workers.dev';
const ORIGIN = 'https://shenge-work.github.io';

function makeKV(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    map,
    async get(key) { return map.has(key) ? map.get(key) : null; },
    async put(key, value) { map.set(key, value); },
  };
}

function makeRequest(path, { method = 'GET', origin = ORIGIN, body } = {}) {
  const headers = {};
  if (origin) headers.Origin = origin;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return new Request(BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

let failed = 0;
function check(cond, msg) {
  if (cond) { console.log('  ✓ ' + msg); } else { console.log('  ✗ ' + msg); failed += 1; }
}

const env = { VISITS: makeKV(), ALLOWED_ORIGINS: ORIGIN };
const call = (path, opts) => worker.fetch(makeRequest(path, opts), env, {});

console.log('1. 首次访问计入 1 位访客');
let res = await call('/hit', { method: 'POST', body: { id: 'visitor-a' } });
let data = await res.json();
check(data.visitors === 1 && data.total === 1, 'visitors=1 total=1');
check(res.headers.get('Access-Control-Allow-Origin') === ORIGIN, 'CORS 回显白名单 Origin');

console.log('2. 同一访客再次刷新：总访问 +1，访客数不变');
res = await call('/hit', { method: 'POST', body: { id: 'visitor-a' } });
data = await res.json();
check(data.visitors === 1 && data.total === 2, 'visitors=1 total=2');

console.log('3. 新访客：访客数 +1');
res = await call('/hit', { method: 'POST', body: { id: 'visitor-b' } });
data = await res.json();
check(data.visitors === 2 && data.total === 3, 'visitors=2 total=3');

console.log('4. 已计过数的会话只读 /stats');
res = await call('/stats');
data = await res.json();
check(data.visitors === 2 && data.total === 3, 'stats 与计数器一致');

console.log('5. 非法 visitor id 被清洗后仍能计数');
res = await call('/hit', { method: 'POST', body: { id: '<script>X</script>' } });
data = await res.json();
check(data.visitors === 3 && data.total === 4, '清洗为 scriptx，按新访客计');

console.log('6. 空 body 只加 PV，不加访客');
res = await call('/hit', { method: 'POST', body: {} });
data = await res.json();
check(data.visitors === 3 && data.total === 5, 'visitors=3 total=5');

console.log('7. 非白名单来源被拒');
res = await call('/hit', { method: 'POST', origin: 'https://evil.example.com', body: { id: 'x' } });
check(res.status === 403, '403 origin_not_allowed');

console.log('8. CORS 预检');
res = await call('/hit', { method: 'OPTIONS' });
check(res.status === 204 && res.headers.get('Access-Control-Allow-Methods').includes('POST'), '204 + Allow-Methods');

console.log('9. 错误方法');
res = await call('/hit');
check(res.status === 405, 'GET /hit → 405');

console.log('10. 乱七八糟的路径');
res = await call('/nope');
check(res.status === 404, '404 not_found');

console.log(failed === 0 ? '\n全部通过' : `\n${failed} 项失败`);
process.exit(failed === 0 ? 0 : 1);
