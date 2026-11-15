# voip-bridge as a multi-tenant product: plan

Sketch, November 2026. Status: idea, nothing built yet beyond what exists today.

## The key decision: isolated stacks per tenant, not a shared database

Most of the per-tenant groundwork already exists. The `phone_bridge` Odoo addon can already provision the Worker, D1 database and dashboard **into a customer's own Cloudflare account** (`action_provision`, using the Worker bundle shipped in the module). Odoo already owns the extensions, users and settings of each company.

So the product follows the CloudPepper model: **one isolated stack per company, with a central control plane that creates, updates and monitors them**. It is not one shared Worker with a `tenant_id` on every table. That avoids:

- rewriting every query to filter by tenant;
- one company's data ever leaking into another's;
- one company's outage or AI bill affecting another.

The part that **isn't** per-tenant yet is the PBX. Today it's one hand-configured Asterisk.

## Architecture

| Layer | Per tenant | Shared |
|---|---|---|
| Odoo + `phone_bridge` addon | ✔ the customer's own Odoo | |
| Worker + D1 + R2 + AI | ✔ deployed by the addon (into the customer's Cloudflare account, or yours, as a hosted option) | |
| Asterisk | ✔ one container per tenant, like the odoo20 set-up | the hosts it runs on |
| Control plane | | ✔ new: tenants, PBX provisioning, updates, health, billing |
| SIP trunks / DIDs | ✔ a voip.ms sub-account per tenant, or their own carrier | your carrier account if reselling |
| Android app | | ✔ one app: the user scans a QR code or enters the tenant URL; FCM push is routed per tenant |

## Work needed

### 1. Remove IHP-specific details from the code (small, do first)

- **"IHP" and "Infrared" wording:** 11 places in 5 files, including the AI prompts in `summarize.ts`, `followup.ts` and `meetings.ts`, plus `ivrsay.ts` and `odoo.ts`. These become a company name and a short business description in the settings.
- **Hard-coded values in `dashboard.ts`:** the caller IDs (01283 246491 and the voip.ms mobile number) and the rule hiding ext 202's calls. These move to per-extension settings in Odoo.
- **The built-in account with a password in the code** (`webphone201`): remove it. Accounts should come from Odoo after sign-in, which `syncExtensions` already almost does.
- **`Europe/London`** (8 places in 4 files) and the UK `+44` assumptions: use the tenant's time zone and country code. The addon already has `country_code` and `locale` fields.
- **`wrangler.toml`**: the account ID, ASTERISK_URL and ODOO_URL become deploy-time settings. The addon's provisioner already sets most of these.

### 2. A PBX per tenant (the main build)

- **Container image:** a versioned image of the current set-up: the voip-bridge dialplan, `pbx-sync.sh`, the greeting sync, the PJSIP templates and ARI.
- **Allocator:** picks a host, a SIP port and an RTP block, then creates the container, certificate and nginx `/ws` route automatically. odoo20 already shows the pattern: 5060/5160/5260 with separate RTP ranges. The alternative is a hostname per tenant on 5060 with a Kamailio SIP proxy in front.
- **Self-configuration:** everything else (extensions, routing, IVR, voicemail) is already pulled from Odoo through `/pbx/sync`. So a new PBX sets itself up once it knows its Worker URL and `PUSH_SECRET`.
- **Health:** today's `/pbx/health`, plus `push_log`, feed the control plane's monitoring.

### 3. Control plane (new: a small Odoo app or Worker of your own)

- Records tenants, plans, PBX host and port, Worker URL and versions.
- **Updates:** roll a new Worker bundle and Asterisk image out tenant by tenant, with a one-click rollback.
- **Billing:** per tenant or per extension, plus usage (call minutes and AI). Workers AI and transcription cost grows with call minutes, so a pure flat fee is risky.

### 4. Carrier and numbers

- **Start simple:** the customer brings their own trunk (voip.ms or similar).
- **Later:** resell DIDs through a carrier with an API (Telnyx, Twilio, voip.ms) so a new tenant gets a number automatically. That makes your account liable for toll fraud, so add per-tenant spend caps and international call barring from day one.

### 5. Compliance (UK first)

- **Emergency calls:** 999/112 must work, with a registered address per number (Ofcom General Conditions). The carrier usually covers this, but your contract has to say who is responsible.
- **Call recording and transcription:** customers need a recording-announcement option. You need a data processing agreement as their processor, a retention setting, and a list of the AI subprocessors.
- **Toll fraud:** fail2ban, strong generated SIP passwords (already generated), outbound call limits and alerts on unusual calls.

## Phases

| Phase | Scope | Outcome |
|---|---|---|
| **0: Clean-up** (≈1–2 weeks) | Remove the IHP-specific details; move settings to Odoo and the addon | IHP runs exactly as now, but nothing is IHP-specific |
| **1: Second tenant, by hand** (≈2–3 weeks) | The PBX container image; install one friendly customer in a second container on odoo20 | Shows two tenants running side by side |
| **2: Automated provisioning** (≈4–6 weeks) | Control plane v1: create tenant, PBX and Worker from one form; roll out updates; health dashboard | New customers need no hands-on work |
| **3: Commercial** | Billing, DID reselling, Android app onboarding by QR code, Odoo Apps listing, documentation | A product you can sell |

## Pricing and positioning (to sanity-check)

- **Position:** "phone system built into Odoo", not "an Asterisk panel". You compete with Odoo's own VoIP app plus a separate hosted phone service, not with VitalPBX or 3CX.
- **Example price:** about £30–50 per month per tenant, plus £8–12 per extension. Add metered transcription and AI above an included amount, and DIDs at cost plus a margin.
- **Cost per tenant:**
  - an Asterisk container needs about 30–60 MB of RAM, so a 4 GB host runs dozens of tenants;
  - Workers and D1 cost cents per tenant;
  - AI scales with call minutes, which is why it's metered.

## Risks

- **Support load:** phones, routers and NAT. Counter it with WebRTC-first (browser and app), as voip-bridge already is.
- **A shared Asterisk host is a single point of failure.** Spread tenants across hosts and keep snapshot images ready, as done for the odoo20 move.
- **Your own time:** keep IHP as tenant #1 on the same code, so there's one codebase, not a fork.

## Next step

Phase 0. It also improves IHP's own system (for example, it removes the password from the code) and doesn't commit to the business.
