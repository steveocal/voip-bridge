import type { Env, ExecutionContext } from "./types";
import { ariRequest } from "./asterisk";
import { lookupCaller, createContactForNumber, pushCallToOdoo } from "./odoo";

// ── Website callback widget ───────────────────────────────────
// public/callback-widget.js (on infraredheaterpanels.co.uk) posts a visitor's
// name + number here. "Call now" (in office hours) originates a call through
// [web-callback] in extensions.conf: 201/202 ring with the visitor as the
// caller, and once one answers Asterisk dials the visitor from the website
// number. "Call later", and "now" calls nobody picks up, land in the call
// history as missed calls with the request in the notes.
//
// Each request is a web_callbacks row plus a call_log row "web-<id>" (did =
// the website number, so the softphones' own legs fold into it).

const WEBSITE_DID = "+441283246490";
const OPEN_DAYS = [1, 2, 3, 4, 5];   // Mon–Fri
const OPEN_FROM = 9 * 60;            // 09:00 (minutes, Europe/London)
const OPEN_UNTIL = 17 * 60 + 30;     // 17:30
const SLOT_MINUTES = 30;
const LATER_DAYS = 5;                // business days offered for "call later"

const HOUR = 3_600_000;
const MAX_PER_IP_HOUR = 3;
const MAX_PER_PHONE_HOUR = 2;
const MAX_TOTAL_HOUR = 30;

// ── Time (Europe/London) ──

function londonParts(at: number) {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short",
  });
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(new Date(at))) p[x.type] = x.value;
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  return { y: +p.year, m: +p.month, d: +p.day, minutes: +p.hour * 60 + +p.minute, weekday };
}

/** Epoch ms of a wall-clock time in London. */
function londonToEpoch(y: number, m: number, d: number, minutes: number): number {
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  const p = londonParts(guess);
  const offset = Date.UTC(p.y, p.m - 1, p.d, 0, p.minutes) - guess;
  return guess - offset;
}

function isOpen(at = Date.now()): boolean {
  const p = londonParts(at);
  return OPEN_DAYS.includes(p.weekday) && p.minutes >= OPEN_FROM && p.minutes < OPEN_UNTIL;
}

/** "Call later" choices: the next few business days, half-hour slots, each
 *  at least an hour away. */
function laterSlots(now = Date.now()) {
  const days: Array<{ label: string; times: Array<{ label: string; at: number }> }> = [];
  const dayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "long", day: "numeric", month: "short" });
  for (let i = 0; days.length < LATER_DAYS && i < 14; i++) {
    const p = londonParts(now + i * 24 * HOUR);
    if (!OPEN_DAYS.includes(p.weekday)) continue;
    const times = [];
    for (let t = OPEN_FROM; t < OPEN_UNTIL; t += SLOT_MINUTES) {
      const at = londonToEpoch(p.y, p.m, p.d, t);
      if (at < now + HOUR) continue;
      times.push({ label: `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`, at });
    }
    if (times.length) days.push({ label: i === 0 ? "Today" : i === 1 ? "Tomorrow" : dayFmt.format(new Date(now + i * 24 * HOUR)), times });
  }
  return days;
}

function fmtLondon(at: number): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(at));
}

// ── Numbers ──

/** Visitor's number → E.164, or null if it isn't a UK/Irish number we're
 *  happy to pay to call (no premium, personal-numbering or pager ranges). */
export function normaliseCallbackNumber(input: string, country: string): string | null {
  const raw = (input || "").trim();
  let digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+")) { /* already international */ }
  else if (digits.startsWith("00")) digits = digits.slice(2);
  else if (country === "IE") digits = "353" + digits.replace(/^0/, "");
  else digits = "44" + digits.replace(/^0/, "");

  if (digits.startsWith("44")) {
    const n = digits.slice(2);
    // 01/02 geographic, 03 non-geographic at geographic rates, 07 mobiles
    // (not 070 personal numbers or 076 pagers).
    if (!/^(1\d{8,9}|2\d{9}|3\d{9}|7[1-57-9]\d{8})$/.test(n)) return null;
    return "+" + digits;
  }
  if (digits.startsWith("353")) {
    const n = digits.slice(3);
    // Geographic and 08x mobiles; not 15xx premium or 18xx shared-cost.
    if (/^1[58]/.test(n)) return null;
    if (!/^([124-79]\d{6,8}|8[35-9]\d{7})$/.test(n)) return null;
    return "+" + digits;
  }
  return null;
}

// ── Helpers ──

function esc(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function newId(): string {
  const b = crypto.getRandomValues(new Uint8Array(12));
  return [...b].map(x => x.toString(16).padStart(2, "0")).join("");
}

async function count(env: Env, where: string, ...args: unknown[]): Promise<number> {
  const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM web_callbacks WHERE ${where}`).bind(...args).first<{ n: number }>();
  return r?.n ?? 0;
}

async function appendNote(env: Env, callId: string, html: string) {
  await env.DB.prepare("UPDATE call_log SET notes_html = COALESCE(notes_html, '') || ?1, write_date = ?2 WHERE call_id = ?3")
    .bind(html, Date.now(), callId).run();
}

/** Link the request's call_log row to the visitor's Odoo contact, creating
 *  one under the name they gave if the number's new. */
async function linkContact(env: Env, callId: string, phone: string, name: string) {
  const contact = await lookupCaller(env, phone) ?? await createContactForNumber(env, phone, Date.now(), name);
  if (contact) await env.DB.prepare("UPDATE call_log SET partner_id = ?1 WHERE call_id = ?2").bind(contact.id, callId).run();
}

// ── Routes ──

/** GET /web-callback/config — whether "call now" is available, and the
 *  "call later" slots. */
export function handleWebCallbackConfig(): Response {
  return Response.json({ open: isOpen(), slots: laterSlots() }, { headers: { "Cache-Control": "no-store" } });
}

/** POST /web-callback — { name, phone, country, mode: "now"|"later", at?, page?, website? (honeypot) } */
export async function handleWebCallback(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  let body: { name?: string; phone?: string; country?: string; mode?: string; at?: number; page?: string; website?: string };
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }

  const name = (body.name ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  const phone = normaliseCallbackNumber(body.phone ?? "", body.country === "IE" ? "IE" : "GB");
  if (!name) return Response.json({ error: "Please enter your name." }, { status: 400 });
  if (!phone) return Response.json({ error: "Please enter a valid UK or Irish phone number." }, { status: 400 });
  const page = (body.page ?? "").slice(0, 300);
  const ip = request.headers.get("CF-Connecting-IP") ?? "";
  const now = Date.now();

  // Bots fill in the hidden field; pretend it worked.
  if (body.website) return Response.json({ ok: true, id: newId(), state: "scheduled" });

  const since = now - HOUR;
  if (ip && await count(env, "ip = ?1 AND created_at > ?2", ip, since) >= MAX_PER_IP_HOUR
    || await count(env, "phone = ?1 AND created_at > ?2", phone, since) >= MAX_PER_PHONE_HOUR
    || await count(env, "created_at > ?1", since) >= MAX_TOTAL_HOUR) {
    return Response.json({ error: "We've already got your request. We'll be in touch shortly." }, { status: 429 });
  }

  let mode: "now" | "later" = body.mode === "later" || !isOpen(now) ? "later" : "now";
  let preferredAt: number | null = null;
  if (mode === "later") {
    const at = Number(body.at);
    const valid = laterSlots(now).some(d => d.times.some(t => t.at === at));
    preferredAt = valid ? at : null;
  }

  const id = newId();
  const callId = `web-${id}`;
  const notes = `<p><b>Website callback request</b>: ${esc(name)}, ${esc(phone)}</p>`
    + `<p>${mode === "now" ? "Asked to be called now." : preferredAt ? `Asked to be called ${esc(fmtLondon(preferredAt))}.` : "Asked to be called back."}</p>`
    + (page ? `<p>From ${esc(page)}</p>` : "");

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO web_callbacks (id, name, phone, mode, preferred_at, page, ip, state, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)`
    ).bind(id, name, phone, mode, preferredAt, page, ip, mode === "now" ? "calling" : "scheduled", now),
    env.DB.prepare(
      `INSERT INTO call_log (call_id, phone_number, did, direction, state, start_date, end_date, notes_html, write_date)
       VALUES (?1, ?2, ?3, 'incoming', ?4, ?5, ?6, ?7, ?5)`
    ).bind(callId, phone, WEBSITE_DID, mode === "now" ? "calling" : "missed", now, mode === "now" ? null : now, notes),
  ]);

  if (mode === "now") {
    const params = new URLSearchParams({
      endpoint: "Local/agents@web-callback/n",
      context: "web-callback", extension: "customer", priority: "1",
      callerId: `"Web: ${name.replace(/["\\]/g, "")}" <${phone}>`,
      timeout: "60",
    });
    let ok = false;
    try {
      const r = await ariRequest(env, `channels?${params}`, "POST", {
        variables: { __CB_ID: id, __CB_NUMBER: phone, __CB_NAME: name.replace(/[^\p{L}\p{N} .'-]/gu, "") },
      }) as { id?: string; message?: string };
      ok = !!r?.id;
      if (!ok) console.error("web-callback originate failed:", r?.message);
    } catch (e) { console.error("web-callback originate failed:", e); }
    if (!ok) {
      mode = "later";
      await markMissed(env, id, "<p>Couldn't start the call.</p>", "failed");
    }
  }

  ctx.waitUntil((async () => {
    try { await linkContact(env, callId, phone, name); } catch (e) { console.error("web-callback contact failed:", e); }
    if (mode === "later") await pushCallToOdoo(env, callId).catch(e => console.error("pushCallToOdoo failed:", e));
  })());

  const state = (await env.DB.prepare("SELECT state FROM web_callbacks WHERE id = ?1").bind(id).first<{ state: string }>())?.state;
  return Response.json({ ok: true, id, state });
}

/** GET /web-callback/status?id= — the widget polls this while calling. */
export async function handleWebCallbackStatus(request: Request, env: Env): Promise<Response> {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const row = await env.DB.prepare("SELECT state FROM web_callbacks WHERE id = ?1").bind(id).first<{ state: string }>();
  if (!row) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ state: row.state }, { headers: { "Cache-Control": "no-store" } });
}

async function markMissed(env: Env, id: string, note: string, state = "missed") {
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("UPDATE web_callbacks SET state = ?1, updated_at = ?2 WHERE id = ?3").bind(state, now, id),
    env.DB.prepare("UPDATE call_log SET state = 'missed', end_date = ?1 WHERE call_id = ?2").bind(now, `web-${id}`),
  ]);
  await appendNote(env, `web-${id}`, note);
}

/** POST /web-callback/event — from [web-callback] in extensions.conf.
 *  event=agent (someone answered; dialling the visitor), missed (nobody
 *  answered), done (customer leg over; status=DIALSTATUS, talk=seconds). */
export async function handleWebCallbackEvent(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const params = new URLSearchParams(await request.text());
  if (!env.PUSH_SECRET || params.get("secret") !== env.PUSH_SECRET) return Response.json({ error: "forbidden" }, { status: 403 });
  const id = params.get("id") ?? "";
  const callId = `web-${id}`;
  const event = params.get("event");
  const now = Date.now();

  if (event === "agent") {
    await env.DB.batch([
      env.DB.prepare("UPDATE web_callbacks SET state = 'connecting', updated_at = ?1 WHERE id = ?2").bind(now, id),
      env.DB.prepare("UPDATE call_log SET state = 'ongoing' WHERE call_id = ?1").bind(callId),
    ]);
  } else if (event === "missed") {
    await markMissed(env, id, "<p>Nobody answered, so this needs calling back.</p>");
    ctx.waitUntil(pushCallToOdoo(env, callId).catch(e => console.error("pushCallToOdoo failed:", e)));
  } else if (event === "done") {
    const status = params.get("status") ?? "";
    const talk = parseInt(params.get("talk") ?? "0") || 0;
    const answered = status === "ANSWER";
    await env.DB.batch([
      env.DB.prepare("UPDATE web_callbacks SET state = ?1, updated_at = ?2 WHERE id = ?3").bind(answered ? "connected" : "no-answer", now, id),
      env.DB.prepare("UPDATE call_log SET state = ?1, end_date = ?2 WHERE call_id = ?3").bind(answered ? "terminated" : "missed", now, callId),
    ]);
    await appendNote(env, callId, answered
      ? `<p>Connected (${Math.floor(talk / 60)}m ${talk % 60}s).</p>`
      : `<p>Called back but the visitor didn't answer (${esc(status.toLowerCase() || "no answer")}).</p>`);
    ctx.waitUntil(pushCallToOdoo(env, callId).catch(e => console.error("pushCallToOdoo failed:", e)));
  } else {
    return Response.json({ error: "unknown event" }, { status: 400 });
  }
  return Response.json({ ok: true });
}
