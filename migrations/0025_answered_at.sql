-- When a call was answered (the softphone's "answer" event), for Reports
-- (src/reports.ts): talk time = end - answered_at, and time to answer =
-- answered_at - when the call started ringing. Calls from before this have
-- NULL, and Reports fall back to ring-to-hang-up time for them.
-- Apply: npx wrangler d1 execute voip-bridge-d1 --remote --yes --file=./migrations/0025_answered_at.sql
ALTER TABLE call_log ADD COLUMN answered_at INTEGER;
CREATE INDEX IF NOT EXISTS idx_call_log_direction_start ON call_log(direction, start_date);
