import type { Env } from "./types";
import { callLegs } from "./odoo";

// ── Call summary (Workers AI text model) ──────────────────────
// Once a call is transcribed, a text model writes a short summary, key
// points and follow-ups, which go at the top of the call notes. The model is
// asked for JSON and the HTML is built here, so nothing it says is markup.
// The summary goes on whichever leg of the call already holds notes (the
// one the history shows), else on the leg with the transcript.

const MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";
const MARKER = "<h4>Call summary (AI)</h4>";
// Matches the heading after TinyMCE has re-serialised it, too.
const HEADING = /<h4[^>]*>\s*Call summary \(AI\)\s*<\/h4>/;
const PROMPT = "You summarise phone calls for Infrared Heating Products (IHP), a UK company selling infrared heater panels. " +
  'The transcript lines are labelled "Us" (IHP staff) and "Them" (the other party); speech recognition may have errors. ' +
  'Reply with JSON only, no markdown: {"summary": "2-3 sentences: who called, why, and the outcome", ' +
  '"points": ["key facts: products, sizes, quantities, prices, addresses, dates mentioned"], ' +
  '"actions": ["follow-ups someone agreed to do, with who and when"]}. ' +
  "Use empty arrays when there is nothing to list. Do not invent details that are not in the transcript. " +
  'Always write in English, even when the call was in Thai or another language; a line starting with "→" is the English translation of the line above it.';

interface Summary { summary?: string; points?: string[]; actions?: string[] }

/** Summarise a transcribed call into its notes. Skips calls whose notes
 *  already carry a summary unless `force`. Returns the summary HTML, or ""
 *  when there was nothing to summarise. */
export async function summarizeCall(env: Env, callId: string, force = false): Promise<string> {
  const legs = await callLegs(env, callId);
  const withTranscript = legs.find(l => l.transcript);
  if (!withTranscript?.transcript?.trim()) return "";
  const target = legs.find(l => l.notes_html) ?? withTranscript;
  const notes = target.notes_html ?? "";
  if (HEADING.test(notes) && !force) return "";

  const out = await env.AI.run(MODEL, {
    messages: [
      { role: "system", content: PROMPT },
      { role: "user", content: withTranscript.transcript },
    ],
    max_tokens: 1024,
    temperature: 0.2,
  }) as { response?: unknown };
  const parsed = parseSummary(out?.response);
  if (!parsed.summary) return "";

  const list = (title: string, items?: string[]) => items?.length
    ? `<p><b>${title}</b></p><ul>${items.map(i => `<li>${esc(String(i))}</li>`).join("")}</ul>` : "";
  const html = `${MARKER}<p>${esc(parsed.summary)}</p>${list("Key points", parsed.points)}${list("Follow-ups", parsed.actions)}<hr>`;
  await env.DB.prepare("UPDATE call_log SET notes_html = ?1, write_date = ?2 WHERE call_id = ?3")
    .bind(html + stripSummary(notes), Date.now(), target.call_id).run();
  return html;
}

// The model's response arrives as a string, or already parsed when it was
// valid JSON; either way take the outermost {...} in case it adds prose.
function parseSummary(response: unknown): Summary {
  if (response && typeof response === "object") return response as Summary;
  const text = String(response ?? "");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return { summary: text.trim() };
  try { return JSON.parse(m[0]) as Summary; } catch { return { summary: text.trim() }; }
}

/** The notes to store for a save of `callId`: a save that never showed the
 *  user the summary (the live call panel, or a call-detail editor opened
 *  before the summary landed) would otherwise wipe it, so the summary from
 *  whichever leg holds it is put back on top. When it came from another leg
 *  it is moved, so the call keeps one copy. `seen` means the editor had the
 *  summary in it, so its absence is a deliberate delete. */
export async function keepSummary(env: Env, callId: string, notes: string, seen: boolean): Promise<string> {
  if (seen || HEADING.test(notes)) return notes;
  const legs = await callLegs(env, callId);
  const from = legs.find(l => HEADING.test(l.notes_html ?? ""));
  if (!from?.notes_html) return notes;
  const [at, end] = summaryRange(from.notes_html)!;
  if (from.call_id !== callId) {
    await env.DB.prepare("UPDATE call_log SET notes_html = ?1, write_date = ?2 WHERE call_id = ?3")
      .bind(stripSummary(from.notes_html), Date.now(), from.call_id).run();
  }
  return from.notes_html.slice(at, end) + notes;
}

// The summary block runs from its heading through the <hr> after it.
function summaryRange(notes: string): [number, number] | null {
  const m = HEADING.exec(notes);
  if (!m) return null;
  const hr = notes.indexOf("<hr", m.index);
  return [m.index, hr < 0 ? notes.length : notes.indexOf(">", hr) + 1];
}

// A forced re-run replaces the old summary.
function stripSummary(notes: string): string {
  const r = summaryRange(notes);
  return r ? notes.slice(0, r[0]) + notes.slice(r[1]) : notes;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
