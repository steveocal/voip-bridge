#!/bin/sh
# Builds this PBX's extensions from the ones in Odoo, so no one adds them here
# by hand. Run by [pbx-sync] in the dialplan (the worker triggers it through
# ARI whenever the extensions change) and every 5 minutes from the host's
# crontab as a safety net.
#
# GET /pbx/sync answers (src/pbxsync.ts):
#   version 1
#   ext <number> <webrtc|sip> <wake 0|1> <password> <caller name>
#   fwd <extension> <always|busy|noanswer|busynoanswer|vm> <ring seconds> <number|->
#   route <our number> <ring seconds> <record 0|1> <vm|hangup|fwd<number>> <legs|->
# Each extension becomes an endpoint, auth and aor in $OUT, on the templates
# in pjsip-phone-bridge.conf. An extension that is already defined by hand in
# another pjsip*.conf is skipped (and logged), so hand-made ones can be moved
# to Odoo one at a time by deleting their block. Extensions that use the
# Android app (wake 1) go to astdb pbx/push_extensions for [wake-phone].
# PJSIP is only reloaded when the file changed. fwd and route lines (the
# inbound routing set up in Odoo) become astdb pbfwd/<extension> and
# pbroute/<our number>, read by [ext-dial] and [pb-route]; keys no longer
# listed are deleted, so a number taken out of Odoo goes back to the
# dialplan's own routing. Every value is checked here again, as it ends up
# in the PBX config.
#
# Testing: AST="echo" ETC=/tmp/x run it without Asterisk.
set -u
. "${PHONE_BRIDGE_ENV:-/etc/asterisk/phone-bridge.env}"
AST=${AST:-asterisk -rx}
ETC=${ETC:-/etc/asterisk}
OUT="$ETC/pjsip-phone-bridge-extensions.conf"
umask 027   # the file holds SIP passwords

cfg=$(curl -sf --max-time 15 -H "X-Pbx-Secret: $PBX_SECRET" "$WORKER/pbx/sync") || exit 1
case "$cfg" in "version 1"*) ;; *) exit 1 ;; esac

# Extensions defined by hand: numeric sections in any other pjsip*.conf.
hand=$(for f in "$ETC"/pjsip*.conf; do [ "$f" = "$OUT" ] || cat "$f"; done 2>/dev/null |
  sed -n 's/^\[\([0-9][0-9]*\)\].*/\1/p' | sort -u)

tmp="$OUT.tmp.$$"
{
  echo "; Written by pbx-sync.sh from the extensions in Odoo. Don't edit: the next sync overwrites it."
  echo "$cfg" | while read -r kind num type wake pw name; do
    [ "$kind" = ext ] || continue
    case "$num" in ""|*[!0-9]*) continue ;; esac
    [ ${#num} -ge 2 ] && [ ${#num} -le 6 ] || continue
    case "$type" in webrtc|sip) ;; *) continue ;; esac
    case "$pw" in ""|*[!A-Za-z0-9._~-]*) continue ;; esac
    [ ${#pw} -ge 6 ] || continue
    case "$name" in *[!A-Za-z0-9\ .\'-]*) name="" ;; esac
    if echo "$hand" | grep -q -x -F "$num"; then
      echo "pbx-sync: $num is defined by hand in pjsip.conf; skipped" >&2
      continue
    fi
    printf '\n[%s](pb-%s)\nauth = %s-auth\naors = %s\ncallerid = "%s" <%s>\n' "$num" "$type" "$num" "$num" "${name:-$num}" "$num"
    printf '\n[%s-auth](pb-auth)\nusername = %s\npassword = %s\n' "$num" "$num" "$pw"
    printf '\n[%s](pb-aor)\n' "$num"
  done
} > "$tmp" || { rm -f "$tmp"; exit 1; }

push=$(echo "$cfg" | awk '$1 == "ext" && $3 == "webrtc" && $4 == "1" && $2 ~ /^[0-9]+$/ { printf "%s%s", sep, $2; sep = "," }')

if cmp -s "$tmp" "$OUT"; then
  rm -f "$tmp"
else
  mv "$tmp" "$OUT"
  $AST "module reload res_pjsip.so" >/dev/null || exit 1
fi
if [ -n "$push" ]; then $AST "database put pbx push_extensions $push" >/dev/null
else $AST "database del pbx push_extensions" >/dev/null 2>&1; fi

# "key value" lines for astdb. Legs: e<ext> → PJSIP/<ext>, a<ext> → the
# Android app woken first, m<delay>x<number> → a mobile/forward leg.
routes=$(echo "$cfg" | awk '
  function phone(n) { return n ~ /^[1-9][0-9]*$/ && length(n) >= 7 && length(n) <= 15 }
  $1 == "route" && phone($2) && $3 ~ /^[0-9]+$/ && $3 >= 5 && $3 <= 300 && ($4 == "0" || $4 == "1") {
    na = $5
    if (na != "vm" && na != "hangup" && !(substr(na, 1, 3) == "fwd" && phone(substr(na, 4)))) next
    dial = ""; n = split($6, legs, ",")
    for (i = 1; i <= n; i++) {
      t = substr(legs[i], 1, 1); v = substr(legs[i], 2)
      if ((t == "e" || t == "a") && v ~ /^[0-9]+$/ && length(v) >= 2 && length(v) <= 6)
        d = (t == "e") ? "PJSIP/" v : "Local/" v "@pb-ring-app/n"
      else if (t == "m" && split(v, mv, "x") == 2 && mv[1] ~ /^[0-9]+$/ && mv[1] <= 120 && phone(mv[2]))
        d = "Local/" v "@pb-ring-mobile/n"
      else continue
      dial = dial (dial == "" ? "" : "&") d
    }
    print $2, $3 "|" $4 "|" na "|" (dial == "" ? "-" : dial)
  }')
fwds=$(echo "$cfg" | awk '
  function phone(n) { return n ~ /^[1-9][0-9]*$/ && length(n) >= 7 && length(n) <= 15 }
  $1 == "fwd" && $2 ~ /^[0-9]+$/ && length($2) >= 2 && length($2) <= 6 && $4 ~ /^[0-9]+$/ && $4 <= 120 {
    if ($3 == "vm") print $2, "vm|0|-"
    else if (($3 == "always" || $3 == "busy" || $3 == "noanswer" || $3 == "busynoanswer") && phone($5)) print $2, $3 "|" $4 "|" $5
  }')
# Make astdb family $1 hold exactly the "key value" lines in $2.
sync_family() {
  have=$($AST "database show $1" 2>/dev/null | sed -n "s|^/$1/\([^ ]*\) *: *\(.*[^ ]\) *$|\1 \2|p")
  echo "$2" | while read -r k v; do
    [ -n "$k" ] || continue
    [ "$(echo "$have" | awk -v k="$k" '$1 == k { print $2 }')" = "$v" ] || $AST "database put $1 $k $v" >/dev/null
  done
  echo "$have" | while read -r k v; do
    [ -n "$k" ] || continue
    echo "$2" | awk -v k="$k" '$1 == k { f = 1 } END { exit !f }' || $AST "database del $1 $k" >/dev/null
  done
}
sync_family pbroute "$routes"
sync_family pbfwd "$fwds"

# Only report what was applied, so the worker can tell it's in step.
applied=$(printf '%s\n' "$cfg" | sha256sum | cut -d' ' -f1)
curl -s --max-time 10 -X POST -H "X-Pbx-Secret: $PBX_SECRET" "$WORKER/pbx/synced" \
  --data-urlencode "applied=$applied" >/dev/null
