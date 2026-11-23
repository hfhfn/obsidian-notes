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
 *     只清 CF_Authorization 不够 → 刷新后 Access 仍认得你
 *     → 用户反馈「登出后依然是已登录」/「退出的瞬间自动登录」。
 *
 * ⚠️ 登出端点只能用 **team 域**，参数必须叫 **returnTo**：
 *
 *   ✓ https://<team>.cloudflareaccess.com/cdn-cgi/access/logout?returnTo=<url>
 *       → 302 Found + 4 条 Set-Cookie（真的清掉了）
 *
 *   ✗ 同域 https://<site>/cdn-cgi/access/logout
 *       → 200 Error 页面（「Error ・ Cloudflare Access」），不清任何 cookie
 *   ✗ 同域 + ?returnTo=
 *       → 400 Bad Request
 *   ✗ team 域 + ?redirect_url=
 *       → 200 Error 页面，不清任何 cookie
 *
 * 之前用 redirect_url 是错的 —— 端点只返回错误页，cookie 一个都没清，
 * 于是「退出的瞬间又自动登录」（Access 还认得你）。
 * 之前还试过把用户直接送到 team 域登出页，但那个页面 302 回站点后
 * 浏览器停在中间态，用户看到「还是刚才那个界面」。
 *
 * 所以现在的做法：
 *   1. 本接口自己发 Set-Cookie 清掉全部 Access cookie（双保险）
 *   2. 同时返回 accessLogoutUrl（正确的 team 域 + returnTo）
 *   3. 前端跳过去，由 Access 清边缘会话并 302 回站点首页
 */
import { clearSessionCookie } from "../_session.js"

const ACCESS_TEAM_DOMAIN = "https://fragrant-lake-4e06.cloudflareaccess.com"

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
 * 私有站的登出地址。
 *
 * 必须是 team 域 + returnTo（见文件头部的实测对照）。
 * returnTo 指向私有站首页：登出后 Access 会 302 回去，
 * 那时已经没有会话，Access 会自动弹出它自己的登录页。
 */
function accessLogoutUrl(request) {
  const origin = new URL(request.url).origin
  const back = `${origin}/`
  return `${ACCESS_TEAM_DOMAIN}/cdn-cgi/access/logout?returnTo=${encodeURIComponent(back)}`
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
      // 私有站：前端拿到就跳过去，由 Access 清边缘会话
      // 公开站：没有 Access，直接回首页
      accessLogoutUrl: privateSite ? accessLogoutUrl(request) : null,
      redirect: "/",
    }),
    { status: 200, headers },
  )
}

// 允许 GET 直接登出（方便页面里放个普通链接）
export async function onRequestGet({ request }) {
  const privateSite = isPrivateHost(request)

  const headers = new Headers({
    location: privateSite ? accessLogoutUrl(request) : "/",
    "cache-control": "no-store",
  })
  headers.append("set-cookie", clearSessionCookie())
  if (privateSite) {
    for (const c of clearAccessCookies(request)) headers.append("set-cookie", c)
  }

  return new Response(null, { status: 302, headers })
}
