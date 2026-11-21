import { SHELL, html, getUser, LOGIN_EMPTY, renderHistory } from "../_shared.js"

export async function onRequestGet({ request, env }) {
  const path = "/my/history"
  const user = await getUser(request, env)
  if (!user) return html(SHELL("我的足迹", LOGIN_EMPTY(path)))

  const rows = await env.DB.prepare(
    `SELECT slug, title, visits, last_seen FROM history
     WHERE email = ? ORDER BY last_seen DESC LIMIT 500`,
  ).bind(user.email).all()

  return html(SHELL("我的足迹", renderHistory(rows.results ?? [])))
}
