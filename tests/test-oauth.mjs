// OAuth 登录：配置门控、state 签名、错误处理、开放重定向防护
import { DatabaseSync } from "node:sqlite"
import { makeD1 } from "./test-helpers/d1.mjs"

const sqlite = new DatabaseSync(":memory:")
sqlite.exec(`CREATE TABLE users (email TEXT PRIMARY KEY, name TEXT,
  first_seen TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen TEXT NOT NULL DEFAULT (datetime('now')));`)

let fail = 0
const check = (c, l, e) => {
  console.log(`  ${c ? "✅" : "❌"} ${l}${!c && e ? "  → " + e : ""}`)
  if (!c) fail++
}

const SECRET = "test-secret"
const baseEnv = { DB: makeD1(sqlite), SESSION_SECRET: SECRET }

const gIndex = (await import("../functions/api/auth/oauth/google/index.js")).onRequestGet
const gCb = (await import("../functions/api/auth/oauth/google/callback.js")).onRequestGet
const hIndex = (await import("../functions/api/auth/oauth/github/index.js")).onRequestGet
const loginPage = (await import("../functions/login/index.js")).onRequestGet

function req(url, cookie) {
  const headers = cookie ? { Cookie: cookie } : {}
  return new Request(url, { headers })
}

console.log("[1] 未配置凭据时不显示 OAuth 按钮")
{
  const res = await loginPage({ request: req("https://x.test/login"), env: baseEnv })
  const html = await res.text()
  check(!html.includes("使用 Google 登录"), "无 Google 按钮")
  check(!html.includes("使用 GitHub 登录"), "无 GitHub 按钮")
  check(html.includes('id="email"'), "邮箱登录仍在")
}

console.log("\n[2] 配置后显示对应按钮")
{
  const env = { ...baseEnv, GOOGLE_CLIENT_ID: "gid", GOOGLE_CLIENT_SECRET: "gsec" }
  const res = await loginPage({ request: req("https://x.test/login"), env })
  const html = await res.text()
  check(html.includes("使用 Google 登录"), "有 Google 按钮")
  check(!html.includes("使用 GitHub 登录"), "未配 GitHub 则不显示")
  check(html.includes("/api/auth/oauth/google"), "链接指向正确")
  check(html.includes("4285F4"), "含 Google 图标")
}

console.log("\n[3] 未配置时访问 OAuth 端点应报错")
{
  const res = await gIndex({ request: req("https://x.test/api/auth/oauth/google"), env: baseEnv })
  const html = await res.text()
  check(res.status === 400, "返回 400")
  check(html.includes("未配置"), "提示未配置")
}

console.log("\n[4] 配置后跳转到 Google 授权页")
{
  const env = { ...baseEnv, GOOGLE_CLIENT_ID: "gid", GOOGLE_CLIENT_SECRET: "gsec" }
  const res = await gIndex({ request: req("https://x.test/api/auth/oauth/google"), env })
  check(res.status === 302, "302")
  const loc = res.headers.get("location")
  check(
    loc.startsWith("https://accounts.google.com/o/oauth2/v2/auth"),
    "跳到 Google",
    loc?.slice(0, 50),
  )
  check(loc.includes("client_id=gid"), "带 client_id")
  check(
    loc.includes("redirect_uri=https%3A%2F%2Fx.test%2Fapi%2Fauth%2Foauth%2Fgoogle%2Fcallback"),
    "redirect_uri 正确",
  )
  check(loc.includes("scope=openid"), "scope 含 openid")
  const sc = res.headers.get("set-cookie")
  check(sc.includes("oauth_state="), "设置 state Cookie")
  check(/HttpOnly/i.test(sc), "state 是 HttpOnly")
  check(/SameSite=Lax/i.test(sc), "state 有 SameSite=Lax")
}

console.log("\n[5] GitHub 授权页参数正确")
{
  const env = { ...baseEnv, GITHUB_CLIENT_ID: "hid", GITHUB_CLIENT_SECRET: "hsec" }
  const res = await hIndex({ request: req("https://x.test/api/auth/oauth/github"), env })
  const loc = res.headers.get("location")
  check(loc.startsWith("https://github.com/login/oauth/authorize"), "跳到 GitHub")
  check(loc.includes("client_id=hid"), "带 client_id")
  check(!loc.includes("access_type"), "没有 Google 专属参数")
  check(!loc.includes("prompt="), "没有 prompt 参数")
}

console.log("\n[6] 回调：缺 code / 被取消")
{
  const env = { ...baseEnv, GOOGLE_CLIENT_ID: "gid", GOOGLE_CLIENT_SECRET: "gsec" }
  const r1 = await gCb({ request: req("https://x.test/api/auth/oauth/google/callback"), env })
  check(r1.status === 400, "缺 code → 400")

  const r2 = await gCb({
    request: req("https://x.test/api/auth/oauth/google/callback?error=access_denied"),
    env,
  })
  const h2 = await r2.text()
  check(r2.status === 400, "取消授权 → 400")
  check(h2.includes("取消"), "提示被取消")
}

console.log("\n[7] 回调：没有 state Cookie 必须拒绝（防 CSRF）")
{
  const env = { ...baseEnv, GOOGLE_CLIENT_ID: "gid", GOOGLE_CLIENT_SECRET: "gsec" }
  const res = await gCb({
    request: req("https://x.test/api/auth/oauth/google/callback?code=abc123"),
    env,
  })
  const html = await res.text()
  check(res.status === 400, "无 state → 400")
  check(html.includes("状态已失效"), "提示状态失效")
}

console.log("\n[8] 回调：伪造 state Cookie 必须拒绝")
{
  const env = { ...baseEnv, GOOGLE_CLIENT_ID: "gid", GOOGLE_CLIENT_SECRET: "gsec" }
  const res = await gCb({
    request: req(
      "https://x.test/api/auth/oauth/google/callback?code=abc123",
      "oauth_state=eyJlbWFpbCI6Il9fc3RhdGVfXyJ9.fakesig",
    ),
    env,
  })
  check(res.status === 400, "伪造 state → 400")
}

console.log("\n[9] 完整成功流程（mock Google API）")
{
  let cookieJar = null
  globalThis.fetch = async (url, init) => {
    const u = String(url)
    if (u.includes("oauth2.googleapis.com/token")) {
      return new Response(JSON.stringify({ access_token: "at-123" }), { status: 200 })
    }
    if (u.includes("googleapis.com/oauth2/v3/userinfo")) {
      return new Response(
        JSON.stringify({ email: "Reader@Gmail.com", email_verified: true, name: "读者" }),
        { status: 200 },
      )
    }
    throw new Error("unexpected: " + u)
  }

  const env = { ...baseEnv, GOOGLE_CLIENT_ID: "gid", GOOGLE_CLIENT_SECRET: "gsec" }

  // 第一步：拿 state cookie
  const start = await gIndex({
    request: req("https://x.test/api/auth/oauth/google?redirect=/my/history"),
    env,
  })
  cookieJar = start.headers.get("set-cookie").split(";")[0]

  // 第二步：带 state 回调
  const res = await gCb({
    request: req("https://x.test/api/auth/oauth/google/callback?code=abc123", cookieJar),
    env,
  })
  check(res.status === 302, "登录成功 302")
  check(
    res.headers.get("location") === "/my/history",
    "跳回 redirect 目标",
    res.headers.get("location"),
  )
  const sc = res.headers.get("set-cookie") || ""
  check(sc.includes("notes_session="), "签发会话 Cookie")
  check(sc.includes("Max-Age=2592000"), "会话 30 天")

  // 邮箱必须转小写
  const row = sqlite.prepare("SELECT email FROM users").get()
  check(row?.email === "reader@gmail.com", "邮箱已归一化小写", row?.email)
}

console.log("\n[10] GitHub 邮箱走 /user/emails 兜底")
{
  globalThis.fetch = async (url) => {
    const u = String(url)
    if (u.includes("github.com/login/oauth/access_token")) {
      return new Response(JSON.stringify({ access_token: "gh-1" }), { status: 200 })
    }
    if (u.endsWith("api.github.com/user")) {
      return new Response(JSON.stringify({ login: "octocat", email: null, name: "Octo" }), {
        status: 200,
      })
    }
    if (u.includes("/user/emails")) {
      return new Response(
        JSON.stringify([
          { email: "secondary@x.com", primary: false, verified: true },
          { email: "Main@X.com", primary: true, verified: true },
        ]),
        { status: 200 },
      )
    }
    throw new Error("unexpected: " + u)
  }

  const env = { ...baseEnv, GITHUB_CLIENT_ID: "hid", GITHUB_CLIENT_SECRET: "hsec" }
  const start = await hIndex({ request: req("https://x.test/api/auth/oauth/github"), env })
  const cookieJar = start.headers.get("set-cookie").split(";")[0]
  const res = await gCb({
    request: req("https://x.test/api/auth/oauth/github/callback?code=xyz", cookieJar),
    env,
  })
  // 注意：这里用 google 的 handler 处理 github state 会被 provider 校验拦下
  check(res.status === 400, "provider 不匹配的 state 被拒绝")

  const hCb = (await import("../functions/api/auth/oauth/github/callback.js")).onRequestGet
  const res2 = await hCb({
    request: req("https://x.test/api/auth/oauth/github/callback?code=xyz", cookieJar),
    env,
  })
  check(res2.status === 302, "GitHub 登录成功")
  const row = sqlite.prepare("SELECT email FROM users WHERE email LIKE '%x.com'").get()
  check(row?.email === "main@x.com", "取 primary 邮箱并小写", row?.email)
}

console.log("\n[11] Google 未验证邮箱必须拒绝")
{
  globalThis.fetch = async (url) => {
    const u = String(url)
    if (u.includes("token"))
      return new Response(JSON.stringify({ access_token: "at" }), { status: 200 })
    if (u.includes("userinfo")) {
      return new Response(JSON.stringify({ email: "unverified@x.com", email_verified: false }), {
        status: 200,
      })
    }
    throw new Error("unexpected")
  }
  const env = { ...baseEnv, GOOGLE_CLIENT_ID: "gid", GOOGLE_CLIENT_SECRET: "gsec" }
  const start = await gIndex({ request: req("https://x.test/api/auth/oauth/google"), env })
  const ck = start.headers.get("set-cookie").split(";")[0]
  const res = await gCb({
    request: req("https://x.test/api/auth/oauth/google/callback?code=c", ck),
    env,
  })
  check(res.status === 400, "未验证邮箱 → 400")
}

console.log("\n[12] 开放重定向防护")
{
  const env = { ...baseEnv, GOOGLE_CLIENT_ID: "gid", GOOGLE_CLIENT_SECRET: "gsec" }
  for (const bad of ["https://evil.com", "//evil.com"]) {
    const start = await gIndex({
      request: req(`https://x.test/api/auth/oauth/google?redirect=${encodeURIComponent(bad)}`),
      env,
    })
    const ck = start.headers.get("set-cookie").split(";")[0]
    globalThis.fetch = async (url) => {
      const u = String(url)
      if (u.includes("token"))
        return new Response(JSON.stringify({ access_token: "a" }), { status: 200 })
      if (u.includes("userinfo"))
        return new Response(JSON.stringify({ email: "a@b.com", email_verified: true }), {
          status: 200,
        })
      throw new Error("x")
    }
    const res = await gCb({
      request: req("https://x.test/api/auth/oauth/google/callback?code=c", ck),
      env,
    })
    check(
      res.headers.get("location") === "/my/bookmarks",
      `"${bad}" 回退到默认`,
      res.headers.get("location"),
    )
  }
}

console.log(`\n${fail === 0 ? "全部通过 ✅" : `${fail} 项失败 ❌`}`)
process.exit(fail === 0 ? 0 : 1)
