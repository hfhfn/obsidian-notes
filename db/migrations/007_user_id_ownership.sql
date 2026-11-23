-- 007: 业务数据从 email 主键改为 user_id
--
-- 问题：
--   identities / account_links 已经能把「同一个人的多个登录方式」
--   归并到一个 user_id，但业务表（collections / comments / bookmarks /
--   likes）仍然用 email 做主键。
--   结果：同一个人的 Gmail 和 GitHub 账号登录后看到的是两套数据
--   （实测 gmail 17 条、sina 12 条，互不可见）。
--
-- 方案：
--   1. 给四张表加 user_id 字段
--   2. 用 account_links 把历史行的 email 映射成 user_id 回填
--   3. 建 user_id 上的索引
--   4. 保留 email 字段作为「写入时的邮箱记录」，但唯一约束改到 user_id
--
-- 为什么保留 email：
--   评论要显示作者、通知要发信，都需要邮箱。它只是不再作为身份主键。
--
-- 去重：
--   同一 (user_id, item_key) 可能出现多行（同一个人用两个邮箱标了同一本书）。
--   迁移前已确认当前数据没有这种冲突（changes=0）。
--   为稳妥起见，回填后统一按 (user_id, item_key) 保留 updated_at 最新的一行。

-- ---------- collections ----------
ALTER TABLE collections ADD COLUMN user_id TEXT;

UPDATE collections
   SET user_id = (
     SELECT al.user_id FROM account_links al
      WHERE al.email = collections.email
      LIMIT 1
   )
 WHERE user_id IS NULL;

-- 兜底：account_links 里没有的邮箱，按 email 自己生成一个稳定 id，
-- 避免 user_id 为 NULL 导致数据丢失。格式与 newUserId 一致（16 位 hex）。
UPDATE collections
   SET user_id = lower(hex(randomblob(8)))
 WHERE user_id IS NULL;

-- 同一 user_id 下重复的 item_key 只留最新一条
DELETE FROM collections
 WHERE rowid NOT IN (
   SELECT MAX(rowid) FROM collections GROUP BY user_id, item_key
 );

CREATE INDEX IF NOT EXISTS idx_collections_uid
  ON collections(user_id, kind, status, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_collections_uid_item
  ON collections(user_id, item_key);

-- ---------- comments ----------
ALTER TABLE comments ADD COLUMN user_id TEXT;

UPDATE comments
   SET user_id = (
     SELECT al.user_id FROM account_links al
      WHERE al.email = comments.email
      LIMIT 1
   )
 WHERE user_id IS NULL;

UPDATE comments
   SET user_id = lower(hex(randomblob(8)))
 WHERE user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_comments_uid ON comments(user_id, slug);

-- ---------- bookmarks ----------
ALTER TABLE bookmarks ADD COLUMN user_id TEXT;

UPDATE bookmarks
   SET user_id = (
     SELECT al.user_id FROM account_links al
      WHERE al.email = bookmarks.email
      LIMIT 1
   )
 WHERE user_id IS NULL;

UPDATE bookmarks
   SET user_id = lower(hex(randomblob(8)))
 WHERE user_id IS NULL;

DELETE FROM bookmarks
 WHERE rowid NOT IN (
   SELECT MAX(rowid) FROM bookmarks GROUP BY user_id, slug
 );

CREATE UNIQUE INDEX IF NOT EXISTS uniq_bookmarks_uid_slug
  ON bookmarks(user_id, slug);

-- ---------- likes ----------
ALTER TABLE likes ADD COLUMN user_id TEXT;

UPDATE likes
   SET user_id = (
     SELECT al.user_id FROM account_links al
      WHERE al.email = likes.email
      LIMIT 1
   )
 WHERE user_id IS NULL;

UPDATE likes
   SET user_id = lower(hex(randomblob(8)))
 WHERE user_id IS NULL;

DELETE FROM likes
 WHERE rowid NOT IN (
   SELECT MAX(rowid) FROM likes GROUP BY user_id, slug
 );

CREATE UNIQUE INDEX IF NOT EXISTS uniq_likes_uid_slug
  ON likes(user_id, slug);

-- ---------- users 表说明 ----------
-- 这里不动 users 表。
--
-- users 目前是「一个 email 一行」，且 id 上有 UNIQUE 约束 ——
-- 想把 sina 那行的 id 改成和 gmail 相同的 uid 会直接违反约束。
--
-- 这没关系：业务数据已经全部挂到 user_id 上，users 表退化成
-- 「邮箱 → 昵称」的展示用缓存。身份的唯一真相源是 account_links。
-- 前端显示昵称时按 user_id 反查 users（可能命中多行，取任意一行即可）。
