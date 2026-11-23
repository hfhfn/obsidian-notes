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
