#!/bin/bash
# launchd 包装脚本：给同步脚本补齐 node/npx 的 PATH，然后调用它
#
# 用途：macOS 的 launchd 环境 PATH 极简（没有 npx），而 wrangler 依赖 node，
#      这里动态探测可用的 node（优先系统路径，其次 Doubao 自带运行时），再执行同步。

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_TAG="[pages-sync $(date '+%Y-%m-%d %H:%M:%S')]"

NODE_BIN=""
for d in /opt/homebrew/bin /usr/local/bin \
         "$HOME/Library/Application Support/Doubao/sandbox_runtime/bases"/*/bin; do
  if [ -x "$d/node" ] && [ -x "$d/npx" ]; then
    NODE_BIN="$d"
  fi
done

if [ -z "$NODE_BIN" ]; then
  echo "$LOG_TAG 找不到 node/npx，跳过（装了 Node.js 或打开豆包后会自动恢复）"
  exit 1
fi

echo "$LOG_TAG 使用 node: $NODE_BIN"
export PATH="$NODE_BIN:/usr/bin:/bin:/usr/sbin:/sbin"
export HOME="${HOME:-/Users/shenge}"

cd "$ROOT"
exec "$ROOT/scripts/sync-pages-from-github.sh"
