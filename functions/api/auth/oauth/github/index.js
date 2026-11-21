/**
 * GET /api/auth/oauth/github → 跳转 GitHub 授权页
 */
import { providerConfigured, redirectUri, makeStateCookie, PROVIDERS } from "../../_oauth.js"
import { oauthError } from "../_error.js"

const NAME = "github"

export async function onRequestGet({ request, env }) {
  if (!env.SESSION_SECRET || !providerConfigured(env, NAME)) {
    return oauthError("GitHub 登录未配置", "管理员还没有填写 GitHub 的 OAuth 凭据。")
  }

  const url = new URL(request.url)
  const state = await makeStateCookie(env.SESSION_SECRET, NAME, url.searchParams.get("redirect"))

  const p = PROVIDERS[NAME]
  const target = new URL(p.authUrl)
  target.searchParams.set("client_id", env[p.clientIdEnv])
  target.searchParams.set("redirect_uri", redirectUri(url.origin, NAME))
  target.searchParams.set("response_type", "code")
  target.searchParams.set("scope", p.scope)
  // 真正的 state 在签名 Cookie 里，这里给个占位值让 GitHub 原样回传
  target.searchParams.set("state", "cookie")

  return new Response(null, {
    status: 302,
    headers: {
      location: target.toString(),
      "cache-control": "no-store",
      "set-cookie": state,
    },
  })
}
