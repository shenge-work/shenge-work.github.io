/* ──────────────────────────────────────────────────────────────────────
   全站访客计数器 · 前端接入层（复古里程表 · 顶栏分享按钮左侧）
   ──────────────────────────────────────────────────────────────────────
   只接远程接口，显示全站真实访问量；本机 localStorage 累计已移除。
   里程表组件为静态标记（见 index.html 顶栏），本脚本只负责填充数字：

     · 本地环境（file:// / localhost / 127.0.0.1 / 192.168.x）：
        展示示例数字以便肉眼验收样式，不发请求、不取远程真实值
     · 线上 http(s)（部署环境）：
        接 abacus 显示全站真实访问量，同一会话只计一次

   后端，改 CONFIG.provider 一行就能切：
     · abacus（默认）—— 国内实测可达（200 / 0.6s），免费，无 SLA
     · worker        —— 自己的 Cloudflare Worker，需要绑自有域名
                        （workers.dev 域名在境内被墙，实测超时）
   ────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var CONFIG = {
    /* 'abacus'（默认，国内可达）或 'worker'（需 CONFIG.workerApi 配自有域名） */
    provider: 'abacus',

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

  /* ── 线上：接远程真实访问量 ── */
  function requestAbacus(widget) {
    var counted = alreadyCounted();
    var path = (counted ? '/get/' : '/hit/') + CONFIG.abacusNamespace + '/' + CONFIG.abacusKey;

    fetch(CONFIG.abacusBase + path, { credentials: 'omit', cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('status ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!counted) markCounted();
        var n = Number(data && (data.value !== undefined ? data.value : data.total));
        reveal(widget, n, '全站累计访问 ' + n + ' 次 · 同一会话只计一次');
      })
      .catch(function () {
        /* 线上请求失败：仍展示示例数字，保证样式可见、不空白 */
        renderLocal(widget);
      });
  }

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
        reveal(widget, visitors || total, tip);
      })
      .catch(function () { renderLocal(widget); });
  }

  /* ── 启动 ── */
  var widget = document.getElementById('hitCounter');
  if (!widget) return;

  if (IS_LOCAL) {
    renderLocal(widget);
  } else if (CONFIG.provider === 'worker') {
    requestWorker(widget);
  } else {
    requestAbacus(widget);
  }
})();