// 隐私政策 / 服务条款页：Google OAuth 发布的硬性要求
import { onRequestGet as privacyPage } from "./functions/privacy/index.js"
import { onRequestGet as termsPage } from "./functions/terms/index.js"

let fail = 0
const check = (c, l, e) => {
  console.log(`  ${c ? "✅" : "❌"} ${l}${!c && e ? "  → " + e : ""}`)
  if (!c) fail++
}

console.log("[1] /privacy 可访问")
{
  const res = await privacyPage()
  const html = await res.text()
  check(res.status === 200, "200")
  check(/text\/html/.test(res.headers.get("content-type") || ""), "Content-Type 是 HTML")
  check(html.includes("隐私政策"), "含标题「隐私政策」")
  check(html.includes("<!doctype html>"), "完整 HTML 文档")
  check(html.includes('lang="zh-CN"'), "声明中文")
}

console.log("\n[2] 隐私政策必须覆盖 Google 要求的要点")
{
  const html = await (await privacyPage()).text()
  const musts = [
    ["收集了什么数据", /收集哪些信息/],
    ["邮箱用途", /邮箱地址/],
    ["Cookie 说明", /Cookie/],
    ["第三方服务", /第三方服务/],
    ["数据删除方式", /删除/],
    ["联系方式", /mailto:/],
    ["最后更新日期", /最后更新/],
  ]
  for (const [label, re] of musts) check(re.test(html), label)
}

console.log("\n[3] 隐私政策提到所有实际用到的第三方")
{
  const html = await (await privacyPage()).text()
  for (const svc of ["Cloudflare", "Brevo", "Google", "GitHub"]) {
    check(html.includes(svc), `提到 ${svc}`)
  }
}

console.log("\n[4] /terms 可访问")
{
  const res = await termsPage()
  const html = await res.text()
  check(res.status === 200, "200")
  check(html.includes("服务条款"), "含标题「服务条款」")
  check(html.includes("免责"), "含免责声明")
}

console.log("\n[5] 两页互相链接 + 能回首页")
{
  const p = await (await privacyPage()).text()
  const t = await (await termsPage()).text()
  check(p.includes('href="/terms"'), "隐私页链到服务条款")
  check(t.includes('href="/privacy"'), "条款页链到隐私政策")
  check(p.includes('href="/"'), "隐私页能回首页")
  check(t.includes('href="/"'), "条款页能回首页")
}

console.log("\n[6] 无 XSS 风险：页面不含用户输入")
{
  const html = await (await privacyPage()).text()
  // 这两页是纯静态内容，不应有任何插值点
  check(!html.includes("undefined"), "没有 undefined 泄漏")
  check(!html.includes("[object"), "没有对象泄漏")
}

console.log("\n[7] 结构与 SHELL 不重复（SHELL 已提供 .wrap 和 .crumb）")
{
  for (const [name, fn] of [
    ["privacy", privacyPage],
    ["terms", termsPage],
  ]) {
    const html = await (await fn()).text()
    const wrap = (html.match(/class="wrap"/g) || []).length
    const crumb = (html.match(/class="crumb"/g) || []).length
    const openDiv = (html.match(/<div/g) || []).length
    const closeDiv = (html.match(/<\/div>/g) || []).length
    check(wrap === 1, `${name}: 只有一层 .wrap`, `实际 ${wrap}`)
    check(crumb === 1, `${name}: 只有一个面包屑`, `实际 ${crumb}`)
    check(openDiv === closeDiv, `${name}: div 标签配对`, `${openDiv}/${closeDiv}`)
  }
}

console.log(`\n${fail === 0 ? "全部通过 ✅" : `${fail} 项失败 ❌`}`)
process.exit(fail === 0 ? 0 : 1)
