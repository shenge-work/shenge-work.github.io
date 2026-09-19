/* ════════════════════════════════════════════════════════
   陈培胜求职作品集 · 交互脚本
   导航 / 滚动进场 / 数字滚动 / 技能条 / 项目模态框 / Toast
   ════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── 1. 移动端菜单 ─────────────────────────── */
  const menuBtn = document.getElementById('menuBtn');
  const nav = document.getElementById('nav');

  function closeMenu() {
    nav.classList.remove('open');
    menuBtn.classList.remove('open');
    menuBtn.setAttribute('aria-expanded', 'false');
  }
  menuBtn.addEventListener('click', function () {
    const isOpen = nav.classList.toggle('open');
    menuBtn.classList.toggle('open', isOpen);
    menuBtn.setAttribute('aria-expanded', String(isOpen));
  });
  nav.addEventListener('click', function (e) {
    if (e.target.closest('a')) closeMenu();
  });
  window.addEventListener('resize', function () {
    if (window.innerWidth > 1024) closeMenu();
  });

  /* ── 2. 导航当前区高亮 ─────────────────────── */
  const sections = ['about', 'objective', 'education', 'experience', 'projects', 'skills', 'awards', 'contact']
    .map(function (id) { return document.getElementById(id); })
    .filter(Boolean);
  const navLinks = Array.prototype.slice.call(nav.querySelectorAll('a[data-sec]'));

  function highlightNav() {
    const pos = window.scrollY + window.innerHeight * 0.32;
    let currentId = '';
    sections.forEach(function (sec) {
      if (sec.offsetTop <= pos) currentId = sec.id;
    });
    navLinks.forEach(function (link) {
      link.classList.toggle('active', link.dataset.sec === currentId);
    });
  }
  window.addEventListener('scroll', highlightNav, { passive: true });
  highlightNav();

  /* ── 3. 滚动进场动画 ───────────────────────── */
  const revealEls = document.querySelectorAll('.reveal');
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

  /* ── 4. 数字滚动动画 ───────────────────────── */
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
    countEls.forEach(function (el) {
      el.textContent = el.dataset.count + (el.dataset.suffix || '');
    });
  }

  /* ── 5. 技能条填充 ─────────────────────────── */
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

  /* ── 6. 项目详情数据 ───────────────────────── */
  var PROJECTS = [
    {
      no: 'P-01',
      img: 'images/project-1.jpg',
      badge: '企业 AI 基建 · 金融投研',
      year: '2026.01 — 2026.07 · 进门财经 · AI 团队主力研发',
      title: 'comein.cn — AI 投研工作台（Agent 基座 · 云沙箱）',
      desc: '面向券商、上市公司及机构投资者构建合规安全的 Agent 投研闭环平台，覆盖 Agent 基座、云沙箱、工具生态、模型计费、多渠道触达和 Skill 治理等核心能力。',
      points: [
        '搭建 QwenPaw / OpenCode 集成与通用 Agent 基座，实现多租户云沙箱隔离环境，完成发布依赖管理、日志上报、数据预处理与 Agent / Skill 全生命周期管控；',
        '设计 MCP / Skill 统一能力扩展体系，标准化能力注册、发现、调用、权限与版本流程，兼容 MCP 协议与外部 API，支持多模态能力接入，降低工具接入成本；',
        '设计多租户 AI 资源精细化计费：费率转换、实时预扣、离线扣费、账单校准与补偿机制，实现模型调用成本实时计量、链路追溯；',
        '自研消息频道中心对接飞书 / 企微 / 钉钉 / 微信 / QQ，实现 Agent 投研结果多 IM 实时触达；自研 Skill-Hub 实现 Skill 发布、审核、版本、权限、灰度全流程管理。'
      ],
      stack: 'Python · AgentScope · QwenPaw / OpenCode · SandBox · OAuth2 · Flink · MCP · Skill · Tool Calling',
      stats: [
        { v: '多租户', s: '云沙箱隔离执行' },
        { v: '5+ IM', s: '投研结果实时触达' },
        { v: '全链路', s: '成本计量与追溯' }
      ]
    },
    {
      no: 'P-02',
      img: 'images/project-2.jpg',
      badge: 'Multi-Agent · Agentic RAG',
      year: '2024.03 — 2025.11 · Lessie · 创始团队核心研发',
      title: 'lessie.cn — AI 人脉搜索引擎',
      desc: '一款智能代理搜索引擎：运用 Agent 技术实现即时「找人」，快速定位全球目标人物并完成初步联络。搜索精准度提升 30%、成本降低 80%、目标人物定位时间缩短 60%。',
      points: [
        '开发 Search Agent，封装多平台搜索 Tools，设计多级降级检索策略，完成多源数据源的统一调用与结果融合；',
        '搭建 RAG 增强的 Few-Shot 学习框架，实现样本自动化录入与相似性召回，持续提升大模型决策准确性；',
        '构建 LLM 性能评估系统，支持多模型并行测试与核心指标自动化统计；解耦 SSE 流式推送，保障「逐字输出」体验与断点续传；',
        '设计分布式任务队列（状态自动流转 / 优先级调度 / 并发控制）与支付中台（Stripe / Paypal 全链路闭环），落地 T+1 增长裂变机制与 posthog 全链路追踪。'
      ],
      stack: 'LangChain · LangGraph · LangSmith · LlamaIndex · Multi-Agent · Agentic RAG · Milvus',
      stats: [
        { v: '+30%', s: '搜索精准度' },
        { v: '-80%', s: '单次找人成本' },
        { v: '-60%', s: '目标定位耗时' }
      ]
    },
    {
      no: 'P-03',
      img: 'images/project-3.jpg',
      badge: 'FDE 式业务落地',
      year: '2024.03 — 2025.11 · Lessie · 端到端交付',
      title: 'hicreator.ai — 海外红人营销一体化平台',
      desc: '一站式 AI 网红营销自动化系统：通过大模型与多模态数据分析，实现品牌与创作者全链路闭环管理，运营效率提升 40%、履约率高达 80%。',
      points: [
        'FDE 式端到端落地：深入红人营销业务，把模糊诉求拆解为可执行流程，用 Grok LLM + Agent 工作流将「客户→项目→合同→审批→付款→结算」串联成自动化闭环；',
        '搭建 IM 通信平台，打通 TikTok（RPA 机器人）、WhatsApp 及邮件发信渠道与风险检测评估，支撑达人筛选、批量邀约、合同管理、样品履约自动化；',
        '自建 KOL 达人数据库 + SEO 引流标准化 Toolkit：构建达人画像、商品类目、市场规则、合规话术等垂直领域知识库；',
        '开发浏览器插件，在 YouTube / IG / TikTok / X / FB 达人主页浮窗展示入库、拉黑、粉丝与项目信息。'
      ],
      stack: 'Spring Boot / Cloud · MyBatis · MySQL · Redis · RocketMQ · LLM · MCP · Skill · WebDriver',
      stats: [
        { v: '+40%', s: '运营效率提升' },
        { v: '80%', s: '履约率' },
        { v: '<10%', s: '失联率' }
      ]
    },
    {
      no: 'P-04',
      img: 'images/project-4.jpg',
      badge: '0→1 自建触达基建',
      year: '2024 — 2025 · Lessie · 独立负责',
      title: '海外邮件营销群发系统 — MAIL ENGINE',
      desc: '0→1 搭建面向海外用户的自建邮件营销触达平台，替代第三方 SaaS 服务：海量邮件群发、多渠道投递，打开率 45% 以上、送达率 95% 以上、垃圾箱率低于 5%。',
      points: [
        '依赖倒置双端架构：一套账号串联生产 / 测试环境并强隔离数据，解决跨境网络及环境差异问题；封装多发送渠道统一驱动层（Resend / AWS SES / SendGrid），渠道动态分配、队列分片限流；',
        '分布式定时批处理 + DelayQueue + 子任务切片落表，实现群发任务断点续发与失败重试；对接 Webhook 事件幂等消费，Kafka 上报全量邮件事件并搭建 BI 统计看板；',
        '基于 LLM 推理与上下文记忆实现多业务场景邮件模板智能匹配与营销内容智能生成；构建发送链路自动化告警风控体系，AI 分析 BadCase 自动调优发送策略；',
        '独立发送 IP 与域名资源隔离、域名校验与发送控频，搭建域名自动化养号链路缩短预热周期；落地黑名单过滤、发件人轮换、内容检测与敏感字段拦截。'
      ],
      stack: 'Spring Boot / Cloud · MyBatis · MySQL · Redis · Kafka · Docker / K8s · SMTP / IMAP · AWS · SendGrid · Resend',
      stats: [
        { v: '95%+', s: '送达率' },
        { v: '50万+', s: '月均有效触达' },
        { v: '45%+', s: '邮件打开率' }
      ]
    }
  ];

  /* ── 7. 项目模态框 ─────────────────────────── */
  var modal = document.getElementById('projModal');
  var modalImg = document.getElementById('modalImg');
  var modalNo = document.getElementById('modalNo');
  var modalBadge = document.getElementById('modalBadge');
  var modalYear = document.getElementById('modalYear');
  var modalTitle = document.getElementById('modalTitle');
  var modalDesc = document.getElementById('modalDesc');
  var modalPoints = document.getElementById('modalPoints');
  var modalStack = document.getElementById('modalStack');
  var modalStats = document.getElementById('modalStats');
  var lastFocused = null;

  function openModal(index) {
    var p = PROJECTS[index];
    if (!p) return;
    modalImg.src = p.img;
    modalImg.alt = p.title + ' 项目封面';
    modalNo.textContent = p.no;
    modalBadge.textContent = p.badge;
    modalYear.textContent = p.year;
    modalTitle.textContent = p.title;
    modalDesc.textContent = p.desc;
    modalPoints.innerHTML = p.points.map(function (t) { return '<li>' + t + '</li>'; }).join('');
    modalStack.textContent = p.stack;
    modalStats.innerHTML = p.stats.map(function (st) {
      return '<div><strong>' + st.v + '</strong><span>' + st.s + '</span></div>';
    }).join('');
    lastFocused = document.activeElement;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    document.querySelector('.modal-close').focus();
  }
  function closeModal() {
    modal.hidden = true;
    document.body.style.overflow = '';
    if (lastFocused) lastFocused.focus();
  }

  document.querySelectorAll('.proj-card').forEach(function (card) {
    card.addEventListener('click', function () {
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

  /* ── 8. Toast（简历下载提示）──────────────── */
  var toast = document.getElementById('toast');
  var toastTimer = null;
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('show'); }, 2600);
  }
  document.querySelectorAll('a[download]').forEach(function (link) {
    link.addEventListener('click', function () {
      showToast('简历已开始下载 — 如未触发，请右键「链接另存为」');
    });
  });

})();