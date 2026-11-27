import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import '../js/guide-core.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const Core = globalThis.GuideCore;
const doc = JSON.parse(read('data/site-data.json'));
const cfg = doc.guide;

function ctx(overrides = {}) {
  return Object.assign({
    now: 1_000_000,
    shownIds: [],
    shownCount: 0,
    lastShownAt: 0,
    lastSectionAt: {},
    dismissed: {},
    quiet: false,
    panelOpen: false,
    modalOpen: false,
    drawerOpen: false,
    composerFocused: false,
    docHidden: false,
    voiceBusy: false,
    fastScrollUntil: 0,
    aiEngaged: false
  }, overrides);
}

/* ───────── 决策纯函数 ───────── */

test('guide-core 在无候选或无脚本时返回 null', () => {
  assert.equal(Core.choose([], ctx(), cfg), null);
  assert.equal(Core.choose(cfg.scripts, ctx({ quiet: true }), cfg), null);
});

test('优先级高的脚本胜出；同优先级保持数据顺序', () => {
  const a = { id: 'A', section: 'experience', priority: 50 };
  const b = { id: 'B', section: 'education', priority: 70 };
  assert.equal(Core.choose([a, b], ctx(), cfg).id, 'B');
  assert.equal(Core.choose([b, a], ctx(), cfg).id, 'B');
  assert.equal(Core.choose([a, { id: 'C', section: 'contact', priority: 50 }], ctx(), cfg).id, 'A');
});

test('会话上限 / 同脚本去重 / 冷却边界', () => {
  const s = cfg.scripts[0];
  assert.equal(Core.shouldSuppress(s, ctx({ shownCount: cfg.maxPerSession }), cfg), 'session-cap');
  assert.equal(Core.shouldSuppress(s, ctx({ shownIds: [s.id] }), cfg), 'already-shown');
  assert.equal(Core.shouldSuppress(s, ctx({ lastShownAt: 1_000_000 - 1000 }), cfg), 'global-cooldown');
  assert.equal(Core.shouldSuppress(s, ctx({ lastShownAt: 1_000_000 - cfg.globalCooldownMs }), cfg), null);
  assert.equal(
    Core.shouldSuppress(s, ctx({ lastSectionAt: { [s.section]: 1_000_000 - 1000 } }), cfg),
    'section-cooldown'
  );
  assert.equal(
    Core.shouldSuppress(s, ctx({ lastSectionAt: { [s.section]: 1_000_000 - cfg.sectionCooldownMs } }), cfg),
    null
  );
});

test('面板 / 弹窗 / 抽屉 / 输入 / 隐藏页 / 语音占用 / 快滚 / 问答 全部抑制', () => {
  const s = cfg.scripts[0];
  const cases = [
    [{ panelOpen: true }, 'panel-open'],
    [{ modalOpen: true }, 'modal-open'],
    [{ drawerOpen: true }, 'drawer-open'],
    [{ composerFocused: true }, 'composer-focused'],
    [{ docHidden: true }, 'document-hidden'],
    [{ voiceBusy: true }, 'voice-busy'],
    [{ fastScrollUntil: 1_000_100 }, 'fast-scroll'],
    [{ aiEngaged: true }, 'ai-engaged'],
    [{ dismissed: { [s.id]: 1 } }, 'dismissed']
  ];
  for (const [overrides, reason] of cases) {
    assert.equal(Core.shouldSuppress(s, ctx(overrides), cfg), reason, `${reason} 应被抑制`);
  }
});

test('reasons 给每条候选一个可归因结果', () => {
  const r = Core.reasons(cfg.scripts, ctx({ aiEngaged: true }), cfg);
  assert.equal(r.length, cfg.scripts.length);
  assert.ok(r.every((x) => x.reason === 'ai-engaged'));
});

/* ───────── P0 数据与接线 ───────── */

test('P0 只有三条板块级脚本，编号与板块一一对应', () => {
  assert.equal(cfg.scripts.length, 3);
  assert.deepEqual(cfg.scripts.map((s) => s.id), ['G03', 'G06', 'G08']);
  assert.deepEqual(cfg.scripts.map((s) => s.section), ['experience', 'education', 'contact']);
  assert.ok(cfg.scripts.every((s) => s.trigger.type === 'section-dwell'));
  assert.ok(cfg.scripts.every((s) => s.cta && s.cta.action));
});

test('私密材料话术统一：归档 / 可申请 / 批准后解锁，不说直接可见', () => {
  const exp = cfg.scripts.find((s) => s.id === 'G03');
  const edu = cfg.scripts.find((s) => s.id === 'G06');
  assert.match(exp.speech + exp.caption, /离职证明[\s\S]*申请解锁/);
  assert.match(edu.speech + edu.caption, /学历验证码[\s\S]*批准/);
  for (const s of cfg.scripts) {
    assert.doesNotMatch(s.caption, /直接(可见|查看)/);
  }
});

test('两套首页源都接入了导览脚本与样式，且带版本参数', () => {
  for (const file of ['index.html', 'src/pages/index.astro']) {
    const src = read(file);
    assert.match(src, /guide-tour\.css\?v=20261128a/, `${file} 缺少样式`);
    assert.match(src, /guide-core\.js\?v=20261128a/, `${file} 缺少决策层`);
    assert.match(src, /guide-tour\.js\?v=20261128a/, `${file} 缺少 DOM 层`);
  }
});

test('构建产物目录收集规则覆盖新文件', () => {
  const build = read('scripts/pages-build.sh');
  assert.match(build, /for item in css js/); // js/ css/ 整目录复制，新文件无需改白名单
});

/* ───────── P0 行为边界（静态契约） ───────── */

test('导览不自动出声：只在「点我听」的用户手势内调用 speak', () => {
  const src = read('js/guide-tour.js');
  assert.match(src, /listen\.addEventListener\('click'[\s\S]{0,700}AIVoice\.speak/);
  assert.equal((src.match(/window\.AIVoice\.speak\(/g) || []).length, 1, '只允许一个发声出口');
  const listenAt = src.indexOf("listen.addEventListener('click'");
  const speakAt = src.indexOf('window.AIVoice.speak(');
  assert.ok(speakAt > listenAt && speakAt - listenAt < 700, 'speak 必须在点我听回调内');
});

test('导览不自动滚动：travel 只在 runAction 内、由点击触发', () => {
  const src = read('js/guide-tour.js');
  const run = src.slice(src.indexOf('function runAction'), src.indexOf('function mountToggle'));
  assert.match(run, /CPAI_STAGE_LINK\.travel/);
  const show = src.slice(src.indexOf('function showCard'), src.indexOf('function openCompany'));
  assert.doesNotMatch(show, /scrollIntoView|CPAI_STAGE_LINK\.travel/);
});

test('移动端与 reduced-motion 有专门样式，不遮挡输入框', () => {
  const css = read('css/guide-tour.css');
  assert.match(css, /@media \(max-width: 899px\)/);
  assert.match(css, /\.cp-guide-caption\s*\{\s*display: none/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test('数据快照已同步 guide 节点', () => {
  const js = read('data/site-data.js');
  assert.match(js, /"guide"/);
  assert.match(js, /G03/);
  assert.match(js, /G06/);
  assert.match(js, /G08/);
});
