#!/usr/bin/env python3
"""创建/重置一个用户名密码账号。

为什么需要这个脚本：
  站点默认只有「邮箱验证码 + Google/GitHub OAuth」，测试时要收邮件或走
  第三方授权，很麻烦。这个脚本直接往 credentials 表写一条密码记录，
  之后就能用 /login 页的密码表单登录。

PBKDF2 参数必须和 functions/api/_password.js 完全一致，否则校验不通过：
  pbkdf2$<iterations>$<salt_b64>$<hash_b64>
  iterations = 210000, SHA-256, 32 字节输出

用法：
  python scripts/create_account.py --email test@example.com --password 'Test1234!'
  python scripts/create_account.py --email test@example.com --password 'Test1234!' --name 测试用户
  python scripts/create_account.py --email test@example.com --delete
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import re
import subprocess
import sys

DB = "notes-db"
# 必须和 functions/api/_password.js 一致。
# Cloudflare Workers 的 PBKDF2 上限是 100000，超过会抛 NotSupportedError。
ITERATIONS = 100_000
KEY_LEN = 32


def d1(sql: str) -> list[dict]:
    r = subprocess.run(
        [
            "npx", "--no-install", "wrangler", "d1", "execute", DB,
            "--remote", "--json", "--command", sql,
        ],
        capture_output=True,
        text=True,
        timeout=120,
        shell=True,
    )
    out = r.stdout
    # wrangler 会在 JSON 前后打印 npm notice / warning，而且多个 JSON
    # 对象可能首尾相连 —— 用 raw_decode 从第一个 [ 开始逐个解析，
    # 比贪婪正则稳。
    start = out.find("[")
    if start < 0:
        raise RuntimeError(f"无 JSON 输出:\n{out[-600:]}\n{r.stderr[-400:]}")
    dec = json.JSONDecoder()
    try:
        data, _ = dec.raw_decode(out[start:])
    except json.JSONDecodeError:
        # 兜底：找最后一个完整的 [...]
        m = re.search(r"\[\s*\{[\s\S]*\}\s*\](?![\s\S]*\])", out)
        if not m:
            raise
        data = json.loads(m.group(0))
    return data[0].get("results", []) if data else []


def hash_password(password: str) -> str:
    """和 _password.js 保持完全一致。"""
    salt = hashlib.sha256(password.encode() + b"static-salt-placeholder").digest()[:16]
    # 用随机 salt 更安全；这里用 os.urandom
    import os

    salt = os.urandom(16)
    bits = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, ITERATIONS, KEY_LEN)
    salt_b64 = base64.b64encode(salt).decode()
    hash_b64 = base64.b64encode(bits).decode()
    return f"pbkdf2${ITERATIONS}${salt_b64}${hash_b64}"


def sql_escape(s: str) -> str:
    return s.replace("'", "''")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--email", required=True)
    ap.add_argument("--password", help="不传则只删不改")
    ap.add_argument("--name", default=None)
    ap.add_argument("--delete", action="store_true", help="删除该账号的密码（保留其他数据）")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    email = args.email.strip().lower()

    if args.delete:
        sql = f"DELETE FROM credentials WHERE email = '{sql_escape(email)}'"
        print(f"[dry-run] {sql}" if args.dry_run else "删除中…")
        if not args.dry_run:
            d1(sql)
            print(f"✓ 已删除 {email} 的密码")
        return 0

    if not args.password:
        print("需要 --password（或 --delete）")
        return 1

    if len(args.password) < 8:
        print("密码至少 8 位")
        return 1

    pw_hash = hash_password(args.password)

    stmts = [
        # 密码记录
        "INSERT INTO credentials (email, password_hash) "
        f"VALUES ('{sql_escape(email)}', '{sql_escape(pw_hash)}') "
        "ON CONFLICT(email) DO UPDATE SET "
        "password_hash = excluded.password_hash, updated_at = datetime('now')",
    ]

    # users 表也建一条（方便后台看到这个人）
    name = args.name or email.split("@")[0]
    stmts.append(
        "INSERT INTO users (email, name, id) "
        f"VALUES ('{sql_escape(email)}', '{sql_escape(name)}', lower(hex(randomblob(8)))) "
        "ON CONFLICT(email) DO UPDATE SET name = COALESCE(excluded.name, users.name), "
        "id = COALESCE(users.id, excluded.id)"
    )

    for s in stmts:
        if args.dry_run:
            print(f"[dry-run] {s[:120]}…")
        else:
            d1(s)

    if not args.dry_run:
        # account_links 用 users 里生成的 id
        rows = d1(f"SELECT id FROM users WHERE email = '{sql_escape(email)}'")
        uid = rows[0]["id"] if rows else None
        if uid:
            d1(
                "INSERT INTO account_links (email, user_id, is_primary) "
                f"VALUES ('{sql_escape(email)}', '{uid}', 0) "
                "ON CONFLICT(email) DO UPDATE SET user_id = excluded.user_id"
            )
        print(f"✓ 账号已就绪：{email} / {args.password}")
        print(f"  user_id: {uid}")
        print("  用 /login 页下方的「用密码登录」登录")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
