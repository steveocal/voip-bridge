import type { Env, ExecutionContext, D1PreparedStatement } from "./types";
import { lookupCaller, logCompletedCall, trackCall, searchContacts, syncContacts, syncCallLog, odooAuth, odooCall, searchContactMessages, upsertMessages } from "./odoo";
import { searchGmailMessages, searchRecentGmailMessages, getGmailBody, sendGmailMessage } from "./gmail";
import { ariRequest } from "./asterisk";
import { serveDashboard } from "./dashboard";
import type { Contact, Message } from "./odoo";

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
    // Log the call in D1 as soon as it rings (so missed calls are captured too).
    await env.DB.prepare(
      `INSERT INTO call_log (call_id, phone_number, did, direction, state, start_date, partner_id)
       VALUES (?1, ?2, ?3, 'incoming', 'calling', ?4, ?5)
       ON CONFLICT(call_id) DO UPDATE SET phone_number=excluded.phone_number, did=excluded.did, partner_id=excluded.partner_id`
    ).bind(callId, caller, did, Date.now(), (partner as any)?.id ?? null).run();
    return Response.json({ action: "ring", caller, partner: (partner as any)?.name ?? null });
  }

  if (event === "answer") {
    await stub.fetch(new Request("https://do/update", {
      method: "POST",
      body: JSON.stringify({ callId, status: "answered", answerTime: Date.now() }),
    }));
    await env.DB.prepare("UPDATE call_log SET state='ongoing' WHERE call_id=?1").bind(callId).run();
    return Response.json({ action: "answered" });
  }

  if (event === "hangup") {
    const duration = parseInt(params.get("duration") ?? "0");
    const state = duration > 0 ? "terminated" : "missed";
    await stub.fetch(new Request("https://do/update", {
      method: "POST",
      body: JSON.stringify({ callId, status: "hungup", endTime: Date.now() }),
    }));
    await env.DB.prepare("UPDATE call_log SET state=?1, end_date=?2 WHERE call_id=?3")
      .bind(state, Date.now(), callId).run();
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
  const q = (url.searchParams.get("q") ?? "").trim();
  const select = `SELECT c.id, c.call_id, c.phone_number, c.did, c.direction, c.state,
       COALESCE(c.start_date, c.create_date) AS start_date,
       c.end_date,
       CASE WHEN c.end_date > c.start_date THEN (c.end_date - c.start_date) / 1000 ELSE 0 END AS duration,
       COALESCE(p.name, '') AS partner_name
     FROM call_log c
     LEFT JOIN contacts p ON p.id = c.partner_id`;
  let rows;
  if (q) {
    const like = `%${q}%`;
    rows = await env.DB.prepare(
      `${select}
       WHERE c.phone_number LIKE ?1 OR c.did LIKE ?1 OR p.name LIKE ?1
       ORDER BY COALESCE(c.start_date, c.create_date) DESC LIMIT ?2`
    ).bind(like, limit).all<Record<string, unknown>>();
  } else {
    rows = await env.DB.prepare(
      `${select} ORDER BY COALESCE(c.start_date, c.create_date) DESC LIMIT ?1`
    ).bind(limit).all<Record<string, unknown>>();
  }
  return Response.json({ calls: rows.results || [] });
}

// ── Contact messages (Odoo mail.message + Gmail) ──────────────

async function handleMessages(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const contactId = parseInt(url.searchParams.get("contact") ?? "0");
  if (!contactId) return Response.json({ error: "missing contact id" }, { status: 400 });
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50") || 50, 100);

  const contact = await env.DB.prepare("SELECT id, name, email FROM contacts WHERE id = ?1")
    .bind(contactId).first<{ id: number; name: string; email: string }>();
  if (!contact) return Response.json({ error: "contact not found" }, { status: 404 });

  // Download + cache Odoo messages (best-effort).
  let odooOk = false;
  try {
    await searchContactMessages(env, contactId, limit);
    odooOk = true;
  } catch (e) {
    console.error("Odoo message sync failed:", e);
  }

  // Download + cache Gmail messages (best-effort).
  let gmailOk = false;
  const email = (contact.email || "").trim();
  if (email) {
    try {
      const g = await searchGmailMessages(env, email, limit);
      await upsertMessages(env, g.map(m => ({ ...m, contact_id: contactId })));
      gmailOk = true;
    } catch (e) {
      console.error("Gmail message sync failed:", e);
    }
  }

  // Return merged messages from D1 (cache), newest first.
  const rows = await env.DB.prepare(
    `SELECT id, odoo_id, gmail_id, contact_id, subject, body, email_from, author_id, message_type, direction, source, date
     FROM messages WHERE contact_id = ?1 ORDER BY COALESCE(date, 0) DESC LIMIT ?2`
  ).bind(contactId, limit * 2).all<Record<string, unknown>>();

  return Response.json({
    contact: { id: contact.id, name: contact.name, email: contact.email },
    odooOk,
    gmailOk,
    messages: rows.results || [],
  });
}

// Recent Gmail messages across all senders (last N days) — for the Messages
// tab when no contact is selected.
async function handleRecentMessages(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const days = Math.max(1, Math.min(parseInt(url.searchParams.get("days") ?? "7") || 7, 30));
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50") || 50, 100);

  let gmailOk = false;
  let messages: Message[] = [];
  try {
    messages = await searchRecentGmailMessages(env, days, limit);
    gmailOk = true;
  } catch (e) {
    console.error("Recent Gmail sync failed:", e);
  }
  return Response.json({ days, gmailOk, messages });
}

// ── Message detail + send ─────────────────────────────────────

async function handleMessageDetail(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const id = parseInt(url.searchParams.get("id") ?? "0");
  const gmailId = url.searchParams.get("gmail_id") ?? "";

  // Live recent Gmail message (no D1 row yet) — return its full decoded body.
  if (!id && gmailId) {
    const body = await getGmailBody(env, gmailId);
    if (!body) return Response.json({ error: "body unavailable" }, { status: 404 });
    return Response.json({ message: { gmail_id: gmailId, source: "gmail", body } });
  }
  if (!id) return Response.json({ error: "missing id" }, { status: 400 });

  const row = await env.DB.prepare("SELECT * FROM messages WHERE id = ?1")
    .bind(id).first<Record<string, unknown>>();
  if (!row) return Response.json({ error: "not found" }, { status: 404 });
  // Gmail messages only store a snippet — pull the full decoded body on demand.
  if (row.source === "gmail" && row.gmail_id) {
    const body = await getGmailBody(env, String(row.gmail_id));
    if (body) row.body = body;
  }
  return Response.json({ message: row });
}

async function handleSendMessage(request: Request, env: Env): Promise<Response> {
  let body: { to?: string; subject?: string; body?: string; replyToGmailId?: string };
  try { body = await request.json(); } catch { return Response.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!body.to || !String(body.to).trim()) return Response.json({ error: "missing recipient" }, { status: 400 });
  const res = await sendGmailMessage(env, {
    to: String(body.to).trim(),
    subject: body.subject ?? "",
    body: body.body ?? "",
    replyToGmailId: body.replyToGmailId,
  });
  return Response.json(res, { status: res.ok ? 200 : 502 });
}

// ── Phase 1: Contacts ──────────────────────────────────────────

async function handleContacts(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50") || 50, 200);
  const contacts = await searchContacts(env, q, limit);
  return Response.json({ contacts });
}

// D1-cache-only contact lookup (fast type-ahead; no Odoo round-trip).
async function handleContactsCache(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50") || 50, 200);
  const select = "SELECT id, name, company_type, is_company, phone, mobile, email, website, vat, function, city, active FROM contacts";
  let rows;
  if (q) {
    const like = `%${q}%`;
    rows = await env.DB.prepare(
      `${select} WHERE name LIKE ?1 OR phone LIKE ?1 OR mobile LIKE ?1 OR email LIKE ?1 ORDER BY name LIMIT ?2`
    ).bind(like, limit).all<Record<string, unknown>>();
  } else {
    rows = await env.DB.prepare(
      `${select} WHERE name != '' AND active = 1 ORDER BY name LIMIT ?1`
    ).bind(limit).all<Record<string, unknown>>();
  }
  return Response.json({ contacts: rows.results || [] });
}

// Bulk sync Odoo → D1 (contacts + last N call-log records).
async function handleSync(env: Env): Promise<Response> {
  try {
    const contacts = await syncContacts(env);
    const callLog = await syncCallLog(env, 100);
    return Response.json({ ok: true, contacts, callLog });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

// Read all app settings (key-value) from D1.
async function handleGetSettings(env: Env): Promise<Response> {
  const rows = await env.DB.prepare("SELECT key, value FROM settings")
    .all<{ key: string; value: string }>();
  const settings: Record<string, string> = {};
  for (const r of rows.results || []) settings[r.key] = r.value;
  return Response.json({ settings });
}

// Upsert app settings (JSON body of key → value).
async function handleSetSettings(request: Request, env: Env): Promise<Response> {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: "invalid JSON" }, { status: 400 }); }
  const statements: D1PreparedStatement[] = [];
  for (const [k, v] of Object.entries(body)) {
    if (typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean") continue;
    statements.push(env.DB.prepare(
      "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at"
    ).bind(k, String(v), Date.now()));
  }
  if (statements.length) await env.DB.batch(statements);
  return Response.json({ ok: true, count: statements.length });
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
      { fields: ["id", "name", "company_type", "is_company", "phone", "mobile", "email", "website", "vat", "function", "city", "active"], limit: 1 }) as { parsed: Array<Record<string, unknown>> };
    contact = (((result.parsed || [])[0] ?? null) as unknown as Contact) || null;
  }
  if (!contact) {
    // Fall back to D1 cache.
    const cached = await env.DB.prepare(
      "SELECT id, name, company_type, is_company, phone, mobile, email, website, vat, function, city, active FROM contacts WHERE id = ?1"
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
      `SELECT phone_number, did, direction, state,
         COALESCE(start_date, create_date) AS start_date,
         end_date,
         CASE WHEN end_date > start_date THEN (end_date - start_date) / 1000 ELSE 0 END AS duration
       FROM call_log WHERE phone_number LIKE ?1
       ORDER BY COALESCE(start_date, create_date) DESC LIMIT 20`
    ).bind(`%${d}%`).all<Record<string, unknown>>();
    for (const r of rows.results || []) calls.push(r);
  }
  // De-dupe by start_date+phone_number, sort desc.
  const seen = new Set<string>();
  const unique = calls.filter(r => {
    const k = `${r.start_date}-${r.phone_number}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).sort((a, b) => (b.start_date as number) - (a.start_date as number));

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
    else if (request.method === "POST" && url.pathname === "/sync") response = await handleSync(env);
    else if (request.method === "GET" && url.pathname === "/settings") response = await handleGetSettings(env);
    else if (request.method === "POST" && url.pathname === "/settings") response = await handleSetSettings(request, env);
    else if (request.method === "GET" && url.pathname === "/caller-lookup") response = await handleCallerLookup(request, env);
    else if (request.method === "GET" && url.pathname === "/active-calls") response = await handleActiveCalls(request, env);
    else if (request.method === "GET" && url.pathname === "/call-history") response = await handleCallHistory(request, env);
    else if (request.method === "GET" && url.pathname === "/messages") response = await handleMessages(request, env);
    else if (request.method === "GET" && url.pathname === "/messages/recent") response = await handleRecentMessages(request, env);
    else if (request.method === "GET" && url.pathname === "/message") response = await handleMessageDetail(request, env);
    else if (request.method === "POST" && url.pathname === "/send-message") response = await handleSendMessage(request, env);
    else if (request.method === "GET" && url.pathname === "/contacts") response = await handleContacts(request, env);
    else if (request.method === "GET" && url.pathname === "/contacts/cache") response = await handleContactsCache(request, env);
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
