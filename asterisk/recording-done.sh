#!/bin/sh
# Run by MixMonitor when a call recording closes: $1 = call_log call_id, $2 = file name.
# A call that never got answered leaves header-only files, so drop those, and tell
# the worker about the rest (it transcribes before answering, hence the long timeout).
f="/var/spool/asterisk/recording/$2.wav"
if [ "$(stat -c %s "$f" 2>/dev/null || echo 0)" -le 44 ]; then rm -f "$f" "${f%.wav}-rx.wav" "${f%.wav}-tx.wav"; exit 0; fi
PB_EVENT_TIMEOUT=900 exec /etc/asterisk/pb-event.sh event=recording "callId=$1" "file=$2"
