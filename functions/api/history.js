import { json, requireUser, touchUser } from "./_auth.js"

/**
 * GET  /api/history        → 我的足迹
 * POST /api/history        { slug, title } → 记一次访问（同一页只更新时间）
 * DELETE /api/history      → 清空我的足迹
 *
 * ⚠️ 数据归属一律按 user_id，不按 email。
 *    同一个人的 Gmail / GitHub / 微信等登录方式会归到同一个 user_id
 *    （见 _account.js 的 resolveAccount）。按 email 存会导致
 *    「换个方式登录足迹就空了」—— 用户反馈过「书架合并了但足迹没合并」，
 *    就是因为 007 迁移漏了这张表（已由 008 补上）。
 *    email 字段仍然写入，只用于展示和排查，不参与查询。
 */
export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUser(request, env)
  if (!user) return response

  const uid = user.userId || user.email
  const rows = await env.DB.prepare(
    `SELECT slug, title, visits, last_seen FROM history
     WHERE user_id = ? ORDER BY last_seen DESC LIMIT 200`,
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

  await touchUser(env.DB, user)

  const uid = user.userId || user.email

  // 冲突键改成 (user_id, slug) —— 见 008 迁移建的 uniq_history_uid_slug
  await env.DB.prepare(
    `INSERT INTO history (user_id, email, slug, title) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, slug) DO UPDATE SET
       visits = history.visits + 1,
       last_seen = datetime('now'),
       title = COALESCE(excluded.title, history.title),
       email = excluded.email`,
  )
    .bind(uid, user.email, slug, title)
    .run()

  return json({ ok: true })
}

export async function onRequestDelete({ request, env }) {
  const { user, response } = await requireUser(request, env)
  if (!user) return response

  const uid = user.userId || user.email
  await env.DB.prepare("DELETE FROM history WHERE user_id = ?").bind(uid).run()
  return json({ ok: true })
}
