#!/bin/bash
# Sets up call parking on the Asterisk VPS (see docs/asterisk-parking.md).
# Run from this machine: bash scripts/vps-setup-parking.sh
# Backs up extensions.conf first; running it again changes nothing.
set -euo pipefail

ssh vps 'bash -s' <<'REMOTE'
set -euo pipefail
cd /opt/asterisk/config
ts=$(date +%Y%m%d_%H%M%S)

cat > res_parking.conf <<'EOF'
; Call parking for the softphones (dashboard, app, Odoo panel); see
; voip-bridge docs/asterisk-parking.md. Their Park button blind-transfers the
; caller to 700 in [from-internal]; 701-719 pick a parked call back up.
[general]

[default]
parkpos => 701-719
context => parkedcalls
findslot => first
parkingtime => 180          ; seconds before an unanswered parked call rings back
comebacktoorigin => yes     ; ...to the phone that parked it
parkedmusicclass => default
EOF

if grep -q 'NoOp(PARK: ' extensions.conf; then
  echo "extensions.conf: parking already there, unchanged"
else
  cp extensions.conf "extensions.conf.bak_pre_parking_$ts"
  cat > /tmp/parking-block.conf <<'EOF'
; Call parking (res_parking.conf, voip-bridge docs/asterisk-parking.md). The
; softphones' Park button blind-transfers the caller here. Asterisk doesn't
; expose which slot a call lands in, so pick the first free one, keep it in
; PARKSLOT (the worker's /parked reads it over ARI) and park there.
exten => 700,1,NoOp(PARK: ${CALLERID(num)})
same => n,Set(i=701)
same => n(next),GotoIf($["${DEVICE_STATE(park:${i}@parkedcalls)}" != "INUSE"]?found)
same => n,Set(i=$[${i} + 1])
same => n,GotoIf($[${i} <= 719]?next)
same => n,Park(default,s)
same => n,Hangup()
same => n(found),Set(PARKSLOT=${i})
same => n,Set(PARKINGEXTEN=${i})
same => n,Park(default,s)
same => n,Hangup()
; Pick a parked call back up.
exten => _7[01]X,1,NoOp(UNPARK: ${CALLERID(num)} <- ${EXTEN})
same => n,ParkedCall(default,${EXTEN})
same => n,Hangup()
EOF
  # Insert before the first outbound pattern in [from-internal].
  awk 'BEGIN{done=0} /^exten => _0X\.,1,NoOp\(OUTBOUND UK/ && !done { while ((getline l < "/tmp/parking-block.conf") > 0) print l; done=1 } { print }' \
    extensions.conf > /tmp/extensions.conf.new
  grep -q 'NoOp(PARK: ' /tmp/extensions.conf.new || { echo "insert point not found; nothing changed"; exit 1; }
  cat /tmp/extensions.conf.new > extensions.conf
  echo "extensions.conf: parking added (backup extensions.conf.bak_pre_parking_$ts)"
fi

docker exec asterisk asterisk -rx "module unload res_parking.so" >/dev/null 2>&1 || true
docker exec asterisk asterisk -rx "module load res_parking.so"
docker exec asterisk asterisk -rx "dialplan reload"
echo "--- checks"
docker exec asterisk asterisk -rx "module show like res_parking"
docker exec asterisk asterisk -rx "parking show default"
docker exec asterisk asterisk -rx "dialplan show 700@from-internal" | head -14
docker exec asterisk asterisk -rx "dialplan show 705@from-internal" | grep -m2 "ParkedCall\|_7"
docker exec asterisk asterisk -rx "dialplan show 7035551234@from-internal" | grep -m1 "OUTBOUND" || true
REMOTE
