/**
 * POST /api/public/notify  { items: [{ title, url }] }  → 群发更新通知
 *
 * 用途：
 *   站点重新发布、有新笔记时，通知所有订阅者。
 *   由构建后的 scripts/notify_updates.py 调用。
 *
 * 鉴权：
 *   靠 NOTIFY_TOKEN 这个 secret（Pages 环境变量）。
 *   请求头 x-notify-token 必须匹配，否则 403。
 *   不用用户会话，因为这是构建机调用，不是浏览器。
 *
 * 限流：
 *   Cloudflare 免费版每天 100 封邮件（Brevo 300 封/天）。
 *   单次最多发给 100 人，超出部分留到下次。
 */
import { json } from "../_auth.js"
import { sendMail, mailerConfigured } from "../_mail.js"

const BATCH = 100

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function buildHtml(items, unsubToken) {
  const lis = items
    .map(
      (i) =>
        `<li style="margin:.5rem 0;line-height:1.6">` +
        `<a href="${esc(i.url)}" style="color:#1e5f4f;text-decoration:none;font-weight:500">` +
        `${esc(i.title)}</a></li>`,
    )
    .join("")

  const unsub = unsubToken
    ? `<p style="margin-top:2rem;font-size:.78rem;color:#888">
         不想再收到？<a href="https://notes.hfhfn.dpdns.org/api/public/subscribe?token=${esc(unsubToken)}"
         style="color:#888">点此退订</a></p>`
    : ""

  return `<!doctype html><html><body style="margin:0;padding:1.5rem;background:#f6f7f9;font-family:-apple-system,'Segoe UI',sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:1.6rem 1.4rem">
    <h2 style="margin:0 0 .3rem;font-size:1.15rem;color:#1e5f4f">HFH 的笔记 · 有更新</h2>
    <p style="margin:0 0 1rem;font-size:.85rem;color:#666">这次新增/更新了 ${items.length} 篇：</p>
    <ul style="margin:0;padding-left:1.1rem;font-size:.9rem;color:#333">${lis}</ul>
    <p style="margin-top:1.6rem;font-size:.8rem;color:#888">
      由 <a href="https://notes.hfhfn.dpdns.org" style="color:#1e5f4f">notes.hfhfn.dpdns.org</a> 自动发送
    </p>
    ${unsub}
  </div></body></html>`
}

export async function onRequestPost({ request, env }) {
  // --- 鉴权 ---
  const expected = env.NOTIFY_TOKEN
  if (!expected) {
    return json({ ok: false, error: "notify_not_configured" }, 503)
  }
  const got = request.headers.get("x-notify-token") || ""
  if (got !== expected) {
    return json({ ok: false, error: "forbidden" }, 403)
  }

  // --- 解析 body ---
  let body
  try {
    body = await request.json()
  } catch {
    return json({ ok: false, error: "bad_json" }, 400)
  }
  const items = Array.isArray(body?.items) ? body.items : []
  const clean = items
    .filter((i) => i && i.title && i.url)
    .slice(0, 20)
    .map((i) => ({ title: String(i.title).slice(0, 200), url: String(i.url).slice(0, 500) }))

  if (!clean.length) {
    return json({ ok: false, error: "no_items" }, 400)
  }

  if (!mailerConfigured(env)) {
    return json({ ok: false, error: "mailer_not_configured" }, 503)
  }

  // --- 取订阅者（未退订）---
  // 表结构里没有 unsubscribed_at —— 退订是直接 DELETE 记录，
  // 所以「还在这张表里」就等于「仍在订阅」。
  const rows = await env.DB.prepare(
    `SELECT email, unsub_token FROM subscribers
     ORDER BY created_at ASC
     LIMIT ?`,
  )
    .bind(BATCH)
    .all()

  const subs = rows.results ?? []
  if (!subs.length) {
    return json({ ok: true, sent: 0, failed: 0, note: "no_subscribers" })
  }

  // --- 逐个发 ---
  let sent = 0
  let failed = 0
  const subject = `HFH 的笔记 · 更新 ${clean.length} 篇`

  for (const s of subs) {
    try {
      const ok = await sendMail(env, {
        to: s.email,
        subject,
        html: buildHtml(clean, s.unsub_token),
      })
      if (ok) sent++
      else failed++
    } catch {
      failed++
    }
  }

  return json({ ok: true, sent, failed, total: subs.length })
}
