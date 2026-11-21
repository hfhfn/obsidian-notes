import { json, requireUser } from "./_auth.js"

/**
 * GET  /api/stats?slug=xxx  → { likes, views, liked }
 * POST /api/stats           { slug, action: "like" | "unlike" | "view" }
 *
 * likes / views 按 slug 聚合，两站共享同一份计数。
 * liked 需要登录才有意义（未登录恒为 false）。
 */
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url)
  const slug = String(url.searchParams.get("slug") ?? "").trim()
  if (!slug) return json({ ok: false, error: "missing_slug" }, 400)

  const [viewRow, likeRow] = await Promise.all([
    env.DB.prepare("SELECT count FROM views WHERE slug = ?").bind(slug).first(),
    env.DB.prepare("SELECT COUNT(*) AS c FROM likes WHERE slug = ?").bind(slug).first(),
  ])

  const user = getUserSafe(request)
  let liked = false
  if (user) {
    const mine = await env.DB.prepare(
      "SELECT 1 FROM likes WHERE email = ? AND slug = ?",
    )
      .bind(user.email, slug)
      .first()
    liked = !!mine
  }

  return json({
    ok: true,
    views: viewRow?.count ?? 0,
    likes: likeRow?.c ?? 0,
    liked,
  })
}

export async function onRequestPost({ request, env }) {
  let body
  try {
    body = await request.json()
  } catch {
    return json({ ok: false, error: "bad_json" }, 400)
  }

  const slug = String(body?.slug ?? "").trim()
  const action = String(body?.action ?? "").trim()
  if (!slug) return json({ ok: false, error: "missing_slug" }, 400)

  if (action === "view") {
    await env.DB.prepare(
      `INSERT INTO views (slug, count) VALUES (?, 1)
       ON CONFLICT(slug) DO UPDATE SET
         count = views.count + 1, updated_at = datetime('now')`,
    )
      .bind(slug)
      .run()
    const row = await env.DB.prepare("SELECT count FROM views WHERE slug = ?")
      .bind(slug)
      .first()
    return json({ ok: true, views: row?.count ?? 1 })
  }

  // 点赞 / 取消点赞需要登录
  const { user, response } = requireUser(request)
  if (!user) return response

  if (action === "like") {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO likes (email, slug) VALUES (?, ?)",
    )
      .bind(user.email, slug)
      .run()
  } else if (action === "unlike") {
    await env.DB.prepare("DELETE FROM likes WHERE email = ? AND slug = ?")
      .bind(user.email, slug)
      .run()
  } else {
    return json({ ok: false, error: "bad_action" }, 400)
  }

  const row = await env.DB.prepare("SELECT COUNT(*) AS c FROM likes WHERE slug = ?")
    .bind(slug)
    .first()

  return json({
    ok: true,
    likes: row?.c ?? 0,
    liked: action === "like",
  })
}

function getUserSafe(request) {
  try {
    const token =
      request.headers.get("Cf-Access-Jwt-Assertion") ||
      (request.headers.get("Cookie") || "")
        .split(";")
        .map((s) => s.trim())
        .find((s) => s.startsWith("CF_Authorization="))
        ?.slice("CF_Authorization=".length)
    if (!token) return null
    const [, payload] = token.split(".")
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/")
    const json = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4))
    const data = JSON.parse(json)
    const email = data.email || data.sub
    return email ? { email: String(email).toLowerCase() } : null
  } catch {
    return null
  }
}
