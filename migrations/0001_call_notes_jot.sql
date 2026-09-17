-- Adds combined call-notes (editor + jot) storage to call_log.
-- Apply: npx wrangler d1 execute voip-bridge-d1 --remote --file=./migrations/0001_call_notes_jot.sql
ALTER TABLE call_log ADD COLUMN notes_html TEXT;
ALTER TABLE call_log ADD COLUMN jot_svg TEXT;
ALTER TABLE call_log ADD COLUMN jot_json TEXT;
