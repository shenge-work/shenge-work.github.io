#!/usr/bin/env python3
"""把 data/site-data.json 生成 file:// 预览与降级用的 JS 快照 data/site-data.js。

为什么需要这一步：
  · index.html 优先 fetch('data/site-data.json')，拿不到时回退 window.SITE_DATA；
  · 双击打开（file://）时浏览器禁止 fetch，只能靠 JS 快照；
  · 后台（Pages CMS）只编辑 JSON，快照必须自动重建，否则两份数据会漂移。

用法：
  python3 scripts/sync_site_data.py          # 生成 / 覆盖 data/site-data.js
  python3 scripts/sync_site_data.py --check  # 只校验是否最新，不写文件（CI 用）
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "site-data.json"
DST = ROOT / "data" / "site-data.js"

HEADER = (
    "/* 本文件由 data/site-data.json 自动生成，请勿手动编辑。\n"
    "   生成方式：python3 scripts/sync_site_data.py（或「本地预览.command」）。\n"
    "   作用：file:// 双击打开时浏览器无法 fetch JSON（安全限制），\n"
    "   此 JS 快照作为数据源，保证双击打开也能展示最新数据。 */\n"
)

# 站点依赖的顶层字段，缺一个就说明内容被改坏了，提前报错而不是静默上线
REQUIRED_KEYS = ("meta", "hero", "about", "objective", "experience", "projects", "skills", "awards", "contact")


def render(text: str) -> str:
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError("顶层必须是 JSON 对象")
    missing = [k for k in REQUIRED_KEYS if k not in data]
    if missing:
        raise ValueError("缺少顶层字段：" + "、".join(missing))
    return HEADER + "window.SITE_DATA = " + json.dumps(data, ensure_ascii=False, indent=2) + ";\n"


def main() -> int:
    if not SRC.exists():
        print(f"✗ 找不到 {SRC}")
        return 1

    try:
        text = SRC.read_text(encoding="utf-8")
    except UnicodeDecodeError as e:
        print(f"✗ data/site-data.json 不是 UTF-8 编码：{e}")
        return 1

    try:
        content = render(text)
    except json.JSONDecodeError as e:
        print(f"✗ data/site-data.json 不是合法 JSON：第 {e.lineno} 行第 {e.colno} 列 — {e.msg}")
        return 1
    except ValueError as e:
        print(f"✗ data/site-data.json 结构不完整：{e}")
        return 1

    if "--check" in sys.argv:
        if DST.exists() and DST.read_text(encoding="utf-8") == content:
            print("✓ data/site-data.js 与 JSON 一致")
            return 0
        print("✗ data/site-data.js 与 JSON 不同步，请运行 python3 scripts/sync_site_data.py")
        return 1

    DST.write_text(content, encoding="utf-8")
    print(f"✓ 已生成 data/site-data.js（{len(content)} 字符）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
