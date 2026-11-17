# Design and code review

Reviewed 2026-11-17 at commit `666e693`. Nothing was changed; these are recommendations to do later.

**Covered:** the Worker (`src/`), the Asterisk config and VPS scripts, the schema, and a sample of the 7,700-line dashboard.

**Not covered:** `src/ivr.ts`, the Android Java and the Odoo addon Python were not read in depth, and the live VPS config is not in the repo, so anything about the VPS firewall or the base dialplan is unverified.

The most urgent problems are security holes, which matter given the ext 200 toll fraud. The biggest design problems are the single-template dashboard and a PBX that can't be rebuilt from the repo.

## 1. Security: fix first

1. **`/call-event` has no authentication** (`src/index.ts:899`). Anyone on the internet can:
   - post fake rings and hangups;
   - make the Worker create `res.partner` records in Odoo (`hangup` → `ensureCallContact`);
   - trigger Whisper runs and voicemail emails (`event=recording`);
   - overwrite a call's recording pointer.
   - *Fix:* require the PBX secret for Asterisk's posts and a session for the softphone's.

2. **Shell injection through caller ID in the dialplan.** `System(curl … "caller=${CALLERID(num)}" …)` in `asterisk/extensions-phone-bridge-routing.conf:45` and `scripts/pbx-routing-dialplan-edit.py:25` puts an unfiltered caller ID into a shell command. A SIP From user such as `$(…)` would run as the Asterisk user.
   - *Fix:* wrap in `${FILTER(0-9+,…)}`, or use the `CURL()` function with `URIENCODE` instead of `System`.

3. **Click-to-call goes to an HTTP endpoint with no credentials** (`src/index.ts:166`, `http://64.176.184.11.nip.io/click2call-ami`). If that port is reachable from the internet, anyone can originate calls; check this on the VPS.
   - The destination is not validated.
   - The default caller ID is the literal string `"+447****7226"`, a masked number committed as code.
   - The dashboard doesn't call this route at all.
   - *Fix:* delete it, or rebuild it on ARI with number validation.

4. **ARI is used over plain HTTP** (`ASTERISK_URL = http://…:8088`). The basic-auth credentials cross the internet in clear text on every request, and ARI can originate calls.
   - *Fix:* put it behind the TLS proxy that already serves `wss://…/ws`, or a Cloudflare Tunnel, and firewall 8088.

5. **A default SIP account with its password ships in the public page**: `username: "201", password: "webphone201"` at `src/dashboard.ts:1447`, plus the same placeholder at line 941.
   - *Fix:* remove it, and confirm that password is dead on the PBX.

6. **`/auth/login` has no rate limit**, and the login password is the SIP password, so the Worker is an online guessing oracle for SIP credentials. `/staff/login` already has a lockout; reuse that pattern per extension and per IP.

7. **Sessions can't be revoked.** Tokens are stateless, last 30 days and sit in `localStorage` beside the plain-text SIP password. Changing a password in Odoo doesn't end existing sessions.
   - `?session=` in the URL also leaks tokens into logs.
   - Staff location tokens never expire at all (`src/staff.ts`).
   - *Fix:* put a per-extension version or the password hash in the signed payload, shorten the lifetime, and add expiry to staff tokens.

8. **Authenticated toll-fraud path.** `/mobile-call` dials any `+` number, and "my mobile" is a free-text user setting, so one stolen token can bridge two arbitrary international numbers. Forward numbers and mobiles from Odoo are likewise accepted for any country (`PHONE` in `src/pbxsync.ts`).
   - *Fix:* a country allowlist like the one `normaliseCallbackNumber` already has, plus trunk-side spend and destination limits at voip.ms.

9. **Other open routes that shouldn't be:**
   - `/push/register`: anyone can register a device for any extension and receive caller names and numbers.
   - `/caller-lookup`: turns a phone number into a customer name, and hits Odoo each time.
   - `/staff/employees`: lists employee names.
   - `/voicemail/sync`, `/voicemail/synced`, `/greetings/N/audio`: unauthenticated, and `synced` writes state.

10. **One secret does everything.** `PUSH_SECRET` covers push wake, PBX sync (which returns every SIP password), and the callback and mobile-call events.
    - It is embedded in `extensions.conf`, passed as `?secret=` in URLs, and compared with `!==` in three places.
    - *Fix:* split it into separate secrets, send it in a header only, and use `same()` everywhere.

11. **No per-user authorisation on shared actions.** Any signed-in user can:
    - answer or hang up any channel (`/answer`, `/hangup-call`);
    - delete or switch the company greeting;
    - run `/sync`, `/odoo/push-calls` and `create-missing-contacts`;
    - rename any contact.
    - *Fix:* an admin flag from Odoo would cover it.

12. **Smaller items:**
    - The dashboard is served with no CSP or security headers, and has about 110 `innerHTML` sites.
    - `notes_html` is stored as the client sends it.
    - The Android manifest has `allowBackup="true"` with credentials in WebView storage.
    - SIP passwords are stored in plain text in D1.

## 2. Design problems

- **The dashboard is one template string.** It has 513 functions and about 1,050 global `var`s, no type checking, and the "no backslash, no `${}`" rule that has already broken production once.
  - *Fix:* move it to real `.html`, `.js` and `.css` files under `public/`. The assets binding already exists, so no bundler is needed. That removes the escaping rule and allows `checkJs`, linting and browser caching.

- **The page and API are on different hosts for no reason.** The page is on `voip.ihpltd.co.uk` but calls `voip-bridge.wandering-mode-c597.workers.dev`, as do the dialplan and scripts.
  - This is why there is `Access-Control-Allow-Origin: *`, bearer tokens in `localStorage` and a monkey-patched `window.fetch`.
  - *Fix:* use same-origin relative URLs with an HttpOnly cookie, and turn `workers_dev` off.

- **Call legs are joined by guesswork.** `groupCallLegs` matches on the last 9 digits plus a 3-second window, and the "which leg wins" logic is written three times (`mergeCallLegs`, `pushCallToOdoo`, `callOwner`/`handlingExtension`). Two calls from one number, or withheld numbers, will merge wrongly.
  - *Fix:* have Asterisk pass its `LINKEDID` to the softphones in a SIP header and store it as a `call_group` column. The heuristic then goes away.

- **The PBX is not reproducible.** The base `extensions.conf` and `pjsip.conf` are not in the repo.
  - Twenty one-off `scripts/vps-*.sh` files patch the live file with grep and sed, and even recover the secret by grepping the dialplan.
  - They still `ssh vps`, though the PBX has moved to odoo20.
  - *Fix:* keep the full config in the repo as templates with secrets in an env file, and one deploy script.

- **No background work model.** There is no cron trigger and no queue.
  - Transcription and summarising run inside Asterisk's `curl` request.
  - A failed `pushCallToOdoo` in `waitUntil` is never retried unless someone calls `/odoo/push-calls` by hand.
  - Name resolution depends on a dashboard being open.
  - *Fix:* Cloudflare Queues (or Workflows) for recording → transcribe → summarise → email → Odoo, and a cron for retries and contact sync.

- **Odoo sync is chatty.**
  - Every Odoo operation re-authenticates first; nothing caches the uid.
  - `/pbx/sync` re-reads every extension, user, number and menu from Odoo, then deletes and rewrites the D1 tables, about once a minute.
  - Any user request can trigger the same full sync through `extensionOwners`.
  - `hasPhoneBridge` and `hasBridgeModule` probe Odoo on every push.
  - *Fix:* cache the uid and capabilities, and rely on Odoo's push to `/extensions/sync` with a slow fallback.

- **XML-RPC is on its way out.** Odoo 19 is believed to deprecate `/xmlrpc` in favour of the JSON-2 API, with removal planned for 20; there is a `20.0` branch, so check this against the Odoo release notes. The hand-written XML parser and base64 streaming would all go.

- **`CallState` Durable Object adds nothing.** It is an in-memory `Map` with no storage, lost on every deploy or eviction, never pruned, and `/active-calls` is not used by the dashboard. Remove it, or make it the WebSocket hub for live call events to replace polling.

- **Tenant values are hard-coded.** DIDs, office hours, product codes, sender domains, the caller ID map (201 → 01283…) and the FCM and PBX hosts are scattered through the source. This blocks the multi-tenant plan (`docs/multi-tenant-plan.md`); move them to settings or Odoo.

## 3. Code and data problems

- **`schema.sql` is out of step.** It lacks `call_hidden`, `meetings`, `meeting_parts`, `meeting_pieces`, `pbx_prompts`, `push_status` and `push_tokens`.
  - Migrations are applied by hand with `--file`, with no tracking, and two of them seed test calls into production.
  - *Fix:* use `wrangler d1 migrations apply` and generate `schema.sql` from the database.

- **`call_log` rows are fat and over-read.** `callLegs()` does `SELECT *` (transcript, notes, sketch JSON) for every incoming call within ±1 hour, and it runs on every `mayOpenCall` check.
  - *Fix:* select only the needed columns, or move transcript and sketch into a side table.

- **History is filtered after `LIMIT`.** The query reads `limit × 3` rows and then drops other people's calls, so a quiet user gets a short or empty list. There is no pagination.
  - *Fix:* filter by owner in SQL (easy once `call_group` and owner columns exist) and add a cursor.

- **Phone matching scans whole tables.** `sqlPhoneKey` is seven nested `REPLACE`s per row, run on every ring and every push wake. The contact page matches on the last 7 digits with `LIKE '%…%'`.
  - *Fix:* store an indexed `phone_key` column on `contacts` and `call_log`.

- **The router is a 100-line `if/else` chain** that mixes two naming styles (`m`/`p` and `request.method`/`url.pathname`). Whether a route is public depends on which side of one `else` it sits, which is how the `/call-event` hole happened.
  - *Fix:* a route table with an explicit auth level per route (`public`, `pbx`, `user`, `admin`).

- **Error handling is inconsistent.** `odooCall` returns `{fault}` and many callers ignore it, treating a failure as an empty result (`searchContacts`, `syncCallLog`, `lookupCaller`). `ariRequest` never checks `res.ok`. There is no timeout on Odoo fetches except in two places.

- **Duplicated helpers:** `hmacHex` (twice), `sha256Hex` (twice), `putSetting`/`getSetting` (three times), base64 helpers (three times), and the `OUR_SENDER` regex (twice). Collect these into one small `util.ts`.

- **Hand-rolled runtime types** in `src/types.ts` instead of `wrangler types`. They hide real API differences, and `compatibility_date` is over a year old.

- **No tests and no CI.** `calllegs.ts`, `phoneKey`, `normaliseCallbackNumber`, `pbxSyncText` and the awk validation in `pbx-sync.sh` are pure functions that decide routing and billing; they are the cheapest and most valuable things to test.

- **No `[observability]` in `wrangler.toml`**, so the `console.error` calls that stand in for error handling are not kept.

- **Dead or stale code:** `handleClick2Call`, `/active-calls`, the `OLD_PBX_HOST` migration, the "Linphone will ring" message, the jsdelivr fallback comment, the seeded `test-%` call filter, and the pre-existing lint errors in `src/ivr.ts`.

## 4. Hardening the PBX against toll fraud

fail2ban is planned. It is worth having, but it only slows password guessing; it would not have stopped a fraud that used valid credentials, and the measures that cap the cost of a break-in matter more. The live VPS config was not seen, so treat this section as a checklist to verify.

### fail2ban: two things to get right

- **WebRTC logins come through the proxy.** The dashboard and app register over `wss://…/ws`, so Asterisk sees the proxy's address, not the attacker's. fail2ban on the Asterisk log will either do nothing for those or ban the proxy itself. Rate-limit `/ws` in the proxy instead, and whitelist `127.0.0.1` in the jail.
- **Asterisk must write the security log.** Enable `security` in `logger.conf` and point the `asterisk` jail at that file. If Asterisk runs in Docker, the bans must go in the `DOCKER-USER` chain or they won't apply.

Also add the `sshd` jail, and make SSH key-only.

### Other measures, in order of value

1. **Limit what a stolen account can spend** (at voip.ms):
   - Turn off international calling, or allow only the countries actually called.
   - Set a maximum rate per minute so premium numbers fail.
   - Keep a low balance with no automatic top-up.
   - Turn on low-balance and usage alerts.

2. **Restrict outbound calls in the dialplan:**
   - Allow UK geographic, 03 and mobile numbers; block 09, 070, 087x and international unless a named extension needs it.
   - Cap concurrent outbound calls per extension (`GROUP_COUNT`) and call length (`Dial` `L()` option).
   - Block outbound outside office hours for desk phones.
   - Make sure the trunk's inbound context cannot reach any outbound pattern.

3. **Firewall the VPS down to what is used:**
   - 443 for the dashboard and WebSocket, open to all.
   - SIP 5060 only from voip.ms's addresses and the office IP for the desk phone.
   - The RTP port range only.
   - Close 8088 (ARI), 5038 (AMI), the click-to-call port and the FreePBX/VitalPBX admin ports to the internet; the admin pages are already reached by SSH tunnel.

4. **Tighten PJSIP:**
   - No anonymous endpoint.
   - `permit`/`deny` ACLs on the desk phone's endpoint.
   - Identify the trunk by IP, not by username.

5. **Fix the Worker holes in section 1, items 1–6.** fail2ban covers none of these, and the Worker hands out SIP passwords and can originate calls. For `/auth/login`, a Cloudflare rate-limiting rule on that path does it without code.

6. **Detect what gets through:**
   - A daily email of outbound calls by extension and destination.
   - An alert on any international or out-of-hours call.

7. **Housekeeping:**
   - Unattended security updates.
   - A backup of `/etc/asterisk` and the astdb (which also fixes the "PBX can't be rebuilt" problem in section 2).
   - Separate secrets in place of the single `PUSH_SECRET`.

## 5. Performance

These are from reading the code, not from measurements, so the gains are estimates. They concern app and dashboard speed, not call audio quality, which is a network and codec question.

- **Ring delay on the Android app.** `/push/wake` sends to each device one after another while Asterisk waits, and may wait up to 1.5 s on an Odoo name lookup (`src/push.ts`). Send the pushes in parallel and return before the lookup finishes.
- **Odoo round-trips.** Every Odoo operation logs in first. Caching the uid roughly halves the Odoo time on contact pages, activities, login and call pushes.
- **The once-a-minute full sync.** `/pbx/sync` re-reads everything from Odoo and rewrites the D1 tables each minute. Sync only when Odoo posts a change, with a fallback every 15 minutes or so.
- **Phone lookups.** Add an indexed `phone_key` column so each ring and history load stops scanning the whole contacts and call tables.
- **Opening a call.** `callLegs()` loads every column, including transcripts and sketches, for an hour either side of the call. Select only the columns it needs.
- **Dashboard load.** The whole UI is re-sent as one uncached HTML page on every open. As static files under `public/` the browser and the Android shell would cache it.
- **Slow steps off the request path.** Transcription and summarising run inside Asterisk's request; a queue makes the hangup return at once and retries failures.
- **Worker placement.** Turn on Smart Placement in `wrangler.toml` so the Worker runs near Odoo and D1 instead of near the user; it is a one-line change.

## Suggested order

0. The voip.ms spend limits and the VPS firewall from section 4. They need no code and cap the damage from everything else.

1. Section 1, items 1–6. These are small changes, mostly on the Worker plus two dialplan lines.
2. Same-origin API with cookie sessions, revocation and a route table with auth levels.
3. PBX config into the repo, split secrets, ARI behind TLS.
4. `LINKEDID` call grouping, an indexed `phone_key`, and the schema and migrations cleanup.
5. Dashboard out of the template string into static files, then tests for the pure functions.
6. Queues and cron for the recording pipeline and Odoo retries, then the JSON-2 move.
