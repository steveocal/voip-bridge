-- Calls pushed to Odoo voip.call (pushCallToOdoo). A call's legs all become
-- one voip.call, but odoo_id is unique so only the oldest leg holds it; every
-- leg gets odoo_synced_at so the backfill knows it has been sent.
-- Apply: npx wrangler d1 execute voip-bridge-d1 --remote --yes --file=./migrations/0009_odoo_push.sql
ALTER TABLE call_log ADD COLUMN odoo_synced_at INTEGER;
