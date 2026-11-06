import type { Env, ExecutionContext } from "./types";
import { ariRequest } from "./asterisk";
import { pushCallToOdoo } from "./odoo";
import type { User } from "./users";

// ── 📱 Call via my mobile ─────────────────────────────────────
// For a poor internet connection: instead of carrying the call's audio over
// the softphone, the dashboard sends one small request and Asterisk does the
// rest. [mobile-call] in extensions.conf (scripts/vps-setup-mobile-call.sh)
// rings the user's SIM mobile first; once they answer it dials the other
// party from the extension's usual outgoing number and joins the two.
//
// Each call is a call_log row "mob-<id>" (outgoing, the user's extension),
// so it shows in History, records like any other call and goes to Odoo.

/** Dial-box text → E.164 ("+…"), or "" if it isn't a phone number. UK
 *  national numbers (0…) become +44. */
export function toE164(raw: string): string {
  const s = String(raw || "").trim();
  const d = s.replace(/\D/g, "");
  let out = "";
  if (s.startsWith("+")) out = "+" + d;
  else if (d.startsWith("00")) out = "+" + d.slice(2);
  else if (d.startsWith("0")) out = "+44" + d.slice(1);
  else if (d.length > 6) out = "+" + d;
  return /^\+\d{8,15}$/.test(out) ? out : "";
}

async function userSetting(env: Env, userId: number, key: string): Promise<string> {
  const r = await env.DB.prepare(
    `SELECT value FROM user_settings WHERE user_id = ?1 AND key = ?2
     UNION ALL SELECT value FROM settings WHERE key = ?2 LIMIT 1`
  ).bind(userId, key).first<{ value: string }>();
  return r?.value ?? "";
}

/** POST /mobile-call {number?} — number left out = the last number this
 *  user called. */
export async function handleMobileCall(request: Request, env: Env, user: User): Promise<Response> {
  let body: { number?: string } = {};
  try { body = await request.json(); } catch { /* no body: last number called */ }

  const mobile = toE164(await userSetting(env, user.id, "mobileNumber"));
  if (!mobile) return Response.json({ error: "Set “My mobile” in Settings first" }, { status: 400 });

  let raw = String(body.number ?? "").trim();
  if (!raw) {
    const last = await env.DB.prepare(
      `SELECT phone_number FROM call_log
       WHERE direction = 'outgoing' AND (user_id = ?1 OR extension = ?2)
         AND phone_number IS NOT NULL AND length(phone_number) > 6
       ORDER BY COALESCE(start_date, create_date) DESC LIMIT 1`
    ).bind(user.id, user.ext).first<{ phone_number: string }>();
    raw = last?.phone_number ?? "";
    if (!raw) return Response.json({ error: "No number to call — type one or pick a call" }, { status: 400 });
  }
  const target = toE164(raw);
  if (!target) return Response.json({ error: `Can't call “${raw}” from the mobile` }, { status: 400 });
  if (target === mobile) return Response.json({ error: "That's your own mobile" }, { status: 400 });

  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const callId = `mob-${id}`;
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO call_log (call_id, phone_number, direction, state, start_date, notes_html, write_date, extension, user_id)
     VALUES (?1, ?2, 'outgoing', 'calling', ?3, ?4, ?3, ?5, ?6)`
  ).bind(callId, target, now, "<p><i>📱 Called via my mobile</i></p>", user.ext, user.id).run();

  let ok = false, why = "";
  try {
    const params = new URLSearchParams({
      endpoint: "Local/me@mobile-call/n",
      context: "mobile-call", extension: "far", priority: "1",
      callerId: `"Call ${target}" <${target}>`,
      timeout: "60",
    });
    const r = await ariRequest(env, `channels?${params}`, "POST", {
      variables: { __MC_ID: id, __MC_MOBILE: mobile, __MC_TARGET: target, __MC_EXT: user.ext },
    }) as { id?: string; message?: string };
    ok = !!r?.id;
    why = r?.message ?? "";
  } catch (e) { why = String(e); }
  if (!ok) {
    console.error("mobile-call originate failed:", why);
    await env.DB.prepare("UPDATE call_log SET state = 'aborted', end_date = ?1 WHERE call_id = ?2").bind(now, callId).run();
    return Response.json({ error: "Couldn't start the call" }, { status: 502 });
  }
  return Response.json({ ok: true, callId, target, mobile });
}

/** POST /mobile-call/event — from [mobile-call] in extensions.conf:
 *  answered = the user picked up on the mobile and the far end is ringing;
 *  done = the far end's leg ended (status = DIALSTATUS, talk = seconds);
 *  nomobile = the mobile didn't pick up. */
export async function handleMobileCallEvent(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const params = new URLSearchParams(await request.text());
  if (!env.PUSH_SECRET || params.get("secret") !== env.PUSH_SECRET) return Response.json({ error: "forbidden" }, { status: 403 });
  const callId = `mob-${(params.get("id") ?? "").replace(/[^a-z0-9]/gi, "")}`;
  const event = params.get("event");
  const now = Date.now();
  if (event === "answered") {
    await env.DB.prepare("UPDATE call_log SET state = 'ongoing', write_date = ?1 WHERE call_id = ?2").bind(now, callId).run();
  } else if (event === "done") {
    const status = params.get("status") ?? "";
    const talk = parseInt(params.get("talk") ?? "0", 10) || 0;
    const answered = status === "ANSWER";
    // Talk time from the far end answering; start_date stays when it was placed.
    await env.DB.prepare(
      `UPDATE call_log SET state = ?1, end_date = ?2, write_date = ?2,
         start_date = CASE WHEN ?3 > 0 THEN ?2 - ?3 * 1000 ELSE start_date END
       WHERE call_id = ?4`
    ).bind(answered ? "terminated" : "missed", now, talk, callId).run();
    ctx.waitUntil(pushCallToOdoo(env, callId).catch(e => console.error("pushCallToOdoo failed:", e)));
  } else if (event === "nomobile") {
    // The mobile never picked up, so the other party was never dialled.
    const status = (params.get("status") ?? "").toLowerCase() || "no answer";
    await env.DB.prepare(
      `UPDATE call_log SET state = 'aborted', end_date = ?1, write_date = ?1,
         notes_html = COALESCE(notes_html, '') || ?2
       WHERE call_id = ?3`
    ).bind(now, `<p><i>Your mobile didn't answer (${status.replace(/[<>&]/g, "")}), so nobody was called.</i></p>`, callId).run();
  } else {
    return Response.json({ error: "unknown event" }, { status: 400 });
  }
  return Response.json({ ok: true });
}
