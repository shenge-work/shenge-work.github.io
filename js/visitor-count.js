/* ──────────────────────────────────────────────────────────────────────
   全站访客计数器 · 前端接入层
   ──────────────────────────────────────────────────────────────────────
   main.js 里那个「访问计数 · RENDER LOG」是 localStorage 本机累计，只有 1 个人
   能看到真实数字（就是你自己）。这一层在配好后端后接管它，显示全站真实数字。

   两个后端，改 CONFIG.provider 一行就能切：
     · abacus（默认）—— 国内实测可达（200 / 0.6s），免费，无 SLA
     · worker        —— 自己的 Cloudflare Worker，需要绑自有域名
                        （workers.dev 域名在境内被墙，实测超时）

   任何后端不可用 / 请求失败时保持原样，绝不把 0 或空白怼到页面上。
   ────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var CONFIG = {
    /* 'abacus'（默认，国内可达）或 'worker'（需 CONFIG.workerApi 配自有域名） */
    provider: 'abacus',

    /* provider=worker 时必填，形如 https://visits.你的域名 */
    workerApi: '',

    /* abacus 计数器坐标，命名空间建议保持唯一，避免和别人的计数冲突 */
    abacusBase: 'https://abacus.jasoncameron.dev',
    abacusNamespace: 'shenge-portfolio',
    abacusKey: 'visits',

    /* 同一会话不重复计数，避免刷新页面刷数字 */
    sessionKey: 'shenge_visit_counted',
    visitorKey: 'shenge_visitor_id'
  };

  if (location.protocol === 'file:') return;
  if (CONFIG.provider === 'worker' && !CONFIG.workerApi) return;

  var READY_TIMEOUT = 3000;   // #hitCounter 由 main.js 动态创建，等它出现
  var POLL_INTERVAL = 150;

  function getStore(kind) {
    try { return window[kind]; } catch (e) { return null; }
  }

  function uuid() {
    try {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
      }
    } catch (e) {}
    var s = '';
    for (var i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
    return s;
  }

  function visitorId() {
    var store = getStore('localStorage');
    if (store) {
      var saved = store.getItem(CONFIG.visitorKey);
      if (saved) return saved;
    }
    var id = uuid();
    if (store) {
      try { store.setItem(CONFIG.visitorKey, id); } catch (e) {}
    }
    return id;
  }

  function alreadyCounted() {
    var store = getStore('sessionStorage');
    try { return !!store && store.getItem(CONFIG.sessionKey) === '1'; } catch (e) { return false; }
  }

  function markCounted() {
    var store = getStore('sessionStorage');
    try { if (store) store.setItem(CONFIG.sessionKey, '1'); } catch (e) {}
  }

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

  function apply(widget, value, tip) {
    if (!value) return;                        // 服务端还没数据时不覆盖本机数字

    var head = widget.querySelector('.hit-counter-head');
    if (head) {
      var spans = head.querySelectorAll('span');
      var label = spans[spans.length - 1];
      if (label) label.textContent = '全站访问 · GLOBAL VISITS';
    }

    renderDigits(widget.querySelector('#hitCounterDigits'), value);

    widget.title = tip;
    widget.setAttribute('aria-label', tip);
    widget.setAttribute('data-source', CONFIG.provider);
  }

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
        apply(widget, n, '全站累计访问 ' + n + ' 次 · 同一会话只计一次');
      })
      .catch(function () { /* 失败就保留本机计数 */ });
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
        apply(widget, visitors, tip);
      })
      .catch(function () { /* 失败就保留本机计数 */ });
  }

  function request(widget) {
    if (CONFIG.provider === 'worker') requestWorker(widget);
    else requestAbacus(widget);
  }

  function waitForWidget(elapsed) {
    var widget = document.getElementById('hitCounter');
    if (widget) { request(widget); return; }
    if (elapsed >= READY_TIMEOUT) return;
    setTimeout(function () { waitForWidget(elapsed + POLL_INTERVAL); }, POLL_INTERVAL);
  }

  waitForWidget(0);
})();
