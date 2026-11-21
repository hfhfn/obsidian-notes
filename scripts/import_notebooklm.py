#!/usr/bin/env python3
"""把 NotebookLM 的视频笔记导入「视频与专题」。

NotebookLM 没有公开写入 API，所以走「手工导出 + 本脚本整理」的路子。
脚本本身不联网，只做两件事：
  1. 生成标准格式的笔记骨架（你只需粘贴摘要、放附件）
  2. 把导出的 PPT / XMind / 信息图 归档到 attachments/notebooklm/<slug>/

用法
----
交互式新建一条：

    python scripts/import_notebooklm.py new \
        --title "AI 动画视频创作完全指南" \
        --video "https://www.youtube.com/watch?v=xxx" \
        --platform youtube \
        --channel "经验开源" \
        --duration "42分钟"

批量导入（先填 CSV，再一次性生成）：

    python scripts/import_notebooklm.py batch --csv notes.csv

归档衍生文件（PPT/XMind/信息图）：

    python scripts/import_notebooklm.py attach \
        --title "AI 动画视频创作完全指南" \
        --mindmap ~/Downloads/mindmap.png \
        --slides  ~/Downloads/slides.pdf \
        --infographic ~/Downloads/info.png

CSV 格式（首行表头）：
    title,video_url,platform,channel,duration,status,summary
"""

from __future__ import annotations

import argparse
import csv
import re
import shutil
import sys
from datetime import date
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent
MODULE_DIR = SITE / "modules" / "探索" / "视频与专题"
ATTACH_DIR = SITE / "modules" / "探索" / "视频与专题" / "_assets"

# 衍生笔记类型 → (frontmatter 键, 展示名)
DERIVED_KINDS = {
    "mindmap": "思维导图",
    "slides": "演示文稿",
    "infographic": "信息图",
    "audio": "音频概览",
    "report": "报告",
    "flashcards": "闪卡",
    "quiz": "测验",
}

VALID_STATUS = {"已整理", "整理中", "待整理"}


def safe_slug(title: str) -> str:
    """文件名安全化，保留中文。"""
    s = re.sub(r'[/\\:*?"<>|]', "-", title).strip()
    return s[:80] or "未命名"


def build_note(
    title: str,
    video_url: str,
    platform: str,
    channel: str = "",
    duration: str = "",
    status: str = "待整理",
    summary: str = "",
    derived: list[str] | None = None,
    created: str = "",
) -> str:
    """生成一条视频笔记的完整 Markdown。"""
    if status not in VALID_STATUS:
        status = "待整理"
    created = created or date.today().isoformat()

    fm = ["---", f"title: {title}"]
    if video_url:
        fm.append(f"source_url: {video_url}")
    if platform:
        fm.append(f"platform: {platform}")
    if duration:
        fm.append(f"duration: {duration}")
    if channel:
        fm.append(f"channel: {channel}")
    fm.append(f"status: {status}")
    fm.append(f"created: {created}")
    if derived:
        fm.append("derived:")
        for d in derived:
            fm.append(f"  - {d}")
    fm += ["tags:", "  - video", "---"]

    body = [f"# {title}", ""]
    if summary:
        body += [summary.strip(), ""]

    body += [
        "## 视频源",
        "",
        f"- 平台：{platform or '—'}",
        f"- 频道：{channel or '—'}",
        f"- 时长：{duration or '—'}",
        f"- 链接：{video_url or '—'}",
        "",
        "## 摘要",
        "",
        "> 从 NotebookLM 粘贴生成的摘要。",
        "",
        "## 我的收获",
        "",
        "",
        "## 衍生笔记",
        "",
        "<!-- 归档后此处会列出 PPT / XMind / 信息图 的链接 -->",
        "",
    ]
    return "\n".join(fm) + "\n\n" + "\n".join(body)


def write_note(content: str, title: str, force: bool = False) -> Path:
    MODULE_DIR.mkdir(parents=True, exist_ok=True)
    dest = MODULE_DIR / f"{safe_slug(title)}.md"
    if dest.exists() and not force:
        raise FileExistsError(f"已存在：{dest.name}（加 --force 覆盖）")
    dest.write_text(content, encoding="utf-8", newline="\n")
    return dest


def cmd_new(args) -> int:
    content = build_note(
        title=args.title,
        video_url=args.video,
        platform=args.platform,
        channel=args.channel,
        duration=args.duration,
        status=args.status,
        summary=args.summary,
        derived=args.derived or [],
    )
    try:
        dest = write_note(content, args.title, args.force)
    except FileExistsError as e:
        print(e, file=sys.stderr)
        return 1
    print(f"✅ 已创建 {dest}")
    print(f"   下一步：粘贴摘要到「## 摘要」，再跑 attach 归档衍生文件")
    return 0


def cmd_batch(args) -> int:
    csv_path = Path(args.csv).expanduser()
    if not csv_path.exists():
        print(f"CSV 不存在：{csv_path}", file=sys.stderr)
        return 1

    ok = skipped = failed = 0
    with csv_path.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            title = (row.get("title") or "").strip()
            if not title:
                continue
            content = build_note(
                title=title,
                video_url=(row.get("video_url") or "").strip(),
                platform=(row.get("platform") or "youtube").strip(),
                channel=(row.get("channel") or "").strip(),
                duration=(row.get("duration") or "").strip(),
                status=(row.get("status") or "待整理").strip(),
                summary=(row.get("summary") or "").strip(),
            )
            try:
                write_note(content, title, args.force)
                ok += 1
                print(f"  ✅ {title}")
            except FileExistsError:
                skipped += 1
                print(f"  ⏭  已存在: {title}")
            except Exception as e:
                failed += 1
                print(f"  ❌ {title}: {e}")

    print(f"\n新建 {ok} / 跳过 {skipped} / 失败 {failed}")
    return 0 if failed == 0 else 1


def cmd_attach(args) -> int:
    """把导出的衍生文件归档并写进笔记的「衍生笔记」小节。"""
    note = MODULE_DIR / f"{safe_slug(args.title)}.md"
    if not note.exists():
        print(f"笔记不存在：{note}", file=sys.stderr)
        print("先跑 new 或 batch 创建笔记", file=sys.stderr)
        return 1

    slug = safe_slug(args.title)
    files = {
        "mindmap": args.mindmap,
        "slides": args.slides,
        "infographic": args.infographic,
        "audio": args.audio,
        "report": args.report,
    }
    provided = {k: Path(v).expanduser() for k, v in files.items() if v}
    if not provided:
        print("至少给一个文件：--mindmap / --slides / --infographic", file=sys.stderr)
        return 1

    dest_dir = ATTACH_DIR / slug
    dest_dir.mkdir(parents=True, exist_ok=True)

    links = []
    for kind, src in provided.items():
        if not src.exists():
            print(f"  ⚠️  不存在，跳过：{src}", file=sys.stderr)
            continue
        dest = dest_dir / src.name
        shutil.copy2(src, dest)
        rel = dest.relative_to(MODULE_DIR).as_posix()
        links.append((kind, src.name, rel))
        print(f"  ✅ {DERIVED_KINDS.get(kind, kind)}: {src.name}")

    if not links:
        return 1

    # 更新笔记：写 derived 字段 + 衍生笔记小节
    text = note.read_text(encoding="utf-8")
    kinds = sorted({k for k, _, _ in links})

    # frontmatter 里的 derived
    if "derived:" in text:
        text = re.sub(r"derived:\n(?:  - .*\n)+", "", text)
    fm_end = text.find("\n---", 4)
    if fm_end > 0:
        block = "derived:\n" + "".join(f"  - {k}\n" for k in kinds)
        text = text[:fm_end] + "\n" + block + text[fm_end:]

    # 正文小节
    md_lines = [f"- **{DERIVED_KINDS.get(k, k)}**：[{name}]({rel})" for k, name, rel in links]
    new_section = "## 衍生笔记\n\n" + "\n".join(md_lines) + "\n"
    text = re.sub(
        r"## 衍生笔记\n\n(?:<!--.*?-->\n)?",
        new_section,
        text,
        flags=re.S,
    )
    note.write_text(text, encoding="utf-8", newline="\n")
    print(f"\n✅ 已更新 {note.name}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="NotebookLM 视频笔记导入")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p_new = sub.add_parser("new", help="新建一条笔记")
    p_new.add_argument("--title", required=True)
    p_new.add_argument("--video", default="", help="YouTube/B站 链接")
    p_new.add_argument("--platform", default="youtube", choices=["youtube", "bilibili"])
    p_new.add_argument("--channel", default="")
    p_new.add_argument("--duration", default="")
    p_new.add_argument("--status", default="待整理", choices=sorted(VALID_STATUS))
    p_new.add_argument("--summary", default="")
    p_new.add_argument("--derived", nargs="*", choices=sorted(DERIVED_KINDS))
    p_new.add_argument("--force", action="store_true")
    p_new.set_defaults(func=cmd_new)

    p_batch = sub.add_parser("batch", help="从 CSV 批量导入")
    p_batch.add_argument("--csv", required=True)
    p_batch.add_argument("--force", action="store_true")
    p_batch.set_defaults(func=cmd_batch)

    p_att = sub.add_parser("attach", help="归档 PPT/XMind/信息图")
    p_att.add_argument("--title", required=True)
    p_att.add_argument("--mindmap", help="思维导图（XMind 导出图/PDF）")
    p_att.add_argument("--slides", help="演示文稿（PPT 导出的 PDF）")
    p_att.add_argument("--infographic", help="信息图")
    p_att.add_argument("--audio", help="音频概览")
    p_att.add_argument("--report", help="报告")
    p_att.set_defaults(func=cmd_attach)

    args = ap.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
