import type { Env } from "./types";
import { extensionOwners } from "./users";
import { fetchRecording, monoWav } from "./recording";
import { sendGmailMessage } from "./gmail";

// ── Voicemail to email ────────────────────────────────────────
// Once a voicemail's message has arrived and been transcribed (event=recording
// on a call with voicemail = 1), it is emailed to the user(s) the caller was
// trying to reach, at each extension's "Email Voicemail To" in Odoo
// (phone_bridge.extension.voicemail_email, comma-separated, synced into
// extensions.voicemail_email; Odoo fills it with the user's email unless
// changed). Left empty there, that extension's voicemails aren't emailed.
// Only with an addon that lacks the field is the user's own email used.
//   - an internal call (the caller's softphone logged it as outgoing to an
//     extension): that extension's user;
//   - a call to one of our numbers: the users of the extensions that number
//     rings (Odoo → Phone Numbers), whether it reached voicemail on no answer,
//     a menu key or a 📼 switch.
// It is sent from the shared Google account, with the transcript and the
// recording attached. call_log.vm_emailed records who it went to (or why
// not), so a repeated recording event doesn't email twice.

const TZ = "Europe/London";
const EXT = /^\d{2,6}$/;

interface VmRow {
  call_id: string; phone_number: string | null; did: string | null; direction: string | null;
  extension: string | null; start_date: number | null; recording: string | null;
  transcript: string | null; vm_emailed: string | null; partner_name: string | null;
}

/** The addresses to email: each extension's "Email Voicemail To", each address once. */
async function recipients(env: Env, row: VmRow): Promise<string[]> {
  let exts: string[] = [];
  const dialled = String(row.phone_number || "");
  if (row.direction === "outgoing" && EXT.test(dialled)) exts = [dialled];
  else if (row.did) {
    const n = await env.DB.prepare("SELECT extensions FROM pbx_numbers WHERE number = ?1 AND active != 0")
      .bind(row.did.replace(/\D/g, "")).first<{ extensions: string | null }>();
    exts = String(n?.extensions || "").split(",").map((x) => x.trim()).filter(Boolean);
  }
  if (!exts.length) return [];
  const rows = (await env.DB.prepare(
    `SELECT voicemail_email, user_email FROM extensions WHERE number IN (${exts.map((_, i) => `?${i + 1}`).join(",")})`
  ).bind(...exts).all<{ voicemail_email: string | null; user_email: string | null }>()).results ?? [];
  const out = new Map<string, string>();
  for (const r of rows) {
    for (const a of String(r.voicemail_email ?? r.user_email ?? "").split(/[,;\s]+/)) {
      if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a) && !out.has(a.toLowerCase())) out.set(a.toLowerCase(), a);
    }
  }
  return [...out.values()];
}

/** UK display form of an international number (441283246490 → 01283 246490). */
function showNumber(n: string): string {
  const d = n.replace(/\D/g, "");
  if (EXT.test(d)) return "ext " + d;
  if (d.startsWith("44") && d.length >= 11) { const nat = "0" + d.slice(2); return nat.slice(0, 5) + " " + nat.slice(5); }
  return d ? "+" + d : "unknown number";
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Email the voicemail on this call, if it is one and hasn't been sent. Never throws. */
export async function emailVoicemail(env: Env, callId: string): Promise<void> {
  try {
    const row = await env.DB.prepare(
      `SELECT l.call_id, l.phone_number, l.did, l.direction, l.extension, l.start_date, l.recording, l.transcript, l.vm_emailed,
              c.name AS partner_name
       FROM call_log l LEFT JOIN contacts c ON c.id = l.partner_id
       WHERE l.call_id = ?1 AND l.voicemail = 1`
    ).bind(callId).first<VmRow>();
    if (!row?.recording || row.vm_emailed) return;
    const mark = (v: string) => env.DB.prepare("UPDATE call_log SET vm_emailed = ?1 WHERE call_id = ?2").bind(v.slice(0, 500), callId).run();

    const to = await recipients(env, row);
    if (!to.length) { await mark("no recipient: no Email Voicemail To on the extension(s) called"); return; }

    const audio = await fetchRecording(env, row.recording);
    if (!audio) { await mark("recording file not found"); return; }
    const secs = Math.round(audio.samples.length / audio.rate);

    // The caller: an Odoo contact, or for an internal call our own user.
    const owners = await extensionOwners(env);
    const internal = row.direction === "outgoing";
    const callerNum = internal ? String(row.extension || "") : String(row.phone_number || "");
    const callerName = internal ? (owners.get(callerNum)?.user_name || "") : (row.partner_name || "");
    const from = callerName ? `${callerName} (${showNumber(callerNum)})` : showNumber(callerNum);
    const when = new Date(row.start_date || Date.now()).toLocaleString("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    const len = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
    const lineTo = !internal && row.did ? ` on ${showNumber(row.did)}` : "";
    const transcript = (row.transcript || "").trim();

    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.45">` +
      `<h2 style="margin:0 0 4px">📼 Voicemail from ${esc(from)}</h2>` +
      `<p style="color:#666;margin:0 0 12px">${esc(when)}${esc(lineTo)} · ${len}</p>` +
      `<p><b>Transcript</b></p>` +
      (transcript ? `<pre style="white-space:pre-wrap;font-family:inherit;font-size:13px">${esc(transcript)}</pre>` : `<p style="color:#888">(no transcript)</p>`) +
      `<p style="color:#888;font-size:12px">The recording is attached and is also under History in the VoIP Bridge dashboard. ` +
      `Speech recognition can get words wrong.</p></div>`;
    const stamp = new Date(row.start_date || Date.now()).toISOString().slice(0, 16).replace(/[-:T]/g, "");
    const file = { filename: `voicemail-${callerNum.replace(/\D/g, "") || "unknown"}-${stamp}.wav`, mime: "audio/wav", data: monoWav(audio.samples, audio.rate) };

    const sent: string[] = [], failed: string[] = [];
    for (const email of to) {
      const res = await sendGmailMessage(env, 0, {
        to: email, subject: `Voicemail from ${from}`, html, attachments: [file], fromName: "Voicemail", shared: true,
      });
      if (res.ok) sent.push(email);
      else { failed.push(`${email}: ${res.error}`); console.error("voicemail email failed:", email, res.error); }
    }
    await mark(sent.length ? "sent " + sent.join(", ") + (failed.length ? "; failed " + failed.join("; ") : "") : "failed " + failed.join("; "));
  } catch (e) {
    console.error("emailVoicemail failed:", e);
  }
}
