-- The extension a softphone/app was signed in as when it logged this leg
-- (the dashboard, the Android app and the Odoo panel send it as ext=), so
-- Odoo's Phone → Calls can show each extension's calls. NULL for Asterisk's
-- own trunk-leg events.
-- Apply: npx wrangler d1 execute voip-bridge-d1 --remote --yes --file=./migrations/0012_call_extension.sql
ALTER TABLE call_log ADD COLUMN extension TEXT;
