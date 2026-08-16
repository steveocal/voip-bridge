import type { Env } from "./types";
import type { Message } from "./odoo";

// ── Gmail API client (OAuth refresh-token flow) ───────────────
// Reads messages to/from a contact's email via the Gmail API and returns
// normalized Message objects that upsertMessages() writes into D1.
//
// NOTE: Gmail's `messages.list` does NOT populate `payload.headers` even with
// `format=metadata&metadataHeaders=…` (returns an empty payload). It DOES work
// on `messages.get`. So we list ids, then GET each message with format=metadata
// to retrieve From/To/Subject/Date headers + snippet. N+1 but proven correct.

let cachedToken: { token: string; expiry: number } | null = null;

async function getAccessToken(env: Env): Promise<string | null> {
  if (cachedToken && cachedToken.expiry > Date.now() + 60_000) return cachedToken.token;
  if (!env.GOOGLE_REFRESH_TOKEN || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return null;
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        refresh_token: env.GOOGLE_REFRESH_TOKEN,
        grant_type: "refresh_token",
      }).toString(),
    });
    const data = await res.json() as { access_token?: string; expires_in?: number };
    if (!data.access_token) return null;
    const expiresIn = (data.expires_in ?? 3600) - 60;
    cachedToken = { token: data.access_token, expiry: Date.now() + expiresIn * 1000 };
    return cachedToken.token;
  } catch (e) {
    console.error("Gmail token refresh failed:", e);
    return null;
  }
}

const OUR_SENDERS = /(systecgroup\.info|ihproducts\.co\.uk|infracool\.co\.uk|infraredheaterpanels\.co\.uk)/i;

async function getMessage(token: string, id: string): Promise<Message | null> {
  const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}`);
  url.searchParams.set("format", "metadata");
  // append() (not set()) — repeated metadataHeaders params, one per header.
  url.searchParams.append("metadataHeaders", "From");
  url.searchParams.append("metadataHeaders", "To");
  url.searchParams.append("metadataHeaders", "Subject");
  url.searchParams.append("metadataHeaders", "Date");
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const m = await res.json() as {
    id: string;
    internalDate?: string;
    snippet?: string;
    payload?: { headers?: Array<{ name: string; value: string }> };
  };
  const headers: Record<string, string> = {};
  for (const h of m.payload?.headers ?? []) headers[h.name.toLowerCase()] = h.value;
  const from = headers["from"] ?? "";
  return {
    gmail_id: m.id,
    subject: headers["subject"] ?? "(no subject)",
    body: m.snippet ?? "",
    email_from: from,
    direction: OUR_SENDERS.test(from) ? "outgoing" : "incoming",
    source: "gmail",
    date: m.internalDate ? parseInt(m.internalDate, 10) : undefined,
  };
}

/** Search Gmail for the email thread with a contact (from: OR to:). */
export async function searchGmailMessages(env: Env, email: string, limit = 30): Promise<Message[]> {
  const clean = (email || "").trim();
  if (!clean) return [];
  const token = await getAccessToken(env);
  if (!token) return [];

  const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  listUrl.searchParams.set("q", `from:${clean} OR to:${clean}`);
  // Cap at 20 to stay well under the Workers free-plan subrequest limit
  // (1 list + N gets + Odoo XML-RPC calls per /messages request).
  listUrl.searchParams.set("maxResults", String(Math.min(limit, 20, 100)));
  const listRes = await fetch(listUrl.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!listRes.ok) {
    console.error("Gmail list failed:", listRes.status, await listRes.text().catch(() => ""));
    return [];
  }
  const data = await listRes.json() as { messages?: Array<{ id: string }> };
  const ids = (data.messages ?? []).map(m => m.id);

  const results = await Promise.all(ids.map(id => getMessage(token, id)));
  return results.filter((m): m is Message => m !== null);
}

// ── Full body + send ───────────────────────────────────────────

function b64urlToUtf8(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (b64.length % 4)) % 4;
  const bin = atob(b64 + "=".repeat(pad));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder("utf-8").decode(bytes);
}

// Recursively extract the best text body (text/plain preferred, else text/html).
function extractText(payload: unknown): string {
  const p = payload as { body?: { data?: string }; mimeType?: string; parts?: unknown[] } | undefined;
  if (!p) return "";
  if (p.body && p.body.data) return b64urlToUtf8(p.body.data);
  if (Array.isArray(p.parts)) {
    for (const part of p.parts) {
      const pp = part as { mimeType?: string; body?: { data?: string } };
      if (pp.mimeType === "text/plain" && pp.body && pp.body.data) return b64urlToUtf8(pp.body.data);
    }
    for (const part of p.parts) {
      const pp = part as { mimeType?: string; body?: { data?: string } };
      if (pp.mimeType === "text/html" && pp.body && pp.body.data) return b64urlToUtf8(pp.body.data);
    }
    for (const part of p.parts) {
      const r = extractText(part);
      if (r) return r;
    }
  }
  return "";
}

/** Fetch the full decoded body of a Gmail message (format=full). */
export async function getGmailBody(env: Env, gmailId: string): Promise<string> {
  const token = await getAccessToken(env);
  if (!token) return "";
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${gmailId}?format=full`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return "";
  const d = await res.json() as { payload?: unknown };
  return extractText(d.payload);
}

async function getThreadContext(token: string, gmailId: string): Promise<{ threadId?: string; messageId?: string; references?: string } | null> {
  const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${gmailId}`);
  url.searchParams.set("format", "metadata");
  url.searchParams.append("metadataHeaders", "Message-ID");
  url.searchParams.append("metadataHeaders", "References");
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const d = await res.json() as { threadId?: string; payload?: { headers?: Array<{ name: string; value: string }> } };
  const headers: Record<string, string> = {};
  for (const h of d.payload?.headers ?? []) headers[h.name.toLowerCase()] = h.value;
  return { threadId: d.threadId, messageId: headers["message-id"], references: headers["references"] };
}

function utf8Bin(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let b = "";
  for (const x of bytes) b += String.fromCharCode(x);
  return b;
}
function b64std(s: string): string { return btoa(utf8Bin(s)); }
function b64url(s: string): string { return b64std(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }

function encodeHeader(s: string): string {
  if (/^[\x20-\x7e]*$/.test(s)) return s;
  return "=?UTF-8?B?" + b64std(s) + "?=";
}

export interface SendOptions {
  to: string;
  subject?: string;
  body?: string;
  replyToGmailId?: string;
}

/** Send (or reply to) an email via the Gmail API. */
export async function sendGmailMessage(env: Env, opts: SendOptions): Promise<{ ok: boolean; id?: string; threadId?: string; error?: string }> {
  const token = await getAccessToken(env);
  if (!token) return { ok: false, error: "no gmail token" };

  let inReplyTo = "", references = "", threadId: string | undefined;
  if (opts.replyToGmailId) {
    const ctx = await getThreadContext(token, opts.replyToGmailId);
    if (ctx) {
      inReplyTo = ctx.messageId || "";
      references = ctx.references ? ctx.references + " " + (ctx.messageId || "") : (ctx.messageId || "");
      threadId = ctx.threadId;
    }
  }

  const parts = [
    "From: Steve <steve@systecgroup.info>",
    "To: " + opts.to,
    "Subject: " + encodeHeader(opts.subject || ""),
  ];
  if (inReplyTo) parts.push("In-Reply-To: <" + inReplyTo + ">");
  if (references.trim()) parts.push("References: " + references.trim());
  parts.push("MIME-Version: 1.0", 'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: 8bit", "", (opts.body || "").replace(/\r\n/g, "\n"));
  const raw = parts.join("\r\n");

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: b64url(raw), ...(threadId ? { threadId } : {}) }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return { ok: false, error: "gmail send " + res.status + " " + t.slice(0, 200) };
  }
  const d = await res.json() as { id?: string; threadId?: string };
  return { ok: true, id: d.id, threadId: d.threadId };
}
