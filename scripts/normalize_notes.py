#!/usr/bin/env python3
"""把已有的视频与专题笔记从「内嵌 HTML」改成「纯 markdown」。

背景：早期版本把 markmap 组件和 PDF iframe 直接写进笔记，
Obsidian 里显示成一堆原始 HTML 和空框，完全没法读。

这个脚本离线改写（不需要 NotebookLM 登录）：
  思维导图  <div class="mm-wrap">...<script class="mm-data">{json}</script></div>
        →   [思维导图（可交互）](_assets/<slug>/mind-map.json)
  信息图    <img class="nlm-infographic nlm-zoomable" src="_assets/...">
        →   ![信息图](_assets/...)
  演示文稿  <iframe src="https://pdf.../slide-deck.pdf">
        →   [打开 演示文稿（PDF）](https://pdf.../slide-deck.pdf)

站点构建时 render_notebooklm.py 再反向渲染成组件。

用法: python scripts/normalize_notes.py [--dry-run]
"""
import argparse
import json
import re
from pathlib import Path

VAULT = Path(r"D:\private\obsidian")
MODULE = VAULT / "视频与专题"


def strip_markmap(html: str, slug: str) -> str:
    """把 mm-wrap 组件换成一个指向 json 的链接。"""
    m = re.search(r'<script type="application/json" class="mm-data">(.*?)</script>', html, re.S)
    if not m:
        return html

    # 尝试找 json 文件（优先用实际存在的）
    cand = MODULE / "_assets" / slug / "mind-map.json"
    rel = f"_assets/{slug}/mind-map.json" if cand.exists() else ""

    if not rel:
        # 从 _assets 里按标题猜一个
        assets = MODULE / "_assets"
        if assets.is_dir():
            for d in assets.iterdir():
                if d.is_dir() and (d / "mind-map.json").exists():
                    # 用 json 里的根节点名匹配
                    try:
                        t = json.loads((d / "mind-map.json").read_text(encoding="utf-8"))
                        if t.get("name") and t["name"][:6] in slug:
                            rel = f"_assets/{d.name}/mind-map.json"
                            break
                    except Exception:
                        pass

    if rel:
        return f"[思维导图（可交互）]({rel})"
    return "（思维导图数据缺失）"


def normalize(md: Path, dry: bool) -> bool:
    text = md.read_text(encoding="utf-8")
    orig = text
    slug = md.stem

    # 1) 思维导图：整块 <div class="mm-wrap">...</div>
    def mm_sub(m):
        return strip_markmap(m.group(0), slug)

    text = re.sub(
        r'<div class="mm-wrap"[\s\S]*?<script type="application/json" class="mm-data">[\s\S]*?</script></div>',
        mm_sub,
        text,
    )

    # 2) 信息图：<img ... class="nlm-infographic nlm-zoomable" src="...">  + 后面的 <sub>
    def info_sub(m):
        src = m.group(1)
        return f"![信息图]({src})"

    text = re.sub(
        r'<img src="([^"]+)" alt="[^"]*" class="nlm-infographic nlm-zoomable"[^>]*>',
        info_sub,
        text,
    )
    # 清掉灯箱提示
    text = re.sub(r"<sub>点图放大 · ESC 或点空白处关闭</sub>\n*", "", text)

    # 3) 演示文稿：<iframe src="...pdf#view=FitH" ...></iframe> + <sub>[全屏打开](url)</sub>
    def slide_sub(m):
        url = m.group(1).split("#")[0]
        return f"[打开 演示文稿（PDF）]({url})"

    text = re.sub(
        r'<iframe src="(https://[^"]+?\.pdf[^"]*)"[^>]*class="nlm-slides"[^>]*></iframe>',
        slide_sub,
        text,
    )
    text = re.sub(r"<sub>\[全屏打开\]\([^)]+\)</sub>\n*", "", text)

    # 清理多余空行
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
        if normalize(md, args.dry_run):
            n += 1
            print(f"  {'[dry]' if args.dry_run else '✓'} {md.stem[:40]}")

    print(f"\n{'待改' if args.dry_run else '已改'} {n} 篇")


if __name__ == "__main__":
    main()
