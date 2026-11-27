# Fork 云端一致性与复刻清单

> 这份文档回答两个问题：
> ① 云函数相关代码在本地是否一致、有备份？
> ② 别人 fork 后，能否仅凭仓库文档和代码复刻相同的功能、数据渲染与各种数据统计？

## 0. 一句话结论

| 维度 | 结论 |
| --- | --- |
| **云函数代码** | ✅ 有完整备份：`functions/` 80 个文件、`worker/` 7 个、`db/` 13 个（schema + 12 个迁移）、`scripts/` 43 个，全部被 git 跟踪，工作区无未跟踪的云函数文件。 |
| **配置与密钥** | ✅ 不入库（正确做法）：仓库只有 `.env.example` 的变量名模板，真实密钥只存在 Cloudflare Pages / Worker 后台与本地 `.dev.vars`（已 gitignore）。 |
| **云端资源 ID** | ⚠️ **本站专有、fork 必须替换**：`wrangler.toml` 里 D1 / KV 的生产与预览 ID、`worker/kb/wrangler.toml` 的 D1 ID、`worker/wrangler.toml` 的 KV ID，共 6 处（见 §2）。 |
| **功能复刻** | ✅ 可复刻：按 §3 顺序执行即可；知识库切片与向量由仓库数据现算，不需要原站的 RAG 产物。 |
| **历史数据** | ❌ 不可复制、也不应复制：访问计数、留言、QA 日志、审批记录等是运行时产生的隐私数据，fork 后从 0 开始（见 §4）。 |
| **线上代码一致性** | ⚠️ 没有"线上部署代码 hash"自动校验；靠 CI 生成物漂移检查 + 部署流程 + 人工冒烟保证（见 §5）。 |

## 1. 本地云函数地图（全部已入库）

| 路径 | 职责 | 依赖的绑定 / 密钥 |
| --- | --- | --- |
| `functions/_middleware.js` | 全局守卫、`/admin` 会话拦截、手机号注入 | `DB`、`ADMIN_SESSION_SECRET` |
| `functions/api/chat.js` | AI 问答主入口，混合检索 → 提示词 → 语义层 Worker；Worker 不可用走本地摘录兜底 | `KB_WORKER_URL`、`KB_TOKEN` |
| `functions/api/kb.js` | 知识库检索（D1 FTS5 + Vectorize 混合） | `DB`、`KB_WORKER_URL`、`KB_TOKEN` |
| `functions/api/visits.js` | 全站访问计数（D1 `counters` / `visitors`） | `DB` |
| `functions/api/wall.js` | 留言墙读写、设备隔离、通知 | `DB`、`SITE_KV`、`WALL_NOTIFY_*` |
| `functions/api/deliver.js` | 简历投递（挑战、限额、PDF 下发、发信） | `SITE_KV`、`RESEND_API_KEY`、`DELIVER_FROM` |
| `functions/api/verify-access*.js` | 私密佐证材料申请 / 审批 / 限时签名取流 | `DB`、`SITE_KV`、`VERIFY_ACCESS_SECRET`、`SECURE_ASSET_SECRET` |
| `functions/api/admin/**` | 后台登录、统计、配置、留言、QA、导出、主题等 | `DB`、`ADMIN_*`、`WECHAT_*` |
| `functions/api/jd.js`、`voice.js`、`theme.js`、`variant.js` 等 | JD 匹配、语音、主题/套装开关 | `DB`、`TTS_ENDPOINT` |
| `functions/tencent/**` | 腾讯云 CloudBase 版问答（历史备用链，当前主线走 Cloudflare） | `AI_API_KEY` 等，见文件头注释 |
| `worker/kb/index.mjs` | 语义层 Worker `resume-kb-api`：embed / query / rerank / rebuild | `AI`、`VECTORIZE`、`DB`、`KB_TOKEN` |
| `worker/index.mjs` | 访客计数 Worker（备用，当前未启用，计数已走 Pages Function） | `VISITS` KV |
| `db/schema.sql` + `db/migrations/*.sql` | 17 张业务表的完整 DDL（含统计表、知识库表） | — |
| `scripts/db-init.sh` | 一条命令建库 → 建表 → 灌 RAG → 灌站点数据 → 校验 | — |

完整变量名清单见 [`.env.example`](../.env.example)，部署步骤见 [cloudflare-pages-deploy.md](cloudflare-pages-deploy.md)。

## 2. Fork 必须替换的 6 处硬编码云端 ID

这些 ID 指向本站的资源。fork 后若不替换，要么部署失败（无权限），要么读到别人的数据。

| 文件 | 说明 | 替换方式 |
| --- | --- | --- |
| `wrangler.toml:19` | 生产 D1 `portfolio-db` | `bash scripts/db-init.sh remote` 会自动写入；也可手动填 `npx wrangler d1 create` 的输出 |
| `wrangler.toml:24` | 生产 KV `site-kv` | 手动创建后填入（脚本**不会**自动处理） |
| `wrangler.toml:48` | 预览 D1 `portfolio-db-preview` | 手动创建独立库后填入 |
| `wrangler.toml:52` | 预览 KV `site-kv-preview` | 手动创建独立命名空间后填入 |
| `worker/kb/wrangler.toml:24` | KB Worker 绑定的 D1 | 必须与 `wrangler.toml:19` 一致（脚本**不会**同步，需手动改） |
| `worker/wrangler.toml:16` | 备用计数 Worker 的 KV | 未启用；要启用才需要改 |

定位命令：

```bash
grep -rnE 'database_id *=|id *= *"[0-9a-f]{32}"' wrangler.toml worker/
```

## 3. Fork 复刻顺序（可执行）

```bash
# ① 换数据：7 份 JSON 放到 data/（结构见 scripts/seed-site-content.mjs 的 FILES）
# ② 换身份：全局替换 chenpeisheng.cn / hi@chenpeisheng.cn / shenge-work，
#    并改 canonical / OG / JSON-LD / wrangler.toml 的 ALLOWED_ORIGINS

# ③ 建生产 D1 + 灌数据（会自动写回 wrangler.toml 顶层 database_id）
bash scripts/db-init.sh remote

# ④ 建 KV：生产与预览各一个，把 id 填进 wrangler.toml 第 24、52 行
npx wrangler kv namespace create site-kv
npx wrangler kv namespace create site-kv-preview

# ⑤ 建预览 D1（可选但强烈建议，避免预览站读写生产数据）
npx wrangler d1 create portfolio-db-preview
D1_DB_NAME=portfolio-db-preview bash scripts/db-init.sh remote
# 把新 id 填进 wrangler.toml 第 48 行

# ⑥ 建 Vectorize 索引：1024 维、cosine，名字必须与 Worker 配置一致
npx wrangler vectorize create resume-kb --dimensions=1024 --metric=cosine

# ⑦ 同步 KB Worker 的 D1 id：改成与 wrangler.toml 顶层相同，然后部署 Worker
cd worker/kb && npx wrangler deploy && npx wrangler secret put KB_TOKEN
cd ../..

# ⑧ 部署站点：构建命令 bash scripts/pages-build.sh，输出目录 dist
#    在 Pages 控制台绑定 DB / SITE_KV，并按 .env.example 配 Secrets；
#    KB_WORKER_URL 填 Worker 地址，KB_TOKEN 与第 ⑦ 步同值。
```

> 密钥修改后需要一次新部署才生效（Cloudflare 控制台会提示）。四类发件身份（`code@` / `wall@` / `access@` / `jobs@`）的默认值都是本站域名，fork 后请用 `ADMIN_EMAIL_FROM` / `WALL_NOTIFY_FROM` / `VERIFY_ACCESS_FROM` / `DELIVER_FROM` 覆盖成自己的已验证发件身份。

## 4. 数据统计的复刻边界

| 能力 | 依赖 | fork 后的初始状态 |
| --- | --- | --- |
| 站点内容渲染 | `data/*.json` → `db/site_content`（`seed-site-content.mjs`） | 与仓库 JSON 一致；改 JSON 后重灌即可 |
| 知识库切片与向量 | `scripts/build_rag_chunks.mjs` + `/rebuild` 写入 D1 与 Vectorize | 由仓库数据现算，产物不入库 |
| 全站访问计数 | D1 `counters` / `visitors` | 从 0 开始 |
| 留言墙 / 回复 | D1 `wall_messages` / `wall_replies` / `wall_devices` | 空 |
| 公司档案浏览 / 点赞 / 评论 | D1 `company_views` / `company_likes` / `company_comments` | 从 0 开始 |
| AI 问答日志 | D1 `qa_logs` | 空 |
| 邮箱验证码 / 设备票据 / 限流 | D1 `admin_email_codes` + KV `site-kv` | 空 |
| 私密材料审批记录 | D1 `verify_access_requests` / `asset_links` | 空 |

**结论**：功能、表结构、初始内容可以一模一样；历史统计数据属于站点自己的运营隐私，不应也不可能被复制。

## 5. 一致性自检清单

```bash
# ① 云函数文件是否全部入库（应无输出）
git status --porcelain --untracked-files=all functions worker db

# ② 数据生成物是否与真相源漂移（CI content-build.yml 同款检查）
node scripts/render_resume.mjs --check
python3 scripts/sync_site_data.py --check
node scripts/render_work_details.mjs --check

# ③ 全量测试 + 构建
node --test tests/*.test.mjs && npx vitest run
npm run build

# ④ 线上冒烟（部署后）
curl -s https://<你的域名>/api/visits | head -c 200
curl -s https://<你的 KB Worker>/health | head -c 200
```

**一致性保证的边界**：仓库内有 CI 漂移检查（防止手改生成物、数据不同步）与全量测试，但**没有**把线上部署代码的 hash 写回仓库的机制。因此"线上代码 == 本地 HEAD"目前靠部署流程（push 到 main 自动构建 / `npx wrangler deploy`）与人工冒烟确认，而不是自动断言。如果需要强一致，可在 CI 里加一步：拉取线上 Function 代码或部署元数据，与 git HEAD 比对后写入状态文件。

## 6. 相关文档

- [cloudflare-pages-deploy.md](cloudflare-pages-deploy.md) — 构建、部署、绑定、迁移与故障复盘
- [cloudflare-rag-admin-plan.md](cloudflare-rag-admin-plan.md) — 单一真相源、RAG、后台、统计表设计
- [email-deliverability.md](email-deliverability.md) — 域名邮箱、四类发件身份与 DNS 记录
- [p0-single-source.md](p0-single-source.md) — 数据上云与脱敏边界
