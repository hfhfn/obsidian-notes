/**
 * POST /api/auth/verify-code   { email, code } → 设置会话 Cookie
 *
 * 校验规则：
 *   - 只认该邮箱最新一条未消费、未过期的码
 *   - 最多试 5 次，超了就作废（防止暴力穷举 6 位码）
 *   - 成功后立刻标记 consumed，一码一用
 */
import { json, touchUser } from "../_auth.js"
import { signSession, sessionCookie } from "../_session.js"

const MAX_ATTEMPTS = 5
const SESSION_DAYS = 30

export async function onRequestPost({ request, env }) {
  if (!env.SESSION_SECRET) {
    return json(
      { ok: false, error: "not_configured", message: "服务端未配置会话密钥" },
      503,
    )
  }

  let body
  try {
    body = await request.json()
  } catch {
    return json({ ok: false, error: "bad_json" }, 400)
  }

  const email = String(body?.email ?? "").trim().toLowerCase()
  const code = String(body?.code ?? "").trim()

  if (!email || !/^\d{6}$/.test(code)) {
    return json({ ok: false, error: "bad_input", message: "请输入 6 位数字验证码" }, 400)
  }

  const db = env.DB

  const row = await db
    .prepare(
      `SELECT id, code_hash, attempts FROM login_codes
       WHERE email = ? AND consumed = 0 AND code_hash IS NOT NULL
         AND expires_at > datetime('now')
       ORDER BY id DESC LIMIT 1`,
    )
    .bind(email)
    .first()

  if (!row) {
    return json(
      { ok: false, error: "code_expired", message: "验证码已过期，请重新获取" },
      400,
    )
  }

  if (row.attempts >= MAX_ATTEMPTS) {
    await db
      .prepare("UPDATE login_codes SET consumed = 1 WHERE id = ?")
      .bind(row.id)
      .run()
    return json(
      { ok: false, error: "too_many_attempts", message: "尝试次数过多，请重新获取验证码" },
      429,
    )
  }

  const expected = await sha256Hex(`${email}:${code}:${env.SESSION_SECRET}`)
  if (expected !== row.code_hash) {
    await db
      .prepare("UPDATE login_codes SET attempts = attempts + 1 WHERE id = ?")
      .bind(row.id)
      .run()
    const left = MAX_ATTEMPTS - (row.attempts + 1)
    return json(
      {
        ok: false,
        error: "code_wrong",
        message: left > 0 ? `验证码不对，还可以试 ${left} 次` : "验证码不对，请重新获取",
      },
      400,
    )
  }

  // 成功：作废该码
  await db
    .prepare("UPDATE login_codes SET consumed = 1 WHERE id = ?")
    .bind(row.id)
    .run()

  // 顺手清理该邮箱的历史记录，避免表无限增长
  await db
    .prepare(
      `DELETE FROM login_codes
       WHERE email = ? AND (consumed = 1 OR expires_at <= datetime('now'))`,
    )
    .bind(email)
    .run()

  await touchUser(db, { email, name: null })

  const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400
  const token = await signSession(env.SESSION_SECRET, { email, exp })

  return new Response(
    JSON.stringify({ ok: true, email, redirect: "/my/bookmarks" }),
    {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "set-cookie": sessionCookie(token, SESSION_DAYS * 86400),
      },
    },
  )
}

async function sha256Hex(input) {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest("SHA-256", data)
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}
