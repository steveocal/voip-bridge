// ── Minimal Workers Runtime Types ────────────────────────────
// These are always available in the Workers runtime as ambient globals.
// Declared here for TypeScript checking without @cloudflare/workers-types.

declare class DurableObjectState {
  readonly id: DurableObjectId;
  storage: DurableObjectStorage;
  waitUntil(promise: Promise<unknown>): void;
  blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>;
}

declare class DurableObjectId {
  toString(): string;
  equals(other: DurableObjectId): boolean;
}

declare class DurableObjectStub {
  readonly id: DurableObjectId;
  fetch(input: RequestInfo, init?: RequestInit): Promise<Response>;
}

declare class DurableObjectNamespace {
  newUniqueId(options?: { jurisdiction?: string }): DurableObjectId;
  idFromName(name: string): DurableObjectId;
  idFromString(id: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}

declare class DurableObjectStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
  list(): Promise<Map<string, unknown>>;
  transaction<T>(callback: () => Promise<T>): Promise<T>;
}

declare class D1Database {
  prepare(query: string): D1PreparedStatement;
  exec(query: string): Promise<D1Result>;
}

declare class D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
  raw<T = unknown[]>(): Promise<T[]>;
}

interface D1Result<T = Record<string, unknown>> {
  results?: T[];
  success: boolean;
  meta: Record<string, unknown>;
}

interface Env {
  CALL_STATE: DurableObjectNamespace;
  DB: D1Database;
  ODOO_URL: string;
  ODOO_DB: string;
  ODOO_USER: string;
  ODOO_PASS: string;
  ASTERISK_URL: string;
  ASTERISK_USER: string;
  ASTERISK_PASS: string;
}

// ── Odoo XML-RPC client ──────────────────────────────────────

async function odooAuth(env: Env): Promise<number | null> {
  const url = `${env.ODOO_URL}/xmlrpc/2/common`;
  const body = xmlrpcRequest("authenticate", env.ODOO_DB, "", env.ODOO_PASS, "common", [env.ODOO_DB, env.ODOO_USER, env.ODOO_PASS, {}]);
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "text/xml" }, body });
  const text = await res.text();
  const uidMatch = text.match(/<int>(\d+)<\/int>/);
  return uidMatch ? parseInt(uidMatch[1]) : null;
}

async function odooCall(env: Env, uid: number, model: string, method: string, args: unknown[]) {
  const url = `${env.ODOO_URL}/xmlrpc/2/object`;
  const body = xmlrpcRequest("execute_kw", env.ODOO_DB, String(uid), env.ODOO_PASS, model, [method, args]);
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "text/xml" }, body });
  return parseXmlrpcResponse(await res.text());
}

function xmlrpcRequest(method: string, db: string, uid: string, pass: string, model: string, args: unknown[]) {
  const argsXml = args.map(a => xmlrpcValue(a)).join("");
  return `<?xml version="1.0"?>
<methodCall>
  <methodName>execute_kw</methodName>
  <params>
    <param><value><string>${db}</string></value></param>
    <param><value><int>${uid}</int></value></param>
    <param><value><string>${pass}</string></value></param>
    <param><value><string>${model}</string></value></param>
    <param><value><string>${method}</string></value></param>
    <param><value><array><data>${argsXml}</data></array></value></param>
  </params>
</methodCall>`;
}

function xmlrpcValue(v: unknown): string {
  if (typeof v === "string") return `<value><string>${escapeXml(v)}</string></value>`;
  if (typeof v === "number") return `<value><int>${v}</int></value>`;
  if (typeof v === "boolean") return `<value><boolean>${v ? 1 : 0}</boolean></value>`;
  if (Array.isArray(v)) return `<value><array><data>${v.map(xmlrpcValue).join("")}</data></array></value>`;
  if (v === null || v === undefined) return "<value><nil/></value>";
  if (typeof v === "object") {
    return `<value><struct>${Object.entries(v as Record<string, unknown>).map(([k, val]) =>
      `<member><name>${escapeXml(k)}</name>${xmlrpcValue(val)}</member>`
    ).join("")}</struct></value>`;
  }
  return `<value><string>${escapeXml(String(v))}</string></value>`;
}

function escapeXml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function parseXmlrpcResponse(xml: string): unknown {
  const dataMatch = xml.match(/<data>([\s\S]*?)<\/data>/);
  if (!dataMatch) return null;
  const values = [...dataMatch[1].matchAll(/<value>([\s\S]*?)<\/value>/g)];
  return values.map(v => parseXmlrpcScalar(v[1]));
}

function parseXmlrpcScalar(inner: string): unknown {
  const intMatch = inner.match(/<int>(\d+)<\/int>/);
  if (intMatch) return parseInt(intMatch[1]);
  const strMatch = inner.match(/<string>(.*?)<\/string>/s);
  if (strMatch) return strMatch[1];
  const boolMatch = inner.match(/<boolean>(\d)<\/boolean>/);
  if (boolMatch) return boolMatch[1] === "1";
  return inner.trim();
}

// ── Asterisk ARI client ───────────────────────────────────────

async function ariRequest(env: Env, path: string, method = "GET", body?: Record<string, unknown>) {
  const url = `${env.ASTERISK_URL}/ari/${path}`;
  const auth = btoa(`${env.ASTERISK_USER}:${env.ASTERISK_PASS}`);
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return res.json();
}

// ── Caller lookup via Odoo ────────────────────────────────────

async function lookupCaller(env: Env, number: string) {
  if (!number || number === "unknown") return null;
  const clean = number.startsWith("+44") ? "0" + number.slice(3) : number;
  try {
    const uid = await odooAuth(env);
    if (!uid) return null;
    const partners = await odooCall(env, uid, "res.partner", "search_read", [[
      ["|", ["phone", "=ilike", `%${clean}%`], ["mobile", "=ilike", `%${clean}%`]],
      { fields: ["id", "name", "phone", "mobile", "email"], limit: 5 },
    ]]) as Array<Record<string, unknown>>;
    return partners.length > 0 ? partners[0] : null;
  } catch (e) {
    console.error("Odoo lookup failed:", e);
    return null;
  }
}

// ── Durable Object: CallState ──────────────────────────────────

export class CallState {
  private calls = new Map<string, CallRecord>();

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/create") {
      const { callId, caller, did, partnerId, partnerName } = await request.json() as CallCreate;
      this.calls.set(callId, { id: callId, caller, did, status: "ringing", startTime: Date.now(), partnerId, partnerName });
      return Response.json({ ok: true });
    }

    if (request.method === "POST" && url.pathname === "/update") {
      const { callId, ...fields } = await request.json() as { callId: string } & Partial<CallRecord>;
      const call = this.calls.get(callId);
      if (call) Object.assign(call, fields);
      return Response.json({ ok: true });
    }

    if (request.method === "GET" && url.pathname === "/get") {
      const callId = url.searchParams.get("callId");
      return Response.json(callId ? (this.calls.get(callId) ?? null) : null);
    }

    if (request.method === "GET" && url.pathname === "/active") {
      const active = [...this.calls.values()].filter(c => c.status !== "hungup");
      return Response.json(active);
    }

    return new Response("Not found", { status: 404 });
  }
}

interface CallCreate {
  callId: string;
  caller: string;
  did: string;
  partnerId?: number;
  partnerName?: string;
}

interface CallRecord {
  id: string;
  caller: string;
  did: string;
  status: "ringing" | "answered" | "hungup";
  partnerId?: number;
  partnerName?: string;
  startTime: number;
  answerTime?: number;
  endTime?: number;
}

// ── Route handlers ─────────────────────────────────────────────

async function handleCallEvent(request: Request, env: Env): Promise<Response> {
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
    return Response.json({ action: "hangup", duration });
  }

  return Response.json({ action: "unknown", event });
}

async function handleClick2Call(request: Request, env: Env): Promise<Response> {
  const { extension, destination, callerId } = await request.json() as {
    extension: string; destination: string; callerId?: string;
  };
  const result = await ariRequest(env, "channels", "POST", {
    endpoint: `PJSIP/${extension}`,
    extension: destination,
    context: "from-internal",
    priority: 1,
    callerId: callerId ?? extension,
  });
  return Response.json({ ok: true, result });
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

// ── Main router ────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/call-event") return handleCallEvent(request, env);
    if (request.method === "POST" && url.pathname === "/click2call") return handleClick2Call(request, env);
    if (request.method === "GET" && url.pathname === "/caller-lookup") return handleCallerLookup(request, env);
    if (request.method === "GET" && url.pathname === "/active-calls") return handleActiveCalls(request, env);
    if (url.pathname === "/") {
      return Response.json({ service: "voip-bridge", routes: ["/call-event", "/click2call", "/caller-lookup", "/active-calls"] });
    }

    return new Response("Not found", { status: 404 });
  },
};
