import { json, requireUser, touchUser } from "./_auth.js"

/**
 * GET  /api/bookmarks        → 我的收藏列表
 * POST /api/bookmarks        { slug, title } → 切换收藏，返回 { bookmarked }
 */
export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUser(request, env)
  if (!user) return response

  const uid = user.userId || user.email
  const rows = await env.DB.prepare(
    `SELECT slug, title, created_at FROM bookmarks
     WHERE user_id = ? ORDER BY created_at DESC LIMIT 500`,
  )
    .bind(uid)
    .all()

  return json({ ok: true, items: rows.results ?? [] })
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUser(request, env)
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

  const uid = user.userId || user.email

  await touchUser(env.DB, user)

  const existing = await env.DB.prepare(
    "SELECT 1 FROM bookmarks WHERE user_id = ? AND slug = ?",
  )
    .bind(uid, slug)
    .first()

  if (existing) {
    await env.DB.prepare("DELETE FROM bookmarks WHERE user_id = ? AND slug = ?")
      .bind(uid, slug)
      .run()
    return json({ ok: true, bookmarked: false })
  }

  await env.DB.prepare(
    "INSERT INTO bookmarks (user_id, email, slug, title) VALUES (?, ?, ?, ?)",
  )
    .bind(uid, user.email, slug, title)
    .run()
  return json({ ok: true, bookmarked: true })
}
