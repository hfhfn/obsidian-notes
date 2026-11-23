import { SHELL, html, getUser, LOGIN_EMPTY, renderBookmarks } from "../_shared.js"

export async function onRequestGet({ request, env }) {
  const path = "/my/bookmarks"
  const user = await getUser(request, env)
  if (!user) return html(SHELL("我的收藏", LOGIN_EMPTY(path)))

  // 按 user_id 查，多登录方式共享同一份收藏
  const uid = user.userId || user.email
  const rows = await env.DB.prepare(
    `SELECT slug, title, created_at FROM bookmarks
     WHERE user_id = ? ORDER BY created_at DESC LIMIT 1000`,
  ).bind(uid).all()

  return html(SHELL("我的收藏", renderBookmarks(rows.results ?? [])))
}
