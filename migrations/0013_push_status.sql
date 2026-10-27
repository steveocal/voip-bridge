-- Last push-setup result each app reported (permission denied, FCM error, ...),
-- so a phone that never registers a token can be diagnosed from here.
-- Apply: npx wrangler d1 execute voip-bridge-d1 --remote --file=./migrations/0013_push_status.sql
CREATE TABLE IF NOT EXISTS push_status (
  extension TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
