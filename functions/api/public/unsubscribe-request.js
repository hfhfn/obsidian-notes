/**
 * POST /api/public/unsubscribe-request  { email }  → 发一封带退订链接的邮件
 *
 * 为什么不能直接退订：
 *   如果 POST 就直接 DELETE，任何知道你邮箱的人都能替你退订。
 *   所以先发一封带 unsub_token 的邮件，用户点链接才真正退订
 *   （GET /api/public/subscribe?token=xxx 已实现该逻辑）。
 *
 * 防探测：
 *   不管邮箱是否订阅过，都返回同一句话和同一个 200。
 *   否则可以用这个接口枚举「谁订阅了这个站」。
 *
 * 限流：
 *   同一邮箱 10 分钟内只发一封，避免被当邮件炸弹。
 */
import { json } from "../_auth.js"
import { sendMail, mailerConfigured } from "../_mail.js"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const SITE = "https://notes.hfhfn.dpdns.org"
const COOLDOWN_MS = 10 * 60 * 1000

export async function onRequestPost({ request, env }) {
  let body
  try {
    body = await request.json()
  } catch {
    return json({ ok: false, error: "bad_json" }, 400)
  }

  const email = String(body?.email ?? "").trim().toLowerCase()
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return json({ ok: false, error: "invalid_email", message: "邮箱格式不对" }, 400)
  }

  const ok = {
    ok: true,
    message: "如果这个邮箱订阅过，退订链接已发送，请查收邮件。",
  }

  const row = await env.DB.prepare(
    "SELECT unsub_token FROM subscribers WHERE email = ?",
  )
    .bind(email)
    .first()

  // 没订阅过：静默返回成功，不泄露
  if (!row?.unsub_token) return json(ok)

  // 冷却检查：借 login_codes 表记时间戳（已有 email + created_at）
  const key = `unsub:${email}`
  const last = await env.DB.prepare(
    "SELECT created_at FROM login_codes WHERE email = ? ORDER BY created_at DESC LIMIT 1",
  )
    .bind(key)
    .first()
    .catch(() => null)

  if (last?.created_at) {
    const age = Date.now() - new Date(last.created_at + "Z").getTime()
    if (Number.isFinite(age) && age < COOLDOWN_MS) {
      // 冷却中：仍返回成功文案，避免暴露「刚发过」
      return json(ok)
    }
  }

  if (!mailerConfigured(env)) {
    return json({ ok: false, error: "mailer_not_configured" }, 503)
  }

  const unsubUrl = `${SITE}/api/public/subscribe?token=${encodeURIComponent(row.unsub_token)}`
  const html = `<!doctype html><html><body style="margin:0;padding:1.5rem;background:#f6f7f9;font-family:-apple-system,'Segoe UI',sans-serif">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:1.6rem 1.4rem">
    <h2 style="margin:0 0 .8rem;font-size:1.1rem;color:#1e5f4f">退订 HFH 的笔记</h2>
    <p style="margin:0 0 1.2rem;font-size:.9rem;color:#333;line-height:1.6">
      点下面的按钮就不会再收到更新推送了。
    </p>
    <p style="margin:1.4rem 0">
      <a href="${unsubUrl}"
         style="display:inline-block;padding:.6rem 1.2rem;border-radius:8px;
                background:#1e5f4f;color:#fff;text-decoration:none;font-size:.9rem">
        确认退订
      </a>
    </p>
    <p style="margin-top:1.6rem;font-size:.78rem;color:#888">
      如果不是你本人操作，忽略这封邮件即可，订阅不会变。
    </p>
  </div></body></html>`

  try {
    await sendMail(env, { to: email, subject: "退订确认 · HFH 的笔记", html })
    // 记录发送时间（用于冷却）
    await env.DB.prepare(
      "INSERT INTO login_codes (email, code_hash, expires_at) VALUES (?, ?, datetime('now', '+10 minutes'))",
    )
      .bind(key, "unsub-request")
      .run()
      .catch(() => {})
  } catch {
    // 发信失败也返回成功文案，避免探测
  }

  return json(ok)
}
