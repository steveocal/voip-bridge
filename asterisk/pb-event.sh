#!/bin/sh
# Posts one call event to the worker's /call-event (src/index.ts
# handleCallEvent) with the PBX secret, which that route now requires:
#   pb-event.sh event=ring "callId=..." "caller=..." ...
# Each argument is one form field. The dialplan runs this through System(),
# which hands the line to a shell, so it must only pass values it has run
# through FILTER() or that Asterisk made itself (UNIQUEID, billsec): a raw
# caller ID such as $(…) would otherwise run as the asterisk user.
# PB_EVENT_TIMEOUT: seconds to wait (default 30; recordings wait while the
# worker transcribes).
. "${PHONE_BRIDGE_ENV:-/etc/asterisk/phone-bridge.env}"
n=$#
while [ "$n" -gt 0 ]; do set -- "$@" --data-urlencode "$1"; shift; n=$((n - 1)); done
exec curl -s --max-time "${PB_EVENT_TIMEOUT:-30}" -X POST -H "X-Pbx-Secret: $PBX_SECRET" "$WORKER/call-event" "$@" >/dev/null
