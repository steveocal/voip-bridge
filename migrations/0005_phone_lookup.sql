-- Per-number bookkeeping for call-history name resolution, keyed "<kind>:<last 9 digits>":
--   miss:…   an Odoo lookup found nobody (skip re-asking Odoo for a day)
--   create:… a hangup is creating a contact for this number (stops a duplicate
--            when two hangup events for the same call race)
-- Apply: npx wrangler d1 execute voip-bridge-d1 --remote --file=./migrations/0005_phone_lookup.sql
CREATE TABLE IF NOT EXISTS phone_lookup (
  key TEXT PRIMARY KEY,
  at INTEGER NOT NULL
);
