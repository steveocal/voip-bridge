#!/bin/bash
# Unanswered calls go to voicemail after 25s (was 45s inbound, 30s internal).
# Changes the ring-group Dial() in [default] and [voipms-inbound] and the
# extension Dial() in [ext-dial]. Outbound, web-callback and the per-leg
# Dial()s inside Local channels are left alone (the parent's 25s ends them).
# Backs up extensions.conf; running it again changes nothing.
set -euo pipefail

ssh vps 'bash -s' <<'REMOTE'
set -euo pipefail
cd /opt/asterisk/config
ts=$(date +%Y%m%d_%H%M%S)
cp extensions.conf "extensions.conf.bak_pre_vm25_$ts"
awk '
  /^\[/ { ctx = $0 }
  ctx == "[default]"        && /^same => n,Dial\(PJSIP\/200&.*,45\)$/ { sub(/,45\)$/, ",25)") }
  ctx == "[voipms-inbound]" && /^same => n,Dial\(\$\{RING\},45\)$/    { sub(/,45\)$/, ",25)") }
  ctx == "[ext-dial]"       && /^same => n,Dial\(PJSIP\/\$\{ARG1\},30\)$/ { sub(/,30\)$/, ",25)") }
  { print }
' extensions.conf > /tmp/extensions.conf.new
if cmp -s extensions.conf /tmp/extensions.conf.new; then
  rm "extensions.conf.bak_pre_vm25_$ts"; echo "already 25s, unchanged"
else
  cat /tmp/extensions.conf.new > extensions.conf
  echo "voicemail after 25s (backup extensions.conf.bak_pre_vm25_$ts)"
fi
docker exec asterisk asterisk -rx "dialplan reload"
grep -n 'Dial(PJSIP/200&\|Dial(${RING}\|Dial(PJSIP/${ARG1},' extensions.conf
REMOTE
