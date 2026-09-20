# 在线简历 · 多主题每日轮换

将 https://shenge-work.github.io/（陈培胜 · AI 全栈工程师）改造为「每天自动轮换一种风格」的在线简历。

## 架构

```
data/resume.json      ← 唯一数据源（完整简历内容，改这里即可）
images/               ← 原简历图片资产（头像 / 项目插画 / 证书）
index.html            ← 入口
js/rotate.js          ← 轮换逻辑：按当天日期选择主题
js/render.js          ← 渲染器：把 JSON 渲染成通用 HTML
base.css              ← 布局骨架（与主题无关）
themes/               ← 八套主题（只改 CSS 换皮）
```

- **数据与样式分离**：八套主题共用同一份 `resume.json`，内容改一处全生效。
- **前端按日期轮换**：`dayNumber % 主题数` 决定当天主题，访问者凌晨 0 点后看到的就是当天那套。零定时任务、零服务端，GitHub Pages 一次部署永久生效。
- **调试预览**：本地打开 `index.html?theme=illustrated` 可强制指定主题。

## 八套主题

| 主题 | 风格 | 特点 |
|------|------|------|
| minimal-light | 极简留白 | 黑白灰、细线、印刷品感 |
| neon-cyberpunk | 暗夜科技 | 单一强调色、细边框（对齐 Vercel/Linear） |
| retro-terminal | 复古终端 | 绿字黑底 CRT |
| illustrated | 彩绘手绘 | 暖纸底、楷体、手绘边框、蜡笔色，用原插画 |
| magazine | 杂志编辑 | 衬线大标题、报头双线、杂志红 |
| academic | 学术论文 | LaTeX 式排版、编号、黑白灰 |
| glassmorphism | 玻璃拟态 | 浅色柔和底 + 克制毛玻璃 |
| swiss | 瑞士国际 | 网格、Helvetica、红色块、大编号 |

## 新增主题

1. 建 `themes/你的主题/style.css`（选择器全部以 `html[data-theme="你的主题"]` 开头）。
2. 在 `js/rotate.js` 的 `THEMES` 数组里加一行 `{ id, name }`。

轮换自动覆盖新主题数量，无需改其他代码。

## 部署到 shenge-work.github.io

1. 把本目录所有文件推到 `shenge-work/shenge-work.github.io` 仓库 main 分支。
2. GitHub Pages 会自动发布，几分钟后访问 https://shenge-work.github.io/ 生效。

推送时如遇 HTTP2 报错，加参数：`git -c http.version=HTTP/1.1 push origin main`。

## 本地预览

```bash
cd 本目录
python3 -m http.server 8899
# 打开 http://127.0.0.1:8899/
```
