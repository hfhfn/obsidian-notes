-- 视频与专题：公开站可见性
--
-- 只有管理员能改。hidden=1 的笔记在构建公开站时被剔除，
-- 私有站不受影响（始终显示全部）。
-- 不放在 collections 表里：那是「我的书架状态」，语义不同。

CREATE TABLE IF NOT EXISTS video_visibility (
  slug       TEXT PRIMARY KEY,
  hidden     INTEGER NOT NULL DEFAULT 0,
  by_email   TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
