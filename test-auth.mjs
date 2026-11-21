// 端到端验证自建邮箱登录：真实 SQLite + 真实 handler，只把 fetch 换成假发信。
import { DatabaseSync } from "node:sqlite"
import { makeD1 } from "./test-helpers/d1.mjs"

// ---- 假发信：截获验证码 ----
let lastMail = null
globalThis.fetch = async (url, init) => {
  const u = String(url)
  if (u.includes("brevo.com") || u.includes("resend.com")) {
    const body = JSON.parse(init.body)
    const html = body.htmlContent || body.html || ""
    const m = html.match(/(\d{6})/)
    lastMail = { to: body.to?.[0]?.email || body.to, subject: body.subject, code: m ? m[1] : null }
    return new Response(JSON.stringify({ messageId: "fake" }), { status: 201 })
  }
  throw new Error("unexpected fetch: " + u)
}

const sqlite = new DatabaseSync(":memory:")
sqlite.exec(`
CREATE TABLE users (
  email TEXT PRIMARY KEY, name TEXT,
  first_seen TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE bookmarks (
  email TEXT NOT NULL, slug TEXT NOT NULL, title TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (email, slug)
);
CREATE TABLE history (
  email TEXT NOT NULL, slug TEXT NOT NULL, title TEXT,
  visits INTEGER NOT NULL DEFAULT 1,
  last_seen TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (email, slug)
);
CREATE TABLE login_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL, code_hash TEXT, expires_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`)

const env = {
  DB: makeD1(sqlite),
  SESSION_SECRET: "test-secret-do-not-use-in-prod",
  BREVO_API_KEY: "fake",
  MAIL_FROM: "noreply@test.local",
  MAIL_FROM_NAME: "HFH 的笔记",
  SITE_ORIGIN: "https://test.local",
}

const requestCode = (await import("./functions/api/auth/request-code.js")).onRequestPost
const verifyCode = (await import("./functions/api/auth/verify-code.js")).onRequestPost
const bookmarksApi = await import("./functions/api/bookmarks.js")
const historyApi = await import("./functions/api/history.js")
const logout = (await import("./functions/api/auth/logout.js")).onRequestPost

let fail = 0
function check(cond, label, extra) {
  console.log(`  ${cond ? "✅" : "❌"} ${label}${!cond && extra ? "  → " + extra : ""}`)
  if (!cond) fail++
}

function post(url, body, cookie) {
  const headers = { "content-type": "application/json" }
  if (cookie) headers.Cookie = cookie
  return new Request(url, { method: "POST", headers, body: JSON.stringify(body) })
}

const EMAIL = "reader@example.com"
let cookie = null

console.log("\n[1] 请求验证码")
{
  const res = await requestCode({
    request: post("https://test.local/api/auth/request-code", { email: EMAIL }),
    env,
  })
  const body = await res.json()
  check(res.status === 200, "返回 200")
  check(body.ok === true, "ok:true")
  check(!!lastMail, "确实调用了发信")
  check(lastMail?.to === EMAIL, `收件人是 ${EMAIL}`, lastMail?.to)
  check(/^\d{6}$/.test(lastMail?.code || ""), "邮件里含 6 位验证码", lastMail?.code)
}

const CODE = lastMail.code

console.log("\n[2] 验证码只存哈希，库里看不到明文")
{
  const row = sqlite.prepare("SELECT code_hash FROM login_codes WHERE email=?").get(EMAIL)
  check(!!row?.code_hash, "有 code_hash 记录")
  check(row.code_hash !== CODE, "哈希 != 明文")
  check(/^[0-9a-f]{64}$/.test(row.code_hash), "是 SHA-256 十六进制")
}

console.log("\n[3] 错误的验证码应被拒绝")
{
  const wrong = CODE === "000000" ? "111111" : "000000"
  const res = await verifyCode({
    request: post("https://test.local/api/auth/verify-code", { email: EMAIL, code: wrong }),
    env,
  })
  const body = await res.json()
  check(res.status === 400, "返回 400")
  check(body.error === "code_wrong", "error=code_wrong", body.error)
  check(!res.headers.get("set-cookie"), "没有下发会话 Cookie")
}

console.log("\n[4] 正确的验证码应登录成功")
{
  const res = await verifyCode({
    request: post("https://test.local/api/auth/verify-code", { email: EMAIL, code: CODE }),
    env,
  })
  const body = await res.json()
  check(res.status === 200, "返回 200")
  check(body.ok === true, "ok:true")
  const sc = res.headers.get("set-cookie") || ""
  check(sc.includes("notes_session="), "下发了 notes_session")
  check(/HttpOnly/i.test(sc), "Cookie 是 HttpOnly")
  check(/SameSite=Lax/i.test(sc), "Cookie 有 SameSite=Lax")
  cookie = sc.split(";")[0]
}

console.log("\n[5] 会话可用：收藏一篇笔记")
{
  const res = await bookmarksApi.onRequestPost({
    request: post("https://test.local/api/bookmarks", { slug: "AI/test", title: "测试笔记" }, cookie),
    env,
  })
  const body = await res.json()
  check(res.status === 200, "返回 200")
  check(body.bookmarked === true, "bookmarked=true")
}

console.log("\n[6] 会话可用：读取收藏列表")
{
  const req = new Request("https://test.local/api/bookmarks", { headers: { Cookie: cookie } })
  const res = await bookmarksApi.onRequestGet({ request: req, env })
  const body = await res.json()
  check(body.ok === true, "ok:true")
  check(body.items?.length === 1, "有 1 条收藏", JSON.stringify(body.items))
  check(body.items?.[0]?.slug === "AI/test", "slug 正确")
}

console.log("\n[7] 会话可用：记录足迹")
{
  const res = await historyApi.onRequestPost({
    request: post("https://test.local/api/history", { slug: "AI/test", title: "测试笔记" }, cookie),
    env,
  })
  check(res.status === 200, "返回 200")
}

console.log("\n[8] 无会话时必须 401")
{
  const req = new Request("https://test.local/api/bookmarks")
  const res = await bookmarksApi.onRequestGet({ request: req, env })
  const body = await res.json()
  check(res.status === 401, "返回 401")
  check(body.loginUrl === "/login", "loginUrl 指向 /login", body.loginUrl)
}

console.log("\n[9] 伪造 Cookie 必须被拒绝（HMAC 校验）")
{
  const fake = "notes_session=eyJlbWFpbCI6ImhhY2tlckBldmlsLmNvbSIsImV4cCI6OTk5OTk5OTk5OX0.deadbeef"
  const req = new Request("https://test.local/api/bookmarks", { headers: { Cookie: fake } })
  const res = await bookmarksApi.onRequestGet({ request: req, env })
  check(res.status === 401, "伪造签名 → 401")
}

console.log("\n[10] 验证码不能重复使用")
{
  const res = await verifyCode({
    request: post("https://test.local/api/auth/verify-code", { email: EMAIL, code: CODE }),
    env,
  })
  check(res.status === 400, "同一个码第二次用 → 400")
}

console.log("\n[11] 登出后会话失效")
{
  const res = await logout({ request: post("https://test.local/api/auth/logout", {}) })
  const sc = res.headers.get("set-cookie") || ""
  check(/Max-Age=0/i.test(sc), "Cookie 被清除")
}

console.log("\n[12] 连续错 5 次后锁定")
{
  lastMail = null
  await requestCode({
    request: post("https://test.local/api/auth/request-code", { email: "lock@example.com" }),
    env,
  })
  const real = lastMail.code
  const wrong = real === "000000" ? "111111" : "000000"
  for (let i = 0; i < 5; i++) {
    await verifyCode({
      request: post("https://test.local/api/auth/verify-code", { email: "lock@example.com", code: wrong }),
      env,
    })
  }
  const res = await verifyCode({
    request: post("https://test.local/api/auth/verify-code", { email: "lock@example.com", code: real }),
    env,
  })
  const body = await res.json()
  check(res.status === 429, "第 6 次返回 429", String(res.status))
  check(body.error === "too_many_attempts", "error=too_many_attempts", body.error)
}

console.log("\n[13] 邮箱限流：1 小时内第 6 次不再发信")
{
  lastMail = null
  let sent = 0
  for (let i = 0; i < 6; i++) {
    lastMail = null
    await requestCode({
      request: post("https://test.local/api/auth/request-code", { email: "flood@example.com" }),
      env,
    })
    if (lastMail) sent++
  }
  check(sent === 5, `只发了 5 封（实际 ${sent}）`)
}

console.log("\n[14] 不存在的邮箱也不暴露信息")
{
  const res = await requestCode({
    request: post("https://test.local/api/auth/request-code", { email: "nobody-here@example.org" }),
    env,
  })
  const body = await res.json()
  check(res.status === 200, "返回 200（不暴露是否存在）")
  check(body.ok === true, "ok:true")
}

console.log(`\n${fail === 0 ? "全部通过 ✅" : `${fail} 项失败 ❌`}`)
process.exit(fail === 0 ? 0 : 1)
