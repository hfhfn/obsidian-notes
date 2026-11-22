#!/usr/bin/env python3
"""NotebookLM 批量导入

把 NotebookLM（Gemini Notebook）笔记本的产物导出到站点的「视频与专题」模块。

支持产物：mind-map(JSON) / infographic(PNG) / slide-deck(PDF) / report(MD) / audio(MP3)

用法：
    python scripts/import_notebooklm.py list                 # 列出所有笔记本
    python scripts/import_notebooklm.py probe <nb_id>        # 探测某本有哪些产物
    python scripts/import_notebooklm.py export <nb_id>       # 导出单本
    python scripts/import_notebooklm.py export-all           # 导出全部（慢）
    python scripts/import_notebooklm.py build-index          # 生成索引 md

认证：先用 `notebooklm login` 登录，凭据在 ~/.notebooklm/profiles/default/
"""
import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent
MODULE_DIR = SITE / "modules" / "视频与专题"
ASSET_DIR = MODULE_DIR / "_assets"
CAND_DIR = SITE / "scripts" / "candidates"

# uv tool 装出来的隔离环境
NLM_PY = Path.home() / "AppData" / "Roaming" / "uv" / "tools" / "notebooklm-py" / "Scripts" / "python.exe"

# 小产物：直接放仓库（脑图 JSON 几 KB、信息图几 MB）
LOCAL_ARTIFACTS = {
    "mind-map": ("mind-map", ".json"),
    "infographic": ("infographic", ".png"),
    "report": ("report", ".md"),
}

# 大产物：导出到临时目录，再传 R2（PPT 单本 14-19MB，47 本约 900MB，
# 放 git 仓库和 Pages 都不可行）
REMOTE_ARTIFACTS = {
    "slide-deck": ("slide-deck", ".pdf"),
}


def run_nlm(args, timeout=300):
    """调用 notebooklm CLI。

    必须清掉 PYTHONPATH：Hermes 的 venv 会污染 uv 隔离环境，
    导致 greenlet 从错误位置导入（ModuleNotFoundError: greenlet._greenlet）。
    """
    env = {k: v for k, v in os.environ.items() if k not in ("PYTHONPATH", "PYTHONHOME")}
    code = f"""
import sys
from notebooklm.notebooklm_cli import main
sys.argv = {json.dumps(['notebooklm'] + args)}
try:
    main()
except SystemExit as e:
    raise SystemExit(e.code or 0)
"""
    r = subprocess.run(
        [str(NLM_PY), "-c", code],
        capture_output=True,
        text=True,
        env=env,
        timeout=timeout,
        encoding="utf-8",
        errors="replace",
    )
    return r.stdout + r.stderr


def list_notebooks():
    out = run_nlm(["list", "--json"])
    # CLI 的 --json 输出可能混有进度信息，取最后一个 JSON 对象
    m = re.search(r"\{[\s\S]*\}\s*$", out)
    if not m:
        print("解析失败，原始输出：", out[:500])
        return []
    d = json.loads(m.group(0))
    return d.get("notebooks", [])


def use_notebook(nb_id):
    out = run_nlm(["use", nb_id])
    return "Matched" in out or "Notebook ID" in out


def compress_png(path, quality=82, max_width=1600):
    """把信息图 PNG 转成 WebP。

    NotebookLM 导出的信息图是 1536×2752 的 PNG，单张 4-6MB，
    39 本合计 150MB+，进 git 仓库不可接受。
    转 WebP q82 后通常降到 0.3-0.6MB（省 90%+），肉眼看不出差别。
    """
    try:
        from PIL import Image
    except ImportError:
        return path, 0

    src_size = path.stat().st_size
    im = Image.open(path).convert("RGB")

    w, h = im.size
    if w > max_width:
        im = im.resize((max_width, int(h * max_width / w)), Image.LANCZOS)

    out = path.with_suffix(".webp")
    im.save(out, "WEBP", quality=quality, method=6)

    if out.stat().st_size < src_size:
        path.unlink()
        return out, src_size - out.stat().st_size
    out.unlink()
    return path, 0


def safe_name(s, maxlen=60):
    s = re.sub(r'[<>:"/\\|?*\n\r\t]', "_", s).strip()
    s = re.sub(r"\s+", " ", s)
    return s[:maxlen] or "untitled"


def probe(nb_id):
    """探测某本笔记本有哪些产物可导出。"""
    use_notebook(nb_id)
    found = {}
    for key in ARTIFACTS:
        out = run_nlm(["download", key, os.devnull], timeout=120)
        # CLI 在没产物时说 "No completed xxx artifacts found"
        if "No completed" in out or "not found" in out.lower():
            found[key] = False
        elif "saved to" in out.lower() or "Artifact:" in out:
            found[key] = True
        else:
            found[key] = None  # 不确定
    return found


def export_one(nb_id, title):
    """导出单本笔记本的产物。

    小产物（脑图/信息图/报告）→ _assets/<title>/
    大产物（PPT）→ scripts/candidates/nlm_remote/，稍后传 R2
    """
    use_notebook(nb_id)

    out_dir = ASSET_DIR / safe_name(title)
    out_dir.mkdir(parents=True, exist_ok=True)

    remote_dir = CAND_DIR / "nlm_remote" / safe_name(title)
    remote_dir.mkdir(parents=True, exist_ok=True)

    got = {}

    for key, (cmd, ext) in LOCAL_ARTIFACTS.items():
        target = out_dir / f"{key}{ext}"
        run_nlm(["download", cmd, str(target)], timeout=300)
        if target.exists() and target.stat().st_size > 100:
            # 信息图转 WebP：PNG 单张 4-6MB，压完 0.3-0.6MB
            if key == "infographic":
                target, saved = compress_png(target)
                if saved:
                    print(f"    压缩省 {saved // 1024} KB")
            got[key] = {
                "path": str(target.relative_to(MODULE_DIR)),
                "size": target.stat().st_size,
            }
        elif target.exists():
            target.unlink()

    for key, (cmd, ext) in REMOTE_ARTIFACTS.items():
        target = remote_dir / f"{key}{ext}"
        run_nlm(["download", cmd, str(target)], timeout=300)
        if target.exists() and target.stat().st_size > 100:
            got[key] = {
                "remote": True,
                "path": str(target),
                "size": target.stat().st_size,
            }
        elif target.exists():
            target.unlink()

    return got


def render_mindmap(json_path):
    """把 NotebookLM 的脑图 JSON 渲染成可折叠的 <details> 嵌套树。

    数据结构是 {name, children: [{name, children: [...]}]}。
    用 <details>/<summary> 而不是自己写 JS：原生可折叠、无依赖、
    打印和搜索都能用。默认展开两层，避免 39 个专题全展开太长。
    """
    try:
        data = json.loads(Path(json_path).read_text(encoding="utf-8"))
    except Exception:
        return ""

    def esc_html(s):
        return (
            str(s)
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
        )

    def walk(node, depth):
        name = esc_html(node.get("name", ""))
        kids = node.get("children") or []
        if not kids:
            return f'<li class="mm-leaf">{name}</li>'
        # 前两层展开，更深默认折叠
        open_attr = " open" if depth < 2 else ""
        inner = "".join(walk(c, depth + 1) for c in kids)
        return (
            f'<li><details{open_attr}><summary>{name}</summary>'
            f'<ul class="mm-list">{inner}</ul></details></li>'
        )

    root_name = esc_html(data.get("name", "思维导图"))
    kids = data.get("children") or []
    if not kids:
        return f'<div class="mm-root">{root_name}</div>'

    inner = "".join(walk(c, 0) for c in kids)
    return (
        f'<div class="mm-wrap"><div class="mm-root">{root_name}</div>'
        f'<ul class="mm-list mm-top">{inner}</ul></div>'
    )


def write_note(nb, got, force=False):
    """给导出了产物的笔记本生成 md 笔记。"""
    title = nb["title"]
    slug = safe_name(title)
    md_path = MODULE_DIR / f"{slug}.md"

    if md_path.exists() and not force:
        return None  # 已存在不覆盖

    derived = [k for k in got if k in ("mind-map", "slide-deck", "infographic")]

    lines = [
        "---",
        f'title: "{title}"',
        "tags:",
        "  - video",
        "  - notebooklm",
        f'notebook_id: "{nb["id"]}"',
        "derived:",
    ]
    for d in derived:
        lines.append(f"  - {d}")
    lines += [
        'platform: "notebooklm"',
        f'created: "{nb.get("created_at", "")[:10]}"',
        "---",
        "",
        f"# {title}",
        "",
        "> 由 NotebookLM 笔记本导出的产物集合。",
        "",
        "## 产物",
        "",
    ]

    names = {
        "mind-map": "思维导图",
        "slide-deck": "演示文稿",
        "infographic": "信息图",
        "report": "报告",
    }
    # R2 清单：PPT 上传后的 URL 映射
    r2_manifest = CAND_DIR / "nlm_r2_manifest.json"
    r2map = {}
    if r2_manifest.exists():
        try:
            r2map = json.loads(r2_manifest.read_text(encoding="utf-8"))
        except Exception:
            r2map = {}

    # 产物全部做成「在线查看」，而不是下载：
    #   信息图   → <img> 直接看，外面套 <a> 可点开原图
    #   演示文稿 → <iframe> 内嵌浏览器 PDF 阅读器
    #   思维导图 → 把 JSON 树渲染成可折叠的 <details> 嵌套
    #   报告     → 直接内联正文
    for k, v in got.items():
        label = names.get(k, k)

        if k == "infographic":
            fname = Path(v["path"]).name
            rel = f"_assets/{slug}/{fname}"
            lines += [
                f"### {label}",
                "",
                f'<a href="{rel}" target="_blank" rel="noopener">',
                f'  <img src="{rel}" alt="{label}" class="nlm-infographic" loading="lazy">',
                "</a>",
                "",
                "<sub>点图看原图</sub>",
                "",
            ]

        elif k == "slide-deck":
            url = r2map.get(f"{slug}/{k}", "")
            lines += [f"### {label}", ""]
            if url:
                lines += [
                    f'<iframe src="{url}#view=FitH" class="nlm-slides" '
                    f'title="{label}" loading="lazy"></iframe>',
                    "",
                    f"<sub>[全屏打开]({url})</sub>",
                    "",
                ]
            else:
                lines += ["（待上传 R2）", ""]

        elif k == "mind-map":
            tree = render_mindmap(v["path"])
            lines += [
                f"### {label}",
                "",
                tree if tree else "（思维导图解析失败）",
                "",
            ]

        elif k == "report":
            fname = Path(v["path"]).name
            body = ""
            try:
                body = (ASSET_DIR / slug / fname).read_text(encoding="utf-8", errors="replace")
            except Exception:
                pass
            lines += [f"### {label}", ""]
            if body:
                lines += [body.strip(), ""]
            else:
                lines += [f"`_assets/{slug}/{fname}`", ""]

        else:
            fname = Path(v["path"]).name
            lines.append(f"- **{label}**：`_assets/{slug}/{fname}`")

    lines += [
        "",
        "## 摘要",
        "",
        "（在 NotebookLM 里点「摘要」复制正文粘到这里）",
        "",
    ]

    md_path.write_text("\n".join(lines), encoding="utf-8", newline="\n")
    return md_path


def cmd_list():
    nbs = list_notebooks()
    print(f"共 {len(nbs)} 个笔记本\n")
    for i, n in enumerate(nbs, 1):
        print(f"{i:3}. {n['id'][:8]}  {n['title']}")


def cmd_probe(nb_id):
    nbs = list_notebooks()
    nb = next((n for n in nbs if n["id"].startswith(nb_id)), None)
    if not nb:
        print("找不到该笔记本")
        return
    print(f"探测：{nb['title']}")
    found = probe(nb["id"])
    for k, v in found.items():
        mark = "✓" if v else ("?" if v is None else "✗")
        print(f"  {mark} {k}")


def cmd_export(nb_id):
    nbs = list_notebooks()
    nb = next((n for n in nbs if n["id"].startswith(nb_id)), None)
    if not nb:
        print("找不到该笔记本")
        return

    print(f"导出：{nb['title']}")
    got = export_one(nb["id"], nb["title"])
    if not got:
        print("  无产物")
        return
    for k, v in got.items():
        print(f"  ✓ {k}  {v['size'] // 1024} KB")
    md = write_note(nb, got)
    if md:
        print(f"  → 笔记 {md.name}")


def cmd_export_all(limit=None):
    nbs = list_notebooks()
    if limit:
        nbs = nbs[:limit]
    print(f"准备导出 {len(nbs)} 个笔记本\n")

    summary = []
    for i, nb in enumerate(nbs, 1):
        print(f"[{i}/{len(nbs)}] {nb['title'][:40]}")
        try:
            got = export_one(nb["id"], nb["title"])
        except Exception as e:
            print(f"  失败：{e}")
            summary.append({"title": nb["title"], "ok": False, "error": str(e)})
            continue

        if got:
            for k, v in got.items():
                print(f"    ✓ {k}  {v['size'] // 1024} KB")
            md = write_note(nb, got)
            summary.append(
                {
                    "title": nb["title"],
                    "id": nb["id"],
                    "artifacts": list(got.keys()),
                    "note": md.name if md else None,
                }
            )
        else:
            print("    无产物")
            summary.append({"title": nb["title"], "id": nb["id"], "artifacts": []})

    CAND_DIR.mkdir(parents=True, exist_ok=True)
    (CAND_DIR / "nlm_export_summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    ok = sum(1 for s in summary if s.get("artifacts"))
    print(f"\n完成：{ok}/{len(summary)} 个笔记本有产物")


def load_r2_env():
    """从 .env 读 R2 凭据（和 upload_pdfs.py 共用）。"""
    env_path = SITE / ".env"
    env = {}
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def cmd_upload_r2():
    """把 scripts/candidates/nlm_remote/ 下的 PPT 传到 R2，生成 URL 清单。"""
    remote_root = CAND_DIR / "nlm_remote"
    if not remote_root.is_dir():
        print("没有待上传的 PPT（scripts/candidates/nlm_remote/ 不存在）")
        return

    env = load_r2_env()
    need = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_BASE"]
    missing = [k for k in need if not env.get(k)]
    if missing:
        print(f"缺少 R2 环境变量：{', '.join(missing)}")
        return

    try:
        import boto3
        from botocore.config import Config
    except ImportError:
        print("缺少 boto3，请先 pip install boto3")
        return

    import urllib.parse

    endpoint = f"https://{env['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com"
    client = boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=env["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=env["R2_SECRET_ACCESS_KEY"],
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )

    base = env["R2_PUBLIC_BASE"].rstrip("/")
    manifest_path = CAND_DIR / "nlm_r2_manifest.json"
    manifest = {}
    if manifest_path.exists():
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except Exception:
            manifest = {}

    files = [p for p in remote_root.rglob("*") if p.is_file()]
    print(f"待上传 {len(files)} 个文件")
    ok = 0
    for f in files:
        rel = f.relative_to(remote_root).as_posix()
        # 对象键：notebooklm/<笔记本名>/<文件名>
        key = f"notebooklm/{rel}"
        size_mb = f.stat().st_size / 1048576
        try:
            client.upload_file(
                str(f), env["R2_BUCKET"], key,
                ExtraArgs={"ContentType": "application/pdf"},
            )
            # URL 必须百分号编码（中文/空格/括号），R2 公开域不自动解码
            enc = urllib.parse.quote(key, safe="/")
            # manifest 键用 "<笔记本名>/<产物名>"，和 write_note 对应
            parts = rel.split("/")
            if len(parts) >= 2:
                nb_slug = parts[0]
                art_key = Path(parts[-1]).stem
                manifest[f"{nb_slug}/{art_key}"] = f"{base}/{enc}"
            print(f"  ✅ {size_mb:>5.1f}MB  {key}")
            ok += 1
        except Exception as e:
            print(f"  ❌ {key}: {e}")

    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n完成 {ok}/{len(files)}，清单 → {manifest_path}")


def cmd_compress():
    """把已导出的 PNG 信息图批量转 WebP（对旧数据用）。"""
    pngs = list(ASSET_DIR.rglob("infographic.png"))
    if not pngs:
        print("没有待压缩的 PNG")
        return
    total_saved = 0
    for png in pngs:
        out, saved = compress_png(png)
        if saved:
            total_saved += saved
            print(f"  {png.parent.name[:40]:42} 省 {saved // 1024:>5} KB")
    print(f"\n共省 {total_saved / 1048576:.1f} MB")


def cmd_refresh_notes():
    """按已导出的产物 + R2 清单重建所有笔记。

    必须在 upload-r2 之后跑：PPT 的链接来自 nlm_r2_manifest.json，
    导出时那个文件还没生成，笔记里只能写「待上传 R2」。
    """
    nbs = {n["id"]: n for n in list_notebooks()}
    summary_path = CAND_DIR / "nlm_export_summary.json"
    if not summary_path.exists():
        print("缺少 nlm_export_summary.json，先跑 export-all")
        return
    summary = json.loads(summary_path.read_text(encoding="utf-8"))

    n = 0
    for s in summary:
        if not s.get("artifacts"):
            continue
        # summary 里的 id 可能被截断（表格宽度），用前缀匹配
        sid = s.get("id") or ""
        nb = nbs.get(sid) or next(
            (n for n in nbs.values() if sid and n["id"].startswith(sid)), None
        )
        if not nb:
            continue
        slug = safe_name(nb["title"])

        # 重建 got：本地文件按实际存在判断，远程按清单
        got = {}
        local_dir = ASSET_DIR / slug
        for key, ext in (("mind-map", ".json"), ("infographic", ".webp"), ("report", ".md")):
            f = local_dir / f"{key}{ext}"
            if not f.exists() and ext == ".webp":
                f = local_dir / f"{key}.png"  # 兼容未压缩的旧数据
            if f.exists():
                got[key] = {"path": str(f.relative_to(MODULE_DIR)), "size": f.stat().st_size}
        if "slide-deck" in s["artifacts"]:
            got["slide-deck"] = {"remote": True, "path": "", "size": 0}

        if write_note(nb, got, force=True):
            n += 1
    print(f"重建 {n} 篇笔记")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "action",
        choices=["list", "probe", "export", "export-all", "upload-r2", "refresh-notes", "compress"],
    )
    ap.add_argument("target", nargs="?", help="笔记本 ID（可只写前 8 位）")
    ap.add_argument("--limit", type=int, default=None)
    args = ap.parse_args()

    if not NLM_PY.exists():
        print(f"找不到 notebooklm 环境：{NLM_PY}")
        sys.exit(1)

    if args.action == "list":
        cmd_list()
    elif args.action == "probe":
        cmd_probe(args.target)
    elif args.action == "export":
        cmd_export(args.target)
    elif args.action == "export-all":
        cmd_export_all(args.limit)
    elif args.action == "upload-r2":
        cmd_upload_r2()
    elif args.action == "refresh-notes":
        cmd_refresh_notes()
    elif args.action == "compress":
        cmd_compress()


if __name__ == "__main__":
    main()
