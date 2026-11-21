import type { Env, ExecutionContext } from "./types";
import { nudgePbxIfChanged } from "./pbxsync";
import { sendAlert } from "./alerts";

// ── Outgoing call limits (toll-fraud cap) ─────────────────────
// Every call the PBX places through the trunk (an extension dialling out,
// 📱 call via my mobile, forwards and mobile legs of ring groups and queues,
// the website callback) passes [pb-out-limit] first
// (asterisk/extensions-phone-bridge-routing.conf). It refuses the call,
// with "all circuits are busy", when one of these is reached (0 = no limit):
//   atOnce   outgoing calls in progress at once, all together
//   perExt   outgoing calls in progress at once from one extension
//   extHour  calls one extension may start in a clock hour
//   allHour  outgoing calls the PBX may start in a clock hour
// They live in D1 settings (call_limits) and reach the PBX as one GET
// /pbx/sync line, "limits <atOnce> <perExt> <extHour> <allHour>", which
// pbx-sync.sh keeps in astdb pbx/call_limits. Without it the dialplan uses
// DEFAULTS, so a PBX that can't reach the worker is still capped. MAX keeps a
// stolen session from switching the cap off: the highest each can be set to.
// A refused call is posted back as event=limit (noteLimitHit).

export interface CallLimits { atOnce: number; perExt: number; extHour: number; allHour: number }

const KEY = "call_limits";
const HITS = "call_limit_hits";
// Keep in step with the fallback in [pb-out-limit].
export const DEFAULTS: CallLimits = { atOnce: 10, perExt: 3, extHour: 40, allHour: 150 };
export const MAX: CallLimits = { atOnce: 30, perExt: 10, extHour: 300, allHour: 1000 };
const FIELDS = Object.keys(DEFAULTS) as (keyof CallLimits)[];

async function setting(env: Env, key: string): Promise<string> {
  return (await env.DB.prepare("SELECT value FROM settings WHERE key = ?1").bind(key).first<{ value: string }>())?.value ?? "";
}
function putSetting(env: Env, key: string, value: string) {
  return env.DB.prepare(
    "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at"
  ).bind(key, value, Date.now());
}

/** A whole number from 1 to MAX[k], else the default. 0 (no limit) is not
 *  allowed: it would switch the cap off. */
function clean(raw: Record<string, unknown>, k: keyof CallLimits): number {
  const n = Math.round(Number(raw[k]));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, MAX[k]) : DEFAULTS[k];
}

export async function callLimits(env: Env): Promise<CallLimits> {
  let raw: Record<string, unknown> = {};
  try { raw = JSON.parse(await setting(env, KEY) || "{}"); } catch { /* defaults */ }
  const out = { ...DEFAULTS };
  for (const k of FIELDS) out[k] = clean(raw, k);
  return out;
}

// ── Desk phone networks ───────────────────────────────────────
// Browser and app extensions (pb-webrtc) only ever reach the PBX through
// nginx's WebSocket proxy, so the PBX accepts them from 127.0.0.1 alone.
// Desk phones and SIP apps (pb-sip) connect straight over UDP, which is how
// ext 200 was hijacked: they are refused from everywhere except the
// networks listed here (IPv4 addresses or CIDR ranges, such as the office's
// public IP). An empty list means no desk phone can connect. Each becomes a
// "sipallow <cidr>" line for pbx-sync.sh, which adds it as a permit to every
// pb-sip endpoint.
const DESK = "desk_networks";
const DESK_MAX = 20;

/** "a.b.c.d" or "a.b.c.d/n" (n 8–32), normalised; null if not valid. */
export function cleanCidr(raw: string): string | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:\/(\d{1,2}))?$/.exec(raw.trim());
  if (!m) return null;
  const oct = m.slice(1, 5).map(Number);
  if (oct.some((o) => o > 255) || oct[0] === 0) return null;
  const bits = m[5] === undefined ? 32 : Number(m[5]);
  if (bits < 8 || bits > 32) return null;
  return oct.join(".") + (bits === 32 ? "" : "/" + bits);
}

export async function deskNetworks(env: Env): Promise<string[]> {
  try {
    const v = JSON.parse(await setting(env, DESK) || "[]");
    return Array.isArray(v) ? v.map((x) => cleanCidr(String(x))).filter((x): x is string => !!x).slice(0, DESK_MAX) : [];
  } catch { return []; }
}

/** The pbx-sync.sh lines. */
export async function limitSyncLines(env: Env): Promise<string[]> {
  const l = await callLimits(env);
  return [`limits ${l.atOnce} ${l.perExt} ${l.extHour} ${l.allHour}`, ...(await deskNetworks(env)).map((c) => `sipallow ${c}`)];
}

interface Hits { count: number; at: number; reason: string; ext: string }

/** GET /call-limits */
export async function handleGetCallLimits(env: Env): Promise<Response> {
  let hits: Hits | null = null;
  try { hits = JSON.parse(await setting(env, HITS) || "null"); } catch { /* none */ }
  return Response.json({ limits: await callLimits(env), defaults: DEFAULTS, max: MAX, hits, deskNetworks: await deskNetworks(env) });
}

/** POST /call-limits {atOnce, perExt, extHour, allHour, deskNetworks?: string[]} */
export async function handleSetCallLimits(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: "invalid JSON" }, { status: 400 }); }
  const out = { ...DEFAULTS };
  for (const k of FIELDS) {
    const n = Number(body[k]);
    if (!Number.isInteger(n) || n < 1 || n > MAX[k]) return Response.json({ error: `${k} must be a whole number from 1 to ${MAX[k]}` }, { status: 400 });
    out[k] = n;
  }
  const stmts = [putSetting(env, KEY, JSON.stringify(out))];
  let desk: string[] | undefined;
  if (body.deskNetworks !== undefined) {
    if (!Array.isArray(body.deskNetworks)) return Response.json({ error: "deskNetworks must be a list" }, { status: 400 });
    desk = [];
    for (const raw of body.deskNetworks) {
      const s = String(raw).trim();
      if (!s) continue;
      const c = cleanCidr(s);
      if (!c) return Response.json({ error: `"${s.slice(0, 40)}" isn't an IPv4 address or range like 81.2.3.4 or 81.2.3.0/24` }, { status: 400 });
      if (!desk.includes(c)) desk.push(c);
    }
    if (desk.length > DESK_MAX) return Response.json({ error: `At most ${DESK_MAX} networks` }, { status: 400 });
    stmts.push(putSetting(env, DESK, JSON.stringify(desk)));
  }
  await env.DB.batch(stmts);
  ctx.waitUntil(nudgePbxIfChanged(env));
  return Response.json({ ok: true, limits: out, deskNetworks: desk ?? await deskNetworks(env) });
}

const REASONS = new Set(["at_once", "ext_at_once", "ext_hour", "all_hour"]);
const REASON_TEXT: Record<string, string> = { at_once: "the limit on calls at once", ext_at_once: "the limit on calls at once from one extension", ext_hour: "the hourly limit for one extension", all_hour: "the hourly limit for all calls" };

/** event=limit from [pb-out-limit]: a call was refused. Kept as a count and
 *  the latest one, shown under Settings → Limits. */
export async function noteLimitHit(env: Env, params: URLSearchParams): Promise<void> {
  const reason = params.get("reason") ?? "";
  const ext = (params.get("ext") ?? "").replace(/\D/g, "").slice(0, 10);
  let hits: Hits | null = null;
  try { hits = JSON.parse(await setting(env, HITS) || "null"); } catch { /* none */ }
  const next: Hits = { count: (hits?.count ?? 0) + 1, at: Date.now(), reason: REASONS.has(reason) ? reason : "unknown", ext };
  console.warn("call limit reached:", next);
  await putSetting(env, HITS, JSON.stringify(next)).run();
  await sendAlert(env, `limit.${next.reason}:${ext}`, "Outgoing call refused at the call limits" + (ext ? " (ext " + ext + ")" : ""),
    "The PBX refused an outgoing call: " + (REASON_TEXT[next.reason] || next.reason) + " reached" + (ext ? " by extension " + ext : "") +
    ". " + next.count + " refused so far. If nobody expects this many calls, someone may be using a stolen password.");
}
