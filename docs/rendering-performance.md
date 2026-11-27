# 主页渲染性能：局部渲染设计与落地

> 目标：让浏览器只做「用户看得到」的工作，屏外内容与用不到的脚本延后加载/渲染。
> 本页记录 2026-11-28 落地的三层优化、取舍原因与后续可选项。

## 背景诊断

| 指标 | 优化前 | 数据来源 |
| --- | --- | --- |
| 首屏本地外链脚本 | 约 551 KB / 20 个 `<script>` | `dist-react/index.html` 实测 |
| 公司档案脚本 | 271 KB（数据 153 + 抽屉 58 + 全景 18 + 互动 13 + 加密 29） | 文件体积实测 |
| 首屏 `loading="lazy"` 图片 | 0 张 | 构建产物统计 |
| 屏外板块渲染 | 全部参与布局与绘制 | 无 `content-visibility` |
| 历史 Lighthouse（迁移前基线） | 移动 55 分 / FCP 22.2s / LCP 25.3s | `tests/e2e/baseline/lighthouse/summary.json` |

> 历史基线来自 `shenge-work.pages.dev` + pre-react 版本，仅作趋势参考；本地无压缩静态服务
> 的 Lighthouse 分数（无 Brotli / 无 CDN）与线上不可直接比较，不用于验收。

## 落地的三层优化

### 1. 视口隔离（`css/style.css`）

```css
@supports (content-visibility: auto) {
  .section:not(#works) {
    content-visibility: auto;
    contain-intrinsic-size: 900px;      /* 老浏览器降级 */
    contain-intrinsic-size: auto 900px; /* 新浏览器记住真实高度 */
  }
  .section:target { content-visibility: visible; }
}
```

- **为什么排除 `#works`**：作品滚动带的时长依赖首组卡片实测宽度（`layoutWorks()`），
  屏外跳过渲染会量出 0，导致动画时长错误。
- **为什么 `:target` 兜底**：导航锚点跳转到屏外板块时，若元素仍处于 skip 状态，
  浏览器无法定位；强制 visible 保证落点准确（实测 `#skills` 落点 top=84，无偏移）。
- **hero / 推荐人板块**不带 `.section` 类，天然不受影响；首屏 LCP 不延迟。

### 2. 公司档案脚本按需加载（`js/company-lazy.js`）

首页只有「工作经历板块的公司徽章 / 公司名」会用档案脚本，但 5 个脚本共 271 KB
原本在首屏全部加载。改为一个 <2KB 的加载器，四种触发：

1. **深链** `#company=xxx` → 立即加载（抽屉原本就支持 hash 深链）；
2. **视口接近** → `IntersectionObserver` + `rootMargin: 600px`，滚到经历板块前提早加载；
3. **交互意图** → `pointerover` / `focusin` 到 `[data-cp]`，点击前就动手；
4. **点击兜底** → 捕获阶段拦截并记录 cid，脚本就绪后补开一次抽屉。

脚本按 `async=false` 顺序注入（数据 → 全景 → 互动 → 加密 → 抽屉），
保证 `company-profile.js` 读取 `window.COMPANY_PROFILES` 时数据已就位。
`resume.html` 与独立档案页 `company.html` 仍走原脚本，不受影响。

**收益**：首屏本地脚本 551 KB → 284 KB（-48%），`<script>` 标签 20 → 16。

### 3. 图片懒加载

- 首屏 LCP 形象照（`idcardPhoto`）：`fetchpriority="high"` + `decoding="async"`，保持高优先级、**不 lazy**；
- 视口外图片（关于我照片、项目封面、获奖图、校徽）：`loading="lazy"` + `decoding="async"`。

### 4. 远程数据视口预取（2026-11-28 追加）

留言墙（`/api/wall`，D1 查询）与 GitHub 贡献图（`data/contributions.json`）都在页面最底部，
原先首屏就发请求。新增通用 helper `whenNearViewport(el, run, margin)`（`js/main.js`）：

- 元素距视口超过 600px 时挂 `IntersectionObserver`，滚到前 600px 才触发请求，
  保证「滚到时数据已就绪」；不支持 IO / 元素不存在 / 首屏本就可见 → 立即执行（降级不丢功能）；
- 一次性触发后 `disconnect`，不随滚动反复判断；
- 留言墙在延迟前先 `render()` 出 `loading` 骨架，锚点直跳 / 页内查找定位不会看到空白；
- 骨架屏沿用现有 `wall-skeleton`（shimmer）与 `renderGhSkeleton`（SVG 占位），未另造体系。

**未做项的判断**：`renderSite()` 按视口分批重渲染不做——SSG 已全量直出，线上 LCP 元素是 SSG
文本而非 JS 产物，TBT 仅 200ms，全量幂等重渲染不是瓶颈；而导航编号重排 / `layoutWorks()`
宽度测量 / 进场观察器 / AI 面板都依赖 `renderSite()` 先跑完，拆开风险远大于收益。

## 线上实测（2026-11-28）

在 `shenge-work.pages.dev` 用 Lighthouse（mobile + 4G 节流、浏览器 UA）实测主页，
作为 React 迁移与三批优化后的**首个线上观测点**（非同环境精确 A/B，仅供趋势对照）：

| 指标 | pre-react 基线（11-25） | 线上现状（11-28） |
| --- | --- | --- |
| Performance | 55 | **62** |
| FCP | 22.2 s | **2.9 s** |
| LCP | 25.3 s | **6.9 s** |
| TBT | 70 ms | 200 ms |
| CLS | 0 | **0.001** |
| Speed Index | — | 6.5 s |

LCP 元素为 SSG 直出的 `#heroBio`（TTFB 约 857 ms，占 12%）。剩余瓶颈诊断：
渲染阻塞 CSS 约 960 ms（`style.css` 725 + `fonts.css` 362）、未用 JS 约 134 KiB、
未用 CSS 约 178 KiB、非现代图片格式约 168 KiB、DOM 1110 元素。
其中 CSS 体积与渲染阻塞是下一阶段最高 ROI 的方向，本次未动。

> 口径说明：旧基线为 pre-react 版本，本次为优化后版本，两者并非同一构建的严格 A/B；
> 分数受线上负载 / CDN 缓存状态波动影响。此数据用于确认「没有回退 + 大方向改善」，
> 不用于精确归因。本次观测已记入 `tests/e2e/baseline/lighthouse/summary.json` 的
> `observations` 数组（按项目约定，该目录仅入库 summary，原始 Lighthouse 报告不入库）。

## 验证

- `node --test tests/*.test.mjs`：**300/300 通过**（含新增 7 项 `company-lazy.test.mjs`、4 项 `viewport-lazy.test.mjs`）；
- `npx vitest run`：26/26；
- Chrome 无头实测（本地混合产物）：
  - 首屏 `CompanyProfile` 未加载、加载器已就位、`about` 板块 `content-visibility:auto`、
    `works` 保持 `visible`、LCP 图 `fetchpriority=high`；
  - 滚到经历板块 → 档案脚本自动就绪；点击徽章 → 抽屉正常打开；
  - 锚点跳转 `#skills` 落点 top=84 无偏移；4 张经历卡 / 12 张作品卡渲染完整；零页面错误。

## 已知约束与后续可选项

- `content-visibility` 用 `contain-intrinsic-size: auto 900px` 占位，首次渲染前滚动条高度
  可能与真实高度略有出入；`auto` 会记住真实尺寸，二次滚动后精确。
- AI 面板 React 岛已是 `client:idle`；其余页面（company/school/jd）用 `client:load`，
  若后续要进一步降低 TBT，可评估改为 `client:visible`。
- 留言墙 / 贡献图已改为视口预取（见 §4）；访问计数等其余远程数据仍首屏发起，体量小、暂不动。
- 线上 Lighthouse 已重跑一次（见「线上实测」）；注意本次优化（远程数据预取）尚未上线，
  下一次部署后可再测一次确认收益是否叠加。
