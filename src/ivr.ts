import type { Env } from "./types";
import { odooCall } from "./odoo";

// ── Opening hours and phone menus (IVR) from Odoo ─────────────
// Odoo's phone_bridge.number says how each of our numbers answers (ring, or
// a phone_bridge.menu) and, with a Working Schedule (resource.calendar plus
// its public holidays / closures), what happens out of hours. syncIvr copies
// it into D1 (settings pbx_ivr, one JSON document) with the rest of the
// extension sync; ivrSyncLines turns it into pbx-sync.sh lines. Prompts are
// text in Odoo: Workers AI speaks them (pbx_prompts, rendered on first
// GET /pbx/prompt/<hash>), and the PBX keeps a copy of each WAV file.

const TTS_MODEL = "@cf/deepgram/aura-1";
const VOICES = new Set(["angus", "asteria", "arcas", "orion", "orpheus", "athena", "luna", "zeus", "perseus", "helios", "hera", "stella"]);
const PHONE = /^[1-9]\d{6,14}$/;
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];   // Odoo dayofweek 0 = Monday
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const LEAVE_DAYS = 330;   // Asterisk time specs have no year: stay inside one

type Rec = Record<string, unknown>;
interface Action { kind: string; number?: string | null; menu?: number | null; exts?: string[]; secs?: number; team?: "all" | "each" }
interface Choice { name: string; about: string }
export interface Menu {
  id: number; prompt: string; voice: string; timeout: number; retries: number; direct: boolean; ringSecs: number;
  keys: Record<string, Action>; noinput: Action;
  /** Callers may say their choice (phone_bridge 0.11); names / about by key. */
  spoken?: boolean; names?: Record<string, Choice>;
  /** Played while this menu's keys ring (phone_bridge 0.13), then ringing tone. */
  ringPrompt?: string;
}
interface Hours { tz: string; open: string[]; shut: string[] }
interface NumberIvr { number: string; answer: "ring" | "menu"; menu: number | null; hours: Hours | null; closed: Action; closedPrompt: string | null; voice: string }
export interface Ivr { numbers: NumberIvr[]; menus: Menu[] }

const str = (v: unknown) => (typeof v === "string" ? v : null);
const id = (v: unknown) => (Array.isArray(v) ? v[0] as number : typeof v === "number" ? v : null);
const int = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);
const digits = (v: unknown) => str(v)?.replace(/\D/g, "") || null;
const voice = (v: unknown) => (typeof v === "string" && VOICES.has(v) ? v : "athena");
const clean = (v: unknown, max: number) => (str(v) ?? "").replace(/\s+/g, " ").trim().slice(0, max);

// ── Spoken menus: what the PBX says around the caller's answer ──
/** "sales, accounts or technical" */
function orList(names: string[]): string {
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}
/** Said when an answer wasn't understood, before the caller tries again. */
export function sorryText(m: Menu): string {
  const names = Object.keys(m.keys).sort().map((k) => m.names?.[k]?.name).filter((n): n is string => !!n);
  return names.length ? `Sorry, I didn't catch that. You can say ${orList(names)}, or press a key.` : "Sorry, I didn't catch that. Please press a key.";
}
/** Said when a spoken answer picked an option, so the caller knows where they're going. */
export function confirmText(name: string, a: Action): string {
  return a.kind === "ring" || a.kind === "forward" || a.kind === "salesperson" ? `Putting you through to ${name}.` : `${name}.`;
}
/** Every extra prompt a spoken menu needs. */
function spokenTexts(m: Menu): string[] {
  if (!m.spoken) return [];
  const out = [sorryText(m)];
  for (const [k, c] of Object.entries(m.names ?? {})) if (c.name && m.keys[k]) out.push(confirmText(c.name, m.keys[k]));
  return out;
}

/** One menu from the synced copy (for POST /pbx/say). */
export async function storedMenu(env: Env, menuId: number): Promise<Menu | null> {
  const raw = (await env.DB.prepare("SELECT value FROM settings WHERE key = 'pbx_ivr'").first<{ value: string }>())?.value;
  if (!raw) return null;
  try { return (JSON.parse(raw) as Ivr).menus.find((m) => m.id === menuId) ?? null; } catch { return null; }
}

// A "while ringing" prompt is stored with voice "<voice>:ring": its WAV is the
// speech followed by RING_SECS of UK ringing tone, played on a loop by the
// PBX's music on hold while the phones ring.
const RING = ":ring";
const RING_SECS = 30;
const ringVoice = (v: string) => v + RING;

/** sha256(voice, text) → 16 hex: the prompt's file name on the PBX. */
export async function promptHash(voiceName: string, text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(voiceName + "\n" + text));
  return [...new Uint8Array(d)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function validTz(tz: unknown): string {
  if (typeof tz !== "string" || !/^[A-Za-z0-9_+\/-]{1,64}$/.test(tz)) return "UTC";
  try { new Intl.DateTimeFormat("en-GB", { timeZone: tz }); return tz; } catch { return "UTC"; }
}

const hhmm = (h: number) => {
  const m = Math.min(23 * 60 + 59, Math.max(0, Math.round(h * 60)));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** A UTC "YYYY-MM-DD HH:MM:SS" (Odoo) in the calendar's time zone. */
function local(utc: string, tz: string): { y: number; m: number; d: number; min: number } | null {
  const t = Date.parse(utc.replace(" ", "T") + "Z");
  if (!Number.isFinite(t)) return null;
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, min: +p.hour * 60 + +p.minute };
}

/** Asterisk IFTIME specs (times,weekdays,mdays,months; the zone goes
 *  separately) for a calendar's working hours and its closures. Lunch
 *  breaks (day_period lunch) are not working time, as in Odoo. */
export function hoursSpecs(tz: string, attendances: Rec[], leaves: Rec[]): Hours {
  const open = new Set<string>();
  for (const a of attendances) {
    if (a.display_type || a.day_period === "lunch") continue;
    const dow = Number(a.dayofweek);
    const from = Number(a.hour_from), to = Number(a.hour_to);
    if (!(dow >= 0 && dow <= 6) || !(to > from)) continue;
    open.add(`${hhmm(from)}-${to >= 24 ? "23:59" : hhmm(to)},${DAYS[dow]},*,*`);
  }
  const shut = new Set<string>();
  for (const l of leaves) {
    const a = local(str(l.date_from) ?? "", tz), b = local(str(l.date_to) ?? "", tz);
    if (!a || !b) continue;
    let day = Date.UTC(a.y, a.m - 1, a.d);
    const last = Date.UTC(b.y, b.m - 1, b.d);
    for (let n = 0; day <= last && n < 62; n++, day += 86_400_000) {
      const dt = new Date(day);
      const from = day === Date.UTC(a.y, a.m - 1, a.d) ? a.min : 0;
      const to = day === last ? b.min : 23 * 60 + 59;
      if (to <= from) continue;
      shut.add(`${hhmm(from / 60)}-${hhmm(to / 60)},*,${dt.getUTCDate()},${MONTHS[dt.getUTCMonth()]}`);
    }
  }
  return { tz, open: [...open].sort(), shut: [...shut].sort() };
}

function action(kind: unknown, number: unknown, menu: unknown, exts: string[], secs: number, team?: unknown): Action {
  const k = str(kind) ?? "voicemail";
  if (k === "salesperson") return { kind: "salesperson", exts, secs, team: team === "each" ? "each" : "all" };
  if (k === "forward") return { kind: "forward", number: digits(number) };
  if (k === "menu") return { kind: "menu", menu: id(menu) };
  if (k === "ring") return { kind: "ring", exts, secs };
  if (k === "hangup" || k === "repeat") return { kind: k };
  return { kind: "voicemail" };
}

/** Read the menus, the numbers' answer / hours settings and the calendars
 *  they use from Odoo. Statements for the sync's D1 batch, or null when Odoo
 *  refused (addon before 0.9: no menus; the stored copy is left alone). */
export async function syncIvr(env: Env, uid: number, numberOfExt: Map<number, string>): Promise<Array<ReturnType<Env["DB"]["prepare"]>> | null> {
  const sr = (model: string, domain: unknown[], fields: string[]) => odooCall(env, uid, model, "search_read", [domain], { fields });
  const menuFields = ["prompt", "voice", "timeout", "retries", "direct_dial", "ring_seconds", "noinput_action", "noinput_extension_ids", "noinput_number", "noinput_menu_id"];
  const optFields = ["menu_id", "key", "action", "extension_ids", "number", "submenu_id"];
  const nr = await sr("phone_bridge.number", [], ["number", "answer", "menu_id", "calendar_id", "closed_action", "closed_number", "closed_menu_id", "closed_message", "voice"]);
  // Newest addon first; older ones lack the later fields (0.13 ring_prompt,
  // 0.12 team_ring, 0.11 spoken menus), so fall back a step at a time.
  let mr = nr, or = nr;
  for (const [mf, of] of [
    [[...menuFields, "spoken", "ring_prompt"], [...optFields, "name", "description", "team_ring"]],
    [[...menuFields, "spoken"], [...optFields, "name", "description", "team_ring"]],
    [[...menuFields, "spoken"], [...optFields, "name", "description"]],
    [menuFields, optFields],
  ]) {
    [mr, or] = await Promise.all([sr("phone_bridge.menu", [], mf), sr("phone_bridge.menu.option", [], of)]);
    if (!mr.fault && !or.fault) break;
  }
  if (nr.fault || mr.fault || or.fault) {
    console.warn("Odoo phone menus / hours not read; left as they were:", String(nr.fault || mr.fault || or.fault).slice(-300));
    return null;
  }
  const exts = (v: unknown) => (Array.isArray(v) ? v as number[] : []).map((i) => numberOfExt.get(i)).filter((x): x is string => !!x).sort();
  const nums = (nr.parsed ?? []) as Rec[];
  const calIds = [...new Set(nums.map((n) => id(n.calendar_id)).filter((x): x is number => !!x))];
  const cals = new Map<number, Hours>();
  if (calIds.length) {
    const now = new Date();
    const fmt = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");
    const [cr, ar, lr] = await Promise.all([
      odooCall(env, uid, "resource.calendar", "read", [calIds], { fields: ["tz"] }),
      sr("resource.calendar.attendance", [["calendar_id", "in", calIds]], ["calendar_id", "dayofweek", "hour_from", "hour_to", "day_period", "display_type"]),
      sr("resource.calendar.leaves", [["resource_id", "=", false], ["date_to", ">=", fmt(now)],
        ["date_from", "<=", fmt(new Date(now.getTime() + LEAVE_DAYS * 86_400_000))],
        "|", ["calendar_id", "in", calIds], ["calendar_id", "=", false]], ["calendar_id", "date_from", "date_to"]),
    ]);
    if (cr.fault || ar.fault || lr.fault) {
      console.warn("Odoo working schedules not read; left as they were:", String(cr.fault || ar.fault || lr.fault).slice(-300));
      return null;
    }
    for (const c of (cr.parsed ?? []) as Rec[]) {
      const cid = c.id as number;
      cals.set(cid, hoursSpecs(validTz(c.tz),
        ((ar.parsed ?? []) as Rec[]).filter((a) => id(a.calendar_id) === cid),
        ((lr.parsed ?? []) as Rec[]).filter((l) => !id(l.calendar_id) || id(l.calendar_id) === cid)));
    }
  }
  const opts = (or.parsed ?? []) as Rec[];
  const menus: Menu[] = ((mr.parsed ?? []) as Rec[]).map((m) => {
    const ringSecs = int(m.ring_seconds, 5, 300, 30);
    const keys: Record<string, Action> = {};
    const names: Record<string, Choice> = {};
    for (const o of opts) {
      if (id(o.menu_id) !== m.id) continue;
      const k = str(o.key);
      if (!k || !/^[0-9*#]$/.test(k)) continue;
      keys[k] = action(o.action, o.number, o.submenu_id, exts(o.extension_ids), ringSecs, o.team_ring);
      const name = clean(o.name, 60), about = clean(o.description, 500);
      if (name || about) names[k] = { name, about };
    }
    return {
      id: m.id as number, prompt: (str(m.prompt) ?? "").trim().slice(0, 1000), voice: voice(m.voice),
      timeout: int(m.timeout, 1, 30, 5), retries: int(m.retries, 0, 5, 2), direct: !!m.direct_dial, ringSecs, keys,
      noinput: action(m.noinput_action, m.noinput_number, m.noinput_menu_id, exts(m.noinput_extension_ids), ringSecs),
      spoken: m.spoken === true && Object.keys(names).length > 0, names,
      ringPrompt: clean(m.ring_prompt, 300) || undefined,
    };
  });
  const numbers: NumberIvr[] = [];
  for (const n of nums) {
    const num = digits(n.number);
    if (!num) continue;
    const cal = id(n.calendar_id);
    numbers.push({
      number: num, answer: n.answer === "menu" ? "menu" : "ring", menu: id(n.menu_id),
      hours: cal ? cals.get(cal) ?? null : null,
      closed: action(n.closed_action, n.closed_number, n.closed_menu_id, [], 0),
      closedPrompt: cal ? (str(n.closed_message) ?? "").trim().slice(0, 1000) || null : null,
      voice: voice(n.voice),
    });
  }
  const ivr: Ivr = { numbers, menus };
  // The prompts to speak: text and voice by hash (the audio comes later).
  const prompts = new Map<string, [string, string]>();
  for (const m of menus) {
    if (m.prompt) prompts.set(await promptHash(m.voice, m.prompt), [m.voice, m.prompt]);
    for (const t of spokenTexts(m)) prompts.set(await promptHash(m.voice, t), [m.voice, t]);
    if (m.ringPrompt) prompts.set(await promptHash(ringVoice(m.voice), m.ringPrompt), [ringVoice(m.voice), m.ringPrompt]);
  }
  for (const n of numbers) if (n.closedPrompt) prompts.set(await promptHash(n.voice, n.closedPrompt), [n.voice, n.closedPrompt]);
  const now = Date.now();
  const stmts = [
    env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('pbx_ivr', ?1, ?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at")
      .bind(JSON.stringify(ivr), now),
    env.DB.prepare("DELETE FROM pbx_prompts WHERE hash NOT IN (SELECT value FROM json_each(?1))").bind(JSON.stringify([...prompts.keys()])),
  ];
  for (const [hash, [v, text]] of prompts) {
    stmts.push(env.DB.prepare("INSERT OR IGNORE INTO pbx_prompts (hash, voice, text, created_at) VALUES (?1, ?2, ?3, ?4)").bind(hash, v, text, now));
  }
  return stmts;
}

/** pbx-sync.sh lines for the menus and hours (after the route lines):
 *    when <our number> <ring|menu<id>> <out of hours action|-> <prompt|->
 *    hours <our number> <time zone> <open|shut> <IFTIME spec>
 *    menu <id> <prompt|-> <key timeout> <retries> <direct dial 0|1> <spoken 0|1> <sorry prompt|-> <while ringing prompt|->
 *    key <menu id> <0-9, s (*), h (#), t (no key)> <action> <spoken confirmation prompt|->
 *    prompt <hash>
 *  Actions: vm, hangup, repeat, fwd<number>, menu<id>, ring<secs>:<legs|->,
 *  owner<secs>:<all|each>:<team legs|-> (keys only: the caller's salesperson,
 *  found by GET /pbx/owner at call time, then the team)
 *  (legs as on route lines). A number with no "when" line just rings; one
 *  with no open hours is always open. legsOf turns extensions into legs
 *  (📼, forwarding and the app as for a route). Only numbers with a route
 *  line (routed) get one: [pb-route] reads the route first. */
export async function ivrSyncLines(env: Env, routed: Set<string>, legsOf: (exts: string[]) => string[]): Promise<string[]> {
  const raw = (await env.DB.prepare("SELECT value FROM settings WHERE key = 'pbx_ivr'").first<{ value: string }>())?.value;
  if (!raw) return [];
  let ivr: Ivr;
  try { ivr = JSON.parse(raw); } catch { return []; }
  const menuIds = new Set(ivr.menus.map((m) => m.id));
  const act = (a: Action, inMenu: boolean): string => {
    if (a.kind === "forward") return a.number && PHONE.test(a.number) ? `fwd${a.number}` : "vm";
    if (a.kind === "menu") return a.menu && menuIds.has(a.menu) ? `menu${a.menu}` : "vm";
    if (a.kind === "ring") return `ring${a.secs ?? 30}:${legsOf(a.exts ?? []).join(",") || "-"}`;
    if (a.kind === "salesperson") return inMenu ? `owner${a.secs ?? 30}:${a.team === "each" ? "each" : "all"}:${legsOf(a.exts ?? []).join(",") || "-"}` : "vm";
    if (a.kind === "hangup") return "hangup";
    if (a.kind === "repeat" && inMenu) return "repeat";
    return "vm";
  };
  const lines: string[] = [];
  const prompts = new Set<string>();
  for (const n of ivr.numbers) {
    if (!routed.has(n.number)) continue;
    const day = n.answer === "menu" && n.menu && menuIds.has(n.menu) ? `menu${n.menu}` : "ring";
    if (day === "ring" && !n.hours) continue;
    let np = "-";
    if (n.hours && n.closedPrompt) { np = await promptHash(n.voice, n.closedPrompt); prompts.add(np); }
    lines.push(`when ${n.number} ${day} ${n.hours ? act(n.closed, false) : "-"} ${np}`);
    if (n.hours) {
      for (const s of n.hours.open) lines.push(`hours ${n.number} ${n.hours.tz} open ${s}`);
      for (const s of n.hours.shut) lines.push(`hours ${n.number} ${n.hours.tz} shut ${s}`);
    }
  }
  const KEY: Record<string, string> = { "*": "s", "#": "h" };
  for (const m of ivr.menus) {
    let p = "-";
    if (m.prompt) { p = await promptHash(m.voice, m.prompt); prompts.add(p); }
    let sorry = "-";
    if (m.spoken) { sorry = await promptHash(m.voice, sorryText(m)); prompts.add(sorry); }
    let ring = "-";
    if (m.ringPrompt) { ring = await promptHash(ringVoice(m.voice), m.ringPrompt); prompts.add(ring); }
    lines.push(`menu ${m.id} ${p} ${m.timeout} ${m.retries} ${m.direct ? 1 : 0} ${m.spoken ? 1 : 0} ${sorry} ${ring}`);
    for (const [k, a] of Object.entries(m.keys).sort()) {
      let c = "-";
      const name = m.names?.[k]?.name;
      if (m.spoken && name) { c = await promptHash(m.voice, confirmText(name, a)); prompts.add(c); }
      lines.push(`key ${m.id} ${KEY[k] ?? k} ${act(a, true)} ${c}`);
    }
    lines.push(`key ${m.id} t ${act(m.noinput, false)}`);
  }
  for (const h of [...prompts].sort()) lines.push(`prompt ${h}`);
  return lines;
}

/** 8 kHz 16-bit mono PCM as a WAV file (what Asterisk's format_wav plays). */
function wav(pcm: Uint8Array, rate = 8000): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(44 + pcm.length);
  const v = new DataView(out.buffer);
  const s = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  s(0, "RIFF"); v.setUint32(4, 36 + pcm.length, true); s(8, "WAVE");
  s(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  s(36, "data"); v.setUint32(40, pcm.length, true);
  out.set(pcm, 44);
  return out;
}

async function bytesOf(out: unknown): Promise<Uint8Array> {
  if (out instanceof Uint8Array) return out;
  if (out instanceof ArrayBuffer) return new Uint8Array(out);
  if (out instanceof Response) return new Uint8Array(await out.arrayBuffer());
  if (out && typeof (out as ReadableStream).getReader === "function") return new Uint8Array(await new Response(out as ReadableStream).arrayBuffer());
  const b64 = (out as { audio?: string })?.audio;
  if (typeof b64 === "string") return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  throw new Error("text to speech gave no audio");
}

/** Raw PCM: if the model sent a WAV file after all, take its data chunk. */
function pcmOf(b: Uint8Array): Uint8Array {
  const tag = (o: number) => String.fromCharCode(...b.subarray(o, o + 4));
  if (b.length < 12 || tag(0) !== "RIFF") return b.length % 2 ? b.subarray(0, b.length - 1) : b;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  for (let o = 12; o + 8 <= b.length;) {
    const size = v.getUint32(o + 4, true);
    if (tag(o) === "data") { const d = b.subarray(o + 8, Math.min(b.length, o + 8 + size)); return d.length % 2 ? d.subarray(0, d.length - 1) : d; }
    o += 8 + size + (size % 2);
  }
  return new Uint8Array(0);
}

/** UK ringing tone (400 + 450 Hz; 0.4 s on, 0.2 off, 0.4 on, 2 off) as 8 kHz PCM. */
export function ringTone(secs: number, rate = 8000): Uint8Array {
  const n = Math.round(secs * rate), out = new Uint8Array(n * 2), v = new DataView(out.buffer);
  for (let i = 0; i < n; i++) {
    const t = i / rate, c = t % 3;
    const on = c < 0.4 || (c >= 0.6 && c < 1.0);
    const s = on ? 0.2 * (Math.sin(2 * Math.PI * 400 * t) + Math.sin(2 * Math.PI * 450 * t)) : 0;
    v.setInt16(i * 2, Math.round(s * 32767), true);
  }
  return out;
}

/** Speech, half a second's pause, then RING_SECS of ringing tone. */
async function speakThenRing(env: Env, voiceName: string, text: string): Promise<Uint8Array<ArrayBuffer>> {
  const speech = await speakPcm(env, voiceName, text);
  const gap = new Uint8Array(8000), ring = ringTone(RING_SECS);
  const pcm = new Uint8Array(speech.length + gap.length + ring.length);
  pcm.set(speech); pcm.set(gap, speech.length); pcm.set(ring, speech.length + gap.length);
  return wav(pcm);
}

async function speakPcm(env: Env, voiceName: string, text: string): Promise<Uint8Array> {
  const out = await env.AI.run(TTS_MODEL, { text, speaker: voice(voiceName), encoding: "linear16", container: "none", sample_rate: 8000 });
  const pcm = pcmOf(await bytesOf(out));
  if (pcm.length < 1600) throw new Error(`text to speech gave ${pcm.length} bytes`);
  return pcm;
}

export async function speak(env: Env, voiceName: string, text: string): Promise<Uint8Array<ArrayBuffer>> {
  return wav(await speakPcm(env, voiceName, text));
}

/** GET /pbx/prompt/<hash> (PBX secret only): the prompt as a WAV file,
 *  spoken on first request and kept. */
export async function handlePbxPrompt(env: Env, hash: string): Promise<Response> {
  if (!/^[0-9a-f]{16}$/.test(hash)) return new Response("bad prompt\n", { status: 400 });
  const row = await env.DB.prepare("SELECT voice, text, audio FROM pbx_prompts WHERE hash = ?1").bind(hash).first<{ voice: string; text: string; audio: ArrayBuffer | null }>();
  if (!row) return new Response("no such prompt\n", { status: 404 });
  let audio: Uint8Array<ArrayBuffer> | null = row.audio ? new Uint8Array(row.audio) : null;
  if (!audio || !audio.length) {
    try {
      audio = row.voice.endsWith(RING) ? await speakThenRing(env, row.voice.slice(0, -RING.length), row.text) : await speak(env, row.voice, row.text);
    }
    catch (e) { console.error("prompt", hash, "text to speech failed:", e); return new Response("text to speech failed\n", { status: 502 }); }
    await env.DB.prepare("UPDATE pbx_prompts SET audio = ?1 WHERE hash = ?2").bind(audio, hash).run();
  }
  return new Response(audio, { headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" } });
}
