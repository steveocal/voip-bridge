import type { Env } from "./types";
import { odooAuth, odooCall } from "./odoo";

// ── Users ─────────────────────────────────────────────────────
// Every extension belongs to an Odoo user (Odoo phone_bridge.extension
// .user_id). A dashboard or app signs in with its SIP extension and password,
// checked against that record, and gets a session token naming the user,
// which it sends as "Authorization: Bearer …" (the page calls the API on
// another host, so a cookie wouldn't travel).
// Calls, activities, settings, favourites and the Google account are then
// that user's. Contacts stay shared.

export interface User {
  id: number;          // res.users.id
  name: string;
  ext: string;         // the extension this session signed in as
  service?: boolean;   // the Odoo addon (API_TOKEN); id 0 = acting for nobody in particular
}

export interface ExtensionOwner {
  user_id: number | null;
  user_name: string;
  user_email: string;
}

// ── Extension → user map (D1 copy of Odoo's) ──────────────────

const OWNERS_TTL_MS = 5 * 60_000;
let ownersCache: { at: number; map: Map<string, ExtensionOwner> } | null = null;

/** Pull phone_bridge.extension from Odoo into D1, and give logged legs with
 *  an extension but no user their owner. Returns the extension count, or
 *  null when Odoo can't be reached. */
export async function syncExtensions(env: Env): Promise<number | null> {
  const uid = await odooAuth(env);
  if (!uid) return null;
  const r = await odooCall(env, uid, "phone_bridge.extension", "search_read", [[]], { fields: ["number", "user_id"], context: { active_test: false } });
  if (r.fault) { console.error("Odoo extensions read failed:", r.fault); return null; }
  const exts = (r.parsed ?? []) as Array<Record<string, unknown>>;
  const userIds = [...new Set(exts.map(e => Array.isArray(e.user_id) ? e.user_id[0] as number : 0).filter(Boolean))];
  const emails = new Map<number, string>();
  if (userIds.length) {
    const u = await odooCall(env, uid, "res.users", "read", [userIds], { fields: ["email", "login"] });
    for (const row of (u.parsed ?? []) as Array<Record<string, unknown>>) emails.set(row.id as number, String(row.email || row.login || ""));
  }
  const now = Date.now();
  const stmts = [env.DB.prepare("DELETE FROM extensions")];
  for (const e of exts) {
    const userId = Array.isArray(e.user_id) ? e.user_id[0] as number : null;
    stmts.push(env.DB.prepare("INSERT OR REPLACE INTO extensions (number, user_id, user_name, user_email, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)")
      .bind(String(e.number), userId, Array.isArray(e.user_id) ? String(e.user_id[1]) : "", userId ? emails.get(userId) ?? "" : "", now));
  }
  stmts.push(env.DB.prepare(
    "UPDATE call_log SET user_id = (SELECT x.user_id FROM extensions x WHERE x.number = call_log.extension) WHERE user_id IS NULL AND extension IS NOT NULL"
  ));
  await env.DB.batch(stmts);
  ownersCache = null;
  return exts.length;
}

/** extension number → owner, from D1 (synced from Odoo when stale). */
export async function extensionOwners(env: Env): Promise<Map<string, ExtensionOwner>> {
  if (ownersCache && Date.now() - ownersCache.at < 60_000) return ownersCache.map;
  let rows = (await env.DB.prepare("SELECT number, user_id, user_name, user_email, updated_at FROM extensions").all<Record<string, unknown>>()).results ?? [];
  const oldest = rows.reduce((m, r) => Math.min(m, Number(r.updated_at) || 0), rows.length ? Infinity : 0);
  if (Date.now() - oldest > OWNERS_TTL_MS && await syncExtensions(env) !== null) {
    rows = (await env.DB.prepare("SELECT number, user_id, user_name, user_email FROM extensions").all<Record<string, unknown>>()).results ?? [];
  }
  const map = new Map<string, ExtensionOwner>();
  for (const r of rows) map.set(String(r.number), { user_id: (r.user_id as number) ?? null, user_name: String(r.user_name || ""), user_email: String(r.user_email || "") });
  ownersCache = { at: Date.now(), map };
  return map;
}

export async function extensionUser(env: Env, ext: string | null | undefined): Promise<number | null> {
  if (!ext) return null;
  return (await extensionOwners(env)).get(ext)?.user_id ?? null;
}

export async function userEmail(env: Env, userId: number): Promise<string> {
  for (const o of (await extensionOwners(env)).values()) if (o.user_id === userId && o.user_email) return o.user_email;
  return "";
}

// ── Sessions: "s.<uid>.<ext>.<expiry>.<hmac>" ──────────────────

const SESSION_DAYS = 30;

// SESSION_SECRET, or failing that one derived from the staff-token secret
// (prefixed, so a staff token can never pass as a session or vice versa).
function sessionKey(env: Env): string {
  return env.SESSION_SECRET || (env.STAFF_TOKEN_SECRET ? "vb-session:" + env.STAFF_TOKEN_SECRET : "");
}

async function hmacHex(env: Env, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(sessionKey(env)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/** Compares digests rather than the strings, so timing says nothing about
 *  how much of a guess was right. */
export async function same(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([sha256Hex(a), sha256Hex(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

/** A signed value that only this worker can make, e.g. the Google sign-in
 *  `state`. */
export async function signed(env: Env, payload: string): Promise<string> {
  return `${payload}.${await hmacHex(env, payload)}`;
}

export async function unsign(env: Env, value: string): Promise<string | null> {
  const at = value.lastIndexOf(".");
  if (at < 0 || !sessionKey(env)) return null;
  const payload = value.slice(0, at);
  return await same(value.slice(at + 1), await hmacHex(env, payload)) ? payload : null;
}

const userNames = new Map<number, string>();

/** The signed-in user, from a session token or the Odoo addon's API token
 *  (Authorization: Bearer API_TOKEN, X-Odoo-User: <res.users id>). Page
 *  loads that can't set a header (/google/connect) pass ?session=. */
export async function sessionUser(request: Request, env: Env): Promise<User | null> {
  const bearer = /^Bearer (.+)$/.exec(request.headers.get("Authorization") || "")?.[1]
    || (request.method === "GET" ? new URL(request.url).searchParams.get("session") : null);
  if (!bearer) return null;
  if (env.API_TOKEN && await same(bearer, env.API_TOKEN)) {
    const id = parseInt(request.headers.get("X-Odoo-User") || "0", 10);
    return { id, name: "", ext: "", service: true };
  }
  const payload = await unsign(env, bearer);
  if (!payload) return null;
  const [kind, uid, ext, exp] = payload.split(".");
  if (kind !== "s" || !uid || Number(exp) < Date.now()) return null;
  const id = parseInt(uid, 10);
  return { id, name: userNames.get(id) ?? "", ext };
}

// ── Sign-in with the SIP extension's own password ─────────────

function sessionToken(env: Env, userId: number, ext: string): Promise<string> {
  return signed(env, `s.${userId}.${ext}.${Date.now() + SESSION_DAYS * 86400_000}`);
}

export async function handleLogin(request: Request, env: Env): Promise<Response> {
  if (!sessionKey(env)) return Response.json({ error: "SESSION_SECRET is not set on the worker" }, { status: 503 });
  let body: { ext?: string; password?: string };
  try { body = await request.json(); } catch { return Response.json({ error: "invalid JSON" }, { status: 400 }); }
  const ext = String(body.ext ?? "").trim();
  const password = String(body.password ?? "");
  if (!ext || !password) return Response.json({ error: "extension and password required" }, { status: 400 });
  const uid = await odooAuth(env);
  if (!uid) return Response.json({ error: "Odoo unavailable" }, { status: 502 });
  const r = await odooCall(env, uid, "phone_bridge.extension", "search_read",
    [[["number", "=", ext], ["active", "=", true]]], { fields: ["user_id", "sip_password"], limit: 1 });
  if (r.fault) return Response.json({ error: "Odoo extensions unavailable" }, { status: 502 });
  const rec = ((r.parsed ?? []) as Array<Record<string, unknown>>)[0];
  if (!rec) return Response.json({ error: `Extension ${ext} isn't set up in Odoo (Phone → Extensions)` }, { status: 403 });
  if (!rec.sip_password) return Response.json({ error: `Extension ${ext} has no SIP password in Odoo` }, { status: 403 });
  if (!Array.isArray(rec.user_id)) return Response.json({ error: `Extension ${ext} has no user in Odoo` }, { status: 403 });
  if (!(await same(password, String(rec.sip_password)))) return Response.json({ error: "Wrong password for this extension" }, { status: 403 });
  const user: User = { id: rec.user_id[0] as number, name: String(rec.user_id[1]), ext };
  userNames.set(user.id, user.name);
  return Response.json({ ok: true, user, token: await sessionToken(env, user.id, ext) });
}

export async function handleMe(request: Request, env: Env): Promise<Response> {
  const user = await sessionUser(request, env);
  if (!user) return Response.json({ user: null });
  if (!user.name) {
    for (const o of (await extensionOwners(env)).values()) if (o.user_id === user.id) { user.name = o.user_name; break; }
  }
  return Response.json({ user });
}

// ── Which calls a user sees ───────────────────────────────────
// A call belongs to the user whose extension made or answered it. Calls
// nobody answered (missed, main-line voicemail) belong to no one and show to
// everybody; so do legs logged before extensions were recorded.

type Leg = Record<string, unknown>;

export function callOwner(legs: Leg[], owners: Map<string, ExtensionOwner>): number | null {
  const took = legs[0]?.direction === "outgoing"
    ? legs[0]
    : legs.find(l => !l.did && (l.state === "terminated" || l.state === "ongoing"));
  if (!took) return null;
  if (took.user_id) return Number(took.user_id);
  return took.extension ? owners.get(String(took.extension))?.user_id ?? null : null;
}

export function canSee(legs: Leg[], owners: Map<string, ExtensionOwner>, viewer: User): boolean {
  if (viewer.service && !viewer.id) return true;
  const owner = callOwner(legs, owners);
  return owner === null || owner === viewer.id;
}
