-- 笔记站互动数据
--
-- 用户身份来自 Cloudflare Access 的 JWT（email 字段），不另建账号表。
-- 统计（likes / views）按 slug 聚合，两站共享同一份数据。

-- 登录用户（首次交互时自动建档）
CREATE TABLE IF NOT EXISTS users (
  email      TEXT PRIMARY KEY,
  name       TEXT,
  first_seen TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 收藏：每人每页一条
CREATE TABLE IF NOT EXISTS bookmarks (
  email     TEXT NOT NULL,
  slug      TEXT NOT NULL,
  title     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (email, slug)
);
CREATE INDEX IF NOT EXISTS idx_bookmarks_email ON bookmarks(email, created_at DESC);

-- 浏览足迹：每人每页一条，重复访问只更新时间和计数
CREATE TABLE IF NOT EXISTS history (
  email      TEXT NOT NULL,
  slug       TEXT NOT NULL,
  title      TEXT,
  visits     INTEGER NOT NULL DEFAULT 1,
  last_seen  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (email, slug)
);
CREATE INDEX IF NOT EXISTS idx_history_email ON history(email, last_seen DESC);

-- 点赞：允许取消，所以是「有记录=已赞」
CREATE TABLE IF NOT EXISTS likes (
  email     TEXT NOT NULL,
  slug      TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (email, slug)
);
CREATE INDEX IF NOT EXISTS idx_likes_slug ON likes(slug);

-- 阅读数：按 slug 累加，两站共享
CREATE TABLE IF NOT EXISTS views (
  slug  TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 邮件订阅
CREATE TABLE IF NOT EXISTS subscribers (
  email      TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  confirmed  INTEGER NOT NULL DEFAULT 1,
  unsub_token TEXT NOT NULL
);

-- 自建邮箱登录的一次性验证码
--
-- 一张表同时承担两个角色：
--   1. 待验证的验证码（code_hash 非空，consumed = 0）
--   2. 限流记录（每次请求都插一行，code_hash 为空）
-- 这样「每小时每邮箱最多 5 次」只需 COUNT 即可，不用额外维护计数器。
CREATE TABLE IF NOT EXISTS login_codes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL,
  code_hash  TEXT,
  expires_at TEXT,
  attempts   INTEGER NOT NULL DEFAULT 0,
  consumed   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_login_codes_email ON login_codes(email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_codes_pending ON login_codes(email, consumed, expires_at);
