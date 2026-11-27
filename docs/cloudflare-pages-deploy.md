# Cloudflare Pages 托管与部署（主站）

> 状态：现行 · 最后核对 2026-11-25
> 这条线是**主站**：`chenpeisheng.cn`（自定义域）+ `shenge-work.pages.dev`（平台域）。
> GitHub Pages（`shenge-work.github.io`）仍可访问，但只作为旧线路，不再承担正式数据与接口。

- 作品集主页：<https://chenpeisheng.cn/>
- 在线简历：<https://chenpeisheng.cn/resume.html>
- 岗位匹配：<https://chenpeisheng.cn/jd.html>
- 管理后台：<https://chenpeisheng.cn/admin>

## 1. 这套托管由什么组成

| 组成 | 说明 |
|---|---|
| 静态资源 | HTML / CSS / JS / 图片 / 视频 / GLB / 字体，构建后放 `dist/` |
| Pages Functions | `functions/` 下所有 `/api/*`（同一仓库，构建时自动编译，不进 `dist`） |
| D1 | `portfolio-db`：业务数据、RAG 词面索引、后台配置、问答日志 |
| KV | `site-kv`：登录票据、少量兜底计数 |
| Vectorize | 索引 `resume-kb`：语义检索向量 |
| Workers AI | 查询向量化（bge-m3） |
| 外部服务 | 腾讯云 CloudBase（TTS 合成）、Resend（邮件）、Turnstile（人机校验） |

**关键点**：Functions 不走 `dist`。即使 `dist/` 里没有 `functions/`，Pages 仍会把仓库根目录的
`functions/` 编译成路由——所以「构建产物里没看到 functions」不等于接口会丢。

## 2. 部署链路

### 2.1 主链路：push 即部署

Cloudflare Pages 项目 `shenge-work` 已授权 GitHub 仓库 `shenge-work/shenge-work.github.io`，
生产分支 `main`。push 后约 3 秒触发 `github:push` 构建并上线。

| 配置项 | 值 |
|---|---|
| Project name | `shenge-work` |
| Git 仓库 / 分支 | `shenge-work/shenge-work.github.io` / `main` |
| Build command | `bash scripts/pages-build.sh` |
| Build output directory | `dist` |
| Root directory | 仓库根（留空） |

2026-11-17 实测证据（推翻更早文档中「push 不会触发构建」的结论）：

- 远端 commit `d5de5afe`（18:41:23Z）后 3 秒，Pages 产生 production 部署 `0a522e4f`（18:41:26Z）；
- `deployment_trigger.type = github:push`，`commit_hash = d5de5afe…`，各 stage 全部 success；
- 构建后线上 `GET /api/wall?peek=1` → `200 {"ok":true,"open":true}`，`POST /api/deliver` → `400 bad_request`
  （正常参数校验），说明 Functions 仍在生效。

### 2.2 构建产物规则（`scripts/pages-build.sh`）

构建脚本是**唯一入口**，不要在控制台另写一份 `cp -r` 白名单（历史上就是这么丢页面的）：

1. **根目录 HTML 全收集**：排除 `_` 开头的本地调试探针；新增独立页不用改脚本。
2. **静态资源**：`css js data images videos assets favicon* robots.txt sitemap.xml`。
3. **数据兜底**：把仓库里的脱敏副本复制到 `dist/data/fallback/`，供 `/data/*` 动态路由在
   D1 未配置时回退，避免白屏。
4. **大文件处理**：`videos/interview-zhishu-lessie.mp4`（34MB）不进产物（走 COS 直链）；
   `assets/character-views/`（原始 3D 素材，约 570MB）整目录排除。
5. **Functions**：复制 `functions/` 并剔除 `functions/tencent/`（那是腾讯云函数源码，不是 Pages 路由）。
6. **后台页面**：`admin/public/index.html` → `dist/admin/index.html`；
   `login.html` 同时落 `dist/login.html` 与 `dist/login/index.html`（避免 308 跳转）。
7. **硬校验**：逐项检查关键文件是否存在、单文件是否超 25MiB，缺一个就让构建失败。

本地试跑：

```bash
bash scripts/pages-build.sh
ls dist/*.html
```

### 2.3 兜底通道（自动构建异常时）

```bash
./scripts/deploy-pages.sh                     # 按本地工作区直传（--dry-run 只看清单）
./scripts/sync-pages-from-github.sh --force   # 拉远端 main 的 tar 包直传，幂等
./scripts/sync-pages-from-github.sh --check   # 只看远端有没有新提交
```

`deploy-pages.sh` 部署结束会打印 `/api/wall open=...` 与首页 md5，绑定漏了当场可见。

### 2.4 历史方案：本机 launchd 定时同步

「Cloudflare 未授权 GitHub App」时期，用 macOS `launchd` 每小时跑 `scripts/sync-pages-from-github.sh`。
自动构建生效后**不再是主链路**，换机器无需恢复：

- 日志：`~/Library/Logs/pages-sync.log`、`~/Library/Logs/pages-sync.err.log`
- 状态：`~/.local/state/pages-sync/shenge-work.last-commit`
- 停用：`launchctl bootout gui/$(id -u)/com.shenge.pages-sync`

## 3. 首次搭建 / Fork 复刻

1. **建 D1**：`bash scripts/db-init.sh remote`（会建库、跑 `db/schema.sql`、灌 RAG 与站点数据）。
   脚本只自动写回顶层 `database_id`；**KV 与向量索引需手动建**：
   `npx wrangler kv namespace create site-kv`（id 填 `wrangler.toml` 顶层）、
   `npx wrangler vectorize create resume-kb --dimensions=1024 --metric=cosine`。
   预览环境另建 `site-kv-preview` / `portfolio-db-preview`，id 填 `[env.preview]`；
   `worker/kb/wrangler.toml` 的 D1 id 也要与顶层保持一致。
   6 处必改 ID、复刻命令与数据统计边界见 [fork-cloud-parity.md](fork-cloud-parity.md)。
2. **建 Pages 项目**：连接你的 GitHub 仓库，构建命令 `bash scripts/pages-build.sh`，输出 `dist`。
3. **绑定资源**（Pages → Settings → Bindings，Production 环境）：`DB` → D1、`SITE_KV` → KV。
   `AI` / `VECTORIZE` 不在 Pages，而是在语义层 Worker `worker/kb/`（`resume-kb-api`）里，见下一步。
4. **部署语义层 Worker**：`cd worker/kb && npx wrangler deploy`（绑定 `AI` / `VECTORIZE` / `DB`），
   `npx wrangler secret put KB_TOKEN`；把 Worker 地址与同一令牌填回 Pages 的 `KB_WORKER_URL` / `KB_TOKEN`。
5. **配环境变量**：照 [../.env.example](../.env.example)，至少 `ADMIN_SESSION_SECRET`、`ADMIN_EMAILS`、
   `DEVICE_HASH_PEPPER`、`VERIFY_ACCESS_SECRET`、`DELIVER_CHALLENGE_SECRET`、`KB_WORKER_URL`、`KB_TOKEN`；
   `ALLOWED_ORIGINS` 改成你自己的域名。
6. **迁表**：新库直接用 `db/schema.sql`；老库按 `db/migrations/` 顺序补，或执行单条：
   ```bash
   npx wrangler d1 execute portfolio-db --remote --file=db/migrations/<file>.sql
   ```
7. **建索引**：进 `/admin` →「站点数据」保存一次，或点「重建知识库」；之后每次保存自动重建。
8. **绑自定义域**：Pages → Custom domains 添加域名；随后把 `ALLOWED_ORIGINS`、`MAIN_SITE_URL`
   以及 HTML 里的 canonical / OG / JSON-LD 一起改掉。

> 变量或绑定**修改后需要一次新部署才生效**（控制台会提示 "This change will take effect on the next deployment"）。

## 4. 跨域（CORS）白名单

`ALLOWED_ORIGINS`（逗号分隔，支持 `*.` 前缀通配）同时作用于本仓库的所有 Functions：
`wall` / `visits` / `deliver` / `chat` / `jd` / `voice` / `admin`。当前线上为：

```
https://chenpeisheng.cn,https://shenge-work.pages.dev,*.shenge-work.pages.dev
```

- 代码默认值同样包含这三个来源与本地 `127.0.0.1:8877`；环境变量优先。
- `*.shenge-work.pages.dev` 覆盖每次提交的预览部署（`https://<commit>.shenge-work.pages.dev`）。
- 从 `github.io` 访问时，前端直接把 API 指向 `https://shenge-work.pages.dev`（见 `js/main.js` 的 `API_BASES`）。

## 5. 与 GitHub Pages 的关系

| 项 | Cloudflare Pages（主） | GitHub Pages（旧） |
|---|---|---|
| 域名 | `chenpeisheng.cn` | `shenge-work.github.io` |
| 后端 | Functions + D1 + KV + Vectorize | 无，只能跨域打 pages.dev |
| 数据 | D1 `site_content` 下发真人数据 | 仓库里的**脱敏副本** |
| 构建 | `scripts/pages-build.sh` → `dist` | 直接发布仓库根目录 |
| URL 风格 | 默认 pretty URL，`/resume.html` 会 308 到 `/resume` | 保持 `.html` |

> 两站共用同一份仓库，但**不要**把 `github.io` 当正式数据源：仓库数据已脱敏（手机号、验证码已替换）。

## 6. 历史故障复盘：2026-11-20 构建连续失败

这是本仓库最值得记住的一次部署事故，改大文件前请先读：

- **现象**：`github.io` 已更新，`pages.dev` 停在旧版，两站内容不一致。
- **根因**：构建命令把整个 `assets/` 拷进 `dist`，而 `assets/character-views/` 里有 27.5MiB 的
  `female.fbx`，超过 Pages 单文件 **25MiB** 上限，构建在校验阶段失败：
  ```
  ✘ [ERROR] Error: Pages only supports files up to 25 MiB in size
    assets/character-views/model/female/female.fbx is 27.5 MiB in size
  ```
- **止血**：`deploy-pages.sh` 直传（已排除 `character-views`）让线上追平。
- **根治**：把 `assets/character-views/` 归档到飞书云盘并从 git 移除（`.gitignore` 排除），
  构建不再碰到大文件；自动构建恢复 success。
- **仍未做**：git 历史瘦身（`filter-repo` 强推属破坏性操作），`.git` 体积仍包含旧素材。

**教训**：Pages 的构建是「产出 `dist` → 校验 → 上传」，任何一个超限文件都会让整站停在旧版；
新增媒体文件前先 `find . -size +25M` 自查，或交给 `pages-build.sh` 的硬校验拦截。

## 7. 排障

| 现象 | 可能原因 | 处理 |
|---|---|---|
| 构建失败，日志报 25MiB | 新增了大文件（视频 / FBX / PSD） | 移出产物或改走外部存储，见 §6 |
| 构建成功但页面 404 | 新页面没被收集 / 被 SPA fallback 吞掉 | 确认文件名不以 `_` 开头，且 `pages-build.sh` 的硬校验列表包含它 |
| `/api/*` 返回 405 或 HTML | 请求打到了 `github.io` 或无 Functions 的部署 | 查 `API_BASES`，确认打到 `pages.dev` / 主域 |
| `/api/wall` 返回 `open:false` | `DB` 未绑定或迁移未执行 | 绑 `DB` → 重跑部署 → `./scripts/wall-check.sh` |
| `/api/company-social` 500 `db_error` | 缺 `2026-11-24-company-social.sql` | 执行该迁移后重试 |
| 后台 302 到 `/login` 循环 | `ADMIN_SESSION_SECRET` 变更或 Cookie 被拦 | 重设变量并重新部署；确认访问的是 https 主域 |
| 预览子域 403 | `ALLOWED_ORIGINS` 被覆盖成精确列表 | 补 `*.shenge-work.pages.dev` 后重新部署 |
| 线上还是旧内容 | 部署成功但 CDN 缓存 / 构建未触发 | 看 Deployments 的 commit hash；必要时 `?v=` 强刷 |

## 8. 相关文档

- 免费额度与 KV→D1 迁移：[cloudflare-free-resources.md](cloudflare-free-resources.md)
- 留言板 / 投递配置与排障：[resume-delivery.md](resume-delivery.md)
- 后台与 RAG 总体设计：[cloudflare-rag-admin-plan.md](cloudflare-rag-admin-plan.md)
