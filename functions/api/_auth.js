/**
 * 身份解析：同时支持两种来源
 *
 *   1. 自建会话 Cookie（notes_session，HMAC 签名）—— 公开站读者走这条
 *   2. Cloudflare Access JWT（Cf-Access-Jwt-Assertion / CF_Authorization）
 *      —— 私有站 private.hfhfn.dpdns.org 由 Access 在边缘拦截，仍走这条
 *
 * 这样同一套业务代码能同时服务两个站，不必分叉。
 *
 * 注意：getUser 现在是 async（自建会话要验签名）。
 */
import { verifySession, readSessionCookie } from "./_session.js"

/**
 * 返回 { email, name } 或 null。
 */
/**
 * 解析 ADMIN_EMAILS 环境变量。
 *
 * 之前定义在 video-visibility.js 里，其他模块要用只能各自复制一份。
 * 提到这里统一维护 —— 管理员判定全站只有一个来源。
 */
export function adminEmails(env) {
  return String(env?.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

export async function getUser(request, env) {
  // --- 1) 自建会话 ---
  const secret = env?.SESSION_SECRET
  if (secret) {
    const token = readSessionCookie(request)
    if (token) {
      const payload = await verifySession(secret, token)
      if (payload?.email) {
        const email = String(payload.email).toLowerCase()
        // userId 让业务数据（收藏/足迹/书架）能跨邮箱归到同一个账号。
        // 会话里已经带了就不再查库；老会话没有就补一次。
        let userId = payload.uid || null
        if (!userId && env?.DB) {
          try {
            const row = await env.DB
              .prepare(`SELECT user_id FROM account_links WHERE email = ?`)
              .bind(email)
              .first()
            userId = row?.user_id || null
          } catch (e) { /* 表还没建，忽略 */ }
        }
        return {
          email,
          userId,
          name: payload.name || null,
        }
      }
    }
  }

  // --- 2) Cloudflare Access ---
  const accessToken =
    request.headers.get("Cf-Access-Jwt-Assertion") ||
    readCookie(request.headers.get("Cookie"), "CF_Authorization")

  if (!accessToken) return null

  const payload = decodeJwtPayload(accessToken)
  if (!payload) return null

  const email = payload.email || payload.sub
  if (!email) return null

  return { email: String(email).toLowerCase(), name: payload.name || null }
}

function readCookie(header, name) {
  if (!header) return null
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=")
    if (k === name) return rest.join("=")
  }
  return null
}

function decodeJwtPayload(token) {
  try {
    const [, payload] = token.split(".")
    if (!payload) return null
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/")
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4)
    const json = atob(padded)
    return JSON.parse(json)
  } catch {
    return null
  }
}

/** 统一的 JSON 响应 */
export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  })
}

/**
 * 需要登录的接口：未登录返回 401，前端据此跳登录页。
 * 注意是 async —— 调用方必须 await。
 */
export async function requireUser(request, env) {
  const user = await getUser(request, env)
  if (!user) {
    return {
      user: null,
      response: json(
        { ok: false, error: "login_required", loginUrl: "/login" },
        401,
      ),
    }
  }
  return { user, response: null }
}

/** 首次出现的用户自动建档 */
export async function touchUser(db, user) {
  await db
    .prepare(
      `INSERT INTO users (email, name) VALUES (?, ?)
       ON CONFLICT(email) DO UPDATE SET last_seen = datetime('now'),
         name = COALESCE(excluded.name, users.name)`,
    )
    .bind(user.email, user.name)
    .run()
}
