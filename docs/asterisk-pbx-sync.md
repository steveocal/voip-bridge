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
- **VPS** (`asterisk/pbx-sync.sh`, every minute from the host crontab, and on
  change when Odoo can reach the worker): writes an
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

# Inbound routing and forwarding from Odoo

Who answers each of our numbers is also set in Odoo, not in the dialplan:

- **Phone → Configuration → Phone Numbers** (`phone_bridge.number`): the
  number (international format), the extensions that ring (all at once),
  whether their users' mobiles ring too, how long, and what happens when
  nobody answers (voicemail, forward to a number, hang up); recording on/off.
- **Extension → Forwarding**: always, when busy or offline, when not
  answered (after N seconds), or busy/offline/not answered, to a number.
  "Always" also applies when a phone number rings that extension.
- **User → Mobile to Ring / Ring Mobile After**: each user's mobile joins the
  ring list of any number that rings their extensions (if that number rings
  users' mobiles), after their own head start. Users can set this in their
  Preferences.
- **Dashboard 📼 / 📱** are each user's own: 📼 takes their extensions and
  mobile out of every ring list and sends calls to their extensions to
  voicemail; 📱 rings their mobile with no head start.

```
Odoo ──▶ worker (D1 pbx_numbers, extensions.forward_*, user_settings)
worker GET /pbx/sync: route / fwd lines ──▶ pbx-sync.sh
pbx-sync.sh ──▶ astdb pbroute/<number digits>, pbfwd/<extension>
[voipms-inbound], [default] ──Gosub──▶ [pb-route] ──▶ Dial / voicemail / forward
[from-internal] ──▶ [ext-dial] (pbfwd: forward or 📼)
```

`asterisk/extensions-phone-bridge-routing.conf` holds `[pb-route]`,
`[pb-route-hangup]` (a hangup inside a Gosub doesn't run the caller's `h`, so
the hangup event comes from there), `[pb-ring-app]` (an app leg, woken
first), `[pb-ring-mobile]` (a mobile or forward leg, after its delay, from
our voip.ms number) and `[ext-dial]` with forwarding. A number with no
`pbroute` key keeps the hand-written ring list, so numbers move one at a
time: set one up in Odoo and its calls follow Odoo within about two minutes
(the VPS checks every minute; the worker re-reads Odoo when its copy is over
a minute old); delete it
there and the old routing is back.

Setting it up (once):

1. `npx wrangler d1 execute voip-bridge-d1 --remote --yes --file=./migrations/0016_pbx_routing.sql`
2. Deploy the worker; upgrade the Odoo addon to phone_bridge 18.0.0.8.0.
3. `bash scripts/vps-setup-pbx-routing.sh` (backs up extensions.conf; the
   edit is `scripts/pbx-routing-dialplan-edit.py`).

Our numbers as voip.ms and Twilio send them: 447520658657 (voip.ms
mobile; the catch-all ring list), 441283246490 / 491 / 492, and Twilio's
+447898117226. Still hard-coded: the website callback's agent ring list
(`[web-callback]`) and the outbound caller ID per extension
(`[outbound-dial]`).
