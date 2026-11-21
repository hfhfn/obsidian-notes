import { SHELL, html, getUser, LOGIN_EMPTY, renderBookmarks } from "../_shared.js"

export async function onRequestGet({ request, env }) {
  const path = "/my/bookmarks"
  const user = await getUser(request, env)
  if (!user) return html(SHELL("我的收藏", LOGIN_EMPTY(path)))

  const rows = await env.DB.prepare(
    `SELECT slug, title, created_at FROM bookmarks
     WHERE email = ? ORDER BY created_at DESC LIMIT 1000`,
  ).bind(user.email).all()

  return html(SHELL("我的收藏", renderBookmarks(rows.results ?? [])))
}
