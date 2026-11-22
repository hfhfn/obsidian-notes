#!/usr/bin/env python3
"""把视频与专题笔记里的思维导图 json 转成 markdown 嵌套列表。

为什么要这样：
  - Obsidian 的 Mindmap NextGen 插件是从「标题 + 嵌套列表」生成脑图的，
    不读 json。
  - 站点构建时需要 markmap 组件（可拖动折叠），那由 render_notebooklm.py
    在构建时读 json 渲染。

所以源笔记里放 markdown 列表（两边都能用），json 文件保留在 _assets 里
给站点构建用。

用法: python scripts/md_mindmap.py [--dry-run]
"""
import argparse
import json
import re
from pathlib import Path

VAULT = Path(r"D:\private\obsidian")
MODULE = VAULT / "视频与专题"

# Mindmap NextGen 靠 frontmatter 的 mindmap-plugin 字段识别
FM_MARK = "mindmap-plugin: markmap"


def to_zh(text):
    try:
        import zhconv

        return zhconv.convert(text, "zh-cn")
    except ImportError:
        return text


def tree_to_md(tree, root_title):
    """{name, children} → markdown 嵌套列表。"""
    root = to_zh(str(tree.get("name") or root_title))
    lines = [f"# {root}"]

    def walk(node, depth):
        for c in node.get("children") or []:
            name = to_zh(str(c.get("name", "")).replace("\n", " ").strip())
            if not name:
                continue
            # markmap 支持 - 列表嵌套，比 ## 标题更紧凑
            lines.append("  " * depth + f"- {name}")
            walk(c, depth + 1)

    walk(tree, 0)
    return "\n".join(lines)


def add_frontmatter(text: str) -> str:
    """给 frontmatter 加 mindmap-plugin 字段（已有则跳过）。"""
    if not text.startswith("---"):
        return text
    end = text.find("\n---", 3)
    if end < 0:
        return text
    head = text[:end]
    if "mindmap-plugin" in head:
        return text
    return head + f"\n{FM_MARK}" + text[end:]


def process(md: Path, dry: bool) -> bool:
    text = md.read_text(encoding="utf-8")
    orig = text
    slug = md.stem

    # 找 [思维导图（可交互）](_assets/<dir>/mind-map.json)
    m = re.search(
        r"\[思维导图（可交互）\]\((_assets/[^)]+?/mind-map\.json)\)", text
    )
    if not m:
        return False

    rel = m.group(1).replace("%20", " ")
    jf = MODULE / rel
    if not jf.exists():
        return False

    try:
        tree = json.loads(jf.read_text(encoding="utf-8"))
    except Exception:
        return False

    md_list = tree_to_md(tree, slug)

    # 替换成 markdown 列表 + 保留 json 链接（站点构建用）
    replacement = (
        "```markmap\n" + md_list + "\n```\n\n"
        f"<sub>[查看原始数据]({m.group(1)})</sub>"
    )
    text = text.replace(m.group(0), replacement)

    text = add_frontmatter(text)

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
