/**
 * GET /api/public-stats?slug=xxx  → { views, likes }
 *
 * 只返回公开计数，不含「我是否已赞」这类个人状态。
 * 这个接口**不受 Access 保护**（见 README 的 Access 配置说明），
 * 目的是让未登录访客也能看到阅读数和点赞数。
 *
 * 写操作（点赞、收藏）仍然走 /api/stats 和 /api/bookmarks，需要登录。
 */
import { json } from "./_auth.js"

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url)
  const slug = String(url.searchParams.get("slug") ?? "").trim()
  if (!slug) return json({ ok: false, error: "missing_slug" }, 400)

  const [viewRow, likeRow] = await Promise.all([
    env.DB.prepare("SELECT count FROM views WHERE slug = ?").bind(slug).first(),
    env.DB.prepare("SELECT COUNT(*) AS c FROM likes WHERE slug = ?").bind(slug).first(),
  ])

  return new Response(
    JSON.stringify({
      ok: true,
      views: viewRow?.count ?? 0,
      likes: likeRow?.c ?? 0,
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        // 允许短缓存，减少数据库读取
        "cache-control": "public, max-age=60",
      },
    },
  )
}
