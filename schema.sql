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
  write_uid INTEGER                      -- voip.call.write_uid → res.users.id
);
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
  updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_messages_contact ON messages(contact_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_odoo ON messages(odoo_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_gmail ON messages(gmail_id);
