import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const js = read('js/company-profile.js');
const css = read('css/company-profile.css');

test('抽屉滚动监听只挂一次，用 rAF 节流且 passive', () => {
  assert.match(js, /scrollBox\.addEventListener\('scroll'/);
  assert.match(js, /passive:\s*true/);
  assert.match(js, /requestAnimationFrame/);
  assert.match(js, /headTicking/);
});

test('收缩用滞回：进入阈值高于退出阈值，避免抖动', () => {
  assert.match(js, /ENTER_AT\s*=\s*130,\s*EXIT_AT\s*=\s*24/);
  assert.match(js, /!condensed && top > ENTER_AT/);
  assert.match(js, /condensed && top < EXIT_AT/);
});

test('模块级状态在 open() 重开时重置为完整态', () => {
  assert.match(js, /var headTicking = false, condensed = false/);
  const openSeg = js.slice(js.indexOf('function open(id)'), js.indexOf('function openLightbox'));
  assert.match(openSeg, /condensed = false/);
});

test('CSS 仅在移动端抽屉内折叠头部大块，独立页不受影响', () => {
  // 折叠规则带 .cp-drawer 前缀（独立页 .cp-page-body 没有这个祖先）
  assert.match(css, /\.cp-drawer \.cp-head\.is-condensed \.cp-head-exec/);
  assert.match(css, /\.cp-drawer \.cp-head\.is-condensed \.cp-oneline/);
  assert.match(css, /\.cp-drawer \.cp-head\.is-condensed \.cp-pills/);
  assert.match(css, /\.cp-drawer \.cp-head\.is-condensed \.cp-entity/);
  // 收缩规则位于 max-width:720px 媒体查询内
  const block = css.slice(css.indexOf('抽屉头部「滚动收缩」'), css.indexOf('@media (max-width: 380px)'));
  assert.match(block, /@media \(max-width: 720px\)/);
});

test('缓存版本已 bump，浏览器不会吃旧 CSS/JS', () => {
  for (const f of ['index.html', 'resume.html', 'company.html', 'src/pages/index.astro', 'js/company-lazy.js']) {
    const s = read(f);
    assert.ok(!/company-profile\.(css|js)\?v=2026(?!1128a)[0-9a-z]+/.test(s), `${f} 仍有旧版本引用`);
  }
});
