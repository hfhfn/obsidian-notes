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
