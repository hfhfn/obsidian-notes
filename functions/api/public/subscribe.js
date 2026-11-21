/**
 * POST /api/public/subscribe  { email }  → 订阅邮件推送
 * GET  /api/public/subscribe?token=xxx    → 退订
 *
 * 只存邮箱；发信逻辑在 ../_mail.js（Brevo 优先，回退 Resend）。
 * 订阅成功后立刻发一封欢迎邮件，确认地址可达。
 */

import { json } from "../_auth.js"
import { sendMail, mailerConfigured } from "../_mail.js"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export async function onRequestPost({ request, env }) {
  let body
  try {
    body = await request.json()
  } catch {
    return json({ ok: false, error: "bad_json" }, 400)
  }

  const email = String(body?.email ?? "").trim().toLowerCase()
  if (!EMAIL_RE.test(email)) {
    return json({ ok: false, error: "invalid_email", message: "邮箱格式不对" }, 400)
  }
  if (email.length > 254) {
    return json({ ok: false, error: "invalid_email" }, 400)
  }

  const existing = await env.DB.prepare(
    "SELECT unsub_token FROM subscribers WHERE email = ?",
  ).bind(email).first()

  if (existing) {
    return json({ ok: true, already: true, message: "这个邮箱已经订阅过了" })
  }

  const token = crypto.randomUUID().replace(/-/g, "")
  await env.DB.prepare(
    "INSERT INTO subscribers (email, unsub_token) VALUES (?, ?)",
  ).bind(email, token).run()

  // 配了任一邮件后端就发确认信；都没有也不报错，只是不发送
  let mailed = false
  if (mailerConfigured(env)) {
    mailed = await sendWelcome(env, email, token)
  }

  return json({
    ok: true,
    message: mailed ? "订阅成功，请查收确认邮件" : "订阅成功",
  })
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url)
  const token = String(url.searchParams.get("token") ?? "").trim()
  if (!token) return json({ ok: false, error: "missing_token" }, 400)

  const row = await env.DB.prepare(
    "SELECT email FROM subscribers WHERE unsub_token = ?",
  ).bind(token).first()

  if (!row) return json({ ok: false, error: "not_found" }, 404)

  await env.DB.prepare("DELETE FROM subscribers WHERE unsub_token = ?")
    .bind(token).run()

  return new Response(
    `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
     <title>已退订</title></head>
     <body style="font-family:system-ui,sans-serif;padding:4rem;text-align:center">
     <h1>已退订</h1><p>${row.email} 不会再收到推送。</p>
     <p><a href="/">回首页</a></p></body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  )
}

/** 发确认信 */
async function sendWelcome(env, email, token) {
  const origin = env.SITE_ORIGIN || "https://notes.hfhfn.dpdns.org"
  const html = `<p>你好，</p>
    <p>你已订阅 <a href="${origin}">HFH 的笔记</a> 的更新推送。</p>
    <p>以后有新笔记时会邮件通知你。</p>
    <p style="color:#888;font-size:13px;margin-top:2rem">
      不想再收到？<a href="${origin}/api/public/subscribe?token=${token}">点此退订</a>
    </p>`
  const subject = "订阅成功 · HFH 的笔记"

  return sendMail(env, { to: email, subject, html })
}
