import type { Env, D1PreparedStatement } from "./types";

// ── Odoo XML-RPC client (hand-rolled, no library) ────────────

export interface OdooResult {
  parsed: unknown;
  _xml: string;
  fault?: string;
}

export async function odooAuth(env: Env): Promise<number | null> {
  try {
    const url = `${env.ODOO_URL}/xmlrpc/2/common`;
    const body = authRequest(env.ODOO_DB, env.ODOO_USER, env.ODOO_PASS);
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "text/xml" }, body });
    const text = await res.text();
    const uid = parseXmlrpcResponse(text);
    return typeof uid === "number" ? uid : null;
  } catch (e) {
    console.error("odooAuth failed:", e);
    return null;
  }
}

/**
 * execute_kw call. `args` is the list of positional args passed to the model
 * method; `kwargs` is an optional dict of keyword args (e.g. search_read's
 * {fields, limit}).
 */
export async function odooCall(
  env: Env,
  uid: number,
  model: string,
  method: string,
  args: unknown[],
  kwargs?: Record<string, unknown>,
): Promise<OdooResult> {
  const url = `${env.ODOO_URL}/xmlrpc/2/object`;
  const body = executeKwRequest(env.ODOO_DB, String(uid), env.ODOO_PASS, model, method, args, kwargs);
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "text/xml" }, body });
  const text = await res.text();
  try {
    const parsed = parseXmlrpcResponse(text);
    return { parsed, _xml: text.substring(0, 800) };
  } catch (e) {
    return { parsed: null, _xml: text.substring(0, 800), fault: String(e) };
  }
}

function authRequest(db: string, user: string, pass: string): string {
  return `<?xml version="1.0"?>
<methodCall>
  <methodName>authenticate</methodName>
  <params>
    <param><value><string>${escapeXml(db)}</string></value></param>
    <param><value><string>${escapeXml(user)}</string></value></param>
    <param><value><string>${escapeXml(pass)}</string></value></param>
    <param><value><struct/></value></param>
  </params>
</methodCall>`;
}

function executeKwRequest(
  db: string,
  uid: string,
  pass: string,
  model: string,
  method: string,
  args: unknown[],
  kwargs?: Record<string, unknown>,
): string {
  const argsXml = args.map(a => xmlrpcValue(a)).join("");
  const kwParam = kwargs ? `<param>${xmlrpcValue(kwargs)}</param>` : "";
  return `<?xml version="1.0"?>
<methodCall>
  <methodName>execute_kw</methodName>
  <params>
    <param><value><string>${escapeXml(db)}</string></value></param>
    <param><value><int>${uid}</int></value></param>
    <param><value><string>${escapeXml(pass)}</string></value></param>
    <param><value><string>${escapeXml(model)}</string></value></param>
    <param><value><string>${escapeXml(method)}</string></value></param>
    <param><value><array><data>${argsXml}</data></array></value></param>
    ${kwParam}
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

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * Recursive XML-RPC value parser. Handles nested struct/array/value with
 * explicit position tracking (regex alone cannot handle nesting).
 */
function parseXmlrpcResponse(xml: string): unknown {
  const faultStart = xml.indexOf("<fault>");
  const paramStart = xml.indexOf("<param>");
  if (faultStart !== -1 && (paramStart === -1 || faultStart < paramStart)) {
    const fs = xml.slice(faultStart + 7, xml.indexOf("</fault>", faultStart));
    const fault = parseValue(fs);
    const f = (fault ?? {}) as Record<string, unknown>;
    throw new Error(`XML-RPC fault ${f.faultCode}: ${String(f.faultString ?? "").slice(0, 400)}`);
  }
  if (paramStart === -1) return null;
  const inner = xml.slice(paramStart + 7, xml.lastIndexOf("</param>"));
  return parseValue(inner);
}

function parseValue(xml: string): unknown {
  let pos = 0;
  const n = xml.length;

  function skipWs() { while (pos < n && /\s/.test(xml[pos])) pos++; }
  function starts(s: string) { return xml.startsWith(s, pos); }
  function readUntil(close: string): string {
    const idx = xml.indexOf(close, pos);
    if (idx === -1) { const s = xml.slice(pos); pos = n; return s; }
    const s = xml.slice(pos, idx);
    pos = idx + close.length;
    return s;
  }

  function parse(): unknown {
    skipWs();
    if (starts("<value>")) {
      pos += 7;
      const v = parse();
      skipWs();
      if (starts("</value>")) pos += 8;
      return v;
    }
    if (starts("<string>")) {
      pos += 8;
      return decodeXml(readUntil("</string>"));
    }
    if (starts("<int>")) {
      pos += 5;
      return parseInt(readUntil("</int>").trim(), 10);
    }
    if (starts("<i4>")) {
      pos += 4;
      return parseInt(readUntil("</i4>").trim(), 10);
    }
    if (starts("<boolean>")) {
      pos += 9;
      return readUntil("</boolean>").trim() === "1";
    }
    if (starts("<double>")) {
      pos += 8;
      return parseFloat(readUntil("</double>"));
    }
    if (starts("<nil/>") || starts("<nil />")) {
      pos = xml.indexOf("/>", pos) + 2;
      return null;
    }
    if (starts("<struct>")) {
      pos += 8;
      const obj: Record<string, unknown> = {};
      for (;;) {
        skipWs();
        if (starts("</struct>")) { pos += 9; break; }
        if (starts("<member>")) {
          pos += 8;
          skipWs();
          let name = "";
          if (starts("<name>")) { pos += 6; name = readUntil("</name>"); }
          skipWs();
          const val = parse();
          obj[decodeXml(name)] = val;
          skipWs();
          if (starts("</member>")) pos += 9;
        } else if (pos >= n) {
          break;
        } else {
          pos++;
        }
      }
      return obj;
    }
    if (starts("<array>")) {
      pos += 7;
      const arr: unknown[] = [];
      for (;;) {
        skipWs();
        if (starts("</array>")) { pos += 8; break; }
        if (starts("<data>")) { pos += 6; continue; }
        if (starts("</data>")) { pos += 7; continue; }
        if (starts("<value>")) { arr.push(parse()); continue; }
        if (pos >= n) break;
        pos++;
      }
      return arr;
    }
    if (pos >= n) return null;
    pos++;
    return null;
  }

  return parse();
}

// ── Caller lookup via Odoo ────────────────────────────────────

export async function lookupCaller(env: Env, number: string) {
  if (!number || number === "unknown") return null;
  const clean = number.startsWith("+44") ? "0" + number.slice(3) : number;
  try {
    const uid = await odooAuth(env);
    if (!uid) return null;
    const result = await odooCall(env, uid, "res.partner", "search_read",
      [["|", ["phone", "=ilike", `%${clean}%`], ["mobile", "=ilike", `%${clean}%`]]],
      { fields: ["id", "name", "phone", "mobile", "email"], limit: 5 });
    const partners = (result.parsed ?? []) as Array<Record<string, unknown>>;
    return partners.length > 0 ? partners[0] : null;
  } catch (e) {
    console.error("Odoo lookup failed:", e);
    return null;
  }
}

// ── Contact search + D1 cache (Phase 1) ───────────────────────

export interface Contact {
  id: number;
  name: string;
  company_type?: string;
  is_company?: boolean;
  phone?: string;
  mobile?: string;
  email?: string;
  website?: string;
  vat?: string;
  function?: string;
  city?: string;
  active?: boolean;
}

/** Live search of res.partner in Odoo, with write-through cache to D1. */
export async function searchContacts(env: Env, query = "", limit = 50): Promise<Contact[]> {
  const uid = await odooAuth(env);
  if (!uid) return [];

  let domain: unknown[];
  if (query.trim()) {
    const q = query.trim();
    // Flat prefix OR (nested OR lists are invalid in Odoo): name OR phone OR mobile OR email
    domain = ["|", "|", "|",
      ["name", "=ilike", `%${q}%`],
      ["phone", "=ilike", `%${q}%`],
      ["mobile", "=ilike", `%${q}%`],
      ["email", "=ilike", `%${q}%`]];
  } else {
    domain = [];
  }

  try {
    const result = await odooCall(env, uid, "res.partner", "search_read",
      [domain],
      { fields: ["id", "name", "company_type", "is_company", "phone", "mobile", "email", "website", "vat", "function", "city", "active"], limit });

    // Normalize: Odoo returns `false` for empty char fields — coerce to "".
    const contacts = ((result.parsed ?? []) as unknown as Contact[]).map(normalizeContact);

    // Write-through cache: upsert into D1 contacts table (best-effort).
    try {
      await upsertContacts(env, contacts);
    } catch (e) {
      console.error("Contact cache write failed:", e);
    }

    return contacts;
  } catch (e) {
    console.error("Odoo contact search failed:", e);
    // Fall back to whatever is in the D1 cache.
    const cached = await env.DB.prepare(
      `SELECT id, name, company_type, is_company, phone, mobile, email, website, vat, function, city, active
       FROM contacts WHERE name LIKE ?1 OR phone LIKE ?1 OR mobile LIKE ?1 OR email LIKE ?1
       ORDER BY name LIMIT ?2`
    ).bind(`%${query}%`, limit).all<Record<string, unknown>>();
    return (cached.results || []) as unknown as Contact[];
  }
}

// ── Contact normalization + bulk upsert ───────────────────────

/** Coerce Odoo's `false`-for-empty values into clean strings/bools. */
function normalizeContact(c: Contact): Contact {
  return {
    id: c.id,
    name: c.name ? String(c.name) : "",
    company_type: c.company_type ? String(c.company_type) : "",
    is_company: !!c.is_company,
    phone: c.phone ? String(c.phone) : "",
    mobile: c.mobile ? String(c.mobile) : "",
    email: c.email ? String(c.email) : "",
    website: c.website ? String(c.website) : "",
    vat: c.vat ? String(c.vat) : "",
    function: c.function ? String(c.function) : "",
    city: c.city ? String(c.city) : "",
    active: c.active === undefined ? true : !!c.active,
  };
}

/** Upsert a batch of contacts into D1. D1 caps bound params at 100/query, so
 * each statement carries ≤7 rows (91 params) and statements run via batch(). */
async function upsertContacts(env: Env, contacts: Contact[]): Promise<void> {
  if (!contacts.length) return;
  const cols = ["id", "name", "company_type", "is_company", "phone", "mobile", "email", "website", "vat", "function", "city", "active", "updated_at"];
  const now = Date.now();
  const statements: D1PreparedStatement[] = [];
  for (let i = 0; i < contacts.length; i += 7) {
    const chunk = contacts.slice(i, i + 7);
    const rowPh = chunk.map(() => `(${cols.map(() => "?").join(",")})`).join(",");
    const sql = `INSERT INTO contacts (${cols.join(",")}) VALUES ${rowPh}
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name, company_type=excluded.company_type, is_company=excluded.is_company,
      phone=excluded.phone, mobile=excluded.mobile, email=excluded.email, website=excluded.website,
      vat=excluded.vat, function=excluded.function, city=excluded.city, active=excluded.active,
      updated_at=excluded.updated_at`;
    const params: unknown[] = [];
    for (const c of chunk) {
      params.push(c.id, c.name, c.company_type ?? "", c.is_company ? 1 : 0, c.phone ?? "", c.mobile ?? "", c.email ?? "", c.website ?? "", c.vat ?? "", c.function ?? "", c.city ?? "", c.active ? 1 : 0, now);
    }
    statements.push(env.DB.prepare(sql).bind(...params));
  }
  for (let i = 0; i < statements.length; i += 100) {
    await env.DB.batch(statements.slice(i, i + 100));
  }
}

// ── Bulk sync: Odoo → D1 ──────────────────────────────────────

/** Coerce a value to string ("" for false/null/undefined). */
function s(v: unknown): string { return v ? String(v) : ""; }

/** Extract the id from a many2one ([id, name] array) or scalar, else null. */
function idOrNull(v: unknown): number | null {
  if (Array.isArray(v)) return typeof v[0] === "number" ? v[0] : null;
  if (typeof v === "number") return v;
  return null;
}

/** Odoo datetime string ("YYYY-MM-DD HH:MM:SS", UTC) → epoch ms, else null. */
function dt(v: unknown): number | null {
  if (!v) return null;
  const t = Date.parse(String(v).replace(" ", "T") + "Z");
  return Number.isNaN(t) ? null : t;
}

/** Bulk-sync all active res.partner rows into the D1 contacts cache. */
export async function syncContacts(env: Env): Promise<{ total: number; synced: number }> {
  const uid = await odooAuth(env);
  if (!uid) return { total: 0, synced: 0 };
  const fields = ["id", "name", "company_type", "is_company", "phone", "mobile", "email", "website", "vat", "function", "city", "active"];
  const BATCH = 500;
  let offset = 0, synced = 0;
  for (;;) {
    const r = await odooCall(env, uid, "res.partner", "search_read",
      [[]], { fields, limit: BATCH, offset, order: "id" });
    const partners = ((r.parsed ?? []) as unknown as Contact[]);
    if (!partners.length) break;
    await upsertContacts(env, partners.map(normalizeContact));
    synced += partners.length;
    if (partners.length < BATCH) break;
    offset += BATCH;
  }
  return { total: synced, synced };
}

/** Sync the most recent N voip.call rows into the D1 call_log cache. */
export async function syncCallLog(env: Env, limit = 100): Promise<number> {
  const uid = await odooAuth(env);
  if (!uid) return 0;
  const fields = ["id", "phone_number", "direction", "state", "partner_id", "user_id", "start_date", "end_date", "create_date", "write_date"];
  const r = await odooCall(env, uid, "voip.call", "search_read",
    [[]], { fields, limit, order: "create_date desc" });
  const calls = ((r.parsed ?? []) as unknown as Array<Record<string, unknown>>);
  const statements: D1PreparedStatement[] = [];
  for (const c of calls) {
    statements.push(env.DB.prepare(
      `INSERT INTO call_log (odoo_id, phone_number, direction, state, partner_id, user_id, start_date, end_date, create_date, write_date)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)
       ON CONFLICT(odoo_id) DO UPDATE SET
         phone_number=excluded.phone_number, direction=excluded.direction, state=excluded.state,
         partner_id=excluded.partner_id, user_id=excluded.user_id, start_date=excluded.start_date,
         end_date=excluded.end_date, create_date=excluded.create_date, write_date=excluded.write_date`
    ).bind(
      c.id as number,
      s(c.phone_number), s(c.direction), s(c.state),
      idOrNull(c.partner_id), idOrNull(c.user_id),
      dt(c.start_date), dt(c.end_date), dt(c.create_date), dt(c.write_date),
    ));
  }
  if (statements.length) await env.DB.batch(statements);
  return calls.length;
}

// ── Call data tracking for Odoo logging on hangup ─────────────

const callData = new Map<string, { caller: string; partnerId?: number; startTime: number }>();

export function trackCall(callId: string, caller: string, partnerId?: number) {
  callData.set(callId, { caller, partnerId, startTime: Date.now() });
}

export async function logCompletedCall(env: Env, callId: string, caller: string, did: string, duration: number) {
  const data = callData.get(callId);
  if (!data) return;
  callData.delete(callId);

  try {
    const uid = await odooAuth(env);
    if (!uid) return;

    // Find partner by caller number
    let partnerId: number | false = data.partnerId || false;
    if (!partnerId) {
      const partner = await lookupCaller(env, caller);
      partnerId = (partner as any)?.id || false;
    }

    const outcome = duration > 0 ? "answered" : "no_answer";
    await odooCall(env, uid, "mail.message", "log_call", [[{
      res_model: partnerId ? "res.partner" : "res.users",
      res_id: partnerId || uid,
      direction: "inbound" as string,
      duration: duration,
      outcome: outcome,
      caller_number: caller,
      callee_number: did,
    }]]);
  } catch (e) {
    console.error("logCompletedCall failed:", e);
  }
}

// ── Contact messages (↔ Odoo mail.message) ────────────────────

export interface Message {
  id?: number;
  odoo_id?: number;
  gmail_id?: string;
  contact_id?: number;
  res_model?: string;
  res_id?: number;
  subject?: string;
  body?: string;
  email_from?: string;
  author_id?: number;
  message_type?: string;
  direction?: string;
  source?: string;
  date?: number;
}

// Our own outbound mail domains — used to infer message direction.
const OUR_SENDER = /(infraredheaterpanels\.co\.uk|infracool\.co\.uk|ihproducts\.co\.uk|systecgroup\.info)/i;

function directionFor(emailFrom: string): string | undefined {
  if (!emailFrom) return undefined;
  return OUR_SENDER.test(emailFrom) ? "outgoing" : "incoming";
}

/** Search Odoo mail.message for a partner thread (model='res.partner',
 *  res_id=partnerId), normalize, and write-through cache into D1. */
export async function searchContactMessages(env: Env, partnerId: number, limit = 50): Promise<Message[]> {
  const uid = await odooAuth(env);
  if (!uid) return [];
  const fields = ["id", "model", "res_id", "subject", "body", "email_from", "author_id", "message_type", "date"];
  const r = await odooCall(env, uid, "mail.message", "search_read",
    [["&", ["model", "=", "res.partner"], ["res_id", "=", partnerId]]],
    { fields, limit, order: "date desc" });
  const msgs = ((r.parsed ?? []) as unknown as Array<Record<string, unknown>>);
  const out: Message[] = msgs.map(m => ({
    odoo_id: m.id as number,
    contact_id: partnerId,
    res_model: s(m.model),
    res_id: typeof m.res_id === "number" ? m.res_id : undefined,
    subject: s(m.subject),
    body: s(m.body),
    email_from: s(m.email_from),
    author_id: idOrNull(m.author_id) ?? undefined,
    message_type: s(m.message_type),
    direction: directionFor(s(m.email_from)),
    source: "odoo",
    date: dt(m.date) ?? undefined,
  }));
  await upsertMessages(env, out);
  return out;
}

/** Upsert messages (Odoo or Gmail) into D1. D1 caps bound params at 100/query,
 *  so each statement is a single row (≤13 params) — no chunking needed. */
export async function upsertMessages(env: Env, msgs: Message[]): Promise<void> {
  if (!msgs.length) return;
  const statements: D1PreparedStatement[] = [];
  for (const m of msgs) {
    if (m.odoo_id != null) {
      statements.push(env.DB.prepare(
        `INSERT INTO messages (odoo_id, contact_id, res_model, res_id, subject, body, email_from, author_id, message_type, direction, source, date, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,'odoo',?11,?12)
         ON CONFLICT(odoo_id) DO UPDATE SET subject=excluded.subject, body=excluded.body, email_from=excluded.email_from, message_type=excluded.message_type, direction=excluded.direction, date=excluded.date, updated_at=excluded.updated_at`
      ).bind(m.odoo_id, m.contact_id ?? null, m.res_model ?? "", m.res_id ?? null, m.subject ?? "", m.body ?? "", m.email_from ?? "", m.author_id ?? null, m.message_type ?? "", m.direction ?? "", m.date ?? null, Date.now()));
    } else if (m.gmail_id != null) {
      statements.push(env.DB.prepare(
        `INSERT INTO messages (gmail_id, contact_id, subject, body, email_from, direction, source, date, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,'gmail',?7,?8)
         ON CONFLICT(gmail_id) DO UPDATE SET subject=excluded.subject, body=excluded.body, email_from=excluded.email_from, direction=excluded.direction, date=excluded.date, updated_at=excluded.updated_at`
      ).bind(m.gmail_id, m.contact_id ?? null, m.subject ?? "", m.body ?? "", m.email_from ?? "", m.direction ?? "", m.date ?? null, Date.now()));
    }
  }
  if (statements.length) await env.DB.batch(statements);
}
