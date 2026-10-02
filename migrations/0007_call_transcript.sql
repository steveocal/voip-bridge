-- Whisper transcript of the call recording, one "[m:ss] text" line per segment.
-- NULL = not transcribed yet; '' = transcribed, nothing said.
-- Apply: npx wrangler d1 execute voip-bridge-d1 --remote --yes --file=./migrations/0007_call_transcript.sql
ALTER TABLE call_log ADD COLUMN transcript TEXT;
