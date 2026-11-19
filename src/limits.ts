import type { Env, ExecutionContext } from "./types";
import { nudgePbxIfChanged } from "./pbxsync";

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

/** The pbx-sync.sh line. */
export async function limitSyncLines(env: Env): Promise<string[]> {
  const l = await callLimits(env);
  return [`limits ${l.atOnce} ${l.perExt} ${l.extHour} ${l.allHour}`];
}

interface Hits { count: number; at: number; reason: string; ext: string }

/** GET /call-limits */
export async function handleGetCallLimits(env: Env): Promise<Response> {
  let hits: Hits | null = null;
  try { hits = JSON.parse(await setting(env, HITS) || "null"); } catch { /* none */ }
  return Response.json({ limits: await callLimits(env), defaults: DEFAULTS, max: MAX, hits });
}

/** POST /call-limits {atOnce, perExt, extHour, allHour} */
export async function handleSetCallLimits(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: "invalid JSON" }, { status: 400 }); }
  const out = { ...DEFAULTS };
  for (const k of FIELDS) {
    const n = Number(body[k]);
    if (!Number.isInteger(n) || n < 1 || n > MAX[k]) return Response.json({ error: `${k} must be a whole number from 1 to ${MAX[k]}` }, { status: 400 });
    out[k] = n;
  }
  await putSetting(env, KEY, JSON.stringify(out)).run();
  ctx.waitUntil(nudgePbxIfChanged(env));
  return Response.json({ ok: true, limits: out });
}

const REASONS = new Set(["at_once", "ext_at_once", "ext_hour", "all_hour"]);

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
}
