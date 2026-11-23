/**
 * 视频与专题的「公开站隐藏」开关
 *
 *   POST /api/video-visibility   { slug, hidden: true|false }
 *   GET  /api/video-visibility   → 当前用户隐藏了哪些 slug
 *
 * 为什么单独一张表而不是复用 collections：
 * collections 表达「我的书架状态」，这里是「这条笔记要不要在公开站出现」，
 * 语义完全不同，混在一起会让「我的书架」查询变脏。
 *
 * 只影响公开站（hfhfn-notes），私有站始终显示全部。
 * 实现方式：构建公开站时读这张表，把 hidden 的 slug 从 content-public 剔除。
 */
import { json, requireUser } from "./_auth.js"

const ADMIN_ONLY = true

function adminEmails(env) {
  return String(env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUser(request, env)
  if (!user) return json({ authed: false, hidden: [] })

  try {
    const { results } = await env.DB.prepare(
      `SELECT slug FROM video_visibility WHERE hidden = 1`,
    ).all()
    // isAdmin 让前端决定是否显示隐藏按钮 —— 普通读者看不到这个开关
    const admins = adminEmails(env)
    const isAdmin = admins.includes(String(user.email || "").toLowerCase())
    return json({
      authed: true,
      isAdmin,
      hidden: (results || []).map((r) => r.slug),
    })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUser(request, env)
  if (!user) return response

  // 只有管理员能改（这个开关影响的是公开站，不是个人书架）
  if (ADMIN_ONLY) {
    const admins = adminEmails(env)
    if (!admins.includes(user.email.toLowerCase())) {
      return json({ error: "仅管理员可操作", code: "forbidden" }, 403)
    }
  }

  let body
  try {
    body = await request.json()
  } catch {
    return json({ error: "请求体不是 JSON" }, 400)
  }

  const slug = String(body?.slug || "").trim()
  if (!slug) return json({ error: "缺少 slug" }, 400)

  const hidden = body?.hidden ? 1 : 0

  try {
    await env.DB.prepare(
      `INSERT INTO video_visibility (slug, hidden, by_email, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(slug) DO UPDATE SET
         hidden = excluded.hidden,
         by_email = excluded.by_email,
         updated_at = datetime('now')`,
    )
      .bind(slug, hidden, user.email)
      .run()

    return json({ ok: true, slug, hidden: Boolean(hidden) })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
}
