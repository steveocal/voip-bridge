-- Apply: npx wrangler d1 execute voip-bridge-d1 --remote --yes --command "<the CREATE TABLE below>"
-- Opening hours and phone menus from Odoo (phone_bridge 0.9). The menus,
-- the numbers' answer / out-of-hours settings and their Working Schedules
-- are one JSON document (settings key pbx_ivr); the prompts' speech is kept
-- here, made by Workers AI on the PBX's first GET /pbx/prompt/<hash>. See
-- src/ivr.ts.
CREATE TABLE IF NOT EXISTS pbx_prompts (
  hash TEXT PRIMARY KEY,                -- 16 hex of sha256(voice, text): the file name on the PBX
  voice TEXT NOT NULL,
  text TEXT NOT NULL,
  audio BLOB,                           -- 8 kHz 16-bit mono WAV; NULL until first asked for
  created_at INTEGER NOT NULL
);
