# 更新日志（CHANGELOG）

本仓库按日期记录变更（未打语义化版本 tag）。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)；
更早的历史见 `git log`。

## 2026-11-28

### 变更
- **LCP 收尾：首屏头像不再被 CDN 改写**（`js/asset-cdn.js`）。`rewriteDOM()` 会用
  `setAttribute` 把页面静态 `img[src]` 逐个换成 COS 地址，绕过 `main.js` 里 `artKey()` 的
  「同一张图不重复替换」判断，首屏头像因此又跨域拉了一次 264 KB 原图并重绘。现对
  `#idcardPhoto` / `#aboutPhoto` 跳过改写（头像已压到 38 KB，同源直取更快）；
  其余静态资源照旧走 CDN。
- **首屏英雄区去掉 `.reveal` 渐入**（`src/pages/index.astro`、旧链 `index.html`）。
  `hero-*` 文本与 `hero-right` 档案卡初始 `opacity: 0`，要等 `main.js` 的 IntersectionObserver
  加 `.in` 再走 0.6s transition，等于把首屏可见时间绑定到 JS 水合之后，Lighthouse LCP 的
  `elementRenderDelay` 长期 1.5s+。首屏本就在视口内，直接去掉该类；滚动区渐入保留。
  线上 mobile LCP 从 7.8–8.0s 降到 **2.6–3.9s（score 71–84）**，达到 T25 的 < 5s 验收线。
- **中文字体本地化（T25，性能主优化项）**：不再向 `fonts.googleapis.com` / `fonts.gstatic.com`
  取 Noto Sans SC。中间试过「镜像 Google 的 101 个 unicode-range 分片」，线上 Lighthouse 证明
  首屏仍要下 25 片 / 1.2 MB（LCP 22.7s→13.0s，不达标），改为**按站点实际用字做单文件子集**：
  `NotoSansSC[wght].ttf` 经 `pyftsubset` 出 `fonts/noto-sans-sc-subset.woff2`（503 KB，
  保留 wght 100–900 变体轴，覆盖 1872 个码位），每页 `preload` + 一个 `@font-face`，
  **每页字体请求 1 个**；不在子集里的生僻符号回退系统字体（这些字形 Google 版同样没有）。
  四处 Astro 页 + `SiteShell` + 五份旧链 HTML + 简历/邮件模板全部改指本地；
  `scripts/pages-build.sh` 白名单与硬校验同步；新增 `scripts/build-noto-subset.py`
  （`--check` 校验覆盖）。dist 57 MB → 53 MB。细节见 [docs/TODO.md §3.21](docs/TODO.md)。
- **修复构建阻断（`pages-build.sh`）**：混排日志 `"… $src（替代旧产物）"` 中变量名紧跟全角「（」，
  bash 视为变量名一部分，`set -u` 下报 `src…: unbound variable` 使整站构建失败；改为 `${src}`。
- **空数据板块自动隐藏（fork 兼容）**：主页各板块改用统一判定 `src/lib/section-visibility.ts`——
  数组非空还不够，空对象数组也算无数据，整节连同导航一起收起、编号自动重排；构建期
  `index.astro` 与运行时 `main.js` 同口径。三个重点：个人作品 `works` 无数据隐藏整节；
  GitHub 贡献热力图在 `total=0` / 无 `days` / 无 `username` 时整块不展示，**不再回退到
  原作者 GitHub 地址**；页脚推荐人名单为空时整节隐藏。
- `work/portfolio.html` 案例页在缺 `detailId=portfolio` 作品或 `work-details.json` 条目时
  渲染空状态页，不再 `throw` 阻断 fork 后的全站构建。
- `index.html`（旧链）works 板块默认 hidden、滚动布局计算后移到可见性判定之后，避免
  hidden 状态下量出 0 宽度。
- **主页顶部导航移除博客索引**：`index.html` 与 `src/pages/index.astro` 删除第 11 项外链「博客」，
  导航现为关于我 01 … 留言墙 10、无断档；同步更新 E2E 编号断言与 `main.js` 注释。
  博客地址仍保留在 JSON-LD `sameAs` 和联系方式卡片中，仅不再占据顶部导航。
- **Fork 复刻补齐**：新增 [docs/fork-cloud-parity.md](docs/fork-cloud-parity.md)，明确本地云函数代码
  备份范围、6 处必改云端资源 ID、KV/Vectorize 创建命令、数据统计边界与自检清单；
  `.env.example` 补 `DELIVER_FROM` 与四类发件身份说明，README Fork 指南同步补齐。
- **首屏渲染优化（局部渲染）**：三层落地——
  ① 视口隔离：屏外 `.section` 加 `content-visibility:auto` + `contain-intrinsic-size`（works 因宽度测量
  排除、`:target` 锚点强制渲染兜底）；
  ② 公司档案脚本按需加载：新增 `js/company-lazy.js`（<2KB），5 个脚本共 271KB 改由「滚到工作经历 /
  hover 徽章 / `#company=` 深链 / 点击兜底」触发，首屏本地脚本由 **551KB 降到 284KB（-48%）**；
  ③ 图片懒加载：LCP 形象照改 `fetchpriority=high`、其余视口外图片加 `loading=lazy` + `decoding=async`。
  新增 `tests/company-lazy.test.mjs` 7 项；`secure-access.test.mjs` 适配加载器接线方式。
- **远程数据视口预取**：`js/main.js` 新增 `whenNearViewport()`，留言墙 `/api/wall`（D1 查询）与
  贡献图 `data/contributions.json` 由首屏发起改为滚到前 600px 才请求；无 IO / 首屏可见降级立即执行，
  留言墙先渲染 loading 骨架避免锚点直跳空白。新增 `tests/viewport-lazy.test.mjs` 4 项。
  评估后**未做** `renderSite()` 按视口分批（SSG 已直出、TBT 仅 200ms、观察器/宽度测量/编号依赖全量渲染）。
- **线上性能实测**：`shenge-work.pages.dev` 主页 Lighthouse mobile 实测 **62 分**（FCP 2.9s / LCP 6.9s /
  CLS 0.001），对比 pre-react 基线 55 分（FCP 22.2s / LCP 25.3s）。  观测数据记入 `tests/e2e/baseline/lighthouse/summary.json` 的 `observations` 数组，
  诊断与口径见 [docs/rendering-performance.md](docs/rendering-performance.md)。
- README 标题由「陈培胜 · AI Agent 工程师求职作品集」改为「求职作品集」。
- **公司档案抽屉头部滚动收缩**（移动端）：抽屉里 `.cp-head` 是 sticky，390px 宽下完整态约 648px，
  滚动时冻结近九成视口、正文只剩约 92px 可见。`js/company-profile.js` 在 `.cp-panel-scroll`
  上挂 passive + rAF 节流的滚动监听，滚过阈值给头部加 `is-condensed`：折叠高管轮播 / 一句话 /
  标签 / 附属信息行，只留 logo + 公司名 + 行业，头部回落到约 140px、正文可见区升到约 81%。
  用**滞回**（进入 130px / 退出 24px）避免「收缩→内容变短→scrollTop 被夹回→展开」的抖动；
  `open()` 重开时重置状态。CSS 规则限定 `.cp-drawer` 祖先 + `max-width:720px`，
  独立档案页与桌面档不受影响。新增 `tests/company-head-shrink.test.mjs` 5 项。

### 修复
- **AI 指路小票文案重复**（BUG-01 / TODO T35）：`js/ai-stage-link.js` 前缀由「▶ 去看看」改为「▶ 指路」，
  避免与 ROUTES 的 `name` 开头「去…」叠加成「去看看去看联系方式」；6 条路由全部生效，
  仅文案观感、不影响跳转。同步更新相关注释与验收报告。

## 2026-11-27

### 修复
- **AI 数字分身问答恢复**：补齐 Pages production 的 `KB_WORKER_URL` / `KB_TOKEN` secret，重新对齐
  `resume-kb-api` Worker 的 `KB_TOKEN` 并部署最新代码；`chenpeisheng.cn` 与 `shenge-work.pages.dev`
  实测问答由模型生成，`degraded:false`。
- `/api/chat` 新增本地摘录兜底：生成链路再故障时直接从命中切片作答（联系方式直答），
  不再向访客显示「模型服务不可用」等内部术语；响应新增 `answerSource` 字段。

### 修复
- **分享弹窗贴合卡片**：弹窗宽度改由 iframe 回报的卡片实际宽度动态决定（目标 520px），
  消除卡片右侧大片空白；竖版/方形切换宽度不跳变，并 bump 静态资源版本破缓存。

### 变更
- **后台登录态保留 30 天**：`pa_sess` 的 `TTL` 由 12 小时改为 30 天（cookie `Max-Age=2592000`
  与签名 `exp` 同步），邮箱验证码 / 微信 / GitHub / 小程序 / 应急口令全部复用；
  登录页增加「30 天内免重复验证」提示。

## 2026-11-26

### 新增
- **前端架构迁移完成并切换生产**：Astro 6.4 + React 19 + TypeScript strict 渐进迁移 M0–M4
  （方案、验收数据与里程碑台账见 [docs/react-refactor-plan.md](docs/react-refactor-plan.md)），
  `scripts/pages-build.sh` 默认混排清单收编全部已迁移页（portfolio / admin / login / jd / company /
  school / 404 / index / resume），线上 `chenpeisheng.cn` 走 React 版产物；
  `REACT_MIGRATED_PAGES=none` 环境变量保留为一键回退全旧版的开关。
- **迁移验收链**：Playwright E2E 五套（M1 admin 24 / M2 独立页 63 / M3-A 主页 26 / M3-B AI 面板
  24 / M4 resume 18，合计 155 项）+ 视觉对比（四主题 × 390/680/1024 像素级口径 12/12）+
  resume 单源等价（构建产物与旧链生成物逐字 diff = 0）+ 既有 node:test 289/289 与内容漂移链 9 项全绿。
- **N5 性能验收（Lighthouse 对照 M0 基线）**：index.mobile 中位数 61 ≥ 基线 55（LCP 25.3s → ~20s）；
  TBT 全线改善（company.desktop 420ms → 10–20ms，水合移出关键路径）；以逐字一致的 resume 页
  波动为噪声带参照，未发现可复现回归；产物存 `tests/e2e/baseline/lighthouse-post-react/`。
- **渐进迁移基建**：`src/`（pages / features / components / lib，zod 契约 + API client 收编
  `window.CP_*` 全局）+ dev-api-server（27 admin 路由 + 静态映射）+ 基线采集（Lighthouse 8 份
  入 `tests/e2e/baseline/`）。

### 变更
- 旧版根 HTML（index/jd/company/school/404/resume 壳）保留在工作区作为回退与 `file://` 预览层；
  `js/main.js` 第 11 节（AI 面板）由 `CP_AI_REACT` 守卫短路，`js/jd-match.js` 在新版不再底载。
- AI 面板（M3-B）：FAB 岛外静态直出 + document 事件委托；面板 aside 单根岛 `client:idle`；
  `ai-head` 用危险容器保住外围脚本（ai-voice / ai-panel-ux）水合前窗口期注入的按钮。
- resume（M4）：`render_resume.mjs` 参数化（`renderWithTemplate`），Astro 构建期复用同一
  `render()`；`functions/lib/resume-render.js`（AUTO-GENERATED）随之重嵌入，云端 variant 行为不变。

### 文档
- README 架构叙事改写（「零框架」→「Astro 6 + React 19 SSG + 岛屿」）；本条目记录迁移里程碑。

## 2026-11-25

### 新增
- **管理后台并入主站**：`/admin` 控制台 + `/login` 免密登录（邮箱验证码 / 微信扫码 / 公众号授权），
  `functions/_middleware.js` 全路由守卫，接口层另有 `requireAdmin`。
- **后台能力**：概览统计、设备台账、留言审核与回复（含「待回复」筛选）、问答看板（空召回率 / 高频问题聚类）、
  站点数据编辑器、主题与音色配置、提示词配置、CSV 导出（防公式注入）。
- **AI 语音**：音色切换与试听、打招呼文案统一由后台配置（面板 / 语音 / 试听联动）。
- **小程序扫码登录**（可选开关，个人主体可用）：`miniprogram/` + `/api/admin/auth/mini/*`。
- **简历自动投递**：发送前真实预览（`/api/deliver-preview`）、附件重命名排序与 ZIP 打包、PDF 档案速览。
- **学历核验**：设备绑定 + 24 小时授权过期 + 邮件审批页。
- **数据上云**：真人数据迁到 D1 `site_content`，公开仓库只保留脱敏副本；`/data/*` 动态路由 + 兜底副本。

### 变更
- 品牌标识 CP → PS，`CP.ME` → `AI.ME`；简历页合并 PDF 按钮、统一打印样式。
- 公司档案：高管轮播、360° 全景、长板块折叠、浏览量 / 点赞 / 评论。
- 页脚 GitHub 贡献热力图改为 API 数据渲染，并与贪吃蛇动效共存。
- 主页「求职意向」板块移到获奖证书与联系方式之间，顶部导航顺序同步。
- 房极客经历技术栈补 RocketMQ / MongoDB；Spring Boot 标注改为 Spring Cloud / Boot。
- 经历动词措辞统一（主导 / 负责 → 研发），「AI 进宝」标注移至岗位后；主页 / 简历 / PDF 三处同步。
- 云端 D1 `site_content` 同步上述经历文案，并手动重建知识库切片与向量（42 切片 / 1610 词 / 42 向量）。

### 文档
- 按开源仓库规范整理 README / `docs/`：校正测试文件数（26）、补齐各文档「状态 + 核对日期」头、
  统一待办台账到 TODO.md（新增 T24 迭代池）、修复表格列数与标题锚点、清理 AI 生成标记与过期方案描述。

## 2026-11-23

### 新增
- 留言板支持**站长回复与访客追问**（`wall_replies` 对话层，邮件直达 `?focus=<id>`）。
- 学校档案独立页 `school.html`；页脚「推荐的人」板块。

### 变更
- 统一域名到 `chenpeisheng.cn`（canonical / OG / 分享卡二维码 / 联系文案）。
- 停用按日期的主题轮换，默认固定橙色 ARCHIVE；手动切换仍可锁定。
- 构建产物补齐 `robots.txt` 与 `sitemap.xml`。

## 2026-11-19 ~ 11-21

### 新增
- **D1 迁移**：访问计数 `/api/visits`、留言墙从 Workers KV 迁到 D1（`portfolio-db`），
  免费写额度从 1,000/天 提升到 100,000 行/天。
- **Turnstile 人机校验**：通过走正常额度，未通过降到严格档；脚本被墙不影响留言。
- **D1 备份脚本** `scripts/backup-d1.sh`（本机 SQL 快照，保留 10 份）。
- 可观测双路：Cloudflare Web Analytics 与 Umami 并行。

### 修复
- `pages.dev` 因 `assets/character-views/` 中 27.5MiB 文件超过 Pages 25MiB 上限，连续构建失败；
  归档原始素材到飞书云盘并移出仓库，构建恢复。
- 角色皮肤收敛为 `self3d`（后续补 `female3d`），删除多余皮肤与换肤入口。

## 2026-11-17 ~ 11-18

### 新增
- **岗位匹配 JD MATCH**：`jd.html` + 助手面板内模式，需求拆条 → 逐条证据召回 → 覆盖/部分/缺口 + 追问点。
- 后台之前的临时管理页、`chat_logs` 落库与限流两级计数完善。

## 2026-11-07 ~ 11-11

### 新增
- **AI 数字分身**（v1）：腾讯云 CloudBase 云函数 + TF-IDF 检索 + 受约束生成；CORS 白名单、限流、
  脱敏日志、纯检索降级。
- **3D 角色皮肤系统**：`<model-viewer>` + GLB 骨骼动画，状态与问答面板联动。
- 分享卡、主题系统、访问计数、打印预览等展示层能力。

## 更早

2026-09 ~ 2026-10：作品集主页与在线简历从零搭建（原生 HTML/CSS/JS、Neo-brutalism 视觉、
数据驱动渲染、GitHub Pages 上线）。

> AI生成
