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

## 验证

- `node --test tests/*.test.mjs`：**296/296 通过**（含新增 7 项 `company-lazy.test.mjs`）；
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
- 远程数据（留言墙、贡献图、访问计数）仍首屏发起请求；要做数据级懒加载需配合骨架屏，
  现有 `wall-skeleton` 与 3D `LOADING` 占位可复用。相关待办见 `docs/TODO.md`。
- 若要量化线上收益，需在 Cloudflare Pages 部署后重跑 Lighthouse，与
  `tests/e2e/baseline/lighthouse/summary.json` 同环境对比。
