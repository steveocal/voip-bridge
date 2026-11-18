// ── Reports ────────────────────────────────────────────────────
// GET /reports?from=YYYY-MM-DD&to=YYYY-MM-DD (UK days, inclusive): the
// figures behind the dashboard's Reports screen, worked out from call_log.
// Each call's legs are folded into one call first (calllegs.ts), as History
// does, so one inbound call that rang five phones counts once.
//
// Everyone signed in sees the team's figures: counts and times per person
// and per number, never a call's notes, recording or transcript.
//
// Time on a call is end - answered_at (migrations/0025_answered_at.sql);
// calls from before answered_at was recorded fall back to ring-to-hang-up,
// which runs a little long. Time to answer only counts calls that have it.
// Calls between extensions (a number of 1-6 digits) are left out of every
// figure and only counted, as "internal".

import type { Env } from "./types";
import { groupCallLegs } from "./calllegs";
import { phoneKey, sqlPhoneKey } from "./odoo";
import { type User, type ExtensionOwner, callOwner, extensionOwners } from "./users";
import { markReturned, attachOwners } from "./missed";

type Row = {
  id: number; call_id: string; phone_number: string | null; did: string | null; direction: string;
  state: string; start_date: number; end_date: number | null; answered_at: number | null;
  voicemail: number; callback: number; extension: string | null; user_id: number | null;
  spam: string | null; partner_id: number | null; partner_name: string | null;
};

const TZ = "Europe/London";
const MAX_DAYS = 400;

const parts = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", weekday: "short", hourCycle: "h23",
});
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function london(ms: number) {
  const p: Record<string, string> = {};
  for (const x of parts.formatToParts(new Date(ms))) p[x.type] = x.value;
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24, weekday: WEEKDAYS.indexOf(p.weekday) };
}
/** Midnight at the start of a UK day, in ms. The UK is UTC or UTC+1. */
function londonMidnight(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  const utc = Date.UTC(y, m - 1, d);
  return utc - london(utc).hour * 3600_000;
}
function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

interface Call {
  legs: Row[];
  call: Record<string, unknown>;
  dir: "in" | "out";
  start: number;
  answered: boolean;
  missed: boolean;
  spam: boolean;
  voicemail: boolean;
  callback: boolean;
  secs: number;           // time on the call (0 when not connected)
  answerSecs: number | null;
  owner: number | null;   // res.users.id of who took / made it
  did: string;            // our number it came in on (phoneKey), "SIM", or ""
  didLabel: string;
  key: string;            // the other party's phoneKey
  number: string;
  name: string;
}

function foldCall(legs: Row[], owners: Map<string, ExtensionOwner>): Call {
  const first = legs[0];
  const out = first.direction === "outgoing";
  const trunk = legs.find(l => l.did && l.did !== "SIM");
  const took = out ? first : legs.find(l => !l.did && (l.state === "terminated" || l.state === "ongoing"));
  const start = Math.min(...legs.map(l => l.start_date || Infinity));
  const connected = !!took && took.state === "terminated" && !!took.end_date;
  const from = took?.answered_at ?? took?.start_date ?? start;
  const secs = connected && took?.end_date ? Math.max(0, Math.round((took.end_date - from) / 1000)) : 0;
  const answerSecs = !out && took?.answered_at ? Math.max(0, Math.round((took.answered_at - start) / 1000)) : null;
  const spam = legs.some(l => l.spam);
  const voicemail = legs.some(l => l.voicemail);
  const answered = !out && !!took;
  const did = out ? (first.did === "SIM" ? "SIM" : "") : phoneKey(trunk?.did ?? "");
  const call: Record<string, unknown> = {
    id: (trunk ?? first).id, leg_ids: legs.map(l => l.id), phone_number: first.phone_number,
    direction: first.direction, start_date: start,
    state: took ? took.state : (trunk ?? first).state,
  };
  return {
    legs, call, dir: out ? "out" : "in", start, answered,
    missed: !out && !took && !spam, spam, voicemail, callback: legs.some(l => l.callback),
    secs, answerSecs, owner: callOwner(legs as unknown as Record<string, unknown>[], owners),
    did, didLabel: out ? (did === "SIM" ? "Phone SIM" : "") : (trunk?.did ?? ""),
    key: phoneKey(first.phone_number ?? ""), number: first.phone_number ?? "",
    name: legs.find(l => l.partner_name)?.partner_name ?? "",
  };
}

function summary(calls: Call[]) {
  const inc = calls.filter(c => c.dir === "in");
  const out = calls.filter(c => c.dir === "out");
  const real = inc.filter(c => !c.spam);
  const answered = inc.filter(c => c.answered);
  const talked = calls.filter(c => c.secs > 0);
  const callSecs = talked.reduce((a, c) => a + c.secs, 0);
  const waits = answered.map(c => c.answerSecs).filter((s): s is number => s !== null);
  return {
    calls: calls.length,
    incoming: inc.length,
    outgoing: out.length,
    answered: answered.length,
    missed: inc.filter(c => c.missed).length,
    voicemail: inc.filter(c => c.voicemail && !c.spam).length,
    callbacks: inc.filter(c => c.callback).length,
    spam: inc.filter(c => c.spam).length,
    answerRate: real.length ? answered.length / real.length : null,
    outgoingConnected: out.filter(c => c.secs > 0).length,
    callSecs,
    avgCallSecs: talked.length ? Math.round(callSecs / talked.length) : null,
    avgAnswerSecs: waits.length ? Math.round(waits.reduce((a, s) => a + s, 0) / waits.length) : null,
    answerTimed: waits.length,
    callers: new Set(real.map(c => c.key).filter(Boolean)).size,
  };
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

export async function handleReports(request: Request, env: Env, user: User): Promise<Response> {
  const url = new URL(request.url);
  const today = london(Date.now()).day;
  const to = isDay(url.searchParams.get("to") ?? "") ? String(url.searchParams.get("to")) : today;
  let from = isDay(url.searchParams.get("from") ?? "") ? String(url.searchParams.get("from")) : addDays(to, -29);
  if (from > to) from = to;
  const days: string[] = [];
  for (let d = from; d <= to && days.length < MAX_DAYS; d = addDays(d, 1)) days.push(d);
  const fromMs = londonMidnight(from);
  const toMs = londonMidnight(addDays(days[days.length - 1], 1));
  // The same length of time just before, for the change on each figure.
  const prevFromMs = fromMs - (toMs - fromMs);

  const owners = await extensionOwners(env);
  // Up to now, not just the period's end: a missed call's callback may come later.
  const rows = (await env.DB.prepare(
    `SELECT c.id, c.call_id, c.phone_number, c.did, c.direction, c.state,
            COALESCE(c.start_date, c.create_date) AS start_date, c.end_date, c.answered_at,
            c.voicemail, c.callback, c.extension, c.user_id, c.spam, c.partner_id, p.name AS partner_name
       FROM call_log c LEFT JOIN contacts p ON p.id = c.partner_id
      WHERE COALESCE(c.start_date, c.create_date) >= ?1 AND c.call_id IS NOT NULL
      ORDER BY COALESCE(c.start_date, c.create_date) DESC`
  ).bind(prevFromMs).all<Row>()).results ?? [];

  const internal = (n: string | null) => { const d = (n ?? "").replace(/\D/g, ""); return d.length > 0 && d.length < 7; };
  const grouped = groupCallLegs(rows).map(legs => foldCall(legs, owners));
  const all = grouped.filter(c => !internal(c.number));
  markReturned(all.map(c => ({ legs: c.legs as unknown as Record<string, unknown>[], call: c.call })), owners);
  const inPeriod = all.filter(c => c.start >= fromMs && c.start < toMs);
  const before = all.filter(c => c.start >= prevFromMs && c.start < fromMs);
  const internalCalls = grouped.filter(c => internal(c.number) && c.start >= fromMs && c.start < toMs).length;
  await attachOwners(env, inPeriod.filter(c => c.dir === "in").map(c => c.call), user);

  const nameOf = (uid: number | null) => {
    if (uid === null) return "";
    for (const o of owners.values()) if (o.user_id === uid) return o.user_name;
    return "";
  };

  // Per day, hour and weekday × hour (UK time).
  const daily = new Map(days.map(d => [d, { day: d, answered: 0, missed: 0, outgoing: 0, voicemail: 0, spam: 0, callSecs: 0 }]));
  const hourly = Array.from({ length: 24 }, (_, h) => ({ hour: h, answered: 0, missed: 0 }));
  const heat = Array.from({ length: 7 }, () => new Array(24).fill(0) as number[]);
  for (const c of inPeriod) {
    const t = london(c.start);
    const d = daily.get(t.day);
    if (d) {
      if (c.dir === "out") d.outgoing++;
      else if (c.spam) d.spam++;
      else if (c.answered) d.answered++;
      else d.missed++;
      if (c.voicemail && !c.spam) d.voicemail++;
      d.callSecs += c.secs;
    }
    if (c.dir === "in" && !c.spam) {
      if (c.answered) hourly[t.hour].answered++; else hourly[t.hour].missed++;
      if (t.weekday >= 0) heat[t.weekday][t.hour]++;
    }
  }

  // Missed calls: were they called back, and how fast?
  const missed = inPeriod.filter(c => c.missed);
  const returnMins: number[] = [];
  let returned = 0, doneByHand = 0, claimedOpen = 0, unclaimedOpen = 0, in1h = 0, sameDay = 0;
  const returnedBy = new Map<string, number>();
  for (const m of missed) {
    const c = m.call;
    const back = c.returned_at && (!c.reopened_at || Number(c.returned_at) > Number(c.reopened_at)) ? Number(c.returned_at) : 0;
    if (back) {
      returned++;
      const mins = Math.max(0, Math.round((back - m.start) / 60_000));
      returnMins.push(mins);
      if (mins <= 60) in1h++;
      if (london(back).day === london(m.start).day) sameDay++;
      const who = String(c.returned_name || "");
      if (who) returnedBy.set(who, (returnedBy.get(who) ?? 0) + 1);
    } else if (c.done_at) {
      doneByHand++;
      const who = String(c.done_name || "");
      if (who) returnedBy.set(who, (returnedBy.get(who) ?? 0) + 1);
    } else if (c.own_id) claimedOpen++;
    else unclaimedOpen++;
  }

  // Per person: who took and made the calls.
  const people = new Map<number, { user_id: number; name: string; answered: number; outgoing: number; outgoingConnected: number; callSecs: number; talked: number; missedDealt: number; claimedOpen: number }>();
  const person = (uid: number) => {
    let p = people.get(uid);
    if (!p) { p = { user_id: uid, name: uid === 0 ? "Not recorded" : nameOf(uid) || `User ${uid}`, answered: 0, outgoing: 0, outgoingConnected: 0, callSecs: 0, talked: 0, missedDealt: 0, claimedOpen: 0 }; people.set(uid, p); }
    return p;
  };
  for (const c of inPeriod) {
    // A call taken on an extension with no Odoo user goes under user 0.
    const took = c.dir === "out" || c.answered;
    if (!took) continue;
    const p = person(c.owner ?? 0);
    if (c.dir === "in" && c.answered) p.answered++;
    if (c.dir === "out") { p.outgoing++; if (c.secs > 0) p.outgoingConnected++; }
    if (c.secs > 0) { p.callSecs += c.secs; p.talked++; }
  }
  for (const m of missed) {
    if (m.call.own_id && !m.call.done_at && !m.call.returned_at) person(Number(m.call.own_id)).claimedOpen++;
  }
  for (const p of people.values()) p.missedDealt = returnedBy.get(p.name) ?? 0;

  // Per number of ours (DID).
  const numbers = new Map<string, { did: string; label: string; incoming: number; answered: number; missed: number; voicemail: number; spam: number }>();
  for (const c of inPeriod) {
    if (c.dir !== "in") continue;
    // Some calls were only logged by the phones that rang, not the trunk.
    const did = c.did || "-";
    let n = numbers.get(did);
    if (!n) { n = { did, label: c.did ? c.didLabel : "Number not recorded", incoming: 0, answered: 0, missed: 0, voicemail: 0, spam: 0 }; numbers.set(did, n); }
    n.incoming++;
    if (c.spam) n.spam++;
    else if (c.answered) n.answered++;
    else n.missed++;
    if (c.voicemail && !c.spam) n.voicemail++;
  }

  // Who rang most (not spam), and which callers are new this period.
  const callers = new Map<string, { number: string; name: string; calls: number; missed: number }>();
  for (const c of inPeriod) {
    if (c.dir !== "in" || c.spam || !c.key) continue;
    let x = callers.get(c.key);
    if (!x) { x = { number: c.number, name: c.name, calls: 0, missed: 0 }; callers.set(c.key, x); }
    x.calls++;
    if (c.missed) x.missed++;
    if (!x.name && c.name) x.name = c.name;
  }
  const earlier = new Set(((await env.DB.prepare(
    `SELECT DISTINCT ${sqlPhoneKey("phone_number")} AS k FROM call_log WHERE COALESCE(start_date, create_date) < ?1 AND phone_number IS NOT NULL`
  ).bind(fromMs).all<{ k: string }>()).results ?? []).map(r => r.k));
  const newCallers = [...callers.keys()].filter(k => !earlier.has(k)).length;

  const blocked = await env.DB.prepare("SELECT COUNT(*) AS numbers, COALESCE(SUM(hits), 0) AS hits FROM blocked_numbers")
    .first<{ numbers: number; hits: number }>().catch(() => null);

  const cur = summary(inPeriod);
  return Response.json({
    range: { from, to: days[days.length - 1], days: days.length, today },
    summary: { ...cur, newCallers, internal: internalCalls },
    previous: summary(before),
    missed: {
      total: missed.length, returned, doneByHand, claimedOpen, unclaimedOpen,
      returnedIn1h: in1h, returnedSameDay: sameDay, medianReturnMins: median(returnMins),
    },
    daily: [...daily.values()],
    hourly,
    heat,
    people: [...people.values()].sort((a, b) => (b.answered + b.outgoing) - (a.answered + a.outgoing)),
    numbers: [...numbers.values()].sort((a, b) => b.incoming - a.incoming),
    callers: [...callers.values()].sort((a, b) => b.calls - a.calls).slice(0, 10),
    blocked: blocked ?? { numbers: 0, hits: 0 },
  });
}
