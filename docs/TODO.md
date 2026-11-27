# 项目待办与未竟事项（TODO / Backlog）

> 文档定位：全站**唯一**的「还没做的事」台账。各专题文档里散落的「暂缓 / 未做 / 待验证 / 必做未配」
> 统一在这里登记，每条给出状态、影响、前置条件、执行步骤与验收标准，并回链依据文档。
> 目的：换会话、换机器、换协作人时，不用通读五份设计文档也能知道下一步该做什么、哪些是故意不做的。
>
> 最近一次盘点：**2026-11-25**（台账复核；T3 部署文档已于 11-25 全文重写。11-21 已根治 T22 / T23：
> `character-views` 原始素材 57 文件 / 573MB 整目录归档到飞书云盘、从 git 移除并 push，
> Cloudflare Pages 自动构建由连续 `Failure` 恢复为 `Success`，两站内容一致；R2 方案因账号无支付方式废弃）。此前 2026-11-20 发现 `pages.dev` 自 `907a108` 起
> 连续构建失败、线上停在 11-19 旧版，根因是构建命令把整个 `assets/` 拷进 `dist` 触发 25MiB 单文件上限。
> 更早的 2026-11-19
> 盘点完成 Cloudflare 免费资源盘点 + D1 迁移（T16）+ Turnstile（T17）+ D1 备份（T18）
> + 可观测双路（T19），T1 暂缓原因补充为「支付问题未解决」。

---

## 0. 一句话现状

站点线上功能均可用：主页、简历页、留言墙、AI 问答助手、AI 语音播报、岗位匹配、访问统计、访客计数、简历转发。

**新增功能「岗位匹配 JD MATCH」（2026-11-17）已上线**：静态文件由 `7c7b5e1` 推送、GitHub Pages
已构建（生产首页含 `#jd` 区块与 `js/jd-match.js` / `css/jd-match.css` 引用）；云函数在并行会话
部署语音链路时已一并带上 `mode:"jd"` 分支，线上实测用真实 hy3 返回结构化对照表
（`ok:true`，score 75，4 条需求含证据出处与追问点），问答与 TTS 回归均为 200。
**T10 已完成，T11 端到端验收已于 2026-11-18 全项完成**（含预览子域 CORS 修复、`chat_logs` 查库、移动端触屏验收，见 §3.11）；T5 同步关闭。
方案、进度与验收清单详见 [jd-match.md](jd-match.md)。

**✅ 两个域名内容不一致（T22）已根治（2026-11-21）**：`github.io` 与 `pages.dev` 现均含男女双 3D 形象、
内容一致。根因是构建命令 `cp -r ... assets ... dist/` 把 `assets/character-views/` 里的 27.5MiB FBX
拷进产物，超过 Pages 单文件 25MiB 上限，自 `907a108`（11-20）起每次 push 都构建失败。
两步解决：① 11-20 `deploy-pages.sh` 直传止血让 pages.dev 追平；② 11-21 把 `character-views`
整目录归档到飞书云盘、从 git 移除并 push，自动构建随之恢复（无需改 build command、无需 R2/支付）。
详见 §3.18 / §3.19。旧的 R2 方案（T23）因账号无支付方式已废弃，改为飞书归档。

**既有功能的缺口仍是「访客填任意邮箱都能自动收到简历」**。Resend 尚未验证自有发信域名，
`onboarding@resend.dev` 只能发给账号邮箱 `hi@chenpeisheng.cn`；其他邮箱会被 Resend 以
403 `recipient_not_verified` 拒绝，前端按设计自动切到「用邮箱客户端发送」的 mailto 兜底
（收件人已填好），功能不中断，但不会自动收到邮件。

站长已于 **2026-11-17 明确决定暂不配置域名**，2026-11-19 补充原因为**支付问题未解决**，
因此这是「已决策暂缓」，**不是故障、不是 bug**。
其余条目都是文档过时、工程卫生、可选增强或思考型迭代池，**不阻塞既有线上功能**。

**2026-11-19 数据层已落地（T16）**：访问计数（`/api/visits`）与留言墙（`/api/wall`）从
Workers KV 迁到 D1（`portfolio-db`，4 张表），免费写额度从 1,000 写/天 提到 100,000 行写/天；
前端计数不再依赖第三方 abacus，改为走 Pages 自身的 `/api/visits`，**全程不需要自有域名**。
详见 [cloudflare-free-resources.md](cloudflare-free-resources.md)。

**2026-11-26 前端架构迁移完成并切生产（T26 观察期开始）**：Astro 6 + React 19 渐进迁移
M0–M5 全部完成（方案与里程碑台账见 [react-refactor-plan.md](react-refactor-plan.md)），
`chenpeisheng.cn` 线上已走 React 版（E2E 五套 155 项 / 视觉对比 12/12 / resume 逐字等价 /
Lighthouse N5 通过：index.mobile 中位数 61 ≥ 基线 55）；`REACT_MIGRATED_PAGES=none` 为一键回退开关。
剩余收尾 = T26 观察三项（真机电池 / 一周无回归 / 到期备份线切换 + 旧文件删除）；
性能最大失血点登记为 **T25 Google Fonts 本地化**（移动档 LCP ~20s 根源，建站期即存在，非迁移回归）。

---

## 1. 状态约定

| 状态 | 含义 | 处理方式 |
|---|---|---|
| `待办` | 需要做，尚未排期 | 按明细里的步骤执行，做完更新状态 |
| `已决策暂缓` | 明确决定先不做，但保留完整做法 | 只有触发条件出现才重开，别当 bug 修 |
| `已决策不做` | 本轮明确不做（非删除，设计保留） | 不排期；重开需先改决策记录 |
| `待复核` | 记录可能过时，需先核实再决定 | 先核实，再改成 `待办` 或 `已完成` |
| `进行中` | 已开始执行且部分验收项通过，剩余项见明细 | 只做明细里未通过的项，别重复已通过的 |
| `可选` / `思考池` | 按需启用，未排期 | 不要当任务领 |

---

## 2. 待办总表

| ID | 事项 | 状态 | 优先级 | 影响范围 | 依据 |
|---|---|---|---|---|---|
| T1 | 验证 Resend 发信域名，放开任意收件人自动发信 | `已决策暂缓` | 高（唯一功能缺口） | `resume.html` 发简历到邮箱 | [resume-delivery.md §①b](resume-delivery.md) |
| T2 | 本地 git 引用与远端 `main` 对齐 | `已完成（2026-11-17）` | — | 本机开发 | 本文 §3.2 |
| T3 | 更新 `cloudflare-pages-deploy.md` 的过时描述 | `已完成（2026-11-18；2026-11-25 全文重写）` | 中（文档准确性） | 部署文档 | [cloudflare-pages-deploy.md](cloudflare-pages-deploy.md) |
| T4 | AI 问答助手 13.8「未做」清单复核 | `待复核` | 中 | AI 问答 / README | [ai-assistant-survey.md §13.8](ai-assistant-survey.md) |
| T5 | 预览子域 `*.pages.dev` 的 CORS 通配 | `已完成（2026-11-18）` | — | 预览部署的 AI 问答 / JD 匹配 | 本文 §3.5（含配置修复与全量回传踩坑） |
| T6 | 可选环境变量 `DELIVER_BCC` / `WALL_ADMIN_TOKEN` | `可选` | 低 | 转发备案 / 留言删除 | [resume-delivery.md §③](resume-delivery.md) |
| T7 | Pages CMS 账号授权状态确认 | `待确认` | 低 | 网页改文案 | [observability-and-cms.md §一.3](observability-and-cms.md) |
| T8 | AI 助手皮肤后续迭代池 | `思考池` | 低 | 右下角助手 | [ai-avatar-skins.md §9](ai-avatar-skins.md) |
| T9 | 里程碑 M5「本地推理演示通道」 | `已决策不做` | — | AI 问答 | [ai-assistant-survey.md D4](ai-assistant-survey.md) |
| T10 | 上线收尾：推送 JD 静态文件 + 云函数 `mode:jd` 生效 | `已完成（2026-11-17）` | — | AI 问答 / JD 匹配 | 本文 §3.10 / [jd-match.md §5](jd-match.md) |
| T11 | JD 匹配端到端验收（含 3 项人工复核） | `已完成（2026-11-18）` | — | JD 匹配 | 本文 §3.11 / [jd-match.md §4.3](jd-match.md) |
| T12 | JD 匹配迭代池（缓存 / 分享 / PDF / 追问直达 / 招聘方速览模式）——追问直达已随面板模式完成，其余仍在思考池 | `思考池（追问直达已完成）` | 低 | JD 匹配 | [jd-match.md §9](jd-match.md) |
| T13 | AI 助手面板内 JD 模式（模式切换 / 对话内紧凑结果卡 / 追问直达问答） | `已完成（2026-11-18）` | — | AI 问答 / JD 匹配 | [jd-match.md §10](jd-match.md) |
| T14 | 代码审视整改 P0：检索门控、JD 额度与行数、JD 日志脱敏、限流取 IP | `已完成（2026-11-18）` | — | 云函数 / 前端文案 | 本文 §3.14 |
| T15 | 代码审视遗留 P1/P2：语义向量、JD 额度落库、main.js 拆分、首屏 SSG、3D 预加载、弹窗焦点陷阱 | `待办` | 中 | 全站 | 本文 §3.14 |
| T16 | 计数与留言墙从 KV 迁到 D1（`/api/visits` + `portfolio-db`），摆脱第三方计数 | `已完成（2026-11-19）` | — | 顶栏计数器 / 留言墙 | 本文 §3.15 / [cloudflare-free-resources.md](cloudflare-free-resources.md) |
| T17 | 留言墙接入 Cloudflare Turnstile 人机校验（两档额度 + fail-open） | `已完成（2026-11-19）` | — | 留言墙 POST | 本文 §3.16 / [cloudflare-free-resources.md](cloudflare-free-resources.md) §7 |
| T18 | D1 备份脚本 `scripts/backup-d1.sh`（本机存 SQL 快照，不进仓库） | `已完成（2026-11-19）` | — | 数据安全 | 本文 §3.16 / [cloudflare-free-resources.md](cloudflare-free-resources.md) §8 |
| T19 | 可观测双路：Cloudflare Web Analytics 与 Umami 并行采集 | `已完成（2026-11-19）` | — | 访问统计兜底 | 本文 §3.17 / [cloudflare-free-resources.md](cloudflare-free-resources.md) §9 |
| T20 | 角色皮肤收敛为 `self3d` + `female3d`（删其余皮肤与资源、隐藏换肤入口，改由性别切换控制） | `已完成（2026-11-19；11-25 补 female3d）` | — | 右下角助手 | [pet-self3d-pipeline.md §6](pet-self3d-pipeline.md) |
| T21 | 桌宠表现力升级：眨眼 / 口型 / 首屏体积≤1.2MB / 对称正盘腿 / 启用躺平 / 坐→站过渡 | `待办` | 中 | 右下角助手 | [pet-self3d-pipeline.md §8](pet-self3d-pipeline.md) |
| T22 | 两个域名内容不一致：pages.dev 构建失败停在旧版，看不到新 3D 模型 | `已完成` | 高 | `pages.dev` 全站 | 本文 §3.18 / [cloudflare-pages-deploy.md](cloudflare-pages-deploy.md) |
| T23 | `assets/character-views` 原始素材归档 + 移出仓库根治构建（R2 方案废弃 → 飞书云盘） | `已完成` | 中 | 仓库体积 / Pages 构建 | 本文 §3.19 / [cloudflare-free-resources.md](cloudflare-free-resources.md) §10 |
| T24 | RAG / 简历增强迭代池：rerank 重排、动态简历变体、跨设备查看、`resume.micro` 微调流水线 | `思考池` | 低 | AI 问答 / 简历变体 / 留言板 | [p0-single-source.md §8](p0-single-source.md) |
| T25 | Google Fonts 本地化（自托管 Noto Sans SC 分片），根治移动档 LCP ~20s | `已完成（2026-11-28）` | 高（性能主优化项） | 全站移动档 LCP | 本文 §3.21 |
| T26 | React 迁移收尾观察：真机电池、一周线上无回归观察、到期后备份线切 React + 旧文件物理删除 | `待办（观察期）` | 中 | 全站 | [react-refactor-plan.md M5](react-refactor-plan.md) |
| T27 | 问答生成链路故障：线上 Pages 缺 `KB_WORKER_URL`/`KB_TOKEN`，且 KB Worker 未部署最新代码；变量已补、Worker 已重部署并线上验证 | `已完成（2026-11-27）` | 高 | `/api/chat` 数字分身问答 | 本文 §3.23 / [线上站点测试报告-2026-11-26.md](线上站点测试报告-2026-11-26.md) P1-1 |
| T28 | Turnstile 报 110200：widget 未渲染，留言墙人机校验实际未生效（CF 后台站点域名匹配） | `待办（配置侧）` | 高 | 留言墙 POST 校验 | 本文 §3.23 / 测试报告 P1-2 |
| T29 | Cloudflare Web Analytics beacon 被 CSP 拦截，CF 这一路统计未生效（仓库代码未下发该 script-src，疑面板规则） | `待复核` | 中 | 访问统计 | 本文 §3.23 / 测试报告 P2-1 |
| T30 | 头像 PNG 体积治理：avatar-male 疑似死资源；female 1536×1536 用于 ≤420px 展示位 | `待办（并入性能专项）` | 低 | 首屏 / 助手头像 | 测试报告 P3-2 |
| T31 | W-01 卡片「RAG 接入中 / GitHub Pages 部署」过时文案修正；仓库源已改，线上 D1 仍旧文案 | `待后台同步 D1 副本` | 低 | 首页 SEC.05 | 测试报告 P3-1 |
| T32 | 导航编号撞号：留言墙与博客都显示 11，且板块编号从 02 起跳（hero/footerPeople 占用序号） | `已完成（2026-11-27），待部署` | 低 | 首页 `#nav` | 本文 §3.23 / 测试报告 R-7 |
| T33 | 后台问答看板数据不渲染：`qaSchema.recent.empty` 误定 boolean，库里存 0/1 整数，parse 抛错致 `qa.data` 整体空 | `已完成（2026-11-27），待部署` | 中 | 后台问答看板 | 本文 §3.23 / 测试报告 P2-2 |
| T35 | AI 指路小票文案重复「去看看去看XX」：前缀「▶ 去看看」+ ROUTES.name 已以「去」开头 | `已完成（2026-11-28），待部署` | 低 | AI 数字分身指路票 | [全面验收报告-2026-11-28.md](线上站点全面验收报告-2026-11-28.md) BUG-01 / `js/ai-stage-link.js:76`（前缀改为「▶ 指路」） |

---

## 3. 逐条明细

### 3.1 T1 · Resend 发信域名验证（既有功能缺口）

**现状（2026-11-17 实测）**

| 收件人 | 结果 |
|---|---|
| `hi@chenpeisheng.cn`（Resend 注册邮箱） | 自动发信成功，`POST /api/deliver` → `201 {"ok":true,...}`，Resend 邮件 id `01a1e59e-…` |
| 其他任意邮箱（含测试邮箱 `1549735463@qq.com`） | Resend 403 `recipient_not_verified` → 接口返回该错误 → 前端显示 mailto 兜底 |

代码侧全部就绪：`functions/api/deliver.js`、前端弹窗、CORS、限流、邮件模板、Tests 均已上线并实测通过。
缺的只是 Resend 的**发信域名验证**：未验证域名时 `onboarding@resend.dev` 只能发给账号自己的邮箱，
这是 Resend 的平台硬规则，改代码绕不过去。

**前置条件**：需要一个自有域名。当前：

- Cloudflare 账号下 zone 列表为空；
- GitHub Pages 未绑自定义域名（无 CNAME）；
- 文档里举例的 `shenge.dev` 未注册；
- 域名 DNS 托管在 Cloudflare 时可由脚本直接加记录；托管在别的注册商则需本人登录后台添加
  （或提前登录好把后台交给代理人）。涉及**购买域名付款 / 第三方账号登录**必须本人操作。

**执行步骤（代码零改动）**

1. 准备自有域名（已有则跳过；没有则先在注册商购买，约 ¥10–60/年）。
2. Resend Dashboard → **Domains → Add Domain**，填入域名。
3. 按 Resend 给出的值添加 DNS 记录（SPF / DKIM / DMARC，通常 3–5 条），等待验证通过（一般几分钟）。
4. Cloudflare Pages 项目 `shenge-work` → **Settings → Variables and Secrets → Production**，
   把 `RESEND_FROM` 从 `Portfolio Resume <onboarding@resend.dev>`
   改成 `陈培胜简历 <resume@你的域名>`。
5. **重新部署**（Pages 控制台 Deployments → … → Retry deployment，或 push 一次触发自动构建）；
   Pages 环境变量修改后必须重新部署才生效。
6. 用真实邮箱端到端复测（见下方验收）。

**验收标准**

```bash
curl -s -X POST https://shenge-work.pages.dev/api/deliver \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://chenpeisheng.cn' \
  -d '{"to":"1549735463@qq.com"}'
# 期望 {"ok":true,...}；返回 recipient_not_verified 说明域名验证或 RESEND_FROM 未生效
```

- 浏览器打开 `resume.html` → 「发简历到邮箱」→ 填 `1549735463@qq.com` 提交，
  应显示发送成功、**不再出现 mailto 兜底按钮**；
- 该邮箱收到「陈培胜 · AI Agent 工程师 · 在线简历」，两个简历入口按钮可点；
- 在 Resend Dashboard → Emails 能看到 `Delivered` 状态；
- 记得清掉测试产生的 KV `deliver:*` 限流计数（本次已清过一次，做法见 `resume-delivery.md`）。

**代价与风险**：仅域名年费 + 约 10 分钟配置；Resend 免费额度足够。
不改任何前端 / 函数代码，`ALLOWED_ORIGINS`、`SITE_KV`、`RESEND_API_KEY` 都不用动。

**决策记录**：2026-11-17 站长在「我有域名 / 帮我买 / 先不配域名」中明确选择**先不配域名**，
2026-11-19 补充原因：**支付问题未解决**（比价 / 付款方式待定），不是忘了做。
保持「自动发信仅支持账号邮箱 + 其他邮箱 mailto 兜底」。
**重开触发条件**：访客反馈收不到自动邮件、或站长解决支付方式愿意提供 / 购买域名。

**2026-11-26 更新（域名已就位，DNS 侧已配好）**：
`chenpeisheng.cn` 已注册并托管 Cloudflare，DNS 里已存在 Resend 所需的三条记录 ——
`resend._domainkey`（根域 DKIM 公钥）、`send` 子域 SPF（ip4 段）与 `send` 子域 MX（`feedback.forge.rmta.net`）。
也就是说「未验证域名」这个前置条件**很可能已经解除**，剩下的动作只有两步：

1. ~~Resend 控制台确认 `chenpeisheng.cn` 状态为 `Verified`~~ ✅ 2026-11-26 已确认 **Verified**；
2. ~~Pages 生产环境把 `RESEND_FROM` 改成 `陈培胜 <hi@chenpeisheng.cn>` 并重新部署~~ ✅ 2026-11-26 已改并重试部署（`16864ceb`，12:52 success）。

**仅剩验收**：打开 `https://chenpeisheng.cn/resume` → 页尾「自动投递 ✉」→ 填真实邮箱提交，
确认页面不再出现 mailto 兜底、收件方看到的发件人是「陈培胜 `<hi@chenpeisheng.cn>`」。
注意 `/api/deliver` 有 PoW + 来源白名单 + Turnstile，直接 curl 会 `Forbidden`，只能走页面。

**2026-11-26 下午更新（复测发现回退，已修）**：走页面复测时出现
「自动发信尚未配置（缺 RESEND_API_KEY）」→ 接口实测 `503 resend_not_configured`，
即 `RESEND_API_KEY` 的**值为空**（变量名还在）。时间点与 12:50 在控制台编辑 `RESEND_FROM` 吻合，
判定为「编辑密钥行时整表提交把其它密钥覆盖成空值」。已在 Resend 新建 Sending key
（`pages-deliver-20261126`）重填并保存，**必须重新部署后才生效**。
为避免再次无感回退，新增 `scripts/mail-e2e-test.mjs`（自动过 PoW 的端到端复测，等价于真人点按钮），
以后改完任何邮件相关环境变量都跑：

```bash
node scripts/mail-e2e-test.mjs --to <自己的邮箱>   # 期望 200，且邮件真的到达
```

同一轮还发现更上游的问题：`hi@` 目前靠 Cloudflare Email Routing 转发到 QQ / Gmail，**只能收不能发**，
回信时发件人是私人邮箱；Gmail 的 `Send as` 第三方地址功能 2027-01 彻底下线。
完整诊断、选型与 MX 迁移步骤见 [email-deliverability.md](email-deliverability.md)，
迁移前后用 `node scripts/mail-dns-audit.mjs [--expect feishu]` 体检。

**该上游问题已于 2026-11-26 切换完成，收尾于 2026-11-27 全部做完**：MX 已指向飞书
（mx1/2/3.feishu.cn），`hi@` 在飞书能收能发，Cloudflare Email Routing 已停用；
飞书 DKIM 实测本就 PASS（selector `feishu2611261416`，此前「需超管启用」是误判），
DMARC 已升 `p=quarantine`，根域 SPF 收敛为只授权飞书，Resend 旧 key 已清理。
体检 `--expect feishu` 为 10 通过 / 0 告警 / 0 致命，改完复测投递 `201` 且三项认证全 pass。
详见 [email-deliverability.md](email-deliverability.md) §11。

---

### 3.2 T2 · 本地 git 引用与远端 `main` 对齐 ✅ 已完成（2026-11-17）

**结论**：本机 `github.com` 代理已恢复可达，`git fetch` / `git push` 均可用，**不再需要 Git Data API 中转**；
本地 `HEAD` / `main` / `origin/main` 已统一到 `941da91`。

**实测根因**：不是「代理不可达」，而是代理对 Git 的 HTTP/2 传输处理有问题——
`git ls-remote` 与 `curl https://github.com/.../info/refs` 都返回 200，但 `git fetch`
报 `Empty reply from server`。加 `-c http.version=HTTP/1.1` 后立刻成功。
已把两项参数写入本机 `.git/config`（**不入库**）：`http.version=HTTP/1.1` 与 `http.sslBackend=openssl`。
后者同样必要：Windows Git 默认的 `schannel` 在 push 时会报 `failed to receive handshake`，换成 `openssl` 才成功。代理偶有波动（`CONNECT tunnel failed, response 502` / 超时），失败重试即可，不必回退到 API 通道。

**实际执行步骤**：

```bash
git fetch --unshallow origin      # 若曾用 --depth=1 拉过，先补回完整历史
git status --short                # 对齐前备份现场：HEAD / git diff / 未跟踪文件
git reset --mixed origin/main     # 只移动 refs + index，不动工作区
```

> ⚠️ **原步骤里的 `git reset --hard origin/main` 是错的，别照抄**：工作区当时还有一批
> **未上线**的「岗位匹配 JD MATCH」改动与 `docs/ai-avatar-skins.md` 排版改动，
> `--hard` 会把它们全部抹掉。只有 `--mixed` 能在对齐 refs 的同时保住这些文件。

**验收（已通过）**：
- `git rev-parse HEAD` == `git rev-parse main` == `git rev-parse origin/main` == `941da91`，且仓库非 shallow；
- `git push origin main` **实测成功**（`941da91..b9e5706`，本条记录即由标准通道推送），推送后 `HEAD` / `main` / `origin/main` 三者一致；
- `git status` 从 17 项收敛到 **9 项**，且 5 个语音文件（`js/ai-voice.js`、
  `js/ai-voice-cloud.js`、`css/ai-voice.css`、`docs/ai-voice-survey.md`、
  `functions/tencent/tts.js`）全部识别为「已提交且内容一致」，不再显示 `??`；
- 剩余 9 项是**真实未上线工作**，与语音无关：6 个 `M`（`README.md` / `index.html` /
  `js/main.js` / `functions/tencent/{index,prompt}.js` 的 JD 改动、
  `docs/ai-avatar-skins.md` 纯排版）+ 3 个未跟踪（`css/jd-match.css`、
  `js/jd-match.js`、`docs/jd-match.md`）。这是下一条要处理的线，**别误当脏状态清掉**。

**顺带澄清**：`docs/resume-delivery.md` / `docs/TODO.md` / `docs/ai-assistant-survey.md`
对齐后自动变干净——此前显示的 `M` 只是「内容已入库、本地 refs 落后」造成的假象，无需再单独提交。

---

### 3.3 T3 · `docs/cloudflare-pages-deploy.md` 已过时，需更新

文档「当前实际形态（2026-11-11）」称 **Cloudflare GitHub App 尚未授权该仓库、push 不会触发自动构建**，
并说当前靠 macOS `launchd` 每小时跑 `sync-pages-from-github.sh` 同步。

**2026-11-17 实测证据（与文档相反）**：

- 远端 commit `d5de5afe`（18:41:23Z）后 3 秒，Pages 产生 production 部署 `0a522e4f`（18:41:26Z）；
- 部署 `deployment_trigger.type = github:push`，`commit_hash = d5de5afe…`，各 stage 全部 success；
- 自动构建后线上 `GET /api/wall?peek=1` → `200 {"ok":true,"open":true}`、
  `POST /api/deliver` → `400 bad_request`（正常参数校验），说明 `functions/` **没有被自动构建冲掉**；
- 当前开发机是 Windows，文档里的 `launchctl` / `~/Library/Logs` 方案不适用。

**要做**：把文档改成「**push 即部署为当前主链路**（GitHub 集成已生效），
`scripts/sync-pages-from-github.sh` / `deploy-pages.sh` 仅作兜底与紧急修复」；
删除或明确标注 macOS launchd 段落为历史方案；补一句「functions 不进 `dist` 仍会被 Pages 编译，自动构建不会丢 API」。
授权时间与授权人未在仓库中记录，如能查到请一并补上。

**验收**：文档描述的部署链路与线上实测一致，且不再出现「push 不会触发构建」的误导性结论。

**已完成（2026-11-25 全文重写）**：文档已从「备用托管 + 事故通报」改成「主站托管」结构：
部署链路（push 自动构建 / 构建产物规则 / 兜底脚本 / launchd 历史）、首次搭建与 fork、CORS、
与 GitHub Pages 的关系、2026-11-20 构建失败复盘、排障表。旧的「当前故障」段落已降级为历史复盘。
构建命令统一指向 `scripts/pages-build.sh`（不再摘录控制台里的旧 `cp -r` 白名单）。

**第一次修订（2026-11-18）**：`docs/cloudflare-pages-deploy.md` 的「当前实际形态」已重写为
「push 即部署为主链路（附 2026-11-17 的 `github:push` 实测证据）」，`sync-pages-from-github.sh` /
`deploy-pages.sh` 标注为兜底通道，launchd 段落明确列为历史方案并注明「换机后无需恢复」；
README 第 12 行同类表述同步修正，并补一句「functions 不进 `dist` 仍会被编译，自动构建不会丢 API」。
CORS 段也一并更新：`*.shenge-work.pages.dev` 已写入线上 `ALLOWED_ORIGINS`（2026-11-18 保存即生效）。
授权时间与授权人仓库内仍无记录，保持未知。

---

### 3.4 T4 · AI 问答助手 13.8「未做」清单复核

`docs/ai-assistant-survey.md` §13.8 写着：

> **未做**：知识库自动联动、CI 实跑、移动端实测、监控告警、README 项目章节。

但仓库现状已部分变化，直接照抄会把已完成的事继续当待办：

- `.github/workflows/build-kb.yml` 已存在（知识库自动联动 / CI 是否**实跑过**仍需查 Actions 运行记录）；
- `README.md` 功能特性第 10 条已有「3D AI 简历问答助手」及皮肤文档链接，但**架构章节 / 项目描述章节**是否补齐待核；
- 同节下方又写「回归脚本已补（见 13.11）」「网关限频改为函数内两级限流落地」，说明该段是阶段性记录，未回写。

**要做**：逐项核实五项（知识库联动 / CI 实跑 / 移动端实测 / 监控告警 / README 章节），
分别标成 `已完成` 或 `待办`；把结果回写 13.8，若仍有未完成项，在本文件 T4 下拆成独立条目并给验收标准。

**验收**：13.8 不再是无法判断时效的一句话；本文件 T4 状态从 `待复核` 改为明确结论。

---

### 3.5 T5 · 预览子域 CORS 通配（已完成，2026-11-18）

**问题**：函数代码本身支持 `*.` 通配（`DEFAULT_ORIGINS` 含 `*.shenge-work.pages.dev`），
但线上环境变量 `ALLOWED_ORIGINS` 是精确列表
`https://chenpeisheng.cn,https://shenge-work.pages.dev`，覆盖了代码默认值，
因此 `Origin: https://abc123.shenge-work.pages.dev` 一直 403 `origin_denied`。
**不是代码 bug，是线上配置没跟上**；`docs/jd-match.md` §4.3 里「随函数重部署自动生效」的推测不成立。

**处置（2026-11-18 02:14，Chrome 登录 CloudBase 新版开发平台）**：
环境 `resume-ai` → 云函数 `resume-ai-chat` → 函数配置 → 编辑 → 环境配置 → 环境变量，
把 `ALLOWED_ORIGINS` 改为
`https://chenpeisheng.cn,https://shenge-work.pages.dev,*.shenge-work.pages.dev`；
其余 5 个变量（`AI_API_KEY` / `TTS_REGION` / `TTS_SECRET_ID` / `TTS_SECRET_KEY` /
`TTS_VOICE_TYPE`）**一个没动**。**保存即生效**，无需重传代码、无需重新打包。

**复验（同轮线上直探）**：

| 探测 | 结果 |
|---|---|
| `POST /chat` + 预览子域 Origin | 403 → **400 `bad_request`**（已越过 CORS 层） |
| `OPTIONS` 预检 + 预览子域 Origin | 204，`Access-Control-Allow-Origin` 正确回显 |
| 主站 / 备站 Origin | 正常 |
| 外来域名 `evil.example.com` | 仍 403 `origin_denied` |
| 问答 `{"question":...}` / `{"mode":"tts"}` | 均 200，服务端密钥未丢失 |

> ⚠️ 仍要记住：走云 API `UpdateFunctionConfiguration` 时必须**全量回传**环境变量，
> 漏掉 `AI_API_KEY` 会让 `/chat` 立刻失效（见 §3.2）。控制台 UI 编辑会自动保留全部变量，
> 这次没触发该坑，但日后用 API 改配置仍按全量处理。

---

### 3.6 T6 · 两个可选环境变量（按需，非阻塞）

| 变量 | 作用 | 不配置时的行为 |
|---|---|---|
| `DELIVER_BCC` | 每封简历转发密送一份给站长备案 | 完全不经手，隐私更好（当前状态） |
| `WALL_ADMIN_TOKEN` | 留言墙管理员删除令牌 | `DELETE /api/wall` 不暴露（返回 404），删留言只能改 KV |

配置位置：Pages 项目 `shenge-work` → Settings → Variables and Secrets → **Production**；
`WALL_ADMIN_TOKEN` 建议随机 32 位；改完记得**重新部署**。
`./scripts/wall-check.sh --post --admin-token=<TOKEN>` 可验证删除链路（会提交一条测试留言并自动删掉）。

---

### 3.7 T7 · Pages CMS 授权状态待人工确认

`docs/observability-and-cms.md` 把 Umami Cloud、Pages CMS 标为「必做」，Clarity 标为「可选」。
仓库里 `js/analytics.js` 的 `umamiWebsiteId` 与 `clarityProjectId` **均已填好**（统计已接入）；
`.pages.yml` 也在。剩下 Pages CMS 的 **GitHub App 授权**属于必须本人登录点授权的账号操作，
仓库内无法判断是否已完成。

**确认方式**：登录 <https://app.pagescms.org> → 能看到「作品集内容（全站文案）」入口即已授权；
再改一处文案点 Save，观察是否生成 commit → Actions 重建 `site-data.js` → 约 1 分钟线上生效。
若未授权，按教程 §一.3 完成（只勾 `chenpeisheng.cn` 一个仓库）。

---

### 3.8 T8 · AI 助手皮肤后续迭代池（未排期，思考用）

来自 `docs/ai-avatar-skins.md` §9，**不是待办任务清单**，只是避免想法丢失：

- 体验层：语音播报（TTS）、口型同步、按回答内容切情绪动画；
- 能力层：点击彩蛋动作轮换、待机活动池、桌宠全局活动；
- 工程层：皮肤 JSON manifest / 外置皮肤包、AI 立绘工作流脚本化、3D 加载性能埋点与低端设备自动降级；
- §9.4 决策待办：是否上语音 TTS、狐狸 / 机器人默认选择、30 分钟打招呼冷却是否缩短。

需要排期时，先在本文件新建独立条目并给出验收标准，再动代码。

---

### 3.9 T9 · 里程碑 M5 本地推理通道（已决策不做）

`docs/ai-assistant-survey.md` 决策 **D4**：WebGPU / WASM 本地小模型推理本轮**不做**
（首次要下载 300MB–1.2GB 权重，常规访客体验不可接受），里程碑 M5 取消，但 §5.5 的设计保留。
在这里登记是为了避免以后被误当成「漏做的里程碑」重新捡起来。
**重开触发条件**：明确要做「对话数据不出浏览器」的面试演示道具，且能接受首次加载成本。

---

### 3.10 T10 · 上线收尾：推送 JD 静态文件 + 云函数 `mode:jd` 生效（已完成 2026-11-17）

**结论：两条发布链路均已走完，无需再部署、无需再 push。** 原先登记的「静态未 push / 云函数未
重部署」是开发当时的快照，现已被线上实测推翻（下面按事实链记录，避免后来者重复上线）。

1. **静态发布已完成**：提交 `7c7b5e1 feat(jd): 岗位匹配 JD MATCH 上线` 推送到 `origin/main`，
   共 10 文件（新增 `js/jd-match.js`、`css/jd-match.css`、`docs/jd-match.md`，修改
   `index.html`、`js/main.js`、`README.md`、`functions/tencent/index.js`、
   `functions/tencent/prompt.js`、本文档、`docs/ai-avatar-skins.md`）。GitHub Pages 已构建：
   生产首页 200、含 `id="jd"` 区块与 `js/jd-match.js?v=20261117a` /
   `css/jd-match.css?v=20261117a` 引用，语音资源 `js/ai-voice*.js?v=20261117c` 未被覆盖。
2. **云函数 `mode:jd` 已在线上生效**：并行会话部署语音链路时上传的 `functions/tencent/` 整包
   已同时包含 JD 与 TTS 两套路由，因此**不需要再单独重部署**。线上用真实 hy3 直探
   `POST /chat {mode:"jd", jd:...}` 返回 `ok:true` 与完整结构化 `match`（score 75、
   `covered 2 / partial 1 / gap 1`、真实切片 id 与 `ground`、缺口与追问点），无 `parse_failed`。
3. **一致性检查**：仓库 `functions/tencent/index.js` 为 JD + TTS 合并版（两套路由共存），
   `index.js` / `prompt.js` / `tts.js` / `server.js` 全部 `node --check` 通过；
   `HEAD == origin/main`，工作区干净。
4. **既有链路回归**：`{"mode":"tts",...}` → 200，问答 `{"question":...}` → 200，均未受影响。

**复用探测命令**（后续回归可用，返回「缺少 question」才说明函数退回旧版）：

```bash
curl -s -X POST https://resume-ai-d9g7zghnxda2ee2cb-1307508155.ap-shanghai.app.tcloudbase.com/chat \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://chenpeisheng.cn' \
  -d '{"mode":"jd","jd":"岗位职责：负责企业级 AI Agent 平台架构设计，含任务规划与多智能体编排；建设 RAG 检索链路并做召回评测。"}'
```

- 预览子域 CORS 通配（T5）已于 2026-11-18 通过控制台配置修复并复验，详见 §3.5。

---

### 3.11 T11 · JD 匹配端到端验收（已完成，2026-11-18）

**已通过（线上真实模型 + 真实浏览器）**：三个示例 JD 全部按固定结构出表（6.0–8.6 秒）；
证据 `src` 100% 命中 37 段真实切片；`jd_quota` 额度、注入拦截不占额度、CORS、非 JD 判定、
问答 / TTS 回归、1440 / 390px 四态渲染与 Markdown 导出均通过。生产域名真实点击示例
**8.79 秒出表**（score 72 / 7 行 / Markdown 1405 字符）、非 JD 新闻 `score=0` +「无法判断」、
太短与 1620 字超长均 400、非法 Origin 403、`OPTIONS` 预检 204 + CORS 回显、0 个 JS `pageerror`。
逐项数据见 [jd-match.md §4.2.1 / §6.3](jd-match.md)。

**原 3 项人工复核全部收口（2026-11-18）**：

| 项 | 结果 |
|---|---|
| 预览子域 CORS | 控制台把 `*.shenge-work.pages.dev` 追加进 `ALLOWED_ORIGINS` 后 403 消失；预检 / 主站 / 备站 / 外来域名 / 问答 / TTS 全部回归通过（详见 §3.5，T5 同步完成） |
| `chat_logs` 查库 | PostgreSQL SQL 编辑器：全表 **126 行**，`tag=jd` **11 行**，`q` 长度 2–300（均值 102）、手机号正则 0 命中、最新一条为单行岗位摘要，时间窗 11-17 23:46:37 → 11-18 00:07:49 |
| 移动端 | Chrome 移动设备模拟（`isMobile + hasTouch`，390 / 360 / 320px，DPR 3/3/2）全程 `tap()` 跑通 首屏 CTA → 示例 → 提交 → 结果 → 复制 → 重填 → 错误态；横向溢出 0、0 个 JS 错误、剪贴板 552 字符 |

**真机 WebView** 仍建议本人用手机打开 `https://shenge-work.pages.dev/#jd` 扫一眼
（确认字体渲染与 WebView 差异，约 30 秒）；桌面触屏模拟已覆盖布局与触摸事件，此项不再阻塞验收。
T11 置为 `已完成（2026-11-18）`。

---

### 3.12 T12 · JD 匹配迭代池（未排期，思考用）

来自 [jd-match.md §9](jd-match.md) 与同轮调研的备选方案，**不是待办任务清单**：

- 结果缓存：`sha256(JD)` 10 分钟内存缓存，重复点击不重复扣额度；
- 可分享链接：`?jd=` 压缩参数或短链，方便招聘方转给同事；
- 导出 PDF / 邮件：复用 `functions/api/deliver.js` 的 Resend 链路（注意 T1 的域名限制）；
- 追问点直达问答：点一条 `probe` 直接调 `/chat`，把对照表变成「面试预演」；
- 招聘方速览模式：同轮调研的备选方案（开关把整站切成 30 秒版，只留量化战绩与三个项目结论，
  成本一天以内；说服力弱于 JD 匹配，故本期未做）。

需要排期时，先在本文件新建独立条目并给出验收标准，再动代码。

---


### 3.14 T14 / T15 · 代码审视整改（2026-11-18）

**T14 已完成**（改动均在 `functions/tencent/`，前端只动文案；`node --test tests/*.test.mjs` 18 个用例全绿）

| # | 问题 | 改法 | 位置 |
|---|---|---|---|
| 1 | 检索把 0 分块当"依据" | 打分后 `score <= 0` 直接丢弃；阈值 0.01 → **0.05 绝对 + best×0.4 相对**，两者都过不了才回落关键词 | `index.js` `retrieve()` |
| 2 | 无关问题照样带上下文进模型 | 关键词兜底要求至少命中 2 个 bigram；`OFFTOPIC_WORDS` 补生活闲聊词（做饭 / 星座 / 电影…） | `index.js` `keywordScore()`、`prompt.js` |
| 3 | 词面缺口：问「教育背景」召回为空 | 标题命中加权 ×1.12–1.45；`section`（education / contact / skills…）意图加 0.06 兜底 | `index.js` `titleBoost()` `sectionHint()` |
| 4 | JD 解析失败也扣额度 | `jdQuotaRefund()`，在 `!AI_KEY` / kb 失败 / `no_match` / `parse_failed` 四处退款 | `index.js` `handleJD()` |
| 5 | 8 行截断与"逐条"文案矛盾 | 上限提到 10；API 返回 `meta.merged`；前端改「JD 拆出 M 条 → 合并为 N 个需求点」 | `index.js`、`prompt.js`、`main.js` |
| 6 | 页面称"JD 不入库"，实际存 300 字 | 日志只写 `jd:<sha256 前 10 位>` + 需求条数 + 覆盖度；页面文案改「正文不入库，只留哈希留痕」 | `index.js` `jdTag()`、`index.html` |
| 7 | `LOG_SALT` 默认固定常量，哈希可反推 | 显式 env → 由 `AI_API_KEY` 派生 → 实例级随机，不再有固定默认值 | `index.js` |
| 8 | 限流取 `XFF` 首段可伪造 | 优先 `x-real-ip` / `x-client-ip` / `cf-connecting-ip`，其次取 XFF **末跳**；新增全站日额度 `GLOBAL_LIMIT_PER_DAY` 熔断 | `index.js` `clientIp()` `globalQuota()` |
| 9 | 函数包知识库不随 CI 更新 | `build-kb.yml` 改跑 `--sync-functions`，加两份产物 `cmp` 同源校验，隐私闸门覆盖函数包 | `.github/workflows/build-kb.yml` |
| 10 | 本地发简历 403 | `deliver.js` 白名单补 `localhost/127.0.0.1:8877` | `functions/api/deliver.js` |
| 11 | 零测试 | 新增 `tests/rag.test.mjs`（18 个用例）、`.github/workflows/test.yml`（语法检查 + 单测 + KB 幂等） | `tests/`、`.github/workflows/test.yml` |

**线上状态（2026-11-18 04:50 已部署并冒烟）**

- 云函数 `resume-ai-chat` 部署到 `$LATEST`，`CodeSize` 47783 字节，与本地包一致；环境变量未变。
- 线上实测：问「他的教育背景」→ `sources` 只有 `edu-01`（0.06，章节意图生效，此前会带 0 分块）；
  问「他会不会做饭」→ 固定话术拒答且 `sources` 为空；JD 过短 → 400；
  正常 JD → `ok:true`、score 65、5 个需求点，`meta` 里出现 `merged` 字段。
- 静态侧 GitHub Pages 已构建：`index.html` 显示「JD 正文不入库，只留哈希留痕」、`js/jd-match.js` 已带合并文案。

**T15 仍是待办**（按优先级）：

- **知识库覆盖缺口**：站点功能（留言墙、AI 语音、JD 匹配、四套主题）没有对应切片，问「留言墙用的什么存储」会答不上。
  正确做法是在 `site-data.json` 增一个 `features` 段落并在 `build_kb.py` 里切块，**属于内容改动，需站长确认措辞后再动**。
- **语义向量**：`build_kb.py --provider zhipu` 已支持，切换后 `index.js` 的 `loadKB` 需要放开 provider 校验并改检索实现。
- **JD 额度落库**：`jdQuota` 仍是单实例内存，冷启动归零；要彻底防刷需按 `tag=jd` 查 `chat_logs`（PostgREST 过滤写法需先验证）。
- **main.js 拆分 / 首屏 SSG / 3D 条件预载 / 弹窗焦点陷阱**：详见评估文档「P1/P2」章节，均为独立改动、无需与本次一起做。
- **本地联调通道**：`scripts/dev-api-server.mjs` 只代理 `functions/api`（wall / deliver），问答走的仍是线上云函数；
  本地静态站在 8877，云函数白名单只认 8000，所以本地点「问一句」会 403。要么把前端起在 8000，
  要么给云函数配 `ALLOWED_ORIGINS` 环境变量（不建议为调试永久放宽线上白名单）。

### 3.15 T16 · 计数与留言墙迁到 D1（已完成，2026-11-19）

**背景**：盘点 Cloudflare 免费额度时发现两处真瓶颈——KV 免费只有 **1,000 写/天**，而计数每 PV
写一次、留言每次写 3–4 个键，日 PV 上千就会静默耗尽（前端失败会回退，表现只是「数字不涨」）；
同时自建计数 Worker 因 `workers.dev` 境内被墙从未上线，前端一直依赖第三方 `abacus`，
而 2026-11-19 实测 `abacus /get` 已返回 `{"error":"Failed to get data..."}`，取不到历史值。

**方案**：不买域名也能解——把计数接口放进 Pages 项目自己的 `/api/visits`（`shenge-work.pages.dev`
是既有可用链路），存储换 D1。留言墙同步从「KV 单条 JSON 数组」改为 D1 表（真 SQL 分页、
并发不再互相覆盖）。

**改动**：新增 `db/schema.sql`（`counters` / `visitors` / `wall_messages` / `rate_limits`）、
`functions/api/visits.js`、根 `wrangler.toml`；改写 `functions/api/wall.js`、
`js/visitor-count.js`（默认 `provider:'pages'`，abacus/worker 保留可切）、
`scripts/dev-api-server.mjs`（node:sqlite 适配层）、`scripts/wall-check.sh`（诊断文案）；
`worker/wrangler.toml` 标注为备用实现。**`deliver.js` 未动**（发信限额写量仅约 90 写/天，不冒风险）。

**线上配置**：D1 `portfolio-db`（id `022be169-a84e-4791-b2f2-ee4f9c4f17c8`）已建表；
Pages 生产环境已加 `DB` 绑定（API PATCH 实测是合并语义，`SITE_KV` 与三个环境变量全部保留）；
代码随 `427a12d` push，部署 `427a12db` success。

**验收**：本地 10 项、线上 6 项全通过（含同访客 `isNew:false`、非法 id 400、非白名单 Origin 403）；
测试数据已清理，`GET /api/visits` 复查 `total:0, visitors:0`。
留言写入**未在生产 POST 验证**（线上无 `WALL_ADMIN_TOKEN`，测试留言删不掉），改在本地完成。

**踩坑记录**：访客去重最初用 `INSERT ... ON CONFLICT DO UPDATE`，该写法在 ID 已存在时也执行 UPDATE、
`meta.changes` 恒为 1，会让 visitors 随每次 PV 增长；已改为 `INSERT OR IGNORE` + 单独刷新 `last_seen`。

**已知遗留（不阻塞）**：预览环境未绑 D1（留言墙在预览页仍是 `open:false`，与改动前一致）；
计数历史值无法迁移（abacus 取数失败），从 0 起算；`WALL_ADMIN_TOKEN` 仍未配（见 T6）。

---

### 3.16 T17 / T18 · Turnstile 人机校验 + D1 备份（已完成，2026-11-19）

**为什么是 Turnstile**：翻完 Cloudflare 免费清单，能同时满足「免费 + 不需要域名 + 有真实收益」
的只有它（无限验证、20 widget，可独立使用）。R2 看着能当图床，但 `r2.dev` 官方明确说非生产用
（有速率限制、带宽会被压、不支持缓存），公开访问必须绑自定义域 —— 没域名前做不了。

**先实测再上线**（深圳本机）：`challenges.cloudflare.com` 可达，`api.js` 302 → 版本化路径 200、
86 KB、约 1 秒，连测 5 次全通。**但本机是宽带，4G 复核仍待办**（见下方遗留）。

**改动**：`functions/api/wall.js` 校验 `turnstileToken` 并分两档额度
（通过→每 IP 10 分钟 3 条；未通过/未带→每 IP 每小时 1 条、每日 10 条，两档分 bucket 不互相挤占）；
`index.html`/`js/main.js` 懒渲染 widget（等不到脚本就保持 hidden）；`scripts/backup-d1.sh` 新增。
secret 用 `wrangler pages secret put` 单点写入，避免 PATCH 整体覆盖掉 `RESEND_API_KEY`。

**设计取舍：刻意 fail-open**。脚本被墙/加载失败时留言仍可用，只是降到严格档。宁可少挡一点刷子，
也不能让正常访客彻底留言不了 —— 这与站点「降级但不死」的一贯做法一致。

**验收**：本地两档行为符合预期（未配 secret 与改动前完全一致；配 secret 后不带 token 第 2 条即 429）；
线上 `GET /api/wall` 回 `turnstile:true`，无 token 连发 201 → 429（`verifyRequired:true`）；
测试数据已清理，`total:0`。

**两个踩坑**：
1. 部署后 **Functions 生效慢于静态文件**，首次测「第 2 条也通过」其实是还在跑旧函数，等约 2 分钟复测才正常。
2. 复测时第 3 条又通过，查 `rate_limits` 发现是**出口 IP 双栈切换**（两个不同 IP hash 各允许 1 条），
   不是代码 bug；对真实访客最多放宽到 2 条，且有 `wall:day:strict` 每日 10 条兜底。

**遗留（不阻塞）**：
- 带**有效** token 的完整链路已由站长在浏览器补验（2026-11-19 05:20）：`rate_limits` 里出现
  无 `strict` 前缀的 `wall:ip:` 与 `wall:day`，说明校验通过、走正常档，留言正常入库（`wmwmml7td31d0p`）。
- 手机端（移动网络）Turnstile 脚本可达性已验证：站长手机上小组件正常显示（2026-11-19）。
  至此「可达 / 校验通过 / 未通过降档」三项全部实测完成，本任务可归档。
- 预览部署 hostname 未登记（免费版不支持任意 hostname），预览页留言墙本就 `open:false`。

---

### 3.17 T19 · 可观测双路（已完成，2026-11-19）

**目标**：Umami 之外再加一路独立采集，任一路被拦或额度打满，另一路仍能看出量级。

**为什么是 Web Analytics**：免费不限量、无 cookie、只记页面浏览。它不参与事件体系，
所以不能替代 Umami（滚动深度、项目打开、留言提交这些自定义事件仍只有 Umami 有）。

**已做**：`js/analytics.js` 新增 `CONFIG.cfBeaconToken` 与 `loadCloudflareBeacon()`，
token 留空完全不发请求；加载失败静默，不牵连 Umami/Clarity。`node --check` 通过。
实测 `static.cloudflareinsights.com` 境内可达（5/5 200，31KB，0.6–0.9s）。

**绕不开的一步**：wrangler 的 OAuth 登录态没有 RUM 权限，`/rum/site_info` 的 list 与 create
都返回 `10000 Authentication error`，scope 里也确认没有 analytics 项（有 `challenge-widgets.write`，
所以 Turnstile 能自动建站点、Web Analytics 不能）。最终在控制台建了站点
`chenpeisheng.cn`，token `e8d13ee29814404299a92efbdea4b73e` 填入 `cfBeaconToken`。

**pages.dev 建不了独立站点**：给 `shenge-work.pages.dev` 单独 Add site 时，「完成」始终置灰、
主机名一失焦就被清空 —— 该表单只接受账号下的 zone 域名。两个 host 因此共用一个 token，
beacon 从 `pages.dev` 上报同样 200，数据归到同一站点。

**线上验收**：浏览器打开 `shenge-work.pages.dev` 抓请求，`cloudflareinsights.com/cdn-cgi/rum`
多次 OPTIONS+POST 全 ok，同时 `cloud.umami.is/script.js` GET ok —— 两路并行成立。

**注意**：CF 与 Umami 口径不同（CF 更严，剔除部分爬虫与预加载），两边 PV 对不上是正常的，
不要当成 bug 去修。

---

### 3.18 T22 · 两个域名内容不一致：`pages.dev` 停在旧版（2026-11-20，已直传止血 / 自动构建待根治）

**用户报告**：打开 `github.io` 且挂海外代理能看到新女性 3D 模型；打开 `pages.dev` 仍是旧模型、看不到新形象。

**实测证据（2026-11-20，两站线上直取对比）**

| 探测 | `github.io` | `pages.dev` |
|---|---|---|
| `index.html` 字节数 | 29,042（= 本地最新） | 28,985（旧） |
| `index.html` 脚本引用 | `ai-skins.js?v=20261120K5` | `ai-skins.js?v=20261119M` |
| `js/ai-skins.js` 大小 | 37,377 B | 35,903 B |
| 脚本内含 `female3d` | ✅ 有 | ❌ 无 |
| 脚本内模型版本 | `MaleRigged.glb?v=20261120H` / `FemaleRigged.glb?v=20261120K` | 无 female 项 |
| `MaleRigged.glb` 响应 | 200 `model/gltf-binary` | 200 `text/html`（兜底页，文件其实不在产物里） |

> 顺带澄清用户说的「开海外代理才能看到模型」：`github.io` 的模型文件本身两站都在、MIME 正确，
> 是否挂代理只影响境内到 GitHub Pages 的连通性，与模型是否上线无关；`pages.dev` 的问题是**内容旧**，
> 不是网络问题。

**根因（已定位到 Cloudflare 构建日志）**

- `wrangler pages deployment list --project-name=shenge-work` 显示：自 `aedf7ac`（11-20）起的
  **7 个 production 部署全部 `Failure`**；线上真正在跑的是 23 小时前的 `01b2e1f`（11-19）。
- 失败部署 `5a1edb2a`（commit `6dff252`）的 build log 原文：
  ```
  Executing user command: mkdir -p dist && cp -r index.html resume.html css js data images videos assets favicon-64.png favicon.png dist/
  ✘ [ERROR] Error: Pages only supports files up to 25 MiB in size
    assets/character-views/model/female/female.fbx is 27.5 MiB in size
  Failed to validate assets in the output directory with code: 1
  ```
- 即：构建命令把**整个 `assets/`** 拷进 `dist`，其中包含 526MB 的混元/Mixamo 原始素材
  （`female.fbx` 27.5MiB、`MaleRigged_raw.glb` 49MiB 等多个 >25MiB 文件），触发 Pages 单文件上限。
- 为什么 `github.io` 没坏：GitHub Pages 从仓库根发布、不吃这条 `cp -r` 构建命令，也没有 25MiB 上限，
  所以新提交正常生效。两条链路的分叉点正是 `907a108`（首次把原始素材入库，11-20）。

**修复（两条路，先做①止血，再做②根治）**

① **立即让 pages.dev 追平**（不依赖 R2、不依赖支付方式，已备好）：
```bash
cd /Users/shenge/Documents/chenpeisheng.cn
./scripts/deploy-pages.sh --dry-run   # 已验证：79 文件 / 33MB，无 character-views，无 >25MB 文件
./scripts/deploy-pages.sh             # 走 wrangler 直传，绕过会失败的 GitHub 集成构建
```
`scripts/deploy-pages.sh` 已改：assets 用 `rsync -a --exclude='character-views' assets "$STAGE/"`。
**注意**：这只是绕过自动构建；只要 Cloudflare 控制台的 build command 还写 `cp -r ... assets ... dist/`，
下次 push 仍会失败。想一劳永逸需在 Pages 项目 Settings → Build 把命令改成排除 `character-views`
（或等 T23 把素材移出仓库后改回默认）。

② **根治（2026-11-21 已执行）**：见 T23——把原始素材整目录归档到飞书云盘、从 git 移除并 push，
   build command 不再碰到大文件，自动构建随之恢复。**无需改 build command、无需 R2/支付**。

**止血执行结果（2026-11-20 23:50，①完成）**

```
WRANGLER_BIN=~/.npm/_npx/3ab751a803c3c994/node_modules/wrangler/bin/wrangler.js ./scripts/deploy-pages.sh
→ 70 文件 / 33MB；✨ Success! Uploaded 11 files (43 already uploaded)
→ Deployment complete: https://6241af37.shenge-work.pages.dev  (Production / main)
→ /api/wall open=true
```

- `pages.dev` 与 `github.io` 现均引用 `ai-skins.js?v=20261120K5`，脚本均含 `female3d`；
  两个 GLB 从两站均返回 200。首页 md5 本地 = 线上 = `efe367f5521b35298ccd1c60487c89dc`。

**根治执行结果（2026-11-21，②完成）**：素材移出仓库后 push 触发 Cloudflare 自动构建，
部署从 `Failure` 转为 `Success`，两站内容一致。详见 §3.19。

**验收标准**
- `curl -sL https://shenge-work.pages.dev/js/ai-skins.js?v=20261120K5 | grep -c female3d` ≥ 1；
- `pages.dev/index.html` 的脚本引用与 `github.io` 一致（`ai-skins.js?v=20261120K5`）；
- 两个 `GLB` 从 pages.dev 取回应为 `model/gltf-binary` 而非 `text/html`；
- 浏览器打开 pages.dev 能看到男/女 3D 形象；~~G 键 / 左下角透明按钮切换~~（2026-11-25 起移除，套装改由后台「展示套装」开关控制，访客端不可自行切换）。

---

### 3.19 T23 · 大文件归档到飞书云盘 + 移出仓库（2026-11-21，已完成）

**背景**：`assets/character-views/` 共 **573MB / 57 个文件**（混元 3D + Mixamo 原始素材，
页面未引用，见 [pet-self3d-pipeline.md §6](pet-self3d-pipeline.md)），其中多个单文件 28–49MiB。
它一方面把工作区撑大，另一方面直接导致 T22 的 Pages 构建失败。

**方案变更（R2 → 飞书云盘）**
- 原方案 Cloudflare R2 废弃：账号（`ead07d9f…`，`hi@chenpeisheng.cn`）**无可绑定支付方式，R2 无法启用**，
  `r2 bucket list/create` 报 `10042 Please enable R2 through the Cloudflare Dashboard`，无自助启用 API。
  `scripts/r2-sync.sh` / `r2-cors.json` 保留作历史参考，但当前不再使用。
- 新方案：**飞书云盘整目录归档**（用户 2026-11-21 选定）。飞书 connector 已登录（用户 `sheng`），
  云空间容量足够，支持整目录镜像与分片上传，日后可原样 `+pull` 拉回继续做模型。

**执行结果（2026-11-21，已完成）**
1. 建归档文件夹：`https://my.feishu.cn/drive/folder/BnalfpLM8lzNYLdkYu3cqH71nAc`
   （folder_token `BnalfpLM8lzNYLdkYu3cqH71nAc`）。
2. `lark-cli drive +push --as user --local-dir assets/character-views --folder-token <上述> --if-exists skip`
   → 首批 51 文件 + 补传 6 个 Thinking 素材，合计 **57 文件全部上传、failed=0**；
   7 个子目录结构与本地一致。抽样下载 `Idle.fbx`，MD5 与本地逐字节相同（`589df972…`）。
   `+status` 复核 `new_local=0`，云端已覆盖全部本地文件。
3. `git rm -r --cached assets/character-views` + `.gitignore` 加 `assets/character-views/`：
   文件从 git 索引移除但**本地物理文件保留**（仍可用于离线模型流水线），以后不会再误入库。
4. commit + push → 触发 Cloudflare Pages 自动构建，从连续 `Failure` 恢复为 `Success`（T22 根治）。

**拉回方式（需要重做模型时）**
```bash
cd /Users/shenge/Documents/chenpeisheng.cn
lark-cli drive +pull --as user --folder-token BnalfpLM8lzNYLdkYu3cqH71nAc \
  --local-dir assets/character-views
```

**未做 / 边界**
- **git 历史瘦身未做**：`git filter-repo` / BFG 重写 + 强推是破坏性操作，本次未执行。
  工作区已不含大文件、构建已恢复，但 `.git` 历史对象里仍保留旧素材体积；彻底瘦身需另开一次专门操作。
- 视频 `videos/lessie-demo.mp4`（9.8MB）仍在仓库、未被 `data/site-data.json` 引用改动，低于 25MiB 上限，不受影响。
- 旧 commit 的线上预览链接可能引用已移除素材，但生产环境不使用历史预览，无需处理。

---

### 3.20 T24 · RAG / 简历增强迭代池（思考池，2026-11-25 登记）

来源：[p0-single-source.md §8](p0-single-source.md) 的未勾选项。均为增强项，**不阻塞既有线上功能**，未排期；触发条件出现后再从思考池领出。

| 候选项 | 说明 | 前置 / 验收参考 |
|---|---|---|
| rerank 重排 | 混合检索召回后加一道重排（如 Workers AI reranker），提升长尾问题命中 | 金标集 hit@3 不下降；延迟与 CPU 在免费额度内 |
| 动态简历变体 | 按岗位 JD 切换简历侧重（`variants/` 已有生成链） | 变体仍 ≤2 页，L0 锁定字段不被改写 |
| 跨设备查看 | 设备绑定码：留言 / 档案可跨自己的设备访问 | 不破坏现有设备隔离的隐私边界 |
| `resume.micro` 微调 | L0 锁定字段注入提示词的本地微调流水线 | 先有评测集再谈微调；优先级低于规则与检索优化 |

> 注：早期文档里「给 Pages 项目挂 `[ai]` / `[[vectorize]]` 绑定」的方案已被替代——`AI` / `VECTORIZE`
> 绑定在 KB Worker（`worker/kb/`）上，Pages 不支持这两类绑定，见 README [系统架构](../README.md#系统架构)。

### 3.21 T25 · Google Fonts 本地化（性能主优化项，2026-11-26 登记）

**来源与证据**：M5 生产切换后的 Lighthouse 对照（`tests/e2e/baseline/lighthouse-post-react/`）——
模拟 4G 节流下 Google Fonts 异步 CSS ~15s 才完成（`fonts.googleapis.com` / `fonts.gstatic.com`
两跳境外请求），font-swap 后的 heroBio 大文本成为 LCP，移动档 LCP ~18–23s、
desktop ~20s。该依赖自建站起就存在（M0 基线 mobile LCP 25.3s 同根源），**不是 React 迁移引入的回归**
（迁移版 index.mobile 中位数 61 ≥ 基线 55，N5 通过）；但它是当前性能分数的最大失血点。

**方案方向**（执行时二选一或组合）：
1. **自托管子集化**（推荐）：Noto Sans SC 按站点实际用字子集化（glyphs 压缩到几十 KB 量级），
   放 `css/fonts.css` 同款自托管路径（仓库已有本地自托管先例：等宽字体 `Space Mono` 走
   `css/fonts.css?v=`，断境外 CDN 不影响渲染）；`display=swap` 语义保留。
2. 整站系统字体栈兜底已有（`PingFang SC / Microsoft YaHei`），最激进方案是干脆移除 Noto Sans SC
   ——视觉一致性会受 macOS/iOS 与 Windows 差异影响，需与 N1 视觉零变化目标权衡。

**验收标准**：Lighthouse mobile 档 LCP < 5s（量级目标）；`fonts.googleapis/gstatic` 不再出现在
network-requests；四主题视觉对比 12/12 不回归（字体渲染差异属可控噪声内）；构建产物无新增境外请求。

**注意**：首页同时存在 `?v=` 缓存串与 `manifest.json` 等本地资产，改动走 `css/fonts.css` 时
记得升 `?v=`（M3-B 桥接脚本约束：Astro 会把非 `is:inline` 的 stylesheet 打包合并，保持模板内联引用方式）。

#### 落地记录（2026-11-28，已完成）

**做法**：没有按方案 1 做「按站点用字子集化」，改成**整份镜像 Google 的可变字体分片**（更稳、零缺字）：

- 数据源 `https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@100..900`，返回 **101 个
  `@font-face`**（同一可变字体按 unicode-range 切成的 woff2 分片，`font-weight: 100 900`）。
- 分片全部下载到 `fonts/noto-sans-sc/`（**4.3 MB / 101 个文件**，单个 30–90 KB，远低于 Pages 25 MiB 上限），
  文件名为 `noto-sans-sc.<N>.woff2`；CSS 生成到 `css/noto-sans-sc.css`（103 KB，gzip 后约 20 KB）。
- **`unicode-range` 原样保留**：浏览器只为页面实际出现的字符下载命中分片，首屏实测只拉 24–25 片、
  共约百 KB 级，而不是一次下完整套；`font-display: swap` 语义不变。
- 之所以不做「站点用字子集化」：单文件虽只有 1 个请求，但访客贴进 JD 的任意汉字（公司名、专业术语）
  会缺字回退到 PingFang，视觉不统一；分片方案保留与 Google 完全一致的字形覆盖，成本是多几个同源小请求
  （Cloudflare 走 HTTP/2 多路复用，代价很小）。

**改到的地方**：

| 位置 | 改动 |
|---|---|
| `css/noto-sans-sc.css` | 新增，101 个 `@font-face` 指 `/fonts/noto-sans-sc/*.woff2` |
| `fonts/noto-sans-sc/` | 新增 101 个 woff2 分片 |
| `src/pages/{index,jd,company,school}.astro` | 删 `preconnect` + Google CSS link + `noscript` 双份，换成 `<link rel="stylesheet" href="/css/noto-sans-sc.css">` |
| `src/layouts/SiteShell.astro` | 补同一条（作品案例页 `/work/portfolio` 一并收口） |
| 旧链 `index.html` / `jd.html` / `company.html` / `school.html` / `resume.html` / `variants/agent-2026.html` / `templates/resume.template.html` / `functions/lib/resume-template.js` | 同上（简历长图 / 邮件模板也吃同一套） |
| `scripts/pages-build.sh` | 静态资源白名单加 `fonts`；⑥ 硬校验加 `css/noto-sans-sc.css` 与分片 `.4` |
| `scripts/fetch_noto_fonts.py` | 新增可重跑生成器（`--check` 只校验分片齐全），字体升级时跑一次即可 |

**顺带修掉的构建故障**：`pages-build.sh:179/184` 的 `"… $src（替代旧产物）"` —— 变量名后面紧跟全角
「（」，bash 把全角字节算进变量名，`set -u` 下报 `src…: unbound variable`，整站构建在混排段直接失败。
改成 `${src}` 显式边界。（这是本次提交前工作区已有的未提交改动带进来的，不是旧脚本问题。）

**校验结果**：

- `scripts/fetch_noto_fonts.py --check`：101 引用 / 0 缺失；重跑生成幂等。
- `bash scripts/pages-build.sh`：363 文件 / 57 MB，产物含 `dist/fonts/noto-sans-sc/`（101 片）与
  `dist/css/noto-sans-sc.css`；`dist/index.html` 里 `fonts.googleapis` 命中数 **0**。
- Playwright（系统 Chrome，390×844）：`/`、`/resume`、`/jd` 三页 `document.fonts.check('Noto Sans SC')`
  全部 `true`、`document.fonts` 里有 Noto 记录；首屏字体请求 24 / 25 / 16 个，**全部 200，零 4xx**，
  页面零 JS 报错；截图排版与改前一致（标题字重、行高、断行无变化）。
- 唯一保留的 `gstatic` 引用是 3D `model-viewer` 的 Draco 解码器（`assets/skins/vendor/model-viewer.min.js`
  内置默认地址），与字体无关，后台 CSP 已白名单该域。

**线上验收（部署后补）**：Lighthouse mobile 跑 `chenpeisheng.cn`，对比 pre-T25 的 62 分基线看
LCP / FCP 与 `network-requests` 里是否还有境外字体域。

### 3.22 T26 · React 迁移收尾观察（2026-11-26 登记，观察期至 12-03）

M0–M5 已全部完成并生产切换（线上 React 版运行中，`REACT_MIGRATED_PAGES=none` 为回退开关）。
本条目挂三项非阻塞收尾，全部有明确到期条件：

| 子项 | 内容 | 触发 / 验收 |
|---|---|---|
| 真机电池 | iOS Safari + 微信内置浏览器 + Android Chrome（§5.8 矩阵 + 简历投递 / 分享卡下载入口） | 手动走查：主题切换、AI 面板全流、JD 提交、分享卡下载；微信内重点看输入键盘顶起 / webview 差异 |
| 一周观察 | 线上无回归观察（D6 双开语义在生产切换后的延续） | 期间留意 AI 问答 / 投递 / 留言墙真实用户路径；发现异常先回退（none 开关）再排查 |
| 备份线切换 | 观察期满且无回归：GitHub Pages 备份线也切 React 产物，随后执行旧 HTML / js 旧模块 / `_*.html` 探针的物理删除（方案 §6-M5） | 删除前 `REACT_MIGRATED_PAGES=none` 回退路径测试一次；删除后备份线全页 200 复验 |

> 唯一已知怪癖（不阻塞）：ai-voice.js 的 `inlineEl`（自动播放被浏览器拦截时的面板内 CTA）
> 会在 React 下次 reconcile 消息列表时被移除；出现概率极低，M5 收编语音模块时一并处理
> （详见 [react-refactor-plan.md](react-refactor-plan.md) M3-B「遗留」段）。

### 3.23 T27–T31 · 2026-11-26 全站线上实测发现项

> 来源：2026-11-26 以访客身份逐页 / 逐接口实测 chenpeisheng.cn，完整记录与证据见
> [线上站点测试报告-2026-11-26.md](线上站点测试报告-2026-11-26.md)。只读验证为主，写操作
> （留言、投递、核验申请、后台）未擅自提交。

**T27 · 问答生成链路故障（高，已修复）**

- 现象：`POST /api/chat` 返回 200 但 `answer` 恒为兜底话术「这条我暂时答不上来（模型服务不可用）…」；
  检索 citations 正常命中，故障只在生成环节。
- 根因（两层）：
  1. 线上 production Pages 未注入 `KB_WORKER_URL` / `KB_TOKEN`，`callWorker` 在 fetch 前直接返回
     `no-worker`；本地 `.secrets.local` 两值齐全，仅线上缺失。
  2. 补上变量后 `failReason` 变为 `worker-http`：`resume-kb-api` Worker 仍停留在 2026-11-25 的旧版本，
     `/chat` 的 `env.AI.run` try/catch 与 `empty-text` 判定未上线；同时 Worker 侧 `KB_TOKEN` 与 Pages
     侧需重新对齐。
- 修复（2026-11-27）：
  - `functions/api/chat.js`：`callWorker` 细分 `no-worker / worker-http / worker-bad / empty-text`；失败
    原因写 `qa_logs.model`；响应带 `degraded` / `failReason` / `answerSource`。新增 `localAnswer()`：
    Worker 不可用时只从命中切片保守摘录，联系方式直接给公开联系方式，**不再把「模型服务不可用」等内部
    术语暴露给访客**，citations 照常可核对。
  - Cloudflare Pages（production）：用 wrangler 写入 `KB_WORKER_URL` / `KB_TOKEN` 两个 secret。
  - `resume-kb-api` Worker：重新写入 `KB_TOKEN`，并用 `wrangler deploy --config worker/kb/wrangler.toml`
    部署最新代码（AI / Vectorize / D1 绑定正常）。
- 线上验收（2026-11-27，`chenpeisheng.cn` 与 `shenge-work.pages.dev` 双域名一致）：
  - 「怎么联系你？」→ 模型生成回答，`degraded:false`、`answerSource:"worker"`、`semantic:true`；
  - 「你主导过哪些 0→1 系统？」「你的 Agent 架构经验？」「技术栈与方向？」均返回真人风格答案，
    无降级、citations 正常。
- 2026-11-27 二次复验（两互证均通过）：
  - `POST /api/chat`（q=你做过哪些项目？）：`ok:true`、`degraded:false`、`answerSource:"worker"`、
    `failReason:null`、`ms:2435`、3 条 citations，回答为模型真人风格；
  - `GET /api/admin/kb`：200、`worker_ready:true`（修复前为 false），与 chat 侧互证 Worker 链路在线。
- 注：`*.workers.dev` 在境内本地 DNS 被污染，直连超时不代表 Worker 离线；以 Pages 边缘调用与线上响应为准。

**T28 · Turnstile 110200，留言墙校验未生效（高，配置侧）**

- 现象：控制台反复 `[Cloudflare Turnstile] Error: 110200` + postMessage origin 不匹配；`.wall-turnstile`
  容器无 challenge iframe，widget 走 error-callback 隐藏；challenge-platform 持续 failure_retry。
- 代码侧核对结论：sitekey `0x4AAAAAAGHnx0m992aGGpUJ`（`js/main.js`）与服务端
  `TURNSTILE_SECRET`（`functions/api/wall.js`）配对逻辑正常；110200 是前端站点校验阶段错误，
  根因在 Cloudflare 后台，代码改不了。
- 待办：CF 控制台 → Turnstile → 该 sitekey，确认托管域名包含 `chenpeisheng.cn`、
  `shenge-work.pages.dev` 及预览子域；核对 widget 类型与前端 `size:'normal'` 一致。
- 验收：留言墙渲染出 checkbox / challenge，提交时 `cf-turnstile-response` 非空；无 110200 报错。

**T29 · CF Web Analytics beacon 被 CSP 拦截（中，待复核）**

- 现象：`static.cloudflareinsights.com/beacon.min.js` 被 `script-src 'self' 'unsafe-inline'` 阻止；
  Clarity / Umami 上报 200，仅 CF 这一路未生效。
- 排查结论：仓库公开站代码（`_middleware.js`、HTML meta）均未下发该 `script-src`，线上首页响应头
  也只有 `frame-ancestors 'self'`；该 CSP 疑来自 Cloudflare 面板响应头规则或浏览器扩展。
- 待办：真机无扩展环境 DevTools 核对首页响应头第二条 CSP；若在面板，`script-src` 放行
  `https://static.cloudflareinsights.com`、`connect-src` 放行上报域名；若不打算用 CF 统计，
  留空 `js/analytics.js` 的 `cfBeaconToken` 即可消除报错。

**T30 · 头像 PNG 体积治理（低，并入性能专项）**

- 现状：`images/avatar-male.png` 2.36MB、`images/avatar-female.png` 2.56MB，均 1536×1536；
  展示位头像最大约 420px Retina 840px。`avatar-male.png` 除 manifest / asset-map 外前端零引用，
  疑似死资源；`avatar-female.png` 被 `js/gender-switch.js` 女版头像引用。
- 待办：先确认 male 是否后台 / 分享卡残留引用，无引用则归档移除；female 派生 840×840 WebP（或
  优化 PNG），同步 `asset-manifest.json` / `asset-map.js` 与 COS 远端副本。并入 T25 性能专项一起做。

**T31 · W-01 过时文案（已完成，D1 副本待核对）**

- 仓库源 `data/site-data.json` W-01 描述已由「RAG 接入中」改为「RAG 检索增强已接入」，
  `data/site-data.js` 快照经 `scripts/sync_site_data.py` 重建一致，漂移校验通过。
- 2026-11-27 线上实测：首页 W-01 仍是旧文案「数字分身问答终端（RAG 接入中）。GitHub Pages 部署」，
  证实线上真人数据走 D1 `site_content` 副本，仓库 JSON 改动未覆盖到 D1。
- 待办：后台编辑站点数据（或直接改 D1 `site_content`）把同一条目同步为新文案；同步后线上与仓库一致。
- 2026-11-27 CI 附带修复：W-01 改文案时只重建了 `data/site-data.js`（前端快照），漏了 `functions/lib/site-data.js`
  （Function 运行时内嵌副本，由 `embed_assets.mjs` 生成）；该副本仍是旧文案，触发 `content-build`
  「生成物漂移检查」红掉（最近失败 run `0363e9b`，失败步骤即 drift）。已跑 `node scripts/embed_assets.mjs`
  重新生成并推送 `98026f6`，本地 embed/render_resume/render_work_details/validate/pages/preview/sync/tests
  全绿。注意三处副本别再混淆：`data/site-data.js`（前端快照，`sync_site_data.py` 管）、
  `functions/lib/site-data.js`（Function 内嵌，`embed_assets.mjs` 管）、D1 `site_content`（线上真人数据，后台管）。

**T32 · 导航编号撞号（已完成，待部署）**

- 现象（2026-11-27 浏览器复测）：导航「留言墙」与外链「博客」都显示 `11`；同时板块编号从 `02` 起跳（`01` 空挂）。
- 根因：`js/main.js` 重排导航/SEC 编号时，`visibleSecs` 取了页面全部可见 `section[id]`，`hero`、`footerPeople` 这类没有对应导航项的板块也占了一个序号；博客是外链、不参与重排，保留静态 `11`，于是与重排后落到 `11` 的留言墙撞号。
- 修复：重排过滤条件改为「`!s.hidden` 且存在对应 `navLinks` 的 `data-sec`」，只有导航板块计入序号；修复后关于我 `01` … 留言墙 `10`、博客 `11`，无撞号。
- 验收：部署后首页导航编号连续不重复；SEC 编号与导航一致。
- 2026-11-27 部署状态：修复 commit `208c3ff` 已在 `origin/main`；线上磁盘 `js/main.js` 已是新版（`navLinks.some` 过滤），但浏览器执行的仍是旧缓存副本。根因是静态 JS 版本号自修复后未 bump 导致强缓存；已把 `src/pages/index.astro` 引用从 `?v=20261126a` 升到 `?v=20261127a`，待下次 Pages 构建后复验编号连续（about 01 … wall 10、博客 11，无撞号）。

**T33 · 后台问答看板数据不渲染（已完成，线上复验通过）**

- 现象（2026-11-27 登录后台实测）：看板指标卡全「—」、高频问题 / 命中热度 / 近期记录均空；趋势柱图与问题聚类正常。`GET /api/admin/qa` 200，`totals`（total 45、empty 7、last7 35、answered 38、ms_avg 2471）与 `recent` 30 条齐全。
- 根因：`src/lib/api/admin.ts` `qaSchema.recent` 行 `empty` 定成 `z.boolean().optional()`，而 `qa_logs.empty` 存 `0/1` 整数；zod 严格校验 number→boolean 不符，`schema.parse` 抛 ZodError，react-query 进 error 态，`qa.data` 整体 `undefined`，依赖它的卡片/列表回退空态（趋势、聚类是独立 query，不受影响）。
- 修复：`empty` 改 `z.union([z.boolean(), z.number()]).optional()`（复用 `flag` 常量）；`admin.test.ts` 补「recent.empty 为 0/1 整数也可解析」样例，`vitest run` 10 项过。
- 线上复验（2026-11-27 硬刷新后）：指标卡 60 总量 / 50 近 7 天 / 7 空召回 / 11.7% / 2199ms，近期 30 行状态「已作答」，React bundle 哈希已更新；此前空态确为旧 bundle 强缓存。
- 旁证：`/api/admin/kb` 修复前 `worker_ready:false`（与 T27 `no-worker` 互证）；2026-11-27 复验已为 `worker_ready:true`。

**T34 · 投递 `/api/deliver` 首发返回 CF 502（中，待日志定位）**

- 现象（2026-11-27 授权后端到端联调）：`GET /api/challenge` 取 PoW 凭证（difficulty 3）→ 本地解 nonce →
  `POST /api/deliver`（收件人 `test@example.com` 保留域，不触达真实人），首次返回 **Cloudflare 502 Bad
  gateway HTML 错误页**，而不是应用层 JSON；第二次请求被投递限流拦下（429），未能复现。
- 代码侧核对：`deliver.js` 所有发信异常路径都已 try/catch 返回 JSON（`resend_network` / `resend_error` /
  `recipient_not_verified`），不会产出 CF 边缘 502 HTML；崩溃候选在 catch 之外——`probeAttachments`
  （读 KV/静态 PDF、`toBase64`）或 `buildDeliveryEmail` 抛未捕获异常，或 Function 执行超时。
- 阻塞：本机无 `CF_API_TOKEN`、`wrangler` 未登录（code 10001），取不到 Pages Function 实时日志；需在
  CF 控制台 Functions 日志按 `deliver` 过滤，看是未捕获异常堆栈还是超时。
- 待办：① 限流窗口解除或换出口 IP 后重放一次，确认 502 是否稳定复现；② 取日志定位崩溃点；③ 代码侧把
  `probeAttachments` / `buildDeliveryEmail` 包进 try/catch，崩溃时回 JSON `deliver_crashed` 502，避免
  CF HTML 页把内部错误暴露给访客。
- 备注：`/api/deliver-preview` 同 payload 不发信，此前已测通 200；问题只在真实发信分支。

**2026-11-27 公开侧复测结论（后台仍留到最后测）**

| 项 | 结论 |
|---|---|
| 菜单抽屉（R-2） | ✅ 正常：`menuBtn` 点击后 `nav.open` 生效，锚点链接齐全 |
| 主题切换（R-3） | ✅ 正常：`archive → blueprint` 切换生效，`data-theme` 正确写入 `<html>` |
| 分享卡（R-4） | ✅ 正常：分享面板打开，竖版/方形卡 base64 PNG 已生成 |
| 导出入口（R-5） | ✅ 入口齐全：打印 PDF / 生成长图 / 自动投递按钮在位；真实出图与打印留真机复核 |
| sandbox iframe（R-6） | ⚠️ 无害噪音：`dlpFrame` 是静态邮件正文预览，`sandbox=""` 为安全设计，无需 `allow-scripts`；`about:blank` 脚本拦截不影响预览渲染，不记为功能故障 |
| 3D 桌宠（R-1） | ⏳ 待真机：GLB 请求 200、WebGL 可用，但自动化环境 `model` 未就绪；需本地浏览器确认模型加载、坐姿/口型、皮肤音色联动 |
| JD 匹配 | ✅ 正常：示例「AI Agent 工程师」61/100，1 覆盖 / 7 部分 / 0 缺口，证据可回溯，0.8s，无报错 |
| 留言墙 | 18 条内容在位；Turnstile 仍无 challenge iframe（T28 复现） |
| 接口守卫只读分支（11-27 补测） | ✅ 各写接口的 400/403/404 守卫均在写库/发信前拦截，未产生写操作：`company-social` 无设备头 `device_required`、坏 JSON `bad_request`、缺档案 id、未知 action；`wall` 无设备头、坏 JSON、空文本、过短文本（<2 字）；`variant` 坏 JSON `bad_json`、无改写令牌 `rewrite_forbidden`；`visits` 坏 JSON、缺 visitor id；`secure-asset` 参数格式非法 `bad_request`、格式合法但申请不存在 `not_found` 404 |
| 后台接口守卫（11-27 补测） | ✅ `stats/messages/qa/config/devices/export/site-content/theme/gender/greeting/voice/kb` 未登录一律 401；业务功能待验证码登录后端到端验证 |
| 404 / JD 页（11-27 补测） | ✅ 404 页回主页 / 简历 / 邮件三入口在位；`/jd` 三个示例标签（AI Agent 工程师、Java 后端金融、AI 解决方案）与字数计数、规则文案在位；本站静态资源全 200，console 里那条 404 为 Turnstile 外部子资源噪音（T28 连带） |
| Hero 计数（11-27 补测） | ✅ 目标值 5 年 / 5 段 / 6 套 / 50 万+；自动化离屏时数字滚动动画未触发停在 0，滚动进视口后正确计数，非数据缺陷 |
| 音色接口（11-27 补测） | ✅ `/api/voice` GET 200，默认音色 101001「智瑜」；语音切换按钮动态渲染在位，自动播放策略下的真实发声留真机复核 |
| 后台·设备台账（11-27 登录后） | ✅ 概览（浏览 249 / 访客 250 / 24h 47 / 留言设备 4 / 留言 5 / 今日 0 / 隐藏 4 / 待回复 0 / 拉黑 0）+ 4 台设备行（哈希前缀、首见/活跃、留言数、状态、看留言/拉黑）；搜索、导出 CSV、分页入口在位 |
| 后台·留言审核 | ✅ 5 条留言，时间/设备/称呼/内容/状态/对话数齐全；回复、隐藏、筛选入口在位（写操作未提交） |
| 后台·问答看板 | ✅ T33 线上复验通过：硬刷新后指标卡与近期记录正常渲染（60 总量 / 50 近 7 天 / 7 空召回 / 11.7% / 2199ms）；此前空态为旧 bundle 强缓存 |
| 后台·模型与提示词 | ✅ resume_chat / jd_match / summary_rewrite / variant_plan 四模块模型 ID + 提示词可读；resume_chat 已存（2026-11-19），其余「尚未保存过」；保存按钮在位（未提交） |
| 后台·AI 语音 | ✅ 女版 5 音色卡（智瑜 101001 默认 / 智希 101026 / 智梅 101027 / 智付 101055 / 智燕 101011）+ 招呼文案 + 试听/保存；合成链路 `/api/chat(mode=tts)` → 腾讯云函数说明在位 |
| 后台·站点数据 | ✅ 7/7 已配置（首页文案 26KB / 公司 69KB / 学校 10KB / 推荐人 720B / GitHub 45KB / 案例 9KB / CDN 映射 13KB），JSON 可读取编辑；D1 副本新旧文案混杂（T31 落点，待同步） |
| 后台·生成变体 | ✅ JD 输入（≥20 字）+ rewrite 勾选 + 下载 HTML 入口；当前「尚未生成」（未触发模型调用） |
| 后台·角色动画 | ✅ 男性首页角色 / 女性访客切换各 3 动作；MaleRigged.glb 870KB · 41 骨骼 · 3 段剪辑；待机/挥手/坐下均「上线」；3D 预览离屏环境载入中，留真机 |
| 后台只读接口 / 导出（11-27） | ✅ stats/messages/devices/config/voice/greeting/theme/gender/kb 全 200；`/api/admin/kb` `worker_ready:true`（T27 互证已闭环）；CSV 导出 `text/csv`，表头 seq…admin_note，11 条留言 |
| 留言墙写链路（11-27 授权联调） | ✅ `POST /api/wall` 201 落库回显（id `wmwy42v07sagwj`）；随即后台 `messages/status` 置 hidden 200，公开墙已不可见，仅后台可查；为唯一写入 D1 的测试残留 |
| 投递写链路（11-27 授权联调） | ⚠️ T34：PoW 校验通过后首发返回 CF 502 HTML（应用未走错误分类），二次被 429 限流拦下；preview 不发信分支正常。待 CF 日志定位 |
| 核验申请写链路（11-27 授权联调） | ✅ 提交 200，requestId `dbf8bd995d2e4f939dc17cb6fa8bdd3f`，D1 落 `pending` 且生成审批链接；同设备轮询 `pending`、换设备 `device_mismatch`，设备绑定守卫生效；**邮件已实测送达**站长飞书邮箱收件箱（06:23，发件人 `access@chenpeisheng.cn`），申请人/身份/机构/联系方式/用途/时间/来源页/IP 哈希/理由/UA/设备指纹/审批签名链接（12-03 失效）字段齐全，IP 仅哈希无明文。留言墙通知邮件（06:15，`wmwy42v07sagwj`）同样送达。该申请为 D1 测试残留，后台无列表 UI，需直接清表或点审批链接驳回 |
| 公司 / 学校 / 案例页 | ✅ 渲染正常，控制台 0 error |

---

## 4. 已完成（2026-11-16 / 17 收尾，勿重复做）

- 岗位匹配 JD MATCH 上线（2026-11-17）：静态 `7c7b5e1` 已推送、Pages 已构建、云函数 `mode:"jd"` 线上真实模型实测可用，问答与 TTS 回归 200（详见 §3.10）；**不要重复部署或重复 push**；
- AI 助手语音播报 Phase 1 + 2（浏览器 SpeechSynthesis + 腾讯云 TTS 云端通道）已上线并通过人工验收，见 [ai-voice-survey.md](ai-voice-survey.md)；
- Resend 账号（Chrome 现成 Google 会话登录）、「仅发信」最小权限 API Key，明文未落仓库；
- Cloudflare Pages `shenge-work` / Production 配置 `RESEND_API_KEY`(Secret)、`RESEND_FROM`、
  `ALLOWED_ORIGINS`，保留 `SITE_KV` 绑定，并用 Retry deployment 让变量生效；
- 端到端实测：账号邮箱发信 `201`、浏览器点击弹窗与 mailto 兜底实测、接口最终探测为正常参数校验；
- 测试产生的 KV `deliver:*` 限流计数已清空，临时 key 文件已删；
- `docs/resume-delivery.md` 已记录配置进度、暂缓决定与 Windows 下重新部署做法，并推送远端 `main`（`d5de5afe`）；
- 留言墙 KV `site-kv` 绑定 Production 已生效，`./scripts/wall-check.sh` 11/11 通过；
- 2026-11-17 复核：`github:push` 自动构建已生效，且自动部署不会丢失 `/api/*` Functions；
- T2（2026-11-17）：本机 git refs 与远端 `main` 对齐到 `941da91`，`http.version=HTTP/1.1` 写入 `.git/config`，标准 `git fetch` / `git push` 通道恢复，不再走 Git Data API；详见 §3.2。
- JD 匹配（2026-11-17）：「岗位匹配 JD MATCH」开发完成并本地全部验证通过——前端 SEC.03
  视图（三个示例 JD / 空态-加载-结果-错误四态 / Markdown 导出 / 1440–390px 响应式 / 四主题
  跟随）、云函数 `mode:"jd"` 分支（拆分 ≤14 条 / 逐条 TF-IDF 召回合并加权 / 两层输出约束与
  证据 id 白名单 / 10 分钟 4 次独立额度 / 注入拦截不占额度）、README 板块与功能清单更新、
  `docs/jd-match.md` v2 专题文档（调研 + 方案 + 进度）。
  **已上线（`7c7b5e1`）并完成线上端到端验收（T11 于 2026-11-18 全项完成）**，详见 §3.10 / §3.11。
- T3（2026-11-18）：`docs/cloudflare-pages-deploy.md` + README 的「push 不触发构建」结论已修正为
  「push 即部署为主链路」，launchd 列为历史方案，CORS 通配配置同步更新。
- 简历长图依赖本地化（2026-11-18）：`html2canvas 1.4.1` 从 `cdn.jsdelivr.net` 改为自托管
  `assets/vendor/html2canvas.min.js`（194 KB，带 `?v=`），断网或境外 CDN 不可达时仍能导出长图；
  全站剩余外链只有 Google Fonts（异步加载，失败仅回退系统字体）。
- 计数与留言墙迁 D1（2026-11-19）：`/api/visits` 上线（D1 `portfolio-db`）、`/api/wall` 改写为 D1、
  前端计数默认走自身接口；Pages 生产已绑 `DB`，KV `SITE_KV` 与三个环境变量确认保留；
  线上部署 `427a12db`，测试数据已清理。**前端 `provider` 已固定为 `pages`，不要再让它回 abacus。**
- 留言墙 Turnstile + D1 备份（2026-11-19）：widget `shenge-work-portfolio`
  （sitekey `0x4AAAAAAGHnx0m992aGGpUJ`），secret 已写入 Pages 生产环境；
  两档额度生效，`/api/wall` 回 `turnstile:true`；`scripts/backup-d1.sh` 已验证可导出（4 表 6 行）。
  **注意**：环境变量改动请用 `wrangler pages secret put`，不要整体 PATCH `deployment_configs`。

---

## 5. 维护约定

1. **新发现的待办先落本文件**（带依据文档链接与验收标准），再决定是否回写专题文档；
   避免又散回五份设计文档里。
2. 完成一条：把总表状态改为 `已完成（YYYY-MM-DD）`，**同时同步依据文档里的状态**，避免两处打架。
3. 状态为 `已决策暂缓` / `已决策不做` 的条目**不要当 bug 修**；重开必须先写明触发条件。
4. 每次较大改动收尾时盘点一次；长期不动的 `思考池` 条目可保留，但不要悄悄变成排期。
5. 涉及**账号登录、GitHub App 授权、域名付款**的步骤必须本人操作，代理人应提前通知，不要尝试绕过。

> AI生成
