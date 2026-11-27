import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');

test('加载器本身足够小（首屏负载开销可忽略）', () => {
  const src = read('js/company-lazy.js');
  assert.ok(src.length < 4500, `加载器 ${src.length} 字节，应 <4500`);
});

test('加载器按序注入全部 5 个档案脚本', () => {
  const src = read('js/company-lazy.js');
  const expected = [
    'data/company-profiles.js',
    'js/cp-panorama.js',
    'js/company-social.js',
    'js/secure-access.js',
    'js/company-profile.js',
  ];
  expected.forEach((f) => assert.ok(src.includes(f), `缺少脚本 ${f}`));
  assert.ok(src.includes('async = false'), '动态脚本必须保序执行');
});

test('加载器覆盖四种触发：深链 / 视口 / 交互意图 / 点击兜底', () => {
  const src = read('js/company-lazy.js');
  assert.match(src, /#company=/, '深链应立即加载');
  assert.match(src, /IntersectionObserver/, '视口接近应预取');
  assert.match(src, /rootMargin/, '应提前预取');
  assert.match(src, /pointerover/, 'hover 意图预取');
  assert.match(src, /focusin/, '键盘 focus 预取');
  assert.match(src, /pendingCid/, '点击兜底应记录 cid 并在就绪后补开');
  assert.match(src, /CompanyProfile\.open/, '就绪后应补开抽屉');
});

test('两条链首页都用加载器替代了 5 个同步/延迟脚本', () => {
  for (const page of ['index.html', 'src/pages/index.astro']) {
    const src = read(page);
    assert.ok(src.includes('company-lazy.js'), `${page} 未接入加载器`);
    assert.ok(!/<script[^>]*src="data\/company-profiles\.js/.test(src),
      `${page} 仍同步加载档案数据`);
    assert.ok(!/<script[^>]*src="js\/company-profile\.js/.test(src),
      `${page} 仍同步加载抽屉脚本`);
  }
});

test('独立档案页与简历页仍走原脚本，不受按需加载影响', () => {
  for (const page of ['resume.html', 'company.html']) {
    const src = read(page);
    assert.ok(src.includes('company-profile.js'), `${page} 应保留原脚本`);
    assert.ok(!src.includes('company-lazy.js'), `${page} 不应引入加载器`);
  }
});

test('首屏 LCP 图保持高优先级，视口外图片全部 lazy', () => {
  const astro = read('src/pages/index.astro');
  assert.match(astro, /id="idcardPhoto"[^>]*fetchpriority="high"/, 'LCP 图应高优先级');
  assert.ok(!/id="idcardPhoto"[^>]*loading="lazy"/.test(astro), 'LCP 图不应 lazy');
  const lazyImgLines = astro.split('\n').filter((l) => /<img /.test(l));
  const nonLcpImgs = lazyImgLines.filter((l) => !l.includes('idcardPhoto') && !l.includes('modalImg'));
  assert.ok(nonLcpImgs.length >= 4, '应有至少 4 张视口外图片');
  nonLcpImgs.forEach((line) => {
    assert.match(line, /loading="lazy"/, `视口外图片应 lazy：${line.trim()}`);
  });
});

test('视口隔离排除 works（宽度测量）并为锚点落点兜底', () => {
  const css = read('css/style.css');
  assert.match(css, /content-visibility:\s*auto/, '应启用视口隔离');
  assert.match(css, /\.section:not\(#works\)/, 'works 必须排除');
  assert.match(css, /\.section:target\s*\{\s*content-visibility:\s*visible/, '锚点落点应强制渲染');
  assert.match(css, /contain-intrinsic-size:\s*900px/, '应有固定尺寸降级');
  assert.match(css, /contain-intrinsic-size:\s*auto 900px/, '应有 auto 尺寸记忆');
});
