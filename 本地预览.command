#!/bin/bash
# ════════════════════════════════════════════════════════════
# 求职作品集 · 本地预览启动器（双击运行）
# 作用：① 把 data/site-data.json 自动同步为 data/site-data.js
#        （file:// 双击打开 index.html 时浏览器无法读取 JSON，
#          JS 快照可让双击打开也展示最新数据）
#       ② 启动本地 HTTP 服务并自动打开浏览器。
# 关闭方式：回到弹出的终端窗口按 Ctrl + C，或直接关闭该窗口。
# ════════════════════════════════════════════════════════════
cd "$(dirname "$0")"
PORT=8765

# JSON → JS 同步快照
if [ -f "data/site-data.json" ]; then
  python3 - <<'SYNC'
import json
try:
    data = json.load(open('data/site-data.json'))
    content = ('/* 本文件由「本地预览.command」从 data/site-data.json 自动生成，请勿手动编辑。\n'
               '   作用：file:// 双击打开时浏览器无法 fetch JSON（安全限制），\n'
               '   此 JS 快照作为数据源，保证双击打开也能展示最新数据。 */\n'
               'window.SITE_DATA = ' + json.dumps(data, ensure_ascii=False, indent=2) + ';\n')
    open('data/site-data.js', 'w').write(content)
    print('✓ 已同步 data/site-data.json → data/site-data.js')
except Exception as e:
    print('⚠ JSON 同步失败（格式错误？）：' + str(e))
SYNC
fi

echo "正在启动本地预览服务（端口 $PORT）..."
python3 -m http.server "$PORT" --bind 127.0.0.1 &
SERVER_PID=$!
sleep 1
if kill -0 "$SERVER_PID" 2>/dev/null; then
  echo "✓ 服务已启动：http://127.0.0.1:$PORT/index.html"
  echo "（关闭此终端窗口或按 Ctrl + C 即可停止服务）"
  open "http://127.0.0.1:$PORT/index.html"
  wait "$SERVER_PID"
else
  echo "✗ 启动失败：请确认已安装 python3"
  read -r -p "按回车键关闭..."
fi
