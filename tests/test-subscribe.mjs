// 验证订阅发信：重构到 _mail.js 后，Brevo / Resend / 都没配 三种情况行为正确
import { DatabaseSync } from "node:sqlite"
import { makeD1 } from "./test-helpers/d1.mjs"

const sent = []
globalThis.fetch = async (url, init) => {
  sent.push({ url: String(url), body: init?.body })
  return new Response(JSON.stringify({ messageId: "x" }), { status: 201 })
}

function freshDb() {
  const s = new DatabaseSync(":memory:")
  s.exec(`CREATE TABLE subscribers (email TEXT PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    confirmed INTEGER NOT NULL DEFAULT 1, unsub_token TEXT NOT NULL);`)
  return makeD1(s)
}

const { onRequestPost } = await import("../functions/api/public/subscribe.js")

let fail = 0
const check = (c, l, e) => {
  console.log(`  ${c ? "✅" : "❌"} ${l}${!c && e ? "  → " + e : ""}`)
  if (!c) fail++
}

async function run(label, envExtra, email, sharedDb) {
  sent.length = 0
  const env = {
    DB: sharedDb || freshDb(),
    MAIL_FROM: "noreply@test.local",
    MAIL_FROM_NAME: "测试",
    ...envExtra,
  }
  const req = new Request("https://x.test/api/public/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  })
  const res = await onRequestPost({ request: req, env })
  const body = await res.json()
  console.log(`\n[${label}]`)
  console.log(`   message: ${JSON.stringify(body.message)}`)
  console.log(`   fetch:   ${sent.length ? sent.map((s) => new URL(s.url).host).join(", ") : "无"}`)
  return { body, sent: [...sent] }
}

const sharedDb = freshDb()
const a = await run("只有 BREVO_API_KEY", { BREVO_API_KEY: "k" }, "a@example.com", sharedDb)
check(a.body.message.includes("请查收确认邮件"), "提示已发确认信")
check(
  a.sent.some((s) => s.url.includes("brevo.com")),
  "调用 Brevo",
)

const b = await run("只有 RESEND_API_KEY", { RESEND_API_KEY: "k" }, "b@example.com")
check(b.body.message.includes("请查收确认邮件"), "提示已发确认信")
check(
  b.sent.some((s) => s.url.includes("resend.com")),
  "调用 Resend",
)

const c = await run("两个都配", { BREVO_API_KEY: "k", RESEND_API_KEY: "k" }, "c@example.com")
check(c.sent.length === 1 && c.sent[0].url.includes("brevo.com"), "优先 Brevo 且只发一次")

const d = await run("都没配", {}, "d@example.com")
check(d.body.ok === true, "仍然 ok:true")
check(!d.body.message.includes("请查收"), "提示为纯订阅成功")
check(d.sent.length === 0, "没有发起请求")

const e = await run("重复订阅", { BREVO_API_KEY: "k" }, "a@example.com", sharedDb)
check(e.body.already === true, "第二次订阅返回 already")

console.log(`\n${fail === 0 ? "全部通过 ✅" : `${fail} 项失败 ❌`}`)
process.exit(fail === 0 ? 0 : 1)
