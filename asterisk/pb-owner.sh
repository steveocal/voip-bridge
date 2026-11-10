#!/bin/sh
# pb-owner.sh <caller number>: the Dial targets for the caller's salesperson
# ("Customer's salesperson" menu keys), or "-" for nobody. Run by [pb-do]
# through SHELL(). Asks the worker (GET /pbx/owner, src/owner.ts) for the
# legs and turns them into Dial targets the way pbx-sync.sh does for route
# lines: e<ext> → PJSIP/<ext>, a<ext> → the Android app woken first,
# m<delay>x<number> → a mobile / forward.
. "${PHONE_BRIDGE_ENV:-/etc/asterisk/phone-bridge.env}"
caller=$(printf '%s' "$1" | tr -cd '0-9+')
[ -n "$caller" ] || { printf -; exit 0; }
legs=$(curl -sfG --max-time 5 -H "X-Pbx-Secret: $PBX_SECRET" --data-urlencode "caller=$caller" "$WORKER/pbx/owner") || legs=-
printf '%s\n' "$legs" | head -n 1 | awk '
  function phone(n) { return n ~ /^[1-9][0-9]*$/ && length(n) >= 7 && length(n) <= 15 }
  {
    out = ""; n = split($1, legs, ",")
    for (i = 1; i <= n; i++) {
      t = substr(legs[i], 1, 1); v = substr(legs[i], 2)
      if ((t == "e" || t == "a") && v ~ /^[0-9]+$/ && length(v) >= 2 && length(v) <= 6)
        d = (t == "e") ? "PJSIP/" v : "Local/" v "@pb-ring-app/n"
      else if (t == "m" && split(v, mv, "x") == 2 && mv[1] ~ /^[0-9]+$/ && mv[1] <= 120 && phone(mv[2]))
        d = "Local/" v "@pb-ring-mobile/n"
      else continue
      out = out (out == "" ? "" : "&") d
    }
    printf "%s", (out == "" ? "-" : out)
  }'
