# 右下角 AI 助手 · 3D 角色皮肤系统（设计 + 实施 + 迭代）

> 文档定位：本文件是 `shenge-work.github.io` 右下角 AI 问答助手**视觉层**的单一依据。记录「方形按钮 → 可切换 3D 角色」的完整演进：方案调研、技术选型、9 款皮肤架构、实施踩坑、验证结果，以及后续迭代方向。
>
> 它是 `docs/ai-assistant-survey.md`（RAG 问答后端）的**姊妹篇**：那份管"答什么"，这份管"长什么样"。两份互补，不重叠。
>
> 版本：v1（2026-11-10）· 状态：已上线 · 作者：陈培胜

---

## 0. 结论摘要（先看这四条）

1. **全站本没有 three.js**，右下角就是个 `<button class="ai-fab">` + CSS 画的方框。所以"不想重开发 3D 角色"这个约束天然成立——所有方案都不需要手写一行 three.js。
2. **选型落地为 `<model-viewer>` Web Component + 官方示例 GLB**：一个 HTML 标签 + `autoplay animation-name` 就有待机动画，动画是现成的 API 调用（`mv.animationName = 'Wave'`）。
3. **做了 9 款可切换皮肤**（3 款真 3D GLB + 5 款本地 SVG + 1 款 AI 生成立绘），右键/双击/长按/快捷键可换，`localStorage` 记忆，**问答逻辑（`js/main.js`）一行没改**。
4. **默认皮肤是 3D 机器人**，首次进入页面主动挥手打招呼并自我介绍「我是 AI 简历问答助手」，角色完全取代了原方框、无边框悬浮在页面上。

---

## 1. 背景与目标

### 1.1 痛点
- 原右下角是纯 CSS 方形 FAB 按钮（约 130×45 px），写"简历问答"，很不起眼。
- 用户希望换成「AI 数字人 / AI 宠物」，最好待机时有动作，且**不重新开发 three.js 3D 角色**。
- 角色进入页面时用户很懵，不知道它是干嘛的，需要主动自我介绍。

### 1.2 目标（本会话完成）
- 找到一个好看的现成数字人/宠物素材，替换方框按钮。
- 待机时有动作、有活动。
- 支持多款皮肤切换（右键/双击/长按/快捷键）。
- 默认 3D，首次进入主动打招呼。

### 1.3 非目标（明确不做）
- 不接入实时数字人 SaaS（D-ID / HeyGen LiveAvatar）——按分钟计费、需 API Key、WebRTC 视频流，与静态站 RAG 冲突。
- 不引入 Live2D / Rive / Petfolio 的外部 runtime 与社区模型——规避版权与境内 CDN 问题（见第 3 节）。
- 不改动问答后端（CloudBase RAG）的任何逻辑。

---

## 2. 技术选型：为什么是 model-viewer + 官方 GLB

### 2.1 候选方案对比

| 方案 | 待机动画 | 授权 | 集成成本 | 结论 |
|---|---|---|---|---|
| **`<model-viewer>` + Khronos/three.js 官方 GLB** | ✅ 开箱即用，多段可切 | CC0 / MIT 干净 | 1 个 HTML 标签 | ✅ **主方案** |
| Rive / Lottie 2D 角色 | ✅ 状态机 idle 循环 | 社区文件授权不一 | 需 runtime | ⚠️ 用本地 SVG 等效 |
| 网页桌宠（Petfolio / webmeji） | ✅ 随机走/跳/爬墙 | MIT / 公有领域 | 1 行脚本 | ⚠️ 本地等效 |
| Live2D 看板娘 | ✅ 呼吸/眨眼/跟随 | **灰色**（游戏拆包） | 1 行脚本 | ❌ 版权 + 风格冲突 |
| AI 生成 3D（混元/图片转 3D） | ❌ **静态网格无骨骼** | 自有 | 生成 + 绑骨 + 转 GLB | ⚠️ 仅作立绘 |
| 实时数字人 SaaS | ✅ 唇形同步 | 商用 API | 重构 + 按分钟付费 | ❌ 不划算 |

### 2.2 关键发现：AI 生成 3D 的致命短板

WorkBuddy 内置的 3D 生成能力（`buddy-multimodal-generation` 的 `3d` 命令）产出的是**静态网格 + 贴图，没有骨骼、没有待机动画**。要动起来得补 Mixamo 自动绑骨（只支持 T-pose 人形、只导 FBX/DAE、中国区账号受限），成本高、返工风险大。

**结论**：现成 GLB（自带骨骼动画）远优于 AI 生成 3D。AI 生成只用于**透明底立绘**（第 8 款皮肤），配 CSS 呼吸浮动。

### 2.3 选定的模型

| 模型 | 大小 | 自带动画 | 授权 | 用途 |
|---|---|---|---|---|
| `RobotExpressive.glb` | 456 KB | Idle / Wave / ThumbsUp / Dance 等 14 段 | CC0 / MIT | 机器人、混合皮肤 |
| `Fox.glb` | 160 KB | Survey / Walk / Run | CC0 + CC-BY 4.0 | 狐狸皮肤 |

来源：`KhronosGroup/glTF-Sample-Assets`、`mrdoob/three.js` 官方示例。

---

## 3. 架构设计

### 3.1 分层与职责

```
┌────────────────────────────────────────────┐
│ index.html（只加两行引用）                    │
│  css/ai-skins.css   js/ai-skins.js          │
└──────────────┬─────────────────────────────┘
               │
   ┌───────────▼────────────┐
   │ .ai-stage 角色舞台（fixed）│  ← 透明悬浮，无边框
   │  .ai-stage-actor         │
   │    model-viewer / SVG    │  ← 皮肤渲染层
   │  .ai-stage-name 名字标签  │
   │  .ai-stage-menu-btn ◈    │
   └───────────┬────────────┘
               │ MutationObserver 观察 aiPanel / aiBody
   ┌───────────▼──────────────────────────┐
   │ 原 aiFab（视觉隐藏，DOM 保留）          │  ← JS 仍程序化 .click()
   │ js/main.js 问答逻辑（零改动）           │
   └──────────────────────────────────────┘
```

### 3.2 核心机制：状态联动不碰 main.js

角色状态 `idle / thinking / answer / greet / click` 通过 **MutationObserver** 观察原有 DOM 变化驱动：

| 触发 | 观察点 | 角色动作 |
|---|---|---|
| 打开面板 | `aiPanel.hidden` 变化 | `greet`（Wave 挥手） |
| 打字中 | `aiBody` 出现 `.ai-typing` | `thinking`（站立/踱步） |
| 回答完 | `.ai-typing` 消失 | `answer`（ThumbsUp 比赞） |
| 主动打招呼气泡 | `aiFab.parentNode` 出现 `.ai-fab-tip` | `greet`（Wave） |

这样 `js/main.js` 的问答、自动打招呼、埋点**完全不需要改**，角色皮肤是纯叠加层。

### 3.3 皮肤契约

每款皮肤是一个工厂函数，返回统一接口：

```js
create(host) -> {
  setState(s),   // idle / thinking / answer / greet / click
  destroy()      // 清理 timer / listener
}
```

9 款皮肤共用这一个契约，`activate(id)` 统一调度：销毁旧实例 → 创建新实例 → 更新名字标签 → 写 localStorage。

### 3.4 为什么保留原 aiFab（不 display:none）

原方框 `.ai-fab` 不能 `display:none`，因为问答面板、打招呼气泡都靠 JS 程序化 `aiFab.click()` 触发，删了会失效。正确做法是**视觉隐藏但保留 DOM**：

```css
body.has-ai-skin .ai-fab {
  visibility: hidden; opacity: 0; pointer-events: none;
}
```

`.ai-fab-tip` 气泡是 `position:fixed` 独立定位，不依赖 aiFab 的 rect，所以隐藏后气泡仍正常。

---

## 4. 9 款皮肤清单

| # | id | 名称 | 类型 | 待机/状态动作 |
|---|---|---|---|---|
| 1 | `robot3d` | 机器人 ROBOT | 真 3D GLB | Idle 循环，思考→站立，答完→ThumbsUp，点击→Jump |
| 2 | `fox3d` | 狐狸 FOX | 真 3D GLB | Survey 环顾，思考→Walk，打招呼→Run（侧面平视不自转） |
| 3 | `hybrid` | 混合 HYBRID | 真 3D + HUD | 同 GLB + 档案风虚线框/扫描线/状态牌 |
| 4 | `cpbot` | CP.AI 档案机器人 | 本地 SVG | 呼吸、眼睛扫描、天线摆动、状态灯 |
| 5 | `cat2d` | 猫宠 NYAN | 本地 SVG | 6s 呼吸循环 + 尾巴/耳朵/眨眼/抬爪 |
| 6 | `live2d` | 看板娘 ARCHIVIST | 本地 SVG | 分层视差、眨眼、发丝、口型 |
| 7 | `deskpet` | 桌宠 SHIMEJI | 本地 SVG | 随机走/坐/跳/挥手，可拖拽 |
| 8 | `generated` | 专属形象 GENERATED | AI 立绘 | 透明底 PNG + CSS 呼吸浮动 |
| 9 | `talking` | 实时数字人 LIVE | 本地 SVG | 呼吸、口型、声波波形 |

**菜单唤起方式**：右键角色 · 双击角色 · 长按 550ms（手机）· 点 ◈ 按钮 · 按 `S` 键。数字 `1–9` 直接切换。

---

## 5. 资源与授权

| 资源 | 大小 | 授权 | 说明 |
|---|---|---|---|
| `assets/skins/models/RobotExpressive.glb` | 456 KB | CC0 / MIT | three.js 官方示例 |
| `assets/skins/models/Fox.glb` | 160 KB | CC0 + CC-BY 4.0 | Khronos glTF 示例 |
| `assets/skins/vendor/model-viewer.min.js` | 960 KB | Apache-2.0 | 空闲懒加载，非阻塞 |
| `assets/skins/generated.png` | 136 KB | 自有 | AI 生成立绘，已抠背景 |
| `assets/skins/preview.png` | 120 KB | 自有 | 9 款皮肤总览图 |

全部本地化，离线可用。5–7、9 号皮肤为**本地 SVG 等效实现**，未引入 Live2D/Rive/Petfolio 的外部 runtime，规避版权与境内 CDN 不稳。

---

## 6. 实施踩坑记录（都是实测才知道的）

1. **classic script 里动态 `import()` 必须用绝对 URL**：`new URL(path, document.baseURI).href`，裸相对 specifier 会报 `Failed to resolve module specifier`。
2. **AI 出图的"透明背景"是假的**：ImageGen 的 `transparent` 实际把棋盘格画进了 RGB（alpha 全 255）。用从四边 BFS 的连通域抠图（判定 `max-min<18 且 min>188`）才拿到真透明，顺带去掉右下角水印。
3. **SVG 动画元素要统一 `transform-box: fill-box`**，否则 origin 在浏览器间不一致。
4. **Fox 相机角度**：`90deg 80deg` 且关闭 auto-rotate 才是正常侧面站立；Robot 用 `175%→270%` 距离避免自转/透明舞台裁切。
5. **透明舞台下 3D 模型会裁切**：去掉背板后模型占满全高，需要拉远 `camera-orbit` 距离（robot3d 270%、fox3d 200%、hybrid 250%）并减小 fov。
6. **素材下载通道**：本机 `raw.githubusercontent.com` 与 `cdn.jsdelivr.net` 不可达，`unpkg.com` / `registry.npmjs.org` 可达；GLB 走 `api.github.com/repos/.../contents/...` + `Accept: application/vnd.github.raw`。
7. **脚本缓存会骗人**：GitHub Pages CDN 会吐旧 JS，前端脚本要加 `?v=YYYYMMDD` 版本参数（详见 ai-assistant-survey.md 13.6）。

---

## 7. 主动性打招呼（首次进入即自我介绍）

用户反馈 3D 角色进入页面时很懵，需要主动自我介绍。方案：

| 时间点 | 动作 |
|---|---|
| 0.5s | 3D 模型加载完成（预加载，非阻塞） |
| 1.5s | 气泡出现「👋 我是 AI 简历问答助手，点我直接问～」+ 机器人挥手 |
| 3.5s | 挥手结束回 idle，气泡持续显示 |
| 10s | 仍未搭理才展开面板，递上 3 个快捷入口 |

**关键参数**（`js/main.js` 的 `AI_CONFIG`）：
- `autoTip`: `'👋 我是 AI 简历问答助手，点我直接问～'`
- `autoTipAhead`: `8500`（气泡在 `autoDelay - autoTipAhead = 1.5s` 冒出）
- `autoDelay`: `10000`（展开面板时刻）
- `autoCooldown`: `30 * 60 * 1000`（30 分钟冷却，避免每次刷新骚扰）

**设计取舍**：保留渐进式（先气泡自我介绍 → 不搭理才展开面板），而非一进页面硬弹大面板；保留 30 分钟冷却，真正"首次进入"（新会话）一定打招呼。

---

## 8. 验证结果（本机 Edge + playwright-core + http.server）

| 检查项 | 结果 |
|---|---|
| 默认皮肤 | 机器人 ROBOT（3D，`loaded=true`）✅ |
| 舞台背景/边框/阴影 | 全透明 / none / none ✅ |
| 原方框按钮 | `visibility:hidden`、不可点击 ✅ |
| 单击角色开面板 | ✅ |
| 右键/双击/长按/◈/S 开菜单 | ✅ |
| 9 款皮肤切换 | 全通过 ✅ |
| 首次进入打招呼（气泡+挥手） | ✅ 时序符合第 7 节 |
| 390px 移动端横向溢出 | 无 ✅ |
| 控制台报错 | 0 ✅ |

---

## 9. 后续迭代方向（思考）

### 9.1 体验层（优先级高，成本低）
- **语音播报**：回答时用浏览器 TTS（`speechSynthesis`）读出答案，配合机器人 Wave 动画，更像"会说话的数字人"。零后端、零 Key，成本趋近 0。
- **口型同步**：机器人回答时让模型播放"说话"动画段（RobotExpressive 有 `Talking` 类动画可挖），或给 SVG 皮肤做更细腻的口型。
- **情绪状态**：根据回答内容（含"抱歉/失败"关键词）切到不同表情动画（沮丧/开心），而非只有 idle/answer 两种。

### 9.2 能力层（中等成本）
- **点击互动彩蛋**：多次点击机器人触发不同动作（当前只有 Jump），加个动作轮换。
- **待机活动池**：狐狸/机器人 idle 太久时随机触发一次小动作（现在是固定循环），避免"站桩"感。
- **桌宠全局活动**：把 deskpet 皮肤做成真正能在页面里走动、爬墙的桌宠（当前限制在舞台内）。

### 9.3 工程层（高价值，长期）
- **皮肤市场/外置皮肤包**：把皮肤定义抽成 JSON 配置，支持 `assets/skins/*/manifest.json` 动态加载，第三方可贡献皮肤，无需改 JS。
- **AI 生成立绘工作流固化**：把第 8 款的"生成 → 抠图 → 压缩 → 替换 generated.png"流程脚本化（`scripts/build_avatar.py`），换形象一键完成。
- **性能监控**：3D GLB 的加载耗时、WebGL 兼容性埋点，接入现有 `js/analytics.js`，识别低端设备自动降级 SVG。

### 9.4 决策待办
- **是否上语音 TTS**：收益（更像数字人）vs 成本（移动端 autoplay 限制、无声音设备），需先小范围验证。
- **狐狸 vs 机器人的默认选择**：机器人动画丰富（14 段），狐狸更可爱。当前默认机器人，可 A/B 看访客留存。
- **30 分钟冷却是否缩短/去掉**：若发现"首次进入打招呼"对引导对话有帮助，可缩短冷却或改为按会话。

---

## 附录 A：文件清单（本会话新增/改动）

```
新增：
  css/ai-skins.css            # 皮肤系统全部样式
  js/ai-skins.js              # 皮肤系统逻辑（工厂 + 舞台 + 菜单 + 状态联动）
  assets/skins/models/        # Fox.glb / RobotExpressive.glb
  assets/skins/vendor/        # model-viewer.min.js
  assets/skins/generated.png  # AI 生成专属立绘
  assets/skins/preview.png    # 9 款皮肤总览图

改动：
  index.html                  # 引入 ai-skins.css/js，版本号 v=20261110d
  js/main.js                  # AI_CONFIG.autoTip 文案 + autoTipAhead 时机
```

## 附录 B：本地验证命令

```bash
# 起本地预览（3D 需 http，不能用 file://）
python3 -m http.server 8899
# 打开 http://127.0.0.1:8899/index.html

# 控制台调试入口
window.CPAI_SKINS.list()      # 列出 9 款皮肤
window.CPAI_SKINS.use('fox3d')# 切换
window.CPAI_SKINS.menu()      # 打开菜单
window.CPAI_SKINS.current()   # 当前皮肤 id
```

## 附录 C：参考依据

- `<model-viewer>` 官方文档与动画示例：https://modelviewer.dev/examples/animation
- Khronos glTF 示例资产：https://github.com/KhronosGroup/glTF-Sample-Assets
- three.js 官方示例模型：https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf
- 姊妹篇（问答后端）：`docs/ai-assistant-survey.md`
