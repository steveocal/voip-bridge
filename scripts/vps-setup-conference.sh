#!/bin/bash
# Sets up conference calls on the Asterisk VPS (see docs/asterisk-conference.md).
# Run from this machine: bash scripts/vps-setup-conference.sh
# Backs up extensions.conf first; running it again changes nothing.
set -euo pipefail

ssh vps 'bash -s' <<'REMOTE'
set -euo pipefail
cd /opt/asterisk/config
ts=$(date +%Y%m%d_%H%M%S)

cat > confbridge.conf <<'EOF'
; Conference rooms for the softphones' ➕ Add / 👥 Merge (voip-bridge
; docs/asterisk-conference.md). Room 8<ext> belongs to that extension, which
; joins as the host; everyone REFERred in is a guest.
[general]

[vb_bridge]
type = bridge
max_members = 10

[vb_host]
type = user
marked = yes
quiet = yes
announce_user_count = no

[vb_guest]
type = user
end_marked = yes                ; the host hanging up ends the call for everyone
quiet = yes
announce_user_count = no
music_on_hold_when_empty = yes  ; hold music while alone in the room
music_on_hold_class = default
EOF

if grep -q 'NoOp(CONFERENCE ' extensions.conf; then
  echo "extensions.conf: conference already there, unchanged"
else
  cp extensions.conf "extensions.conf.bak_pre_conference_$ts"
  cat > /tmp/conference-block.conf <<'EOF'
; Conference rooms (confbridge.conf, voip-bridge docs/asterisk-conference.md).
; 👥 Merge REFERs each far end to 8<ext>, then that extension dials in itself
; and joins as the host. _82XX beats the outbound _X. pattern.
exten => _82XX,1,NoOp(CONFERENCE ${EXTEN:1}: ${CALLERID(num)})
same => n,Answer()
same => n,Set(CONFEP=)
same => n,ExecIf($["${CHANNEL(channeltype)}" = "PJSIP"]?Set(CONFEP=${CHANNEL(endpoint)}))
same => n,GotoIf($["${CONFEP}" = "${EXTEN:1}"]?host)
same => n,ConfBridge(vb${EXTEN:1},vb_bridge,vb_guest)
same => n,Hangup()
same => n(host),ConfBridge(vb${EXTEN:1},vb_bridge,vb_host)
same => n,Hangup()
EOF
  # Insert before the first outbound pattern in [from-internal].
  awk 'BEGIN{done=0} /^exten => _0X\.,1,NoOp\(OUTBOUND UK/ && !done { while ((getline l < "/tmp/conference-block.conf") > 0) print l; done=1 } { print }' \
    extensions.conf > /tmp/extensions.conf.new
  grep -q 'NoOp(CONFERENCE ' /tmp/extensions.conf.new || { echo "insert point not found; nothing changed"; exit 1; }
  cat /tmp/extensions.conf.new > extensions.conf
  echo "extensions.conf: conference added (backup extensions.conf.bak_pre_conference_$ts)"
fi

docker exec asterisk asterisk -rx "module unload app_confbridge.so" >/dev/null 2>&1 || true
docker exec asterisk asterisk -rx "module load app_confbridge.so"
docker exec asterisk asterisk -rx "dialplan reload"
echo "--- checks"
docker exec asterisk asterisk -rx "module show like confbridge"
docker exec asterisk asterisk -rx "confbridge show profile bridge vb_bridge" | head -6
docker exec asterisk asterisk -rx "confbridge show profile user vb_guest" | grep -i "marked\|music" || true
docker exec asterisk asterisk -rx "dialplan show 8201@from-internal" | head -12
docker exec asterisk asterisk -rx "dialplan show 07035551234@from-internal" | grep -m1 "OUTBOUND" || true
REMOTE
