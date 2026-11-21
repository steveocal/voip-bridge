import type { Env } from "./types";
import { sendGmailMessage } from "./gmail";
import { sendPushNotification } from "./push";
import { audit } from "./compliance";

// ── Security alerts to the admins ─────────────────────────────
// Things that may mean someone is misusing the phones, sent by email (the
// shared Google account, as voicemail is) and as a push notification to
// the admins' Android app, so the next ext 200 is noticed in minutes rather
// than on the carrier's bill:
//   call.emergency   a 999 / 112 call (every one)
//   dial.<kind>      an extension dialled an international or premium-rate
//                    number ([pb-out-limit], event=dialalert)
//   limit.<reason>   the PBX refused an outgoing call at the call limits
//   auth.burst       repeated wrong passwords on the dashboard sign-in
// Admins are the Odoo administrators (compliance.ts syncAdmins); their
// addresses and devices come from their extensions. The same alert key is
// sent at most once an hour (emergency calls always), and every alert sent
// goes in the audit log as alert.sent.

const REPEAT_MS = 60 * 60_000;

interface Recipients { emails: string[]; exts: string[] }

async function adminRecipients(env: Env): Promise<Recipients> {
  let ids: number[] = [];
  try { ids = JSON.parse((await env.DB.prepare("SELECT value FROM settings WHERE key = 'admin_user_ids'").first<{ value: string }>())?.value || "[]"); } catch { /* none */ }
  ids = ids.filter((n) => Number.isInteger(n));
  if (!ids.length) return { emails: [], exts: [] };
  const rows = (await env.DB.prepare(
    `SELECT number, user_email FROM extensions WHERE user_id IN (${ids.map(() => "?").join(",")}) AND COALESCE(active, 1) = 1`
  ).bind(...ids).all<{ number: string; user_email: string | null }>()).results ?? [];
  const emails = [...new Set(rows.map((r) => (r.user_email || "").trim().toLowerCase()).filter((e) => /^[^@ ]+@[^@ ]+$/.test(e)))];
  return { emails, exts: [...new Set(rows.map((r) => r.number))] };
}

/** Sends one alert. Never throws. `key` dedupes repeats for an hour;
 *  `always` skips that (emergency calls). */
export async function sendAlert(env: Env, key: string, title: string, text: string, always = false): Promise<void> {
  try {
    const now = Date.now();
    if (!always) {
      const sk = "alert_last:" + key.slice(0, 80);
      const last = Number((await env.DB.prepare("SELECT value FROM settings WHERE key = ?1").bind(sk).first<{ value: string }>())?.value || 0);
      if (now - last < REPEAT_MS) return;
      await env.DB.prepare(
        "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at"
      ).bind(sk, String(now)).run();
    }
    const to = await adminRecipients(env);
    const done: string[] = [];
    if (to.emails.length) {
      const body = text + "\n\n" + new Date(now).toUTCString() +
        "\nConfiguration → Audit in the phone dashboard has the details: https://voip.ihpltd.co.uk/dashboard";
      const r = await sendGmailMessage(env, 0, { shared: true, to: to.emails.join(", "), subject: "⚠ Call Vault: " + title, body, fromName: "Call Vault" });
      done.push(r.ok ? "email " + to.emails.length : "email failed: " + (r.error || "").slice(0, 80));
    }
    if (to.exts.length) {
      const n = await sendPushNotification(env, to.exts, "⚠ " + title, text.slice(0, 240));
      done.push("push " + n);
    }
    if (!to.emails.length && !to.exts.length) done.push("no admins to tell");
    console.warn("alert:", key, title, done.join("; "));
    await audit(env, { name: "System" }, "alert.sent", key, { title, text: text.slice(0, 500), sent: done.join("; ") });
  } catch (e) {
    console.error("sendAlert failed:", key, e);
  }
}

const DIAL_KINDS: Record<string, string> = { international: "International number dialled", premium: "Premium-rate number dialled" };

/** event=dialalert from [pb-out-limit]: kind, ext, number (digits). */
export async function noteDialAlert(env: Env, params: URLSearchParams): Promise<void> {
  const kind = params.get("kind") ?? "";
  if (!DIAL_KINDS[kind]) return;
  const ext = (params.get("ext") ?? "").replace(/\D/g, "").slice(0, 10);
  const number = (params.get("number") ?? "").replace(/\D/g, "").slice(0, 20);
  await audit(env, { name: "PBX", ext }, "call." + kind, number);
  // One alert per extension and destination prefix an hour.
  await sendAlert(env, `dial.${kind}:${ext}:${number.slice(0, 5)}`, DIAL_KINDS[kind] + (ext ? " from ext " + ext : ""),
    (ext ? "Extension " + ext : "The PBX") + " called +" + number + " (" + kind + "). If nobody there made this call, change that extension's password in Odoo and check the carrier account.");
}

// users.ts locks an extension out after 5 wrong passwords in 15 minutes
// and an IP after 20; alert when the extension is locked out or one IP has
// tried 10 times.
const AUTH_BURST_EXT = 5;
const AUTH_BURST_IP = 10;
const AUTH_WINDOW_MS = 15 * 60_000;

/** After a failed dashboard sign-in. */
export async function checkLoginBurst(env: Env, ext: string, ip: string): Promise<void> {
  try {
    const since = Date.now() - AUTH_WINDOW_MS;
    const r = await env.DB.prepare(
      "SELECT (SELECT COUNT(*) FROM login_failures WHERE ext = ?1 AND at > ?3) AS byExt, (SELECT COUNT(*) FROM login_failures WHERE ip = ?2 AND ip != '' AND at > ?3) AS byIp"
    ).bind(ext, ip, since).first<{ byExt: number; byIp: number }>();
    if (!r || (r.byExt < AUTH_BURST_EXT && r.byIp < AUTH_BURST_IP)) return;
    const who = r.byExt >= AUTH_BURST_EXT ? "ext " + ext : "IP " + ip;
    await sendAlert(env, "auth.burst:" + who, "Repeated wrong passwords for " + who,
      Math.max(r.byExt, r.byIp) + " failed sign-ins in 15 minutes (extension " + (ext || "?") + ", from " + (ip || "unknown IP") + "). Someone may be guessing a password.");
  } catch (e) {
    console.error("checkLoginBurst failed:", e);
  }
}
