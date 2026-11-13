#!/bin/sh
# Stop the Android app ringing when another extension answers.
# When the app isn't registered, [wake-phone] pushes "incoming_call" and the
# phone rings natively while Asterisk waits for the app to register. If
# another phone answers (or the caller hangs up) in that time, the parent
# Dial() hangs the app's leg up, but nothing told the phone, so it kept
# ringing until its own 45s timeout. Now a pushed leg gets a hangup handler
# that sends "call_cancelled", which dismisses the ringing notification.
# Sent whenever the leg ends: if the app took the call, its notification is
# already gone and the cancel does nothing.
# Run on the VPS: ssh vps 'sh -s' < scripts/vps-cancel-push-on-answer.sh
set -e
cd /opt/asterisk/config
if grep -q '^\[wake-cancel\]' extensions.conf; then echo "already set up"; else
cp extensions.conf "extensions.conf.bak_pre_wake_cancel_$(date +%Y%m%d_%H%M%S)"
python3 - <<'EOF'
import re
p = "extensions.conf"
s = open(p).read()
m = re.search(r"Set\(WAKE=\$\{CURL\((https://[^?]+/push/wake)\?secret=([0-9a-f]+)&", s)
if not m: raise SystemExit("wake-phone push line not found, nothing changed")
url, secret = m.group(1), m.group(2)
anchor = 'same => n,GotoIf($["${PUSHED}" = "0"]?done)\n'
if s.count(anchor) != 1: raise SystemExit("wake-phone PUSHED check not found, nothing changed")
s = s.replace(anchor, anchor + "same => n,Set(CHANNEL(hangup_handler_push)=wake-cancel,s,1(${WEXT}))\n")
handler = (
    "; Hangup handler on a leg that [wake-phone] pushed: dismiss the phone's\n"
    "; ringing notification (answered elsewhere, caller gone, or app never\n"
    "; registered). ARG1 = the extension.\n"
    "[wake-cancel]\n"
    "exten => s,1,Set(CURLOPT(conntimeout)=2)\n"
    "same => n,Set(CURLOPT(httptimeout)=4)\n"
    "same => n,Set(WC=${CURL(" + url + "?secret=" + secret + "&extension=${ARG1}&type=call_cancelled)})\n"
    "same => n,Return()\n\n"
)
# after the end of [wake-phone] (its first blank line), so its comments stay with it
i = s.index("[wake-phone]\n"); j = s.index("\n\n", i) + 2
s = s[:j] + handler + s[j:]
open(p, "w").write(s)
print("added [wake-cancel]")
EOF
fi
docker exec asterisk asterisk -rx "dialplan reload" >/dev/null
docker exec asterisk asterisk -rx "dialplan show wake-cancel" | head -8
grep -n 'wake-cancel' extensions.conf
