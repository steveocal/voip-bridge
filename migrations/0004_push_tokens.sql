-- FCM device tokens for the Android app, keyed by the SIP extension the device registers as.
-- Apply: npx wrangler d1 execute voip-bridge-d1 --remote --file=./migrations/0004_push_tokens.sql
CREATE TABLE IF NOT EXISTS push_tokens (
  token TEXT PRIMARY KEY,
  extension TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_push_tokens_extension ON push_tokens(extension);
