#!/bin/bash
# Desk phone and softphone lock-down, call records and traffic alerts on the
# PBX (odoo20). docs/commercial-plan.md item 4c, after the ext 200 hijack.
#
#   pjsip-phone-bridge.conf: browser/app extensions (pb-webrtc) are accepted
#     from 127.0.0.1 only, i.e. through nginx's WebSocket proxy; desk phones
#     (pb-sip) from nowhere unless pbx-sync.sh adds a permit for a network
#     set in the dashboard (Configuration → Call limits → Desk phone networks).
#   pbx-sync.sh: writes those permits ("sipallow" lines from GET /pbx/sync).
#   extensions-phone-bridge-routing.conf: [pb-out-limit] reports international
#     and premium-rate numbers (event=dialalert) so the admins are told.
#   extensions.conf: [outbound-dial] and [mobile-call] pass the number they
#     dial to [pb-out-limit]; [voipms-inbound] keeps the carrier's
#     P-Asserted-Identity in the call record's userfield.
#   cdr.conf: call records on (cdr_csv, /opt/asterisk/logs/cdr-csv/Master.csv,
#     unanswered calls too, UTC), rotated monthly on the host, kept 2 years.
#
# Run from this machine: bash scripts/vps-sip-hardening.sh [ssh host]
# Backs up each file it changes; running it again changes nothing.
set -euo pipefail
cd "$(dirname "$0")/.."
HOST=${1:-odoo20}

for f in pjsip-phone-bridge.conf pbx-sync.sh extensions-phone-bridge-routing.conf; do
  ssh "$HOST" "cat > /tmp/$f.new" < "asterisk/$f"
done

ssh "$HOST" 'bash -s' <<'REMOTE'
set -euo pipefail
cd /opt/asterisk/config
ts=$(date +%Y%m%d_%H%M%S)
install_file() {  # new-file target mode
  if [ -f "$2" ] && cmp -s "$1" "$2"; then echo "$2: unchanged"; rm -f "$1"; return; fi
  [ -f "$2" ] && cp -p "$2" "$2.bak_$ts"
  mv "$1" "$2"; chmod "$3" "$2"; chown 1000:1000 "$2"; echo "$2: installed"
}
install_file /tmp/pjsip-phone-bridge.conf.new pjsip-phone-bridge.conf 644
install_file /tmp/pbx-sync.sh.new pbx-sync.sh 755
install_file /tmp/extensions-phone-bridge-routing.conf.new extensions-phone-bridge-routing.conf 644

if [ -f cdr.conf ]; then echo "cdr.conf: already there, left as is"; else
  cat > cdr.conf <<'CDR'
; Written by scripts/vps-sip-hardening.sh (voip-bridge). Call records go to
; /var/log/asterisk/cdr-csv/Master.csv (host: /opt/asterisk/logs/cdr-csv),
; rotated monthly by /etc/logrotate.d/asterisk-cdr. The userfield holds the
; carrier's P-Asserted-Identity on inbound calls ([voipms-inbound]).
[general]
enable = yes
unanswered = yes
congestion = yes

[csv]
usegmtime = yes
loguniqueid = yes
loguserfield = yes
accountlogs = no
CDR
  chmod 644 cdr.conf; chown 1000:1000 cdr.conf; echo "cdr.conf: installed"
fi

cat > /etc/logrotate.d/asterisk-cdr <<'ROT'
/opt/asterisk/logs/cdr-csv/Master.csv {
  monthly
  rotate 24
  compress
  missingok
  notifempty
  copytruncate
}
ROT

python3 - extensions.conf "$ts" <<'PY'
import shutil, sys
path, ts = sys.argv[1], sys.argv[2]
src = open(path).read()
out = src
edits = [
  ("same => n,Gosub(pb-out-limit,s,1(${OUTEXT}))\n",
   "same => n,Gosub(pb-out-limit,s,1(${OUTEXT},${VMSNUM}))\n", "outbound-dial passes the number"),
  ("same => n,Gosub(pb-out-limit,s,1(${MC_EXT}))\n",
   "same => n,Gosub(pb-out-limit,s,1(${MC_EXT},${MC_TARGET}))\n", "mobile-call passes the number"),
  ("exten => _X.,1,NoOp(INBOUND VOIPMS: ${CALLERID(num)} -> ${EXTEN})\n",
   "exten => _X.,1,NoOp(INBOUND VOIPMS: ${CALLERID(num)} -> ${EXTEN})\n"
   "; The carrier's P-Asserted-Identity, kept in the call record (cdr.conf) to trace calls.\n"
   "same => n,Set(CDR(userfield)=pai ${FILTER(A-Za-z0-9+:;@._<>= -,${PJSIP_HEADER(read,P-Asserted-Identity)})})\n",
   "voipms-inbound keeps PAI"),
]
for old, new, what in edits:
    if new in out: print("extensions.conf:", what, "- already there"); continue
    if out.count(old) != 1: sys.exit("extensions.conf: can't find the line for: " + what)
    out = out.replace(old, new); print("extensions.conf:", what)
if out != src:
    shutil.copy2(path, path + ".bak_pre_hardening_" + ts)
    open(path, "w").write(out)
PY

AST="docker exec asterisk asterisk -rx"
$AST "module reload cdr" >/dev/null
$AST "module show like cdr_csv" | grep -qE "[0-9] +Running" || $AST "module load cdr_csv.so" >/dev/null
$AST "dialplan reload" >/dev/null
$AST "module reload res_pjsip.so" >/dev/null
docker exec -u asterisk asterisk /etc/asterisk/pbx-sync.sh || echo "pbx-sync.sh failed (exit $?)"
$AST "cdr show status" | sed -n '/Registered Backends/,$p'
$AST "pjsip show endpoint 203" | grep -iE "^ *(deny|permit|acl)" || true
$AST "pjsip show contacts" | grep -E "Contact: +[0-9]" || echo "(no extension registered right now)"
$AST "dialplan show s@pb-out-limit" | grep -c dialalert
REMOTE
