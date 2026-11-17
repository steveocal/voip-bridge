#!/bin/bash
# Call queues and blocked numbers on the Asterisk PBX (odoo20):
#
#   Odoo phone_bridge.number "Queue Callers" (phone_bridge 19.0.0.14.0)
#   → worker GET /pbx/sync queue lines → pbx-sync.sh → queues-phone-bridge.conf
#     + astdb pbqueue/<number> → [pb-route] → [pb-queue] → Queue()
#   Dashboard 🚫 / Settings → Blocked numbers (src/blocked.ts)
#   → GET /pbx/sync block lines → astdb pbblock/<last 9 digits>
#     → [pb-route] rejects the call first
#
# Installs pbx-sync.sh and extensions-phone-bridge-routing.conf, creates
# queues.conf (there was none, so app_queue never loaded) #including the
# file pbx-sync.sh writes, loads app_queue, and fetches Asterisk's own hold
# music (opsound, CC-BY-SA) into the spool, where pbx-sync.sh makes it the
# pbhold music class. The image ships no music on hold at all.
#
# Needs first: migration 0022 and the worker deployed. Queues also need the
# addon upgraded; blocking doesn't.
# Run from this machine: bash scripts/vps-setup-queue-block.sh [ssh host]
# Backs up each file it changes; running it again changes nothing.
set -euo pipefail
cd "$(dirname "$0")/.."
HOST=${1:-odoo20}

ssh "$HOST" "cat > /tmp/pbx-sync.sh.new" < asterisk/pbx-sync.sh
ssh "$HOST" "cat > /tmp/extensions-phone-bridge-routing.conf.new" < asterisk/extensions-phone-bridge-routing.conf

ssh "$HOST" 'bash -s' <<'REMOTE'
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

if [ -f queues.conf ] && grep -q '^#include queues-phone-bridge.conf' queues.conf; then
  echo "queues.conf: phone bridge already included, unchanged"
else
  [ -f queues.conf ] && cp queues.conf "queues.conf.bak_$ts"
  [ -f queues.conf ] || printf '[general]\npersistentmembers = no\nautofill = yes\nshared_lastcall = yes\n' > queues.conf
  printf '\n; Queues for the phone numbers set up in Odoo (pbx-sync.sh)\n#include queues-phone-bridge.conf\n' >> queues.conf
  chmod 644 queues.conf; chown 1000:1000 queues.conf
  echo "queues.conf: phone bridge included"
fi
[ -f queues-phone-bridge.conf ] || { echo "; Written by pbx-sync.sh" > queues-phone-bridge.conf; chmod 644 queues-phone-bridge.conf; chown 1000:1000 queues-phone-bridge.conf; }

HOLD=/opt/asterisk/spool/phone-bridge-hold
if ls "$HOLD"/*.wav >/dev/null 2>&1; then
  echo "hold music: already there ($(ls "$HOLD"/*.wav | wc -l) files)"
else
  mkdir -p "$HOLD"
  curl -sf --max-time 120 https://downloads.asterisk.org/pub/telephony/sounds/asterisk-moh-opsound-wav-current.tar.gz | tar -xz -C "$HOLD" --wildcards '*.wav'
  chown -R 1000:1000 "$HOLD"; chmod 755 "$HOLD"; chmod 644 "$HOLD"/*.wav
  echo "hold music: $(ls "$HOLD"/*.wav | wc -l) files"
fi

A="docker exec asterisk asterisk -rx"
case "$($A "module show like app_queue")" in
  *"Not Running"*) $A "module load app_queue.so" >/dev/null; echo "app_queue: loaded" ;;
  *Running*) $A "module reload app_queue.so" >/dev/null; echo "app_queue: reloaded" ;;
  *) $A "module load app_queue.so" >/dev/null; echo "app_queue: loaded" ;;
esac
$A "dialplan reload" >/dev/null
for c in pb-route pb-route-hangup pb-queue pb-queue-exit; do
  out=$($A "dialplan show $c")
  case "$out" in *"Context '$c'"*) echo "$c: loaded" ;; *) echo "$c: NOT loaded"; exit 1 ;; esac
done
case "$($A "dialplan show pb-route")" in *pbblock*) echo "pb-route: checks blocked callers" ;; *) echo "pb-route: NO block check"; exit 1 ;; esac
echo "--- sync:"
docker exec -u asterisk asterisk /etc/asterisk/pbx-sync.sh && echo "sync ok" || echo "sync failed; see above"
$A "moh show classes" | grep -A2 pbhold || echo "pbhold: NOT loaded"
$A "queue show"
for f in pbqueue pbblock; do $A "database show $f"; done
$A "database get pbx block_withheld" || true
REMOTE
