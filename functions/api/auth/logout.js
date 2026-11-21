/**
 * POST /api/auth/logout → 清掉会话 Cookie
 */
import { json } from "../_auth.js"
import { clearSessionCookie } from "../_session.js"

export async function onRequestPost() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "set-cookie": clearSessionCookie(),
    },
  })
}

// 允许 GET 直接登出（方便页面里放个普通链接）
export async function onRequestGet() {
  return new Response(null, {
    status: 302,
    headers: {
      location: "/",
      "cache-control": "no-store",
      "set-cookie": clearSessionCookie(),
    },
  })
}
