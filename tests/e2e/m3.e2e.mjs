#!/usr/bin/env node
/**
 * M3-A 主页 SSG 骨架 E2E（docs/react-refactor-plan.md §6-M3 / 分片一验收）
 *
 * 前置：本地双静态服务——旧版仓库根(:8878) 与混排产物 dist(:8879)：
 *   python3 -m http.server 8878 --bind 127.0.0.1
 *   cd dist && python3 -m http.server 8879 --bind 127.0.0.1
 * （REACT_MIGRATED_PAGES 需含 index.html；无 API 环境，留言墙/问答走 mock）
 *
 * 覆盖：板块渲染、SEO 直出、AI 面板全流（3D 舞台点击/问答/依据/JD 卡/预填链）、
 *       项目模态框、分享卡、公司档案抽屉、主题彩蛋、汉堡菜单、留言墙降级态。
 */
import { chromium } from 'playwright';

const NEW = process.env.NEW_BASE || 'http://127.0.0.1:8879';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0, passed = 0;
const check = (name, cond) => { console.log((cond ? '✓' : '✗') + ' ' + name); cond ? passed++ : failed++; };

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(NEW + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  /* ① 板块 SSG 直出 */
  check('title 直出', (await page.title()).includes('陈培胜'));
  const st = await page.evaluate(() => ({
    exp: document.querySelectorAll('.exp-card').length,
    proj: document.querySelectorAll('.proj-card').length,
    works: document.querySelectorAll('.works-set')[0].querySelectorAll('.work-card').length,
    caps: document.querySelectorAll('.cap').length,
    certs: document.querySelectorAll('.cert-card').length,
    people: document.querySelectorAll('.fp-card').length,
    seo: !!document.querySelector('script[type="application/ld+json"]'),
    navNos: Array.from(document.querySelectorAll('#nav .nav-no')).map(e => e.textContent),
  }));
  check('工作经历 4 卡', st.exp === 4);
  check('项目作品 5 卡', st.proj === 5);
  check('个人作品 6 卡（两组）', st.works === 6);
  check('能力矩阵行数', st.caps >= 5);
  check('证书卡', st.certs >= 2);
  // 名单当前仅 1 人（杨胜）；旧版 main.js 快照渲染同样 1 卡 —— 断新旧一致而非固定 >=3
  check('推荐的人（名单现 1 人，新旧一致）', st.people === 1);
  check('JSON-LD 直出', st.seo);
  // syncSectionLayout 只对「有对应导航项的可见板块」重排序号：about…wall 为 01–10；
  // hero / footerPeople 不占序号（T32）；顶部导航已移除博客外链，不再有静态 11。
  check('导航编号连续不撞号', st.navNos.join('') === '01020304050607080910');
  check('公司档案徽章桥接', await page.evaluate(() => document.querySelectorAll('.exp-badge').length === 4));
  check('教育档案链接', await page.evaluate(() => !!document.querySelector('.edu-school-link')));

  /* ② AI 面板全流（mock /api/chat） */
  await page.route('**/api/chat', async (route) => {
    const body = route.request().postDataJSON();
    if (body && body.mode === 'jd') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        ok: true,
        match: { overall: { score: 72, verdict: '整体匹配良好', summary: '四覆盖。' },
          rows: [{ req: 'Agent 架构', status: 'covered', evidence: [{ point: 'CP.AI 平台', title: '工作经历｜进门财经｜平台', ratio: 0.6 }] },
                 { req: '5 年金融', status: 'gap', gap: '行业 4 年' }],
          stats: { covered: 1, partial: 0, gap: 1 } },
        meta: { recalled: 6, requirements: 2, merged: 2 } }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      ok: true, answer: '我主导过 6 套系统。', sources: [{ id: 's1', title: '工作经历｜进门财经', excerpt: '切片原文ABC' }],
    }) });
  });
  await page.evaluate(() => {
    const mv = document.querySelector('#aiStage model-viewer, #aiStage .ai-mv, #aiStage #aiActor');
    (mv || document.getElementById('aiStage')).dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await page.waitForTimeout(900);
  check('3D 角色点击开面板', await page.evaluate(() => !document.getElementById('aiPanel').hidden));
  check('欢迎语渲染', (await page.evaluate(() => document.querySelector('.ai-msg .ai-bubble')?.textContent || '')).includes('数字分身'));
  check('面板窗口层按钮', await page.evaluate(() => !!document.getElementById('aiWinSize')));

  await page.fill('#aiInput', '你主导过哪些 0→1 系统？');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(900);
  check('问答回答渲染', (await page.evaluate(() => document.querySelector('.ai-msg-bot:last-child .ai-bubble')?.textContent || '')).includes('6 套系统'));
  await page.click('.ai-src').catch(() => {});
  await page.waitForTimeout(300);
  check('依据展开切片原文', await page.evaluate(() => !!document.querySelector('.ai-src-body')));

  await page.click('[data-ai-mode="jd"]');
  await page.waitForTimeout(300);
  await page.click('[data-jd-sample="agent"]');
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1200);
  const jd = await page.evaluate(() => ({
    card: !!document.querySelector('.ai-jd-card'),
    score: document.querySelector('.ai-jd-score b')?.textContent || '',
    rows: document.querySelectorAll('.ai-jd-item').length,
  }));
  check('JD 结果卡渲染', jd.card && jd.score === '72' && jd.rows === 2);

  await page.click('[data-jd-open]');
  await page.waitForTimeout(1400);
  check('JD 预填链跳独立页', page.url().includes('jd.html') && (await page.inputValue('#jdText')).includes('Agent'));
  await page.goBack();
  await page.waitForTimeout(2600);

  /* ③ 项目模态框 */
  await page.evaluate(() => document.querySelector('.proj-card').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(700);
  await page.click('.proj-card');
  await page.waitForTimeout(600);
  const modal = await page.evaluate(() => ({ open: !document.getElementById('projModal').hidden, t: (document.getElementById('modalTitle').textContent || '').slice(0, 6) }));
  check('项目模态框打开', modal.open && modal.t.length > 2);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check('模态框 Esc 关闭', await page.evaluate(() => !!document.getElementById('projModal').hidden));

  /* ④ 分享卡（canvas 绘制成功才显示按钮） */
  check('分享卡按钮可见', await page.evaluate(() => !document.getElementById('shareBtn').hidden));
  await page.click('#shareBtn').catch(() => {});
  await page.waitForTimeout(500);
  check('分享预览弹窗', await page.evaluate(() => !document.getElementById('shareOverlay').hidden));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  /* ⑤ 公司档案抽屉（data-cp 整卡委托） */
  const drawer = await page.evaluate(async () => {
    document.querySelector('.exp-card[data-cp]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 900));
    const d = document.querySelector('.cp-drawer, .cp-modal, [class*="drawer"]');
    return !!d && (d.textContent || '').includes('深');
  });
  check('公司档案抽屉打开', drawer);

  /* ⑥ 主题彩蛋：EOF 三连击 → 下一套主题 */
  const egg = await page.evaluate(async () => {
    const eof = document.getElementById('eofEgg');
    for (let i = 0; i < 3; i++) eof.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 200));
    document.getElementById('themeNextBtn').click();
    await new Promise(r => setTimeout(r, 200));
    return document.documentElement.getAttribute('data-theme');
  });
  check('EOF 彩蛋 + 主题切换', egg === 'blueprint' || egg === 'noir' || egg === 'newsprint');

  /* ⑦ 汉堡菜单（bar-tight） */
  const menu = await page.evaluate(async () => {
    document.body.classList.add('bar-tight');
    document.getElementById('menuBtn').click();
    await new Promise(r => setTimeout(r, 150));
    return document.getElementById('nav').classList.contains('open');
  });
  check('移动菜单展开', menu);

  /* ⑧ 留言墙本地降级态（无 API → 明确提示而非空白） */
  const wall = await page.evaluate(() => (document.querySelector('.wall-error')?.textContent || '').slice(0, 10));
  check('留言墙降级提示', wall.includes('本地静态'));

  console.log(`\nM3-A E2E：通过 ${passed} / 失败 ${failed}`);
  if (failed) process.exitCode = 1;
} finally {
  await browser.close();
}
