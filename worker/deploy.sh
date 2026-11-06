#!/usr/bin/env bash
# 一键部署全站访客计数器到 Cloudflare（把你手动跑的 4 条命令封装成 1 条）
#
#   bash worker/deploy.sh
#
# 做的事：本地自测 → 检查/触发登录 → 查找或创建 KV → 写入 wrangler.toml →
#        部署 → 用两种 Origin 打接口验证 → 把 workers.dev 地址记到 worker/.deploy-url
# 需要你参与的只有一步：浏览器弹出的 Cloudflare 授权。

set -euo pipefail

cd "$(dirname "$0")"

say() { printf '\n=== %s\n' "$1"; }

say "① 本地自测（部署前先确认逻辑没坏）"
command -v node >/dev/null 2>&1 || { echo "缺少 Node.js，先装：https://nodejs.org"; exit 1; }
node -v
node test-local.mjs

say "② 检查 Cloudflare 登录状态"
if npx --yes wrangler whoami >/dev/null 2>&1; then
  echo "已登录："
  npx --yes wrangler whoami | sed -n '1,12p'
else
  echo "尚未登录，下面会打开浏览器——用你的 Cloudflare 账号点 Allow 即可"
  npx --yes wrangler login
fi

say "③ 准备 KV 命名空间 VISITS"
KV_ID=""
if KV_LIST=$(npx --yes wrangler kv namespace list 2>/dev/null); then
  KV_ID=$(printf '%s' "$KV_LIST" | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)
if not isinstance(data, list):
    sys.exit(0)
for ns in data:
    title = str(ns.get("title") or "")
    if "VISITS" in title:
        print(ns.get("id") or "")
        break
' || true)
fi

if [ -z "$KV_ID" ]; then
  echo "未找到现成的 VISITS，创建中…"
  CREATE_OUT=$(npx --yes wrangler kv namespace create VISITS)
  printf '%s\n' "$CREATE_OUT"
  KV_ID=$(printf '%s' "$CREATE_OUT" | grep -oE '[0-9a-f]{32}' | head -1 || true)
fi

if [ -z "$KV_ID" ]; then
  echo "✗ 没拿到 KV 命名空间 id，把上面输出发我"
  exit 1
fi
echo "KV id: $KV_ID"

python3 - "$KV_ID" <<'PY'
import pathlib, re, sys
p = pathlib.Path('wrangler.toml')
s = p.read_text(encoding='utf-8')
s = re.sub(r'id = "[^"]*"', 'id = "%s"' % sys.argv[1], s, count=1)
p.write_text(s, encoding='utf-8')
print("✓ 已把 KV id 写进 wrangler.toml")
PY

say "④ 部署 Worker"
set +e
DEPLOY_OUT=$(npx --yes wrangler deploy 2>&1)
DEPLOY_STATUS=$?
set -e
printf '%s\n' "$DEPLOY_OUT"
if [ "$DEPLOY_STATUS" -ne 0 ]; then
  echo "✗ 部署失败，把上面的报错发我"
  exit "$DEPLOY_STATUS"
fi

URL=$(printf '%s' "$DEPLOY_OUT" | grep -oE 'https://[a-z0-9.-]+\.workers\.dev' | head -1 || true)
if [ -z "$URL" ]; then
  echo "✗ 部署输出里没找到 workers.dev 地址，把上面的输出发我"
  exit 1
fi

say "⑤ 验证接口（只读公开 / 写入仅白名单）"
ALLOWED=$(curl -s -o /dev/null -w '%{http_code}' -H "Origin: https://shenge-work.github.io" "$URL/stats" || echo "000")
PUBLIC=$(curl -s -o /dev/null -w '%{http_code}' "$URL/stats" || echo "000")
BLOCKED=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "Origin: https://evil.example.com" -H "Content-Type: application/json" -d '{"id":"deploy-probe"}' "$URL/hit" || echo "000")
echo "白名单 GET /stats   → ${ALLOWED}（应为 200）"
echo "无 Origin GET /stats → ${PUBLIC}（应为 200，只读公开）"
echo "非白名单 POST /hit  → ${BLOCKED}（应为 403）"
if [ "${ALLOWED}" != "200" ] || [ "${PUBLIC}" != "200" ] || [ "${BLOCKED}" != "403" ]; then
  echo "⚠ 状态码和预期不符，先别接前端，把这三行发我排查"
fi

printf '%s' "$URL" > .deploy-url

cat <<EOF

────────────────────────────────────────
部署完成：$URL
地址已记录：worker/.deploy-url

下一步（二选一）：
  · 把 $URL 填进 js/visitor-count.js 第 15 行 api，然后 git push
  · 或把这个地址发我，我直接改好推上去
────────────────────────────────────────
EOF
