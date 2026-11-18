// Missed-call ownership. Unanswered calls show to everyone (users.ts
// canSee), so without this two people ring back, or nobody does. Each
// missed call is open, claimed by someone ("I'll call back"), or done.
// Done is either marked by hand or found: a later answered call, in or out,
// with the same number (whoever took it is named as having called back).
// Stored per leg in missed_owner (migrations/0023_missed_owner.sql).

import type { Env } from "./types";
import { type User, type ExtensionOwner, callOwner } from "./users";

type Call = Record<string, unknown>;

export function isMissed(c: Call): boolean {
  return c.direction === "incoming" && ["missed", "rejected", "aborted"].includes(String(c.state));
}
function numberKey(n: unknown): string {
  const d = String(n ?? "").replace(/\D/g, "");
  return d.length >= 7 ? d.slice(-9) : "";
}

/** groups: merged calls with their legs, newest first (as mergeCallLegs
 *  builds them, before other people's calls are dropped). Each missed call
 *  gets returned_at / returned_name from the nearest later answered call
 *  with the same number. */
export function markReturned(groups: { legs: Call[]; call: Call }[], owners: Map<string, ExtensionOwner>): void {
  const answered = new Map<string, { at: number; name: string }>();
  for (const g of groups) {
    const key = numberKey(g.call.phone_number);
    if (!key) continue;
    if (isMissed(g.call)) {
      const r = answered.get(key);
      if (r) { g.call.returned_at = r.at; g.call.returned_name = r.name; }
    } else if (g.call.state === "terminated" || g.call.state === "ongoing") {
      const uid = callOwner(g.legs, owners);
      let name = "";
      for (const o of owners.values()) if (uid !== null && o.user_id === uid) { name = o.user_name; break; }
      answered.set(key, { at: Number(g.call.start_date) || 0, name });
    }
  }
}

type OwnerRow = { call_log_id: number; own_id: number | null; own_name: string | null; own_at: number | null; done_id: number | null; done_name: string | null; done_at: number | null; reopened_at: number | null };

/** Adds own_id/own_name/own_at/own_mine, done_name/done_at and reopened_at
 *  to the missed calls, from any of their legs (the newest change wins). */
export async function attachOwners(env: Env, calls: Call[], viewer: User): Promise<Call[]> {
  const missed = calls.filter(isMissed);
  const ids = missed.flatMap(c => (c.leg_ids as number[] | undefined) ?? [c.id as number]);
  if (!ids.length) return calls;
  // Without the table (migration 0023 not applied yet) History still loads.
  const r = await env.DB.prepare(
    "SELECT * FROM missed_owner WHERE call_log_id IN (SELECT value FROM json_each(?1))"
  ).bind(JSON.stringify(ids)).all<OwnerRow>().catch(() => ({ results: [] as OwnerRow[] }));
  const byLeg = new Map((r.results || []).map(o => [Number(o.call_log_id), o]));
  for (const c of missed) {
    const rows = ((c.leg_ids as number[] | undefined) ?? [c.id as number]).map(id => byLeg.get(Number(id))).filter((o): o is OwnerRow => !!o);
    if (!rows.length) continue;
    const latest = (f: (o: OwnerRow) => number | null) => rows.reduce<OwnerRow | null>((a, o) => (f(o) ?? 0) > (a ? f(a) ?? 0 : 0) ? o : a, null);
    const own = latest(o => o.own_at), done = latest(o => o.done_at), re = latest(o => o.reopened_at);
    if (own?.own_id) { c.own_id = own.own_id; c.own_name = own.own_name; c.own_at = own.own_at; c.own_mine = own.own_id === viewer.id ? 1 : 0; }
    if (done) { c.done_name = done.done_name; c.done_at = done.done_at; }
    if (re) c.reopened_at = re.reopened_at;
  }
  return calls;
}

/** POST /call-history/missed {ids: leg ids, action: claim|release|done|reopen, force?}
 *  claim on a call someone else has claimed needs force (Take over). */
export async function handleMissedAction(request: Request, env: Env, user: User, mayOpen: (callId: string) => Promise<boolean>): Promise<Response> {
  let body: { ids?: unknown; action?: unknown; force?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "invalid JSON" }, { status: 400 }); }
  const ids = (Array.isArray(body.ids) ? body.ids : []).map(Number).filter(n => Number.isInteger(n) && n > 0).slice(0, 20);
  const action = String(body.action ?? "");
  if (!ids.length || !["claim", "release", "done", "reopen"].includes(action)) return Response.json({ error: "ids and action needed" }, { status: 400 });
  if (!user.id) return Response.json({ error: "sign in as a user" }, { status: 403 });
  const legs = await env.DB.prepare("SELECT id, call_id FROM call_log WHERE id IN (SELECT value FROM json_each(?1))")
    .bind(JSON.stringify(ids)).all<{ id: number; call_id: string }>();
  const found = legs.results || [];
  if (!found.length) return Response.json({ error: "no such call" }, { status: 404 });
  if (!(await mayOpen(found[0].call_id))) return Response.json({ error: "not your call" }, { status: 403 });
  const legIds = found.map(l => l.id);
  if (action === "claim" && !body.force) {
    const other = await env.DB.prepare(
      "SELECT own_name FROM missed_owner WHERE call_log_id IN (SELECT value FROM json_each(?1)) AND own_id IS NOT NULL AND own_id != ?2 AND done_at IS NULL LIMIT 1"
    ).bind(JSON.stringify(legIds), user.id).first<{ own_name: string }>();
    if (other) return Response.json({ error: "taken", own_name: other.own_name }, { status: 409 });
  }
  const now = Date.now();
  const upd: Record<string, [string, unknown[]]> = {
    claim: ["own_id=?2, own_name=?3, own_at=?4, done_id=NULL, done_name=NULL, done_at=NULL", [user.id, user.name, now]],
    release: ["own_id=NULL, own_name=NULL, own_at=NULL", []],
    done: ["done_id=?2, done_name=?3, done_at=?4", [user.id, user.name, now]],
    reopen: ["done_id=NULL, done_name=NULL, done_at=NULL, reopened_at=?2", [now]],
  };
  const [set, args] = upd[action];
  await env.DB.batch(legIds.flatMap(id => [
    env.DB.prepare("INSERT INTO missed_owner (call_log_id) VALUES (?1) ON CONFLICT(call_log_id) DO NOTHING").bind(id),
    env.DB.prepare(`UPDATE missed_owner SET ${set} WHERE call_log_id = ?1`).bind(id, ...args),
  ]));
  return Response.json({ ok: true, action, at: now, name: user.name, user_id: user.id });
}
