#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Obsidian Vault -> Quartz content sync.

- Copies only allow-listed folders.
- Converts raster images to WebP (site copies only; originals untouched).
- Rewrites wikilinks / markdown links to canonical published paths.
- Replaces Dataview blocks with static tables.
- Copies referenced HTML / small PDF / Canvas attachments.
- Redacts high-confidence secrets and reports them.

Usage:
    python scripts/sync_content.py            # sync
    python scripts/sync_content.py --dry-run  # report only, no writes
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import posixpath
import re
import shutil
import sys
from collections import defaultdict
from pathlib import Path
from urllib.parse import quote, unquote

import yaml
from PIL import Image, ImageOps

# The vault contains a few very large diagrams; allow them.
Image.MAX_IMAGE_PIXELS = None

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

VAULT = Path(os.environ.get("OBSIDIAN_VAULT", r"D:\private\obsidian")).resolve()
SITE = Path(__file__).resolve().parent.parent
CONTENT = SITE / "content-all"

INCLUDE_DIRS = [
    "AI",
    "AI大模型",
    "AIGC",
    "CS(计科)",
    "应用&工具笔记",
    "文学&认知",
    "问题&资料收集",
    "归档",
    "Clippings",
    "工作",
    "藏书馆",
    "观影库",
]
INCLUDE_ROOT_FILES = ["README.md"]

# Directories never copied / indexed for publishable content.
SKIP_DIRS = {
    ".git",
    ".obsidian",
    ".claudian",
    ".claude",
    "node_modules",
    "public",
    ".quartz",
    ".quartz-cache",
    "00_Inbox",
    "00_系统",
    "template",
    "private",
    "00_附件",
    "Excalidraw",
}

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".bmp", ".tif", ".tiff", ".ico"}
COPY_ATTACHMENT_EXTS = {".pdf", ".html", ".htm", ".canvas"}
PDF_MAX_MB = 5.0
WEBP_QUALITY = 85
WEBP_MAX_DIM = 2400

# High-confidence secret patterns. The replacement keeps the prefix when useful.
SECRET_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"gh[pousr]_[A-Za-z0-9]{30,}"), "GitHub token"),
    (re.compile(r"github_pat_[A-Za-z0-9_]{20,}"), "GitHub fine-grained token"),
    (re.compile(r"sk-[A-Za-z0-9_-]{24,}"), "sk- API key"),
    (re.compile(r"AKIA[0-9A-Z]{16}"), "AWS access key"),
    (re.compile(r"(?i)(Bearer\s+)([A-Za-z0-9._\-]{20,})"), "Bearer token"),
    (
        re.compile(
            r"(?i)((?:api[_-]?key|secret|token|password|passwd|pwd)\s*[:=]\s*[\"']?)([A-Za-z0-9._\-]{20,})"
        ),
        "key/password assignment",
    ),
]

WIKILINK_RE = re.compile(r"(!?)\[\[([^\]\n]+?)\]\]")
MDLINK_RE = re.compile(r"(!?)\[([^\]]*)\]\(([^)\s]+?)(\s+\"[^\"]*\")?\)")
DATAVIEW_RE = re.compile(r"```dataview[^\n]*\n(.*?)```", re.S | re.I)
CODE_SPLIT_RE = re.compile(r"(```[\s\S]*?```|`[^`\n]*`)")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def norm(p: str) -> str:
    return p.replace("\\", "/")


def rel_to_vault(path: Path) -> str:
    return norm(str(path.resolve().relative_to(VAULT)))


def safe_date(ts: float) -> str:
    return dt.datetime.fromtimestamp(ts).astimezone().isoformat(timespec="seconds")


def short_date(ts: float) -> str:
    return dt.datetime.fromtimestamp(ts).strftime("%Y-%m-%d")


def unique_output(out_rel: str, used: set[str]) -> str:
    """Return a unique output path, appending a short hash when needed."""
    if out_rel not in used:
        used.add(out_rel)
        return out_rel
    stem, ext = posixpath.splitext(out_rel)
    h = hashlib.sha1(out_rel.encode("utf-8")).hexdigest()[:6]
    candidate = f"{stem}-{h}{ext}"
    i = 2
    while candidate in used:
        candidate = f"{stem}-{h}-{i}{ext}"
        i += 1
    used.add(candidate)
    return candidate


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def is_external(url: str) -> bool:
    u = url.strip().lower()
    return u.startswith(("http://", "https://", "mailto:", "tel:", "#", "data:"))


# ---------------------------------------------------------------------------
# Vault index
# ---------------------------------------------------------------------------


class VaultIndex:
    def __init__(self, vault: Path):
        self.vault = vault
        self.all_files: dict[str, str] = {}  # rel -> rel
        self.by_base: defaultdict[str, list[str]] = defaultdict(list)
        self.md: dict[str, str] = {}  # rel without .md -> rel
        self.md_base: defaultdict[str, list[str]] = defaultdict(list)
        self.publishable: set[str] = set()
        self._build()

    def _walk(self):
        for dp, dn, fn in os.walk(self.vault):
            dn[:] = [
                d
                for d in dn
                if d not in {".git", ".obsidian", ".claudian", ".claude", "node_modules", "public"}
                and not d.startswith(".quartz")
            ]
            for f in fn:
                yield Path(dp) / f

    def _build(self):
        for p in self._walk():
            rel = rel_to_vault(p)
            self.all_files[rel] = rel
            self.by_base[p.name].append(rel)
            if p.suffix.lower() == ".md":
                noext = rel[:-3]
                self.md[noext] = rel
                self.md_base[posixpath.basename(noext)].append(rel)

        for d in INCLUDE_DIRS:
            prefix = d + "/"
            for rel in self.all_files:
                if rel.startswith(prefix):
                    self.publishable.add(rel)
        for f in INCLUDE_ROOT_FILES:
            if f in self.all_files:
                self.publishable.add(f)

    def is_publishable_md(self, rel: str) -> bool:
        return rel in self.publishable and rel.endswith(".md")

    def _closest(self, note_rel: str, candidates: list[str]) -> str:
        note_dir = posixpath.dirname(note_rel)
        best = candidates[0]
        best_score = -1
        for c in candidates:
            c_dir = posixpath.dirname(c)
            # common path segments
            a = note_dir.split("/") if note_dir else []
            b = c_dir.split("/") if c_dir else []
            common = 0
            for x, y in zip(a, b):
                if x != y:
                    break
                common += 1
            score = common * 10 + (5 if c in self.publishable else 0)
            if score > best_score:
                best_score = score
                best = c
        return best

    def resolve_md(self, target: str, note_rel: str):
        """Return (rel, status) where status in {'ok','excluded','missing'}."""
        t = norm(target).strip().strip("<>").lstrip("/")
        if t.lower().endswith(".md"):
            t = t[:-3]
        if not t:
            return None, "missing"

        # README.md is published as the site homepage.
        if t.lower() == "readme":
            return "index.md", "ok"

        cands: list[str] = []
        if t in self.md:
            cands.append(self.md[t])
        nt = posixpath.normpath(posixpath.join(posixpath.dirname(note_rel), t))
        if nt in self.md:
            cands.append(self.md[nt])
        base = posixpath.basename(t)
        cands.extend(self.md_base.get(base, []))

        # de-duplicate while preserving order
        seen = set()
        cands = [c for c in cands if not (c in seen or seen.add(c))]
        if not cands:
            return None, "missing"
        chosen = self._closest(note_rel, cands)
        if chosen == "README.md":
            return "index.md", "ok"
        if chosen not in self.publishable:
            return chosen, "excluded"
        return chosen, "ok"

    def resolve_file(self, target: str, note_rel: str, exts: set[str] | None = None):
        """Return (rel, status). Only considers files with matching extension."""
        t = norm(target).strip().strip("<>").lstrip("/")
        if not t:
            return None, "missing"

        def ok_ext(x: str) -> bool:
            return exts is None or posixpath.splitext(x)[1].lower() in exts

        cands: list[str] = []
        if t in self.all_files and ok_ext(t):
            cands.append(t)
        nt = posixpath.normpath(posixpath.join(posixpath.dirname(note_rel), t))
        if nt in self.all_files and ok_ext(nt):
            cands.append(nt)
        base = posixpath.basename(t)
        cands.extend([x for x in self.by_base.get(base, []) if ok_ext(x)])

        # If no exact name matched but an image without extension was used,
        # try common image extensions.
        if not cands and exts is not None and "." not in posixpath.basename(t):
            for ext in exts:
                name = t + ext
                cands.extend(self.by_base.get(posixpath.basename(name), []))

        seen = set()
        cands = [c for c in cands if not (c in seen or seen.add(c))]
        if not cands:
            return None, "missing"
        return self._closest(note_rel, cands), "ok"


# ---------------------------------------------------------------------------
# Sync state
# ---------------------------------------------------------------------------


class Sync:
    def __init__(self, dry_run: bool = False):
        self.dry_run = dry_run
        self.index = VaultIndex(VAULT)
        self.asset_map: dict[str, str] = {}  # source rel -> output rel
        self.used_outputs: set[str] = set()
        # 大 PDF 的 R2 公网链接映射（由 upload_pdfs.py 生成，文件名 -> URL）
        self.pdf_manifest: dict[str, str] = {}
        manifest_path = Path(__file__).resolve().parent / "pdf_manifest.json"
        if manifest_path.exists():
            try:
                self.pdf_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            except Exception as e:
                print(f"[sync] pdf_manifest.json 解析失败，忽略: {e}")
        self.report = {
            "notes": 0,
            "images": 0,
            "images_converted": 0,
            "image_bytes_before": 0,
            "image_bytes_after": 0,
            "html": 0,
            "pdf": 0,
            "pdf_skipped": [],
            "canvas": 0,
            "broken_links": [],
            "excluded_links": [],
            "secrets": [],
            "dataview": 0,
            "warnings": [],
        }
        self._secret_seen: set[tuple[str, str]] = set()
        self._pdf_skipped: set[str] = set()
        self._title_cache: dict[str, str] = {}

    # -- output helpers ---------------------------------------------------

    def out_path(self, out_rel: str) -> Path:
        return CONTENT / out_rel

    def write_text(self, out_rel: str, text: str):
        if self.dry_run:
            return
        p = self.out_path(out_rel)
        ensure_parent(p)
        p.write_text(text, encoding="utf-8", newline="\n")

    def copy_file(self, src_rel: str, out_rel: str):
        if self.dry_run:
            return
        src = VAULT / src_rel
        dst = self.out_path(out_rel)
        ensure_parent(dst)
        shutil.copy2(src, dst)

    # -- images -----------------------------------------------------------

    def copy_image(self, src_rel: str):
        if src_rel in self.asset_map:
            return self.asset_map[src_rel]
        src = VAULT / src_rel
        ext = src.suffix.lower()
        if not src.exists():
            return None

        self.report["images"] += 1
        self.report["image_bytes_before"] += src.stat().st_size

        # GIF/SVG/ICO/WebP: copy as-is.
        if ext in {".gif", ".svg", ".ico", ".webp"}:
            out_rel = unique_output(src_rel, self.used_outputs)
            self.copy_file(src_rel, out_rel)
            self.asset_map[src_rel] = out_rel
            self.report["image_bytes_after"] += src.stat().st_size
            return out_rel

        try:
            im = Image.open(src)
            if getattr(im, "is_animated", False):
                out_rel = unique_output(src_rel, self.used_outputs)
                self.copy_file(src_rel, out_rel)
                self.asset_map[src_rel] = out_rel
                self.report["image_bytes_after"] += src.stat().st_size
                return out_rel

            im = ImageOps.exif_transpose(im)
            if max(im.size) > WEBP_MAX_DIM:
                im.thumbnail((WEBP_MAX_DIM, WEBP_MAX_DIM), Image.LANCZOS)
            if im.mode in ("P", "LA"):
                im = im.convert("RGBA")
            elif im.mode not in ("RGB", "RGBA"):
                im = im.convert("RGB")

            quality = 88 if ext == ".png" else WEBP_QUALITY

            # Candidate output path: same folder, .webp suffix.
            base_out = posixpath.splitext(src_rel)[0] + ".webp"
            out_rel = unique_output(base_out, self.used_outputs)
            dst = self.out_path(out_rel)

            if not self.dry_run:
                ensure_parent(dst)
                im.save(dst, "WEBP", quality=quality, method=4)

            out_size = dst.stat().st_size if (not self.dry_run and dst.exists()) else 0
            src_size = src.stat().st_size
            if not self.dry_run and out_size >= src_size * 0.98:
                # WebP didn't help: keep the original.
                try:
                    dst.unlink()
                except OSError:
                    pass
                self.used_outputs.discard(out_rel)
                out_rel = unique_output(src_rel, self.used_outputs)
                self.copy_file(src_rel, out_rel)
                self.asset_map[src_rel] = out_rel
                self.report["image_bytes_after"] += src_size
                return out_rel

            self.asset_map[src_rel] = out_rel
            self.report["images_converted"] += 1
            self.report["image_bytes_after"] += out_size if out_size else int(src_size * 0.3)
            return out_rel
        except Exception as exc:  # noqa: BLE001
            self.report["warnings"].append(f"图片转换失败，保留原图：{src_rel} ({exc})")
            out_rel = unique_output(src_rel, self.used_outputs)
            self.copy_file(src_rel, out_rel)
            self.asset_map[src_rel] = out_rel
            self.report["image_bytes_after"] += src.stat().st_size
            return out_rel

    # -- attachments ------------------------------------------------------

    def copy_html(self, src_rel: str):
        if src_rel in self.asset_map:
            return self.asset_map[src_rel]
        # Quartz strips the `.html` extension when publishing assets, which
        # leaves a file browsers cannot render. `.htm` is kept verbatim.
        stem = posixpath.splitext(posixpath.basename(src_rel))[0]
        out_rel = unique_output(f"attachments/html/{stem}.htm", self.used_outputs)
        self.copy_file(src_rel, out_rel)
        self.asset_map[src_rel] = out_rel
        self.report["html"] += 1
        return out_rel

    def copy_pdf(self, src_rel: str):
        if src_rel in self.asset_map:
            return self.asset_map[src_rel]
        src = VAULT / src_rel
        size_mb = src.stat().st_size / 1024 / 1024
        if size_mb > PDF_MAX_MB:
            if src_rel not in self._pdf_skipped:
                self._pdf_skipped.add(src_rel)
                self.report["pdf_skipped"].append((src_rel, round(size_mb, 1)))
            return None
        name = posixpath.basename(src_rel)
        out_rel = unique_output(f"attachments/pdf/{name}", self.used_outputs)
        self.copy_file(src_rel, out_rel)
        self.asset_map[src_rel] = out_rel
        self.report["pdf"] += 1
        return out_rel

    def copy_canvas(self, src_rel: str):
        if src_rel in self.asset_map:
            return self.asset_map[src_rel]
        out_rel = unique_output(src_rel, self.used_outputs)
        src = VAULT / src_rel
        try:
            data = json.loads(src.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            self.report["warnings"].append(f"Canvas 解析失败，原样复制：{src_rel} ({exc})")
            self.copy_file(src_rel, out_rel)
            self.asset_map[src_rel] = out_rel
            self.report["canvas"] += 1
            return out_rel

        changed = 0
        for node in data.get("nodes", []):
            target = node.get("file")
            if not isinstance(target, str) or not target:
                continue
            src_md, status = self.index.resolve_md(target, src_rel)
            if status == "ok" and src_md:
                fixed = src_md
                if fixed != target:
                    node["file"] = fixed
                    changed += 1
            else:
                # Unpublished or missing note: drop the file link so the node
                # stays as plain text instead of 404-ing on the site.
                node.pop("file", None)
                changed += 1

        if changed:
            self.report["warnings"].append(f"Canvas 修正 {changed} 个节点链接：{src_rel}")
        if not self.dry_run:
            p = self.out_path(out_rel)
            ensure_parent(p)
            p.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        self.asset_map[src_rel] = out_rel
        self.report["canvas"] += 1
        return out_rel

    # -- link helpers -----------------------------------------------------

    @staticmethod
    def split_alias(inner: str):
        """Split an Obsidian wikilink body into target/heading/alias."""
        # `\|` is the table-safe alias separator; treat it as a normal pipe.
        s = inner.replace(r"\|", "|")
        alias = None
        if "|" in s:
            s, alias = s.split("|", 1)
        heading = None
        if "#" in s:
            s, heading = s.split("#", 1)
        return s.strip(), (heading or "").strip(), alias

    @staticmethod
    def rel_link(target_out: str, note_out: str) -> str:
        # Root-absolute links survive Quartz's own link rewriting untouched.
        # (Relative links get a second, wrong prefix applied at build time.)
        return "/" + quote(target_out, safe="/:@-._~!$&'*+,;=")

    @staticmethod
    def fix_table_pipes(text: str) -> str:
        """Escape alias pipes inside wikilinks that sit in Markdown table rows."""
        lines = []
        for line in text.split("\n"):
            if line.lstrip().startswith("|"):
                def fix(m: re.Match) -> str:
                    inner = m.group(2)
                    inner = re.sub(r"(?<!\\)\|", r"\\|", inner)
                    return f"{m.group(1)}[[{inner}]]"
                line = WIKILINK_RE.sub(fix, line)
            lines.append(line)
        return "\n".join(lines)

    def _note_link(self, out_rel: str, heading: str, alias: str | None) -> str:
        noext = out_rel[:-3] if out_rel.lower().endswith(".md") else out_rel
        h = f"#{heading}" if heading else ""
        if alias:
            return f"[[{noext}{h}|{alias}]]"
        # Without an explicit alias Obsidian shows the file name; Quartz would
        # show the full path instead, so pin the display text to the note title.
        title = self.note_title(out_rel)
        return f"[[{noext}{h}|{title}]]" if title else f"[[{noext}{h}]]"

    def note_title(self, out_rel: str) -> str:
        """Frontmatter title (or file name) of a published note."""
        if out_rel in self._title_cache:
            return self._title_cache[out_rel]
        stem = posixpath.splitext(posixpath.basename(out_rel))[0]
        title = stem
        src = VAULT / (out_rel[:-3] + ".md" if out_rel.endswith(".md") else out_rel)
        if out_rel == "index.md":
            src = VAULT / "README.md"
        if src.exists():
            text = src.read_text(encoding="utf-8", errors="replace")[:2000]
            m = re.match(r"^---\r?\n(.*?)\r?\n---", text, re.S)
            if m:
                tm = re.search(r"(?m)^title:\s*(.+)$", m.group(1))
                if tm:
                    t = tm.group(1).strip().strip("'\"")
                    if t:
                        title = t
        self._title_cache[out_rel] = title
        return title

    def _asset_link(
        self,
        out_rel: str,
        note_out: str,
        alias: str | None,
        embed: bool,
        kind: str,
    ) -> str:
        text = alias or {
            "image": posixpath.basename(out_rel),
            "html": "打开交互图",
            "pdf": "打开 PDF",
            "canvas": "打开 Canvas",
        }.get(kind, posixpath.basename(out_rel))
        if kind == "image":
            return f"![[{out_rel}{'|' + alias if alias else ''}]]" if embed else f"[[{out_rel}{'|' + alias if alias else ''}]]"
        link = self.rel_link(out_rel, note_out)
        return f"[{text}]({link})"

    # -- secret redaction -------------------------------------------------

    def redact(self, text: str, src_rel: str) -> str:
        for pattern, label in SECRET_PATTERNS:
            def repl(m: re.Match, label=label):
                key = (src_rel, label)
                if key not in self._secret_seen:
                    self._secret_seen.add(key)
                    self.report["secrets"].append({"file": src_rel, "type": label})
                if label == "Bearer token":
                    return (m.group(1) or "Bearer ") + "***REDACTED***"
                if label == "key/password assignment":
                    return (m.group(1) or "") + "***REDACTED***"
                return "***REDACTED***"

            text = pattern.sub(repl, text)
        return text

    # -- dataview ---------------------------------------------------------

    def render_dataview(self, query: str, src_rel: str) -> str:
        lines = [ln.lstrip("> ").strip() for ln in query.splitlines()]
        q = "\n".join(lines)

        from_m = re.search(r"(?im)^\s*FROM\s+(.+)$", q)
        if not from_m:
            return "_（该 Dataview 查询暂不支持静态生成）_"
        from_expr = from_m.group(1)
        folders = re.findall(r'"([^"]+)"', from_expr)
        if not folders:
            return "_（该 Dataview 查询暂不支持静态生成）_"

        where_m = re.search(r'(?im)^\s*WHERE\s+file\.name\s*!=\s*"([^"]+)"', q)
        excluded_names = {where_m.group(1)} if where_m else set()

        limit_m = re.search(r"(?im)^\s*LIMIT\s+(\d+)", q)
        limit = int(limit_m.group(1)) if limit_m else None

        sort_created = "file.ctime" in q
        want_folder = "file.folder" in q
        is_list = bool(re.search(r"(?im)^\s*LIST\b", q))

        rows = []
        for rel in self.index.publishable:
            if not rel.endswith(".md"):
                continue
            if rel == src_rel:
                continue
            if not any(rel.startswith(f + "/") for f in folders):
                continue
            name = posixpath.splitext(posixpath.basename(rel))[0]
            if name in excluded_names:
                continue
            if name.endswith("-MOC"):
                continue
            p = VAULT / rel
            try:
                stat = p.stat()
            except OSError:
                continue
            rows.append((rel, stat.st_mtime, posixpath.dirname(rel)))

        rows.sort(key=lambda x: x[1], reverse=True)
        if limit:
            rows = rows[:limit]
        if not rows:
            return "_暂无笔记_"

        if is_list:
            return "\n".join(
                f"- [[{r[0][:-3]}|{self.note_title(r[0])}]]" for r in rows
            )

        if want_folder:
            out = ["| 笔记 | 所在目录 | 修改时间 |", "|---|---|---|"]
            for rel, mtime, folder in rows:
                out.append(f"| [[{rel[:-3]}\\|{self.note_title(rel)}]] | {folder} | {short_date(mtime)} |")
            return "\n".join(out)

        out = ["| 笔记 | 修改时间 |", "|---|---|"]
        for rel, mtime, _folder in rows:
            out.append(f"| [[{rel[:-3]}\\|{self.note_title(rel)}]] | {short_date(mtime)} |")
        return "\n".join(out)

    # -- markdown processing ---------------------------------------------

    def rewrite_wikilink(self, m: re.Match, src_rel: str, note_out: str) -> str:
        embed = m.group(1) == "!"
        inner = m.group(2)
        target, heading, alias = self.split_alias(inner)
        if not target or is_external(target):
            return m.group(0)

        ext = posixpath.splitext(target)[1].lower()
        if ext in IMAGE_EXTS:
            kind = "image"
            src, status = self.index.resolve_file(target, src_rel, IMAGE_EXTS)
        elif ext in {".pdf", ".html", ".htm"}:
            kind = "pdf" if ext == ".pdf" else "html"
            exts = {ext, ".html", ".htm"} if kind == "html" else {".pdf"}
            src, status = self.index.resolve_file(target, src_rel, exts)
        elif ext == ".canvas":
            kind = "canvas"
            src, status = self.index.resolve_file(target, src_rel, {".canvas"})
        else:
            # Note titles often contain dots (e.g. "LangChain1.0迁移总纲"),
            # so anything that isn't a known attachment extension is a note.
            kind = "md"
            src, status = self.index.resolve_md(target, src_rel)

        if kind == "md":
            if status == "ok" and src:
                return self._note_link(src, heading, alias)
            if status == "excluded":
                self.report["excluded_links"].append((src_rel, target))
            else:
                self.report["broken_links"].append((src_rel, target))
            return alias or target

        # attachments / images
        if status != "ok" or not src:
            self.report["broken_links"].append((src_rel, target))
            if embed and kind == "image":
                return "（图片未发布）"
            return alias or posixpath.basename(target)

        if kind == "image":
            out_rel = self.asset_map.get(src)
            if not out_rel:
                out_rel = self.copy_image(src)
            if not out_rel:
                return alias or posixpath.basename(target)
            return self._asset_link(out_rel, note_out, alias, embed, "image")

        if kind == "html":
            out_rel = self.asset_map.get(src) or self.copy_html(src)
            return self._asset_link(out_rel, note_out, alias, embed, "html")

        if kind == "pdf":
            out_rel = self.asset_map.get(src)
            if out_rel is None:
                out_rel = self.copy_pdf(src)
            if not out_rel:
                # 大 PDF 不进 Pages（单文件上限 25MB，且吃带宽）。
                # 若已通过 upload_pdfs.py 传到 R2，就用 R2 的公网链接；
                # 否则给出提示，引导读者去本地看。
                size_mb = (VAULT / src).stat().st_size / 1024 / 1024
                name = posixpath.basename(src)
                r2_url = self.pdf_manifest.get(name, "")
                if r2_url:
                    text = alias or f"打开 PDF（{size_mb:.0f} MB）"
                    return f"[{text}]({r2_url})"
                return (
                    f"> [!warning] PDF 暂未发布\n"
                    f"> 原文件 `{name}` 约 {size_mb:.1f} MB，超过发布阈值；可在本地 Obsidian 中查看。"
                )
            return self._asset_link(out_rel, note_out, alias, embed, "pdf")

        if kind == "canvas":
            out_rel = self.asset_map.get(src) or self.copy_canvas(src)
            return f"[{alias or '打开 Canvas'}]({self.rel_link(out_rel, note_out)})"

        # Other attachment types are not published.
        return alias or posixpath.basename(src)

    def rewrite_mdlink(self, m: re.Match, src_rel: str, note_out: str) -> str:
        embed = m.group(1) == "!"
        alt = m.group(2)
        url = m.group(3).strip("<>")
        title = m.group(4) or ""
        if url.lower().startswith("file:"):
            # Local absolute paths must never leak into the public site.
            return alt or "（本地文件）"
        if not url or is_external(url):
            return m.group(0)

        raw = unquote(url)
        anchor = ""
        if "#" in raw:
            raw, anchor = raw.split("#", 1)
            anchor = "#" + anchor
        if not raw:
            return m.group(0)

        ext = posixpath.splitext(raw)[1].lower()
        if ext in IMAGE_EXTS:
            src, status = self.index.resolve_file(raw, src_rel, IMAGE_EXTS)
            if status == "ok" and src:
                out_rel = self.asset_map.get(src) or self.copy_image(src)
                if out_rel:
                    return f"![{alt}]({self.rel_link(out_rel, note_out)}{anchor}{title})"
            return alt or posixpath.basename(raw)

        if ext in {".pdf", ".html", ".htm"}:
            exts = {ext, ".html", ".htm"} if ext in {".html", ".htm"} else {".pdf"}
            src, status = self.index.resolve_file(raw, src_rel, exts)
            if status == "ok" and src:
                out_rel = self.asset_map.get(src)
                if out_rel is None:
                    out_rel = self.copy_pdf(src) if ext == ".pdf" else self.copy_html(src)
                if out_rel:
                    return f"[{alt or posixpath.basename(out_rel)}]({self.rel_link(out_rel, note_out)}{anchor})"
            return alt or posixpath.basename(raw)

        if ext == ".canvas":
            src, status = self.index.resolve_file(raw, src_rel, {".canvas"})
            if status == "ok" and src:
                out_rel = self.asset_map.get(src) or self.copy_canvas(src)
                return f"[{alt or '打开 Canvas'}]({self.rel_link(out_rel, note_out)}{anchor})"
            return alt or posixpath.basename(raw)

        # Internal markdown note link -> wikilink
        src, status = self.index.resolve_md(raw, src_rel)
        if status == "ok" and src:
            return self._note_link(src, anchor.lstrip("#"), alt)
        if status == "excluded":
            self.report["excluded_links"].append((src_rel, raw))
        else:
            self.report["broken_links"].append((src_rel, raw))
        return alt or posixpath.basename(raw)

    @staticmethod
    def fix_broken_fences(text: str) -> str:
        """Move a fence that was written at the end of a text line onto its own line.

        Obsidian tolerates `**Note:**```python`, but CommonMark does not treat it
        as a fence, so the code block leaks into the page as prose.
        """
        out = []
        for line in text.split("\n"):
            m = re.match(r"^(\s*)(.*\S)(\s*)(`{3,}[A-Za-z0-9_+-]*)\s*$", line)
            if m and m.group(2) and not m.group(2).endswith("`"):
                out.append(m.group(1) + m.group(2))
                out.append(m.group(3) + m.group(4))
            else:
                out.append(line)
        return "\n".join(out)

    @staticmethod
    def escape_numeric_hashes(text: str) -> str:
        """Escape `#1234` issue numbers so they don't render as tags.

        Obsidian refuses purely numeric tags, Quartz does not, so `issue #3511`
        would turn into a tag chip on the site.
        """
        return re.sub(r"(?<![\w&/#])#(\d{1,6})(?![\w])", r"\\#\1", text)

    def rewrite_links(self, text: str, src_rel: str, note_out: str) -> str:
        parts = CODE_SPLIT_RE.split(text)
        for i, part in enumerate(parts):
            if i % 2 == 1:  # code fence or inline code
                continue
            # Markdown links first: wikilink rewriting emits markdown links for
            # attachments, which must not be treated as source links.
            part = MDLINK_RE.sub(lambda m: self.rewrite_mdlink(m, src_rel, note_out), part)
            part = WIKILINK_RE.sub(lambda m: self.rewrite_wikilink(m, src_rel, note_out), part)
            part = self.escape_numeric_hashes(part)
            part = self.fix_table_pipes(part)
            parts[i] = part
        return "".join(parts)

    # -- frontmatter ------------------------------------------------------

    @staticmethod
    def split_frontmatter(text: str):
        m = re.match(r"^---\r?\n(.*?)\r?\n---\r?\n?", text, re.S)
        if m:
            return m.group(1), text[m.end():]
        return None, text

    def process_frontmatter(self, raw: str | None, src_rel: str, is_index: bool) -> str:
        data: dict = {}
        if raw:
            try:
                loaded = yaml.safe_load(raw)
                if isinstance(loaded, dict):
                    data = loaded
            except yaml.YAMLError as exc:
                self.report["warnings"].append(f"Frontmatter 解析失败，保留原文：{src_rel} ({exc})")

        # Drop null values: the date plugin treats a null `published` as an
        # invalid date. Also flatten wikilinks that live in metadata values.
        def clean_value(value):
            if isinstance(value, str):
                value = re.sub(r"\[\[([^\]|]+)\|([^\]]+)\]\]", r"\2", value)
                value = re.sub(r"\[\[([^\]]+)\]\]", r"\1", value)
                return value
            if isinstance(value, list):
                return [clean_value(v) for v in value]
            if isinstance(value, dict):
                return {k: clean_value(v) for k, v in value.items()}
            return value

        data = {k: clean_value(v) for k, v in data.items() if v is not None}

        for key in ("banner", "cssclasses"):
            data.pop(key, None)

        mtime = (VAULT / src_rel).stat().st_mtime
        data.setdefault("created", safe_date(mtime))
        data.setdefault("modified", safe_date(mtime))

        if is_index:
            data["title"] = "首页"
            data["tags"] = ["首页", "导航"]

        dumped = yaml.safe_dump(
            data, allow_unicode=True, sort_keys=False, default_flow_style=False
        ).strip()
        return f"---\n{dumped}\n---\n\n"

    # -- md pipeline ------------------------------------------------------

    def process_md(self, src_rel: str, out_rel: str, is_index: bool = False) -> None:
        text = (VAULT / src_rel).read_text(encoding="utf-8", errors="replace")
        raw_fm, body = self.split_frontmatter(text)

        # Dataview is rendered after link rewriting; the generated links are
        # already canonical and must not be rewritten again (table pipes!).
        dv_blocks: list[str] = []

        def dv_placeholder(m: re.Match) -> str:
            self.report["dataview"] += 1
            dv_blocks.append(self.render_dataview(m.group(1), src_rel))
            return f"\x00DATAVIEW_{len(dv_blocks) - 1}\x00"

        body = DATAVIEW_RE.sub(dv_placeholder, body)

        if is_index:
            # Remove private/workspace-only rows and the 00_系统 shortcut block.
            body = re.sub(r"(?m)^\|.*private.*\|\s*$\n?", "", body)
            body = re.sub(r"(?m)^>\s*(?:🌌|⚡|🎨|🌊|🧭).*\n?", "", body)
            body = re.sub(r"(?m)^>\s*$\n?", "", body)
            body = re.sub(r"(?m)^-\s*`private/`.*\n?", "", body)
            # Internal workspace docs are not published; drop their bullet too.
            body = re.sub(r"(?m)^-\s*`00_系统/`.*\n?", "", body)
            body = body.lstrip("\n")
            # 站点来源说明已移到页尾，见 quartz.config.yaml 的 footer.options.message

        body = self.fix_broken_fences(body)
        body = self.rewrite_links(body, src_rel, out_rel)
        body = self.redact(body, src_rel)
        for idx, rendered in enumerate(dv_blocks):
            body = body.replace(f"\x00DATAVIEW_{idx}\x00", rendered)

        fm = self.process_frontmatter(raw_fm, src_rel, is_index)
        self.write_text(out_rel, fm + body.lstrip("\n"))
        self.report["notes"] += 1

    # -- main -------------------------------------------------------------

    def run(self):
        if not VAULT.exists():
            raise SystemExit(f"Vault not found: {VAULT}")
        if not self.dry_run:
            if CONTENT.exists():
                shutil.rmtree(CONTENT)
            CONTENT.mkdir(parents=True, exist_ok=True)

        # 1) Copy all images inside allow-listed folders.
        for d in INCLUDE_DIRS:
            root = VAULT / d
            if not root.exists():
                self.report["warnings"].append(f"目录不存在：{d}")
                continue
            for dp, dn, fn in os.walk(root):
                dn[:] = [x for x in dn if x not in {".obsidian", ".git", ".claude", ".claudian"}]
                for f in fn:
                    p = Path(dp) / f
                    if p.suffix.lower() in IMAGE_EXTS:
                        self.copy_image(rel_to_vault(p))

        # 2) Copy images/ (shared image folder).
        images_root = VAULT / "images"
        if images_root.exists():
            for dp, dn, fn in os.walk(images_root):
                for f in fn:
                    p = Path(dp) / f
                    if p.suffix.lower() in IMAGE_EXTS:
                        self.copy_image(rel_to_vault(p))

        # 3) Copy canvases inside allow-listed folders.
        for d in INCLUDE_DIRS:
            root = VAULT / d
            if not root.exists():
                continue
            for p in root.rglob("*.canvas"):
                self.copy_canvas(rel_to_vault(p))

        # 4) Pre-copy referenced HTML / PDF / outside images.
        for rel in sorted(self.index.publishable):
            if not rel.endswith(".md"):
                continue
            text = (VAULT / rel).read_text(encoding="utf-8", errors="replace")
            for m in WIKILINK_RE.finditer(text):
                target, _h, _a = self.split_alias(m.group(2))
                if not target or is_external(target):
                    continue
                ext = posixpath.splitext(target)[1].lower()
                if ext in {".html", ".htm", ".pdf", ".canvas"}:
                    exts = {ext, ".html", ".htm"} if ext in {".html", ".htm"} else {ext}
                    src, status = self.index.resolve_file(target, rel, exts)
                    if status == "ok" and src:
                        if ext in {".html", ".htm"}:
                            self.copy_html(src)
                        elif ext == ".pdf":
                            self.copy_pdf(src)
                        elif ext == ".canvas":
                            self.copy_canvas(src)
                elif ext in IMAGE_EXTS and rel not in self.asset_map:
                    src, status = self.index.resolve_file(target, rel, IMAGE_EXTS)
                    if status == "ok" and src and src not in self.asset_map:
                        self.copy_image(src)
            for m in MDLINK_RE.finditer(text):
                raw = unquote(m.group(3).strip("<>"))
                if not raw or is_external(raw):
                    continue
                raw = raw.split("#", 1)[0]
                ext = posixpath.splitext(raw)[1].lower()
                if ext in IMAGE_EXTS:
                    src, status = self.index.resolve_file(raw, rel, IMAGE_EXTS)
                    if status == "ok" and src and src not in self.asset_map:
                        self.copy_image(src)
                elif ext in {".html", ".htm", ".pdf"}:
                    src, status = self.index.resolve_file(raw, rel, {ext})
                    if status == "ok" and src:
                        if ext == ".pdf":
                            self.copy_pdf(src)
                        else:
                            self.copy_html(src)

        # 5) Process markdown.
        for rel in sorted(self.index.publishable):
            if not rel.endswith(".md"):
                continue
            is_index = rel in INCLUDE_ROOT_FILES
            out_rel = "index.md" if is_index else rel
            self.process_md(rel, out_rel, is_index)

        # 6) Report.
        self.print_report()
        if not self.dry_run:
            report_path = SITE / "scripts" / "last-sync.json"
            report_path.write_text(json.dumps(self.report, ensure_ascii=False, indent=2), encoding="utf-8")

    def print_report(self):
        r = self.report
        before = r["image_bytes_before"] / 1024 / 1024
        after = r["image_bytes_after"] / 1024 / 1024
        print("\n=== Sync report ===")
        print(f"笔记: {r['notes']}  图片: {r['images']} (转 WebP: {r['images_converted']})")
        print(f"图片体积: {before:.1f} MB -> {after:.1f} MB")
        print(f"HTML: {r['html']}  PDF: {r['pdf']}  Canvas: {r['canvas']}  Dataview: {r['dataview']}")
        if r["pdf_skipped"]:
            print(f"未发布的大 PDF ({len(r['pdf_skipped'])}):")
            for name, size in r["pdf_skipped"]:
                print(f"  - {size} MB  {name}")
        if r["broken_links"]:
            print(f"失效链接: {len(r['broken_links'])}（前 20）")
            for src, target in r["broken_links"][:20]:
                print(f"  - {src} -> {target}")
        if r["excluded_links"]:
            print(f"指向未发布目录的链接: {len(r['excluded_links'])}（已转为纯文本，前 10）")
            for src, target in r["excluded_links"][:10]:
                print(f"  - {src} -> {target}")
        if r["secrets"]:
            print(f"已打码的敏感信息: {len(r['secrets'])}")
            for s in r["secrets"]:
                print(f"  - [{s['type']}] {s['file']}")
        if r["warnings"]:
            print(f"警告: {len(r['warnings'])}")
            for w in r["warnings"][:20]:
                print(f"  - {w}")
        print("====================\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    Sync(dry_run=args.dry_run).run()


if __name__ == "__main__":
    main()
