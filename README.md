# 陈培胜 · 求职作品集（CHEN PEISHENG Portfolio）

AI 全栈工程师求职个人网站：基于纯原生 HTML / CSS / JavaScript 构建，无任何第三方依赖，通过 **GitHub Pages** 免费托管。包含作品集主页与在线简历页，全面展示个人优势、工作经历、项目作品、专业技能与联系方式。

**在线访问**
- 作品集主页：https://shenge-work.github.io/
- 在线简历：https://shenge-work.github.io/resume.html

## 页面结构

### 作品集主页（index.html）
单页作品集，涵盖 8 大板块：
| 板块 | 说明 |
|---|---|
| 关于我 ABOUT | 个人形象照 + 自我介绍 |
| 求职意向 TARGET | 目标岗位与期望 |
| 教育经历 EDUCATION | 全日制统招本科（中山大学新华学院 · 软件工程） |
| 工作经历 EXPERIENCE | 进门财经 / Lessie / 房极客 / 丰速 / 周生生 |
| 项目作品 WORKS | comein.cn / lessie.cn / hicreator.ai 等作品展示 |
| 专业技能 SKILLS | 技能条可视化 |
| 获奖证书 AWARDS | 证书图片展示 |
| 联系方式 CONTACT | 电话 / 邮箱 / GitHub 直达 |

### 在线简历（resume.html）
单页 ATS 友好简历，主要区块：
- **个人优势**：全栈复合背景、0→1 系统建设能力、Agent 工程化专精
- **工作经历**：进门财经（AI 投研工作台）、Lessie（AI 人脉搜索引擎）、房极客（房地产 SaaS）、丰速（电商 SaaS）、周生生（CRM 平台）
- **项目经历**：comein.cn AI 投研工作台、lessie.cn AI 人脉搜索引擎、hicreator.ai 海外红人营销 SaaS（项目标题可点击直达官网）
- **专业技能**：Agent/Harness、AI 驱动编程、数据与中间件、后端、前端、DevOps 六大分类（掌握层级两行式，ATS 友好）
- **教育经历**：含学信网学历在线验证码区块 + 二维码扫码核验（有效期至 2027-04-29）

## 功能特性

页面交互由 `js/main.js` 实现，共 9 大模块：
1. **移动端菜单**：汉堡菜单折叠导航，适配小屏
2. **导航高亮**：滚动时自动高亮当前所在板块
3. **滚动进场动画**：元素进入视口时渐进浮现
4. **数字滚动动画**：量化指标（如 10W+ 日活、70% 转化提升）数字滚动呈现
5. **技能条填充**：专业技能水平条动画
6. **项目详情数据**：作品卡片数据驱动渲染
7. **项目模态框**：点击作品弹出详情（多尺寸适配）
8. **Toast 提示**：简历下载等操作轻提示
9. **全站访问计数器**：右下角复古里程表样式，显示全站真实访问次数（默认走免费计数服务，后端不可用时回退本机计数，不会显示 0）

简历页附加能力：
- 一键「保存为 PDF」：调用浏览器打印，米白纸感样式与屏幕一致
- 「打印 PDF（黑白）」：黑白省墨模式，纯黑两色输出，纸质打印兼容
- 打印样式与屏幕显示保持一致的粗边框 + 偏移阴影设计

## 设计风格

- **Neo-brutalism 粗野主义纸感设计**：米白纸底（#F3EEE2）、卡片（#FFFCF4）、粗黑描边（4px）、硬偏移阴影（6px/10px offset）
- **主题色**：活力橙 #FF5A1E、科技蓝 #2B4BE0、辅助绿 #1FA658
- **字体**：Space Mono（等宽技术感标题）+ Noto Sans SC（中文正文）
- **响应式**：768px 断点起多尺寸适配（姓名 clamp 字号、模态框 94vh、导航折叠），桌面 / 平板 / 手机全场景可用

## 技术栈

- **纯原生 HTML5 / CSS3 / JavaScript（ES5 兼容）**，页面本身零框架、零构建工具
- 静态文件直出，GitHub Pages 自动部署，加载快、无服务器成本
- 统计 / 计数脚本按需加载：ID 未配置或后端不可达时不发请求，不影响页面
- favicon 双尺寸适配（favicon.png / favicon-64.png）

## 目录结构

```
├── index.html              # 作品集主页
├── resume.html             # 在线简历页
├── 本地预览.command         # 双击生成快照并起本地预览
├── css/style.css           # 设计系统 + 响应式 + 打印模式
├── js/
│   ├── main.js             # 页面交互（9 大功能模块）+ 数据渲染
│   ├── analytics.js        # 埋点统一入口（Umami / Clarity，未填 ID 不发请求）
│   └── visitor-count.js    # 全站访问计数（abacus / 自建 Worker 可切换）
├── data/
│   ├── site-data.json      # 唯一编辑源：全部文案、项目、证书、联系方式
│   └── site-data.js        # 自动生成的 window.SITE_DATA 快照（勿手改）
├── images/                 # 形象照 / 项目图 / 证书 / 学信网二维码
├── scripts/sync_site_data.py        # JSON → JS 快照，支持 --check
├── docs/observability-and-cms.md    # 教程：统计与内容管理接入
├── worker/                 # 可选：自建 Cloudflare Worker 访客计数
├── .pages.yml              # Pages CMS 配置
├── .github/workflows/sync-site-data.yml  # JSON 变更后自动重建快照
└── favicon.png / favicon-64.png
```

## 数据驱动

站内所有文案、项目、证书、联系方式都集中在 `data/site-data.json` 一个文件里，改它即可，不用动 HTML：

- **线上**：`js/main.js` 用 `fetch('data/site-data.json?v=<时间戳>')` 读取，时间戳用于绕过 CDN 缓存
- **本地双击预览**：`file://` 下 `fetch` 不可用，自动回退到 `data/site-data.js` 快照
- **快照维护**：`python3 scripts/sync_site_data.py` 手动重建，或由 GitHub Actions 在 JSON 变更后自动重建

## 本地预览与部署

**本地预览**
```bash
# 方式一：直接双击 index.html 用浏览器打开
# 方式二：启动本地静态服务器
python3 -m http.server 8000
# 访问 http://localhost:8000
```

**GitHub Pages 部署**（本仓库已启用）
1. 将代码推送到 GitHub 仓库
2. 仓库 `Settings → Pages → Source: Deploy from a branch`
3. 选择 `main` 分支、`/ (root)` 目录，保存即自动上线

## 可观测统计与内容管理

站点保持纯静态，统计与内容管理全部走免费服务，**不需要自建后端、不需要服务器**：

| 能力 | 服务 | 免费额度 | 配置位置 |
|---|---|---|---|
| 访问统计（PV/UV/来源/事件） | Umami Cloud | 10 万事件/月、1 站点、6 个月留存 | `js/analytics.js` → `umamiWebsiteId` |
| 行为观测（录屏/热图） | Microsoft Clarity | 不限流量 | `js/analytics.js` → `clarityProjectId` |
| 内容管理（网页改文案） | Pages CMS | 免费（GitHub App 直连） | `.pages.yml` |
| 数据同步（JSON→快照） | GitHub Actions | 公开仓库免费 | `.github/workflows/sync-site-data.yml` |
| 全站访问计数 | abacus（默认）/ Cloudflare Worker + KV（可选） | 免费 | `js/visitor-count.js` → `CONFIG` |

接入只需填 ID：`js/analytics.js` 顶部 `CONFIG` 留空 = 不加载、不发任何请求。

**教程入口**
- 完整接入教程（注册 → 拿 ID → 填配置 → 验证 → 排障）：[docs/observability-and-cms.md](docs/observability-and-cms.md)
- 只想快速跑通：看教程开头的「5 分钟最快路径」
- 教程里的账号授权步骤**必须本人操作**（第三方登录与 GitHub App 授权弹窗无法代办）

## 作者

**陈培胜** · AI 全栈工程师 · 广东深圳

- GitHub：https://github.com/shenge-work
- 作品集：https://shenge-work.github.io
- 邮箱：shenge.work@gmail.com
