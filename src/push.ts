import type { Env } from "./types";

// ── FCM push for the Android app ──────────────────────────────
// Asterisk hits POST /push/wake when an inbound call is about to ring an
// extension; we send a high-priority data message so the app can wake, show
// a full-screen call notification, and register with Asterisk while the call
// is still being held (see docs/android-push.md for the dialplan side).

interface ServiceAccount { project_id: string; client_email: string; private_key: string; }

let cachedToken: { value: string; expires: number } | null = null;

function b64url(input: ArrayBuffer | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function accessToken(sa: ServiceAccount): Promise<string> {
  if (cachedToken && cachedToken.expires > Date.now() + 60_000) return cachedToken.value;
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const pem = sa.private_key.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claims}`));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${b64url(sig)}`,
    }),
  });
  const data = await res.json() as { access_token?: string; expires_in?: number; error_description?: string };
  if (!data.access_token) throw new Error("FCM auth failed: " + (data.error_description || res.status));
  cachedToken = { value: data.access_token, expires: Date.now() + (data.expires_in || 3600) * 1000 };
  return cachedToken.value;
}

async function sendData(env: Env, token: string, data: Record<string, string>): Promise<"ok" | "gone" | "error"> {
  const sa = JSON.parse(env.FCM_SERVICE_ACCOUNT) as ServiceAccount;
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken(sa)}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message: { token, data, android: { priority: "HIGH", ttl: "30s" } } }),
  });
  if (res.ok) return "ok";
  const body = await res.text();
  console.log(`fcm send failed ${res.status}: ${body}`);
  return res.status === 404 || body.includes("UNREGISTERED") ? "gone" : "error";
}

// Called by the Android app on launch: { token, extension }.
export async function handlePushRegister(request: Request, env: Env): Promise<Response> {
  let body: { token?: string; extension?: string };
  try { body = await request.json(); } catch { return Response.json({ error: "invalid JSON" }, { status: 400 }); }
  const token = String(body.token || "").trim();
  const extension = String(body.extension || "").trim();
  if (!token || !/^\d{2,6}$/.test(extension)) return Response.json({ error: "token and numeric extension required" }, { status: 400 });
  await env.DB.batch([
    env.DB.prepare("INSERT INTO push_tokens (token, extension) VALUES (?, ?) ON CONFLICT(token) DO UPDATE SET extension = excluded.extension, updated_at = datetime('now')").bind(token, extension),
  ]);
  return Response.json({ ok: true });
}

// Called by Asterisk (GET or POST): extension, caller, type? — as query params or a
// JSON body — authenticated by X-Push-Secret or ?secret=. (Asterisk's CURL() can
// only do a plain GET/form POST, so query params keep the dialplan simple.)
// type "incoming_call" (default) rings the device; "call_cancelled" dismisses it.
export async function handlePushWake(request: Request, env: Env): Promise<Response> {
  const q = new URL(request.url).searchParams;
  const secret = request.headers.get("X-Push-Secret") || q.get("secret");
  if (!env.PUSH_SECRET || secret !== env.PUSH_SECRET) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: { extension?: string; caller?: string; type?: string } = {};
  if (request.method === "POST") { try { body = await request.json(); } catch { /* fall back to query params */ } }
  const extension = String(body.extension || q.get("extension") || "").trim();
  if (!extension) return Response.json({ error: "missing extension" }, { status: 400 });
  const type = (body.type || q.get("type")) === "call_cancelled" ? "call_cancelled" : "incoming_call";
  const caller = String(body.caller || q.get("caller") || "");

  const rows = await env.DB.prepare("SELECT token FROM push_tokens WHERE extension = ?").bind(extension).all<{ token: string }>();
  const tokens = (rows.results || []).map((r) => r.token);
  let sent = 0;
  for (const t of tokens) {
    const r = await sendData(env, t, { type, caller });
    if (r === "ok") sent++;
    else if (r === "gone") await env.DB.prepare("DELETE FROM push_tokens WHERE token = ?").bind(t).run();
  }
  return Response.json({ ok: true, devices: tokens.length, sent });
}
