-- Call recordings: Asterisk MixMonitor writes /var/spool/asterisk/recording/<name>.wav
-- and posts event=recording when it finishes; the worker stores <name> here and
-- streams the file back through ARI (GET /ari/recordings/stored/<name>/file).
-- Apply: npx wrangler d1 execute voip-bridge-d1 --remote --file=./migrations/0006_call_recording.sql
ALTER TABLE call_log ADD COLUMN recording TEXT;
