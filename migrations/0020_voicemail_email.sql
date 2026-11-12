-- Voicemail to email (src/vmemail.ts): who each voicemail was emailed to
-- ("sent a@x, b@y"), or why it wasn't ("no recipient: …", "failed …").
-- Set once, so a repeated recording event doesn't email twice.
-- Apply: npx wrangler d1 execute voip-bridge-d1 --remote --yes --file=./migrations/0020_voicemail_email.sql
ALTER TABLE call_log ADD COLUMN vm_emailed TEXT;
-- Each extension's "Email Voicemail To" from Odoo (phone_bridge.extension
-- .voicemail_email), synced with the rest; NULL = the addon hasn't got it.
ALTER TABLE extensions ADD COLUMN voicemail_email TEXT;
