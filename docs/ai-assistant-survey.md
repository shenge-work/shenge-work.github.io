# 静态简历站 AI 问答助手 · 方案调研与实施设计（路线 B）

> 文档定位：本文件是 `shenge-work.github.io` 接入 AI 问答助手的**单一设计依据**。调研结论、实测数据、架构决策、接口契约、验收清单都在这里；后续所有代码实现必须与本文对齐，冲突时先改文档再改代码。
>
> 版本：v1（2026-11-07）· 状态：待实施 · 作者：陈培胜

---

## 0. 结论摘要（先看这五条）

1. **可以做，且不需要常驻服务器。** 静态站 + 静态知识库 + 无服务中转函数，即可实现带检索增强（RAG）的简历问答。
2. **但"默认用 Cloudflare Worker / Vercel"这个原方案在第 3 节被实测否掉了**：`*.workers.dev` 与 `*.vercel.app` 在境内网络均 8 秒超时不可达（`http=000`）。中转层必须换成**境内可达**的载体，否则上线即"你自己打得开、HR 打不开"。
3. 主通道改为 **境内可达的无服务函数（首选腾讯云 CloudBase 云函数 / 阿里云函数计算）**，部署后**必须先实测可达性再改前端**（详见 9.2 验收项 V1）。
4. 检索（embedding）**不能放前端**：查询向量化需要 API Key，放前端等于公开 Key。因此**检索下沉到函数端**，前端只发原始问题；前端保留一条**零 Key 关键词检索 + 原文直出**的降级路径。
5. **本地推理（WebGPU/WASM）本轮决定不做**（决策 D4）：首次要下载 300MB–1.2GB 权重，常规访客体验不可接受。设计保留在第 5.5 节，作为后续可选通道，不占本期里程碑。

---

## 1. 现状基线（必须尊重的既有资产）

盘点自仓库当前代码，AI 助手不能另起一套体系，要顺着已有结构长。

| 资产 | 现状 | 对 AI 助手的影响 |
|---|---|---|
| `index.html` / `resume.html` | 纯原生 HTML，零框架零构建 | 聊天组件必须是**单文件原生 JS**，不引入 React/构建链 |
| CSS 设计体系 | Neo-brutalism：米白纸底 `#F3EEE2`、卡片 `#FFFCF4`、4px 粗描边、硬偏移阴影、橙 `#FF5A1E` / 蓝 `#2B4BE0` | 聊天窗口沿用同一套 token，不做"通用白底聊天框" |
| JS 风格 | ES5 兼容、无模块化、全局函数 | 组件用 IIFE + `window.AIChat` 暴露，不用 `import` |
| `data/site-data.json` | **19.4 KB，唯一编辑源**，含 `hero/about/objective/education/experience/projects/skills/awards/contact` | **天然的知识库源**，无需再维护一份问答语料 |
| `data/site-data.js` | JSON → JS 快照，`file://` 本地预览用 | 知识库产物沿用同样双份策略（json + 快照） |
| `scripts/sync_site_data.py` | JSON 变更 → 重建快照，`--check` 校验 | 新增的知识库重建脚本沿用它的事务方式 |
| `.github/workflows/sync-site-data.yml` | JSON 变更自动重建快照 | AI 知识库重建**挂到同一条 CI 链**上 |
| `js/visitor-count.js` | ��客计数，**provider 可切换**（Abacus / 自建 Worker），后端不可用回退本机计数 | ⭐ **这就是 AI 通道的设计范式**：多 provider + 实测择可用 + 失败降级不显示 0 |
| `js/analytics.js` | 埋点统一入口，ID 留空则不发请求 | AI 对话埋点接同一入口 |
| `worker/` | 已有的 Cloudflare Worker（访客计数），境内不可达，代码保留未启用 | AI 中转**不重犯同样的错**，见第 3 节 |
| 文件读取 | 线上 `fetch('data/site-data.json?v=时间戳')` 绕 Pages CDN 10 分钟缓存 | 知识库文件同样加 `?v=` 时间戳 |

**推论**：`data/site-data.json` 已经是结构化简历，AI 的知识库**不需要手工写**，从 JSON 生成切片即可，简历改一个字，知识库自动跟着变——这是本项目最省维护成本的设计。

---

## 2. 目标与非目标

### 2.1 目标
- 访客（HR / 面试官 / 同行）在站点右下角打开对话，能问：项目细节、技术栈深度、某段经历职责、空窗期、期望岗位、到岗时间、联系方式。
- 回答**只基于本人真实简历**，不编造项目、不编造数字、不承诺薪资。
- 体验：首字延迟 < 1.5s（流式），单次完整回答 < 8s。
- 成本：月成本 ≈ 0（免费额度内）。
- 工程：简历更新 → 知识库自动重建 → 无需人工干预。
- **可写进简历**：无常驻后端、静态 RAG、双推理通道、失败降级，都是能在面试里讲 10 分钟的点。

### 2.2 非目标（明确不做，避免范围失控）
- 不做多用户会话持久化、不做登录、不做后台管理台。
- 不做语音、不做多语言切换（简历本身中文为主，英文只作术语）。
- 不做「投递简历 / 约面试」等业务动作（会变成对外承诺，风险高）。
- 不把手机号进知识库。

---

## 3. 核心约束：境内可达性实测（本次调研最关键结论）

### 3.1 实测方法
于 2026-11-07 在深圳家宽/移动网络下执行：

```bash
curl -s -o /dev/null --max-time 6 -w "$name http=%{http_code} t=%{time_total}s\n" "$url"
dig +short "$domain" | head -2
```

### 3.2 实测结果

| 端点 | HTTP | 耗时 | 判定 | 说明 |
|---|---|---|---|---|
| `shenge-work.github.io` | 200 | 1.11s | ✅ 可达 | 站点本体没问题，继续用 Pages |
| `api.deepseek.com` | 401 | 0.30s | ✅ 可达 | 401=未带 Key 的正常响应，接口本身通 |
| `open.bigmodel.cn`（智谱） | 200 | 0.28s | ✅ 可达 | 首选免费模型提供方 |
| `dashscope.aliyuncs.com`（阿里） | 404 | 0.29s | ✅ 可达 | 404 是根路径无路由，接口通 |
| `api.cloudflare.com` | 301 | 0.69s | ✅ 可达 | 管理面通，**这不代表运行面通**（见下行） |
| `*.workers.dev` | **000** | **8.0s 超时** | ❌ **不可达** | DNS 解析到 `75.126.135.131` 但连接超时 |
| `*.vercel.app` | **000** | **8.0s 超时** | ❌ **不可达** | 同上 |
| `tcloudbaseapp.com` / `fcapp.run` | 000 | 立即失败 | ⚠️ 待定 | **Apex 域名本就不提供服务**，必须用部署后拿到的**真实子域**复测，本轮无法定论 |

### 3.3 结论与决策

- ❌ **否决**：把 Cloudflare Worker / Vercel 的默认域名当作上线通道。这不是性能问题，是**完全打不开**。
- ✅ **采用**：中转层做成 **provider 可切换**，与 `js/visitor-count.js` 完全同构：
  1. `provider = "tencent"`：腾讯云 CloudBase 云函数（有免费额度、境内节点、自带 HTTPS 域名）
  2. `provider = "aliyun"`：阿里云函数计算 FC（同上）
  3. `provider = "worker"`：Cloudflare Worker（代码保留，等有备案域名 / 面向海外访客时启用）
  4. `provider = "none"`：不调 AI，降级为关键词检索 + 原文片段直出（永远可用）
- **上线顺序硬约束**：任一 provider 部署完成后，**先用 4G 蜂窝网络（不是办公室 WiFi）实测 200，才允许把前端默认指向它**。这一条来自本项目已踩过的坑（Worker 部署成功、控制台显示 Deployed、`api.cloudflare.com` 通，但境内 `workers.dev` 打不开）。

---

## 4. 总体架构

```
┌─────────────────────────────┐
│ GitHub Pages（纯静态，境内可达 ✅）│
│  index.html / resume.html    │
│   └ js/ai-chat.js  (ES5,IIFE)│
│        ├ 对话 UI（右下角浮窗）  │
│        ├ provider 路由开关     │
│        └ 降级：关键词检索+原文直出│
└──────────┬──────────────────┘
           │ ① POST /chat  {question, history}   —— 前端不带任何 Key
           ▼
┌─────────────────────────────┐
│ 无服务中转函数（provider 可切换）  │
│  1) Origin 白名单校验          │
│  2) IP 限流（分钟/日）          │
│  3) 问题向量化 → Top-K 检索     │
│  4) 拼 Prompt → 调 LLM         │
│  5) SSE 流式回传               │
│  6) 不落盘任何对话日志          │
└───────┬──────────────┬───────┘
        │              │
        ▼              ▼
  ┌──────────┐   ┌──────────────┐
  │ LLM API  │   │ 知识库（内置）  │
  │ GLM-4-Flash│  │ chunks + vectors│
  │ /DeepSeek │   │ 编译进函数包    │
  └──────────┘   └──────────────┘

并行可选通道（演示用，默认关闭）：
  前端 WebGPU / WASM 本地推理
  └ 本地小模型 + 本地向量检索，数据不出浏览器
```

### 4.1 为什么检索放函数端（而不是前端）

| 做法 | Key 暴露 | 可行性 | 结论 |
|---|---|---|---|
| 前端做向量检索 | 需要调 embedding API → **Key 明文在前端** | 技术上可行，安全上自杀 | ❌ |
| 前端用本地 embedding 模型 | 无 Key，但要下载 30–90MB 模型 | 可行 | ⚠️ 仅本地推理通道内使用 |
| **函数端做向量检索** | Key 只在函数环境变量 | 一次请求内完成 embed+检索+生成 | ✅ **主路径** |
| 前端纯关键词检索（BM25/命中打分） | 无 Key、零依赖 | 简历仅 ~60 个 chunk，中文关键词命中率够用 | ✅ **降级路径** |

> 关键判断：本项目知识库体量极小（源 JSON 19 KB，切片后约 50–80 块、6–12 KB 文本）。这个量级下向量检索与关键词检索的**效果差距很小**，因此"关键词检索 + 原文直出"完全可以作为最终降级态，不必为了检索把 Key 搬到前端。

---

## 5. 组件设计

### 5.1 知识库源与切片

**源**：`data/site-data.json`（唯一真源） + `resume.html` 中的"项目经历/专业技能"补充段落（若与 JSON 有重复则以 JSON 为准）。

**切片策略**（结构化切，不按字数硬切，保证每块语义自洽）：

| 切片单元 | 数量（预估） | chunk 内容构造 |
|---|---|---|
| `hero` + `about` + `objective` | 1–2 | 姓名、角色、一句话定位、求职意向、个人优势段落合并为「我是谁」块 |
| `education.main` + `education.sides` | 1 | 学校、专业、时间、学信网验证说明 |
| `experience[i]` | 3（每段公司 1 块） | `公司 + 职位 + 时间` 作为标题行，`points` 逐条拼接 |
| `projects[i]` | 5（每个项目 1 块） | 标题 + 描述 + 量化 stats + stack + 4 条 points |
| `skills` | 2 | 六大分类 + toolbox 列表（分两块避免过长） |
| `awards` | 1 | 证书清单 |
| `contact` | 1 | **仅邮箱 + GitHub + 站点链接**；手机号字段在入库前**显式剔除** |

**规则**：
- 每块 120–400 字，超长按语义子项再拆；相邻块保留 `section` 与 `title` 元数据，用于回答时**标注来源**（如「据"Lessie 项目"一节」）。
- chunk 结构：
  ```json
  { "id": "proj-lessie", "section": "projects", "title": "lessie.cn AI 人脉搜索引擎",
    "text": "...", "url": "resume.html#projects" }
  ```
- `url` 字段让回答可以给访客一个"跳过去看原文"的锚点，这比纯聊天更有说服力。

### 5.2 离线向量化流水线

**脚本**：`scripts/build_kb.py`（纯标准库负责切块；向量化按配置二选一）

| 环节 | 实现 | 说明 |
|---|---|---|
| 1. 读源 | `json.load('data/site-data.json')` | 失败即退出，不产出半成品 |
| 2. 切块 | 纯 Python，无第三方依赖 | 与 `sync_site_data.py` 保持同一风格 |
| 3. 敏感字段过滤 | 白名单式构造，**不做黑名单正则** | 手机号/身份证等默认不存在于输出中 |
| 4. 向量化（默认） | **char-bigram TF-IDF**，纯标准库 | 中文字 bigram + 英文整词；**构建与查询都不需要任何密钥**，结果确定可复现 |
| 5. 向量化（可选升级） | 智谱 `embedding-3`（`open.bigmodel.cn` ✅可达） | `--provider zhipu` + `ZHIPU_API_KEY`；语义检索更强，但引入外部依赖 |
| 6. 量化压缩 | float32 → int8 对称量化 + **稀疏存储**（只存非零位） | 32 块 × 1200 维实测 **63 KB**（密集存储会到 ~150 KB） |
| 7. 产出 | `knowledge/chunks.json` + `knowledge/vectors.json` + `knowledge/kb-meta.json`（含生成时间、embedding 模型、维度、块数） | `kb-meta.json` 用于校验前端/函数侧维度是否一致 |
| 8. 双份快照 | 同时写 `knowledge/kb.js`（`window.KB = {...}`） | 与 `data/site-data.js` 同一策略，供 `file://` 本地预览 |
| 9. 部署同步 | 函数包内置同一份 `chunks.json` + `vectors.json` | 前端与函数端向量必须同源，靠 `kb-meta.json` 的 hash 校验 |

**CI**：`.github/workflows/build-kb.yml`，触发条件 `data/site-data.json` 或 `resume.html` 变更 → 重建 → 若产物有差异则自动提交。与现有 `sync-site-data.yml` 串成一条链，避免两个流程互相覆盖。

**为什么不用 Pinecone / 向量数据库**：知识库 < 15 KB 文本，向量 < 130 KB。引入外部向量库要额外 Key、额外月度配额、额外网络依赖（且都在境外），收益为零。**把向量当静态资源发布**是本题最合适的解法，也是可以在面试里讲清的取舍。

#### 5.2.1 实测产物（M1 已跑通，2026-11-07）

| 产物 | 大小 | 说明 |
|---|---|---|
| `knowledge/chunks.json` | 22 KB | 32 块，7622 字 |
| `knowledge/vectors.json` | 63 KB | 32 条稀疏 int8，维度 1200，scale 189.6 |
| `knowledge/kb-meta.json` | 33 KB | vocab(1200) + idf + 源文件 sha256 + 量化参数 |
| `knowledge/kb.js` | 21 KB | `file://` 本地预览快照（只含 chunks，不含向量） |

切片分布：`about 3 / education 1 / experience 6 / projects 19 / skills 3 / awards 1 / contact 1`，单块 63–342 字。

检索自测（`python3 scripts/build_kb.py --query "..."`）真实结果：

| 提问 | Top1 | 得分 | 判定 |
|---|---|---|---|
| 讲讲 lessie 那个 AI 人脉搜索项目 | `exp-02-01`（Lessie 工作经历） | 0.193 | ✅ |
| 你在周生生做了什么 | `proj-p05-03`（周生生 CRM） | 0.166 | ✅ |
| 会不会 LangGraph 和 Multi-Agent | `proj-p02-06`（lessie.cn） | 0.219 | ✅ |
| 怎么联系你，能打电话吗 | `contact-01`（联系方式） | 0.250（关键词兜底） | ✅ |
| 期望薪资多少 | `me-03` | 0.200（关键词兜底） | ⚠️ 无对应资料，靠提示词统一话术 |
| 空窗期这段时间在做什么 | `me-03` | 0.099 | ⚠️ 弱命中，靠提示词统一话术 |

> 结论：专有名词类提问召回稳定；「薪资 / 空窗期」这类简历里本就没有的内容，召回弱是**正常的**，必须靠提示词拒绝而不是靠检索兜住——这正是 5.6 里"未知即拒答"条款存在的原因。

### 5.3 前端聊天组件 `js/ai-chat.js`

**硬约束**：ES5、单文件、IIFE、零依赖、无构建。
（若强行用 ES6 语法，老浏览器/部分内嵌 WebView 会整段失效，得不偿失。）

界面（右下角，与 `visitor-count.js` 的里程表样式共存，不打架）：

```
┌──────────────────────────────┐
│ AI 简历助手            —  ×  │   ← 4px 粗描边、硬偏移阴影、米白底
├──────────────────────────────┤
│ [AI] 你好，我是陈培胜的简历助手。 │
│      可以问我项目、技术栈、经历。 │
│                              │
│              [我] 讲讲 Lessie  │
│ [AI] Lessie 是……（来源：项目）│
├──────────────────────────────┤
│ 输入问题…              [发送] │
│ 通道：自动 ▾ （自动/云函数/本地/纯检索）│
└──────────────────────────────┘
```

要点：
- 首次点击展开时才 `fetch` 知识库与初始化，不影响页面加载性能（与现有"按需加载脚本"策略一致）。
- **流式渲染**：优先 `fetch` + `ReadableStream` 逐块追加；不支持则退化为一次性整段。
- 历史轮数上限 **5 轮**（超出裁掉最早），防止 token 与费用失控。
- 输入长度上限 **200 字**，前端先截断并提示。
- 每个回答下方渲染 `来源: <title>`（可点击跳到 `resume.html` 对应锚点）。
- 全链路 `try/catch`：任何异常都转成一句人话（「AI 暂时不可用，你可以直接看简历原文，或邮件联系我」），**不允许页面 console 报红、不允许空白气泡**。
- 采样参数固定：`temperature 0.3`（简历问答要稳，不要发挥）、`max_tokens 512`。

### 5.4 通道 A：无服务中转函数

**接口契约**（前端与函数端唯一耦合点，改动需同步本文）：

```
POST https://<provider-domain>/chat
Content-Type: application/json
Origin: https://shenge-work.github.io

{
  "question": "讲讲你在 Lessie 做的 Agent 工程化",
  "history": [ {"role":"user","content":"..."}, {"role":"assistant","content":"..."} ],
  "topK": 4
}
```

成功响应：`text/event-stream`，逐行 `data: {"delta":"..."}`，结束 `data: [DONE]`；
失败响应：HTTP 4xx/5xx + `{"error":"<code>","message":"<中文可读>"}`。

错误码约定：

| code | HTTP | 含义 | 前端表现 |
|---|---|---|---|
| `origin_denied` | 403 | Origin 不在白名单 | 静默切换下一通道 |
| `rate_limited` | 429 | 触发限流 | 提示「问得有点快，稍等几秒」 |
| `upstream_error` | 502 | 模型侧失败 | 提示 + 转纯检索降级 |
| `bad_request` | 400 | 参数非法 / 超长 | 提示修正 |

**函数内部流程**：
1. `OPTIONS` 预检返回允许的 `Origin`（仅 `https://shenge-work.github.io`，本地调试可显式加 `http://localhost:8000`）；
2. Origin 白名单校验 → 不通过 403，**不使用通配 `*`**；
3. 限流：内存计数器（同一实例内）或 KV/Redis（跨实例）；阈值建议 **20 次/分钟/IP、200 次/日/IP**；
4. 问题向量化（与知识库同模型、同维度，校验 `kb-meta.json`）；
5. 余弦 Top-K（K=4）；**若 Top1 得分 < 0.01（词表未命中）则回落关键词匹配**（与前端 `provider=none` 同一算法）；仍无命中则直接返回固定话术「这块简历里没有，建议邮件联系」，**不调模型**——省 token，也断绝幻觉来源；
6. 组装 messages：`system`（人设+规则）+ `context`（检索片段）+ `history` + `user`；
7. 调 LLM（流式），透传 token 流；
8. **不记录** question/回答全文；仅记录聚合埋点（通道、命中块数、延迟、是否降级）。

**provider 实现差异**（同一份业务逻辑，只换 HTTP 适配层）：

| provider | 适配要点 |
|---|---|
| 腾讯云 CloudBase 云函数 | 用其云函数 HTTP 访问服务；注意默认域名需实测；超时上限需确认（流式支持情况要在 M1 验证） |
| 阿里云函数计算 FC | HTTP 触发器 + 自定义域名；同样先实测子域可达性 |
| Cloudflare Worker | 保留，`workers.dev` 境内不可达，等自有域名；代码与限流 KV 绑定逻辑可复用已有 `worker/` 经验 |
| 降级 none | 前端本地关键词检索，直接输出 Top-3 chunk 原文 |

> 流式是**加分项不是必需品**。若所选国内平台不支持 SSE 透传，先做一次性返回（`text/plain`），验收时只要求"首字 < 2.5s"，不阻塞上线。

### 5.5 通道 B：本地推理（演示开关）

| 项 | 选型 | 理由 |
|---|---|---|
| 运行时 | WebLLM（MLC，WebGPU）优先；llama.cpp WASM 兜底 | WebLLM 对 Chrome/Edge 支持好、有现成 chat 模板 |
| 模型 | `Qwen2.5-1.5B-Instruct-q4f16`（约 1.0–1.2 GB） | 中文问答可用、显存/内存可控 |
| 检索 | transformers.js + `bge-small-zh` ONNX（约 30–90 MB）或纯关键词 | 保证本地也带 RAG，且零 Key |
| 权重托管 | GitHub Release（**不放 Pages 仓库内**，避免仓库膨胀与 Pages 100MB 限制） | Pages 有单站 1GB / 单文件 100MB 约束 |
| 触发方式 | 用户主动点「本地模型（实验）」→ 显式告知需下载 ~1GB → 显示进度条 → 许可后加载 | 绝不做默认路径 |
| 失败处理 | 无 WebGPU / 内存不足 → 自动回退通道 A，并提示原因 | 不能让访客卡在 loading |

**明确定位**：这是**简历项目描述里的技术点**与**面试现场演示道具**，不是给 HR 日常用的主路径。文档里写清楚这一点，避免后续"为了炫技牺牲可用性"。

### 5.6 提示词与人设（可直接落地）

```
你是陈培胜（CHEN PEISHENG）在线简历站上的 AI 助手，只负责回答关于他本人的
教育背景、工作经历、项目、技能、求职意向、联系方式的问题。

规则：
1. 只依据 <context> 中的简历资料回答。context 没有的信息，直接说
   「简历里没写这块，建议直接邮件问他：shenge.work@gmail.com」，不要推测。
2. 不允许编造项目名称、公司、量化数字、时间。引用数字时必须与 context 完全一致。
3. 涉及薪资、离职原因、是否接受外包、能否立刻到岗等敏感问题：
   一律回复「这类问题建议直接沟通」，不代替本人承诺。
4. 回答风格：简洁、专业、有条理，像工程师向面试官介绍自己。
   中文为主，技术名词保留英文。控制在 4 句话 / 120 字以内。
5. 每次回答末尾用一行标注依据：「依据：<context 中的 title>」。
6. 拒绝回答与简历无关的请求（写代码、闲聊、其他公司信息、政治话题），
   统一回复「我只回答关于这份简历的问题」。 ← 防滥用/防跑偏的第一道闸
```

再叠加一层**输入侧过滤**（函数端）：问题长度 > 200 字直接 400；命中明显越界意图（如"帮我写代码/翻译/扮演"）不送模型，直接返回固定话术。这层是省钱+防注入，不依赖模型自觉。

---

### 5.7 问答日志（决策 D6：记录，但必须脱敏）

落库：CloudBase 云数据库集合 `chat_logs`（免运维，免费额度内）。

| 字段 | 类型 | 说明 |
|---|---|---|
| `ts` | number | 服务端时间戳（不信任前端时间） |
| `ip_hash` | string | `sha256(ip + LOG_SALT)` 取前 16 位，不可逆；**不存原始 IP** |
| `q` / `a` | string | 问题与回答，入库前 scrub（手机号 / 身份证） |
| `channel` | string | `tencent` / `none`（降级） |
| `top_ids` | string[] | 命中的知识块 id |
| `top1_score` | number | 命中置信度 |
| `fallback` | bool | 是否走了关键词兜底 |
| `latency_ms` | number | 端到端耗时 |

规则：
- `LOG_ENABLED` 环境变量控制，默认 true；置 false 后不写库且不报错。
- 定时触发器每 30 天清理 `ts < now - 30d`。
- 集合**不对外可读**（CloudBase 安全规则：仅函数可写）。
- 疑似注入的输入照常记录但打 `suspect: true`，便于事后看攻击面。

> 价值：`top1_score` 的分布直接暴露"哪些问题答不准"，是 M6 调提示词唯一的客观依据；`top_ids` 让每条回答可回溯到具体知识块。

## 6. 方案对比与弃用理由（备查）

| 方案 | 无服务器 | Key 安全 | RAG | 境内可达 | 简历亮点 | 结论 |
|---|---|---|---|---|---|---|
| 嵌第三方 SaaS（Chatbase/Dify 托管） | ✅ | ✅ | 平台自带 | ⚠️ 多数境外，需实测 | 弱（套壳，面试无话可讲） | ❌ 弃用 |
| 前端直连 LLM API（写死 Key） | ✅ | ❌ 明文泄露 | ❌ 全量塞上下文 | ✅（DeepSeek/智谱可达） | 弱 | ❌ 禁止 |
| **函数中转 + 静态向量 RAG** | ✅ | ✅ | ✅ | ✅（选国内平台） | 强 | ✅ **主方案** |
| Cloudflare Worker / Vercel | ✅ | ✅ | ✅ | ❌ 实测不可达 | 中 | ❌ 降级为备用 provider |
| WebGPU 本地大模型 | ✅ | ✅ 无 Key | ✅ 本地检索 | ✅ 纯前端 | 很强（但体验差） | ✅ 演示通道 |
| Pinecone 等外部向量库 | ✅ | ⚠️ 需中转 | ✅ | ❌ 境外 + 多一个 Key | 中 | ❌ 知识库太小，收益为负 |

---

## 7. 安全与隐私

| 风险 | 后果 | 措施 |
|---|---|---|
| LLM / Embedding Key 泄露 | 被盗刷，账单爆炸 | Key 只存平台环境变量与 GitHub Secrets；仓库内 `grep` 校验（CI 加 `run_secret_scanning`）；前端产物中**不允许出现 `sk-` / `Bearer`** |
| 站点被他人 embed 盗用额度 | 额度被刷 | Origin 白名单（精确匹配，不用通配）；Referer 校验作为补充；IP 限流双阈值 |
| 提示词注入（"忽略以上指令"） | 助手跑偏、乱说话 | 系统提示词硬约束 + 输入侧意图拦截 + 输出侧长度/token 上限 |
| 个人隐私外泄 | 手机号被爬 | 知识库构造采用**字段白名单**，手机号不进库；仅公开邮箱 + GitHub |
| 对话内容留存 | 隐私与合规负担 | 决策 D6 = **记录**，但强制脱敏：手机号 scrub、IP 只存盐化 hash、30 天 TTL、`LOG_ENABLED` 可一键关停（详见 5.7） |
| 模型幻觉冒充本人承诺 | 求职风险 | 薪资/外包/到岗类问题强制话术；回答附来源 |
| 版权/素材 | 低 | 聊天 UI 自绘，不引入第三方组件库 |

**额外一条**：由于回答会带"陈培胜本人"人设，必须在前端首屏显式标注「AI 助手，回答基于简历内容自动生成」，避免访客误认为本人在实时回复。

---

## 8. 成本测算（按公开免费额度估算，需以平台当期政策为准）

| 项 | 用量假设 | 成本 |
|---|---|---|
| LLM（GLM-4-Flash / DeepSeek） | 50 次问答/月 × 约 1.5k tokens | 免费额度内 ≈ **￥0** |
| Embedding | 知识库重建 ~80 次调用/月（仅 CI 触发） | ≈ **￥0**（可为 0：改本地 ONNX 生成） |
| 云函数 | 50 次/月，128MB/次 | 免费额度内 ≈ **￥0** |
| GitHub Pages | 公开仓库 | **￥0** |
| 域名（可选） | 若为过备案/稳定性购域名 | ￥30–60/年 |

**结论**：正常访客量（月 < 500 次问答）下可长期零成本运行；真正的成本风险是**Key 泄露被刷**，因此限流是主防线而非优化项。

---

## 9. 里程碑与验收

### 9.1 里程碑（每步都可独立验证，不一次性大爆炸）

| 阶段 | 产出 | 前置 | 验证方式 |
|---|---|---|---|
| **M0** | 本文档入库 | — | 文档评审通过 |
| **M1** ✅ 已完成 | `scripts/build_kb.py` + `knowledge/*` + `build-kb.yml` | M0 | 32 块 / 7622 字 / 维度 1200；`--check` 幂等通过；隐私闸门 0 命中；6 条真实提问召回自测通过 |
| **M2** | `js/ai-chat.js`（UI + 通道路由 + 纯检索降级） | M1 | 断网可开窗、可出原文片段；不影响原页面性能（Lighthouse 无退化） |
| **M3** | 函数实现（1 个国内 provider）+ 部署 | M1、M2 | **4G 实测 200**；白名单 403；限流 429；流式或非流式均可 |
| **M4** | 前端接函数，端到端跑通 | M3 | 20 条真实问题集，8 条以上回答准确且带来源 |
| **M5** ⏸ 暂缓 | 本地推理演示通道 | — | 决策 D4 已明确本轮不做，设计见 5.5 |
| **M6** | 埋点、README 架构图、简历项目描述、提示词调优 | M4 | 埋点能区分通道与降级率 |

### 9.2 验收清单（硬指标，逐条打勾）

- [ ] **V1 境内可达**：在**蜂窝网络**下打开中转域名返回 200（不是只看控制台 "Deployed"）
- [ ] **V2 无 Key**：`git grep -inE "sk-|Bearer |api[_-]?key\s*="` 全仓 0 命中（Secrets 除外）
- [ ] **V3 白名单**：非 `shenge-work.github.io` 的 Origin POST 返回 `origin_denied` / 403
- [ ] **V4 限流**：连续 21 次请求，第 21 次返回 429
- [ ] **V5 不编造**：构造 5 条简历中不存在的问题（如"你在字节跳动做过什么"），全部拒答且不编造
- [ ] **V6 降级**：手动把函数 provider 置为不可用，前端不白屏、不报红，能出纯检索结果或友好提示
- [ ] **V7 隐私**：`knowledge/chunks.json` 中 grep 手机号 / 身份证，0 命中
- [ ] **V8 自动重建**：改 `site-data.json` 一个项目名 → CI 自动更新 chunks → 线上问答内容同步变化
- [ ] **V9 性能**：未打开聊天窗时，页面新增 JS ≤ 3 KB 且不发起网络请求
- [ ] **V10 无回归**：现有访问计数、埋点、PDF 导出、移动端布局全部正常

---

## 10. 风险登记

| # | 风险 | 概率 | 影响 | 应对 |
|---|---|---|---|---|
| R1 | 所选国内 Serverless 的默认域名同样不可达/被限 | 中 | 高 | M3 先做 10 分钟冒烟测试再写业务代码；备 2 个 provider + none 降级 |
| R2 | 简历被 AI 说错（幻觉） | 中 | 高（求职场景致命） | 严格 context 约束 + 附来源 + 「未知即拒答」+ 5 条不存在问题做回归 |
| R3 | Key 泄漏被刷 | 低 | 高 | 限流双阈值 + Secrets + CI 扫描；Key 单独申请、额度单独设 |
| R4 | 访客设备打不开（WebView 老浏览器） | 中 | 中 | ES5 + 无依赖 + 全链路降级 |
| R5 | 知识库体积增长导致 Pages 膨胀 | 低 | 低 | int8 量化；块数上限 120；权重走 Release 不进仓库 |
| R6 | 招聘方误以为候选人用 AI 应付沟通 | 中 | 中 | 首页明示「AI 助手，非本人实时回复」 |
| R7 | 流式不支持导致体验落差 | 中 | 低 | 允许一次性返回，验收阈值放宽到 2.5s 首字 |

---

## 11. 可直接写进简历的项目描述

> **个人站点 AI 简历助手（静态站 · 无服务 RAG）** `shenge-work.github.io`
> - 面向纯静态 GitHub Pages 场景，设计并落地一套**无常驻后端**的 RAG 问答：知识库从站点唯一数据源 `site-data.json` 结构化切片（约 60 块），向量以 int8 量化后**作为静态资源随页面发布**（~31 KB），运行时零向量库依赖。
> - 检索下沉至边缘/云函数，前端**不持有任何 API Key**；实现 Origin 白名单、IP 双阈值限流、提示词注入拦截与"未知即拒答"约束，回答附带知识块来源锚点。
> - 设计 **provider 可切换 + 三级降级**（云函数 → 备用 provider → 纯关键词检索原文直出），并基于实测发现境外 Serverless 默认域名在境内不可达，据此改用境内可达载体，保证"部署成功≠可用"的问题在上线前暴露。
> - 可选 WebGPU/WASM 本地小模型推理通道，实现对话数据不出浏览器；知识库由 GitHub Actions 在简历变更后自动重建，实现内容与问答同步。

---

## 12. 决策记录（2026-11-07 已定，不再讨论）

| # | 决策点 | 结论 | 落地影响 |
|---|---|---|---|
| D1 | 中转载体 | **腾讯云 CloudBase 云函数** | M3 先做 10 分钟冒烟测可达性；未通过依次回落 阿里云 FC → 纯检索 |
| D2 | 默认模型 | **GLM-4-Flash** 起步（备选 DeepSeek Chat） | 适配层统一，换模型只改配置 |
| D3 | 向量化方式 | **char-bigram TF-IDF（零 Key，默认）**；智谱 `embedding-3` 为可选升级 | 构建与查询都不需要任何 embedding 密钥；`--provider zhipu` 一键升级 |
| D4 | 本地推理通道 | **本轮不做**（暂缓，非删除） | 里程碑 M5 取消；5.5 节设计保留 |
| D5 | 薪资 / 空窗期 / 外包类提问 | **统一话术**「建议直接沟通」，不给模型发挥 | 写进系统提示词 + 输入侧意图拦截 |
| D6 | 问答日志 | **记录**，但强制脱敏 + TTL | 见 5.7 |

### 12.1 已知取舍与触发条件

- TF-IDF 是**字面匹配**，同义不同词会漏（如问"通勤距离"不会命中"深圳"）。简历问答以专有名词为主，命中率高；**M4 用 20 条真实问题回归，准确率 < 70% 就切 `--provider zhipu`**——这是唯一需要改的开关。
- 记录日志意味着要存用户提问，因此 scrub、IP 盐化 hash、30 天 TTL、`LOG_ENABLED` 关停四项**缺一不可**。
- 若 CloudBase 默认域名同样境内不可达（R1 风险），不回退到境外平台，直接走"纯关键词检索 + 原文直出"的降级态上线，AI 能力后置。

---

## 附录 A：目录规划（实施时按此建）

```
├── data/site-data.json          # 唯一真源（已有）
├── js/ai-chat.js                # 新增：聊天组件（ES5/IIFE）
├── css/style.css                # 增补：聊天窗样式（沿用设计 token）
├── scripts/
│   ├── sync_site_data.py        # 已有
│   └── build_kb.py              # 新增：切块 + 向量化 + --check
├── knowledge/
│   ├── chunks.json              # 切片正文 + 元数据
│   ├── vectors.json             # int8 量化向量
│   ├── kb-meta.json             # 生成时间/模型/维度/块数/hash
│   └── kb.js                    # file:// 预览用快照
├── functions/                   # 无服务函数（provider 各一目录）
│   ├── shared/prompt.js         # 系统提示词 + 输入拦截（两端共用）
│   ├── tencent/index.js
│   ├── aliyun/index.js
│   └── cloudflare/worker.js     # 备用，境内不可达
├── docs/
│   ├── observability-and-cms.md # 已有
│   └── ai-assistant-survey.md   # 本文档
└── .github/workflows/
    ├── sync-site-data.yml       # 已有
    └── build-kb.yml             # 新增
```

## 附录 B：本地调试命令

```bash
# 1) 重建知识库并自检
python3 scripts/build_kb.py --check

# 2) 本地起静态站（file:// 下 fetch 不可用，务必走 http）
python3 -m http.server 8000
# 打开 http://localhost:8000 验证聊天窗

# 3) 冒烟测中转可达性（换域名后先跑这条，再动前端）
curl -s -o /dev/null --max-time 8 \
  -w "http=%{http_code} t=%{time_total}s\n" \
  -H "Origin: https://shenge-work.github.io" \
  -H "Content-Type: application/json" \
  -d '{"question":"你好"}' \
  https://<provider-domain>/chat

# 4) 白名单与限流验证
curl -s -o /dev/null -w "%{http_code}\n" -H "Origin: https://evil.example" \
  -d '{"question":"test"}' https://<provider-domain>/chat    # 期望 403
for i in $(seq 1 21); do curl -s -o /dev/null -w "%{http_code} " \
  -H "Origin: https://shenge-work.github.io" -d '{"question":"t"}' \
  https://<provider-domain>/chat; done                        # 期望最后一个 429
```

## 附录 C：参考与依据

- 境内可达性实测：见第 3.2 节，执行于 2026-11-07，深圳本地网络（`curl --max-time 6`）。
- 仓库既有实现：`js/visitor-count.js`（provider 切换范式）、`worker/`（Cloudflare Worker 迭代记录）、`scripts/sync_site_data.py`、`.github/workflows/sync-site-data.yml`。
- 知识库源结构：`data/site-data.json`（19.4 KB，字段：`hero/about/objective/education/experience/projects/skills/awards/contact`）。


## 13. 实施记录与实测踩坑（2026-11-07 落地版）

方案定稿后按 M1→M3 落地，过程中的真实结论（都是"文档没写、测试才知道"的那类）：

### 13.1 模型：文档里的 GLM-4-Flash 用不了

云开发「体验版」的资源点抵扣只对**极少数模型**开放。逐一实测 16 个模型名（`hy4 / hy4-preview / hy3 /
deepseek-v4.1-flash / deepseek-v4.1-flash-1017 / glm-5.3 / glm-5.3-flash / glm-5.3-flashx / glm-5.2 /
kimi-k3 / kimi-k2.6 / kimi-k2.8-preview / deepseek-v4-pro / minimax-m3.1-flash / mimo-v2.6-flash /
step-5-preview`），**只有 `hy3` 返回 200**，其余统一 `AI_MODEL_NOT_SUPPORTED`（"模型未开启套餐抵扣"）。
`/models` 端点也报同一错误，不能用来探测可用模型。→ 默认模型锁定 `hy3`。

### 13.2 `hy3` 默认是"思考型"，会白烧 token

- `max_tokens=60`：60 token 全进 `reasoning_tokens`，`content` 为空、`finish_reason=length`。
- `max_tokens=800`：`reasoning_tokens=343`，正文只有 22 字。
- 关思考：请求体加 `"thinking":{"type":"disabled"}` → `completion_tokens=11, reasoning=0`。
  `enable_thinking:false` **无效**（仍有 41 个 reasoning token）。
→ 函数固定 `thinking:{type:"disabled"}` + `max_tokens=800` + `temperature=0.3`。

### 13.3 API Key 注入：别手填环境变量

控制台「环境变量」在体验版里是受控组件，脚本化填值会被框架判为空值（反复提示"值不能为空"）。
正确姿势是「**API Key 设置**」开关：打开后自动注入 `CLOUDBASE_APIKEY`，下拉里直接选已有 Key。
函数读取顺序因此改成 `process.env.AI_API_KEY || process.env.CLOUDBASE_APIKEY`。

### 13.4 HTTP 网关跨域：开了会双重下发 CORS 头

路由上开「跨域设置」后，网关会把 CORS 头**和函数自己返回的头拼在一起**：

```
access-control-allow-origin: https://shenge-work.github.io,https://shenge-work.github.io
access-control-max-age: -1,86400
```

浏览器按"逗号分隔列表"解析，判定 origin 不匹配 → 前端拿到的是 CORS 错误而不是 403/200。
→ 路由上关闭跨域，CORS 全部由函数 `index.js` 的 `corsHeaders()` 负责（白名单可配 `ALLOWED_ORIGINS`）。

### 13.5 部署的两个硬门槛

- 包内**必须有 `package.json`**，否则版本详情报"根目录下无 package.json，无法进行云端安装依赖"。
- 默认**执行超时 3 秒**，模型调用 2.4–3.3 秒必超时；必须先改成 30 秒再测前端。

### 13.6 静态站的脚本缓存会骗人

推送后 GitHub Pages 的 CDN 对 JS 仍吐旧文件（HTML 已更新、`main.js` 还是旧版），
表现是"面板点不开/占位回复还在"。排查顺序：先确认 `curl 站点/index.html` 里的脚本 URL 变了，
再确认 `curl 站点/js/main.js` 的内容是否已更新；PowerShell/curl 都取不到新版就该怀疑 CDN 缓存而不是代码。
前端脚本因此加 `?v=YYYYMMDD` 版本参数（改文件名同样能破，但改查询串更省事）。

### 13.7 当前落地状态（V1–V10 对照）

| 检查项 | 结果 |
|---|---|
| V1 公网可达 | ✅ `/chat` 返回 200，深圳家宽实测 0.9–4.4s |
| V2 CORS 预检 | ✅ `OPTIONS` 204，单条 `ACAO` |
| V3 检索命中 | ✅ `langgraph` top1=0.2193、`contact` 0.25 |
| V4 敏感问题 | ✅ 薪资/空窗/外包/到岗 → 统一话术，不调模型 |
| V5 越界请求 | ✅ 写代码/翻译/角色扮演 → 固定话术 |
| V6 无匹配 | ✅ 低于阈值 → "简历里没写这块" |
| V7 超长输入 | ✅ >200 字 → 400 `bad_request` |
| V8 陌生来源 | ✅ 非白名单 Origin → 403 `origin_denied` |
| V9 脱敏日志 | ✅ 控制台结构化 `[chat_log]`（ip_hash 前 16 位 / top_ids / top1_score / latency_ms / model / suspect） |
| V10 前端降级 | ✅ 失败分支区分 `rate_limited` / `AbortError` / 其它，兜底给邮箱 |

**未做**：`chat_logs` 数据库集合 + 30 天 TTL（当前日志只在云函数控制台日志里，`LOG_ENABLED` 也未落库）。
理由：体验版云函数引入数据库 SDK 会额外加依赖与冷启动成本，先以平台日志满足"可审计 + 脱敏"，
等有真实问答量再补落库。

### 13.8 主动性设计：停留 10 秒自动开场

静态简历的痛点是"内容多、没人读完"。加一层主动引导，用的不是营销弹窗，而是"把问题递到手边"：

| 时间点 | 动作 | 说明 |
|---|---|---|
| 0s | 正常浏览，右下角浮标常驻 | 不做任何打扰 |
| 4s | 浮标上方冒一条小气泡「简历看不完？直接问我就行」 | 低干扰预告，暗示可以问 |
| 10s | 面板自动展开 + 一条开场语 + 3 个可点入口 | 仍没被搭理才升级动作 |

**约束（避免变成骚扰）**：

- 用户任何主动动作（点浮标 / 关面板 / 按 Esc / 直接输入）立即撤销全部自动行为，`aiManual` 置位。
- 页面在后台标签页时自动顺延，不在用户看不见时"偷偷弹"。
- 用户正在滚动（<800ms 内有滚动事件）先等 1.4 秒，避开阅读打断。
- 自动展开**不抢焦点**（不 focus 输入框），移动端不会莫名弹键盘。
- 同一标签页会话只触发一次（`sessionStorage`），同设备 30 分钟内不再触发（`localStorage` 记时间戳）。
- 自动开场进入「精简模式」：隐藏底部快捷栏，三个入口按钮成为唯一选择，避免两排问题打架。
- 三个入口按知识库真实命中率挑选：`0→1 系统`、`Agent 深度`、`技术栈`（实测 top1 分别 0.22 / 0.22 / 0.176，
  都能召回对应切片），不选"离职原因""期望薪资"这类会落到统一话术的问题。

实测（本地 + 线上）：4s 气泡出现 → 11s 面板展开（1 条开场消息 + 3 个按钮）→ 点「技术栈 →」直接返回带依据的答案；
"先手动开一次再关掉""30 分钟内二次访问"两种场景都不会再自动弹。
