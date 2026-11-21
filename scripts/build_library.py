#!/usr/bin/env python3
"""从 Obsidian 的 `#book` 笔记生成藏书馆页面数据。

扫描 vault 里所有带 `#book` 标签的 Markdown，提取 frontmatter，
输出 JSON 供 Quartz 页面渲染，同时把封面图复制到站点。

用法：
    python scripts/build_library.py            # 生成 content-*/藏书馆/_books.json
    python scripts/build_library.py --dry-run  # 只看会处理哪些书
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import urllib.parse
import urllib.request
from pathlib import Path

VAULT = Path(r"D:\private\obsidian")
SITE = Path(__file__).resolve().parent.parent
CONTENT_DIRS = [SITE / "content-all", SITE / "content-public"]

# 读书笔记所在目录（相对 vault）
BOOK_DIR = VAULT / "藏书馆"
COVER_OUT = "attachments/covers"

FM_RE = re.compile(r"^---\r?\n(.*?)\r?\n---", re.S)


def parse_frontmatter(text: str) -> dict:
    """极简 YAML frontmatter 解析。

    处理标量字段 + 列表字段（如 tags 下的 "- book" 多项）。
    列表会以空格拼成字符串，方便后续用正则匹配。
    """
    m = FM_RE.match(text)
    if not m:
        return {}
    data: dict[str, str] = {}
    current_list_key = None
    for line in m.group(1).split("\n"):
        line = line.rstrip("\r")
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        # 列表项："  - book"
        stripped = line.strip()
        if stripped.startswith("- "):
            item = stripped[2:].strip().strip("'\"")
            if current_list_key:
                prev = data.get(current_list_key, "")
                data[current_list_key] = (prev + " " + item).strip()
            continue
        if ":" not in line:
            continue
        key, _, val = line.partition(":")
        key = key.strip()
        val = val.strip().strip("'\"")
        if not val:
            # 可能是列表的开头（tags: 后面跟 "- xxx"）
            current_list_key = key
            data.setdefault(key, "")
            continue
        current_list_key = None
        if val != "null":
            data[key] = val
    return data


def has_book_tag(text: str, fm: dict) -> bool:
    """frontmatter 的 tags 里含 book，或正文有 #book。"""
    tags = fm.get("tags", "")
    if re.search(r"\bbook\b", tags):
        return True
    return bool(re.search(r"(?<!\w)#book(?!\w)", text))


def normalize_status(raw: str) -> str:
    """把各种写法归一到 在读 / 已读 / 想读 / 未读完。"""
    r = (raw or "").strip()
    mapping = {
        "在读": "在读", "reading": "在读", "正在阅读": "在读",
        "已读": "已读", "读完": "已读", "已读完": "已读", "finished": "已读",
        "想读": "想读", "待读": "想读", "未开始": "想读", "wishlist": "想读",
        "未读完": "未读完", "abandoned": "未读完", "弃读": "未读完",
    }
    return mapping.get(r, "在读" if not r else r)


def stars_from_rating(rating: str) -> str:
    """豆瓣 10 分制 → 5 星。"""
    try:
        r = float(rating)
    except (TypeError, ValueError):
        return ""
    half = round(r / 2 * 2) / 2  # 保留半星
    full = int(half)
    s = "⭐" * full
    if half - full >= 0.5:
        s += "☆"
    return s


def collect_books(dry_run: bool = False) -> list[dict]:
    if not BOOK_DIR.exists():
        print(f"[library] 目录不存在: {BOOK_DIR}")
        return []

    books = []
    for md in sorted(BOOK_DIR.rglob("*.md")):
        # 跳过藏书馆索引页本身
        if md.stem in ("藏书馆", "观影库"):
            continue
        text = md.read_text(encoding="utf-8", errors="ignore")
        fm = parse_frontmatter(text)
        if not has_book_tag(text, fm):
            continue

        title = fm.get("title") or md.stem
        book = {
            "title": title,
            "slug": md.relative_to(VAULT).with_suffix("").as_posix(),
            "author": fm.get("author", ""),
            "cover": fm.get("cover", ""),
            "rating": fm.get("rating", ""),
            "stars": stars_from_rating(fm.get("rating", "")),
            "status": normalize_status(fm.get("status", "")),
            "progress": fm.get("progress", ""),
            "pages": fm.get("pages", ""),
            "started": fm.get("started", ""),
            "finished": fm.get("finished", ""),
            "douban": fm.get("douban", ""),
        }
        books.append(book)
        if dry_run:
            print(f"  {book['status']:4} {title}  ({book['author'][:24]})")

    return books


def download_covers(books: list[dict]) -> int:
    """把远程封面下载到站点本地，避免豆瓣图床防盗链。"""
    out_dir = SITE / "content-all" / COVER_OUT
    out_dir.mkdir(parents=True, exist_ok=True)
    ok = 0
    for b in books:
        url = b.get("cover", "")
        if not url.startswith("http"):
            continue
        ext = ".jpg"
        for cand in (".jpg", ".png", ".webp"):
            if url.lower().endswith(cand):
                ext = cand
                break
        safe = re.sub(r"[^\w\u4e00-\u9fff-]", "_", b["title"])[:60]
        dest = out_dir / f"{safe}{ext}"
        if dest.exists():
            b["cover_local"] = f"{COVER_OUT}/{dest.name}"
            ok += 1
            continue
        try:
            # 豆瓣图床有防盗链：不带 Referer 会返回 418 I'm a Teapot
            req = urllib.request.Request(
                url,
                headers={
                    "User-Agent": (
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/120.0.0.0 Safari/537.36"
                    ),
                    "Referer": "https://book.douban.com/",
                    "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
                },
            )
            with urllib.request.urlopen(req, timeout=25) as resp:
                data = resp.read()
            if not data:
                raise ValueError("空响应")
            dest.write_bytes(data)
            b["cover_local"] = f"{COVER_OUT}/{dest.name}"
            ok += 1
        except Exception as e:
            print(f"[library] 封面下载失败 {b['title']}: {e}")
    return ok


def write_json(books: list[dict]) -> None:
    for d in CONTENT_DIRS:
        if not d.exists():
            continue
        target = d / "藏书馆" / "_books.json"
        target.parent.mkdir(parents=True, exist_ok=True)
        # newline="\n" 固定 LF：Windows 默认写 CRLF，会让 prettier 报格式不一致
        with open(target, "w", encoding="utf-8", newline="\n") as f:
            f.write(json.dumps(books, ensure_ascii=False, indent=2))
            f.write("\n")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--skip-covers", action="store_true")
    args = ap.parse_args()

    books = collect_books(args.dry_run)
    print(f"[library] 找到 {len(books)} 本书")

    if args.dry_run:
        return 0

    if not args.skip_covers:
        n = download_covers(books)
        print(f"[library] 封面本地化 {n} 张")

    write_json(books)
    print(f"[library] 已写入 {', '.join(str(d.name) for d in CONTENT_DIRS if d.exists())}")

    # 统计
    from collections import Counter
    c = Counter(b["status"] for b in books)
    print(f"[library] 状态分布: {dict(c)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
