import type { Env } from "./types";

// ── Jot → text (Workers AI vision model) ──────────────────────
// The dashboard rasterises the Jot page (dark ink on white) and posts it as
// a data: URL; a vision model reads the handwriting back as plain text.

const MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";
const PROMPT = "Transcribe the handwritten notes in this image exactly as written. " +
  "Keep the original line breaks. Output only the transcribed text - no commentary, no quotes, no markdown. " +
  "If a word is unreadable, write [?]. If there is no handwriting, output nothing.";

export async function jotToText(env: Env, image: string): Promise<string> {
  const out = await env.AI.run(MODEL, {
    messages: [{
      role: "user",
      content: [
        { type: "text", text: PROMPT },
        { type: "image_url", image_url: { url: image } },
      ],
    }],
    max_tokens: 1024,
    temperature: 0,
  }) as { response?: string };
  return String(out?.response ?? "").trim();
}
