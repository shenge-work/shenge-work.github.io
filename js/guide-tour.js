/* ════════════════════════════════════════════════════════════
   桌宠行为导览 · DOM 编排层（guide-tour.js）P0
   --------------------------------------------------------------
   读浏览器内行为（板块停留、滚动静止）→ 决策（guide-core）
   → 出一张字幕卡 → 用户点 CTA 才执行动作。

   P0 边界：只有 G03 / G06 / G08 三条板块级脚本；**不自动出声**，
   卡片上留「点我听」按钮，在用户手势内同步调用 AIVoice.speak()。
   不碰 main.js / ai-voice.js / ai-stage-link.js 的内部。

   依赖：guide-core.js（先加载）、data/site-data.js、ai-skins.js
          （提供 #aiStage 与 #aiSkinMenu）、ai-stage-link.js、analytics.js
   调试：window.CPGuide.status() / .demo('G03') / .reset()
   ════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var Core = window.GuideCore;
  if (!Core) return;

  var SS_KEY = 'cpGuideSessionV1';
  var LS_KEY = 'cpGuidePrefsV1';
  var FIRST_8S = 8000;
  var FAST_WINDOW = 1800;
  var FAST_FREEZE = 5000;

  var config = null;
  var scripts = [];
  var bootAt = Date.now();
  var started = false;
  var stopped = false;
  var current = null;
  var hideTimer = null;
  var dwellTimer = null;
  var settleTimer = null;
  var card = null;
  var observer = null;
  var aiObserver = null;
  var visible = {};
  var entries = [];
  var fastScrollUntil = 0;
  var session = { shownIds: [], shownCount: 0, lastShownAt: 0, lastSectionAt: {}, aiEngaged: false };
  var prefs = { quietUntil: 0, dismissed: {} };

  /* ── 存储：隐私模式下静默降级到内存 ───────────────────────── */
  function readStore(store, key) {
    try {
      var raw = store.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function writeStore(store, key, value) {
    try { store.setItem(key, JSON.stringify(value)); } catch (e) {}
  }
  function loadState() {
    var s = readStore(window.sessionStorage, SS_KEY);
    if (s && typeof s === 'object') {
      session.shownIds = Array.isArray(s.shownIds) ? s.shownIds : [];
      session.shownCount = Number(s.shownCount) || 0;
      session.lastShownAt = Number(s.lastShownAt) || 0;
      session.lastSectionAt = s.lastSectionAt && typeof s.lastSectionAt === 'object' ? s.lastSectionAt : {};
      session.aiEngaged = !!s.aiEngaged;
    }
    var p = readStore(window.localStorage, LS_KEY);
    if (p && typeof p === 'object') {
      prefs.quietUntil = Number(p.quietUntil) || 0;
      prefs.dismissed = p.dismissed && typeof p.dismissed === 'object' ? p.dismissed : {};
    }
  }
  function saveSession() { writeStore(window.sessionStorage, SS_KEY, session); }
  function savePrefs() { writeStore(window.localStorage, LS_KEY, prefs); }

  function isQuiet() { return prefs.quietUntil > Date.now(); }

  /* ── 埋点：analytics.js 未就绪时静默跳过 ─────────────────── */
  function track(name, data) {
    try {
      if (typeof window.portfolioTrack === 'function') window.portfolioTrack(name, data || {});
    } catch (e) {}
  }

  /* ── 抑制上下文 ─────────────────────────────────────────── */
  function isTyping(el) {
    if (!el || el.nodeType !== 1) return false;
    var tag = (el.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' ||
      el.isContentEditable || el.getAttribute('contenteditable') === 'true';
  }
  function notHidden(sel) {
    var el = document.querySelector(sel);
    return !!el && !el.hidden;
  }
  function buildCtx() {
    var status = null;
    try {
      status = window.AIVoice && window.AIVoice.getStatus ? window.AIVoice.getStatus() : null;
    } catch (e) {}
    return {
      now: Date.now(),
      quiet: isQuiet(),
      dismissed: prefs.dismissed,
      shownIds: session.shownIds,
      shownCount: session.shownCount,
      lastShownAt: session.lastShownAt,
      lastSectionAt: session.lastSectionAt,
      panelOpen: notHidden('#aiPanel'),
      modalOpen: notHidden('#projModal') || notHidden('.cp-lightbox'),
      drawerOpen: notHidden('.cp-drawer'),
      composerFocused: isTyping(document.activeElement),
      docHidden: !!document.hidden,
      voiceBusy: !!(status && status.speaking),
      fastScrollUntil: fastScrollUntil,
      aiEngaged: session.aiEngaged,
      firstWindow: Date.now() - bootAt < FIRST_8S
    };
  }
  function ctxForCore() {
    var ctx = buildCtx();
    if (ctx.firstWindow) ctx.fastScrollUntil = ctx.now + 1; // 首屏 8 秒统一抑制
    return ctx;
  }

  /* ── 字幕卡 ─────────────────────────────────────────────── */
  function sectionLabel(section) {
    var el = document.getElementById(section);
    var no = el && el.querySelector ? el.querySelector('.section-no') : null;
    return no ? (no.textContent || '').trim() : 'GUIDE';
  }
  function place() {
    if (!card) return;
    var stage = document.getElementById('aiStage');
    if (!stage) return;
    var r = stage.getBoundingClientRect();
    var w = card.offsetWidth;
    var h = card.offsetHeight;
    var left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
    var top = Math.max(8, r.top - h - 14);
    card.style.left = left + 'px';
    card.style.top = top + 'px';
  }
  function hideCard(reason) {
    if (!current) return;
    var script = current;
    current = null;
    if (hideTimer) clearTimeout(hideTimer);
    if (card) {
      card.classList.remove('is-on');
      card.setAttribute('aria-hidden', 'true');
      var node = card;
      /* 用独立计时器清理节点：showCard 会重置 hideTimer，
         若共用一个计时器，快速切换时旧卡会永远留在 DOM 里 */
      setTimeout(function () { if (node.parentNode) node.remove(); }, 260);
    }
    if (reason === 'dismiss' || reason === 'quiet' || reason === 'cta') {
      document.body.classList.remove('cp-guide-active');
    }
    track('guide_hide', { id: script.id, reason: reason || 'timeout' });
  }
  function showCard(script) {
    if (current || !script) return;
    var ctx = buildCtx();
    current = script;
    document.body.classList.add('cp-guide-active');

    card = document.createElement('div');
    card.className = 'cp-guide-card';
    card.setAttribute('role', 'status');
    card.setAttribute('aria-live', 'polite');
    card.setAttribute('aria-hidden', 'false');

    var top = document.createElement('div');
    top.className = 'cp-guide-top';
    var no = document.createElement('span');
    no.className = 'cp-guide-no';
    no.textContent = sectionLabel(script.section) + ' · ' + (script.title || '');
    var x = document.createElement('button');
    x.type = 'button';
    x.className = 'cp-guide-x';
    x.setAttribute('aria-label', '关闭这条导览');
    x.textContent = '×';
    top.appendChild(no);
    top.appendChild(x);

    var caption = document.createElement('p');
    caption.className = 'cp-guide-caption';
    caption.textContent = script.caption || script.speech || '';

    var acts = document.createElement('div');
    acts.className = 'cp-guide-acts';
    var cta = document.createElement('button');
    cta.type = 'button';
    cta.className = 'cp-guide-cta';
    cta.textContent = (script.cta && script.cta.label) || '去看看 →';
    var listen = document.createElement('button');
    listen.type = 'button';
    listen.className = 'cp-guide-listen';
    listen.textContent = '点我听';
    var quiet = document.createElement('button');
    quiet.type = 'button';
    quiet.className = 'cp-guide-quiet';
    quiet.textContent = '安静模式';
    acts.appendChild(cta);
    acts.appendChild(listen);
    acts.appendChild(quiet);

    card.appendChild(top);
    card.appendChild(caption);
    card.appendChild(acts);
    document.body.appendChild(card);
    card.dataset.guideId = script.id;
    place();
    requestAnimationFrame(function () { if (card) card.classList.add('is-on'); });

    x.addEventListener('click', function () {
      prefs.dismissed[script.id] = Date.now();
      savePrefs();
      track('guide_dismiss', { id: script.id, mode: 'single' });
      hideCard('dismiss');
    });
    quiet.addEventListener('click', function () {
      setQuiet(true);
      track('guide_dismiss', { id: script.id, mode: 'quiet' });
      hideCard('quiet');
    });
    listen.addEventListener('click', function () {
      // 必须在用户手势内同步调用，iOS 不接受 setTimeout 后再 speak
      var ok = false;
      try {
        if (window.AIVoice && typeof window.AIVoice.speak === 'function') {
          window.AIVoice.speak(script.speech || script.caption, { kind: 'guide' });
          ok = true;
        }
      } catch (e) {}
      track('guide_voice', { id: script.id, channel: 'tap', blocked: !ok });
    });
    cta.addEventListener('click', function () {
      track('guide_cta', { id: script.id, action: (script.cta && script.cta.action) || '' });
      hideCard('cta');
      runAction(script.cta && script.cta.action, script);
    });

    var hold = Number(config.holdMs) || 9000;
    hideTimer = setTimeout(function () { hideCard('timeout'); }, hold);

    session.shownIds.push(script.id);
    session.shownCount += 1;
    session.lastShownAt = Date.now();
    session.lastSectionAt[script.section] = Date.now();
    saveSession();
    track('guide_shown', {
      id: script.id,
      trigger: (script.trigger && script.trigger.type) || 'section-dwell',
      section: script.section
    });
  }

  /* ── 动作：绝不自动滚动，全部由点击触发 ─────────────────── */
  function openCompany(id) {
    var el = document.querySelector('[data-cp="' + id + '"]');
    if (el && typeof el.click === 'function') { el.click(); return; }
    // 卡片还没渲染：交给加载器，等档案脚本就绪后由它自己打开
    if (window.CompanyProfile && typeof window.CompanyProfile.open === 'function') {
      window.CompanyProfile.open(id);
      return;
    }
    if (window.CompanyLazy && typeof window.CompanyLazy.load === 'function') {
      window.CompanyLazy.load();
      var tries = 0;
      var poll = setInterval(function () {
        tries += 1;
        if (window.CompanyProfile && typeof window.CompanyProfile.open === 'function') {
          clearInterval(poll);
          window.CompanyProfile.open(id);
        } else if (tries > 40) {
          clearInterval(poll);
        }
      }, 200);
    }
  }
  function runAction(action, script) {
    if (!action) return;
    if (action.indexOf('section:') === 0) {
      var id = action.slice(8);
      if (window.CPAI_STAGE_LINK && typeof window.CPAI_STAGE_LINK.travel === 'function') {
        window.CPAI_STAGE_LINK.travel(id);
      } else {
        var target = document.getElementById(id);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } else if (action.indexOf('company:') === 0) {
      openCompany(action.slice(8));
    } else if (action.indexOf('school:') === 0) {
      window.location.href = 'school.html?c=' + encodeURIComponent(action.slice(7));
    } else if (action.indexOf('project:') === 0) {
      var cardEl = document.querySelector('[data-proj="' + action.slice(8) + '"]');
      if (cardEl) cardEl.click();
    } else if (action === 'mailto') {
      var mail = (window.SITE_DATA && window.SITE_DATA.contact &&
        window.SITE_DATA.contact.cards || []).filter(function (c) {
        return c.href && c.href.indexOf('mailto:') === 0;
      })[0];
      var addr = mail ? mail.href.replace(/^mailto:/, '') : 'hi@chenpeisheng.cn';
      var subject = encodeURIComponent('求职意向 · 来自作品集导览');
      window.location.href = 'mailto:' + addr + '?subject=' + subject;
    } else if (action === 'jd' || action === 'resume') {
      window.location.href = (action === 'jd' ? 'jd.html' : 'resume.html') + '?from=guide';
    } else if (action === 'ai' && window.document.getElementById('aiFab')) {
      document.getElementById('aiFab').click();
    }
    if (script) script.__guideActionDone = true;
  }

  /* ── 开关：挂到已有皮肤菜单，不加新的浮动按钮 ───────────── */
  function setQuiet(on) {
    prefs.quietUntil = on ? Date.now() + 7 * 24 * 3600 * 1000 : 0;
    savePrefs();
    syncToggle();
    if (on && current) hideCard('quiet');
  }
  function syncToggle() {
    var on = document.querySelector('#aiSkinMenu [data-cp-guide="on"]');
    var off = document.querySelector('#aiSkinMenu [data-cp-guide="off"]');
    if (on) on.classList.toggle('is-active', !isQuiet());
    if (off) off.classList.toggle('is-active', isQuiet());
  }
  function mountToggle() {
    var foot = document.querySelector('#aiSkinMenu .ai-skin-menu-foot');
    if (!foot || document.getElementById('cpGuideToggle')) return;
    var box = document.createElement('div');
    box.className = 'cp-guide-toggle';
    box.id = 'cpGuideToggle';
    var label = document.createElement('span');
    label.textContent = '桌宠导览';
    var on = document.createElement('button');
    on.type = 'button';
    on.setAttribute('data-cp-guide', 'on');
    on.textContent = '开';
    var off = document.createElement('button');
    off.type = 'button';
    off.setAttribute('data-cp-guide', 'off');
    off.textContent = '安静 7 天';
    box.appendChild(label);
    box.appendChild(on);
    box.appendChild(off);
    foot.appendChild(box);
    on.addEventListener('click', function (e) {
      e.stopPropagation();
      setQuiet(false);
      track('guide_dismiss', { mode: 'toggle-on' });
    });
    off.addEventListener('click', function (e) {
      e.stopPropagation();
      setQuiet(true);
      track('guide_dismiss', { mode: 'toggle-quiet' });
    });
    syncToggle();
  }

  /* ── 行为采集 ───────────────────────────────────────────── */
  function noteFastScroll(id) {
    var now = Date.now();
    entries.push({ id: id, t: now });
    entries = entries.filter(function (e) { return now - e.t <= FAST_WINDOW; });
    var distinct = {};
    entries.forEach(function (e) { distinct[e.id] = 1; });
    if (Object.keys(distinct).length >= 2) fastScrollUntil = now + FAST_FREEZE;
  }
  function activeSections() {
    return scripts.filter(function (s) { return visible[s.section]; });
  }
  function restartDwell() {
    if (stopped || current || isQuiet()) return;
    if (dwellTimer) clearTimeout(dwellTimer);
    if (settleTimer) clearTimeout(settleTimer);
    var active = activeSections();
    if (!active.length) return;
    settleTimer = setTimeout(function () {
      dwellTimer = setTimeout(function () {
        var ctx = ctxForCore();
        if (ctx.firstWindow || ctx.fastScrollUntil > ctx.now) return;
        var candidates = activeSections();
        var picked = Core.choose(candidates, ctx, config);
        if (picked) {
          showCard(picked);
        } else {
          // 只上报「规则拦住了谁」，便于判断阈值是否过严
          Core.reasons(candidates, ctx, config).forEach(function (r) {
            if (r.reason) track('guide_suppressed', { id: r.id, reason: r.reason });
          });
        }
      }, Number(config.dwellMs) || 1800);
    }, Number(config.settleMs) || 350);
  }
  function observeSections() {
    if (!('IntersectionObserver' in window)) return;
    var ids = [];
    scripts.forEach(function (s) { if (ids.indexOf(s.section) === -1) ids.push(s.section); });
    var targets = ids.map(function (id) { return document.getElementById(id); }).filter(Boolean);
    if (!targets.length) return;
    observer = new IntersectionObserver(function (list) {
      list.forEach(function (e) {
        visible[e.target.id] = e.isIntersecting && e.intersectionRatio >= 0.3;
        if (!e.isIntersecting && current && current.section === e.target.id) hideCard('left-section');
        if (e.isIntersecting) noteFastScroll(e.target.id);
      });
      restartDwell();
    }, { threshold: [0, 0.35, 0.6] });
    targets.forEach(function (t) { observer.observe(t); });
  }
  function observeAi() {
    var body = document.getElementById('aiBody');
    if (!body || !('MutationObserver' in window)) return;
    aiObserver = new MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) {
        var added = list[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var n = added[j];
          if (n && n.nodeType === 1 && n.classList &&
              (n.classList.contains('ai-msg-user') || n.querySelector('.ai-msg-user'))) {
            session.aiEngaged = true;
            saveSession();
            if (current) hideCard('ai-engaged');
            aiObserver.disconnect();
            return;
          }
        }
      }
    });
    aiObserver.observe(body, { childList: true, subtree: true });
  }

  /* ── 启动 ───────────────────────────────────────────────── */
  function start() {
    if (started || stopped) return;
    started = true;
    if (!config || !config.enabled) return;
    mountToggle();
    observeSections();
    observeAi();
    window.addEventListener('scroll', restartDwell, { passive: true });
    window.addEventListener('resize', place, { passive: true });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && current) hideCard('document-hidden');
    });
  }

  function init() {
    var raw = (window.SITE_DATA && window.SITE_DATA.guide) ||
      (window.__SITE_DATA__ && window.__SITE_DATA__.guide) || null;
    if (!raw || raw.enabled === false) return;
    config = raw;
    scripts = Array.isArray(raw.scripts) ? raw.scripts : [];
    if (!scripts.length) return;
    loadState();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
      start();
    }
  }

  window.CPGuide = {
    status: function () {
      return {
        started: started,
        enabled: !!(config && config.enabled),
        quiet: isQuiet(),
        current: current ? current.id : null,
        shown: session.shownIds.slice(),
        count: session.shownCount,
        aiEngaged: session.aiEngaged,
        fastScrollUntil: fastScrollUntil
      };
    },
    demo: function (id) {
      for (var i = 0; i < scripts.length; i++) {
        if (scripts[i].id === id) {
          if (current) hideCard('demo');
          showCard(scripts[i]);
          return true;
        }
      }
      return false;
    },
    quiet: setQuiet,
    reset: function () {
      session = { shownIds: [], shownCount: 0, lastShownAt: 0, lastSectionAt: {}, aiEngaged: false };
      prefs = { quietUntil: 0, dismissed: {} };
      saveSession();
      savePrefs();
      if (current) hideCard('reset');
      if (hideTimer) clearTimeout(hideTimer);
      if (dwellTimer) clearTimeout(dwellTimer);
      if (settleTimer) clearTimeout(settleTimer);
      visible = {};
      entries = [];
      fastScrollUntil = 0;
      syncToggle();
    },
    stop: function () {
      stopped = true;
      if (observer) observer.disconnect();
      if (aiObserver) aiObserver.disconnect();
      if (hideTimer) clearTimeout(hideTimer);
      if (dwellTimer) clearTimeout(dwellTimer);
      if (settleTimer) clearTimeout(settleTimer);
      if (current) hideCard('stop');
    }
  };

  init();
})();
