#!/usr/bin/env python3
"""豆瓣榜单 + 微信读书匹配抓取

产出 scripts/candidates/ 下的榜单 JSON，供 inject_library.mjs 渲染成三栏。

数据源（都实测国内直连可达）：
- 豆瓣读书/电影榜单 API（元数据、封面、评分、is_playable）
- 微信读书搜索 API（按书名匹配可直接阅读的 readerLink）

用法：
    python scripts/fetch_douban_charts.py                # 全部
    python scripts/fetch_douban_charts.py --kind book    # 只抓书
    python scripts/fetch_douban_charts.py --dry-run      # 不联网，用已有缓存
"""
import argparse
import json
import os
import re
import time
import urllib.parse
import urllib.request

SITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(SITE, "scripts", "candidates")

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

# 豆瓣对详情页有反爬，榜单 API 需要 Referer 才稳定
DOUBAN_HEADERS = {
    "User-Agent": UA,
    "Referer": "https://movie.douban.com/",
    "Accept": "application/json, text/plain, */*",
}


def _get(url, headers=None, timeout=25, retries=2):
    """带重试的 GET。返回 bytes，失败返回 None。"""
    hdrs = {"User-Agent": UA}
    if headers:
        hdrs.update(headers)

    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers=hdrs)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except Exception as e:
            if attempt == retries:
                print(f"  [warn] 失败 {url[:70]}: {e}")
                return None
            time.sleep(1.2 * (attempt + 1))
    return None


def _get_json(url, headers=None, **kw):
    raw = _get(url, headers=headers, **kw)
    if not raw:
        return None
    try:
        return json.loads(raw.decode("utf-8", "replace"))
    except Exception:
        return None


# ---------------------------------------------------------------- 豆瓣电影

# 豆瓣榜单 type 编码（实测各 type 返回不同片单）
# 11=剧情 24=爱情 5=动作 13=动画 22=悬疑 类型 21=纪录片
MOVIE_CHARTS = {
    "recommend": ("11", "豆瓣高分剧情片"),
    "monthly": ("24", "热门爱情片"),
    "yearly": ("5", "高分动作片"),
}


def fetch_douban_movies(limit=20):
    """抓豆瓣电影榜单。

    用 /j/chart/top_list 接口，返回字段含 rating / cover_url /
    is_playable / title / url / actors / types / regions。
    """
    out = {}
    for key, (typ, _desc) in MOVIE_CHARTS.items():
        url = (
            "https://movie.douban.com/j/chart/top_list"
            f"?type={typ}&interval_id=100:90&action=&start=0&limit={limit}"
        )
        d = _get_json(url, headers=DOUBAN_HEADERS)
        if not isinstance(d, list):
            print(f"  [movie:{key}] 无数据")
            out[key] = []
            continue

        items = []
        for m in d:
            # 从 url 里提取 douban_id（movie.douban.com/subject/<id>/）。
            # 没有 id 就没法做站内标记（item_key 需要它），
            # 之前观影库 54 条全缺 id，导致「+ 标记」按钮只有 9 个。
            _url = m.get("url", "")
            _mid = ""
            _mm = re.search(r"subject/(\d+)", _url)
            if _mm:
                _mid = _mm.group(1)

            items.append(
                {
                    "title": m.get("title", "").strip(),
                    "url": _url,
                    "douban_id": _mid,
                    "cover": m.get("cover_url", ""),
                    "score": m.get("score", ""),
                    "votes": m.get("vote_count", 0),
                    "types": m.get("types", []),
                    "regions": m.get("regions", []),
                    "actors": (m.get("actors") or [])[:3],
                    "playable": bool(m.get("is_playable")),
                    "rank": m.get("rank", 0),
                }
            )
        out[key] = items
        print(f"  [movie:{key}] {len(items)} 部")
        time.sleep(1.0)
    return out


# ---------------------------------------------------------------- 豆瓣读书

def fetch_douban_books(limit=20):
    """抓豆瓣读书榜单。

    豆瓣读书没有和电影一样的 JSON 榜单接口，只能解析 /chart 页面。
    页面结构：<a href="https://book.douban.com/subject/<id>/">书名</a>
    """
    # 三个榜单要内容不同，否则三栏会一模一样。
    # 实测：/chart 的 tag 参数会被忽略（返回同一页），
    # 而 /tag/<名称> 是真正按标签分的榜单，各 20 本。
    charts = {
        "recommend": "https://book.douban.com/chart",                      # 最受关注
        "monthly": "https://book.douban.com/tag/" + urllib.parse.quote("小说"),   # 热门小说
        "yearly": "https://book.douban.com/tag/" + urllib.parse.quote("历史"),    # 热门历史
    }

    out = {}
    for key, url in charts.items():
        raw = _get(url, headers={"Referer": "https://book.douban.com/"})
        if not raw:
            out[key] = []
            continue
        h = raw.decode("utf-8", "replace")

        # 豆瓣读书 /chart 页的结构（和电影页不同）：
        #   封面：<a href=".../subject/<id>/"><img class="subject-cover" src="..."/></a>
        #   书名：<a class="fleft" href=".../subject/<id>/">书名</a>
        # 注意：书籍封面的 <img> 没有 alt 属性，不能按 alt 匹配。
        items = []
        seen = set()

        # 1) 先抓所有 (id -> 封面 URL)
        cover_map = {}
        for sid, cover in re.findall(
            r'<a href="https://book\.douban\.com/subject/(\d+)/">\s*'
            r'<img[^>]*class="subject-cover"[^>]*src="([^"]*)"',
            h,
        ):
            cover_map.setdefault(sid, cover)

        # 2) 再抓书名（<a class="fleft" ...>书名</a>）
        for sid, title in re.findall(
            r'<a class="fleft" href="https://book\.douban\.com/subject/(\d+)/">([^<]{1,80})</a>',
            h,
        ):
            title = title.strip()
            if not title or sid in seen:
                continue
            seen.add(sid)
            items.append(
                {
                    "title": title,
                    "url": f"https://book.douban.com/subject/{sid}/",
                    "cover": cover_map.get(sid, ""),
                    "douban_id": sid,
                }
            )
            if len(items) >= limit:
                break

        # 3) /tag/ 页结构（又一种）：
        #    <a class="nbg" href=".../subject/<id>/"><img src="..."></a>
        #    <a href=".../subject/<id>/" title="书名" ...>书名</a>
        if not items:
            tag_covers = {}
            for sid, cover in re.findall(
                r'<a class="nbg" href="https://book\.douban\.com/subject/(\d+)/"[^>]*>\s*'
                r'<img src="([^"]*)"',
                h,
            ):
                tag_covers.setdefault(sid, cover)

            for sid, title in re.findall(
                r'<a href="https://book\.douban\.com/subject/(\d+)/" title="([^"]{1,80})"',
                h,
            ):
                title = title.strip()
                if not title or sid in seen:
                    continue
                seen.add(sid)
                items.append(
                    {
                        "title": title,
                        "url": f"https://book.douban.com/subject/{sid}/",
                        "cover": tag_covers.get(sid, ""),
                        "douban_id": sid,
                    }
                )
                if len(items) >= limit:
                    break

        # 4) 最后兜底：只要书名
        if not items:
            for sid, title in re.findall(
                r'<a href="https://book\.douban\.com/subject/(\d+)/"[^>]*>([^<]{2,60})</a>', h
            ):
                title = title.strip()
                if not title or sid in seen:
                    continue
                seen.add(sid)
                items.append(
                    {
                        "title": title,
                        "url": f"https://book.douban.com/subject/{sid}/",
                        "cover": cover_map.get(sid, ""),
                        "douban_id": sid,
                    }
                )
                if len(items) >= limit:
                    break

        out[key] = items
        print(f"  [book:{key}] {len(items)} 本")
        time.sleep(1.0)
    return out


# ------------------------------------------------------------ 微信读书匹配

WEREAD_SEARCH = "https://weread.qq.com/web/search/global?keyword="


def match_weread(title, author=""):
    """按书名（可选作者）在微信读书搜索，返回 readerLink 或 None。

    返回结构：{ readerLink, deepLink, title, author, matchScore }
    """
    if not title:
        return None

    q = urllib.parse.quote(title)
    d = _get_json(WEREAD_SEARCH + q)
    if not d:
        return None

    books = d.get("books") or []
    if not books:
        return None

    best = None
    best_score = -1
    for b in books[:8]:
        bi = b.get("bookInfo") or {}
        bt = (bi.get("title") or "").strip()
        ba = (bi.get("author") or "").strip()
        if not bt:
            continue

        # 简单相似度：标题完全相等 > 互相包含 > 作者命中
        score = 0
        if bt == title:
            score = 100
        elif title in bt or bt in title:
            score = 60
        else:
            # 去掉标点后比较
            norm = lambda s: re.sub(r"[\s·:：,，.。()（）\[\]【】-]", "", s)
            if norm(bt) == norm(title):
                score = 90
            elif norm(title) in norm(bt) or norm(bt) in norm(title):
                score = 50

        if score <= 0:
            continue

        if author and ba:
            a1 = re.sub(r"[\s·,，.。]", "", author.lower())
            a2 = re.sub(r"[\s·,，.。]", "", ba.lower())
            if a1 and a2 and (a1 in a2 or a2 in a1):
                score += 20

        if score > best_score:
            best_score = score
            best = {
                "readerLink": bi.get("readerLink") or "",
                "deepLink": bi.get("deepLink") or "",
                "title": bt,
                "author": ba,
                "matchScore": score,
            }

    # 分数太低视为没匹配上，避免张冠李戴
    if best and best_score >= 50:
        return best
    return None


def enrich_with_weread(items, kind="book", max_match=20):
    """给榜单条目补微信读书链接。只对书做（影视微信读书没有）。"""
    if kind != "book":
        return items

    n = 0
    for it in items[:max_match]:
        m = match_weread(it.get("title", ""), it.get("author", ""))
        if m:
            it["weread"] = m["readerLink"]
            it["weread_title"] = m["title"]
            n += 1
        else:
            it["weread"] = ""
        time.sleep(0.8)  # 温和限速，避免被挡
    print(f"    微信读书匹配成功 {n}/{min(len(items), max_match)}")
    return items


# --------------------------------------------------------------- 封面下载

COVER_DIR = "modules/attachments/charts"


def download_covers(items, kind, referer, dist_hint=""):
    """把豆瓣封面下载到本地 attachments/charts/。

    豆瓣图床有防盗链：不带 Referer 返回 418。
    浏览器里 <img> 请求不会带 Referer，所以必须下载到本地再引用，
    否则页面上的图全部加载失败（用户看到的「图片没获取到」就是这个）。
    """
    out_dir = os.path.join(SITE, COVER_DIR, kind)
    os.makedirs(out_dir, exist_ok=True)

    n_ok = 0
    for it in items:
        cover = it.get("cover") or ""
        if not cover:
            continue

        # 文件名：用 douban_id 或标题 hash，避免重名
        key = it.get("douban_id") or str(abs(hash(it.get("title", ""))) % (10**10))
        fname = f"{key}.jpg"
        fpath = os.path.join(out_dir, fname)
        rel = f"attachments/charts/{kind}/{fname}"

        # 已存在且够大就跳过（>1KB 视为有效，避免缓存空文件）
        if os.path.exists(fpath) and os.path.getsize(fpath) > 1024:
            it["cover_local"] = rel
            n_ok += 1
            continue

        raw = _get(cover, headers={"Referer": referer}, timeout=20, retries=1)
        if raw and len(raw) > 1024:
            with open(fpath, "wb") as f:
                f.write(raw)
            it["cover_local"] = rel
            n_ok += 1
        else:
            it["cover_local"] = ""
        time.sleep(0.4)

    print(f"    封面下载 {n_ok}/{len(items)}")
    return items


# ------------------------------------------------------------------- 主流程

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--kind", choices=["book", "movie", "all"], default="all")
    ap.add_argument("--limit", type=int, default=20)
    ap.add_argument("--dry-run", action="store_true", help="不联网，仅检查已有缓存")
    args = ap.parse_args()

    os.makedirs(OUT_DIR, exist_ok=True)

    if args.dry_run:
        for f in ("book_charts.json", "movie_charts.json"):
            p = os.path.join(OUT_DIR, f)
            if os.path.exists(p):
                d = json.load(open(p, encoding="utf-8"))
                total = sum(len(v) for v in d.values())
                print(f"  {f}: {total} 条")
            else:
                print(f"  {f}: 不存在")
        return

    if args.kind in ("book", "all"):
        print("抓取豆瓣读书榜单…")
        books = fetch_douban_books(limit=args.limit)
        for key in books:
            print(f"  匹配微信读书 [{key}]")
            books[key] = enrich_with_weread(books[key], "book")
            books[key] = download_covers(
                books[key], "book", referer="https://book.douban.com/"
            )
        p = os.path.join(OUT_DIR, "book_charts.json")
        with open(p, "w", encoding="utf-8") as f:
            json.dump(books, f, ensure_ascii=False, indent=2)
        print(f"  → {p}")

    if args.kind in ("movie", "all"):
        print("抓取豆瓣电影榜单…")
        movies = fetch_douban_movies(limit=args.limit)
        for key in movies:
            print(f"  下载封面 [{key}]")
            movies[key] = download_covers(
                movies[key], "movie", referer="https://movie.douban.com/"
            )
        p = os.path.join(OUT_DIR, "movie_charts.json")
        with open(p, "w", encoding="utf-8") as f:
            json.dump(movies, f, ensure_ascii=False, indent=2)
        print(f"  → {p}")


if __name__ == "__main__":
    main()
