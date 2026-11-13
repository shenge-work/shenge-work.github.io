# 留言墙 + 简历转发（Cloudflare Pages Functions + Resend）

2026-11 新增的两个交互能力的后端与上线指引。

> **简历转发方向**：浏览简历的人 → 收件人（他自己 / 同事 / 指定人）。
> 访客填收件人邮箱，系统把「陈培胜的在线简历」发到该邮箱，收件人点链接即可查看，
> 不需要下载附件。**不是**把访客邮箱发给站长；站长如需备案可配 `DELIVER_BCC`。

## 做了什么

| 功能 | 页面 | 前端调用 | 后端 |
|---|---|---|---|
| 留言墙（公开） | `index.html` SEC.10 | `GET/POST /api/wall` | `functions/api/wall.js` · KV 存储 |
| 简历转发到邮箱 | `resume.html` 「发简历到邮箱」按钮 | `POST /api/deliver {to, name?, email?, note?}` | `functions/api/deliver.js` · Resend 发信 |

两份函数代码都在仓库 `functions/api/`，随静态资源一起部署到 Cloudflare Pages（`scripts/deploy-pages.sh` / `scripts/sync-pages-from-github.sh` 已带上，会自动剔除 `functions/tencent`）。

两张前端页面都带**双线路自适应**：

| 页面打开位置 | API 请求地址 | 说明 |
|---|---|---|
| `shenge-work.github.io`（主站） | 直接打 `https://shenge-work.pages.dev/api/*` | GitHub Pages 只有静态文件，没有 Functions；已把 github.io 列入 CORS 白名单 |
| `shenge-work.pages.dev`（备份站） | 同源 `/api/*` | 正常路径，少一次跨域 |
| `localhost` / `127.0.0.1`（本地预览） | 只打本机，不回落线上 | 避免本地测试真的写进线上留言/发信 |

同源请求若返回 404 / 405 / 非 JSON（静态主机把 `/api/*` 当文件返回），会自动切到下一条线路；两条都不可用时，留言墙显示「暂未开放」、转发弹窗展示 mailto 兜底（收件人已填好）。

**架构为什么这样选**：
- GitHub Pages 只出静态文件，没有后端——两个 API 都部署在 **Cloudflare Pages（shenge-work.pages.dev）**，国内可达、免费额度足够；
- 发信走 Resend：调用发生在 Cloudflare 节点（无墙），API key 只放 Cloudflare 环境变量，前端代码永不接触；
- 收件人是访客临时填写的**任意邮箱**，因此 Resend 必须配好**已验证域名**（见 ①b）；
  未验证时只能发给 Resend 账号自己的邮箱，接口会返回 `recipient_not_verified`，前端自动切到
  访客本机的邮箱客户端（mailto，收件人已填好），功能不中断。

## 站长需要做的一次性配置（约 10 分钟）

### ① 注册 Resend（2 分钟）

1. 打开 https://resend.com/signup ，用 Google 账号（建议直接用 shenge.work@gmail.com）注册；
2. 进入 Dashboard → **API Keys** → `Create API Key`，名字随意（如 `portfolio-deliver`），权限选默认的 `Full access`；
3. 复制 `re_` 开头的 key（**只显示一次**），先存到本地记事本。

### ①b 验证发信域名（要让任意收件人收到，必须做）

1. Resend Dashboard → **Domains** → `Add Domain`，填你已有的域名（如 `shenge.dev`），按提示加 DNS 记录（SPF / DKIM，通常 5 分钟生效）；
2. 验证通过后，把 Pages 环境变量 `RESEND_FROM` 设为 `陈培胜简历 <resume@你的域名>`；
3. 没做这步也能用：访客会看到「用邮箱客户端发送」的兜底按钮。

> 想省事也可以先用免费测试模式（`onboarding@resend.dev` + 收件人只能是 Resend 注册邮箱），
> 但访客填自己邮箱时会被 Resend 拒绝，只能走 mailto 兜底。

### ② Cloudflare Pages 绑定 KV（3 分钟）

1. 打开 https://dash.cloudflare.com → 左侧 **Storage & Databases → KV** → `Create database`；
2. 名字 `site-kv`（任意），创建后进入它，记下 Database ID（可复用已有的 `portfolio-visits` KV 也可以，不必新建——但**注意免费版同 namespace 留言数据与其共用，建议新建**）；
3. 左侧 **Workers & Pages** → 找到 Pages 项目 `shenge-work` → **Settings → Functions → KV namespace bindings**：
   - `Add binding`：Variable name 填 **`SITE_KV`**（必须一字不差），KV database 选刚建的 `site-kv`；
4. **注意**：项目名不是 `shenge-work.pages.dev`，而是 Pages 里的项目 `shenge-work`。

### ③ 配置环境变量（2 分钟）

同在 `shenge-work` 项目 → **Settings → Variables and Secrets** → 添加：

| 类型 | 变量名 | 值 | 用途 |
|---|---|---|---|
| Secret | `RESEND_API_KEY` | `re_...`（①里拿到的） | 发信；不配置则前端自动走 mailto 兜底 |
| Variable | `RESEND_FROM` | `陈培胜简历 <resume@你的已验证域名>` | 发件人；不配则用 `onboarding@resend.dev`（只能发注册邮箱） |
| Variable | `DELIVER_BCC` | 如 `shenge.work@gmail.com`（可选） | 站长收一份转发备案，不配则完全不经手 |
| Variable | `ALLOWED_ORIGINS` | `https://shenge-work.github.io,https://shenge-work.pages.dev` | 跨域白名单 |
| Variable | `WALL_ADMIN_TOKEN` | 自拟一串随机字符（如 32 位） | 留言管理删除令牌（可选） |

> Secret 类型选「**Secret**」而不是「Text」，加密存储。
> 配完点 `Save`。**Pages 变量/KV 绑定修改后需要重新部署才生效**（重新跑一次部署脚本，或 Pages 控制台 Deployments → … → Retry deployment）。

### ④ 部署并验证（3 分钟）

```bash
./scripts/deploy-pages.sh          # 上传含 functions/api 的完整站点
```

验证清单（浏览器直接访问）：

| 检查 | URL / 操作 | 预期 |
|---|---|--- |
| 留言墙读取 | `https://shenge-work.pages.dev/api/wall` | `{"ok":true,"open":true,"messages":[...]}` |
| 留言提交 | 主页滚到 SEC.10 留言墙 → 填写提交 | 列表立即出现新留言 |
| 转发发信 | `resume.html` → 「发简历到邮箱」→ 填你自己的另一个邮箱提交 | 该邮箱收到「陈培胜 · AI Agent 工程师 · 在线简历」，含两个简历入口按钮 |
| 多收件人 | 收件人填 `a@x.com, b@y.com` | 一封邮件同时到达两人（最多 3 个） |
| 兜底 | 未配置 key / 域名未验证时提交 | 弹窗底部出现「用邮箱客户端发送」mailto，收件人已填好 |

### ⑤ 线上自检小贴士

- `curl -s -X POST https://shenge-work.pages.dev/api/deliver -H 'Content-Type: application/json' -H 'Origin: https://shenge-work.github.io' -d '{"to":"你的另一个邮箱"}'`
  返回 `{"ok":true,...}` 说明发信链路通了；返回 `recipient_not_verified` 说明域名还没验证；
- 返回 200 但内容是 HTML，说明 `functions/api` 还没部署（重新跑部署脚本）。

## 本地自测（不用联网、不碰线上数据）

```bash
node scripts/dev-api-server.mjs     # 静态站 + 真实 functions/api + 内存 KV + 模拟 Resend 发信
# 打开 http://127.0.0.1:8877/index.html 与 /resume.html 手动点一遍
```

已回归的点：留言 GET/POST/限流/超长截断/来源校验/管理员删除；转发接口的收件人解析（多收件人、去重、格式校验、最多 3 个）、Reply-To、主题与正文、每收件人/每 IP/全站限额；未配置与域名未验证两种情况的 mailto 兜底；移动端 320–390px 布局。

## 日常使用

**查看留言**：主页 SEC.10（最新在前，最多展示 50 条）。

**删除一条留言**（配置了 `WALL_ADMIN_TOKEN` 时可用）：

```bash
curl -X DELETE https://shenge-work.pages.dev/api/wall \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: <你的 WALL_ADMIN_TOKEN>" \
  -d '{"id":"wxxxxx"}'
```

（id 在留言卡左上角 `#` 后面。）

**转发出去的邮件长什么样**：主题「陈培胜 · AI Agent 工程师 · 在线简历（某某 转发）」，正文为纸感卡片：开头说明「无需下载附件，点按钮看完整简历」+ 转发人/回复地址/收件人 + 附言块（若有）+ 两个按钮（主/备线路在线简历）+ 页脚。访客填了自己的邮箱时，Reply-To 即该邮箱——收件人直接回复就能联系到转发人。

**站长要不要收到副本**：默认完全不经手。需要备案时配 `DELIVER_BCC`，每封转发都会密送一份给你。

## 容量与安全

- 留言：墙上保留 100 条（超过自动淘汰最旧），每 IP 10 分钟 3 条、全站每天 50 条；
- 转发：每个收件人每天 2 封、每 IP 每天 5 封、全站每天 30 封（防止被当成垃圾邮件跳板）；
- 收件人最多 3 个，逐个正则校验；附言截断 500 字；
- 防滥用：正则校验邮箱、内容截断、控制字符剥离；前端渲染统一 escape，KV 不存 IP 明文（限流键存 IP，仅计数用途）；
- 均为**免费额度内**：KV 免费档每天 10 万读 / 1000 写，远超本站量级。

> AI生成
