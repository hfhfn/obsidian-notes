/**
 * POST /api/auth/login-password   { email, password } → 签发会话
 *
 * 给测试账号和习惯用密码的人一个不走邮件/第三方授权的入口。
 * 只有 credentials 表里有记录的邮箱才能用这个方式登录。
 *
 * 安全措施：
 *   - 统一返回「邮箱或密码不对」，不透露邮箱是否存在
 *   - 按 IP + 邮箱限流，防暴力破解
 *   - 密码校验失败也走 PBKDF2，避免用响应时间探测邮箱存在性
 */
import { verifyPassword } from "../_password.js"
import { resolveAccount } from "../_account.js"
import { signSession, sessionCookie } from "../_session.js"

const SESSION_DAYS = 30
const MAX_ATTEMPTS = 8
const WINDOW_MINUTES = 15

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  })
}

function clientIp(request) {
  return request.headers.get("CF-Connecting-IP") || "0.0.0.0"
}

export async function onRequestPost({ request, env }) {
  let body
  try {
    body = await request.json()
  } catch {
    return json({ ok: false, error: "bad_json" }, 400)
  }

  const email = String(body?.email || "").trim().toLowerCase()
  const password = String(body?.password || "")

  if (!email || !password) {
    return json({ ok: false, error: "missing", message: "请输入邮箱和密码" }, 400)
  }

  // ---- 限流 ----
  const ip = clientIp(request)
  try {
    const { results } = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM login_codes
        WHERE email = ? AND created_at > datetime('now', ?)`,
    )
      .bind(`pw:${ip}:${email}`, `-${WINDOW_MINUTES} minutes`)
      .all()
    if ((results?.[0]?.c || 0) >= MAX_ATTEMPTS) {
      return json(
        { ok: false, error: "too_many", message: "尝试次数过多，请 15 分钟后再试" },
        429,
      )
    }
    // 记一次尝试（复用 login_codes 当限流表，不新建表）
    await env.DB.prepare(
      `INSERT INTO login_codes (email, code_hash, expires_at) VALUES (?, ?, datetime('now', ?))`,
    )
      .bind(`pw:${ip}:${email}`, "pw-attempt", `+${WINDOW_MINUTES} minutes`)
      .run()
  } catch (e) {
    console.error("[login-password] rate limit failed", e)
  }

  // ---- 取密码哈希 ----
  let row = null
  try {
    row = await env.DB.prepare(
      `SELECT password_hash FROM credentials WHERE email = ?`,
    )
      .bind(email)
      .first()
  } catch (e) {
    console.error("[login-password] read credentials failed", e)
    return json({ ok: false, error: "server", message: "服务异常，请稍后再试" }, 500)
  }

  // 邮箱不存在时也跑一次 PBKDF2，避免响应时间泄露邮箱是否存在
  const ok = row?.password_hash
    ? await verifyPassword(password, row.password_hash)
    : (await verifyPassword(password, "pbkdf2$1$AAAA$AAAA"), false)

  if (!ok) {
    return json(
      { ok: false, error: "bad_credentials", message: "邮箱或密码不对" },
      401,
    )
  }

  // ---- 统一账号 ----
  let userId = null
  try {
    const acc = await resolveAccount(env.DB, env, {
      provider: "password",
      providerUid: email,
      email,
    })
    userId = acc.userId
  } catch (e) {
    console.error("[login-password] resolveAccount failed", e)
  }

  // ---- 签发会话 ----
  const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400
  const token = await signSession(env.SESSION_SECRET, { email, uid: userId, exp })

  return json(
    { ok: true, email },
    200,
    { "set-cookie": sessionCookie(token, SESSION_DAYS * 86400), "cache-control": "no-store" },
  )
}
