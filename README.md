# 陈培胜 · AI Agent 工程师求职作品集

![在线站点](https://img.shields.io/badge/在线-chenpeisheng.cn-FF5A1E?style=flat-square)
![前端](https://img.shields.io/badge/前端-Astro%206%20%2B%20React%2019-BC52EE?style=flat-square&logo=astro)
![Cloudflare Pages](https://img.shields.io/badge/Deploy-Cloudflare%20Pages-F38020?style=flat-square&logo=cloudflare&logoColor=white)
![Node](https://img.shields.io/badge/Node.js-22-339933?style=flat-square&logo=node.js&logoColor=white)
![CI](https://img.shields.io/badge/CI-tests%20%7C%20content%20build%20%7C%20RAG-2B4BE0?style=flat-square&logo=githubactions&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-1FA658?style=flat-square)

> 一个 **Astro 6 + React 19 SSG** 的静态求职站，长出了一套跑在边缘上的后端：  
> Cloudflare Pages Functions + D1 + Vectorize + Workers AI，外加腾讯云 TTS。  
> 展示内容以仓库 `data/site-data.json` 为脱敏生成源；线上真人数据存放于 D1 `site_content`（见[数据与内容模型](#数据与内容模型)分层）。

- **线上站点**：<https://chenpeisheng.cn/> · [在线简历](https://chenpeisheng.cn/resume.html) · [JD 岗位匹配](https://chenpeisheng.cn/jd.html)
- **备用线路**：<https://shenge-work.pages.dev/>（同一套构建产物）
- **管理后台**：<https://chenpeisheng.cn/admin>（免密登录，见 [交互与后台](#交互与后台)）

---

## 目录

- [这个项目是什么](#这个项目是什么)
- [功能一览](#功能一览)
- [系统架构](#系统架构)
- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [配置项](#配置项)
- [数据与内容模型](#数据与内容模型)
- [构建与部署](#构建与部署)
- [目录结构](#目录结构)
- [测试与 CI](#测试与-ci)
- [Fork 复刻指南](#fork-复刻指南)
- [文档索引](#文档索引)
- [贡献](#贡献)
- [许可与内容版权](#许可与内容版权)
- [作者](#作者)

---

## 这个项目是什么

一个**真实在用**的求职作品集，也是一次「把静态站做成产品」的工程练习：

| 维度 | 做法                                                                     |
| -- | ---------------------------------------------------------------------- |
| 前端 | **Astro 6 SSG + React 19 岛屿**（2026-11 完成渐进迁移，方案与验收台账见 [docs/react-refactor-plan.md](docs/react-refactor-plan.md)）：SSG 直出 + 局部水合，CSS/类名体系沿用资产不重写 |
| 后端 | Cloudflare Pages Functions（`functions/`）承载全部 `/api/*`，无独立服务器           |
| 数据 | 仓库 `data/site-data.json` 为脱敏生成副本；线上真人数据存 D1 `site_content`，两者字段结构一致  |
| AI | 混合检索（D1 FTS5 BM25 + Vectorize 向量，RRF 融合）→ 受约束生成；关键词兜底不断线               |
| 部署 | `git push` → Cloudflare Pages 自动构建；`scripts/pages-build.sh` 产出 `dist/`（React 页混排清单内嵌在脚本里） |
| 质量 | 4 条 GitHub Actions + 29 个 `node:test` 测试文件 + Playwright E2E 五套（155 项）+ 内容漂移闸门（生成物必须与数据逐字一致）        |

**它不只是简历页面。** 除展示外还包括：AI 数字分身问答、JD 岗位匹配、AI 语音播报、3D 桌宠、按设备隔离的留言板、简历自动投递（含 PDF/证书附件与发送前预览）、学历核验加锁审批、公司/学校档案页、访问统计与管理后台。

**它也不是通用建站模板。** 内容、域名、后台登录、邮件发信都绑定在作者本人的账号体系上；想复刻请按 [Fork 复刻指南](#fork-复刻指南) 换成你自己的资源。

## 功能一览

### 展示层

- **主页** `index.html`：Hero + 10 个板块（关于我 / 工作经历 / 项目作品 / 个人作品 / 专业技能 / 教育经历 / 获奖证书 / 求职意向 / 联系方式 / 留言板），数据驱动渲染。
- **在线简历** `resume.html`：ATS 友好的 A4 两页版式，由数据生成；支持浏览器打印、黑白省墨打印、打印效果预览，以及页内「自动投递」。
- **独立页**：`jd.html`（岗位匹配）、`company.html?c=<id>`（公司档案抽屉，含高管轮播与 360° 全景）、`school.html`（学校档案，验证码默认加锁）、`work/*.html`（作品案例页）。
- **视觉系统**：Neo-brutalism 纸感设计（米白 `#F3EEE2` / 卡片 `#FFFCF4` / 4px 描边 / 硬偏移阴影），四套配色主题，桌面与移动端自适应。
- **分享卡**：竖版 / 方形宣传图预览与下载；资源支持一键 CDN 重写（`js/asset-cdn.js` + `data/asset-map.js`）。

### AI 能力

| 能力     | 入口                      | 实现                                                                     |
| ------ | ----------------------- | ---------------------------------------------------------------------- |
| 数字分身问答 | 右下角 3D 角色 → 面板          | `POST /api/chat`：混合检索 → 受约束提示词 → Worker `resume-kb-api`（llama-3.3-70b） |
| 岗位匹配   | `jd.html` / 助手面板「JD 匹配」 | `POST /api/jd`：JD 拆条 → 逐条字面覆盖核算（不靠模型打分）→ 覆盖/部分/缺口 + 证据 + 追问点           |
| 语音播报   | 面板喇叭按钮                  | 浏览器 `SpeechSynthesis` 优先；云端 TTS（`/api/chat` mode=tts）探测成功才切，失败无感回落     |
| 3D 桌宠  | 右下角常驻                   | `<model-viewer>` + 本地 GLB（个人形象 / 温柔形象，后台展示套装联动头像与音色）                 |

### 交互与后台

- **留言板**（SEC.10）：按设备隔离的私密留言本，设备 ID → HMAC 哈希落库；站长可在后台回复，访客可追问；Turnstile 人机校验，未通过自动降到严格额度档。
- **自动投递**：`/api/deliver` + `/api/challenge`（一次性凭证 + PoW），发送前可真实预览邮件；附件支持 PDF 简历与证书 ZIP。
- **学历核验**：学校档案默认加锁，访客提交申请 → 邮件审批 → 签名链接限时解锁。
- **公司档案互动**：`/api/company-social` 记录浏览量、点赞、评论回复。
- **全站计数**：`/api/visits`（D1）驱动顶栏复古里程表。
- **管理后台** `/admin`：概览统计、设备台账、留言审核与回复、问答看板（空召回率 / 高频问题聚类）、站点数据编辑、知识库状态与一键重建、主题与音色配置、提示词配置、CSV 导出。
- **登录** `/login`：无密码。邮箱验证码（白名单）或微信扫码 / 公众号授权；小程序扫码为可选开关。

## 系统架构

```text
                         ┌──────────────────────────────────────────┐
   浏览器 ── 静态资源 ──▶ │ Cloudflare Pages（chenpeisheng.cn）      │
      │                  │  HTML / CSS / JS / 图片 / GLB / 字体     │
      │                  └──────────────────────────────────────────┘
      │
      └── /api/* ──▶ Cloudflare Pages Functions（functions/）
                       ├─ /api/chat  /api/kb  /api/jd
                       │     ├─ D1 FTS5（BM25，中文 bigram）
                       │     ├─ Vectorize（bge-m3 1024 维）
                       │     ├─ RRF 融合 + 业务加权
                       │     └─ Worker resume-kb-api（bge-m3 + llama-3.3-70b）
                       ├─ /api/wall  /api/visits  /api/company-social ── D1
                       ├─ /api/deliver  /api/challenge  /api/verify-access ── Resend + D1
                       ├─ /api/secure-asset ── 私密材料签名取流（私有 KV / COS，5 分钟短链）
                       └─ /api/admin/** ── admin_config / wall_* / qa_logs
                                 │
                      腾讯云 CloudBase 云函数（functions/tencent/）
                        └─ TTS 合成（mode=tts）与问答兜底通道
```

**为什么这么拆**

- **检索放服务端**：查询向量化需要密钥，放前端等于公开 Key；边缘函数离用户近，省一次国内跨网 RTT。
- **两路召回而非纯向量**：`k8s` / `FTS5` 这类专有名词靠词面更稳，语义召回补同义表达，RRF 融合后仍可解释。
- **每条结论可回链**：切片 ID 直接用简历条目 ID（如 `exp-inmen-01`），回答里的「依据」能指回原文。
- **降级是设计的一部分**：模型超时 → 返回检索原文；Worker 不可达 → 关键词/TF-IDF 兜底；TTS 失败 → 浏览器语音；API 全挂 → 页面其余部分不受影响。

## 技术栈

| 层     | 选型                                                                                                        |
| ----- | --------------------------------------------------------------------------------------------------------- |
| 前端    | **Astro 6（SSG）+ React 19 岛屿**，TypeScript strict；外围交互脚本（3D 舞台 / 语音 / 公司档案）以桥接模式零改动共存；`<model-viewer>`、html2canvas 本地 vendor |
| 边缘    | Cloudflare Pages + Pages Functions（ES Module Worker 运行时）                                                  |
| 存储    | D1（SQLite）：`site_content` / `wall_*` / `kb_*` / `qa_logs` / `rate_limits` / `counters` 等；KV 仅存登录票据与少量兜底计数 |
| 检索    | D1 FTS5 + Vectorize（bge-m3）+ Workers AI；混合检索在 Worker `worker/kb/` 内完成                                     |
| 生成    | Worker `resume-kb-api` → `@cf/meta/llama-3.3-70b-instruct-fp8-fast`（受约束提示词，模型可在后台切换）                      |
| 语音    | 浏览器 SpeechSynthesis；云端 TTS 经 `/api/chat (mode=tts)` 转发腾讯云（TC3 签名，密钥只在云函数）                                 |
| 邮件    | Resend（验证码、留言通知、简历投递、核验审批）                                                                                |
| 生成链   | Node 22 脚本（渲染简历 / 案例页 / 分享卡 / 打印预览）+ Python 3（JSON→JS 快照、知识库）                                             |
| CI/CD | GitHub Actions（测试 / 内容漂移 / RAG 灌库 / 快照同步 / 贡献图）+ Cloudflare Pages 自动构建                                    |

## 快速开始

**环境要求**：Node.js 22+、Python 3.9+；可选 `wrangler`（`npx wrangler` 亦可）。

```bash
git clone https://github.com/shenge-work/shenge-work.github.io.git
cd shenge-work.github.io
```

**1）纯静态预览**（只能看页面，没有 `/api`）

```bash
python3 -m http.server 8000      # → http://127.0.0.1:8000/index.html
./本地预览.command                # macOS 双击：先同步 JSON 快照，再起 8765
```

**2）带接口的本地联调**（推荐）

```bash
node scripts/dev-api-server.mjs   # → http://127.0.0.1:8877/index.html
```

本地服务器用 `node:sqlite` 内存库模拟 D1、内存 Map 模拟 KV、拦截 Resend 发信（终端打印 `[mock resend]`），表结构直接读 `db/schema.sql`，因此测的是与线上同一套 SQL。

```bash
WALL_SEED=45 node scripts/dev-api-server.mjs      # 预置 45 条留言，验收分页
PORT=8878 TURNSTILE_SECRET=test node scripts/dev-api-server.mjs   # 严格限流档
```

**3）改内容后的生成与校验**

```bash
# 内容只改 data/site-data.json，然后重建生成物
node scripts/render_resume.mjs          # 简历 HTML
node scripts/render_work_details.mjs    # 作品案例页
python3 scripts/sync_site_data.py       # data/site-data.js 快照

# 校验（CI 同款闸门）
node scripts/validate_content.mjs
node scripts/render_resume.mjs --check
node scripts/render_work_details.mjs --check
python3 scripts/sync_site_data.py --check
```

**4）跑测试 / 构建产物**

```bash
node --test tests/*.test.mjs     # 29 个测试文件，零外部依赖
bash scripts/pages-build.sh      # 产出 dist/，缺文件或超 25MiB 会直接失败
```

## 配置项

完整变量名与注释见 [`.env.example`](.env.example) 与 [`wrangler.toml`](wrangler.toml) 顶部；线上在  
Cloudflare Pages → Settings → Variables and Secrets 配置（Secret 类型加密存储）。

**必填**

| 变量                         | 作用                           |
| -------------------------- | ---------------------------- |
| `ADMIN_SESSION_SECRET`     | 后台会话签名盐（32 字节以上）             |
| `ADMIN_EMAILS`             | 允许登录后台的邮箱，逗号分隔               |
| `DEVICE_HASH_PEPPER`       | 设备指纹 HMAC 盐（留言板 / 点赞 / 核验共用） |
| `VERIFY_ACCESS_SECRET`     | 学历核验审批链接签名                   |
| `DELIVER_CHALLENGE_SECRET` | 投递凭证签名                       |

**常用可选**

`RESEND_API_KEY` / `RESEND_FROM`（邮件）、`TURNSTILE_SECRET`（人机校验）、`KB_WORKER_URL` + `KB_TOKEN`（语义检索）、`ALLOWED_ORIGINS`、`MAIN_SITE_URL`、`TTS_ENDPOINT`、`WECHAT_*`（微信登录）、`WALL_ADMIN_TOKEN`（应急删除）。

**资源绑定**（不是环境变量，需在控制台创建）

**Pages 项目**

| 绑定        | 资源                | 用途                   |
| --------- | ----------------- | -------------------- |
| `DB`      | D1 `portfolio-db` | 全部业务数据、RAG 词面索引、后台配置 |
| `SITE_KV` | KV `site-kv`      | 登录票据、少量兜底计数          |

**语义层 Worker**（`worker/kb/`，名字 `resume-kb-api`）

| 绑定          | 资源                    | 用途                               |
| ----------- | --------------------- | -------------------------------- |
| `AI`        | Workers AI            | 查询向量化（`@cf/baai/bge-m3`）与重排      |
| `VECTORIZE` | Vectorize `resume-kb` | 语义向量索引（1024 维）                   |
| `DB`        | D1 `portfolio-db`     | `/rebuild` 从 `site_content` 重建切片 |

> `AI` 与 `VECTORIZE` 放在 Worker 而不是 Pages，是因为 Pages 的 `deployment_configs` 不支持这两类绑定；  
> 部署：`cd worker/kb && npx wrangler deploy`，再用 `npx wrangler secret put KB_TOKEN` 写入共享令牌。

> 密钥只放平台环境变量，仓库内不含任何真实密钥；本地用 `.dev.vars` / `.secrets.local`（均已 gitignore）。

## 数据与内容模型

**单一数据模型**：同一份 canonical JSON 决定简历与主页的全部文案；`resume.html`、`work/*.html`、`data/site-data.js` 都是生成物，**不要手改**——CI 会逐字比对，改错地方直接红。

```text
data/site-data.json（仓库脱敏副本）
        │
        ├─▶ scripts/render_resume.mjs ────▶ resume.html
        ├─▶ scripts/render_work_details.mjs ▶ work/*.html
        ├─▶ scripts/sync_site_data.py ────▶ data/site-data.js
        ├─▶ scripts/build_rag_chunks.mjs ─▶ .temp/rag 切片种子（本地排查 / 冷启动灌库）
        └─▶ scripts/redact-public-data.mjs ▶ 仓库脱敏副本（手机号 / 验证码占位）

线上知识库平时由 KB Worker `/rebuild` 直接读 D1 `site_content` 重建
（`kb_chunks` / `kb_fts` / Vectorize），不依赖本脚本与 CI。
```

**数据分层（2026-11-25 起）**

- 线上真人数据存放于 D1 `site_content`，由 `/data/<file>` 动态路由下发（`functions/data/[file].js`）。
- 仓库里的 `data/*.json` / `*.js` 是**脱敏副本**（手机号、学信网验证码已替换），供 CI、本地预览与冷启动兜底。
- 云端未配置某个 key 时，路由回退到构建产物里的 `dist/data/fallback/*`，保证不会白屏。

**改内容的正确姿势**

1. 本地：改 `data/site-data.json` → 跑生成脚本 → 跑 `--check` 校验；
2. 线上：进 `/admin` →「站点数据」直接编辑（写入 D1，最多 5 分钟生效，无需重新构建；保存后自动触发知识库重建）；
3. 批量：`node scripts/seed-site-content.mjs` 或 `bash scripts/db-init.sh remote`。
   > 直接 SQL / 种子脚本写 D1 **不会**触发知识库重建；写完需在后台点「重建知识库」，或带运维令牌 `POST /api/admin/kb`。

## 构建与部署

**主链路：push 即部署**

Cloudflare Pages 项目 `shenge-work` 已授权本仓库，`main` 分支 push 后自动构建：

| 配置项                    | 值                                                |
| ---------------------- | ------------------------------------------------ |
| Build command          | `bash scripts/pages-build.sh`                    |
| Build output directory | `dist`                                           |
| Root directory         | 仓库根（留空）                                          |
| 自定义域                   | `chenpeisheng.cn`（主）+ `shenge-work.pages.dev`（备） |

`functions/` 不进 `dist` 也会被 Pages 编译成 Functions；`scripts/pages-build.sh` 会收集根目录所有 HTML（排除 `_` 开头的本地探针）、复制静态资源、注入后台页面、剔除超限大文件，并在缺文件时**让构建失败**而不是静默上线一个 404 站点。

**兜底通道**（自动构建异常时）

```bash
./scripts/deploy-pages.sh                    # 按本地工作区直传，--dry-run 只看清单
./scripts/sync-pages-from-github.sh --force  # 拉远端 main 直传（幂等）
```

**数据库迁移**

新库直接用 `db/schema.sql`（含全部表）；旧库按 `db/migrations/` 的时间顺序补迁移。改完代码若涉及新表，先执行：

```bash
npx wrangler d1 execute portfolio-db --remote --file=db/migrations/<file>.sql
```

**旧线路：GitHub Pages**

仓库仍可由 GitHub Pages 从 `main` 根目录发布（`shenge-work.github.io`），但正式站已迁至 Cloudflare：

- GitHub Pages 没有 Functions，页面会自动把 `/api/*` 指向 `shenge-work.pages.dev`（见 `js/main.js` 的 `API_BASES`）；
- 仓库数据已脱敏，**不要**把 GitHub Pages 当作正式数据源。

细节与历史故障复盘见 [docs/cloudflare-pages-deploy.md](docs/cloudflare-pages-deploy.md)。

## 目录结构

```text
.
├── index.html / resume.html / jd.html / company.html / school.html / 404.html
├── css/                     # 设计系统、主题、各独立页样式、字体
├── js/                      # main.js（渲染与交互）、AI 面板/语音/皮肤、JD、档案、计数、埋点
├── data/                    # 脱敏源副本 + 资源映射 + 公司/学校/人物档案
├── images/ videos/ assets/  # 图片、访谈视频、3D 模型与打印预览、本地 vendor
├── functions/
│   ├── _middleware.js       # 全站边缘防护（爬虫、来源、安全响应头）
│   ├── api/                 # 公开接口：chat / kb / jd / wall / visits / deliver / verify-access …
│   ├── api/admin/           # 后台接口（登录、统计、留言、问答、配置、导出）
│   ├── lib/                 # 鉴权、检索、邮件、ZIP、内容渲染等纯函数
│   ├── data/[file].js       # /data/* 动态路由（D1 → 前端快照）
│   └── tencent/             # 腾讯云 CloudBase 云函数（TTS / 兜底问答）
├── admin/                   # 后台前端源码（构建到 dist/admin 与 dist/login）
├── db/                      # schema.sql + 增量迁移
├── miniprogram/             # 微信小程序扫码登录端
├── scripts/                 # 生成链、构建、部署、联调、备份、自检
├── templates/               # 简历与案例页模板
├── tests/                   # node:test 单测（29 个文件）
├── tools/ variants/ work/   # 桌宠制作脚本、简历变体、作品案例页
├── worker/
│   ├── kb/                  # 语义层 Worker resume-kb-api（embed / query / rerank / rebuild）
│   └── index.mjs            # 备用：独立 Worker 计数（需自有域名，当前未启用）
├── docs/                    # 设计文档与台账（索引见 docs/README.md）
├── .github/workflows/       # tests / content build / 快照 / 贡献图
├── .env.example  wrangler.toml  .pages.yml
└── 本地预览.command
```

> 本地还有若干 `_*.html` 调试探针（`.gitignore` 已排除），不属于站点产物。

## 测试与 CI

| Workflow                                                     | 触发                           | 作用                                |
| ------------------------------------------------------------ | ---------------------------- | --------------------------------- |
| [`test.yml`](.github/workflows/test.yml)                     | `functions/**`、`tests/**`、PR | 语法检查 + `node --test` + 兜底知识库/快照幂等 |
| [`content-build.yml`](.github/workflows/content-build.yml)   | 数据 / 模板 / 生成物变更              | 生成物与数据逐字一致、结构校验、两页预算              |
| [`sync-site-data.yml`](.github/workflows/sync-site-data.yml) | `site-data.json` 变更          | 重建 `data/site-data.js` 快照         |
| [`contributions.yml`](.github/workflows/contributions.yml)   | 定时                           | 更新页脚 GitHub 贡献热力图数据               |

本地等价命令：

```bash
node --test tests/*.test.mjs
node scripts/validate_content.mjs
node scripts/render_resume.mjs --check
node scripts/render_work_details.mjs --check
node scripts/build_rag_chunks.mjs --check
python3 scripts/sync_site_data.py --check
```

## Fork 复刻指南

这个仓库可以复刻，但**不能直接照搬上线**：域名、后台邮箱、Resend、微信登录、D1 都是作者本人的配置。建议按下面顺序替换。

1. **换内容**：把你的 7 份 JSON 按 `data/` 下同名文件准备好（结构见 `scripts/seed-site-content.mjs`）。
2. **换身份**：全局搜索并替换 `chenpeisheng.cn`、`hi@chenpeisheng.cn`、`shenge-work`，以及 `index.html` / `resume.html` 里的 canonical、OG 与 JSON-LD。
3. **建库**：`bash scripts/db-init.sh remote`（本地试跑去掉 `remote`），或 `npx wrangler d1 create` 后执行 `db/schema.sql`。
4. **建 Pages 项目**：构建命令 `bash scripts/pages-build.sh`，输出目录 `dist`；绑定 `DB` / `SITE_KV`（`AI` / `VECTORIZE` 绑在下面的 KB Worker 上，Pages 不支持这两类绑定）。
5. **部署知识库 Worker**：`cd worker/kb && npx wrangler deploy`，再 `npx wrangler secret put KB_TOKEN`；回到 Pages 配 `KB_WORKER_URL`（Worker 的地址）和同一个 `KB_TOKEN`。
6. **配环境变量**：照 [`.env.example`](.env.example)，至少填 `ADMIN_SESSION_SECRET`、`ADMIN_EMAILS`、`DEVICE_HASH_PEPPER`、`VERIFY_ACCESS_SECRET`、`DELIVER_CHALLENGE_SECRET`。
7. **建索引**：后台进「站点数据」点一次「重建知识库」，切片的向量会自动灌进 Vectorize；之后每次保存站点数据都会自动重建，不需要 CI 令牌。
8. **换个人素材**：`images/`（形象照、证书）、`assets/skins/models/*.glb`（3D 形象）、`favicon*`、`assets/resume/*.pdf`。原作者的人像与证书**不可复用**。
9. **按需关掉别人的服务**：不用的微信登录 / TTS / Worker 检索留空即可，代码均有降级；`KB_WORKER_URL` 不配时走 D1 词面 + 关键词兜底。
10. **手机号与 PDF**：仓库里的简历页/PDF 只有占位号。`/resume` 由中间件从 D1 注入真号码；投递用的真实 PDF 用 `node scripts/make-cloud-pdf.mjs --put` 生成并上传 KV（键 `resume:pdf`），`/api/resume-pdf` 下发、`/api/deliver` 发信时优先用它。

**空数据板块自动隐藏**：主页各板块按数据自动收起，fork 后没有对应内容不必删代码——把 `data/site-data.json` 里相应数组留空（或只放空对象）即可，整节连同导航项一起消失、后续编号自动重排。三处特例：

- **个人作品**（`works`）：空数组 / 空对象数组 → SEC.04 整节隐藏；
- **GitHub 贡献热力图**：`data/contributions.json` 的 `total=0`、无 `days` 或**无你的 `username`** → 整块不展示（不会回退到原作者的 GitHub 地址）；
- **页脚推荐的人**：`data/people.json` 的 `people` 留空 → 整节隐藏。

判定逻辑集中在 `src/lib/section-visibility.ts`（构建期与运行时 `js/main.js` 同口径），`work/portfolio.html` 案例页在缺数据时渲染空状态页而非构建报错。

完整步骤与表结构说明见 [docs/cloudflare-rag-admin-plan.md](docs/cloudflare-rag-admin-plan.md)。

### 预览环境（可选但建议）

`[env.preview]` 不配的话，**非 main 分支 / 本地直接上传的预览部署会退回到顶层的生产绑定**，等于让预览站读写线上数据（真实手机号会出现在预览页上）。所以 `wrangler.toml` 里单独给预览留了一段：

```bash
npx wrangler d1 create portfolio-db-preview        # 独立 D1
npx wrangler kv namespace create site-kv-preview   # 独立 KV
# 把上面两个 id 填进 wrangler.toml 的 [env.preview]
D1_DB_NAME=portfolio-db-preview bash scripts/db-init.sh remote   # 灌脱敏数据
npx wrangler pages deploy dist --branch=preview-check            # 发一个预览
```

预览环境只配 `ADMIN_EMAILS` 与三个自签随机密钥（`ADMIN_SESSION_SECRET` / `DEVICE_HASH_PEPPER` / `VERIFY_ACCESS_SECRET`），**刻意不配** `RESEND_API_KEY` / `TURNSTILE_SECRET` / 微信 / `KB_WORKER_URL`：预览不需要真发信、真发码、真写向量库，缺了会自动降级，也避免在预览里点「重建知识库」误打到生产索引。

## 文档索引

文档按主题分四组，全部索引与维护约定见 **[docs/README.md](docs/README.md)**：

- **架构与后端**：[cloudflare-rag-admin-plan.md](docs/cloudflare-rag-admin-plan.md)（总设计）、[ai-assistant-survey.md](docs/ai-assistant-survey.md)（问答 v1 调研与踩坑）、[jd-match.md](docs/jd-match.md)、[ai-voice-survey.md](docs/ai-voice-survey.md)
- **部署与运维**：[cloudflare-pages-deploy.md](docs/cloudflare-pages-deploy.md)、[cloudflare-free-resources.md](docs/cloudflare-free-resources.md)、[resume-delivery.md](docs/resume-delivery.md)、[observability-and-cms.md](docs/observability-and-cms.md)
- **视觉与素材**：[pet-self3d-pipeline.md](docs/pet-self3d-pipeline.md)、[ai-avatar-skins.md](docs/ai-avatar-skins.md)、[3d-character-library.md](docs/3d-character-library.md)、[mixamo-auto-rigging-guide.md](docs/mixamo-auto-rigging-guide.md)
- **复盘与台账**：[portfolio-capabilities-and-learnings.md](docs/portfolio-capabilities-and-learnings.md)、[p0-single-source.md](docs/p0-single-source.md)、[TODO.md](docs/TODO.md)（唯一「还没做的事」清单）

## 贡献

欢迎 issue 与 PR。开始前请读 [CONTRIBUTING.md](CONTRIBUTING.md)，重点三条：

1. **不要手改生成物**（`resume.html`、`work/*.html`、`data/site-data.js`）——改数据或模板，然后跑生成脚本。
2. **不要把个人隐私写进仓库**：手机号、验证码、密钥、真实设备数据一律不入库。
3. **前端用 Astro + React 岛屿**（迁移方案与验收台账见 [docs/react-refactor-plan.md](docs/react-refactor-plan.md)）；新增接口先写纯函数 + 单测，再接到 Functions。

安全漏洞请按 [SECURITY.md](SECURITY.md) 私信报告，不要开公开 issue。

## 许可与内容版权

- **代码**：[MIT](LICENSE) © 2026 陈培胜。可自由使用、修改、分发，保留版权声明即可。
- **个人内容不授权**：`images/` 中的本人照片、证书、学信网截图，`assets/skins/models/` 中的个人 3D 形象，`resume.html` 中的履历文字，以及姓名、联系方式等，**仅用于本站展示，不随 MIT 授权**。Fork 时请全部替换为你自己的素材。
- **第三方资源**：`assets/vendor/` 下的 model-viewer、html2canvas 等遵循其原始许可证；字体遵循各自授权（见 `css/fonts.css` 注释）。

## 作者

**陈培胜** · AI Agent 工程师 · 广东深圳

- 站点：<https://chenpeisheng.cn>
- GitHub：<https://github.com/shenge-work>
- 邮箱：<hi@chenpeisheng.cn>
- 博客：<https://blog.chenpeisheng.cn>

> AI生成
