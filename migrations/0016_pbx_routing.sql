-- Apply: npx wrangler d1 execute voip-bridge-d1 --remote --yes --file=./migrations/0016_pbx_routing.sql
-- Inbound routing from Odoo (phone_bridge 0.8): the phone numbers callers
-- ring (phone_bridge.number), each extension's forwarding, and each user's
-- mobile. The PBX pulls them with the extensions (GET /pbx/sync). See
-- src/pbxsync.ts.
ALTER TABLE extensions ADD COLUMN forward_mode TEXT;        -- never | always | busy | noanswer | busy_noanswer
ALTER TABLE extensions ADD COLUMN forward_number TEXT;      -- digits only, e.g. 447700900123
ALTER TABLE extensions ADD COLUMN forward_seconds INTEGER;
ALTER TABLE extensions ADD COLUMN user_mobile TEXT;         -- the owner's "Mobile to Ring", digits only
ALTER TABLE extensions ADD COLUMN user_mobile_delay INTEGER;
CREATE TABLE IF NOT EXISTS pbx_numbers (
  number TEXT PRIMARY KEY,              -- digits only, e.g. 441283246490
  name TEXT,
  extensions TEXT,                      -- comma-separated extension numbers that ring
  ring_mobiles INTEGER,
  ring_seconds INTEGER,
  no_answer TEXT,                       -- voicemail | forward | hangup
  no_answer_number TEXT,                -- digits only
  record INTEGER,
  active INTEGER,
  updated_at INTEGER NOT NULL
);
