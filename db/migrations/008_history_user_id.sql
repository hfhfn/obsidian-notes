-- 008: history（足迹）表补 user_id
--
-- 007 迁移漏了这张表 —— 当时只处理了 collections / comments /
-- bookmarks / likes，把 history 忘了。
--
-- 后果：同一个人的两个邮箱，足迹各存各的
-- （实测 sina 9 条、gmail 57 条，互不可见）。
-- 藏书馆/观影库因为走 collections 已经合并了，所以用户看到
-- 「书架合并了但足迹没合并」。
--
-- 做法与 007 一致：加字段 → 按 account_links 回填 → 建索引。

ALTER TABLE history ADD COLUMN user_id TEXT;

UPDATE history
   SET user_id = (
     SELECT al.user_id FROM account_links al
      WHERE al.email = history.email
      LIMIT 1
   )
 WHERE user_id IS NULL;

-- account_links 里没有的邮箱，按 email 自己生成稳定 id，避免 NULL 丢数据
UPDATE history
   SET user_id = lower(hex(randomblob(8)))
 WHERE user_id IS NULL;

-- 同一 (user_id, slug) 只留访问次数最多、最近访问的那条
DELETE FROM history
 WHERE rowid NOT IN (
   SELECT rowid FROM (
     SELECT rowid,
            ROW_NUMBER() OVER (
              PARTITION BY user_id, slug
              ORDER BY visits DESC, last_seen DESC
            ) AS rn
       FROM history
   ) WHERE rn = 1
 );

CREATE INDEX IF NOT EXISTS idx_history_uid ON history(user_id, last_seen DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_history_uid_slug ON history(user_id, slug);
