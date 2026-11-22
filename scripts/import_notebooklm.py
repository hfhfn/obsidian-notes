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


def write_note(nb, got):
    """给导出了产物的笔记本生成 md 笔记。"""
    title = nb["title"]
    slug = safe_name(title)
    md_path = MODULE_DIR / f"{slug}.md"

    if md_path.exists():
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

    for k, v in got.items():
        if v.get("remote"):
            url = r2map.get(f"{slug}/{k}", "")
            if url:
                lines.append(f"- **{names.get(k, k)}**：[下载 PDF]({url})")
            else:
                lines.append(f"- **{names.get(k, k)}**：（待上传 R2）")
        else:
            lines.append(f"- **{names.get(k, k)}**：`_assets/{slug}/{Path(v['path']).name}`")

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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("action", choices=["list", "probe", "export", "export-all", "upload-r2"])
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


if __name__ == "__main__":
    main()
