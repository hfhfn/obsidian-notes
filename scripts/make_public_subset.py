#!/usr/bin/env python3
"""Build a public-only subset of `content/` for the anonymous site.

The full `content/` tree is published behind Cloudflare Access. This script
copies only the allow-listed top-level folders plus whatever attachments those
notes actually reference, so private notes and their PDFs never reach the
public deployment.

Usage:
    python scripts/make_public_subset.py               # content -> content-public
    python scripts/make_public_subset.py --dry-run
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content-all"
OUT = ROOT / "content-public"

# 未登录访客可以看到的目录
PUBLIC_DIRS = [
    "AI",
    "AI大模型",
    "AIGC",
    "CS(计科)",
    "工作",
    "应用&工具笔记",
    # 站点自有模块（源在 obsidian-site/modules/，经 sync_content 注入 content-all）
    "藏书馆",
    "观影库",
    "视频与专题",
]

# 始终保留的顶层文件/目录（导航与静态资源）
ALWAYS = ["index.md", "images", "attachments"]

# 匹配 markdown / HTML 里对附件的引用
ATTACH_REF = re.compile(r"(?:/|\.\./)*attachments/([^\s)\"'<>]+)")


def collect_attachment_refs(md_files: list[Path]) -> set[str]:
    """Return the set of `attachments/...` paths referenced by public notes."""
    refs: set[str] = set()
    for path in md_files:
        text = path.read_text(encoding="utf-8", errors="ignore")
        for m in ATTACH_REF.finditer(text):
            target = m.group(1)
            try:
                from urllib.parse import unquote

                refs.add(unquote(target))
            except Exception:  # noqa: BLE001
                refs.add(target)
    return refs


WIKILINK = re.compile(r"(!?)\[\[([^\]|#]+)(#[^\]|]*)?(?:\|([^\]]*))?\]\]")
MDLINK = re.compile(r"(!?)\[([^\]]*)\]\(([^)\s]+)(\s+\"[^\"]*\")?\)")


def prune_private_links(out_dir: Path, private_prefixes: set[str]) -> int:
    """Degrade links that point outside the public subset into plain text.

    Quartz resolves links at build time, so a link whose target was never copied
    would still leak the private note title into contentIndex.json and the
    rendered page. Rewriting them to plain text keeps the public site honest.
    """
    public_notes: set[str] = set()
    public_files: set[str] = set()
    for p in out_dir.rglob("*"):
        if not p.is_file():
            continue
        rel = p.relative_to(out_dir).as_posix()
        public_files.add(rel)
        if rel.endswith(".md"):
            public_notes.add(rel[:-3])
    public_basenames = {n.rsplit("/", 1)[-1] for n in public_notes}

    def is_private_target(target: str) -> bool:
        t = target.strip().lstrip("/").replace("\\", "/")
        if t.startswith("./"):
            t = t[2:]
        # 链接里的路径是 URL 编码的（中文附件名尤其明显），
        # 而 public_files 存的是磁盘上的真实文件名，必须先解码再比对，
        # 否则「检索精确率….htm」这类中文附件会被误判成未发布而降级为纯文本。
        t = urllib.parse.unquote(t)
        if t.lower().endswith(".md"):
            t = t[:-3]
        head = t.split("/", 1)[0]
        if head in private_prefixes:
            return True
        # 明确指向 attachments 但该文件没被复制
        if t.startswith("attachments/") and t not in public_files:
            return True
        # 短链接：文件名在公开集合里能找到就不算私有
        base = t.rsplit("/", 1)[-1]
        if "/" not in t and base in public_basenames:
            return False
        if t in public_notes:
            return False
        return False  # 交给 Quartz 的断链处理，不误伤

    changed = 0
    for path in out_dir.rglob("*.md"):
        text = path.read_text(encoding="utf-8", errors="ignore")
        original = text

        def wl(m: re.Match) -> str:
            target, alias = m.group(2), m.group(4)
            if is_private_target(target):
                return alias or target.strip().rsplit("/", 1)[-1]
            return m.group(0)

        def ml(m: re.Match) -> str:
            target, label = m.group(3), m.group(2)
            if target.startswith(("http://", "https://", "mailto:", "#", "data:")):
                return m.group(0)
            raw = target.split("#", 1)[0]
            if is_private_target(raw):
                return label or raw.rsplit("/", 1)[-1]
            return m.group(0)

        text = WIKILINK.sub(wl, text)
        text = MDLINK.sub(ml, text)
        if text != original:
            path.write_text(text, encoding="utf-8")
            changed += 1
    return changed


def clean_homepage(out_dir: Path, private_prefixes: set[str]) -> int:
    """Remove homepage rows/lines that only describe private folders.

    The vault README doubles as the site homepage, so its navigation table and
    directory list mention folders that are not published. Showing them as
    dead text is confusing, so drop those rows entirely.
    """
    index = out_dir / "index.md"
    if not index.exists():
        return 0
    names = sorted(private_prefixes, key=len, reverse=True)
    kept: list[str] = []
    removed = 0
    for line in index.read_text(encoding="utf-8").split("\n"):
        stripped = line.strip()
        is_row = stripped.startswith("|")
        is_bullet = stripped.startswith("- ")
        if (is_row or is_bullet) and any(n in line for n in names):
            removed += 1
            continue
        kept.append(line)
    if removed:
        index.write_text("\n".join(kept), encoding="utf-8")
    return removed


def fetch_hidden_slugs() -> set[str]:
    """从 D1 读公开站隐藏列表；D1 不可达时退回仓库里的 .hidden-slugs.json。

    为什么要有 fallback：
      CI 上没有 npx 缓存、也可能拿不到 D1，wrangler 调用会失败。
      以前失败就 `return set()`，导致隐藏列表变空 → 隐藏的视频在公开站
      全部显示（用户反馈「公开站点被隐藏的视频依然能看到」）。
      现在失败时读仓库里已提交的清单，保证构建可复现。
    """
    import subprocess

    sql = "SELECT slug FROM video_visibility WHERE hidden = 1"
    try:
        r = subprocess.run(
            [
                "npx", "--no-install", "wrangler", "d1", "execute", "notes-db",
                "--remote", "--json", "--command", sql,
            ],
            capture_output=True,
            text=True,
            timeout=120,
            shell=True,
        )
        if r.returncode != 0:
            raise RuntimeError(f"wrangler 退出码 {r.returncode}")

        # wrangler 输出前面有 npm notice 之类的噪音，取第一个 JSON 数组
        out = r.stdout
        start = out.find("[")
        if start < 0:
            raise RuntimeError("输出里没有 JSON 数组")
        data = json.loads(out[start:])
        rows = []
        for block in data:
            rows.extend(block.get("results") or [])
        return {row["slug"] for row in rows if row.get("slug")}
    except Exception as e:
        # 退回仓库里的清单（CI 场景）
        fallback = ROOT / ".hidden-slugs.json"
        if fallback.exists():
            try:
                arr = json.loads(fallback.read_text(encoding="utf-8"))
                if isinstance(arr, list) and arr:
                    print(f"  [warn] 读 D1 失败（{e}），用仓库清单：{len(arr)} 条")
                    return set(arr)
            except Exception:
                pass
        print(f"  [warn] 读隐藏列表失败（{e}），按无隐藏处理")
        return set()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not CONTENT.is_dir():
        print(f"content/ not found: {CONTENT}")
        return 1

    if OUT.exists():
        shutil.rmtree(OUT)
    if not args.dry_run:
        OUT.mkdir(parents=True)

    copied_md: list[Path] = []
    copied_dirs: list[str] = []

    # 公开站隐藏列表：管理员在站点上标记 hidden 的视频笔记。
    # 用 wrangler 查 D1（构建机有 CF 凭据），查不到就当作空列表 ——
    # 不能让 D1 查询失败阻断整个构建。
    hidden_slugs = fetch_hidden_slugs()
    if hidden_slugs:
        print(f"  公开站隐藏 {len(hidden_slugs)} 条视频笔记")

    for name in PUBLIC_DIRS:
        src = CONTENT / name
        if not src.is_dir():
            print(f"  skip (missing): {name}")
            continue
        dst = OUT / name
        if not args.dry_run:
            shutil.copytree(src, dst)
            # 剔除 hidden 的视频笔记（只影响公开站）
            #
            # slug 形如「视频与专题/掘金头条...」，而 dst 本身就是
            # 视频与专题/ 目录 —— 之前直接 dst / f"{slug}.md" 会拼成
            # 视频与专题/视频与专题/xxx.md，永远不存在，所以一条都没剔除
            # （用户反馈「隐藏了公开站未登录还能看到」）。
            # 正确做法：把 slug 的第一段（模块名）去掉再拼。
            if hidden_slugs:
                removed = 0
                for slug in hidden_slugs:
                    parts = slug.split("/", 1)
                    if len(parts) < 2:
                        continue
                    target = dst / f"{parts[1]}.md"
                    if target.exists():
                        target.unlink()
                        removed += 1
                if removed:
                    print(f"    {name}: 剔除 {removed} 条")

            # 把隐藏清单写到仓库根的临时文件，供 inject_library.mjs 过滤
            # 列表页卡片。
            #
            # 不写在 content-public 里 —— 那个目录会被 Quartz 整个复制到
            # dist，清单会变成公开可访问的 URL。
            if hidden_slugs and name == "视频与专题":
                (ROOT / ".hidden-slugs.json").write_text(
                    json.dumps(sorted(hidden_slugs), ensure_ascii=False, indent=2),
                    encoding="utf-8",
                )
        copied_dirs.append(name)
        copied_md.extend(src.rglob("*.md"))

    for name in ALWAYS:
        src = CONTENT / name
        if not src.exists():
            continue
        dst = OUT / name
        if args.dry_run:
            continue
        if src.is_dir():
            if name == "attachments":
                continue  # 按引用筛选，稍后单独处理
            shutil.copytree(src, dst)
        else:
            shutil.copy2(src, dst)

    # 以下目录里的资源是被「注入的 HTML」引用的（卡片 cover_local），
    # md 源文件里没有引用，靠 collect_attachment_refs 会全部漏掉，
    # 必须整目录复制：
    #   charts   — 豆瓣榜单封面（inject_charts.mjs）
    #   modules  — 三个卡片库的本地附件，含 NotebookLM 信息图（inject_library.mjs）
    #   covers   — 书/影/视频卡片封面（build_library.py 下载的）
    for sub in ("charts", "modules", "covers"):
        src = CONTENT / "attachments" / sub
        if not src.is_dir():
            continue
        dst = OUT / "attachments" / sub
        if not args.dry_run:
            shutil.copytree(src, dst, dirs_exist_ok=True)
        n = sum(1 for f in src.rglob("*") if f.is_file())
        print(f"[public-subset] attachments/{sub} 整目录复制（{n} 个文件）")

    # 只复制被公开笔记引用到的附件
    refs = collect_attachment_refs(copied_md)
    attach_src = CONTENT / "attachments"
    attach_dst = OUT / "attachments"
    copied_attach = 0
    if attach_src.is_dir() and refs:
        for rel in sorted(refs):
            src = attach_src / rel
            if not src.is_file():
                continue
            dst = attach_dst / rel
            if not args.dry_run:
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src, dst)
            copied_attach += 1

    print(
        f"[public-subset] dirs={len(copied_dirs)} notes={len(copied_md)} "
        f"attachments={copied_attach} -> {OUT.name}"
    )

    # 把指向私有目录的链接降级为纯文本，避免标题泄漏到公开站的搜索索引
    private_prefixes = {
        p.name
        for p in CONTENT.iterdir()
        if p.is_dir() and p.name not in PUBLIC_DIRS and p.name not in ALWAYS
    }
    pruned = prune_private_links(OUT, private_prefixes)
    if pruned:
        print(f"[public-subset] 降级了 {pruned} 篇笔记中的私有链接")

    cleaned = clean_homepage(OUT, private_prefixes)
    if cleaned:
        print(f"[public-subset] 首页移除了 {cleaned} 行私有目录说明")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
