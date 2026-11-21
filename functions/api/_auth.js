/**
 * 从 Cloudflare Access 的 JWT 中取出用户邮箱。
 *
 * 说明：这里只做「解码」，不做签名校验。原因：
 * - 请求已由 Cloudflare Access 在边缘拦截，未登录根本到不了 Functions
 * - 如果日后要自己校验，用 jose 验证 Cf-Access-Jwt-Assertion 即可
 *
 * 返回 { email, name } 或 null。
 */
export function getUser(request) {
  // 首选 header，Access 保证会带上；cookie 作为兜底
  const token =
    request.headers.get("Cf-Access-Jwt-Assertion") ||
    readCookie(request.headers.get("Cookie"), "CF_Authorization")

  if (!token) return null

  const payload = decodeJwtPayload(token)
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

/** 需要登录的接口：未登录返回 401，前端据此弹登录提示 */
export function requireUser(request) {
  const user = getUser(request)
  if (!user) {
    return {
      user: null,
      response: json(
        { ok: false, error: "login_required", loginUrl: "/cdn-cgi/access/login" },
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
