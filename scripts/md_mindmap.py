#!/usr/bin/env python3
"""把视频笔记里的 ```markmap 代码块换成「用浏览器打开完整脑图」链接。

为什么：
  Obsidian 里 markmap 代码块需要 Mindmap NextGen 插件渲染，但内联图
  在侧栏里太小、节点多了看不清。用户明确要求只保留链接 —— 点开用
  浏览器看完整交互版（349KB 自包含 HTML，可拖动折叠全屏）。

  站点侧不受影响：render_notebooklm.py 读 _assets/<slug>/mind-map.json
  直接渲染 markmap 组件，不依赖笔记里的代码块。

用法: python scripts/md_mindmap.py [--dry-run]
"""
import argparse
import re
from pathlib import Path

VAULT = Path(r"D:\private\obsidian")
MODULE = VAULT / "视频与专题"


def process(md: Path, dry: bool) -> bool:
    text = md.read_text(encoding="utf-8")
    orig = text

    if "```markmap" not in text:
        return False

    # 找 _assets 目录（和笔记同名的那个）
    slug = md.stem
    assets_dir = MODULE / "_assets" / slug
    has_html = (assets_dir / "mindmap.html").exists()
    has_json = (assets_dir / "mind-map.json").exists()

    if not has_html and not has_json:
        return False

    # 构造替换内容：只要链接
    lines = []
    if has_html:
        rel = f"_assets/{slug}/mindmap.html"
        lines.append(f"> 🖥 [用浏览器打开完整脑图](<{rel}>)（可拖动、折叠、全屏）")
    if has_json:
        rel_json = f"_assets/{slug}/mind-map.json"
        lines.append(f"<sub>[查看原始数据](<{rel_json}>)</sub>")

    replacement = "\n\n".join(lines) if lines else "（脑图数据缺失）"

    # 替换 ```markmap ... ``` 整块
    # 注意：原来块后面可能已经跟着「用浏览器打开」的 blockquote 和「查看原始数据」，
    # 一起吃掉避免重复。
    pattern = re.compile(
        r"```markmap[\s\S]*?```"
        r"(?:\s*\n\s*>\s*🖥\s*\[用浏览器打开完整脑图\][^\n]*)?"
        r"(?:\s*\n\s*<sub>\[查看原始数据\][^\n]*</sub>)?",
        re.M,
    )

    text = pattern.sub(replacement, text, count=1)

    if text != orig:
        if not dry:
            md.write_text(text, encoding="utf-8", newline="\n")
        return True
    return False


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

    print(f"\n{'待改' if args.dry_run else '已改'} {n} 篇")


if __name__ == "__main__":
    main()
