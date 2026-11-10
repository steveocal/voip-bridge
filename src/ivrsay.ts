import type { Env } from "./types";
import { storedMenu, type Menu } from "./ivr";
import { wavSamples } from "./followup";
import { whisperPiece } from "./transcribe";

// ── Spoken phone menus ────────────────────────────────────────
// A menu with "Callers Can Say Their Choice" (Odoo) lets callers answer the
// prompt out loud as well as with a key. The PBX records what they say and
// POSTs it to /pbx/say?menu=<id>; we answer with the key it means, as plain
// text (0-9, s for *, h for #), "-" when it isn't clear, or "." when there
// were no words in it at all (a noise set off the detector), and the dialplan
// carries on as if that key had been pressed. Each option's name and
// description (what the department does) are what the answer is matched
// against: the name or the key's number said outright first, then the text
// model picks the option whose description fits ("my panel's stopped
// working" → Technical), and it may only pick one of the menu's own keys.

const MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";
const MAX_SECONDS = 20;
const KEY_OUT: Record<string, string> = { "*": "s", "#": "h" };
const NUMBER_WORDS: Record<string, string> = {
  zero: "0", oh: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9",
  star: "*", hash: "#", pound: "#",
};

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9*#' ]+/g, " ").split(/\s+/).filter(Boolean);

/** The key a caller's words name outright: an option's name, or "one" / "press 2". */
export function plainMatch(m: Menu, text: string): string | null {
  const said = ` ${words(text).join(" ")} `;
  const hits = new Set<string>();
  for (const [k, c] of Object.entries(m.names ?? {})) {
    const name = words(c.name).join(" ");
    if (name && m.keys[k] && said.includes(` ${name} `)) hits.add(k);
  }
  if (hits.size === 1) return [...hits][0];
  if (hits.size > 1) return null;
  // A bare key ("two", "option 3", "press star"), only when that's all they said.
  const w = words(text).filter((x) => !["option", "press", "number", "please", "the", "key", "um", "er", "erm"].includes(x));
  if (w.length === 1) {
    const k = NUMBER_WORDS[w[0]] ?? (/^[0-9*#]$/.test(w[0]) ? w[0] : null);
    if (k && m.keys[k]) return k;
  }
  return null;
}

/** The text model's pick: one of the menu's keys, or null when it's not sure. */
async function modelMatch(env: Env, m: Menu, text: string): Promise<string | null> {
  const options = Object.keys(m.keys).sort()
    .map((k) => ({ key: k, name: m.names?.[k]?.name || "", about: m.names?.[k]?.about || "" }))
    .filter((o) => o.name || o.about);
  if (!options.length) return null;
  const list = options.map((o) => `- key "${o.key}": ${o.name || "(no name)"}${o.about ? ` — ${o.about}` : ""}`).join("\n");
  try {
    const out = await env.AI.run(MODEL, {
      messages: [
        { role: "system", content: "You route phone callers at Infrared Heating Products (IHP), a UK company that sells infrared heating panels. " +
          "The caller heard a menu and said what they want; it was transcribed by speech recognition, so it may have mistakes. " +
          "Pick the one option that fits best, using each option's name and what it covers:\n" + list + "\n" +
          'Reply with JSON only: {"key": "<one of the keys above>"} or {"key": null} if what they said fits none of them or is unclear.' },
        { role: "user", content: text },
      ],
      max_tokens: 30,
      temperature: 0,
    }) as { response?: unknown };
    const raw = typeof out?.response === "string" ? out.response : JSON.stringify(out?.response ?? {});
    const key = (JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as { key?: unknown }).key;
    return typeof key === "string" && m.keys[key] && options.some((o) => o.key === key) ? key : null;
  } catch (e) {
    console.error("spoken menu: model match failed:", e);
    return null;
  }
}

/** POST /pbx/say?menu=<id> (PBX secret only), body = the caller's answer as a WAV file. → "<key>\n", "-\n" or ".\n". */
export async function handlePbxSay(request: Request, env: Env): Promise<Response> {
  const reply = (k: string | null, empty = false) => new Response(`${k ? KEY_OUT[k] ?? k : empty ? "." : "-"}\n`, { headers: { "Content-Type": "text/plain" } });
  const menuId = Number(new URL(request.url).searchParams.get("menu"));
  const menu = Number.isInteger(menuId) ? await storedMenu(env, menuId) : null;
  if (!menu?.spoken) return reply(null);
  const wav = wavSamples(await request.arrayBuffer());
  if (!wav) return reply(null);
  if (!wav.samples.length) return reply(null, true);
  const samples = wav.samples.length > wav.rate * MAX_SECONDS ? wav.samples.subarray(0, wav.rate * MAX_SECONDS) : wav.samples;
  let text = "";
  try {
    text = (await whisperPiece(env, samples, wav.rate, 0)).map((l) => l.text).join(" ").replace(/\s+/g, " ").trim();
  } catch (e) {
    console.error("spoken menu: transcription failed:", e);
    return reply(null);
  }
  if (!/[a-z0-9]/i.test(text)) return reply(null, true);
  const plain = plainMatch(menu, text);
  const key = plain ?? await modelMatch(env, menu, text);
  console.log(`spoken menu ${menu.id}: "${text}" → ${key ?? "not understood"}${key && !plain ? " (model)" : ""}${key ? ` ${menu.names?.[key]?.name ?? ""}` : ""}`);
  return reply(key);
}
