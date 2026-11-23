/**
 * GET /api/auth/oauth/github/callback → 处理 GitHub 回调并登录
 */
import {
  providerConfigured,
  redirectUri,
  readState,
  clearStateCookie,
  exchangeCode,
  fetchEmail,
  finishLogin,
} from "../../_oauth.js"
import { oauthError } from "../_error.js"

const NAME = "github"

export async function onRequestGet({ request, env }) {
  if (!env.SESSION_SECRET || !providerConfigured(env, NAME)) {
    return oauthError("GitHub 登录未配置", "管理员还没有填写 GitHub 的 OAuth 凭据。")
  }

  const url = new URL(request.url)
  const err = url.searchParams.get("error")
  if (err) {
    return oauthError("GitHub 登录被取消", `GitHub 返回：${err}`)
  }

  const code = url.searchParams.get("code")
  if (!code) {
    return oauthError("缺少授权码", "GitHub 没有返回 code，请重新登录。")
  }

  const state = await readState(env.SESSION_SECRET, request, NAME)
  if (!state) {
    return oauthError(
      "登录状态已失效",
      "可能是页面停留太久或换了浏览器。请回到登录页重新点击 GitHub 登录。",
    )
  }

  const accessToken = await exchangeCode(env, NAME, code, redirectUri(url.origin, NAME))
  if (!accessToken) {
    return oauthError("换取令牌失败", "无法向 GitHub 换取访问令牌，请稍后再试。")
  }

  const user = await fetchEmail(NAME, accessToken)
  if (!user) {
    // 诊断模式：带上 debug=1 时把真实原因显示出来，便于定位。
    // 平时不暴露细节，避免泄露 token 相关信息。
    const debug = url.searchParams.get("debug") === "1"
    if (debug) {
      // 直接再查一次 GitHub，把原始响应展示出来
      const auth = { authorization: "Bearer " + accessToken, accept: "application/json", "user-agent": "hfhfn-notes-auth" }
      let detail = {}
      try {
        const ur = await fetch("https://api.github.com/user", { headers: auth })
        const ud = await ur.json().catch(() => null)
        detail.userStatus = ur.status
        detail.scopes = ur.headers.get("x-oauth-scopes")
        detail.user = ud
          ? { login: ud.login, id: ud.id, email: ud.email }
          : null
      } catch (e) {
        detail.userError = String(e)
      }
      try {
        const er2 = await fetch("https://api.github.com/user/emails", { headers: auth })
        detail.emailsStatus = er2.status
        detail.emails = await er2.json().catch(() => null)
      } catch (e) {
        detail.emailsError = String(e)
      }
      return new Response(
        `<!doctype html><meta charset="utf-8"><title>GitHub 登录诊断</title>
         <body style="font-family:ui-monospace,monospace;padding:2rem;background:#111;color:#eee">
         <h2>GitHub 登录诊断</h2>
         <p>fetchEmail 返回了 null，下面是 GitHub 的真实响应：</p>
         <pre style="white-space:pre-wrap;background:#000;padding:1rem;border-radius:8px">${JSON.stringify(
           detail,
           null,
           2,
         )}</pre>
         <p><a href="/login" style="color:#6cf">← 回到登录页</a></p>
         </body>`,
        { headers: { "content-type": "text/html; charset=utf-8" } },
      )
    }
    return oauthError("拿不到邮箱", "GitHub 账号没有返回已验证的邮箱地址，无法用于登录。")
  }
  // fetchEmail 可能返回 { error: "..." } —— 带具体可操作的提示，
  // 比笼统的「拿不到邮箱」有用得多（比如「邮箱未验证，去 GitHub 验证」）。
  if (user.error) {
    return oauthError("拿不到邮箱", user.error)
  }

  user.provider = NAME
  const res = await finishLogin(env, user, state.r)
  res.headers.append("set-cookie", clearStateCookie())
  return res
}
