#!/usr/bin/env python3
"""给每篇视频笔记生成自包含的思维导图 HTML，Obsidian 里点链接用浏览器看。

为什么不用 Obsidian 内联：
  Mindmap NextGen 的内联图在侧边栏里太小，节点多了根本看不清。
  生成一个 349KB 的自包含 HTML（d3 + markmap 全内联），
  双击/点击就用浏览器打开，全屏、可拖动、可折叠。

用法: python scripts/make_mindmap_html.py [--dry-run]
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent
VAULT = Path(r"D:\private\obsidian")
MODULE = VAULT / "视频与专题"
ASSETS = MODULE / "_assets"
TMP = SITE / ".tmp-mm"


def to_zh(text):
    try:
        import zhconv

        return zhconv.convert(text, "zh-cn")
    except ImportError:
        return text


def tree_to_md(tree, root_title):
    root = to_zh(str(tree.get("name") or root_title))
    lines = [f"# {root}"]

    def walk(node, depth):
        for c in node.get("children") or []:
            name = to_zh(str(c.get("name", "")).replace("\n", " ").strip())
            if name:
                lines.append("  " * depth + f"- {name}")
                walk(c, depth + 1)

    walk(tree, 0)
    return "\n".join(lines)


def build_html(json_path: Path, out_html: Path) -> bool:
    """json → md → 自包含 HTML（markmap-cli --offline）。"""
    try:
        tree = json.loads(json_path.read_text(encoding="utf-8"))
    except Exception:
        return False

    TMP.mkdir(exist_ok=True)
    md_tmp = TMP / "in.md"
    md_tmp.write_text(tree_to_md(tree, json_path.parent.name), encoding="utf-8")

    r = subprocess.run(
        [
            "npx", "markmap", "--no-open", "--offline",
            "-o", str(out_html), str(md_tmp),
        ],
        cwd=str(SITE),
        capture_output=True,
        text=True,
        timeout=180,
        shell=True,
    )
    return out_html.exists() and out_html.stat().st_size > 50000


def process(md: Path, dry: bool) -> bool:
    text = md.read_text(encoding="utf-8")

    # 找 ```markmap 块，确认有对应的 mind-map.json
    if "```markmap" not in text:
        return False

    slug = md.stem
    json_path = ASSETS / slug / "mind-map.json"
    if not json_path.exists():
        return False

    out_html = ASSETS / slug / "mindmap.html"

    if not dry:
        if not build_html(json_path, out_html):
            print(f"    [fail] {slug[:30]}")
            return False

    # 在 ```markmap 块后面加一行「浏览器打开」链接
    link_rel = f"_assets/{slug}/mindmap.html".replace(" ", "%20")
    marker = "```markmap"
    if "mindmap.html" in text:
        # 已有链接，只更新文件
        return not dry

    # 在 markmap 代码块结束的 ``` 之后插入链接
    m = re.search(r"```markmap[\s\S]*?```\n", text)
    if not m:
        return False
    insert_at = m.end()
    link = f"\n> 🖥 [用浏览器打开完整脑图]({link_rel})（可拖动、折叠、全屏）\n"
    text = text[:insert_at] + link + text[insert_at:]

    if not dry:
        md.write_text(text, encoding="utf-8", newline="\n")
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not MODULE.is_dir():
        print(f"目录不存在: {MODULE}")
        return

    n = 0
    for md in sorted(MODULE.glob("*.md")):
        if process(md, args.dry_run):
            n += 1
            print(f"  {'[dry]' if args.dry_run else '✓'} {md.stem[:40]}")

    print(f"\n{'待处理' if args.dry_run else '已生成'} {n} 篇")


if __name__ == "__main__":
    main()
