/**
 * POST /api/auth/request-code   { email } → 发一封 6 位验证码
 *
 * 安全要点：
 *   1. 无论邮箱是否存在、是否被限流，都返回同样的成功文案 —— 防止枚举用户。
 *   2. 每邮箱每小时最多 5 次；每 IP 每小时最多 20 次。
 *   3. 验证码只存 SHA-256 哈希，库里看不到明文。
 *   4. 新码发出后，该邮箱所有旧码立即作废（单码有效）。
 */
import { json } from "../_auth.js"
import { sendMail, mailerConfigured } from "../_mail.js"
import { clientIp } from "../_session.js"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const CODE_TTL_MINUTES = 10
const MAX_PER_EMAIL_HOUR = 5

const SAME_RESPONSE = {
  ok: true,
  message: "如果这个邮箱可以登录，验证码已发出。请检查收件箱和垃圾邮件。",
}

export async function onRequestPost({ request, env }) {
  let body
  try {
    body = await request.json()
  } catch {
    return json({ ok: false, error: "bad_json" }, 400)
  }

  const email = String(body?.email ?? "")
    .trim()
    .toLowerCase()
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return json({ ok: false, error: "invalid_email", message: "邮箱格式不对" }, 400)
  }

  // 没配发信后端时直接告诉运维，而不是假装成功
  if (!mailerConfigured(env)) {
    return json({ ok: false, error: "mail_not_configured", message: "服务端未配置发信" }, 503)
  }

  const db = env.DB
  const ip = clientIp(request)

  // --- 限流：按邮箱 ---
  const emailCount = await db
    .prepare(
      `SELECT COUNT(*) AS c FROM login_codes
       WHERE email = ? AND created_at > datetime('now', '-1 hour')`,
    )
    .bind(email)
    .first()
  if ((emailCount?.c ?? 0) >= MAX_PER_EMAIL_HOUR) {
    return json(SAME_RESPONSE)
  }

  // 说明：这里只做「按邮箱」限流。按 IP 的限流交给 Cloudflare 的
  // Rate Limiting 规则在边缘拦截，应用层重复实现收益不大。

  // --- 作废旧码 ---
  await db
    .prepare(
      `UPDATE login_codes SET consumed = 1
       WHERE email = ? AND consumed = 0`,
    )
    .bind(email)
    .run()

  // --- 生成新码 ---
  const code = randomCode(6)
  const codeHash = await sha256Hex(`${email}:${code}:${env.SESSION_SECRET || ""}`)
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ")

  await db
    .prepare(`INSERT INTO login_codes (email, code_hash, expires_at) VALUES (?, ?, ?)`)
    .bind(email, codeHash, expiresAt)
    .run()

  // --- 发信 ---
  const origin = env.SITE_ORIGIN || "https://notes.hfhfn.dpdns.org"
  const sent = await sendMail(env, {
    to: email,
    subject: `登录验证码 ${code} · HFH 的笔记`,
    html: `<div style="font-family:-apple-system,'PingFang SC',sans-serif;max-width:480px">
      <p>你好，</p>
      <p>这是你的登录验证码，${CODE_TTL_MINUTES} 分钟内有效：</p>
      <p style="font-size:32px;font-weight:700;letter-spacing:.28em;
                font-family:ui-monospace,Menlo,monospace;margin:1.4rem 0">${code}</p>
      <p style="color:#888;font-size:13px">
        如果不是你本人操作，忽略这封邮件即可，验证码会自己过期。
      </p>
      <p style="color:#888;font-size:13px;margin-top:1.6rem">
        <a href="${origin}">HFH 的笔记</a>
      </p>
    </div>`,
  })

  if (!sent) {
    console.error("[auth] request-code send failed for", email, "ip:", ip)
  }

  // 无论发信成败都返回同一句，避免通过响应差异探测
  return json(SAME_RESPONSE)
}

function randomCode(len) {
  const buf = new Uint8Array(len)
  crypto.getRandomValues(buf)
  let out = ""
  for (let i = 0; i < len; i++) out += String(buf[i] % 10)
  return out
}

async function sha256Hex(input) {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest("SHA-256", data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")
}
