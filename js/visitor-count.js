/* ──────────────────────────────────────────────────────────────────────
   全站访客计数器 · 前端接入层（复古里程表 · 顶栏分享按钮左侧）
   ──────────────────────────────────────────────────────────────────────
   只接远程接口，显示全站累计访问次数（total）；本机 localStorage 累计已移除。
   访客数（visitors）只放进悬浮提示，不冒充「全站访问」数字。
   里程表组件为静态标记（见 index.html 顶栏），本脚本只负责填充数字：

     · 本地环境（file:// / localhost / 127.0.0.1 / 192.168.x）：
        展示示例数字以便肉眼验收样式，不发请求、不取远程真实值
     · 线上 http(s)（部署环境）：
        接 Pages Function /api/visits（D1 存储），同一会话只计一次

   后端，改 CONFIG.provider 一行就能切：
     · pages（默认）—— 自己站点上的 /api/visits，同源/白名单，D1 存储，
                        不依赖任何第三方；pages.dev 是既有可用链路，境内可达
     · abacus       —— 第三方免费计数（早期默认），国内可达但无 SLA，
                        2026-11-19 实测其 /get 接口已返回 error，故降为备选
     · worker       —— 独立 Cloudflare Worker，需要自有域名
                        （workers.dev 域名在境内被墙，实测超时）
   ────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var CONFIG = {
    /* 'pages'（默认）| 'abacus' | 'worker' */
    provider: 'pages',

    /* provider=pages 时的接口地址；留空则自动推导
       · 当前页面在 *.pages.dev 上 → 同源 /api/visits
       · 当前页面在 github.io 等别处 → 走备站域名（CORS 白名单已含 github.io） */
    pagesApi: '',

    /* provider=worker 时必填，形如 https://visits.你的域名 */
    workerApi: '',

    /* abacus 计数器坐标，命名空间保持唯一，避免和别人的计数冲突 */
    abacusBase: 'https://abacus.jasoncameron.dev',
    abacusNamespace: 'shenge-portfolio',
    abacusKey: 'visits',

    /* 同一会话不重复计数，避免刷新页面刷数字 */
    sessionKey: 'shenge_visit_counted',

    /* 本地预览展示的示例数字（仅用于验收样式，非真实值） */
    demoValue: 25
  };

  /* 判断是否为本地环境：是则不请求远程，只展示示例数字 */
  var host = location.hostname;
  var IS_LOCAL = location.protocol === 'file:' || !host ||
    host === 'localhost' || host === '127.0.0.1' || host.indexOf('192.168.') === 0;

  function pagesEndpoint() {
    if (CONFIG.pagesApi) return CONFIG.pagesApi;
    if (host.slice(-9) === '.pages.dev') return '/api/visits';
    return 'https://shenge-work.pages.dev/api/visits';
  }

  function alreadyCounted() {
    var store = window.sessionStorage;
    try { return !!store && store.getItem(CONFIG.sessionKey) === '1'; } catch (e) { return false; }
  }

  function markCounted() {
    try { if (window.sessionStorage) window.sessionStorage.setItem(CONFIG.sessionKey, '1'); } catch (e) {}
  }

  function visitorId() {
    try {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
      }
    } catch (e) {}
    var s = '';
    for (var i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
    return s;
  }

  /* 仿真实里程表的翻牌数字：至少 6 位、前导零淡化 */
  function renderDigits(wrap, n) {
    if (!wrap) return;
    var str = String(n);
    var len = Math.max(6, str.length);
    while (str.length < len) str = '0' + str;
    while (wrap.children.length < len) {
      var cell = document.createElement('span');
      cell.className = 'hit-digit';
      wrap.appendChild(cell);
    }
    var firstSig = -1;
    for (var s = 0; s < len; s++) {
      if (str.charAt(s) !== '0') { firstSig = s; break; }
    }
    if (firstSig === -1) firstSig = len - 1;
    for (var i = 0; i < len; i++) {
      var d = wrap.children[i];
      d.textContent = str.charAt(i);
      d.classList.toggle('dim', i < firstSig);
    }
  }

  function reveal(widget, n, tip) {
    if (!widget || n === undefined || n === null) return;
    renderDigits(widget.querySelector('#hitCounterDigits'), n);
    if (tip) widget.title = tip;
    widget.setAttribute('aria-label', tip || widget.getAttribute('aria-label'));
    widget.setAttribute('data-source', IS_LOCAL ? 'local' : CONFIG.provider);
  }

  /* ── 本地预览：展示示例数字，方便验收样式 ── */
  function renderLocal(widget) {
    reveal(widget, CONFIG.demoValue, '本地预览 · 示例数字（线上展示全站真实访问量）');
  }

  /* ── 线上接口异常：不假装是真实数字，明确说明 ── */
  function renderFallback(widget, why) {
    reveal(widget, CONFIG.demoValue, '计数服务暂不可用（' + why + '）· 当前为示例数字');
  }

  /* ── 默认：站点自建 /api/visits（D1） ── */
  function requestPages(widget, readOnly) {
    var counted = readOnly === true || alreadyCounted();
    var url = pagesEndpoint();
    var opts = counted
      ? { method: 'GET', credentials: 'omit', cache: 'no-store' }
      : {
        method: 'POST',
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: visitorId() }),
      };

    fetch(url, opts)
      .then(function (res) {
        if (!res.ok) throw new Error('status ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data || data.ok === false) throw new Error(data && data.error || 'bad_payload');
        if (!counted) markCounted();
        var visitors = Number(data.visitors) || 0;
        var total = Number(data.total) || 0;
        var tip = '你是第 ' + visitors + ' 位访客 · 全站累计访问 ' + total + ' 次';
        /* 顶栏写的是「全站访问」，就该显示 total（PV），不是访客数（UV）。 */
        reveal(widget, total || visitors, tip);
      })
      .catch(function (err) {
        /* 写入失败（限流/网络抖动）时降级为只读，仍把真实数字显示出来；
           只读也失败才退回示例数字，避免把 0 或乱码当成真实访客数。 */
        if (!counted) { requestPages(widget, true); return; }
        renderFallback(widget, err && err.message ? err.message : '网络异常');
      });
  }

  /* ── 备选：第三方 abacus ── */
  function requestAbacus(widget) {
    var counted = alreadyCounted();
    var path = (counted ? '/get/' : '/hit/') + CONFIG.abacusNamespace + '/' + CONFIG.abacusKey;

    fetch(CONFIG.abacusBase + path, { credentials: 'omit', cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('status ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (data && data.error) throw new Error('abacus_error');
        if (!counted) markCounted();
        var n = Number(data && (data.value !== undefined ? data.value : data.total));
        if (!Number.isFinite(n)) throw new Error('no_value');
        reveal(widget, n, '全站累计访问 ' + n + ' 次 · 同一会话只计一次');
      })
      .catch(function () {
        renderFallback(widget, 'abacus 不可用');
      });
  }

  /* ── 备选：独立 Worker（需自有域名） ── */
  function requestWorker(widget) {
    var counted = alreadyCounted();
    var url = CONFIG.workerApi + (counted ? '/stats' : '/hit');
    var opts = { method: counted ? 'GET' : 'POST', credentials: 'omit' };

    if (!counted) {
      opts.headers = { 'Content-Type': 'application/json' };
      opts.body = JSON.stringify({ id: visitorId() });
    }

    fetch(url, opts)
      .then(function (res) {
        if (!res.ok) throw new Error('status ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!counted) markCounted();
        var visitors = Number(data.visitors) || 0;
        var total = Number(data.total) || 0;
        var tip = '你是第 ' + visitors + ' 位访客 · 全站累计访问 ' + total + ' 次';
        reveal(widget, total || visitors, tip);
      })
      .catch(function () { renderFallback(widget, 'Worker 不可用'); });
  }

  /* ── 启动 ── */
  var widget = document.getElementById('hitCounter');
  if (!widget) return;

  if (IS_LOCAL) {
    renderLocal(widget);
  } else if (CONFIG.provider === 'worker') {
    requestWorker(widget);
  } else if (CONFIG.provider === 'abacus') {
    requestAbacus(widget);
  } else {
    requestPages(widget);
  }
})();
