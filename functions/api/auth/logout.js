/**
 * POST /api/auth/logout → 清掉会话 Cookie
 * GET  /api/auth/logout → 同上，然后 302
 *
 * 私有站要额外处理：那里的登录态是 Cloudflare Access 签发的
 * （CF_Authorization），只清 notes_session 等于没退 —— 刷新页面
 * Access 仍然认得你，侧边栏还是账号名。
 *
 * 所以：
 *   1. 清 notes_session（自建会话）
 *   2. 清 CF_Authorization（Access 会话 cookie）
 *   3. 返回 accessLogoutUrl，前端跳它做真正的 Access 登出
 *
 * Access 的登出端点在 team domain 上：
 *   https://<team>.cloudflareaccess.com/cdn-cgi/access/logout
 * 它会清掉边缘会话并把用户带回 redirect_url。
 */
import { json } from "../_auth.js"
import { clearSessionCookie } from "../_session.js"

const ACCESS_TEAM_DOMAIN = "https://fragrant-lake-4e06.cloudflareaccess.com"

/** 清 Access 的会话 cookie（域名是当前站点，不是 .hfhfn.dpdns.org） */
function clearAccessCookie(request) {
  const host = new URL(request.url).hostname
  // CF_Authorization 是 Host-only cookie，Domain 必须留空
  return `CF_Authorization=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax; Domain=${host}`
}

/** 清 Access 的 AppSession（边缘层会话，非 HttpOnly，可清） */
function clearAppSession(request) {
  const host = new URL(request.url).hostname
  return `CF_AppSession=; Path=/; Max-Age=0; Secure; SameSite=Lax; Domain=${host}`
}

function accessLogoutUrl(request) {
  const origin = new URL(request.url).origin
  return `${ACCESS_TEAM_DOMAIN}/cdn-cgi/access/logout?redirect_url=${encodeURIComponent(origin + "/")}`
}

export async function onRequestPost({ request }) {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  })
  headers.append("set-cookie", clearSessionCookie())
  headers.append("set-cookie", clearAccessCookie(request))
  headers.append("set-cookie", clearAppSession(request))

  return new Response(
    JSON.stringify({
      ok: true,
      // 前端拿到这个就跳过去，完成 Access 侧登出
      accessLogoutUrl: accessLogoutUrl(request),
    }),
    { status: 200, headers },
  )
}

// 允许 GET 直接登出（方便页面里放个普通链接）
export async function onRequestGet({ request }) {
  const headers = new Headers({
    location: accessLogoutUrl(request),
    "cache-control": "no-store",
  })
  headers.append("set-cookie", clearSessionCookie())
  headers.append("set-cookie", clearAccessCookie(request))
  headers.append("set-cookie", clearAppSession(request))

  return new Response(null, { status: 302, headers })
}
