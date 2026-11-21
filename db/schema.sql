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
