#!/bin/sh
# Builds this PBX's extensions from the ones in Odoo, so no one adds them here
# by hand. Run by [pbx-sync] in the dialplan (the worker triggers it through
# ARI whenever the extensions change) and every minute from the host's
# crontab as a safety net.
#
# GET /pbx/sync answers (src/pbxsync.ts):
#   version 1
#   ext <number> <webrtc|sip> <wake 0|1> <password> <caller name>
#   fwd <extension> <always|busy|noanswer|busynoanswer|vm> <ring seconds> <number|->
#   route <our number> <ring seconds> <record 0|1> <vm|hangup|fwd<number>> <legs|->
#   when / hours / menu / key / prompt: menus and opening hours (below)
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

# Menus and opening hours (src/ivr.ts). astdb, read by [pb-ivr]:
#   pbwhen/<our number> = <ring|menu>|<menu id|->|<out-of-hours action>|<prompt|->
#   pbhours/<our number> = <time zone>|<open specs !-joined, or ->|<shut specs, or ->
#   pbmenu/<id> = <prompt|->|<key timeout>|<retries>|<direct dial 0|1>
#   pbkey/<menu id>-<0-9|s|h|t> = <action>
# Actions: vm, hangup, repeat, fwd|<number>, menu|<id>, ring|<secs>|<Dial targets|->
# (out of hours: the same, or -|- with no hours). Prompts are WAV files in
# $PROMPTS, fetched once each; ones no longer used are deleted.
ivr=$(echo "$cfg" | awk '
  function phone(n) { return n ~ /^[1-9][0-9]*$/ && length(n) >= 7 && length(n) <= 15 }
  function dial(s,   n, legs, i, t, v, d, mv, out) {
    if (s == "-") return "-"
    out = ""; n = split(s, legs, ",")
    for (i = 1; i <= n; i++) {
      t = substr(legs[i], 1, 1); v = substr(legs[i], 2)
      if ((t == "e" || t == "a") && v ~ /^[0-9]+$/ && length(v) >= 2 && length(v) <= 6)
        d = (t == "e") ? "PJSIP/" v : "Local/" v "@pb-ring-app/n"
      else if (t == "m" && split(v, mv, "x") == 2 && mv[1] ~ /^[0-9]+$/ && mv[1] <= 120 && phone(mv[2]))
        d = "Local/" v "@pb-ring-mobile/n"
      else continue
      out = out (out == "" ? "" : "&") d
    }
    return out == "" ? "-" : out
  }
  # One action token as astdb fields; "" when it is not valid.
  function act(a,   s, c) {
    if (a == "vm" || a == "hangup" || a == "repeat") return a
    if (a ~ /^fwd/ && phone(substr(a, 4))) return "fwd|" substr(a, 4)
    if (a ~ /^menu[0-9]+$/) return "menu|" substr(a, 5)
    if (a ~ /^ring[0-9]+:/) {
      c = index(a, ":"); s = substr(a, 5, c - 5) + 0
      if (s >= 5 && s <= 300) return "ring|" s "|" dial(substr(a, c + 1))
    }
    return ""
  }
  function hash(h) { return h == "-" || h ~ /^[0-9a-f]+$/ && length(h) == 16 }
  function spec(s) { return s ~ /^[0-9:*-]+,[a-z*-]+,[0-9*-]+,[a-z*-]+$/ }
  $1 == "when" && phone($2) && ($3 == "ring" || $3 ~ /^menu[0-9]+$/) && hash($5) {
    n = ($4 == "-") ? "-|-" : act($4)
    if (n == "" || n == "repeat" || n ~ /^ring/) next
    if (n == "vm" || n == "hangup") n = n "|-"
    print "pbwhen", $2, ($3 == "ring" ? "ring|-" : "menu|" substr($3, 5)) "|" n "|" $5
  }
  $1 == "hours" && phone($2) && $3 ~ /^[A-Za-z0-9_+\/-]+$/ && ($4 == "open" || $4 == "shut") && spec($5) {
    tz[$2] = $3
    if ($4 == "open") op[$2] = op[$2] (op[$2] == "" ? "" : "!") $5
    else sh[$2] = sh[$2] (sh[$2] == "" ? "" : "!") $5
  }
  $1 == "menu" && $2 ~ /^[0-9]+$/ && hash($3) && $4 ~ /^[0-9]+$/ && $4 >= 1 && $4 <= 30 && $5 ~ /^[0-5]$/ && ($6 == "0" || $6 == "1") {
    print "pbmenu", $2, $3 "|" $4 "|" $5 "|" $6
  }
  $1 == "key" && $2 ~ /^[0-9]+$/ && $3 ~ /^([0-9]|s|h|t)$/ && (k = act($4)) != "" && !($3 == "t" && k == "repeat") {
    print "pbkey", $2 "-" $3, k
  }
  $1 == "prompt" && hash($2) && $2 != "-" { print "prompt", $2 }
  END { for (d in tz) print "pbhours", d, tz[d] "|" (op[d] == "" ? "-" : op[d]) "|" (sh[d] == "" ? "-" : sh[d]) }')
fam() { echo "$ivr" | awk -v f="$1" '$1 == f { print $2, $3 }'; }
sync_family pbwhen "$(fam pbwhen)"
sync_family pbhours "$(fam pbhours)"
sync_family pbmenu "$(fam pbmenu)"
sync_family pbkey "$(fam pbkey)"

PROMPTS=${PROMPTS:-/var/spool/asterisk/phone-bridge-prompts}
mkdir -p "$PROMPTS"
want=$(echo "$ivr" | awk '$1 == "prompt" { print $2 }')
for h in $want; do
  [ -s "$PROMPTS/$h.wav" ] && continue
  curl -sf --max-time 60 -H "X-Pbx-Secret: $PBX_SECRET" -o "$PROMPTS/$h.tmp" "$WORKER/pbx/prompt/$h" &&
    chmod 644 "$PROMPTS/$h.tmp" && mv "$PROMPTS/$h.tmp" "$PROMPTS/$h.wav" || { rm -f "$PROMPTS/$h.tmp"; echo "pbx-sync: prompt $h not fetched; next time" >&2; }
done
for f in "$PROMPTS"/*.wav; do
  [ -e "$f" ] || continue
  h=$(basename "$f" .wav)
  echo "$want" | grep -q -x -F "$h" || rm -f "$f"
done

# Only report what was applied, so the worker can tell it's in step.
applied=$(printf '%s\n' "$cfg" | sha256sum | cut -d' ' -f1)
curl -s --max-time 10 -X POST -H "X-Pbx-Secret: $PBX_SECRET" "$WORKER/pbx/synced" \
  --data-urlencode "applied=$applied" >/dev/null
