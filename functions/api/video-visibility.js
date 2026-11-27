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
import { json, requireUser, adminEmails } from "./_auth.js"

const ADMIN_ONLY = true

export async function onRequestGet({ request, env }) {
  const { user } = await requireUser(request, env)

  // 隐藏列表必须对所有人可读，包括未登录的普通读者。
  //
  // 为什么：隐藏是「管理员点一下就生效」的实时操作，靠前端拿这份名单
  // 过滤卡片。以前未登录直接返回 hidden: []，普通读者拿不到名单，
  // 只能看到构建时已剔除的条目 —— 管理员新隐藏的笔记要等下次构建
  // 才消失（用户反馈「操作隐藏是前端实现的，不自动更新还得手动重建，
  // 不合理」）。
  //
  // 公开这份名单安全吗：安全。它只说「这几个 slug 不公开」，
  // 不含正文、不含隐藏理由、不含操作者。正文页在构建时已剔除（404），
  // 搜索索引 / 标签页 / sitemap 也都剔除了。公开名单只是让前端知道
  // 该藏哪几张卡，不会让内容本身变得可读。
  try {
    const { results } = await env.DB.prepare(
      `SELECT slug FROM video_visibility WHERE hidden = 1`,
    ).all()

    // isAdmin 只在登录后才有意义 —— 它决定要不要显示隐藏按钮。
    // 未登录时给 false，前端据此隐藏按钮，但照样能拿到 hidden 列表。
    let isAdmin = false
    if (user) {
      const admins = adminEmails(env)
      isAdmin = admins.includes(String(user.email || "").toLowerCase())
    }

    return json({
      authed: Boolean(user),
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
