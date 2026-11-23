/**
 * 账号统一：把「同一个人的多种登录方式」归到一个 user_id。
 *
 * 为什么需要：
 *   users 表原来以 email 为主键，导致同一个人用 Google 邮箱和 GitHub
 *   邮箱登录时变成两个账号 —— 书架、收藏、足迹各看各的，管理员身份
 *   也只在其中一个账号上生效。
 *
 * 归并优先级：
 *   1. (provider, provider_uid) 已登记 → 就是这个人，直接返回
 *   2. 该 email 已在 account_links → 用已绑定的 user_id
 *      （覆盖「先 Google 后 GitHub、但两边邮箱填了同一个」的情况）
 *   3. 该 email 在 ADMIN_EMAILS → 归到管理员主账号（MASTER_ADMIN_EMAIL）
 *      （管理员可能填了两个邮箱，都指向同一个账号）
 *   4. 都不匹配 → 新建 user_id
 *
 * 任何一步命中后，都会把这次的 (provider, uid, email) 补登记进去，
 * 这样下次登录走第 1 步就能直接命中。
 */

import { adminEmails } from "./_auth.js";

/** 生成稳定的 user_id */
function newUserId() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * 解析（或创建）账号。
 *
 * @param {D1Database} db
 * @param {object} env
 * @param {{provider: string, providerUid: string, email: string, name?: string}} ident
 * @returns {Promise<{userId: string, email: string, isAdmin: boolean}>}
 */
export async function resolveAccount(db, env, ident) {
  const provider = String(ident.provider || "email").toLowerCase();
  const providerUid = String(ident.providerUid || ident.email || "").toLowerCase();
  const email = String(ident.email || "").toLowerCase();
  const name = ident.name || null;

  if (!email) throw new Error("resolveAccount: email 不能为空");

  const admins = adminEmails(env).map((e) => e.toLowerCase());
  const isAdmin = admins.includes(email);

  // ---- 1. 已登记的 provider 身份 ----
  let row = await db
    .prepare(`SELECT user_id FROM identities WHERE provider = ? AND provider_uid = ?`)
    .bind(provider, providerUid)
    .first();

  let userId = row?.user_id || null;

  // ---- 2. 该邮箱已绑定过某个账号 ----
  if (!userId) {
    row = await db
      .prepare(`SELECT user_id FROM account_links WHERE email = ?`)
      .bind(email)
      .first();
    userId = row?.user_id || null;
  }

  // ---- 3. 管理员邮箱归到主账号 ----
  // 管理员可能有多个邮箱（gmail / sina），都应落到同一个账号。
  // 主账号 = ADMIN_EMAILS 里的第一个。
  if (!userId && isAdmin && admins.length) {
    const master = admins[0];
    row = await db
      .prepare(`SELECT user_id FROM account_links WHERE email = ?`)
      .bind(master)
      .first();
    userId = row?.user_id || null;
    // 主账号还没建立 → 就用这次登录建立它
  }

  // ---- 4. 新建 ----
  if (!userId) {
    userId = newUserId();
  }

  // ---- 落库（全部幂等）----
  await db
    .prepare(
      `INSERT INTO users (email, name, id) VALUES (?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET
         last_seen = datetime('now'),
         name = COALESCE(excluded.name, users.name),
         id = COALESCE(users.id, excluded.id)`,
    )
    .bind(email, name, userId)
    .run();

  await db
    .prepare(
      `INSERT INTO identities (provider, provider_uid, user_id, email)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(provider, provider_uid) DO UPDATE SET
         user_id = excluded.user_id,
         email = excluded.email`,
    )
    .bind(provider, providerUid, userId, email)
    .run();

  await db
    .prepare(
      `INSERT INTO account_links (email, user_id, is_primary)
       VALUES (?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET user_id = excluded.user_id`,
    )
    .bind(email, userId, isAdmin && admins[0] === email ? 1 : 0)
    .run();

  return { userId, email, isAdmin };
}

/**
 * 按邮箱查 user_id（给已有数据迁移用）。
 */
export async function userIdForEmail(db, email) {
  const e = String(email || "").toLowerCase();
  const row = await db
    .prepare(`SELECT user_id FROM account_links WHERE email = ?`)
    .bind(e)
    .first();
  return row?.user_id || null;
}
