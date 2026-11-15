-- Every wake-up push (POST /push/wake from Asterisk): when, which extension,
-- the caller, how many devices it went to and what FCM said for each, so a
-- phone that didn't ring can be traced. Rows older than 60 days are dropped
-- as new ones arrive.
-- Apply: npx wrangler d1 execute voip-bridge-d1 --remote --yes --file=./migrations/0021_push_log.sql
CREATE TABLE IF NOT EXISTS push_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,          -- ms since epoch, when the wake arrived
  extension TEXT NOT NULL,
  type TEXT NOT NULL,           -- incoming_call | call_cancelled
  caller TEXT,
  devices INTEGER NOT NULL,     -- tokens registered for the extension
  sent INTEGER NOT NULL,        -- FCM accepted
  detail TEXT,                  -- per token: "<first 8 chars> ok|gone|error <status> <body>"
  ms INTEGER                    -- time taken (Asterisk waits on this)
);
CREATE INDEX IF NOT EXISTS push_log_at ON push_log (at);
