-- Apply: npx wrangler d1 execute voip-bridge-d1 --remote --yes --file=./migrations/0015_pbx_extensions.sql
-- The PBX builds its extensions from Odoo's (phone_bridge.extension): the
-- worker keeps a copy here and the PBX pulls it (GET /pbx/sync, pbx-sync.sh).
-- See src/pbxsync.ts.
ALTER TABLE extensions ADD COLUMN name TEXT;
ALTER TABLE extensions ADD COLUMN sip_password TEXT;
ALTER TABLE extensions ADD COLUMN device_type TEXT;     -- webrtc | sip
ALTER TABLE extensions ADD COLUMN wake_app INTEGER;     -- 1 = push-wake the Android app before ringing
ALTER TABLE extensions ADD COLUMN active INTEGER;       -- 0 = archived in Odoo (kept for call history owners)
