-- UK compliance (src/compliance.ts, docs/commercial-plan.md item 4).
-- audit_log: who listened to a recording, changed retention or limits,
-- blocked a number, exported or erased a caller's data, or signed in
-- (with time and IP). Admins read it in Configuration → Audit; rows older
-- than AUDIT_DAYS are removed by the hourly cron.
-- erase_recordings: recordings of calls erased on request (Configuration →
-- Privacy) still to be deleted on the PBX; the hourly cron works through it.
-- Apply: npx wrangler d1 execute voip-bridge-d1 --remote --yes --file=./migrations/0029_compliance.sql
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  user_id INTEGER,
  user_name TEXT,
  ext TEXT,
  ip TEXT,
  action TEXT NOT NULL,     -- recording.play, retention.set, retention.run, privacy.export, privacy.erase, auth.login, auth.fail, limits.set, block.add, block.remove, block.withheld
  target TEXT,              -- call id, phone number, extension …
  detail TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action, at);

CREATE TABLE IF NOT EXISTS erase_recordings (
  name TEXT PRIMARY KEY,
  at INTEGER NOT NULL
);
