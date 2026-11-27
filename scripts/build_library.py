#!/usr/bin/env python3
"""从 Obsidian 笔记生成「藏书馆 / 观影库」页面数据。

扫描 vault 里带 `#book` 或 `#movie` 标签的 Markdown，提取 frontmatter，
输出 JSON 供 Quartz 页面渲染，同时把封面图下载到站点本地。

用法：
    python scripts/build_library.py                 # 两种都生成
    python scripts/build_library.py --kind book     # 只生成藏书馆
    python scripts/build_library.py --kind movie    # 只生成观影库
    python scripts/build_library.py --dry-run       # 只看会处理哪些条目
    python scripts/build_library.py --skip-covers   # 跳过封面下载（离线时用）
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

VAULT = Path(r"D:\private\obsidian")
SITE = Path(__file__).resolve().parent.parent
# 站点自有模块的源目录。三个卡片库不属于笔记库，只存在于 site 仓库，
# 因此扫描源是 modules/ 而不是 vault。
MODULES = SITE / "modules"
CONTENT_DIRS = [SITE / "content-all", SITE / "content-public"]

FM_RE = re.compile(r"^---\r?\n(.*?)\r?\n---", re.S)

# 两类媒体的差异都收敛到这张表，逻辑共用
KINDS: dict[str, dict] = {
    "book": {
        "dir": "藏书馆",
        "json": "_books.json",
        "tag": "book",
        "label": "本书",
        "referer": "https://book.douban.com/",
        # frontmatter status 各种写法 → 站内统一值
        "status_map": {
            "在读": "在读", "reading": "在读", "正在阅读": "在读",
            "已读": "已读", "读完": "已读", "已读完": "已读", "finished": "已读",
            "想读": "想读", "待读": "想读", "未开始": "想读", "wishlist": "想读",
            "未读完": "未读完", "abandoned": "未读完", "弃读": "未读完",
        },
        "default_status": "在读",
        # 卡片上的信息行：(标签, frontmatter 字段)
        # 字段顺序和榜单卡（inject_charts 的 infoOrder）保持一致，
        # 两边都按同一套顺序渲染，缺失的自动跳过。
        "info_fields": [
            ("年份", "year"),
            ("评分", "rating"),
            ("作者", "author"),
            ("页数", "pages"),
            ("开始", "started"),
            ("读完", "finished"),
        ],
        # 作者字段候选名（豆瓣导出常见 author / 作者）
        "creator_fields": ("author", "作者"),
        "creator_label": "",
    },
    "movie": {
        "dir": "观影库",
        "json": "_movies.json",
        "tag": "movie",
        "label": "部",
        "referer": "https://movie.douban.com/",
        "status_map": {
            "在看": "在看", "watching": "在看", "追剧中": "在看",
            "已看": "已看", "看完": "已看", "已看完": "已看", "看过": "已看",
            "watched": "已看", "finished": "已看",
            "想看": "想看", "待看": "想看", "wishlist": "想看",
            "弃剧": "弃剧", "弃了": "弃剧", "abandoned": "弃剧", "未看完": "弃剧",
        },
        "default_status": "在看",
        "info_fields": [
            ("年份", "year"),
            ("评分", "rating"),
            ("类型", "types"),
            ("地区", "regions"),
            ("导演", "director"),
            ("片长", "duration"),
            ("集数", "episodes"),
            ("开始", "started"),
            ("看完", "finished"),
        ],
        "creator_fields": ("director", "导演", "author"),
        "creator_label": "",
    },
    "video": {
        "dir": "视频与专题",
        "json": "_videos.json",
        "tag": "video",
        "label": "条",
        "referer": "",
        "status_map": {
            "已整理": "已整理", "完成": "已整理", "done": "已整理",
            "整理中": "整理中", "进行中": "整理中", "draft": "整理中",
            "待整理": "待整理", "未整理": "待整理", "todo": "待整理",
        },
        "default_status": "待整理",
        "info_fields": [
            ("时长", "duration"),
            ("频道", "channel"),
            ("平台", "platform"),
            ("整理", "created"),
        ],
        "creator_fields": ("channel", "频道", "author"),
        "creator_label": "",
    },
}

# 两个索引页本身不该被当成条目
INDEX_STEMS = {"藏书馆", "观影库"}


# ---------------------------------------------------------------- 解析

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


def parse_list_field(text: str, field: str) -> list[str]:
    """把 frontmatter 里某个列表字段解析成数组。

    parse_frontmatter 会把列表拼成空格分隔的字符串（便于正则匹配），
    但像 derived: [mindmap, slides] 这种需要还原成数组给前端用。
    同时支持 YAML 行内数组 `[a, b]` 和块列表 `- a` 两种写法。
    """
    m = FM_RE.match(text)
    if not m:
        return []
    lines = m.group(1).split("\n")
    for i, line in enumerate(lines):
        stripped = line.strip()
        if not stripped.startswith(field + ":"):
            continue
        inline = stripped.split(":", 1)[1].strip()
        # 行内数组：[mindmap, slides, infographic]
        if inline.startswith("[") and inline.endswith("]"):
            inner = inline[1:-1]
            return [
                x.strip().strip("'\"")
                for x in inner.split(",")
                if x.strip()
            ]
        # 块列表：往下收集 "- xxx"
        out = []
        for nxt in lines[i + 1 :]:
            s = nxt.strip()
            if not s:
                continue
            if s.startswith("- "):
                out.append(s[2:].strip().strip("'\""))
            else:
                break
        return out
    return []


def auto_thumb(source_url: str, platform: str) -> str:
    """从视频链接推断缩略图 URL，没有就用空串。

    YouTube 的缩略图是公开规律 URL，不需要 API：
        https://img.youtube.com/vi/<VIDEO_ID>/maxresdefault.jpg
    视频 ID 可能在 watch?v= / youtu.be/ / shorts/ / embed/ 里。

    B 站需要调 API 拿封面，脚本里不联网，所以留给手填 cover。
    """
    if not source_url:
        return ""
    url = source_url.strip()

    if "youtube.com" in url or "youtu.be" in url:
        vid = ""
        m = re.search(r"(?:v=|/shorts/|/embed/|youtu\.be/)([A-Za-z0-9_-]{11})", url)
        if m:
            vid = m.group(1)
        if vid:
            return f"https://img.youtube.com/vi/{vid}/maxresdefault.jpg"

    return ""


def has_tag(text: str, fm: dict, tag: str) -> bool:
    """frontmatter 的 tags 里含该标签，或正文有 #tag。"""
    tags = fm.get("tags", "")
    if re.search(rf"\b{re.escape(tag)}\b", tags):
        return True
    return bool(re.search(rf"(?<!\w)#{re.escape(tag)}(?!\w)", text))


def normalize_status(raw: str, cfg: dict) -> str:
    r = (raw or "").strip()
    return cfg["status_map"].get(r, cfg["default_status"] if not r else r)


def _item_key(kind: str, fm: dict, title: str, cfg: dict) -> str:
    """生成站内标记用的稳定 key。

    优先豆瓣 id（和榜单卡的 item_key 一致，同一本书两边能联动）；
    没有豆瓣链接时用 标题+作者 的短哈希，保证每本书都有唯一 key。
    """
    sid = _douban_id(fm.get("douban") or fm.get("source_url") or "")
    if sid:
        return f"{kind}:{sid}"

    author = fm.get("author") or fm.get("作者") or fm.get("director") or ""
    raw = f"{title}|{author}".strip()
    h = hashlib.sha1(raw.encode("utf-8")).hexdigest()[:12]
    return f"{kind}:h{h}"


def _douban_id(url: str) -> str:
    """从豆瓣链接里取 subject id。

    https://book.douban.com/subject/26832406/ → 26832406
    """
    m = re.search(r"subject/(\d+)", url or "")
    return m.group(1) if m else ""


def stars_from_rating(rating: str) -> str:
    """豆瓣 10 分制 → 5 星（保留半星）。"""
    try:
        r = float(rating)
    except (TypeError, ValueError):
        return ""
    half = round(r / 2 * 2) / 2
    full = int(half)
    s = "⭐" * full
    if half - full >= 0.5:
        s += "☆"
    return s


def pick_creator(fm: dict, cfg: dict) -> str:
    for key in cfg["creator_fields"]:
        if fm.get(key):
            return fm[key]
    return ""


def collect(kind: str, dry_run: bool = False) -> list[dict]:
    cfg = KINDS[kind]
    base = MODULES / cfg["dir"]
    if not base.exists():
        print(f"[{kind}] 目录不存在: {base}")
        return []

    items = []
    for md in sorted(base.rglob("*.md")):
        if md.stem in INDEX_STEMS:
            continue
        text = md.read_text(encoding="utf-8", errors="ignore")
        fm = parse_frontmatter(text)
        if not has_tag(text, fm, cfg["tag"]):
            continue

        title = fm.get("title") or md.stem
        info = {}
        for label, field in cfg["info_fields"]:
            val = fm.get(field, "")
            if val:
                info[label] = val

        item = {
            "title": title,
            "slug": md.relative_to(MODULES).with_suffix("").as_posix(),
            "creator": pick_creator(fm, cfg),
            "cover": fm.get("cover", ""),
            "rating": fm.get("rating", ""),
            "stars": stars_from_rating(fm.get("rating", "")),
            "status": normalize_status(fm.get("status", ""), cfg),
            "progress": fm.get("progress", ""),
            "douban": fm.get("douban", ""),
            # 站内标记的 item_key。优先用豆瓣 id（能和榜单卡对上），
            # 没有豆瓣链接的书（用 OpenLibrary / TVMaze 的）退回标题+作者哈希，
            # 否则这些笔记卡既不能标记也不能移除（用户反馈 Code / Mona Lisa 没有 ×）。
            "item_key": _item_key(kind, fm, title, cfg),
            # 数据源链接：缩略图点击跳到这本书/这部电影的原始页面。
            # 优先用笔记里显式写的 source_url，其次 douban / openlibrary / tvmaze。
            "source_url": (
                fm.get("source_url")
                or fm.get("douban")
                or fm.get("openlibrary")
                or fm.get("tvmaze")
                or ""
            ),
            "info": info,
        }
        # 视频类特有：原视频链接 + 衍生笔记类型
        if kind == "video":
            item["source_url"] = fm.get("source_url", "")
            item["platform"] = fm.get("platform", "")
            item["derived"] = parse_list_field(text, "derived")
            # 没写 cover 时，优先用 NotebookLM 导出的信息图当封面
            # （信息图是竖版长图，比 YouTube 缩略图更贴合视频专题的语义）
            if not item["cover"]:
                item["cover"] = local_infographic(title)
            # 再退到 YouTube/B站 缩略图
            if not item["cover"]:
                item["cover"] = auto_thumb(item["source_url"], item["platform"])
        items.append(item)
        if dry_run:
            print(f"  {item['status']:4} {title}  ({item['creator'][:24]})")

    return items


# ---------------------------------------------------------------- 封面

def local_infographic(title: str) -> str:
    """找 NotebookLM 导出的信息图，作为视频卡片封面。

    文件在 modules/视频与专题/_assets/<笔记本名>/infographic.webp，
    笔记本名就是笔记 title（可能被 safe_name 改写过标点）。
    返回站点根相对路径（attachments/...），找不到返回空串。
    """
    base = MODULES / "视频与专题" / "_assets"
    if not base.is_dir():
        return ""

    # 目录名和 title 可能因 safe_name 有细微差异，用规范化后比较
    def norm(s: str) -> str:
        return re.sub(r'[<>:"/\\|?*\s_]+', "", s).lower()

    want = norm(title)
    for d in base.iterdir():
        if not d.is_dir() or norm(d.name) != want:
            continue
        for ext in (".webp", ".png"):
            f = d / f"infographic{ext}"
            if f.exists() and f.stat().st_size > 1024:
                # Quartz 构建时会把目录名转小写（"中国AI产业冰山图" →
                # "中国ai产业冰山图"），cover_local 必须跟着转，否则 404。
                low = d.name.lower()
                return f"attachments/modules/视频与专题/_assets/{low}/{f.name}"
    return ""


def _cover_urls(url: str) -> list[str]:
    """封面 URL 的候选列表（原图 + 备选尺寸）。

    OpenLibrary 的 -L（大图）偶尔返回空响应，-M（中图）通常可用。
    它也有默认封面占位图（返回 1px 或空），所以下载后还要校验大小。
    """
    urls = [url]
    if "covers.openlibrary.org" in url and "-L.jpg" in url:
        urls.append(url.replace("-L.jpg", "-M.jpg"))
    return urls


def cover_file_exists(rel: str) -> bool:
    """判断 content-all 下某个封面相对路径是否真的存在。

    为什么不能直接 (SITE/"content-all"/rel).exists()：
      JSON 里的 cover_local 存的是**小写**路径（Quartz 构建会把附件目录
      转小写，Cloudflare 跑 Linux 区分大小写），而 git 里跟踪的文件名
      保留原始大小写（如 "Agent Hooks_ 专业可靠的..."）。
      Windows 不区分大小写所以本地判存在，Linux 上同一路径 404。
      这里按「逐段大小写不敏感」比对真实文件名，两边都能判对。
    """
    base = SITE / "content-all"
    cur = base
    for part in Path(rel).parts:
        if part in ("", "."):
            continue
        nxt = cur / part
        if nxt.exists():
            cur = nxt
            continue
        # 该段在 Linux 上可能大小写不符，扫目录找忽略大小写的匹配
        if not cur.is_dir():
            return False
        low = part.lower()
        hit = next((p for p in cur.iterdir() if p.name.lower() == low), None)
        if hit is None:
            return False
        cur = hit
    return cur.is_file()


def quartz_slug(path: str) -> str:
    """按 Quartz 的 slugifyPath 规则转换路径，用于预测产物里的真实路径。

    为什么要自己实现：站内相对路径的封面（NotebookLM 信息图）不经过下载，
    cover_local 直接透传源路径。但 Quartz 构建时会 slugify 附件目录名，
    两者不一致就会 404。

    Quartz 规则（node_modules/@quartz-community/bases-page 的 slugifyPath）：
        segment.replace(/\\s/g, "-")          空白 → 连字符
               .replace(/&/g, "-and-")        & → -and-
               .replace(/%/g, "-percent")     % → -percent
               .replace(/\\?/g, "")            ? 删掉
               .replace(/#/g, "")             # 删掉
               .replace(/[<>:"|*]/g, "")      这些删掉
               .toLowerCase()

    之前只做了 .lower()，漏了空格转连字符：
        "AI 动画视频创作完全指南"  → 产物是 "ai-动画视频创作完全指南"
        cover_local 却是           "ai 动画视频创作完全指南"
    于是 Linux 上 404（Windows 不区分，看不出来）。

    无空格的目录（如「企业RAG安全：全链接权限...」）恰好只靠 lower 就对了，
    所以表现为「有的能显示、有的不行」。
    """
    out = []
    for seg in path.split("/"):
        seg = re.sub(r"\s", "-", seg)
        seg = seg.replace("&", "-and-").replace("%", "-percent")
        seg = seg.replace("?", "").replace("#", "")
        seg = re.sub(r'[<>:"|*]', "", seg)
        out.append(seg.lower())
    return "/".join(out).rstrip("/")


def download_covers(kind: str, items: list[dict], skip: bool = False) -> int:
    """把远程封面下载到站点本地，避免防盗链和第三方图床不稳定。

    按类别分目录（covers/book/、covers/movie/），防止同名标题互相覆盖。

    skip=True 时（CI / 无代理环境）不下载，但要**保留 JSON 里已有的
    cover_local**。否则每次 --skip-covers 都会把封面字段清空，
    导致产物里全是「无封面」占位——这是公开站封面全丢的根因。
    """
    cfg = KINDS[kind]
    rel_dir = f"attachments/covers/{kind}"
    out_dir = SITE / "content-all" / rel_dir
    out_dir.mkdir(parents=True, exist_ok=True)

    # 读回已有 JSON，建立 title → cover_local 映射，供 skip 时复用
    prev: dict[str, str] = {}
    if skip:
        for d in CONTENT_DIRS:
            target = d / cfg["dir"] / cfg["json"]
            if target.exists():
                try:
                    for x in json.loads(target.read_text(encoding="utf-8")):
                        if x.get("cover_local"):
                            prev[x["title"]] = x["cover_local"]
                except Exception:
                    pass

    ok = 0
    for it in items:
        url = it.get("cover", "")

        # skip 模式（CI / 无代理）：不下载，复用 JSON 里已有的 cover_local，
        # 并确认文件真的在磁盘上（防止引用了已被清理的图）。
        if skip:
            old = prev.get(it["title"])
            if old and cover_file_exists(old):
                # 复用旧值也要过 quartz_slug —— 旧 JSON 里可能是历史遗留的
                # 「只转小写、空格没转连字符」路径，直接复用会让产物 404。
                it["cover_local"] = quartz_slug(old)
                ok += 1
            else:
                it.pop("cover_local", None)
            continue

        # 已经是站内相对路径（NotebookLM 信息图等），直接当封面用，不用下载
        if url and not url.startswith("http"):
            # 站内相对路径（NotebookLM 信息图）：不下载，但要按 Quartz 的
            # slug 规则转换，否则 <img src> 指向的路径在产物里不存在。
            #
            # 只做 .lower() 是不够的：Quartz 还会把空格转成连字符。
            #   "AI 动画视频创作完全指南" → 产物 "ai-动画视频创作完全指南"
            # 漏了这步就是「有的图能显示、有的 404」—— 没空格的目录恰好对。
            it["cover_local"] = quartz_slug(url)
            ok += 1
            continue

        if not url.startswith("http"):
            continue
        ext = ".jpg"
        for cand in (".jpg", ".png", ".webp"):
            if url.lower().endswith(cand):
                ext = cand
                break
        # 文件名必须小写：Quartz 构建时会把附件路径转小写
        # （Windows 不区分大小写看不出来，Linux 上的 Cloudflare 会 404）。
        # 之前用原始大小写，导致私有站封面全裂。
        safe = re.sub(r"[^\w\u4e00-\u9fff-]", "_", it["title"].lower())[:60]
        dest = out_dir / f"{safe}{ext}"
        if dest.exists() and dest.stat().st_size > 1024:
            it["cover_local"] = f"{rel_dir}/{dest.name}"
            ok += 1
            continue

        # 逐个候选 URL 重试：图床偶发返回空响应，重试 3 次
        data = b""
        last_err = ""
        for try_url in _cover_urls(url):
            for attempt in range(3):
                try:
                    req = urllib.request.Request(
                        try_url,
                        headers={
                            "User-Agent": (
                                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                                "AppleWebKit/537.36 (KHTML, like Gecko) "
                                "Chrome/120.0.0.0 Safari/537.36"
                            ),
                            "Referer": cfg["referer"],
                            "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
                        },
                    )
                    with urllib.request.urlopen(req, timeout=25) as resp:
                        data = resp.read()
                    # 空响应 / 过小（占位图）都视为失败，换候选或重试
                    if len(data) > 1024:
                        break
                    last_err = f"响应过小({len(data)}B)"
                    data = b""
                except Exception as e:
                    last_err = str(e)
                    data = b""
                if attempt < 2:
                    time.sleep(0.8 * (attempt + 1))
            if data:
                break

        if data:
            dest.write_bytes(data)
            it["cover_local"] = f"{rel_dir}/{dest.name}"
            ok += 1
        else:
            print(f"[{kind}] 封面下载失败 {it['title']}: {last_err}")
    return ok


# ---------------------------------------------------------------- 输出

def write_json(kind: str, items: list[dict]) -> None:
    cfg = KINDS[kind]
    payload = json.dumps(items, ensure_ascii=False, indent=2)
    for d in CONTENT_DIRS:
        if not d.exists():
            continue
        target = d / cfg["dir"] / cfg["json"]
        target.parent.mkdir(parents=True, exist_ok=True)
        # newline="\n" 固定 LF：Windows 默认写 CRLF，会让 prettier 报格式不一致
        with open(target, "w", encoding="utf-8", newline="\n") as f:
            f.write(payload)
            f.write("\n")


def build(kind: str, dry_run: bool, skip_covers: bool) -> int:
    cfg = KINDS[kind]
    items = collect(kind, dry_run)
    print(f"[{kind}] 找到 {len(items)} {cfg['label']}")

    if dry_run or not items:
        return len(items)

    # --skip-covers 不能直接跳过整段：那会把 cover_local 清空，
    # 产物里全是「无封面」占位（公开站封面全丢的根因）。
    # 传 skip=True 让它复用已有 JSON 里的封面路径。
    n = download_covers(kind, items, skip=skip_covers)
    print(f"[{kind}] {'封面复用' if skip_covers else '封面本地化'} {n} 张")

    write_json(kind, items)

    from collections import Counter

    dist = Counter(i["status"] for i in items)
    print(f"[{kind}] 状态分布: {dict(dist)}")
    return len(items)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--kind",
        choices=[*KINDS, "all"],
        default="all",
        help="生成哪一类（默认全部）",
    )
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument(
        "--skip-covers",
        action="store_true",
        help="不下载封面，复用 JSON 里已有的 cover_local（CI / 无代理环境用）",
    )
    args = ap.parse_args()

    # CI 环境自动跳过封面下载。
    #
    # 为什么不靠 workflow 改命令行：私有站跑的是 `npm run build`，
    # 和本地开发共用同一条命令。在 CI 里另加 --skip-covers 意味着
    # 两套命令要各自维护，容易漏（公开站当初就漏过，导致 CI 产物封面全丢）。
    #
    # 判据用 GitHub Actions 专用变量 GITHUB_ACTIONS，不用通用的 CI：
    #   CI 变量很多工具都会设（本地跑 wrangler 部署时为了关掉交互提示
    #   也要 CI=1），一旦它泄漏到 build_library.py，本地构建就会走
    #   「复用」分支，把刚下载好的 cover_local 覆盖成旧值 —— 实测踩过：
    #   content-all/_videos.json 从 36 条掉到 17 条，公开站 20 张封面变空白。
    #
    #   GITHUB_ACTIONS 只在 GitHub runner 上为 true，本地绝不会误判。
    #
    # 显式传 --skip-covers 仍然有效，用于本地模拟 CI。
    in_ci = os.environ.get("GITHUB_ACTIONS") == "true"
    skip_covers = args.skip_covers or in_ci

    kinds = list(KINDS) if args.kind == "all" else [args.kind]
    for kind in kinds:
        build(kind, args.dry_run, skip_covers)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
