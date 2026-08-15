import type { Env, ExecutionContext } from "./types";
import { lookupCaller, logCompletedCall, trackCall, searchContacts, odooAuth, odooCall } from "./odoo";
import { ariRequest } from "./asterisk";
import { serveDashboard } from "./dashboard";
import type { Contact } from "./odoo";

// Durable Object class must be exported from the entrypoint module.
export { CallState } from "./callstate";

// ── Route handlers ─────────────────────────────────────────────

async function handleCallEvent(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const body = await request.text();
  const params = new URLSearchParams(body);
  const event = params.get("event") ?? "unknown";
  const callId = params.get("callId") ?? crypto.randomUUID();
  const caller = params.get("caller") ?? "unknown";
  const did = params.get("did") ?? "";

  const doId = env.CALL_STATE.idFromName("global");
  const stub = env.CALL_STATE.get(doId);

  if (event === "ring") {
    const partner = await lookupCaller(env, caller);
    await stub.fetch(new Request("https://do/create", {
      method: "POST",
      body: JSON.stringify({ callId, caller, did, partnerId: (partner as any)?.id, partnerName: (partner as any)?.name }),
    }));
    trackCall(callId, caller, (partner as any)?.id);
    return Response.json({ action: "ring", caller, partner: (partner as any)?.name ?? null });
  }

  if (event === "answer") {
    await stub.fetch(new Request("https://do/update", {
      method: "POST",
      body: JSON.stringify({ callId, status: "answered", answerTime: Date.now() }),
    }));
    await env.DB.prepare("INSERT INTO call_log (call_id, caller, did, status, start_time) VALUES (?1, ?2, ?3, 'answered', ?4)")
      .bind(callId, caller, did, Date.now()).run();
    return Response.json({ action: "answered" });
  }

  if (event === "hangup") {
    const duration = parseInt(params.get("duration") ?? "0");
    await stub.fetch(new Request("https://do/update", {
      method: "POST",
      body: JSON.stringify({ callId, status: "hungup", endTime: Date.now() }),
    }));
    await env.DB.prepare("UPDATE call_log SET status='hungup', end_time=?1, duration=?2 WHERE call_id=?3")
      .bind(Date.now(), duration, callId).run();
    ctx.waitUntil(logCompletedCall(env, callId, caller, did, duration));
    return Response.json({ action: "hangup", duration });
  }

  return Response.json({ action: "unknown", event });
}

async function handleClick2Call(request: Request, _env: Env): Promise<Response> {
  const body = await request.json() as {
    destination: string; callerId?: string;
  };
  let destination = body.destination;
  const callerId = body.callerId ?? "+447****7226";

  if (!destination) {
    return Response.json({ error: "missing destination" }, { status: 400 });
  }

  // Normalize: 0... → +44...
  if (destination.startsWith("0")) {
    destination = "+44" + destination.slice(1);
  }

  try {
    // Call VPS AMI bridge — uses proper AMI Originate with post-answer routing
    const res = await fetch("http://64.176.181.195.nip.io/click2call-ami", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destination, callerId }),
    });
    const data = await res.json() as { ok: boolean; msg: string };
    console.log(`click2call: AMI bridge -> ${JSON.stringify(data)}`);

    if (data.ok) {
      return Response.json({ ok: true, msg: data.msg || `Calling ${destination} — Linphone will ring when they answer` });
    }
    return Response.json({ error: data.msg || "AMI bridge failed" }, { status: 500 });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

async function handleAnswer(request: Request, env: Env): Promise<Response> {
  const { channelId } = await request.json() as { channelId: string };
  if (!channelId) return Response.json({ error: "missing channelId" }, { status: 400 });
  try {
    await ariRequest(env, `channels/${channelId}/answer`, "POST");
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

async function handleHangupCall(request: Request, env: Env): Promise<Response> {
  const { channelId } = await request.json() as { channelId: string };
  if (!channelId) return Response.json({ error: "missing channelId" }, { status: 400 });
  try {
    await ariRequest(env, `channels/${channelId}`, "DELETE");
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

async function handleCallerLookup(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const number = url.searchParams.get("number") ?? "";
  const partner = await lookupCaller(env, number);
  return Response.json(partner ? { found: true, name: partner.name, id: partner.id } : { found: false });
}

async function handleActiveCalls(_request: Request, env: Env): Promise<Response> {
  const doId = env.CALL_STATE.idFromName("global");
  const stub = env.CALL_STATE.get(doId);
  return stub.fetch(new Request("https://do/active"));
}

async function handleCallHistory(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50") || 50, 200);
  const rows = await env.DB.prepare(
    "SELECT call_id, caller, did, status, start_time, end_time, duration FROM call_log ORDER BY start_time DESC LIMIT ?1"
  ).bind(limit).all<Record<string, unknown>>();
  return Response.json({ calls: rows.results || [] });
}

// ── Phase 1: Contacts ──────────────────────────────────────────

async function handleContacts(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50") || 50, 200);
  const contacts = await searchContacts(env, q, limit);
  return Response.json({ contacts });
}

function digitsOf(s: string): string {
  return (s || "").replace(/\D/g, "");
}

async function handleContactDetail(env: Env, id: number): Promise<Response> {
  const uid = await odooAuth(env);
  let contact: Contact | null = null;
  if (uid) {
    const result = await odooCall(env, uid, "res.partner", "search_read",
      [[["id", "=", id]]],
      { fields: ["id", "name", "phone", "mobile", "email", "is_company"], limit: 1 }) as { parsed: Array<Record<string, unknown>> };
    contact = (((result.parsed || [])[0] ?? null) as unknown as Contact) || null;
  }
  if (!contact) {
    // Fall back to D1 cache.
    const cached = await env.DB.prepare(
      "SELECT odoo_id AS id, name, phone, mobile, email, is_company FROM contacts WHERE odoo_id = ?1"
    ).bind(id).first<Record<string, unknown>>();
    contact = cached ? (cached as unknown as Contact) : null;
  }
  if (!contact) return Response.json({ error: "not found" }, { status: 404 });

  // Recent calls for this contact: match on the last 7 digits of phone/mobile.
  const calls: Array<Record<string, unknown>> = [];
  for (const p of [contact.phone, contact.mobile]) {
    if (!p) continue;
    const d = digitsOf(p).slice(-7);
    if (d.length < 7) continue;
    const rows = await env.DB.prepare(
      "SELECT caller, did, status, start_time, end_time, duration FROM call_log WHERE caller LIKE ?1 ORDER BY start_time DESC LIMIT 20"
    ).bind(`%${d}%`).all<Record<string, unknown>>();
    for (const r of rows.results || []) calls.push(r);
  }
  // De-dupe by start_time+caller, sort desc.
  const seen = new Set<string>();
  const unique = calls.filter(r => {
    const k = `${r.start_time}-${r.caller}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).sort((a, b) => (b.start_time as number) - (a.start_time as number));

  return Response.json({ contact, calls: unique });
}

// ── CORS ───────────────────────────────────────────────────────

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

// ── Main router ────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    let response: Response;
    if (request.method === "POST" && url.pathname === "/call-event") response = await handleCallEvent(request, env, ctx);
    else if (request.method === "POST" && url.pathname === "/click2call") response = await handleClick2Call(request, env);
    else if (request.method === "POST" && url.pathname === "/answer") response = await handleAnswer(request, env);
    else if (request.method === "POST" && url.pathname === "/hangup-call") response = await handleHangupCall(request, env);
    else if (request.method === "GET" && url.pathname === "/caller-lookup") response = await handleCallerLookup(request, env);
    else if (request.method === "GET" && url.pathname === "/active-calls") response = await handleActiveCalls(request, env);
    else if (request.method === "GET" && url.pathname === "/call-history") response = await handleCallHistory(request, env);
    else if (request.method === "GET" && url.pathname === "/contacts") response = await handleContacts(request, env);
    else if (request.method === "GET" && /^\/contacts\/\d+$/.test(url.pathname)) response = await handleContactDetail(env, parseInt(url.pathname.split("/")[2]));
    else if (url.pathname === "/") response = Response.json({ service: "voip-bridge", routes: ["/call-event", "/click2call", "/caller-lookup", "/active-calls", "/answer", "/hangup-call", "/call-history", "/contacts", "/contacts/:id"] });
    else if (url.pathname === "/dashboard") response = serveDashboard();
    else response = new Response("Not found", { status: 404 });

    // Add CORS headers
    const headers = new Headers(response.headers);
    const ch = corsHeaders();
    for (const [k, v] of Object.entries(ch)) headers.set(k, v);
    return new Response(response.body, { status: response.status, headers });
  },
};
