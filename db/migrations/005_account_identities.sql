-- 账号身份表：把「同一个人的多个登录方式」归到一个账号。
--
-- 背景：现在 users 以 email 为主键，导致同一个人的 Google 邮箱和
-- GitHub 邮箱被当成两个账号，书架、收藏、足迹各看各的。
--
-- 设计：
--   users.id         内部稳定 ID（新增，自增），所有业务数据以后都挂它
--   identities       (provider, provider_uid) → user_id 的映射
--                    同一邮箱在不同 provider 下也能归到一起
--   account_links    邮箱 → user_id，用于「用另一个邮箱登录时识别是同一个人」
--
-- 合并规则（按优先级）：
--   1. provider + provider_uid 已存在 → 直接登录该 user
--   2. 该 email 已在 account_links 里 → 登录已有 user（跨 provider 合并）
--   3. email 在 ADMIN_EMAILS 里 → 归到管理员主账号
--   4. 都没有 → 新建 user

ALTER TABLE users ADD COLUMN id TEXT;

-- 给已有行补 id（用 email 的哈希做稳定值，避免随机导致迁移不可重入）
UPDATE users SET id = lower(hex(randomblob(8))) WHERE id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_id ON users(id);

CREATE TABLE IF NOT EXISTS identities (
  provider      TEXT NOT NULL,             -- 'google' | 'github' | 'email'
  provider_uid  TEXT NOT NULL,             -- provider 侧的用户 ID
  user_id       TEXT NOT NULL,
  email         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (provider, provider_uid)
);

CREATE INDEX IF NOT EXISTS idx_identities_user ON identities(user_id);

CREATE TABLE IF NOT EXISTS account_links (
  email      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0,   -- 主邮箱（管理员的第一个邮箱）
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_account_links_user ON account_links(user_id);
