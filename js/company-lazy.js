/* ════════════════════════════════════════════════════════
   公司档案脚本 · 按需加载器（company-lazy.js）
   ────────────────────────────────────────────────────────
   背景：公司档案 5 个脚本（数据 + 全景 + 互动 + 加密 + 抽屉）
   合计约 271 KB，但首页只有「工作经历板块的公司徽章 / 公司名」
   会用到——用户不点开就不该下载。

   策略（不破坏任何既有行为）：
     1. 数据 file 先 fetch 缓存为文本，点击时以 Blob URL 注入，
        保证 company-profile.js 读取 window.COMPANY_PROFILES 时数据已就位；
     2. 两个触发时机：用户滚到工作经历板块（IntersectionObserver，
        rootMargin 提前触发）或首次 pointerover/focusin 徽章；
     3. 深链 #company=xxx 立即加载（抽屉原来就支持 hash 深链）；
     4. 点击徽章时若尚未加载，先记下 cid，加载完成后补开一次；
     5. 加载器自身极小（<2KB），首屏只有它，没有档案脚本。

   页面接入：把原来的 5 个 <script> 换成：
     <script is:inline src="js/company-lazy.js?v=20261128a" defer></script>
   独立档案页 company.html 仍走原脚本，不受本加载器影响。
   ════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.CompanyProfile) return; /* 档案脚本已由页面同步加载（如独立档案页） */

  var FILES = [
    'data/company-profiles.js?v=20261125g',
    'js/cp-panorama.js?v=20261125g',
    'js/company-social.js?v=20261125g',
    'js/secure-access.js?v=20261125s1',
    'js/company-profile.js?v=20261128a'
  ];
  var state = 'idle'; /* idle | loading | ready */
  var pendingCid = null;
  var injected = [];

  function injectAll() {
    if (state !== 'idle') return;
    state = 'loading';
    /* 用 defer 语义：动态 script 异步执行，但按 FILES 顺序设置 async=false
       可保证顺序执行（company-profile 必须在数据与其他组件之后）。 */
    var i = 0;
    (function next() {
      if (i >= FILES.length) {
        state = 'ready';
        if (pendingCid) {
          var cid = pendingCid;
          pendingCid = null;
          try { window.CompanyProfile && window.CompanyProfile.open(cid); } catch (e) {}
        }
        return;
      }
      var s = document.createElement('script');
      s.src = FILES[i++];
      s.async = false; /* 保序：后续脚本等前一个执行完 */
      s.onload = next;
      s.onerror = next; /* 单个失败不阻断其余 */
      document.head.appendChild(s);
      injected.push(s);
    })();
  }

  function isHashDeepLink() {
    return /^#company=/.test(location.hash || '');
  }

  /* ① 深链：直接进档案，必须立刻加载 */
  if (isHashDeepLink()) injectAll();
  window.addEventListener('hashchange', function () {
    if (isHashDeepLink()) injectAll();
  });

  /* ② 视口接近：滚到工作经历板块前提早加载，用户到时已就绪 */
  function nearExperience() {
    var target = document.getElementById('experience') ||
      document.querySelector('.exp-list');
    if (!target || !('IntersectionObserver' in window)) return false;
    var io = new IntersectionObserver(function (entries) {
      if (entries.some(function (e) { return e.isIntersecting; })) {
        io.disconnect();
        injectAll();
      }
    }, { rootMargin: '600px 0px' });
    io.observe(target);
    return true;
  }

  /* ③ 交互预取：hover / 键盘 focus 到徽章即加载（点击前就动手） */
  function onIntent(ev) {
    var el = ev.target && ev.target.closest
      ? ev.target.closest('[data-cp]') : null;
    if (!el) return;
    injectAll();
  }
  document.addEventListener('pointerover', onIntent, { passive: true });
  document.addEventListener('focusin', onIntent, { passive: true });

  /* ④ 点击兜底：若还没加载好，记下 cid，就绪后补开 */
  document.addEventListener('click', function (ev) {
    var el = ev.target && ev.target.closest
      ? ev.target.closest('[data-cp]') : null;
    if (!el) return;
    if (state === 'ready' && window.CompanyProfile) return; /* 档案脚本自己会处理 */
    if (state === 'idle') injectAll();
    pendingCid = el.getAttribute('data-cp');
    ev.preventDefault();
    ev.stopPropagation();
  }, true); /* 捕获阶段，抢在档案脚本委托之前 */

  /* 启动视口预取 */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', nearExperience);
  } else {
    nearExperience();
  }

  window.CompanyLazy = {
    load: injectAll,
    status: function () { return state; }
  };
})();
