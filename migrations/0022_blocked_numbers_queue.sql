-- Blocked numbers (src/blocked.ts) and the call queue's "press 2 for a
-- callback" (extensions-phone-bridge-routing.conf [pb-queue-exit]).
-- Apply: npx wrangler d1 execute voip-bridge-d1 --remote --yes --file=./migrations/0022_blocked_numbers_queue.sql
--
-- A blocked number is matched on its last 9 digits (phoneKey in odoo.ts), so
-- 01283 246490, +44 1283 246490 and 441283246490 are the same number. The PBX
-- rejects their calls before anything rings (astdb pbblock/<key>, from
-- GET /pbx/sync), and the worker drops their call events so they never reach
-- History or Odoo.
CREATE TABLE IF NOT EXISTS blocked_numbers (
  key TEXT PRIMARY KEY,         -- last 9 digits (all of them when shorter)
  number TEXT NOT NULL,         -- as entered, for display
  label TEXT,                   -- why, e.g. "Spam: solar panels"
  user_id INTEGER,              -- who blocked it
  user_name TEXT,
  created_at INTEGER NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0,   -- calls rejected since
  last_at INTEGER                    -- the last one
);
-- 1 = the caller pressed 2 in the queue: "call me back".
ALTER TABLE call_log ADD COLUMN callback INTEGER NOT NULL DEFAULT 0;
