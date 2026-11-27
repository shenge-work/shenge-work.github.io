/* ════════════════════════════════════════════════════════
   学校档案 · school-profile.js
   ────────────────────────────────────────────────────────
   数据源：data/school-profiles.js（由 school-profiles.json 生成）
   用法：  window.SchoolProfile.render('xinhua') → 完整档案 HTML
           window.SchoolProfile.get / list / meta
   与公司档案同款：独立页与未来可能的抽屉共用同一渲染函数；
   长板块默认折叠、会话内记住展开状态、打印时强制全展开。
   ════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var ROOT = (window.SCHOOL_PROFILES && typeof window.SCHOOL_PROFILES === 'object')
    ? window.SCHOOL_PROFILES : { meta: {}, schools: {} };
  var SCHOOLS = ROOT.schools || {};
  var META = ROOT.meta || {};
  var CUR = null;                 // 当前渲染的学校，供 sup() 查来源
  var FOLD_KEY = 'sp_fold_state';
  var foldState = {};
  try { foldState = JSON.parse(sessionStorage.getItem(FOLD_KEY) || '{}') || {}; } catch (e) { foldState = {}; }

  /* 所有学校的验证码统一在渲染出口脱敏：数据置信度 / 来源说明等板块
     也会引用验证码，只锁学历核验块会被绕过去。 */
  var VERIFY_CODES = Object.keys(SCHOOLS).map(function (k) {
    var v = SCHOOLS[k] && SCHOOLS[k].verify;
    return v && v.code ? String(v.code) : '';
  }).filter(Boolean);
  var REDACTED = '••••••••••••••••';

  function rawEsc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function esc(s) {
    var out = String(s == null ? '' : s);
    VERIFY_CODES.forEach(function (code) { out = out.split(code).join(REDACTED); });
    return rawEsc(out);
  }
  function school(id) { return SCHOOLS[id] || null; }
  function arr(x) { return Array.isArray(x) ? x : []; }

  /* 来源上标：0 = 本人自述，其余对应 sources[].id */
  function sup(n) {
    if (n === 0) return '<sup class="sp-sup sp-sup-self">[自述]</sup>';
    if (!n && n !== 0) return '';
    var hit = null;
    arr(CUR && CUR.sources).forEach(function (x) { if (x.id === n) hit = x; });
    var title = hit ? hit.title : ('资料来源 ' + n);
    if (hit && hit.url) {
      return '<sup class="sp-sup"><a href="' + esc(hit.url) + '" target="_blank" rel="noopener noreferrer" title="' + esc(title) + '">[' + n + ']</a></sup>';
    }
    return '<sup class="sp-sup" title="' + esc(title) + '">[' + n + ']</sup>';
  }

  function isExpanded(key, def) {
    return Object.prototype.hasOwnProperty.call(foldState, key) ? !!foldState[key] : def;
  }
  function saveFold(key, expanded) {
    foldState[key] = !!expanded;
    try { sessionStorage.setItem(FOLD_KEY, JSON.stringify(foldState)); } catch (e) {}
  }

  /* 统一的板块 + 折叠封装（超过一屏的板块传 folded: true） */
  function fold(title, en, inner, opts) {
    opts = opts || {};
    var key = opts.key || title;
    var expanded = isExpanded(key, !opts.folded);
    return '<section class="sp-sec sp-fold' + (expanded ? '' : ' is-folded') + '"' +
      (opts.id ? ' id="' + esc(opts.id) + '"' : '') +
      ' data-sp-fold="' + esc(key) + '">' +
      '<div class="sp-sec-head"><h2>' + esc(title) + '</h2><span class="sp-sec-en">' + esc(en) + '</span><span class="sp-sec-line"></span></div>' +
      (opts.note ? '<p class="sp-sec-note">' + esc(opts.note) + '</p>' : '') +
      '<div class="sp-fold-clip">' + inner + '</div>' +
      '<button class="sp-fold-more" type="button" data-sp-fold-toggle aria-expanded="' + (expanded ? 'true' : 'false') + '">' +
        (expanded ? '收起板块 ↑' : '展开全部 ↓') + '</button>' +
      '</section>';
  }

  /* ── 头部 ─────────────────────────────────────────────── */
  function head(s) {
    var stamp = s.logo
      ? '<span class="sp-stamp has-logo" aria-hidden="true"><img class="sp-stamp-logo" src="' + esc(s.logo) + '" alt=""></span>'
      : '<span class="sp-stamp" aria-hidden="true">' + esc(s.code || 'SCHOOL') + '</span>';
    var pills = arr(s.pills).map(function (p) {
      return '<span class="sp-pill">' + esc(p) + '</span>';
    }).join('');
    return '<header class="sp-head">' +
      '<div class="sp-head-top">' + stamp +
        '<div class="sp-head-main">' +
          '<span class="sp-kicker">SCHOOL FILE · 学校档案</span>' +
          '<h1 class="sp-title">' + esc(s.name) +
            /* 引导锚点：档案整篇很长，学历核验在页尾容易被漏看；有核验数据才挂入口 */
            (s.verify ? '<a class="sp-jump" href="#sp-verify" title="跳到本页末尾的学历核验板块 · 可申请在线查验">学历核验</a>' : '') +
          '</h1>' +
          (s.currentName ? '<p class="sp-current"><b>现校名</b>' + esc(s.currentName) + '</p>' : '') +
          '<p class="sp-sub">' + esc(s.industry || '') + ' · ' + esc(s.period || '') + ' · ' + esc(s.degree || '') + '</p>' +
          '<p class="sp-oneline">' + esc(s.oneLine || '') + '</p>' +
        '</div>' +
      '</div>' +
      '<div class="sp-pills">' + pills + '</div>' +
    '</header>';
  }

  function kpiBlock(s) {
    var cells = arr(s.kpis).map(function (k) {
      return '<div class="sp-kpi">' +
        '<p class="sp-kpi-label">' + esc(k.label) + '</p>' +
        '<p class="sp-kpi-value">' + esc(k.value) + '</p>' +
        '<p class="sp-kpi-sub">' + esc(k.sub || '') + '</p>' +
      '</div>';
    }).join('');
    return '<div class="sp-sec sp-sec-first"><div class="sp-kpi-grid">' + cells + '</div>' +
      (s.nameNote ? '<p class="sp-callout" style="margin-top:12px">' + esc(s.nameNote) + sup(1) + '</p>' : '') +
      (s.logoNote ? '<p class="sp-note" style="margin-top:8px">' + esc(s.logoNote) + '</p>' : '') +
    '</div>';
  }

  /* ── 1. 学校维度 ──────────────────────────────────────── */
  function schoolIntro(s) {
    var sc = s.school || {};
    var rows = arr(sc.facts).map(function (f) {
      return '<div class="sp-row"><p class="sp-row-label">' + esc(f.label) + '</p>' +
        '<p class="sp-row-text">' + esc(f.text) + sup(f.source) + '</p></div>';
    }).join('');
    var site = sc.website
      ? '<p class="sp-row-text"><a href="' + esc(sc.website.href) + '" target="_blank" rel="noopener noreferrer">' + esc(sc.website.text) + ' ↗</a></p>'
      : '';
    return '<p class="sp-callout">' + esc(sc.intro || '') + sup(1) + '</p>' +
      '<div style="margin-top:12px">' + rows + '</div>' +
      (site ? '<div class="sp-row"><p class="sp-row-label">官网</p>' + site + '</div>' : '') +
      (sc.motto ? '<p class="sp-note" style="margin-top:10px"><strong>校训：</strong>' + esc(sc.motto) + sup(1) + '</p>' : '');
  }

  function historyBlock(s) {
    var sc = s.school || {};
    var hist = arr(sc.history).map(function (h) {
      return '<div class="sp-hist-item">' +
        '<p class="sp-hist-date">' + esc(h.date) + '</p>' +
        '<div><p class="sp-hist-title">' + esc(h.title) + '</p>' +
        '<p class="sp-hist-text">' + esc(h.text) + sup(h.source) + '</p></div>' +
      '</div>';
    }).join('');
    var campuses = arr(sc.campuses).map(function (c) {
      return '<div class="sp-campus">' +
        '<p class="sp-campus-name">' + esc(c.name) + sup(c.source) + '</p>' +
        '<p class="sp-campus-addr">' + esc(c.address) + '</p>' +
        '<p class="sp-campus-note">' + esc(c.note || '') + '</p>' +
      '</div>';
    }).join('');
    var highs = arr(sc.highlights).map(function (h) {
      return '<div class="sp-highlight"><p class="sp-highlight-title">' + esc(h.title) + '</p>' +
        '<p class="sp-highlight-detail">' + esc(h.detail) + sup(h.source) + '</p></div>';
    }).join('');
    return '<div class="sp-hist">' + hist + '</div>' +
      (campuses ? '<h3 style="font-size:14px;font-weight:900;margin:16px 0 2px">两个校区</h3><div class="sp-campus-grid">' + campuses + '</div>' : '') +
      (highs ? '<h3 style="font-size:14px;font-weight:900;margin:18px 0 10px">与专业相关的办学条件</h3>' + highs : '');
  }

  /* ── 2. 在校经历维度 ──────────────────────────────────── */
  function timelineBlock(s) {
    var tl = s.timeline || {};
    var items = arr(tl.items).map(function (t) {
      var tags = arr(t.tags).map(function (g) { return '<span class="sp-tag">' + esc(g) + '</span>'; }).join('');
      return '<div class="sp-tl-item' + (t.kind === 'after' ? ' is-after' : '') + '">' +
        '<span class="sp-tl-no">' + esc(t.no) + '</span><span class="sp-tl-term">' + esc(t.term) + '</span>' +
        '<p class="sp-tl-title">' + esc(t.title) + sup(0) + '</p>' +
        '<p class="sp-tl-text">' + esc(t.text) + '</p>' +
        (tags ? '<div class="sp-tags">' + tags + '</div>' : '') +
      '</div>';
    }).join('');
    return '<div class="sp-timeline">' + items + '</div>';
  }

  /* ── 3. 课程表 ────────────────────────────────────────── */
  function coursesBlock(s) {
    var c = s.courses || {};
    var rows = arr(c.terms).map(function (t) {
      var chips = arr(t.items).map(function (it) {
        return '<span class="sp-chip' + (it.confirmed ? '' : ' is-ref') + '">' + esc(it.name) + '</span>';
      }).join('');
      return '<tr>' +
        '<td><span class="sp-term">' + esc(t.term) + '</span><span class="sp-term-en">' + esc(t.en) + '</span></td>' +
        '<td><span class="sp-focus">' + esc(t.focus) + '</span></td>' +
        '<td><div class="sp-chips">' + chips + '</div></td>' +
        '<td><span class="sp-output">' + esc(t.output) + '</span></td>' +
      '</tr>';
    }).join('');
    return '<div class="sp-table-wrap"><table class="sp-table">' +
      '<thead><tr><th>学年</th><th>阶段重点</th><th>主修课程</th><th>能力产出</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
      '<div class="sp-legend">' +
        '<span><i class="is-solid"></i>简历 / 作品集明确记载</span>' +
        '<span><i class="is-ref"></i>同课程群常见科目（参考）</span>' +
      '</div>';
  }

  /* ── 4. 获奖证书 ──────────────────────────────────────── */
  function awardsBlock(s) {
    return '<div class="sp-award-grid">' + arr(s.awards).map(function (a) {
      return '<div class="sp-award' + (a.muted ? ' is-muted' : '') + '">' +
        '<img class="sp-award-img" src="' + esc(a.img) + '" alt="' + esc(a.alt) + '" loading="lazy" data-sp-zoom>' +
        '<div class="sp-award-body">' +
          '<span class="sp-award-tag">' + esc(a.tag || a.level) + '</span>' +
          '<p class="sp-award-title">' + esc(a.title) + '</p>' +
          '<p class="sp-award-org">' + esc(a.org || '') + (a.year ? ' · ' + esc(a.year) : '') + '</p>' +
          '<p class="sp-award-note">' + esc(a.note || '') + '</p>' +
        '</div></div>';
    }).join('') + '</div>';
  }

  /* ── 5. 相册 ──────────────────────────────────────────── */
  function albumBlock(s) {
    return '<div class="sp-album-grid">' + arr(s.album).map(function (a) {
      /* 相册里也收录了学历二维码，同样加锁，避免从别的板块绕过 */
      var isQr = a.img && String(a.img).indexOf('edu-verify-qr') >= 0;
      var media = isQr
        ? '<div class="sp-album-locked" data-sp-album-qr="1"><span>LOCK</span><small>二维码已加锁 · 请在「学历核验」板块申请查看</small></div>'
        : a.empty
          ? '<div class="sp-album-empty"><span>＋</span>暂无可公开照片</div>'
          : '<img class="sp-album-img" src="' + esc(a.img) + '" alt="' + esc(a.alt) + '" loading="lazy" data-sp-zoom>';
      return '<div class="sp-album-item">' +
        '<span class="sp-album-tag">' + esc(a.tag || '') + '</span>' + media +
        '<span class="sp-album-cap">' + esc(a.caption) + '</span>' +
        '<span class="sp-album-note">' + esc(a.note || '') + '</span>' +
      '</div>';
    }).join('') + '</div>';
  }

  /* ── 6. 从课程到工程（补充维度） ──────────────────────── */
  function growthBlock(s) {
    var g = s.growth || {};
    return arr(g.items).map(function (it) {
      return '<div class="sp-growth-item">' +
        '<span class="sp-growth-course">' + esc(it.course) + '</span>' +
        '<span class="sp-growth-arrow">→</span>' +
        '<span class="sp-growth-now">' + esc(it.now) + '</span>' +
        '<p class="sp-growth-text">' + esc(it.text) + sup(0) + '</p>' +
      '</div>';
    }).join('');
  }

  /* ── 7. 学历核验（默认加锁）──────────────────────────────
     验证码与二维码不进 DOM：只渲染占位预览 + 申请入口。
     申请提交后由本人核实身份再决定是否解锁；静态站点的源码仍含原始
     数据，这层锁是「礼貌门禁」而非密码学保护。 */
  function verifyBlock(s, expiredAt) {
    var v = s.verify || {};
    var note = '为保护隐私，学历在线验证码与二维码已加锁。若因招聘核验、背调等正当用途需要查看，请填写申请；本人核实身份后再解锁。';
    if (expiredAt) note = '上次授权已于 ' + formatExpiry(expiredAt) + ' 到期，请重新申请。' + note;
    return '<div class="sp-verify-lock" data-sp-verify-lock>' +
      '<div class="sp-lock-preview" aria-hidden="true">' +
        '<div class="sp-lock-lines">' +
          '<span class="sp-lock-label">' + esc(v.label || '学历在线验证码') + sup(5) + '</span>' +
          '<span class="sp-lock-code">•••• •••• •••• ••••</span>' +
          '<span class="sp-lock-tip">CODE / QR LOCKED · 已加锁保护</span>' +
        '</div>' +
        '<span class="sp-lock-qr"><i>LOCK</i></span>' +
      '</div>' +
      '<div class="sp-lock-action">' +
        '<p class="sp-lock-note' + (expiredAt ? ' is-expired' : '') + '">' + esc(note) + '</p>' +
        '<button class="sp-apply-btn" type="button" data-sp-verify-apply>申请查看权限 →</button>' +
      '</div>' +
    '</div>';
  }

  /* 审批通过后：把锁占位原址替换为真实验证码 / 二维码。
     这里刻意用 rawEsc 而不是 esc —— esc 会把验证码统一打成圆点。 */
  function unlockedVerifyMarkup(v, unlock) {
    var until = unlock && unlock.expiresAt ? formatExpiry(unlock.expiresAt) : '24 小时后';
    return '<div class="sp-verify-open" data-sp-verify-open>' +
      '<div class="sp-verify-text">' +
        '<p class="sp-verify-label">' + rawEsc(v.label || '学历在线验证码') + sup(5) + '</p>' +
        '<p class="sp-verify-code">' + rawEsc(v.code || '') + '</p>' +
        '<p class="sp-verify-tip">' + rawEsc(v.tip || '') + '</p>' +
        (v.url ? '<p class="sp-verify-tip"><a href="' + rawEsc(v.url) + '" target="_blank" rel="noopener noreferrer">前往学信网查验 ↗</a></p>' : '') +
      '</div>' +
      '<img class="sp-verify-qr" src="' + rawEsc(v.qrImage || '') + '" alt="' + rawEsc(v.qrAlt || '') + '" data-sp-zoom>' +
      '<p class="sp-verify-flag">✓ 已获本人批准查看 · 仅限申请用途 · 有效期至 ' + rawEsc(until) + '</p>' +
    '</div>';
  }

  function revealVerify(unlock) {
    var s = CUR;
    if (!s || !s.verify) return;
    var lock = document.querySelector('[data-sp-verify-lock], [data-sp-verify-open]');
    if (lock) lock.outerHTML = unlockedVerifyMarkup(s.verify, unlock);

    /* 相册里那张二维码占位也一起还原，别让「已解锁」还留个 LOCK */
    var qr = arr(s.album).filter(function (a) {
      return a.img && String(a.img).indexOf('edu-verify-qr') >= 0;
    })[0];
    if (qr) {
      Array.prototype.forEach.call(document.querySelectorAll('[data-sp-album-qr]'), function (el) {
        el.outerHTML = '<img class="sp-album-img" src="' + rawEsc(qr.img) + '" alt="' + rawEsc(qr.alt) +
          '" loading="lazy" data-sp-zoom>';
      });
    }
    /* 「数据说明」板块此前也统一脱敏了，解锁后重绘成原文 */
    var srcBox = document.querySelector('[data-sp-fold="sources"] .sp-fold-clip');
    if (srcBox) srcBox.innerHTML = sourcesBlock(s, true);
  }

  /* 授权过期 / 设备不匹配时回到加锁态，避免出现「已解锁」残留 */
  function relockVerify(expiredAt) {
    var s = CUR;
    if (!s) return;
    var el = document.querySelector('[data-sp-verify-lock], [data-sp-verify-open]');
    if (el) el.outerHTML = verifyBlock(s, expiredAt);

    var qr = arr(s.album).filter(function (a) {
      return a.img && String(a.img).indexOf('edu-verify-qr') >= 0;
    })[0];
    if (qr) {
      Array.prototype.forEach.call(document.querySelectorAll('.sp-album-img'), function (img) {
        var src = img.getAttribute('src') || '';
        if (src === qr.img || src.indexOf('edu-verify-qr') >= 0) {
          img.outerHTML = '<div class="sp-album-locked" data-sp-album-qr="1"><span>LOCK</span>' +
            '<small>二维码已加锁 · 请在「学历核验」板块申请查看</small></div>';
        }
      });
    }
    var srcBox = document.querySelector('[data-sp-fold="sources"] .sp-fold-clip');
    if (srcBox) srcBox.innerHTML = sourcesBlock(s);
  }

  /* ── 8. 数据说明 + 来源 + 页脚 ────────────────────────── */
  function sourcesBlock(s, raw) {
    var e = raw ? rawEsc : esc;
    var dc = s.dataConfidence || {};
    var conf = arr(dc.items).map(function (i) {
      return '<div class="sp-conf-item"><span class="sp-conf-label">' + e(i.label) + '</span>' +
        '<span class="sp-conf-level">' + e(i.level) + '</span>' +
        '<span class="sp-conf-detail">' + e(i.detail) + '</span></div>';
    }).join('');
    var src = arr(s.sources).map(function (x) {
      return '<div class="sp-src-item"><span class="sp-src-no">[' + e(x.id) + ']</span>' +
        '<div class="sp-src-title"><a href="' + e(x.url) + '" target="_blank" rel="noopener noreferrer">' + e(x.title) + ' ↗</a>' +
        '<span class="sp-src-url">' + e(x.url) + '</span></div>' +
        '<p class="sp-src-note">' + e(x.note || '') + '</p></div>';
    }).join('');
    return '<p class="sp-callout">' + e(dc.note || '') + '</p>' +
      (conf ? '<h3 style="font-size:13px;font-weight:900;margin:14px 0 6px">数据置信度</h3>' + conf : '') +
      (src ? '<h3 style="font-size:13px;font-weight:900;margin:16px 0 6px">资料来源</h3>' + src : '');
  }

  function foot() {
    var backR = META.backToResume || 'resume.html';
    var backP = META.backToPortfolio || 'index.html';
    return '<div class="sp-foot">' +
      '<a class="sp-foot-link" href="' + esc(backR) + '">← 返回网页简历</a>' +
      '<a class="sp-foot-link is-alt" href="' + esc(backP) + '">作品集主页 ↗</a>' +
      '<button class="sp-foot-link is-alt" type="button" data-sp-print>打印 / 存为 PDF ⎙</button>' +
    '</div>' +
    '<p class="sp-disclaimer">' + esc(META.disclaimer || '') +
      (META.collectedAt ? ' · 资料整理于 ' + esc(META.collectedAt) : '') + '</p>';
  }

  /* ── 主渲染 ───────────────────────────────────────────── */
  function render(id) {
    var s = school(id);
    if (!s) return '<div class="sp-page-empty">未找到「' + esc(id) + '」的学校档案</div>';
    CUR = s;
    var sc = s.school || {}, tl = s.timeline || {}, cs = s.courses || {}, gr = s.growth || {};
    var html =
      head(s) +
      kpiBlock(s) +
      fold('学校概况', 'SCHOOL', schoolIntro(s), { key: 'intro', folded: true }) +
      fold('名称沿革与关键节点', 'HISTORY', historyBlock(s), { key: 'history' }) +
      fold('在校经历', 'TIMELINE', timelineBlock(s), { key: 'timeline', note: tl.note }) +
      fold('主修课程表', 'COURSE MAP', coursesBlock(s), { key: 'courses', note: cs.note, folded: true }) +
      fold('获奖证书', 'AWARDS', awardsBlock(s), { key: 'awards' }) +
      fold('校园相册', 'ALBUM', albumBlock(s), { key: 'album', folded: true }) +
      fold('从课程到工程', 'GROWTH', growthBlock(s), { key: 'growth', note: gr.note }) +
      fold('学历核验', 'VERIFY', verifyBlock(s), { key: 'verify', id: 'sp-verify' }) +
      fold('数据说明与资料来源', 'SOURCES', sourcesBlock(s), { key: 'sources', folded: true }) +
      foot();
    return html;
  }

  /* ── 交互：折叠 / 相册大图 / 打印（事件委托，重渲染后仍生效） ── */
  function closest(el, sel) {
    while (el && el.nodeType === 1) {
      if (el.matches && el.matches(sel)) return el;
      el = el.parentElement;
    }
    return null;
  }
  function lightbox() {
    var lb = document.getElementById('spLightbox');
    if (lb) return lb;
    lb = document.createElement('div');
    lb.className = 'sp-lightbox';
    lb.id = 'spLightbox';
    lb.setAttribute('role', 'dialog');
    lb.setAttribute('aria-modal', 'true');
    lb.setAttribute('aria-label', '图片放大预览');
    lb.innerHTML = '<button class="sp-lightbox-close" type="button" aria-label="关闭大图">×</button>' +
      '<img id="spLightboxImg" alt="">';
    document.body.appendChild(lb);
    return lb;
  }
  function openZoom(src, alt) {
    var lb = lightbox();
    var img = document.getElementById('spLightboxImg');
    if (img) { img.src = src; img.alt = alt || ''; }
    lb.classList.add('show');
  }
  function closeZoom() {
    var lb = document.getElementById('spLightbox');
    if (!lb) return;
    lb.classList.remove('show');
    var img = document.getElementById('spLightboxImg');
    if (img) img.removeAttribute('src');
  }

  /* ── 学历核验申请弹窗 ──────────────────────────────────── */
  var API_BASES = (function () {
    var host = location.hostname || '';
    /* github.io 是纯静态托管，没有 Functions：直接打 Cloudflare Pages */
    if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/.test(host)) return [''];
    if (/\.github\.io$/i.test(host)) return ['https://shenge-work.pages.dev'];
    return ['', 'https://shenge-work.pages.dev'];
  })();

  /* ── 审批结果轮询：申请成功后本人点邮件链接批准，页面无需刷新即解锁 ── */
  var ACCESS_KEY = 'sp_verify_access';
  var UNLOCK_KEY = 'sp_verify_unlock';
  var ACCESS_TTL_MS = 24 * 3600 * 1000;  // 与服务端一致：批准 24 小时后自动过期
  var POLL_MS = 5000;
  var POLL_MAX = 360;   // 最多等 30 分钟；离开页面再回来会续上
  var pollTimer = null;
  var pollTick = 0;

  function formatExpiry(ts) {
    try {
      return new Date(Number(ts)).toLocaleString('zh-CN', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
      });
    } catch (e) { return ''; }
  }

  function saveAccess(id, base, schoolId) {
    try {
      localStorage.setItem(ACCESS_KEY, JSON.stringify({
        id: id, base: base, schoolId: schoolId, startedAt: Date.now()
      }));
    } catch (e) {}
  }
  function readAccess() {
    try {
      var a = JSON.parse(localStorage.getItem(ACCESS_KEY) || 'null');
      return a && /^[0-9a-f]{32}$/i.test(a.id || '') ? a : null;
    } catch (e) { return null; }
  }
  function clearAccess() {
    try { localStorage.removeItem(ACCESS_KEY); } catch (e) {}
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
  }

  /* 解锁状态落盘：刷新 / 重开页面后仍是解锁态，但仅限同一设备且在 24 小时内 */
  function saveUnlock(id, device, approvedAt, expiresAt, schoolId) {
    try {
      localStorage.setItem(UNLOCK_KEY, JSON.stringify({
        id: id, device: device || '', schoolId: schoolId || '',
        approvedAt: Number(approvedAt) || Date.now(),
        expiresAt: Number(expiresAt) || (Date.now() + ACCESS_TTL_MS)
      }));
    } catch (e) {}
  }
  function clearUnlock() {
    try { localStorage.removeItem(UNLOCK_KEY); } catch (e) {}
  }
  function readUnlock() {
    var u = null;
    try { u = JSON.parse(localStorage.getItem(UNLOCK_KEY) || 'null'); } catch (e) { clearUnlock(); return null; }
    if (!u || !/^[0-9a-f]{32}$/i.test(u.id || '')) { clearUnlock(); return null; }
    var did = deviceId();
    if (did && u.device && u.device !== did) { clearUnlock(); return null; }
    if (!u.expiresAt || Date.now() > Number(u.expiresAt)) { clearUnlock(); return null; }
    return u;
  }

  function setDoneText(msg) {
    var el = document.querySelector('[data-sp-form-done-text]');
    if (el) el.textContent = msg;
    var done = document.querySelector('[data-sp-form-done]');
    if (done) done.hidden = false;
    var form = document.querySelector('[data-sp-access-form]');
    if (form) form.hidden = true;
  }

  function pollOnce(a) {
    if (pollTick++ >= POLL_MAX) {
      clearAccess();
      setDoneText('等待超时（30 分钟）。本人尚未操作，请稍后重新打开本页或再次提交申请。');
      return;
    }
    var url = new URL(a.base + '/api/verify-access?id=' + encodeURIComponent(a.id), location.href).href;
    var did = deviceId();
    var headers = { 'Accept': 'application/json' };
    if (did) headers['X-Device-Id'] = did;
    fetch(url, { method: 'GET', headers: headers, credentials: 'omit', cache: 'no-store' })
      .then(function (r) {
        var ct = r.headers.get('content-type') || '';
        if (ct.indexOf('application/json') < 0) throw new Error('not_json');
        return r.json();
      })
      .then(function (d) {
        if (d && d.error === 'device_mismatch') {
          clearAccess();
          clearUnlock();
          relockVerify();
          setDoneText('该次批准仅对申请时的设备有效。请在当前设备重新提交申请。');
          return;
        }
        if (d && d.ok && d.status === 'approved') {
          saveUnlock(a.id, did, d.approvedAt, d.expiresAt, a.schoolId);
          revealVerify(readUnlock());
          clearAccess();
          setDoneText('本人已批准，学历核验板块已解锁。授权仅限当前设备、24 小时内有效，到期后需重新申请。');
          return;
        }
        if (d && d.ok && d.status === 'expired') {
          clearAccess();
          clearUnlock();
          relockVerify(Date.now() - ACCESS_TTL_MS);
          setDoneText('授权已到期（有效期 24 小时），请重新提交申请。');
          return;
        }
        if (d && d.ok && d.status === 'rejected') {
          clearAccess();
          setDoneText('本人未批准这次申请。如需继续，请补充身份信息后重新提交。');
          return;
        }
        pollTimer = setTimeout(function () { pollOnce(a); }, POLL_MS);
      })
      .catch(function () {
        /* 网络抖动不打断等待；404 多半是 github.io 直连无 Functions，下轮也不换 base，
           因为提交时已经记下了真正可用的 base */
        pollTimer = setTimeout(function () { pollOnce(a); }, POLL_MS);
      });
  }

  function startPolling(id, base, schoolId) {
    saveAccess(id, base, schoolId);
    if (pollTimer) clearTimeout(pollTimer);
    pollTick = 0;
    pollTimer = setTimeout(function () { pollOnce(readAccess() || { id: id, base: base }); }, 1200);
  }
  function resumePolling() {
    var a = readAccess();
    if (!a) return;
    if (Date.now() - (a.startedAt || 0) > POLL_MAX * POLL_MS) { clearAccess(); return; }
    startPolling(a.id, a.base || '', a.schoolId || '');
  }

  /* 页面打开时：先认领仍在有效期内的解锁态，否则续上未完成的等待 */
  function bootAccess() {
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem(UNLOCK_KEY) || 'null'); } catch (e) {}
    var u = readUnlock();
    if (u) { revealVerify(u); return; }
    if (raw && raw.expiresAt && Number(raw.expiresAt) <= Date.now()) relockVerify(raw.expiresAt);
    resumePolling();
  }

  var lastFocused = null;

  /* 与留言墙 / 公司档案共用同一设备 ID，方便本人识别重复申请 */
  function deviceId() {
    try {
      var key = 'wall_device_id';
      var id = localStorage.getItem(key);
      if (!id) {
        id = (window.crypto && typeof window.crypto.randomUUID === 'function')
          ? window.crypto.randomUUID()
          : 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2);
        localStorage.setItem(key, id);
      }
      return /^[A-Za-z0-9_-]{8,64}$/.test(id) ? id : '';
    } catch (e) { return ''; }
  }

  function deviceInfo() {
    try {
      var s = window.screen || {};
      return {
        platform: navigator.platform || '',
        screen: (s.width || '') + 'x' + (s.height || ''),
        colorDepth: String(s.colorDepth || ''),
        language: navigator.language || '',
        timezone: String(Intl.DateTimeFormat().resolvedOptions().timeZone || ''),
        cores: String(navigator.hardwareConcurrency || ''),
        touch: String(('ontouchstart' in window) || navigator.maxTouchPoints > 0),
        dpr: String(window.devicePixelRatio || '')
      };
    } catch (e) { return {}; }
  }

  function accessModal() {
    var el = document.getElementById('spAccessModal');
    if (el) return el;
    el = document.createElement('div');
    el.className = 'sp-modal-mask';
    el.id = 'spAccessModal';
    el.hidden = true;
    el.innerHTML =
      '<div class="sp-modal" role="dialog" aria-modal="true" aria-labelledby="spAccessTitle">' +
        '<button class="sp-modal-close" type="button" data-sp-modal-close aria-label="关闭弹窗">×</button>' +
        '<p class="sp-modal-kicker">VERIFY / ACCESS REQUEST</p>' +
        '<h3 class="sp-modal-title" id="spAccessTitle">申请查看学历核验信息</h3>' +
        '<p class="sp-modal-lead">请说明你的身份与查看用途。信息会连同申请时间、设备与浏览器信息邮件发送给简历本人；本人核实身份后再决定是否解锁。批准后仅对当前设备有效，24 小时后自动过期，到期需重新申请。</p>' +
        '<form class="sp-access-form" data-sp-access-form novalidate>' +
          '<label class="sp-field"><span class="sp-field-label">你的姓名 / 称呼 <em>必填</em></span>' +
            '<input type="text" name="name" maxlength="40" autocomplete="name" placeholder="例如：张三">' +
            '<small>请写真实姓名，本人需要据此核实申请人身份。</small></label>' +
          '<label class="sp-field"><span class="sp-field-label">当前身份 <em>必填</em></span>' +
            '<select name="identity">' +
              '<option value="">请选择…</option>' +
              '<option value="hr">HR / 招聘负责人</option>' +
              '<option value="manager">用人经理 / 业务负责人</option>' +
              '<option value="interviewer">面试官</option>' +
              '<option value="headhunter">猎头 / 招聘顾问</option>' +
              '<option value="partner">合作方 / 客户</option>' +
              '<option value="researcher">研究者 / 学生</option>' +
              '<option value="other">其他身份</option>' +
            '</select></label>' +
          '<label class="sp-field"><span class="sp-field-label">所在公司 / 机构 <em>建议填写</em></span>' +
            '<input type="text" name="org" maxlength="80" placeholder="例如：某某科技 · 招聘部">' +
            '<small>单位信息是核实身份的关键依据，HR / 猎头请务必填写。</small></label>' +
          '<label class="sp-field"><span class="sp-field-label">联系方式（邮箱或电话） <em>建议填写</em></span>' +
            '<input type="text" name="contact" maxlength="120" placeholder="邮箱优先">' +
            '<small>留邮箱时，本人可直接回复这封申请邮件与你确认。</small></label>' +
          '<label class="sp-field"><span class="sp-field-label">查看用途 <em>必填</em></span>' +
            '<select name="purpose">' +
              '<option value="">请选择…</option>' +
              '<option value="recruit">招聘流程评估</option>' +
              '<option value="background">入职背景调查</option>' +
              '<option value="interview">面试 / 技术评估</option>' +
              '<option value="cooperation">商务合作尽职调查</option>' +
              '<option value="research">学术研究 / 资料整理</option>' +
              '<option value="other">其他用途</option>' +
            '</select></label>' +
          '<label class="sp-field"><span class="sp-field-label">查看理由 <em>必填 · 至少 15 字</em></span>' +
            '<textarea name="reason" rows="5" maxlength="600" placeholder="请具体说明为什么要查看学历验证码…"></textarea>' +
            '<small class="sp-field-guide"><b>填写引导：</b>① 你是谁、代表哪家公司；② 为什么必须核验学历；③ 信息只用于什么场景、不会外传。<br>' +
            '<b>示例：</b>我是某某科技 HR BP 张三，正在推进陈培胜后端工程师岗位的录用流程，需要核验学信网学历信息以完成入职背调；该信息仅用于本次招聘评估，不会外传。</small></label>' +
          '<label class="sp-check"><input type="checkbox" name="consent" value="1">' +
            '<span>我确认以上信息真实，且仅用于所填用途，不会转交第三方。</span></label>' +
          '<div class="sp-honeypot" aria-hidden="true"><label>网站地址<input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>' +
          '<p class="sp-form-error" data-sp-form-error hidden></p>' +
          '<button class="sp-submit" type="submit" data-sp-submit>提交申请 →</button>' +
        '</form>' +
        '<div class="sp-form-done" data-sp-form-done hidden>' +
          '<b>申请已提交</b>' +
          '<p data-sp-form-done-text>请留在此页等待：本人核验身份后批准，学历核验板块会自动解锁，无需刷新。授权仅对当前设备有效，24 小时后自动过期。若离开本页，回来后也会继续等待结果。</p>' +
          '<button class="sp-submit is-alt" type="button" data-sp-modal-close>关闭</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(el);
    return el;
  }

  function openAccess() {
    var el = accessModal();
    /* 再次打开时回到空白表单，不残留上次的成功态 / 错误态 */
    var form = el.querySelector('[data-sp-access-form]');
    var done = el.querySelector('[data-sp-form-done]');
    var err = el.querySelector('[data-sp-form-error]');
    var btn = el.querySelector('[data-sp-submit]');
    if (form) { form.hidden = false; form.reset(); }
    if (done) done.hidden = true;
    if (err) err.hidden = true;
    if (btn) { btn.disabled = false; btn.textContent = '提交申请 →'; }
    lastFocused = document.activeElement;
    el.hidden = false;
    document.body.classList.add('sp-modal-open');
    var first = el.querySelector('input[name="name"]');
    if (first) first.focus();
  }

  function closeAccess() {
    var el = document.getElementById('spAccessModal');
    if (!el) return;
    el.hidden = true;
    document.body.classList.remove('sp-modal-open');
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  function submitAccess(form) {
    var errEl = form.querySelector('[data-sp-form-error]');
    var btn = form.querySelector('[data-sp-submit]');
    function fail(msg) {
      if (errEl) { errEl.textContent = msg; errEl.hidden = false; }
      if (btn) { btn.disabled = false; btn.textContent = '提交申请 →'; }
    }
    if (errEl) { errEl.hidden = true; errEl.textContent = ''; }

    var name = String(form.elements.name.value || '').trim();
    var reason = String(form.elements.reason.value || '').trim();
    if (Array.from(name).length < 2) { fail('请填写姓名 / 称呼（至少 2 个字）'); return; }
    if (!form.elements.identity.value) { fail('请选择你的当前身份'); return; }
    if (!form.elements.purpose.value) { fail('请选择查看用途'); return; }
    if (Array.from(reason).length < 15) { fail('查看理由请至少写 15 个字，方便本人核实身份'); return; }
    if (!form.elements.consent.checked) { fail('请先确认信息真实、仅用于所填用途'); return; }

    var payload = {
      name: name,
      identity: form.elements.identity.value,
      org: String(form.elements.org.value || '').trim(),
      contact: String(form.elements.contact.value || '').trim(),
      purpose: form.elements.purpose.value,
      reason: reason,
      consent: true,
      device: deviceInfo(),
      origin: location.href
    };
    if (btn) { btn.disabled = true; btn.textContent = '提交中…'; }

    var headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
    var did = deviceId();
    if (did) headers['X-Device-Id'] = did;

    var activeBase = API_BASES[0];
    function next(i) {
      if (i >= API_BASES.length) { fail('网络异常，申请未提交，请稍后重试'); return; }
      activeBase = API_BASES[i];
      fetch(new URL(activeBase + '/api/verify-access', location.href).href, {
        method: 'POST',
        headers: headers,
        credentials: 'omit',
        body: JSON.stringify(payload)
      }).then(function (r) {
        var ct = r.headers.get('content-type') || '';
        if (ct.indexOf('application/json') < 0) {
          if ((r.status === 404 || r.status >= 500) && i + 1 < API_BASES.length) return next(i + 1);
          throw new Error('not_json');
        }
        return r.json().then(function (d) {
          if (r.ok && d && d.ok) {
            form.hidden = true;
            var done = form.parentNode.querySelector('[data-sp-form-done]');
            if (done) done.hidden = false;
            if (d.requestId) {
              startPolling(d.requestId, activeBase, new URLSearchParams(location.search).get('c') || '');
              setDoneText('申请已提交。请留在此页等待：本人核验身份后批准，学历核验板块会自动解锁，无需刷新。授权仅对当前设备有效，24 小时后自动过期。');
            } else {
              var txt = form.parentNode.querySelector('[data-sp-form-done-text]');
              if (txt) txt.textContent = '申请已提交。当前站点未启用在线审批，本人会通过你留下的联系方式回复。';
            }
            return;
          }
          if (!r.ok && (r.status === 404 || r.status === 502) && i + 1 < API_BASES.length) return next(i + 1);
          fail((d && d.message) || '提交失败，请稍后重试');
        });
      }, function () { next(i + 1); });
    }
    next(0);
  }

  function start() {
    document.addEventListener('click', function (e) {
      var t = e.target;
      var lb = document.getElementById('spLightbox');
      if (lb && lb.classList.contains('show') && (t === lb || closest(t, '.sp-lightbox-close'))) { closeZoom(); return; }

      if (closest(t, '[data-sp-verify-apply]')) { openAccess(); return; }
      var modal = document.getElementById('spAccessModal');
      if (modal && !modal.hidden) {
        if (t === modal || closest(t, '[data-sp-modal-close]')) { closeAccess(); return; }
        /* 弹窗打开时吞掉底层的折叠 / 图片放大点击 */
        if (closest(t, '.sp-modal')) return;
      }

      var btn = closest(t, '[data-sp-fold-toggle]');
      if (btn) {
        var sec = closest(btn, '[data-sp-fold]');
        if (!sec) return;
        var folded = sec.classList.toggle('is-folded');
        btn.setAttribute('aria-expanded', folded ? 'false' : 'true');
        btn.textContent = folded ? '展开全部 ↓' : '收起板块 ↑';
        saveFold(sec.getAttribute('data-sp-fold'), !folded);
        return;
      }
      if (closest(t, '[data-sp-print]')) { window.print(); return; }
      var zi = closest(t, '[data-sp-zoom]');
      if (zi && zi.getAttribute('src')) { openZoom(zi.getAttribute('src'), zi.getAttribute('alt')); return; }
      if (lb && lb.classList.contains('show') && t && t.tagName === 'IMG') { /* 点大图不关 */ }
    }, true);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        var modal = document.getElementById('spAccessModal');
        if (modal && !modal.hidden) { closeAccess(); e.stopPropagation(); return; }
        var lb = document.getElementById('spLightbox');
        if (lb && lb.classList.contains('show')) { closeZoom(); e.stopPropagation(); }
      }
    }, true);
    document.addEventListener('submit', function (e) {
      var form = closest(e.target, '[data-sp-access-form]');
      if (form) { e.preventDefault(); submitAccess(form); }
    }, true);
    /* 页面重新打开时先恢复未过期的解锁态，再续上未完成的等待；延后一拍等 DOM 渲染完 */
    setTimeout(bootAccess, 0);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  window.SchoolProfile = {
    render: render,
    get: school,
    list: function () { return Object.keys(SCHOOLS).map(function (k) { return SCHOOLS[k]; }); },
    meta: function () { return META; }
  };
})();
