# 教程：给 GitHub Pages 静态站接入免费可观测统计与内容管理

适用：纯静态站（GitHub Pages 或任意静态托管）。目标是在不买服务器、不接数据库的前提下，
拿到「有多少人来、从哪来、点了什么」，并且做到「不改代码就能更新站内文案」。总成本 0。

| 能力 | 服务 | 免费额度 | 你要做的事 |
|---|---|---|---|
| 访问统计 PV/UV/事件 | [Umami Cloud](https://cloud.umami.is) | 10 万事件/月、1 站点、6 个月留存 | GitHub 登录 → 建站点 → 复制 Website ID |
| 行为录屏 / 热图 | [Microsoft Clarity](https://clarity.microsoft.com) | 不限流量 | 微软账号 → 建项目 → 复制 Project ID |
| 网页内容管理 | [Pages CMS](https://app.pagescms.org) | 免费（GitHub App 直连） | GitHub 授权单个仓库 → 网页改 JSON |
| 数据一致性 | GitHub Actions | 公开仓库免费 | 已配好，无需操作 |
| 全站访客计数 | abacus（默认）/ Cloudflare Worker + KV（可选） | 免费 | 默认已生效；自建见第六节 |

## 目录

1. [5 分钟最快路径](#5-分钟最快路径)
2. [一、接入步骤](#一接入步骤)
3. [二、仓库里已经配好的文件](#二仓库里已经配好的文件)
4. [三、埋点事件表](#三埋点事件表)
5. [四、日常使用流程](#四日常使用流程)
6. [五、几个必须知道的坑](#五几个必须知道的坑)
7. [六、全站访客计数器](#六全站访客计数器)
8. [七、内容改完多久能看到](#七内容改完多久能看到)

## 5 分钟最快路径

只想让它先跑起来，三步：

1. Umami 拿 Website ID → 填进 `js/analytics.js` 的 `umamiWebsiteId`
2. Pages CMS 授权仓库 → 在网页里改 `data/site-data.json`
3. 推一次提交 → 等 30–60 秒构建 → 刷新页面验收

下面按平台展开每一步的细节、验证方法与踩坑。

```
              ┌──────────────── 浏览器 ────────────────┐
              │  js/analytics.js（我加的一层，可配置）    │
              └───────┬────────────────────┬───────────┘
                      │                    │
         Umami Cloud（PV/UV/事件）   Clarity（录屏/热图）
                      │
   ┌──────────────────┴───────────────────┐
   │ GitHub 仓库（唯一数据源）              │
   │  data/site-data.json  ← Pages CMS 写   │
   │  data/site-data.js    ← Actions 自动重建 │
   └──────────────────┬───────────────────┘
                      │ push
              GitHub Pages 自动发布（约 1 分钟）
```

---

## 一、接入步骤

下面每一步都要用**你自己的账号**登录、点授权，代理人无法代做（涉及账号权限与第三方授权弹窗）。
做完把 ID 填进 `js/analytics.js` 顶部 `CONFIG`，或填完让代理人核对。

### 1) Umami Cloud —— 访问统计（必做）

1. 打开 <https://cloud.umami.is> → **Sign in with GitHub**（用 GitHub 账号登录即可，不用单独注册）。
2. 进入后点 **Add website**：
   - Name：`作品集`（随便写，只影响后台显示）
   - Domain：`shenge-work.github.io`（**只填域名**，不要 `https://`、不要路径）
3. 建好后进 **Settings → Website ID**，复制那串 UUID（形如 `1f2e3d4c-...`）。
4. 填到 `js/analytics.js`：

   ```js
   umamiWebsiteId: '你的-uuid',
   ```

5. 验证：本机浏览器打开 <https://shenge-work.github.io>，等 30 秒，Umami 后台
   **Realtime** 面板应出现 1 位访客。

免费额度：10 万事件/月、1 个站点、数据保留 6 个月。个人作品集远远用不完；
超额只是停止记录，站点本身不受影响。

### 2) Microsoft Clarity —— 行为录屏与热图（可选）

用来回答「访客在哪个板块流失」「有没有人真的点项目卡片」，Umami 给数字，Clarity 给画面。

1. 打开 <https://clarity.microsoft.com>，用微软账号登录。
2. **New project**：名称随意，URL 填 `shenge-work.github.io`，类别选 Personal。
3. **Settings → Overview** 复制 **Project ID**（10 位字母数字）。
4. 填到 `js/analytics.js`：

   ```js
   clarityProjectId: '你的-project-id',
   ```

Clarity 免费、不限流量，但录屏默认保留一段时间（以官网为准）。不需要就留空，代码不会加载它。

### 3) Pages CMS —— 内容管理（必做）

作用是：以后改文案、换项目、加证书图片，不用碰 git，在网页里改完点保存就自动发布。

1. 打开 <https://app.pagescms.org> → **Sign in with GitHub**。
2. 首次登录会跳到 GitHub 的 **Install App** 页面，权限设置选：
   - **Only select repositories**（只授权指定仓库）
   - 只勾 `shenge-work.github.io`
   - 点 **Install**
3. 回到 `app.pagescms.org`，选择仓库 `shenge-work.github.io`。
   左侧应出现一个入口：**作品集内容（全站文案）**（配置来自仓库根目录的 `.pages.yml`）。
4. 点进去就是 `data/site-data.json` 的代码编辑器，改完 **Save** → 生成一次 commit →
   GitHub Actions 自动重建 `site-data.js` → Pages 约 1 分钟生效。

它要的权限只有这个仓库的**文件读写**，不涉及你的其它仓库、组织或账号设置。
随时可撤销：GitHub → Settings → Applications → **Pages CMS** → Uninstall。

> 为什么不用 Decap CMS：Decap 必须额外架一个 OAuth 代理（Cloudflare Worker 或它的付费托管），
> 多一层维护和密钥。Pages CMS 用 GitHub App 直接授权，没有中间层。

---

## 二、仓库里已经配好的文件

这些文件是方案落地的部分，接入时只需要填 ID，不用改逻辑：

| 文件 | 作用 |
|---|---|
| `js/analytics.js` | 埋点统一入口。默认留空 = 不发请求；填 ID 后自动加载 Umami / Clarity |
| `index.html`、`resume.html` | 各加一行 `<script src="js/analytics.js" defer>` |
| `.pages.yml` | Pages CMS 配置：暴露「作品集内容」编辑入口 + 图片上传到 `images/` |
| `scripts/sync_site_data.py` | 由 `site-data.json` 生成 `site-data.js` 快照；`--check` 只校验不写 |
| `.github/workflows/sync-site-data.yml` | JSON 一改，自动重建快照并提交，防止两份数据漂移 |
| `docs/observability-and-cms.md` | 本文件 |
| `js/visitor-count.js` | 全站访客计数前端接入层；`CONFIG.provider` 切换 abacus / 自建 Worker |
| `worker/` | Cloudflare Worker 源码、wrangler 配置与本地自测脚本 |

`js/analytics.js` 已经在 `file://` 双击打开、`localhost` 预览时自动跳过，
不会把本地调试算进线上数据。

---

## 三、埋点事件表

Umami 后台 **Events** 面板可直接看到；Clarity 里表现为同名自定义事件。

| 事件名 | 触发时机 | 想回答的问题 |
|---|---|---|
| `page_kind` | 页面加载 | 作品集 / 简历页各来了多少 |
| `theme_view` | 页面加载 | 四种主题（archive / blueprint / newsprint / noir）谁更耐看 |
| `project_open` | 点项目卡片 | 哪个项目最吸引 HR |
| `project_video_play` | 点「实战演示」 | 有没有人真的看视频 |
| `resume_open` | 点「查看简历」 | 简历入口转化率 |
| `resume_print` | 点保存 PDF（彩色 / 黑白） | 有多少人真的导出简历 |
| `resume_long_image` / `_download` | 生成长图 / 下载长图 | 分享意图强度 |
| `contact_click` | 点邮箱 / 电话 | 联系方式有效性 |
| `nav_jump` | 点导航锚点 | 哪个板块被反复看 |
| `scroll_depth` | 滚动到 25/50/75/100% | 内容留存曲线，100% 才说明真看完 |
| `outbound` | 点站外链接 | GitHub / 项目官网引流 |
| `share_card_open` / `_download` | 分享卡预览 / 下载 | 社交传播意愿 |
| `theme_switch` | 手动切主题 | 默认轮换是否多余 |

要加新事件，给元素挂 `data-analytics="事件名"` 即可，不用改 `js/analytics.js`：

```html
<a href="xxx" data-analytics="download_pdf" data-analytics-label="作品集PDF">下载</a>
```

---

## 四、日常使用流程

**改内容**：Pages CMS 改 → Save → 等 1 分钟。
**加图片**：Pages CMS 里上传，落到 `images/`，文件名字母化，避免中文名在 URL 里转义。
**看数据**：Umami 看趋势和事件；Clarity 看录屏复盘「为什么没点简历」。
**本地改代码**：照旧 `git push`，Actions 自动跑快照校验。

手动补跑快照（比如你改了 JSON 但没触发 Actions）：

```bash
python3 scripts/sync_site_data.py
```

---

## 五、几个必须知道的坑

1. **`github.io` 域名用不了 Cloudflare Web Analytics**。它要求域名走 Cloudflare 代理，
   `*.github.io` 不归你管 DNS。想用它得先绑自己的域名并接入 Cloudflare（免费但多一步）。
2. **不要只改 `site-data.js`**。它现在由脚本生成，手改会在下一次 Actions 运行时被覆盖。
3. **JSON 改错不会让站点挂掉**。`index.html` 先 fetch JSON，失败就回退上一版 JS 快照；
   同时 Actions 的校验步骤会失败并变红，等于免费拿到一个坏数据告警。
4. **Actions 首次运行可能要开写权限**。若 workflow 报 `403`：
   仓库 Settings → Actions → General → Workflow permissions → 选 **Read and write permissions**。
5. **数据保留有限**。Umami 免费版留 6 个月，长期趋势想留档就定期导出 CSV。

---

## 六、全站访客计数器

（可选 · Cloudflare Worker + KV，或默认的 abacus 免费计数）

右下角那个 `RENDER LOG` 原本是 `localStorage` 本机累计，只有你自己的电脑会从 1 往上加。
这一节把它换成全站真实数字。

**实测结论（2026-11）**：Cloudflare 的 `*.workers.dev` 域名在中国大陆不可达——DNS 超时、
HTTPS 直接 `http=000`。Worker 部署和 KV 绑定都正常，但境内访客连不上，所以前端默认走
另一个境内可达的计数后端，Worker 保留作「以后绑自有域名」的备选。

| 后端 | 境内可达 | 成本 | 代价 |
|---|---|---|---|
| **abacus**（默认，`abacus.jasoncameron.dev`） | ✅ 实测 200 / 0.6s | 免费 | 第三方小项目，无 SLA |
| 自己的 Worker + 自有域名 | ✅ 走自己的域名 | 域名 ¥30–60/年 | 要买域名并绑 Cloudflare |
| 自己的 Worker + `workers.dev` | ❌ 被墙 | 免费 | 境内拿不到数据 |

切换只改 `js/visitor-count.js` 的 `CONFIG.provider`：`'abacus'` ↔ `'worker'`；选 worker 时再填
`CONFIG.workerApi`（如 `https://visits.你的域名`）。Worker 的免费额度与部署步骤仍然全部有效，
只是访问入口要换成自己的域名。


### 免费额度

| 项 | 免费额度 | 说明 |
|---|---|---|
| Worker 请求 | 10 万次/天 | 作品集远远用不到 |
| KV 读 | 10 万次/天 | 每次命中 1–2 次读 |
| KV 写 | 1000 次/天 | 每次访问 1–2 次写，日访客 <400 才安全 |
| KV 存储 | 1 GB | 每个访客 id 约 50 字节，180 天过期 |

### 部署方式一：一键脚本（推荐）

```bash
cd worker
bash deploy.sh
```

脚本会依次做：本地自测 → 检查登录（没登录就弹浏览器让你点 Allow）→ 查找或创建 KV 命名空间
→ 自动把 id 回填进 `wrangler.toml` → 部署 → 用两种 Origin 打接口验证 → 把 `workers.dev` 地址写进
`worker/.deploy-url` 并打印。

### 部署方式二：Cloudflare 控制台（不依赖本地二进制）

如果脚本里 `npx wrangler` 装不上（见下方 Gatekeeper 一节），直接用网页控制台，5 分钟搞定：

1. <https://dash.cloudflare.com> → **Workers & Pages** → **Create** → **Worker** → 命名 `portfolio-visits`。
2. 编辑器里删掉默认代码，粘贴
   <https://raw.githubusercontent.com/shenge-work/shenge-work.github.io/main/worker/index.mjs> 的全部内容 → **Deploy**。
3. **Storage & Databases → KV** → **Create namespace**，名字填 `portfolio-visits-VISITS`。
4. 回到 Worker → **Settings → Bindings**（新版在 **Runtime/Bindings** 页）→ **Add binding** →
   类型 **KV namespace**，变量名必须是 `VISITS`，选刚建的那个 → 保存。
5. 再点一次 **Deploy**，页面顶部的地址就是 `https://portfolio-visits.<子域>.workers.dev`。

### 踩到 Gatekeeper 怎么办

现象：macOS 连续弹「未打开 “esbuild” / “workerd”，Apple 无法验证…」，命令以 exit 1 结束，
`wrangler` 没装完，登录和部署都没发生。

原因：wrangler 依赖两个原生二进制（打包用的 `esbuild`、本地运行时的 `workerd`），
它们是从 npm 下载到 `~/.npm` 后被 macOS 打了隔离标记，postinstall 一执行就被拦。

两种解法，任选其一：

```bash
# 解法 A：解除隔离标记后重跑（只影响 npm 缓存里的文件）
xattr -dr com.apple.quarantine ~/.npm
cd worker && bash deploy.sh
```

```text
解法 B：改用上面的「部署方式二」，全程在浏览器里做，不需要任何本地二进制。
```

如果解法 A 之后仍弹窗，改在**系统自带的 Terminal.app** 里执行（不要从被隔离的宿主应用里起终端）。

拿到地址后填进 `js/visitor-count.js`：

```js
api: 'https://portfolio-visits.xxx.workers.dev',
```

提交推送后 1 分钟生效。**没填地址或请求失败时，这个文件完全不工作**，页面继续显示原来的本机计数，不会出现 0 或空白。

### 验证

1. 打开站点，右下角标题变成「全站访客 · GLOBAL VISITS」。
2. 开一个无痕窗口再访问，数字 +1（同一窗口刷新不重复计数，靠 sessionStorage 挡住）。
3. 浏览器直接打开 `https://你的-worker 地址/stats`，应返回 `{"visitors":N,"total":M}`
   （只读接口是公开的，方便部署后立刻验证；只有写操作的 `POST /hit` 校验来源白名单）。

### 已知限制

- KV 的读改写不是原子操作，同一秒多人同时命中会有个位数漂移。作品集流量下无感；
  要严格精确得换 Durable Objects（需付费计划），为这点误差不值得。
- 只接受白名单 Origin（`wrangler.toml` 里的 `ALLOWED_ORIGINS`），别站调用会 403。
- 换域名（比如以后绑自己的域名）记得同步改 `ALLOWED_ORIGINS` 再 `npx wrangler deploy`。

## 七、内容改完多久能看到

在 Pages CMS 点 Save 之后要过两道关：

1. **构建**：提交到 `main` 后 `pages build and deployment` 约 30–60 秒跑完，这期间线上还是旧版。
2. **缓存**：GitHub Pages 的 CDN 默认缓存资源 10 分钟。`js/main.js` 拉数据时已带
   `?v=<时间戳>` 绕过这层缓存，所以构建一完成，刷新页面就能看到新文案。

还是看到旧内容时按顺序排查：硬刷新（`Cmd + Shift + R`）→ 看仓库最新提交是否由
`Pages CMS` 产生 → 看 Actions 里 `pages build and deployment` 是否 success。

**本地双击预览（`file://`）走的是本地那份 `data/site-data.js` 快照**，不会同步线上：
本地要看新数据，先 `git pull` 或跑 `python3 scripts/sync_site_data.py` 重新生成快照。

