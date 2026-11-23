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
 *     但登出后**不能**回到私有站（会被 Access 再次拦下），
 *     所以 redirect_url 指向公开站首页。
 */
import { clearSessionCookie } from "../_session.js"

const ACCESS_TEAM_DOMAIN = "https://fragrant-lake-4e06.cloudflareaccess.com"
// 公开站首页：Access 登出后的落点，也是私有站的"安全出口"
const PUBLIC_HOME = "https://notes.hfhfn.dpdns.org/"

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

function accessLogoutUrl() {
  // 登出后落到公开站首页，避免又被私有站的 Access 拦一次
  return `${ACCESS_TEAM_DOMAIN}/cdn-cgi/access/logout?redirect_url=${encodeURIComponent(PUBLIC_HOME)}`
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
      // 只有私有站需要再跳一次 Access 登出；公开站前端直接回首页
      accessLogoutUrl: privateSite ? accessLogoutUrl() : null,
      redirect: privateSite ? null : "/",
    }),
    { status: 200, headers },
  )
}

// 允许 GET 直接登出（方便页面里放个普通链接）
export async function onRequestGet({ request }) {
  const privateSite = isPrivateHost(request)

  const headers = new Headers({
    location: privateSite ? accessLogoutUrl() : "/",
    "cache-control": "no-store",
  })
  headers.append("set-cookie", clearSessionCookie())
  if (privateSite) {
    for (const c of clearAccessCookies(request)) headers.append("set-cookie", c)
  }

  return new Response(null, { status: 302, headers })
}
