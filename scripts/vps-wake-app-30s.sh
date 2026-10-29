#!/bin/sh
# Give the Android app (202) up to 30s instead of 20s to wake from a push and
# register. Since vps-ring-app-in-parallel.sh the wait only holds the app's
# own leg, so the other phones aren't delayed by it.
# Run on the VPS: ssh vps 'sh -s' < scripts/vps-wake-app-30s.sh
set -e
cd /opt/asterisk/config
if grep -qF '${TRIES} < 30])' extensions.conf; then echo "already set up"; else
  grep -qF '"" & ${TRIES} < 20])' extensions.conf || { echo "wake wait line not found, nothing changed"; exit 1; }
  cp extensions.conf "extensions.conf.bak_pre_wake30_$(date +%Y%m%d_%H%M%S)"
  sed -i -e 's/"" & ${TRIES} < 20\])$/"" \& ${TRIES} < 30])/' \
         -e 's/give the app up to 20s (time to tap/give the app up to 30s (time to tap/' extensions.conf
fi
docker exec asterisk asterisk -rx "dialplan reload" >/dev/null
grep -n 'TRIES} < \|give the app up to' extensions.conf
