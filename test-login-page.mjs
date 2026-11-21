// 登录页渲染 + 重定向安全
import { onRequestGet } from "./functions/login/index.js"

let fail = 0
const check = (c, l, e) => {
  console.log(`  ${c ? "✅" : "❌"} ${l}${!c && e ? "  → " + e : ""}`)
  if (!c) fail++
}

async function page(qs = "") {
  const req = new Request("https://x.test/login" + qs)
  const res = await onRequestGet({ request: req, env: { MAIL_FROM_NAME: "HFH 的笔记" } })
  return { status: res.status, html: await res.text() }
}

console.log("[1] 基本渲染")
{
  const { status, html } = await page()
  check(status === 200, "200")
  check(html.includes('id="email"'), "有邮箱输入框")
  check(html.includes('id="code"'), "有验证码输入框")
  check(html.includes("/api/auth/request-code"), "调用 request-code")
  check(html.includes("/api/auth/verify-code"), "调用 verify-code")
  check(html.includes("HFH 的笔记"), "站点名来自环境变量")
}

console.log("\n[2] 正常 redirect 参数被保留")
{
  const { html } = await page("?redirect=/my/history")
  check(html.includes('"/my/history"'), "redirect 注入为 /my/history")
}

console.log("\n[3] 开放重定向防护")
{
  const cases = [
    ["?redirect=https://evil.com", "绝对 URL"],
    ["?redirect=//evil.com", "协议相对"],
    ["?redirect=/ok/../..//evil.com", "带 .. 的路径"],
  ]
  for (const [qs, label] of cases) {
    const { html } = await page(qs)
    const bad = html.includes('"https://evil.com"') || html.includes('"//evil.com"')
    check(!bad, `${label} 未被当作跳转目标`)
  }
  const { html } = await page("?redirect=https://evil.com")
  check(html.includes('"/my/bookmarks"'), "回退到默认 /my/bookmarks")
}

console.log("\n[4] 没有 script 注入风险（redirect 被 JSON.stringify 转义）")
{
  const { html } = await page('?redirect=/"onmouseover="alert(1)')
  check(!html.includes('onmouseover="alert(1)"'), "未原样注入")
}

console.log(`\n${fail === 0 ? "全部通过 ✅" : `${fail} 项失败 ❌`}`)
process.exit(fail === 0 ? 0 : 1)
