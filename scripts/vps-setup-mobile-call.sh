#!/bin/bash
# Adds the dashboard's 📱 "call via my mobile" to the Asterisk VPS
# (src/mobilecall.ts). With no call going, the button asks the worker to
# originate Local/me@mobile-call/n into far@mobile-call:
#   me  (;2 half)  rings the user's SIM mobile via voip.ms;
#   far (;1 half)  runs once they answer: dials the number from the
#                  extension's usual caller ID (201 → 01283 246491, others →
#                  07520 658657), records it, and tells the worker how it went.
# Run from this machine: bash scripts/vps-setup-mobile-call.sh
# Backs up extensions.conf first; running it again changes nothing.
set -euo pipefail

ssh vps 'bash -s' <<'REMOTE'
set -euo pipefail
cd /opt/asterisk/config
ts=$(date +%Y%m%d_%H%M%S)

if grep -q '^\[mobile-call\]' extensions.conf; then
  echo "extensions.conf: [mobile-call] already there, unchanged"
else
  # The worker's PUSH_SECRET, as [web-callback] already uses it.
  secret=$(grep -o 'web-callback/event" --data-urlencode "secret=[0-9a-f]*' extensions.conf | head -1 | sed 's/.*secret=//')
  [ -n "$secret" ] || { echo "PUSH_SECRET not found in [web-callback]; nothing changed"; exit 1; }
  anchor='^; Inbound routing and forwarding from Odoo'
  [ "$(grep -c "$anchor" extensions.conf)" = 1 ] || { echo "insert point not found exactly once; nothing changed"; exit 1; }

  cat > /tmp/mobile-call.conf <<'EOF'
; Dashboard 📱 "call via my mobile" (voip-bridge src/mobilecall.ts,
; scripts/vps-setup-mobile-call.sh): for a poor internet connection. The
; worker originates Local/me@mobile-call/n into far@mobile-call with
; __MC_ID / __MC_MOBILE / __MC_TARGET / __MC_EXT set. The ;2 half runs "me"
; and rings the user's mobile; once they answer, the ;1 half runs "far" and
; dials the other party. The call_log row is "mob-<MC_ID>".
[mobile-call]
exten => me,1,NoOp(MOBILE CALL ${MC_ID}: ringing ${MC_MOBILE} for ${MC_TARGET})
same => n,Set(CALLERID(num)=+447520658657)
same => n,Set(CALLERID(name)=Call ${MC_TARGET})
same => n,Dial(PJSIP/${MC_MOBILE}@voipms,45)
same => n,GotoIf($["${DIALSTATUS}" = "ANSWER"]?done)
same => n,System(curl -s -X POST "https://voip-bridge.wandering-mode-c597.workers.dev/mobile-call/event" --data-urlencode "secret=__SECRET__" --data-urlencode "id=${MC_ID}" --data-urlencode "event=nomobile" --data-urlencode "status=${DIALSTATUS}" &)
same => n(done),Hangup()
exten => far,1,NoOp(MOBILE CALL ${MC_ID}: dialling ${MC_TARGET} for ext ${MC_EXT})
same => n,Set(CHANNEL(hangup_handler_push)=mobile-call-done,s,1)
same => n,System(curl -s -X POST "https://voip-bridge.wandering-mode-c597.workers.dev/mobile-call/event" --data-urlencode "secret=__SECRET__" --data-urlencode "id=${MC_ID}" --data-urlencode "event=answered" &)
same => n,Gosub(record-call,s,1(mob-${MC_ID}))
same => n,Set(CALLERID(num)=+447520658657)
same => n,ExecIf($["${MC_EXT}" = "201"]?Set(CALLERID(num)=+441283246491))
same => n,Set(CALLERID(name)=)
same => n,Dial(PJSIP/${MC_TARGET}@voipms,45)
same => n,Hangup()

[mobile-call-done]
exten => s,1,System(curl -s -X POST "https://voip-bridge.wandering-mode-c597.workers.dev/mobile-call/event" --data-urlencode "secret=__SECRET__" --data-urlencode "id=${MC_ID}" --data-urlencode "event=done" --data-urlencode "status=${DIALSTATUS}" --data-urlencode "talk=${ANSWEREDTIME}" &)
same => n,Return()

EOF
  sed -i "s|__SECRET__|$secret|g" /tmp/mobile-call.conf
  cp extensions.conf "extensions.conf.bak_pre_mobile_call_$ts"
  awk -v f=/tmp/mobile-call.conf -v a="$anchor" '$0 ~ a { while ((getline l < f) > 0) print l } { print }' extensions.conf > /tmp/extensions.conf.new
  grep -q '^\[mobile-call\]' /tmp/extensions.conf.new || { echo "insert failed; nothing changed"; exit 1; }
  cat /tmp/extensions.conf.new > extensions.conf
  rm -f /tmp/mobile-call.conf /tmp/extensions.conf.new
  echo "extensions.conf: [mobile-call] added (backup extensions.conf.bak_pre_mobile_call_$ts)"
fi

docker exec asterisk asterisk -rx "dialplan reload"
echo "--- checks"
docker exec asterisk asterisk -rx "dialplan show me@mobile-call" | head -8
docker exec asterisk asterisk -rx "dialplan show far@mobile-call" | head -10
REMOTE
