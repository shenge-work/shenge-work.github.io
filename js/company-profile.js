/* ════════════════════════════════════════════════════════
   公司档案抽屉 · company-profile.js
   ────────────────────────────────────────────────────────
   数据源：data/company-profiles.js 快照（真源 data/company-profiles.json）
   出处：resume.html（工作经历徽章）与 index.html（SEC.04 卡片）共用。

   职责：
     1. 扫描 .cp-quick[data-cp-quick] 填充速览行（quickStats）
     2. 委托监听 .cp-badge[data-cp] 点击 → 打开抽屉
     3. 抽屉：公司档案（本体/业务/融资或业绩图表/知名度/前景/办公环境/来源）
     4. SVG 柱状图（零依赖，hover 显示数值）
     5. 环境图灯箱、hash 深链 (#company=xxx)、Esc / 遮罩关闭
   打印：@media print 隐藏全部 UI（见 company-profile.css）。
   ════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var DATA = (typeof window !== 'undefined' && window.COMPANY_PROFILES) || null;
  var companies = (DATA && DATA.companies) || {};
  var meta = (DATA && DATA.meta) || {};
  /* 长板块展开状态：同一页面会话内记住用户手动展开过的板块（不对刷新持久化，默认仍收起） */
  var foldState = Object.create(null);

  function company(id) { return companies[id] || null; }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function sup(n) {
    return n ? '<sup class="cp-ref">' + esc(n) + '</sup>' : '';
  }

  /* ══════════════ 速览行填充 ══════════════ */
  function fillQuick() {
    var nodes = document.querySelectorAll('.cp-quick[data-cp-quick]');
    for (var i = 0; i < nodes.length; i++) {
      var c = company(nodes[i].getAttribute('data-cp-quick'));
      if (c && c.quickStats && c.quickStats.length) {
        nodes[i].textContent = c.quickStats.join('　·　');
        nodes[i].removeAttribute('hidden');
      }
    }
  }

  /* ══════════════ 工作经历左上角方块：填入公司 logo ══════════════
     main.js 渲染出 .exp-badge[data-cp] 占位，这里按 profileId 取档案 logo；
     logo 路径经 AssetURL 重写到 COS，点击徽章仍走统一的 [data-cp] 委托开抽屉。 */
  function fillExpBadges() {
    var nodes = document.querySelectorAll('.exp-badge[data-cp]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var c = company(el.getAttribute('data-cp'));
      if (!c || !c.logo) continue;
      var src = c.logo;
      if (window.AssetURL && window.AssetURL.of) src = window.AssetURL.of(src);
      el.innerHTML = '<img src="' + esc(src) + '" alt="' + esc(c.shortName || c.name || '') + ' logo">';
      el.classList.add('has-logo');
      var card = el.closest ? el.closest('.exp-card') : null;
      if (card) card.classList.add('has-logo-badge');
    }
  }

  /* ══════════════ SVG 柱状图 ══════════════ */
  function niceCeil(v) {
    if (v <= 0) return 1;
    var mag = Math.pow(10, Math.floor(Math.log(v) / Math.LN10));
    var step = v / mag;
    var nice = step <= 1 ? 1 : step <= 2 ? 2 : step <= 2.5 ? 2.5 : step <= 5 ? 5 : 10;
    return nice * mag;
  }
  function fmtNum(v) {
    if (v >= 100) return String(Math.round(v));
    return String(Math.round(v * 10) / 10);
  }

  function renderChartSVG(metric, unitSuffix) {
    var pts = metric.points || [];
    if (!pts.length) return '';
    var W = 560, H = 240, padL = 46, padR = 14, padT = 26, padB = 34;
    var innerW = W - padL - padR, innerH = H - padT - padB;
    var max = 0;
    for (var i = 0; i < pts.length; i++) max = Math.max(max, Number(pts[i].value) || 0);
    var top = niceCeil(max * 1.12);
    var sx = innerW / pts.length;

    var s = '<svg class="cp-chart-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' +
      esc(metric.label) + '柱状图">';
    /* 网格与 y 轴刻度 */
    for (var g = 0; g <= 4; g++) {
      var gy = padT + innerH - (innerH * g / 4);
      s += '<line x1="' + padL + '" y1="' + gy + '" x2="' + (W - padR) + '" y2="' + gy + '" class="cp-grid"' +
        (g === 0 ? ' class="cp-grid cp-axis"' : '') + '/>';
      s += '<text x="' + (padL - 6) + '" y="' + (gy + 4) + '" class="cp-tick" text-anchor="end">' +
        fmtNum(top * g / 4) + '</text>';
    }
    /* 柱与数值 */
    for (var k = 0; k < pts.length; k++) {
      var v = Number(pts[k].value) || 0;
      var h = Math.max(2, innerH * (v / top));
      var x = padL + sx * k + sx * 0.22;
      var bw = sx * 0.56;
      var y = padT + innerH - h;
      var last = k === pts.length - 1;
      var label = pts[k].label + '：' + fmtNum(v) + (pts[k].note ? '（' + pts[k].note + '）' : '') +
        (unitSuffix || '');
      s += '<g class="cp-bar-g' + (last ? ' is-latest' : '') + '">' +
        '<rect class="cp-bar" x="' + x + '" y="' + y + '" width="' + bw + '" height="' + h + '" rx="1">' +
        '<title>' + esc(label) + '</title></rect>' +
        '<text class="cp-bar-val' + (last ? ' is-latest-text' : '') + '" x="' + (x + bw / 2) + '" y="' +
        (y - 6) + '" text-anchor="middle">' + fmtNum(v) + '</text>' +
        '<text class="cp-tick cp-x" x="' + (x + bw / 2) + '" y="' + (H - 10) + '" text-anchor="middle">' +
        esc(pts[k].label) + '</text></g>';
    }
    s += '</svg>';
    return s;
  }

  function renderChartBlock(c) {
    var ch = c.chart;
    if (!ch || !ch.metrics || !ch.metrics.length) return '';
    var html = '<div class="cp-chart">' +
      '<div class="cp-chart-head"><h4>' + esc(ch.title || '业绩走势') + '</h4>' +
      '<div class="cp-chart-tabs" role="tablist">';
    for (var i = 0; i < ch.metrics.length; i++) {
      html += '<button type="button" class="cp-tab" role="tab" data-metric="' + esc(ch.metrics[i].id) + '"' +
        (i === 0 ? ' aria-selected="true"' : ' aria-selected="false"') + '>' + esc(ch.metrics[i].label) + '</button>';
    }
    html += '</div></div><div class="cp-chart-body">';
    for (var j = 0; j < ch.metrics.length; j++) {
      html += '<div class="cp-chart-panel" data-panel="' + esc(ch.metrics[j].id) + '"' +
        (j === 0 ? '' : ' hidden') + '>' + renderChartSVG(ch.metrics[j], '') + '</div>';
    }
    html += '</div>';
    if (ch.latest) {
      html += '<p class="cp-chart-latest"><span class="cp-latest-dot" aria-hidden="true"></span>' +
        esc(ch.latest) + sup(ch.source || '') + '</p>';
    }
    html += '</div>';
    return html;
  }

  function renderFundingBlock(c) {
    if (!c.funding || !c.funding.rounds || !c.funding.rounds.length) return '';
    var html = '';
    if (c.funding.note) html += '<p class="cp-note">' + esc(c.funding.note) + '</p>';
    html += '<ol class="cp-rounds">';
    for (var i = 0; i < c.funding.rounds.length; i++) {
      var r = c.funding.rounds[i];
      html += '<li class="cp-round' + (i === 0 ? ' is-latest-round' : '') + '">' +
        '<span class="cp-round-dot" aria-hidden="true"></span>' +
        '<div class="cp-round-main"><p class="cp-round-title"><b>' + esc(r.round) + '</b>' +
        '<span class="cp-round-amount">' + esc(r.amount || '金额未公开') + '</span></p>' +
        '<p class="cp-round-meta">' + esc(r.investors || '') + '</p></div>' +
        '<span class="cp-round-date">' + esc(r.date) + '</span>' + sup(r.source || '') + '</li>';
    }
    html += '</ol>';
    return foldableSection('融资历程', html, {
      cid: c.id, key: 'funding', count: c.funding.rounds.length, threshold: 4, foldH: 160
    });
  }

  /* ══════════════ 抽屉 ══════════════ */
  var drawer = null;    /* .cp-drawer 根节点（单例） */
  var lastFocus = null;
  /* 抽屉头部收缩的滞回状态（模块级：buildDrawer 的滚动监听与 open() 都要读写） */
  var headTicking = false, condensed = false;

  function buildDrawer() {
    if (drawer) return drawer;
    drawer = document.createElement('div');
    drawer.className = 'cp-drawer';
    drawer.id = 'cpDrawer';
    drawer.hidden = true;
    drawer.innerHTML =
      '<div class="cp-backdrop" data-cp-close="1"></div>' +
      '<aside class="cp-panel" role="dialog" aria-modal="true" aria-labelledby="cpTitle">' +
      '  <button class="cp-fullscreen" type="button" data-cp-fullscreen aria-label="全屏展开公司档案" aria-pressed="false">' +
      '    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="square"/></svg>' +
      '  </button>' +
      '  <button class="cp-close" type="button" data-cp-close="1" aria-label="关闭公司档案">✕</button>' +
      '  <div class="cp-panel-scroll" id="cpScroll"></div>' +
      '</aside>';
    document.body.appendChild(drawer);

    /* 抽屉头部滚动收缩（移动端为主）：`.cp-head` 是 sticky，完整态在 390px 宽下约 648px
       高，滚动时会把正文可见区压到不足 100px。滚过阈值后给头部加 `is-condensed`，
       CSS 折叠高管轮播 / 一句话 / 标签 / 附属信息行，只留 logo + 公司名 + 行业，
       正文可见区回到 ~630px。监听器只挂一次（drawer 单例），rAF 节流，passive。 */
    var scrollBox = drawer.querySelector('.cp-panel-scroll');
    /* 滞回：收缩会缩短内容、浏览器把 scrollTop 夹小；若进入/退出共用一个阈值，
       会在阈值附近反复「收缩→夹回→展开」抖动。进入慢、退出快，留一段滞回带。 */
    var ENTER_AT = 130, EXIT_AT = 24;
    function syncHeadCondensed() {
      headTicking = false;
      var head = scrollBox.querySelector('.cp-head');
      if (!head) return;
      var top = scrollBox.scrollTop;
      if (!condensed && top > ENTER_AT) condensed = true;
      else if (condensed && top < EXIT_AT) condensed = false;
      head.classList.toggle('is-condensed', condensed);
    }
    scrollBox.addEventListener('scroll', function () {
      if (headTicking) return;
      headTicking = true;
      (window.requestAnimationFrame || function (f) { setTimeout(f, 16); })(syncHeadCondensed);
    }, { passive: true });

    drawer.addEventListener('click', function (ev) {
      var t = ev.target.closest ? ev.target.closest('[data-cp-close]') : null;
      if (t) { ev.preventDefault(); close(); return; }
      var full = ev.target.closest ? ev.target.closest('[data-cp-fullscreen]') : null;
      if (full) { ev.preventDefault(); toggleFullscreen(); return; }
      var tab = ev.target.closest ? ev.target.closest('.cp-tab') : null;
      if (tab) { switchTab(tab); return; }
      /* 相册图片点击统一由 start() 里的全文档委托处理（抽屉 / 独立页共用） */
    });
    drawer.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Escape') return;
      if (drawer.classList.contains('is-fullscreen')) {
        ev.preventDefault();
        ev.stopPropagation();
        setFullscreen(false);
        return;
      }
      close();
    });
    return drawer;
  }

  /* 抽屉全屏切换：按钮、aria 状态与图标同步；关闭抽屉时自动复位 */
  var FS_ICON_OPEN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="square"/></svg>';
  var FS_ICON_EXIT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="square"/></svg>';

  function setFullscreen(on) {
    if (!drawer) return;
    drawer.classList.toggle('is-fullscreen', !!on);
    var btn = drawer.querySelector('[data-cp-fullscreen]');
    if (!btn) return;
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.setAttribute('aria-label', on ? '退出全屏' : '全屏展开公司档案');
    btn.innerHTML = on ? FS_ICON_EXIT : FS_ICON_OPEN;
  }

  function toggleFullscreen() {
    if (!drawer) return;
    setFullscreen(!drawer.classList.contains('is-fullscreen'));
  }

  function switchTab(tab) {
    var wrap = tab.closest('.cp-chart');
    if (!wrap) return;
    var tabs = wrap.querySelectorAll('.cp-tab');
    var panels = wrap.querySelectorAll('.cp-chart-panel');
    for (var i = 0; i < tabs.length; i++) {
      var active = tabs[i] === tab;
      tabs[i].setAttribute('aria-selected', active ? 'true' : 'false');
    }
    var mid = tab.getAttribute('data-metric');
    for (var j = 0; j < panels.length; j++) {
      panels[j].hidden = panels[j].getAttribute('data-panel') !== mid;
    }
  }

  function kpiBlock(c) {
    var html = '<div class="cp-kpis">';
    (c.kpis || []).forEach(function (k) {
      html += '<div class="cp-kpi"><strong>' + esc(k.value) + sup(k.source || '') + '</strong>' +
        '<span>' + esc(k.label) + '</span>' +
        (k.sub ? '<em>' + esc(k.sub) + '</em>' : '') + '</div>';
    });
    return html + '</div>';
  }

  /* 头部高管轮播：数据与 BOSS 板块的高管卡片同源，头像缺失时退化为字标 */
  function execPhotoUrl(f) {
    var url = (f && f.photo) || '';
    if (url && window.AssetURL && window.AssetURL.of) url = window.AssetURL.of(url);
    return url;
  }
  function execPhotoHtml(f, cls) {
    var url = execPhotoUrl(f);
    if (url) {
      return '<img class="' + cls + '" src="' + esc(url) + '" alt="' + esc(f.name || '') + '">';
    }
    return '<span class="' + cls + ' is-placeholder" aria-hidden="true">' +
      esc(((f && f.name) || '?').charAt(0)) + '</span>';
  }
  function execBioHtml(f, cls) {
    var bio = (f && f.bio) || '';
    if (!bio) return '';
    var long = bio.length > 40;
    var s = '<p class="' + cls + (long ? ' is-clamped' : '') + '" data-cp-exec-bio>' + esc(bio) + '</p>';
    if (long) {
      s += '<button class="cp-exec-bio-toggle" type="button" data-cp-exec-bio-toggle' +
        ' aria-expanded="false">展开</button>';
    }
    return s;
  }
  function execCarousel(c) {
    var team = (((c.bossProfile || {}).foundingTeam) || []).filter(function (f) {
      return f && (f.name || f.photo);
    });
    if (!team.length) return '';
    var src = (c.bossProfile || {}).source || '';
    var slides = '';
    var bars = '';
    var dots = '';
    team.forEach(function (f, i) {
      /* 上下布局：头像在上、姓名/职位/简介在下，对齐 BOSS 直聘卡片 */
      slides += '<article class="cp-exec-slide">' +
        '<div class="cp-exec-portrait">' + execPhotoHtml(f, 'cp-exec-photo') + '</div>' +
        '<div class="cp-exec-slide-body">' +
        '<p class="cp-exec-slide-name">' + esc(f.name || '') + sup(src) + '</p>' +
        '<p class="cp-exec-slide-title">' + esc(f.title || '') + '</p>' +
        execBioHtml(f, 'cp-exec-slide-bio') +
        '</div></article>';
      bars += '<span class="cp-exec-bar' + (i ? '' : ' is-active') + '"></span>';
      dots += '<button class="cp-exec-dot' + (i ? '' : ' is-active') + '" type="button"' +
        ' data-cp-exec-go="' + i + '" aria-label="查看第 ' + (i + 1) + ' 位高管"></button>';
    });
    var nav = team.length > 1
      ? '<button class="cp-exec-nav is-prev" type="button" data-cp-exec-nav="prev" aria-label="上一位高管" disabled>‹</button>' +
        '<button class="cp-exec-nav is-next" type="button" data-cp-exec-nav="next" aria-label="下一位高管">›</button>'
      : '';
    return '<div class="cp-head-exec" data-cp-exec-carousel data-cp-exec-index="0"' +
      ' data-cp-exec-count="' + team.length + '">' +
      '<p class="cp-exec-cap">高管介绍</p>' +
      (team.length > 1 ? '<div class="cp-exec-bars" aria-hidden="true">' + bars + '</div>' : '') +
      /* viewport 同时承载点击拖拽与触摸横滑；tabindex 让键盘可聚焦 */
      '<div class="cp-exec-viewport" tabindex="0" role="group" aria-label="高管轮播，可左右滑动">' +
      '<div class="cp-exec-track">' + slides + '</div></div>' +
      '<div class="cp-exec-ctrl">' + nav + '<div class="cp-exec-dots">' + dots + '</div></div>' +
      '</div>';
  }

  /* ══════════════ 长板块展开 / 收起 ══════════════
     内容较多的板块默认只露出首屏，点标题行或底部按钮展开完整内容。
     抽屉与独立档案页共用 render()，所以折叠结构直接生成在 HTML 字符串里；
     用户手动展开过的板块记在本次页面会话，关闭抽屉再打开仍保持展开。 */
  var FOLD_TEXT_LIMIT = 1400;

  function foldBlock(o) {
    o = o || {};
    var inner = o.inner || '';
    var tag = o.tag || 'section';
    var cls = (o.cls || 'cp-sec') + (o.extraCls ? ' ' + o.extraCls : '');
    var headTag = o.headTag || 'h4';
    var headCls = o.headCls || 'cp-sec-title';
    var count = o.count || 0;
    var countText = o.countText || (count ? '共 ' + count + ' 项' : '内容较多');
    var threshold = o.threshold == null ? 4 : o.threshold;
    var idAttr = o.id ? ' id="' + esc(o.id) + '"' : '';
    var needFold = o.fold === true ||
      (o.fold !== false && (!!o.heavy || count >= threshold || inner.length >= FOLD_TEXT_LIMIT));

    if (!needFold) {
      return '<' + tag + ' class="' + cls + '"' + idAttr + '><' + headTag + ' class="' + headCls + '">' +
        o.titleHtml + '</' + headTag + '>' + inner + '</' + tag + '>';
    }
    var stateKey = (o.cid || 'x') + ':' + (o.key || 'block');
    var expanded = !!foldState[stateKey];
    var panelId = 'cpfold-' + String(stateKey).replace(/[^a-zA-Z0-9_-]/g, '-');
    return '<' + tag + ' class="' + cls + ' cp-foldable' + (expanded ? '' : ' is-folded') + '"' + idAttr +
      ' data-cp-fold data-cp-fold-key="' + esc(stateKey) + '"' +
      ' data-cp-fold-count="' + esc(countText) + '" style="--fold-h:' + (o.foldH || 132) + 'px">' +
      '<' + headTag + ' class="' + headCls + ' cp-fold-head">' +
      '<button class="cp-fold-trigger" type="button" data-cp-fold-toggle' +
      ' aria-expanded="' + (expanded ? 'true' : 'false') + '" aria-controls="' + esc(panelId) + '">' +
      '<span class="cp-fold-tri" aria-hidden="true">' + (expanded ? '▾' : '▸') + '</span>' +
      '<span class="cp-fold-label">' + o.titleHtml + '</span>' +
      '<span class="cp-fold-meta">' + esc(countText) + ' · ' +
      (expanded ? '已展开' : '已折叠') + '</span>' +
      '</button></' + headTag + '>' +
      '<div class="cp-fold-panel" id="' + esc(panelId) + '">' +
      '<div class="cp-fold-clip">' + inner + '</div>' +
      '<button class="cp-fold-more" type="button" data-cp-fold-toggle aria-expanded="' +
      (expanded ? 'true' : 'false') + '">' +
      (expanded ? '收起板块 ↑' : '展开全部 ↓') + '</button>' +
      '</div></' + tag + '>';
  }

  function foldableSection(title, inner, opts) {
    opts = opts || {};
    opts.titleHtml = opts.titleHtml || esc(title);
    opts.inner = inner;
    return foldBlock(opts);
  }

  function sectionBlock(title, rows, cid) {
    var html = '';
    var n = 0;
    for (var i = 0; i < rows.length; i++) {
      if (!rows[i].text) continue;
      html += '<div class="cp-row"><p class="cp-row-label">' + esc(rows[i].label) + '</p>' +
        '<p class="cp-row-text">' + esc(rows[i].text) + sup(rows[i].source || '') + '</p></div>';
      n++;
    }
    return foldableSection(title, html, {
      cid: cid, key: 'business', count: n, threshold: 5, foldH: 150
    });
  }

  /* 投资方明细：机构品牌名与工商登记主体分开列，注明核验依据，不把自述当结论。 */
  function investorsBlock(c) {
    var inv = c.investors;
    if (!inv || !inv.list || !inv.list.length) return '';
    var html = '<p class="cp-note">' + esc(inv.note || '') + sup(18) + '</p>' +
      '<div class="cp-inv-list">';
    inv.list.forEach(function (it) {
      html += '<div class="cp-inv-item' + (it.stake === '未公开' ? ' is-unverified' : '') + '">' +
        '<p class="cp-inv-name">' + esc(it.name) + sup(it.source || '') + '</p>' +
        '<div class="cp-inv-grid">' +
          '<div><span>工商 / 上层主体</span><p>' + esc(it.entity || '—') + '</p></div>' +
          '<div><span>持股</span><p>' + esc(it.stake || '—') + '</p></div>' +
          '<div><span>参与轮次</span><p>' + esc(it.rounds || '—') + '</p></div>' +
        '</div>' +
        '<p class="cp-inv-verify"><b>核验依据</b> ' + esc(it.verify || '—') + '</p>' +
        '</div>';
    });
    html += '</div>';
    if (inv.others) html += '<p class="cp-inv-others">' + esc(inv.others) + '</p>';
    return foldableSection('投资方与股权穿透', html, {
      cid: c.id, key: 'investors', count: inv.list.length, threshold: 4, foldH: 220
    });
  }

  /* 主体 / 名称变更 × 融资轮次 × 投资方：只做并列陈列，不合并口径。 */
  function entityHistoryBlock(c) {
    var eh = c.entityHistory;
    if (!eh || !eh.rows || !eh.rows.length) return '';
    var html = '<p class="cp-note">' + esc(eh.note || '') + '</p><div class="cp-eh-list">';
    eh.rows.forEach(function (r) {
      html += '<div class="cp-eh-row">' +
        '<div class="cp-eh-time">' + esc(r.period || '') + '</div>' +
        '<div class="cp-eh-body">' +
          '<p class="cp-eh-entity">' + esc(r.entity || '') + '</p>' +
          '<p class="cp-eh-event">' + esc(r.event || '') + '</p>' +
          '<p class="cp-eh-field"><span>对应投资方</span>' + esc(r.investors || '—') + '</p>' +
          '<p class="cp-eh-field"><span>依据与判断</span>' + esc(r.basis || '—') + sup(r.source || '') + '</p>' +
        '</div></div>';
    });
    html += '</div>';
    return foldableSection('主体名称变更与融资轮次对照', html, {
      cid: c.id, key: 'entity-history', count: eh.rows.length, threshold: 4, foldH: 210
    });
  }

  /* 数据可信度：把「工商/司法可核验」与「企业自述」分开，明确列出冲突口径。 */
  function dataConfidenceBlock(c) {
    var dc = c.dataConfidence;
    if (!dc) return '';
    function list(arr, cls) {
      if (!arr || !arr.length) return '';
      var s = '<ul class="cp-conf-list ' + cls + '">';
      arr.forEach(function (x) { s += '<li>' + esc(x) + '</li>'; });
      return s + '</ul>';
    }
    var levelText = { A: 'A · 审计 / 交易所披露', B: 'B · 部分可核验', C: 'C · 主要为企业自述' }[dc.level] || dc.level;
    var inner = '<p class="cp-note">' + esc(dc.summary || '') + '</p>' +
      '<div class="cp-conf-cols">' +
        '<div><h5>可独立核验</h5>' + list(dc.verified, 'is-ok') + '</div>' +
        '<div><h5>仅企业 / 媒体自述</h5>' + list(dc.unverified, 'is-warn') + '</div>' +
        '<div><h5>口径冲突</h5>' + list(dc.conflicts, 'is-risk') + '</div>' +
      '</div>' +
      '<p class="cp-conf-foot">档案中的规模、收入、覆盖率类数字多为官网或受访者口径，未经第三方审计；本档案不对其真实性作背书，仅标注来源与冲突。</p>';
    var count = (dc.verified || []).length + (dc.unverified || []).length + (dc.conflicts || []).length;
    return foldableSection('', inner, {
      cid: c.id, key: 'confidence', count: count, threshold: 8, foldH: 170,
      extraCls: 'cp-conf cp-conf-' + esc(dc.level || 'b').toLowerCase(),
      titleHtml: '数据可信度 <span class="cp-conf-badge">' + esc(levelText) + '</span>'
    });
  }

  /* 微信公众号：只收可确证的官方账号；微信号未公开时不编造。 */
  function wechatBlock(c) {
    var list = c.wechat || [];
    if (!list.length) return '';
    var html = '<section class="cp-sec"><h4 class="cp-sec-title">微信公众号</h4><div class="cp-wechat-list">';
    list.forEach(function (w) {
      var link = w.url
        ? '<a class="cp-wechat-link" href="' + esc(w.url) +
          '" target="_blank" rel="noopener noreferrer">查看来源文章 ↗</a>'
        : '';
      html += '<div class="cp-wechat-item">' +
        '<span class="cp-wechat-mark" aria-hidden="true">微</span>' +
        '<div class="cp-wechat-body"><p class="cp-wechat-name">' + esc(w.name) + sup(w.source || '') + '</p>' +
        (w.account ? '<p class="cp-wechat-id">微信号 · ' + esc(w.account) + '</p>' : '') +
        (w.note ? '<p class="cp-wechat-note">' + esc(w.note) + '</p>' : '') +
        link + '</div></div>';
    });
    return html + '</div></section>';
  }

  function recognitionBlock(c) {
    if (!c.recognition || !c.recognition.length) return '';
    var html = '<ul class="cp-recog">';
    c.recognition.forEach(function (r) {
      html += '<li><p class="cp-recog-t">' + esc(r.title) + '</p>' +
        '<p class="cp-recog-d">' + esc(r.detail) + sup(r.source || '') + '</p></li>';
    });
    html += '</ul>';
    return foldableSection('行业知名度与客户', html, {
      cid: c.id, key: 'recognition', count: c.recognition.length, threshold: 5, foldH: 160
    });
  }

  /* 产品橱窗：封面 + 一句话提炼 + 官网外链，整卡可点。
     有 img 用真实官网首屏截图封面，无 img 退化为字标色块卡；两态共用同一卡片结构。 */
  function showcaseBlock(c) {
    var list = c.showcase || [];
    if (!list.length) return '';
    var html = '<p class="cp-showcase-note">' + list.length + ' 款产品 · 点击卡片访问官网</p>' +
      '<div class="cp-showcase">';
    list.forEach(function (p) {
      /* 截图卡：「本人参与」徽章放标题行，避免叠在封面上挡内容；字标卡封面是色块，徽章留在封面右上 */
      var mineInHead = p.img && p.mine
        ? '<span class="cp-product-mine">本人参与</span>'
        : '';
      var meta = '<div class="cp-product-cover-meta">' +
        (!p.img && p.mine ? '<span class="cp-product-mine">本人参与</span>' : '') +
        '<span class="cp-product-domain">' + esc(p.domain || '') + '</span></div>';
      var cover = p.img
        ? '<div class="cp-product-cover has-img">' +
          '<img src="' + esc(p.img) + '" alt="' + esc(p.name + ' 产品页封面') + '" loading="lazy">' + meta + '</div>'
        : '<div class="cp-product-cover tone-' + esc(p.tone || 'blue') + '">' +
          '<span class="cp-product-mark" aria-hidden="true">' + esc(p.mark || '') + '</span>' + meta + '</div>';
      var subs = (p.subProducts || []).length
        ? '<div class="cp-product-subs">' + p.subProducts.map(function (x) {
            return '<span class="cp-product-sub">' + esc(x) + '</span>';
          }).join('') + '</div>'
        : '';
      html += '<a class="cp-product" href="' + esc(p.url || '') + '"' +
        ' target="_blank" rel="noopener noreferrer"' +
        ' aria-label="访问 ' + esc(p.name || '') + ' 官网（新窗口）">' + cover +
        '<div class="cp-product-body">' +
        '<div class="cp-product-head"><span class="cp-product-name">' + esc(p.name || '') + '</span>' +
        mineInHead +
        '<span class="cp-product-kind">' + esc(p.kind || '') + '</span></div>' +
        '<p class="cp-product-tagline">' + esc(p.tagline || '') + sup(p.source || '') + '</p>' +
        subs +
        '<div class="cp-product-foot"><span>来源 · ' + esc(p.sourceLabel || '产品官网') + '</span>' +
        '<span class="cp-product-go">访问官网 ↗</span></div>' +
        '</div></a>';
    });
    html += '</div>';
    return foldableSection('产品橱窗', html, {
      cid: c.id, key: 'showcase', count: list.length, threshold: 3,
      heavy: list.some(function (p) { return !!p.img; }), foldH: 260,
      countText: list.length + ' 款产品'
    });
  }

  function bossProfileBlock(c) {
    var b = c.bossProfile;
    if (!b) return '';
    var src = b.source || '';
    var title = b.platformTitle || '招聘平台档案 · BOSS直聘';
    var html = '';
    var n = 0;
    function add(s) { if (s) { html += s; n++; } }
    /* 档案只沉淀稳定事实：在招职位数 / 招聘 Boss 数属每日变动的动态信息，
       用户明确不展示——数据层与展示层均已移除（见 data/company-profiles.json）。 */
    var quick = [
      { label: '行业标签', value: b.industryTag },
      { label: '团队规模', value: b.scaleTag },
      { label: '融资标签', value: b.financingTag },
      { label: '工作时间', value: b.workTime }
    ].filter(function (x) { return x.value; });
    if (quick.length) {
      html += '<div class="cp-kpis">';
      quick.forEach(function (x) {
        html += '<div class="cp-kpi"><strong>' + esc(x.value) + '</strong><span>' + esc(x.label) + '</span></div>';
      });
      html += '</div>';
    }
    function tagList(arr) {
      return '<div class="cp-row"><p class="cp-row-text">' +
        (arr || []).map(function (x) { return '<span class="cp-pill">' + esc(x) + '</span>'; }).join(' ') +
        '</p></div>';
    }
    function line(label, text, withSource) {
      if (!text) return '';
      return '<div class="cp-row"><p class="cp-row-label">' + esc(label) + '</p><p class="cp-row-text">' +
        esc(text) + (withSource ? sup(src) : '') + '</p></div>';
    }
    function multi(label, arr, withSource) {
      if (!arr || !arr.length) return '';
      return '<div class="cp-row"><p class="cp-row-label">' + esc(label) + '</p><p class="cp-row-text">' +
        arr.map(function (m) { return esc(m); }).join('<br>') +
        (withSource ? sup(src) : '') + '</p></div>';
    }
    add(line('名称沿革', b.rename));
    add(line('平台简介', b.intro, true));
    add(line('工商口径', b.registryNote));
    add(line('口径说明', b.financingNote));
    add(multi('企业文化', b.culture, true));
    if (b.welfare && b.welfare.length) {
      add('<div class="cp-row"><p class="cp-row-label">' +
        esc(b.welfareLabel || '福利标签') + '</p>' + tagList(b.welfare) + '</div>');
    }
    if (b.talentDevelopment && b.talentDevelopment.length) {
      add('<div class="cp-row"><p class="cp-row-label">人才发展</p>' + tagList(b.talentDevelopment) + '</div>');
    }
    /* 有产品橱窗时收编这行 pill，避免同一批产品名重复出现 */
    if (b.products && b.products.length && !(c.showcase && c.showcase.length)) {
      add('<div class="cp-row"><p class="cp-row-label">产品矩阵</p>' + tagList(b.products) + '</div>');
    }
    add(multi('产品与服务', b.productDetails));
    add(multi('发展历程', b.milestones, true));
    add(multi('平台荣誉', b.awards, true));
    if (b.foundingTeam && b.foundingTeam.length) {
      var exec = '<div class="cp-exec-list">';
      b.foundingTeam.forEach(function (f) {
        exec += '<div class="cp-exec">' + execPhotoHtml(f, 'cp-exec-photo') +
          '<div class="cp-exec-body"><p class="cp-exec-name">' + esc(f.name || '') + sup(src) + '</p>' +
          '<p class="cp-exec-title">' + esc(f.title || '') + '</p>' +
          execBioHtml(f, 'cp-exec-bio') + '</div></div>';
      });
      add(exec + '</div>');
    }
    add(multi('办公地点', b.offices, true));
    return foldableSection(title, html, {
      cid: c.id, key: 'boss', count: n, threshold: 6, foldH: 220,
      countText: n + ' 条信息'
    });
  }

  /* 前身 / 历史沿革：沉淀公司不变的历史事实（非招聘动态信息） */
  function predecessorBlock(c) {
    var p = c.predecessor;
    if (!p) return '';
    var src = (p.sources || []).map(function (n) { return sup(n); }).join('');
    function kv(label, text) {
      if (!text) return '';
      return '<div class="cp-row"><p class="cp-row-label">' + esc(label) +
        '</p><p class="cp-row-text">' + esc(text) + '</p></div>';
    }
    var html = '<div class="cp-predecessor"><div class="cp-pred-head">' +
      '<span class="cp-pred-tag">前身</span>' +
      '<span class="cp-pred-name">' + esc(p.shortName || p.name || '') + '</span>' +
      (p.founded ? '<span class="cp-pred-founded">' + esc(p.founded) + ' 成立</span>' : '') +
      '</div>' +
      kv('全称', p.name) +
      kv('成立时间', p.founded) +
      (p.formerName ? kv('曾用名', p.formerName) : '') +
      kv('法定代表人', p.legalRep) +
      kv('注册资本', p.capital) +
      kv('团队规模', p.scale) +
      kv('主营业务', p.business) +
      (p.link ? '<div class="cp-row"><p class="cp-row-label">与本公司关系</p>' +
        '<p class="cp-row-text">' + esc(p.link) + src + '</p></div>' : '') +
      '</div>';
    return foldableSection('前身与沿革', html, {
      cid: c.id, key: 'predecessor', count: 8, threshold: 7, foldH: 160
    });
  }

  /* 访谈 / 视频：本地归档 + 对象存储直链，防原链接失效 */
  function interviewBlock(c) {
    var list = c.interviews || [];
    if (!list.length) return '';
    var html = '';
    var hasVideo = false;
    list.forEach(function (v) {
      var videoSrc = v.video || '';
      if (videoSrc) hasVideo = true;
      var poster = v.poster || '';
      var player = '';
      if (videoSrc) {
        if (window.AssetURL && window.AssetURL.of) videoSrc = window.AssetURL.of(videoSrc);
        if (poster && window.AssetURL && window.AssetURL.of) poster = window.AssetURL.of(poster);
        player = '<div class="cp-video-wrap"><video class="cp-video" controls preload="metadata"' +
          (poster ? ' poster="' + esc(poster) + '"' : '') +
          ' src="' + esc(videoSrc) + '">您的浏览器不支持 HTML5 视频。</video></div>';
      }
      var meta = [
        v.host ? '主持 / 出品：' + v.host : '',
        v.guest ? '受访者：' + v.guest : '',
        v.date ? '发布：' + v.date : '',
        v.duration ? '时长：' + v.duration : '',
        v.platform ? '平台：' + v.platform : ''
      ].filter(Boolean).join(' · ');
      var chapters = (v.chapters || []).length
        ? '<div class="cp-video-chapters">' + v.chapters.map(function (ch) {
            return '<span class="cp-pill">' + esc(ch) + '</span>';
          }).join('') + '</div>'
        : '';
      html += '<article class="cp-interview">' + player +
        '<div class="cp-interview-body">' +
        '<h5 class="cp-interview-title">' + esc(v.title || '') + sup(v.source || '') + '</h5>' +
        (meta ? '<p class="cp-interview-meta">' + esc(meta) + '</p>' : '') +
        (v.desc ? '<p class="cp-interview-desc">' + esc(v.desc) + '</p>' : '') +
        chapters +
        '<div class="cp-interview-links">' +
        (v.originalUrl ? '<a class="cp-video-link" href="' + esc(v.originalUrl) +
          '" target="_blank" rel="noopener noreferrer">查看原视频 ↗</a>' : '') +
        (v.archiveNote ? '<span class="cp-video-archive">' + esc(v.archiveNote) + '</span>' : '') +
        '</div></div></article>';
    });
    return foldableSection('访谈 / 视频', html, {
      cid: c.id, key: 'interviews', count: list.length, threshold: 2,
      heavy: hasVideo, foldH: 190,
      countText: list.length + ' 条'
    });
  }

  /* 友商 / 竞品分析：竞争格局概述 + 竞品卡片。
     带 profileId 且档案存在的友商，名称与卡片底部可点进对应公司档案：
       · 简历 / 首页：由 [data-cp] 委托打开抽屉；
       · 独立档案页 company.html：保留 href 跳到 ?c=id（见 start() 里的放行）。 */
  function competitorBlock(c) {
    var cmp = c.competitors || {};
    var list = cmp.players || [];
    if (!list.length && !cmp.landscape) return '';
    var linkable = list.some(function (p) { return p.profileId && company(p.profileId); });
    var html = '';
    if (linkable) {
      html += '<p class="cp-cmp-hint">点击友商名称或「查看公司档案」，进入对应公司的完整档案</p>';
    }
    if (cmp.landscape) {
      html += '<p class="cp-cmp-landscape">' + esc(cmp.landscape) + '</p>';
    }
    if (list.length) {
      html += '<div class="cp-cmp-grid">';
      list.forEach(function (p) {
        var kindClass = 'cp-cmp-kind is-' + ({
          '直接竞品': 'direct', '相邻赛道': 'adjacent', '间接竞品': 'indirect',
          '错位竞品': 'offset', '单点竞品': 'point', '新兴竞品': 'emerging',
          '平台型竞品': 'platform', '差异化竞品': 'diff', 'adjacent': 'adjacent'
        }[p.kind] || 'other');
        var linked = !!(p.profileId && company(p.profileId));
        var profileHref = linked ? 'company.html?c=' + encodeURIComponent(p.profileId) : '';
        var profileAttrs = linked
          ? ' href="' + esc(profileHref) + '" data-cp="' + esc(p.profileId) + '" data-cp-nav="1"'
          : '';
        var nameHtml = linked
          ? '<a class="cp-cmp-name is-link"' + profileAttrs + '>' + esc(p.name || '') + '</a>'
          : '<span class="cp-cmp-name">' + esc(p.name || '') + '</span>';
        var rows = '';
        function row(label, val, withSup) {
          if (!val) return '';
          return '<div class="cp-cmp-row"><span class="cp-cmp-k">' + esc(label) +
            '</span><span class="cp-cmp-v">' + esc(val) +
            (withSup && p.source ? sup(p.source) : '') + '</span></div>';
        }
        rows += row('定位', p.position);
        rows += row('体量', p.scale);
        rows += row('与本公司', p.vs, true);
        var head = '<div class="cp-cmp-card-head">' +
          '<span class="cp-cmp-mark tone-' + esc(p.tone || 'blue') + '">' +
          esc(p.mark || '') + '</span>' +
          '<div class="cp-cmp-ident">' + nameHtml +
          (p.vendor ? '<span class="cp-cmp-vendor">' + esc(p.vendor) + '</span>' : '') +
          '</div><span class="' + kindClass + '">' + esc(p.kind || '') + '</span></div>';
        var foot = (p.url
          ? '<a class="cp-cmp-link" href="' + esc(p.url) +
            '" target="_blank" rel="noopener noreferrer">访问官网 ↗</a>'
          : '<span class="cp-cmp-src">竞品信息来源见 ' + sup(p.source || '') + '</span>');
        if (linked) {
          foot += '<a class="cp-cmp-profile"' + profileAttrs + '>查看公司档案 →</a>';
        }
        html += '<article class="cp-cmp-card">' + head +
          '<div class="cp-cmp-rows">' + rows + '</div>' +
          '<div class="cp-cmp-foot">' + foot + '</div></article>';
      });
      html += '</div>';
    }
    return foldableSection('友商 / 竞品分析', html, {
      cid: c.id, key: 'competitors', count: list.length, threshold: 4, foldH: 240,
      countText: list.length + ' 家'
    });
  }

  function outlookBlock(c) {
    var o = c.outlook || {};
    if (!o.opportunities && !o.risks) return '';
    function lis(arr) {
      return '<ul class="cp-outlook-list">' + (arr || []).map(function (x) {
        return '<li>' + esc(x) + '</li>';
      }).join('') + '</ul>';
    }
    var inner = '<div class="cp-outlook"><div class="cp-outlook-col"><p class="cp-outlook-h is-op">▚ 机会</p>' +
      lis(o.opportunities) + '</div>' +
      '<div class="cp-outlook-col"><p class="cp-outlook-h is-risk">▞ 风险</p>' + lis(o.risks) + '</div></div>';
    return foldableSection('发展前景', inner, {
      cid: c.id, key: 'outlook',
      count: (o.opportunities || []).length + (o.risks || []).length,
      threshold: 8, foldH: 180
    });
  }

  /* 办公图相册：超过 3 张默认折叠（第 4 张起加 is-extra），
     按钮委托在 document 上 —— 抽屉与独立档案页共用同一份行为 */
  var OFFICE_FOLD = 3;

  /* 360° 全景：图片库第一张卡带圆形旋转标记，点开走 WebGL 查看器 */
  var PANO_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M20.4 12a8.4 8.4 0 1 1-2.5-6"/><path d="M20.4 3.6V8h-4.4"/>' +
    '<path d="M12 8.6l3.4 3.4-3.4 3.4L8.6 12z"/></svg>';

  function officeBlock(c, cid) {
    var panos = c.panoramas || [];
    var photos = c.office || [];
    var total = panos.length + photos.length;
    if (!total) return '';
    var many = total > OFFICE_FOLD;
    var html = '<section class="cp-sec"><h4 class="cp-sec-title">办公与环境</h4><div class="cp-office' +
      (many ? ' is-folded' : '') + '" data-cp-album>';
    var n = 0;

    panos.forEach(function (p, pi) {
      var extra = many && n >= OFFICE_FOLD ? ' is-extra' : '';
      html += '<figure class="cp-office-img is-pano' + extra + '" data-cp-pano="' + pi +
        '" data-cp-company="' + esc(cid || c.id || '') + '">' +
        '<img src="' + esc(p.cover || p.img) + '" alt="' + esc(p.alt || p.title || '360° 全景') +
        '" loading="lazy">' +
        '<span class="cp-pano-badge" aria-hidden="true">' + PANO_ICON + '360° 全景</span>' +
        '<figcaption>' + esc(p.note || '') + '</figcaption></figure>';
      n++;
    });

    photos.forEach(function (o) {
      var extra = many && n >= OFFICE_FOLD ? ' is-extra' : '';
      if (o.img) {
        html += '<figure class="cp-office-img' + extra + '"><img src="' + esc(o.img) + '" alt="' + esc(o.alt || o.note || '') +
          '" loading="lazy"><figcaption>' + esc(o.note || '') + '</figcaption></figure>';
      } else {
        html += '<figure class="cp-office-img is-ph' + extra + '"><div class="cp-ph"><span class="cp-ph-code">' +
          esc(c.code || '') + '</span><span class="cp-ph-tag">照片待补充</span></div>' +
          '<figcaption>' + esc(o.note || '') + '</figcaption></figure>';
      }
      n++;
    });
    html += '</div>';
    if (many) {
      html += '<button class="cp-album-toggle" type="button" data-cp-album-toggle aria-expanded="false">' +
        '展开全部 ' + total + ' 张 ↓</button>';
    }
    return html + '</section>';
  }

  /* ── 任职佐证材料（离职证明等，默认加锁）────────────────────
     放在「数据说明 / 资料来源」之前：与佐证、来源同一语义区，
     不打断开篇的公司调研阅读；有材料的公司档案才渲染。
     真实文件在私有对象存储，页面只留一个挂载点，加密申请 / 审批 /
     实时刷新 / 签名链接续期全部由 js/secure-access.js 通用组件接管。 */
  function secureMaterialsBlock(c) {
    var m = c.secureMaterials;
    if (!m || !m.resource) return '';
    var items = m.items || [];
    var available = items.filter(function (it) { return it.status === 'available'; });
    var brief = items.map(function (it) {
      return { label: it.label || '材料', issuer: it.issuer || '', status: it.status || 'available' };
    });
    var inner = '<div class="cp-secure-mount" data-secure-access="' + esc(m.resource) + '"' +
      ' data-secure-title="' + esc(m.title || '任职佐证材料') + '"' +
      ' data-secure-lead="' + esc(m.note || '') + '"' +
      ' data-secure-items="' + esc(JSON.stringify(brief)) + '"' +
      ' data-secure-pending="' + (available.length ? '0' : '1') + '"></div>';
    return foldBlock({
      tag: 'section', cls: 'cp-sec cp-secure-materials',
      titleHtml: '任职佐证材料 <span class="cp-sec-en">EMPLOYMENT PROOF · LOCKED</span>',
      inner: inner, cid: c.id, key: 'secure-materials', id: 'cp-proof',
      fold: false, threshold: 999
    });
  }

  function sourcesBlock(c) {
    var src = c.sources || [];
    var list = src.map(function (s) {
      return '<li><span class="cp-src-no">[' + esc(s.n) + ']</span>' +
        (s.url ? '<a href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">' + esc(s.name) + ' ↗</a>'
               : esc(s.name)) + '</li>';
    }).join('');
    var inner = '<ol>' + list + '</ol>' +
      (meta.disclaimer ? '<p class="cp-disclaimer">' + esc(meta.disclaimer) + '</p>' : '');
    return foldBlock({
      tag: 'footer', cls: 'cp-sources', headTag: 'p', headCls: 'cp-src-title',
      titleHtml: '数据来源（采集于 ' + esc(meta.collectedAt || '') + '）',
      inner: inner, cid: c.id, key: 'sources', count: src.length, threshold: 10,
      foldH: 170, countText: src.length + ' 条来源'
    });
  }

  function renderPanel(id) {
    var c = company(id);
    if (!c) return '<div class="cp-empty">未找到 ' + esc(id) + ' 的公司档案</div>';
    var reg = c.registry || {};
    var pills = [c.stage, c.scale, reg.hq].filter(Boolean)
      .map(function (p) { return '<span class="cp-pill">' + esc(p) + '</span>'; }).join('');
    var site = c.website ? '<a class="cp-site" href="' + esc(c.website.href) +
      '" target="_blank" rel="noopener noreferrer">' + esc(c.website.text) + ' ↗</a>' : '';
    var founded = reg.founded ? '<span class="cp-founded">成立于 ' + esc(reg.founded) + '</span>' : '';
    var pred = c.predecessor || null;
    /* 顶部引导锚点文案：材料名按数据动态取（本站各家都是「离职证明」）。
       没配 secureMaterials 的档案整个板块不渲染，锚点也一并隐藏。 */
    var proof = c.secureMaterials;
    var proofLabel = proof && proof.resource
      ? (((proof.items || [])[0] || {}).label || '任职佐证材料')
      : '';
    var predLine = pred && pred.name
      ? '<p class="cp-entity cp-pred-entity">前身主体：' + esc(pred.name) +
        (pred.shortName ? '（' + esc(pred.shortName) + '）' : '') +
        sup((pred.sources || [])[0] || '') + '</p>'
      : '';

    var stamp = c.logo
      ? '<span class="cp-stamp has-logo" aria-hidden="true"><img class="cp-stamp-logo" src="' +
        esc(c.logo) + '" alt=""></span>'
      : '<span class="cp-stamp" aria-hidden="true">' + esc(c.code || '') + '</span>';

    var html =
      '<header class="cp-head">' +
      '  <div class="cp-head-top">' +
      '    ' + stamp +
      '    <div class="cp-head-main">' +
      '      <h3 class="cp-title" id="cpTitle">' + esc(c.name) +
        (proofLabel ? '<a class="cp-jump" href="#cp-proof" title="跳到本页末尾的任职佐证材料 · 可申请查看">' + esc(proofLabel) + '</a>' : '') +
      '</h3>' +
      '      <p class="cp-sub">' + esc(c.industry || '') + (site ? ' · ' + site : '') +
                (founded ? ' · ' + founded : '') + '</p>' +
      '      <p class="cp-entity">' + esc(c.entity || c.name) + sup(reg.source || '') + '</p>' +
      (c.renameNote ? '      <p class="cp-entity">' + esc(c.renameNote) +
        sup((c.bossProfile || {}).source || '') + '</p>' : '') +
      predLine +
      '    </div>' +
      execCarousel(c) +
      '  </div>' +
      '  <p class="cp-oneline">' + esc(c.oneLine || '') + '</p>' +
      '  <div class="cp-pills">' + pills + '</div>' +
      '</header>' +
      '<div class="cp-sec cp-sec-first">' + kpiBlock(c) + '</div>' +
      predecessorBlock(c) +
      sectionBlock('公司在做什么', [
        { label: '主营业务', text: (c.business || {}).main },
        { label: '商业模式', text: (c.business || {}).model },
        { label: '行业位置', text: (c.business || {}).position },
        { label: '平台自述', text: (c.business || {}).bossIntro, source: (c.bossProfile || {}).source }
      ], c.id) +
      showcaseBlock(c) +
      interviewBlock(c) +
      (c.chart ? renderChartBlock(c) : '') +
      (c.funding ? renderFundingBlock(c) : '') +
      investorsBlock(c) +
      entityHistoryBlock(c) +
      recognitionBlock(c) +
      bossProfileBlock(c) +
      competitorBlock(c) +
      outlookBlock(c) +
      officeBlock(c, id) +
      dataConfidenceBlock(c) +
      secureMaterialsBlock(c) +
      sourcesBlock(c) +
      wechatBlock(c) +
      (window.CompanySocial ? window.CompanySocial.skeleton(id) : '');
    return html;
  }

  /* ══════════════ 开 / 关 / 深链 ══════════════ */
  var openedByHash = false;

  function open(id) {
    var c = company(id);
    if (!c) return;
    buildDrawer();
    drawer.querySelector('.cp-panel-scroll').innerHTML = renderPanel(id);
    /* 加密材料组件：抽屉每次重建 DOM 后重新挂载（旧容器会自动销毁定时器） */
    if (window.SecureAccess && window.SecureAccess.mountAll) {
      try { window.SecureAccess.mountAll(drawer); } catch (e) {}
    }
    /* 互动区块（浏览 / 点赞 / 评论）在抽屉内容就位后再挂载；组件未加载时静默跳过 */
    if (window.CompanySocial) {
      window.CompanySocial.mount(drawer.querySelector('.cp-panel-scroll'), id);
    }
    drawer.querySelector('.cp-panel').setAttribute('data-cp-open-id', id);
    drawer.hidden = false;
    document.body.classList.add('cp-lock');
    drawer.querySelector('.cp-panel-scroll').scrollTop = 0;
    /* 换公司 / 重开时头部回到完整态（condensed 是 buildDrawer 闭包里的滞回状态） */
    condensed = false;
    headTicking = false;
    lastFocus = document.activeElement;
    var btn = drawer.querySelector('.cp-close');
    if (btn) btn.focus();
    /* replaceState：不产生历史记录、不触发滚动；首页锚点导航不受影响 */
    try { history.replaceState(null, '', '#company=' + encodeURIComponent(id)); } catch (e) { /* file:// 下可能受限，忽略 */ }
  }

  function close() {
    if (!drawer || drawer.hidden) return;
    setFullscreen(false);
    drawer.hidden = true;
    document.body.classList.remove('cp-lock');
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
    openedByHash = false;
    /* 关闭即清除 #company= 深链（replaceState 不触发 scroll/hashchange），
       避免刷新后抽屉再次弹出 */
    try {
      if ((location.hash || '').indexOf('#company=') === 0) {
        history.replaceState(null, '', location.pathname + location.search);
      }
    } catch (e) { /* file:// 下 replaceState 可能受限，忽略 */ }
  }

  function handleHash() {
    var m = (location.hash || '').match(/^#company=([a-z0-9_-]+)/i);
    if (m) {
      if (!company(m[1])) return;
      openedByHash = true;
      open(m[1]);
    } else if (drawer && !drawer.hidden && openedByHash) {
      close();
    }
  }

  /* ══════════════ 灯箱 ══════════════ */
  var lightbox = null;
  function openLightbox(img) {
    if (!lightbox) {
      lightbox = document.createElement('div');
      lightbox.className = 'cp-lightbox';
      lightbox.hidden = true;
      lightbox.innerHTML = '<button type="button" class="cp-lightbox-close" aria-label="关闭">✕</button><img alt="">';
      lightbox.addEventListener('click', function (ev) {
        if (ev.target === lightbox || ev.target.classList.contains('cp-lightbox-close')) closeLightbox();
      });
      document.body.appendChild(lightbox);
    }
    lightbox.querySelector('img').src = img.currentSrc || img.src;
    lightbox.querySelector('img').alt = img.alt || '';
    lightbox.hidden = false;
    document.body.classList.add('cp-lock');
  }
  function closeLightbox() {
    if (!lightbox) return;
    lightbox.hidden = true;
    if (drawer && !drawer.hidden) return; /* 抽屉还开着，保持锁定 */
    document.body.classList.remove('cp-lock');
  }

  window.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Escape') return;
    if (drawer && !drawer.hidden && drawer.classList.contains('is-fullscreen')) return;
    if (window.CPPanorama && window.CPPanorama.isOpen && window.CPPanorama.isOpen()) {
      window.CPPanorama.close(); return;
    }
    if (lightbox && !lightbox.hidden) closeLightbox();
    else close();
  });

  /* ══════════════ 启动 ══════════════ */
  function start() {
    fillQuick();
    fillExpBadges();
    /* resume.html / index.html 双页面：委托全文档捕获徽章点击（含 main.js 动态渲染的卡片） */
    document.addEventListener('click', function (ev) {
      /* 公司名链接（a.cp-name-link）与历史徽章都走这里；拦截 <a> 默认跳转，
         由 open() 内的 replaceState 维护 #company= 深链 */
      var b = ev.target.closest ? ev.target.closest('[data-cp]') : null;
      if (!b) return;
      /* 独立档案页里的友商卡片走真实链接 ?c=id，交给浏览器导航；
         简历 / 首页上同一张卡片仍由 open() 打开抽屉。 */
      if (b.getAttribute('data-cp-nav') === '1' && document.getElementById('cpPageBody')) return;
      if (b.tagName === 'A') ev.preventDefault();
      if (drawer && !drawer.hidden && drawer.querySelector('.cp-panel').getAttribute('data-cp-open-id') === b.dataset.cp) {
        close(); /* 再点同一家公司 = 收起 */
        return;
      }
      lastFocus = b;
      open(b.getAttribute('data-cp'));
    }, true);
    /* 相册图片：全景卡 → 360° 查看器；普通图 → 灯箱。
       全文档委托，抽屉（动态插入）与独立档案页共用一份行为。 */
    document.addEventListener('click', function (ev) {
      var img = ev.target.closest ? ev.target.closest('.cp-office-img img') : null;
      if (!img) return;
      var fig = img.closest('.cp-office-img');
      var panoIdx = fig ? fig.getAttribute('data-cp-pano') : null;
      if (panoIdx != null && window.CPPanorama) {
        var c = company(fig.getAttribute('data-cp-company'));
        if (c && c.panoramas && c.panoramas.length) {
          ev.preventDefault();
          window.CPPanorama.open(c.panoramas, parseInt(panoIdx, 10) || 0,
            img.currentSrc || img.src);
          return;
        }
      }
      openLightbox(img);
    });
    /* 全景主图 ~580KB：hover / 键盘聚焦时静默预取，点开后几乎零等待。
       用查看器同一套路径解析，保证预取与正式加载命中同一份浏览器缓存。 */
    var prefetched = Object.create(null);
    document.addEventListener('pointerover', prefetchPano, true);
    document.addEventListener('focusin', prefetchPano, true);
    function prefetchPano(ev) {
      var fig = ev.target.closest ? ev.target.closest('.cp-office-img.is-pano') : null;
      if (!fig || !window.CPPanorama) return;
      var c = company(fig.getAttribute('data-cp-company'));
      var p = c && c.panoramas && c.panoramas[parseInt(fig.getAttribute('data-cp-pano'), 10) || 0];
      if (!p || !p.img || prefetched[p.img]) return;
      prefetched[p.img] = 1;
      var pre = new Image();
      pre.src = window.CPPanorama.resolve(p.img);
    }
    /* 高管简介展开 / 收起：头部轮播与 BOSS 卡片共用 */
    document.addEventListener('click', function (ev) {
      var t = ev.target.closest ? ev.target.closest('[data-cp-exec-bio-toggle]') : null;
      if (!t) return;
      var host = t.closest('.cp-exec-slide, .cp-exec');
      var bio = host && host.querySelector('[data-cp-exec-bio]');
      if (!bio) return;
      ev.preventDefault();
      var clamped = bio.classList.toggle('is-clamped');
      t.setAttribute('aria-expanded', clamped ? 'false' : 'true');
      t.textContent = clamped ? '展开' : '收起';
    }, true);
    /* 头部高管轮播：跳到指定页，箭头 / 圆点 / 横滑共用同一套状态同步 */
    function goToSlide(box, idx) {
      var track = box.querySelector('.cp-exec-track');
      var dots = box.querySelectorAll('.cp-exec-dot');
      var bars = box.querySelectorAll('.cp-exec-bar');
      var prev = box.querySelector('.cp-exec-nav.is-prev');
      var next = box.querySelector('.cp-exec-nav.is-next');
      var total = parseInt(box.getAttribute('data-cp-exec-count'), 10) || dots.length;
      idx = Math.max(0, Math.min(total - 1, idx));
      box.setAttribute('data-cp-exec-index', idx);
      if (track) track.style.transform = 'translateX(-' + (idx * 100) + '%)';
      for (var i = 0; i < dots.length; i++) dots[i].classList.toggle('is-active', i === idx);
      for (var j = 0; j < bars.length; j++) bars[j].classList.toggle('is-active', j === idx);
      if (prev) prev.disabled = idx === 0;
      if (next) next.disabled = idx === total - 1;
    }
    /* 箭头 + 圆点点击 */
    document.addEventListener('click', function (ev) {
      var t = ev.target.closest ? ev.target.closest('[data-cp-exec-nav], [data-cp-exec-go]') : null;
      if (!t) return;
      var box = t.closest('[data-cp-exec-carousel]');
      if (!box) return;
      ev.preventDefault();
      var total = parseInt(box.getAttribute('data-cp-exec-count'), 10) || 0;
      var idx = parseInt(box.getAttribute('data-cp-exec-index'), 10) || 0;
      if (t.hasAttribute('data-cp-exec-go')) {
        idx = parseInt(t.getAttribute('data-cp-exec-go'), 10) || 0;
      } else {
        idx += t.getAttribute('data-cp-exec-nav') === 'next' ? 1 : -1;
      }
      goToSlide(box, Math.max(0, Math.min(total - 1, idx)));
    }, true);
    /* 触摸 / 鼠标横滑：手指横向移动超过阈值即翻页；纵向手势交还页面滚动 */
    document.addEventListener('pointerdown', function (ev) {
      var vp = ev.target.closest ? ev.target.closest('.cp-exec-viewport') : null;
      if (!vp || ev.target.closest('button, a')) return;
      var box = vp.closest('[data-cp-exec-carousel]');
      if (!box) return;
      var track = box.querySelector('.cp-exec-track');
      var startX = ev.clientX, startY = ev.clientY, w = vp.clientWidth || 1;
      var total = parseInt(box.getAttribute('data-cp-exec-count'), 10) || 1;
      var idx = parseInt(box.getAttribute('data-cp-exec-index'), 10) || 0;
      var decided = false, horizontal = false;
      function move(e) {
        var dx = e.clientX - startX, dy = e.clientY - startY;
        if (!decided) {
          if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
          decided = true;
          horizontal = Math.abs(dx) > Math.abs(dy);
          if (horizontal && track) track.classList.add('is-dragging');
        }
        if (!horizontal) return;
        if (e.cancelable) e.preventDefault();
        if (track) track.style.transform = 'translateX(' + (-idx * 100 + (dx / w) * 100) + '%)';
      }
      function up(e) {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        document.removeEventListener('pointercancel', up);
        if (track) track.classList.remove('is-dragging');
        if (!decided || !horizontal) { goToSlide(box, idx); return; }
        var dx = e.clientX - startX;
        if (Math.abs(dx) > Math.min(48, w * 0.18)) idx += dx < 0 ? 1 : -1;
        goToSlide(box, idx);
      }
      document.addEventListener('pointermove', move, { passive: false });
      document.addEventListener('pointerup', up);
      document.addEventListener('pointercancel', up);
    });
    /* 键盘：轮播聚焦后左右方向键翻页 */
    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
      var vp = ev.target.closest ? ev.target.closest('.cp-exec-viewport') : null;
      if (!vp) return;
      var box = vp.closest('[data-cp-exec-carousel]');
      if (!box) return;
      ev.preventDefault();
      var idx = parseInt(box.getAttribute('data-cp-exec-index'), 10) || 0;
      goToSlide(box, idx + (ev.key === 'ArrowRight' ? 1 : -1));
    });
    /* 长板块展开 / 收起：标题三角与底部按钮共用一份委托，抽屉与独立页都生效 */
    document.addEventListener('click', function (ev) {
      var t = ev.target.closest ? ev.target.closest('[data-cp-fold-toggle]') : null;
      if (!t) return;
      var box = t.closest('[data-cp-fold]');
      if (!box) return;
      ev.preventDefault();
      var folded = box.classList.toggle('is-folded');
      var stateKey = box.getAttribute('data-cp-fold-key');
      if (stateKey) foldState[stateKey] = !folded;
      var count = box.getAttribute('data-cp-fold-count') || '';
      var toggles = box.querySelectorAll('[data-cp-fold-toggle]');
      for (var i = 0; i < toggles.length; i++) {
        toggles[i].setAttribute('aria-expanded', folded ? 'false' : 'true');
        if (toggles[i].classList.contains('cp-fold-more')) {
          toggles[i].textContent = folded ? '展开全部 ↓' : '收起板块 ↑';
        }
      }
      var tri = box.querySelector('.cp-fold-tri');
      if (tri) tri.textContent = folded ? '▸' : '▾';
      var meta = box.querySelector('.cp-fold-meta');
      if (meta) meta.textContent = (count ? count + ' · ' : '') + (folded ? '已折叠' : '已展开');
    }, true);
    /* 相册展开 / 收起：不绑定具体节点，抽屉与独立页复用 */
    document.addEventListener('click', function (ev) {
      var t = ev.target.closest ? ev.target.closest('[data-cp-album-toggle]') : null;
      if (!t) return;
      var grid = t.closest('.cp-sec').querySelector('[data-cp-album]');
      if (!grid) return;
      var folded = grid.classList.toggle('is-folded');
      t.setAttribute('aria-expanded', folded ? 'false' : 'true');
      t.textContent = folded
        ? '展开全部 ' + grid.children.length + ' 张 ↓'
        : '收起相册 ↑';
    }, true);
    window.addEventListener('hashchange', handleHash);
    handleHash();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  /* 对外暴露：独立档案页（company.html）复用同一渲染函数，
     抽屉与独立页的数据、结构天然一致，改 JSON 一次两边同步。
     open / close 给首页 main.js 的既有调用方沿用。 */
  window.CompanyProfile = {
    render: renderPanel,
    get: company,
    list: function () { return Object.keys(companies).map(function (k) { return companies[k]; }); },
    meta: function () { return meta; },
    open: open,
    close: close
  };
})();
