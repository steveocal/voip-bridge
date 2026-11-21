import type { Env } from "./types";

// ── AI email writing (Workers AI) ─────────────────────────────
// The compose window's Ctrl+1 / ✨ button: the draft goes here and comes back
// as a finished email body. Lines starting with "!!" in the draft are
// instructions to the model ("!! make it shorter", "!! offer 10% off"),
// which it follows and leaves out of the result. The email being replied
// to, if any, is passed for context. DeepSeek by default; the AI_EMAIL_MODEL
// var picks another Workers AI text model.

const DEFAULT_MODEL = "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b";
const MAX_CONTEXT = 6000; // characters of the original email passed along

const SYSTEM = `You help a small UK business write emails to its customers and suppliers.
You get a draft. Lines in it that start with "!!" are instructions to you, not part of the email: follow them, and never include them in your answer.
Turn the draft into a clear, friendly, professional email in British English. Keep the writer's facts, names, figures and sign-off; don't invent prices, dates or promises they didn't make. If the draft is only instructions, write the email they describe.
Answer with the email body only: no subject line, no explanations, no markdown, no quotes around it.`;

interface AiEmailRequest {
  draft?: string;
  subject?: string;
  to?: string;
  original?: string; // the email being replied to, as text
}

/** POST /ai/email → { text, html, model } */
export async function handleAiEmail(request: Request, env: Env): Promise<Response> {
  let body: AiEmailRequest;
  try { body = await request.json(); } catch { return Response.json({ error: "invalid JSON" }, { status: 400 }); }
  const draft = String(body.draft ?? "").trim();
  if (!draft) return Response.json({ error: "Write a draft or some !! instructions first." }, { status: 400 });

  const parts: string[] = [];
  if (body.to) parts.push(`To: ${body.to}`);
  if (body.subject) parts.push(`Subject: ${body.subject}`);
  const original = String(body.original ?? "").trim();
  if (original) parts.push(`The email I'm replying to:\n"""\n${original.slice(0, MAX_CONTEXT)}\n"""`);
  parts.push(`My draft (lines starting with !! are instructions to you):\n"""\n${draft}\n"""`);

  const model = env.AI_EMAIL_MODEL || DEFAULT_MODEL;
  let out: { response?: string };
  try {
    out = await env.AI.run(model, {
      messages: [{ role: "system", content: SYSTEM }, { role: "user", content: parts.join("\n\n") }],
      max_tokens: 2048,
    }) as { response?: string };
  } catch (e) {
    return Response.json({ error: `AI failed: ${(e as Error).message || e}` }, { status: 502 });
  }
  const text = cleanAnswer(out.response ?? "");
  if (!text) return Response.json({ error: "The AI returned nothing; try again." }, { status: 502 });
  return Response.json({ text, html: toHtml(text), model });
}

/** Strip a reasoning model's <think> section, stray quotes/fences, any
 *  "Subject:" line and leftover !! lines. */
export function cleanAnswer(raw: string): string {
  let t = raw;
  const end = t.lastIndexOf("</think>");
  if (end >= 0) t = t.slice(end + "</think>".length);
  t = t.replace(/^\s*```[a-z]*\s*/i, "").replace(/\s*```\s*$/, "");
  t = t.trim().replace(/^"""\s*|\s*"""$/g, "").replace(/^"([\s\S]*)"$/, "$1");
  t = t.replace(/^\s*subject:.*\n+/i, "");
  t = t.split("\n").filter((l) => !l.trim().startsWith("!!")).map((l) => l.replace(/\s+$/, "")).join("\n");
  return t.replace(/\n{3,}/g, "\n\n").trim();
}

/** Plain text → simple HTML: blank lines make paragraphs, single newlines <br>. */
export function toHtml(text: string): string {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
  return text.split(/\n\s*\n/).map((p) => `<p>${esc(p.trim()).replace(/\n/g, "<br>")}</p>`).join("");
}
