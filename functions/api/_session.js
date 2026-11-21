/**
 * 自签会话 Cookie。
 *
 * 用 HMAC-SHA256 对 payload 签名，密钥来自 SESSION_SECRET 环境变量。
 * 选 HMAC 而不是 JWT 库，是因为 Workers 自带 WebCrypto，零依赖、无打包体积。
 *
 * Cookie 值格式： base64url(payloadJSON) + "." + base64url(hmac)
 * payload: { email, name, exp }
 */

export const COOKIE_NAME = "notes_session"

const encoder = new TextEncoder()

function b64urlEncode(bytes) {
  let bin = ""
  const arr = new Uint8Array(bytes)
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i])
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function b64urlDecode(str) {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/")
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4)
  const bin = atob(padded)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  )
}

/** 生成签名后的会话值 */
export async function signSession(secret, payload) {
  const body = b64urlEncode(encoder.encode(JSON.stringify(payload)))
  const key = await hmacKey(secret)
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body))
  return `${body}.${b64urlEncode(sig)}`
}

/** 校验并解析会话；签名不对或过期都返回 null */
export async function verifySession(secret, token) {
  if (!secret || !token) return null
  const dot = token.lastIndexOf(".")
  if (dot <= 0) return null
  const body = token.slice(0, dot)
  const sig = token.slice(dot + 1)

  try {
    const key = await hmacKey(secret)
    const ok = await crypto.subtle.verify("HMAC", key, b64urlDecode(sig), encoder.encode(body))
    if (!ok) return null

    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body)))
    if (!payload?.email) return null
    if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) {
      return null
    }
    return payload
  } catch {
    return null
  }
}

/** 从 Cookie 头里取出我们的会话 token */
export function readSessionCookie(request) {
  const header = request.headers.get("Cookie")
  if (!header) return null
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=")
    if (k === COOKIE_NAME) return rest.join("=")
  }
  return null
}

/** 构造 Set-Cookie 值 */
export function sessionCookie(token, maxAgeSeconds) {
  return [
    `${COOKIE_NAME}=${token}`,
    "Path=/",
    `Max-Age=${maxAgeSeconds}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ].join("; ")
}

/** 清除会话 */
export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`
}

/**
 * 取当前请求的真实来源 IP。
 * Cloudflare 会写 CF-Connecting-IP；本地开发时可能没有。
 */
export function clientIp(request) {
  return (
    request.headers.get("CF-Connecting-IP") ||
    (request.headers.get("X-Forwarded-For") || "").split(",")[0].trim() ||
    "unknown"
  )
}
