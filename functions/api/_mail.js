/**
 * 统一发信：优先 Brevo，回退 Resend。
 *
 * 需要的环境变量：
 *   BREVO_API_KEY  + MAIL_FROM / MAIL_FROM_NAME   → Brevo
 *   RESEND_API_KEY + MAIL_FROM                    → Resend
 *
 * 订阅确认信和登录验证码都走这里，避免两份发信逻辑漂移。
 */

export function mailerConfigured(env) {
  return Boolean(env.BREVO_API_KEY || env.RESEND_API_KEY)
}

/**
 * 发一封 HTML 邮件。
 * 返回 true 表示服务商接受了这封信（不代表对方一定收到）。
 */
export async function sendMail(env, { to, subject, html }) {
  if (env.BREVO_API_KEY) {
    return sendViaBrevo(env, to, subject, html)
  }
  if (env.RESEND_API_KEY) {
    return sendViaResend(env, to, subject, html)
  }
  return false
}

async function sendViaBrevo(env, email, subject, html) {
  try {
    const senderEmail = env.MAIL_FROM || "noreply@hfhfn.dpdns.org"
    const senderName = env.MAIL_FROM_NAME || "HFH 的笔记"
    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": env.BREVO_API_KEY,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: { email: senderEmail, name: senderName },
        to: [{ email }],
        subject,
        htmlContent: html,
      }),
    })
    if (!r.ok) {
      const detail = await r.text().catch(() => "")
      console.error("[mail] brevo failed", r.status, detail.slice(0, 300))
    }
    return r.ok
  } catch (err) {
    console.error("[mail] brevo error", err)
    return false
  }
}

async function sendViaResend(env, email, subject, html) {
  try {
    const from = env.MAIL_FROM_NAME
      ? `${env.MAIL_FROM_NAME} <${env.MAIL_FROM}>`
      : env.MAIL_FROM || "HFH 的笔记 <onboarding@resend.dev>"
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [email], subject, html }),
    })
    if (!r.ok) {
      const detail = await r.text().catch(() => "")
      console.error("[mail] resend failed", r.status, detail.slice(0, 300))
    }
    return r.ok
  } catch (err) {
    console.error("[mail] resend error", err)
    return false
  }
}
