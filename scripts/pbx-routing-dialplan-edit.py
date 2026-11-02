#!/usr/bin/env python3
"""Edits extensions.conf for the inbound routing from Odoo
(asterisk/extensions-phone-bridge-routing.conf). Run by
scripts/vps-setup-pbx-routing.sh on the VPS; usage: pbx-routing-dialplan-edit.py <config dir>.

- [voipms-inbound] and [default] ask [pb-route] first, just after the ring
  event, and stop there when Odoo routed the call;
- the old [ext-dial] goes (the routing file has the one with forwarding: two
  contexts of the same name would merge);
- #include extensions-phone-bridge-routing.conf at the end.

Changes nothing (exit 1) if any piece isn't found exactly once; prints
"unchanged" when it was already done."""
import re
import sys

path = sys.argv[1].rstrip("/") + "/extensions.conf"
s = open(path).read()
if "#include extensions-phone-bridge-routing.conf" in s:
    print("extensions.conf: routing already there, unchanged")
    sys.exit(0)

HOOK = ('same => n,Gosub(pb-route,s,1(${EXTEN}))\n'
        'same => n,GotoIf($["${PBROUTED}" = "1"]?done)\n')
RING = 'same => n,System(curl -s -X POST "https://voip-bridge.wandering-mode-c597.workers.dev/call-event" --data-urlencode "event=ring" --data-urlencode "callId=${UNIQUEID}" --data-urlencode "caller=${CALLERID(num)}" --data-urlencode "did=${EXTEN}" &)\n'


def context(name):
    m = re.search(r"^\[" + re.escape(name) + r"\]\n(.*?)(?=^\[|\Z)", s, re.S | re.M)
    if not m:
        sys.exit(f"[{name}] not found; nothing changed")
    return m


for name in ("voipms-inbound", "default"):
    m = context(name)
    body = m.group(1)
    if body.count(RING) != 1 or "(done),Hangup()" not in body:
        sys.exit(f"[{name}]: ring event or done label not found exactly once; nothing changed")
    s = s[:m.start(1)] + body.replace(RING, RING + HOOK) + s[m.end(1):]

m = context("ext-dial")
if "Dial(PJSIP/${ARG1},30)" not in m.group(1):
    sys.exit("[ext-dial] isn't the expected one; nothing changed")
s = s[:m.start()] + "; [ext-dial] is in extensions-phone-bridge-routing.conf (forwarding from Odoo).\n\n" + s[m.end():]

s = s.rstrip("\n") + ("\n\n; Inbound routing and forwarding from Odoo (scripts/vps-setup-pbx-routing.sh in voip-bridge).\n"
                      "#include extensions-phone-bridge-routing.conf\n")
open(path, "w").write(s)
print("extensions.conf: pb-route hooks added to [voipms-inbound] and [default], [ext-dial] moved, include added")
