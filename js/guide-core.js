/* ════════════════════════════════════════════════════════════
   桌宠行为导览 · 决策纯函数（guide-core.js）
   --------------------------------------------------------------
   这一层不碰 DOM、不读 window、不计时：只回答「此刻这条脚本
   该不该出现」以及「一堆候选里选哪一条」。DOM 观察、冷却计时、
   字幕卡渲染全部在 guide-tour.js。拆开是为了能直接 node:test。

   浏览器：<script src="js/guide-core.js"> → window.GuideCore
   测试：  import '../js/guide-core.js' → globalThis.GuideCore
   ════════════════════════════════════════════════════════════ */
(function (root, factory) {
  var api = factory();
  if (root) root.GuideCore = api;
  if (typeof module === 'object' && module && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DEFAULTS = {
    maxPerSession: 4,
    globalCooldownMs: 25000,
    sectionCooldownMs: 60000
  };

  function num(v, fallback) {
    return typeof v === 'number' && isFinite(v) && v >= 0 ? v : fallback;
  }

  function configOf(raw) {
    var c = raw || {};
    return {
      maxPerSession: num(c.maxPerSession, DEFAULTS.maxPerSession),
      globalCooldownMs: num(c.globalCooldownMs, DEFAULTS.globalCooldownMs),
      sectionCooldownMs: num(c.sectionCooldownMs, DEFAULTS.sectionCooldownMs)
    };
  }

  /* 统一的 ctx 形状（DOM 层负责填）：
     now              当前时间戳（ms）
     quiet            安静模式开启
     dismissed        已点 × 的脚本 id 集合（对象/数组/Set 都行）
     shownIds         本会话已展示过的脚本 id 集合
     shownCount       本会话已展示条数
     lastShownAt      上一条展示时间（ms），没有则 0
     lastSectionAt    { [section]: 上次展示时间（ms） }
     panelOpen        AI 面板展开
     modalOpen        项目弹窗/图片灯箱打开
     drawerOpen       公司档案抽屉打开
     composerFocused   输入框/留言框聚焦
     docHidden         document.hidden
     voiceBusy         语音正在播报（AI 回答或导览自身）
     fastScrollUntil   快速滚动冻结截止时间戳（ms）
     aiEngaged         本会话用户已发起过问答
  */
  function has(list, id) {
    if (!list) return false;
    if (typeof list.has === 'function') return list.has(id);
    if (Array.isArray(list)) return list.indexOf(id) !== -1;
    return Object.prototype.hasOwnProperty.call(list, id) && !!list[id];
  }

  /**
   * 返回抑制原因字符串；null 表示可以展示。
   * 顺序即优先级：越靠前的原因越适合埋点归因。
   */
  function shouldSuppress(script, ctx, rawConfig) {
    var c = configOf(rawConfig);
    var s = ctx || {};
    var now = num(s.now, Date.now());
    if (!script || !script.id) return 'invalid-script';

    if (s.quiet) return 'quiet';
    if (has(s.dismissed, script.id)) return 'dismissed';
    if (s.aiEngaged) return 'ai-engaged';
    if (s.panelOpen) return 'panel-open';
    if (s.modalOpen) return 'modal-open';
    if (s.drawerOpen) return 'drawer-open';
    if (s.composerFocused) return 'composer-focused';
    if (s.docHidden) return 'document-hidden';
    if (s.voiceBusy) return 'voice-busy';
    if (num(s.fastScrollUntil, 0) > now) return 'fast-scroll';

    if (has(s.shownIds, script.id)) return 'already-shown';
    if (num(s.shownCount, 0) >= c.maxPerSession) return 'session-cap';

    var lastShown = num(s.lastShownAt, 0);
    if (lastShown && now - lastShown < c.globalCooldownMs) return 'global-cooldown';

    var sectionAt = s.lastSectionAt || {};
    var lastSection = num(sectionAt[script.section], 0);
    if (lastSection && now - lastSection < c.sectionCooldownMs) return 'section-cooldown';

    return null;
  }

  function priorityOf(script) {
    return num(script && script.priority, 0);
  }

  /**
   * 从候选脚本里挑出此刻唯一可展示的一条。
   * 同优先级保持传入顺序（即 data 里的板块顺序），不做随机。
   */
  function choose(scripts, ctx, rawConfig) {
    if (!Array.isArray(scripts) || !scripts.length) return null;
    var best = null;
    var bestPriority = -Infinity;
    for (var i = 0; i < scripts.length; i++) {
      var script = scripts[i];
      if (shouldSuppress(script, ctx, rawConfig)) continue;
      var p = priorityOf(script);
      if (p > bestPriority) {
        best = script;
        bestPriority = p;
      }
    }
    return best;
  }

  /** 埋点用：把 ctx 里的抑制项压成可读原因，方便调试阈值是否过严。 */
  function reasons(scripts, ctx, rawConfig) {
    if (!Array.isArray(scripts)) return [];
    return scripts.map(function (s) {
      return { id: s && s.id, reason: shouldSuppress(s, ctx, rawConfig) };
    });
  }

  return {
    DEFAULTS: DEFAULTS,
    configOf: configOf,
    has: has,
    shouldSuppress: shouldSuppress,
    choose: choose,
    reasons: reasons
  };
});
