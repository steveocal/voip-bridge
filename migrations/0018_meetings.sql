-- Apply: npx wrangler d1 execute voip-bridge-d1 --remote --yes --command "<each CREATE TABLE below>"
-- Meeting recordings (src/meetings.ts). The dashboard records the room at
-- 16 kHz and uploads 30 s blocks to R2 (bucket voip-bridge-meetings) as it
-- goes. *91 starts a meeting, *92 adds a part to the user's last one. Each
-- 3-minute piece is transcribed once its blocks are in; when a part ends, the
-- whole meeting is summarised and emailed to the user.
CREATE TABLE IF NOT EXISTS meetings (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  ext TEXT,
  label TEXT,                      -- when it started, as the dashboard wrote it ("Mon 3 Nov, 14:05")
  title TEXT,                      -- the AI's title once summarised
  started_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  parts INTEGER NOT NULL DEFAULT 0,
  seconds REAL NOT NULL DEFAULT 0, -- recorded length, all parts
  status TEXT NOT NULL DEFAULT 'recording', -- recording | done | failed
  transcript TEXT,
  summary_html TEXT,
  emailed_part INTEGER NOT NULL DEFAULT 0,
  email_error TEXT,
  error TEXT
);
CREATE INDEX IF NOT EXISTS meetings_user ON meetings (user_id, started_at);
CREATE TABLE IF NOT EXISTS meeting_parts (
  meeting_id TEXT NOT NULL,
  part INTEGER NOT NULL,
  label TEXT,
  started_at INTEGER NOT NULL,
  blocks INTEGER NOT NULL DEFAULT 0,   -- blocks the dashboard said it recorded (set when the part ends)
  ended INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (meeting_id, part)
);
CREATE TABLE IF NOT EXISTS meeting_pieces (
  meeting_id TEXT NOT NULL,
  part INTEGER NOT NULL,
  piece INTEGER NOT NULL,
  lines TEXT NOT NULL,                 -- JSON [{t, text, en?}], t = seconds into the part
  PRIMARY KEY (meeting_id, part, piece)
);
