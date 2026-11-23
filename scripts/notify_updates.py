#!/usr/bin/env python3
"""检测内容变化并推送给订阅者。

问题：
  订阅者填了邮箱，但站点重新发布、内容变化后从来没收到过推送。
  现有 subscribe.js 只在订阅当下发一封欢迎邮件，没有任何「更新通知」。

设计：
  1. 构建后扫描 dist，收集所有文章页的 slug + 标题 + 修改时间
  2. 和上次快照（.content-snapshot.json）比对，找出新增页面
  3. 新增页面数 >= MIN_ITEMS 时，调 Cloudflare 的 /api/public/notify
     群发给所有未退订的订阅者
  4. 发送成功后更新快照

为什么不直接在构建脚本里发信：
  发信凭据（Brevo / Resend API Key）是 Pages 的 secret_text 环境变量，
  本地构建时读不到。所以走站点的 notify 端点，由 Functions 侧发信。

为什么要有 MIN_ITEMS 门槛：
  每次构建都会因为时间戳变化产生噪音。只有真正新增了 N 篇以上才推送，
  避免给订阅者发垃圾邮件。

用法：
  python scripts/notify_updates.py --dist dist-public --dry-run
  python scripts/notify_updates.py --dist dist-public            # 实际推送
  python scripts/notify_updates.py --dist dist-public --force    # 忽略门槛
"""
import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SNAPSHOT = ROOT / ".content-snapshot.json"

# 这些目录下的页面不算「内容更新」
SKIP_PREFIXES = ("tags/", "static/", "vendor/", "_assets/")
SKIP_EXACT = {"index.html", "404.html", "隐私政策/index.html", "服务条款/index.html"}

MIN_ITEMS = 3          # 至少新增这么多篇才推送
SITE = "https://notes.hfhfn.dpdns.org"
TITLE_RE = re.compile(r"<title>([^<]*)</title>", re.I)


def collect(dist: Path) -> dict:
    """收集 dist 里所有文章页 → {slug: {title, mtime}}"""
    pages = {}
    for f in dist.rglob("index.html"):
        rel = f.relative_to(dist).as_posix()
        slug = rel[: -len("index.html")].rstrip("/")
        if not slug:
            continue  # 首页不算
        if slug in SKIP_EXACT or any(slug.startswith(p) for p in SKIP_PREFIXES):
            continue
        try:
            html = f.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        m = TITLE_RE.search(html)
        title = m.group(1).strip() if m else slug
        # 去掉 Quartz 的站点后缀
        title = re.sub(r"\s*[|–-]\s*HFH 的笔记\s*$", "", title).strip()
        pages[slug] = {"title": title, "mtime": int(f.stat().st_mtime)}
    return pages


def load_snapshot() -> dict:
    if not SNAPSHOT.exists():
        return {}
    try:
        return json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_snapshot(pages: dict) -> None:
    SNAPSHOT.write_text(
        json.dumps(pages, ensure_ascii=False, indent=1), encoding="utf-8"
    )


def post_notify(items: list, dry: bool) -> tuple[bool, str]:
    """调站点的 notify 端点群发。返回 (成功, 说明)"""
    payload = json.dumps(
        {"items": [{"title": i["title"], "url": f"{SITE}/{i['slug']}"} for i in items]},
        ensure_ascii=False,
    )

    if dry:
        return True, f"[dry-run] 将推送 {len(items)} 条"

    token = os.environ.get("NOTIFY_TOKEN", "")
    if not token:
        return False, "缺少 NOTIFY_TOKEN 环境变量（在 Pages 里配置同名的 secret）"

    env = dict(os.environ)
    env.setdefault("HTTPS_PROXY", "http://127.0.0.1:7890")
    env.setdefault("HTTP_PROXY", "http://127.0.0.1:7890")

    r = subprocess.run(
        [
            "curl", "-s", "-X", "POST",
            f"{SITE}/api/public/notify",
            "-H", "content-type: application/json",
            "-H", f"x-notify-token: {token}",
            "--data-binary", payload,
            "--max-time", "60",
        ],
        capture_output=True, text=True, env=env,
    )
    body = (r.stdout or "").strip()
    try:
        d = json.loads(body)
        if d.get("ok"):
            return True, f"已推送 {d.get('sent', '?')} 人（失败 {d.get('failed', 0)}）"
        return False, f"服务端拒绝: {d.get('error') or body[:200]}"
    except Exception:
        return False, f"响应不是 JSON: {body[:200]}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dist", default="dist-public")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true", help="忽略 MIN_ITEMS 门槛")
    ap.add_argument("--min", type=int, default=MIN_ITEMS)
    args = ap.parse_args()

    dist = ROOT / args.dist
    if not dist.exists():
        print(f"✗ 目录不存在: {dist}", file=sys.stderr)
        return 1

    current = collect(dist)
    previous = load_snapshot()

    if not previous:
        save_snapshot(current)
        print(f"[notify] 首次运行，建立基线 {len(current)} 篇，不推送")
        return 0

    added = [s for s in current if s not in previous]
    # 标题变了也算更新
    changed = [
        s for s in current
        if s in previous and current[s]["title"] != previous[s]["title"]
    ]

    print(f"[notify] 当前 {len(current)} 篇 / 快照 {len(previous)} 篇")
    print(f"[notify] 新增 {len(added)} 篇，标题变更 {len(changed)} 篇")

    if added:
        for s in added[:10]:
            print(f"   + {current[s]['title']}")

    updates = added + changed
    if not updates:
        save_snapshot(current)
        print("[notify] 无更新，跳过")
        return 0

    if len(updates) < args.min and not args.force:
        save_snapshot(current)
        print(f"[notify] 少于 {args.min} 篇，不推送（--force 可强制）")
        return 0

    items = [{"title": current[s]["title"], "slug": s} for s in updates[:20]]
    ok, msg = post_notify(items, args.dry_run)
    print(f"[notify] {'✓' if ok else '✗'} {msg}")

    if ok and not args.dry_run:
        save_snapshot(current)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
