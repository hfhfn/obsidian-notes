-- 站内收藏：读者自己标记想读/在读/读过（书）或想看/在看/看过（影）
--
-- 为什么不直接同步豆瓣：豆瓣收藏页需要登录态，
-- 未登录访问会返回「没有访问权限」，无法服务端代读者读取。
-- 所以改成站内自标记：读者在自己账号下维护书架，不依赖第三方。
--
-- item_key 用「类型:豆瓣id」，如 book:26832406 / movie:26752088，
-- 这样和榜单数据（fetch_douban_charts.py 抓的）能对上。

CREATE TABLE IF NOT EXISTS collections (
  email      TEXT NOT NULL,
  item_key   TEXT NOT NULL,
  kind       TEXT NOT NULL,              -- book | movie
  title      TEXT,
  status     TEXT NOT NULL,              -- wish | doing | done
  progress   INTEGER DEFAULT 0,          -- 0-100
  cover      TEXT,                       -- 封面本地路径，便于「我的」页直接渲染
  url        TEXT,                       -- 豆瓣页链接
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (email, item_key)
);

CREATE INDEX IF NOT EXISTS idx_collections_email
  ON collections(email, kind, status, updated_at DESC);
