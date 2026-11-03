#!/bin/bash
# Unanswered internal calls (e.g. 202 -> 201) go to voicemail every time.
# Before this, [ext-dial] only went to voicemail when a custom greeting
# (greetings/active.wav) existed, and played busy tone otherwise. There has
# been no greeting since 2026-10-14, so every unanswered internal call got
# busy tone. [voicemail] already falls back to the stock vm-intro prompt,
# which is what inbound calls get, so the gate isn't needed.
# Backs up extensions.conf; running it again changes nothing.
set -euo pipefail

ssh vps 'bash -s' <<'REMOTE'
set -euo pipefail
cd /opt/asterisk/config
if ! grep -q 'active.wav)}?vm)' extensions.conf; then
  echo "ext-dial already always goes to voicemail, unchanged"
else
  ts=$(date +%Y%m%d_%H%M%S)
  cp extensions.conf "extensions.conf.bak_pre_internal_vm_$ts"
  # Inside [ext-dial] only: drop the greeting check and the busy-tone lines after it.
  awk '
    /^\[/ { inctx = ($0 == "[ext-dial]") }
    inctx && /active\.wav\)\}\?vm\)/ { next }
    inctx && /^same => n,Progress\(\)$/ { next }
    inctx && /^same => n,Playtones\(busy\)$/ { next }
    inctx && /^same => n,Wait\(8\)$/ { next }
    inctx && /^same => n,Hangup\(17\)$/ { next }
    { print }
  ' extensions.conf > /tmp/extensions.conf.new
  grep -q 'active.wav)}?vm)' /tmp/extensions.conf.new && { echo "edit failed; nothing changed"; exit 1; }
  cat /tmp/extensions.conf.new > extensions.conf
  echo "ext-dial now always goes to voicemail (backup extensions.conf.bak_pre_internal_vm_$ts)"
fi
docker exec asterisk asterisk -rx "dialplan reload"
docker exec asterisk asterisk -rx "dialplan show s@ext-dial"
REMOTE
