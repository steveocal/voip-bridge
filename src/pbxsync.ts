import type { Env } from "./types";
import { ariSyncExtensions } from "./asterisk";
import { same, syncExtensions } from "./users";

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

interface ExtRow { number: string; name: string | null; user_name: string | null; sip_password: string | null; device_type: string | null; wake_app: number | null; active: number | null }

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

/** pbx-sync.sh's plain-text format, one extension per line, sorted:
 *    ext <number> <webrtc|sip> <wake 0|1> <password> <caller name>
 *  Only active extensions with a usable password are listed; an extension
 *  not listed is removed from the PBX. The caller name may be empty. */
export async function pbxSyncText(env: Env): Promise<string> {
  const rows = (await env.DB.prepare(
    "SELECT number, name, user_name, sip_password, device_type, wake_app, active FROM extensions ORDER BY number"
  ).all<ExtRow>()).results ?? [];
  const lines = ["version 1"];
  for (const r of rows) {
    if (r.active === 0 || !NUMBER.test(r.number) || !PASSWORD.test(r.sip_password ?? "")) continue;
    const type = r.device_type === "sip" ? "sip" : "webrtc";
    const wake = type === "webrtc" && r.wake_app ? 1 : 0;
    lines.push(`ext ${r.number} ${type} ${wake} ${r.sip_password} ${callerName(r.user_name || r.name || "")}`.trimEnd());
  }
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

/** GET /pbx/status — whether the PBX has the current extensions. */
export async function handlePbxStatus(env: Env): Promise<Response> {
  const [want, applied, appliedAt, fetchedAt] = await Promise.all([
    pbxSyncText(env).then(sha256Hex), getSetting(env, "pbx_applied"), getSetting(env, "pbx_applied_at"), getSetting(env, "pbx_exts_at"),
  ]);
  return Response.json({ synced: applied === want, synced_at: Number(appliedAt) || null, fetched_at: Number(fetchedAt) || null });
}
