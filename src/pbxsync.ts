import type { Env } from "./types";
import { ariSyncExtensions } from "./asterisk";
import { same, syncExtensions } from "./users";
import { ivrSyncLines } from "./ivr";

// ── PBX extensions from Odoo ──────────────────────────────────
// Odoo's phone_bridge.extension records are the extensions: nobody adds them
// on the PBX by hand. syncExtensions (users.ts) copies them into D1, after
// every change in Odoo (POST /extensions/sync) and whenever the copy is stale.
// The PBX pulls them from here with pbx-sync.sh (GET /pbx/sync), writes its
// endpoints and internal dialling from them, and reports back a hash of what
// it applied (POST /pbx/synced). When the extensions change, the worker nudges
// the PBX to pull at once; the PBX host also runs the script every few minutes.
//
// This route hands out SIP passwords, so only PUSH_SECRET (the secret the
// PBX already sends to /push/wake), as an X-Pbx-Secret header, opens it;
// never a signed-in user (see pbxAllowed).

const FRESH_MS = 60_000;

interface ExtRow {
  number: string; name: string | null; user_id: number | null; user_name: string | null; sip_password: string | null;
  device_type: string | null; wake_app: number | null; active: number | null;
  forward_mode: string | null; forward_number: string | null; forward_seconds: number | null;
  user_mobile: string | null; user_mobile_delay: number | null;
}
interface NumberRow {
  number: string; extensions: string | null; ring_mobiles: number | null; ring_seconds: number | null;
  no_answer: string | null; no_answer_number: string | null; record: number | null; active: number | null;
}

function putSetting(env: Env, key: string, value: string) {
  return env.DB.prepare(
    "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at"
  ).bind(key, value, Date.now());
}

async function getSetting(env: Env, key: string): Promise<string> {
  return (await env.DB.prepare("SELECT value FROM settings WHERE key = ?1").bind(key).first<{ value: string }>())?.value ?? "";
}

/** What goes into the PBX config as the caller name: plain ASCII, no quotes
 *  or config punctuation. */
export function callerName(s: string): string {
  return s.normalize("NFKD").replace(/[^A-Za-z0-9 .'-]/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
}

const PASSWORD = /^[A-Za-z0-9._~-]{6,64}$/;
const NUMBER = /^\d{2,6}$/;
const PHONE = /^[1-9]\d{6,14}$/;           // international, digits only
const FWD_MODES: Record<string, string> = { always: "always", busy: "busy", noanswer: "noanswer", busy_noanswer: "busynoanswer" };
const clamp = (v: number | null, lo: number, hi: number, dflt: number) => (v == null || !Number.isFinite(v) ? dflt : Math.min(hi, Math.max(lo, Math.round(v))));

/** Each user's dashboard switches (user_settings): 📼 vm_direct takes their
 *  extensions out of the ring lists and sends calls to them to voicemail;
 *  📱 ring_mobile_first rings their mobile with no head start. */
async function userSwitches(env: Env): Promise<{ vm: Set<number>; mobileFirst: Set<number> }> {
  const rows = (await env.DB.prepare(
    "SELECT user_id, key FROM user_settings WHERE key IN ('vm_direct', 'ring_mobile_first') AND value = '1'"
  ).all<{ user_id: number; key: string }>()).results ?? [];
  const vm = new Set<number>(), mobileFirst = new Set<number>();
  for (const r of rows) (r.key === "vm_direct" ? vm : mobileFirst).add(r.user_id);
  return { vm, mobileFirst };
}

/** pbx-sync.sh's plain-text format, sorted, one item per line:
 *    ext <number> <webrtc|sip> <wake 0|1> <password> <caller name>
 *    fwd <extension> <always|busy|noanswer|busynoanswer|vm> <ring seconds> <number|->
 *    route <our number> <ring seconds> <record 0|1> <vm|hangup|fwd<number>> <legs|->
 *  Only active extensions with a usable password are listed; an extension
 *  not listed is removed from the PBX. The caller name may be empty.
 *  fwd: an extension's calls forwarded (Odoo) or sent to voicemail (its
 *  user's 📼). route: one of our numbers set up in Odoo; legs, comma-separated,
 *  ring at once: e<ext> an extension, a<ext> one woken on the Android app
 *  first, m<delay>x<number> a mobile or forward after <delay> seconds; "-"
 *  is none, straight to the no-answer action. Numbers are digits only. A
 *  number with no route line keeps the PBX's own routing. Then the menus and
 *  opening hours (ivr.ts: when / hours / menu / key / prompt lines). */
export async function pbxSyncText(env: Env): Promise<string> {
  const [rows, nums, sw] = await Promise.all([
    env.DB.prepare(
      "SELECT number, name, user_id, user_name, sip_password, device_type, wake_app, active, forward_mode, forward_number, forward_seconds, user_mobile, user_mobile_delay FROM extensions ORDER BY number"
    ).all<ExtRow>().then(r => r.results ?? []),
    env.DB.prepare(
      "SELECT number, extensions, ring_mobiles, ring_seconds, no_answer, no_answer_number, record, active FROM pbx_numbers ORDER BY number"
    ).all<NumberRow>().then(r => r.results ?? []),
    userSwitches(env),
  ]);
  const lines = ["version 1"];
  const inPbx = new Map<string, ExtRow>();
  for (const r of rows) {
    if (r.active === 0 || !NUMBER.test(r.number) || !PASSWORD.test(r.sip_password ?? "")) continue;
    inPbx.set(r.number, r);
    const type = r.device_type === "sip" ? "sip" : "webrtc";
    const wake = type === "webrtc" && r.wake_app ? 1 : 0;
    lines.push(`ext ${r.number} ${type} ${wake} ${r.sip_password} ${callerName(r.user_name || r.name || "")}`.trimEnd());
  }
  const vmUser = (r: ExtRow) => r.user_id != null && sw.vm.has(r.user_id);
  const forwardTo = (r: ExtRow) => (r.forward_mode && FWD_MODES[r.forward_mode] && PHONE.test(r.forward_number ?? "") ? r.forward_number! : null);
  // An extension as a ring-list leg: its "always" forwarding, the app woken
  // first, or the phone itself; none when its user's 📼 is on.
  const legOf = (x: string) => {
    const r = inPbx.get(x);
    if (!r || vmUser(r)) return null;
    const fwd = forwardTo(r);
    if (fwd && r.forward_mode === "always") return `m0x${fwd}`;
    return r.wake_app && r.device_type !== "sip" ? `a${r.number}` : `e${r.number}`;
  };
  for (const r of inPbx.values()) {
    if (vmUser(r)) lines.push(`fwd ${r.number} vm 0 -`);
    else if (forwardTo(r)) lines.push(`fwd ${r.number} ${FWD_MODES[r.forward_mode!]} ${clamp(r.forward_seconds, 5, 120, 20)} ${r.forward_number}`);
  }
  const routed = new Set<string>();
  for (const n of nums) {
    if (n.active === 0 || !PHONE.test(n.number)) continue;
    const legs: string[] = [];
    const add = (leg: string) => { if (!legs.includes(leg)) legs.push(leg); };
    const owners = new Map<number, ExtRow>();
    for (const x of (n.extensions ?? "").split(",")) {
      const leg = legOf(x);
      if (!leg) continue;
      add(leg);
      const r = inPbx.get(x)!;
      if (r.user_id != null && !owners.has(r.user_id)) owners.set(r.user_id, r);
    }
    if (n.ring_mobiles) {
      for (const [userId, r] of owners) {
        if (!PHONE.test(r.user_mobile ?? "")) continue;
        add(`m${sw.mobileFirst.has(userId) ? 0 : clamp(r.user_mobile_delay, 0, 120, 20)}x${r.user_mobile}`);
      }
    }
    const noAnswer = n.no_answer === "hangup" ? "hangup"
      : n.no_answer === "forward" && PHONE.test(n.no_answer_number ?? "") ? `fwd${n.no_answer_number}` : "vm";
    lines.push(`route ${n.number} ${clamp(n.ring_seconds, 5, 300, 45)} ${n.record ? 1 : 0} ${noAnswer} ${legs.join(",") || "-"}`);
    routed.add(n.number);
  }
  lines.push(...await ivrSyncLines(env, routed, (exts) => [...new Set(exts.map(legOf).filter((l): l is string => !!l))]));
  return lines.join("\n") + "\n";
}

async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** After syncExtensions: if what the PBX should have changed, ask it to
 *  pull now. Never throws; the PBX's own schedule catches up anyway. */
export async function nudgePbxIfChanged(env: Env): Promise<void> {
  try {
    const want = await sha256Hex(await pbxSyncText(env));
    if (want === await getSetting(env, "pbx_wanted")) return;
    await putSetting(env, "pbx_wanted", want).run();
    const res = await ariSyncExtensions(env);
    if (!res.ok) throw new Error(`ARI returned ${res.status}`);
  } catch (e) {
    console.error("pbx extension sync nudge failed:", e);
  }
}

/** The PBX's own calls here: X-Pbx-Secret = PUSH_SECRET. */
export async function pbxAllowed(request: Request, env: Env): Promise<boolean> {
  const secret = request.headers.get("X-Pbx-Secret") || "";
  return !!env.PUSH_SECRET && !!secret && same(secret, env.PUSH_SECRET);
}

/** GET /pbx/sync — refreshes from Odoo when the copy is over a minute old.
 *  503 when Odoo has never sent the full extension details (e.g. the addon
 *  predates them), so the PBX keeps what it has rather than emptying out. */
export async function handlePbxSync(env: Env): Promise<Response> {
  const at = Number(await getSetting(env, "pbx_exts_at")) || 0;
  if (Date.now() - at > FRESH_MS) await syncExtensions(env);
  if (!(Number(await getSetting(env, "pbx_exts_at")) > 0)) {
    return new Response("extension details not available from Odoo yet\n", { status: 503, headers: { "Content-Type": "text/plain" } });
  }
  return new Response(await pbxSyncText(env), { headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } });
}

/** POST /pbx/synced — applied=<sha256 of the sync text the PBX applied>. */
export async function handlePbxSynced(request: Request, env: Env): Promise<Response> {
  const applied = new URLSearchParams(await request.text()).get("applied") ?? "";
  if (!/^[0-9a-f]{64}$/.test(applied)) return Response.json({ error: "bad hash" }, { status: 400 });
  await env.DB.batch([putSetting(env, "pbx_applied", applied), putSetting(env, "pbx_applied_at", String(Date.now()))]);
  return Response.json({ ok: true });
}

/** Whether the PBX has applied what it should have now. */
export async function pbxInStep(env: Env): Promise<boolean> {
  const [want, applied] = await Promise.all([pbxSyncText(env).then(sha256Hex), getSetting(env, "pbx_applied")]);
  return applied === want;
}

/** GET /pbx/status — whether the PBX has the current extensions. */
export async function handlePbxStatus(env: Env): Promise<Response> {
  const [want, applied, appliedAt, fetchedAt] = await Promise.all([
    pbxSyncText(env).then(sha256Hex), getSetting(env, "pbx_applied"), getSetting(env, "pbx_applied_at"), getSetting(env, "pbx_exts_at"),
  ]);
  return Response.json({ synced: applied === want, synced_at: Number(appliedAt) || null, fetched_at: Number(fetchedAt) || null });
}
