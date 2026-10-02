import type { Env } from "./types";
import { fetchRecording, channelSlice, monoWav } from "./recording";

// ── Call transcription (Workers AI Whisper) ───────────────────
// Stereo recordings keep each party on its own channel (see recording.ts),
// so each side is transcribed separately, labelled "Us" / "Them", and the
// two are merged by time. Whisper takes the audio as one base64 string, so
// each side is fed to it in CHUNK_SECONDS pieces, with the piece's offset
// added to each segment's timestamp.
// Whisper invents text ("Thank you.") over silence and its vad_filter doesn't
// stop it, so segments whose audio is near-silent are dropped here.

const MODEL = "@cf/openai/whisper-large-v3-turbo";
const CHUNK_SECONDS = 300;
const SILENCE_LEVEL = 200; // mean |sample| (of 32768) below which a segment is treated as silence

interface WhisperSegment { start: number; end: number; text: string }
interface Line { t: number; label: string; text: string }

/** Transcribe a call's recording and store it on call_log.transcript, one
 *  "[m:ss] Us: text" line per segment ("[m:ss] text" for old mono
 *  recordings). Returns the transcript ("" when nothing was said). */
export async function transcribeCall(env: Env, callId: string): Promise<string> {
  const row = await env.DB.prepare("SELECT recording, direction FROM call_log WHERE call_id = ?1")
    .bind(callId).first<{ recording: string | null; direction: string | null }>();
  if (!row?.recording) throw new Error("no recording");
  const rec = await fetchRecording(env, row.recording);
  // Channel 0 is what the recorded channel received: the caller on inbound
  // calls (recorded on the trunk), our own voice on outbound ones.
  const labels = rec.channels < 2 ? [""]
    : row.direction === "outgoing" ? ["Us", "Them"] : ["Them", "Us"];

  const frames = Math.floor(rec.pcm.length / rec.channels);
  const step = rec.rate * CHUNK_SECONDS;
  const lines: Line[] = [];
  for (let ch = 0; ch < labels.length; ch++) {
    for (let from = 0; from < frames; from += step) {
      const samples = channelSlice(rec, ch, from, Math.min(from + step, frames));
      if (meanLevel(samples, 0, samples.length) < SILENCE_LEVEL / 10) continue; // a side that said nothing at all
      const out = await env.AI.run(MODEL, { audio: toBase64(monoWav(samples, rec.rate)) }) as { text?: string; segments?: WhisperSegment[] };
      const segments = out.segments?.length ? out.segments : (out.text ? [{ start: 0, end: 0, text: out.text }] : []);
      for (const s of segments) {
        const text = s.text.trim();
        if (!text) continue;
        if (s.end > s.start && meanLevel(samples, Math.floor(s.start * rec.rate), Math.ceil(s.end * rec.rate)) < SILENCE_LEVEL) continue;
        lines.push({ t: from / rec.rate + s.start, label: labels[ch], text });
      }
    }
  }
  lines.sort((a, b) => a.t - b.t);
  const transcript = lines.map((l) => `[${fmtTime(l.t)}] ${l.label ? l.label + ": " : ""}${l.text}`).join("\n");
  await env.DB.prepare("UPDATE call_log SET transcript = ?1 WHERE call_id = ?2").bind(transcript, callId).run();
  return transcript;
}

function meanLevel(samples: Int16Array, from: number, to: number): number {
  from = Math.max(0, from);
  to = Math.min(samples.length, to);
  if (to <= from) return Infinity;
  let sum = 0;
  for (let i = from; i < to; i++) sum += Math.abs(samples[i]);
  return sum / (to - from);
}

function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000) as unknown as number[]);
  }
  return btoa(bin);
}
