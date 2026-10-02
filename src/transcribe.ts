import type { Env } from "./types";
import { ariRecordingFile } from "./asterisk";

// ── Call transcription (Workers AI Whisper) ───────────────────
// Recordings are 8 kHz 16-bit mono WAV (~1 MB/min). Whisper takes the audio
// as one base64 string, so long calls are cut into WAV pieces of
// CHUNK_SECONDS, transcribed in turn, and stitched back together with the
// piece's offset added to each segment's timestamp.
// Whisper invents text ("Thank you.") over silence and its vad_filter doesn't
// stop it, so segments whose audio is near-silent are dropped here.

const MODEL = "@cf/openai/whisper-large-v3-turbo";
const CHUNK_SECONDS = 300;
const SILENCE_LEVEL = 200; // mean |sample| (of 32768) below which a segment is treated as silence

interface WhisperSegment { start: number; end: number; text: string }

/** Transcribe a call's recording and store it on call_log.transcript.
 *  Returns the transcript ("" when nothing was said). */
export async function transcribeCall(env: Env, callId: string): Promise<string> {
  const row = await env.DB.prepare("SELECT recording FROM call_log WHERE call_id = ?1")
    .bind(callId).first<{ recording: string | null }>();
  if (!row?.recording) throw new Error("no recording");
  const res = await ariRecordingFile(env, row.recording);
  if (!res.ok) throw new Error(`Asterisk returned ${res.status}`);
  const wav = new Uint8Array(await res.arrayBuffer());

  const lines: string[] = [];
  for (const piece of splitWav(wav, CHUNK_SECONDS)) {
    const out = await env.AI.run(MODEL, { audio: toBase64(piece.bytes) }) as { text?: string; segments?: WhisperSegment[] };
    const segments = out.segments?.length ? out.segments : (out.text ? [{ start: 0, end: 0, text: out.text }] : []);
    for (const s of segments) {
      const text = s.text.trim();
      if (text && !isSilent(piece, s)) lines.push(`[${fmtTime(piece.offset + s.start)}] ${text}`);
    }
  }
  const transcript = lines.join("\n");
  await env.DB.prepare("UPDATE call_log SET transcript = ?1 WHERE call_id = ?2").bind(transcript, callId).run();
  return transcript;
}

function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

interface WavPiece { offset: number; bytes: Uint8Array; pcm?: Int16Array; rate?: number }

/** True when the segment's audio is quiet enough to be a hallucination.
 *  Only judged for 16-bit mono; anything else is kept. */
function isSilent(piece: WavPiece, s: WhisperSegment): boolean {
  if (!piece.pcm || !piece.rate || !(s.end > s.start)) return false;
  const from = Math.max(0, Math.floor(s.start * piece.rate));
  const to = Math.min(piece.pcm.length, Math.ceil(s.end * piece.rate));
  if (to <= from) return false;
  let sum = 0;
  for (let i = from; i < to; i++) sum += Math.abs(piece.pcm[i]);
  return sum / (to - from) < SILENCE_LEVEL;
}

/** Split a PCM WAV into standalone WAVs of at most `seconds` each. */
function splitWav(wav: Uint8Array, seconds: number): WavPiece[] {
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  const tag = (at: number) => String.fromCharCode(wav[at], wav[at + 1], wav[at + 2], wav[at + 3]);
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return [{ offset: 0, bytes: wav }];

  let fmt: Uint8Array | null = null;
  let dataStart = -1, dataLen = 0;
  for (let at = 12; at + 8 <= wav.length;) {
    const size = view.getUint32(at + 4, true);
    if (tag(at) === "fmt ") fmt = wav.subarray(at, at + 8 + size);
    if (tag(at) === "data") { dataStart = at + 8; dataLen = Math.min(size, wav.length - dataStart); break; }
    at += 8 + size + (size & 1);
  }
  if (!fmt || dataStart < 0) return [{ offset: 0, bytes: wav }];

  const byteRate = new DataView(fmt.buffer, fmt.byteOffset).getUint32(16, true) || 16000;
  const blockAlign = new DataView(fmt.buffer, fmt.byteOffset).getUint16(20, true) || 2;
  const chunkLen = Math.floor((byteRate * seconds) / blockAlign) * blockAlign;
  const fv = new DataView(fmt.buffer, fmt.byteOffset);
  const mono16 = fv.getUint16(10, true) === 1 && fv.getUint16(22, true) === 16;
  const pieces: WavPiece[] = [];
  for (let pos = 0; pos < dataLen; pos += chunkLen) {
    const pcm = wav.subarray(dataStart + pos, dataStart + Math.min(pos + chunkLen, dataLen));
    const out = new Uint8Array(12 + fmt.length + 8 + pcm.length);
    const ov = new DataView(out.buffer);
    out.set([82, 73, 70, 70], 0); // "RIFF"
    ov.setUint32(4, out.length - 8, true);
    out.set([87, 65, 86, 69], 8); // "WAVE"
    out.set(fmt, 12);
    const d = 12 + fmt.length;
    out.set([100, 97, 116, 97], d); // "data"
    ov.setUint32(d + 4, pcm.length, true);
    out.set(pcm, d + 8);
    const piece: WavPiece = { offset: pos / byteRate, bytes: out };
    if (mono16) { piece.pcm = new Int16Array(out.buffer.slice(d + 8, d + 8 + (pcm.length & ~1))); piece.rate = byteRate / 2; }
    pieces.push(piece);
  }
  return pieces;
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000) as unknown as number[]);
  }
  return btoa(bin);
}
