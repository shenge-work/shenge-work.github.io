/* ════════════════════════════════════════════════════════════
   CP.AI 角色舞台 · 皮肤切换系统
   --------------------------------------------------------------
   设计原则：
   1) 不碰 js/main.js 的问答逻辑 —— 单击角色等价于点原有 #aiFab，
      状态联动靠 MutationObserver 观察面板与打字气泡。
   2) 皮肤统一契约 create(host) -> { setState(s), destroy() }，
      状态 s ∈ idle | thinking | answer | greet | click。
   3) 3D 皮肤用本地 GLB + 按需加载的 model-viewer；2D 皮肤全部内联 SVG，
      无外部依赖、随站点主题变量换色，离线可跑。
   ════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var BASE = 'assets/skins/';
  var STORE = 'cpai_skin_v2';
  /* 旧版 key 作废：清掉 2D 默认的残留，让所有访问者统一落到 3D 默认 */
  try { localStorage.removeItem('cpai_skin_v1'); } catch (e) {}
  var aiFab = document.getElementById('aiFab');
  var aiPanel = document.getElementById('aiPanel');
  var aiBody = document.getElementById('aiBody');
  if (!aiFab || !aiPanel) return;

  /* ─────────────── SVG 角色素材（内联，零请求） ─────────────── */

  var SVG_CPBOT =
    '<svg class="ai-sk-svg" viewBox="0 0 120 150" aria-hidden="true">' +
    '<ellipse cx="60" cy="141" rx="34" ry="5" style="fill:rgba(var(--ink-rgb),.18)"/>' +
    '<g class="sk-breathe">' +
      '<g class="sk-cpbot-antenna"><path class="sk-line" d="M60 34V19"/><circle cx="60" cy="15" r="5" class="sk-orange sk-line"/></g>' +
      '<rect x="18" y="48" width="7" height="18" class="sk-ink"/><rect x="95" y="48" width="7" height="18" class="sk-ink"/>' +
      '<rect x="24" y="32" width="72" height="56" rx="6" class="sk-card sk-line"/>' +
      '<rect x="31" y="39" width="58" height="40" rx="3" class="sk-blue"/>' +
      '<g class="sk-cpbot-eyes">' +
        '<rect x="42" y="50" width="10" height="14" rx="2" class="sk-white sk-blink"/>' +
        '<rect x="68" y="50" width="10" height="14" rx="2" class="sk-white sk-blink"/>' +
      '</g>' +
      '<path d="M50 69Q60 75 70 69" style="fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round"/>' +
      '<rect x="34" y="88" width="52" height="42" rx="4" class="sk-card sk-line"/>' +
      '<rect x="42" y="96" width="36" height="17" class="sk-paper sk-line-thin"/>' +
      '<text x="60" y="108" text-anchor="middle" class="sk-ink" style="font:700 9px monospace;letter-spacing:.06em">CP.AI</text>' +
      '<circle cx="76" cy="121" r="4" class="sk-green sk-cpbot-lamp"/>' +
      '<path class="sk-line" d="M45 130v10M75 130v10"/>' +
    '</g></svg>';

  var SVG_CAT =
    '<svg class="ai-sk-svg" viewBox="0 0 120 150" aria-hidden="true">' +
    '<ellipse cx="60" cy="141" rx="36" ry="5" style="fill:rgba(var(--ink-rgb),.18)"/>' +
    '<g class="sk-breathe">' +
      '<g class="sk-cat-tail">' +
        '<path d="M88 118Q113 116 109 94Q107 82 98 88" style="fill:none;stroke:var(--ink);stroke-width:13;stroke-linecap:round"/>' +
        '<path d="M88 118Q113 116 109 94Q107 82 98 88" style="fill:none;stroke:var(--orange);stroke-width:7;stroke-linecap:round"/>' +
      '</g>' +
      '<rect x="34" y="90" width="52" height="45" rx="20" class="sk-card sk-line"/>' +
      '<g class="sk-cat-paw"><rect x="44" y="118" width="14" height="15" rx="7" class="sk-card sk-line"/>' +
      '<rect x="64" y="118" width="14" height="15" rx="7" class="sk-card sk-line"/></g>' +
      '<rect x="34" y="94" width="52" height="9" rx="4" class="sk-orange sk-line-thin"/>' +
      '<circle cx="60" cy="100" r="4" class="sk-blue sk-line-thin"/>' +
      '<g class="sk-cat-head">' +
        '<path class="sk-card sk-line sk-cat-ear" d="M34 58L32 34L52 48Z"/>' +
        '<path class="sk-card sk-line sk-cat-ear" d="M86 58L88 34L68 48Z"/>' +
        '<path d="M38 40L36 51L46 47Z" class="sk-orange"/><path d="M82 40L84 51L74 47Z" class="sk-orange"/>' +
        '<rect x="30" y="48" width="60" height="48" rx="20" class="sk-card sk-line"/>' +
        '<g class="sk-blink"><ellipse cx="47" cy="69" rx="6" ry="8" class="sk-ink"/>' +
        '<ellipse cx="73" cy="69" rx="6" ry="8" class="sk-ink"/></g>' +
        '<circle cx="49" cy="66" r="2" class="sk-white"/><circle cx="75" cy="66" r="2" class="sk-white"/>' +
        '<path d="M57 79L60 82L63 79Z" class="sk-orange"/>' +
        '<path d="M60 82v3M60 85q-5 5-9 1M60 85q5 5 9 1" class="sk-line-thin"/>' +
        '<path d="M32 76l-12-3M32 82l-12 3M88 76l12-3M88 82l12 3" class="sk-line-thin"/>' +
      '</g>' +
    '</g></svg>';

  var SVG_L2D =
    '<svg class="ai-sk-svg sk-l2d" viewBox="0 0 120 150" aria-hidden="true">' +
    '<ellipse cx="60" cy="141" rx="34" ry="5" style="fill:rgba(var(--ink-rgb),.18)"/>' +
    '<g class="sk-l2d-layer" data-depth="0.35">' +
      '<path d="M26 60Q20 18 60 16Q100 18 94 60L92 108Q88 124 60 124Q32 124 28 108Z" class="sk-ink"/>' +
    '</g>' +
    '<g class="sk-l2d-layer" data-depth="0.55">' +
      '<g class="sk-l2d-body">' +
        '<path d="M32 108Q60 98 88 108L94 140H26Z" class="sk-blue sk-line"/>' +
        '<path d="M52 104L60 116L68 104" class="sk-card sk-line-thin"/>' +
        '<path d="M60 116v22" class="sk-line-thin" style="stroke:var(--orange)"/>' +
        '<rect x="46" y="126" width="28" height="10" class="sk-card sk-line-thin"/>' +
        '<text x="60" y="134" text-anchor="middle" class="sk-ink" style="font:700 7px monospace">ARCHIVE</text>' +
      '</g>' +
    '</g>' +
    '<g class="sk-l2d-layer" data-depth="0.8">' +
      '<rect x="36" y="40" width="48" height="56" rx="18" class="sk-card sk-line"/>' +
      '<path d="M32 52Q60 34 88 52Q86 40 60 36Q34 40 32 52Z" class="sk-ink sk-l2d-hair"/>' +
      '<path d="M30 50Q36 26 60 26Q84 26 90 50L84 46Q60 34 36 46Z" class="sk-ink"/>' +
      '<g class="sk-blink"><ellipse cx="48" cy="66" rx="4.5" ry="6" class="sk-ink"/>' +
      '<ellipse cx="72" cy="66" rx="4.5" ry="6" class="sk-ink"/></g>' +
      '<circle cx="49.5" cy="64" r="1.6" class="sk-white"/><circle cx="73.5" cy="64" r="1.6" class="sk-white"/>' +
      '<circle cx="48" cy="66" r="10" class="sk-line-thin"/><circle cx="72" cy="66" r="10" class="sk-line-thin"/>' +
      '<path d="M58 66h4" class="sk-line-thin"/>' +
      '<path d="M55 82q5 5 10 0" class="sk-line-thin sk-l2d-mouth"/>' +
      '<circle cx="38" cy="76" r="4" class="sk-orange" style="opacity:.55"/>' +
      '<circle cx="82" cy="76" r="4" class="sk-orange" style="opacity:.55"/>' +
    '</g></svg>';

  var SVG_PET =
    '<svg class="ai-sk-svg" viewBox="0 0 60 60" aria-hidden="true">' +
    '<g class="sk-pet-body">' +
      '<rect x="8" y="12" width="44" height="38" rx="12" class="sk-card sk-line"/>' +
      '<rect x="13" y="17" width="34" height="20" rx="8" class="sk-blue"/>' +
      '<g class="sk-blink"><circle cx="22" cy="27" r="3.6" class="sk-white"/>' +
      '<circle cx="38" cy="27" r="3.6" class="sk-white"/></g>' +
      '<circle cx="22" cy="27" r="1.7" class="sk-ink"/><circle cx="38" cy="27" r="1.7" class="sk-ink"/>' +
      '<path d="M26 40q4 4 8 0" class="sk-line-thin"/>' +
      '<path class="sk-pet-arm sk-line" d="M50 30q9-2 8-10"/>' +
      '<path class="sk-line" d="M18 50v6M42 50v6"/>' +
      '<rect x="15" y="9" width="30" height="5" rx="2" class="sk-orange"/>' +
    '</g></svg>';

  var SVG_MASCOT =
    '<svg class="ai-sk-svg" viewBox="0 0 120 150" aria-hidden="true">' +
    '<ellipse cx="60" cy="141" rx="34" ry="5" style="fill:rgba(var(--ink-rgb),.18)"/>' +
    '<g class="sk-breathe">' +
      '<circle cx="60" cy="76" r="48" class="sk-line-thin sk-mascot-ring" style="stroke-dasharray:7 9;stroke:var(--blue)"/>' +
      '<g class="sk-mascot-core">' +
        '<path d="M60 30L96 76L60 122L24 76Z" class="sk-blue sk-line"/>' +
        '<path d="M60 42L86 76L60 110L34 76Z" class="sk-card sk-line-thin"/>' +
        '<g class="sk-blink"><rect x="46" y="66" width="9" height="13" rx="3" class="sk-ink"/>' +
        '<rect x="65" y="66" width="9" height="13" rx="3" class="sk-ink"/></g>' +
        '<path d="M52 90q8 7 16 0" class="sk-line-thin"/>' +
        '<path d="M60 30V18" class="sk-line"/><circle cx="60" cy="15" r="5" class="sk-orange sk-line"/>' +
        '<text x="60" y="80" text-anchor="middle" style="font:700 8px monospace;fill:var(--ink);opacity:.35">CP</text>' +
      '</g>' +
    '</g></svg>';

  var SVG_TALK =
    '<svg class="ai-sk-svg" viewBox="0 0 120 150" aria-hidden="true">' +
    '<ellipse cx="60" cy="141" rx="34" ry="5" style="fill:rgba(var(--ink-rgb),.18)"/>' +
    '<g class="sk-breathe">' +
      '<path d="M22 140q4-30 38-30t38 30Z" class="sk-blue sk-line"/>' +
      '<path d="M52 110l8 12 8-12" class="sk-card sk-line-thin"/>' +
      '<rect x="36" y="32" width="48" height="62" rx="22" class="sk-card sk-line"/>' +
      '<path d="M34 50Q36 22 60 22Q84 22 86 50L80 42Q60 30 40 42Z" class="sk-ink"/>' +
      '<g class="sk-blink"><ellipse cx="48" cy="62" rx="4" ry="5.5" class="sk-ink"/>' +
      '<ellipse cx="72" cy="62" rx="4" ry="5.5" class="sk-ink"/></g>' +
      '<ellipse cx="60" cy="80" rx="7" ry="4" class="sk-ink sk-talk-mouth"/>' +
      '<circle cx="38" cy="72" r="4" class="sk-orange" style="opacity:.5"/>' +
      '<circle cx="82" cy="72" r="4" class="sk-orange" style="opacity:.5"/>' +
      '<g transform="translate(90 66)">' +
        '<rect class="sk-wave-bar sk-orange" x="0" y="4" width="4" height="16" rx="2"/>' +
        '<rect class="sk-wave-bar sk-blue" x="7" y="0" width="4" height="20" rx="2"/>' +
        '<rect class="sk-wave-bar sk-orange" x="14" y="6" width="4" height="14" rx="2"/>' +
        '<rect class="sk-wave-bar sk-blue" x="21" y="2" width="4" height="18" rx="2"/>' +
      '</g>' +
    '</g></svg>';

  /* ─────────────── 3D 皮肤工厂 ─────────────── */

  var mvPromise = null;
  /* 动态 import 必须用绝对 URL：classic script 里的裸相对 specifier 在部分浏览器会解析失败 */
  var MV_URL = new URL(BASE + 'vendor/model-viewer.min.js', document.baseURI).href;
  function ensureModelViewer() {
    if (window.customElements && customElements.get('model-viewer')) return Promise.resolve();
    if (mvPromise) return mvPromise;
    var loaded = import(MV_URL).then(function () {
      return customElements.whenDefined('model-viewer');
    });
    var guard = new Promise(function (_, reject) {
      setTimeout(function () { reject(new Error('model-viewer timeout')); }, 12000);
    });
    mvPromise = Promise.race([loaded, guard]).catch(function (e) {
      mvPromise = null;
      throw e;
    });
    return mvPromise;
  }

  function fallback3D(hostEl, msg) {
    hostEl.innerHTML = SVG_CPBOT + '<div class="ai-mv-hud">3D 降级 // ' + msg + '</div>';
  }

  function create3D(cfg) {
    return function (host) {
      var disposed = false, mv = null, state = 'idle', restoreTimer = null;
      host.innerHTML =
        '<div class="ai-mv-loading">' +
          '<svg class="ai-sk-svg" viewBox="0 0 120 150" style="max-width:110px;max-height:130px">' +
            '<ellipse cx="60" cy="141" rx="30" ry="5" style="fill:rgba(var(--ink-rgb),.18)"/>' +
            '<rect x="34" y="46" width="52" height="46" rx="8" class="sk-card sk-line"/>' +
            '<rect x="42" y="56" width="36" height="24" rx="3" class="sk-blue"/>' +
            '<text x="60" y="112" text-anchor="middle" style="font:700 9px monospace;fill:var(--ink-soft)">LOADING 3D…</text>' +
          '</svg></div>' +
        (cfg.hud ? '<div class="ai-mv-frame"></div><div class="ai-mv-scan"></div><div class="ai-mv-hud">LIVE 3D // HYBRID</div>' : '');

      ensureModelViewer().then(function () {
        if (disposed) return;
        mv = document.createElement('model-viewer');
        mv.className = 'ai-mv';
        mv.setAttribute('src', BASE + 'models/' + cfg.file);
        mv.setAttribute('alt', cfg.name + ' 3D 模型');
        mv.setAttribute('autoplay', '');
        mv.setAttribute('animation-name', cfg.clips.idle);
        mv.setAttribute('animation-crossfade-duration', '280');
        /* 四足动物固定侧面视角更好看，靠骨骼 idle 动画提供活动；人形/机器人可缓慢自转 */
        if (cfg.rotate) {
          mv.setAttribute('auto-rotate', '');
          mv.setAttribute('auto-rotate-delay', '0');
          mv.setAttribute('rotation-per-second', cfg.rotate);
        }
        mv.setAttribute('camera-orbit', cfg.orbit || '0deg 80deg 150%');
        mv.setAttribute('field-of-view', cfg.fov || '32deg');
        mv.setAttribute('shadow-intensity', '0');
        mv.setAttribute('interaction-prompt', 'none');
        mv.setAttribute('touch-action', 'pan-y');
        mv.setAttribute('loading', 'eager');
        var loading = host.querySelector('.ai-mv-loading');
        if (loading) loading.remove();
        host.appendChild(mv);
        mv.addEventListener('load', function () { apply(state, true); });
        mv.addEventListener('error', function () { fallback3D(host, '模型加载失败'); });
      }).catch(function () {
        if (disposed) return;
        fallback3D(host, '需用 http 预览');
      });

      function apply(s, force) {
        state = s;
        if (!mv) return;
        var clip = cfg.clips[s] || cfg.clips.idle;
        var transient = (s === 'answer' || s === 'greet' || s === 'click');
        if (mv.animationName !== clip || force) mv.animationName = clip;
        if (restoreTimer) { clearTimeout(restoreTimer); restoreTimer = null; }
        if (transient) {
          restoreTimer = setTimeout(function () { apply('idle'); }, cfg.hold || 2200);
        }
      }
      return {
        setState: function (s) { apply(s); },
        destroy: function () { disposed = true; if (restoreTimer) clearTimeout(restoreTimer); if (mv) mv.remove(); }
      };
    };
  }

  /* ─────────────── 2D 皮肤工厂 ─────────────── */

  function createStatic(svg, stateClass) {
    return function (host) {
      host.innerHTML = svg;
      var t = null;
      return {
        setState: function (s) {
          host.classList.remove('is-thinking', 'is-answer', 'is-greet');
          if (s === 'thinking') host.classList.add('is-thinking');
          if (s === 'answer' || s === 'greet') host.classList.add('is-answer');
          if (t) clearTimeout(t);
          if (s === 'answer' || s === 'greet') {
            t = setTimeout(function () { host.classList.remove('is-answer'); }, 2600);
          }
          if (stateClass) stateClass(host, s);
        },
        destroy: function () { if (t) clearTimeout(t); }
      };
    };
  }

  /* 看板娘：鼠标视差跟随 */
  function createLive2D(host) {
    host.innerHTML = SVG_L2D;
    var layers = host.querySelectorAll('.sk-l2d-layer');
    var t = null;
    function onMove(e) {
      var r = host.getBoundingClientRect();
      var dx = ((e.clientX - r.left) / r.width - .5) * 2;
      var dy = ((e.clientY - r.top) / r.height - .5) * 2;
      for (var i = 0; i < layers.length; i++) {
        var d = parseFloat(layers[i].getAttribute('data-depth')) || .5;
        layers[i].style.transform = 'translate(' + (dx * 7 * d).toFixed(1) + 'px,' + (dy * 5 * d).toFixed(1) + 'px)';
      }
    }
    function onLeave() {
      for (var i = 0; i < layers.length; i++) layers[i].style.transform = '';
    }
    document.addEventListener('mousemove', onMove);
    host.addEventListener('mouseleave', onLeave);
    return {
      setState: function (s) {
        host.classList.toggle('is-answer', s === 'answer' || s === 'greet');
        if (t) clearTimeout(t);
        if (s === 'answer' || s === 'greet') t = setTimeout(function () { host.classList.remove('is-answer'); }, 2600);
      },
      destroy: function () {
        document.removeEventListener('mousemove', onMove);
        host.removeEventListener('mouseleave', onLeave);
        if (t) clearTimeout(t);
      }
    };
  }

  /* 桌宠：随机状态机 + 拖拽 */
  function createDeskPet(host) {
    host.classList.add('sk-pet-host');
    host.innerHTML = '<div class="sk-pet-shadow"></div>' +
      '<div class="sk-pet" data-state="idle">' + SVG_PET + '</div>';
    var pet = host.querySelector('.sk-pet');
    var shadow = host.querySelector('.sk-pet-shadow');
    var x = 18, dir = 1, state = 'idle', timer = null, dragging = false, dragX = 0, startX = 0;
    var states = ['idle', 'idle', 'walk', 'sit', 'walk', 'jump', 'wave'];

    function tick() {
      if (dragging) return schedule(700);
      var next = states[Math.floor(Math.random() * states.length)];
      state = next;
      pet.setAttribute('data-state', next);
      if (next === 'walk') {
        dir = Math.random() < .5 ? -1 : 1;
        var steps = 8 + Math.floor(Math.random() * 8);
        var step = 0;
        var walkTimer = setInterval(function () {
          x += dir * 7;
          var max = host.clientWidth - 60;
          if (x < 0) { x = 0; dir = 1; }
          if (x > max) { x = max; dir = -1; }
          pet.style.left = x + 'px';
          shadow.style.left = x + 'px';
          if (++step >= steps) { clearInterval(walkTimer); pet.setAttribute('data-state', 'idle'); }
        }, 110);
      }
      schedule(1400 + Math.random() * 2200);
    }
    function schedule(ms) { if (timer) clearTimeout(timer); timer = setTimeout(tick, ms); }

    function down(e) {
      dragging = true;
      startX = e.clientX; dragX = x;
      pet.classList.add('is-dragging');
      pet.setAttribute('data-state', 'idle');
      if (pet.setPointerCapture && e.pointerId !== undefined) pet.setPointerCapture(e.pointerId);
      e.preventDefault();
    }
    function move(e) {
      if (!dragging) return;
      x = Math.max(0, Math.min(host.clientWidth - 60, dragX + e.clientX - startX));
      pet.style.left = x + 'px';
      shadow.style.left = x + 'px';
    }
    function up() {
      if (!dragging) return;
      dragging = false;
      pet.classList.remove('is-dragging');
      schedule(500);
    }
    pet.addEventListener('pointerdown', down);
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    x = 18; pet.style.left = x + 'px'; shadow.style.left = x + 'px';
    schedule(900);

    return {
      setState: function (s) {
        if (dragging) return;
        if (s === 'answer' || s === 'greet') { pet.setAttribute('data-state', 'wave'); }
        else if (s === 'thinking') { pet.setAttribute('data-state', 'jump'); }
      },
      destroy: function () {
        if (timer) clearTimeout(timer);
        pet.removeEventListener('pointerdown', down);
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
      }
    };
  }

  /* 专属形象：优先 AI 生成立绘，失败回退本地吉祥物 */
  function createGenerated(host) {
    host.innerHTML = SVG_MASCOT;
    var img = document.createElement('img');
    img.className = 'sk-gen-img';
    img.alt = 'CP.AI 专属形象';
    img.src = BASE + 'generated.png';
    img.onload = function () { host.innerHTML = ''; host.appendChild(img); };
    var t = null;
    return {
      setState: function (s) {
        host.classList.toggle('is-thinking', s === 'thinking');
        if (s === 'answer' || s === 'greet') {
          host.classList.add('is-answer');
          if (t) clearTimeout(t);
          t = setTimeout(function () { host.classList.remove('is-answer'); }, 2400);
        }
      },
      destroy: function () { if (t) clearTimeout(t); }
    };
  }

  /* ─────────────── 皮肤清单 ─────────────── */

  var SKINS = [
    {
      id: 'robot3d', key: '1', group: '3D 真模型 · 本地 GLB', name: '机器人 ROBOT',
      meta: 'Idle / Wave / ThumbsUp',
      note: 'three.js 官方示例模型，CC0 / MIT，自带 14 段骨骼动画。待机循环 Idle，回答完自动比赞，点击跳跃。',
      create: create3D({
        file: 'RobotExpressive.glb', name: '机器人 ROBOT', orbit: '0deg 82deg 270%', fov: '26deg', rotate: '10deg',
        clips: { idle: 'Idle', thinking: 'Standing', answer: 'ThumbsUp', greet: 'Wave', click: 'Jump' }
      })
    },
    {
      id: 'fox3d', key: '2', group: '3D 真模型 · 本地 GLB', name: '狐狸 FOX',
      meta: 'Survey / Walk / Run',
      note: 'Khronos glTF 官方示例，CC0 + CC-BY 4.0。待机 Survey 环顾四周，思考时踱步，打招呼时小跑。',
      create: create3D({
        file: 'Fox.glb', name: '狐狸 FOX', orbit: '90deg 80deg 200%', fov: '30deg', rotate: null,
        clips: { idle: 'Survey', thinking: 'Walk', answer: 'Run', greet: 'Run', click: 'Walk' }, hold: 1600
      })
    },
    {
      id: 'hybrid', key: '3', group: '3D 真模型 · 本地 GLB', name: '混合 HYBRID',
      meta: '3D 模型 + 档案风 HUD',
      note: '「现成 3D 容器 + 本站定制外观」的混合解：同一个 GLB，套上档案风边框、扫描线与状态牌。',
      create: create3D({
        file: 'RobotExpressive.glb', name: '混合 HYBRID', hud: true, orbit: '12deg 82deg 250%', fov: '27deg', rotate: '14deg',
        clips: { idle: 'Idle', thinking: 'Dance', answer: 'Yes', greet: 'Wave', click: 'Wave' }
      })
    },
    {
      id: 'cpbot', key: '4', group: '2D 本地角色 · 零外部依赖', name: 'CP.AI 档案机器人',
      meta: 'SVG · 随主题换色',
      note: '为本站配色定制的档案风机器人，零依赖、秒开。呼吸、眼睛扫描、天线摆动、状态灯闪烁。',
      create: createStatic(SVG_CPBOT)
    },
    {
      id: 'cat2d', key: '5', group: '2D 本地角色 · 零外部依赖', name: '猫宠 NYAN',
      meta: 'SVG 状态动画',
      note: 'Rive / Lottie 风格状态动画的本地 SVG 等效实现：6 秒呼吸循环、尾巴摆动、耳朵抖动、眨眼、抬爪。',
      create: createStatic(SVG_CAT)
    },
    {
      id: 'live2d', key: '6', group: '2D 本地角色 · 零外部依赖', name: '看板娘 ARCHIVIST',
      meta: '分层视差 + 眨眼',
      note: 'Live2D 风格的分层视差看板娘，鼠标跟随、眨眼、发丝摆动、回答时口型。本地 SVG 等效，规避 Cubism 授权与社区模型版权。',
      create: createLive2D
    },
    {
      id: 'deskpet', key: '7', group: '2D 本地角色 · 零外部依赖', name: '桌宠 SHIMEJI',
      meta: '状态机 · 可拖拽',
      note: 'Shimeji 桌宠状态机本地实现：随机走动 / 坐下 / 跳跃 / 挥手，还能用鼠标拖着玩。Shift 拖走不挡页面。',
      create: createDeskPet
    },
    {
      id: 'generated', key: '8', group: '实验 · 可扩展', name: '专属形象 GENERATED',
      meta: 'AI 立绘 · 透明底',
      note: 'WorkBuddy 图像生成产出的专属档案风机器人立绘（透明底 512px / 137KB），已抠掉背景与水印，配 CSS 呼吸与浮动。替换 assets/skins/generated.png 即可换形象。',
      create: createGenerated
    },
    {
      id: 'talking', key: '9', group: '实验 · 可扩展', name: '实时数字人 LIVE',
      meta: '说话波形 · 待接 API',
      note: 'D-ID / HeyGen LiveAvatar 等实时数字人的本地等效皮肤：呼吸、口型、声波。真正接入需 API Key 与按分钟计费。',
      create: createStatic(SVG_TALK)
    }
  ];

  function byId(id) { for (var i = 0; i < SKINS.length; i++) if (SKINS[i].id === id) return SKINS[i]; return null; }

  /* ─────────────── 舞台 / 菜单 DOM ─────────────── */

  var stage = document.createElement('div');
  stage.className = 'ai-stage';
  stage.id = 'aiStage';
  stage.setAttribute('role', 'button');
  stage.setAttribute('tabindex', '0');
  stage.setAttribute('aria-label', 'CP.AI 角色，点击打开简历问答，右键或双击更换皮肤');
  stage.innerHTML =
    '<div class="ai-stage-actor" id="aiActor"></div>' +
    '<div class="ai-stage-name" id="aiSkinName"></div>' +
    '<button class="ai-stage-menu-btn" id="aiSkinBtn" type="button" aria-label="打开皮肤菜单">&#9672;</button>';
  aiFab.parentNode.insertBefore(stage, aiFab);

  var menu = document.createElement('div');
  menu.className = 'ai-skin-menu';
  menu.id = 'aiSkinMenu';
  menu.hidden = true;
  menu.innerHTML =
    '<div class="ai-skin-menu-head">' +
      '<span class="ai-skin-menu-title">SKINS // 角色皮肤</span>' +
      '<span class="ai-skin-menu-sub" id="aiSkinCount"></span>' +
      '<button class="ai-skin-menu-x" id="aiSkinClose" type="button" aria-label="关闭皮肤菜单">×</button>' +
    '</div>' +
    '<div class="ai-skin-menu-body" id="aiSkinBody"></div>' +
    '<div class="ai-skin-menu-foot">' +
      '<b>右键</b> 角色 · <b>双击</b> 角色 · <b>长按</b>（手机） · 点 <b>◈</b> · 按 <b>S</b> 都能打开菜单；数字 <b>1–9</b> 直接切换。' +
      '<div class="ai-skin-note" id="aiSkinNote"></div>' +
    '</div>';
  document.body.appendChild(menu);

  var actor = stage.querySelector('#aiActor');
  var nameEl = stage.querySelector('#aiSkinName');
  var bodyEl = menu.querySelector('#aiSkinBody');
  var noteEl = menu.querySelector('#aiSkinNote');
  menu.querySelector('#aiSkinCount').textContent = SKINS.length + ' 款 · 全部离线可用';

  var cardsHtml = '', lastGroup = '';
  SKINS.forEach(function (s) {
    if (s.group !== lastGroup) {
      if (lastGroup) cardsHtml += '</div>';
      cardsHtml += '<div class="ai-skin-group">' + s.group + '</div><div class="ai-skin-grid">';
      lastGroup = s.group;
    }
    cardsHtml +=
      '<button class="ai-skin-card" type="button" data-skin="' + s.id + '">' +
        '<span class="ai-skin-card-key">' + s.key + '</span>' +
        '<span class="ai-skin-card-txt">' +
          '<span class="ai-skin-card-name">' + s.name + '</span>' +
          '<span class="ai-skin-card-meta">' + s.meta + '</span>' +
        '</span>' +
      '</button>';
  });
  cardsHtml += '</div>';
  bodyEl.innerHTML = cardsHtml;

  /* ─────────────── 切换逻辑 ─────────────── */

  var current = null, instance = null, host = null;

  function setState(s) { if (instance && instance.setState) instance.setState(s); }

  function activate(id, silent) {
    var skin = byId(id);
    if (!skin) return;
    if (instance && instance.destroy) { try { instance.destroy(); } catch (e) {} }
    actor.innerHTML = '';
    host = document.createElement('div');
    host.className = 'ai-skin-host';
    actor.appendChild(host);
    try { instance = skin.create(host) || {}; } catch (e) { instance = {}; host.innerHTML = SVG_CPBOT; }
    current = skin;
    stage.setAttribute('data-skin', id);
    nameEl.textContent = skin.name;
    noteEl.innerHTML = '<b>' + skin.name + '</b> · ' + skin.note;
    var cards = bodyEl.querySelectorAll('.ai-skin-card');
    for (var i = 0; i < cards.length; i++) {
      cards[i].classList.toggle('is-active', cards[i].getAttribute('data-skin') === id);
    }
    try { localStorage.setItem(STORE, id); } catch (e) {}
    stage.classList.remove('is-switching');
    void stage.offsetWidth;
    stage.classList.add('is-switching');
    if (!silent) setState('greet');
    else setState('idle');
  }

  function savedSkin() {
    try { var v = localStorage.getItem(STORE); if (v && byId(v)) return v; } catch (e) {}
    return 'robot3d';
  }

  /* ─────────────── 菜单开关 ─────────────── */

  function openMenu() {
    /* 换皮肤时先收起问答面板，避免两个浮层叠在一起 */
    if (!aiPanel.hidden) aiFab.click();
    menu.hidden = false;
  }
  function closeMenu() { menu.hidden = true; }
  function toggleMenu() { menu.hidden ? openMenu() : closeMenu(); }

  stage.addEventListener('contextmenu', function (e) { e.preventDefault(); toggleMenu(); });

  /* 单击 = 打开问答（走原 aiFab，完全复用原逻辑）；双击 = 打开皮肤菜单 */
  var clickTimer = null, clickCount = 0;
  stage.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('.ai-stage-menu-btn')) return;
    clickCount++;
    if (clickCount >= 2) {
      if (clickTimer) clearTimeout(clickTimer);
      clickTimer = null; clickCount = 0;
      openMenu();
      return;
    }
    clickTimer = setTimeout(function () {
      clickCount = 0; clickTimer = null;
      aiFab.click();
      setState('click');
    }, 230);
  });
  stage.addEventListener('dblclick', function (e) { e.preventDefault(); openMenu(); });
  stage.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); aiFab.click(); }
  });
  stage.querySelector('#aiSkinBtn').addEventListener('click', function (e) {
    e.stopPropagation(); toggleMenu();
  });
  menu.querySelector('#aiSkinClose').addEventListener('click', closeMenu);
  bodyEl.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('[data-skin]') : null;
    if (!btn) return;
    activate(btn.getAttribute('data-skin'));
  });

  /* 移动端长按 */
  var pressTimer = null, longPressed = false;
  stage.addEventListener('touchstart', function (e) {
    if (e.target.closest && e.target.closest('.ai-stage-menu-btn')) return;
    longPressed = false;
    pressTimer = setTimeout(function () { longPressed = true; openMenu(); }, 550);
  }, { passive: true });
  stage.addEventListener('touchend', function () {
    if (pressTimer) clearTimeout(pressTimer);
    if (longPressed) {
      longPressed = false;
      if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; clickCount = 0; }
    }
  }, { passive: true });
  stage.addEventListener('touchmove', function () {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
  }, { passive: true });

  document.addEventListener('pointerdown', function (e) {
    if (menu.hidden) return;
    if (menu.contains(e.target) || stage.contains(e.target)) return;
    closeMenu();
  }, true);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeMenu(); return; }
    var tag = (e.target && e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;
    if (e.key >= '1' && e.key <= '9') { activate(SKINS[parseInt(e.key, 10) - 1].id); return; }
    if (e.key === 's' || e.key === 'S') { toggleMenu(); }
  });

  /* ─────────────── 与问答面板的状态联动（不修改 main.js） ─────── */

  var wasTyping = false;
  var wasTip = false;
  var wasOpen = aiPanel.hidden === false;
  document.body.classList.toggle('ai-panel-open', wasOpen);

  if (window.MutationObserver) {
    var mo = new MutationObserver(function () {
      var open = !aiPanel.hidden;
      if (open !== wasOpen) {
        wasOpen = open;
        document.body.classList.toggle('ai-panel-open', open);
        if (open) setState('greet'); else setState('idle');
      }
      var typing = !!(aiBody && aiBody.querySelector('.ai-typing'));
      if (typing && !wasTyping) setState('thinking');
      if (!typing && wasTyping) setState('answer');
      wasTyping = typing;
    });
    mo.observe(aiPanel, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
    if (aiBody) mo.observe(aiBody, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

    /* 主动打招呼气泡出现时让角色挥手（"我是 AI 简历问答助手"自我介绍） */
    var tipMo = new MutationObserver(function () {
      var tip = document.querySelector('.ai-fab-tip');
      var now = !!tip;
      if (now !== wasTip) {
        wasTip = now;
        if (now && aiPanel.hidden) setState('greet');
        else if (!now && aiPanel.hidden) setState('idle');
      }
    });
    tipMo.observe(aiFab.parentNode, { childList: true });
  }

  /* ─────────────── 启动 + 空闲预加载 3D 组件 ─────── */

  activate(savedSkin(), true);
  document.body.classList.add('has-ai-skin');

  function preload3D() { ensureModelViewer().catch(function () {}); }
  if (window.requestIdleCallback) requestIdleCallback(preload3D, { timeout: 4000 });
  else setTimeout(preload3D, 2500);

  /* 控制台快捷入口，方便调试：window.CPAI_SKINS.list() / .use('fox3d') */
  window.CPAI_SKINS = {
    list: function () { return SKINS.map(function (s) { return s.key + ' ' + s.id + ' — ' + s.name; }); },
    use: activate,
    menu: toggleMenu,
    current: function () { return current && current.id; }
  };
})();
