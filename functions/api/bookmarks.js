import { json, requireUser, touchUser } from "./_auth.js"

/**
 * GET  /api/bookmarks        → 我的收藏列表
 * POST /api/bookmarks        { slug, title } → 切换收藏，返回 { bookmarked }
 */
export async function onRequestGet({ request, env }) {
  const { user, response } = requireUser(request)
  if (!user) return response

  const rows = await env.DB.prepare(
    `SELECT slug, title, created_at FROM bookmarks
     WHERE email = ? ORDER BY created_at DESC LIMIT 500`,
  )
    .bind(user.email)
    .all()

  return json({ ok: true, items: rows.results ?? [] })
}

export async function onRequestPost({ request, env }) {
  const { user, response } = requireUser(request)
  if (!user) return response

  let body
  try {
    body = await request.json()
  } catch {
    return json({ ok: false, error: "bad_json" }, 400)
  }

  const slug = String(body?.slug ?? "").trim()
  const title = String(body?.title ?? "").trim().slice(0, 300)
  if (!slug) return json({ ok: false, error: "missing_slug" }, 400)

  await touchUser(env.DB, user)

  const existing = await env.DB.prepare(
    "SELECT 1 FROM bookmarks WHERE email = ? AND slug = ?",
  )
    .bind(user.email, slug)
    .first()

  if (existing) {
    await env.DB.prepare("DELETE FROM bookmarks WHERE email = ? AND slug = ?")
      .bind(user.email, slug)
      .run()
    return json({ ok: true, bookmarked: false })
  }

  await env.DB.prepare(
    "INSERT INTO bookmarks (email, slug, title) VALUES (?, ?, ?)",
  )
    .bind(user.email, slug, title)
    .run()
  return json({ ok: true, bookmarked: true })
}
