/**
 * 站内收藏 API
 *
 *   GET    /api/collections?kind=book         → 当前用户的书架
 *   POST   /api/collections                   { itemKey, kind, title, status, progress?, cover?, url? }
 *   DELETE /api/collections?itemKey=book:123  → 移除
 *
 * 复用站点的 notes_session Cookie，和评论/收藏/点赞同一套登录。
 *
 * 为什么不直接同步豆瓣：豆瓣收藏页需要登录态，未登录访问返回
 * 「没有访问权限」，服务端无法代读者读取。所以改成站内自标记。
 *
 * ⚠️ 数据归属：一律按 user_id，不按 email。
 *    同一个人的 Gmail / GitHub / 微信等多个登录方式会归到同一个
 *    user_id（见 _account.js 的 resolveAccount），按 email 存会导致
 *    「换个方式登录就看不到自己的书架」。
 *    email 字段仍然写入，只用于展示和发信，不参与查询。
 */
import { json, requireUser, touchUser } from "./_auth.js"

const KINDS = new Set(["book", "movie"])
// hidden 用于「移除原本就在书架里的笔记卡」：
// 那些卡片来自笔记 frontmatter，不是用户标记加的，
// 删 collections 行没有意义，用一个 hidden 标记让前端过滤掉。
const STATUS = new Set(["wish", "doing", "done", "hidden"])

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url)
  const kind = url.searchParams.get("kind") || "book"
  if (!KINDS.has(kind)) return json({ error: "kind 无效" }, 400)

  const { user, response } = await requireUser(request, env)
  // 未登录不报错，返回空列表让前端显示「登录后可同步书架」
  if (!user) return json({ authed: false, items: [] })

  // 老会话可能没有 uid（登录时 identities 表还没建）。
  // 用 email 反查一次，拿不到就按 email 自己兜底，避免整页空白。
  const uid = user.userId || user.email
  if (!uid) return json({ authed: true, items: [] })

  try {
    const { results } = await env.DB.prepare(
      `SELECT item_key, kind, title, status, progress, cover, url, updated_at
         FROM collections
        WHERE user_id = ? AND kind = ?
        ORDER BY updated_at DESC`,
    )
      .bind(uid, kind)
      .all()

    return json({ authed: true, items: results || [] })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUser(request, env)
  if (!user) return response

  let body
  try {
    body = await request.json()
  } catch {
    return json({ error: "请求体不是 JSON" }, 400)
  }

  const { itemKey, kind, title, status } = body || {}
  if (!itemKey || !KINDS.has(kind)) return json({ error: "itemKey/kind 无效" }, 400)
  if (!STATUS.has(status)) return json({ error: "status 无效" }, 400)

  const progress = Math.max(0, Math.min(100, Number(body.progress) || 0))
  const uid = user.userId || user.email

  try {
    await touchUser(env.DB, user)

    // 冲突键改成 (user_id, item_key) —— 见 007 迁移建的 uniq_collections_uid_item
    await env.DB.prepare(
      `INSERT INTO collections (user_id, email, item_key, kind, title, status, progress, cover, url, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id, item_key) DO UPDATE SET
         status = excluded.status,
         progress = excluded.progress,
         title = COALESCE(excluded.title, collections.title),
         cover = COALESCE(excluded.cover, collections.cover),
         url = COALESCE(excluded.url, collections.url),
         email = excluded.email,
         updated_at = datetime('now')`,
    )
      .bind(
        uid,
        user.email,
        String(itemKey),
        kind,
        title || "",
        status,
        progress,
        body.cover || "",
        body.url || "",
      )
      .run()

    return json({ ok: true, itemKey, status, progress })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
}

export async function onRequestDelete({ request, env }) {
  const { user, response } = await requireUser(request, env)
  if (!user) return response

  const url = new URL(request.url)
  const itemKey = url.searchParams.get("itemKey")
  if (!itemKey) return json({ error: "缺少 itemKey" }, 400)

  const uid = user.userId || user.email

  try {
    await env.DB.prepare(`DELETE FROM collections WHERE user_id = ? AND item_key = ?`)
      .bind(uid, itemKey)
      .run()
    return json({ ok: true, itemKey })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
}
