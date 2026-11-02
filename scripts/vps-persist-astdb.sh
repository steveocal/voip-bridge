#!/bin/bash
# Moves Asterisk's settings database (astdb: voicemail/ring flags, Odoo's
# push-wake list, ...) onto a host folder, so it survives the container being
# recreated. The running container (andrius/asterisk, started by hand, not
# from /opt/asterisk/docker-compose.yml) keeps /var/lib/asterisk inside the
# container; /var/spool/asterisk is already bind-mounted from
# /opt/asterisk/spool, so astdbdir points there.
#
# Restarts Asterisk once (about 10 seconds; phones and the app re-register by
# themselves). Refuses while a call is up unless FORCE=1.
# Run from this machine: bash scripts/vps-persist-astdb.sh
# Backs up asterisk.conf first; running it again changes nothing.
set -euo pipefail

ssh vps "FORCE=${FORCE:-0} bash -s" <<'REMOTE'
set -euo pipefail
cd /opt/asterisk/config
if grep -q '^astdbdir' asterisk.conf; then
  echo "asterisk.conf: astdbdir already set, unchanged"; grep '^astdbdir' asterisk.conf; exit 0
fi
if grep -q '^\[directories\]' asterisk.conf; then
  echo "asterisk.conf already has a [directories] section; add astdbdir by hand"; exit 1
fi
calls=$(docker exec asterisk asterisk -rx "core show channels count" | sed -n 's/^\([0-9]*\) active call.*/\1/p')
if [ "${calls:-1}" != "0" ] && [ "$FORCE" != "1" ]; then
  echo "${calls:-?} call(s) up; try again later (or FORCE=1)"; exit 1
fi
keep() { docker exec asterisk asterisk -rx "database show" | grep -v '^/registrar/' | grep -c ' : ' || true; }
before=$(keep)

ts=$(date +%Y%m%d_%H%M%S)
cp asterisk.conf "asterisk.conf.bak_pre_astdbdir_$ts"
mkdir -p /opt/asterisk/spool/astdb
chown 1000:1000 /opt/asterisk/spool/astdb
printf '\n[directories]\n; On the host (/opt/asterisk/spool), so it survives the container being recreated.\nastdbdir => /var/spool/asterisk/astdb\n' >> asterisk.conf

docker stop asterisk >/dev/null
docker cp asterisk:/var/lib/asterisk/astdb.sqlite3 /opt/asterisk/spool/astdb/astdb.sqlite3
chown 1000:1000 /opt/asterisk/spool/astdb/astdb.sqlite3
docker start asterisk >/dev/null
for i in $(seq 1 30); do docker exec asterisk asterisk -rx "core show version" >/dev/null 2>&1 && break; sleep 1; done

after=$(keep)
echo "asterisk.conf: astdbdir set (backup asterisk.conf.bak_pre_astdbdir_$ts)"
echo "astdb entries (not counting registrations): before $before, after $after"
docker exec asterisk sh -c 'ls -l /var/spool/asterisk/astdb/'
# Put the synced settings back at once rather than within 5 minutes.
docker exec asterisk /etc/asterisk/greetings-sync.sh >/dev/null 2>&1 || true
[ -x pbx-sync.sh ] && docker exec -u asterisk asterisk /etc/asterisk/pbx-sync.sh >/dev/null 2>&1 || true
docker exec asterisk asterisk -rx "pjsip show endpoints" | grep -c 'Endpoint:  [0-9]' | sed 's/^/extensions loaded: /'
REMOTE
