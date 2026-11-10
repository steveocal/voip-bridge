#!/bin/sh
# pb-say.sh <menu id> <recording.wav>: what a caller said to a spoken phone
# menu, as the key it means. Run by [pb-menu-saykeys] through SHELL(): sends
# the recording to the worker (POST /pbx/say, src/ivrsay.ts) and prints its
# answer: 0-9, s (*), h (#), "-" (not understood) or "." (no words).
# Deletes the recording (and its mixed twin) afterwards, and any left by
# callers who hung up while speaking.
. "${PHONE_BRIDGE_ENV:-/etc/asterisk/phone-bridge.env}"
menu=$1 f=$2
dir=/var/spool/asterisk/phone-bridge-say
case "$menu" in ""|*[!0-9]*) printf -; exit 0 ;; esac
case "$f" in "$dir"/*-in.wav) ;; *) printf -; exit 0 ;; esac
sleep 0.2   # StopMixMonitor finishes the file just after it returns
k=$(curl -sf --max-time 8 -H "X-Pbx-Secret: $PBX_SECRET" -H "Content-Type: audio/wav" \
  --data-binary "@$f" "$WORKER/pbx/say?menu=$menu") || k=-
rm -f "$f" "${f%-in.wav}.wav"
find "$dir" -name '*.wav' -mmin +10 -delete 2>/dev/null
k=$(printf '%s' "$k" | tr -cd '0-9sh.-' | cut -c1)
printf '%s' "${k:--}"
