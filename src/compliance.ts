import type { Env } from "./types";
import type { User } from "./users";
import { odooAuth, odooCall, phoneKey } from "./odoo";
import { ariDeleteRecording } from "./asterisk";

// ── UK compliance: admins, the audit log, data requests ───────
// Admins are the Odoo users in Settings → Administration (base.group_system).
// syncAdmins copies their ids into settings.admin_user_ids with every
// extension sync; the Odoo addon itself (API_TOKEN) also counts.
//
// The audit log (audit_log, migration 0029) records who listened to a
// recording, changed retention or call limits, blocked a number, exported
// or erased a caller's data, or signed in: time, user, extension and IP.
// Admins read it in Configuration → Audit. Kept AUDIT_DAYS.
//
// Data requests (UK GDPR subject access and erasure), Configuration →
// Privacy, admins only, by phone number (matched on its last 9 digits):
//   GET  /privacy/export?number=…  everything held about that number, as JSON
//   POST /privacy/erase {number, confirm, include_important?}
// Erasing removes the calls (History, notes, summaries, transcripts,
// missed-call marks), queues their recordings for deletion on the PBX
// (erase_recordings, worked through by the hourly cron), deletes the Odoo
// copies (phone_bridge.call / voip.call) and the website callback requests
// and spam verdicts for the number. Calls flagged Important are kept unless
// include_important is set. Not touched, and listed in the answer for the
// admin to deal with by hand: the Odoo contact (it may have quotes, orders
// and invoices that must be kept), emails in Gmail, and a block on the
// number (kept so the block still works).

const AUDIT_DAYS = 730;
// Three ARI deletes each; retention uses 36 of the 50 subrequests per run.
const ERASE_PER_RUN = 3;
const PLAY_DEDUP_MS = 10 * 60_000;

// ── Admins ─────────────────────────────────────────────────────

let adminCache: { at: number; ids: Set<number> } | null = null;

/** Called from syncExtensions with its Odoo login. Never throws. */
export async function syncAdmins(env: Env, uid: number): Promise<void> {
  try {
    const x = await odooCall(env, uid, "ir.model.data", "search_read",
      [[["module", "=", "base"], ["name", "=", "group_system"]]], { fields: ["res_id"], limit: 1 });
    const gid = (x.parsed as Array<{ res_id: number }> | null)?.[0]?.res_id;
    if (x.fault || !gid) { console.warn("admins: base.group_system not found", String(x.fault ?? "").slice(-200)); return; }
    // Odoo 19 has all_user_ids (with implied groups) and user_ids; older ones users.
    let ids: number[] | null = null;
    for (const f of ["all_user_ids", "user_ids", "users"]) {
      const r = await odooCall(env, uid, "res.groups", "read", [[gid]], { fields: [f] });
      const v = (r.parsed as Array<Record<string, unknown>> | null)?.[0]?.[f];
      if (!r.fault && Array.isArray(v)) { ids = v as number[]; break; }
    }
    if (!ids) return;
    await env.DB.prepare(
      "INSERT INTO settings (key, value, updated_at) VALUES ('admin_user_ids', ?1, ?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at"
    ).bind(JSON.stringify(ids.filter((n) => Number.isInteger(n))), Date.now()).run();
    adminCache = null;
  } catch (e) {
    console.error("syncAdmins failed:", e);
  }
}

export async function isAdmin(env: Env, user: User): Promise<boolean> {
  if (user.service) return true;
  if (!adminCache || Date.now() - adminCache.at > 60_000) {
    let ids: number[] = [];
    try {
      const v = (await env.DB.prepare("SELECT value FROM settings WHERE key = 'admin_user_ids'").first<{ value: string }>())?.value;
      ids = v ? JSON.parse(v) : [];
    } catch { /* none */ }
    adminCache = { at: Date.now(), ids: new Set(ids) };
  }
  return adminCache.ids.has(user.id);
}

export const adminOnly = () => Response.json({ error: "Only Odoo administrators can do this" }, { status: 403 });

// ── Audit log ──────────────────────────────────────────────────

export interface AuditWho { user?: User | null; name?: string; ext?: string; ip?: string }

export function clientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") || "";
}

/** Never throws: auditing must not break what it records. */
export async function audit(env: Env, who: AuditWho, action: string, target = "", detail: unknown = null): Promise<void> {
  try {
    const u = who.user;
    await env.DB.prepare(
      "INSERT INTO audit_log (at, user_id, user_name, ext, ip, action, target, detail) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)"
    ).bind(Date.now(), u && !u.service ? u.id : null, who.name ?? (u?.service ? "Odoo" : u?.name || null), who.ext ?? (u?.ext || null),
      who.ip || null, action, target ? String(target).slice(0, 200) : null,
      detail == null ? null : (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 2000)).run();
  } catch (e) {
    console.error("audit failed:", action, e);
  }
}

/** A recording played: once per user and call every 10 minutes (the audio
 *  player asks for the file several times while it plays). */
export async function auditPlay(env: Env, user: User, ip: string, callId: string, kind: string): Promise<void> {
  try {
    const seen = await env.DB.prepare(
      "SELECT 1 FROM audit_log WHERE action = 'recording.play' AND target = ?1 AND user_id IS ?2 AND at > ?3 LIMIT 1"
    ).bind(callId, user.service ? null : user.id, Date.now() - PLAY_DEDUP_MS).first();
    if (!seen) await audit(env, { user, ip }, "recording.play", callId, kind);
  } catch (e) {
    console.error("auditPlay failed:", e);
  }
}

/** GET /audit?action=&q=&before=<id>&limit= — newest first. */
export async function handleAudit(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const action = (url.searchParams.get("action") ?? "").replace(/[^a-z.]/g, "");
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 60);
  const before = parseInt(url.searchParams.get("before") ?? "0", 10) || 0;
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "100", 10) || 100, 1), 500);
  const where: string[] = [];
  const args: unknown[] = [];
  if (action) { args.push(action.endsWith(".") ? `${action}%` : action); where.push(`action LIKE ?${args.length}`); }
  if (q) { args.push(`%${q}%`); where.push(`(target LIKE ?${args.length} OR user_name LIKE ?${args.length} OR ext LIKE ?${args.length} OR ip LIKE ?${args.length})`); }
  if (before) { args.push(before); where.push(`id < ?${args.length}`); }
  args.push(limit);
  const rows = (await env.DB.prepare(
    `SELECT id, at, user_id, user_name, ext, ip, action, target, detail FROM audit_log ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY id DESC LIMIT ?${args.length}`
  ).bind(...args).all()).results ?? [];
  return Response.json({ entries: rows, days: AUDIT_DAYS });
}

// ── Data requests ──────────────────────────────────────────────

/** SQL for a column's last 9 digits (spaces, +, -, brackets and dots dropped). */
function key9Sql(col: string): string {
  let e = `COALESCE(${col}, '')`;
  for (const ch of " +-()./") e = `replace(${e}, '${ch}', '')`;
  return `substr(${e}, -9)`;
}

function numberKey(raw: unknown): string {
  return phoneKey(String(raw ?? ""));
}

interface CallRow {
  id: number; call_id: string | null; did: string | null; phone_number: string | null; direction: string | null; state: string | null;
  partner_id: number | null; user_id: number | null; extension: string | null; start_date: number | null; end_date: number | null;
  answered_at: number | null; notes_html: string | null; transcript: string | null; recording: string | null; voicemail: number;
  callback: number; spam: string | null; important: number; important_by: string | null; odoo_id: number | null;
}

async function callsFor(env: Env, key: string): Promise<CallRow[]> {
  return (await env.DB.prepare(
    `SELECT id, call_id, did, phone_number, direction, state, partner_id, user_id, extension, start_date, end_date, answered_at,
            notes_html, transcript, recording, voicemail, callback, spam, important, important_by, odoo_id
       FROM call_log WHERE ${key9Sql("phone_number")} = ?1 ORDER BY start_date`
  ).bind(key).all<CallRow>()).results ?? [];
}

const iso = (ms: number | null) => (ms ? new Date(ms).toISOString() : null);

/** GET /privacy/export?number=… */
export async function handlePrivacyExport(request: Request, env: Env, user: User): Promise<Response> {
  const number = (new URL(request.url).searchParams.get("number") ?? "").trim();
  const key = numberKey(number);
  if (!key) return Response.json({ error: "Enter a phone number (at least 7 digits)" }, { status: 400 });
  const [calls, contacts, callbacks, spam, blocked, owners] = await Promise.all([
    callsFor(env, key),
    env.DB.prepare(`SELECT id, name, is_company, phone, mobile, email, website, vat, function, city FROM contacts WHERE ${key9Sql("phone")} = ?1 OR ${key9Sql("mobile")} = ?1`).bind(key).all(),
    env.DB.prepare(`SELECT name, phone, mode, preferred_at, page, state, created_at FROM web_callbacks WHERE ${key9Sql("phone")} = ?1 ORDER BY created_at`).bind(key).all(),
    env.DB.prepare("SELECT verdict, reason, user_name, at FROM spam_numbers WHERE key = ?1").bind(key).all(),
    env.DB.prepare("SELECT number, label, user_name, created_at, hits, last_at FROM blocked_numbers WHERE key = ?1").bind(key).all(),
    env.DB.prepare("SELECT DISTINCT user_id, user_name FROM extensions WHERE user_id IS NOT NULL").all<{ user_id: number; user_name: string }>(),
  ]);
  const userName = new Map((owners.results ?? []).map((o) => [o.user_id, o.user_name]));
  const partnerIds = (contacts.results ?? []).map((c) => (c as { id: number }).id);
  const messages = partnerIds.length
    ? (await env.DB.prepare(
      `SELECT contact_id, source, subject, email_from, direction, date, body FROM messages WHERE contact_id IN (SELECT value FROM json_each(?1)) ORDER BY date`
    ).bind(JSON.stringify(partnerIds)).all()).results ?? []
    : [];
  const out = {
    about: `Data held by the phone system about ${number}`,
    generated_at: new Date().toISOString(),
    generated_by: user.name || (user.service ? "Odoo" : `ext ${user.ext}`),
    matched_on: `numbers ending ${key}`,
    calls: calls.map((c) => ({
      call_id: c.call_id, direction: c.direction, state: c.state, number: c.phone_number, our_number: c.did,
      extension: c.extension, staff: c.user_id ? userName.get(c.user_id) ?? `user ${c.user_id}` : null,
      started: iso(c.start_date), answered: iso(c.answered_at), ended: iso(c.end_date),
      voicemail: !!c.voicemail, callback_requested: !!c.callback, spam: c.spam, important: !!c.important,
      notes_html: c.notes_html || null, transcript: c.transcript,
      recording: c.recording ? { stored_as: c.recording, play: `/recording?call_id=${encodeURIComponent(c.call_id ?? "")}` } : null,
    })),
    contacts_in_odoo: contacts.results ?? [],
    emails_and_messages: messages,
    website_callback_requests: callbacks.results ?? [],
    spam_verdicts: spam.results ?? [],
    blocked: blocked.results ?? [],
    not_included: [
      "Recording audio: each call's recording.play link plays it in the dashboard (signed in); download it from there.",
      "The Odoo contact's quotes, orders, invoices and chatter: export them from Odoo.",
      "Emails still in Gmail mailboxes: search Gmail for the person's address.",
    ],
  };
  await audit(env, { user, ip: clientIp(request) }, "privacy.export", number, { key, calls: calls.length });
  const name = `data-${key}-${new Date().toISOString().slice(0, 10)}.json`;
  return new Response(JSON.stringify(out, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
}

/** POST /privacy/erase {number, confirm, include_important?} — confirm must
 *  repeat the number (the dashboard asks for it typed again). */
export async function handlePrivacyErase(request: Request, env: Env, user: User): Promise<Response> {
  let body: { number?: unknown; confirm?: unknown; include_important?: unknown; dry?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "invalid JSON" }, { status: 400 }); }
  const number = String(body.number ?? "").trim();
  const key = numberKey(number);
  if (!key) return Response.json({ error: "Enter a phone number (at least 7 digits)" }, { status: 400 });
  const withImportant = body.include_important === true;
  const all = await callsFor(env, key);
  const calls = all.filter((c) => withImportant || !c.important);
  const kept = all.length - calls.length;
  const [contacts, blocked] = await Promise.all([
    env.DB.prepare(`SELECT id, name FROM contacts WHERE ${key9Sql("phone")} = ?1 OR ${key9Sql("mobile")} = ?1`).bind(key).all<{ id: number; name: string }>(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM blocked_numbers WHERE key = ?1").bind(key).first<{ n: number }>(),
  ]);
  const left = {
    odoo_contacts: (contacts.results ?? []).map((c) => ({ id: c.id, name: c.name })),
    blocked: (blocked?.n ?? 0) > 0,
    important_kept: kept,
  };
  const recordings = [...new Set(calls.map((c) => c.recording).filter((r): r is string => !!r && /^[A-Za-z0-9_-]+$/.test(r)))];
  if (body.dry === true) {
    return Response.json({ ok: true, dry: true, calls: calls.length, recordings: recordings.length, left });
  }
  if (numberKey(body.confirm) !== key) return Response.json({ error: "Type the number again to confirm" }, { status: 400 });

  // Odoo's copies first: if Odoo is down, nothing local is lost yet.
  const callIds = [...new Set(calls.map((c) => c.call_id).filter((x): x is string => !!x))];
  const odoo = { deleted: 0, error: "" };
  if (callIds.length) {
    const uid = await odooAuth(env);
    if (!uid) return Response.json({ error: "Odoo is unavailable, so nothing was erased. Try again later." }, { status: 502 });
    for (const model of ["phone_bridge.call", "voip.call"]) {
      const found = await odooCall(env, uid, model, "search", [[["bridge_call_id", "in", callIds]]], { context: { active_test: false } });
      if (found.fault) continue;   // model or field not there
      const ids = (found.parsed as number[] | null) ?? [];
      if (!ids.length) continue;
      const del = await odooCall(env, uid, model, "unlink", [ids]);
      if (del.fault) odoo.error = `${model}: ${String(del.fault).slice(-200)}`;
      else odoo.deleted += ids.length;
    }
    if (odoo.error) return Response.json({ error: `Odoo refused to delete its copies, so nothing was erased: ${odoo.error}` }, { status: 502 });
  }

  const rowIds = JSON.stringify(calls.map((c) => c.id));
  const now = Date.now();
  const res = await env.DB.batch([
    ...recordings.map((r) => env.DB.prepare("INSERT OR IGNORE INTO erase_recordings (name, at) VALUES (?1, ?2)").bind(r, now)),
    env.DB.prepare("DELETE FROM missed_owner WHERE call_log_id IN (SELECT value FROM json_each(?1))").bind(rowIds),
    env.DB.prepare("DELETE FROM call_hidden WHERE call_log_id IN (SELECT value FROM json_each(?1))").bind(rowIds),
    env.DB.prepare("DELETE FROM call_log WHERE id IN (SELECT value FROM json_each(?1))").bind(rowIds),
    env.DB.prepare(`DELETE FROM web_callbacks WHERE ${key9Sql("phone")} = ?1`).bind(key),
    env.DB.prepare("DELETE FROM spam_numbers WHERE key = ?1").bind(key),
    env.DB.prepare(`UPDATE push_log SET caller = NULL WHERE ${key9Sql("caller")} = ?1`).bind(key),
  ]);
  const done = {
    calls: Number(res[recordings.length + 2].meta.changes) || 0,
    recordings_queued: recordings.length,
    odoo_calls: odoo.deleted,
    website_callbacks: Number(res[recordings.length + 3].meta.changes) || 0,
  };
  await audit(env, { user, ip: clientIp(request) }, "privacy.erase", number, { key, ...done, important_kept: kept });
  return Response.json({ ok: true, done, left });
}

/** Hourly (with retention): delete queued recordings on the PBX, and old
 *  audit rows. */
export async function runCompliance(env: Env): Promise<void> {
  const rows = (await env.DB.prepare("SELECT name FROM erase_recordings ORDER BY at LIMIT ?1").bind(ERASE_PER_RUN).all<{ name: string }>()).results ?? [];
  let n = 0;
  for (const { name } of rows) {
    const names = name.endsWith("-vm") ? [name] : [name, `${name}-rx`, `${name}-tx`];
    let gone = true;
    for (const f of names) {
      try { if (!(await ariDeleteRecording(env, f))) gone = false; } catch { gone = false; }
    }
    if (!gone) { console.error("erase: couldn't delete recording", name); continue; }
    await env.DB.prepare("DELETE FROM erase_recordings WHERE name = ?1").bind(name).run();
    n++;
  }
  if (n) await audit(env, { name: "System" }, "recording.delete", "", { erased_on_request: n });
  await env.DB.prepare("DELETE FROM audit_log WHERE at < ?1").bind(Date.now() - AUDIT_DAYS * 86_400_000).run();
}
