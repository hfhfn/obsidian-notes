#!/usr/bin/env python3
"""把 fetch_candidates.py 抓到的候选条目写成 Obsidian 笔记。

这样「发现经典 → 一键入库」是一条命令的事，不用手抄 frontmatter。

用法：
    # 先抓候选
    python scripts/fetch_candidates.py --kind book --subject computer_science --classic

    # 查看候选，然后按序号生成笔记（序号从 1 开始，对应打印顺序）
    python scripts/import_candidates.py --kind book --pick 1,3,5

    # 或全部导入
    python scripts/import_candidates.py --kind book --all

    # 预览不写盘
    python scripts/import_candidates.py --kind book --pick 1 --dry-run
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent
CAND_DIR = SITE / "scripts" / "candidates"
VAULT = Path(r"D:\private\obsidian")

KIND_CFG = {
    "book": {
        "dir": "藏书馆",
        "tag": "book",
        "cover_field": "cover",
    },
    "movie": {
        "dir": "观影库",
        "tag": "movie",
        "cover_field": "cover",
    },
}


def safe_filename(title: str) -> str:
    """Obsidian 文件名不能含 / \\ : * ? " < > |，其余保留（含中文和空格）。"""
    name = re.sub(r'[/\\:*?"<>|]', "-", title).strip()
    return name[:80] or "未命名"


def build_frontmatter(item: dict, kind: str) -> str:
    cfg = KIND_CFG[kind]
    lines = ["---", f"title: {item['title']}"]

    if kind == "book":
        if item.get("creator"):
            lines.append(f"author: {item['creator']}")
        if item.get("year"):
            lines.append(f"year: {item['year']}")
        if item.get("openlibrary_key"):
            lines.append(f"openlibrary: https://openlibrary.org{item['openlibrary_key']}")
    else:
        if item.get("creator"):
            lines.append(f"director: {item['creator']}")
        if item.get("year"):
            lines.append(f"year: {item['year']}")
        if item.get("tvmaze_id"):
            lines.append(f"tvmaze: https://www.tvmaze.com/shows/{item['tvmaze_id']}")

    if item.get("cover_url"):
        lines.append(f"{cfg['cover_field']}: {item['cover_url']}")
    if item.get("rating"):
        lines.append(f"rating: {item['rating']}")

    lines.append(f"status: {'想读' if kind == 'book' else '想看'}")
    lines.append(f"tags:")
    lines.append(f"  - {cfg['tag']}")
    lines.append("---")
    return "\n".join(lines)


def build_body(item: dict, kind: str) -> str:
    parts = [f"# {item['title']}", ""]
    if item.get("summary"):
        # TVMaze 的 summary 带 HTML 标签，粗暴清理
        summary = re.sub(r"<[^>]+>", "", item["summary"]).strip()
        if summary:
            parts += ["> " + summary, ""]
    parts += [
        "## 为什么想读" if kind == "book" else "## 为什么想看",
        "",
        "",
        "## 摘录与思考",
        "",
        "",
    ]
    return "\n".join(parts)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--kind", choices=list(KIND_CFG), required=True)
    ap.add_argument("--pick", default="", help="要导入的序号，逗号分隔，如 1,3,5")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    cand_file = CAND_DIR / f"{args.kind}.json"
    if not cand_file.exists():
        print(f"候选文件不存在: {cand_file}", file=sys.stderr)
        print(f"先跑: python scripts/fetch_candidates.py --kind {args.kind} ...", file=sys.stderr)
        return 1

    items = json.loads(cand_file.read_text(encoding="utf-8"))
    if not items:
        print("候选为空")
        return 1

    # 解析要导入哪些
    if args.all:
        picked = list(range(len(items)))
    elif args.pick:
        try:
            picked = [int(x.strip()) - 1 for x in args.pick.split(",") if x.strip()]
        except ValueError:
            print("--pick 格式错误，应如 1,3,5", file=sys.stderr)
            return 1
    else:
        print("请指定 --pick 或 --all。当前候选：\n")
        for i, it in enumerate(items, 1):
            print(f"  {i:>2}. {it['rating'] or '—':>5}  {it['year'] or '—':>5}  {it['title'][:50]}")
        return 1

    cfg = KIND_CFG[args.kind]
    out_dir = VAULT / cfg["dir"]
    written = 0
    for idx in picked:
        if not (0 <= idx < len(items)):
            print(f"序号 {idx + 1} 超出范围，跳过")
            continue
        it = items[idx]
        fname = safe_filename(it["title"]) + ".md"
        dest = out_dir / fname
        if dest.exists():
            print(f"  已存在，跳过: {fname}")
            continue

        content = build_frontmatter(it, args.kind) + "\n\n" + build_body(it, args.kind)
        if args.dry_run:
            print(f"  [dry] 会写入 {dest}")
            print("       " + content.split("\n")[1])
        else:
            out_dir.mkdir(parents=True, exist_ok=True)
            dest.write_text(content, encoding="utf-8", newline="\n")
            print(f"  ✅ {fname}")
        written += 1

    if args.dry_run:
        print(f"\n预览 {written} 条，未写盘")
    else:
        print(f"\n写入 {written} 条到 {out_dir}")
        print("下一步: python scripts/build_library.py 然后 npm run build:public")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
