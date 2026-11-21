-- voip-bridge D1 schema
-- Apply: npx wrangler d1 execute voip-bridge-d1 --remote --file=./schema.sql
--
-- Tables mirror Odoo models so the D1 cache maps 1:1 to Odoo fields.
--   contacts  ↔  res.partner   (basic fields)
--   call_log  ↔  voip.call     (all stored fields + local Asterisk keys)
-- Datetimes are stored as epoch milliseconds (INTEGER), matching Odoo datetime.

-- ── Contacts (↔ Odoo res.partner) ─────────────────────────────
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY,          -- res.partner.id
  name TEXT NOT NULL,              -- res.partner.name
  company_type TEXT,               -- res.partner.company_type ('person' | 'company')
  is_company INTEGER DEFAULT 0,    -- res.partner.is_company
  phone TEXT,                      -- res.partner.phone
  mobile TEXT,                     -- res.partner.mobile
  email TEXT,                      -- res.partner.email
  website TEXT,                    -- res.partner.website
  vat TEXT,                        -- res.partner.vat
  function TEXT,                   -- res.partner.function (job position)
  city TEXT,                       -- res.partner.city
  active INTEGER DEFAULT 1,        -- res.partner.active
  updated_at INTEGER               -- last sync (epoch ms)
);
CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(name);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);
CREATE INDEX IF NOT EXISTS idx_contacts_mobile ON contacts(mobile);

-- ── Call log (↔ Odoo voip.call) ───────────────────────────────
-- voip.call fields mapped; extra local-only columns (call_id, did, odoo_id)
-- are Asterisk/dedup keys that voip.call does not have.
-- Computed voip.call fields (display_name, activity_name) are omitted.
CREATE TABLE IF NOT EXISTS call_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,  -- local D1 row id
  odoo_id INTEGER,                       -- voip.call.id (set when synced back to Odoo)
  call_id TEXT UNIQUE,                   -- Asterisk UNIQUEID (local dedup key; not in voip.call)
  did TEXT,                              -- our DID (local; voip.call has no "our number" field)
  phone_number TEXT,                     -- voip.call.phone_number (the other party)
  direction TEXT,                        -- voip.call.direction ('incoming' | 'outgoing')
  state TEXT,                            -- voip.call.state ('aborted'|'calling'|'missed'|'ongoing'|'rejected'|'terminated')
  partner_id INTEGER,                    -- voip.call.partner_id → contacts.id
  user_id INTEGER,                       -- voip.call.user_id → res.users.id
  start_date INTEGER,                    -- voip.call.start_date (epoch ms)
  end_date INTEGER,                      -- voip.call.end_date (epoch ms)
  create_date INTEGER,                   -- voip.call.create_date (epoch ms)
  create_uid INTEGER,                    -- voip.call.create_uid → res.users.id
  write_date INTEGER,                    -- voip.call.write_date (epoch ms)
  write_uid INTEGER,                     -- voip.call.write_uid → res.users.id
  notes_html TEXT,                       -- local-only: combined call-notes editor + jot sketch (HTML)
  jot_svg TEXT,                          -- local-only: jot sketch, rendered SVG (display)
  jot_json TEXT,                         -- local-only: jot sketch, Excalidraw scene (elements+appState, re-editable)
  recording TEXT,                        -- local-only: Asterisk stored-recording name (see migrations/0006_call_recording.sql)
  transcript TEXT,                       -- local-only: Whisper transcript, one "[m:ss] text" line per segment (NULL = not transcribed)
  voicemail INTEGER NOT NULL DEFAULT 0,  -- local-only: 1 = went to voicemail; the message is in recording (see migrations/0008_voicemail.sql)
  vm_emailed TEXT,                       -- local-only: who the voicemail was emailed to, or why not (migrations/0020_voicemail_email.sql)
  odoo_synced_at INTEGER,                -- local-only: when pushCallToOdoo last sent this leg's call (see migrations/0009_odoo_push.sql)
  extension TEXT,                        -- local-only: the softphone extension that logged this leg (see migrations/0012_call_extension.sql)
  callback INTEGER NOT NULL DEFAULT 0,   -- local-only: 1 = the caller pressed 2 in the queue for a callback (migrations/0022_blocked_numbers_queue.sql)
  spam TEXT,                             -- local-only: why the call looks like spam (migrations/0024_spam.sql, src/spam.ts)
  answered_at INTEGER,                   -- local-only: when it was answered (migrations/0025_answered_at.sql, src/reports.ts)
  important INTEGER NOT NULL DEFAULT 0,  -- 1 = Important: retention skips it, sent to Odoo (migrations/0027_call_important.sql, src/retention.ts)
  important_by TEXT,                     -- local-only: who flagged it
  important_at INTEGER                   -- local-only: when
);
CREATE INDEX IF NOT EXISTS idx_call_log_direction_start ON call_log(direction, start_date);
CREATE INDEX IF NOT EXISTS idx_call_log_phone ON call_log(phone_number);
CREATE INDEX IF NOT EXISTS idx_call_log_start ON call_log(start_date);
CREATE INDEX IF NOT EXISTS idx_call_log_partner ON call_log(partner_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_call_log_odoo ON call_log(odoo_id);

-- ── App settings (key-value) ──────────────────────────────────
-- Server-side persistence for dashboard settings (connection URL, Dev Mode, …)
-- so they survive across browsers/devices, not just localStorage.
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at INTEGER
);

-- ── Voicemail greetings (see migrations/0008_voicemail.sql) ──
CREATE TABLE IF NOT EXISTS greetings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  audio BLOB NOT NULL,                   -- 8 kHz mono 16-bit WAV
  duration_ms INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- ── Phone lookup bookkeeping (see migrations/0005_phone_lookup.sql) ──
CREATE TABLE IF NOT EXISTS phone_lookup (
  key TEXT PRIMARY KEY,
  at INTEGER NOT NULL
);

-- ── Messages (↔ Odoo mail.message + Gmail) ──────────────────
-- Mirrors Odoo mail.message fields; also stores Gmail-thread messages.
--   source = 'odoo' | 'gmail'; odoo_id / gmail_id are the external keys.
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,  -- local D1 row id
  odoo_id INTEGER,                       -- mail.message.id (set when source='odoo')
  gmail_id TEXT,                         -- Gmail message id (set when source='gmail')
  contact_id INTEGER NOT NULL,           -- res.partner.id this thread belongs to
  res_model TEXT,                        -- mail.message.model
  res_id INTEGER,                        -- mail.message.res_id
  subject TEXT,                          -- mail.message.subject
  body TEXT,                             -- mail.message.body (HTML) / Gmail snippet
  email_from TEXT,                       -- mail.message.email_from / Gmail From header
  author_id INTEGER,                     -- mail.message.author_id → res.partner.id
  message_type TEXT,                     -- 'email'|'comment'|'notification'|'sms'
  direction TEXT,                        -- 'incoming' | 'outgoing'
  source TEXT NOT NULL DEFAULT 'odoo',   -- 'odoo' | 'gmail'
  date INTEGER,                          -- epoch ms
  updated_at INTEGER,
  user_id INTEGER                        -- Gmail rows: whose mailbox (see migrations/0014_multi_user.sql); NULL for Odoo rows
);
CREATE INDEX IF NOT EXISTS idx_messages_contact ON messages(contact_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_odoo ON messages(odoo_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_gmail ON messages(gmail_id);

-- ── Staff sign-in lockout (see migrations/0010_staff_login.sql) ──
CREATE TABLE IF NOT EXISTS staff_login_failures (
  employee_id INTEGER NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_staff_login_failures ON staff_login_failures(employee_id, at);

-- Wrong passwords at /auth/login (see migrations/0026_login_failures.sql)
CREATE TABLE IF NOT EXISTS login_failures (
  ext TEXT NOT NULL,
  ip TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_failures_ext ON login_failures(ext, at);
CREATE INDEX IF NOT EXISTS idx_login_failures_ip ON login_failures(ip, at);

-- ── Website callback requests (see migrations/0011_web_callback.sql) ──
CREATE TABLE IF NOT EXISTS web_callbacks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,          -- E.164
  mode TEXT NOT NULL,           -- 'now' | 'later'
  preferred_at INTEGER,         -- epoch ms, 'later' only
  page TEXT,
  ip TEXT,
  state TEXT NOT NULL,          -- calling | connecting | connected | no-answer | missed | scheduled | failed
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_web_callbacks_created ON web_callbacks(created_at);

-- ── Users (see migrations/0014_multi_user.sql, src/users.ts) ──
CREATE TABLE IF NOT EXISTS extensions (
  number TEXT PRIMARY KEY,
  user_id INTEGER,
  user_name TEXT,
  user_email TEXT,
  updated_at INTEGER NOT NULL,
  -- What the PBX builds the extension from (0015, src/pbxsync.ts).
  name TEXT,
  sip_password TEXT,
  device_type TEXT,
  wake_app INTEGER,
  active INTEGER,
  -- Forwarding and the owner's mobile (0016).
  forward_mode TEXT,
  forward_number TEXT,
  forward_seconds INTEGER,
  user_mobile TEXT,
  user_mobile_delay INTEGER,
  voicemail_email TEXT                 -- "Email Voicemail To" from Odoo; NULL = the addon has no such field
);
-- Odoo's phone_bridge.number: who rings for each of our numbers (0016, src/pbxsync.ts).
CREATE TABLE IF NOT EXISTS pbx_numbers (
  number TEXT PRIMARY KEY,
  name TEXT,
  extensions TEXT,
  ring_mobiles INTEGER,
  ring_seconds INTEGER,
  no_answer TEXT,
  no_answer_number TEXT,
  record INTEGER,
  active INTEGER,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS user_settings (
  user_id INTEGER NOT NULL,
  key TEXT NOT NULL,
  value TEXT,
  updated_at INTEGER,
  PRIMARY KEY (user_id, key)
);
CREATE TABLE IF NOT EXISTS user_google (
  user_id INTEGER PRIMARY KEY,
  email TEXT,
  refresh_token TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_call_log_user ON call_log(user_id);

-- Every wake-up push and what FCM said (migration 0021).
CREATE TABLE IF NOT EXISTS push_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  extension TEXT NOT NULL,
  type TEXT NOT NULL,
  caller TEXT,
  devices INTEGER NOT NULL,
  sent INTEGER NOT NULL,
  detail TEXT,
  ms INTEGER
);
CREATE INDEX IF NOT EXISTS push_log_at ON push_log (at);

-- Numbers the PBX rejects (migration 0022, src/blocked.ts): matched on the
-- last 9 digits.
CREATE TABLE IF NOT EXISTS blocked_numbers (
  key TEXT PRIMARY KEY,
  number TEXT NOT NULL,
  label TEXT,
  user_id INTEGER,
  user_name TEXT,
  created_at INTEGER NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0,
  last_at INTEGER
);

-- Missed-call ownership (migrations/0023_missed_owner.sql, src/missed.ts)
CREATE TABLE IF NOT EXISTS missed_owner (
  call_log_id INTEGER PRIMARY KEY,
  own_id INTEGER,
  own_name TEXT,
  own_at INTEGER,
  done_id INTEGER,
  done_name TEXT,
  done_at INTEGER,
  reopened_at INTEGER
);

-- Likely-spam numbers (migrations/0024_spam.sql, src/spam.ts)
CREATE TABLE IF NOT EXISTS spam_numbers (
  key TEXT PRIMARY KEY,
  verdict TEXT NOT NULL,
  reason TEXT,
  user_name TEXT,
  at INTEGER NOT NULL
);

-- One-time setup links from the onboarding email (see migrations/0028_setup_links.sql)
CREATE TABLE IF NOT EXISTS setup_links (
  token_hash TEXT PRIMARY KEY,
  ext TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_setup_links_ext ON setup_links(ext);
-- UK compliance: audit log and the erase queue (migrations/0029_compliance.sql, src/compliance.ts)
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
