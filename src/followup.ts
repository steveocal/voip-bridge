import type { Env, ExecutionContext } from "./types";
import type { User } from "./users";
import { callLegs, odooAuth, odooCall, pushCallToOdoo } from "./odoo";
import { whisperPiece, translateLines, needsTranslation } from "./transcribe";

// ── Voice notes added to a call afterwards ────────────────────
// The dashboard's "+" (next to hang-up, and on each History row) records a
// short spoken note. POST /call-notes/voice turns it into text and spots a
// follow-up ("ring them back in 3 days") without saving anything, so the
// person can check both. POST /call-notes/add then appends the text to the
// call's Notes, stamped with the time and who said it, and, with a date,
// gives them an Odoo To-Do on the contact due that day.

const MAX_SECONDS = 180;
const TZ = "Europe/London";
const MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";
const PROMPT = "You read a short note someone dictated after a phone call at Infrared Heating Products (IHP), a UK company. " +
  "Today is {today}. Decide whether the note asks for a follow-up on a particular day " +
  '(e.g. "follow up in 3 days", "call back next Tuesday", "chase on the 20th"). ' +
  'Reply with JSON only, no markdown: {"follow_up": "YYYY-MM-DD" or null, "summary": "the follow-up as a short to-do, at most 8 words, or empty"}. ' +
  "Count days from today. \"Next week\" with no day means 7 days from today. Only give a date the note actually asks for.";

const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

/** 16-bit PCM samples from a WAV file (the dashboard sends 16 kHz mono). */
function wavSamples(buf: ArrayBuffer): { samples: Int16Array; rate: number } | null {
  const v = new DataView(buf);
  if (buf.byteLength < 44 || v.getUint32(0) !== 0x52494646 || v.getUint32(8) !== 0x57415645) return null;   // RIFF / WAVE
  let rate = 0;
  for (let at = 12; at + 8 <= buf.byteLength;) {
    const id = v.getUint32(at), size = v.getUint32(at + 4, true);
    if (id === 0x666d7420) rate = v.getUint32(at + 12, true);   // "fmt "
    if (id === 0x64617461) {                                     // "data"
      const len = Math.min(size, buf.byteLength - at - 8) & ~1;
      return rate ? { samples: new Int16Array(buf.slice(at + 8, at + 8 + len)), rate } : null;
    }
    at += 8 + size + (size & 1);
  }
  return null;
}

/** A follow-up date the note asks for, or null. Never in the past, at most
 *  two years out; anything else the model says is dropped. */
async function findFollowUp(env: Env, text: string): Promise<{ date: string | null; summary: string }> {
  const now = new Date();
  const today = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now);
  try {
    const out = await env.AI.run(MODEL, {
      messages: [
        { role: "system", content: PROMPT.replace("{today}", `${today} (${ymd(now)})`) },
        { role: "user", content: text },
      ],
      max_tokens: 200,
      temperature: 0,
    }) as { response?: unknown };
    const raw = typeof out?.response === "string" ? out.response : JSON.stringify(out?.response ?? {});
    const json = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as { follow_up?: unknown; summary?: unknown };
    const date = typeof json.follow_up === "string" && /^\d{4}-\d{2}-\d{2}$/.test(json.follow_up) ? json.follow_up : null;
    const latest = ymd(new Date(now.getTime() + 730 * 86400_000));
    const ok = !!date && !Number.isNaN(Date.parse(date)) && date >= ymd(now) && date <= latest;
    return { date: ok ? date : null, summary: typeof json.summary === "string" ? json.summary.trim().slice(0, 80) : "" };
  } catch (e) {
    console.error("follow-up extraction failed:", e);
    return { date: null, summary: "" };
  }
}

/** POST /call-notes/voice?call_id=…, body = WAV. → { text, follow_up, summary }. */
export async function handleVoiceNote(request: Request, env: Env): Promise<Response> {
  const wav = wavSamples(await request.arrayBuffer());
  if (!wav?.samples.length) return Response.json({ error: "send the note as a WAV file" }, { status: 400 });
  if (wav.samples.length > wav.rate * (MAX_SECONDS + 1)) return Response.json({ error: `notes can be at most ${MAX_SECONDS / 60} minutes` }, { status: 413 });
  const lines = await whisperPiece(env, wav.samples, wav.rate, 0);
  if (lines.some(needsTranslation)) await translateLines(env, lines);
  const text = lines.map(l => l.en || l.text).join(" ").replace(/\s+/g, " ").trim();
  if (!text) return Response.json({ text: "", follow_up: null, summary: "" });
  const f = await findFollowUp(env, text);
  return Response.json({ text, follow_up: f.date, summary: f.summary });
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** An Odoo To-Do for `userId` on a record, due `date`. Returns its id. */
async function scheduleTodo(env: Env, userId: number, model: string, resId: number, date: string, summary: string, note: string): Promise<number> {
  const uid = await odooAuth(env);
  if (!uid) throw new Error("Odoo unavailable");
  const [m, t] = await Promise.all([
    odooCall(env, uid, "ir.model", "search_read", [[["model", "=", model]]], { fields: ["id"], limit: 1 }),
    odooCall(env, uid, "ir.model.data", "search_read", [[["module", "=", "mail"], ["name", "=", "mail_activity_data_todo"]]], { fields: ["res_id"], limit: 1 }),
  ]);
  const modelId = (m.parsed as Array<{ id: number }> | null)?.[0]?.id;
  if (!modelId) throw new Error(m.fault || `no Odoo model ${model}`);
  const typeId = (t.parsed as Array<{ res_id: number }> | null)?.[0]?.res_id || false;
  const r = await odooCall(env, uid, "mail.activity", "create", [{
    res_model_id: modelId, res_id: resId, activity_type_id: typeId,
    date_deadline: date, summary: summary || "Follow up", note: `<p>${esc(note)}</p>`,
    user_id: userId || uid,
  }]);
  if (r.fault || typeof r.parsed !== "number") throw new Error(r.fault || "activity not created");
  return r.parsed;
}

/** POST /call-notes/add { call_id, text, follow_up?, summary? }: append to the
 *  call's Notes and, with follow_up, schedule the To-Do. */
export async function handleAddCallNote(request: Request, env: Env, ctx: ExecutionContext, user: User): Promise<Response> {
  let body: { call_id?: string; text?: string; follow_up?: string | null; summary?: string };
  try { body = await request.json(); } catch { return Response.json({ error: "invalid JSON" }, { status: 400 }); }
  const callId = String(body.call_id ?? "").trim();
  const text = String(body.text ?? "").trim().slice(0, 4000);
  const followUp = typeof body.follow_up === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.follow_up) ? body.follow_up : null;
  if (!callId || (!text && !followUp)) return Response.json({ error: "nothing to add" }, { status: 400 });
  const legs = await callLegs(env, callId);
  if (!legs.length) return Response.json({ error: "call not found" }, { status: 404 });

  // The leg that already has notes (Odoo gets the first leg with notes), else this one.
  const target = legs.find(l => l.notes_html) ?? legs.find(l => l.call_id === callId) ?? legs[0];
  const when = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date());
  const due = followUp ? new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(new Date(followUp + "T12:00:00Z")) : "";
  const who = user.name ? ` · ${esc(user.name)}` : "";
  const para = `<p><strong>${esc(when)}${who}</strong> — ${esc(text || "Follow up")}${due ? ` <em>(follow up ${esc(due)})</em>` : ""}</p>`;
  await env.DB.prepare("UPDATE call_log SET notes_html = COALESCE(notes_html, '') || ?1, write_date = ?2 WHERE call_id = ?3")
    .bind(para, Date.now(), target.call_id).run();

  let activity: number | null = null, activityError = "";
  if (followUp) {
    try {
      const partner = legs.find(l => l.partner_id)?.partner_id;
      if (partner) activity = await scheduleTodo(env, user.id, "res.partner", partner, followUp, body.summary ?? "", text);
      else {
        // No contact: put it on the call itself in Odoo.
        const odooId = await pushCallToOdoo(env, target.call_id);
        const uid = await odooAuth(env);
        const found = uid ? await odooCall(env, uid, "phone_bridge.call", "search", [[["bridge_call_id", "=", legs[0].call_id]]], { limit: 1 }) : null;
        const pbId = (found?.parsed as number[] | null)?.[0];
        if (pbId) activity = await scheduleTodo(env, user.id, "phone_bridge.call", pbId, followUp, body.summary ?? "", text);
        else if (odooId) activity = await scheduleTodo(env, user.id, "voip.call", odooId, followUp, body.summary ?? "", text);
        else activityError = "the call isn't in Odoo yet";
      }
    } catch (e) {
      activityError = String((e as Error).message || e);
      console.error("follow-up activity failed:", e);
    }
  }
  ctx.waitUntil(pushCallToOdoo(env, target.call_id).catch((e) => console.error("pushCallToOdoo failed:", e)));
  return Response.json({ ok: true, activity, activity_error: activityError || undefined });
}
