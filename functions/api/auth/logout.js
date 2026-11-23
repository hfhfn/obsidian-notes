/**
 * POST /api/auth/logout → 清掉会话 Cookie
 * GET  /api/auth/logout → 同上，然后 302
 *
 * 两个站点的登出逻辑不一样，必须分开处理：
 *
 *   公开站 notes.hfhfn.dpdns.org
 *     只有自建会话 notes_session。清掉即可，直接回首页。
 *     ⚠️ 不能跳 Access 登出页 —— 公开站不在 Access 后面，
 *        跳过去只会看到「No Access cookie found. Please login first.」
 *
 *   私有站 private.hfhfn.dpdns.org
 *     登录态是 Cloudflare Access 签发的（CF_Authorization）。
 *     只清 cookie 不够，还要走 Access 的登出端点清边缘会话。
 *
 *     登出后的落点很关键。三个候选：
 *       a) 私有站首页 → 被 Access 再拦一次，跳到 Access 自己的登录页，
 *          用户会看到 Cloudflare 的界面，不知道发生了什么
 *       b) 公开站首页 → 用户被"送出"私有站，感觉像是被踢走了
 *       c) 私有站 /login → 我们自己的登录页，说明「已退出」并给登录入口
 *
 *     选 (c)：用户明确要求「私有站登出，显示登录页」。
 *     为了让 /login 不被 Access 拦住，Access 那边必须给 /login 配 bypass
 *     （Notes Bypass 应用的 self_hosted_domains 里已有 /my /api 等，
 *      需要加上 /login）。否则会绕回 (a)。
 */
import { clearSessionCookie } from "../_session.js"

const ACCESS_TEAM_DOMAIN = "https://fragrant-lake-4e06.cloudflareaccess.com"

/** 判断当前请求是否来自受 Access 保护的私有站 */
function isPrivateHost(request) {
  const host = new URL(request.url).hostname
  return host.startsWith("private.")
}

/** 清 Access 的会话 cookie（Host-only，Domain 必须是当前 host） */
function clearAccessCookies(request) {
  const host = new URL(request.url).hostname
  return [
    `CF_Authorization=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax; Domain=${host}`,
    `CF_AppSession=; Path=/; Max-Age=0; Secure; SameSite=Lax; Domain=${host}`,
  ]
}

/** 登出后落点：私有站回自己的登录页，公开站回首页 */
function landingPath(privateSite, request) {
  if (privateSite) {
    const origin = new URL(request.url).origin
    // loggedout=1 让登录页显示「你已退出」的提示
    return `${origin}/login?loggedout=1`
  }
  return "/"
}

function accessLogoutUrl(privateSite, request) {
  const target = landingPath(privateSite, request)
  const abs = target.startsWith("http") ? target : new URL(target, request.url).toString()
  return `${ACCESS_TEAM_DOMAIN}/cdn-cgi/access/logout?redirect_url=${encodeURIComponent(abs)}`
}

export async function onRequestPost({ request }) {
  const privateSite = isPrivateHost(request)

  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  })
  headers.append("set-cookie", clearSessionCookie())
  if (privateSite) {
    for (const c of clearAccessCookies(request)) headers.append("set-cookie", c)
  }

  return new Response(
    JSON.stringify({
      ok: true,
      // 私有站：先跳 Access 登出清边缘会话，再落到本站登录页
      // 公开站：清完 cookie 直接回首页
      accessLogoutUrl: privateSite ? accessLogoutUrl(privateSite, request) : null,
      redirect: privateSite ? null : "/",
    }),
    { status: 200, headers },
  )
}

// 允许 GET 直接登出（方便页面里放个普通链接）
export async function onRequestGet({ request }) {
  const privateSite = isPrivateHost(request)

  const headers = new Headers({
    location: privateSite
      ? accessLogoutUrl(privateSite, request)
      : landingPath(privateSite, request),
    "cache-control": "no-store",
  })
  headers.append("set-cookie", clearSessionCookie())
  if (privateSite) {
    for (const c of clearAccessCookies(request)) headers.append("set-cookie", c)
  }

  return new Response(null, { status: 302, headers })
}
