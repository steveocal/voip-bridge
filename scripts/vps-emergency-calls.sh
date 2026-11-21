#!/bin/bash
# 999 / 112 emergency calls and the "calls may be recorded" notice on the
# PBX (odoo20). docs/commercial-plan.md item 4.
#
#   999, 112 and 911 dialled from any extension ([from-internal]) go to
#   [pb-emergency] (extensions-phone-bridge-routing.conf) ahead of the
#   outbound patterns: no call limits, no blocked lists, no time limit, the
#   caller ID of a number with a registered emergency address (Odoo: Phone
#   Number → Emergency Address → GET /pbx/sync emergency lines → astdb
#   pbemerg/*).
#   Odoo's "Tell Callers Calls Are Recorded" on a number → notice line →
#   astdb pbnotice/<number> → [pb-route] plays it first.
#
# Installs pbx-sync.sh and extensions-phone-bridge-routing.conf, adds the
# three emergency extensions to [from-internal] in extensions.conf, reloads
# the dialplan and runs pbx-sync.sh once.
# Run from this machine: bash scripts/vps-emergency-calls.sh [ssh host]
# Backs up each file it changes; running it again changes nothing.
set -euo pipefail
cd "$(dirname "$0")/.."
HOST=${1:-odoo20}

for f in pbx-sync.sh extensions-phone-bridge-routing.conf; do
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
install_file /tmp/pbx-sync.sh.new pbx-sync.sh 755
install_file /tmp/extensions-phone-bridge-routing.conf.new extensions-phone-bridge-routing.conf 644

python3 - extensions.conf "$ts" <<'PY'
import shutil, sys
path, ts = sys.argv[1], sys.argv[2]
src = open(path).read()
lines = src.split("\n")
if any(l.startswith("exten => 999,") for l in lines):
    print("extensions.conf: emergency numbers already there"); sys.exit(0)
block = ["; Emergency calls: [pb-emergency] (extensions-phone-bridge-routing.conf,",
         "; scripts/vps-emergency-calls.sh). Exact numbers beat the patterns below."]
for n in ("999", "112", "911"):
    block += ["exten => %s,1,Gosub(pb-emergency,s,1(%s))" % (n, n), "same => n,Hangup()"]
out, ctx, done = [], "", False
for ln in lines:
    if ln.startswith("["):
        ctx = ln.split("]")[0][1:]
    if ctx == "from-internal" and not done and ln.startswith("exten => _"):
        out += block
        done = True
    out.append(ln)
if not done: sys.exit("extensions.conf: no pattern in [from-internal] to put the emergency numbers before")
shutil.copy2(path, path + ".bak_pre_emergency_" + ts)
open(path, "w").write("\n".join(out))
print("extensions.conf: emergency numbers added to [from-internal]")
PY

docker exec asterisk asterisk -rx "dialplan reload" >/dev/null
docker exec -u asterisk asterisk /etc/asterisk/pbx-sync.sh || echo "pbx-sync.sh failed (exit $?)"
docker exec asterisk asterisk -rx "dialplan show 999@from-internal" | head -4
docker exec asterisk asterisk -rx "database show pbnotice" | tail -2
docker exec asterisk asterisk -rx "database show pbemerg" | tail -2
REMOTE
