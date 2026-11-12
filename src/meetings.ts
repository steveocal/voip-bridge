import type { Env, ExecutionContext } from "./types";
import type { User } from "./users";
import { userEmail } from "./users";
import { sendGmailMessage } from "./gmail";
import { whisperPiece, translateLines, needsTranslation, meanLevel, fmtTime } from "./transcribe";

// ── Meeting recorder ──────────────────────────────────────────
// Dialling *91 in the dashboard records the room through the computer's (or
// phone's) own microphone. Nothing goes through Asterisk. *92 adds another
// part to the user's last meeting. *93 / *94 do the same for an online call in
// another browser tab (Meet, LINE): the tab's sound mixed with the microphone. The browser keeps 16 kHz 16-bit mono PCM
// in 30 s blocks in IndexedDB and uploads them as it goes (POST /meeting/block),
// so closing the tab loses at most the block in progress. The blocks are
// kept in R2 at m/<id>/<part>/<seq>.
// Whisper gets 3-minute pieces (PIECE_BLOCKS blocks). A piece is transcribed
// when the upload of its last block arrives. When a part ends
// (POST /meeting/finish), any pieces still missing are transcribed, then the
// whole meeting is put together, summarised, and emailed to the user from
// their own Gmail. A finish the dashboard retries does no harm: each piece is
// done once, and each part is emailed once.

const RATE = 16000;
const BLOCK_SAMPLES = RATE * 30;
const PIECE_BLOCKS = 6;                    // 3 minutes per Whisper request
const MAX_BLOCK_BYTES = BLOCK_SAMPLES * 2;
const SUMMARY_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";
const SUMMARY_MAX_CHARS = 120_000;         // transcript sent to the summary model
const PROMPT = "You write meeting notes for Infrared Heating Products (IHP), a UK company selling infrared heater panels. " +
  "The input is a transcript of a meeting, recorded either with one microphone in the room or from an online call (Google Meet, LINE and the like) plus the user's microphone, made by speech recognition, so it may contain errors " +
  "and does not say who is speaking. Lines starting with \"→\" are English translations of the line above. " +
  'Reply with JSON only, no markdown: {"title": "a short title for the meeting, at most 8 words", ' +
  '"summary": "3-5 sentences: what the meeting was about and what came of it", ' +
  '"decisions": ["things that were decided or agreed"], ' +
  '"actions": ["follow-ups someone agreed to do, with who and when if said"], ' +
  '"points": ["other key facts: products, quantities, prices, dates, names, places mentioned"]}. ' +
  "Use empty arrays when there is nothing to list. Do not invent anything that is not in the transcript. Always write in English.";

interface PieceLine { t: number; text: string; en?: string }
interface Notes { title?: string; summary?: string; decisions?: string[]; actions?: string[]; points?: string[] }
interface MeetingRow {
  id: string; user_id: number; ext: string | null; label: string | null; title: string | null;
  started_at: number; updated_at: number; parts: number; seconds: number; status: string;
  transcript: string | null; summary_html: string | null; emailed_part: number; email_error: string | null; error: string | null;
}

const pad = (n: number, w: number) => String(n).padStart(w, "0");
const blockKey = (id: string, part: number, seq: number) => `m/${id}/${pad(part, 3)}/${pad(seq, 5)}`;

async function ownMeeting(env: Env, user: User, id: string): Promise<MeetingRow | null> {
  if (!id) return null;
  const m = await env.DB.prepare("SELECT * FROM meetings WHERE id = ?1").bind(id).first<MeetingRow>();
  return m && m.user_id === user.id ? m : null;
}

const notFound = () => Response.json({ error: "meeting not found" }, { status: 404 });

/** POST /meeting/start {append, label}: a new meeting, or (append) the next
 *  part of the user's last one. */
export async function handleMeetingStart(request: Request, env: Env, user: User): Promise<Response> {
  const body = await request.json().catch(() => ({})) as { append?: boolean; label?: string };
  const label = String(body.label ?? "").slice(0, 60);
  const now = Date.now();
  let m = body.append
    ? await env.DB.prepare("SELECT * FROM meetings WHERE user_id = ?1 ORDER BY started_at DESC LIMIT 1").bind(user.id).first<MeetingRow>()
    : null;
  const appended = !!m;
  if (!m) {
    const id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO meetings (id, user_id, ext, label, title, started_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)")
      .bind(id, user.id, user.ext || null, label, label ? `Meeting ${label}` : "Meeting", now).run();
    m = await env.DB.prepare("SELECT * FROM meetings WHERE id = ?1").bind(id).first<MeetingRow>();
  }
  const part = m!.parts + 1;
  await env.DB.batch([
    env.DB.prepare("INSERT INTO meeting_parts (meeting_id, part, label, started_at) VALUES (?1, ?2, ?3, ?4)").bind(m!.id, part, label, now),
    env.DB.prepare("UPDATE meetings SET parts = ?2, status = 'recording', updated_at = ?3 WHERE id = ?1").bind(m!.id, part, now),
  ]);
  return Response.json({ id: m!.id, part, title: m!.title, appended });
}

/** POST /meeting/block?id&part&seq, body = raw 16 kHz Int16 PCM. Stores it,
 *  and transcribes the piece it completes. */
export async function handleMeetingBlock(request: Request, env: Env, user: User): Promise<Response> {
  const url = new URL(request.url);
  const id = url.searchParams.get("id") ?? "";
  const part = parseInt(url.searchParams.get("part") ?? "", 10);
  const seq = parseInt(url.searchParams.get("seq") ?? "", 10);
  if (!(part >= 1) || !(seq >= 0)) return Response.json({ error: "bad part/seq" }, { status: 400 });
  const m = await ownMeeting(env, user, id);
  if (!m || part > m.parts) return notFound();
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_BLOCK_BYTES || bytes.length % 2) return Response.json({ error: "bad block size" }, { status: 400 });
  await env.MEETINGS.put(blockKey(id, part, seq), bytes);
  let transcribed = false;
  if ((seq + 1) % PIECE_BLOCKS === 0) {
    try { transcribed = await transcribePiece(env, id, part, (seq + 1) / PIECE_BLOCKS - 1, false); }
    catch (e) { console.error("meeting piece failed:", e); }
  }
  return Response.json({ ok: true, transcribed });
}

/** Transcribe one 3-minute piece if it isn't done yet. `last` = the part has
 *  ended, so a short final piece is fine; otherwise all its blocks must be in.
 *  Returns whether it was transcribed now. */
async function transcribePiece(env: Env, id: string, part: number, piece: number, last: boolean, blocks?: number): Promise<boolean> {
  const done = await env.DB.prepare("SELECT 1 FROM meeting_pieces WHERE meeting_id = ?1 AND part = ?2 AND piece = ?3").bind(id, part, piece).first();
  if (done) return false;
  const first = piece * PIECE_BLOCKS;
  const end = last && blocks !== undefined ? Math.min(blocks, first + PIECE_BLOCKS) : first + PIECE_BLOCKS;
  const chunks: Uint8Array[] = [];
  for (let seq = first; seq < end; seq++) {
    const obj = await env.MEETINGS.get(blockKey(id, part, seq));
    if (!obj) throw new Error(`block ${part}/${seq} not uploaded yet`);
    chunks.push(new Uint8Array(await obj.arrayBuffer()));
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const joined = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { joined.set(c, at); at += c.length; }
  const samples = new Int16Array(joined.buffer, 0, total >> 1);
  let lines: PieceLine[] = [];
  // A piece that is silent throughout (a pause) isn't sent to Whisper,
  // which would make up words for it.
  if (samples.length && meanLevel(samples, 0, samples.length) >= 20) {
    const raw = await whisperPiece(env, samples, RATE, first * 30);
    await translateLines(env, raw.filter(needsTranslation));
    lines = raw.map(l => ({ t: Math.round(l.t * 10) / 10, text: l.text, ...(l.en ? { en: l.en } : {}) }));
  }
  await env.DB.prepare("INSERT OR REPLACE INTO meeting_pieces (meeting_id, part, piece, lines) VALUES (?1, ?2, ?3, ?4)")
    .bind(id, part, piece, JSON.stringify(lines)).run();
  return true;
}

/** Seconds of audio stored for each part, from the block sizes in R2. */
async function partSeconds(env: Env, id: string): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  let cursor: string | undefined;
  do {
    const page = await env.MEETINGS.list({ prefix: `m/${id}/`, cursor });
    for (const o of page.objects) {
      const part = parseInt(o.key.split("/")[2], 10);
      out.set(part, (out.get(part) ?? 0) + o.size / 2 / RATE);
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return out;
}

/** POST /meeting/finish {id, part, blocks}: the part has ended and all its
 *  blocks are uploaded. Transcribes what's missing, then summarises and
 *  emails the whole meeting. */
export async function handleMeetingFinish(request: Request, env: Env, user: User): Promise<Response> {
  const body = await request.json().catch(() => ({})) as { id?: string; part?: number; blocks?: number };
  const id = String(body.id ?? ""), part = Number(body.part), blocks = Math.max(0, Math.floor(Number(body.blocks) || 0));
  const m = await ownMeeting(env, user, id);
  if (!m || !(part >= 1) || part > m.parts) return notFound();
  await env.DB.prepare("UPDATE meeting_parts SET blocks = ?3, ended = 1 WHERE meeting_id = ?1 AND part = ?2").bind(id, part, blocks).run();
  try {
    // Every ended part, so a part whose own finish never arrived is caught up too.
    const parts = (await env.DB.prepare("SELECT part, blocks, ended FROM meeting_parts WHERE meeting_id = ?1 ORDER BY part").bind(id)
      .all<{ part: number; blocks: number; ended: number }>()).results ?? [];
    for (const p of parts) {
      if (!p.ended) continue;
      for (let piece = 0; piece * PIECE_BLOCKS < p.blocks; piece++) await transcribePiece(env, id, p.part, piece, true, p.blocks);
    }
    const still = parts.some(p => !p.ended);
    const result = await assemble(env, m, still);
    let emailed = false, emailError = m.email_error;
    if (part > m.emailed_part && result.transcript) {
      const r = await emailNotes(env, user, m, result);
      emailed = r.ok;
      emailError = r.ok ? null : r.error;
      await env.DB.prepare("UPDATE meetings SET emailed_part = ?2, email_error = ?3 WHERE id = ?1")
        .bind(id, r.ok ? part : m.emailed_part, emailError).run();
    }
    return Response.json({ ok: true, title: result.title, emailed, email_error: emailError, empty: !result.transcript });
  } catch (e) {
    const msg = String((e as Error).message || e);
    await env.DB.prepare("UPDATE meetings SET error = ?2, updated_at = ?3 WHERE id = ?1").bind(id, msg, Date.now()).run();
    // 409 = some audio isn't uploaded yet: the dashboard tries again later.
    return Response.json({ error: msg }, { status: /not uploaded/.test(msg) ? 409 : 502 });
  }
}

interface Assembled { title: string; transcript: string; notes: Notes; html: string; seconds: number }

/** Join the pieces into one transcript, timed from the start of the first
 *  part (so it matches the joined audio), summarise it and save both. */
async function assemble(env: Env, m: MeetingRow, recording: boolean): Promise<Assembled> {
  const secs = await partSeconds(env, m.id);
  const parts = (await env.DB.prepare("SELECT part, label FROM meeting_parts WHERE meeting_id = ?1 ORDER BY part").bind(m.id)
    .all<{ part: number; label: string | null }>()).results ?? [];
  const pieces = (await env.DB.prepare("SELECT part, piece, lines FROM meeting_pieces WHERE meeting_id = ?1 ORDER BY part, piece").bind(m.id)
    .all<{ part: number; piece: number; lines: string }>()).results ?? [];
  const out: string[] = [];
  let offset = 0;
  for (const p of parts) {
    const own = pieces.filter(x => x.part === p.part);
    if (parts.length > 1) out.push(`── Part ${p.part}${p.label ? " · " + p.label : ""} ──`);
    for (const x of own) {
      for (const l of JSON.parse(x.lines) as PieceLine[]) {
        out.push(`[${fmtTime(offset + l.t)}] ${l.text}`);
        if (l.en) out.push(`   → ${l.en}`);
      }
    }
    offset += secs.get(p.part) ?? 0;
  }
  const said = out.some(l => l.startsWith("["));
  const transcript = said ? out.join("\n") : "";
  let notes: Notes = {};
  if (said) {
    const res = await env.AI.run(SUMMARY_MODEL, {
      messages: [{ role: "system", content: PROMPT }, { role: "user", content: transcript.slice(0, SUMMARY_MAX_CHARS) }],
      max_tokens: 1500,
      temperature: 0.2,
    }) as { response?: unknown };
    notes = parseNotes(res?.response);
  }
  const title = (notes.title || "").trim().slice(0, 80) || m.title || "Meeting";
  const html = notesHtml(notes);
  await env.DB.prepare("UPDATE meetings SET title = ?2, transcript = ?3, summary_html = ?4, seconds = ?5, status = ?6, error = NULL, updated_at = ?7 WHERE id = ?1")
    .bind(m.id, title, transcript, html, offset, recording ? "recording" : "done", Date.now()).run();
  return { title, transcript, notes, html, seconds: offset };
}

function parseNotes(response: unknown): Notes {
  if (response && typeof response === "object") return response as Notes;
  const text = String(response ?? "");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return { summary: text.trim() };
  try { return JSON.parse(m[0]) as Notes; } catch { return { summary: text.trim() }; }
}

function notesHtml(n: Notes): string {
  const list = (title: string, items?: string[]) => Array.isArray(items) && items.length
    ? `<p><b>${title}</b></p><ul>${items.map(i => `<li>${esc(String(i))}</li>`).join("")}</ul>` : "";
  if (!n.summary) return "";
  return `<p>${esc(n.summary)}</p>${list("Decisions", n.decisions)}${list("Actions", n.actions)}${list("Key points", n.points)}`;
}

async function emailNotes(env: Env, user: User, m: MeetingRow, a: Assembled): Promise<{ ok: boolean; error: string }> {
  const to = await userEmail(env, user.id);
  if (!to) return { ok: false, error: "no email address on your Odoo user" };
  const mins = Math.max(1, Math.round(a.seconds / 60));
  const again = m.emailed_part > 0 ? " (updated)" : "";
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.45">` +
    `<h2 style="margin:0 0 4px">${esc(a.title)}</h2>` +
    `<p style="color:#666;margin:0 0 12px">${esc(m.label || "")}${m.label ? " · " : ""}${mins} min recorded${m.parts > 1 ? ` in ${m.parts} parts` : ""}</p>` +
    (a.html || "<p>(no summary)</p>") +
    `<hr><p><b>Transcript</b></p><pre style="white-space:pre-wrap;font-family:inherit;font-size:13px">${esc(a.transcript)}</pre>` +
    `<p style="color:#888;font-size:12px">Recorded with the VoIP Bridge dashboard (*91 or *93). Speech recognition can get words wrong; ` +
    `the recording is under History.</p></div>`;
  const r = await sendGmailMessage(env, user.id, { to, subject: `Meeting notes${again}: ${a.title}`, html });
  if (r.ok) return { ok: true, error: "" };
  return { ok: false, error: r.error === "no gmail token" ? "Google isn't connected (Settings → Google)" : (r.error || "send failed") };
}

/** GET /meetings: the user's meetings, newest first. */
export async function handleMeetings(request: Request, env: Env, user: User): Promise<Response> {
  const limit = Math.min(parseInt(new URL(request.url).searchParams.get("limit") ?? "50", 10) || 50, 200);
  const rows = (await env.DB.prepare(
    `SELECT id, title, label, started_at, updated_at, parts, seconds, status, error, email_error,
            (summary_html IS NOT NULL AND summary_html <> '') AS has_summary,
            (transcript IS NOT NULL AND transcript <> '') AS has_transcript
     FROM meetings WHERE user_id = ?1 ORDER BY started_at DESC LIMIT ?2`
  ).bind(user.id, limit).all()).results ?? [];
  return Response.json({ meetings: rows });
}

/** GET /meeting?id: one meeting with its notes and transcript. */
export async function handleMeeting(request: Request, env: Env, user: User): Promise<Response> {
  const m = await ownMeeting(env, user, new URL(request.url).searchParams.get("id") ?? "");
  if (!m) return notFound();
  return Response.json({ meeting: m });
}

/** GET /meeting/audio?id: every part joined into one 16 kHz WAV. */
export async function handleMeetingAudio(request: Request, env: Env, user: User, ctx: ExecutionContext): Promise<Response> {
  const m = await ownMeeting(env, user, new URL(request.url).searchParams.get("id") ?? "");
  if (!m) return notFound();
  const keys: { key: string; size: number }[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.MEETINGS.list({ prefix: `m/${m.id}/`, cursor });
    keys.push(...page.objects.map(o => ({ key: o.key, size: o.size })));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  keys.sort((a, b) => a.key < b.key ? -1 : 1);
  const dataLen = keys.reduce((n, k) => n + k.size, 0);
  if (!dataLen) return Response.json({ error: "no audio yet" }, { status: 404 });
  const header = new Uint8Array(44);
  const v = new DataView(header.buffer);
  header.set([82, 73, 70, 70], 0); v.setUint32(4, 36 + dataLen, true);
  header.set([87, 65, 86, 69, 102, 109, 116, 32], 8);
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  header.set([100, 97, 116, 97], 36); v.setUint32(40, dataLen, true);
  const { readable, writable } = new FixedLengthStream(44 + dataLen);
  ctx.waitUntil((async () => {
    const w = writable.getWriter();
    try {
      await w.write(header);
      for (const k of keys) {
        const obj = await env.MEETINGS.get(k.key);
        const bytes = obj ? new Uint8Array(await obj.arrayBuffer()) : new Uint8Array(k.size);
        await w.write(bytes);
      }
      await w.close();
    } catch (e) { await w.abort(e).catch(() => {}); }
  })());
  return new Response(readable, { headers: { "Content-Type": "audio/wav", "Content-Length": String(44 + dataLen), "Cache-Control": "private, max-age=300" } });
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
