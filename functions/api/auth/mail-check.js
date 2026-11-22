/**
 * 发信自检（仅管理员可用）
 *
 * GET /api/auth/mail-check
 *   → 报告发信后端配置状态，并实际发一封测试邮件
 *
 * 为什么需要它：登录验证码发不出去时，前端只会看到「验证码已发出」
 * （防枚举设计），真实错误在 Worker 的 console.error 里，本地看不到。
 * 这个端点把结果直接返回出来。
 */
import { json, requireUser } from "../_auth.js"
import { sendMail, mailerConfigured } from "../_mail.js"

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUser(request, env)
  if (!user) return response

  const admins = String(env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  if (!admins.includes(user.email.toLowerCase())) {
    return json({ error: "仅管理员可用" }, 403)
  }

  const report = {
    configured: mailerConfigured(env),
    brevo: Boolean(env.BREVO_API_KEY),
    resend: Boolean(env.RESEND_API_KEY),
    mailFrom: env.MAIL_FROM || "(未设置)",
    mailFromName: env.MAIL_FROM_NAME || "(未设置)",
  }

  if (!report.configured) {
    return json({ ...report, sent: false, error: "没有任何发信后端" }, 503)
  }

  // 真发一封，把 HTTP 状态和响应体带回来
  const to = user.email
  const subject = "[自检] 发信测试 " + new Date().toISOString()
  const html = "<p>如果你收到这封邮件，说明发信链路正常。</p>"

  let detail = ""
  let ok = false

  try {
    if (env.BREVO_API_KEY) {
      const r = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": env.BREVO_API_KEY,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          sender: {
            email: env.MAIL_FROM || "noreply@hfhfn.dpdns.org",
            name: env.MAIL_FROM_NAME || "HFH 的笔记",
          },
          to: [{ email: to }],
          subject,
          htmlContent: html,
        }),
      })
      ok = r.ok
      detail = `brevo ${r.status}: ${(await r.text().catch(() => "")).slice(0, 400)}`
    } else {
      ok = await sendMail(env, { to, subject, html })
      detail = "resend"
    }
  } catch (e) {
    detail = "exception: " + String(e)
  }

  return json({ ...report, sent: ok, detail })
}
