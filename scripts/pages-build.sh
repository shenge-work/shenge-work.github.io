#!/usr/bin/env bash
# Cloudflare Pages 构建产物 dist/ —— 自动构建与手动部署共用的唯一入口
#
# 控制台配置（Pages 项目 shenge-work → Settings → Builds & deployments）：
#   Build command    : bash scripts/pages-build.sh
#   Build output dir : dist
#   Root directory   :（留空）
#
# 背景：控制台原来写死了一份白名单
#   mkdir -p dist && cp -r index.html resume.html css js ... dist/
# 后来新增的 jd.html / company.html / 404.html 和 functions/ 从未进入产物，
# 于是 pages.dev 上点 hero「JD 匹配」跳到 /jd.html 后被 SPA fallback 吞回首页；
# github.io 走仓库原生文件，一直是正常的。根目录 HTML 改为自动收集后，
# 新增独立页不必再改任何白名单。
#
# 手动部署：./scripts/deploy-pages.sh（同样调用本脚本，再上传到 Pages）
# 本地试跑：bash scripts/pages-build.sh && ls dist/*.html
#
# 注意：assets/character-views 是 3D 原始素材（约 573MB，已 gitignore），
# 既不能入库也不能部署（Pages 单文件上限 25MiB），这里显式排除。

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
OUT="$ROOT/dist"

rm -rf "$OUT"
mkdir -p "$OUT"

echo "=== ① 根目录独立页（自动收集，排除 _ 开头的本地调试探针）"
HTML_FILES=()
for f in *.html; do
  [ -f "$f" ] || continue
  case "$f" in _*) continue ;; esac
  cp "$f" "$OUT/"
  HTML_FILES+=("$f")
done
echo "   ${HTML_FILES[*]}"

echo "=== ② 静态资源"
# work/：作品案例页（生成器产物，React 迁移接管前由旧文件兜底）
#   ⚠ 2026-11-25 M0 盘点发现：work/ 从未进 dist，线上 /work/portfolio.html 一直 404（仅 GitHub Pages 备份线路正常）
for item in css js fonts data images videos work favicon-64.png favicon.png robots.txt sitemap.xml manifest.json; do
  if [ ! -e "$item" ]; then
    echo "✗ 缺少 $item，先检查仓库是否完整"
    exit 1
  fi
  cp -R "$item" "$OUT/"
done
# 云端真相源兜底：/data/<file> 由 Functions 动态路由从 D1 读真人数据；
# 未配置的 key 回退到这里（仓库里的脱敏副本），避免站点白屏。
mkdir -p "$OUT/data/fallback"
for f in site-data.js company-profiles.js school-profiles.js people.js contributions.json work-details.json asset-manifest.json; do
  [ -f "$OUT/data/$f" ] && cp "$OUT/data/$f" "$OUT/data/fallback/$f"
done
echo "   · data/fallback/ 已放入 $(ls "$OUT/data/fallback" | wc -l | tr -d ' ') 份脱敏兜底副本"
# 访谈视频 34MB > Cloudflare Pages 单文件 25MiB 上限：媒体已上传到腾讯云 COS，
# asset-manifest/asset-map 会把相对路径改写成 COS 直链；仓库 videos/ 仍保留原件便于重传。
# 这里从产物中剔除，避免构建失败（本地 file:// 预览仍能读仓库根目录 videos/）。
if [ -f "$OUT/videos/interview-zhishu-lessie.mp4" ]; then
  rm -f "$OUT/videos/interview-zhishu-lessie.mp4"
  echo "   · 已排除 videos/interview-zhishu-lessie.mp4（34MB，走 COS 直链）"
fi

echo "=== ③ assets（排除 character-views 原始素材）"
if [ ! -d assets ]; then
  echo "✗ 缺少 assets/"
  exit 1
fi
(
  cd assets
  find . -type f ! -path './character-views/*' -print0 |
    while IFS= read -r -d '' f; do
      mkdir -p "$OUT/assets/$(dirname "$f")"
      cp "$f" "$OUT/assets/$f"
    done
)

echo "=== ④ Pages Functions（/api/*）；腾讯云函数源码不是 Pages 路由"
cp -R functions "$OUT/"
rm -rf "$OUT/functions/tencent"

echo "=== ⑤ 管理后台：/admin 控制台 + /login 登录页（前端源在 admin/public/）"
if [ ! -f admin/public/index.html ] || [ ! -f admin/public/login.html ]; then
  echo "✗ 缺少 admin/public/index.html 或 login.html"
  exit 1
fi
mkdir -p "$OUT/admin" "$OUT/login"
cp admin/public/index.html "$OUT/admin/index.html"
cp -R admin/public/assets "$OUT/admin/assets"
# 登录页两份同一源：
#   login.html      → 请求 /login 直接 200（Pages 优先匹配 .html，不会再 308 到 /login/）
#   login/index.html→ 兜住已经带斜杠的老链接 /login/
# 只放目录版会被 Pages 308 一次（/login → /login/），多一跳，登录页不值得。
cp admin/public/login.html "$OUT/login.html"
cp admin/public/login.html "$OUT/login/index.html"

echo "=== ⑥ 独立页硬校验：缺一个就让构建失败，别等线上被 fallback 吞掉"
for f in index.html resume.html jd.html company.html school.html 404.html \
         admin/index.html admin/assets/admin.js admin/assets/admin.css login.html login/index.html \
         css/jd-match.css css/school-profile.css js/jd-match.js js/school-profile.js \
         data/school-profiles.js data/snake.svg data/snake-dark.svg data/asset-map.js \
         functions/api/wall.js \
         assets/print-preview/manifest.json assets/print-preview/color-1.png \
         assets/print-preview/bw-1.png assets/print-preview/color-2.png \
         assets/print-preview/bw-2.png          assets/resume/chen-peisheng-resume-2026.pdf \
         functions/api/deliver.js functions/api/deliver-preview.js functions/api/challenge.js \
         functions/lib/deliver-content.js functions/lib/zip.js functions/lib/guard.js \
         functions/lib/secret.js \
         functions/lib/admin-auth.js functions/lib/admin-login.js \
         functions/api/admin/auth/login.js functions/api/admin/auth/methods.js \
         functions/api/admin/auth/email/send.js functions/api/admin/auth/email/verify.js \
         functions/api/admin/auth/wechat/index.js functions/api/admin/auth/wechat/callback.js \
         functions/lib/mini-login.js \
         functions/api/admin/auth/mini/qr.js functions/api/admin/auth/mini/confirm.js \
         functions/api/admin/auth/mini/poll.js \
         functions/api/admin/stats.js functions/api/admin/messages.js \
         functions/lib/tts.js functions/lib/greeting.js functions/api/voice.js \
         functions/api/greeting.js functions/api/admin/greeting.js \
         functions/api/admin/voice.js functions/api/admin/voice/preview.js \
         functions/lib/leads.js functions/api/admin/leads.js \
         functions/lib/site-content.js functions/api/admin/site-content.js \
         functions/lib/contributions.js functions/api/contributions.js \
         functions/lib/kb-sync.js functions/api/admin/kb.js \
         functions/lib/resume-inject.js functions/lib/resume-pdf.js functions/api/resume-pdf.js \
         css/secure-access.css js/secure-access.js functions/api/secure-asset.js \
         functions/lib/secure-access.js functions/lib/secure-assets.js \
         css/noto-sans-sc.css fonts/noto-sans-sc-subset.woff2 \
                 'functions/data/[file].js' data/fallback/site-data.js data/fallback/people.js \
         functions/_middleware.js robots.txt manifest.json work/portfolio.html; do
  if [ ! -f "$OUT/$f" ]; then
    echo "✗ dist 缺少 $f，独立页会变成 404 / 首页 fallback"
    exit 1
  fi
done

echo "=== ⑦ React 迁移页面混排（docs/react-refactor-plan.md §6 / M0 起）"
# 已迁移到 Astro 6 + React 19 的页面清单（相对 dist 根的 URL 路径）。
#   M0: work/portfolio.html（管道验证，2026-11-25 上线）
#   M1: admin/index.html login.html
#   M2: jd.html company.html school.html 404.html
#   M3: index.html（A 分片 SSG 直出 + B 分片 AI 面板 React 岛）
#   M4: resume.html（单源等价：构建期复用旧链同一 render()，逐字 diff=0）
# 2026-11-26 生产切换（用户拍板）：全部已迁移页收编默认清单。
# 回退开关：环境变量 REACT_MIGRATED_PAGES=none 一键回到全旧版行为（渐进迁移期遗留）。
# 清单为空或 REACT_MIGRATED_PAGES=none 时本段跳过，构建行为与迁移前完全一致；
# 混排只替换 dist 内对应 URL 的产物，未迁移页面继续走旧静态文件（渐进迁移 / N3 约束）。
REACT_MIGRATED_PAGES="${REACT_MIGRATED_PAGES:-work/portfolio.html admin/index.html login.html jd.html company.html school.html 404.html index.html resume.html}"
if [ -n "$REACT_MIGRATED_PAGES" ] && [ "$REACT_MIGRATED_PAGES" != "none" ]; then
  echo "   · 迁移页：$REACT_MIGRATED_PAGES"
  # pnpm 就绪：Pages 构建镜像 / 本地 / GitHub Actions 均为 Node 22+（corepack 内置）
  if ! command -v pnpm >/dev/null 2>&1; then
    corepack enable 2>/dev/null || true
  fi
  command -v pnpm >/dev/null 2>&1 || { echo "✗ pnpm 不可用（需要 Node >= 22 自带 corepack）"; exit 1; }
  pnpm install --frozen-lockfile --prefer-offline || { echo "✗ pnpm install 失败"; exit 1; }
  pnpm build || { echo "✗ astro build 失败"; exit 1; }

  # dist-react 源解析：Astro build.format='file' 输出 foo.html；
  # 目录式 URL（X/index.html）对应桶内源文件 X.html，这里做一次映射。
  react_src() { # $1=目标 URL 路径 → 输出 dist-react 源文件（无则输出空）
    local target="$1" src=""
    [ -f "dist-react/$target" ] && { echo "dist-react/$target"; return; }
    case "$target" in
      */index.html)
        local up="${target%/index.html}.html"
        [ -f "dist-react/$up" ] && src="dist-react/$up" ;;
    esac
    [ -f "dist-react/${target%.html}" ] && src="dist-react/${target%.html}"
    echo "$src"
  }

  for p in $REACT_MIGRATED_PAGES; do
    src="$(react_src "$p")"
    if [ -z "$src" ] || [ ! -f "$src" ]; then
      echo "✗ dist-react 缺少已迁移页 $p 的源（src/pages 与清单不同步？）"
      exit 1
    fi
    mkdir -p "$OUT/$(dirname "$p")"
    cp "$src" "$OUT/$p"
    echo "   · 混排 $p ← ${src}（替代旧产物）"
    # login 双副本（旧构建即如此：/login 直接 200，/login/ 兜住带斜杠老链接）
    if [ "$p" = "login.html" ]; then
      mkdir -p "$OUT/login"
      cp "$src" "$OUT/login/index.html"
      echo "   · 混排 login/index.html ← ${src}（二副本）"
    fi
  done
  # React bundle（hash 产物）：页面引用 /_astro/**，整体拷入（与旧站 js/ css/ 目录互不冲突）
  if [ -d dist-react/_astro ]; then cp -R dist-react/_astro "$OUT/_astro"; fi
  # 引用完整性：产物 HTML 里每个 /_astro/* 资源都必须存在，缺了就是线上 404
  # （资源文件名只含 [hash].js/.css，字符集收敛可避开引号转义）
  for p in $REACT_MIGRATED_PAGES; do
    while IFS= read -r asset; do
      if [ ! -f "$OUT/$asset" ]; then
        echo "✗ $p 引用的 $asset 不在产物中（构建不完整）"
        exit 1
      fi
    done < <(grep -oE '/_astro/[A-Za-z0-9._-]+' "$OUT/$p" || true)
  done
fi

echo "=== ⑧ 单文件上限 25MiB"
BIG="$(find "$OUT" -type f -size +25M 2>/dev/null || true)"
if [ -n "$BIG" ]; then
  echo "✗ 以下文件超过 Cloudflare Pages 单文件 25MiB 上限："
  printf '%s\n' "$BIG"
  exit 1
fi

echo "✓ dist 构建完成：$(find "$OUT" -type f | wc -l | tr -d ' ') 个文件 / $(du -sh "$OUT" | awk '{print $1}')"
echo "  HTML: $(cd "$OUT" && ls -1 *.html | tr '\n' ' ')"
