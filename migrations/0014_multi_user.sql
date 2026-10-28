-- Multi-user: every extension belongs to an Odoo user (Odoo
-- phone_bridge.extension.user_id), and calls, settings, favourites and the
-- Google account are that user's. See src/users.ts.
-- Apply: npx wrangler d1 execute voip-bridge-d1 --remote --yes --file=./migrations/0014_multi_user.sql

-- Odoo's extension → user map, refreshed from Odoo every few minutes.
CREATE TABLE IF NOT EXISTS extensions (
  number TEXT PRIMARY KEY,
  user_id INTEGER,              -- res.users.id (NULL = nobody's)
  user_name TEXT,
  user_email TEXT,
  updated_at INTEGER NOT NULL
);

-- Per-user dashboard settings (favourites, quick text, …). The old global
-- `settings` rows stay as defaults for users who haven't set their own.
CREATE TABLE IF NOT EXISTS user_settings (
  user_id INTEGER NOT NULL,
  key TEXT NOT NULL,
  value TEXT,
  updated_at INTEGER,
  PRIMARY KEY (user_id, key)
);

-- Each user's own Google account (Gmail + Google Contacts).
CREATE TABLE IF NOT EXISTS user_google (
  user_id INTEGER PRIMARY KEY,
  email TEXT,
  refresh_token TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- call_log.user_id (the leg's extension's user) already exists.
CREATE INDEX IF NOT EXISTS idx_call_log_user ON call_log(user_id);
-- Gmail rows are the reading user's mailbox; Odoo rows stay shared (NULL).
ALTER TABLE messages ADD COLUMN user_id INTEGER;
