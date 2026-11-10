# Cloudflare Pages 备用托管（自动构建）

GitHub Pages 之外的备用线路，同一套静态文件，`push` 到 `main` 自动构建部署。

## 线上地址

- 作品集主页：https://shenge-work.pages.dev/
- 在线简历：https://shenge-work.pages.dev/resume.html
- 预览部署（其他分支 / PR）：`https://<commit-sha>.shenge-work.pages.dev`

## 项目配置

| 项 | 值 |
|---|---|
| 项目名 | `shenge-work` |
| 数据源 | GitHub `shenge-work/shenge-work.github.io`，生产分支 `main` |
| 构建命令 | `mkdir -p dist && cp -r index.html resume.html css js data images videos assets favicon-64.png favicon.png dist/` |
| 输出目录 | `dist` |
| 根目录 | 仓库根（留空） |

仓库里的 `functions/`（腾讯云函数源码）、`worker/`、`docs/`、`scripts/` 不进构建产物，只部署前端真正要用的文件。

## 触发方式

- **push 到 `main`** → 自动生产部署
- **push 到其他分支 / 开 PR** → 自动预览部署，不影响生产
- 需要手动重跑时，在 Cloudflare 控制台 `Pages → shenge-work → Deployments` 里点 “Retry deployment”

## 与 GitHub Pages 的关系

- 两边读同一份仓库，内容一致；改完 push 一次，两个站都会更新
- 统计 / 计数 / AI 问答后端与域名无关，两边共用同一套
- 已知差异：Pages 默认 pretty URL，`/resume.html` 会 308 跳到 `/resume`；GitHub Pages 保持 `/resume.html`

## 兜底：wrangler 直传

自动构建不可用（Cloudflare 构建排队故障、Git 仓库不可达等）时，用本地脚本直传同一套文件：

```bash
./scripts/deploy-pages.sh            # 上传并校验线上 md5
./scripts/deploy-pages.sh --dry-run  # 只看会传哪些文件
```

直传会用 `wrangler pages deploy` 覆盖生产部署，内容与仓库当前工作区一致，适合紧急修复。
