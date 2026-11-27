/* ════════════════════════════════════════════════════════════
   asset-cdn.js · 静态资源 CDN 重写器（可一键切换 / 可回退）
   ────────────────────────────────────────────────────────────
   作用：把站内相对路径的图片 / 视频 / 3D 模型，按 data/asset-manifest.json
         的映射改写到云对象存储 URL，加速静态资源访问。

   设计要点：
   1. 零侵入：不改业务代码，只在数据对象被消费前原地重写字段值。
   2. 可切换：切换源只需改 manifest 的 _baseUrl（或换一份 manifest），
      本文件与业务代码都不用动；将来迁 Cloudflare R2 同理。
   3. 可回退：任何一步失败（manifest 缺失 / 关闭开关）都保留本地相对路径，
      页面不会白屏；单个资源失败可用 AssetURL.setEnabled(false) 全量回退。
   4. 开关：URL ?assetcdn=0 或 localStorage.cp_asset_cdn = '0' 可临时关闭。

   加载顺序：必须在 data/site-data.js 与 data/company-profiles.js 之后、
   js/main.js 与 js/company-profile.js / ai-skins.js 之前加载。
   ════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var MANIFEST_URL = 'data/asset-manifest.json';
  var RE_STORAGE_PATH = /\.(png|jpe?g|webp|gif|svg|mp4|glb|gltf)(\?.*)?$/i;

  var state = {
    enabled: true,
    ready: false,
    baseUrl: '',
    map: Object.create(null), // 相对路径 -> 绝对 URL
  };

  // 读取用户开关：URL 参数或 localStorage 都能关
  try {
    var q = new URLSearchParams(location.search).get('assetcdn');
    if (q === '0' || q === 'off') state.enabled = false;
    if (localStorage.getItem('cp_asset_cdn') === '0') state.enabled = false;
  } catch (e) {}

  function isRelativePath(v) {
    if (typeof v !== 'string' || !v) return false;
    if (/^(https?:)?\/\//i.test(v) || v.indexOf('data:') === 0 || v.indexOf('blob:') === 0) return false;
    return RE_STORAGE_PATH.test(v);
  }

  // 核心：相对路径 -> 云 URL。命中 manifest 才替换，否则原样返回。
  function of(value) {
    if (!state.enabled || !state.ready || !isRelativePath(value)) return value;
    var clean = String(value).split('?')[0];
    var mapped = state.map[clean] || state.map[clean.replace(/^\.\//, '')];
    if (!mapped) return value;
    var suffix = String(value).slice(clean.length); // 保留 ?v= 版本串
    return mapped + suffix;
  }

  // 定点 + 值匹配：递归重写数据对象里的图片/视频/模型字符串。
  // 只处理对象/数组，不碰函数、DOM、循环引用用 WeakSet 兜底。
  function rewriteData(obj, seen) {
    if (!state.enabled || !state.ready || !obj || typeof obj !== 'object') return;
    seen = seen || new WeakSet();
    if (seen.has(obj)) return;
    seen.add(obj);
    if (Array.isArray(obj)) {
      for (var i = 0; i < obj.length; i++) {
        if (typeof obj[i] === 'string') obj[i] = of(obj[i]);
        else if (obj[i] && typeof obj[i] === 'object') rewriteData(obj[i], seen);
      }
    } else {
      Object.keys(obj).forEach(function (k) {
        var v = obj[k];
        if (typeof v === 'string') obj[k] = of(v);
        else if (v && typeof v === 'object') rewriteData(v, seen);
      });
    }
  }

  // 重写页面上已存在的静态标签（HTML 硬编码的 img/favicon/video）
  function rewriteDOM(root) {
    if (!state.enabled || !state.ready) return;
    var scope = root || document;
    var nodes = scope.querySelectorAll('img[src], video[src], source[src], link[rel~="icon"][href]');
    Array.prototype.forEach.call(nodes, function (el) {
      /* 首屏头像不换 CDN：图片已压到 38 KB（480×480 q78），同源直取比再走一次
         跨域 DNS+TLS+RTT 更快；它也是 Lighthouse 里 LCP 的元素，换域会多一轮重绘。 */
      if (el.id === 'idcardPhoto' || el.id === 'aboutPhoto') return;
      var attr = el.hasAttribute('src') ? 'src' : 'href';
      var cur = el.getAttribute(attr);
      var next = of(cur);
      if (next !== cur) el.setAttribute(attr, next);
    });
  }

  function applyData() {
    if (!state.enabled || !state.ready) return;
    rewriteData(window.SITE_DATA);
    rewriteData(window.PEOPLE_DATA);
    rewriteData(window.COMPANY_PROFILES);
  }

  function applyDOM() {
    // 再重写一次数据：覆盖在页面尾部才加载的 company-profiles.js
    applyData();
    rewriteDOM(document);
    try { document.dispatchEvent(new CustomEvent('assetcdn:ready')); } catch (e) {}
  }

  // 3D 模型专用：把 assets/skins/models/<file> 转成云 URL，保留 ?v= 版本串
  function model(file) {
    var rel = 'assets/skins/models/' + String(file).split('?')[0];
    var mapped = state.enabled && state.ready ? state.map[rel] : null;
    var query = String(file).indexOf('?') >= 0 ? String(file).slice(String(file).indexOf('?')) : '';
    return (mapped || rel) + query;
  }

  // 对外 API
  window.AssetURL = {
    of: of,
    model: model,
    rewriteData: rewriteData,
    rewriteDOM: rewriteDOM,
    isEnabled: function () { return state.enabled && state.ready; },
    setEnabled: function (on) {
      state.enabled = !!on;
      try { localStorage.setItem('cp_asset_cdn', on ? '1' : '0'); } catch (e) {}
      if (!on) location.reload();
    },
    get map() { return state.map; },
  };

  function fromSyncMap() {
    var base = window.__ASSET_BASE__;
    var map = window.__ASSET_MAP__;
    if (!base || !map) return false;
    state.baseUrl = base;
    // 同步 map 的值是相对路径，统一拼成绝对 URL
    Object.keys(map).forEach(function (k) { state.map[k] = base + map[k]; });
    state.ready = true;
    return true;
  }

  function onReady() {
    applyData();   // 立即重写数据对象（供后续脚本渲染使用）
    // DOM 可能还没解析完，硬编码标签放到下一帧再改写
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', applyDOM);
    } else {
      applyDOM();
    }
  }

  function boot() {
    // 1) 同步 map 优先：脚本加载即可用，无时序/闪烁问题
    if (fromSyncMap()) { onReady(); return; }
    // 2) 兜底：异步 manifest（同步 map 缺失时）
    if (location.protocol === 'file:') return;
    fetch(MANIFEST_URL, { cache: 'force-cache' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (m) {
        state.baseUrl = m._baseUrl || '';
        var files = m.files || {};
        Object.keys(files).forEach(function (k) {
          state.map[k] = /^https?:/i.test(files[k]) ? files[k] : (state.baseUrl + files[k]);
        });
        state.ready = true;
        onReady();
      })
      .catch(function () { /* 回退：保留本地相对路径 */ });
  }

  // 头部加载：site-data.js 已就绪，main.js 尚未加载 → 数据重写先于渲染
  boot();
})();
