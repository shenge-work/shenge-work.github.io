# Cloudflare Pages 备用托管

GitHub Pages 之外的备用线路，同一套静态文件。当前线上地址：

- 作品集主页：https://shenge-work.pages.dev/
- 在线简历：https://shenge-work.pages.dev/resume.html

## 当前实际形态（2026-11-11）

项目 `shenge-work` 已配置为 GitHub 数据源（`shenge-work/shenge-work.github.io`，生产分支 `main`），但 **Cloudflare 的 GitHub App 尚未授权该仓库**，所以 `push` 不会触发 Cloudflare 自动构建。

实际生效的同步方式有两种：

1. **本机 launchd 定时同步（当前生效）**
   - 每小时跑一次 `scripts/sync-pages-from-github.sh`
   - 通过 `api.github.com` 取 `main` 最新 commit，用 `codeload` 下 tar 包，只取静态资源直传 Pages
   - 幂等：commit 未变则跳过；部署后逐文件比对 md5 一致才记录状态
   - 日志：`~/Library/Logs/pages-sync.log`、`~/Library/Logs/pages-sync.err.log`
   - 状态：`~/.local/state/pages-sync/shenge-work.last-commit`
   - 停用：`launchctl bootout gui/$(id -u)/com.shenge.pages-sync`

2. **手动强制同步**
   ```bash
   ./scripts/sync-pages-from-github.sh --force   # 忽略状态，立即按远端 main 部署
   ./scripts/sync-pages-from-github.sh --check   # 只看远端有无新提交
   ./scripts/deploy-pages.sh                     # 按本地工作区直传（紧急修复用）
   ```

## 想要「push 即部署」需做的两步

到 GitHub 给 Cloudflare 的 App 授权本仓库（一次性）：

1. 打开 https://github.com/settings/installations
2. 找到 **Cloudflare Pages**，点 `Configure` → `Repository access` 选中 `shenge-work.github.io` → `Save`

授权后 push 到 `main` 由 Cloudflare 直接构建，本机定时同步可停掉。

## 项目配置

| 项 | 值 |
|---|---|
| 项目名 | `shenge-work` |
| 数据源 | GitHub `shenge-work/shenge-work.github.io`，生产分支 `main` |
| 构建命令 | `mkdir -p dist && cp -r index.html resume.html css js data images videos assets favicon-64.png favicon.png dist/` |
| 输出目录 | `dist` |
| 根目录 | 仓库根（留空） |

仓库里的 `functions/`（腾讯云函数源码）、`worker/`、`docs/`、`scripts/` 不进构建产物，只部署前端真正要用的文件。

## 跨域（CORS）白名单

页面的 AI 问答走腾讯云 CloudBase 函数 `resume-ai-chat`，它按 `Origin` 做白名单校验（见 `functions/tencent/index.js`），不放行就返回 403 `origin_denied`，浏览器侧报 CORS 错误。

- 平台环境变量 `ALLOWED_ORIGINS`（逗号分隔）**优先于代码默认值**。当前线上已配置为：
  ```
  https://shenge-work.github.io,https://shenge-work.pages.dev
  ```
  实测两个域名均回显自身 ACAO，外来域名返回 403。
- 代码默认值已包含 `https://shenge-work.github.io`、`https://shenge-work.pages.dev`，以及通配规则 `*.shenge-work.pages.dev`（覆盖每个 commit 的预览部署 `https://<commit>.shenge-work.pages.dev`）。
- **通配规则要生效需要重新部署函数代码**：旧的线上包只做精确匹配，而环境变量又是精确列表，所以预览子域目前仍不放行。重传代码后，可直接把环境变量改回不设置（走代码默认值）或显式写入 `*.shenge-work.pages.dev`。

## 与 GitHub Pages 的关系

- 两边跑同一份仓库，最终内容一致
- 统计 / 计数 / AI 问答后端与域名无关，两边共用同一套
- 已知差异：Pages 默认 pretty URL，`/resume.html` 会 308 跳到 `/resume`；GitHub Pages 保持 `/resume.html`
