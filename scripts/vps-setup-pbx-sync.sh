#!/bin/bash
# Lets Odoo create the extensions on the Asterisk VPS: no more editing
# pjsip.conf / extensions.conf by hand for a new extension.
#
#   Odoo phone_bridge.extension → worker (D1, GET /pbx/sync) → pbx-sync.sh
#   → /etc/asterisk/pjsip-phone-bridge-extensions.conf → PJSIP reload
#
# Installs asterisk/pbx-sync.sh and asterisk/pjsip-phone-bridge.conf, adds the
# two #includes to pjsip.conf, the [pbx-sync] context (the worker runs it over
# ARI after a change), a 5-minute crontab entry, and /etc/asterisk/
# phone-bridge.env (worker URL + PUSH_SECRET, taken from the dialplan).
# Dialplan: internal calls ring any number that is a PJSIP endpoint (not just
# the hardcoded 200-204), and the app push-wake works for any extension Odoo
# marks "Wake the Phone App" (astdb pbx/push_extensions; 202 stays as before).
#
# Extensions still defined by hand in pjsip.conf are skipped by the sync, so
# this changes nothing for them; move each one over by deleting its block once
# it's in Odoo with the same password.
#
# Needs first: migration 0015 applied and the worker deployed (else the sync
# just fails and leaves things as they are).
# Run from this machine: bash scripts/vps-setup-pbx-sync.sh
# Backs up each file it changes; running it again changes nothing.
set -euo pipefail
cd "$(dirname "$0")/.."

ssh vps "cat > /tmp/pbx-sync.sh.new" < asterisk/pbx-sync.sh
ssh vps "cat > /tmp/pjsip-phone-bridge.conf.new" < asterisk/pjsip-phone-bridge.conf

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
install_file /tmp/pjsip-phone-bridge.conf.new pjsip-phone-bridge.conf 644

if [ -f phone-bridge.env ]; then echo "phone-bridge.env: there, unchanged"
else
  secret=$(grep -o 'push/wake?secret=[0-9a-f]*' extensions.conf | head -1 | cut -d= -f2)
  [ -n "$secret" ] || { echo "PUSH_SECRET not found in extensions.conf; nothing more changed"; exit 1; }
  printf 'WORKER=https://voip-bridge.wandering-mode-c597.workers.dev\nPBX_SECRET=%s\n' "$secret" > phone-bridge.env
  chmod 600 phone-bridge.env; chown 1000:1000 phone-bridge.env
  echo "phone-bridge.env: written"
fi

if [ ! -f pjsip-phone-bridge-extensions.conf ]; then
  echo "; Written by pbx-sync.sh from the extensions in Odoo. Don't edit: the next sync overwrites it." > pjsip-phone-bridge-extensions.conf
  chmod 640 pjsip-phone-bridge-extensions.conf; chown 1000:1000 pjsip-phone-bridge-extensions.conf
fi

if grep -q '^#include pjsip-phone-bridge-extensions.conf' pjsip.conf; then echo "pjsip.conf: includes there, unchanged"
else
  cp pjsip.conf "pjsip.conf.bak_pre_pbx_sync_$ts"
  printf '\n; Extensions made in Odoo (scripts/vps-setup-pbx-sync.sh in voip-bridge).\n#include pjsip-phone-bridge.conf\n#include pjsip-phone-bridge-extensions.conf\n' >> pjsip.conf
  echo "pjsip.conf: includes added (backup pjsip.conf.bak_pre_pbx_sync_$ts)"
fi

if grep -q '^\[pbx-sync\]' extensions.conf; then echo "extensions.conf: pbx-sync already there, unchanged"
else
  cp extensions.conf "extensions.conf.bak_pre_pbx_sync_$ts"
  python3 - <<'PY'
p = "extensions.conf"; s = open(p).read()
def rep(a, b):
    global s
    if s.count(a) != 1: raise SystemExit(f"not found exactly once, nothing changed: {a[:60]}")
    s = s.replace(a, b)
# Internal calls: any PJSIP endpoint number rings that extension.
rep("exten => _X.,1,NoOp(OUTBOUND: ${CALLERID(num)} -> ${EXTEN})\n",
    "; A number that is one of our PJSIP endpoints (Odoo's extensions, pbx-sync.sh)\n"
    "; rings that extension; anything else goes out.\n"
    "exten => _X.,1,GotoIf($[${LEN(${EXTEN})} > 6]?out)\n"
    "same => n,GotoIf($[\"${PJSIP_ENDPOINT(${EXTEN},context)}\" = \"\"]?out)\n"
    "same => n,Gosub(ext-dial,s,1(${EXTEN}))\n"
    "same => n,Hangup()\n"
    "same => n(out),NoOp(OUTBOUND: ${CALLERID(num)} -> ${EXTEN})\n")
# Push-wake for every app extension (Odoo "Wake the Phone App"), 202 as before.
rep("same => n,ExecIf($[\"${ARG1}\" = \"202\"]?Gosub(wake-phone,s,1))\n",
    "same => n,ExecIf($[${REGEX(\"(^|,)${ARG1}(,|$)\" ${DB(pbx/push_extensions)},202)}]?Gosub(wake-phone,s,1(${ARG1})))\n")
rep("[wake-phone]\nexten => s,1,GotoIf($[\"${PJSIP_DIAL_CONTACTS(202)}\" != \"\"]?done)\n",
    "[wake-phone]\n; ARG1 = the extension (202 when not given, as [ring-202] calls it).\n"
    "exten => s,1,Set(WEXT=${IF($[\"${ARG1}\" = \"\"]?202:${ARG1})})\n"
    "same => n,GotoIf($[\"${PJSIP_DIAL_CONTACTS(${WEXT})}\" != \"\"]?done)\n")
rep("&extension=202&caller=", "&extension=${WEXT}&caller=")
rep("same => n,While($[\"${PJSIP_DIAL_CONTACTS(202)}\" = \"\" & ${TRIES} < 30])\n",
    "same => n,While($[\"${PJSIP_DIAL_CONTACTS(${WEXT})}\" = \"\" & ${TRIES} < 30])\n")
s += ("\n; Run by the worker through ARI (Local/s@pbx-sync) after the extensions change\n"
      "; in Odoo; the host crontab also runs the script every 5 minutes.\n"
      "[pbx-sync]\nexten => s,1,System(/etc/asterisk/pbx-sync.sh)\nsame => n,Hangup()\nexten => noop,1,Hangup()\n")
open(p, "w").write(s)
PY
  echo "extensions.conf: pbx-sync added (backup extensions.conf.bak_pre_pbx_sync_$ts)"
fi

if crontab -l 2>/dev/null | grep -q 'pbx-sync.sh'; then echo "crontab: there, unchanged"
else
  (crontab -l 2>/dev/null; echo '*/5 * * * * docker exec -u asterisk asterisk /etc/asterisk/pbx-sync.sh >/dev/null 2>&1') | crontab -
  echo "crontab: pbx-sync every 5 minutes added"
fi

docker exec asterisk asterisk -rx "dialplan reload" >/dev/null
docker exec asterisk asterisk -rx "module reload res_pjsip.so" >/dev/null
echo "--- first sync:"
docker exec -u asterisk asterisk /etc/asterisk/pbx-sync.sh && echo "sync ok" || echo "sync failed (worker not deployed yet?); nothing applied"
docker exec asterisk asterisk -rx "pjsip show endpoints" | grep 'Endpoint:'
docker exec asterisk asterisk -rx "dialplan show wake-phone" | head -4
REMOTE
