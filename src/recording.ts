import type { Env } from "./types";
import { ariRecordingFile } from "./asterisk";

// ── Call recordings ───────────────────────────────────────────
// MixMonitor's D option writes <name>.raw: headerless 8 kHz 16-bit stereo,
// left = audio the recorded channel received, right = audio sent to it.
// Inbound that channel is the trunk (left = caller, right = us); outbound it
// is our own phone (left = us, right = the far end). Recordings made before
// the split are mono <name>.wav.

export const RAW_RATE = 8000;

export interface Recording {
  rate: number;
  channels: number;
  pcm: Int16Array; // interleaved
}

export async function fetchRecording(env: Env, name: string): Promise<Recording> {
  const res = await ariRecordingFile(env, name);
  if (!res.ok) throw new Error(`Asterisk returned ${res.status}`);
  const raw = (res.headers.get("Content-Type") || "").includes("raw");
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (raw) return { rate: RAW_RATE, channels: 2, pcm: int16(bytes, 0, bytes.length) };

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number) => String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("unrecognised recording format");
  let rate = RAW_RATE, channels = 1;
  for (let at = 12; at + 8 <= bytes.length;) {
    const size = view.getUint32(at + 4, true);
    if (tag(at) === "fmt ") {
      if (view.getUint16(at + 8, true) !== 1 || view.getUint16(at + 22, true) !== 16) throw new Error("not 16-bit PCM");
      channels = view.getUint16(at + 10, true);
      rate = view.getUint32(at + 12, true);
    }
    if (tag(at) === "data") return { rate, channels, pcm: int16(bytes, at + 8, Math.min(size, bytes.length - at - 8)) };
    at += 8 + size + (size & 1);
  }
  throw new Error("WAV has no data");
}

function int16(bytes: Uint8Array, start: number, len: number): Int16Array {
  const off = bytes.byteOffset + start;
  const n = len >> 1;
  return off % 2 === 0
    ? new Int16Array(bytes.buffer, off, n)
    : new Int16Array(bytes.buffer.slice(off, off + n * 2));
}

/** One channel's samples for frames [from, to). */
export function channelSlice(rec: Recording, ch: number, from: number, to: number): Int16Array {
  const out = new Int16Array(Math.max(0, to - from));
  for (let i = 0; i < out.length; i++) out[i] = rec.pcm[(from + i) * rec.channels + ch];
  return out;
}

export function wavHeader(dataLen: number, rate: number, channels: number): Uint8Array {
  const h = new Uint8Array(44);
  const v = new DataView(h.buffer);
  h.set([82, 73, 70, 70], 0); // "RIFF"
  v.setUint32(4, 36 + dataLen, true);
  h.set([87, 65, 86, 69, 102, 109, 116, 32], 8); // "WAVEfmt "
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, channels, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * channels * 2, true);
  v.setUint16(32, channels * 2, true);
  v.setUint16(34, 16, true);
  h.set([100, 97, 116, 97], 36); // "data"
  v.setUint32(40, dataLen, true);
  return h;
}

export function monoWav(samples: Int16Array, rate: number): Uint8Array {
  const out = new Uint8Array(44 + samples.length * 2);
  out.set(wavHeader(samples.length * 2, rate, 1), 0);
  out.set(new Uint8Array(samples.buffer, samples.byteOffset, samples.length * 2), 44);
  return out;
}

/** HTTP response for playing a recording: WAVs pass straight through; stereo
 *  .raw is mixed down to a mono WAV while streaming, so a long call never has
 *  to fit in memory. */
export async function playbackResponse(env: Env, name: string): Promise<Response> {
  const res = await ariRecordingFile(env, name);
  if (!res.ok || !res.body) return Response.json({ error: `Asterisk returned ${res.status}` }, { status: res.status === 404 ? 404 : 502 });
  const headers = new Headers({ "Cache-Control": "private, max-age=86400" });
  const len = Number(res.headers.get("Content-Length")) || 0;
  if (!(res.headers.get("Content-Type") || "").includes("raw")) {
    headers.set("Content-Type", res.headers.get("Content-Type") || "audio/wav");
    if (len) headers.set("Content-Length", String(len));
    return new Response(res.body, { headers });
  }
  headers.set("Content-Type", "audio/wav");
  if (!len) {
    const rec = await fetchRecording(env, name);
    return new Response(monoWav(mixdown(rec.pcm), rec.rate).buffer as ArrayBuffer, { headers });
  }
  const dataLen = Math.floor(len / 4) * 2;
  headers.set("Content-Length", String(44 + dataLen));
  let carry = new Uint8Array(0);
  const mix = new TransformStream<Uint8Array, Uint8Array>({
    start(c) { c.enqueue(wavHeader(dataLen, RAW_RATE, 1)); },
    transform(chunk, c) {
      const buf = new Uint8Array(carry.length + chunk.length);
      buf.set(carry, 0);
      buf.set(chunk, carry.length);
      const frames = buf.length >> 2;
      carry = buf.slice(frames * 4);
      c.enqueue(new Uint8Array(mixdown(new Int16Array(buf.buffer, 0, frames * 2)).buffer));
    },
  });
  return new Response(res.body.pipeThrough(mix), { headers });
}

/** Interleaved stereo → mono, summing both sides (they rarely talk at once). */
function mixdown(stereo: Int16Array): Int16Array {
  const out = new Int16Array(stereo.length >> 1);
  for (let i = 0; i < out.length; i++) {
    const s = stereo[2 * i] + stereo[2 * i + 1];
    out[i] = s > 32767 ? 32767 : s < -32768 ? -32768 : s;
  }
  return out;
}
