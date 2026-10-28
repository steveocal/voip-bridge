import type { Env } from "./types";
import type { Message } from "./odoo";
import { signed, unsign, userEmail } from "./users";

// ── Gmail API client (OAuth refresh-token flow) ───────────────
// Reads messages to/from a contact's email via the Gmail API and returns
// normalized Message objects that upsertMessages() writes into D1.
//
// NOTE: Gmail's `messages.list` does NOT populate `payload.headers` even with
// `format=metadata&metadataHeaders=…` (returns an empty payload). It DOES work
// on `messages.get`. So we list ids, then GET each message with format=metadata
// to retrieve From/To/Subject/Date headers + snippet. N+1 but proven correct.

// Each user reads their own Google account: the refresh token they gave
// when they connected it (user_google, see /google/connect). The worker's
// own GOOGLE_REFRESH_TOKEN stands in for the one user whose Odoo email is
// that account's address, so the original mailbox keeps working.

const tokenCache = new Map<string, { token: string; expiry: number }>();
let envAccountEmail: string | null = null;

async function refreshAccessToken(env: Env, refreshToken: string): Promise<string | null> {
  const hit = tokenCache.get(refreshToken);
  if (hit && hit.expiry > Date.now() + 60_000) return hit.token;
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }).toString(),
    });
    const data = await res.json() as { access_token?: string; expires_in?: number };
    if (!data.access_token) return null;
    const expiresIn = (data.expires_in ?? 3600) - 60;
    tokenCache.set(refreshToken, { token: data.access_token, expiry: Date.now() + expiresIn * 1000 });
    return data.access_token;
  } catch (e) {
    console.error("Google token refresh failed:", e);
    return null;
  }
}

/** The Gmail address a token belongs to. */
async function accountEmail(token: string): Promise<string> {
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return "";
  return String(((await res.json()) as { emailAddress?: string }).emailAddress || "");
}

async function getAccessToken(env: Env, userId: number): Promise<string | null> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !userId) return null;
  const own = await env.DB.prepare("SELECT refresh_token FROM user_google WHERE user_id = ?1").bind(userId).first<{ refresh_token: string }>();
  if (own) return refreshAccessToken(env, own.refresh_token);
  if (!env.GOOGLE_REFRESH_TOKEN) return null;
  const token = await refreshAccessToken(env, env.GOOGLE_REFRESH_TOKEN);
  if (!token) return null;
  if (envAccountEmail === null) envAccountEmail = (await accountEmail(token)).toLowerCase();
  const mine = (await userEmail(env, userId)).toLowerCase();
  return mine && mine === envAccountEmail ? token : null;
}

/** Which Google account a user has connected (null = none). */
export async function googleAccount(env: Env, userId: number): Promise<{ email: string; own: boolean } | null> {
  const own = await env.DB.prepare("SELECT email FROM user_google WHERE user_id = ?1").bind(userId).first<{ email: string }>();
  if (own) return { email: own.email, own: true };
  return (await getAccessToken(env, userId)) && envAccountEmail ? { email: envAccountEmail, own: false } : null;
}

// ── Connecting a user's Google account (OAuth code flow) ──────

const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/contacts.readonly",
  "email",
];

function googleRedirect(request: Request): string {
  return new URL("/google/callback", request.url).toString();
}

/** Sends the signed-in user to Google's consent screen. The Odoo addon asks
 *  with ?json=1&back=<its own page> and redirects the browser itself, so
 *  its API token never reaches the browser; Google's answer then returns
 *  there instead of to the dashboard. */
export async function handleGoogleConnect(request: Request, env: Env, userId: number): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const back = params.get("back") || "";
  if (!env.GOOGLE_CLIENT_ID) return Response.json({ error: "Google isn't configured on the worker" }, { status: 503 });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", googleRedirect(request));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  const backB64 = back ? btoa(back).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : "";
  url.searchParams.set("state", await signed(env, `google.${userId}.${Date.now() + 15 * 60_000}.${backB64}`));
  if (params.get("json") === "1") return Response.json({ url: url.toString() });
  return Response.redirect(url.toString(), 302);
}

/** Google sends the user back here; keep their refresh token. */
export async function handleGoogleCallback(request: Request, env: Env): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const state = await unsign(env, params.get("state") || "");
  const [kind, uid, exp, backB64] = (state || "").split(".");
  let page = new URL("/dashboard", request.url).toString();
  if (backB64) { try { page = atob(backB64.replace(/-/g, "+").replace(/_/g, "/")); } catch { /* keep the dashboard */ } }
  const back = (msg: string) => {
    const u = new URL(page);
    u.searchParams.set("google", msg);
    return Response.redirect(u.toString(), 302);
  };
  if (kind !== "google" || !uid || Number(exp) < Date.now()) return back("Google sign-in expired, try again");
  if (!params.get("code")) return back(params.get("error") === "access_denied" ? "Google access was not allowed" : "Google sign-in failed");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: params.get("code")!,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: googleRedirect(request),
      grant_type: "authorization_code",
    }).toString(),
  });
  const data = await res.json() as { access_token?: string; refresh_token?: string };
  if (!data.refresh_token || !data.access_token) return back("Google gave no refresh token");
  const email = await accountEmail(data.access_token);
  await env.DB.prepare(
    "INSERT INTO user_google (user_id, email, refresh_token, updated_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(user_id) DO UPDATE SET email=excluded.email, refresh_token=excluded.refresh_token, updated_at=excluded.updated_at"
  ).bind(parseInt(uid), email, data.refresh_token, Date.now()).run();
  googleContactsCache.delete(parseInt(uid));
  return back("connected");
}

export async function handleGoogleDisconnect(env: Env, userId: number): Promise<Response> {
  await env.DB.prepare("DELETE FROM user_google WHERE user_id = ?1").bind(userId).run();
  googleContactsCache.delete(userId);
  return Response.json({ ok: true });
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
export async function searchGmailMessages(env: Env, userId: number, email: string, limit = 30): Promise<Message[]> {
  const clean = (email || "").trim();
  if (!clean) return [];
  const token = await getAccessToken(env, userId);
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

/** Search Gmail for recent messages across all senders (last N days). */
export async function searchRecentGmailMessages(env: Env, userId: number, days = 7, limit = 30): Promise<Message[]> {
  const token = await getAccessToken(env, userId);
  if (!token) return [];
  const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  listUrl.searchParams.set("q", `newer_than:${days}d`);
  listUrl.searchParams.set("maxResults", String(Math.min(limit, 20, 100)));
  const listRes = await fetch(listUrl.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!listRes.ok) {
    console.error("Gmail recent list failed:", listRes.status, await listRes.text().catch(() => ""));
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

// The plain-text and HTML versions of a message (either may be missing),
// from anywhere in its MIME tree: the first text/plain and text/html parts.
interface Bodies { text: string; html: string }
function extractBodies(payload: unknown, out: Bodies = { text: "", html: "" }): Bodies {
  const p = payload as { body?: { data?: string }; mimeType?: string; parts?: unknown[] } | undefined;
  if (!p) return out;
  if (p.body?.data) {
    if (p.mimeType === "text/html") out.html ||= b64urlToUtf8(p.body.data);
    else if (!p.mimeType || p.mimeType === "text/plain") out.text ||= b64urlToUtf8(p.body.data);
  }
  for (const part of p.parts ?? []) extractBodies(part, out);
  return out;
}

/** Readable plain text from an email's HTML: style/script dropped, block
 *  ends and <br> as line breaks, tags removed, common entities decoded. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/gi, "&")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Whether a body someone typed is HTML (from a rich editor) rather than
 *  plain text: it has real block or inline tags, not just a stray "<". */
export function looksLikeHtml(s: string): boolean {
  return /<(p|div|br|b|strong|i|em|u|a|ul|ol|li|span|table|h[1-6]|blockquote|img)(\s[^>]*)?\/?>/i.test(s);
}

/** Fetch the full decoded body of a Gmail message (format=full): `text` is
 *  the plain version (made from the HTML when the email has none), `html`
 *  the HTML version or "". */
export async function getGmailBody(env: Env, userId: number, gmailId: string): Promise<Bodies> {
  const token = await getAccessToken(env, userId);
  if (!token) return { text: "", html: "" };
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${gmailId}?format=full`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return { text: "", html: "" };
  const d = await res.json() as { payload?: unknown };
  const b = extractBodies(d.payload);
  // A single-part email whose "plain" body is really HTML.
  if (!b.html && looksLikeHtml(b.text)) b.html = b.text;
  if (!b.text || b.text === b.html) b.text = b.html ? htmlToText(b.html) : b.text;
  return b;
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

function wrap76(s: string): string { return s.replace(/.{76}/g, "$&\r\n"); }

function encodeHeader(s: string): string {
  if (/^[\x20-\x7e]*$/.test(s)) return s;
  return "=?UTF-8?B?" + b64std(s) + "?=";
}

export interface SendOptions {
  to: string;
  subject?: string;
  /** Plain text, or HTML (recognised by its tags) from a rich editor. */
  body?: string;
  /** HTML version; when set, `body` is its plain-text alternative. */
  html?: string;
  replyToGmailId?: string;
}

/** Send (or reply to) an email via the Gmail API. */
export async function sendGmailMessage(env: Env, userId: number, opts: SendOptions): Promise<{ ok: boolean; id?: string; threadId?: string; error?: string }> {
  const token = await getAccessToken(env, userId);
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
  // HTML goes as multipart/alternative with a plain-text version, so every
  // mail client shows something sensible.
  const html = opts.html || (looksLikeHtml(opts.body || "") ? opts.body! : "");
  const text = (html && !opts.html ? htmlToText(html) : (opts.body || (html ? htmlToText(html) : ""))).replace(/\r\n/g, "\n");
  parts.push("MIME-Version: 1.0");
  if (html) {
    const boundary = "pb-" + crypto.randomUUID();
    parts.push(`Content-Type: multipart/alternative; boundary="${boundary}"`, "",
      "--" + boundary, 'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", wrap76(b64std(text)),
      "--" + boundary, 'Content-Type: text/html; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", wrap76(b64std(html)),
      "--" + boundary + "--");
  } else {
    parts.push('Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: 8bit", "", text);
  }
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

// ── Google Contacts (People API) ──────────────────────────────
// Needs contacts.readonly, which /google/connect asks for; tokens from
// before that answer 403 and the dashboard's Gmail tab says so.

export interface GoogleContact {
  id: string;
  name: string;
  numbers: string[];
  email: string;
}

const googleContactsCache = new Map<number, { at: number; list: GoogleContact[] }>();
const GOOGLE_CONTACTS_TTL = 10 * 60_000;

export async function listGoogleContacts(env: Env, userId: number): Promise<GoogleContact[]> {
  const hit = googleContactsCache.get(userId);
  if (hit && Date.now() - hit.at < GOOGLE_CONTACTS_TTL) return hit.list;
  const token = await getAccessToken(env, userId);
  if (!token) throw new Error("Connect your Google account in Settings to see Gmail contacts");
  const list: GoogleContact[] = [];
  let pageToken = "";
  for (let page = 0; page < 10; page++) {
    const url = new URL("https://people.googleapis.com/v1/people/me/connections");
    url.searchParams.set("personFields", "names,phoneNumbers,emailAddresses");
    url.searchParams.set("pageSize", "1000");
    url.searchParams.set("sortOrder", "FIRST_NAME_ASCENDING");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 403) throw new Error("Google contacts not allowed: reconnect Google with the contacts.readonly scope");
    if (!res.ok) throw new Error(`Google contacts failed: ${res.status}`);
    const d = await res.json() as {
      connections?: Array<{
        resourceName: string;
        names?: Array<{ displayName?: string }>;
        phoneNumbers?: Array<{ value?: string }>;
        emailAddresses?: Array<{ value?: string }>;
      }>;
      nextPageToken?: string;
    };
    for (const p of d.connections ?? []) {
      const email = p.emailAddresses?.[0]?.value ?? "";
      const name = p.names?.[0]?.displayName || email;
      if (!name) continue;
      list.push({
        id: p.resourceName.replace("people/", ""),
        name,
        numbers: (p.phoneNumbers ?? []).map(n => (n.value ?? "").trim()).filter(Boolean),
        email,
      });
    }
    if (!d.nextPageToken) break;
    pageToken = d.nextPageToken;
  }
  googleContactsCache.set(userId, { at: Date.now(), list });
  return list;
}
