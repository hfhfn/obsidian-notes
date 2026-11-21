#!/usr/bin/env python3
"""把大 PDF 上传到 Cloudflare R2，并生成站内链接映射。

为什么用 R2 而不是直接塞进 Pages：
  Cloudflare Pages 单文件上限 25MB，且带宽计入 Pages 的 100GB/月。
  当前 vault 里有 16 个 >5MB 的 PDF，合计 300MB，最大的 77MB，
  直接发布既超限又吃带宽。R2 有 10GB 免费存储、无出站流量费。

前置准备（一次性，在 Cloudflare 面板做）：
  1. R2 → 开通（需绑支付方式，免费额度内不扣费）
  2. 创建桶，例如 `hfhfn-pdf`
  3. 桶设置 → 公开访问 → 绑定自定义域，例如 `pdf.hfhfn.dpdns.org`
  4. My Profile → API Tokens → 创建 Token，权限选
     `Account > Workers R2 Storage > Edit`
  5. 把凭据写进环境变量（或 .env）：
       R2_ACCOUNT_ID=...
       R2_ACCESS_KEY_ID=...
       R2_SECRET_ACCESS_KEY=...
       R2_BUCKET=hfhfn-pdf
       R2_PUBLIC_BASE=https://pdf.hfhfn.dpdns.org

用法：
    python scripts/upload_pdfs.py --dry-run   # 只看会传哪些
    python scripts/upload_pdfs.py             # 实际上传
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from pathlib import Path

VAULT = Path(r"D:\private\obsidian")
SITE = Path(__file__).resolve().parent.parent
PDF_DIR = VAULT / "00_附件" / "PDF"
MANIFEST = SITE / "scripts" / "pdf_manifest.json"

MIN_SIZE_MB = 5.0


def load_env() -> dict:
    """从环境变量或 .env 读取 R2 凭据。"""
    env = {}
    keys = [
        "R2_ACCOUNT_ID",
        "R2_ACCESS_KEY_ID",
        "R2_SECRET_ACCESS_KEY",
        "R2_BUCKET",
        "R2_PUBLIC_BASE",
    ]
    # 先读 .env
    env_file = SITE / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            env[k.strip()] = v.strip().strip("'\"")
    # 环境变量优先
    for k in keys:
        if os.environ.get(k):
            env[k] = os.environ[k]
    return env


def collect_pdfs() -> list[dict]:
    if not PDF_DIR.exists():
        print(f"[pdf] 目录不存在: {PDF_DIR}")
        return []
    out = []
    for p in sorted(PDF_DIR.rglob("*.pdf")):
        size_mb = p.stat().st_size / 1024 / 1024
        if size_mb < MIN_SIZE_MB:
            continue
        # 对象键用相对路径，保留目录结构便于排查
        rel = p.relative_to(PDF_DIR).as_posix()
        out.append(
            {
                "file": str(p),
                "key": rel,
                "name": p.name,
                "size_mb": round(size_mb, 1),
                "sha256": hashlib.sha256(p.read_bytes()).hexdigest()[:16],
            }
        )
    return out


def upload_one(pdf: dict, env: dict, dry_run: bool) -> bool:
    """用 S3 兼容 API 上传单个文件。"""
    if dry_run:
        print(f"  [dry] {pdf['size_mb']:>5.1f}MB  {pdf['key']}")
        return True

    try:
        import boto3
        from botocore.config import Config
    except ImportError:
        print("[pdf] 缺少 boto3，请先 pip install boto3")
        return False

    endpoint = f"https://{env['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com"
    client = boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=env["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=env["R2_SECRET_ACCESS_KEY"],
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )

    try:
        client.upload_file(
            pdf["file"],
            env["R2_BUCKET"],
            pdf["key"],
            ExtraArgs={"ContentType": "application/pdf"},
        )
        print(f"  ✅ {pdf['size_mb']:>5.1f}MB  {pdf['key']}")
        return True
    except Exception as e:
        print(f"  ❌ {pdf['key']}: {e}")
        return False


def write_manifest(pdfs: list[dict], env: dict) -> None:
    """生成 key → 公开 URL 的映射，供 sync_content.py 替换链接。"""
    base = env.get("R2_PUBLIC_BASE", "").rstrip("/")
    manifest = {
        pdf["name"]: f"{base}/{pdf['key']}" if base else ""
        for pdf in pdfs
    }
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"[pdf] 已写入 {MANIFEST}（{len(manifest)} 条）")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    pdfs = collect_pdfs()
    total = sum(p["size_mb"] for p in pdfs)
    print(f"[pdf] 找到 {len(pdfs)} 个 >{MIN_SIZE_MB}MB 的 PDF，合计 {total:.0f}MB")

    if not pdfs:
        return 0

    env = load_env()
    missing = [
        k
        for k in ("R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET")
        if not env.get(k)
    ]

    if missing and not args.dry_run:
        print(f"\n[pdf] 缺少凭据: {', '.join(missing)}")
        print("[pdf] 请按脚本顶部注释在 Cloudflare 面板创建 R2 桶和 Token，")
        print("[pdf] 然后把凭据写进 obsidian-site/.env 后重跑。")
        print("\n[pdf] 先看会传哪些文件：")
        for p in pdfs:
            print(f"  {p['size_mb']:>5.1f}MB  {p['key']}")
        return 1

    ok = 0
    for p in pdfs:
        if upload_one(p, env, args.dry_run):
            ok += 1

    if not args.dry_run:
        write_manifest(pdfs, env)
    print(f"\n[pdf] 完成 {ok}/{len(pdfs)}")
    return 0 if ok == len(pdfs) else 1


if __name__ == "__main__":
    raise SystemExit(main())
