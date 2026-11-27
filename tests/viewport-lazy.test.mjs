import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const main = read('js/main.js');

test('存在通用视口预取 helper，且有无 IO 降级', () => {
  assert.match(main, /function whenNearViewport\s*\(/);
  assert.match(main, /!\(['"]IntersectionObserver['"] in window\)/);
  // 初始即可见 / 无元素时立即执行，避免首屏板块被延迟
  assert.match(main, /box\.top < window\.innerHeight/);
  // 一次性触发后 disconnect
  assert.match(main, /io\.disconnect\(\)/);
});

test('贡献图请求被视口预取包裹，观察联系板块', () => {
  const seg = main.slice(main.indexOf('function initContributions'), main.indexOf('板块可见性', main.indexOf('function initContributions')));
  assert.match(seg, /whenNearViewport\(\$\('contact'\)/);
  assert.match(seg, /\/api\/contributions/);
  assert.match(seg, /data\/contributions\.json/); // 接口不可用时回退静态快照
  assert.match(seg, /applyLiveGrid/);
  assert.match(seg, /renderGhSkeleton/);
  // 实时网格重绘：删掉蛇图里烘焙的旧格子，蛇身 rect.s 留在最上层继续动
  assert.match(main, /querySelectorAll\('rect\.c'\)/);
  assert.match(main, /root\.querySelector\('rect\.s'\)/);
});

test('留言墙首次请求被视口预取包裹，观察 wall 板块', () => {
  assert.match(main, /whenNearViewport\(\$\('wall'\), function \(\) \{ loadFirst\(false\); \}, 600\)/);
  // delay 前先渲染骨架，避免锚点直跳看到空白
  const i = main.indexOf("whenNearViewport($('wall')");
  const before = main.slice(i - 120, i);
  assert.match(before, /state\.mode === 'loading'\) render\(\)/);
});

test('留言墙首屏不再同步 loadFirst（已挪进视口回调）', () => {
  // 除 whenNearViewport 与 retry 按钮外，不应有裸的启动式 loadFirst(false)
  const bare = main.match(/^\s*loadFirst\(false\);\s*$/gm) || [];
  assert.equal(bare.length, 0, `仍有 ${bare.length} 处裸 loadFirst(false) 启动调用`);
});
