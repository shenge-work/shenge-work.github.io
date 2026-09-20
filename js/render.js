// 通用渲染器：把 resume.json 渲染成语义化 HTML
// 所有主题共享同一套 DOM 结构，视觉差异完全由主题 CSS 决定
// 主题可通过 CSS 决定是否显示图片封面（.project-cover img）/ 头像（.hero-portrait img）
(function () {
  fetch("data/resume.json")
    .then((r) => r.json())
    .then((d) => render(d))
    .catch((e) => {
      document.getElementById("resume").innerHTML =
        '<p class="error">简历数据加载失败：' + e.message + "</p>";
    });

  function render(d) {
    const el = document.getElementById("resume");
    el.innerHTML = [
      hero(d),
      section("about", "关于我", summary(d)),
      section("target", "求职意向", target(d)),
      section("education", "教育经历", education(d)),
      section("experience", "工作经历", experience(d)),
      section("projects", "项目作品", projects(d)),
      section("skills", "专业技能", skills(d)),
      section("awards", "获奖证书", awards(d)),
      section("contact", "联系方式", contact(d)),
      '<footer class="footer">© ' +
        new Date().getFullYear() +
        " " +
        esc(d.nameEn) +
        " · " +
        esc(d.coordinates) +
        "</footer>"
    ].join("");
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function hero(d) {
    return [
      '<header class="hero">',
      '  <div class="hero-badge">' + esc(d.status) + "</div>",
      '  <div class="hero-portrait"><img src="' + esc(d.portraitImg) + '" alt="' + esc(d.name) + '" loading="lazy" /></div>',
      '  <h1 class="hero-name">' + esc(d.name) + "</h1>",
      '  <div class="hero-name-en">' + esc(d.nameEn) + "</div>",
      '  <div class="hero-title">' +
        esc(d.title) +
        (d.titleEn ? ' <span class="hero-title-en">/ ' + esc(d.titleEn) + "</span>" : "") +
        "</div>",
      '  <div class="hero-subtitle">' + esc(d.subtitle) + "</div>",
      '  <p class="hero-tagline">' + esc(d.tagline) + "</p>",
      '  <div class="hero-meta">' +
        esc(d.location) + " · " + esc(d.coordinates) + " · " + esc(d.availability) +
        "</div>",
      (d.principles ? '<div class="hero-principles">' + esc(d.principles) + "</div>" : ""),
      "  <div class=\"hero-highlights\">" +
        d.highlights
          .map(
            (h) =>
              '<div class="hl-item"><span class="hl-value">' +
              esc(h.value) +
              '</span><span class="hl-label">' +
              esc(h.label) +
              "</span></div>"
          )
          .join("") +
        "</div>",
      "</header>"
    ].join("");
  }

  function summary(d) {
    return '<p class="summary">' + esc(d.summary) + "</p>";
  }

  function target(d) {
    const t = d.target;
    return [
      '<div class="target-item">' +
        '<div class="target-label">意向岗位</div>' +
        '<div class="target-primary"><strong>' + esc(t.primary) + "</strong></div>" +
        (t.primaryNote ? '<div class="target-note">' + esc(t.primaryNote) + "</div>" : "") +
        "</div>",
      '<div class="target-item">' +
        '<div class="target-label">备选方向</div>' +
        '<div class="target-backup">' + t.backup.map(esc).join(" / ") + "</div>" +
        (t.backupNote ? '<div class="target-note">' + esc(t.backupNote) + "</div>" : "") +
        "</div>",
      '<div class="target-item">' +
        '<div class="target-label">期望城市</div>' +
        '<div class="target-loc">' + esc(t.location) + "</div>" +
        (t.locationNote ? '<div class="target-note">' + esc(t.locationNote) + "</div>" : "") +
        "</div>",
      '<div class="target-item">' +
        '<div class="target-label">到岗时间</div>' +
        '<div class="target-start">' + esc(t.start) + "</div>" +
        (t.startNote ? '<div class="target-note">' + esc(t.startNote) + "</div>" : "") +
        "</div>"
    ].join("");
  }

  function education(d) {
    return d.education
      .map(
        (e) =>
          '<div class="entry">' +
          '<div class="entry-head"><span class="entry-title">' +
          esc(e.school) +
          '</span><span class="entry-period">' +
          esc(e.period) +
          "</span></div>" +
          '<div class="entry-sub">' +
          esc(e.degree) + " · " + esc(e.major) +
          (e.majorEn ? " " + esc(e.majorEn) : "") +
          "</div>" +
          (e.awards && e.awards.length
            ? '<div class="entry-awards">获奖：' + e.awards.map(esc).join("、") + "</div>"
            : "") +
          (e.courses ? '<div class="entry-courses">' + esc(e.courses) + "</div>" : "") +
          "</div>"
      )
      .join("");
  }

  function experience(d) {
    return d.experience
      .map(
        (e) =>
          '<div class="entry">' +
          '<div class="entry-head"><span class="entry-title">' +
          esc(e.company) +
          '</span><span class="entry-period">' +
          esc(e.period) +
          "</span></div>" +
          (e.companyFull ? '<div class="entry-company-full">' + esc(e.companyFull) + "</div>" : "") +
          '<div class="entry-sub">' +
          esc(e.role) +
          (e.roleNote ? " · " + esc(e.roleNote) : "") +
          "</div>" +
          (e.points.length
            ? "<ul>" + e.points.map((p) => "<li>" + esc(p) + "</li>").join("") + "</ul>"
            : "") +
          (e.tech && e.tech.length
            ? '<div class="entry-tech">' +
              e.tech.map((t) => '<span class="tag">' + esc(t) + "</span>").join("") +
              "</div>"
            : "") +
          "</div>"
      )
      .join("");
  }

  function projects(d) {
    return (
      '<div class="projects">' +
      d.projects
        .map(
          (p) =>
            '<div class="project-card">' +
            '<div class="project-cover">' +
            (p.coverImg
              ? '<img src="' + esc(p.coverImg) + '" alt="' + esc(p.name) + '" loading="lazy" />'
              : "") +
            '<span class="project-cover-text">' + esc(p.cover || p.name) + "</span>" +
            "</div>" +
            '<div class="project-meta">' +
            '<span class="project-id">' + esc(p.id) + "</span>" +
            (p.category ? '<span class="project-category">' + esc(p.category) + "</span>" : "") +
            (p.period ? '<span class="project-period">' + esc(p.period) + "</span>" : "") +
            "</div>" +
            '<div class="project-name">' + esc(p.name) + "</div>" +
            (p.desc ? '<div class="project-desc">' + esc(p.desc) + "</div>" : "") +
            (p.tech && p.tech.length
              ? '<div class="project-tech">' +
                p.tech.map((t) => '<span class="tag">' + esc(t) + "</span>").join("") +
                "</div>"
              : "") +
            "</div>"
        )
        .join("") +
      "</div>"
    );
  }

  function skills(d) {
    const bars = d.skills
      .map(
        (s) =>
          '<div class="skill">' +
          '<div class="skill-head"><span class="skill-name">' +
          esc(s.name) +
          '</span><span class="skill-score">' +
          s.score +
          "</span></div>" +
          '<div class="skill-bar"><div class="skill-fill" style="width:' +
          s.score +
          '%"></div></div></div>'
      )
      .join("");
    const tags = d.toolbox
      .map((t) => '<span class="tag">' + esc(t) + "</span>")
      .join("");
    return (
      bars +
      (d.skillsNote ? '<div class="skills-note">' + esc(d.skillsNote) + "</div>" : "") +
      '<div class="toolbox-title">工具箱 TOOLBOX</div>' +
      '<div class="toolbox">' + tags + "</div>"
    );
  }

  function awards(d) {
    return d.awards
      .map(
        (a) =>
          '<div class="award">' +
          (a.img ? '<img class="award-img" src="' + esc(a.img) + '" alt="' + esc(a.name) + '" loading="lazy" />' : "") +
          '<div class="award-body">' +
          '<span class="award-id">' + esc(a.id) + '</span>' +
          '<span class="award-name">' + esc(a.name) + "</span>" +
          (a.note ? '<span class="award-note">' + esc(a.note) + "</span>" : "") +
          "</div></div>"
      )
      .join("");
  }

  function contact(d) {
    const c = d.contact;
    return [
      '<div class="contact-grid">' +
      '<div class="contact-item"><div class="contact-label">EMAIL / 邮箱</div>' +
        '<a class="contact-value" href="mailto:' + esc(c.email) + '">' + esc(c.email) + "</a></div>" +
      '<div class="contact-item"><div class="contact-label">TEL / 电话</div>' +
        '<a class="contact-value" href="tel:' + esc(c.phone.replace(/\s/g, "")) + '">' + esc(c.phone) + "</a></div>" +
      '<div class="contact-item"><div class="contact-label">GITHUB / 代码仓库</div>' +
        '<a class="contact-value" href="' + esc(c.github) + '" target="_blank" rel="noopener">' +
        esc(c.github.replace(/^https?:\/\//, "")) + "</a></div>" +
      '<div class="contact-item"><div class="contact-label">BASE / 常驻</div>' +
        '<div class="contact-value">' + esc(c.base) +
        (c.baseNote ? ' <span class="contact-note">' + esc(c.baseNote) + "</span>" : "") +
        "</div></div>" +
      '<div class="contact-item contact-resume-link"><div class="contact-label">RESUME / 简历下载</div>' +
        '<a class="contact-value" href="resume.html">打印版简历（可存 PDF）</a></div>' +
      "</div>"
    ].join("");
  }

  function section(id, title, inner) {
    return (
      '<section class="section" id="' +
      id +
      '">' +
      '<h2 class="section-title">' +
      esc(title) +
      "</h2>" +
      '<div class="section-body">' +
      inner +
      "</div></section>"
    );
  }
})();
