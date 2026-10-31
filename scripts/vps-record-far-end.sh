#!/bin/bash
# Records outbound calls on the far end's channel instead of our own phone's,
# so the recording lasts until the call really ends: through a merge into a
# conference, a transfer or a park, after which our own leg has hung up.
# (Inbound calls are recorded on the trunk channel already.)
#
# MixMonitor now starts on the outgoing voip.ms/Twilio channel through Dial's
# b() option. That channel hears the call the other way round, so record-call
# swaps the -rx/-tx file names when ARG2 = far. The files mean what they did
# before (outbound: rx = us, tx = them), and the worker needs no change.
#
# Run from this machine: bash scripts/vps-record-far-end.sh
# Backs up extensions.conf first; running it again changes nothing.
set -euo pipefail

ssh vps 'bash -s' <<'REMOTE'
set -euo pipefail
cd /opt/asterisk/config
ts=$(date +%Y%m%d_%H%M%S)

if grep -q 'b(record-call^s^1(${RECKEY}^far))' extensions.conf; then
  echo "extensions.conf: far-end recording already there, unchanged"
else
  cp extensions.conf "extensions.conf.bak_pre_record_far_end_$ts"
  python3 - <<'PY'
p = "extensions.conf"
s = open(p).read()
def rep(a, b):
    global s
    if s.count(a) != 1:
        raise SystemExit("expected exactly one match for: " + a.splitlines()[0])
    s = s.replace(a, b)

rep('''same => n,MixMonitor(${RECDIR}/${RECNAME}.wav,br(${RECDIR}/${RECNAME}-rx.wav)t(${RECDIR}/${RECNAME}-tx.wav),/etc/asterisk/recording-done.sh "${RECCALL}" "${RECNAME}")
''', '''; ARG2 = far: this is the far end's channel of an outbound call (Dial b()),
; which hears the call reversed, so swap the files to keep rx = us there.
same => n,Set(RXF=${RECDIR}/${RECNAME}-rx.wav)
same => n,Set(TXF=${RECDIR}/${RECNAME}-tx.wav)
same => n,ExecIf($["${ARG2}" = "far"]?Set(RXF=${RECDIR}/${RECNAME}-tx.wav))
same => n,ExecIf($["${ARG2}" = "far"]?Set(TXF=${RECDIR}/${RECNAME}-rx.wav))
same => n,MixMonitor(${RECDIR}/${RECNAME}.wav,br(${RXF})t(${TXF}),/etc/asterisk/recording-done.sh "${RECCALL}" "${RECNAME}")
''')
rep('''same => n,Gosub(record-call,s,1(${RECKEY}))
same => n,Set(CALLERID(num)=+447520658657)
''', '''; Recorded on the far end's channel (Dial b() below), so the recording
; outlives our leg through a conference merge, transfer or park.
same => n,Set(CALLERID(num)=+447520658657)
''')
rep('''same => n,Dial(PJSIP/${ARG1}@voipms,30)
''', '''same => n,Dial(PJSIP/${ARG1}@voipms,30,b(record-call^s^1(${RECKEY}^far)))
''')
rep('''same => n,Dial(PJSIP/${ARG1}@twilio,30)
''', '''same => n,Dial(PJSIP/${ARG1}@twilio,30,b(record-call^s^1(${RECKEY}^far)))
''')
open(p, "w").write(s)
PY
  echo "extensions.conf: far-end recording added (backup extensions.conf.bak_pre_record_far_end_$ts)"
fi

docker exec asterisk asterisk -rx "dialplan reload"
echo "--- checks"
docker exec asterisk asterisk -rx "dialplan show s@outbound-dial" | grep -n "Dial\|record-call"
docker exec asterisk asterisk -rx "dialplan show s@record-call" | grep -c "ExecIf"
REMOTE
