#!/usr/bin/env python3
"""把视频笔记里的 <iframe> 播放源换成纯 markdown 链接。

为什么：
  Obsidian 不渲染 <iframe>，会显示成一长串 HTML 源码，很难看。
  换成 `[在 YouTube 观看](url)` 后 Obsidian 里是正常链接，
  站点构建时 render_notebooklm.py 再还原成内嵌播放器。

用法: python scripts/normalize_notes.py [--dry-run]
"""
import argparse
import re
from pathlib import Path

VAULT = Path(r"D:\private\obsidian")
MODULE = VAULT / "视频与专题"


def process(md: Path, dry: bool) -> bool:
    text = md.read_text(encoding="utf-8")
    orig = text

    # <iframe class="nlm-video" src="https://www.youtube.com/embed/XXX" ...></iframe>
    def video_sub(m):
        embed = m.group(1)
        # 从 embed URL 还原成普通观看 URL
        watch = embed
        mm = re.search(r"youtube\.com/embed/([\w-]+)", embed)
        if mm:
            watch = f"https://www.youtube.com/watch?v={mm.group(1)}"
        else:
            mb = re.search(r"player\.bilibili\.com/player\.html\?bvid=([\w]+)", embed)
            if mb:
                watch = f"https://www.bilibili.com/video/{mb.group(1)}"
        return f"[▶ 在源站观看]({watch})"

    text = re.sub(
        r'<iframe[^>]*class="nlm-video"[^>]*src="([^"]+)"[^>]*>\s*</iframe>',
        video_sub,
        text,
    )

    # 顺手清掉紧跟的重复 <sub>[在 YouTube 打开](...)</sub>（如果和上面重复）
    text = re.sub(
        r"\n\n<sub>\[在 (?:YouTube|B 站) 打开\]\([^)]+\)</sub>\n",
        "\n",
        text,
    )

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
