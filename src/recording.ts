import type { Env } from "./types";
import { ariRecordingFile } from "./asterisk";

// ── Call recordings ───────────────────────────────────────────
// MixMonitor writes three 8 kHz mono WAVs per call: <name> (both sides mixed,
// for playback), plus <name>-rx (audio the recorded channel received) and
// <name>-tx (audio sent to it), for labelling who said what. Inbound the
// recorded channel is the trunk (rx = caller, tx = us); outbound it is our
// own phone (rx = us, tx = the far end).
// Not MixMonitor's stereo D option: in Asterisk 22.10.1 it doesn't resample,
// and wideband (Opus) calls came out slowed 6x and unintelligible.

export interface Audio { rate: number; samples: Int16Array }

/** A stored recording as mono samples, or null if Asterisk doesn't have it. */
export async function fetchRecording(env: Env, name: string): Promise<Audio | null> {
  const res = await ariRecordingFile(env, name);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Asterisk returned ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number) => String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("recording is not a WAV");
  let rate = 8000;
  for (let at = 12; at + 8 <= bytes.length;) {
    const size = view.getUint32(at + 4, true);
    if (tag(at) === "fmt ") {
      if (view.getUint16(at + 8, true) !== 1 || view.getUint16(at + 10, true) !== 1 || view.getUint16(at + 22, true) !== 16) {
        throw new Error("recording is not 16-bit mono PCM");
      }
      rate = view.getUint32(at + 12, true);
    }
    if (tag(at) === "data") {
      const len = Math.min(size, bytes.length - at - 8) & ~1;
      return { rate, samples: new Int16Array(bytes.buffer.slice(bytes.byteOffset + at + 8, bytes.byteOffset + at + 8 + len)) };
    }
    at += 8 + size + (size & 1);
  }
  throw new Error("WAV has no data");
}

export function monoWav(samples: Int16Array, rate: number): Uint8Array {
  const out = new Uint8Array(44 + samples.length * 2);
  const v = new DataView(out.buffer);
  out.set([82, 73, 70, 70], 0); // "RIFF"
  v.setUint32(4, 36 + samples.length * 2, true);
  out.set([87, 65, 86, 69, 102, 109, 116, 32], 8); // "WAVEfmt "
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  out.set([100, 97, 116, 97], 36); // "data"
  v.setUint32(40, samples.length * 2, true);
  out.set(new Uint8Array(samples.buffer, samples.byteOffset, samples.length * 2), 44);
  return out;
}

/** HTTP response streaming the mixed recording for playback. */
export async function playbackResponse(env: Env, name: string): Promise<Response> {
  const res = await ariRecordingFile(env, name);
  if (!res.ok) return Response.json({ error: `Asterisk returned ${res.status}` }, { status: res.status === 404 ? 404 : 502 });
  const headers = new Headers({ "Content-Type": res.headers.get("Content-Type") || "audio/wav", "Cache-Control": "private, max-age=86400" });
  const len = res.headers.get("Content-Length");
  if (len) headers.set("Content-Length", len);
  return new Response(res.body, { headers });
}
