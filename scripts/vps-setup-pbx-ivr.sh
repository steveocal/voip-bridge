#!/bin/bash
# Opening hours and phone menus from Odoo on the Asterisk VPS (stage 3 of
# "no manual Asterisk", docs/asterisk-pbx-sync.md):
#
#   Odoo phone_bridge.number (Answer With, Opening Hours) / phone_bridge.menu
#   → worker GET /pbx/sync (when / hours / menu / key / prompt lines)
#   → pbx-sync.sh → astdb pbwhen, pbhours, pbmenu, pbkey + prompt WAVs
#   → [pb-route] asks [pb-ivr] before ringing
#
# Installs pbx-sync.sh, extensions-phone-bridge-routing.conf (the [pb-ivr]
# hook) and extensions-phone-bridge-ivr.conf, and #includes the last after
# the routing file. Nothing changes for calls until a number gets a menu or
# opening hours in Odoo: without a pbwhen key [pb-ivr] returns at once.
#
# Spoken menus (phone_bridge 18.0.0.11.0, "Callers Can Say Their Choice")
# add pb-say.sh, which sends what callers say to the worker (POST /pbx/say);
# "Customer's salesperson" keys (18.0.0.12.0) add pb-owner.sh (GET /pbx/owner).
# "While Ringing, Callers Hear" (18.0.0.13.0) adds musiconhold-phone-bridge.conf
# (written by pbx-sync.sh, #included from musiconhold.conf): one music-on-hold
# class per message, played by Dial(...,m(...)) while the phones ring.
#
# Needs first: migration 0017, the worker deployed, phone_bridge 18.0.0.9.0.
# Run from this machine: bash scripts/vps-setup-pbx-ivr.sh
# Backs up each file it changes; running it again changes nothing.
set -euo pipefail
cd "$(dirname "$0")/.."

ssh vps "cat > /tmp/pbx-sync.sh.new" < asterisk/pbx-sync.sh
ssh vps "cat > /tmp/pb-say.sh.new" < asterisk/pb-say.sh
ssh vps "cat > /tmp/pb-owner.sh.new" < asterisk/pb-owner.sh
ssh vps "cat > /tmp/extensions-phone-bridge-routing.conf.new" < asterisk/extensions-phone-bridge-routing.conf
ssh vps "cat > /tmp/extensions-phone-bridge-ivr.conf.new" < asterisk/extensions-phone-bridge-ivr.conf

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
install_file /tmp/pb-say.sh.new pb-say.sh 755
install_file /tmp/pb-owner.sh.new pb-owner.sh 755
install_file /tmp/extensions-phone-bridge-ivr.conf.new extensions-phone-bridge-ivr.conf 644
install_file /tmp/extensions-phone-bridge-routing.conf.new extensions-phone-bridge-routing.conf 644

if grep -q '^#include extensions-phone-bridge-ivr.conf' extensions.conf; then
  echo "extensions.conf: ivr already included, unchanged"
else
  grep -q '^#include extensions-phone-bridge-routing.conf' extensions.conf || { echo "extensions.conf: routing (stage 2) not set up"; exit 1; }
  cp extensions.conf "extensions.conf.bak_pre_pbx_ivr_$ts"
  sed -i '/^#include extensions-phone-bridge-routing.conf/a #include extensions-phone-bridge-ivr.conf' extensions.conf
  echo "extensions.conf: ivr included (backup extensions.conf.bak_pre_pbx_ivr_$ts)"
fi

if grep -q '^#include musiconhold-phone-bridge.conf' musiconhold.conf; then
  echo "musiconhold.conf: phone bridge already included, unchanged"
else
  cp musiconhold.conf "musiconhold.conf.bak_pre_pbx_ring_$ts"
  printf '\n; "While ringing" messages from the phone menus in Odoo (pbx-sync.sh)\n#include musiconhold-phone-bridge.conf\n' >> musiconhold.conf
  echo "musiconhold.conf: phone bridge included (backup musiconhold.conf.bak_pre_pbx_ring_$ts)"
fi
[ -f musiconhold-phone-bridge.conf ] || { echo "; Written by pbx-sync.sh" > musiconhold-phone-bridge.conf; chmod 644 musiconhold-phone-bridge.conf; chown 1000:1000 musiconhold-phone-bridge.conf; }

A="docker exec asterisk asterisk -rx"
$A "moh reload" >/dev/null
$A "dialplan reload" >/dev/null
for c in pb-ivr pb-hours pb-do pb-menu pb-menu-keys pb-menu-dd pb-menu-saykeys pb-menu-saydd pb-say-stop pb-route; do
  out=$($A "dialplan show $c")   # not piped into grep -q: with pipefail its early exit fails the pipe
  case "$out" in *"Context '$c'"*) echo "$c: loaded" ;; *) echo "$c: NOT loaded"; exit 1 ;; esac
done
case "$($A "dialplan show pb-route")" in *pb-ivr*) echo "pb-route: asks pb-ivr" ;; *) echo "pb-route: NO pb-ivr hook"; exit 1 ;; esac
echo "--- sync:"
docker exec -u asterisk asterisk /etc/asterisk/pbx-sync.sh && echo "sync ok" || echo "sync failed; see above"
for f in pbwhen pbhours pbmenu pbkey pbsay; do $A "database show $f"; done
docker exec asterisk ls -la /var/spool/asterisk/phone-bridge-prompts 2>/dev/null || true
echo "--- while ringing classes:"
$A "moh show classes" | grep -A2 pbring- || echo "(none yet: set While Ringing, Callers Hear on a menu)"
REMOTE
