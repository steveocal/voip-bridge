-- voip-bridge D1 schema
-- Apply: npx wrangler d1 execute voip-bridge-d1 --remote --file=./schema.sql

-- Call log (existing table — idempotent)
CREATE TABLE IF NOT EXISTS call_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  call_id TEXT,
  caller TEXT,
  did TEXT,
  status TEXT,
  start_time INTEGER,
  end_time INTEGER,
  duration INTEGER
);

-- Contacts cache (Phase 1) — write-through from Odoo res.partner
CREATE TABLE IF NOT EXISTS contacts (
  odoo_id INTEGER PRIMARY KEY,
  name TEXT,
  phone TEXT,
  mobile TEXT,
  email TEXT,
  is_company INTEGER DEFAULT 0,
  updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(name);

-- Email cache (Phase 2 — placeholder)
CREATE TABLE IF NOT EXISTS emails (
  id TEXT PRIMARY KEY,
  contact_id INTEGER,
  direction TEXT,
  subject TEXT,
  body TEXT,
  from_addr TEXT,
  to_addr TEXT,
  timestamp INTEGER
);
