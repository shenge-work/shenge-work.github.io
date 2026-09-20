// 主题轮换逻辑：按当天日期（本地时区）自动选择主题
// 每天凌晨 0 点过后，访问者看到的就是「当天」对应的那套风格
(function () {
  const THEMES = [
    { id: "minimal-light", name: "极简留白" },
    { id: "neon-cyberpunk", name: "暗夜科技" },
    { id: "retro-terminal", name: "复古终端" },
    { id: "illustrated",    name: "彩绘手绘" },
    { id: "magazine",       name: "杂志编辑" },
    { id: "academic",       name: "学术论文" },
    { id: "glassmorphism",  name: "玻璃拟态" },
    { id: "swiss",          name: "瑞士国际" },
    { id: "brutalist",      name: "粗野主义" }
  ];

  // 计算「从某个固定纪元起过了多少天」——保证连续日期对应连续主题
  // 使用本地时区的年月日，避免时区导致凌晨切换错位
  const now = new Date();
  const dayNumber = Math.floor(
    (now.getTime() - now.getTimezoneOffset() * 60000) / 86400000
  );

  let themeIndex = ((dayNumber % THEMES.length) + THEMES.length) % THEMES.length;

  // 调试/预览支持：URL 传 ?theme=id 可强制指定主题（不影响正常按日期轮换）
  const forced = new URLSearchParams(window.location.search).get("theme");
  if (forced) {
    const i = THEMES.findIndex((t) => t.id === forced);
    if (i >= 0) themeIndex = i;
  }

  const theme = THEMES[themeIndex];

  // 注入对应主题的样式表
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "themes/" + theme.id + "/style.css";
  document.head.appendChild(link);

  // 在 <html> 上打标记，方便各主题和调试
  document.documentElement.setAttribute("data-theme", theme.id);
  document.documentElement.setAttribute("data-theme-name", theme.name);
})();
