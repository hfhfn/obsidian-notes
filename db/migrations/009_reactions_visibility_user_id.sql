-- 009: comment_reactions / video_visibility 补 user_id
--
-- 与 007、008 同一类问题：业务数据按 email 归属，导致同一个人的
-- 多个登录方式各存各的。这两张表是 007/008 之后剩下的最后两张
-- 个人数据表。
--
--   comment_reactions  表情回应：同一个人的两个邮箱能各点一次同一评论
--   video_visibility   视频隐藏：换个方式登录，隐藏状态就丢了
--
-- views / subscribers 刻意不改：
--   views        按 slug 聚合的全站统计，不属于个人
--   subscribers  邮件订阅按邮箱是正确语义（退订链接绑定邮箱）

-- ---------- comment_reactions ----------
ALTER TABLE comment_reactions ADD COLUMN user_id TEXT;

UPDATE comment_reactions
   SET user_id = (
     SELECT al.user_id FROM account_links al
      WHERE al.email = comment_reactions.email
      LIMIT 1
   )
 WHERE user_id IS NULL;

UPDATE comment_reactions
   SET user_id = lower(hex(randomblob(8)))
 WHERE user_id IS NULL;

-- 同一 (user_id, comment_id, emoji) 只留一条
DELETE FROM comment_reactions
 WHERE rowid NOT IN (
   SELECT MAX(rowid) FROM comment_reactions GROUP BY user_id, comment_id, emoji
 );

CREATE UNIQUE INDEX IF NOT EXISTS uniq_reactions_uid
  ON comment_reactions(user_id, comment_id, emoji);

-- ---------- video_visibility 说明 ----------
-- 这张表刻意不改 user_id。
--
-- 它是「管理员把某条视频从公开站隐藏」的全站开关：hidden=1 后
-- 所有未登录读者都看不到，by_email 只是记录操作者。
-- 按 user_id 隔离反而会让「管理员 A 隐藏了、管理员 B 看不到」，
-- 破坏它作为全站开关的语义。
