# 可观测统计 + 内容管理（免费方案）

这个站点是纯静态的 GitHub Pages，**不需要真后端**。访问统计、行为观测、内容管理都用免费 SaaS，
数据全部留在 GitHub 仓库或对方免费额度内，成本 0。

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

## 一、只有你本人能做的授权（3 步）

下面每一步都要用你自己的账号登录、点授权，我无法代做。做完把 ID 发我，或自己填进
`js/analytics.js` 顶部 `CONFIG`。

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

## 二、已经改好的文件（这些是我做的）

| 文件 | 作用 |
|---|---|
| `js/analytics.js` | 埋点统一入口。默认留空 = 不发请求；填 ID 后自动加载 Umami / Clarity |
| `index.html`、`resume.html` | 各加一行 `<script src="js/analytics.js" defer>` |
| `.pages.yml` | Pages CMS 配置：暴露「作品集内容」编辑入口 + 图片上传到 `images/` |
| `scripts/sync_site_data.py` | 由 `site-data.json` 生成 `site-data.js` 快照；`--check` 只校验不写 |
| `.github/workflows/sync-site-data.yml` | JSON 一改，自动重建快照并提交，防止两份数据漂移 |
| `docs/observability-and-cms.md` | 本文件 |

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
