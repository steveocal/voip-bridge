import type { Env, ExecutionContext } from "./types";
import type { User } from "./users";
import { callLegs, pushCallToOdoo } from "./odoo";
import { ariDeleteRecording } from "./asterisk";

// ── Retention: how long calls are kept ────────────────────────
// Settings → Retention sets, in days (0 = keep for ever):
//   recordingsDays   call audio and voicemail messages (on the PBX)
//   transcriptsDays  the Whisper transcript (call_log.transcript)
//   callsDays        the call itself: its History row, notes, sketch and
//                    AI summary, recording and transcript, missed-call
//                    owner and archive marks
// A call flagged Important (call_log.important, POST /call-important, on
// every leg of the call) is never touched. The flag also goes to Odoo with
// the call (phone_bridge.call.important, pushCallToOdoo), which then won't
// delete it either.
// The cron trigger (wrangler.toml, hourly) runs runRetention. Recordings
// are deleted over ARI, a few per run to stay inside the Free plan's
// subrequest limit, so a large backlog takes several hours to clear.
// The call's row only goes once its audio has, so no file is left behind.
// Not covered: copies already sent to Odoo (phone_bridge.call / voip.call,
// with their recording attachments), and calls made in Odoo itself (rows
// with no call_id), which the Odoo sync would only bring back.

export interface Retention { recordingsDays: number; transcriptsDays: number; callsDays: number }
const FIELDS: (keyof Retention)[] = ["recordingsDays", "transcriptsDays", "callsDays"];
const KEY = "retention";
const LAST = "retention_last";
export const MIN_DAYS = 7;
export const MAX_DAYS = 3650;
const DAY = 86_400_000;
// Recordings per run: up to three ARI deletes each (the mix, -rx and -tx).
const RECORDINGS_PER_RUN = 12;

async function setting(env: Env, key: string): Promise<string> {
  return (await env.DB.prepare("SELECT value FROM settings WHERE key = ?1").bind(key).first<{ value: string }>())?.value ?? "";
}
function putSetting(env: Env, key: string, value: string) {
  return env.DB.prepare(
    "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at"
  ).bind(key, value, Date.now());
}

const valid = (n: number) => Number.isInteger(n) && (n === 0 || (n >= MIN_DAYS && n <= MAX_DAYS));

export async function retention(env: Env): Promise<Retention> {
  let raw: Record<string, unknown> = {};
  try { raw = JSON.parse(await setting(env, KEY) || "{}"); } catch { /* keep everything */ }
  const out: Retention = { recordingsDays: 0, transcriptsDays: 0, callsDays: 0 };
  for (const k of FIELDS) { const n = Number(raw[k]); if (valid(n)) out[k] = n; }
  return out;
}

/** The cut-off (epoch ms) for each kind, 0 = none. Deleting a call takes
 *  its recording and transcript with it, so callsDays caps the others. */
function cutoffs(r: Retention, now = Date.now()) {
  const days = (own: number) => {
    const d = [own, r.callsDays].filter((n) => n > 0);
    return d.length ? Math.min(...d) : 0;
  };
  const at = (d: number) => (d > 0 ? now - d * DAY : 0);
  return { recordings: at(days(r.recordingsDays)), transcripts: at(days(r.transcriptsDays)), calls: at(r.callsDays) };
}

// Rows retention may touch: logged by the PBX or a softphone (call_id set),
// not Important, and older than the cut-off (?1).
const OLD = "call_id IS NOT NULL AND important = 0 AND COALESCE(start_date, create_date) < ?1";

interface Counts { recordings: number; transcripts: number; calls: number }

/** What the settings would remove now. */
async function preview(env: Env, r: Retention): Promise<Counts> {
  const c = cutoffs(r);
  const count = async (cut: number, extra: string) => cut
    ? (await env.DB.prepare(`SELECT COUNT(*) AS n FROM call_log WHERE ${OLD} AND ${extra}`).bind(cut).first<{ n: number }>())?.n ?? 0
    : 0;
  const [recordings, transcripts, calls] = await Promise.all([
    count(c.recordings, "COALESCE(recording, '') != ''"),
    count(c.transcripts, "transcript IS NOT NULL"),
    count(c.calls, "1 = 1"),
  ]);
  return { recordings, transcripts, calls };
}

/** One pass. Returns what it removed. */
export async function runRetention(env: Env): Promise<Counts & { more: boolean }> {
  const c = cutoffs(await retention(env));
  const done: Counts & { more: boolean } = { recordings: 0, transcripts: 0, calls: 0, more: false };
  if (c.recordings) {
    const rows = (await env.DB.prepare(
      `SELECT id, recording FROM call_log WHERE ${OLD} AND COALESCE(recording, '') != '' ORDER BY start_date LIMIT ?2`
    ).bind(c.recordings, RECORDINGS_PER_RUN + 1).all<{ id: number; recording: string }>()).results ?? [];
    done.more = rows.length > RECORDINGS_PER_RUN;
    for (const row of rows.slice(0, RECORDINGS_PER_RUN)) {
      // Only names the PBX gives files ([record-call], [voicemail]).
      if (!/^[A-Za-z0-9_-]+$/.test(row.recording)) continue;
      const names = row.recording.endsWith("-vm") ? [row.recording] : [row.recording, `${row.recording}-rx`, `${row.recording}-tx`];
      let gone = true;
      for (const n of names) {
        try { if (!(await ariDeleteRecording(env, n))) gone = false; } catch { gone = false; }
      }
      if (!gone) { console.error("retention: couldn't delete recording", row.recording); continue; }
      await env.DB.prepare("UPDATE call_log SET recording = NULL WHERE id = ?1").bind(row.id).run();
      done.recordings++;
    }
  }
  if (c.transcripts) {
    const r = await env.DB.prepare(`UPDATE call_log SET transcript = NULL WHERE ${OLD} AND transcript IS NOT NULL`).bind(c.transcripts).run();
    done.transcripts = Number(r.meta.changes) || 0;
  }
  if (c.calls) {
    const gone = `SELECT id FROM call_log WHERE ${OLD} AND COALESCE(recording, '') = ''`;
    const res = await env.DB.batch([
      env.DB.prepare(`DELETE FROM missed_owner WHERE call_log_id IN (${gone})`).bind(c.calls),
      env.DB.prepare(`DELETE FROM call_hidden WHERE call_log_id IN (${gone})`).bind(c.calls),
      env.DB.prepare(`DELETE FROM call_log WHERE ${OLD} AND COALESCE(recording, '') = ''`).bind(c.calls),
    ]);
    done.calls = Number(res[2].meta.changes) || 0;
  }
  if (done.recordings || done.transcripts || done.calls) console.log("retention:", done);
  let total: Counts = { recordings: 0, transcripts: 0, calls: 0 };
  try { total = { ...total, ...JSON.parse(await setting(env, LAST) || "{}").total }; } catch { /* first run */ }
  for (const k of ["recordings", "transcripts", "calls"] as const) total[k] += done[k];
  await putSetting(env, LAST, JSON.stringify({ at: Date.now(), done, total })).run();
  return done;
}

/** GET /retention */
export async function handleGetRetention(env: Env): Promise<Response> {
  let last: unknown = null;
  try { last = JSON.parse(await setting(env, LAST) || "null"); } catch { /* none */ }
  const kept = (await env.DB.prepare("SELECT COUNT(DISTINCT call_id) AS n FROM call_log WHERE important = 1").first<{ n: number }>())?.n ?? 0;
  return Response.json({ retention: await retention(env), min: MIN_DAYS, max: MAX_DAYS, last, kept });
}

/** POST /retention {recordingsDays, transcriptsDays, callsDays, dry?}.
 *  dry: only count what the new settings would remove, save nothing. */
export async function handleSetRetention(request: Request, env: Env): Promise<Response> {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: "invalid JSON" }, { status: 400 }); }
  const r: Retention = { recordingsDays: 0, transcriptsDays: 0, callsDays: 0 };
  for (const k of FIELDS) {
    const n = Number(body[k] ?? 0);
    if (!valid(n)) return Response.json({ error: `Days must be 0 (keep for ever) or from ${MIN_DAYS} to ${MAX_DAYS}` }, { status: 400 });
    r[k] = n;
  }
  const would = await preview(env, r);
  if (body.dry === true) return Response.json({ ok: true, retention: r, would });
  await putSetting(env, KEY, JSON.stringify(r)).run();
  return Response.json({ ok: true, retention: r, would });
}

/** POST /call-important {call_id, important}: the Important flag on every
 *  leg of the call, then the call goes to Odoo with it. */
export async function handleCallImportant(request: Request, env: Env, ctx: ExecutionContext, user: User, mayOpen: (callId: string) => Promise<boolean>): Promise<Response> {
  let body: { call_id?: unknown; important?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "invalid JSON" }, { status: 400 }); }
  const callId = String(body.call_id ?? "");
  if (!callId) return Response.json({ error: "call_id required" }, { status: 400 });
  if (!(await mayOpen(callId))) return Response.json({ error: "not your call" }, { status: 403 });
  const on = body.important === true;
  const legs = await callLegs(env, callId);
  const ids = legs.map((l) => Number(l.id)).filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) return Response.json({ error: "call not found" }, { status: 404 });
  await env.DB.batch(ids.map((id) => env.DB.prepare("UPDATE call_log SET important = ?1, important_by = ?2, important_at = ?3 WHERE id = ?4")
    .bind(on ? 1 : 0, on ? (user.name || `ext ${user.ext}`) : null, on ? Date.now() : null, id)));
  ctx.waitUntil(pushCallToOdoo(env, callId).catch((e) => console.error("pushCallToOdoo (important) failed:", e)));
  return Response.json({ ok: true, important: on, legs: ids.length });
}
