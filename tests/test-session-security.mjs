// 反向验证：确认伪造 Cookie 是被 HMAC 拦下的，而不是解析失败偶然通过
import { DatabaseSync } from "node:sqlite"
import { makeD1 } from "./test-helpers/d1.mjs"
import { signSession } from "../functions/api/_session.js"

const sqlite = new DatabaseSync(":memory:")
sqlite.exec(`CREATE TABLE bookmarks (email TEXT NOT NULL, slug TEXT NOT NULL, title TEXT,
  user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (email, slug));
CREATE UNIQUE INDEX IF NOT EXISTS uniq_bookmarks_uid_slug ON bookmarks(user_id, slug);`)

const env = { DB: makeD1(sqlite), SESSION_SECRET: "real-secret" }
const { onRequestGet } = await import("../functions/api/bookmarks.js")

let fail = 0
const check = (c, l, e) => {
  console.log(`  ${c ? "✅" : "❌"} ${l}${!c && e ? "  → " + e : ""}`)
  if (!c) fail++
}

function b64url(s) {
  return Buffer.from(s, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

async function call(cookieValue) {
  const req = new Request("https://x.test/api/bookmarks", {
    headers: cookieValue ? { Cookie: `notes_session=${cookieValue}` } : {},
  })
  return onRequestGet({ request: req, env })
}

const futureExp = Math.floor(Date.now() / 1000) + 86400
const payload = b64url(JSON.stringify({ email: "hacker@evil.com", exp: futureExp }))

console.log("[A] 结构合法但签名是瞎编的（能被 atob 解析）")
{
  const res = await call(`${payload}.${b64url("garbage-signature-bytes")}`)
  check(res.status === 401, "401 —— 是签名校验挡住的，不是解析失败")
}

console.log("\n[B] 用错误的密钥签名")
{
  const wrongKeyToken = await signSession("attacker-guessed-secret", {
    email: "hacker@evil.com",
    exp: futureExp,
  })
  const res = await call(wrongKeyToken)
  check(res.status === 401, "401 —— 换密钥签的也不行")
}

console.log("\n[C] 正确密钥但已过期")
{
  const expired = await signSession("real-secret", {
    email: "old@example.com",
    exp: Math.floor(Date.now() / 1000) - 10,
  })
  const res = await call(expired)
  check(res.status === 401, "401 —— 过期会话被拒")
}

console.log("\n[D] 正确密钥 + 未过期（对照组，应成功）")
{
  const good = await signSession("real-secret", { email: "real@example.com", exp: futureExp })
  const res = await call(good)
  check(res.status === 200, "200 —— 合法会话可用")
}

console.log("\n[E] 篡改 payload 但沿用旧签名")
{
  const good = await signSession("real-secret", { email: "real@example.com", exp: futureExp })
  const sig = good.split(".").pop()
  const tampered = b64url(JSON.stringify({ email: "hacker@evil.com", exp: futureExp }))
  const res = await call(`${tampered}.${sig}`)
  check(res.status === 401, "401 —— 改 payload 后签名失效")
}

console.log("\n[F] 完全不带 Cookie")
{
  const res = await call(null)
  check(res.status === 401, "401")
}

console.log(`\n${fail === 0 ? "全部通过 ✅ 签名校验是真实生效的" : `${fail} 项失败 ❌`}`)
process.exit(fail === 0 ? 0 : 1)
