#!/bin/bash
# Lets the other phones call the Odoo softphone (ext 203) internally.
# Without this, dialling 203 fell through to the outbound patterns and went
# to voip.ms as a phone number. Backs up extensions.conf; running it again
# changes nothing.
set -euo pipefail

ssh vps 'bash -s' <<'REMOTE'
set -euo pipefail
cd /opt/asterisk/config
if grep -q '^exten => 203,1,Gosub(ext-dial' extensions.conf; then
  echo "203 already dialable, unchanged"
else
  ts=$(date +%Y%m%d_%H%M%S)
  cp extensions.conf "extensions.conf.bak_pre_ext203_$ts"
  awk '/^exten => 204,1,Gosub\(ext-dial/ && !done { print "exten => 203,1,Gosub(ext-dial,s,1(${EXTEN}))"; print "same => n,Hangup()"; done=1 } { print }' \
    extensions.conf > /tmp/extensions.conf.new
  grep -q '^exten => 203,1,Gosub(ext-dial' /tmp/extensions.conf.new || { echo "insert point not found; nothing changed"; exit 1; }
  cat /tmp/extensions.conf.new > extensions.conf
  echo "203 added (backup extensions.conf.bak_pre_ext203_$ts)"
fi
docker exec asterisk asterisk -rx "dialplan reload"
docker exec asterisk asterisk -rx "dialplan show 203@from-internal"
REMOTE
