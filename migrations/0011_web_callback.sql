-- Callback requests from the website widget (public/callback-widget.js,
-- src/webcallback.ts). Each one also gets a call_log row (call_id "web-<id>").
-- Apply: npx wrangler d1 execute voip-bridge-d1 --remote --yes --file=./migrations/0011_web_callback.sql
CREATE TABLE IF NOT EXISTS web_callbacks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,          -- E.164
  mode TEXT NOT NULL,           -- 'now' | 'later'
  preferred_at INTEGER,         -- epoch ms, 'later' only
  page TEXT,
  ip TEXT,
  state TEXT NOT NULL,          -- calling | connecting | connected | no-answer | missed | scheduled | failed
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_web_callbacks_created ON web_callbacks(created_at);
