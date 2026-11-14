# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Softphone and call dashboard for Infrared Heating Products (IHP) staff, served at https://voip.ihpltd.co.uk/dashboard. `docs/FEATURES.md` describes what it does today. `docs/architecture.svg` and the other docs cover Android, PBX sync, parking and conferences.

## Commands

- `npm run typecheck`: runs `tsc --noEmit`.
- `npx biome lint src`: the errors in `src/ivr.ts` were already there.
- `npm run check:dashboard`: renders `serveDashboard()` and parses each inline `<script>`. It also runs as `predeploy`. tsc can't see JS errors inside the dashboard template, so run this after every edit to `src/dashboard.ts`.
- `npm run deploy`: runs `wrangler deploy`. The Android app loads the hosted dashboard (`capacitor.config.ts` → `server.url`), so UI changes ship without a new APK.
- `npm run dev`: runs `wrangler dev`. Secrets come from `.dev.vars`.
- `npx wrangler d1 execute voip-bridge-d1 --remote --json --command "…"` queries production D1. To add a migration, put a new numbered file in `migrations/`, apply it with `--file=`, and keep `schema.sql` in step.
- `scripts/android-build.sh [gradle task]` builds the APK with the JDK 21 and SDK in `~/Android`.

There is no test suite. To check the UI headlessly, bundle and import `serveDashboard()` (the way `scripts/check-dashboard.mjs` does), write the HTML to a file, and open it with `google-chrome --headless=new --screenshot` or `--dump-dom`.

Only deploy, or `git push origin main`, when the user asks.

## Architecture

There are four parts:

- **The Worker** (`src/`) sits between Asterisk, Odoo, Gmail/Google and the app.
- **The app**: the web dashboard / PWA, wrapped by a Capacitor Android shell (`android/`, `info.systecgroup.voipbridge`).
- **The Asterisk PBX** on a VPS: config in `asterisk/`, setup scripts in `scripts/vps-*.sh`.
- **The Odoo addons** in `odoo/`.

### Worker (`src/index.ts`)

- `fetch` is one long `if/else` chain on method + pathname.
- Open routes come first: the dashboard page, login, and the endpoints Asterisk, Odoo and push call, which are authenticated by shared secrets such as `PUSH_SECRET` / `X-Pbx-Secret`.
- After that, `sessionUser()` gates everything. Pass `user` to handlers, and use `canSee()` so people only see their own calls plus unanswered ones.

Bindings (`wrangler.toml`):

- `DB`: D1 `voip-bridge-d1`, the main store.
- `CALL_STATE`: the Durable Object `CallState` holding live call state. Use one global instance, `idFromName("global")`.
- `AI`: Workers AI, used for Whisper transcription, summaries, call titles, follow-up date extraction and handwriting OCR.
- `MEETINGS`: R2 bucket for meeting recordings.
- `ODOO_URL`, `ODOO_DB` and `ASTERISK_URL` are vars. Credentials are secrets.

Call flow:

1. Asterisk AGI and the softphones POST `/call-event` (ring/answer/hangup).
2. Each call is logged to `call_log` in D1 as soon as it rings.
3. One inbound call produces several `call_log` rows: the trunk leg (`did` set, owns the recording) plus one per softphone that rang. `src/calllegs.ts` `groupCallLegs()` folds them back into one call for History, and the Odoo push sends each group as a single call. Code that reads or writes a call by `call_id` usually needs `callLegs()` to find the right leg. For example, notes go on the leg that already has notes.

Odoo (`src/odoo.ts`):

- The Worker talks to Odoo over XML-RPC (`odooAuth`, `odooCall`).
- It caches contacts and phone lookups in D1, pushes calls and notes (`pushCallToOdoo`), and creates To-Do `mail.activity` records for follow-ups (`src/followup.ts`).

Odoo is the source of truth for PBX extensions:

1. Odoo POSTs `/extensions/sync`.
2. The VPS cron `asterisk/pbx-sync.sh` pulls `GET /pbx/sync`, rewrites the PJSIP config and reports back. See `docs/asterisk-pbx-sync.md`.

Push: Asterisk calls `/push/wake`, the Worker sends an FCM message to the device tokens in `push_tokens`, and that wakes the Android app for an incoming call (`src/push.ts`, `docs/android.md`).

### Dashboard (`src/dashboard.ts`)

The whole UI, about 7,700 lines, is one template string returned by `serveDashboard()`. It holds HTML, CSS and plain inline JS. The softphone uses sip.js from `public/sip.min.js`, and notes use TinyMCE.

- **Never write a backslash in the inline JS.** The template literal cooks escapes, so `\n`, `\s`, `\d` and escaped backticks come out wrong or break the script. Use `NL` (`String.fromCharCode(10)`), character classes like `[ ]`/`[0-9]`, and the existing helpers instead. `npm run check:dashboard` catches syntax breaks but not regexes whose meaning has changed.
- Don't use `${…}` inside the inline JS either, because that interpolates at template time. Use string concatenation.
- Tunable UI values go through the parameters table: `defParam(group, id, label, default, opts)`, read as `PV[id]`.

## Branches and Odoo addons

- `main` is the Worker and app.
- Odoo addon changes only reach CloudPepper (the Odoo host) through the `odoo-addons` branch on `origin`. The user pushes it themselves, so tell them when an addon change needs that branch updated.

## Commits

End commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
