-- Likely spam from IHP's own call patterns (src/spam.ts): no outside
-- service. A flagged call still rings and stays in History (⚠️), but gets
-- no new Odoo contact, isn't pushed to Odoo and isn't counted as a missed
-- call to return. "Not spam" in History clears it for the number for good.
-- Apply: npx wrangler d1 execute voip-bridge-d1 --remote --yes --file=./migrations/0024_spam.sql
ALTER TABLE call_log ADD COLUMN spam TEXT;   -- why the call looks like spam; NULL = it doesn't
CREATE TABLE IF NOT EXISTS spam_numbers (
  key TEXT PRIMARY KEY,                      -- phoneKey: last 9 digits
  verdict TEXT NOT NULL,                     -- spam (found by a rule) | ok (someone said "Not spam")
  reason TEXT,
  user_name TEXT,                            -- who said "Not spam"
  at INTEGER NOT NULL
);
