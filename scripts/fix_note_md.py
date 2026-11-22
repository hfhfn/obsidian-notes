#!/usr/bin/env python3
"""修复视频笔记在 Obsidian 里显示 markdown 源码的问题。

根因：
  `<sub>[查看原始数据](<_assets/x y/mind-map.json>)</sub>` 这种写法
  Obsidian 解析不了 —— HTML 标签里嵌 markdown 链接，路径还用尖括号包。
  解析失败后，Obsidian 会把这一行连同后面的 `## 摘要` 正文一起当源码块
  显示出来。

修法：
  1. 去掉 <sub>...</sub> 包裹，直接写 markdown 链接
  2. 路径里的空格用 %20 编码（Obsidian 认这个，不认尖括号）
  3. 视频预览恢复成 <iframe>（用户明确说原来有预览挺好）

用法: python scripts/fix_note_md.py [--dry-run]
"""
import argparse
import re
from pathlib import Path

VAULT = Path(r"D:\private\obsidian")
MODULE = VAULT / "视频与专题"


def enc_path(p: str) -> str:
    """把路径里的空格编码成 %20，去掉可能存在的尖括号。"""
    p = p.strip("<>")
    return p.replace(" ", "%20")


def process(md: Path, dry: bool) -> bool:
    text = md.read_text(encoding="utf-8")
    orig = text

    # 1) <sub>[xxx](<path>)</sub>  →  [xxx](path%20encoded)
    def sub_link(m):
        label = m.group(1)
        path = enc_path(m.group(2))
        return f"[{label}]({path})"

    text = re.sub(
        r"<sub>\[([^\]]*)\]\((<[^>]+>|[^)]+)\)</sub>",
        sub_link,
        text,
    )

    # 2) 残留的 ](<path with space>) → ](path%20)
    def fix_angle(m):
        return f"]({enc_path(m.group(1))})"

    text = re.sub(r"\]\((<_assets/[^>]+>)\)", fix_angle, text)
    text = re.sub(r"\]\((\.?_assets/[^)\s]+ [^)]*)\)", lambda m: f"]({enc_path(m.group(1))})", text)

    # 3) [▶ 在源站观看](url) → 恢复 iframe 预览
    def video_sub(m):
        url = m.group(1)
        embed = url
        my = re.search(r"youtube\.com/watch\?v=([\w-]+)", url)
        if my:
            embed = f"https://www.youtube.com/embed/{my.group(1)}"
        else:
            mb = re.search(r"bilibili\.com/video/([\w]+)", url)
            if mb:
                embed = f"https://player.bilibili.com/player.html?bvid={mb.group(1)}"

        return (
            f'<iframe class="nlm-video" src="{embed}" frameborder="0" '
            f'allowfullscreen allow="accelerometer; autoplay; clipboard-write; '
            f'encrypted-media; picture-in-picture"></iframe>\n\n'
            f"<sub>[在源站打开]({url})</sub>"
        )

    text = re.sub(
        r"\[▶ 在源站观看\]\((https?://[^)]+)\)",
        video_sub,
        text,
    )

    # 4) 清理连续空行
    text = re.sub(r"\n{4,}", "\n\n\n", text)

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
