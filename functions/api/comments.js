/**
 * 评论 API
 *
 *   GET    /api/comments?slug=xxx        → 该页评论树（含表情聚合）
 *   POST   /api/comments                 { slug, body, parentId? }  → 发评论
 *   POST   /api/comments/reaction        { commentId, emoji }       → 切换表情回应
 *   DELETE /api/comments                 { id }                     → 删除（本人或管理员）
 *
 * 登录复用站点会话（见 _auth.js）：邮箱验证码 / Google / GitHub 三种方式
 * 进来都是同一个 email，不需要第二套账号体系。
 */
import { json, requireUser, touchUser, getUser } from "./_auth.js"

/** 单条评论最大长度 */
const MAX_BODY = 4000
/** 允许的表情集合，防止前端塞任意字符进库 */
const EMOJIS = ["👍", "❤️", "🎉", "🤔", "👀"]

/** 管理员邮箱：可删任何评论 */
function isAdmin(env, email) {
  const raw = env?.ADMIN_EMAILS || ""
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(String(email || "").toLowerCase())
}

/** Gravatar 头像 URL（md5 of lowercase email），不需要任何外部服务端调用 */
async function gravatarUrl(email, size = 64) {
  const normalized = String(email || "")
    .trim()
    .toLowerCase()
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized))
  // Gravatar 用 MD5，Workers 不提供 MD5，这里用 SHA-256 前 16 字节做稳定替代，
  // 保证同一邮箱总是同一头像即可（不追求与 Gravatar 官方一致）。
  const hex = Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32)
  return `https://www.gravatar.com/avatar/${hex}?s=${size}&d=identicon&r=pg`
}

/** 显示名：优先 name，其次邮箱前缀，避免泄露完整邮箱 */
function displayName(email, name) {
  if (name && String(name).trim()) return String(name).trim().slice(0, 40)
  const local = String(email || "").split("@")[0]
  return local.slice(0, 40) || "匿名"
}

/** 简易限流：同一账号 60 秒内最多 3 条评论 */
async function rateLimited(db, uid) {
  // 按 user_id 而不是 email —— 否则同一个人的两个邮箱
  // 各自都能发 3 条，限流等于被绕过。
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM comments
       WHERE user_id = ? AND created_at > datetime('now', '-60 seconds')`,
    )
    .bind(uid)
    .first()
  return (row?.n ?? 0) >= 3
}

/* ---------------------------------------------------------------- GET */

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url)
  const slug = String(url.searchParams.get("slug") || "").trim()
  if (!slug) return json({ ok: false, error: "missing_slug" }, 400)

  // 当前用户（可能未登录，用于标记「我赞过哪些」和「我能不能删」）
  const user = await getUser(request, env)
  const me = user?.email || ""

  // 只取未删除的，按时间正序（楼层从早到晚）
  const rows = await env.DB.prepare(
    `SELECT id, parent_id, email, name, body, created_at, updated_at
     FROM comments
     WHERE slug = ? AND deleted_at IS NULL
     ORDER BY created_at ASC
     LIMIT 500`,
  )
    .bind(slug)
    .all()

  const list = rows.results ?? []

  // 表情聚合：一次查完这批评论的所有回应，避免 N+1
  const ids = list.map((c) => c.id)
  let reactions = []
  if (ids.length) {
    const placeholders = ids.map(() => "?").join(",")
    const rr = await env.DB.prepare(
      `SELECT comment_id, emoji, user_id FROM comment_reactions
       WHERE comment_id IN (${placeholders})`,
    )
      .bind(...ids)
      .all()
    reactions = rr.results ?? []
  }

  // comment_id -> emoji -> { count, mine }
  const agg = {}
  for (const r of reactions) {
    const cid = r.comment_id
    agg[cid] ??= {}
    agg[cid][r.emoji] ??= { count: 0, mine: false }
    agg[cid][r.emoji].count++
    if (me && r.email === me) agg[cid][r.emoji].mine = true
  }

  const items = list.map((c) => ({
    id: c.id,
    parentId: c.parent_id,
    name: displayName(c.email, c.name),
    avatar: null, // 前端按 email 派生，避免服务端多算一次
    emailHash: String(c.email || "").toLowerCase(),
    body: c.body,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    mine: me ? c.email === me : false,
    canDelete: me ? c.email === me || isAdmin(env, me) : false,
    reactions: agg[c.id] ?? {},
  }))

  return json({ ok: true, items, me: me || null, emojis: EMOJIS })
}

/* --------------------------------------------------------------- POST */

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUser(request, env)
  if (!user) return response

  let body
  try {
    body = await request.json()
  } catch {
    return json({ ok: false, error: "bad_json" }, 400)
  }

  // 表情回应走同一入口，用 action 区分，避免多一个路由文件
  if (body?.action === "reaction") {
    return handleReaction({ env, user, body })
  }

  const slug = String(body?.slug || "").trim()
  const text = String(body?.body || "").trim()
  const parentId = body?.parentId ? Number(body.parentId) : null
  let finalParentId = parentId

  if (!slug) return json({ ok: false, error: "missing_slug" }, 400)
  if (!text) return json({ ok: false, error: "empty_body" }, 400)
  if (text.length > MAX_BODY) return json({ ok: false, error: "too_long" }, 400)
  if (await rateLimited(env.DB, user.userId || user.email)) {
    return json({ ok: false, error: "rate_limited" }, 429)
  }

  // 回复只能挂到同 slug 的顶层评论下（扁平两层）
  if (finalParentId) {
    const parent = await env.DB.prepare(
      "SELECT id, parent_id, slug FROM comments WHERE id = ? AND deleted_at IS NULL",
    )
      .bind(finalParentId)
      .first()
    if (!parent || parent.slug !== slug) {
      return json({ ok: false, error: "bad_parent" }, 400)
    }
    // 回复的回复 → 挂到同一个顶层评论，保持两层
    if (parent.parent_id) finalParentId = parent.parent_id
  }

  await touchUser(env.DB, user)

  const res = await env.DB.prepare(
    `INSERT INTO comments (slug, parent_id, user_id, email, name, body)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(slug, finalParentId, user.userId || user.email, user.email, user.name || null, text)
    .run()

  return json({ ok: true, id: res.meta?.last_row_id ?? null })
}

/** 切换表情回应 */
async function handleReaction({ env, user, body }) {
  const commentId = Number(body?.commentId)
  const emoji = String(body?.emoji || "")
  if (!commentId || !EMOJIS.includes(emoji)) {
    return json({ ok: false, error: "bad_params" }, 400)
  }

  const exists = await env.DB.prepare("SELECT 1 FROM comments WHERE id = ? AND deleted_at IS NULL")
    .bind(commentId)
    .first()
  if (!exists) return json({ ok: false, error: "no_comment" }, 404)

  const mine = await env.DB.prepare(
    "SELECT 1 FROM comment_reactions WHERE comment_id = ? AND user_id = ? AND emoji = ?",
  )
    .bind(commentId, user.userId || user.email, emoji)
    .first()

  if (mine) {
    await env.DB.prepare(
      "DELETE FROM comment_reactions WHERE comment_id = ? AND user_id = ? AND emoji = ?",
    )
      .bind(commentId, user.userId || user.email, emoji)
      .run()
    return json({ ok: true, active: false })
  }

  await env.DB.prepare(
    "INSERT INTO comment_reactions (comment_id, user_id, email, emoji) VALUES (?, ?, ?, ?)",
  )
    .bind(commentId, user.userId || user.email, user.email, emoji)
    .run()
  return json({ ok: true, active: true })
}

/* ------------------------------------------------------------- DELETE */

export async function onRequestDelete({ request, env }) {
  const { user, response } = await requireUser(request, env)
  if (!user) return response

  let body
  try {
    body = await request.json()
  } catch {
    return json({ ok: false, error: "bad_json" }, 400)
  }

  const id = Number(body?.id)
  if (!id) return json({ ok: false, error: "missing_id" }, 400)

  const row = await env.DB.prepare(
    "SELECT user_id, email FROM comments WHERE id = ? AND deleted_at IS NULL",
  )
    .bind(id)
    .first()
  if (!row) return json({ ok: false, error: "no_comment" }, 404)

  // 按 user_id 判断归属：同一个人的任一登录方式都能删自己的评论。
  // 老数据 user_id 可能为空，回退比较 email。
  const mine = row.user_id
    ? row.user_id === (user.userId || user.email)
    : row.email === user.email
  if (!mine && !isAdmin(env, user.email)) {
    return json({ ok: false, error: "forbidden" }, 403)
  }

  // 软删除：保留记录用于审计，查询时过滤
  await env.DB.prepare("UPDATE comments SET deleted_at = datetime('now') WHERE id = ?")
    .bind(id)
    .run()

  return json({ ok: true })
}
