/* ──────────────────────────────────────────────────────────────────────
   全站访客计数器 · 前端接入层
   ──────────────────────────────────────────────────────────────────────
   main.js 里那个「访问计数 · RENDER LOG」是 localStorage 本机累计，只有 1 个人
   能看到真实数字（就是你自己）。这一层在 API 配好之后接管它：
     · 有 API → 显示「第 N 位访客」，数字来自 Cloudflare Worker + KV
     · 无 API / 请求失败 → 保持原样，绝不把 0 或空白怼到页面上
   部署 Worker 后，把地址填进下面 CONFIG.api 即可生效。
   ────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var CONFIG = {
    /* 形如 https://portfolio-visits.xxxx.workers.dev，未填写则本文件不生效 */
    api: '',
    /* 同一会话内不重复计数，避免刷新页面刷数字 */
    sessionKey: 'shenge_visit_counted',
    visitorKey: 'shenge_visitor_id'
  };

  if (!CONFIG.api) return;
  if (location.protocol === 'file:') return;

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

  function apply(widget, data) {
    var visitors = Number(data.visitors) || 0;
    var total = Number(data.total) || 0;
    if (!visitors) return;                     // 服务端还没数据时不覆盖本机数字

    var head = widget.querySelector('.hit-counter-head');
    if (head) {
      var spans = head.querySelectorAll('span');
      var label = spans[spans.length - 1];
      if (label) label.textContent = '全站访客 · GLOBAL VISITS';
    }

    renderDigits(widget.querySelector('#hitCounterDigits'), visitors);

    var tip = '你是第 ' + visitors + ' 位访客 · 全站累计访问 ' + total + ' 次';
    widget.title = tip;
    widget.setAttribute('aria-label', tip);
    widget.setAttribute('data-source', 'worker-kv');
  }

  function request(widget) {
    var counted = alreadyCounted();
    var url = CONFIG.api + (counted ? '/stats' : '/hit');
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
        apply(widget, data);
      })
      .catch(function () {
        /* 失败就安静地保留本机计数，不影响页面任何功能 */
      });
  }

  function waitForWidget(elapsed) {
    var widget = document.getElementById('hitCounter');
    if (widget) { request(widget); return; }
    if (elapsed >= READY_TIMEOUT) return;
    setTimeout(function () { waitForWidget(elapsed + POLL_INTERVAL); }, POLL_INTERVAL);
  }

  waitForWidget(0);
})();
