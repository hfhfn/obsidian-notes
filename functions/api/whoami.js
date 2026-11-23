/**
 * 登录诊断：告诉我当前请求到底带没带 session cookie、能不能验签。
 *
 * GET /api/whoami
 *   → { authed, email?, cookiePresent, cookieLength, secretConfigured, error? }
 *
 * 只在排查「按钮点了没反应」时用。不返回 cookie 值本身。
 */
import { readSessionCookie, verifySession, COOKIE_NAME } from "./_session.js"

export async function onRequestGet({ request, env }) {
  const cookie = readSessionCookie(request)
  const secretConfigured = Boolean(env.SESSION_SECRET)

  const out = {
    authed: false,
    cookieName: COOKIE_NAME,
    cookiePresent: Boolean(cookie),
    cookieLength: cookie ? cookie.length : 0,
    secretConfigured,
    adminConfigured: Boolean(env.ADMIN_EMAILS),
  }

  if (!secretConfigured) {
    out.error = "SESSION_SECRET 未配置"
    return json(out)
  }
  if (!cookie) {
    out.error = "请求没有携带 notes_session cookie"
    return json(out)
  }

  const payload = await verifySession(env.SESSION_SECRET, cookie)
  if (!payload) {
    out.error = "cookie 验签失败（密钥不匹配或已过期）"
    return json(out)
  }

  out.authed = true
  out.email = payload.email
  out.exp = payload.exp
  // 侧边栏账号入口要显示昵称，从 users 表取（没有就用邮箱前缀）
  try {
    const row = await env.DB.prepare("SELECT name FROM users WHERE email = ?")
      .bind(payload.email)
      .first()
    if (row?.name) out.name = row.name
  } catch {
    // 查不到不影响登录态判断
  }
  out.isAdmin = String(env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .includes(String(payload.email || "").toLowerCase())

  return json(out)
}

function json(data) {
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  })
}
