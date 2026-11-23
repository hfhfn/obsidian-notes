-- 用户名 + 密码登录。
--
-- 为什么加：
--   站点原来只有「邮箱验证码 + Google/GitHub OAuth」三种方式，
--   自己测试时每次都要收邮件或走第三方授权，很不方便。
--   加密码登录后可以直接开一个测试账号。
--
-- 安全：
--   - 密码用 PBKDF2-SHA256（Web Crypto 原生支持，Cloudflare Workers 可用）
--   - 每个账号独立 salt，存 iterations 以便以后升级参数
--   - 只在 password_hash 非空时允许密码登录；普通用户（验证码/OAuth
--     注册的）没有密码，不受影响

CREATE TABLE IF NOT EXISTS credentials (
  email         TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,     -- pbkdf2$<iter>$<salt_b64>$<hash_b64>
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_credentials_email ON credentials(email);
