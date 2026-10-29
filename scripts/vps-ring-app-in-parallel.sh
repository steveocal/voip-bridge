#!/bin/sh
# Inbound calls stop waiting for the Android app. Until now the inbound
# contexts ran Gosub(wake-phone) before Dial(), so while 202 was asleep every
# phone stayed silent for up to 20s while the app was pushed awake. Now 202 is
# rung through [ring-202], a Local channel that does the push-wake itself, so
# the other phones ring straight away and 202 joins when it registers.
# Also: 01283246490 (DID ending 490) rings 201, 202 and 203; 491 stays 201+202.
# Run on the VPS: ssh vps 'sh -s' < scripts/vps-ring-app-in-parallel.sh
set -e
cd /opt/asterisk/config
if grep -q '^\[ring-202\]' extensions.conf; then echo "already set up"; grep -n 'ring-202\|EXTEN:-3}" = "49' extensions.conf; exit 0; fi
cp extensions.conf "extensions.conf.bak_pre_ring_app_parallel_$(date +%Y%m%d_%H%M%S)"
python3 - <<'EOF'
p = "extensions.conf"
lines = open(p).read().split("\n")
APP = "Local/s@ring-202/n"
out, ctx, changed = [], "", 0
for line in lines:
    if line.startswith("["):
        ctx = line
        if ctx == "[wake-phone]":
            out += [
                "; Android app (202) leg of the inbound ring groups. Wakes the app if it",
                "; isn't registered (see [wake-phone]) and then rings it, inside its own",
                "; Local channel so the other phones in the same Dial() ring straight away",
                "; instead of waiting for the push. Hangs up if the app never registers.",
                "[ring-202]",
                "exten => s,1,Gosub(wake-phone,s,1)",
                'same => n,GotoIf($["${PJSIP_DIAL_CONTACTS(202)}" = ""]?done)',
                "same => n,Dial(PJSIP/202,45)",
                "same => n(done),Hangup()",
                "",
            ]
            changed += 1
    if ctx in ("[default]", "[voipms-inbound]", "[web-callback]"):
        if line == "same => n,Gosub(wake-phone,s,1)":
            changed += 1
            continue
        if line.startswith(("same => n,Dial(", "same => n,Set(RING=", "same => n,ExecIf(")) and "PJSIP/202" in line:
            line = line.replace("PJSIP/202", APP)
            changed += 1
        if line == 'same => n,ExecIf($["${EXTEN:-3}" = "490" | "${EXTEN:-3}" = "491"]?Set(RING=PJSIP/201&' + APP + '))':
            out.append('same => n,ExecIf($["${EXTEN:-3}" = "490"]?Set(RING=PJSIP/201&' + APP + '&PJSIP/203))')
            line = 'same => n,ExecIf($["${EXTEN:-3}" = "491"]?Set(RING=PJSIP/201&' + APP + '))'
            changed += 1
        elif line == 'same => n,ExecIf($["${EXTEN:-3}" = "490"]?Set(RING=PJSIP/201&' + APP + '&PJSIP/203))':
            pass  # 490 already split by vps-ring-490-add-203.sh
    out.append(line)
open(p, "w").write("\n".join(out))
print("edits:", changed)
EOF
docker exec asterisk asterisk -rx "dialplan reload" >/dev/null
grep -n 'wake-phone\|ring-202\|EXTEN:-3}" = "49\|Dial(PJSIP/20\|Dial(PJSIP/201' extensions.conf
