#!/usr/bin/env bash
# 作品集静态站 —— Cloudflare Pages 部署脚本（GitHub Pages 之外的备用托管）
#
# 用法：
#   ./scripts/deploy-pages.sh              # 直接上传当前静态文件到 shenge-work 项目
#   ./scripts/deploy-pages.sh --dry-run    # 只打印会传哪些文件，不真的部署
#
# 线上地址：
#   生产环境  https://shenge-work.pages.dev
#   预览环境  https://<commit>.shenge-work.pages.dev
#
# 说明：
#   · 上传静态资源（HTML / CSS / JS / data / images / videos / assets(3D 皮肤) / favicon）
#     及 functions/api（Cloudflare Pages Functions：留言墙 /api/wall、简历投递 /api/deliver）；
#     不上传 functions/tencent（腾讯云函数源码）、worker/、.git、docs；
#   · Functions 需在 Pages 项目 Settings 里绑定 KV（SITE_KV）与变量
#     （RESEND_API_KEY 等），见 docs/resume-delivery.md；
#   · Cloudflare Pages 单文件上限 25MB，当前最大文件 videos/lessie-demo.mp4 约 9.8MB，安全；
#   · 首次部署需登录：npx wrangler login（本机已登录，凭据在 ~/Library/Preferences/.wrangler）。

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
PROJECT="shenge-work"
BRANCH="main"
STAGE="$(mktemp -d "${TMPDIR:-/tmp}/portfolio-pages.XXXXXX")"

DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
    *) echo "未知参数：$arg"; exit 2 ;;
  esac
done

trap 'rm -rf "$STAGE"' EXIT

echo "=== ① 收集静态资源 + Pages Functions"
for item in index.html resume.html css js data images videos assets favicon-64.png favicon.png functions; do
  if [ ! -e "$item" ]; then
    echo "✗ 缺少 $item，先检查仓库是否完整"
    exit 1
  fi
  rsync -a "$item" "$STAGE/"
done
# 只带 functions/api（留言墙 / 投递），不带 functions/tencent（腾讯云函数源码）
rm -rf "$STAGE/functions/tencent"
if [ ! -d "$STAGE/functions/api" ]; then
  echo "✗ 缺少 functions/api（留言墙 / 投递函数）"
  exit 1
fi

FILE_COUNT=$(find "$STAGE" -type f | wc -l | tr -d ' ')
TOTAL_SIZE=$(du -sh "$STAGE" | awk '{print $1}')
echo "   $FILE_COUNT 个文件，合计 $TOTAL_SIZE"

BIG=$(find "$STAGE" -type f -size +25M 2>/dev/null || true)
if [ -n "$BIG" ]; then
  echo "✗ 以下文件超过 Cloudflare Pages 单文件 25MB 上限："
  printf '%s\n' "$BIG"
  exit 1
fi

echo "=== ② 前置检查：wrangler 登录状态"
if ! npx --yes wrangler@latest whoami >/dev/null 2>&1; then
  echo "尚未登录 Cloudflare，先执行：npx wrangler login"
  exit 1
fi

if [ "$DRY_RUN" = "1" ]; then
  echo "=== ③ dry-run：待上传清单"
  (cd "$STAGE" && find . -type f | sed 's|^\./|   |' | sort)
  echo "（未实际上传）"
  exit 0
fi

echo "=== ③ 部署到 Cloudflare Pages（项目 ${PROJECT} / 分支 ${BRANCH}）"
# 在暂存目录里执行，wrangler 的 .wrangler 缓存就不会落到仓库根目录
(cd "$STAGE" && npx --yes wrangler@latest pages deploy . \
  --project-name="$PROJECT" \
  --branch="$BRANCH" \
  --commit-dirty=true)

echo "=== ④ 验证线上"
PROD="https://$PROJECT.pages.dev/"
for path in "" resume.html data/site-data.json css/style.css js/main.js; do
  code=$(curl -sL --ipv4 -o /dev/null -w '%{http_code}' -A "Mozilla/5.0" "${PROD}${path}")
  echo "   ${code}  ${PROD}${path}"
done
echo "本地首页 md5: $(md5 -q index.html)"
echo "线上首页 md5: $(curl -sL --ipv4 -A "Mozilla/5.0" "$PROD" | md5 -q)"
echo
echo "完成：$PROD"
