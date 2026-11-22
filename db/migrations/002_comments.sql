-- 自建评论系统
--
-- 设计取舍：
--   1. 登录复用站点会话（HMAC cookie），不引入第二套账号体系。
--      邮箱验证码 / Google OAuth / GitHub OAuth 三种登录方式进来都是同一个 email。
--   2. 用 slug 聚合，和 bookmarks/likes/history 一致（Quartz 的 pathname mapping）。
--   3. 软删除（deleted_at），保留审计痕迹；查询时过滤。
--   4. 嵌套回复用 parent_id 自引用，限制一层（回复的回复挂到同一个顶层评论下）。

CREATE TABLE IF NOT EXISTS comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slug       TEXT NOT NULL,
  parent_id  INTEGER,
  email      TEXT NOT NULL,
  name       TEXT,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (parent_id) REFERENCES comments(id)
);

CREATE INDEX IF NOT EXISTS idx_comments_slug ON comments(slug, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_comments_email ON comments(email, created_at DESC);

-- 表情回应：每人每条评论每种表情只能点一次
CREATE TABLE IF NOT EXISTS comment_reactions (
  comment_id INTEGER NOT NULL,
  email      TEXT NOT NULL,
  emoji      TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (comment_id, email, emoji),
  FOREIGN KEY (comment_id) REFERENCES comments(id)
);

CREATE INDEX IF NOT EXISTS idx_reactions_comment ON comment_reactions(comment_id);
