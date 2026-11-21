#!/usr/bin/env python3
"""从免费公开 API 拉取「经典 / 热门」书目与影视，生成候选清单。

设计目标：
  - 不需要任何 API Key、不需要登录
  - 只抓「真实存在」的条目（有封面、有评分、有年份）
  - 生成候选 JSON，你挑选后再写成 Obsidian 笔记

数据源（都实测可用）：
  书   → OpenLibrary  https://openlibrary.org/search.json
         免费、无 key、有封面（covers.openlibrary.org）、有评分与年份
  影视 → TVMaze       https://api.tvmaze.com
         免费、无 key、有封面（static.tvmaze.com）、有评分与首播年份

用法：
    python scripts/fetch_candidates.py --kind book --subject "computer_science" --limit 20
    python scripts/fetch_candidates.py --kind movie --query "breaking bad"
    python scripts/fetch_candidates.py --kind book --classic   # 按经典（评分高+年代久）
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import urllib.parse
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent
OUT_DIR = SITE / "scripts" / "candidates"

# 走本地代理（直连被墙）
PROXY = "http://127.0.0.1:7890"


def http_json(url: str, timeout: int = 30) -> object:
    """用 curl 取 JSON（Python urllib 的 UA 会被部分站点拦）。"""
    env = dict(os.environ)
    env["HTTPS_PROXY"] = PROXY
    env["HTTP_PROXY"] = PROXY
    r = subprocess.run(
        [
            "curl", "-sS", "-L", "--max-time", str(timeout),
            "-H", "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            url,
        ],
        capture_output=True, text=True, env=env,
    )
    if not r.stdout:
        raise RuntimeError(f"空响应: {r.stderr[:120]}")
    return json.loads(r.stdout)


# ---------------------------------------------------------------- 书籍

def fetch_books(subject: str, limit: int, classic: bool) -> list[dict]:
    """从 OpenLibrary 拉书。

    classic=True 时按「评分人数多 + 出版年份早」排序，筛出真正沉淀下来的经典；
    否则按相关性（API 默认）取热门。
    """
    fields = ",".join([
        "title", "author_name", "first_publish_year", "cover_i",
        "ratings_average", "ratings_count", "key", "subject",
    ])
    q = f"subject:{subject}" if subject else "computer science"
    # 多取一些，便于按经典度过滤
    url = (
        "http://openlibrary.org/search.json?"
        + urllib.parse.urlencode({"q": q, "limit": max(limit * 3, 60), "fields": fields})
    )
    data = http_json(url)
    docs = data.get("docs", []) if isinstance(data, dict) else []

    items = []
    for d in docs:
        cov = d.get("cover_i")
        if not cov:
            continue  # 没封面的一律丢弃，卡片上会开天窗
        title = (d.get("title") or "").strip()
        if not title:
            continue
        year = d.get("first_publish_year")
        rating = d.get("ratings_average")
        count = d.get("ratings_count") or 0
        items.append({
            "title": title,
            "creator": ", ".join((d.get("author_name") or [])[:2]),
            "year": year or "",
            "rating": round(rating, 1) if rating else "",
            "rating_count": count,
            "cover_url": f"https://covers.openlibrary.org/b/id/{cov}-L.jpg",
            "openlibrary_key": d.get("key", ""),
            "source": "openlibrary",
        })

    if classic:
        # 经典度 = 评分 × log(评价人数)，并对老书加权
        import math

        def classic_score(it):
            r = float(it["rating"] or 0)
            c = it["rating_count"] or 0
            if not r or c < 3:
                return -1
            age_bonus = 1.0
            try:
                yrs = 2026 - int(it["year"])
                age_bonus = 1 + min(yrs, 30) / 60  # 最多 +50%
            except (TypeError, ValueError):
                pass
            return r * math.log1p(c) * age_bonus

        items = [i for i in items if classic_score(i) > 0]
        items.sort(key=classic_score, reverse=True)
    else:
        # 热度 = 评分人数优先，其次评分
        items.sort(key=lambda i: (i["rating_count"] or 0, float(i["rating"] or 0)), reverse=True)

    return items[:limit]


# ---------------------------------------------------------------- 影视

def fetch_movies(query: str, limit: int, classic: bool) -> list[dict]:
    """从 TVMaze 拉剧集。TVMaze 只有剧（含迷你剧），没有院线电影。"""
    url = "https://api.tvmaze.com/search/shows?" + urllib.parse.urlencode({"q": query})
    data = http_json(url)
    if not isinstance(data, list):
        return []

    items = []
    for entry in data:
        s = entry.get("show") or {}
        img = (s.get("image") or {}).get("original") or (s.get("image") or {}).get("medium")
        if not img:
            continue
        rating = (s.get("rating") or {}).get("average")
        name = (s.get("name") or "").strip()
        if not name:
            continue
        premiered = s.get("premiered") or ""
        items.append({
            "title": name,
            "creator": ", ".join((s.get("genres") or [])[:2]),
            "year": premiered[:4] if premiered else "",
            "rating": rating if rating else "",
            "rating_count": "",  # TVMaze 不提供评分人数
            "cover_url": img,
            "summary": (s.get("summary") or "")[:300],
            "tvmaze_id": s.get("id"),
            "source": "tvmaze",
        })

    if classic:
        items.sort(key=lambda i: (float(i["rating"] or 0), i["year"] or "9999"), reverse=True)
    else:
        items.sort(key=lambda i: float(i["rating"] or 0), reverse=True)

    return items[:limit]


# ---------------------------------------------------------------- 输出

def write_candidates(kind: str, items: list[dict]) -> Path:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"{kind}.json"
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(items, ensure_ascii=False, indent=2))
        f.write("\n")
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--kind", choices=["book", "movie"], required=True)
    ap.add_argument("--subject", default="computer_science", help="书的主题（OpenLibrary subject）")
    ap.add_argument("--query", default="", help="影视搜索词（TVMaze）")
    ap.add_argument("--limit", type=int, default=20)
    ap.add_argument("--classic", action="store_true", help="按经典度排序（评分高+年代久）")
    args = ap.parse_args()

    try:
        if args.kind == "book":
            items = fetch_books(args.subject, args.limit, args.classic)
        else:
            if not args.query:
                print("影视需要 --query，例如 --query 'breaking bad'", file=sys.stderr)
                return 1
            items = fetch_movies(args.query, args.limit, args.classic)
    except Exception as e:
        print(f"抓取失败: {e}", file=sys.stderr)
        return 1

    if not items:
        print("没抓到符合条件（有封面）的条目")
        return 1

    out = write_candidates(args.kind, items)
    print(f"已写入 {out}（{len(items)} 条）\n")
    for it in items:
        print(f"  {it['rating'] or '—':>5}  {it['year'] or '—':>5}  {it['title'][:52]}")

    print(f"\n下一步：挑选后把 cover_url 填进笔记的 cover 字段。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
