#!/bin/bash
# Inbound routing and forwarding from Odoo on the Asterisk VPS (stage 2 of
# "no manual Asterisk", docs/asterisk-pbx-sync.md):
#
#   Odoo phone_bridge.number / extension forwarding / users' mobiles
#   → worker GET /pbx/sync (route / fwd lines) → pbx-sync.sh
#   → astdb pbroute/<number>, pbfwd/<extension> → [pb-route], [ext-dial]
#
# Installs the new pbx-sync.sh and asterisk/extensions-phone-bridge-routing.conf,
# then edits extensions.conf (scripts/pbx-routing-dialplan-edit.py):
# [voipms-inbound] and [default] ask [pb-route] first, the old [ext-dial] makes
# way for the one with forwarding, and the routing file is #included.
#
# Nothing changes for calls until a number is set up in Odoo (Phone →
# Configuration → Phone Numbers): one with no route keeps the hand-written
# ring list. Internal calls behave as before until an extension gets
# forwarding or its user turns on 📼.
#
# Needs first: migration 0016 and the worker deployed (else the sync lists
# no routes and nothing changes).
# Run from this machine: bash scripts/vps-setup-pbx-routing.sh
# Backs up each file it changes; running it again changes nothing.
set -euo pipefail
cd "$(dirname "$0")/.."

ssh vps "cat > /tmp/pbx-sync.sh.new" < asterisk/pbx-sync.sh
ssh vps "cat > /tmp/extensions-phone-bridge-routing.conf.new" < asterisk/extensions-phone-bridge-routing.conf
ssh vps "cat > /tmp/pbx-routing-dialplan-edit.py" < scripts/pbx-routing-dialplan-edit.py

ssh vps 'bash -s' <<'REMOTE'
set -euo pipefail
cd /opt/asterisk/config
ts=$(date +%Y%m%d_%H%M%S)
install_file() {  # new-file target mode
  if [ -f "$2" ] && cmp -s "$1" "$2"; then echo "$2: unchanged"; rm -f "$1"; return; fi
  [ -f "$2" ] && cp "$2" "$2.bak_$ts"
  mv "$1" "$2"; chmod "$3" "$2"; chown 1000:1000 "$2"; echo "$2: installed"
}
install_file /tmp/pbx-sync.sh.new pbx-sync.sh 755
install_file /tmp/extensions-phone-bridge-routing.conf.new extensions-phone-bridge-routing.conf 644

if grep -q '^#include extensions-phone-bridge-routing.conf' extensions.conf; then
  echo "extensions.conf: routing already there, unchanged"
else
  cp extensions.conf "extensions.conf.bak_pre_pbx_routing_$ts"
  python3 /tmp/pbx-routing-dialplan-edit.py /opt/asterisk/config
  echo "(backup extensions.conf.bak_pre_pbx_routing_$ts)"
fi
rm -f /tmp/pbx-routing-dialplan-edit.py

A="docker exec asterisk asterisk -rx"
$A "dialplan reload" >/dev/null
for c in pb-route pb-route-hangup pb-ring-app pb-ring-mobile ext-dial; do
  out=$($A "dialplan show $c")   # not piped into grep -q: with pipefail its early exit fails the pipe
  case "$out" in *"Context '$c'"*) echo "$c: loaded" ;; *) echo "$c: NOT loaded"; exit 1 ;; esac
done
for c in voipms-inbound default; do
  case "$($A "dialplan show $c")" in *pb-route*) echo "$c: asks pb-route first" ;; *) echo "$c: NO pb-route hook"; exit 1 ;; esac
done
echo "--- sync:"
docker exec -u asterisk asterisk /etc/asterisk/pbx-sync.sh && echo "sync ok" || echo "sync failed; nothing applied"
$A "database show pbroute" | tail -n +1
$A "database show pbfwd" | tail -n +1
REMOTE
