/**
 * GET /api/auth/debug-github?token=xxx
 *
 * 临时诊断：拿一个 GitHub access_token，直接看 /user 和 /user/emails
 * 返回什么。定位「拿不到邮箱」到底卡在哪一步。
 * **定位完必须删掉。**
 */
export async function onRequestGet({ request }) {
  const url = new URL(request.url)
  const token = String(url.searchParams.get("token") || "")
  if (!token) {
    return new Response(JSON.stringify({ error: "need ?token=" }), {
      headers: { "content-type": "application/json" },
    })
  }

  const out = {}
  const auth = { authorization: `Bearer ${token}`, accept: "application/json" }

  // 1. /user
  try {
    const r = await fetch("https://api.github.com/user", { headers: auth })
    out.userStatus = r.status
    const d = await r.json().catch(() => null)
    out.user = d
      ? {
          login: d.login,
          id: d.id,
          email: d.email,
          name: d.name,
          emailNull: d.email === null,
        }
      : null
  } catch (e) {
    out.userError = String(e)
  }

  // 2. /user/emails
  try {
    const r = await fetch("https://api.github.com/user/emails", { headers: auth })
    out.emailsStatus = r.status
    const d = await r.json().catch(() => null)
    out.emails = Array.isArray(d)
      ? d.map((e) => ({ email: e.email, primary: e.primary, verified: e.verified, vis: e.visibility }))
      : d
  } catch (e) {
    out.emailsError = String(e)
  }

  // 3. 检查 token 的 scope
  try {
    const r = await fetch("https://api.github.com/user", { headers: auth })
    out.scopes = r.headers.get("x-oauth-scopes")
    out.acceptedScopes = r.headers.get("x-accepted-oauth-scopes")
  } catch (e) {
    out.scopeError = String(e)
  }

  return new Response(JSON.stringify(out, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8" },
  })
}
