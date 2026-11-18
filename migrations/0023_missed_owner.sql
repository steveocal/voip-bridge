-- Missed-call ownership (src/missed.ts). Unanswered calls show to everyone;
-- this says who is calling back ("claimed") and when it was dealt with
-- ("done"), so two people don't both ring back or nobody does. A later
-- answered call with the same number counts as done without a row here.
-- One row per leg of the call (call_log.id), like call_hidden.
-- Apply: npx wrangler d1 execute voip-bridge-d1 --remote --yes --file=./migrations/0023_missed_owner.sql
CREATE TABLE IF NOT EXISTS missed_owner (
  call_log_id INTEGER PRIMARY KEY,
  own_id INTEGER,                  -- res.users.id calling back
  own_name TEXT,
  own_at INTEGER,
  done_id INTEGER,
  done_name TEXT,
  done_at INTEGER,
  reopened_at INTEGER              -- a later answered call only counts as done after this
);
