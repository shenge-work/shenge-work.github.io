/**
 * 档案详情页「首屏引导锚点」契约测试
 *
 * 背景：学校 / 公司档案正文很长，「学历核验」与「离职证明（任职佐证材料）」
 * 都在页尾，用户不滑到底根本不知道有这两个功能。顶部名称旁各挂一个
 * 原生 #hash 引导锚点，跳到对应板块。
 *
 * 两条构建链必须同时成立：
 *   · 旧链：js/school-profile.js、js/company-profile.js（首页公司抽屉走这条）
 *   · React 链：src/features/school/SchoolPanel.tsx、
 *              src/features/company/{CompanyProfilePanel,blocks-media,FoldableSection}.tsx
 *              （线上 school.html / company.html 走这条，见 pages-build.sh ⑦）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const schoolJs = read('js/school-profile.js');
const schoolTsx = read('src/features/school/SchoolPanel.tsx');
const companyJs = read('js/company-profile.js');
const companyTsx = read('src/features/company/CompanyProfilePanel.tsx');
const blocksTsx = read('src/features/company/blocks-media.tsx');
const foldTsx = read('src/features/company/FoldableSection.tsx');
const schoolCss = read('css/school-profile.css');
const companyCss = read('css/company-profile.css');

test('学校档案：两条链都在校名旁挂 #sp-verify 引导锚点', () => {
  for (const [name, src] of [['旧链', schoolJs], ['React', schoolTsx]]) {
    assert.match(src, /sp-jump/, `${name} 缺少 .sp-jump 锚点`);
    assert.match(src, /href="#sp-verify"/, `${name} 锚点未指向 #sp-verify`);
  }
  assert.match(schoolJs, /<h1 class="sp-title">/, '旧链锚点应落在 h1 校名旁');
  assert.match(schoolTsx, /<h1 className="sp-title">/, 'React 链锚点应落在 h1 校名旁');
});

test('学校档案：两条链的学历核验板块都有稳定 id=sp-verify', () => {
  assert.match(schoolJs, /fold\('学历核验'[^\n]*id: 'sp-verify'/, '旧链板块缺 id');
  assert.match(schoolTsx, /<SpFold title="学历核验"[^\n]*id="sp-verify"/, 'React 板块缺 id');
  assert.match(schoolTsx, /<section id=\{id\}/, 'SpFold 未把 id 落到 section');
});

test('学校档案：无核验数据时不挂空锚点（fork 兼容）', () => {
  assert.match(schoolJs, /s\.verify \?/, '旧链缺少数据条件判断');
  assert.match(schoolTsx, /s\.verify \?/, 'React 链缺少数据条件判断');
});

test('公司档案：两条链都在公司名旁挂 #cp-proof 引导锚点', () => {
  for (const [name, src] of [['旧链', companyJs], ['React', companyTsx]]) {
    assert.match(src, /cp-jump/, `${name} 缺少 .cp-jump 锚点`);
    assert.match(src, /href="#cp-proof"/, `${name} 锚点未指向 #cp-proof`);
  }
  assert.match(companyJs, /cp-title" id="cpTitle"/, '旧链锚点应落在 h3 公司名旁');
  assert.match(companyTsx, /cp-title" id="cpTitle"/, 'React 链锚点应落在 h3 公司名旁');
});

test('公司档案：文案按材料名动态取，没配材料时不挂空锚点', () => {
  assert.match(companyJs, /proofLabel = proof && proof\.resource/, '旧链未做材料存在判断');
  assert.match(companyTsx, /proofLabel = proof\?\.resource/, 'React 链未做材料存在判断');
  assert.match(companyJs, /\.label \|\| '任职佐证材料'/, '旧链未动态取材料名');
  assert.match(companyTsx, /\.label \|\| '任职佐证材料'/, 'React 链未动态取材料名');
});

test('公司档案：两条链的任职佐证材料板块都有稳定 id=cp-proof', () => {
  assert.match(companyJs, /id: 'cp-proof'/, '旧链板块缺 id');
  assert.match(blocksTsx, /id="cp-proof"/, 'React 板块缺 id');
  assert.match(foldTsx, /id\?: string/, 'FoldableSection 未支持 id prop');
  assert.match(foldTsx, /<Tag id=\{id\} className=\{cls\}/, 'noFold 分支未落 id');
  assert.match(foldTsx, /\n\s+id=\{id\}\n/, '折叠分支未落 id');
});

test('样式：锚点可见、落点高亮、避开顶栏、打印隐藏', () => {
  for (const [name, css, cls, target] of [
    ['学校', schoolCss, '.sp-jump', '#sp-verify'],
    ['公司', companyCss, '.cp-jump', '#cp-proof'],
  ]) {
    assert.ok(css.includes(`${cls} {`), `${name} 缺少 ${cls} 样式`);
    assert.ok(css.includes(`${target} { scroll-margin-top: 72px; }`), `${name} 落点未避让顶栏`);
    assert.ok(css.includes(`${target}:target`), `${name} 缺少 :target 高亮`);
    assert.match(css, /@keyframes (sp|cp)-jump-flash/, `${name} 缺少高亮动画`);
    assert.ok(css.includes('@media (max-width: 640px)'), `${name} 缺少移动端适配`);
    assert.ok(css.includes(`${cls} { display: none !important; }`) ||
              css.includes(`, ${cls} { display: none !important; }`), `${name} 打印时未隐藏锚点`);
  }
  assert.ok(companyCss.includes('.cp-drawer #cp-proof { scroll-margin-top: 168px; }'),
    '抽屉收缩头部会遮挡落点，需更大留白');
});

test('缓存版本：所有生产入口统一到同一版本（不写死后缀，避免每次 bump 改测试）', () => {
  const entries = [
    'school.html', 'company.html', 'index.html', 'resume.html',
    'src/pages/school.astro', 'src/pages/company.astro', 'src/pages/index.astro',
    'templates/resume.template.html', 'js/company-lazy.js',
  ];
  const seen = new Set();
  for (const f of entries) {
    const s = read(f);
    const vers = [...s.matchAll(/(?:school|company)-profile\.(?:css|js)\?v=(2026[0-9a-z]+)/g)]
      .map((m) => m[1]);
    for (const v of vers) {
      assert.ok(v.slice(0, 8) >= '20261128', `${f} 引用了历史旧版本 ${v}`);
      seen.add(v);
    }
  }
  assert.equal(seen.size, 1, '所有入口应引用同一个缓存版本，避免新旧混用');
});
