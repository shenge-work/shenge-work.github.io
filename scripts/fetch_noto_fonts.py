#!/usr/bin/env python3
"""
T25 · Noto Sans SC 中文字体本地化（自托管分片）

做三件事，可重复执行：
  1. 从 Google Fonts css2 API 拉取 Noto Sans SC 可变字体（wght 100..900）的 @font-face 列表；
  2. 把每个分片 woff2 下载到 fonts/noto-sans-sc/，并重命名为 noto-sans-sc.<N>.woff2；
  3. 生成 css/noto-sans-sc.css：src 指本地路径，font-weight / unicode-range 原样保留。

为什么保留 unicode-range：Google 把 CJK 字形按使用频率切成近百片，浏览器只为页面
实际出现的字符下载对应分片（首屏通常只有十几片、百余 KB），比整包 4MB+ 省得多。

用法：
  python3 scripts/fetch_noto_fonts.py          # 常规更新
  python3 scripts/fetch_noto_fonts.py --check  # 只校验 CSS 引用的分片是否齐全，不下载

改完字体后建议跑一次 `bash scripts/pages-build.sh` 复核 dist/ 里 fonts 是否齐全。
"""
import argparse
import concurrent.futures
import pathlib
import re
import sys
import urllib.request

CSS_URL = (
    "https://fonts.googleapis.com/css2?"
    "family=Noto+Sans+SC:wght@100..900&display=swap"
)
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36"
)
ROOT = pathlib.Path(__file__).resolve().parents[1]
FONT_DIR = ROOT / "fonts" / "noto-sans-sc"
CSS_OUT = ROOT / "css" / "noto-sans-sc.css"


def local_name(url: str) -> str:
    """分片名：原 URL 尾号 → noto-sans-sc.<N>.woff2；无尾号则沿用原名（少数特殊子集）。"""
    base = url.rsplit("/", 1)[-1]
    m = re.search(r"\.(\d+)\.woff2$", base)
    return f"noto-sans-sc.{m.group(1)}.woff2" if m else base


def fetch(url: str, dest: pathlib.Path | None = None) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = r.read()
    if dest is not None:
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
    return data


def build_css(faces: list[str]) -> str:
    header = [
        "/* Noto Sans SC · 自托管（T25）",
        "   来源：Google Fonts css2（family=Noto+Sans+SC:wght@100..900）的逐字形分片 woff2；",
        "   仅把 src 的 URL 换成本地 /fonts/noto-sans-sc/ 路径，font-weight / unicode-range 原样保留，",
        "   浏览器按页面实际字符按需下载对应分片，命中哪片下哪片。",
        "   生成方式：python3 scripts/fetch_noto_fonts.py（勿手改）。 */",
        "",
    ]
    body = []
    for b in faces:
        b = re.sub(r"url\(https://[^)]+\)", lambda m: f"url(/fonts/noto-sans-sc/{local_name(m.group(0)[5:-1])})", b)
        body.extend([b.strip(), ""])
    return "\n".join(header + body)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="只校验，不下载")
    args = ap.parse_args()

    if args.check:
        if not CSS_OUT.exists():
            print(f"✗ 缺少 {CSS_OUT.relative_to(ROOT)}，先跑一次不带 --check 的生成")
            return 1
        refs = set(re.findall(r"url\((/fonts/noto-sans-sc/[^)]+)\)", CSS_OUT.read_text()))
        missing = [r for r in refs if not (ROOT / r.lstrip("/")).exists()]
        print(f"CSS 引用 {len(refs)} 个分片，缺失 {len(missing)} 个")
        for r in missing:
            print("  ✗", r)
        return 1 if missing else 0

    print("① 拉取 @font-face 列表 …")
    css = fetch(CSS_URL).decode("utf-8")
    faces = re.findall(r"@font-face\s*\{[^}]*\}", css)
    if not faces:
        print("✗ 没解析到 @font-face，Google 响应格式可能变了")
        return 1

    urls = sorted({re.search(r"url\((https://[^)]+)\)", b).group(1) for b in faces})
    print(f"   {len(faces)} 个 @font-face / {len(urls)} 个唯一分片")

    print("② 下载分片 …")

    def dl(u: str) -> str:
        dest = FONT_DIR / local_name(u)
        if dest.exists() and dest.stat().st_size > 1000:
            return dest.name
        fetch(u, dest)
        return dest.name

    with concurrent.futures.ThreadPoolExecutor(8) as ex:
        names = list(ex.map(dl, urls))
    total = sum((FONT_DIR / n).stat().st_size for n in names)
    print(f"   {len(set(names))} 个文件 / {total / 1048576:.1f} MB")

    print("③ 生成 CSS …")
    CSS_OUT.write_text(build_css(faces))
    print(f"   {CSS_OUT.relative_to(ROOT)}（{CSS_OUT.stat().st_size / 1024:.0f} KB）")

    refs = set(re.findall(r"url\((/fonts/noto-sans-sc/[^)]+)\)", CSS_OUT.read_text()))
    missing = [r for r in refs if not (ROOT / r.lstrip("/")).exists()]
    if missing:
        print("✗ 生成后仍有缺失分片，请检查网络后重跑：")
        for r in missing:
            print("  ", r)
        return 1
    print(f"✓ 完成：{len(refs)} 个分片全部就位")
    return 0


if __name__ == "__main__":
    sys.exit(main())
