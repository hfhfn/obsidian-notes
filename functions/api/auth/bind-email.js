/**
 * POST /api/auth/bind-email   { email, code } → 把邮箱绑到当前登录账号
 *
 * 场景：
 *   GitHub 没返回真实邮箱时，登录会被拦下并要求绑定。
 *   用户输入邮箱 → 收验证码 → 提交这里 → 该邮箱并入当前账号。
 *
 * 两条路径：
 *   A. 已有会话（GitHub 已登录但 needsBind）
 *      把邮箱绑到会话里的 user_id。
 *   B. 没有会话（用户从别的入口来）
 *      按邮箱解析账号，走正常登录。
 *
 * 归并规则：
 *   - 邮箱已属于别的账号 → 拒绝，避免把别人的账号抢过来
 *   - 邮箱属于同一账号（已绑过）→ 幂等成功
 *   - 邮箱未被占用 → 绑到当前账号，并把该邮箱名下的历史业务数据一起迁过来
 */
import { json } from "../_auth.js"
import { signSession, sessionCookie } from "../_session.js"
import { resolveAccount } from "../_account.js"

const MAX_ATTEMPTS = 5
const SESSION_DAYS = 30

async function sha256Hex(input) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("")
}

export async function onRequestPost({ request, env }) {
  if (!env.SESSION_SECRET) {
    return json({ ok: false, error: "not_configured", message: "服务端未配置会话密钥" }, 503)
  }

  let body
  try {
    body = await request.json()
  } catch {
    return json({ ok: false, error: "bad_json" }, 400)
  }

  const email = String(body?.email ?? "").trim().toLowerCase()
  const code = String(body?.code ?? "").trim()
  // 前端把待绑定的 provider 身份一起带上来（GitHub 登录被拦时存在 sessionStorage）
  const provider = String(body?.provider ?? "").trim().toLowerCase()
  const providerUid = String(body?.providerUid ?? "").trim().toLowerCase()

  if (!email || !/^\d{6}$/.test(code)) {
    return json({ ok: false, error: "bad_input", message: "请输入邮箱和 6 位验证码" }, 400)
  }
  if (/@users\.noreply\.github\.com$/i.test(email)) {
    return json({ ok: false, error: "bad_email", message: "请填写真实邮箱" }, 400)
  }

  const db = env.DB

  // ---- 校验验证码（与 verify-code 同一套规则）----
  const row = await db
    .prepare(
      `SELECT id, code_hash, attempts FROM login_codes
       WHERE email = ? AND consumed = 0 AND code_hash IS NOT NULL
         AND expires_at > datetime('now')
       ORDER BY id DESC LIMIT 1`,
    )
    .bind(email)
    .first()

  if (!row) {
    return json({ ok: false, error: "code_expired", message: "验证码已过期，请重新获取" }, 400)
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    await db.prepare("UPDATE login_codes SET consumed = 1 WHERE id = ?").bind(row.id).run()
    return json({ ok: false, error: "too_many_attempts", message: "尝试次数过多，请重新获取" }, 429)
  }

  const expected = await sha256Hex(`${email}:${code}:${env.SESSION_SECRET}`)
  if (expected !== row.code_hash) {
    await db
      .prepare("UPDATE login_codes SET attempts = attempts + 1 WHERE id = ?")
      .bind(row.id)
      .run()
    const left = MAX_ATTEMPTS - (row.attempts + 1)
    return json(
      {
        ok: false,
        error: "code_wrong",
        message: left > 0 ? `验证码不对，还可以试 ${left} 次` : "验证码不对，请重新获取",
      },
      400,
    )
  }
  await db.prepare("UPDATE login_codes SET consumed = 1 WHERE id = ?").bind(row.id).run()

  // ---- 目标账号：优先 provider 身份（GitHub 被拦的情况）----
  let targetUserId = null
  if (provider && providerUid) {
    const idRow = await db
      .prepare(`SELECT user_id FROM identities WHERE provider = ? AND provider_uid = ?`)
      .bind(provider, providerUid)
      .first()
    targetUserId = idRow?.user_id || null
  }

  // 没有 provider 身份 → 按邮箱解析（等价于普通登录）
  const resolved = await resolveAccount(db, env, {
    provider: provider || "email",
    providerUid: providerUid || email,
    email,
    name: null,
  })

  if (resolved.needsBind) {
    // 理论上不会发生（这里 email 已校验非 noreply）
    return json({ ok: false, error: "needs_bind", message: "请填写真实邮箱" }, 400)
  }

  // ---- 冲突检查：邮箱已属于另一个账号 ----
  const existing = await db
    .prepare(`SELECT user_id FROM account_links WHERE email = ?`)
    .bind(email)
    .first()

  if (targetUserId && existing?.user_id && existing.user_id !== targetUserId) {
    return json(
      {
        ok: false,
        error: "email_taken",
        message: "该邮箱已绑定到另一个账号，请换一个或先在那边登录",
      },
      409,
    )
  }

  const finalUserId = targetUserId || resolved.userId

  // ---- 落库：把邮箱绑到 finalUserId ----
  await db
    .prepare(
      `INSERT INTO account_links (email, user_id, is_primary)
       VALUES (?, ?, 0)
       ON CONFLICT(email) DO UPDATE SET user_id = excluded.user_id`,
    )
    .bind(email, finalUserId)
    .run()

  await db
    .prepare(
      `INSERT INTO identities (provider, provider_uid, user_id, email)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(provider, provider_uid) DO UPDATE SET
         user_id = excluded.user_id, email = excluded.email`,
    )
    .bind(provider || "email", providerUid || email, finalUserId, email)
    .run()

  // ---- 把该邮箱名下的历史业务数据迁到 finalUserId ----
  // 用户可能在绑定前就用这个邮箱登录过，留下了收藏/评论。
  for (const table of ["collections", "comments", "bookmarks", "likes"]) {
    try {
      await db
        .prepare(`UPDATE ${table} SET user_id = ? WHERE email = ? AND (user_id IS NULL OR user_id != ?)`)
        .bind(finalUserId, email, finalUserId)
        .run()
    } catch (e) {
      // 某张表结构不同就跳过，不阻断绑定
      console.error(`[bind-email] migrate ${table} failed`, String(e))
    }
  }

  // ---- 重新签发会话（带上 uid + 真实邮箱）----
  const payload = {
    email,
    name: resolved.name || null,
    uid: finalUserId,
    exp: Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400,
  }
  const token = await signSession(env.SESSION_SECRET, payload)

  return new Response(
    JSON.stringify({ ok: true, email, userId: finalUserId, isAdmin: resolved.isAdmin }),
    {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "set-cookie": sessionCookie(token, SESSION_DAYS * 86400),
      },
    },
  )
}
