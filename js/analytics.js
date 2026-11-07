/* ══════════════════════════════════════════════════════════════════════
   站点可观测埋点 · ANALYTICS
   ──────────────────────────────────────────────────────────────────────
   接两家免费服务，配置留空就不加载、不发任何请求：
     · Umami Cloud  —— 访问统计（PV / UV / 来源 / 设备 / 自定义事件）
     · Microsoft Clarity —— 行为录屏 + 热点图（可选）
   只需填下面 CONFIG，其余代码不用动。
   file:// 双击打开、localhost 预览时自动跳过，不会污染线上数据。
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var CONFIG = {
    /* Umami Cloud：Dashboard → 你的站点 → Settings → Website ID（UUID） */
    umamiWebsiteId: '5c0668b9-2d66-4cfc-ac6b-b0df4cc570bc',
    umamiScriptSrc: 'https://cloud.umami.is/script.js',

    /* Microsoft Clarity：Project ID（10 位字母数字），不需要可留空 */
    clarityProjectId: 'z9bfezprgd',

    /* 是否记录浏览深度（25% / 50% / 75% / 100%） */
    trackScrollDepth: true
  };

  /* 防重复加载 */
  if (window.__portfolioAnalyticsLoaded) return;
  window.__portfolioAnalyticsLoaded = true;

  var host = location.hostname;
  if (location.protocol === 'file:' || !host || host === 'localhost' || host === '127.0.0.1' || host.indexOf('192.168.') === 0) return;

  /* ── 服务加载 ─────────────────────────────────────────────────────── */
  function loadUmami() {
    if (!CONFIG.umamiWebsiteId) return;
    var s = document.createElement('script');
    s.defer = true;
    s.src = CONFIG.umamiScriptSrc;
    s.setAttribute('data-website-id', CONFIG.umamiWebsiteId);
    document.head.appendChild(s);
  }

  function loadClarity() {
    if (!CONFIG.clarityProjectId) return;
    (function (c, l, a, r, i, t, y) {
      c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
      t = l.createElement(r);
      t.async = 1;
      t.src = 'https://www.clarity.ms/tag/' + i;
      y = l.getElementsByTagName(r)[0];
      y.parentNode.insertBefore(t, y);
    })(window, document, 'clarity', 'script', CONFIG.clarityProjectId);
  }

  /* ── 统一上报出口 ─────────────────────────────────────────────────── */
  function track(name, data) {
    try {
      if (window.umami && typeof window.umami.track === 'function') {
        window.umami.track(name, data || {});
      }
    } catch (e) {}
    try {
      if (typeof window.clarity === 'function') window.clarity('event', name);
    } catch (e) {}
  }
  window.portfolioTrack = track;

  /* ── 页面级基础事件 ───────────────────────────────────────────────── */
  function currentTheme() {
    return document.documentElement.getAttribute('data-theme');
  }

  var page = location.pathname.indexOf('resume') >= 0 ? 'resume' : 'portfolio';
  track('page_kind', { page: page });

  if (currentTheme()) track('theme_view', { theme: currentTheme() });

  /* ── 点击事件：统一委托，不侵入 main.js ───────────────────────────── */
  function attr(el, name) {
    return (el && el.getAttribute) ? (el.getAttribute(name) || '') : '';
  }

  function projectLabel() {
    var no = document.getElementById('modalNo');
    return no ? (no.textContent || '').trim() : '';
  }

  function handleClick(e) {
    var target = e.target;
    if (!target || target.nodeType !== 1) target = target.parentNode;
    if (!target || !target.closest) return;

    /* 项目卡片 → 打开项目档案 */
    var card = target.closest('.proj-card');
    if (card) {
      track('project_open', { project: attr(card, 'data-proj') });
      return;
    }

    var el = target.closest('[data-analytics], button, a');
    if (!el) return;

    /* 显式声明优先：data-analytics="事件名" */
    var custom = attr(el, 'data-analytics');
    if (custom) {
      track(custom, { label: attr(el, 'data-analytics-label') });
      return;
    }

    var id = el.id || '';
    var href = attr(el, 'href');
    var onclick = attr(el, 'onclick');

    /* 固定控件 */
    if (id === 'shareBtn') { track('share_card_open'); return; }
    if (id === 'shareDownload') { track('share_card_download'); return; }
    if (id === 'videoPlay') { track('project_video_play', { project: projectLabel() }); return; }
    if (id === 'menuBtn') { track('menu_toggle'); return; }
    if (id === 'themeNextBtn') { track('theme_switch', { mode: 'next', to: currentTheme() }); return; }
    if (id === 'themeAutoBtn') { track('theme_switch', { mode: 'auto' }); return; }
    if (id === 'eofEgg') { track('eof_click'); return; }
    if (id === 'btnLongImage') { track('resume_long_image'); return; }
    if (id === 'lgDownload') { track('resume_long_image_download'); return; }

    /* 打印 / 导出 */
    if (onclick && onclick.indexOf('print') >= 0) {
      track('resume_print', { mode: onclick.indexOf('printBW') >= 0 ? 'bw' : 'color' });
      return;
    }

    /* 简历页跳转 */
    if (href.indexOf('resume.html') >= 0) {
      track('resume_open', { mode: attr(el, 'target') === '_blank' ? 'preview' : 'view' });
      return;
    }

    /* 联系方式 */
    if (href.indexOf('mailto:') === 0) { track('contact_click', { method: 'email' }); return; }
    if (href.indexOf('tel:') === 0) { track('contact_click', { method: 'phone' }); return; }

    /* 站内锚点 */
    if (href.indexOf('#') === 0 && href.length > 1) {
      track('nav_jump', { section: href.slice(1), from: page });
      return;
    }

    /* 返回主页 */
    if (href.indexOf('index.html') >= 0) { track('back_home'); return; }

    /* 站外链接 */
    if (/^https?:\/\//i.test(href)) {
      var linkHost = href.split('/')[2] || '';
      if (linkHost.indexOf(host) === -1) track('outbound', { host: linkHost, url: href });
    }
  }

  /* ── 浏览深度 ─────────────────────────────────────────────────────── */
  function initScrollDepth() {
    if (!CONFIG.trackScrollDepth) return;
    var marks = [25, 50, 75, 100];
    var fired = {};
    var queued = false;

    function check() {
      queued = false;
      var doc = document.documentElement;
      var scrollTop = window.pageYOffset || doc.scrollTop || 0;
      var total = doc.scrollHeight - window.innerHeight;
      if (total <= 0) return;
      var pct = (scrollTop / total) * 100;
      for (var i = 0; i < marks.length; i++) {
        var m = marks[i];
        if (!fired[m] && pct >= m) {
          fired[m] = 1;
          track('scroll_depth', { depth: m + '%', page: page });
        }
      }
    }

    window.addEventListener('scroll', function () {
      if (queued) return;
      queued = true;
      setTimeout(check, 200);
    }, { passive: true });
    check();
  }

  /* ── 启动 ─────────────────────────────────────────────────────────── */
  document.addEventListener('click', handleClick, true);
  initScrollDepth();
  loadUmami();
  loadClarity();
})();