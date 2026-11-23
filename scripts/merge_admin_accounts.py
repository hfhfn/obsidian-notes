#!/usr/bin/env python3
"""把管理员的多个邮箱合并到同一个账号。

背景：
  users 表原来以 email 为主键，管理员的 gmail 和 sina 两个邮箱变成了
  两个账号，书架/收藏/足迹各看各的，管理员身份也只在其中一个生效。

做法：
  1. 主账号 = 数据量最多的那个邮箱（默认 gmail，可用 --master 指定）
  2. 其余邮箱的 collections / bookmarks / history 全部改挂到主账号
  3. account_links 里把这些邮箱都指向主 user_id

幂等：重复跑不会重复改（已经指过去的行不用动）。

用法：
  python scripts/merge_admin_accounts.py --dry-run
  python scripts/merge_admin_accounts.py
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys

DB = "notes-db"
DEFAULT_MASTER = "hfhfncjsy@gmail.com"


def d1(sql: str) -> list[dict]:
    """跑一条 D1 SQL，返回 results 列表。"""
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
    # wrangler 会在 JSON 前打印 npm notice / warning，用正则抠出数组
    m = re.search(r"\[\s*\{[\s\S]*\}\s*\]", out)
    if not m:
        # 空结果也可能只返回 [ { "results": [], ... } ]
        m = re.search(r"\[\s*\{[\s\S]*?\}\s*\]", out)
    if not m:
        raise RuntimeError(f"无法解析 D1 输出:\n{out[-800:]}")
    data = json.loads(m.group(0))
    return data[0].get("results", []) if data else []


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--master", default=DEFAULT_MASTER, help="主账号邮箱")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    master = args.master.lower()

    users = d1("SELECT email, id FROM users")
    if not users:
        print("users 表是空的，先登录一次再跑")
        return 1

    by_email = {u["email"].lower(): u["id"] for u in users}
    if master not in by_email:
        print(f"主账号 {master} 不在 users 里。现有: {list(by_email)}")
        return 1

    master_id = by_email[master]
    print(f"主账号: {master} → {master_id}")

    others = [e for e in by_email if e != master]
    if not others:
        print("只有一个邮箱，无需合并")
    else:
        print(f"要归并的邮箱: {others}")

    # 统计各表数据量，让用户看清楚要搬什么
    tables = [
        ("collections", "email"),
        ("bookmarks", "email"),
        ("history", "email"),
    ]

    for table, col in tables:
        try:
            rows = d1(f"SELECT {col} AS e, COUNT(*) AS n FROM {table} GROUP BY {col}")
        except Exception as ex:
            print(f"  [skip] {table}: {ex}")
            continue
        for r in rows:
            print(f"  {table}: {r['e']} → {r['n']} 条")

    if args.dry_run:
        print("\n[dry-run] 不做任何修改")
        return 0

    # ---- 1. 把其他邮箱的数据改挂到主账号 ----
    for email in others:
        for table, col in tables:
            sql = f"UPDATE {table} SET {col} = '{master}' WHERE {col} = '{email}'"
            try:
                d1(sql)
                print(f"  ✓ {table}: {email} → {master}")
            except Exception as ex:
                print(f"  [warn] {table} 更新失败: {ex}")

    # ---- 2. account_links 全部指向主 user_id ----
    for email in [master, *others]:
        is_primary = 1 if email == master else 0
        sql = (
            "INSERT INTO account_links (email, user_id, is_primary) "
            f"VALUES ('{email}', '{master_id}', {is_primary}) "
            "ON CONFLICT(email) DO UPDATE SET "
            f"user_id = '{master_id}', is_primary = {is_primary}"
        )
        d1(sql)
        print(f"  ✓ account_links: {email} → {master_id}")

    # ---- 3. users 表里其他邮箱的 id 也指向主账号（保持一致性）----
    for email in others:
        sql = f"UPDATE users SET id = '{master_id}' WHERE email = '{email}'"
        try:
            d1(sql)
            print(f"  ✓ users: {email} id → {master_id}")
        except Exception as ex:
            print(f"  [warn] users 更新失败: {ex}")

    print("\n完成。重新登录一次让会话带上新的 uid。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
