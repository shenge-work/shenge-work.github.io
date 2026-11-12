#!/usr/bin/env bash
# 把 GitHub 上 main 的最新提交同步部署到 Cloudflare Pages（shenge-work 项目）
#
# 背景：Cloudflare 的 GitHub App 未授予本仓库访问权，push 不会触发 Pages 自动构建，
#      所以用本机 wrangler 凭据做「拉最新 + 直传」的兜底同步，可交给定时任务反复跑。
#
# 走 api.github.com + codeload 取代码，不依赖 git 协议（本机 github.com:443 时常不通）。
#
# 用法：
#   ./scripts/sync-pages-from-github.sh            # 有更新才部署
#   ./scripts/sync-pages-from-github.sh --force    # 强制部署一次
#   ./scripts/sync-pages-from-github.sh --check    # 只看远端有无更新，不部署
#
# 幂等：远端 commit 与上次部署记录相同则直接退出，不产生多余部署。

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
REPO="shenge-work/shenge-work.github.io"
PROJECT="shenge-work"
STATE_DIR="${HOME}/.local/state/pages-sync"
STATE_FILE="${STATE_DIR}/${PROJECT}.last-commit"
UA="Mozilla/5.0"

FORCE=0
CHECK_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --check) CHECK_ONLY=1 ;;
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
    *) echo "未知参数：$arg"; exit 2 ;;
  esac
done

mkdir -p "$STATE_DIR"

echo "=== ① 查询 GitHub main 最新提交"
REMOTE=$(curl -s --ipv4 --max-time 20 -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/${REPO}/commits/main" \
  | python3 -c "import json,sys;print(json.load(sys.stdin)['sha'])")
if [ -z "${REMOTE:-}" ]; then
  echo "✗ 拿不到远端 commit sha（api.github.com 不可达？）"
  exit 1
fi

LAST=$(cat "$STATE_FILE" 2>/dev/null || echo "")
if [ -z "$LAST" ]; then
  echo "   远端: ${REMOTE:0:8}  |  上次部署: (无记录)"
else
  echo "   远端: ${REMOTE:0:8}  |  上次部署: ${LAST:0:8}"
fi

if [ "$REMOTE" = "$LAST" ] && [ "$FORCE" = "0" ]; then
  echo "   无新提交，跳过"
  exit 0
fi

if [ "$CHECK_ONLY" = "1" ]; then
  echo "   有新提交待部署"
  exit 0
fi

echo "=== ② 下载该提交的代码包"
TMP=$(mktemp -d "${TMPDIR:-/tmp}/pages-sync.XXXXXX")
trap 'rm -rf "$TMP"' EXIT

TARBALL="$TMP/main.tar.gz"
curl -sL --ipv4 --max-time 180 -A "$UA" \
  -o "$TARBALL" \
  "https://codeload.github.com/${REPO}/tar.gz/${REMOTE}"
if [ ! -s "$TARBALL" ]; then
  echo "✗ 下载失败，codeload 不可达"
  exit 1
fi
mkdir -p "$TMP/src"
tar -xzf "$TARBALL" -C "$TMP/src" --strip-components=1

SITE="$TMP/site"
mkdir -p "$SITE"
for item in index.html resume.html css js data images videos assets favicon-64.png favicon.png functions; do
  if [ ! -e "$TMP/src/$item" ]; then
    echo "✗ 该提交缺少 $item，中止（避免部署出不完整的站点）"
    exit 1
  fi
  cp -R "$TMP/src/$item" "$SITE/"
done
# 只带 functions/api（留言墙 / 简历投递），不带 functions/tencent（腾讯云函数源码）
rm -rf "$SITE/functions/tencent"
if [ ! -d "$SITE/functions/api" ]; then
  echo "✗ 该提交缺少 functions/api，中止"
  exit 1
fi

FILE_COUNT=$(find "$SITE" -type f | wc -l | tr -d ' ')
echo "   ${FILE_COUNT} 个文件，$(du -sh "$SITE" | awk '{print $1}')"

echo "=== ③ 部署到 Cloudflare Pages"
(cd "$SITE" && npx --yes wrangler@latest pages deploy . \
  --project-name="$PROJECT" \
  --branch=main \
  --commit-dirty=true 2>&1 | tail -6)

echo "=== ④ 校验线上与提交内容一致"
PROD="https://${PROJECT}.pages.dev/"
OK=1
for path in index.html resume.html css/style.css js/main.js assets/skins/preview.png; do
  if [ -e "$SITE/$path" ]; then
    local_md5=$(md5 -q "$SITE/$path")
    remote_md5=$(curl -sL --ipv4 -A "$UA" "$PROD$path" | md5 -q)
    if [ "$local_md5" != "$remote_md5" ]; then
      echo "   ✗ $path 不一致"
      OK=0
    fi
  fi
done

if [ "$OK" != "1" ]; then
  echo "部署校验失败，未写入状态文件（下次会重试）"
  exit 1
fi
echo "   ✓ 线上内容与该提交一致"

echo "$REMOTE" > "$STATE_FILE"
echo "完成：${PROD} ← ${REMOTE:0:8}"
