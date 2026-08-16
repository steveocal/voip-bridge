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
