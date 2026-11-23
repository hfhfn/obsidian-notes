/**
 * POST /api/auth/logout → 清掉会话 Cookie
 * GET  /api/auth/logout → 同上，然后 302
 *
 * 两个站点的登出逻辑不一样：
 *
 *   公开站 notes.hfhfn.dpdns.org
 *     只有自建会话 notes_session。清掉即可，直接回首页。
 *
 *   私有站 private.hfhfn.dpdns.org
 *     登录态是 Cloudflare Access 签发的。实测 Access 会种 **4 个** cookie：
 *       CF_Authorization   JWT，真正决定是否放行
 *       CF_Binding         设备绑定
 *       CF_Device          设备标识
 *       CF_Session         会话
 *     之前只清了 CF_Authorization + CF_AppSession（后者根本不存在），
 *     剩下 3 个还在 → 刷新后 Access 仍认得你 → 用户反馈「登出后依然是已登录」。
 *
 * 而且：同域 /cdn-cgi/access/logout 端点只清 cookie、**不返回跳转**
 * （实测 200 且无 Location），team 域的端点也一样。所以不能靠它做跳转，
 * 必须由前端自己 fetch 它（Set-Cookie 依然生效），再自行跳转到登录页。
 */
import { clearSessionCookie } from "../_session.js"

/** 判断当前请求是否来自受 Access 保护的私有站 */
function isPrivateHost(request) {
  const host = new URL(request.url).hostname
  return host.startsWith("private.")
}

// Access 会种的全部 cookie 名。少清一个就退不掉。
const ACCESS_COOKIES = ["CF_Authorization", "CF_Binding", "CF_Device", "CF_Session", "CF_AppSession"]

/**
 * 生成清除 Access cookie 的 Set-Cookie 列表。
 *
 * 同时清 host-only 和父域两种形式：Access 在不同配置下可能用
 * Domain=<host> 或 Domain=<apex>，猜错一个就清不掉。
 * 多发的清除指令对不存在的 cookie 是无害的。
 */
function clearAccessCookies(request) {
  const host = new URL(request.url).hostname
  // private.hfhfn.dpdns.org → .hfhfn.dpdns.org
  const parts = host.split(".")
  const apex = parts.length > 2 ? "." + parts.slice(-3).join(".") : null

  const out = []
  for (const name of ACCESS_COOKIES) {
    out.push(`${name}=; Path=/; Max-Age=0; Secure; SameSite=Lax`)
    out.push(`${name}=; Path=/; Max-Age=0; Secure; SameSite=Lax; Domain=${host}`)
    if (apex) {
      out.push(`${name}=; Path=/; Max-Age=0; Secure; SameSite=Lax; Domain=${apex}`)
    }
  }
  return out
}

/**
 * 登出后落点。
 *
 * 公开站 → 首页（未登录状态的首页）
 *
 * 私有站 → 首页。不要跳我们自己的 /login：
 *   私有站真正的登录方式是 Cloudflare Access，跳回站内任意受保护页面
 *   时 Access 会自动弹出它自己的登录页（邮箱验证码）。
 *   我们自己那个 /login 页面在私有站没有 OAuth 按钮（Access 项目没配
 *   Google/GitHub 的 secret），也不该承担登录职责 —— 它只是公开站的登录页。
 *
 *   前提是 Access 的 cookie 和边缘会话都清干净了，否则 Access 仍认得你，
 *   跳过去直接就是已登录状态。清 cookie 见 clearAccessCookies，
 *   清边缘会话由前端额外 fetch 一次 /cdn-cgi/access/logout。
 */
function landingPath(privateSite) {
  return "/"
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
      // 私有站前端还要额外 fetch 一次 /cdn-cgi/access/logout 清边缘会话，
      // 那个端点不返回跳转，所以落点由这里给。
      needsAccessLogout: privateSite,
      redirect: landingPath(privateSite),
    }),
    { status: 200, headers },
  )
}

// 允许 GET 直接登出（方便页面里放个普通链接）
export async function onRequestGet({ request }) {
  const privateSite = isPrivateHost(request)

  const headers = new Headers({
    location: landingPath(privateSite),
    "cache-control": "no-store",
  })
  headers.append("set-cookie", clearSessionCookie())
  if (privateSite) {
    for (const c of clearAccessCookies(request)) headers.append("set-cookie", c)
  }

  return new Response(null, { status: 302, headers })
}
