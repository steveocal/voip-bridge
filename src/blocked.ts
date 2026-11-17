import type { Env, ExecutionContext } from "./types";
import type { User } from "./users";
import { phoneKey } from "./odoo";
import { nudgePbxIfChanged } from "./pbxsync";

// ── Blocked numbers (spam and nuisance callers) ───────────────
// Staff block a number from History (🚫 Block on a selected call) or in
// Settings → Blocked numbers, and can also block withheld numbers. The list
// lives in D1 (blocked_numbers, migrations/0022) and reaches the PBX with
// the rest of its config (GET /pbx/sync "block" lines → astdb pbblock/<key>):
// [pb-route] rejects those calls before anything rings, so no phone wakes,
// no voicemail is left and nothing is answered (or billed).
//
// The worker drops their call events as well (handleCallEvent), which covers
// the minute between blocking a number and the PBX catching up, and keeps
// them out of History and out of Odoo's contacts. Numbers are matched on
// their last 9 digits, like contacts (phoneKey), so any way of writing the
// number blocks it. A caller with fewer than 7 digits counts as withheld.

const WITHHELD = "block_withheld";
const WITHHELD_HITS = "block_withheld_hits";

interface BlockedRow {
  key: string; number: string; label: string | null; user_name: string | null;
  created_at: number; hits: number; last_at: number | null;
}

export const isWithheld = (caller: string) => (caller || "").replace(/\D/g, "").length < 7;

async function setting(env: Env, key: string): Promise<string> {
  return (await env.DB.prepare("SELECT value FROM settings WHERE key = ?1").bind(key).first<{ value: string }>())?.value ?? "";
}
function putSetting(env: Env, key: string, value: string) {
  return env.DB.prepare(
    "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at"
  ).bind(key, value, Date.now());
}

/** Whether calls from `caller` are blocked: its number is on the list, or
 *  it is withheld and withheld numbers are blocked. */
export async function callerBlocked(env: Env, caller: string): Promise<boolean> {
  if (isWithheld(caller)) return (await setting(env, WITHHELD)) === "1";
  const key = phoneKey(caller);
  return !!key && !!(await env.DB.prepare("SELECT 1 AS x FROM blocked_numbers WHERE key = ?1").bind(key).first());
}

/** Count a rejected call against its entry, for the Settings list. */
export async function noteBlockedCall(env: Env, caller: string): Promise<void> {
  if (isWithheld(caller)) {
    await putSetting(env, WITHHELD_HITS, String((Number(await setting(env, WITHHELD_HITS)) || 0) + 1)).run();
    return;
  }
  await env.DB.prepare("UPDATE blocked_numbers SET hits = hits + 1, last_at = ?1 WHERE key = ?2").bind(Date.now(), phoneKey(caller)).run();
}

/** pbx-sync.sh lines: "block <key>" per number, sorted, then "blockwithheld"
 *  when withheld numbers are blocked. */
export async function blockSyncLines(env: Env): Promise<string[]> {
  const [rows, withheld] = await Promise.all([
    env.DB.prepare("SELECT key FROM blocked_numbers ORDER BY key").all<{ key: string }>().then((r) => r.results ?? []),
    setting(env, WITHHELD),
  ]);
  const lines = rows.filter((r) => /^\d{7,9}$/.test(r.key)).map((r) => `block ${r.key}`);
  if (withheld === "1") lines.push("blockwithheld");
  return lines;
}

/** GET /blocked */
export async function handleBlockedList(env: Env): Promise<Response> {
  const [rows, withheld, withheldHits] = await Promise.all([
    env.DB.prepare("SELECT key, number, label, user_name, created_at, hits, last_at FROM blocked_numbers ORDER BY created_at DESC")
      .all<BlockedRow>().then((r) => r.results ?? []),
    setting(env, WITHHELD),
    setting(env, WITHHELD_HITS),
  ]);
  return Response.json({ numbers: rows, withheld: withheld === "1", withheld_hits: Number(withheldHits) || 0 });
}

/** POST /blocked {number, label?} — block a number (again: updates the label). */
export async function handleBlockNumber(request: Request, env: Env, ctx: ExecutionContext, user: User): Promise<Response> {
  let body: { number?: unknown; label?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "invalid JSON" }, { status: 400 }); }
  const number = String(body.number ?? "").replace(/[^0-9+]/g, "").slice(0, 20);
  const key = phoneKey(number);
  if (!key) return Response.json({ error: "Enter a phone number with at least 7 digits." }, { status: 400 });
  const label = String(body.label ?? "").replace(/\s+/g, " ").trim().slice(0, 100) || null;
  await env.DB.prepare(
    `INSERT INTO blocked_numbers (key, number, label, user_id, user_name, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT(key) DO UPDATE SET label = COALESCE(excluded.label, blocked_numbers.label)`
  ).bind(key, number, label, user.id || null, user.name || null, Date.now()).run();
  ctx.waitUntil(nudgePbxIfChanged(env));
  return Response.json({ ok: true, key });
}

/** DELETE /blocked/<key> */
export async function handleUnblockNumber(env: Env, ctx: ExecutionContext, key: string): Promise<Response> {
  if (!/^\d{7,9}$/.test(key)) return Response.json({ error: "bad number" }, { status: 400 });
  await env.DB.prepare("DELETE FROM blocked_numbers WHERE key = ?1").bind(key).run();
  ctx.waitUntil(nudgePbxIfChanged(env));
  return Response.json({ ok: true });
}

/** POST /blocked/withheld {on: boolean} */
export async function handleBlockWithheld(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  let body: { on?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "invalid JSON" }, { status: 400 }); }
  await putSetting(env, WITHHELD, body.on === true ? "1" : "0").run();
  ctx.waitUntil(nudgePbxIfChanged(env));
  return Response.json({ ok: true, withheld: body.on === true });
}
