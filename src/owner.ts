import type { Env } from "./types";
import { odooAuth, odooCall, phoneKey } from "./odoo";
import { userLegs } from "./pbxsync";

// ── "Customer's salesperson" menu keys ────────────────────────
// When a caller picks such a key, the PBX (pb-owner.sh) asks
// GET /pbx/owner?caller=<number> who that is: the Odoo contact with the
// caller's number, its Salesperson (res.partner user_id), or its company's
// when the contact has none. The answer is that user's extensions as ring
// legs, as on route lines ("a201,e202"), or "-" for nobody (an unknown
// caller, no salesperson, a salesperson with no extension, or their 📼 on),
// and the PBX goes straight to the sales team. Capped at a few seconds so a
// slow Odoo never leaves a caller in silence for long.

const LIMIT_MS = 3000;

type Partner = { id: number; name: string; phone: string | false; mobile: string | false; user_id: [number, string] | false; commercial_partner_id: [number, string] | false };

/** The salesperson for a phone number: the contact's, else its company's. */
async function salespersonFor(env: Env, number: string): Promise<{ user: [number, string]; contact: string } | null> {
  const key = phoneKey(number);
  if (!key) return null;
  const uid = await odooAuth(env);
  if (!uid) return null;
  const pattern = "%" + key.split("").join("%") + "%";   // any spacing / punctuation, as lookupCaller
  const r = await odooCall(env, uid, "res.partner", "search_read",
    [["|", ["phone", "=ilike", pattern], ["mobile", "=ilike", pattern]]],
    { fields: ["id", "name", "phone", "mobile", "user_id", "commercial_partner_id"], limit: 10 });
  const hits = ((r.parsed ?? []) as Partner[]).filter((p) => phoneKey(p.phone || "") === key || phoneKey(p.mobile || "") === key);
  // Several contacts with the number: one with its own salesperson wins.
  const own = hits.find((p) => p.user_id);
  if (own?.user_id) return { user: own.user_id, contact: own.name };
  for (const p of hits) {
    const co = p.commercial_partner_id;
    if (!co || co[0] === p.id) continue;
    const c = await odooCall(env, uid, "res.partner", "read", [[co[0]]], { fields: ["user_id"] });
    const user = ((c.parsed ?? []) as Array<{ user_id: [number, string] | false }>)[0]?.user_id;
    if (user) return { user, contact: `${p.name} (${co[1]})` };
  }
  return null;
}

/** GET /pbx/owner?caller=<number> (PBX secret only) → "<legs>\n" or "-\n". */
export async function handlePbxOwner(request: Request, env: Env): Promise<Response> {
  const caller = (new URL(request.url).searchParams.get("caller") || "").replace(/[^\d+]/g, "");
  const reply = (legs: string[]) => new Response(`${legs.join(",") || "-"}\n`, { headers: { "Content-Type": "text/plain" } });
  if (!caller) return reply([]);
  try {
    const timeout = new Promise<null>((r) => setTimeout(() => r(null), LIMIT_MS));
    const found = await Promise.race([salespersonFor(env, caller), timeout]);
    if (!found) { console.log(`salesperson for ${caller}: none`); return reply([]); }
    const legs = await userLegs(env, found.user[0]);
    console.log(`salesperson for ${caller}: ${found.contact} → ${found.user[1]} → ${legs.join(",") || "no extension to ring"}`);
    return reply(legs);
  } catch (e) {
    console.error("salesperson lookup failed:", e);
    return reply([]);
  }
}
