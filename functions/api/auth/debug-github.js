/**
 * GET /api/auth/debug-github
 *
 * 诊断 GitHub OAuth 拿不到邮箱的问题。
 *
 * 用法：
 *   1. 先访问 /api/auth/oauth/github 走完授权
 *   2. 如果失败，页面会带 ?debug=1 回跳，这里能看到真实原因
 *
 * 这个端点做两件事：
 *   - 报告 GITHUB_CLIENT_ID / SECRET 是否配置（不泄露值）
 *   - 用一个临时 token 探测 /user 和 /user/emails 的返回
 *
 * 定位完请删除本文件。
 */
import { json } from "../_auth.js"

const GH_USER = "https://api.github.com/user"
const GH_EMAILS = "https://api.github.com/user/emails"

export async function onRequestGet({ request, env }) {
  const out = {
    configured: {
      GITHUB_CLIENT_ID: Boolean(env.GITHUB_CLIENT_ID),
      GITHUB_CLIENT_SECRET: Boolean(env.GITHUB_CLIENT_SECRET),
      // 只报长度和前缀，不泄露完整值
      clientIdPrefix: env.GITHUB_CLIENT_ID
        ? String(env.GITHUB_CLIENT_ID).slice(0, 6) + "…"
        : null,
    },
    callbackUrl: new URL("/api/auth/oauth/github/callback", request.url).toString(),
  }

  // 如果调用方给了 token，就实测两个接口
  const url = new URL(request.url)
  const token = url.searchParams.get("token")
  if (token) {
    const headers = {
      authorization: "Bearer " + token,
      accept: "application/json",
      "user-agent": "notes-site-debug",
    }

    try {
      const r = await fetch(GH_USER, { headers })
      out.user = {
        status: r.status,
        scopes: r.headers.get("x-oauth-scopes"),
        acceptedScopes: r.headers.get("x-accepted-oauth-scopes"),
      }
      if (r.ok) {
        const d = await r.json()
        out.user.login = d.login
        out.user.id = d.id
        out.user.email = d.email
        out.user.emailIsNull = d.email === null
      }
    } catch (e) {
      out.user = { error: String(e) }
    }

    try {
      const r = await fetch(GH_EMAILS, { headers })
      out.emails = { status: r.status }
      if (r.ok) {
        const d = await r.json()
        out.emails.list = Array.isArray(d)
          ? d.map((e) => ({
              email: e.email,
              primary: e.primary,
              verified: e.verified,
              visibility: e.visibility,
            }))
          : d
        out.emails.count = Array.isArray(d) ? d.length : 0
      } else {
        out.emails.body = (await r.text()).slice(0, 300)
      }
    } catch (e) {
      out.emails = { error: String(e) }
    }
  } else {
    out.hint =
      "带 ?token=<github_access_token> 可实测 /user 和 /user/emails 的返回。" +
      " 没有 token 时只能看配置状态。"
  }

  return json(out)
}
