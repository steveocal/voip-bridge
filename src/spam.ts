// ── Likely spam, from IHP's own calls ─────────────────────────
// No outside service: a caller nobody here knows is flagged when their calls
// look like a dialler or a robocall. Only numbers that have never been a
// real contact, never been answered and never been called by IHP are
// considered. The rules (any one is enough):
//
//   short   — this and earlier unanswered calls hung up within SHORT_RING_MS
//             of ringing (silent and abandoned calls from diallers), at least
//             SHORT_COUNT of them in SHORT_DAYS days;
//   sweep   — rang SWEEP_DIDS or more of IHP's numbers within SWEEP_MS,
//             none answered (a dialler working down a number range);
//   message — their voicemail sounds like a recorded message, a cold sales
//             pitch or a scam (the AI call summary, summarize.ts);
//   before  — the number was flagged before.
//
// A flagged call still rings and stays in History with ⚠️, but no Odoo
// contact is made for it, it isn't pushed to Odoo, and it isn't counted as
// a missed call to return. "Not spam" (History) clears the number for good
// and catches its calls up with Odoo; Block (blocked.ts) stops it ringing.
// Stored in call_log.spam and spam_numbers (migrations/0024_spam.sql).

import type { Env } from "./types";
import { phoneKey, sqlPhoneKey, callLegs } from "./odoo";

const SHORT_RING_MS = 6000;
const SHORT_COUNT = 2;
const SHORT_DAYS = 30;
const SWEEP_MS = 10 * 60_000;
const SWEEP_DIDS = 2;
// A "calling" row older than this never got its hangup: not a short call.
const STALE_MS = 2 * 60_000;
// Contacts made automatically for unknown numbers: "17/11/26 01283 …".
const AUTO_NAME = /^\d\d\/\d\d\/\d\d /;

const trunk = (did: unknown) => !!did && did !== "SIM";
const answeredState = (s: unknown) => s === "terminated" || s === "ongoing";

async function verdict(env: Env, key: string) {
  return env.DB.prepare("SELECT verdict, reason FROM spam_numbers WHERE key = ?1").bind(key).first<{ verdict: string; reason: string | null }>();
}

/** The number's standing for the incoming-call screen: why it was flagged,
 *  or "" when it wasn't (or someone said it isn't spam). */
export async function spamReason(env: Env, caller: string): Promise<string> {
  const key = phoneKey(caller);
  if (!key) return "";
  const v = await verdict(env, key);
  return v?.verdict === "spam" ? v.reason || "Looks like spam" : "";
}

/** Someone here knows this number: a real (not auto-named) contact, a call
 *  someone answered, or a call IHP made to it. */
async function knownNumber(env: Env, key: string): Promise<boolean> {
  const r = await env.DB.prepare(
    `SELECT c.direction, c.state, p.name FROM call_log c LEFT JOIN contacts p ON p.id = c.partner_id
     WHERE ${sqlPhoneKey("c.phone_number")} = ?1
       AND (c.direction = 'outgoing' OR c.state IN ('terminated', 'ongoing') OR p.name IS NOT NULL)`
  ).bind(key).all<{ direction: string; state: string; name: string | null }>();
  return (r.results || []).some(x => x.direction === "outgoing" || answeredState(x.state) || (x.name && !AUTO_NAME.test(x.name)));
}

/** At hangup of an incoming call: the reason it looks like spam, or "".
 *  Any leg's hangup may come first, so a trunk leg still "calling" counts
 *  as ending now. */
export async function checkSpam(env: Env, caller: string, callId: string): Promise<string> {
  const key = phoneKey(caller);
  if (!key) return "";
  const v = await verdict(env, key);
  if (v?.verdict === "ok") return "";
  const legs = await callLegs(env, callId);
  if (legs.some(l => answeredState(l.state))) return "";
  if (v?.verdict === "spam") return v.reason || "Flagged before";
  if (await knownNumber(env, key)) return "";

  const now = Date.now();
  const r = await env.DB.prepare(
    `SELECT did, state, start_date, end_date, voicemail FROM call_log
     WHERE ${sqlPhoneKey("phone_number")} = ?1 AND direction = 'incoming' AND start_date > ?2`
  ).bind(key, now - SHORT_DAYS * 86400_000).all<{ did: string | null; state: string; start_date: number; end_date: number | null; voicemail: number }>();
  const calls = (r.results || []).filter(c => trunk(c.did));
  const short = calls.filter(c => {
    if (c.voicemail || answeredState(c.state)) return false;
    const end = c.end_date ?? (c.state === "calling" && now - c.start_date < STALE_MS ? now : null);
    return end !== null && end - c.start_date < SHORT_RING_MS;
  });
  if (short.length >= SHORT_COUNT) return `Hung up within ${SHORT_RING_MS / 1000} s, ${short.length} times`;
  const dids = new Set(calls.filter(c => now - c.start_date < SWEEP_MS).map(c => phoneKey(c.did ?? "")));
  if (dids.size >= SWEEP_DIDS) return `Rang ${dids.size} of our numbers within ${SWEEP_MS / 60_000} minutes`;
  return "";
}

/** Flag the number and its unanswered calls of the last SHORT_DAYS days. */
export async function markSpam(env: Env, caller: string, reason: string): Promise<void> {
  const key = phoneKey(caller);
  if (!key || !reason) return;
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO spam_numbers (key, verdict, reason, at) VALUES (?1, 'spam', ?2, ?3)
       ON CONFLICT(key) DO UPDATE SET reason = excluded.reason, at = excluded.at WHERE spam_numbers.verdict = 'spam'`
    ).bind(key, reason, now),
    env.DB.prepare(
      `UPDATE call_log SET spam = ?2 WHERE ${sqlPhoneKey("phone_number")} = ?1 AND direction = 'incoming'
         AND state NOT IN ('terminated', 'ongoing') AND start_date > ?3`
    ).bind(key, reason, now - SHORT_DAYS * 86400_000),
  ]);
}

/** A voicemail the AI summary called a recorded message, sales pitch or
 *  scam (summarize.ts): flag it, if nobody here knows the number. */
export async function noteNuisanceVoicemail(env: Env, callId: string): Promise<void> {
  const legs = await callLegs(env, callId);
  const first = legs[0];
  if (first?.direction !== "incoming" || !legs.some(l => l.voicemail) || legs.some(l => answeredState(l.state))) return;
  const key = phoneKey(first.phone_number ?? "");
  if (!key) return;
  const v = await verdict(env, key);
  if (v?.verdict === "ok" || (await knownNumber(env, key))) return;
  await markSpam(env, first.phone_number ?? "", "Voicemail sounds like a recorded or sales call");
}

/** "Not spam": the number is never flagged again and its calls are cleared.
 *  Returns the call_ids of its recent calls, to catch up with Odoo. */
export async function clearSpam(env: Env, number: string, userName: string): Promise<string[]> {
  const key = phoneKey(number);
  if (!key) return [];
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO spam_numbers (key, verdict, user_name, at) VALUES (?1, 'ok', ?2, ?3)
       ON CONFLICT(key) DO UPDATE SET verdict = 'ok', reason = NULL, user_name = excluded.user_name, at = excluded.at`
    ).bind(key, userName, Date.now()),
  ]);
  const r = await env.DB.prepare(
    `UPDATE call_log SET spam = NULL WHERE ${sqlPhoneKey("phone_number")} = ?1 AND spam IS NOT NULL RETURNING call_id, did`
  ).bind(key).all<{ call_id: string; did: string | null }>();
  // One per call: the trunk leg stands for the call in Odoo.
  return (r.results || []).filter(c => trunk(c.did)).map(c => c.call_id).slice(0, 20);
}
