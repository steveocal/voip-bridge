-- Important (src/retention.ts): a call flagged here is left alone by the
-- retention clean-up (recordings, transcripts and the call itself), and the
-- flag goes to Odoo with the call (phone_bridge.call.important). Set on
-- every leg of the call at once.
ALTER TABLE call_log ADD COLUMN important INTEGER NOT NULL DEFAULT 0;
ALTER TABLE call_log ADD COLUMN important_by TEXT;
ALTER TABLE call_log ADD COLUMN important_at INTEGER;
