import { json, requireUser, touchUser } from "./_auth.js"

/**
 * GET  /api/history        → 我的足迹
 * POST /api/history        { slug, title } → 记一次访问（同一页只更新时间）
 * DELETE /api/history      → 清空我的足迹
 */
export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUser(request, env)
  if (!user) return response

  const rows = await env.DB.prepare(
    `SELECT slug, title, visits, last_seen FROM history
     WHERE email = ? ORDER BY last_seen DESC LIMIT 200`,
  )
    .bind(user.email)
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

  await touchUser(env.DB, user)

  await env.DB.prepare(
    `INSERT INTO history (email, slug, title) VALUES (?, ?, ?)
     ON CONFLICT(email, slug) DO UPDATE SET
       visits = history.visits + 1,
       last_seen = datetime('now'),
       title = COALESCE(excluded.title, history.title)`,
  )
    .bind(user.email, slug, title)
    .run()

  return json({ ok: true })
}

export async function onRequestDelete({ request, env }) {
  const { user, response } = await requireUser(request, env)
  if (!user) return response

  await env.DB.prepare("DELETE FROM history WHERE email = ?").bind(user.email).run()
  return json({ ok: true })
}
