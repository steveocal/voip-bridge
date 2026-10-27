-- The SIP extension whose softphone logged each leg (dashboard / Android
-- app legs only; Asterisk's trunk leg has none). Used to keep calls taken on
-- HIDDEN_EXTENSIONS (src/calllegs.ts) out of the shared history and Odoo.
-- Apply: npx wrangler d1 execute voip-bridge-d1 --remote --yes --file=./migrations/0012_call_extension.sql
ALTER TABLE call_log ADD COLUMN extension TEXT;
