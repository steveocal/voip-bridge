#!/bin/sh
# Builds this PBX's extensions from the ones in Odoo, so no one adds them here
# by hand. Run by [pbx-sync] in the dialplan (the worker triggers it through
# ARI whenever the extensions change) and every 5 minutes from the host's
# crontab as a safety net.
#
# GET /pbx/sync answers (src/pbxsync.ts):
#   version 1
#   ext <number> <webrtc|sip> <wake 0|1> <password> <caller name>
# Each extension becomes an endpoint, auth and aor in $OUT, on the templates
# in pjsip-phone-bridge.conf. An extension that is already defined by hand in
# another pjsip*.conf is skipped (and logged), so hand-made ones can be moved
# to Odoo one at a time by deleting their block. Extensions that use the
# Android app (wake 1) go to astdb pbx/push_extensions for [wake-phone].
# PJSIP is only reloaded when the file changed. Every value is checked here
# again, as it ends up in the PBX config.
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
else $AST "database del pbx push_extensions" >/dev/null; fi

# Only report what was applied, so the worker can tell it's in step.
applied=$(printf '%s\n' "$cfg" | sha256sum | cut -d' ' -f1)
curl -s --max-time 10 -X POST -H "X-Pbx-Secret: $PBX_SECRET" "$WORKER/pbx/synced" \
  --data-urlencode "applied=$applied" >/dev/null
