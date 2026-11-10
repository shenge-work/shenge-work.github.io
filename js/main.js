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
  function esc(s) { /* 文本转义（字段值默认按纯文本；需 HTML 的字段走 innerHTML） */
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function renderSite(d) {
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
      '<a class="btn btn-solid" href="#projects">' + esc(h.ctaProjects || '查看作品') + ' <span class="btn-arrow" aria-hidden="true">▶▶</span></a>' +
      '<a class="btn btn-ghost" href="' + esc(h.resumeFile || 'resume.html') + '">' + esc(h.ctaResume || '查看简历') + ' <span class="btn-arrow" aria-hidden="true">▶</span></a>';
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

    /* ── 教育经历 ── */
    var ed = d.education || {}, em = ed.main || {};
    var eduMain =
      '<div class="edu-card reveal">' +
        '<div class="edu-card-head"><span class="edu-years">' + esc(em.time) + '</span>' +
        '<span class="tag ' + (em.tagCls || 'tag-orange') + '">' + esc(em.tag) + '</span></div>' +
        '<div class="edu-brand">' + (em.logo ? '<img class="edu-logo" src="' + esc(em.logo) + '" alt="' + esc(em.school) + ' 校徽">' : '') +
        '<h3 class="edu-school">' + esc(em.school) + '</h3></div>' +
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

    /* ── 工作经历 ── */
    $('expList').innerHTML = (d.experience || []).map(function (x) {
      return '<article class="exp-card reveal">' +
        '<div class="exp-head"><div><h3 class="exp-company">' + esc(x.company) + '</h3>' +
        '<p class="exp-role">' + esc(x.role) + '</p></div><span class="exp-time">' + esc(x.time) + '</span></div>' +
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
        '<div class="proj-media"><img src="' + esc(p.img) + '" alt="' + esc(p.imgAlt) + '" width="640" height="360">' +
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
      return '<article class="work-card' + (up ? ' work-upcoming' : '') + '">' +
        (up ? '<span class="work-badge">预告 · 规划中</span>' : '') +
        '<div class="work-head"><span class="work-no" aria-hidden="true">' + esc(w.no) + '</span>' +
        '<h3 class="work-title">' + esc(w.title) + '<span class="work-title-en">' + esc(w.titleEn) + '</span></h3></div>' +
        '<p class="work-desc">' + esc(w.desc) + '</p>' +
        '<div class="work-tech">' + (w.tech || []).map(function (t) {
          return '<span>' + esc(t) + '</span>';
        }).join('') + '</div>' +
        '<div class="work-links">' +
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
    /* 恒定速度：滚动时长 = 单组宽度 / 速度(px/s)，随内容多少自适应 */
    var _wSet = _wGrid.firstElementChild;
    if (_wSet) {
      _wGrid.style.setProperty('--scroll-duration', (_wSet.getBoundingClientRect().width / 110).toFixed(2) + 's');
    }
    /* 卡片对齐内容安全区：偏移 = 板块左缘到窗口 + 板块左内边距（随宽度自适应） */
    var _wSec = document.getElementById('works');
    if (_wSec) {
      var _wPad = _wSec.getBoundingClientRect().left + parseFloat(getComputedStyle(_wSec).paddingLeft);
      _wGrid.style.setProperty('--ws-pad', Math.max(0, Math.round(_wPad)) + 'px');
    }

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
        '<div class="cert-media"><img src="' + esc(c.img) + '" alt="' + esc(c.alt) + '" width="620" height="446">' +
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
    var sections = ['about', 'objective', 'education', 'experience', 'projects', 'skills', 'awards', 'contact']
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

    /* ── 7. Toast（分享卡等场景的轻提示） ── */
    var toast = $('toast');
    var toastTimer = null;
    function showToast(msg) {
      toast.textContent = msg;
      toast.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { toast.classList.remove('show'); }, 2600);
    }

    /* ── 9. 风格控制台（私人彩蛋：三连击页脚「FILE END — EOF」唤出） ── */
    var NAMES = { archive: 'ARCHIVE', blueprint: 'BLUEPRINT', newsprint: 'NEWSPRINT', noir: 'NOIR' };
    var THEME_ORDER = ['archive', 'blueprint', 'newsprint', 'noir'];
    var THEME_STORE = { mode: 'portfolio_theme_mode', manual: 'portfolio_theme_manual' };

    function storeGet(key) {
      try { return localStorage.getItem(key); } catch (e) { return null; }
    }
    function storeSet(key, val) {
      try { localStorage.setItem(key, val); } catch (e) {}
    }

    var ctl = document.createElement('div');
    ctl.className = 'theme-ctl';
    ctl.innerHTML =
      '<button class="theme-ctl-btn" id="themeNextBtn" title="切换到下一套风格（手动选择后锁定）">▸ STYLE · <b id="themeNowName"></b></button>' +
      '<button class="theme-ctl-btn" id="themeAutoBtn" title="暂停 / 恢复每日自动轮换">◌ AUTO · <b id="themeAutoState"></b></button>';
    document.body.appendChild(ctl);

    var themeNowName = $('themeNowName');
    var themeAutoState = $('themeAutoState');
    var themeAutoBtn = $('themeAutoBtn');

    function applyTheme(t) {
      document.documentElement.setAttribute('data-theme', t);
      themeNowName.textContent = NAMES[t] || t.toUpperCase();
    }
    function renderAutoState() {
      var manual = storeGet(THEME_STORE.mode) === 'manual';
      themeAutoState.textContent = manual ? 'OFF' : 'ON';
      themeAutoBtn.classList.toggle('off', manual);
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
            renderAutoState();
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
      renderAutoState();
      try { history.replaceState(null, '', location.pathname); } catch (e) {}
    });

    themeAutoBtn.addEventListener('click', function () {
      if (storeGet(THEME_STORE.mode) === 'manual') {
        storeSet(THEME_STORE.mode, 'auto');
        var n = new Date();
        var day = Math.floor((n - new Date(n.getFullYear(), 0, 0)) / 864e5);
        applyTheme(THEME_ORDER[day % THEME_ORDER.length]);
      } else {
        storeSet(THEME_STORE.mode, 'manual');
        storeSet(THEME_STORE.manual, document.documentElement.getAttribute('data-theme'));
      }
      renderAutoState();
      try { history.replaceState(null, '', location.pathname); } catch (e) {}
    });

    /* ── 10. 作品集分享卡（静态宣传图：竖版 / 方形，预览 + 下载） ── */
    /* 预览走 1080px 轻量 WebP（约 88KB/64KB，显示尺寸下与原图无可见差异），
       避免直拉 2160px 原图（591KB/395KB）在慢链路下拖长加载；
       WebP 加载失败（极旧浏览器或网络抖动）自动回退 256 色 PNG 预览；
       下载仍给 2160px 原图 PNG，保证分享场景最高清晰度。 */
    var SHARE_CARDS = [
      {
        file: 'images/陈培胜-作品集-分享卡-竖版.png',
        name: '陈培胜-作品集-分享卡-竖版.png',
        preview: 'images/陈培胜-作品集-分享卡-竖版-预览.webp',
        fallback: 'images/陈培胜-作品集-分享卡-竖版-预览.png'
      },
      {
        file: 'images/陈培胜-作品集-分享卡-方形.png',
        name: '陈培胜-作品集-分享卡-方形.png',
        preview: 'images/陈培胜-作品集-分享卡-方形-预览.webp',
        fallback: 'images/陈培胜-作品集-分享卡-方形-预览.png'
      }
    ];
    var shareBtn = $('shareBtn');
    var shareOverlay = $('shareOverlay');
    var shareImg = $('shareImg');
    var shareDownload = $('shareDownload');
    var shareCur = 0;

    function setShareCard(i) {
      shareCur = ((i % SHARE_CARDS.length) + SHARE_CARDS.length) % SHARE_CARDS.length;
      var c = SHARE_CARDS[shareCur];
      /* 预览失败 → 回退 PNG 预览（只回退一次，防循环） */
      shareImg.onerror = function () {
        if (shareImg.getAttribute('src') === c.preview) { shareImg.src = c.fallback; }
      };
      shareImg.src = c.preview;
      shareImg.alt = '陈培胜作品集分享卡' + (shareCur === 0 ? '（竖版）' : '（方形）');
      document.querySelectorAll('.share-tab').forEach(function (t, idx) {
        t.classList.toggle('on', idx === shareCur);
        t.setAttribute('aria-selected', idx === shareCur ? 'true' : 'false');
      });
    }

    function closeShare() {
      shareOverlay.hidden = true;
      document.body.style.overflow = '';
      shareImg.onerror = null;
      shareImg.removeAttribute('src');
    }

    if (shareBtn) {
      shareBtn.addEventListener('click', function () {
        setShareCard(0);
        shareOverlay.hidden = false;
        document.body.style.overflow = 'hidden';
      });
    }
    if (shareDownload) {
      shareDownload.addEventListener('click', function () {
        var c = SHARE_CARDS[shareCur];
        var a = document.createElement('a');
        a.href = c.file;
        a.download = c.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        showToast('正在下载「' + (shareCur === 0 ? '竖版' : '方形') + '」分享卡');
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

    /* ── 11. CP.AI 简历问答助手（已接入后端：腾讯云 CloudBase 云函数 + 静态 RAG） ──
       链路：静态页 → CloudBase HTTP 网关 /chat → 云函数 resume-ai-chat
             → char-bigram TF-IDF 检索 knowledge/ 切片 → hy3 生成（带 <context> 约束）
       源码：functions/tencent/（index.js 业务主体 / prompt.js 提示词与拦截） */
    var AI_CONFIG = {
      endpoint: 'https://resume-ai-d9g7zghnxda2ee2cb-1307508155.ap-shanghai.app.tcloudbase.com/chat',
      timeout: 20000,       // 云函数执行超时 30s，前端留余量
      maxChars: 200,        // 与后端 MAX_QUESTION_CHARS 对齐
      welcome: '你好，我是 CP.AI —— 陈培胜的档案问答助手。<br>后端跑在 <b>CloudBase 云函数</b>上：先用 TF-IDF 在 32 段简历切片里召回相关段落，再交给大模型受约束生成答案，每次回答都会标注依据来源。<br>可以问我项目细节、技术栈、工作经历。',
      quickQuestions: ['主导过哪些 0→1 系统？', 'Agent 架构经验？', '技术栈与方向？', '联系方式？'],
      /* ── 主动性：停留 10 秒仍未开口，就主动把问题递到手边 ── */
      autoDelay: 10000,             // 展开面板的时刻（毫秒）
      autoTipAhead: 8500,           // 距展开还剩多久就冒自我介绍气泡 → 进页面约 1.5s 即打招呼
      autoCooldown: 30 * 60 * 1000, // 同一台设备 30 分钟内不再自动弹
      autoTip: '👋 我是 AI 简历问答助手，点我直接问～',
      autoLead: '我是 CP.AI，陈培胜的档案问答助手。<br>这页塞了 6 套系统、几十条技术细节，翻页挺慢——<b>直接问我更快</b>，回答都带原文出处。<br>不想打字就先点一个：',
      autoPrompts: [
        { q: '你主导过哪些 0→1 的系统？', label: '0→1 系统' },
        { q: 'Agent 架构这块你做到什么程度？', label: 'Agent 深度' },
        { q: '技术栈与方向？', label: '技术栈' }
      ]
    };
    var aiFab = $('aiFab');
    var aiPanel = $('aiPanel');
    var aiCloseBtn = $('aiClose');
    var aiBody = $('aiBody');
    var aiInput = $('aiInput');
    var aiSend = $('aiSend');
    var aiQuick = $('aiQuick');
    var aiReady = false;
    var aiBusy = false;

    function aiScroll() { aiBody.scrollTop = aiBody.scrollHeight; }
    function aiAppendMsg(who, html) {
      var wrap = document.createElement('div');
      wrap.className = 'ai-msg ai-msg-' + who;
      wrap.innerHTML = '<span class="ai-msg-name">' + (who === 'bot' ? 'CP.AI' : 'YOU') + '</span>' +
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
    function aiOpenPanel(auto) {
      aiPanel.hidden = false;
      aiPanel.classList.add('opening');
      setTimeout(function () { aiPanel.classList.remove('opening'); }, 320);
      aiFab.setAttribute('aria-expanded', 'true');
      if (!aiReady) {
        aiReady = true;
        if (!auto) aiAppendMsg('bot', AI_CONFIG.welcome);
        aiQuick.innerHTML = AI_CONFIG.quickQuestions.map(function (q) {
          return '<button class="ai-chip" type="button">' + esc(q) + '</button>';
        }).join('');
        aiQuick.querySelectorAll('.ai-chip').forEach(function (chip) {
          chip.addEventListener('click', function () { aiSubmit(chip.textContent); });
        });
      }
      /* 自动弹出时不抢焦点：移动端不弹键盘，桌面端不打断当前阅读位置 */
      if (!auto) setTimeout(function () { aiInput.focus(); }, 60);
    }
    function aiClosePanel() {
      aiPanel.hidden = true;
      aiFab.setAttribute('aria-expanded', 'false');
    }
    function aiSubmit(text) {
      var q = (typeof text === 'string' ? text : aiInput.value).trim();
      if (!q || aiBusy) return;
      aiBusy = true;
      aiSend.disabled = true;
      if (aiPanel) aiPanel.classList.remove('ai-quiet');
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
        aiAppendMsg('bot', aiRenderAnswer(data));
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

    /* 答案文本：转义后把换行变 <br>，来源单独渲染成标签 */
    function aiRenderAnswer(data) {
      var html = esc(String(data.answer || '')).replace(/\r?\n/g, '<br>');
      if (data.sources && data.sources.length) {
        var tags = data.sources.slice(0, 3).map(function (s) {
          var label = esc(String(s.title || ''));
          if (label.length > 26) label = label.slice(0, 26) + '…';
          return '<span class="ai-src" title="' + esc(String(s.id || '')) + '">' + label + '</span>';
        }).join('');
        html += '<div class="ai-src-row"><span class="ai-src-label">依据</span>' + tags + '</div>';
      }
      return html;
    }

    function aiRenderError(err) {
      var code = (err && err.message) || '';
      if (code === 'rate_limited') return '▍问得有点急，隔一分钟再问我吧。';
      if (code === 'AbortError') return '▍响应超时了，稍等再试一次。';
      if (code === 'origin_denied' || code === 'bad_request') {
        return '▍通道拒绝了这次请求。可以直接邮件联系：shenge.work@gmail.com';
      }
      return '▍通道暂时不可用，请稍后再试，或邮件联系：shenge.work@gmail.com';
    }
    /* ── 主动性：停留 10 秒自动打招呼（每会话一次，同设备 30 分钟冷却） ──
       思路：先 4 秒后冒一个小气泡做预告，到 10 秒仍没被搭理才展开面板并递上三个入口；
       用户任何主动动作（点浮标 / 关面板 / 提问题 / 按 Esc）都视作"已接管"，立刻撤销自动行为。 */
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
      if (!aiFab || !aiPanel) return;
      try {
        if (sessionStorage.getItem('cpai_auto') === '1') return;
        var ts = parseInt(localStorage.getItem('cpai_auto_ts') || '0', 10);
        if (ts && (Date.now() - ts) < AI_CONFIG.autoCooldown) return;
      } catch (e) {}
      aiTipTimer = setTimeout(aiShowTip, Math.max(1200, AI_CONFIG.autoDelay - AI_CONFIG.autoTipAhead));
      aiAutoTimer = setTimeout(aiTryAutoOpen, AI_CONFIG.autoDelay);
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
    /* 主动开场里的引导按钮统一走委托，点一下就等于替你问了一句 */
    if (aiBody) {
      aiBody.addEventListener('click', function (e) {
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
  }

  /* ══════════════ 视口自适应 ══════════════
     1) --vw-real：真实内容视口宽度（排除 Windows 经典滚动条），供全幅区块使用
     2) 顶栏溢出兜底：字体放大 / 浏览器缩放 / 文案变长导致内容仍放不下时，
        自动收起横向导航、启用汉堡菜单，保证任何屏幕尺寸都不出现横向裁切
     测量前先移除 .bar-tight，避免紧凑状态自身影响判断而反复抖动。 */
  function syncResponsiveGuard() {
    var root = document.documentElement;
    var bar = document.querySelector('.topbar-inner');
    root.style.setProperty('--vw-real', root.clientWidth + 'px');
    if (!bar) return;
    document.body.classList.remove('bar-tight');
    if (bar.scrollWidth > bar.clientWidth + 1) {
      document.body.classList.add('bar-tight');
      var navEl = document.getElementById('nav');
      var menuEl = document.getElementById('menuBtn');
      if (navEl && !navEl.classList.contains('open') && menuEl) {
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
      initInteractions();
      syncResponsiveGuard(); /* 计数器数字位等动态内容渲染后再校一次 */
    } catch (err) {
      try { console.error('[site-data] 渲染失败：', err); } catch (e) {}
      showDataError();
    }
  });

})();
