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
  // userId 是业务数据的归属键 —— 前端和调试都需要它来确认
  // 「多个登录方式是否真的归到了同一个账号」。
  out.userId = payload.uid || null

  // 老会话可能没有 uid（登录时 identities 表还没建），补查一次
  if (!out.userId) {
    try {
      const row = await env.DB.prepare(
        "SELECT user_id FROM account_links WHERE email = ?",
      )
        .bind(payload.email)
        .first()
      out.userId = row?.user_id || null
    } catch {
      // 表还没建就忽略
    }
  }

  // 侧边栏账号入口要显示昵称。
  // 优先按 user_id 找（同一个人的多个邮箱里任意一个有名字都行），
  // 找不到再退回按 email 查。
  try {
    if (out.userId) {
      const row = await env.DB.prepare(
        "SELECT name FROM users WHERE id = ? AND name IS NOT NULL LIMIT 1",
      )
        .bind(out.userId)
        .first()
      if (row?.name) out.name = row.name
    }
    if (!out.name) {
      const row = await env.DB.prepare("SELECT name FROM users WHERE email = ?")
        .bind(payload.email)
        .first()
      if (row?.name) out.name = row.name
    }
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
