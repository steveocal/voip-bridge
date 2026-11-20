# Commercial plan: turning voip-bridge into a product

Written 2026-11-20. This covers what must change before the app can be sold
to companies other than IHP, in the order it should happen. Item numbers
match the gap list it came from: 1 de-IHP, 2 numbers and PBX hosting,
4 compliance, 7 supervisor tools, 8 desk phones and desktop, 9 more CRMs,
10 AI, 11 reliability. (3, iPhone, is planned separately.)

Sizes are rough: **S** is days, **M** is 1–3 weeks, **L** is a month or
more, for one developer working with Claude.

---

## Recommended order

| Phase | What | Why first |
|---|---|---|
| 0 | 11a tests and CI, 11b Workers Paid, 1a config inventory | Everything later changes code that has no tests, on a plan that already drops recordings |
| 1 | 1 (de-IHP), 4a–4c (999, recording notice, plain-SIP lockdown) | Can't sell without these; 999 is a legal requirement in the UK |
| 2 | 2B (one PBX per customer, scripted), Play Store app | First paying customers, low risk |
| 3 | 7 (supervisor tools), 8 (desk phones), 10a (AI on calls) | What buyers compare |
| 4 | 9 (HubSpot, then Pipedrive), 2A (shared hosting) | Wider market; only once there are enough customers to justify shared hosting |
| 5 | 10b AI receptionist, 4d–4f (data requests, audit, residency) | Stand-out features and larger-customer requirements |

---

## 1. Remove what's specific to IHP — size L

Today a second company would get IHP's numbers, IHP's name in the AI
prompts and Steve's name on sent emails.

### 1a. Inventory (S)
What is hardcoded now, found in the code:

| Where | What |
|---|---|
| `src/dashboard.ts` | `API` = the workers.dev URL; `DEFAULT_WS` and domain `64.176.184.11`; `OUTBOUND_CLI` and the `201 → 01283 246491` rule; `XFER_EXTS` 200–203 |
| `src/gmail.ts` | Sent mail `From: Steve <steve@systecgroup.info>` for every user (a bug today, not only for resale); `OUR_SENDERS` lists IHP's domains |
| `src/summarize.ts`, `followup.ts`, `ivrsay.ts`, `meetings.ts`, `spam.ts`, `odoo.ts` | "Infrared Heating Products (IHP)" in AI prompts and text |
| `src/users.ts` | `APP_ORIGIN` = voip.ihpltd.co.uk |
| `wrangler.toml` | Odoo URL and DB, Asterisk URL |
| `capacitor.config.ts` | `server.url` fixed to IHP's dashboard; package `info.systecgroup.voipbridge` |
| `asterisk/` | voip.ms trunk, IHP's DIDs, `[outbound-dial]` caller ID rules |

Write a checker (`scripts/check-tenant-neutral.sh`) that fails CI if any of
these strings come back.

### 1b. One settings source (M)
- Company settings live in Odoo's `phone_bridge.installation` (it already
  holds the worker URL and API token): company name, business description
  for AI prompts, sending domains, default caller ID, caller ID per
  extension, branding (name, logo, colour).
- The worker reads them once from Odoo and caches them in D1 (`config`
  table), like extensions today. Odoo pushes on change.
- The dashboard gets them from `GET /config` at start instead of constants.
  `API` becomes the page's own origin.
- Caller ID per extension and per number moves to Odoo, and `pbx-sync.sh`
  writes `[outbound-dial]` from it.

### 1c. One worker build (M)
`phone_bridge` already deploys a worker into the customer's own Cloudflare
account, but it ships its own copy (`data/worker/worker/index.js`, 8,000
lines) that will drift from `main`. Make `main` the only source:
`scripts/build-addon-worker.sh` bundles `src/` into the addon, CI checks the
two match, and the addon version records which commit it carries.

### 1d. One app for every customer (M)
- Publish to the Play Store as a neutral "Phone Bridge". Sideloading an APK
  with "Download anyway" is not acceptable to customers.
- The app no longer has a fixed `server.url`. It opens a "connect" screen;
  the setup link in the onboarding email (built 2026-11-20) carries the
  company's server, so tapping it connects and signs in. A QR code does the
  same for desk setups.
- App Links then have to work for every customer domain; use one redirect
  domain owned by the product (e.g. `link.phonebridge.app/setup/…`) that
  forwards to the customer's worker.

### 1e. Language and region (S)
UI text into one table so it can be translated; dates, currency and phone
formats from the company's country (today `en-GB` and `£` are assumed).

---

## 2. Numbers and PBX hosting — size L

Two ways to host the PBX. **Do B first, then A when there are enough
customers.**

### 2B. One PBX per customer, set up by script (M)
What exists now, made repeatable:
- `scripts/vps-*.sh` become one installer: takes a fresh Ubuntu VPS (or
  creates one through the Vultr/Hetzner API), installs Asterisk in Docker,
  fail2ban, TLS, log rotation (the missing rotation let the Docker log reach
  11.8 GB), the CDR backend, and registers with the customer's worker.
- Odoo's installation form gets a "PBX" step: server address and SSH key, or
  "create one for me".
- Updates: the installer is idempotent, and each PBX reports its version to
  the worker.

Pros: a customer's mistakes, fraud or load can't affect anyone else; it
matches the code today. Cons: £5–20 a month per customer in hosting, and
many servers to patch.

### 2A. Shared hosting for many customers (L)

**Are there serious risks in making Asterisk multi-tenant? Yes.** Asterisk
has no built-in idea of a tenant. It is one dialplan, one set of endpoints
and one AstDB, and isolation is only as good as the config generator.
The real risks:

1. **Crossing between customers.** One wrong `context` or a pattern like
   `_X.` lets customer A ring B's extensions, use B's trunk, or send B's
   caller ID. A bug in `pbx-sync.sh` becomes a data breach.
2. **Name clashes.** Every customer wants extension 201. Endpoints,
   voicemail boxes, AstDB keys (`pbqueue/…`, `twilio/…`), recording file
   names and parking lots all need a tenant prefix (`t42_201`), and the
   dashboard and Odoo must hide it.
3. **One failure takes everyone down.** A reload, a crash, a bad config or
   a full disk stops every customer's phones at once.
4. **Fraud spreads.** The ext 200 hijack ran up international calls on one
   trunk. On a shared server one hacked customer can exhaust shared call
   limits or get the shared IP blocked by the carrier.
5. **ARI and AMI see everything.** Presence, parking and recording deletion
   use ARI, which sees every channel. The worker would have to filter by
   tenant, and one bug leaks who is on a call at another company.
6. **Noisy neighbours.** Recording, transcoding and conferences are
   CPU-heavy; one customer's 20-way conference slows everyone's calls.
7. **fail2ban.** Several customers behind the same office NAT, or one
   customer's bad phone, can get an IP banned for everyone.
8. **Reloads.** `pbx-sync.sh` rewrites and reloads the whole PJSIP config
   every minute. With thousands of endpoints that becomes slow and drops
   registrations.

**Can it scale?** One Asterisk server handles a few hundred calls at once
(roughly 300–500 with recording and WebRTC encryption on a 4–8 core VPS;
transcoding and conferences reduce that) and several thousand registered
phones. It scales up, not out: past one server you need a SIP proxy
(Kamailio or OpenSIPS) in front, routing each customer to their server.

**Recommended form of A: one Asterisk container per customer on shared
hosts**, not one Asterisk shared by all:
- Each customer keeps their own config, AstDB and failures (risks 1, 2, 3,
  5, 8 go away), and today's single-customer code works unchanged.
- 20–50 small customers per host; Docker CPU and memory limits per
  container (risk 6); per-customer call limits stay in each container.
- Kamailio in front on the public IP: one place for TLS, fail2ban-style
  rate limits, and routing by SIP domain (`acme.phonebridge.app`) to the
  right container (risk 7 becomes per-domain).
- Media goes direct or through rtpengine; add hosts as customers grow.
- Carrier side: one wholesale trunk with a sub-account per customer (or the
  customer's own), so a fraud block hits one customer.

A truly shared Asterisk is only worth it at thousands of very small
customers; at that point FreeSWITCH (built for tenants as "domains") or a
cloud voice platform (Telnyx, Twilio) is a better base than Asterisk.

### 2C. Numbers and carriers (M), needed for both
- Carrier adapter: voip.ms today; add a UK carrier with an API for buying
  and porting numbers (Simwood, Telnyx or Twilio). One interface: search and
  buy numbers, set the emergency address, port in, set the inbound route.
- Odoo: "Get a number" and "Bring your number" (port) on the Phone Number
  form; porting needs a signed letter of authority and takes 1–4 weeks in
  the UK, so show the status.
- The fallback trunk has to actually work (Twilio still refuses
  64.176.184.11, error 32201) and be tested on a schedule (see 11).

---

## 4. Legal and compliance — size M

### 4a. Emergency calls, 999 and 112 (S–M, must have in the UK)
Ofcom General Condition A3: a phone service that can call UK numbers must
connect 999/112 for free, with the caller's location.
- Dialplan: 999, 112 (and 911 for travellers) always go out through the
  trunk, bypass call limits, blocked lists and opening hours, and never go
  to voicemail.
- Each number and each extension has a registered emergency address in
  Odoo, sent to the carrier (Simwood and Telnyx have an API for this).
- Mobile/app users: show a warning at setup that 999 from the app uses the
  registered address, not their location, and tell them to use the phone's
  own dialler where possible. On Android, pass 999 straight to the SIM
  dialler (SIM calling already exists).

### 4b. Call recording notice (S)
Per number, a switch "Play 'calls may be recorded'" (an IVR prompt, which
already exists), on by default when recording is on. UK GDPR and Thailand's
PDPA need callers told; some customers also need a "press 1 to opt out".

### 4c. Desk phone security (S, carries over the ext 200 lessons)
Plain UDP SIP from anywhere is how ext 200 was hijacked:
- Desk phones on TLS + SRTP only, or limited to the customer's office IP.
- Long random SIP passwords (done for new extensions), shown once.
- International and premium destinations off by default per customer, on
  per extension with a daily spend cap.
- Alerts: unusual call volume or destinations email the customer's admin.

### 4d. Data requests (M)
"Export everything about this caller" and "delete this caller" across
History, recordings, transcripts, notes, emails and the Odoo copies, for
GDPR subject access and erasure requests. Retention (exists) only deletes
by age.

### 4e. Audit log (S)
Record who listened to, downloaded or deleted a recording, changed routing
or limits, or signed in, with time and IP address. Viewable by admins,
kept for a set time.

### 4f. Contracts and where data lives (S, mostly paperwork)
- A data processing agreement and a list of sub-processors (Cloudflare,
  Workers AI, Google, the carrier, the VPS host).
- Where data is stored and processed: D1 and R2 location hints for EU/UK
  customers; check where Workers AI runs models.

---

## 7. Supervisor tools — size M

Needs a **Supervisor** role first: today people see their own calls plus
unanswered ones (`canSee`). Add roles in Odoo (agent, supervisor, admin)
sent with extensions.

1. **Live wallboard** (M): calls waiting per queue and the longest wait,
   who is free, on a call (and for how long), wrapping up or on a break,
   today's answered and abandoned calls, and the answer rate against a
   target. Data: the `CallState` Durable Object plus ARI presence; pushed to
   the page over a WebSocket from the Durable Object instead of polling. A
   TV mode for the office screen.
2. **Listen, whisper, barge** (S–M): Asterisk `ChanSpy` (`q` quiet,
   `w` whisper, `B` barge). From the wallboard, a supervisor taps a call;
   the PBX rings them and joins. Supervisor only, and every use is in the
   audit log (4e).
3. **Agent status** (S): Available / Break / Wrap-up (a few seconds after
   each call before the next one rings), which queues skip.
4. **Queue reports** (S): extend Reports with abandon rate, average time to
   answer, share answered within N seconds, callbacks requested, and calls
   per agent per queue. The data is mostly in `call_log` already; the queue
   events need logging.
5. **Scheduled reports** (S): daily or weekly email of the Overview and
   Missed tabs to chosen people (cron + the existing email sending).
6. **Alerts** (S): a missed call nobody has taken after N minutes, or a
   queue wait over N seconds, sends a push or email to the supervisor.

---

## 8. Desk phones and a desktop app — size M

### Desk phones (M)
- **Automatic setup**: the worker serves each phone's config file by its
  MAC address (`/prov/{mac}.cfg`), signed or behind a per-phone secret,
  for Yealink, Poly and Grandstream. Use Yealink RPS and Poly ZTP so a phone
  set up from the box finds its config.
- In Odoo: add a phone by MAC and model to an extension; the config holds
  the SIP account (TLS + SRTP, see 4c), time zone, language, ringtone, and
  **busy lamp keys** for colleagues, fed from the presence data.
- Firmware updates from the same server.

### Desktop (S–M)
- Quick win (S): register the installed web app as the `tel:` link handler
  (`navigator.registerProtocolHandler`), so phone numbers in other web apps
  dial through it.
- A small desktop app (Tauri, a few MB) wrapping the dashboard: tray icon,
  ringing that shows even when minimised, starts at login, a global hotkey
  to answer or hang up, `tel:` and `callto:` links from any program, and a
  headset button for answer/hang up (WebHID for Jabra and Poly).

---

## 9. More CRMs — size L

Being tied to Odoo makes the market small.

1. **CRM adapter** (M): gather what the worker asks of Odoo into one
   interface: look up a caller, search contacts, create a contact, push a
   call with notes, recording and transcript, list quotes or deals, create
   a task. `odoo.ts` becomes the first adapter. Extensions and routing stay
   configured in our own admin pages for non-Odoo customers (a light admin
   UI in the dashboard).
2. **HubSpot** (M): an app in HubSpot's marketplace using its Calling
   Extensions SDK, so our softphone dials from inside HubSpot and calls log
   to the contact with the recording and AI summary. Biggest market for
   small businesses.
3. **Pipedrive** (S–M): its calling integration API; same features.
4. **Webhooks and API** (S–M): call started, answered, ended, voicemail,
   missed; a REST API with keys per customer; then a Zapier app so customers
   connect anything else.
5. **Later**: Salesforce (Open CTI), Microsoft Dynamics, Zoho.

---

## 10. AI — size M to L

The building blocks exist: Whisper transcripts, summaries, follow-up dates,
caller naming, spam detection, spoken IVR prompts.

### 10a. More from each call (S–M)
Extend the summary prompt (`src/summarize.ts`) so the same model call also
returns:
- **Sentiment** (positive, neutral, negative) and whether the customer
  sounded unhappy at the end. A column in History and Reports.
- **Topics and keywords**: rules per customer ("cancel", "complaint",
  "refund", a competitor's name) that send an alert to the supervisor.
- **Coaching score**: the customer's own checklist (greeted with company
  name, took contact details, offered a next step, agreed a follow-up), a
  score per call and a weekly trend per person.
- **Deal fields**: products, quantities and budget mentioned, written to the
  CRM.

Consider a stronger model for summaries (Claude Haiku 5.5 or Sonnet 5.5
via the Claude API) where Workers AI's quality falls short, with cost per
customer tracked.

### 10b. AI receptionist (L)
Answers when nobody is free, out of hours, or always for chosen numbers:
- Asterisk sends call audio to the worker in real time (`AudioSocket` or
  ARI external media) → speech to text as it's spoken → a language model
  with the company's FAQ, opening hours and contacts → speech (Workers AI
  Aura voices are already used for IVR prompts).
- It can answer common questions, take a message, put the caller through
  to the right person, or book a callback into the right person's Google
  Calendar (calendar access exists, read-only; needs write access).
- Everything is recorded and summarised like any other call. A clear
  "you're speaking to an automated assistant" at the start.
- Cost limit per customer and a fallback to voicemail on any error.

---

## 11. Reliability — size M

### 11a. Tests and CI (M, phase 0)
- **Worker**: unit tests with Vitest and `@cloudflare/vitest-pool-workers`
  (D1 and Durable Objects in tests). Start with the riskiest code: call
  legs (`calllegs.ts`), sign-in and setup links, spam rules, retention,
  limits, the Odoo push.
- **Dashboard**: Playwright tests of the main flows against a test worker:
  sign in, place a call (SIP mocked), incoming card, transfer, notes save.
  Longer term, split the 7,700-line template into modules with a build step;
  the no-backslash rule shows how fragile it is.
- **Odoo addon**: run its tests in a Docker Odoo in CI (none ran locally on
  2026-11-20).
- **GitHub Actions** on every push: typecheck, lint, `check:dashboard`,
  all tests; deploy only from a passing commit (today deploy sends the
  working tree, including uncommitted changes).

### 11b. Workers Paid (S, phase 0)
Free plan's 10 ms CPU limit loses recordings on the way to Odoo today
("Exceeded CPU Limit" in `uploadRecording`). Upgrade, set `cpu_ms`, re-push the
missing recordings.

### 11c. Monitoring (S)
- Uptime checks every minute on the dashboard, `/pbx/health` and the trunk
  registration, alerting by SMS or push (Better Stack, or Cloudflare health
  checks).
- **A test call every 15 minutes**: the PBX calls a test number through the
  trunk and back, checks audio flows (echo test) and that the call reached
  History and Odoo. This catches what "server is up" doesn't.
- Error reporting for the dashboard and app (Sentry) and Workers Logs for
  the worker.

### 11d. Failover (M)
- Second carrier that is actually tested by the scheduled test call.
- If the PBX is down: numbers fall back at the carrier to forwarding to
  mobiles (most carriers support a failover destination).
- A spare PBX can be built from the 2B installer in minutes; config comes
  from Odoo, so only recordings not yet uploaded are at risk.

### 11e. Backups and recovery (S)
- D1 Time Travel (30 days on Paid) plus a nightly export to R2.
- Asterisk config, AstDB and the CDR database backed up nightly.
- The Android release key and its passwords in two safe places (already
  noted in `docs/android.md`; losing it means every phone reinstalls).
- A written recovery runbook, tested once a quarter.

### 11f. Status page and service levels (S)
A public status page per customer area, uptime target (e.g. 99.9%),
support hours and response times in the contract.

---

## Open questions for Steve

1. Target market first: UK small businesses, Thailand, or both? It decides
   the carrier, 999 work and languages.
2. Odoo only at first (sell through the Odoo app store), or HubSpot early?
3. Who runs support and on-call when a customer's phones stop?
4. Price model: per user per month, or per company? This affects whether
   shared hosting (2A) is ever needed.
