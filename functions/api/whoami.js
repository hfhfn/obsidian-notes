/**
 * 登录状态查询：前端用它决定侧边栏显示「登录」还是「账号」。
 *
 * GET /api/whoami
 *   → { authed, email?, name?, userId?, isAdmin?, ...诊断字段 }
 *
 * 关键：必须同时认两种身份来源。
 *   1. notes_session      —— 公开站读者，自建 HMAC 签名会话
 *   2. CF_Authorization   —— 私有站，由 Cloudflare Access 在边缘签发
 *
 * 之前这里只读 notes_session，导致私有站用户（走 Access 登录）
 * 明明能访问 /my/* 页面，侧边栏却一直显示「登录」按钮 ——
 * 因为 whoami 返回 authed:false。
 *
 * 现在统一走 _auth.js 的 getUser()，它内部已经处理了两种来源。
 */
import { getUser } from "./_auth.js"
import { readSessionCookie, COOKIE_NAME } from "./_session.js"

export async function onRequestGet({ request, env }) {
  const cookie = readSessionCookie(request)
  const accessJwt =
    request.headers.get("Cf-Access-Jwt-Assertion") ||
    readCookieHeader(request.headers.get("Cookie"), "CF_Authorization")

  const out = {
    authed: false,
    cookieName: COOKIE_NAME,
    cookiePresent: Boolean(cookie),
    cookieLength: cookie ? cookie.length : 0,
    accessJwtPresent: Boolean(accessJwt),
    secretConfigured: Boolean(env.SESSION_SECRET),
    adminConfigured: Boolean(env.ADMIN_EMAILS),
  }

  // 两种来源都没有 → 明确告诉前端未登录
  if (!cookie && !accessJwt) {
    out.error = "没有携带任何会话（notes_session 或 CF_Authorization）"
    return json(out)
  }

  let user = null
  try {
    user = await getUser(request, env)
  } catch (e) {
    out.error = String(e)
    return json(out)
  }

  if (!user) {
    out.error = cookie
      ? "notes_session 验签失败（密钥不匹配或已过期）"
      : "CF_Authorization 解析失败"
    return json(out)
  }

  out.authed = true
  out.email = user.email
  out.userId = user.userId || null
  out.source = cookie ? "session" : "access"

  // userId 是业务数据的归属键。老会话没有 uid 就补查一次。
  if (!out.userId) {
    try {
      const row = await env.DB.prepare(
        "SELECT user_id FROM account_links WHERE email = ?",
      )
        .bind(user.email)
        .first()
      out.userId = row?.user_id || null
    } catch {
      // 表还没建就忽略
    }
  }

  // 昵称：优先按 user_id（同一个人的多个邮箱任一有名字都行），
  // 再退回按 email。
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
        .bind(user.email)
        .first()
      if (row?.name) out.name = row.name
    }
  } catch {
    // 查不到不影响登录态判断
  }

  if (user.name && !out.name) out.name = user.name

  out.isAdmin = String(env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .includes(String(user.email || "").toLowerCase())

  return json(out)
}

function readCookieHeader(header, name) {
  if (!header) return null
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=")
    if (k === name) return rest.join("=")
  }
  return null
}

function json(data) {
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  })
}
