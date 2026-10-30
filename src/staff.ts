import type { Env } from "./types";
import { odooAuth, odooCall } from "./odoo";

// ── Staff location tracking ───────────────────────────────────
// The Android app signs an employee in (hr.employee + their Attendances PIN),
// keeps the token this hands back, and posts a location every 15 minutes.
// Odoo's staff_location module (odoo/staff_location) turns the readings into
// stops, contact matches and customer meetings; this only checks who's who.

const MAX_FAILURES = 5;            // wrong PINs per employee …
const FAILURE_WINDOW_MS = 15 * 60_000; // … within this long locks sign-in

async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
  return [...sig].map(b => b.toString(16).padStart(2, "0")).join("");
}

function tokenFor(env: Env, employeeId: number): Promise<string> {
  return hmacHex(env.STAFF_TOKEN_SECRET, `staff:${employeeId}`).then(sig => `${employeeId}.${sig}`);
}

/** Employee id the token was issued to, or null. */
async function verifyToken(env: Env, token: string): Promise<number | null> {
  const id = parseInt(token.split(".")[0], 10);
  if (!id || !env.STAFF_TOKEN_SECRET) return null;
  const expected = await tokenFor(env, id);
  if (expected.length !== token.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0 ? id : null;
}

/** Employees who can sign in (those with a PIN set in Odoo). */
export async function handleStaffEmployees(env: Env): Promise<Response> {
  const uid = await odooAuth(env);
  if (!uid) return Response.json({ error: "Odoo unavailable" }, { status: 502 });
  const r = await odooCall(env, uid, "hr.employee", "search_read", [[["pin", "!=", false]]], { fields: ["name"], order: "name" });
  const rows = (r.parsed ?? []) as Array<{ id: number; name: string }>;
  return Response.json({ employees: rows.map(e => ({ id: e.id, name: e.name })) });
}

export async function handleStaffLogin(request: Request, env: Env): Promise<Response> {
  let body: { employee_id?: number; pin?: string };
  try { body = await request.json(); } catch { return Response.json({ error: "invalid JSON" }, { status: 400 }); }
  const employeeId = Number(body.employee_id);
  const pin = String(body.pin ?? "").trim();
  if (!employeeId || !pin) return Response.json({ error: "employee and PIN required" }, { status: 400 });
  if (!env.STAFF_TOKEN_SECRET) return Response.json({ error: "tracking not configured" }, { status: 500 });

  const since = Date.now() - FAILURE_WINDOW_MS;
  const fails = await env.DB.prepare("SELECT COUNT(*) AS n FROM staff_login_failures WHERE employee_id = ?1 AND at > ?2")
    .bind(employeeId, since).first<{ n: number }>();
  if ((fails?.n ?? 0) >= MAX_FAILURES) return Response.json({ error: "too many wrong PINs, try again in 15 minutes" }, { status: 429 });

  const uid = await odooAuth(env);
  if (!uid) return Response.json({ error: "Odoo unavailable" }, { status: 502 });
  const r = await odooCall(env, uid, "hr.employee", "search_read",
    [[["id", "=", employeeId], ["pin", "=", pin]]], { fields: ["name"], limit: 1 });
  const match = ((r.parsed ?? []) as Array<{ id: number; name: string }>)[0];
  if (!match) {
    await env.DB.prepare("INSERT INTO staff_login_failures (employee_id, at) VALUES (?1, ?2)").bind(employeeId, Date.now()).run();
    return Response.json({ error: "wrong PIN" }, { status: 401 });
  }
  await env.DB.prepare("DELETE FROM staff_login_failures WHERE employee_id = ?1 OR at < ?2").bind(employeeId, since).run();
  return Response.json({ token: await tokenFor(env, match.id), employee: { id: match.id, name: match.name } });
}

/** One reading from the app: {token, lat, lon, accuracy?, at? (epoch ms)}. */
export async function handleStaffLocation(request: Request, env: Env): Promise<Response> {
  let body: { token?: string; lat?: number; lon?: number; accuracy?: number; at?: number };
  try { body = await request.json(); } catch { return Response.json({ error: "invalid JSON" }, { status: 400 }); }
  const employeeId = await verifyToken(env, String(body.token ?? ""));
  if (!employeeId) return Response.json({ error: "not signed in" }, { status: 401 });
  const lat = Number(body.lat), lon = Number(body.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return Response.json({ error: "bad coordinates" }, { status: 400 });
  }
  // Readings queued while offline arrive late; keep their own time, but not
  // one from the future.
  const at = Math.min(Number(body.at) || Date.now(), Date.now());
  const uid = await odooAuth(env);
  if (!uid) { console.error("staff location: Odoo login failed"); return Response.json({ error: "Odoo unavailable" }, { status: 502 }); }
  const r = await odooCall(env, uid, "staff.location.stay", "record_fix", [
    employeeId, lat, lon, Math.round(Number(body.accuracy) || 0),
    new Date(at).toISOString().slice(0, 19).replace("T", " "),
  ]);
  if (r.fault) {
    console.error(`staff location for employee ${employeeId}: Odoo fault: ${r.fault}`);
    return Response.json({ error: r.fault }, { status: 502 });
  }
  return Response.json({ ok: true, stay_id: r.parsed });
}
