# Extensions made in Odoo

Extensions are added, changed and removed in Odoo (Phone → Configuration →
Extensions), never on the VPS:

```
Odoo phone_bridge.extension ──POST /extensions/sync──▶ worker (D1 extensions)
        ▲ (worker also re-reads when its copy is > 1 min old)      │
        └──────────── XML-RPC search_read ◀───────────────────────┘
worker ──ARI Local/s@pbx-sync──▶ pbx-sync.sh ──GET /pbx/sync──▶ worker
pbx-sync.sh ──▶ /etc/asterisk/pjsip-phone-bridge-extensions.conf ──▶ PJSIP reload
```

- **Odoo**: number, user (internal, portal or public), device type (browser/app
  or desk phone), SIP password (generated if empty), "Wake the Phone App".
- **Worker** (`src/pbxsync.ts`): `GET /pbx/sync` lists them as
  `ext <number> <webrtc|sip> <wake 0|1> <password> <caller name>`. Opened only
  by `X-Pbx-Secret: <PUSH_SECRET>`, never a signed-in user, as it holds the
  passwords. `GET /pbx/status` (signed in) says whether the PBX has caught up.
- **VPS** (`asterisk/pbx-sync.sh`, on change and every 5 min): writes an
  endpoint, auth and aor per extension on the templates in
  `asterisk/pjsip-phone-bridge.conf`, reloads PJSIP only when the file changed,
  keeps astdb `pbx/push_extensions` for the app push-wake, and reports a hash
  of what it applied (`POST /pbx/synced`).
- **Dialplan**: `[from-internal]` rings any number that is a PJSIP endpoint, so
  a new extension needs no dialplan line.

## Setting it up

1. `npx wrangler d1 execute voip-bridge-d1 --remote --yes --file=./migrations/0015_pbx_extensions.sql`
   (live D1 has no migration tracking; never `migrations apply`).
2. `npm run deploy`.
3. Upgrade the Odoo addon to phone_bridge 18.0.0.7.0 (device type, wake flag).
4. `bash scripts/vps-setup-pbx-sync.sh`. Nothing changes for the existing
   extensions: the sync skips any number still defined by hand in `pjsip.conf`.
5. `bash scripts/vps-persist-astdb.sh` in a quiet moment (one ~10 s restart),
   so astdb survives the container being recreated.

## Moving an existing extension over

1. In Odoo, make sure the extension has the same SIP password as its
   `[NNN-auth]` block in `pjsip.conf`, the right device type, and "Wake the
   Phone App" for the Android app (202).
2. On the VPS, back up `pjsip.conf` and delete the extension's three blocks
   (`[NNN]` endpoint, `[NNN-auth]`, `[NNN]` aor). Keep anything that follows
   the last block (comments, the two `#include pjsip-phone-bridge…` lines):
   deleting "up to the next section" also takes those, and without the
   includes every Odoo extension disappears on the next reload.
3. `docker exec -u asterisk asterisk /etc/asterisk/pbx-sync.sh`, then
   `module reload res_pjsip.so` if the sync didn't (it only reloads when its
   own file changed); check `pjsip show endpoint NNN` and that the phone
   re-registers.

The sync also counts numeric sections in `pjsip_wizard.conf`'s includes as
"by hand": the image's sample `pjsip_endpoint.conf` (a `[200]` on a missing
wizard template, never loaded) was renamed `.disabled_*` for that reason.

All extensions came from Odoo as of 2 Nov 2026: 200 (desk phone; the
desk-phone template carries its `ALERT_INFO = Ring Answer`), 201, 202, 203,
211, 300. 204 and 212 were deleted. `pjsip.conf` keeps only the trunks.
Inbound ring lists (`[default]`, `[voipms-inbound]`) still name extensions;
that's the routing step.
