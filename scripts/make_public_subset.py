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

    for name in PUBLIC_DIRS:
        src = CONTENT / name
        if not src.is_dir():
            print(f"  skip (missing): {name}")
            continue
        dst = OUT / name
        if not args.dry_run:
            shutil.copytree(src, dst)
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
    for sub in ("charts", "modules"):
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
