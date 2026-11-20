-- One-time setup links from the onboarding email (src/users.ts
-- handleSetupLink / handleSetupRedeem). Odoo asks for one when it emails a
-- new user; tapping it on the phone signs the app in as that extension.
-- Only a hash of the token is kept.
CREATE TABLE IF NOT EXISTS setup_links (
  token_hash TEXT PRIMARY KEY,
  ext TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_setup_links_ext ON setup_links(ext);
