#!/bin/bash
# Adds the dashboard's "Ring my mobile straight away" switch to the Asterisk
# VPS. The worker's /voicemail/sync now also answers "mobile_first 0|1";
# greetings-sync.sh copies it to astdb ring/mobile_first, and [ring-mobile]
# skips its 20s head start for the app/desk phones while it's 1.
# Run from this machine: bash scripts/vps-setup-mobile-first.sh
# Backs up both files first; running it again changes nothing.
set -euo pipefail

ssh vps 'bash -s' <<'REMOTE'
set -euo pipefail
cd /opt/asterisk/config
ts=$(date +%Y%m%d_%H%M%S)

if grep -q 'ring/mobile_first' extensions.conf; then
  echo "extensions.conf: mobile-first already there, unchanged"
else
  [ "$(grep -c '^same => n,Wait(20)$' extensions.conf)" = 1 ] || { echo "[ring-mobile] Wait(20) not found exactly once; nothing changed"; exit 1; }
  cp extensions.conf "extensions.conf.bak_pre_mobile_first_$ts"
  sed -i 's|^same => n,Wait(20)$|; Dashboard "Ring my mobile straight away" (astdb ring/mobile_first = 1, set by greetings-sync.sh) skips the head start.\nsame => n,ExecIf($["${DB(ring/mobile_first)}" != "1"]?Wait(20))|' extensions.conf
  echo "extensions.conf: mobile-first added (backup extensions.conf.bak_pre_mobile_first_$ts)"
fi

if grep -q 'mobile_first' greetings-sync.sh; then
  echo "greetings-sync.sh: mobile-first already there, unchanged"
else
  cp greetings-sync.sh "greetings-sync.sh.bak_pre_mobile_first_$ts"
  cat > greetings-sync.sh <<'EOF'
#!/bin/sh
# Copies the dashboard's voicemail settings onto this box, so voicemail keeps
# working when the worker is down. Run by [greetings-sync] in extensions.conf
# (the worker triggers it through ARI whenever a setting changes) and every
# 5 minutes from the host's crontab as a safety net.
#   /voicemail/sync answers:  direct 0|1
#                             mobile_first 0|1
#                             greeting <id> <version>   (or "greeting none")
# The active greeting is kept at greetings/active.wav, which [voicemail] plays;
# with none, callers hear the stock vm-intro prompt.
W=https://voip-bridge.wandering-mode-c597.workers.dev
D=/var/spool/asterisk/greetings
mkdir -p "$D"
cfg=$(curl -sf --max-time 10 "$W/voicemail/sync") || exit 1

direct=$(echo "$cfg" | sed -n 's/^direct //p')
if [ "$direct" = "1" ]; then asterisk -rx "database put voicemail direct 1" >/dev/null
else asterisk -rx "database del voicemail direct" >/dev/null; fi

# "Ring my mobile straight away": [ring-mobile] skips its 20s Wait.
mobile_first=$(echo "$cfg" | sed -n 's/^mobile_first //p')
if [ "$mobile_first" = "1" ]; then asterisk -rx "database put ring mobile_first 1" >/dev/null
else asterisk -rx "database del ring mobile_first" >/dev/null; fi

set -- $(echo "$cfg" | sed -n 's/^greeting //p')
id=$1; ver=$2
case "$id$ver" in *[!0-9]*|"") id=""; ver="" ;; esac
if [ -z "$id" ]; then
  rm -f "$D/active.wav" "$D/active.version"
elif [ "$(cat "$D/active.version" 2>/dev/null)" != "$id-$ver" ]; then
  tmp="$D/.dl.$$.wav"
  if curl -sf --max-time 30 -o "$tmp" "$W/greetings/$id/audio" && [ "$(stat -c %s "$tmp")" -gt 44 ]; then
    mv "$tmp" "$D/active.wav" && echo "$id-$ver" > "$D/active.version"
  else
    rm -f "$tmp"; exit 1
  fi
fi

applied=$(cat "$D/active.version" 2>/dev/null)
curl -s --max-time 10 -X POST "$W/voicemail/synced" --data-urlencode "greeting=${applied:-none}" \
  --data-urlencode "direct=${direct:-0}" --data-urlencode "mobile_first=${mobile_first:-0}" >/dev/null
EOF
  chmod +x greetings-sync.sh
  echo "greetings-sync.sh: mobile-first added (backup greetings-sync.sh.bak_pre_mobile_first_$ts)"
fi

docker exec asterisk asterisk -rx "dialplan reload" >/dev/null
docker exec asterisk asterisk -rx "dialplan show s@ring-mobile"
docker exec asterisk /etc/asterisk/greetings-sync.sh && echo "greetings-sync.sh ran OK"
REMOTE
