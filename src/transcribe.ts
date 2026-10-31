import type { Env } from "./types";
import { fetchRecording, monoWav, type Audio } from "./recording";

// ── Call transcription (Workers AI Whisper) ───────────────────
// Each party is recorded to its own file (see recording.ts), so each side
// is transcribed separately, labelled "Us" / "Them", and the
// two are merged by time. Whisper takes the audio as one base64 string, so
// each side is fed to it in CHUNK_SECONDS pieces, with the piece's offset
// added to each segment's timestamp.
// Whisper invents text ("Thank you.") over silence and its vad_filter doesn't
// stop it, so segments whose audio is near-silent are dropped here.
// Whisper detects the language per piece; lines in anything but English
// (Thai, mostly) are kept as spoken and followed by an English translation
// line "   → ...", written by a text model that sees the lines together.

const MODEL = "@cf/openai/whisper-large-v3-turbo";
const CHUNK_SECONDS = 300;
const SILENCE_LEVEL = 200; // mean |sample| (of 32768) below which a segment is treated as silence
const TRANSLATE_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";
const FALLBACK_TRANSLATE_MODEL = "@cf/meta/m2m100-1.2b";
const TRANSLATE_BATCH = 40; // lines per translation request

interface WhisperSegment { start: number; end: number; text: string }
interface Line { t: number; label: string; text: string; lang: string; en?: string }

/** Transcribe a call's recording and store it on call_log.transcript, one
 *  "[m:ss] Us: text" line per segment ("[m:ss] text" for old mono
 *  recordings). Returns the transcript ("" when nothing was said). */
export async function transcribeCall(env: Env, callId: string): Promise<string> {
  const row = await env.DB.prepare("SELECT recording, direction FROM call_log WHERE call_id = ?1")
    .bind(callId).first<{ recording: string | null; direction: string | null }>();
  if (!row?.recording) throw new Error("no recording");
  // rx is the caller on inbound calls (recorded on the trunk) and our own
  // voice on outbound ones (the VPS swaps the files there; see recording.ts).
  const [rx, tx] = await Promise.all([fetchRecording(env, `${row.recording}-rx`), fetchRecording(env, `${row.recording}-tx`)]);
  let sides: { label: string; audio: Audio }[];
  if (rx && tx) {
    sides = row.direction === "outgoing"
      ? [{ label: "Us", audio: rx }, { label: "Them", audio: tx }]
      : [{ label: "Them", audio: rx }, { label: "Us", audio: tx }];
  } else {
    const mixed = await fetchRecording(env, row.recording);
    if (!mixed) throw new Error("recording file not found");
    sides = [{ label: "", audio: mixed }];
  }

  const lines: Line[] = [];
  for (const { label, audio } of sides) {
    const step = audio.rate * CHUNK_SECONDS;
    for (let from = 0; from < audio.samples.length; from += step) {
      const samples = audio.samples.subarray(from, from + step);
      if (meanLevel(samples, 0, samples.length) < SILENCE_LEVEL / 10) continue; // a side that said nothing at all
      const out = await env.AI.run(MODEL, { audio: toBase64(monoWav(samples, audio.rate)) }) as
        { text?: string; segments?: WhisperSegment[]; transcription_info?: { language?: string } };
      const lang = out.transcription_info?.language ?? "";
      const segments = out.segments?.length ? out.segments : (out.text ? [{ start: 0, end: 0, text: out.text }] : []);
      for (const s of segments) {
        const text = s.text.trim();
        if (!text) continue;
        if (s.end > s.start && meanLevel(samples, Math.floor(s.start * audio.rate), Math.ceil(s.end * audio.rate)) < SILENCE_LEVEL) continue;
        lines.push({ t: from / audio.rate + s.start, label, text, lang });
      }
    }
  }
  lines.sort((a, b) => a.t - b.t);
  await translateLines(env, lines.filter(needsTranslation));
  const transcript = lines.map((l) => `[${fmtTime(l.t)}] ${l.label ? l.label + ": " : ""}${l.text}` +
    (l.en ? `\n   → ${l.en}` : "")).join("\n");
  await env.DB.prepare("UPDATE call_log SET transcript = ?1 WHERE call_id = ?2").bind(transcript, callId).run();
  return transcript;
}

// Whisper's language tag, or failing that any non-Latin script (it sometimes
// tags a mixed piece "en" while writing a line in Thai).
function needsTranslation(l: Line): boolean {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: \u0000 is just the start of the Latin range
  return (!!l.lang && l.lang !== "en") || /[^\u0000-\u024F\u2000-\u206F\u20AC]/.test(l.text);
}

/** Fill in each line's English translation (in place). Lines go to the text
 *  model in batches as a JSON array, so it can use the surrounding lines; a
 *  batch it returns misshapen is translated line by line by m2m100 instead.
 *  A "translation" that just repeats the line (English misdetected as
 *  another language) is dropped. */
async function translateLines(env: Env, lines: Line[]): Promise<void> {
  for (let i = 0; i < lines.length; i += TRANSLATE_BATCH) {
    const batch = lines.slice(i, i + TRANSLATE_BATCH);
    let en: string[] | null = null;
    try {
      const out = await env.AI.run(TRANSLATE_MODEL, {
        messages: [
          { role: "system", content: "Translate each string in the JSON array into natural English. These are consecutive lines " +
            "of a phone call transcript (mostly Thai), made by speech recognition, so they may contain errors. " +
            "Reply with only a JSON array of strings, the same length and order as the input; keep a string that is already English as it is." },
          { role: "user", content: JSON.stringify(batch.map(l => l.text)) },
        ],
        max_tokens: 4096,
        temperature: 0,
      }) as { response?: unknown };
      const r = out?.response;
      const arr = Array.isArray(r) ? r : JSON.parse(String(r ?? "").match(/\[[\s\S]*\]/)?.[0] ?? "null");
      if (Array.isArray(arr) && arr.length === batch.length) en = arr.map(x => String(x ?? ""));
    } catch (e) { console.error("translate batch failed:", e); }
    for (let j = 0; j < batch.length; j++) {
      let text = en?.[j] ?? "";
      if (!en) {
        try {
          const out = await env.AI.run(FALLBACK_TRANSLATE_MODEL, { text: batch[j].text, source_lang: batch[j].lang || "th", target_lang: "en" }) as { translated_text?: string };
          text = out?.translated_text ?? "";
        } catch (e) { console.error("translate line failed:", e); }
      }
      text = text.trim();
      if (text && text.toLowerCase() !== batch[j].text.toLowerCase()) batch[j].en = text;
    }
  }
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
