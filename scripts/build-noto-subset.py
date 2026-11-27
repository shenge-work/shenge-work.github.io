#!/usr/bin/env python3
"""
T25 · Noto Sans SC 单文件子集（自托管）

流程（可重复执行，站点文案改动后重跑一次即可）：
  1. 从 google/fonts 仓库取可变字体源文件 NotoSansSC[wght].ttf（GitHub API blob，
     直接走 api.github.com —— raw.githubusercontent 在本机网络不可达）；
  2. 扫全站源码 / 页面 / 数据文件，收集实际出现的字符（注释掉的 <style>/<script> 会在
     dist 里再出现一次，一并收集；`\\uXXXX` 转义也解码后收集）；
  3. pyftsubset 出 woff2，保留 wght 100–900 变体轴，输出 fonts/noto-sans-sc-subset.woff2。

为什么不用 Google 的 unicode-range 分片：镜像 101 片共 4.3 MB，首屏仍要拉 20–25 片、
约 1.2 MB，4G 下 LCP 被拖到 13s；单文件子集只 1 个请求、约 500 KB，覆盖全站文案。
访客输入 / AI 生成文本里的生僻字不在子集内时回退系统字体（PingFang SC / 微软雅黑）。

用法：
  python3 scripts/build-noto-subset.py            # 重新生成
  python3 scripts/build-noto-subset.py --check    # 校验子集是否覆盖当前站点用字
依赖：pip install fonttools brotli
"""
import argparse
import base64
import json
import pathlib
import re
import subprocess
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "fonts" / "noto-sans-sc-subset.woff2"
SRC_CACHE = pathlib.Path("/tmp/NotoSansSC-VF.ttf")
API = "https://api.github.com/repos/google/fonts/contents/ofl/notosanssc"

# 只保留站点真会用到的字符区：ASCII、CJK、中文标点、全角、通用标点、箭头/几何/装饰符号
KEEP_RANGES = [
    (0x0020, 0x007E), (0x00A0, 0x00FF), (0x2000, 0x206F), (0x2190, 0x21FF), (0x2200, 0x22FF),
    (0x2318, 0x2318), (0x2460, 0x24FF), (0x2500, 0x25FF), (0x2600, 0x26FF), (0x2700, 0x27BF),
    (0x2900, 0x297F), (0x2B00, 0x2BFF), (0x3000, 0x303F), (0x3400, 0x4DBF), (0x4E00, 0x9FFF),
    (0xF900, 0xFAFF), (0xFF01, 0xFF5E), (0xFF61, 0xFF9F),
]
SCAN_GLOBS = [
    "dist/**/*.html", "dist/**/*.js", "dist/**/*.css", "dist/**/*.json",
    "data/*.js", "data/*.json", "assets/*.js", "js/*.js", "css/*.css", "templates/*",
    "functions/**/*.js", "variants/*.html", "work/*.html",
    "index.html", "company.html", "school.html", "jd.html", "resume.html",
    "src/**/*.astro", "src/**/*.tsx", "src/**/*.ts",
]


def collect_chars() -> set[str]:
    chars: set[str] = set()
    for pat in SCAN_GLOBS:
        for p in ROOT.glob(pat):
            s = str(p)
            if "/node_modules/" in s or "/.temp/" in s or not p.is_file():
                continue
            try:
                text = p.read_text(errors="ignore")
            except Exception:
                continue
            text = re.sub(r"<style[^>]*>.*?</style>", " ", text, flags=re.S)
            text = re.sub(r"<script[^>]*>.*?</script>", " ", text, flags=re.S)
            chars |= set(text)
            for m in re.finditer(r"\\u([0-9a-fA-F]{4})", text):
                try:
                    chars.add(chr(int(m.group(1), 16)))
                except ValueError:
                    pass
    keep = lambda c: any(a <= ord(c) <= b for a, b in KEEP_RANGES)
    return {c for c in chars if keep(c) and c.isprintable()}


def fetch_source() -> pathlib.Path:
    if SRC_CACHE.exists() and SRC_CACHE.stat().st_size > 5_000_000:
        print(f"  复用缓存 {SRC_CACHE}")
        return SRC_CACHE
    print("  从 api.github.com 取 NotoSansSC[wght].ttf …")
    with urllib.request.urlopen(API, timeout=30) as r:
        listing = json.load(r)
    sha = next(x["sha"] for x in listing if "wght" in x["name"])
    with urllib.request.urlopen(f"https://api.github.com/repos/google/fonts/git/blobs/{sha}", timeout=120) as r:
        blob = json.load(r)
    SRC_CACHE.write_bytes(base64.b64decode(blob["content"]))
    return SRC_CACHE


def check() -> int:
    if not OUT.exists():
        print(f"✗ 缺少 {OUT.relative_to(ROOT)}")
        return 1
    from fontTools.ttLib import TTFont

    cmap: set[int] = set()
    for t in TTFont(OUT)["cmap"].tables:
        cmap |= set(t.cmap.keys())
    missing = {c for c in collect_chars() if ord(c) not in cmap}
    print(f"子集 cmap {len(cmap)} 码位；站点用字缺失 {len(missing)} 个")
    if missing:
        print("  缺失:", "".join(sorted(missing))[:200])
        print("  提示：这些字若来自运行时拼接，回退系统字体是可接受的；若来自页面文案，请查明来源。")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()
    if args.check:
        return check()

    chars = collect_chars()
    print(f"① 站点用字 {len(chars)} 个（CJK {sum(1 for c in chars if 0x4E00 <= ord(c) <= 0x9FFF)}）")
    src = fetch_source()
    text_file = pathlib.Path("/tmp/noto_subset_chars.txt")
    text_file.write_text("".join(sorted(chars)), encoding="utf-8")
    print("② pyftsubset …")
    cmd = [
        sys.executable, "-m", "fontTools.subset", str(src),
        f"--text-file={text_file}", f"--output-file={OUT}",
        "--flavor=woff2", "--layout-features=*", "--no-hinting",
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    print(f"③ 输出 {OUT.relative_to(ROOT)}（{OUT.stat().st_size / 1024:.0f} KB）")
    return check()


if __name__ == "__main__":
    sys.exit(main())
