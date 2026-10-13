-- Voicemail greetings, recorded or uploaded in the dashboard. audio is an
-- 8 kHz mono 16-bit WAV (the browser converts to it), which Asterisk plays as
-- is. The active one and the straight-to-voicemail switch live in settings
-- (vm_greeting, vm_direct); greetings-sync.sh on the VPS copies them across.
-- call_log.voicemail = 1 when the call went to voicemail; its message is
-- stored in call_log.recording like a call recording.
-- Apply: npx wrangler d1 execute voip-bridge-d1 --remote --yes --file=./migrations/0008_voicemail.sql
CREATE TABLE IF NOT EXISTS greetings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  audio BLOB NOT NULL,
  duration_ms INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
ALTER TABLE call_log ADD COLUMN voicemail INTEGER NOT NULL DEFAULT 0;
