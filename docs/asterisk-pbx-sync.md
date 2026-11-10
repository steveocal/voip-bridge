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

# Opening hours and phone menus from Odoo

- **Phone Number → Answer With**: ring the extensions (as above) or play a
  **Phone Menu**.
- **Phone Number → Opening Hours**: a Working Schedule (Employees /
  Settings → Working Schedules), with its time zone, lunch breaks and its
  public holidays / closures (global time off, for that schedule or for
  all). Outside it: voicemail, forward, a menu or hang up, after an optional
  spoken message. No schedule: always open.
- **Phone → Configuration → Phone Menus** (`phone_bridge.menu`): a prompt
  (text, spoken by a Workers AI Aura voice), keys 0–9 * # (ring extensions,
  forward, voicemail, another menu, repeat, hang up), how long to wait,
  how often to repeat, what happens with no key, and optionally "callers can
  dial an extension".

```
Odoo ──▶ worker (settings pbx_ivr; pbx_prompts: text → speech on first fetch)
worker GET /pbx/sync: when / hours / menu / key / prompt lines ──▶ pbx-sync.sh
pbx-sync.sh ──▶ astdb pbwhen, pbhours, pbmenu, pbkey; GET /pbx/prompt/<hash>
             ──▶ /var/spool/asterisk/phone-bridge-prompts/<hash>.wav
[pb-route] ──Gosub──▶ [pb-ivr] ──▶ [pb-hours] (IFTIME per spec, in the zone)
                               └─▶ [pb-do] / [pb-menu] ──▶ ring, forward, vm…
```

`asterisk/extensions-phone-bridge-ivr.conf` has the contexts. A number with
no menu and no opening hours has no `pbwhen` key and rings as before. Holidays
are sent for the next 330 days only (Asterisk time specs have no year). A
prompt that hasn't been fetched yet is skipped, not fatal; the sync retries
it every minute. Changing a prompt's text or voice makes a new file.

Setting it up (once):

1. `npx wrangler d1 execute voip-bridge-d1 --remote --yes --command "CREATE TABLE IF NOT EXISTS pbx_prompts (hash TEXT PRIMARY KEY, voice TEXT NOT NULL, text TEXT NOT NULL, audio BLOB, created_at INTEGER NOT NULL)"`
   (migrations/0017_pbx_ivr.sql)
2. Deploy the worker; upgrade the Odoo addon to phone_bridge 18.0.0.9.0
   (adds a dependency on `resource`).
3. `bash scripts/vps-setup-pbx-ivr.sh`.

## Spoken menus (callers say their choice)

A menu with **Callers Can Say Their Choice** (phone_bridge 18.0.0.11.0) lets
callers answer out loud as well as with a key. Each key gets a **Name**
("Sales") and **What It's For** ("buying heaters, prices, quotes, orders").

```
[pb-menu-saykeys]: MixMonitor r() records the caller only, BackgroundDetect
  plays the prompt / listens for the key timeout ──talk──▶ pb-say.sh
  ──POST /pbx/say?menu=<id> (WAV)──▶ worker: Whisper → name / "two" said
  outright, else Llama picks the key whose name + description fit ──▶ "1"
  ──▶ "Putting you through to Sales." (astdb pbsay) ──▶ the key's action
```

Not understood ("-"): "Sorry, I didn't catch that. You can say Sales or
Technical, or press a key." and listen again, up to the menu's retries, then
the no-key action. No words at all (".", a noise): the prompt starts again,
at most 3 times. Keys work throughout; with direct dial a first digit waits
2 seconds for more (a lone digit is a key). The worker logs each answer
(`spoken menu 3: "my heater's broken" → 2 (model) Technical`).

Setting it up: deploy the worker, upgrade the addon to 18.0.0.11.0, run
`bash scripts/vps-setup-pbx-ivr.sh` again (installs pb-say.sh and the new
contexts), then tick the box on a menu.

## "Customer's salesperson" keys

A menu key with the action **Customer's salesperson** (phone_bridge
18.0.0.12.0) rings the caller's salesperson: the Salesperson on the Odoo
contact with the caller's number, or on its company. No answer within the
menu's Ring For, or no salesperson (unknown caller, none set, no extension,
📼 on): the key's **Ring These Extensions** (the sales team) ring **all at
once** or **one at a time** in order (Then Ring the Team), Ring For each,
skipping the salesperson; then voicemail.

```
key <menu> <k> owner<secs>:<all|each>:<team legs> ──▶ pbkey owner|secs|mode|targets
[pb-do] owner ──SHELL──▶ pb-owner.sh ──GET /pbx/owner?caller=──▶ worker
  (Odoo res.partner user_id / commercial partner's, ≤ 3 s) ──▶ "a201" ──▶ Dial
```

The worker logs each lookup (`salesperson for 441283…: Jo Bloggs (Acme) →
Steve → a201`). Set up with `bash scripts/vps-setup-pbx-ivr.sh` (installs
pb-owner.sh) after deploying the worker and upgrading the addon.
