#!/usr/bin/env python3
"""Generates docs/architecture.svg for voip-bridge."""
import sys
from html import escape as e

W, H = 1940, 1810
out = []
A = out.append

C = {
    "client": ("#eef6ff", "#3b82f6"),
    "worker": ("#fff7ed", "#f97316"),
    "store": ("#fffbeb", "#d97706"),
    "odoo": ("#f5f3ff", "#7c3aed"),
    "pbx": ("#ecfdf5", "#059669"),
    "ext": ("#f8fafc", "#64748b"),
    "warn": ("#fef2f2", "#dc2626"),
    "deploy": ("#f1f5f9", "#334155"),
}


def rich(txt):
    """**bold** spans → tspans."""
    parts = txt.split("**")
    return "".join(f'<tspan font-weight="700" fill="#0f172a">{e(p)}</tspan>' if i % 2 else e(p) for i, p in enumerate(parts))


def box(x, y, w, h, kind, title, lines=(), sub=None, size=12, rx=10, dash=False):
    fill, stroke = C[kind]
    d = ' stroke-dasharray="6 4"' if dash else ""
    A(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" stroke="{stroke}" stroke-width="1.6"{d}/>')
    ty = y + 20
    A(f'<text x="{x + 10}" y="{ty}" class="t" fill="{stroke}">{e(title)}</text>')
    if sub:
        ty += 15
        A(f'<text x="{x + 10}" y="{ty}" class="s">{e(sub)}</text>')
    ty += 4
    for ln in lines:
        ty += size + 4
        A(f'<text x="{x + 12}" y="{ty}" class="l" font-size="{size}">{rich(ln)}</text>')
    return (x, y, w, h)


def table(x, y, cols, rows, size=12, rowh=21):
    """cols: [(title, width)], rows: list of tuples."""
    cx = x
    for title, w in cols:
        A(f'<text x="{cx + 8}" y="{y + 15}" class="th">{e(title)}</text>')
        cx += w
    A(f'<line x1="{x}" y1="{y + 22}" x2="{cx}" y2="{y + 22}" stroke="#94a3b8"/>')
    yy = y + 22
    for i, r in enumerate(rows):
        if i % 2 == 0:
            A(f'<rect x="{x}" y="{yy}" width="{cx - x}" height="{rowh}" fill="#ffffff" opacity="0.7"/>')
        cx = x
        for (title, w), cell in zip(cols, r):
            A(f'<text x="{cx + 8}" y="{yy + 15}" class="l" font-size="{size}">{rich(cell)}</text>')
            cx += w
        yy += rowh
    return yy


def group(x, y, w, h, kind, title):
    fill, stroke = C[kind]
    A(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="14" fill="none" stroke="{stroke}" stroke-width="2.2" stroke-dasharray="2 0"/>')
    A(f'<rect x="{x + 14}" y="{y - 12}" width="{len(title) * 8.4 + 20}" height="24" rx="6" fill="{stroke}"/>')
    A(f'<text x="{x + 24}" y="{y + 5}" class="g">{e(title)}</text>')


def arrow(pts, label=None, color="#475569", lx=None, ly=None, both=False, dash=False, anchor="middle"):
    p = " ".join(f"{a},{b}" for a, b in pts)
    m = ' marker-start="url(#ah)"' if both else ""
    d = ' stroke-dasharray="5 4"' if dash else ""
    A(f'<polyline points="{p}" fill="none" stroke="{color}" stroke-width="1.6"{d} marker-end="url(#ah)"{m}/>')
    if label:
        if lx is None:
            (x1, y1), (x2, y2) = pts[0], pts[-1]
            lx, ly = (x1 + x2) / 2, (y1 + y2) / 2 - 5
        for i, part in enumerate(label.split("\n")):
            A(f'<text x="{lx}" y="{ly + i * 13}" class="al" text-anchor="{anchor}">{e(part)}</text>')


A(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif">')
A("""<defs>
<marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#475569"/></marker>
<style>
.t{font-size:14px;font-weight:700}
.s{font-size:11px;fill:#64748b;font-style:italic}
.l{fill:#1e293b}
.lb{fill:#0f172a;font-weight:700}
.g{font-size:14px;font-weight:700;fill:#fff}
.al{font-size:11px;fill:#334155;paint-order:stroke;stroke:#fff;stroke-width:4px;stroke-linejoin:round}
.h1{font-size:24px;font-weight:800;fill:#0f172a}
.h2{font-size:13px;fill:#475569}
.th{font-size:12px;font-weight:700;fill:#92400e}
</style></defs>""")
A(f'<rect width="{W}" height="{H}" fill="#ffffff"/>')
A('<text x="30" y="40" class="h1">VoIP Bridge: how the parts fit together</text>')
A('<text x="30" y="62" class="h2">Infrared Heating Products phone system · Odoo (CloudPepper) · Cloudflare Worker + D1 · Asterisk on the VPS · browser dashboard and Android app · as of 13 Nov 2026</text>')


# ───────────── Row 1: clients ─────────────
group(20, 90, 1860, 250, "client", "WHERE PEOPLE USE IT")
box(40, 112, 430, 212, "client", "Odoo phone panel (inside Odoo, browser)",
    ["phone_bridge/static/src/softphone/", "**softphone_service.js**: SIP.js user agent, tel: links",
     "**phone_panel.js/.xml/.scss**: Activities · Recent ·", "   keypad · Contacts · Emails, T9 matches (t9.js)",
     "**softphone_systray.js**: green phone in the top bar",
     "Config from /phone_bridge/softphone/config", "   (WSS URL, domain, extension, SIP password)",
     "Registers as the user's extension (e.g. 203)"],
    sub="Odoo users at their desks")
box(490, 112, 470, 212, "client", "Web dashboard (browser)",
    ["Served by the Worker at /dashboard (src/dashboard.ts)", "SIP.js softphone, History + keypad on one screen",
     "Call panel: Sales · History · Emails · Notes · Jot", "Meeting recorder *91–*94, spoken notes (+)",
     "Call via my mobile, voicemail switch, PBX health strip", "Park · Transfer · Add · Merge (conference)",
     "Odoo login via /staff/login → session cookie", "Registers as the user's extension (201/202/211…)"],
    sub="the main softphone; the Android app shows this same page")
box(980, 112, 500, 212, "client", "Android app (Capacitor)  info.systecgroup.voipbridge",
    ["Thin shell that loads https://voip.ihpltd.co.uk/dashboard,", "   so UI changes ship with the Worker (no new APK)",
     "Native plugins (android/app/src/main/java/…):", "   **CallMessagingService**: FCM push wakes the app",
     "   **RingerPlugin**: full-screen ringing", "   **SimCallPlugin**: calls over the SIM",
     "   **DeviceContactsPlugin**: the phone's own contacts", "   **StaffLocationPlugin + LocationWorker**: GPS every 15 min"],
    sub="mobile staff; APK downloadable at /app")
box(1500, 112, 360, 100, "client", "Website callback widget",
    ["callback-widget.js on infraredheaterpanels.co.uk", "→ Worker POST /web-callback (call now / later)"],
    sub="website visitors")
box(1500, 224, 360, 100, "client", "Desk phone (ext 200)",
    ["SIP over UDP straight to Asterisk", "No Worker involvement; its internal", "calls aren't logged"],
    sub="hardware handset")

# ───────────── Row 2: Worker ─────────────
group(20, 380, 1240, 270, "worker", "CLOUDFLARE WORKER  voip-bridge  (src/*.ts)")
box(40, 402, 390, 232, "worker", "Calls & PBX",
    ["**index.ts**: router; /call-event from Asterisk", "**callstate.ts**: Durable Object CallState (live calls)",
     "**calllegs.ts**: fold legs into one call", "**asterisk.ts**: ARI (originate, ping, park list)",
     "**pbxsync.ts**: /pbx/sync, /pbx/health", "**ivr.ts, ivrsay.ts**: phone menus, spoken prompts",
     "**owner.ts**: /pbx/owner (customer's salesperson)", "**push.ts**: /push/wake → FCM to Android",
     "**mobilecall.ts · webcallback.ts · voicemail.ts**", "**users.ts**: syncExtensions from Odoo"], size=11)
box(445, 402, 390, 232, "worker", "AI, email & meetings",
    ["**recording.ts**: fetch WAV from Asterisk", "**transcribe.ts**: Whisper (Workers AI)",
     "**summarize.ts**: call summary + follow-ups", "**followup.ts**: spoken note → Notes + Odoo To-Do",
     "**vmemail.ts**: voicemail email to the extension's", "   'Email Voicemail To' (from Odoo)",
     "**meetings.ts**: *91–*94 → R2 → transcript → email", "**jottext.ts**: handwriting → text",
     "**gmail.ts**: send/read with each user's Gmail", "   (shared account sends voicemails)"], size=11)
box(850, 402, 390, 232, "worker", "Odoo & staff links, bindings",
    ["**odoo.ts**: XML-RPC to Odoo", "   pushCallToOdoo → phone_bridge.call.bridge_upsert",
     "   (voip.call only if phone_bridge is missing)", "   contacts, quotations, activities",
     "**staff.ts**: /staff/login (Odoo user, or hr.employee", "   + Attendances PIN), /staff/location → Odoo",
     "Bindings: **DB** D1 voip-bridge-d1 · **CALL_STATE** DO", "   **MEETINGS** R2 · **AI** Workers AI",
     "   **ASSETS** public/ (dashboard, APK, sip.min.js)", "Deploy: npm run deploy (wrangler)"], size=11)
box(1280, 402, 290, 112, "ext", "Google",
    ["Gmail API: send, read, attachments", "People API: Google contacts", "OAuth per user (D1 user_google)"])
box(1280, 526, 290, 108, "ext", "Workers AI",
    ["Whisper: speech to text", "LLM: summaries, follow-up dates,", "handwriting"])
box(1590, 402, 290, 232, "warn", "Gaps found while mapping this",
    ["**voip_bridge**: 0 voip.call records (unused)", "**Bundled phone-bridge worker** in the addon",
     "   has never been deployed", "**Two voicemail emails**: the Worker's is live;",
     "   Odoo's bridge_notify_voicemail is never called", "**Desk phone 200**: internal calls not logged",
     "Fixed 13 Nov: Odoo Installation now has the", "   Worker URL + API token (Odoo → Worker link);",
     "   panel keypad 18.0.0.13.2 is live"], dash=True, size=11)

# ───────────── Row 3: data ─────────────
group(20, 680, 1860, 330, "store", "DATA: CLOUDFLARE D1 TABLES vs ODOO MODELS")
cols = [("D1 table (Worker)", 230), ("Odoo model", 300), ("Master · how it syncs", 630)]
rows = [
    ("**call_log**", "**phone_bridge.call** (249)", "Worker. pushCallToOdoo upserts after each event; Odoo panel also writes its own calls"),
    ("**contacts**, **phone_lookup**", "**res.partner**", "Odoo. Worker caches them for caller ID, T9 and names in History"),
    ("**extensions**", "**phone_bridge.extension** (6) · res.users", "Odoo. syncExtensions on save / when stale → pbx-sync.sh → PJSIP endpoints"),
    ("**pbx_numbers**", "**phone_bridge.number** (5) · **.menu** (2) · .option", "Odoo. Copied to D1 → AstDB pbroute/<did> + IVR dialplan"),
    ("**web_callbacks**", "phone_bridge.call (as a missed call)", "Worker. One call_log row 'web-<id>' each"),
    ("**user_settings**, **user_google**", "res.users (login only)", "Worker only: prefs and Gmail OAuth tokens"),
    ("**messages**", "–", "Worker only: Gmail cache for the Emails tab"),
    ("**greetings**", "–", "Worker only: voicemail greetings, pulled by Asterisk [greetings-sync]"),
    ("**settings**", "phone_bridge.installation", "Separate: D1 = Worker key/values; installation = Worker URL + API token (+ bundled worker)"),
    ("**staff_login_failures**", "**hr.employee** · **staff.location.stay**", "Odoo. Worker checks PIN, passes GPS straight to Odoo"),
    ("R2 MEETINGS · DO CallState", "–", "Worker only: meeting audio blocks; ringing / live calls"),
    ("–", "**mail.activity** · **sale.order** · voip.call", "Odoo only. Worker reads/creates To-Dos, reads quotations; voip.call legacy"),
]
table(40, 702, cols, rows, size=12, rowh=23)
box(1270, 702, 590, 292, "ext", "Function overlap (same job in two places)",
    ["**Softphone**: Odoo panel vs web dashboard / app. Two separate", "   SIP.js clients; the dashboard does far more",
     "**Call logging**: the Odoo panel writes phone_bridge.call itself;", "   the Worker upserts the same record (same bridge_call_id)",
     "**Voicemail email**: Worker vmemail.ts (live) vs Odoo", "   phone_bridge.call.bridge_notify_voicemail (never called)",
     "**Call records**: phone_bridge.call (live) vs voip.call", "   (voip_bridge addon, legacy fallback, empty)",
     "**Worker code**: the live voip-bridge worker vs the copy bundled", "   in phone_bridge/data/worker (for other Odoo installs)",
     "**T9, Activities, Emails**: built separately in both clients", "**Opening hours**: Odoo working schedule → D1 → dialplan"])

# ───────────── Row 4: Odoo + PBX ─────────────
group(20, 1100, 900, 440, "odoo", "ODOO 18 on CloudPepper  infraredheaterpanels.co.uk")
box(40, 1122, 430, 300, "odoo", "phone_bridge addon (18.0.0.13.2)",
    ["**phone_bridge.extension**: number, user, device type,", "   SIP password, forwarding, Email Voicemail To",
     "**phone_bridge.number**: DIDs, who rings, hours, no answer", "**phone_bridge.menu / .menu.option**: phone menu keys",
     "**phone_bridge.call**: call log, chatter, activities", "**phone_bridge.installation**: Worker settings,",
     "   Cloudflare deploy of the bundled worker, SIP WSS", "res.users: extension, Mobile to Ring",
     "res.partner: calls on contacts", "**controllers/main.py**: /phone_bridge/* JSON routes",
     "**data/worker/**: bundled worker build", "views: Phone app (Calls, Numbers, Menus, Extensions)"],
    sub="source: ~/dDev/odoo-phone-bridge/odoo/phone_bridge")
box(490, 1122, 410, 140, "odoo", "voip_bridge addon (18.0.1.0.0)",
    ["Adds recording, transcript, notes, DID and", "voicemail flag to Enterprise **voip.call**",
     "Legacy target from before phone_bridge.call", "Depends on voip (installed, not configured)"])
box(490, 1276, 410, 146, "odoo", "staff_location addon",
    ["**staff.location.stay**: stops from phone GPS", "Matches stops to contacts → customer meetings",
     "Logs visits on contacts and calls", "Map view (staff_map.js)",
     "Fed by Worker /staff/location (Android app)"])
box(40, 1436, 860, 88, "odoo", "Core Odoo models the Worker reads and writes",
    ["res.partner (caller ID, contacts) · res.users (logins, extensions) · hr.employee (staff PIN login) · mail.activity (To-Dos)",
     "sale.order (quotations in the call panel) · mail.message (notes) · resource.calendar (opening hours, via phone_bridge.number)"])

group(940, 1100, 940, 440, "pbx", "VPS 64.176.181.195 · Docker 'asterisk' · /opt/asterisk/config")
box(960, 1122, 440, 300, "pbx", "Asterisk config",
    ["**pjsip.conf**: [voipms] trunk (re-registers every 300 s),", "   Twilio trunk, desk phone 200",
     "**pjsip-phone-bridge.conf**: WebRTC template (WSS)", "**pjsip-phone-bridge-extensions.conf**: generated",
     "   from Odoo extensions by pbx-sync.sh", "**extensions.conf**: [default] inbound, [from-internal],",
     "   outbound-dial, record-call, voicemail, park 700,", "   conference _82XX, web-callback, mobile-call",
     "**extensions-phone-bridge-routing.conf**: pb-route,", "   ext-dial (forwarding), pb-ring-mobile",
     "**extensions-phone-bridge-ivr.conf**: phone menus", "confbridge.conf · res_parking · musiconhold"])
box(1420, 1122, 440, 170, "pbx", "Scripts on the VPS",
    ["**pbx-sync.sh** (host cron, every minute): GET /pbx/sync,", "   writes endpoints + AstDB routes, reports trunk state",
     "**pb-say.sh**: fetches Worker speech for menus", "**pb-owner.sh**: asks /pbx/owner for the salesperson",
     "**recording-done.sh**: posts finished WAVs (event=recording)", "AstDB: pbroute/<did>, pbfwd/<ext>, pbx/push_extensions"])
box(1420, 1306, 440, 116, "ext", "Phone lines",
    ["**voip.ms** sub account: 01283 246490/1/2, 07520 658657", "   If Unreachable → Steve's mobile",
     "**Twilio**: 07898 117226", "Cannock 01543 648370 (voip.ms main account)"])
box(960, 1436, 900, 88, "pbx", "A call coming in",
    ["Caller → voip.ms / Twilio → Asterisk [default] → pb-route (Odoo's routing) → ring app / browser extensions (WSS), desk phone,",
     "   mobiles → no answer: voicemail → recording-done.sh → Worker → transcript → email + Odoo phone_bridge.call"])

# ───────────── Row 5: install / deploy ─────────────
group(20, 1570, 1860, 190, "deploy", "INSTALLATION & DEPLOYMENT")
box(40, 1592, 440, 152, "deploy", "Worker (voip-bridge repo, branch main)",
    ["**npm run deploy** = check-dashboard + wrangler deploy", "**wrangler d1 migrations apply** (0001–0020)",
     "secrets: ODOO_*, GOOGLE_*, PUSH_SECRET, FCM…", "public/: dashboard assets, APK, sip.min.js",
     "The Android app picks up UI changes at once"])
box(495, 1592, 440, 152, "deploy", "Odoo addons",
    ["Source: odoo-phone-bridge/odoo/phone_bridge", "Copy → voip-bridge branch **odoo-addons**",
     "   (phone_bridge, voip_bridge, staff_location)", "CloudPepper: **update repo** → Apps → **Upgrade**",
     "bundle-addon.mjs builds data/worker into the addon"])
box(950, 1592, 470, 152, "deploy", "VPS (scripts/vps-*.sh, run from here over ssh)",
    ["setup-pbx-sync · setup-pbx-routing · setup-pbx-ivr", "setup-conference · setup-parking · setup-mobile-call",
     "setup-mobile-first · persist-astdb · record-far-end", "ring-app-in-parallel · wake-app-30s · voicemail-25s",
     "internal-voicemail · add-ext203  (each backs up first)"])
box(1435, 1592, 425, 152, "deploy", "Android app",
    ["**scripts/android-build.sh** → debug APK", "**scripts/android-release.sh** → signed APK",
     "   published at /app on the Worker", "capacitor.config.ts: server.url = dashboard",
     "New APK needed only for native plugin changes"])

# ───────────── Arrows ─────────────
G = "#059669"
# SIP/WSS: every softphone → Asterisk, along the right margin
for x in (255, 725, 1230, 1680):
    A(f'<line x1="{x}" y1="324" x2="{x}" y2="356" stroke="{G}" stroke-width="1.6"/>')
A(f'<polyline points="255,356 1905,356 1905,1072 1180,1072 1180,1122" fill="none" stroke="{G}" stroke-width="2" marker-end="url(#ah)"/>')
A(f'<text x="1916" y="700" class="al" fill="{G}" transform="rotate(90 1916 700)" text-anchor="middle">SIP: every softphone and the desk phone register with Asterisk; the audio goes direct</text>')
A(f'<text x="1540" y="1067" class="al" fill="{G}" text-anchor="middle">SIP over WSS / UDP</text>')
# dashboard/app → Worker
arrow([(640, 324), (640, 402)], "HTTPS API", lx=600, ly=374)
arrow([(1100, 324), (1100, 402)], "HTTPS · FCM push", lx=1050, ly=374, both=True)
# Odoo panel → Odoo controllers (left margin)
arrow([(60, 324), (60, 366), (30, 366), (30, 1140), (40, 1140)])
A('<text x="25" y="720" class="al" transform="rotate(-90 25 720)" text-anchor="middle">Odoo panel → Odoo JSON-RPC /phone_bridge/*</text>')
# Worker → Google / AI
arrow([(1240, 450), (1280, 450)])
arrow([(1240, 580), (1280, 580)])
# Worker ↔ Odoo (XML-RPC)
arrow([(1215, 634), (1215, 1030), (255, 1030), (255, 1122)], both=True)
A('<text x="700" y="1025" class="al" text-anchor="middle">Worker ↔ Odoo XML-RPC: calls, contacts, extensions, numbers, activities</text>')
# Odoo → Worker (missing Worker URL)
arrow([(200, 1122), (200, 1052), (1232, 1052), (1232, 640)])
A('<text x="700" y="1066" class="al" text-anchor="middle">Odoo → Worker: panel call events, Emails, Google, Parked (Bearer API_TOKEN)</text>')
# Worker ↔ Asterisk
arrow([(1250, 650), (1250, 1122)], both=True)
A('<text x="1262" y="845" class="al" transform="rotate(90 1262 845)" text-anchor="middle">Worker ↔ Asterisk: ARI, pbx-sync, /call-event, recordings, /push/wake</text>')
# scripts ↔ lines
arrow([(1640, 1292), (1640, 1306)])

A('<text x="30" y="1790" class="h2">Arrows: green = SIP / voice · grey = HTTPS / RPC data · red dashed box = known gaps. Source: docs/architecture.py (regenerate after changes).</text>')
A("</svg>")
open(sys.argv[1], "w").write("\n".join(out))
