/* ════════════════════════════════════════════════════════
   求职作品集 · 数据驱动渲染 + 交互脚本
   数据源：data/site-data.json（唯一编辑源）
   - http(s) 环境读取 JSON 并渲染
   - 读取失败（文件缺失 / file:// 协议限制）→ 明确提示，不做示例数据兜底
    交互：导航 / 滚动进场 / 数字滚动 / 技能条 / 模态框 / Toast /
          风格彩蛋控制台
   ════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ══════════════ 数据层 ══════════════ */

  /* 数据加载：优先用 index.html 头顶预载的同步快照 data/site-data.js（
     一次请求、可被 CDN 与浏览器缓存）；只有快照缺失时才回退请求 JSON。
     两者都拿不到就明确提示，不再回落到任何示例人物数据。 */
  function loadSiteData() {
    if (window.SITE_DATA) return Promise.resolve(window.SITE_DATA);
    return fetch('data/site-data.json?v=' + Date.now(), { cache: 'no-cache' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .catch(function (err) {
        try { console.error('[site-data] 数据加载失败：' + (err && err.message || '未知原因')); } catch (e) {}
        return null;
      });
  }

  /* ══════════════ 渲染层 ══════════════ */

  function $(id) { return document.getElementById(id); }

  /* ── API 线路（问答 / 语音 / 留言墙 / JD 共用）──
     注意：必须放在 IIFE 顶层。initInteractions() 与 initWall() 是同级函数，
     若把它定义在 initInteractions 内部，留言墙初始化时会 ReferenceError，
     进而被启动流程的 catch 误判成「数据未能加载」。
     github.io 是纯静态托管，POST /api/chat 会回 405 HTML（不是 JSON），
     所以一律直接打 Cloudflare Pages 的同名函数；本地预览只打本机。 */
  var API_BASES = (function () {
    var host = location.hostname || '';
    if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/.test(host)) return [''];
    if (/\.github\.io$/i.test(host)) return ['https://shenge-work.pages.dev'];
    return ['', 'https://shenge-work.pages.dev'];
  })();

  /* ── Toast（分享卡、留言墙等场景共用的轻提示） ──
     注意：必须放在 IIFE 顶层。留言墙 initWall() 与 initInteractions() 是同级函数，
     若把 showToast 定义在 initInteractions 内部，留言墙调用时会 ReferenceError。 */
  var toastEl = null;
  var toastTimer = null;
  function showToast(msg, type) {
    if (!toastEl) toastEl = $('toast');
    if (!toastEl) return;
    toastEl.textContent = msg;
    /* ok / err / info 由 CSS 左边框色带区分；旧调用只传 msg 时保持中性 */
    toastEl.className = 'toast show' + (type ? ' ' + type : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2800);
  }
  function esc(s) { /* 文本转义（字段值默认按纯文本；需 HTML 的字段走 innerHTML） */
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* 板块可见性：与 src/lib/section-visibility.ts 等价的内联实现（fork 空数据一律收起）。
     数组非空还不够——空对象数组也算无数据；改动请同步 TS 版与其单测。 */
  function filled(v) { return v != null && String(v).trim().length > 0; }
  function hasRows(list, key) {
    return (Array.isArray(list) ? list : []).some(function (row) {
      return row && typeof row === 'object' && !Array.isArray(row) && filled(row[key]);
    });
  }
  function worksVisible(d) { return hasRows(d && d.works, 'title') || hasRows(d && d.works, 'no'); }
  function contribVisible(c) {
    return !!(c && Number(c.total) > 0 && Array.isArray(c.days) && c.days.length && filled(c.username));
  }
  function peopleListVisible(p) {
    return (Array.isArray(p && p.people) ? p.people : []).some(function (row) {
      return row && typeof row === 'object' && filled(row.name) && filled(row.site);
    });
  }

  function renderSite(d) {
    window.__SITE_DATA__ = d;
    /* ── 全局 meta ── */
    if (d.meta) {
      if (d.meta.pageTitle) document.title = d.meta.pageTitle;
      if (d.meta.description) {
        var md = document.querySelector('meta[name="description"]');
        if (md) md.setAttribute('content', d.meta.description);
      }
      $('brandSub').innerHTML = d.meta.brandSub || '';
      if (d.meta.brandMark) {
        $('brandMark').innerHTML = esc(d.meta.brandMark) + '<span class="brand-dot">.</span>';
        $('footerBrandMark').innerHTML = esc(d.meta.brandMark) + '<span class="brand-dot">.</span>';
      }
      $('statusPill').innerHTML = '<i class="lamp lamp-green"></i>' + esc(d.meta.statusPill || '');
      if (d.meta.footer) {
        $('footerTagline').textContent = d.meta.footer.tagline || '';
        $('footerCopyright').textContent = d.meta.footer.copyright || '';
        $('footerCoord').textContent = d.meta.footer.coord || '';
      }

      /* ── 页脚推荐的人：快照 data/people.js 先渲染，再用云端 /data/people.json 覆盖；
             云端名单为空就整节收起，绝不显示旧快照 ── */
      (function renderPeople() {
        var box = $('footerPeople');
        var grid = $('peopleGrid');
        if (!box || !grid) return;
        function paint(P) {
          var list = ((P && P.people) || []).filter(function (p) {
            return p && typeof p === 'object' && filled(p.name) && filled(p.site);
          });
          if (!list.length || !peopleListVisible(P)) { box.hidden = true; grid.innerHTML = ''; return; }
          var max = (P.meta && P.meta.footerCount) || 4;
          grid.innerHTML = list.slice(0, max).map(function (p, i) {
            var initial = String(p.initial || p.name).slice(0, 1).toUpperCase();
            return '<a class="fp-card" href="' + esc(p.site) + '" target="_blank" rel="noopener noreferrer"' +
              ' aria-label="' + esc(p.name + '：' + (p.reason || '推荐的个人站')) + '">' +
              '<span class="fp-ava fp-c' + (i % 3) + '" aria-hidden="true">' + esc(initial) + '</span>' +
              '<span class="fp-body">' +
                '<span class="fp-name">' + esc(p.name) + '<i class="fp-arrow" aria-hidden="true">↗</i></span>' +
                '<span class="fp-role">' + esc(p.role || '') + '</span>' +
                '<span class="fp-reason" title="' + esc(p.reason || '') + '">' + esc(p.reason || '') + '</span>' +
              '</span></a>';
          }).join('');
          box.hidden = false;
        }
        paint(window.PEOPLE || {});
        fetch('data/people.json?v=' + Date.now(), { cache: 'no-cache', credentials: 'same-origin' })
          .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
          .then(paint)
          .catch(function () { /* 云端拿不到就保留快照结果 */ });
      })();
    }

    /* ── HERO ── */
    var h = d.hero || {};
    document.querySelectorAll('.hero-corner').forEach(function (el) {
      var i = parseInt(el.getAttribute('data-corners'), 10);
      el.textContent = (h.corners && h.corners[i]) || '';
    });
    $('heroTags').innerHTML = (h.tags || []).map(function (t) {
      return '<span class="tag ' + (t.cls || 'tag-orange') + '">' + esc(t.text) + '</span>';
    }).join('');
    var cn = esc(h.nameCn || '');
    $('heroNameCn').innerHTML = cn +
      '<i class="glitch-layer glitch-blue" aria-hidden="true">' + cn + '</i>' +
      '<i class="glitch-layer glitch-orange" aria-hidden="true">' + cn + '</i>';
    $('heroNameEn').textContent = h.nameEn || '';
    $('heroRole').innerHTML = esc(h.role || '') + ' <span class="role-slash">/</span> <span class="role-en">' + esc(h.roleEn || '').replace(/ /g, '&nbsp;') + '</span>';
    $('heroBio').textContent = h.bio || '';
    $('heroCta').innerHTML =
      '<a class="btn btn-solid" href="#projects">' + esc(h.ctaProjects || '作品') + ' <span class="btn-arrow" aria-hidden="true">▶▶</span></a>' +
      '<a class="btn btn-ghost" href="jd.html">' + esc(h.ctaJd || 'JD 匹配') + ' <span class="btn-arrow" aria-hidden="true">▶</span></a>' +
      '<a class="btn btn-ghost" href="' + esc(h.resumeFile || 'resume.html') + '">' + esc(h.ctaResume || '简历') + ' <span class="btn-arrow" aria-hidden="true">▶</span></a>';
    $('heroStatus').textContent = h.statusMeta || '';
    var ic = h.idcard || {};
    $('idcardPhoto').src = ic.photo || '';
    $('idcardPhoto').alt = (h.nameCn || '') + '的个人形象照';
    $('idcardTitle').innerHTML = esc(ic.titleCn || '') + '<br><span>' + esc(ic.titleEn || '').replace(/ /g, '&nbsp;') + '</span>';
    $('idcardNo').textContent = ic.no || '';
    $('idcardStatus').textContent = ic.status || '';
    $('idcardFields').innerHTML = (ic.fields || []).map(function (f) {
      return '<div class="field ' + (f.cls || '') + '"><dt>' + esc(f.dt) + '</dt><dd>' + esc(f.dd) + '</dd></div>';
    }).join('');
    $('idcardFootCode').textContent = ic.footCode || '';

    /* ── MARQUEE（原实现为重复两遍拼接实现无缝循环） ── */
    var mq = esc(d.marquee || '');
    $('marqueeText').innerHTML = mq + mq;

    /* ── 关于我 ── */
    var ab = d.about || {};
    $('aboutPhoto').src = ab.photo || '';
    $('aboutPhoto').alt = ab.photoAlt || '';
    $('aboutPhotoNo').textContent = ab.photoNo || '';
    $('aboutStamp').innerHTML = ab.stamp || '';
    $('aboutLead').innerHTML = ab.lead || '';
    $('aboutParagraphs').innerHTML = (ab.paragraphs || []).map(function (t) {
      return '<p class="reveal">' + t + '</p>'; /* 段落支持 <strong> 等内联标记 */
    }).join('');
    $('aboutStats').innerHTML = (ab.stats || []).map(function (s) {
      return '<li class="reveal"><strong data-count="' + esc(s.count) + '"' +
        (s.suffix ? ' data-suffix="' + esc(s.suffix) + '"' : '') + '>0</strong><span>' + esc(s.label) + '</span></li>';
    }).join('');

    /* ── 求职意向 ── */
    $('objGrid').innerHTML = (d.objective && d.objective.cards || []).map(function (c) {
      return '<div class="obj-card ' + (c.cls || '') + ' reveal">' +
        '<span class="obj-tag">' + esc(c.tag) + '</span>' +
        (c.role ? '<h3 class="obj-role">' + esc(c.role) + '</h3><p class="obj-role-sub">' + esc(c.roleSub || '') + '</p>'
                : '<h3 class="obj-role-sm">' + esc(c.roleSm || '') + '</h3>') +
        '<p class="obj-desc">' + esc(c.desc || '') + '</p></div>';
    }).join('');

    /* ── 教育经历 ──
       profileId 关联 data/school-profiles.json：学校名即学校档案独立页入口，
       与公司档案同款；链接用相对路径，本地预览与线上同域都可达。 */
    var ed = d.education || {}, em = ed.main || {};
    var schoolUrl = em.profileId ? 'school.html?c=' + encodeURIComponent(em.profileId) : '';
    var schoolTitle = '学校档案：学校概况 / 在校经历 / 课程表 / 获奖证书 / 学历验证';
    var schoolName = schoolUrl
      ? '<a class="edu-school-link" href="' + schoolUrl + '" title="' + schoolTitle + '">' + esc(em.school) + '<span class="edu-school-go">↗</span></a>'
      : esc(em.school);
    var schoolGo = schoolUrl
      ? '<a class="edu-file-link" href="' + schoolUrl + '" title="' + schoolTitle + '">查看学校档案 · 课程表 / 在校经历 / 获奖证书 ↗</a>'
      : '';
    var eduMain =
      '<div class="edu-card reveal">' +
        '<div class="edu-card-head"><span class="edu-years">' + esc(em.time) + '</span>' +
        '<span class="tag ' + (em.tagCls || 'tag-orange') + '">' + esc(em.tag) + '</span></div>' +
        '<div class="edu-brand">' + (em.logo ? '<img class="edu-logo" src="' + esc(em.logo) + '" alt="' + esc(em.school) + ' 校徽" loading="lazy" decoding="async">' : '') +
        '<div class="edu-brand-txt"><h3 class="edu-school">' + schoolName + '</h3>' + schoolGo + '</div></div>' +
        '<p class="edu-major">' + esc(em.major) + ' <span class="edu-en">' + esc(em.majorEn) + '</span></p>' +
        '<div class="edu-stats">' + (em.stats || []).map(function (s) {
          return '<div class="edu-stat ' + (s.cls || '') + '"><strong>' + esc(s.num) + '<span>' + esc(s.unit) + '</span></strong><em>' + esc(s.label) + '</em></div>';
        }).join('') + '</div>' +
        (em.notes || []).map(function (n, i) {
          return '<p class="edu-note' + (i > 0 ? ' edu-note-extra' : '') + '">' + esc(n) + '</p>';
        }).join('') +
      '</div>';
    var eduSides = '<div class="edu-side">' + (ed.sides || []).map(function (s) {
      return '<div class="edu-side-card reveal"><span class="side-no">' + esc(s.no) + '</span><h4>' + esc(s.title) + '</h4><p>' + esc(s.text) + '</p></div>';
    }).join('') + '</div>';
    $('eduGrid').innerHTML = eduMain + eduSides;

    /* ── 工作经历 ──
       profileId 关联 data/company-profiles.json：徽章与速览行由
       js/company-profile.js 读取快照填充并接管点击（抽屉）。 */
    $('expList').innerHTML = (d.experience || []).map(function (x) {
      /* 公司名即档案入口：href 用线上深链，屏幕点击由 company-profile.js 拦截开抽屉；
         整卡同时挂 data-cp——公司名点击区域太小，扩大到整张经历卡（键盘用户仍用公司名链接 / 徽章） */
      var cardAttr = x.profileId
        ? ' data-cp="' + esc(x.profileId) + '" title="点击查看公司档案"'
        : '';
      var name = esc(x.company);
      /* 业务标签（companyNote）与网页简历 resume.experience 同源，主页 / 简历两边口径统一 */
      var roleText = (x.companyNote ? esc(x.companyNote) + ' · ' : '') + esc(x.role);
      var quick = '';
      if (x.profileId) {
        name = '<a class="cp-name-link" data-cp="' + esc(x.profileId) +
          '" href="https://chenpeisheng.cn/company.html?c=' + esc(x.profileId) +
          '" title="公司档案：背景 / 业务 / 融资 / 前景">' + name + '</a>';
        quick = '<p class="cp-quick" data-cp-quick="' + esc(x.profileId) + '" hidden></p>';
      }
      return '<article class="exp-card reveal"' + cardAttr + '>' +
        /* 左上角方块：由 company-profile.js 用公司 logo 填充（点击开档案抽屉） */
        (x.profileId
          ? '<span class="exp-badge" data-cp="' + esc(x.profileId) +
            '" role="button" tabindex="0" aria-label="查看公司档案"></span>'
          : '') +
        '<div class="exp-head"><div><h3 class="exp-company">' + name + '</h3>' +
        quick +
        '<p class="exp-role">' + roleText + '</p></div><span class="exp-time">' + esc(x.time) + '</span></div>' +
        '<ul class="exp-points">' + (x.points || []).map(function (p) {
          return '<li>' + p + '</li>'; /* 要点支持 <strong> 内联标记 */
        }).join('') + '</ul>' +
        '<div class="exp-tags">' + (x.tags || []).map(function (t) {
          return '<span class="tag ' + (t.cls || '') + '">' + esc(t.text) + '</span>';
        }).join('') + '</div></article>';
    }).join('');

    /* ── 项目作品 ── */
    window.__PROJECTS__ = d.projects || [];
    $('projGrid').innerHTML = window.__PROJECTS__.map(function (p, i) {
      return '<article class="proj-card reveal" data-proj="' + i + '" tabindex="0" role="button" aria-label="查看项目 ' + esc(p.title) + ' 的详情">' +
        '<div class="proj-media"><img src="' + esc(p.img) + '" alt="' + esc(p.imgAlt) + '" width="640" height="360" loading="lazy" decoding="async">' +
        '<span class="proj-no" aria-hidden="true">' + esc(p.no) + '</span>' +
        '<span class="proj-hover-ui" aria-hidden="true"><span class="proj-hover-btn">查看详情 <i>▶</i></span></span></div>' +
        '<div class="proj-body"><div class="proj-meta">' +
        '<span class="proj-co"' + (p.company ? '' : ' hidden') + '>' + esc(p.company || '') + '</span>' +
        (p.url
          ? '<a class="proj-link" href="' + esc(p.url) + '" target="_blank" rel="noopener noreferrer" aria-label="打开 ' + esc(p.title) + ' 线上产品">线上产品 ↗</a>'
          : (p.note ? '<span class="proj-note">' + esc(p.note) + '</span>' : '')) +
        '<span class="tag ' + (p.badgeCls || 'tag-orange') + '">' + esc(p.badge) + '</span>' +
        '<span class="proj-year">' + esc(p.year) + '</span></div>' +
        '<h3 class="proj-title">' + esc(p.title) + ' <span class="proj-title-en">' + esc(p.titleEn) + '</span></h3>' +
        '<p class="proj-desc">' + esc(p.desc) + '</p>' +
        '<div class="proj-stack">' + (p.stackTags || []).map(function (s) { return '<span>' + esc(s) + '</span>'; }).join('') + '</div></div></article>';
    }).join('');

    /* ── 个人作品（水平无缝自动滚动）── */
    var _worksCards = (d.works || []).map(function (w) {
      var up = w.status === 'upcoming';
      /* 有 detailId 的作品有独立案例页（work/<id>.html），入口放在链接区第一位 */
      var _caseLink = w.detailId
        ? '<a class="work-link work-case" href="work/' + esc(w.detailId) + '.html" target="_blank" rel="noopener noreferrer" aria-label="查看 ' + esc(w.title) + ' 的项目案例">查看案例 →</a>'
        : '';
      return '<article class="work-card' + (up ? ' work-upcoming' : '') + '">' +
        (up ? '<span class="work-badge">预告 · 规划中</span>' : '') +
        '<div class="work-head"><span class="work-no" aria-hidden="true">' + esc(w.no) + '</span>' +
        '<h3 class="work-title">' + esc(w.title) + '<span class="work-title-en">' + esc(w.titleEn) + '</span></h3></div>' +
        '<p class="work-desc">' + esc(w.desc) + '</p>' +
        '<div class="work-tech">' + (w.tech || []).map(function (t) {
          return '<span>' + esc(t) + '</span>';
        }).join('') + '</div>' +
        '<div class="work-links">' + _caseLink +
        (up
          ? '<span class="work-soon">规划中 · 敬请期待</span>'
          : ((w.github || w.live)
            ? (w.github ? '<a class="work-link work-gh" href="' + esc(w.github) + '" target="_blank" rel="noopener noreferrer" aria-label="查看 ' + esc(w.title) + ' 的 GitHub 源码">GitHub 源码 ↗</a>' : '') +
              (w.live ? '<a class="work-link" href="' + esc(w.live) + '" target="_blank" rel="noopener noreferrer" aria-label="在线访问 ' + esc(w.title) + '">在线访问 ↗</a>' : '')
            : '<span class="work-soon">内部项目 · 未公开源码</span>')) +
        '</div></article>';
    }).join('');
    /* 无缝滚动：卡片组重复两遍，track 平移 -50% 形成无限循环 */
    var _worksSet = '<div class="works-set">' + _worksCards + '</div>';
    var _wGrid = $('worksGrid');
    _wGrid.innerHTML = _worksSet + '<div class="works-set" aria-hidden="true">' + _worksCards + '</div>';
    /* 布局计算由 layoutWorks() 在板块可见性判定后执行：
       hidden 板块宽度为 0，过早计算会得到 0s / 0px。 */

    /* ── 专业技能 ── */
    var sk = d.skills || {};
    if (sk.rows && sk.rows.length) {
      $('skillBars').innerHTML = '<div class="cap-list">' + sk.rows.map(function (r) {
        return '<div class="cap" data-domain="' + esc(r.domain || 'mix') + '">' +
            '<div class="cap-left">' +
              '<div class="cap-head">' +
                '<span class="cap-dot" aria-hidden="true"></span>' +
                '<h3 class="cap-name">' + esc(r.name) + '</h3>' +
                (r.ref ? (r.refUrl
                  ? '<a class="tag cap-ref" href="' + esc(r.refUrl) + '" target="_blank" rel="noopener noreferrer">' + esc(r.ref) + ' ↗</a>'
                  : '<span class="tag cap-ref">' + esc(r.ref) + '</span>') : '') +
              '</div>' +
              '<span class="cap-stack">' + esc(r.stack || '') + '</span>' +
            '</div>' +
            '<div class="cap-right">' +
              '<p class="cap-proof">' + esc(r.proof || '') + '</p>' +
            '</div>' +
          '</div>';
      }).join('') + '</div>';
    } else {
      $('skillBars').innerHTML = (sk.bars || []).map(function (b) {
        return '<div class="skill"><div class="skill-head"><span>' + esc(b.label) + '</span><b>' + esc(b.pct) + '</b></div>' +
          '<div class="skill-bar"><i data-w="' + esc(b.pct) + '"></i></div></div>';
      }).join('');
    }
    $('toolboxTitle').textContent = sk.toolboxTitle || '工具箱 TOOLBOX';
    if (sk.toolboxGroups && sk.toolboxGroups.length) {
      $('toolboxTags').innerHTML = sk.toolboxGroups.map(function (g) {
        return '<div class="cloud-group">' +
            '<div class="cloud-group-head">' + esc(g.label) + '</div>' +
            '<div class="cloud-tags">' + (g.tags || []).map(function (t) {
              return '<span class="tag tag-lg ' + (t.cls || '') + '">' + esc(t.text) + '</span>';
            }).join('') + '</div>' +
          '</div>';
      }).join('');
    } else {
      $('toolboxTags').innerHTML = (sk.toolbox || []).map(function (t) {
        return '<span class="tag tag-lg ' + (t.cls || '') + '">' + esc(t.text) + '</span>';
      }).join('');
    }
    $('skillsNote').textContent = sk.note || '';

    /* ── 获奖证书 ── */
    var aw = d.awards || {};
    $('certGrid').innerHTML = (aw.certs || []).map(function (c, i) {
      return '<figure class="cert-card reveal">' +
        '<div class="cert-media"><img src="' + esc(c.img) + '" alt="' + esc(c.alt) + '" width="620" height="446" loading="lazy" decoding="async">' +
        '<span class="cert-stamp ' + (c.stampCls || '') + '" aria-hidden="true">' + esc(c.stamp || 'CERT-0' + (i + 1)) + '</span></div>' +
        '<figcaption><strong>' + esc(c.title) + '</strong><span>' + esc(c.sub) + '</span></figcaption></figure>';
    }).join('');
    $('awardList').innerHTML = (aw.list || []).map(function (a) {
      return '<li class="reveal"><span class="award-year">' + esc(a.year) + '</span>' +
        '<span class="award-name">' + esc(a.name) + '<span>' + esc(a.sub) + '</span></span></li>';
    }).join('');

    /* ── 联系方式 ── */
    var ct = d.contact || {};
    $('contactBig').innerHTML = ct.big || '';
    $('contactGrid').innerHTML = (ct.cards || []).map(function (c) {
      var inner = '<span class="contact-label">' + esc(c.label) + '</span>' +
        '<span class="contact-value">' + esc(c.value) + '</span>' +
        (c.mini ? '<span class="contact-mini">' + esc(c.mini) + '</span>' : '') +
        (c.plain ? '' : '<span class="pixel-arrow contact-arrow" aria-hidden="true">▶</span>');
      var wide = c.span ? ' contact-card-wide' : '';
      return c.plain || !c.href
        ? '<div class="contact-card contact-card-plain' + wide + ' reveal">' + inner + '</div>'
        : '<a class="contact-card' + wide + ' reveal" href="' + esc(c.href) + '"' +
          (/^https?:/.test(c.href) ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' + inner + '</a>';
    }).join('');
    var cta = ct.cta || {};
    $('resumeCta').innerHTML =
      '<div class="resume-cta-text"><strong>' + esc(cta.title) + '</strong><p>' + esc(cta.desc) + '</p></div>' +
      '<a class="btn btn-solid btn-lg" href="' + esc(cta.resumeFile || 'resume.html') + '">' + esc(cta.btnDownload) + ' <span class="btn-arrow" aria-hidden="true">▶</span></a>' +
      '<a class="btn btn-ghost btn-lg" href="' + esc(cta.resumeFile || 'resume.html') + '" target="_blank">' + esc(cta.btnPreview) + '</a>';

    /* ── 留言墙（文案；列表与提交见交互层第 12 节） ── */
    var wl = d.wall || {};
    if ($('wallLead')) $('wallLead').innerHTML = wl.lead || '';
    /* 留言墙文案整包交给交互层；empty/closed 两个别名兼容旧版读取 */
    window.__WALL_TEXT = Object.assign({ empty: wl.emptyText || '', closed: wl.closedText || '' }, wl);
  }

  /* ══════════════ GitHub 贡献蛇图 ══════════════
     一张图同时具备：Platane/snk 生成的 53×7 贡献网格（格子按贡献着色 +
     蛇身游走动画），月份/星期坐标轴由 scripts/inject_svg_axes.py 直接注入
     SVG，共享同一 viewBox 坐标系，缩放时永远对齐。
     统计行另取 data/contributions.json（Actions 每日用 GraphQL 拉取，前端
     不碰 token）；拿不到就只隐藏统计，不影响图。 */
  function renderGhSkeleton(box, username) {
    /* fork 场景没有本人 GitHub 账号时绝不展示——不回退到原作者地址 */
    var user = String(username || '').trim();
    if (!user) { box.hidden = true; box.innerHTML = ''; return; }
    box.innerHTML =
      '<div class="gh-head">' +
        '<span class="gh-label">GITHUB ACTIVITY · 近一年提交</span>' +
        '<a class="gh-link" href="https://github.com/' + esc(user) + '"' +
        ' target="_blank" rel="noopener noreferrer">github.com/' + esc(user) + ' ↗</a>' +
      '</div>' +
      '<div class="gh-stats" hidden></div>' +
      '<div class="gh-snake">' +
        '<img class="gh-snake-light" src="data/snake.svg?v=20261125"' +
        ' alt="GitHub 贡献热力网格与贪吃蛇动效（含月份星期坐标）" loading="lazy" decoding="async">' +
        '<img class="gh-snake-dark" src="data/snake-dark.svg?v=20261125"' +
        ' alt="GitHub 贡献热力网格与贪吃蛇动效（深色）" loading="lazy" decoding="async">' +
      '</div>';
    box.hidden = false;

    /* 明/暗两张都未就绪（404）时整块隐藏，避免空卡片 */
    var imgs = box.querySelectorAll('.gh-snake img');
    var failed = 0;
    Array.prototype.forEach.call(imgs, function (img) {
      img.addEventListener('error', function () {
        failed++;
        if (failed >= imgs.length) box.hidden = true;
      });
    });
  }

  /* 统计行：仅 JSON 成功时填充 */
  function renderGhStats(box, data) {
    var range = data.range || {};
    var stats = box.querySelector('.gh-stats');
    if (!stats) return;
    stats.innerHTML =
      '<span><strong>' + (data.total || 0) + '</strong> 次贡献</span>' +
      '<span>当前连续 <strong>' + (data.currentStreak || 0) + '</strong> 天</span>' +
      '<span>最长连续 <strong>' + (data.longestStreak || 0) + '</strong> 天</span>' +
      (range.from && range.to ? '<span class="gh-range">' + esc(range.from) + ' — ' + esc(range.to) + '</span>' : '');
    stats.hidden = false;
  }

  function initContributions() {
    var box = $('ghActivity');
    if (!box) return;
    /* 云端数据优先：data/contributions.json 才是真相源；total=0 或无数据时整块隐藏，
       不展示别人的蛇图 / 旧快照。 */
    fetch('data/contributions.json?v=' + Date.now(), { cache: 'no-cache', credentials: 'same-origin' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        /* 无提交 / 无日期 / 无 GitHub 账号 → 整块不展示（含地址），不摆空架子 */
        if (!contribVisible(data)) { box.hidden = true; box.innerHTML = ''; return; }
        renderGhSkeleton(box, data.username);
        renderGhStats(box, data);
      })
      .catch(function () {
        box.hidden = true; box.innerHTML = '';
      });
  }

  /* ══════════════ 板块可见性 & 索引自适应 ══════════════
     数据为空就不摆空架子：整节隐藏、导航同步收起，剩下板块的
     SEC.xx 与导航编号按 DOM 顺序重排，避免出现 SEC.01/03/05 的断档。 */
  function syncSectionLayout(d) {
    /* 数据与 src/lib/section-visibility.ts 的 sectionRules 同口径：空对象数组也收起 */
    var RULES = {
      about: true,
      experience: hasRows(d.experience, 'company') || hasRows(d.experience, 'role'),
      projects: hasRows(d.projects, 'title') || hasRows(d.projects, 'no'),
      works: worksVisible(d),
      skills: hasRows(d.skills && d.skills.rows, 'name') || hasRows(d.skills && d.skills.bars, 'label'),
      education: !!(d.education && d.education.main && filled(d.education.main.school)),
      awards: hasRows(d.awards && d.awards.certs, 'title') || hasRows(d.awards && d.awards.list, 'name'),
      objective: hasRows(d.objective && d.objective.cards, 'role') ||
        hasRows(d.objective && d.objective.cards, 'roleSm') || hasRows(d.objective && d.objective.cards, 'desc'),
      contact: hasRows(d.contact && d.contact.cards, 'value'),
      wall: true,
    };
    var navLinks = Array.prototype.slice.call(document.querySelectorAll('#nav a[data-sec]'));
    var sections = Array.prototype.slice.call(document.querySelectorAll('section[id]'));
    sections.forEach(function (sec) {
      var rule = RULES[sec.id];
      if (rule === false) sec.hidden = true;
      else if (rule === true) sec.hidden = false;
    });
    navLinks.forEach(function (a) {
      var rule = RULES[a.getAttribute('data-sec')];
      if (rule === false) a.hidden = true;
      else a.hidden = false;
    });
    /* 重排导航编号 + SEC 编号（只算真正可见、且有对应导航项的板块）。
       hero / footerPeople 这类非导航板块不参与计数，否则序号从 02 起跳。 */
    var seq = 0;
    var visibleSecs = sections.filter(function (s) {
      return !s.hidden && navLinks.some(function (a) { return a.getAttribute('data-sec') === s.id; });
    });
    visibleSecs.forEach(function (sec) {
      seq++;
      var no = (seq < 10 ? '0' : '') + seq;
      var label = sec.querySelector('.section-no');
      if (label) label.textContent = 'SEC.' + no;
      var link = navLinks.filter(function (a) { return a.getAttribute('data-sec') === sec.id; })[0];
      if (link) {
        var navNo = link.querySelector('.nav-no');
        if (navNo) navNo.textContent = no;
      }
    });
  }

  /* 个人作品滚动布局：板块可见后量宽度，避免 hidden 时算成 0 */
  function layoutWorks() {
    var grid = $('worksGrid');
    var sec = document.getElementById('works');
    if (!grid || !sec || sec.hidden) return;
    var set = grid.firstElementChild;
    /* 恒定速度：滚动时长 = 单组宽度 / 速度(px/s)，随内容多少自适应 */
    if (set) {
      grid.style.setProperty('--scroll-duration', (set.getBoundingClientRect().width / 110).toFixed(2) + 's');
    }
    /* 卡片对齐内容安全区：偏移 = 板块左缘到窗口 + 板块左内边距（随宽度自适应） */
    var pad = sec.getBoundingClientRect().left + parseFloat(getComputedStyle(sec).paddingLeft);
    grid.style.setProperty('--ws-pad', Math.max(0, Math.round(pad)) + 'px');
  }

  /* ══════════════ 交互层（渲染完成后初始化） ══════════════ */

  function initInteractions() {
    /* ── 1. 移动端菜单 ── */
    var menuBtn = $('menuBtn');
    var nav = $('nav');
    function closeMenu() {
      nav.classList.remove('open');
      menuBtn.classList.remove('open');
      menuBtn.setAttribute('aria-expanded', 'false');
    }
    menuBtn.addEventListener('click', function () {
      var isOpen = nav.classList.toggle('open');
      menuBtn.classList.toggle('open', isOpen);
      menuBtn.setAttribute('aria-expanded', String(isOpen));
    });
    nav.addEventListener('click', function (e) { if (e.target.closest('a')) closeMenu(); });
    window.addEventListener('resize', function () { if (window.innerWidth > 1280) closeMenu(); });

    /* ── 2. 导航当前区高亮 ── */
    var sections = ['about', 'experience', 'projects', 'works', 'skills', 'education', 'awards', 'objective', 'contact', 'wall']
      .map(function (id) { return document.getElementById(id); })
      .filter(Boolean);
    var navLinks = Array.prototype.slice.call(nav.querySelectorAll('a[data-sec]'));
    function highlightNav() {
      var pos = window.scrollY + window.innerHeight * 0.32;
      var currentId = '';
      sections.forEach(function (sec) { if (sec.offsetTop <= pos) currentId = sec.id; });
      navLinks.forEach(function (link) { link.classList.toggle('active', link.dataset.sec === currentId); });
    }
    window.addEventListener('scroll', highlightNav, { passive: true });
    highlightNav();

    /* ── 3. 滚动进场动画 ── */
    var revealEls = document.querySelectorAll('.reveal');
    if ('IntersectionObserver' in window) {
      var revealObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('in');
            revealObserver.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
      revealEls.forEach(function (el) { revealObserver.observe(el); });
    } else {
      revealEls.forEach(function (el) { el.classList.add('in'); });
    }

    /* ── 4. 数字滚动动画 ── */
    function animateCount(el) {
      var target = parseInt(el.dataset.count, 10) || 0;
      var suffix = el.dataset.suffix || '';
      var duration = 1100;
      var start = null;
      function tick(ts) {
        if (!start) start = ts;
        var p = Math.min((ts - start) / duration, 1);
        var eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(target * eased) + (p === 1 ? suffix : '');
        if (p < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }
    var countEls = document.querySelectorAll('[data-count]');
    if ('IntersectionObserver' in window) {
      var countObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            animateCount(entry.target);
            countObserver.unobserve(entry.target);
          }
        });
      }, { threshold: 0.6 });
      countEls.forEach(function (el) { countObserver.observe(el); });
    } else {
      countEls.forEach(function (el) { el.textContent = el.dataset.count + (el.dataset.suffix || ''); });
    }

    /* ── 5. 技能条填充 ── */
    var skillBars = document.querySelectorAll('.skill-bar i');
    if ('IntersectionObserver' in window) {
      var barObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            var bar = entry.target;
            setTimeout(function () { bar.style.width = 'calc(' + bar.dataset.w + '% - 6px)'; }, 120);
            barObserver.unobserve(bar);
          }
        });
      }, { threshold: 0.4 });
      skillBars.forEach(function (bar) { barObserver.observe(bar); });
    } else {
      skillBars.forEach(function (bar) { bar.style.width = 'calc(' + bar.dataset.w + '% - 6px)'; });
    }

    /* ── 6. 项目详情模态框 ── */
    var PROJECTS = window.__PROJECTS__ || [];
    var modal = $('projModal');
    var modalImg = $('modalImg');
    var modalVideo = $('modalVideo');
    var videoPlay = $('videoPlay');
    var videoDur = $('videoDur');
    var modalNo = $('modalNo');
    var modalBadge = $('modalBadge');
    var modalYear = $('modalYear');
    var modalTitle = $('modalTitle');
    var modalDesc = $('modalDesc');
    var modalPoints = $('modalPoints');
    var modalStack = $('modalStack');
    var modalStats = $('modalStats');
    var modalLink = $('modalLink');
    var modalNote = $('modalNote');
    var lastFocused = null;

    /* 实战演示视频：暂停并复位（移除 src + load() 中止缓冲，回到插画封面态） */
    function resetVideo() {
      if (modalVideo) {
        try { modalVideo.pause(); } catch (err) {}
        modalVideo.removeAttribute('src');
        try { modalVideo.load(); } catch (err) {}
        modalVideo.hidden = true;
      }
      modalImg.hidden = false;
      if (videoPlay) videoPlay.hidden = true;
    }

    function openModal(index) {
      var p = PROJECTS[index];
      if (!p) return;
      resetVideo();
      modalImg.src = p.img;
      modalImg.alt = p.modalTitle + ' 项目封面';
      modalNo.textContent = p.no;
      modalBadge.textContent = p.badge;
      modalYear.textContent = p.yearDetail || p.year;
      modalTitle.textContent = p.modalTitle || p.title;
      modalDesc.textContent = p.modalDesc || p.desc;
      modalPoints.innerHTML = (p.points || []).map(function (t) { return '<li>' + t + '</li>'; }).join('');
      modalStack.textContent = p.stack;
      if (modalLink) {
        if (p.url) {
          modalLink.href = p.url;
          modalLink.hidden = false;
          modalLink.setAttribute('aria-label', '打开 ' + (p.modalTitle || p.title) + ' 线上产品');
        } else {
          modalLink.hidden = true;
          modalLink.removeAttribute('href');
        }
      }
      if (modalNote) {
        modalNote.textContent = p.url ? '' : (p.note || '');
        modalNote.hidden = !(modalNote.textContent);
      }
      modalStats.innerHTML = (p.stats || []).map(function (st) {
        return '<div><strong>' + esc(st.v) + '</strong><span>' + esc(st.s) + '</span></div>';
      }).join('');
      /* 实战演示视频：有 video 字段才启用（插画封面 + 播放按钮，preload=none 不点击零流量） */
      if (p.video && p.video.src && modalVideo && videoPlay) {
        modalVideo.src = p.video.src;
        modalVideo.poster = p.video.poster || p.img;
        modalVideo.setAttribute('aria-label', (p.modalTitle || p.title) + ' 实战演示视频');
        videoPlay.setAttribute('aria-label', '播放' + (p.modalTitle || p.title) + '实战演示视频');
        videoDur.textContent = p.video.duration ? '· ' + p.video.duration : '';
        videoPlay.hidden = false;
      }
      lastFocused = document.activeElement;
      modal.hidden = false;
      document.body.style.overflow = 'hidden';
      document.querySelector('.modal-close').focus();
    }
    function closeModal() {
      resetVideo();
      modal.hidden = true;
      document.body.style.overflow = '';
      if (lastFocused) lastFocused.focus();
    }
    if (videoPlay) {
      videoPlay.addEventListener('click', function () {
        if (!modalVideo || !modalVideo.getAttribute('src')) return;
        modalImg.hidden = true;
        videoPlay.hidden = true;
        modalVideo.hidden = false;
        var pr = modalVideo.play();
        if (pr && pr.catch) pr.catch(function () { /* 自动播放被拦截时控件已可见，可手动点播放 */ });
      });
    }
    document.querySelectorAll('.proj-card').forEach(function (card) {
      card.addEventListener('click', function (e) {
        if (e.target.closest && e.target.closest('a')) return; /* 卡片内的外链自行跳转 */
        openModal(parseInt(card.dataset.proj, 10));
      });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openModal(parseInt(card.dataset.proj, 10));
        }
      });
    });
    modal.addEventListener('click', function (e) {
      if (e.target.hasAttribute('data-close') || e.target.closest('[data-close]')) closeModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !modal.hidden) closeModal();
    });

    /* ── 7. Toast：已提升到 IIFE 顶层（见 showToast），此处不再重复定义 ── */

    /* ── 9. 风格控制台（私人彩蛋：三连击页脚「FILE END — EOF」唤出） ── */
    var NAMES = { archive: 'ARCHIVE', blueprint: 'BLUEPRINT', newsprint: 'NEWSPRINT', noir: 'NOIR' };
    var THEME_ORDER = ['archive', 'blueprint', 'newsprint', 'noir'];
    var THEME_STORE = { mode: 'portfolio_theme_mode', manual: 'portfolio_theme_manual' };

    function storeSet(key, val) {
      try { localStorage.setItem(key, val); } catch (e) {}
    }

    var ctl = document.createElement('div');
    ctl.className = 'theme-ctl';
    ctl.innerHTML =
      '<button class="theme-ctl-btn" id="themeNextBtn" title="切换到下一套风格（手动选择后锁定）">▸ STYLE · <b id="themeNowName"></b></button>' +
      '<button class="theme-ctl-btn" id="themeResetBtn" title="清除手动锁定，恢复默认橙色档案纸主题">↺ RESET · ARCHIVE</button>';
    document.body.appendChild(ctl);

    var themeNowName = $('themeNowName');

    function applyTheme(t) {
      document.documentElement.setAttribute('data-theme', t);
      themeNowName.textContent = NAMES[t] || t.toUpperCase();
    }

    var eggTimer = null, eggHits = 0, hideTimer = null;
    var eofEgg = $('eofEgg');
    if (eofEgg) {
      eofEgg.style.cursor = 'default';
      eofEgg.addEventListener('click', function () {
        eggHits++;
        if (eggHits === 1) {
          eggTimer = setTimeout(function () { eggHits = 0; }, 2000);
        }
        if (eggHits >= 3) {
          eggHits = 0;
          clearTimeout(eggTimer);
          ctl.classList.toggle('show');
          if (ctl.classList.contains('show')) {
            applyTheme(document.documentElement.getAttribute('data-theme'));
            scheduleHide();
          }
        }
      });
    }
    function scheduleHide() {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(function () { ctl.classList.remove('show'); }, 10000);
    }
    ctl.addEventListener('mouseenter', function () { clearTimeout(hideTimer); });
    ctl.addEventListener('mouseleave', function () { if (ctl.classList.contains('show')) scheduleHide(); });
    ctl.addEventListener('click', function () { if (ctl.classList.contains('show')) scheduleHide(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { clearTimeout(hideTimer); ctl.classList.remove('show'); }
    });

    $('themeNextBtn').addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme');
      var next = THEME_ORDER[(THEME_ORDER.indexOf(cur) + 1) % THEME_ORDER.length];
      applyTheme(next);
      storeSet(THEME_STORE.mode, 'manual');
      storeSet(THEME_STORE.manual, next);
      try { history.replaceState(null, '', location.pathname); } catch (e) {}
    });

    /* 每日自动轮换已暂停：这个按钮只清掉手动锁定、回到默认橙色 ARCHIVE，
       不再按日期计算主题（旧版 AUTO 按钮的轮换分支已移除）。 */
    $('themeResetBtn').addEventListener('click', function () {
      try {
        localStorage.removeItem(THEME_STORE.mode);
        localStorage.removeItem(THEME_STORE.manual);
        localStorage.setItem('portfolio_theme_rotation_off', '1');
      } catch (e) {}
      applyTheme('archive');
      try { history.replaceState(null, '', location.pathname); } catch (e) {}
    });

    /* ── 10. 作品集分享卡（内嵌 share-card.html：数据/主题/二维码实时生成） ── */
    /* 卡片本体在独立网页 share-card.html（embed=1 隐藏其工具栏），弹窗只做壳：
       tab 切换 → postMessage 让 iframe 换版式；下载 → postMessage 让 iframe 用 html2canvas 导出。
       换人 / 改 data/site-data 后卡片自动跟着变，二维码指向当前访问域名，主题跟随主页。 */
    var shareBtn = $('shareBtn');
    var shareOverlay = $('shareOverlay');
    var shareFrame = $('shareFrame');
    var shareDownload = $('shareDownload');
    var shareCur = 0;
    var SHARE_SIZES = ['portrait', 'square'];

    function shareCmd(action, extra) {
      if (!shareFrame || !shareFrame.contentWindow) return;
      var msg = { type: 'sharecard:cmd', action: action };
      if (extra) for (var k in extra) msg[k] = extra[k];
      try { shareFrame.contentWindow.postMessage(msg, location.origin); } catch (e) {}
    }
    function setShareCard(i) {
      shareCur = ((i % SHARE_SIZES.length) + SHARE_SIZES.length) % SHARE_SIZES.length;
      shareCmd('size', { size: SHARE_SIZES[shareCur] });
      document.querySelectorAll('.share-tab').forEach(function (t, idx) {
        t.classList.toggle('on', idx === shareCur);
        t.setAttribute('aria-selected', idx === shareCur ? 'true' : 'false');
      });
    }
    // iframe 回报卡片实际尺寸：高度同步预览，宽度把弹窗收窄到贴合卡片（不受 CSS 缓存影响）
    window.addEventListener('message', function (e) {
      if (!shareFrame || e.origin !== location.origin || !e.data) return;
      if (e.data.type === 'sharecard:height') {
        var h = Number(e.data.height);
        if (h > 0 && shareFrame.style.height !== h + 'px') shareFrame.style.height = h + 'px';
      } else if (e.data.type === 'sharecard:width') {
        var w = Number(e.data.width);
        if (w > 0) {
          var panel = shareOverlay && shareOverlay.querySelector('.share-panel');
          var panelW = Math.min(w + 52, window.innerWidth - 32);
          if (panel) panel.style.width = panelW + 'px';
          var frameW = Math.min(w + 24, panelW - 28);
          if (shareFrame.style.width !== frameW + 'px') shareFrame.style.width = frameW + 'px';
        }
      }
    });

    function closeShare() {
      shareOverlay.hidden = true;
      document.body.style.overflow = '';
    }
    if (shareBtn) {
      shareBtn.hidden = false;
      shareBtn.addEventListener('click', function () {
        if (shareFrame && !shareFrame.src) {
          // 先给足够宽度让卡片渲染到目标 520px，随后由 width 消息把弹窗收窄贴合
          shareFrame.style.width = Math.min(560, window.innerWidth - 60) + 'px';
          shareFrame.src = 'share-card.html?embed=1&v=20261127c';
        }
        shareCur = 0;
        document.querySelectorAll('.share-tab').forEach(function (t, idx) {
          t.classList.toggle('on', idx === 0);
          t.setAttribute('aria-selected', idx === 0 ? 'true' : 'false');
        });
        shareOverlay.hidden = false;
        document.body.style.overflow = 'hidden';
        // iframe 首次加载完成后再发版式指令（load 事件保证内容已就绪）
        if (shareFrame) shareFrame.addEventListener('load', function () { setShareCard(shareCur); }, { once: true });
      });
    }
    if (shareDownload) {
      shareDownload.addEventListener('click', function () {
        shareCmd('export');
        var label = shareCur === 0 ? '竖版' : '方形';
        showToast('正在生成「' + label + '」分享卡…');
      });
    }
    if (shareOverlay) {
      shareOverlay.addEventListener('click', function (e) {
        if (e.target === shareOverlay) closeShare();
      });
      var shareCloseBtn = $('shareClose');
      if (shareCloseBtn) shareCloseBtn.addEventListener('click', closeShare);
      var shareCancelBtn = $('shareCancel');
      if (shareCancelBtn) shareCancelBtn.addEventListener('click', closeShare);
      document.querySelectorAll('.share-tab').forEach(function (t, idx) {
        t.addEventListener('click', function () { setShareCard(idx); });
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !shareOverlay.hidden) closeShare();
      });
    }

    /* ── 11. 陈培胜的数字分身（后端：Cloudflare Pages Function /api/chat） ──
       链路：静态页 → POST /api/chat → D1 FTS5 BM25 + Vectorize 向量（RRF 融合）
             → 受约束提示词 → 生成（答案带 citations，可回链切片原文）
       源码：functions/api/chat.js（入口）/ kb.js（检索）/ jd.js（JD 匹配） */
    /* API 线路 API_BASES 已在 IIFE 顶层统一定义（问答 / 语音 / 留言墙共用同一份）。 */
    /* M3-B（React 迁移分片二，2026-11-26）：index.astro 注入 window.CP_AI_REACT 后本节整体短路，
       面板由 React 岛（src/features/ai/AiShell，client:idle）接管，jd-match.js 亦不再底载。
       外围脚本（ai-voice-cloud 等）读的 window.CP_AI_ENDPOINT 仍在此同步设置。
       旧版 index.html 不注入守卫，走原逻辑，行为零变化。 */
    if (window.CP_AI_REACT) {
      window.CP_AI_ENDPOINT = API_BASES[0] + '/api/chat';
    } else {
    var AI_ENDPOINT = API_BASES[0] + '/api/chat';

    var AI_CONFIG = {
      endpoint: AI_ENDPOINT,   // Cloudflare Pages Function：混合检索 → 受约束生成；github.io 下自动跨站
      timeout: 20000,       // 云函数执行超时 30s，前端留余量
      maxChars: 200,        // 与后端 MAX_QUESTION_CHARS 对齐
      /* 欢迎语先放默认值；后台在 /admin「AI 语音」改的招呼文案异步覆盖下来，
         面板打开时若已取到就用新版，取不到（网络抖动 / 未部署函数）回退默认。 */
      welcome: '你好，我是陈培胜的数字分身。<br>你可以把我当成「在线的他」：关于他的项目、技术栈和工作经历，都能直接问我。我会依据他的真实简历资料作答，并标注出处。<br>想了解什么，尽管开口。',
      quickQuestions: ['你主导过哪些 0→1 系统？', '你的 Agent 架构经验？', '技术栈与方向？', '怎么联系你？'],
      /* ── 主动性：为兼容保留配置，但面板不再自动弹出（仅点击 3D 角色打开） ── */
      autoDelay: 10000,             // 保留字段（自动弹出已停用）
      autoTipAhead: 8500,           // 保留字段（自动弹出已停用）
      autoCooldown: 30 * 60 * 1000, // 保留字段（自动弹出已停用）
      autoTip: '👋 我是陈培胜的数字分身，点我聊聊～',
      autoLead: '你好，我是陈培胜的数字分身。<br>这页有 5 个企业项目、6 个个人作品和几十条技术细节，翻起来慢——<b>直接问我更快</b>，回答都带原文出处。<br>不想打字就先点一个：',
      autoPrompts: [
        { q: '你主导过哪些 0→1 的系统？', label: '0→1 系统' },
        { q: 'Agent 架构这块你做到什么程度？', label: 'Agent 深度' },
        { q: '技术栈与方向？', label: '技术栈' }
      ],
      /* JD 匹配：与问答共用 /chat 端点，靠 mode 分流；长度/额度口径以 jd-match.js 为准 */
      jd: {
        minChars: 30,
        maxChars: 1500,
        samples: [
          { key: 'agent', label: 'Agent 岗' },
          { key: 'backend', label: '后端岗' },
          { key: 'solution', label: '售前岗' }
        ]
      }
    };
    /* ── 招呼文案：后台 /api/greeting 一处改，面板欢迎语与语音招呼语同步 ──
       启动即异步拉取，不挡首屏；文案是纯文本，按换行转义成 <br> 后渲染。
       github.io 下 API_BASES[0] 指向 pages.dev 函数，公开 GET 已开 CORS。 */
    function greetingToHtml(text) {
      return esc(String(text || '')).replace(/\r?\n/g, '<br>');
    }
    fetch(API_BASES[0] + '/api/greeting', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.ok || !j.text) return;
        AI_CONFIG.welcome = greetingToHtml(j.text);
        /* 交给语音模块：Greet 文本与面板欢迎语保持同一份。
           用事件而不是直接调 AIVoice.setGreetingText：两个脚本的加载顺序
           不该成为约束，晚加载的一方在初始化时也会读 window.CP_GREETING_TEXT。 */
        window.CP_GREETING_TEXT = String(j.text);
        if (window.dispatchEvent && window.CustomEvent) {
          window.dispatchEvent(new CustomEvent('cpai:greeting', { detail: { text: String(j.text) } }));
        }
      })
      .catch(function () { /* 拿不到配置就用默认文案，不影响问答 */ });

    var aiFab = $('aiFab');
    /* 「岗位匹配」独立脚本（js/jd-match.js）复用同一台云函数与同一个 /chat 端点 */
    window.CP_AI_ENDPOINT = AI_CONFIG.endpoint;
    var aiPanel = $('aiPanel');
    var aiCloseBtn = $('aiClose');
    var aiBody = $('aiBody');
    var aiInput = $('aiInput');
    var aiSend = $('aiSend');
    var aiQuick = $('aiQuick');
    var aiModeBar = $('aiModeBar');
    var aiReady = false;
    var aiBusy = false;
    var aiMode = 'qa';   /* 'qa' | 'jd'：同一端点两种问法 */
    var aiLastJD = '';   /* 最近一次成功发起匹配的 JD 原文，供「打开完整对照」带到 jd.html 预填 */

    function jdUI() { return window.CP_JD_UI || null; }
    function jdCfg() {
      var u = jdUI();
      return u ? u.config() : {
        minChars: AI_CONFIG.jd.minChars, maxChars: AI_CONFIG.jd.maxChars,
        timeout: 38000, quota: '每人 10 分钟 4 次'
      };
    }

    function aiScroll() { aiBody.scrollTop = aiBody.scrollHeight; }
    function aiAppendMsg(who, html, mode) {
      var wrap = document.createElement('div');
      wrap.className = 'ai-msg ai-msg-' + who;
      /* 消息归属哪个模式：问答历史与 JD 结果分栏，切换时互不干扰 */
      wrap.setAttribute('data-mode', mode || aiMode || 'qa');
      wrap.innerHTML = '<span class="ai-msg-name">' + (who === 'bot' ? '陈培胜 · AI数字分身' : 'YOU') + '</span>' +
        '<div class="ai-bubble">' + html + '</div>';
      aiBody.appendChild(wrap);
      aiScroll();
      return wrap;
    }
    function aiShowTyping() {
      var t = aiAppendMsg('bot', '<span class="ai-dot"></span><span class="ai-dot"></span><span class="ai-dot"></span>');
      t.classList.add('ai-typing');
      return t;
    }

    /* ── JD 模式：与问答共用端点 / 知识库 / 皮肤语音观察契约 ── */
    function aiSetMode(next) {
      if (next !== 'jd') next = 'qa';
      if (aiMode === next) return;
      aiMode = next;
      if (aiPanel) aiPanel.classList.toggle('ai-mode-jd', next === 'jd');
      if (aiModeBar) {
        aiModeBar.querySelectorAll('[data-ai-mode]').forEach(function (b) {
          var on = b.getAttribute('data-ai-mode') === next;
          b.classList.toggle('on', on);
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
      }
      if (aiInput) {
        aiInput.placeholder = next === 'jd'
          ? '粘贴岗位 JD（30–1500 字），逐条对照档案…'
          : '问我：我做过哪些 Agent 项目？';
        aiInput.setAttribute('aria-label', next === 'jd' ? '输入岗位 JD' : '输入你的问题');
      }
      if (aiSend) aiSend.setAttribute('aria-label', next === 'jd' ? '开始匹配 JD' : '发送问题');
      aiRenderQuick();
      if (next === 'jd') {
        aiAppendMsg('bot', '已切到 <b>JD 匹配</b>：粘贴岗位描述，我会拆成需求逐条对照档案证据，列出覆盖 / 部分 / 缺口与面试追问点。<br>一次 30–1500 字，' + jdCfg().quota + '；也可以点下面的示例直接填入。');
      }
      /* 分栏生效后，把视口带到当前模式的最后一条 */
      aiScroll();
      if (aiInput && aiPanel && !aiPanel.hidden) aiInput.focus();
    }

    function aiRenderQuick() {
      if (!aiQuick) return;
      if (aiMode === 'jd') {
        aiQuick.innerHTML = AI_CONFIG.jd.samples.map(function (s) {
          return '<button class="ai-chip" type="button" data-jd-sample="' + s.key + '">' + esc(s.label) + ' →</button>';
        }).join('') + '<button class="ai-chip ai-chip-mode" type="button" data-ai-mode="qa">← 问答</button>';
        return;
      }
      aiQuick.innerHTML = AI_CONFIG.quickQuestions.map(function (q) {
        return '<button class="ai-chip" type="button">' + esc(q) + '</button>';
      }).join('') + '<button class="ai-chip ai-chip-mode" type="button" data-ai-mode="jd">JD 匹配 ↗</button>';
      aiQuick.querySelectorAll('.ai-chip').forEach(function (chip) {
        if (chip.getAttribute('data-ai-mode')) return;
        chip.addEventListener('click', function () { aiSubmit(chip.textContent); });
      });
    }

    function aiSubmitJD(raw, isRetry) {
      var u = jdUI();
      var cfg = jdCfg();
      var jd = String(raw || '').trim();
      if (jd.length < cfg.minChars) {
        aiAppendMsg('bot', '▍JD 太短了（' + jd.length + '/' + cfg.minChars + ' 字），贴完整的岗位职责与任职要求再发。');
        return;
      }
      if (jd.length > cfg.maxChars) {
        aiAppendMsg('bot', '▍JD 超过 ' + cfg.maxChars + ' 字，删掉公司介绍和福利段落再发。');
        return;
      }
      if (!u) {
        aiAppendMsg('bot', '▍JD 组件还没加载好，刷新页面再试；急的话用页面下方的「JD 匹配」区块。');
        return;
      }
      aiBusy = true;
      if (aiSend) aiSend.disabled = true;
      aiLastJD = jd;
      var flat = jd.replace(/\s+/g, ' ');
      var preview = flat.slice(0, 52) + (flat.length > 52 ? '…' : '');
      aiAppendMsg('user', esc(preview));
      var typing = aiShowTyping();
      var started = Date.now();
      u.request(jd).then(function (data) {
        typing.remove();
        var m = data.match || {}, o = m.overall || {};
        var score = Math.max(0, Math.min(100, Number(o.score) || 0));
        var n = (m.rows && m.rows.length) || 0;
        var req = Number(data.meta && data.meta.requirements) || 0;
        var coverage = req > n
          ? 'JD 拆出 ' + req + ' 条要求，合并为 ' + n + ' 个需求点'
          : '已逐条对照 ' + n + ' 个需求点';
        aiAppendMsg('bot', '覆盖度 <b>' + score + '/100</b>（' + esc(o.verdict || '已比对') + '），' + coverage + '。完整对照表在下面 ↓');
        aiAppendJDCard(data, (Date.now() - started) / 1000);
      }).catch(function (err) {
        typing.remove();
        var code = (err && err.code) || '';
        /* 断连/超时先自动重试一次：pages.dev 偶发 ERR_CONNECTION_CLOSED，
           用户手动点一次的成功率其实很高，别让人误以为功能坏了 */
        if (!isRetry && (code === 'network' || code === 'timeout')) {
          aiAppendMsg('bot', '▍通道闪断，正在自动重试一次…', 'jd');
          setTimeout(function () { aiSubmitJD(raw, true); }, 900);
          return;
        }
        aiAppendMsg('bot', '▍' + esc(u.errorText(err)), 'jd');
      }).then(function () {
        aiBusy = false;
        if (aiSend) aiSend.disabled = false;
        if (aiPanel && !aiPanel.hidden && aiInput) aiInput.focus();
      });
    }

    function aiAppendJDCard(data, elapsed) {
      var m = data.match || {}, o = m.overall || {};
      var rows = Array.isArray(m.rows) ? m.rows : [];
      var stats = m.stats || {};
      var meta = data.meta || {};
      var score = Math.max(0, Math.min(100, Number(o.score) || 0));
      var band = score >= 80 ? 'high' : score >= 60 ? 'mid' : score >= 35 ? 'low' : 'none';
      var CN = { covered: '覆盖', partial: '部分', gap: '缺口' };
      var card = document.createElement('div');
      card.className = 'ai-jd-card';
      card.setAttribute('data-mode', 'jd');
      card._jdData = data;
      var html =
        '<div class="ai-jd-top">' +
          '<div class="ai-jd-score" data-band="' + band + '"><b>' + score + '</b><span>/100</span></div>' +
          '<div class="ai-jd-topmain">' +
            '<p class="ai-jd-verdict">' + esc(o.verdict || '已比对') + '</p>' +
            '<p class="ai-jd-sum">' + esc(o.summary || '已按 JD 逐条对照档案。') + '</p>' +
            '<div class="ai-jd-stats"><span class="s-c">覆盖 ' + (stats.covered || 0) + '</span>' +
              '<span class="s-p">部分 ' + (stats.partial || 0) + '</span>' +
              '<span class="s-g">缺口 ' + (stats.gap || 0) + '</span></div>' +
          '</div>' +
        '</div>' +
        '<div class="ai-jd-meta">' + (meta.recalled || 0) + ' 段切片 · ' +
          (Number(meta.requirements) || rows.length) + ' 条要求 → ' + rows.length + ' 个需求点 · ' +
          elapsed.toFixed(1) + 's</div>' +
        '<div class="ai-jd-rows">';
      rows.forEach(function (r, i) {
        var st = CN[r.status] ? r.status : 'partial';
        var ev = Array.isArray(r.evidence) ? r.evidence.slice(0, 2) : [];
        var evHtml = ev.length ? ev.map(function (e) {
          var title = String(e.title || '').split('｜')[0].slice(0, 18);
          return '<li>' + esc(e.point) + '<span>' + esc(title) + '</span></li>';
        }).join('') : '<li class="none">无匹配证据</li>';
        html +=
          '<div class="ai-jd-item" data-status="' + st + '">' +
            '<div class="ai-jd-item-h"><span class="ai-jd-no">' + (i + 1 < 10 ? '0' : '') + (i + 1) + '</span>' +
              '<span class="ai-jd-badge">' + CN[st] + '</span><p>' + esc(r.req) + '</p></div>' +
            (r.gap && st !== 'covered' ? '<p class="ai-jd-gap">缺口：' + esc(r.gap) + '</p>' : '') +
            '<ul class="ai-jd-ev">' + evHtml + '</ul>' +
            (r.probe ? '<button class="ai-jd-probe" type="button" data-ai-probe="' + i + '" title="' + esc(r.probe) + '" aria-label="追问：' + esc(r.probe) + '">追问：' + esc(r.probe) + ' →</button>' : '') +
          '</div>';
      });
      html += '</div>' +
        '<div class="ai-jd-acts">' +
          '<button class="ai-jd-act" type="button" data-jd-copy="1">复制 Markdown ⧉</button>' +
          '<button class="ai-jd-act ai-jd-act-ghost" type="button" data-jd-open="1">打开完整对照 ↗</button>' +
        '</div>' +
        '<p class="ai-jd-note">证据取自档案切片 · 缺口照实列出 · 点追问可直接问数字分身</p>';
      card.innerHTML = html;
      aiBody.appendChild(card);
      aiScroll();
      var openBtn = card.querySelector('[data-jd-open]');
      if (openBtn) {
        openBtn.addEventListener('click', function () {
          /* JD 匹配已迁独立页：把刚发过的 JD 带过去预填，用户不用重贴 */
          try { if (aiLastJD) sessionStorage.setItem('cp_jd_prefill', aiLastJD); } catch (e) { /* 隐身模式等场景忽略 */ }
          aiClosePanel();
          location.href = 'jd.html';
        });
      }
      var copyBtn = card.querySelector('[data-jd-copy]');
      if (copyBtn) {
        copyBtn.addEventListener('click', function () {
          var u = jdUI();
          if (!u) return;
          var text = u.toMarkdown(data);
          var done = function (ok) {
            copyBtn.textContent = ok ? '已复制 ✓' : '复制失败';
            setTimeout(function () { copyBtn.textContent = '复制 Markdown ⧉'; }, 2000);
          };
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
          } else {
            var ta = document.createElement('textarea');
            ta.value = text; ta.setAttribute('readonly', '');
            ta.style.position = 'fixed'; ta.style.top = '-1000px';
            document.body.appendChild(ta); ta.select();
            var ok = false;
            try { ok = document.execCommand('copy'); } catch (e) {}
            document.body.removeChild(ta);
            done(ok);
          }
        });
      }
    }

    function aiOpenPanel(auto) {
      aiPanel.hidden = false;
      /* 移动端面板接近全屏：锁住背景滚动，避免内层滚到底带动整页（滚动穿透） */
      document.body.classList.add('ai-lock');
      aiPanel.classList.add('opening');
      setTimeout(function () { aiPanel.classList.remove('opening'); }, 320);
      aiFab.setAttribute('aria-expanded', 'true');
      if (!aiReady) {
        aiReady = true;
        if (!auto) aiAppendMsg('bot', AI_CONFIG.welcome);
        aiRenderQuick();
      }
      /* 自动弹出时不抢焦点：移动端不弹键盘，桌面端不打断当前阅读位置 */
      if (!auto) setTimeout(function () { aiInput.focus(); }, 60);
    }
    function aiClosePanel() {
      aiPanel.hidden = true;
      document.body.classList.remove('ai-lock');
      aiFab.setAttribute('aria-expanded', 'false');
      /* 关闭即回到问答模式：重开的人多数是想继续问，而不是接着匹配 */
      if (aiMode === 'jd') aiSetMode('qa');
    }
    function aiSubmit(text) {
      var q = (typeof text === 'string' ? text : aiInput.value).trim();
      if (!q || aiBusy) return;
      if (aiMode === 'jd') { aiSubmitJD(q); return; }
      if (aiPanel) aiPanel.classList.remove('ai-quiet');
      aiBusy = true;
      aiSend.disabled = true;
      aiAppendMsg('user', esc(q));
      aiInput.value = '';
      aiInput.style.height = '';
      if (q.length > AI_CONFIG.maxChars) {
        aiAppendMsg('bot', '▍问题太长啦，' + AI_CONFIG.maxChars + ' 字以内就好。');
        aiBusy = false;
        aiSend.disabled = false;
        return;
      }
      var typing = aiShowTyping();
      askAI(q).then(function (data) {
        typing.remove();
        bindAiSources(aiAppendMsg('bot', aiRenderAnswer(data)));
      }).catch(function (err) {
        typing.remove();
        aiAppendMsg('bot', aiRenderError(err));
      }).then(function () {
        aiBusy = false;
        aiSend.disabled = false;
        if (!aiPanel.hidden) aiInput.focus();
      });
    }
    /* 真实请求：POST /chat，契约 { question } → { ok, answer, sources[], fallback } */
    function askAI(question) {
      var ctrl = (typeof AbortController === 'function' ? new AbortController() : null);
      var timer = null;
      var opts = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question })
      };
      if (ctrl) opts.signal = ctrl.signal;

      return new Promise(function (resolve, reject) {
        if (ctrl) {
          timer = setTimeout(function () { ctrl.abort(); }, AI_CONFIG.timeout);
        }
        fetch(AI_CONFIG.endpoint, opts).then(function (r) {
          return r.text().then(function (txt) {
            var d = null;
            try { d = JSON.parse(txt); } catch (e) { d = null; }
            if (!d) { reject(new Error('bad_json')); return; }
            if (!r.ok || !d.ok) { reject(new Error(d.error || ('http_' + r.status))); return; }
            resolve(d);
          });
        }).catch(reject).then(function () {
          if (timer) clearTimeout(timer);
        });
      });
    }

    /* 答案文本：转义后把换行变 <br>；「依据」是可点的，展开切片原文供核对 */
    function aiRenderAnswer(data) {
      var html = esc(String(data.answer || '')).replace(/\r?\n/g, '<br>');
      if (data.sources && data.sources.length) {
        var tags = data.sources.slice(0, 3).map(function (s) {
          var label = esc(String(s.title || ''));
          if (label.length > 26) label = label.slice(0, 26) + '…';
          var excerpt = String(s.excerpt || s.text || '');
          return '<button class="ai-src" type="button" data-src-id="' + esc(String(s.id || '')) + '"' +
            (excerpt ? ' data-src-text="' + esc(excerpt) + '"' : '') +
            ' aria-expanded="false" title="' + (excerpt ? '点击展开原文' : esc(String(s.id || ''))) + '">' + label + '</button>';
        }).join('');
        html += '<div class="ai-src-row"><span class="ai-src-label">依据</span>' + tags + '</div>';
      }
      return html;
    }

    /* 「依据」点击展开/收起切片原文 */
    function bindAiSources(msgEl) {
      if (!msgEl) return;
      msgEl.querySelectorAll('.ai-src').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var text = btn.getAttribute('data-src-text') || '';
          if (!text) return;
          var open = btn.getAttribute('aria-expanded') === 'true';
          var body = msgEl.querySelector('.ai-src-body[data-for="' + btn.getAttribute('data-src-id') + '"]');
          if (open) {
            if (body) body.remove();
            btn.setAttribute('aria-expanded', 'false');
            return;
          }
          /* 收起其它已展开的原文，面板里同时只开一个 */
          msgEl.querySelectorAll('.ai-src-body').forEach(function (b) { b.remove(); });
          msgEl.querySelectorAll('.ai-src[aria-expanded="true"]').forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
          var div = document.createElement('div');
          div.className = 'ai-src-body';
          div.setAttribute('data-for', btn.getAttribute('data-src-id') || '');
          div.textContent = text;
          var row = btn.closest('.ai-src-row');
          if (row && row.parentElement) row.parentElement.insertBefore(div, row.nextSibling);
          btn.setAttribute('aria-expanded', 'true');
          aiScroll();
        });
      });
    }

    function aiRenderError(err) {
      var code = (err && err.message) || '';
      if (code === 'rate_limited') return '▍问得有点急，隔一分钟再问我吧。';
      if (code === 'AbortError') return '▍响应超时了，稍等再试一次。';
      if (code === 'origin_denied' || code === 'bad_request') {
        return '▍通道拒绝了这次请求。可以直接邮件联系：hi@chenpeisheng.cn';
      }
      return '▍通道暂时不可用，请稍后再试，或邮件联系：hi@chenpeisheng.cn';
    }
    /* ── 主动性：已停用自动弹出 ──
       面板不再自动弹出 / 自动冒招呼气泡：唯一入口是用户点击 3D 角色（见 js/ai-skins.js
       stage.click → aiFab.click）。下方自动相关函数保留仅为兼容，aiScheduleAuto 直接短路，
       不会设置任何定时器；aiCancelAuto 仍被手动事件调用，用于清理（此时通常无定时器）。 */
    var aiAutoTimer = null;
    var aiTipTimer = null;
    var aiTipEl = null;
    var aiLastScroll = 0;
    var aiManual = false;

    function aiHideTip() {
      if (aiTipEl && aiTipEl.parentNode) aiTipEl.parentNode.removeChild(aiTipEl);
      aiTipEl = null;
    }
    function aiShowTip() {
      if (aiTipEl || !aiFab || !aiFab.parentNode) return;
      aiTipEl = document.createElement('div');
      aiTipEl.className = 'ai-fab-tip';
      aiTipEl.textContent = AI_CONFIG.autoTip;
      aiFab.parentNode.appendChild(aiTipEl);
      /* 打招呼气泡的小尾巴对准角色舞台水平中心：舞台在不同皮肤/视口下宽度不同，
         用实测中心定位，避免气泡贴右缘、尾巴与角色错开 */
      var stage = document.querySelector('.ai-stage');
      if (stage && stage.getBoundingClientRect) {
        var r = stage.getBoundingClientRect();
        var centerFromRight = window.innerWidth - (r.left + r.width / 2);
        aiTipEl.style.right = Math.max(8, centerFromRight - 22) + 'px';
      }
    }
    function aiCancelAuto() {
      if (aiAutoTimer) { clearTimeout(aiAutoTimer); aiAutoTimer = null; }
      if (aiTipTimer) { clearTimeout(aiTipTimer); aiTipTimer = null; }
      aiHideTip();
    }
    function aiAutoOpen() {
      if (!aiPanel.hidden) return;
      aiHideTip();
      aiOpenPanel(true);
      aiPanel.classList.add('ai-quiet');
      var lead = aiAppendMsg('bot',
        AI_CONFIG.autoLead +
        '<div class="ai-greet-acts">' + AI_CONFIG.autoPrompts.map(function (p) {
          return '<button class="ai-greet-btn" type="button" data-ai-q="' + esc(p.q) + '">' +
            esc(p.label) + ' →</button>';
        }).join('') + '</div>');
      lead.classList.add('ai-greet');
      if (aiFab) {
        aiFab.classList.add('ai-fab-pulse');
        setTimeout(function () { aiFab.classList.remove('ai-fab-pulse'); }, 1700);
      }
    }
    function aiTryAutoOpen() {
      aiAutoTimer = null;
      if (aiManual || !aiPanel.hidden) return;
      if (document.hidden) { aiAutoTimer = setTimeout(aiTryAutoOpen, 3000); return; }
      /* 正在滚动/惯性滚动时不打断，等手停下来再弹 */
      if (Date.now() - aiLastScroll < 800) { aiAutoTimer = setTimeout(aiTryAutoOpen, 1400); return; }
      try {
        sessionStorage.setItem('cpai_auto', '1');
        localStorage.setItem('cpai_auto_ts', String(Date.now()));
      } catch (e) {}
      aiAutoOpen();
    }
    function aiScheduleAuto() {
      /* 自动弹出已停用：不再冒招呼气泡、不再定时展开面板。
         面板只由用户点击 3D 角色（或未加载皮肤时的浮标）手动打开。 */
      aiCancelAuto();
      return;
    }

    window.addEventListener('scroll', function () { aiLastScroll = Date.now(); }, false);

    if (aiFab) {
      aiFab.addEventListener('click', function () {
        aiManual = true; aiCancelAuto();
        if (aiPanel.hidden) aiOpenPanel(); else aiClosePanel();
      });
    }
    if (aiCloseBtn) {
      aiCloseBtn.addEventListener('click', function () {
        aiManual = true; aiCancelAuto();
        aiClosePanel();
      });
    }
    if (aiSend) aiSend.addEventListener('click', function () { aiManual = true; aiCancelAuto(); aiSubmit(); });

    /* 模式栏 + 快捷 chips：问答 / JD 互切，JD 示例只填输入框不直接发 */
    function aiModeClick(e) {
      var btn = (e.target && e.target.closest) ? e.target.closest('[data-ai-mode]') : null;
      if (!btn) return false;
      e.preventDefault();
      aiManual = true; aiCancelAuto();
      aiSetMode(btn.getAttribute('data-ai-mode'));
      return true;
    }
    if (aiModeBar) aiModeBar.addEventListener('click', aiModeClick);
    if (aiQuick) {
      aiQuick.addEventListener('click', function (e) {
        if (aiModeClick(e)) return;
        var sample = (e.target && e.target.closest) ? e.target.closest('[data-jd-sample]') : null;
        if (!sample) return;
        e.preventDefault();
        aiManual = true; aiCancelAuto();
        var u = jdUI();
        var ex = u ? u.examples() : {};
        var key = sample.getAttribute('data-jd-sample');
        if (ex[key] && aiInput) {
          aiInput.value = ex[key];
          aiInput.style.height = Math.min(aiInput.scrollHeight, 88) + 'px';
          aiInput.focus();
        }
      });
    }
    /* 主动开场里的引导按钮统一走委托，点一下就等于替你问了一句 */
    if (aiBody) {
      aiBody.addEventListener('click', function (e) {
        var probe = (e.target && e.target.closest) ? e.target.closest('[data-ai-probe]') : null;
        if (probe) {
          e.preventDefault();
          var cardEl = probe.closest ? probe.closest('.ai-jd-card') : null;
          var rows = cardEl && cardEl._jdData && cardEl._jdData.match && cardEl._jdData.match.rows;
          var idx = parseInt(probe.getAttribute('data-ai-probe'), 10);
          var q = rows && rows[idx] && rows[idx].probe;
          if (q) { aiSetMode('qa'); aiSubmit(q); }
          return;
        }
        var btn = (e.target && e.target.closest) ? e.target.closest('[data-ai-q]') : null;
        if (!btn) return;
        e.preventDefault();
        aiManual = true; aiCancelAuto();
        aiSubmit(btn.getAttribute('data-ai-q'));
      });
    }
    if (aiInput) {
      aiInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); aiManual = true; aiCancelAuto(); aiSubmit(); }
      });
      aiInput.addEventListener('input', function () {
        aiInput.style.height = 'auto';
        aiInput.style.height = Math.min(aiInput.scrollHeight, 88) + 'px';
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && aiPanel && !aiPanel.hidden) {
        aiManual = true; aiCancelAuto();
        aiClosePanel();
      }
    });

    aiScheduleAuto();
    } /* ← M3-B：window.CP_AI_REACT 守卫闭合（else 分支 = 原第 11 节） */
  }

  /* ── 12. 留言板（Cloudflare Pages Function /api/wall，D1 存储） ──
     设备隔离：网页读不到 MAC 地址（浏览器没有这个 API，手机 MAC 还会随机化），
     所以用 localStorage 里的随机 device_id 代替：换浏览器 / 清缓存 = 新设备，
     同一人的手机与电脑算两台设备。这是「隐私分区」，不是安全认证。 */
  function initWall() {
    var form = $('wallForm');
    if (!form) return;
    var listEl = $('wallList');
    var nameEl = $('wallName');
    var textEl = $('wallText');
    var countEl = $('wallCount');
    var submitBtn = $('wallSubmit');
    var totalEl = $('wallTotal');
    var noteEl = $('wallNote');
    var moreBtn = $('wallMore');
    var newBtn = $('wallNew');
    var refreshBtn = $('wallRefresh');
    var tipEl = $('wallFormTip');
    var T = window.__WALL_TEXT || {};
    var LIMIT = 20;
    var POLL_MS = 60000;
    var debugOn = /(?:^|[?&])wallDebug=1(?:&|$)/.test(location.search);

    /* 设备标识：服务端只存它的 HMAC 哈希，库被拖走也还原不出原始 ID。
       localStorage 不可用（隐私模式 / 禁用存储）时为空串，服务端会回 device_required。 */
    var DEVICE_KEY = 'cp_device_id';
    var deviceId = (function () {
      try {
        var saved = localStorage.getItem(DEVICE_KEY);
        if (saved && /^[A-Za-z0-9_-]{8,64}$/.test(saved)) return saved;
        var id = (window.crypto && typeof window.crypto.randomUUID === 'function')
          ? window.crypto.randomUUID()
          : 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
        localStorage.setItem(DEVICE_KEY, id);
        return id;
      } catch (e) { return ''; }
    })();

    /* 人机校验（Cloudflare Turnstile，2026-11-19 接入）
       · widget 懒渲染：脚本没到就轮询等待，最多 ~8 秒，超时视为不可用
       · 脚本被墙 / 加载失败 → 容器保持 hidden，提交不带 token，
         服务端会自动降到严格额度（每 IP 每小时 1 条），留言仍然可用
       · sitekey 是公开值，放前端没问题；密钥只在 Pages 环境变量里 */
    var TS_SITEKEY = '0x4AAAAAAGHnx0m992aGGpUJ';
    var tsBox = $('wallTurnstile');
    var tsToken = '';
    var tsWidget = null;
    var tsRendered = false;

    function renderTurnstile() {
      if (!tsBox || tsRendered || !window.turnstile || typeof window.turnstile.render !== 'function') return;
      try {
        tsWidget = window.turnstile.render(tsBox, {
          sitekey: TS_SITEKEY,
          theme: 'light',
          size: 'normal',
          callback: function (t) { tsToken = String(t || ''); },
          'expired-callback': function () { tsToken = ''; },
          'error-callback': function () { tsToken = ''; tsBox.hidden = true; }
        });
        tsRendered = true;
        tsBox.hidden = false;
      } catch (e) {
        tsRendered = false;
        tsBox.hidden = true;
      }
    }
    (function waitTurnstile(n) {
      if (window.turnstile && typeof window.turnstile.render === 'function') { renderTurnstile(); return; }
      if ((n || 0) >= 40) return;
      setTimeout(function () { waitTurnstile((n || 0) + 1); }, 200);
    })();

    function resetTurnstile() {
      tsToken = '';
      if (tsWidget != null && window.turnstile && typeof window.turnstile.reset === 'function') {
        try { window.turnstile.reset(tsWidget); } catch (e) {}
      }
    }

    var state = {
      mode: 'loading',          /* loading | open | closed | error */
      messages: [], total: 0, hasMore: false,
      busy: false, refreshing: false, loadingMore: false,
      showNew: false, latestId: null, highlightId: null, myIds: [],
      /* 对话（2026-11-23）：replyOpen 是当前展开评论框的留言 id，
         latestReply 是已见最新站长回复时间，用于轮询提示「站长回复了你」。 */
      replyOpen: null, replyBusy: false, latestReply: 0, showNewReply: false,
      updatedAt: 0, base: '', status: 0, reason: '', closedMsg: '', errorMsg: ''
    };
    try { /* 本次会话自己贴的留言，刷新后仍能标「· 我」 */
      var saved = JSON.parse(sessionStorage.getItem('cp-wall-myids') || '[]');
      if (Array.isArray(saved)) state.myIds = saved.slice(-30);
    } catch (e) {}

    function escT(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }
    function tpl(str, vars) {
      return String(str == null ? '' : str).replace(/\{(\w+)\}/g, function (all, k) {
        return vars[k] == null ? '' : vars[k];
      });
    }
    function setText(el, s) { if (el) el.textContent = s; }
    function fmtTime(ts) {
      try {
        var dt = new Date(ts);
        var pad = function (n) { return (n < 10 ? '0' : '') + n; };
        return dt.getFullYear() + '.' + pad(dt.getMonth() + 1) + '.' + pad(dt.getDate()) + ' ' + pad(dt.getHours()) + ':' + pad(dt.getMinutes());
      } catch (e) { return ''; }
    }
    function clockTime(ts) {
      try {
        var dt = new Date(ts), pad = function (n) { return (n < 10 ? '0' : '') + n; };
        return pad(dt.getHours()) + ':' + pad(dt.getMinutes());
      } catch (e) { return ''; }
    }
    function relTime(ts) {
      var s = Math.max(0, Math.floor((Date.now() - Number(ts)) / 1000));
      if (!isFinite(s)) return '';
      if (s < 60) return T.timeNow || '刚刚';
      if (s < 3600) return tpl(T.timeMin || '{n} 分钟前', { n: Math.floor(s / 60) });
      if (s < 86400) return tpl(T.timeHour || '{n} 小时前', { n: Math.floor(s / 3600) });
      var d = Math.floor(s / 86400);
      return d < 7 ? tpl(T.timeDay || '{n} 天前', { n: d }) : fmtTime(ts);
    }

    /* API 双线路规则（API_BASES）已在本节 AI_CONFIG 之前统一定义，问答与留言墙共用：
       github.io 直连 pages.dev 的函数，本地预览只打本机。 */
    /* 依次尝试线路；404/405 或非 JSON（静态主机把 /api 当文件返回）视为该线路没有 API。
       serverFailover 只给 GET 用：POST 收到 5xx 时不能盲目换线路重试，可能重复写入。
       所有请求统一带 X-Device-Id：服务端据此只返回这台设备的留言。 */
    function apiFetch(path, opts, serverFailover) {
      var i = 0, tried = {}, usedBase = '';
      opts = opts || {};
      var headers = Object.assign({}, opts.headers || {});
      if (deviceId) headers['X-Device-Id'] = deviceId;
      opts = Object.assign({}, opts, { headers: headers });
      function next() {
        if (i >= API_BASES.length) return Promise.reject(new Error('no_api'));
        var base = API_BASES[i++];
        var url = new URL(base + path, location.href).href;
        if (tried[url]) return next();
        tried[url] = 1;
        usedBase = base || '(同源)';
        return fetch(url, opts).then(function (r) {
          var ct = r.headers.get('content-type') || '';
          if (r.status === 404 || r.status === 405 || ct.indexOf('application/json') < 0) return next();
          if (serverFailover && r.status >= 500) return next();
          return r.json().then(function (j) {
            return { ok: r.ok, status: r.status, body: j, base: usedBase };
          });
        }, function () { return next(); });
      }
      return next();
    }

    function renderSkeleton() {
      if (!listEl) return;
      var card = '<div class="wall-skeleton"><div class="wall-skeleton-line short"></div>' +
        '<div class="wall-skeleton-line"></div><div class="wall-skeleton-line mid"></div></div>';
      listEl.innerHTML = card + card + card;
    }
    function renderClosed(text) {
      if (listEl) listEl.innerHTML = '<p class="wall-empty">' +
        escT(text || state.closedMsg || T.closedText || T.closed || '留言墙暂未开放') + '</p>';
      if (newBtn) newBtn.hidden = true;
    }
    function syncFormEnabled() {
      if (submitBtn) submitBtn.disabled = (state.mode === 'closed' || state.busy);
    }
    function renderError(text) {
      if (!listEl) return;
      listEl.innerHTML = '<p class="wall-error">' +
        escT(text || state.errorMsg || T.errorText || '留言没能加载出来') +
        '<button type="button" id="wallRetry">' + escT(T.retryText || '重试') + '</button></p>';
    }
    /* 一条留言下面的对话：站长回复（owner）用蓝色强调，访客追问（visitor）用中性样式。
       所有文本都走 escT，回复正文与留言正文一样是不可信输入。 */
    function renderReplies(m) {
      var replies = Array.isArray(m.replies) ? m.replies : [];
      var open = state.replyOpen === m.id;
      var html = '<div class="wall-thread">';
      if (replies.length) {
        html += '<div class="wall-thread-count">' +
          escT(tpl(T.replyCountText || '{n} 条对话', { n: replies.length })) + '</div>';
        html += replies.map(function (r) {
          var owner = r.author === 'owner';
          var iso = '';
          try { iso = new Date(r.ts).toISOString(); } catch (e) {}
          return '<div class="wall-reply' + (owner ? ' is-owner' : '') + '">' +
            '<div class="wall-reply-head"><span class="wall-reply-author">' +
            escT(owner ? (T.ownerLabel || '陈培胜 · 回复') : (T.visitorLabel || '你 · 追问')) + '</span>' +
            '<time class="wall-reply-time" datetime="' + escT(iso) + '" title="' + escT(fmtTime(r.ts)) + '">' +
            escT(relTime(r.ts)) + '</time></div>' +
            '<p class="wall-reply-text">' + escT(r.text) + '</p>' +
            '</div>';
        }).join('');
      }
      html += '<div class="wall-reply-actions">' +
        '<button class="wall-reply-toggle" type="button" data-act="reply-open" data-id="' + escT(m.id) + '"' +
        (open ? ' aria-expanded="true"' : '') + '>' +
        escT(open ? (T.replyCloseText || '收起') : (T.replyToggleText || '评论 / 追问')) + '</button>' +
        (open ? '' : '<span class="wall-reply-hint">' +
          escT(T.replyHintText || '回复与评论同样只在这台设备可见') + '</span>') +
        '</div>';
      if (open) {
        html += '<div class="wall-reply-form">' +
          '<textarea class="wall-input wall-reply-input" data-role="reply-input" data-id="' + escT(m.id) +
          '" maxlength="300" rows="2" placeholder="' + escT(T.replyPlaceholder || '接着聊两句…') + '"></textarea>' +
          '<div class="wall-reply-form-foot">' +
          '<span class="wall-reply-hint">⌘ / Ctrl + Enter 快速发送</span>' +
          '<button class="wall-reply-send" type="button" data-act="reply-send" data-id="' + escT(m.id) + '"' +
          (state.replyBusy ? ' disabled' : '') + '>' +
          escT(state.replyBusy ? (T.replySendingText || '发送中…') : (T.replySendText || '发送评论 ▶')) +
          '</button></div></div>';
      }
      return html + '</div>';
    }
    function renderItems() {
      if (!listEl) return;
      if (!state.messages.length) {
        listEl.innerHTML = '<p class="wall-empty">' + escT(T.emptyText || T.empty || '还没有留言') + '</p>';
        return;
      }
      listEl.innerHTML = state.messages.map(function (m) {
        var cls = 'wall-item reveal in';
        if (m.id && m.id === state.highlightId) cls += ' is-new';
        if (m.id && state.myIds.indexOf(m.id) >= 0) cls += ' is-own';
        var iso = '';
        try { iso = new Date(m.ts).toISOString(); } catch (e) {}
        return '<article class="' + cls + '" data-id="' + escT(m.id) + '">' +
          '<div class="wall-item-head"><span class="wall-item-no">#' + escT(String(m.id || '').slice(-5)) + '</span>' +
          '<strong class="wall-item-name">' + escT(m.name || '匿名访客') + '</strong>' +
          '<time class="wall-item-time" data-ts="' + escT(String(m.ts)) + '" datetime="' + escT(iso) +
          '" title="' + escT(fmtTime(m.ts)) + '">' + escT(relTime(m.ts)) + '</time></div>' +
          '<p class="wall-item-text">' + escT(m.text) + '</p>' +
          renderReplies(m) +
          '</article>';
      }).join('');
    }
    function updateBoardMeta() {
      var open = state.mode === 'open';
      setText(totalEl, open ? tpl(T.countText || '共 {n} 条留言', { n: state.total }) : '');
      var note = '';
      if (open) {
        note = tpl(T.shownText || '已显示 {shown} / {total} 条', { shown: state.messages.length, total: state.total });
        if (state.updatedAt) note += ' · ' + tpl(T.updatedText || '更新于 {time}', { time: clockTime(state.updatedAt) });
      }
      setText(noteEl, note);
      if (moreBtn) {
        moreBtn.hidden = !(open && state.hasMore);
        moreBtn.disabled = state.busy;
        moreBtn.textContent = state.loadingMore ? (T.moreLoadingText || '读取中…') : (T.moreText || '加载更早的留言 ▼');
      }
      if (newBtn) {
        newBtn.hidden = !(open && (state.showNew || state.showNewReply));
        newBtn.textContent = state.showNewReply
          ? (T.newReplyText || '站长回复了你 ▲')
          : (T.newText || '有新留言 ▲');
      }
      if (refreshBtn) {
        refreshBtn.disabled = state.busy || state.mode === 'closed';
        refreshBtn.classList.toggle('is-loading', !!state.refreshing);
      }
    }
    function renderDebug() {
      if (!listEl || !listEl.parentNode) return;
      var old = listEl.parentNode.querySelector('.wall-debug');
      if (old) old.parentNode.removeChild(old);
      var lines = [
        '留言板诊断 · ?wallDebug=1',
        'API 线路 : ' + (state.base || '（未发出请求）'),
        'HTTP     : ' + (state.status || '-'),
        'mode     : ' + state.mode,
        'open     : ' + (state.mode === 'open'),
        'reason   : ' + (state.reason || '-'),
        'total    : ' + state.total,
        'device   : ' + (deviceId ? deviceId.slice(0, 8) + '…（localStorage）' : '（无，localStorage 被禁用）')
      ];
      if (state.reason === 'device_required') {
        lines.push('', '→ 浏览器没给本地存储权限：允许本站使用 localStorage 后刷新即可。',
          '→ 换浏览器 / 清缓存 = 新设备，旧留言只在原设备可见（站长后台仍能看到全部）。');
      } else if (state.reason === 'kv_not_bound') {
        lines.push('', '→ Cloudflare Pages 未绑定 SITE_KV：Settings → Functions → KV namespace bindings 添加 SITE_KV，保存后重新部署。',
          '→ 一键自检：./scripts/wall-check.sh');
      } else if (state.reason === 'network_error') {
        lines.push('', '→ 两条线路都没拿到 JSON：检查网络，或确认 functions/api 已随站点部署。');
      } else if (state.reason === 'local_static') {
        lines.push('', '→ 当前是本地静态预览（无 /api）：改用 node scripts/dev-api-server.mjs 启动 8877 端口。');
      } else if (state.reason === 'file_protocol') {
        lines.push('', '→ 当前是 file:// 直开，请用「本地预览.command」启动 HTTP 服务。');
      }
      var box = document.createElement('div');
      box.className = 'wall-debug';
      box.textContent = lines.join('\n');
      listEl.parentNode.insertBefore(box, listEl);
    }
    function render() {
      if (nameEl) nameEl.disabled = (state.mode === 'closed');
      if (textEl) textEl.disabled = (state.mode === 'closed');
      syncFormEnabled();
      if (state.mode === 'loading') renderSkeleton();
      else if (state.mode === 'closed') renderClosed();
      else if (state.mode === 'error') renderError();
      else renderItems();
      updateBoardMeta();
      if (debugOn) renderDebug();
    }
    function applyPage(d, reset) {
      var page = Array.isArray(d.messages) ? d.messages : [];
      if (reset) {
        state.messages = page.slice();
      } else { /* 按 id 去重：翻页期间若有人插了新留言，避免重复卡片 */
        var seen = {};
        state.messages.forEach(function (m) { seen[m.id] = 1; });
        page.forEach(function (m) { if (!seen[m.id]) { seen[m.id] = 1; state.messages.push(m); } });
      }
      state.total = Number(d.total) || state.messages.length;
      state.hasMore = typeof d.hasMore === 'boolean' ? d.hasMore : (state.messages.length < state.total);
      state.latestId = state.messages.length ? state.messages[0].id : null;
      /* 记录已见的最新站长回复时间：页面刷新后不该再把旧回复当成新消息提示 */
      state.latestReply = 0;
      state.messages.forEach(function (m) {
        (m.replies || []).forEach(function (r) {
          if (r.author === 'owner' && Number(r.ts) > state.latestReply) state.latestReply = Number(r.ts);
        });
      });
      state.mode = 'open';
      state.updatedAt = Date.now();
    }

    /* keep：刷新时一次拉回当前已展开的条数，不让「刷新」把列表折叠回第一页 */
    function loadFirst(silent, keep) {
      if (state.busy) return Promise.resolve();
      state.busy = true;
      state.refreshing = !!silent;
      if (!silent) { state.mode = 'loading'; }
      render();
      var limit = Math.min(50, Math.max(LIMIT, keep || state.messages.length));
      return apiFetch('/api/wall?limit=' + limit + '&offset=0',
        { headers: { 'Accept': 'application/json' } }, true)
        .then(function (res) {
          state.status = res.status;
          state.base = res.base;
          var d = res.body || {};
          if (!res.ok || !d.ok) throw new Error('bad_response');
          if (d.open === false) {
            state.mode = 'closed';
            state.reason = d.reason || 'unknown';
            state.messages = []; state.total = 0; state.hasMore = false;
            state.showNew = false;
            render();
            return;
          }
          /* 没有设备标识（localStorage 被禁用）：明确告知，而不是显示「还没有留言」 */
          if (d.reason === 'device_required') {
            state.mode = 'closed';
            state.reason = 'device_required';
            state.closedMsg = T.deviceText || '这台设备拿不到本地存储权限，留言本无法分区显示；请在浏览器设置里允许本站使用本地存储后刷新。';
            state.messages = []; state.total = 0; state.hasMore = false;
            state.showNew = false;
            render();
            return;
          }
          state.reason = '';
          state.showNew = false;
          applyPage(d, true);
          render();
        })
        .catch(function () {
          state.mode = 'error';
          /* 本地 8765 静态预览本来就没有 /api，给站长一句可执行的提示，而不是干巴巴的「加载失败」 */
          var isLocal = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/.test(location.hostname || '');
          state.reason = isLocal ? 'local_static' : 'network_error';
          state.errorMsg = isLocal
            ? (T.localText || '本地静态预览没有留言 API · 要联调请运行 node scripts/dev-api-server.mjs 并打开 http://127.0.0.1:8877')
            : '';
          render();
        })
        .then(function () {
          state.busy = false;
          state.refreshing = false;
          syncFormEnabled();
          updateBoardMeta();
        });
    }
    function loadMore() {
      if (state.busy || state.mode !== 'open' || !state.hasMore) return;
      state.busy = true; state.loadingMore = true;
      updateBoardMeta();
      apiFetch('/api/wall?limit=' + LIMIT + '&offset=' + state.messages.length,
        { headers: { 'Accept': 'application/json' } }, true)
        .then(function (res) {
          var d = res.body || {};
          if (!res.ok || !d.ok || d.open === false) { showToast(T.errorText || '加载失败，稍后再试', 'err'); return; }
          applyPage(d, false);
          render();
        })
        .catch(function () { showToast(T.errorText || '加载失败，稍后再试', 'err'); })
        .then(function () {
          state.busy = false; state.loadingMore = false;
          syncFormEnabled(); updateBoardMeta();
        });
    }
    /* 轻量轮询：只取总数与最新 id，不传正文；有新留言时显示提示按钮，不打断阅读 */
    function peek() {
      if (state.busy || state.mode !== 'open') return;
      apiFetch('/api/wall?peek=1', { headers: { 'Accept': 'application/json' } }, true)
        .then(function (res) {
          var d = res.body || {};
          if (!res.ok || !d.ok || d.open === false) return;
          if (d.latest && d.latest.id && d.latest.id !== state.latestId && !state.showNew) {
            state.showNew = true;
            updateBoardMeta();
          }
          /* 站长回复不改变留言 id，靠服务端返回的 latestReply 单独判断 */
          if (Number(d.latestReply || 0) > (Number(state.latestReply) || 0) && !state.showNewReply) {
            state.showNewReply = true;
            updateBoardMeta();
          }
        })
        .catch(function () {});
    }
    function updateTimes() {
      if (!listEl) return;
      listEl.querySelectorAll('.wall-item-time[data-ts]').forEach(function (el) {
        el.textContent = relTime(Number(el.getAttribute('data-ts')));
      });
    }
    function refresh() {
      state.showNew = false;
      state.showNewReply = false;
      loadFirst(true, state.messages.length);
    }
    function updateCount() {
      if (!countEl) return;
      var n = Array.from(textEl.value || '').length;
      countEl.textContent = n + ' / 300';
      countEl.classList.toggle('is-near', n > 270);
    }

    if (tipEl && T.tipText) setText(tipEl, T.tipText);
    if (moreBtn && T.moreText) setText(moreBtn, T.moreText);

    if (/^file:/.test(location.protocol)) {
      state.mode = 'closed';
      state.reason = 'file_protocol';
      state.closedMsg = T.fileText || '本地双击打开时留言墙不可用，请用「本地预览.command」启动 HTTP 服务';
      render();
      return;
    }

    loadFirst(false);

    if (refreshBtn) refreshBtn.addEventListener('click', refresh);
    if (newBtn) newBtn.addEventListener('click', refresh);
    if (moreBtn) moreBtn.addEventListener('click', loadMore);
    /* 访客评论：POST /api/wall {replyTo, text}，服务端校验设备归属后写入 wall_replies。
       返回体仍是本设备整页，applyPage() 直接复用，不必单独维护对话状态。 */
    function submitReply(id) {
      if (state.replyBusy || !listEl || !id) return;
      var input = null;
      listEl.querySelectorAll('[data-role="reply-input"]').forEach(function (el) {
        if (el.getAttribute('data-id') === id) input = el;
      });
      if (!input) return;
      var text = String(input.value || '').trim();
      if (!text) { showToast(T.replyEmptyText || '先写点什么吧', 'err'); input.focus(); return; }
      if (Array.from(text).length < 2) {
        showToast(T.replyShortText || '再多写两个字吧（至少 2 个字）', 'err'); input.focus(); return;
      }
      state.replyBusy = true;
      var sendBtn = null;
      listEl.querySelectorAll('[data-act="reply-send"]').forEach(function (el) {
        if (el.getAttribute('data-id') === id) sendBtn = el;
      });
      if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = T.replySendingText || '发送中…'; }
      apiFetch('/api/wall', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ replyTo: id, text: text })
      })
        .then(function (res) {
          var d = res.body || {};
          if (res.ok && d.ok) {
            applyPage(d, true);
            state.showNew = false;
            state.showNewReply = false;
            state.replyOpen = id; /* 保持展开，方便继续聊 */
            showToast(d.duplicate
              ? (T.replyDuplicateText || '这句刚刚已经发过啦')
              : (T.replyOkText || '评论已贴到这条留言下面 ▶'), d.duplicate ? 'info' : 'ok');
          } else {
            showToast(d.message || T.replyFailText || '评论没能发出去，稍后再试', 'err');
          }
        })
        .catch(function () { showToast(T.replyNetFailText || '网络异常，评论未能发送', 'err'); })
        .then(function () {
          state.replyBusy = false;
          render(); /* 恢复按钮状态并渲染新对话 */
        });
    }

    if (listEl) listEl.addEventListener('click', function (e) {
      if (e.target && e.target.id === 'wallRetry') { loadFirst(false); return; }
      var btn = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
      if (!btn || !listEl.contains(btn)) return;
      var id = btn.getAttribute('data-id');
      var act = btn.getAttribute('data-act');
      if (act === 'reply-open') {
        state.replyOpen = (state.replyOpen === id) ? null : id;
        render();
        if (state.replyOpen === id) {
          listEl.querySelectorAll('[data-role="reply-input"]').forEach(function (el) {
            if (el.getAttribute('data-id') === id) el.focus();
          });
        }
      } else if (act === 'reply-send') {
        submitReply(id);
      }
    });
    if (listEl) listEl.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' &&
          e.target && e.target.getAttribute('data-role') === 'reply-input') {
        e.preventDefault();
        submitReply(e.target.getAttribute('data-id'));
      }
    });
    if (textEl) textEl.addEventListener('input', updateCount);

    function quickSubmit(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (form.requestSubmit) form.requestSubmit();
        else form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }
    }
    [nameEl, textEl].forEach(function (el) { if (el) el.addEventListener('keydown', quickSubmit); });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (state.mode === 'closed') { showToast(T.closedText || '留言墙暂未开放', 'err'); return; }
      if (state.busy) return;
      var text = String(textEl.value || '').trim();
      if (!text) { showToast(T.emptyPostText || '先写点什么吧', 'err'); textEl.focus(); return; }
      if (Array.from(text).length < 2) { showToast(T.shortText || '再多写两个字吧（至少 2 个字）', 'err'); textEl.focus(); return; }
      var name = String(nameEl.value || '').trim();
      state.busy = true;
      submitBtn.disabled = true;
      var old = submitBtn.textContent;
      submitBtn.textContent = '发送中…';
      updateBoardMeta();
      apiFetch('/api/wall', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, text: text, turnstileToken: tsToken })
      })
        .then(function (res) {
          var d = res.body || {};
          if (res.ok && d.ok) {
            applyPage(d, true);
            var first = state.messages[0];
            if (first && first.id) {
              state.highlightId = first.id;
              if (state.myIds.indexOf(first.id) < 0) state.myIds.push(first.id);
              try { sessionStorage.setItem('cp-wall-myids', JSON.stringify(state.myIds.slice(-30))); } catch (err) {}
            }
            state.showNew = false;
            state.showNewReply = false;
            textEl.value = '';
            nameEl.value = '';
            updateCount();
            resetTurnstile();
            showToast(d.duplicate ? (T.duplicateText || '这条留言刚刚已经贴过啦')
              : (T.postOkText || '已贴上留言墙，感谢你的想法 ▶'), d.duplicate ? 'info' : 'ok');
            render();
            if (listEl && listEl.firstElementChild && listEl.firstElementChild.scrollIntoView) {
              try { listEl.firstElementChild.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (err) {}
            }
          } else {
            var msg = d.message || T.postFailText || '留言失败，稍后再试';
            if (res.status === 429 && d.retryAfter) {
              msg += '（约 ' + Math.max(1, Math.ceil(Number(d.retryAfter) / 60)) + ' 分钟后）';
            }
            /* 被打到严格额度：多半是人机校验没通过，重置 widget 让访客能重新验证 */
            if (res.status === 429 && d.verifyRequired) resetTurnstile();
            showToast(msg, 'err');
          }
        })
        .catch(function () { showToast(T.netFailText || '网络异常，留言未能发送', 'err'); })
        .then(function () {
          state.busy = false;
          submitBtn.textContent = old;
          syncFormEnabled();
          updateBoardMeta();
        });
    });

    setInterval(function () {
      if (document.hidden || state.mode !== 'open') return;
      updateTimes();
      peek();
    }, POLL_MS);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && state.mode === 'open') peek();
    });
  }

  /* ══════════════ 视口自适应 ══════════════
     1) --vw-real：真实内容视口宽度（排除 Windows 经典滚动条），供全幅区块使用
     2) 顶栏导航逐项退让：以右侧「分享 / 访问统计」区左边界为界，凡是被它遮住、
        无法完整显示的导航项一律隐藏；能完整显示几项就留几项（从最右侧起让位）。
        一项都放不下时才整体收成汉堡菜单，并在菜单里恢复全部入口。
        字体放大 / 浏览器缩放 / 翻译变长都走同一套几何判断，任何屏幕都不横向裁切。
     3) 裁决前先移除 .bar-tight 与隐藏标记，避免上一轮结果影响本轮判断而抖动。 */
  function syncResponsiveGuard() {
    var root = document.documentElement;
    var bar = document.querySelector('.topbar-inner');
    root.style.setProperty('--vw-real', root.clientWidth + 'px');
    if (!bar) return;
    var nav = document.getElementById('nav');
    var rightArea = document.querySelector('.topbar-right');
    var items = nav ? Array.prototype.slice.call(nav.querySelectorAll('a')) : [];
    if (!items.length) return;

    /* 复位：全部显示，按真实布局重新裁决 */
    document.body.classList.remove('bar-tight');
    for (var i = 0; i < items.length; i++) items[i].classList.remove('nav-item-hidden');

    /* 汉堡菜单展开时为竖排，逐项裁剪无意义且会误伤菜单里的入口，直接跳过 */
    if (window.getComputedStyle(nav).flexDirection === 'column') return;

    /* 分享 / 计数区左边界即「完整显示」的右极限；取不到则退回顶栏右内缘 */
    var limit = rightArea ? rightArea.getBoundingClientRect().left
                          : bar.getBoundingClientRect().right - 12;
    var tolerance = 1;

    function visibleItems() {
      return items.filter(function (a) { return !a.classList.contains('nav-item-hidden'); });
    }
    /* 当前最右侧仍越界的那一项；都在界内则返回 null */
    function rightmostCovered() {
      var vis = visibleItems();
      if (!vis.length) return null;
      var last = vis[vis.length - 1];
      return last.getBoundingClientRect().right > limit - tolerance ? last : null;
    }

    /* 从最右侧起逐项隐藏被遮住的导航项；隐藏后布局重排，循环内重新测量 */
    var covered;
    while ((covered = rightmostCovered())) {
      covered.classList.add('nav-item-hidden');
    }

    /* 一项都放不下 → 收成汉堡菜单，并在菜单里恢复全部入口 */
    if (!visibleItems().length) {
      for (var j = 0; j < items.length; j++) items[j].classList.remove('nav-item-hidden');
      document.body.classList.add('bar-tight');
      var menuEl = document.getElementById('menuBtn');
      if (menuEl) {
        menuEl.classList.remove('open');
        menuEl.setAttribute('aria-expanded', 'false');
      }
    }
  }
  syncResponsiveGuard();
  window.addEventListener('resize', syncResponsiveGuard, { passive: true });
  window.addEventListener('load', syncResponsiveGuard);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(syncResponsiveGuard);

  /* ══════════════ 启动 ══════════════ */
  /* 数据缺失时的最小提示：不借用任何示例人物数据 */
  function showDataError() {
    var box = document.createElement('div');
    box.className = 'data-error';
    box.innerHTML = '<strong>数据未能加载</strong><span>请按 ⌘/Ctrl + Shift + R 强制刷新；若仍空白，说明 data/site-data.js 没有随页面发布。</span>';
    document.body.insertBefore(box, document.body.firstChild);
  }

  loadSiteData().then(function (data) {
    if (!data) { showDataError(); return; }
    try {
      renderSite(data);
      syncSectionLayout(data);
      layoutWorks();
      initInteractions();
      initWall();
      initContributions();
      syncResponsiveGuard(); /* 计数器数字位等动态内容渲染后再校一次 */
    } catch (err) {
      try { console.error('[site-data] 渲染失败：', err); } catch (e) {}
      showDataError();
    }
  });

})();
