-- Swipes on a History row (dashboard). Per user: one person archiving or
-- deleting a shared call doesn't touch anyone else's history, Odoo, the
-- recording or the notes.
--   archived: left out of History, but searches still find it.
--   deleted:  left out of History, searches and the contact's Calls tab.
-- call_log_id is one leg of the call (call_log.id); the call is hidden
-- when any of its legs is.
-- Apply: npx wrangler d1 execute voip-bridge-d1 --remote --yes --file=./migrations/0019_call_hidden.sql
CREATE TABLE IF NOT EXISTS call_hidden (
  user_id INTEGER NOT NULL,
  call_log_id INTEGER NOT NULL,
  kind TEXT NOT NULL,              -- archived | deleted
  at INTEGER NOT NULL,
  PRIMARY KEY (user_id, call_log_id)
);
