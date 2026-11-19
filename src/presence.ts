import type { Env } from "./types";

// ── Presence: who is free before you transfer ─────────────────
// GET /presence lists every active extension (D1 extensions, from Odoo)
// with its owner and what Asterisk says about it right now, over ARI:
//   busy     a PJSIP/<ext> channel is up, or is calling out
//   ringing  a call is ringing it
//   free     registered (signed in on a softphone or desk phone), no calls
//   app      not registered, but it uses the Android app, which a push
//            wakes when it's called ([wake-phone]), so it will still ring
//   offline  not registered anywhere
// Calls on the phone's SIM and 📱 calls via a mobile aren't seen: they
// don't go through the extension's own channel.
// The dashboard polls it while the transfer panel is open; ARI is asked at
// most once per CACHE_MS however many people are polling.

export type PresenceState = "busy" | "ringing" | "free" | "app" | "offline";
export interface Presence { ext: string; name: string; state: PresenceState; since: number | null }

interface AriEndpoint { resource: string; state?: string; channel_ids?: string[] }
interface AriChannel { name?: string; state?: string; creationtime?: string }

const CACHE_MS = 2000;
let cache: { at: number; list: Presence[] } | null = null;

function ari(env: Env, path: string) {
  return fetch(`${env.ASTERISK_URL}/ari/${path}`, {
    headers: { Authorization: `Basic ${btoa(`${env.ASTERISK_USER}:${env.ASTERISK_PASS}`)}` },
    signal: AbortSignal.timeout(4000),
  }).then((r) => {
    if (!r.ok) throw new Error(`ARI ${path}: ${r.status}`);
    return r.json();
  });
}

// Channel states that mean the phone is in use, rather than being rung.
const IN_USE = new Set(["Up", "Ring", "Dialing", "Busy", "Pre-ring", "Offhook", "Dialing Offhook"]);

export async function presence(env: Env): Promise<Presence[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.list;
  const [exts, endpoints, channels] = await Promise.all([
    env.DB.prepare("SELECT number, COALESCE(NULLIF(user_name, ''), name, '') AS name, wake_app FROM extensions WHERE active = 1 ORDER BY number")
      .all<{ number: string; name: string; wake_app: number | null }>().then((r) => r.results ?? []),
    ari(env, "endpoints/PJSIP") as Promise<AriEndpoint[]>,
    ari(env, "channels") as Promise<AriChannel[]>,
  ]);
  const online = new Set(endpoints.filter((e) => e.state === "online").map((e) => e.resource));
  // PJSIP/<ext>-<id> → the extension's channels.
  const byExt = new Map<string, AriChannel[]>();
  for (const ch of channels) {
    const m = /^PJSIP\/([^-]+)-/.exec(ch.name ?? "");
    if (m) byExt.set(m[1], [...(byExt.get(m[1]) ?? []), ch]);
  }
  const list = exts.map((e): Presence => {
    const chans = byExt.get(e.number) ?? [];
    const busy = chans.filter((c) => IN_USE.has(c.state ?? ""));
    const state: PresenceState = busy.length ? "busy"
      : chans.length ? "ringing"
      : online.has(e.number) ? "free"
      : e.wake_app ? "app" : "offline";
    // How long the current call has gone on (its oldest channel).
    const times = (busy.length ? busy : chans).map((c) => Date.parse(c.creationtime ?? "")).filter((t) => Number.isFinite(t));
    return { ext: e.number, name: e.name, state, since: times.length ? Math.min(...times) : null };
  });
  cache = { at: Date.now(), list };
  return list;
}

/** GET /presence */
export async function handlePresence(env: Env): Promise<Response> {
  try { return Response.json({ presence: await presence(env) }, { headers: { "Cache-Control": "no-store" } }); }
  catch (e) { return Response.json({ error: String((e as Error).message || e), presence: [] }, { status: 502 }); }
}
