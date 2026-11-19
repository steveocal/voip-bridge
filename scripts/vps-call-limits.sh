#!/bin/bash
# Outgoing call limits and authenticated call events on the PBX (odoo20).
#
#   Dashboard Settings → Limits (src/limits.ts) → GET /pbx/sync limits line
#   → pbx-sync.sh → astdb pbx/call_limits → [pb-out-limit], Gosub'd before
#   every Dial() out through the trunk.
#
#   Every POST to /call-event goes through /etc/asterisk/pb-event.sh, which
#   sends X-Pbx-Secret (phone-bridge.env); the worker refuses trunk events
#   without it. The caller ID and dialled number are FILTER()ed before they
#   reach System(), which runs its line through a shell.
#
# Installs pb-event.sh, recording-done.sh, pbx-sync.sh and
# extensions-phone-bridge-routing.conf, and patches extensions.conf:
#   - System(curl … /call-event …) lines → pb-event.sh, values filtered;
#   - [pb-out-limit] before the trunk Dial() in [outbound-dial] (the
#     extension's own limits), [ring-mobile], [mobile-call] (me: the user's
#     mobile; far: counted against MC_EXT) and [web-callback] customer.
# Then reloads the dialplan and runs pbx-sync.sh once.
#
# Safe to run before the worker that requires the secret is deployed: the
# old worker ignores the header. Deploy the worker after this.
# Run from this machine: bash scripts/vps-call-limits.sh [ssh host]
# Backs up each file it changes; running it again changes nothing.
set -euo pipefail
cd "$(dirname "$0")/.."
HOST=${1:-odoo20}

for f in pb-event.sh recording-done.sh pbx-sync.sh extensions-phone-bridge-routing.conf; do
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
install_file /tmp/pb-event.sh.new pb-event.sh 755
install_file /tmp/recording-done.sh.new recording-done.sh 755
install_file /tmp/pbx-sync.sh.new pbx-sync.sh 755
install_file /tmp/extensions-phone-bridge-routing.conf.new extensions-phone-bridge-routing.conf 644

python3 - extensions.conf "$ts" <<'PY'
import re, shutil, sys
path, ts = sys.argv[1], sys.argv[2]
src = open(path).read()
lines = src.split("\n")
CURL = 'System(curl -s -X POST "https://voip-bridge.wandering-mode-c597.workers.dev/call-event" '
CALLER = '"caller=${FILTER(A-Za-z0-9+._@-,${CALLERID(num)})}"'
out, ctx = [], ""
LIMIT = {  # context: (the trunk Dial() it guards, extension argument, what to do when refused)
    "outbound-dial": ("same => n,Dial(PJSIP/${VMSNUM}@voipms,", "${OUTEXT}", "Return()"),
    "ring-mobile": ("same => n,Dial(PJSIP/+66926181049@voipms,", "", "Hangup()"),
    "mobile-call:me": ("same => n,Dial(PJSIP/${MC_MOBILE}@voipms,", "", "Hangup()"),
    "mobile-call:far": ("same => n,Dial(PJSIP/${MC_TARGET}@voipms,", "${MC_EXT}", "Hangup()"),
    "web-callback:customer": ("same => n,Dial(PJSIP/${CB_NUMBER}@voipms,", "", "Hangup()"),
}
exten = ""
for ln in lines:
    m = re.match(r"^\[([^\]]+)\]", ln)
    if m: ctx, exten = m.group(1), ""
    m = re.match(r"^exten => ([^,]+),", ln)
    if m: exten = m.group(1)
    if CURL in ln:
        ln = ln.replace(CURL, "System(/etc/asterisk/pb-event.sh ").replace("--data-urlencode ", "")
        ln = ln.replace('"caller=${CALLERID(num)}"', CALLER)
        ln = ln.replace('"did=${EXTEN}"', '"did=${FILTER(0-9+,${EXTEN})}"')
        ln = ln.replace('"callId=${UNIQUEID}"', '"callId=${FILTER(0-9.,${UNIQUEID})}"')
        ln = ln.replace('"callId=${CDR(uniqueid)}"', '"callId=${FILTER(0-9.,${CDR(uniqueid)})}"')
        ln = ln.replace('"duration=${CDR(billsec)}"', '"duration=${FILTER(0-9,${CDR(billsec)})}"')
    for key in (ctx + ":" + exten, ctx):
        if key in LIMIT and ln.startswith(LIMIT[key][0]):
            gosub = "same => n,Gosub(pb-out-limit,s,1(%s))" % LIMIT[key][1]
            if not (out and out[-2:] and out[-2] == gosub):
                out.append(gosub)
                out.append('same => n,ExecIf($["${PBLIMIT}" = "1"]?%s)' % LIMIT[key][2])
            break
    out.append(ln)
new = "\n".join(out)
left = [l for l in new.split("\n") if "/call-event" in l and "curl" in l]
if left: sys.exit("extensions.conf: call-event curl lines left unpatched:\n" + "\n".join(left))
for key, (dial, _, _) in LIMIT.items():
    if new.count(dial) and new.count("Gosub(pb-out-limit") < 1: sys.exit("no limit added for " + key)
if new == src: print("extensions.conf: unchanged")
else:
    shutil.copy2(path, path + ".bak_pre_call_limits_" + ts)
    open(path, "w").write(new)
    print("extensions.conf: patched (%d limit checks)" % new.count("Gosub(pb-out-limit"))
PY

docker exec asterisk asterisk -rx "dialplan reload" >/dev/null
docker exec -u asterisk asterisk /etc/asterisk/pbx-sync.sh || echo "pbx-sync.sh failed (exit $?)"
docker exec asterisk asterisk -rx "database get pbx call_limits" || true
docker exec asterisk asterisk -rx "dialplan show pb-out-limit" | tail -1
REMOTE
