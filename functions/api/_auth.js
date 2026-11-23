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
  //
  // ⚠️ 安全边界：CF_Authorization 由 Cloudflare 在边缘签发并验签。
  // 只要请求经过了 Access 保护（非 bypass 路径），到达 Function 时
  // 这个 header 一定是可信的 —— 伪造的 JWT 根本进不来。
  //
  // 但如果某条路径被配成 bypass，Access 不再拦截、也不再验签，
  // 攻击者就能自己塞一个 CF_Authorization 进来。这里**绝不能**
  // 只解码不验签，否则等于「谁都能冒充管理员」。
  //
  // 实测过的漏洞：手工构造 {"email":"<管理员邮箱>"} + 假签名，
  // 在没有验签的实现下 whoami 直接返回 isAdmin:true。
  //
  // 因此：只有请求确实被 Access 保护时才信任这个 header。
  // 判断依据是 Cloudflare 注入的 Cf-Access-Jwt-Assertion（服务端到服务端，
  // 客户端无法伪造该 header 的传递路径）；cookie 形态只在受保护路径上出现。
  const accessHeader = request.headers.get("Cf-Access-Jwt-Assertion")
  const accessCookie = readCookie(request.headers.get("Cookie"), "CF_Authorization")
  const accessToken = accessHeader || accessCookie

  if (!accessToken) return null

  // bypass 路径上不能信 cookie（客户端可伪造）；header 由 CF 注入，可信。
  // 这里额外要求：只有配置了 ACCESS_AUD 且校验通过才认。
  const payload = await verifyAccessJwt(accessToken, env)
  if (!payload) return null

  const email = payload.email || payload.sub
  if (!email) return null

  return { email: String(email).toLowerCase(), name: payload.name || null }
}

/**
 * 校验 Cloudflare Access JWT —— 必须做完整 RS256 验签。
 *
 * 为什么不能只查 exp/aud：
 *   实测过：手工构造 {email: 管理员邮箱, aud: 正确值} + 假签名，
 *   只校验 aud 的实现会直接返回 isAdmin:true。
 *   JWT 的 payload 是明文 base64，谁都能改 —— 不验签等于没有校验。
 *
 * 做法：
 *   1. 从 Cloudflare 的 JWKS 端点取公钥（按 kid 匹配）
 *   2. crypto.subtle.verify('RS256') 验签
 *   3. 再校验 aud / exp
 *
 * 公钥缓存 1 小时（Workers 实例内），避免每次请求都打 JWKS。
 */
// team domain 从 Access 登录跳转的 Location 里能拿到：
//   https://fragrant-lake-4e06.cloudflareaccess.com/cdn-cgi/access/login/...
const JWKS_URL = "https://fragrant-lake-4e06.cloudflareaccess.com/cdn-cgi/access/certs"
let jwksCache = { keys: null, at: 0 }

async function getJwks() {
  const now = Date.now()
  if (jwksCache.keys && now - jwksCache.at < 3600_000) return jwksCache.keys
  const r = await fetch(JWKS_URL, { cf: { cacheTtl: 3600 } })
  if (!r.ok) return jwksCache.keys  // 拿不到就沿用旧缓存（可能为 null）
  const data = await r.json().catch(() => null)
  if (Array.isArray(data?.keys)) {
    jwksCache = { keys: data.keys, at: now }
  }
  return jwksCache.keys
}

function b64urlToBytes(s) {
  const b64 = String(s).replace(/-/g, "+").replace(/_/g, "/")
  const pad = b64 + "=".repeat((4 - (b64.length % 4)) % 4)
  const bin = atob(pad)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function verifyAccessJwt(token, env) {
  const aud = env?.ACCESS_AUD
  if (!aud) return null   // 没配审计标签 → 不信任 Access 身份

  const parts = String(token).split(".")
  if (parts.length !== 3) return null
  const [rawHeader, rawPayload, rawSig] = parts

  // --- 1. 验签 ---
  let header
  try {
    header = JSON.parse(new TextDecoder().decode(b64urlToBytes(rawHeader)))
  } catch {
    return null
  }
  if (header.alg !== "RS256") return null

  const keys = await getJwks()
  if (!keys?.length) return null
  const jwk = keys.find((k) => k.kid === header.kid) || keys[0]
  if (!jwk) return null

  let key
  try {
    key = await crypto.subtle.importKey(
      "jwk",
      { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    )
  } catch {
    return null
  }

  const sigOk = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    b64urlToBytes(rawSig),
    new TextEncoder().encode(`${rawHeader}.${rawPayload}`),
  )
  if (!sigOk) return null

  // --- 2. 声明校验 ---
  const payload = decodeJwtPayload(token)
  if (!payload) return null

  const now = Math.floor(Date.now() / 1000)
  if (payload.exp && payload.exp < now) return null

  const tokenAud = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
  if (!tokenAud.includes(aud)) return null

  return payload
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
