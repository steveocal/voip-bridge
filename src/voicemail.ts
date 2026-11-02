import type { Env } from "./types";
import { ariSyncGreetings } from "./asterisk";
import { nudgePbxIfChanged, pbxInStep } from "./pbxsync";

// ── Voicemail greetings ───────────────────────────────────────
// The 📼 (straight to voicemail) and 📱 (mobile first) switches are each
// user's own (user_settings vm_direct, ring_mobile_first): they reach the PBX
// as part of the routing from Odoo (pbxsync.ts), for the numbers set up in
// Odoo. The old shared settings rows below still drive the PBX's hand-written
// routes for any number not set up there.
// Greetings are stored in D1. The active one and the straight-to-voicemail
// switch are settings rows (vm_greeting, vm_direct), as is "mobile first"
// (ring_mobile_first: [ring-mobile] skips its 20s head start for the app and
// desk phones), which travels the same way. Asterisk never plays
// anything from here mid-call: greetings-sync.sh on the VPS copies the
// settings across (GET /voicemail/sync) and reports what it applied
// (POST /voicemail/synced → vm_applied), so voicemail keeps working while
// the worker is down. The worker kicks that script through ARI after every
// change. The host crontab also runs it every 5 min.

const MAX_BYTES = 1_950_000; // D1 caps a row at 2 MB; 2 min of 8 kHz 16-bit audio is 1.92 MB

interface GreetingRow { id: number; name: string; duration_ms: number; updated_at: number }

async function getSettings(env: Env, keys: string[]): Promise<Record<string, string>> {
  const rows = await env.DB.prepare(`SELECT key, value FROM settings WHERE key IN (${keys.map((_, i) => `?${i + 1}`).join(",")})`)
    .bind(...keys).all<{ key: string; value: string }>();
  const out: Record<string, string> = {};
  for (const r of rows.results || []) out[r.key] = r.value;
  return out;
}

function putSetting(env: Env, key: string, value: string) {
  return env.DB.prepare(
    "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at"
  ).bind(key, value, Date.now());
}

/** What Asterisk should have: "direct 0|1", "mobile_first 0|1" and "greeting <id> <version>" (or "greeting none"). */
async function wanted(env: Env): Promise<{ direct: string; mobileFirst: string; greeting: string }> {
  const s = await getSettings(env, ["vm_direct", "vm_greeting", "ring_mobile_first"]);
  const g = s.vm_greeting
    ? await env.DB.prepare("SELECT id, updated_at FROM greetings WHERE id = ?1").bind(Number(s.vm_greeting)).first<{ id: number; updated_at: number }>()
    : null;
  return { direct: s.vm_direct === "1" ? "1" : "0", mobileFirst: s.ring_mobile_first === "1" ? "1" : "0", greeting: g ? `${g.id}-${g.updated_at}` : "none" };
}

async function syncAsterisk(env: Env) {
  try {
    const res = await ariSyncGreetings(env);
    if (!res.ok) console.error("greetings sync: ARI returned", res.status);
  } catch (e) { console.error("greetings sync failed:", e); }
}

async function userSwitches(env: Env, userId: number): Promise<{ direct: boolean; mobileFirst: boolean }> {
  const rows = (await env.DB.prepare(
    "SELECT key, value FROM user_settings WHERE user_id = ?1 AND key IN ('vm_direct', 'ring_mobile_first')"
  ).bind(userId).all<{ key: string; value: string }>()).results ?? [];
  const on = (k: string) => rows.some(r => r.key === k && r.value === "1");
  return { direct: on("vm_direct"), mobileFirst: on("ring_mobile_first") };
}

function putUserSetting(env: Env, userId: number, key: string, value: string) {
  return env.DB.prepare(
    "INSERT INTO user_settings (user_id, key, value, updated_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(user_id, key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at"
  ).bind(userId, key, value, Date.now());
}

/** Everything the dashboard's Voicemail page shows; direct and mobileFirst
 *  are the signed-in user's own switches. */
async function state(env: Env, userId: number): Promise<Response> {
  const [greetings, s, want, mine, pbxOk] = await Promise.all([
    env.DB.prepare("SELECT id, name, duration_ms, updated_at FROM greetings ORDER BY id").all<GreetingRow>(),
    getSettings(env, ["vm_greeting", "vm_applied", "vm_applied_at"]),
    wanted(env),
    userSwitches(env, userId),
    pbxInStep(env),
  ]);
  let applied: { greeting?: string } = {};
  try { applied = JSON.parse(s.vm_applied || "{}"); } catch { /* never synced */ }
  return Response.json({
    direct: mine.direct,
    mobileFirst: mine.mobileFirst,
    greeting: want.greeting === "none" ? null : Number(s.vm_greeting),
    greetings: greetings.results || [],
    synced: applied.greeting === want.greeting && pbxOk,
    syncedAt: Number(s.vm_applied_at) || null,
  });
}

export async function handleGetVoicemail(env: Env, userId: number): Promise<Response> {
  return state(env, userId);
}

/** {direct?: boolean, mobileFirst?: boolean, greeting?: id | null}; the
 *  switches are the signed-in user's (not the addon's service login, id 0). */
export async function handleSetVoicemail(request: Request, env: Env, userId: number): Promise<Response> {
  let body: { direct?: unknown; mobileFirst?: unknown; greeting?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "invalid JSON" }, { status: 400 }); }
  const writes = [], mine = [];
  if (userId && typeof body.direct === "boolean") mine.push(putUserSetting(env, userId, "vm_direct", body.direct ? "1" : "0"));
  if (userId && typeof body.mobileFirst === "boolean") mine.push(putUserSetting(env, userId, "ring_mobile_first", body.mobileFirst ? "1" : "0"));
  if (body.greeting === null) writes.push(putSetting(env, "vm_greeting", ""));
  else if (typeof body.greeting === "number") {
    const g = await env.DB.prepare("SELECT id FROM greetings WHERE id = ?1").bind(body.greeting).first();
    if (!g) return Response.json({ error: "no such greeting" }, { status: 404 });
    writes.push(putSetting(env, "vm_greeting", String(body.greeting)));
  }
  if (writes.length || mine.length) await env.DB.batch([...writes, ...mine]);
  if (writes.length) await syncAsterisk(env);
  if (mine.length) await nudgePbxIfChanged(env);
  return state(env, userId);
}

/** Body: an 8 kHz mono 16-bit WAV. ?name= labels it. The first greeting becomes the active one. */
export async function handleCreateGreeting(request: Request, env: Env, userId: number): Promise<Response> {
  const name = (new URL(request.url).searchParams.get("name") ?? "").trim().slice(0, 80) || "Greeting";
  const audio = new Uint8Array(await request.arrayBuffer());
  if (audio.length > MAX_BYTES) return Response.json({ error: "greeting too long (2 minutes max)" }, { status: 413 });
  const fmt = checkWav(audio);
  if (typeof fmt === "string") return Response.json({ error: fmt }, { status: 400 });
  const row = await env.DB.prepare("INSERT INTO greetings (name, audio, duration_ms, updated_at) VALUES (?1, ?2, ?3, ?4) RETURNING id")
    .bind(name, audio, fmt.durationMs, Date.now()).first<{ id: number }>();
  const s = await getSettings(env, ["vm_greeting"]);
  if (!s.vm_greeting && row) { await putSetting(env, "vm_greeting", String(row.id)).run(); await syncAsterisk(env); }
  return state(env, userId);
}

/** {name} */
export async function handleRenameGreeting(request: Request, env: Env, id: number, userId: number): Promise<Response> {
  let body: { name?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "invalid JSON" }, { status: 400 }); }
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  if (!name) return Response.json({ error: "name required" }, { status: 400 });
  // Not updated_at: that is the audio's version, and renaming shouldn't re-copy it.
  await env.DB.prepare("UPDATE greetings SET name = ?1 WHERE id = ?2").bind(name, id).run();
  return state(env, userId);
}

export async function handleDeleteGreeting(env: Env, id: number, userId: number): Promise<Response> {
  const s = await getSettings(env, ["vm_greeting"]);
  const active = s.vm_greeting === String(id);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM greetings WHERE id = ?1").bind(id),
    ...(active ? [putSetting(env, "vm_greeting", "")] : []),
  ]);
  if (active) await syncAsterisk(env);
  return state(env, userId);
}

export async function handleGreetingAudio(env: Env, id: number): Promise<Response> {
  const row = await env.DB.prepare("SELECT audio FROM greetings WHERE id = ?1").bind(id).first<{ audio: ArrayBuffer | number[] }>();
  if (!row) return new Response("Not found", { status: 404 });
  const bytes = Array.isArray(row.audio) ? new Uint8Array(row.audio) : new Uint8Array(row.audio);
  return new Response(bytes, { headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" } });
}

/** Plain text for greetings-sync.sh. */
export async function handleVoicemailSync(env: Env): Promise<Response> {
  const want = await wanted(env);
  const [id, ver] = want.greeting === "none" ? ["none", ""] : want.greeting.split("-");
  return new Response(`direct ${want.direct}\nmobile_first ${want.mobileFirst}\ngreeting ${id}${ver ? " " + ver : ""}\n`, { headers: { "Content-Type": "text/plain" } });
}

/** greetings-sync.sh reports what it applied: greeting=<id>-<version>|none, direct=0|1, mobile_first=0|1. */
export async function handleVoicemailSynced(request: Request, env: Env): Promise<Response> {
  const p = new URLSearchParams(await request.text());
  const applied = { greeting: p.get("greeting") || "none", direct: p.get("direct") === "1" ? "1" : "0", mobileFirst: p.get("mobile_first") === "1" ? "1" : "0" };
  await env.DB.batch([putSetting(env, "vm_applied", JSON.stringify(applied)), putSetting(env, "vm_applied_at", String(Date.now()))]);
  return Response.json({ ok: true });
}

/** The WAV's length, or why Asterisk can't play it as a plain .wav (8 kHz mono 16-bit PCM). */
function checkWav(b: Uint8Array): { durationMs: number } | string {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const tag = (at: number) => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);
  if (b.length < 44 || tag(0) !== "RIFF" || tag(8) !== "WAVE") return "not a WAV file";
  let pcm8k = false;
  for (let at = 12; at + 8 <= b.length;) {
    const size = view.getUint32(at + 4, true);
    if (tag(at) === "fmt ") {
      pcm8k = view.getUint16(at + 8, true) === 1 && view.getUint16(at + 10, true) === 1
        && view.getUint32(at + 12, true) === 8000 && view.getUint16(at + 22, true) === 16;
    }
    if (tag(at) === "data") {
      if (!pcm8k) return "WAV must be 8 kHz mono 16-bit PCM";
      const len = Math.min(size, b.length - at - 8);
      if (len < 1600) return "greeting is empty";
      return { durationMs: Math.round(len / 16) };
    }
    at += 8 + size + (size & 1);
  }
  return "WAV has no data";
}
