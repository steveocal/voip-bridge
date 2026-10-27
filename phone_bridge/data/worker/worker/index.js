var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/pbx/asterisk.ts
function ariFetch(env, path, init = {}) {
  const auth = btoa(`${env.ASTERISK_USER}:${env.ASTERISK_PASS}`);
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Basic ${auth}`);
  return fetch(`${env.ASTERISK_URL}/ari/${path}`, { ...init, headers });
}
__name(ariFetch, "ariFetch");
async function ariRequest(env, path, method = "GET", body) {
  const res = await ariFetch(env, path, {
    method,
    ...body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}
  });
  return res.json();
}
__name(ariRequest, "ariRequest");
function asteriskPbx(env) {
  return {
    // Channels sitting in Park(); the slot is PARKSLOT, set by the dialplan
    // that parked them (Asterisk itself doesn't expose it).
    async parkedCalls() {
      const res = await ariFetch(env, "channels");
      if (!res.ok) throw new Error(`ARI channels: ${res.status}`);
      const parked = (await res.json()).filter((c) => c.dialplan?.app_name === "Park");
      const calls = await Promise.all(parked.map(async (ch) => {
        const slot = await ariFetch(env, `channels/${encodeURIComponent(ch.id)}/variable?variable=PARKSLOT`).then((r) => r.ok ? r.json() : null);
        return slot?.value ? { slot: slot.value, number: ch.caller?.number ?? "", name: ch.caller?.name ?? "" } : null;
      }));
      return calls.filter((c) => !!c).sort((a, b) => a.slot.localeCompare(b.slot));
    },
    // Stored recordings live in /var/spool/asterisk/recording/<name>.*
    recordingFile: /* @__PURE__ */ __name((name) => ariFetch(env, `recordings/stored/${encodeURIComponent(name)}/file`), "recordingFile"),
    // AMI Originate with post-answer routing, through a small bridge on the
    // PBX host (ARI can't do the "ring us first, then dial out" dance).
    async clickToCall(destination, callerId) {
      if (!env.ASTERISK_ORIGINATE_URL) return { ok: false, msg: "ASTERISK_ORIGINATE_URL is not set" };
      const res = await fetch(env.ASTERISK_ORIGINATE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destination, callerId })
      });
      const data = await res.json();
      console.log(`click2call: AMI bridge -> ${JSON.stringify(data)}`);
      return { ok: !!data.ok, msg: data.msg || "" };
    },
    async answer(channelId) {
      await ariRequest(env, `channels/${channelId}/answer`, "POST");
    },
    async hangup(channelId) {
      await ariRequest(env, `channels/${channelId}`, "DELETE");
    },
    // Runs [greetings-sync] (greetings-sync.sh). The Local channel's other
    // end never answers; it only exists to get the dialplan run.
    async syncGreetings() {
      const res = await ariFetch(env, "channels?endpoint=Local/s@greetings-sync&context=greetings-sync&extension=noop&priority=1&timeout=30", { method: "POST" });
      if (!res.ok) throw new Error(`ARI returned ${res.status}`);
    },
    // [web-callback] rings the agents with the visitor as the caller, and
    // once one answers dials the visitor from the website number.
    async webCallback({ id, name, number }) {
      const params = new URLSearchParams({
        endpoint: "Local/agents@web-callback/n",
        context: "web-callback",
        extension: "customer",
        priority: "1",
        callerId: `"Web: ${name.replace(/["\\]/g, "")}" <${number}>`,
        timeout: "60"
      });
      const r = await ariRequest(env, `channels?${params}`, "POST", {
        variables: { __CB_ID: id, __CB_NUMBER: number, __CB_NAME: name.replace(/[^\p{L}\p{N} .'-]/gu, "") }
      });
      if (!r?.id) console.error("web-callback originate failed:", r?.message);
      return !!r?.id;
    }
  };
}
__name(asteriskPbx, "asteriskPbx");

// src/pbx/index.ts
function pbx(env) {
  const provider = env.PBX_PROVIDER || "asterisk";
  switch (provider) {
    case "asterisk":
      return asteriskPbx(env);
    default:
      throw new Error(`unknown PBX_PROVIDER "${provider}"`);
  }
}
__name(pbx, "pbx");

// src/config.ts
function list(v) {
  return (v || "").split(",").map((s2) => s2.trim()).filter(Boolean);
}
__name(list, "list");
function minutes(v, fallback) {
  const m = /^(\d{1,2}):(\d{2})$/.exec((v || "").trim());
  return m ? +m[1] * 60 + +m[2] : fallback;
}
__name(minutes, "minutes");
function config(env) {
  const days = list(env.CALLBACK_OPEN_DAYS).map(Number).filter((d) => d >= 0 && d <= 6);
  return {
    countryCode: (env.COUNTRY_CODE || "44").replace(/\D/g, ""),
    timeZone: env.TIMEZONE || "UTC",
    locale: env.LOCALE || "en-GB",
    defaultCallerId: env.DEFAULT_CALLER_ID || "",
    sipWsUrl: env.SIP_WS_URL || "",
    sipDomain: env.SIP_DOMAIN || "",
    ownEmailDomains: list(env.OWN_EMAIL_DOMAINS).map((d) => d.toLowerCase()),
    mailFrom: env.MAIL_FROM || "",
    callback: {
      did: env.CALLBACK_DID || "",
      openDays: days.length ? days : [1, 2, 3, 4, 5],
      openFrom: minutes(env.CALLBACK_OPEN_FROM, 9 * 60),
      openUntil: minutes(env.CALLBACK_OPEN_UNTIL, 17 * 60 + 30)
    },
    android: { packageName: env.ANDROID_PACKAGE || "", certSha256: list(env.ANDROID_CERT_SHA256) }
  };
}
__name(config, "config");
function isOwnEmail(cfg, email) {
  const domain = (email || "").toLowerCase().match(/@([a-z0-9.-]+)/)?.[1];
  return !!domain && cfg.ownEmailDomains.some((d) => domain === d || domain.endsWith("." + d));
}
__name(isOwnEmail, "isOwnEmail");
function toInternational(cfg, number) {
  const raw = (number || "").trim();
  if (raw.startsWith("+")) return "+" + raw.replace(/\D/g, "");
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) return "+" + digits.slice(2);
  if (digits.startsWith("0")) return "+" + cfg.countryCode + digits.slice(1);
  return digits;
}
__name(toInternational, "toInternational");

// src/calllegs.ts
var LEG_SLACK_MS = 3e3;
function groupCallLegs(rows) {
  const groups = [];
  const latest = /* @__PURE__ */ new Map();
  for (const row of [...rows].reverse()) {
    const r = row;
    const start = Number(r.start_date) || 0;
    const end = Math.max(Number(r.end_date) || 0, start);
    const trunk = !!r.did;
    const key = String(r.phone_number || "").replace(/\D/g, "").slice(-9);
    const g = r.direction === "incoming" && key ? latest.get(key) : void 0;
    if (g && start <= g.end + LEG_SLACK_MS && !(trunk && g.trunk)) {
      g.rows.push(row);
      g.end = Math.max(g.end, end);
      g.trunk = g.trunk || trunk;
      continue;
    }
    const ng = { rows: [row], end, trunk };
    groups.push(ng);
    if (r.direction === "incoming" && key) latest.set(key, ng);
  }
  return groups.reverse().map((g) => g.rows);
}
__name(groupCallLegs, "groupCallLegs");

// src/odoo.ts
async function odooAuth(env) {
  try {
    const url = `${env.ODOO_URL}/xmlrpc/2/common`;
    const body = authRequest(env.ODOO_DB, env.ODOO_USER, env.ODOO_PASS);
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "text/xml" }, body });
    const text = await res.text();
    const uid = parseXmlrpcResponse(text);
    return typeof uid === "number" ? uid : null;
  } catch (e) {
    console.error("odooAuth failed:", e);
    return null;
  }
}
__name(odooAuth, "odooAuth");
async function odooCall(env, uid, model, method, args, kwargs) {
  const url = `${env.ODOO_URL}/xmlrpc/2/object`;
  const body = executeKwRequest(env.ODOO_DB, String(uid), env.ODOO_PASS, model, method, args, kwargs);
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "text/xml" }, body });
  const text = await res.text();
  try {
    const parsed = parseXmlrpcResponse(text);
    return { parsed, _xml: text.substring(0, 800) };
  } catch (e) {
    return { parsed: null, _xml: text.substring(0, 800), fault: String(e) };
  }
}
__name(odooCall, "odooCall");
function authRequest(db, user, pass) {
  return `<?xml version="1.0"?>
<methodCall>
  <methodName>authenticate</methodName>
  <params>
    <param><value><string>${escapeXml(db)}</string></value></param>
    <param><value><string>${escapeXml(user)}</string></value></param>
    <param><value><string>${escapeXml(pass)}</string></value></param>
    <param><value><struct/></value></param>
  </params>
</methodCall>`;
}
__name(authRequest, "authRequest");
function executeKwRequest(db, uid, pass, model, method, args, kwargs) {
  const argsXml = args.map((a) => xmlrpcValue(a)).join("");
  const kwParam = kwargs ? `<param>${xmlrpcValue(kwargs)}</param>` : "";
  return `<?xml version="1.0"?>
<methodCall>
  <methodName>execute_kw</methodName>
  <params>
    <param><value><string>${escapeXml(db)}</string></value></param>
    <param><value><int>${uid}</int></value></param>
    <param><value><string>${escapeXml(pass)}</string></value></param>
    <param><value><string>${escapeXml(model)}</string></value></param>
    <param><value><string>${escapeXml(method)}</string></value></param>
    <param><value><array><data>${argsXml}</data></array></value></param>
    ${kwParam}
  </params>
</methodCall>`;
}
__name(executeKwRequest, "executeKwRequest");
function xmlrpcValue(v) {
  if (typeof v === "string") return `<value><string>${escapeXml(v)}</string></value>`;
  if (typeof v === "number") return Number.isInteger(v) ? `<value><int>${v}</int></value>` : `<value><double>${v}</double></value>`;
  if (typeof v === "boolean") return `<value><boolean>${v ? 1 : 0}</boolean></value>`;
  if (Array.isArray(v)) return `<value><array><data>${v.map(xmlrpcValue).join("")}</data></array></value>`;
  if (v === null || v === void 0) return "<value><nil/></value>";
  if (typeof v === "object") {
    return `<value><struct>${Object.entries(v).map(
      ([k, val]) => `<member><name>${escapeXml(k)}</name>${xmlrpcValue(val)}</member>`
    ).join("")}</struct></value>`;
  }
  return `<value><string>${escapeXml(String(v))}</string></value>`;
}
__name(xmlrpcValue, "xmlrpcValue");
function escapeXml(s2) {
  return s2.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
__name(escapeXml, "escapeXml");
function decodeXml(s2) {
  return s2.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}
__name(decodeXml, "decodeXml");
function parseXmlrpcResponse(xml) {
  const faultStart = xml.indexOf("<fault>");
  const paramStart = xml.indexOf("<param>");
  if (faultStart !== -1 && (paramStart === -1 || faultStart < paramStart)) {
    const fs = xml.slice(faultStart + 7, xml.indexOf("</fault>", faultStart));
    const fault = parseValue(fs);
    const f = fault ?? {};
    throw new Error(`XML-RPC fault ${f.faultCode}: ${String(f.faultString ?? "").slice(0, 400)}`);
  }
  if (paramStart === -1) return null;
  const inner = xml.slice(paramStart + 7, xml.lastIndexOf("</param>"));
  return parseValue(inner);
}
__name(parseXmlrpcResponse, "parseXmlrpcResponse");
function parseValue(xml) {
  let pos = 0;
  const n = xml.length;
  function skipWs() {
    while (pos < n && /\s/.test(xml[pos])) pos++;
  }
  __name(skipWs, "skipWs");
  function starts(s2) {
    return xml.startsWith(s2, pos);
  }
  __name(starts, "starts");
  function readUntil(close) {
    const idx = xml.indexOf(close, pos);
    if (idx === -1) {
      const s3 = xml.slice(pos);
      pos = n;
      return s3;
    }
    const s2 = xml.slice(pos, idx);
    pos = idx + close.length;
    return s2;
  }
  __name(readUntil, "readUntil");
  function parse() {
    skipWs();
    if (starts("<value>")) {
      pos += 7;
      const v = parse();
      skipWs();
      if (starts("</value>")) pos += 8;
      return v;
    }
    if (starts("<string>")) {
      pos += 8;
      return decodeXml(readUntil("</string>"));
    }
    if (starts("<int>")) {
      pos += 5;
      return parseInt(readUntil("</int>").trim(), 10);
    }
    if (starts("<i4>")) {
      pos += 4;
      return parseInt(readUntil("</i4>").trim(), 10);
    }
    if (starts("<boolean>")) {
      pos += 9;
      return readUntil("</boolean>").trim() === "1";
    }
    if (starts("<double>")) {
      pos += 8;
      return parseFloat(readUntil("</double>"));
    }
    if (starts("<nil/>") || starts("<nil />")) {
      pos = xml.indexOf("/>", pos) + 2;
      return null;
    }
    if (starts("<struct>")) {
      pos += 8;
      const obj = {};
      for (; ; ) {
        skipWs();
        if (starts("</struct>")) {
          pos += 9;
          break;
        }
        if (starts("<member>")) {
          pos += 8;
          skipWs();
          let name = "";
          if (starts("<name>")) {
            pos += 6;
            name = readUntil("</name>");
          }
          skipWs();
          const val = parse();
          obj[decodeXml(name)] = val;
          skipWs();
          if (starts("</member>")) pos += 9;
        } else if (pos >= n) {
          break;
        } else {
          pos++;
        }
      }
      return obj;
    }
    if (starts("<array>")) {
      pos += 7;
      const arr = [];
      for (; ; ) {
        skipWs();
        if (starts("</array>")) {
          pos += 8;
          break;
        }
        if (starts("<data>")) {
          pos += 6;
          continue;
        }
        if (starts("</data>")) {
          pos += 7;
          continue;
        }
        if (starts("<value>")) {
          arr.push(parse());
          continue;
        }
        if (pos >= n) break;
        pos++;
      }
      return arr;
    }
    if (pos >= n) return null;
    pos++;
    return null;
  }
  __name(parse, "parse");
  return parse();
}
__name(parseValue, "parseValue");
function phoneKey(number) {
  const digits = (number || "").replace(/\D/g, "");
  return digits.length >= 7 ? digits.slice(-9) : "";
}
__name(phoneKey, "phoneKey");
function displayNumber(env, number) {
  const cc = config(env).countryCode;
  const digits = (number || "").replace(/\D/g, "");
  if (digits.startsWith(cc) && digits.length > cc.length + 8) return "0" + digits.slice(cc.length);
  if (digits.startsWith("0")) return digits;
  if (cc !== "1" && digits.length === 10) return "+1" + digits;
  return digits.length > 10 ? "+" + digits : digits;
}
__name(displayNumber, "displayNumber");
async function lookupCaller(env, number) {
  const key = phoneKey(number);
  if (!key) return null;
  const pattern = "%" + key.split("").join("%") + "%";
  try {
    const uid = await odooAuth(env);
    if (!uid) return null;
    const result = await odooCall(
      env,
      uid,
      "res.partner",
      "search_read",
      [["|", ["phone", "=ilike", pattern], ["mobile", "=ilike", pattern]]],
      { fields: ["id", "name", "company_type", "is_company", "phone", "mobile", "email", "website", "vat", "function", "city", "active"], limit: 10 }
    );
    const partners = (result.parsed ?? []).map(normalizeContact);
    const hit = partners.find((p) => phoneKey(p.phone ?? "") === key || phoneKey(p.mobile ?? "") === key) ?? null;
    if (hit) {
      try {
        await upsertContacts(env, [hit]);
      } catch (e) {
        console.error("Contact cache write failed:", e);
      }
    }
    return hit;
  } catch (e) {
    console.error("Odoo lookup failed:", e);
    return null;
  }
}
__name(lookupCaller, "lookupCaller");
async function createContactForNumber(env, number, when = Date.now(), knownName) {
  const cfg = config(env);
  const phone = displayNumber(env, number);
  const date = new Intl.DateTimeFormat(cfg.locale, { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: cfg.timeZone }).format(new Date(when));
  const name = knownName || `${date} ${phone}`;
  const uid = await odooAuth(env);
  if (!uid) return null;
  const r = await odooCall(env, uid, "res.partner", "create", [{ name, phone }]);
  if (r.fault || typeof r.parsed !== "number") {
    console.error("Odoo contact create failed:", r.fault ?? r._xml);
    return null;
  }
  const contact = normalizeContact({ id: r.parsed, name, phone, active: true });
  await upsertContacts(env, [contact]);
  return contact;
}
__name(createContactForNumber, "createContactForNumber");
async function renameContact(env, id, name) {
  const uid = await odooAuth(env);
  if (!uid) return false;
  const r = await odooCall(env, uid, "res.partner", "write", [[id], { name }]);
  if (r.fault || r.parsed !== true) {
    console.error("Odoo contact rename failed:", r.fault ?? r._xml);
    return false;
  }
  await env.DB.prepare("UPDATE contacts SET name=?1, updated_at=?2 WHERE id=?3").bind(name, Date.now(), id).run();
  return true;
}
__name(renameContact, "renameContact");
async function searchContacts(env, query = "", limit = 50) {
  const uid = await odooAuth(env);
  if (!uid) return [];
  let domain;
  if (query.trim()) {
    const q = query.trim();
    domain = [
      "|",
      "|",
      "|",
      ["name", "=ilike", `%${q}%`],
      ["phone", "=ilike", `%${q}%`],
      ["mobile", "=ilike", `%${q}%`],
      ["email", "=ilike", `%${q}%`]
    ];
  } else {
    domain = [];
  }
  try {
    const result = await odooCall(
      env,
      uid,
      "res.partner",
      "search_read",
      [domain],
      { fields: ["id", "name", "company_type", "is_company", "phone", "mobile", "email", "website", "vat", "function", "city", "active"], limit }
    );
    const contacts = (result.parsed ?? []).map(normalizeContact);
    try {
      await upsertContacts(env, contacts);
    } catch (e) {
      console.error("Contact cache write failed:", e);
    }
    return contacts;
  } catch (e) {
    console.error("Odoo contact search failed:", e);
    const cached = await env.DB.prepare(
      `SELECT id, name, company_type, is_company, phone, mobile, email, website, vat, function, city, active
       FROM contacts WHERE name LIKE ?1 OR phone LIKE ?1 OR mobile LIKE ?1 OR email LIKE ?1
       ORDER BY name LIMIT ?2`
    ).bind(`%${query}%`, limit).all();
    return cached.results || [];
  }
}
__name(searchContacts, "searchContacts");
function normalizeContact(c) {
  return {
    id: c.id,
    name: c.name ? String(c.name) : "",
    company_type: c.company_type ? String(c.company_type) : "",
    is_company: !!c.is_company,
    phone: c.phone ? String(c.phone) : "",
    mobile: c.mobile ? String(c.mobile) : "",
    email: c.email ? String(c.email) : "",
    website: c.website ? String(c.website) : "",
    vat: c.vat ? String(c.vat) : "",
    function: c.function ? String(c.function) : "",
    city: c.city ? String(c.city) : "",
    active: c.active === void 0 ? true : !!c.active
  };
}
__name(normalizeContact, "normalizeContact");
async function upsertContacts(env, contacts) {
  if (!contacts.length) return;
  const cols = ["id", "name", "company_type", "is_company", "phone", "mobile", "email", "website", "vat", "function", "city", "active", "updated_at"];
  const now = Date.now();
  const statements = [];
  for (let i = 0; i < contacts.length; i += 7) {
    const chunk = contacts.slice(i, i + 7);
    const rowPh = chunk.map(() => `(${cols.map(() => "?").join(",")})`).join(",");
    const sql = `INSERT INTO contacts (${cols.join(",")}) VALUES ${rowPh}
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name, company_type=excluded.company_type, is_company=excluded.is_company,
      phone=excluded.phone, mobile=excluded.mobile, email=excluded.email, website=excluded.website,
      vat=excluded.vat, function=excluded.function, city=excluded.city, active=excluded.active,
      updated_at=excluded.updated_at`;
    const params = [];
    for (const c of chunk) {
      params.push(c.id, c.name, c.company_type ?? "", c.is_company ? 1 : 0, c.phone ?? "", c.mobile ?? "", c.email ?? "", c.website ?? "", c.vat ?? "", c.function ?? "", c.city ?? "", c.active ? 1 : 0, now);
    }
    statements.push(env.DB.prepare(sql).bind(...params));
  }
  for (let i = 0; i < statements.length; i += 100) {
    await env.DB.batch(statements.slice(i, i + 100));
  }
}
__name(upsertContacts, "upsertContacts");
function s(v) {
  return v ? String(v) : "";
}
__name(s, "s");
function idOrNull(v) {
  if (Array.isArray(v)) return typeof v[0] === "number" ? v[0] : null;
  if (typeof v === "number") return v;
  return null;
}
__name(idOrNull, "idOrNull");
function dt(v) {
  if (!v) return null;
  const t = Date.parse(String(v).replace(" ", "T") + "Z");
  return Number.isNaN(t) ? null : t;
}
__name(dt, "dt");
async function syncContacts(env) {
  const uid = await odooAuth(env);
  if (!uid) return { total: 0, synced: 0 };
  const fields = ["id", "name", "company_type", "is_company", "phone", "mobile", "email", "website", "vat", "function", "city", "active"];
  const BATCH = 500;
  let offset = 0, synced = 0;
  for (; ; ) {
    const r = await odooCall(
      env,
      uid,
      "res.partner",
      "search_read",
      [[]],
      { fields, limit: BATCH, offset, order: "id" }
    );
    const partners = r.parsed ?? [];
    if (!partners.length) break;
    await upsertContacts(env, partners.map(normalizeContact));
    synced += partners.length;
    if (partners.length < BATCH) break;
    offset += BATCH;
  }
  return { total: synced, synced };
}
__name(syncContacts, "syncContacts");
async function syncCallLog(env, limit = 100) {
  const uid = await odooAuth(env);
  if (!uid) return 0;
  const fields = ["id", "phone_number", "direction", "state", "partner_id", "user_id", "start_date", "end_date", "create_date", "write_date"];
  const r = await odooCall(
    env,
    uid,
    CALL_MODEL,
    "search_read",
    [[["bridge_call_id", "=", false]]],
    { fields, limit, order: "create_date desc" }
  );
  const calls = r.parsed ?? [];
  const statements = [];
  for (const c of calls) {
    statements.push(env.DB.prepare(
      `INSERT INTO call_log (odoo_id, phone_number, direction, state, partner_id, user_id, start_date, end_date, create_date, write_date)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)
       ON CONFLICT(odoo_id) DO UPDATE SET
         phone_number=excluded.phone_number, direction=excluded.direction, state=excluded.state,
         partner_id=excluded.partner_id, user_id=excluded.user_id, start_date=excluded.start_date,
         end_date=excluded.end_date, create_date=excluded.create_date, write_date=excluded.write_date`
    ).bind(
      c.id,
      s(c.phone_number),
      s(c.direction),
      s(c.state),
      idOrNull(c.partner_id),
      idOrNull(c.user_id),
      dt(c.start_date),
      dt(c.end_date),
      dt(c.create_date),
      dt(c.write_date)
    ));
  }
  if (statements.length) await env.DB.batch(statements);
  return calls.length;
}
__name(syncCallLog, "syncCallLog");
var CALL_MODEL = "phone_bridge.call";
var MAX_RECORDING_BYTES = 200 * 1024 * 1024;
function odooDatetime(ms) {
  return ms ? new Date(ms).toISOString().slice(0, 19).replace("T", " ") : false;
}
__name(odooDatetime, "odooDatetime");
var B64_CHUNK = 3 * 16384;
function toBase64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(bin);
}
__name(toBase64, "toBase64");
async function uploadRecording(env, uid, odooId, audio, size, filename) {
  const MARK = "@@RECORDING@@";
  const body = executeKwRequest(
    env.ODOO_DB,
    String(uid),
    env.ODOO_PASS,
    CALL_MODEL,
    "write",
    [[odooId], { recording: MARK, recording_filename: filename }]
  );
  const enc = new TextEncoder();
  const [head, tail] = body.split(MARK).map((part) => enc.encode(part));
  const b64Len = Math.ceil(size / 3) * 4;
  const stream = new FixedLengthStream(head.length + b64Len + tail.length);
  const writer = stream.writable.getWriter();
  const write = (async () => {
    await writer.write(head);
    let carry = new Uint8Array(0);
    const reader = audio.getReader();
    for (; ; ) {
      const { done, value } = await reader.read();
      if (done) break;
      const buf = new Uint8Array(carry.length + value.length);
      buf.set(carry);
      buf.set(value, carry.length);
      const whole = buf.length - buf.length % 3;
      for (let i = 0; i < whole; i += B64_CHUNK) await writer.write(enc.encode(toBase64(buf.subarray(i, Math.min(i + B64_CHUNK, whole)))));
      carry = buf.slice(whole);
    }
    if (carry.length) await writer.write(enc.encode(toBase64(carry)));
    await writer.write(tail);
    await writer.close();
  })();
  const [res] = await Promise.all([
    fetch(`${env.ODOO_URL}/xmlrpc/2/object`, { method: "POST", headers: { "Content-Type": "text/xml" }, body: stream.readable }),
    write
  ]);
  const text = await res.text();
  try {
    parseXmlrpcResponse(text);
  } catch (e) {
    throw new Error(`recording upload failed: ${e}`);
  }
}
__name(uploadRecording, "uploadRecording");
var LEG_WINDOW_MS = 60 * 60 * 1e3;
async function callLegs(env, callId) {
  const row = await env.DB.prepare("SELECT * FROM call_log WHERE call_id = ?1").bind(callId).first();
  if (!row?.call_id) return [];
  if (row.direction === "outgoing" || !row.phone_number) return [row];
  const key = phoneKey(row.phone_number);
  if (!key) return [row];
  const start = row.start_date ?? 0;
  const { results } = await env.DB.prepare(
    `SELECT * FROM call_log WHERE call_id IS NOT NULL AND direction = 'incoming'
       AND start_date BETWEEN ?1 AND ?2 ORDER BY start_date DESC`
  ).bind(start - LEG_WINDOW_MS, start + LEG_WINDOW_MS).all();
  const near = (results ?? []).filter((r) => phoneKey(r.phone_number ?? "") === key);
  return groupCallLegs(near).find((g) => g.some((l) => l.call_id === callId)) ?? [row];
}
__name(callLegs, "callLegs");
async function pushCallToOdoo(env, callId, withRecording = false) {
  const legs = await callLegs(env, callId);
  if (!legs.length) return null;
  const uid = await odooAuth(env);
  if (!uid) return null;
  const first = legs[0];
  const trunk = legs.find((l) => l.did);
  const answered = legs.find((l) => !l.did && (l.state === "terminated" || l.state === "ongoing"));
  const outcome = answered ?? trunk ?? first;
  const noted = legs.find((l) => l.notes_html);
  const rec = legs.find((l) => l.recording) ?? legs.find((l) => l.transcript);
  const vals = {
    bridge_call_id: first.call_id,
    // A blank number is a withheld caller ID.
    phone_number: first.phone_number || "Withheld",
    direction: first.direction === "outgoing" ? "outgoing" : "incoming",
    state: outcome.state || "calling",
    start_date: odooDatetime(Math.min(...legs.map((l) => l.start_date || Infinity))),
    end_date: odooDatetime(outcome.end_date),
    partner_id: legs.find((l) => l.partner_id)?.partner_id || false,
    did: trunk?.did || first.did || false,
    voicemail: legs.some((l) => l.voicemail),
    voicemail_box: legs.find((l) => l.voicemail_box)?.voicemail_box || false,
    // The extension that made or took the call: the answering leg's, else any leg that knows.
    extension: answered?.extension || legs.find((l) => l.extension)?.extension || false,
    notes: noted?.notes_html || false,
    transcript: rec?.transcript || false
  };
  const r = await odooCall(env, uid, CALL_MODEL, "bridge_upsert", [vals]);
  if (r.fault || typeof r.parsed !== "number") throw new Error(`${CALL_MODEL}.bridge_upsert failed: ${r.fault ?? r._xml}`);
  const odooId = r.parsed;
  if (withRecording && rec?.recording) {
    const res = await pbx(env).recordingFile(rec.recording);
    const size = Number(res.headers.get("Content-Length")) || 0;
    if (!res.ok) console.error(`pushCallToOdoo: recording ${rec.recording}: PBX returned ${res.status}`);
    else if (size > MAX_RECORDING_BYTES) {
      console.error(`pushCallToOdoo: recording ${rec.recording} is ${size} bytes, not uploaded`);
      await res.body?.cancel();
    } else if (!size || !res.body) console.error(`pushCallToOdoo: recording ${rec.recording}: no Content-Length`);
    else await uploadRecording(env, uid, odooId, res.body, size, `${rec.recording}.wav`);
    if (legs.some((l) => l.voicemail)) {
      const n = await odooCall(env, uid, CALL_MODEL, "bridge_notify_voicemail", [[odooId]]);
      if (n.fault) console.error(`${CALL_MODEL}.bridge_notify_voicemail failed: ${n.fault}`);
    }
  }
  const now = Date.now();
  await env.DB.batch([
    // syncCallLog may already have pulled the new call in as its own
    // row; drop that copy so odoo_id stays unique.
    env.DB.prepare("DELETE FROM call_log WHERE odoo_id = ?1 AND call_id IS NULL").bind(odooId),
    env.DB.prepare("UPDATE call_log SET odoo_id = NULL WHERE odoo_id = ?1 AND call_id != ?2").bind(odooId, first.call_id),
    env.DB.prepare("UPDATE call_log SET odoo_id = ?1 WHERE call_id = ?2").bind(odooId, first.call_id),
    ...legs.map((l) => env.DB.prepare("UPDATE call_log SET odoo_synced_at = ?1 WHERE call_id = ?2").bind(now, l.call_id))
  ]);
  return odooId;
}
__name(pushCallToOdoo, "pushCallToOdoo");
var UNSENT = "call_id IS NOT NULL AND odoo_synced_at IS NULL AND phone_number IS NOT NULL AND call_id NOT LIKE 'test-%'";
async function pushCallHistory(env, limit = 20) {
  let pushed = 0, failed = 0;
  const tried = /* @__PURE__ */ new Set();
  while (pushed + failed < limit) {
    const next = await env.DB.prepare(
      `SELECT call_id FROM call_log WHERE ${UNSENT} ORDER BY start_date LIMIT ?1`
    ).bind(tried.size + 1).all();
    const callId = (next.results ?? []).map((r) => r.call_id).find((id) => !tried.has(id));
    if (!callId) break;
    tried.add(callId);
    try {
      if (await pushCallToOdoo(env, callId, true)) pushed++;
      else failed++;
    } catch (e) {
      failed++;
      console.error(`pushCallHistory ${callId}:`, e);
    }
  }
  const left = await env.DB.prepare(`SELECT COUNT(*) AS n FROM call_log WHERE ${UNSENT}`).first();
  return { pushed, failed, remaining: left?.n ?? 0 };
}
__name(pushCallHistory, "pushCallHistory");
function extractProductCode(label) {
  const m = /\[([A-Za-z0-9._-]+)\]/.exec(label);
  return m ? m[1] : null;
}
__name(extractProductCode, "extractProductCode");
function fmtQty(n) {
  return Number.isInteger(n) ? String(n) : String(n);
}
__name(fmtQty, "fmtQty");
async function fetchOrderItemSummaries(env, uid, orderIds) {
  const out = /* @__PURE__ */ new Map();
  if (!orderIds.length) return out;
  try {
    const r = await odooCall(
      env,
      uid,
      "sale.order.line",
      "search_read",
      [[["order_id", "in", orderIds], ["display_type", "=", false]]],
      { fields: ["order_id", "product_id", "product_uom_qty"], order: "id" }
    );
    const lines = r.parsed ?? [];
    const byOrder = /* @__PURE__ */ new Map();
    for (const line of lines) {
      const orderId = idOrNull(line.order_id);
      if (orderId == null) continue;
      const productLabel = Array.isArray(line.product_id) ? s(line.product_id[1]) : "";
      const code = extractProductCode(productLabel);
      const qty = typeof line.product_uom_qty === "number" ? line.product_uom_qty : Number(line.product_uom_qty) || 0;
      const piece = `${fmtQty(qty)}x ${code || productLabel || "?"}`;
      if (!byOrder.has(orderId)) byOrder.set(orderId, []);
      byOrder.get(orderId).push(piece);
    }
    for (const [orderId, pieces] of byOrder) out.set(orderId, pieces.join(" "));
  } catch (e) {
    console.error("Odoo order-line fetch failed:", e);
  }
  return out;
}
__name(fetchOrderItemSummaries, "fetchOrderItemSummaries");
async function searchQuotations(env, partnerId, limit = 20) {
  try {
    const uid = await odooAuth(env);
    if (!uid) return [];
    const r = await odooCall(
      env,
      uid,
      "sale.order",
      "search_read",
      [[["partner_id", "child_of", partnerId]]],
      { fields: ["id", "name", "state", "amount_total", "date_order"], limit, order: "date_order desc" }
    );
    const orders = r.parsed ?? [];
    const itemSummaries = await fetchOrderItemSummaries(env, uid, orders.map((o) => o.id));
    return orders.map((o) => ({
      id: o.id,
      name: s(o.name),
      state: s(o.state),
      amount_total: typeof o.amount_total === "number" ? o.amount_total : 0,
      date_order: s(o.date_order) || void 0,
      items_summary: itemSummaries.get(o.id) || void 0
    }));
  } catch (e) {
    console.error("Odoo quotation search failed:", e);
    return [];
  }
}
__name(searchQuotations, "searchQuotations");
async function sumField(env, uid, model, domain, field) {
  try {
    const r = await odooCall(env, uid, model, "search_read", [domain], { fields: [field] });
    if (r.fault) {
      console.error(`Odoo ${model} sum failed:`, r.fault);
      return null;
    }
    const rows = r.parsed ?? [];
    let total = 0;
    for (const row of rows) total += typeof row[field] === "number" ? row[field] : 0;
    return { total, count: rows.length };
  } catch (e) {
    console.error(`Odoo ${model} sum failed:`, e);
    return null;
  }
}
__name(sumField, "sumField");
async function contactTotals(env, partnerId) {
  const uid = await odooAuth(env);
  if (!uid) return { sales_total: null, sales_count: null, invoiced_total: null };
  const [sales, invoiced] = await Promise.all([
    sumField(env, uid, "sale.order", [["partner_id", "child_of", partnerId], ["state", "in", ["sale", "done"]]], "amount_total"),
    sumField(env, uid, "account.move", [["partner_id", "child_of", partnerId], ["state", "=", "posted"], ["move_type", "in", ["out_invoice", "out_refund"]]], "amount_total_signed")
  ]);
  return {
    sales_total: sales ? sales.total : null,
    sales_count: sales ? sales.count : null,
    invoiced_total: invoiced ? invoiced.total : null
  };
}
__name(contactTotals, "contactTotals");
function directionFor(env, emailFrom) {
  if (!emailFrom) return void 0;
  return isOwnEmail(config(env), emailFrom) ? "outgoing" : "incoming";
}
__name(directionFor, "directionFor");
async function searchContactMessages(env, partnerId, limit = 50) {
  const uid = await odooAuth(env);
  if (!uid) return [];
  const fields = ["id", "model", "res_id", "subject", "body", "email_from", "author_id", "message_type", "date"];
  const r = await odooCall(
    env,
    uid,
    "mail.message",
    "search_read",
    [["&", ["model", "=", "res.partner"], ["res_id", "=", partnerId]]],
    { fields, limit, order: "date desc" }
  );
  const msgs = r.parsed ?? [];
  const out = msgs.map((m) => ({
    odoo_id: m.id,
    contact_id: partnerId,
    res_model: s(m.model),
    res_id: typeof m.res_id === "number" ? m.res_id : void 0,
    subject: s(m.subject),
    body: s(m.body),
    email_from: s(m.email_from),
    author_id: idOrNull(m.author_id) ?? void 0,
    message_type: s(m.message_type),
    direction: directionFor(env, s(m.email_from)),
    source: "odoo",
    date: dt(m.date) ?? void 0
  }));
  await upsertMessages(env, out);
  return out;
}
__name(searchContactMessages, "searchContactMessages");
async function upsertMessages(env, msgs) {
  if (!msgs.length) return;
  const statements = [];
  for (const m of msgs) {
    if (m.odoo_id != null) {
      statements.push(env.DB.prepare(
        `INSERT INTO messages (odoo_id, contact_id, res_model, res_id, subject, body, email_from, author_id, message_type, direction, source, date, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,'odoo',?11,?12)
         ON CONFLICT(odoo_id) DO UPDATE SET subject=excluded.subject, body=excluded.body, email_from=excluded.email_from, message_type=excluded.message_type, direction=excluded.direction, date=excluded.date, updated_at=excluded.updated_at`
      ).bind(m.odoo_id, m.contact_id ?? null, m.res_model ?? "", m.res_id ?? null, m.subject ?? "", m.body ?? "", m.email_from ?? "", m.author_id ?? null, m.message_type ?? "", m.direction ?? "", m.date ?? null, Date.now()));
    } else if (m.gmail_id != null) {
      statements.push(env.DB.prepare(
        `INSERT INTO messages (gmail_id, contact_id, subject, body, email_from, direction, source, date, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,'gmail',?7,?8)
         ON CONFLICT(gmail_id) DO UPDATE SET subject=excluded.subject, body=excluded.body, email_from=excluded.email_from, direction=excluded.direction, date=excluded.date, updated_at=excluded.updated_at`
      ).bind(m.gmail_id, m.contact_id ?? null, m.subject ?? "", m.body ?? "", m.email_from ?? "", m.direction ?? "", m.date ?? null, Date.now()));
    }
  }
  if (statements.length) await env.DB.batch(statements);
}
__name(upsertMessages, "upsertMessages");

// src/gmail.ts
var cachedToken = null;
async function getAccessToken(env) {
  if (cachedToken && cachedToken.expiry > Date.now() + 6e4) return cachedToken.token;
  if (!env.GOOGLE_REFRESH_TOKEN || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return null;
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        refresh_token: env.GOOGLE_REFRESH_TOKEN,
        grant_type: "refresh_token"
      }).toString()
    });
    const data = await res.json();
    if (!data.access_token) return null;
    const expiresIn = (data.expires_in ?? 3600) - 60;
    cachedToken = { token: data.access_token, expiry: Date.now() + expiresIn * 1e3 };
    return cachedToken.token;
  } catch (e) {
    console.error("Gmail token refresh failed:", e);
    return null;
  }
}
__name(getAccessToken, "getAccessToken");
async function getMessage(env, token, id) {
  const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}`);
  url.searchParams.set("format", "metadata");
  url.searchParams.append("metadataHeaders", "From");
  url.searchParams.append("metadataHeaders", "To");
  url.searchParams.append("metadataHeaders", "Subject");
  url.searchParams.append("metadataHeaders", "Date");
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const m = await res.json();
  const headers = {};
  for (const h of m.payload?.headers ?? []) headers[h.name.toLowerCase()] = h.value;
  const from = headers["from"] ?? "";
  return {
    gmail_id: m.id,
    subject: headers["subject"] ?? "(no subject)",
    body: m.snippet ?? "",
    email_from: from,
    direction: isOwnEmail(config(env), from) ? "outgoing" : "incoming",
    source: "gmail",
    date: m.internalDate ? parseInt(m.internalDate, 10) : void 0
  };
}
__name(getMessage, "getMessage");
async function searchGmailMessages(env, email, limit = 30) {
  const clean = (email || "").trim();
  if (!clean) return [];
  const token = await getAccessToken(env);
  if (!token) return [];
  const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  listUrl.searchParams.set("q", `from:${clean} OR to:${clean}`);
  listUrl.searchParams.set("maxResults", String(Math.min(limit, 20, 100)));
  const listRes = await fetch(listUrl.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!listRes.ok) {
    console.error("Gmail list failed:", listRes.status, await listRes.text().catch(() => ""));
    return [];
  }
  const data = await listRes.json();
  const ids = (data.messages ?? []).map((m) => m.id);
  const results = await Promise.all(ids.map((id) => getMessage(env, token, id)));
  return results.filter((m) => m !== null);
}
__name(searchGmailMessages, "searchGmailMessages");
async function searchRecentGmailMessages(env, days = 7, limit = 30) {
  const token = await getAccessToken(env);
  if (!token) return [];
  const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  listUrl.searchParams.set("q", `newer_than:${days}d`);
  listUrl.searchParams.set("maxResults", String(Math.min(limit, 20, 100)));
  const listRes = await fetch(listUrl.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!listRes.ok) {
    console.error("Gmail recent list failed:", listRes.status, await listRes.text().catch(() => ""));
    return [];
  }
  const data = await listRes.json();
  const ids = (data.messages ?? []).map((m) => m.id);
  const results = await Promise.all(ids.map((id) => getMessage(env, token, id)));
  return results.filter((m) => m !== null);
}
__name(searchRecentGmailMessages, "searchRecentGmailMessages");
function b64urlToUtf8(s2) {
  const b64 = s2.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - b64.length % 4) % 4;
  const bin = atob(b64 + "=".repeat(pad));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder("utf-8").decode(bytes);
}
__name(b64urlToUtf8, "b64urlToUtf8");
function extractBodies(payload, out = { text: "", html: "" }) {
  const p = payload;
  if (!p) return out;
  if (p.body?.data) {
    if (p.mimeType === "text/html") out.html ||= b64urlToUtf8(p.body.data);
    else if (!p.mimeType || p.mimeType === "text/plain") out.text ||= b64urlToUtf8(p.body.data);
  }
  for (const part of p.parts ?? []) extractBodies(part, out);
  return out;
}
__name(extractBodies, "extractBodies");
function htmlToText(html) {
  return html.replace(/<(style|script|head)[^>]*>[\s\S]*?<\/\1>/gi, "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, "\n").replace(/<li[^>]*>/gi, "\u2022 ").replace(/<[^>]+>/g, "").replace(/&nbsp;/gi, " ").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/gi, "&").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
__name(htmlToText, "htmlToText");
function looksLikeHtml(s2) {
  return /<(p|div|br|b|strong|i|em|u|a|ul|ol|li|span|table|h[1-6]|blockquote|img)(\s[^>]*)?\/?>/i.test(s2);
}
__name(looksLikeHtml, "looksLikeHtml");
async function getGmailBody(env, gmailId) {
  const token = await getAccessToken(env);
  if (!token) return { text: "", html: "" };
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${gmailId}?format=full`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return { text: "", html: "" };
  const d = await res.json();
  const b = extractBodies(d.payload);
  if (!b.html && looksLikeHtml(b.text)) b.html = b.text;
  if (!b.text || b.text === b.html) b.text = b.html ? htmlToText(b.html) : b.text;
  return b;
}
__name(getGmailBody, "getGmailBody");
async function getThreadContext(token, gmailId) {
  const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${gmailId}`);
  url.searchParams.set("format", "metadata");
  url.searchParams.append("metadataHeaders", "Message-ID");
  url.searchParams.append("metadataHeaders", "References");
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const d = await res.json();
  const headers = {};
  for (const h of d.payload?.headers ?? []) headers[h.name.toLowerCase()] = h.value;
  return { threadId: d.threadId, messageId: headers["message-id"], references: headers["references"] };
}
__name(getThreadContext, "getThreadContext");
function utf8Bin(s2) {
  const bytes = new TextEncoder().encode(s2);
  let b = "";
  for (const x of bytes) b += String.fromCharCode(x);
  return b;
}
__name(utf8Bin, "utf8Bin");
function b64std(s2) {
  return btoa(utf8Bin(s2));
}
__name(b64std, "b64std");
function b64url(s2) {
  return b64std(s2).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
__name(b64url, "b64url");
function wrap76(s2) {
  return s2.replace(/.{76}/g, "$&\r\n");
}
__name(wrap76, "wrap76");
function encodeHeader(s2) {
  if (/^[\x20-\x7e]*$/.test(s2)) return s2;
  return "=?UTF-8?B?" + b64std(s2) + "?=";
}
__name(encodeHeader, "encodeHeader");
async function sendGmailMessage(env, opts) {
  const token = await getAccessToken(env);
  if (!token) return { ok: false, error: "no gmail token" };
  if (!config(env).mailFrom) return { ok: false, error: "MAIL_FROM is not set" };
  let inReplyTo = "", references = "", threadId;
  if (opts.replyToGmailId) {
    const ctx = await getThreadContext(token, opts.replyToGmailId);
    if (ctx) {
      inReplyTo = ctx.messageId || "";
      references = ctx.references ? ctx.references + " " + (ctx.messageId || "") : ctx.messageId || "";
      threadId = ctx.threadId;
    }
  }
  const parts = [
    "From: " + config(env).mailFrom,
    "To: " + opts.to,
    "Subject: " + encodeHeader(opts.subject || "")
  ];
  if (inReplyTo) parts.push("In-Reply-To: <" + inReplyTo + ">");
  if (references.trim()) parts.push("References: " + references.trim());
  const html = opts.html || (looksLikeHtml(opts.body || "") ? opts.body : "");
  const text = (html && !opts.html ? htmlToText(html) : opts.body || (html ? htmlToText(html) : "")).replace(/\r\n/g, "\n");
  parts.push("MIME-Version: 1.0");
  if (html) {
    const boundary = "pb-" + crypto.randomUUID();
    parts.push(
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      "",
      "--" + boundary,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      wrap76(b64std(text)),
      "--" + boundary,
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      wrap76(b64std(html)),
      "--" + boundary + "--"
    );
  } else {
    parts.push('Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: 8bit", "", text);
  }
  const raw = parts.join("\r\n");
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: b64url(raw), ...threadId ? { threadId } : {} })
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return { ok: false, error: "gmail send " + res.status + " " + t.slice(0, 200) };
  }
  const d = await res.json();
  return { ok: true, id: d.id, threadId: d.threadId };
}
__name(sendGmailMessage, "sendGmailMessage");

// src/auth.ts
var PUBLIC = [
  ["GET", /^\/$/],
  ["GET", /^\/login$/],
  ["POST", /^\/login$/],
  ["POST", /^\/logout$/],
  ["GET", /^\/health$/],
  ["GET", /^\/\.well-known\/assetlinks\.json$/],
  ["GET", /^\/web-callback\/(config|status)$/],
  ["POST", /^\/web-callback$/]
];
var PBX = [
  ["POST", /^\/call-event$/],
  ["GET", /^\/push\/wake$/],
  ["POST", /^\/push\/wake$/],
  ["POST", /^\/web-callback\/event$/],
  ["GET", /^\/voicemail\/sync$/],
  ["POST", /^\/voicemail\/synced$/],
  ["GET", /^\/voicemail\/boxes\/[^/]+\/greeting$/]
];
function accessFor(method, path) {
  const m = method === "HEAD" ? "GET" : method;
  if (PUBLIC.some(([pm, re]) => pm === m && re.test(path))) return "public";
  if (PBX.some(([pm, re]) => pm === m && re.test(path))) return "pbx";
  return "api";
}
__name(accessFor, "accessFor");
var SESSION_COOKIE = "pb_session";
async function sha256Hex(s2) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s2));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(sha256Hex, "sha256Hex");
async function same(a, b) {
  const [x, y] = await Promise.all([sha256Hex(a), sha256Hex(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}
__name(same, "same");
function sessionValue(env) {
  return sha256Hex("session:" + env.API_TOKEN);
}
__name(sessionValue, "sessionValue");
function cookie(request, name) {
  for (const part of (request.headers.get("Cookie") || "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return "";
}
__name(cookie, "cookie");
async function hasApiCredential(request, env) {
  if (!env.API_TOKEN) return false;
  const bearer = /^Bearer (.+)$/.exec(request.headers.get("Authorization") || "")?.[1];
  if (bearer) return same(bearer, env.API_TOKEN);
  const session = cookie(request, SESSION_COOKIE);
  return !!session && same(session, await sessionValue(env));
}
__name(hasApiCredential, "hasApiCredential");
async function hasPbxCredential(request, env) {
  if (!env.PBX_SECRET) return false;
  let secret = request.headers.get("X-Pbx-Secret") || new URL(request.url).searchParams.get("secret");
  if (!secret && (request.headers.get("Content-Type") || "").includes("application/x-www-form-urlencoded")) {
    secret = new URLSearchParams(await request.clone().text()).get("secret");
  }
  return !!secret && same(secret, env.PBX_SECRET);
}
__name(hasPbxCredential, "hasPbxCredential");
async function authorize(request, env) {
  const path = new URL(request.url).pathname;
  const access = accessFor(request.method, path);
  if (access === "public") return null;
  if (await hasApiCredential(request, env)) return null;
  if (access === "pbx" && await hasPbxCredential(request, env)) return null;
  if (!env.API_TOKEN) return Response.json({ error: "API_TOKEN is not set" }, { status: 503 });
  if (request.method === "GET" && (request.headers.get("Accept") || "").includes("text/html")) {
    return Response.redirect(new URL(`/login?next=${encodeURIComponent(path)}`, request.url).toString(), 302);
  }
  return Response.json({ error: "unauthorized" }, { status: 401 });
}
__name(authorize, "authorize");
function loginPage(error = "", next = "/dashboard") {
  const esc2 = /* @__PURE__ */ __name((s2) => s2.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]), "esc");
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign in</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0f19;color:#e9ecef;font:15px system-ui,sans-serif}
form{width:min(320px,calc(100vw - 32px));display:grid;gap:10px}input,button{font:inherit;padding:10px;border-radius:8px;border:1px solid #333;background:#151a26;color:inherit}
button{background:#2b6cb0;border-color:#2b6cb0;cursor:pointer}.err{color:#f08080;min-height:1.2em}</style></head>
<body><form method="post" action="/login"><h2 style="margin:0">Sign in</h2>
<label for="t">Access token</label><input id="t" name="token" type="password" autocomplete="current-password" autofocus required>
<input type="hidden" name="next" value="${esc2(next)}"><div class="err">${esc2(error)}</div><button>Sign in</button></form></body></html>`;
  return new Response(html, { status: error ? 401 : 200, headers: { "Content-Type": "text/html;charset=utf-8", "Cache-Control": "no-store" } });
}
__name(loginPage, "loginPage");
function safeNext(next) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}
__name(safeNext, "safeNext");
async function handleLogin(request, env) {
  if (request.method === "GET") return loginPage("", safeNext(new URL(request.url).searchParams.get("next")));
  const form = new URLSearchParams(await request.text());
  const next = safeNext(form.get("next"));
  if (!env.API_TOKEN) return loginPage("This installation has no access token set yet.", next);
  if (!await same(form.get("token") || "", env.API_TOKEN)) return loginPage("That token isn't right.", next);
  return new Response(null, {
    status: 303,
    headers: {
      Location: next,
      "Set-Cookie": `${SESSION_COOKIE}=${await sessionValue(env)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=31536000`
    }
  });
}
__name(handleLogin, "handleLogin");
function handleLogout() {
  return new Response(null, {
    status: 303,
    headers: { Location: "/login", "Set-Cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0` }
  });
}
__name(handleLogout, "handleLogout");

// src/version.ts
var VERSION = "0.4.0";

// src/recording.ts
async function fetchRecording(env, name) {
  const res = await pbx(env).recordingFile(name);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`PBX returned ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = /* @__PURE__ */ __name((at) => String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]), "tag");
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("recording is not a WAV");
  let rate = 8e3;
  for (let at = 12; at + 8 <= bytes.length; ) {
    const size = view.getUint32(at + 4, true);
    if (tag(at) === "fmt ") {
      if (view.getUint16(at + 8, true) !== 1 || view.getUint16(at + 10, true) !== 1 || view.getUint16(at + 22, true) !== 16) {
        throw new Error("recording is not 16-bit mono PCM");
      }
      rate = view.getUint32(at + 12, true);
    }
    if (tag(at) === "data") {
      const len = Math.min(size, bytes.length - at - 8) & ~1;
      return { rate, samples: new Int16Array(bytes.buffer.slice(bytes.byteOffset + at + 8, bytes.byteOffset + at + 8 + len)) };
    }
    at += 8 + size + (size & 1);
  }
  throw new Error("WAV has no data");
}
__name(fetchRecording, "fetchRecording");
function monoWav(samples, rate) {
  const out = new Uint8Array(44 + samples.length * 2);
  const v = new DataView(out.buffer);
  out.set([82, 73, 70, 70], 0);
  v.setUint32(4, 36 + samples.length * 2, true);
  out.set([87, 65, 86, 69, 102, 109, 116, 32], 8);
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  out.set([100, 97, 116, 97], 36);
  v.setUint32(40, samples.length * 2, true);
  out.set(new Uint8Array(samples.buffer, samples.byteOffset, samples.length * 2), 44);
  return out;
}
__name(monoWav, "monoWav");
async function playbackResponse(env, name) {
  const res = await pbx(env).recordingFile(name);
  if (!res.ok) return Response.json({ error: `PBX returned ${res.status}` }, { status: res.status === 404 ? 404 : 502 });
  const headers = new Headers({ "Content-Type": res.headers.get("Content-Type") || "audio/wav", "Cache-Control": "private, max-age=86400" });
  const len = res.headers.get("Content-Length");
  if (len) headers.set("Content-Length", len);
  return new Response(res.body, { headers });
}
__name(playbackResponse, "playbackResponse");

// src/transcribe.ts
var MODEL = "@cf/openai/whisper-large-v3-turbo";
var CHUNK_SECONDS = 300;
var SILENCE_LEVEL = 200;
async function transcribeCall(env, callId) {
  const row = await env.DB.prepare("SELECT recording, direction FROM call_log WHERE call_id = ?1").bind(callId).first();
  if (!row?.recording) throw new Error("no recording");
  const [rx, tx] = await Promise.all([fetchRecording(env, `${row.recording}-rx`), fetchRecording(env, `${row.recording}-tx`)]);
  let sides;
  if (rx && tx) {
    sides = row.direction === "outgoing" ? [{ label: "Us", audio: rx }, { label: "Them", audio: tx }] : [{ label: "Them", audio: rx }, { label: "Us", audio: tx }];
  } else {
    const mixed = await fetchRecording(env, row.recording);
    if (!mixed) throw new Error("recording file not found");
    sides = [{ label: "", audio: mixed }];
  }
  const lines = [];
  for (const { label, audio } of sides) {
    const step = audio.rate * CHUNK_SECONDS;
    for (let from = 0; from < audio.samples.length; from += step) {
      const samples = audio.samples.subarray(from, from + step);
      if (meanLevel(samples, 0, samples.length) < SILENCE_LEVEL / 10) continue;
      const out = await env.AI.run(MODEL, { audio: toBase642(monoWav(samples, audio.rate)) });
      const segments = out.segments?.length ? out.segments : out.text ? [{ start: 0, end: 0, text: out.text }] : [];
      for (const s2 of segments) {
        const text = s2.text.trim();
        if (!text) continue;
        if (s2.end > s2.start && meanLevel(samples, Math.floor(s2.start * audio.rate), Math.ceil(s2.end * audio.rate)) < SILENCE_LEVEL) continue;
        lines.push({ t: from / audio.rate + s2.start, label, text });
      }
    }
  }
  lines.sort((a, b) => a.t - b.t);
  const transcript = lines.map((l) => `[${fmtTime(l.t)}] ${l.label ? l.label + ": " : ""}${l.text}`).join("\n");
  await env.DB.prepare("UPDATE call_log SET transcript = ?1 WHERE call_id = ?2").bind(transcript, callId).run();
  return transcript;
}
__name(transcribeCall, "transcribeCall");
function meanLevel(samples, from, to) {
  from = Math.max(0, from);
  to = Math.min(samples.length, to);
  if (to <= from) return Infinity;
  let sum = 0;
  for (let i = from; i < to; i++) sum += Math.abs(samples[i]);
  return sum / (to - from);
}
__name(meanLevel, "meanLevel");
function fmtTime(sec) {
  const s2 = Math.max(0, Math.floor(sec));
  return `${Math.floor(s2 / 60)}:${String(s2 % 60).padStart(2, "0")}`;
}
__name(fmtTime, "fmtTime");
function toBase642(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 32768) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
  }
  return btoa(bin);
}
__name(toBase642, "toBase64");

// src/dashboard.ts
var EXAMPLE_CONFIG = { countryCode: "44", sipWsUrl: "", sipDomain: "", callerId: "" };
function serveDashboard(client = EXAMPLE_CONFIG) {
  const template = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<meta name="theme-color" content="#0b0f19">
<title>VoIP Bridge</title>
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/icons/icon-192.png">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{height:100%}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:radial-gradient(1200px 600px at 50% -10%,#2a2a2a 0%,#000 60%);color:#ececec;height:100dvh;overflow:hidden;display:flex;justify-content:center}
.app{width:100%;max-width:430px;height:100dvh;display:flex;flex-direction:column;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom)}
/* header */
.topbar{display:flex;align-items:center;gap:12px;padding:14px 16px 8px}
.avatar{position:relative;width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#4db8ff,#2563eb);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0}
.status-dot{position:absolute;right:-1px;bottom:-1px;width:13px;height:13px;border-radius:50%;background:#888;border:2px solid #000;box-sizing:content-box}
.status-dot.ok{background:#34d399}
.status-dot.err{background:#f87171}
.status-dot.warn{background:#f0a33c}
.identity{flex:1;min-width:0}
.user-name{font-size:17px;font-weight:700}
.caller-id{font-size:13px;color:#999}
.reg-status{display:none}
.install-btn{flex-shrink:0;border:1px solid #2563eb;border-radius:20px;background:rgba(37,99,235,.15);color:#7fb2ff;font-size:12px;font-weight:600;padding:7px 12px;cursor:pointer}
.install-btn:active{background:rgba(37,99,235,.3)}
.install-tip{margin:0 16px 8px;padding:10px 12px;border-radius:10px;background:#1a1a1a;border:1px solid #333;font-size:12px;color:#ccc;display:flex;align-items:center;gap:8px}
.install-tip button{margin-left:auto;background:none;border:none;color:#999;font-size:14px;cursor:pointer;flex-shrink:0}
/* entry box */
.entry{display:flex;align-items:center;gap:8px;padding:8px 16px}
.entry input{flex:1;min-width:0;width:0;padding:13px 14px;border:none;border-radius:12px;background:#1a1a1a;color:#fff;font-size:20px;letter-spacing:.5px;outline:none}
.entry input::placeholder{color:#666}
.backspace{width:46px;height:46px;border:none;border-radius:12px;background:#1a1a1a;color:#ccc;font-size:20px;cursor:pointer}
.suggestions{padding:0 16px 6px;min-height:0}
.sugg-row{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-radius:10px;background:#1a1a1a;margin-bottom:6px;cursor:pointer}
.sugg-row .n{font-size:15px;font-weight:600}
.sugg-row .s{font-size:13px;color:#999}
.sugg-row .call{color:#34d399;font-weight:700}
/* dialpad */
.dialpad{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:12px 28px}
.key{height:66px;border:none;border-radius:50%;background:#222;color:#fff;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;user-select:none;transition:transform .05s}
.key:active{transform:scale(.94);background:#2c2c2c}
.key .digit{font-size:26px;line-height:1;font-weight:500}
.key .letters{font-size:9px;letter-spacing:2px;color:#999;margin-top:2px}
/* call action */
.callbar{display:flex;justify-content:center;gap:24px;padding:14px 0 8px}
.call-btn{width:64px;height:64px;border-radius:50%;border:none;font-size:26px;cursor:pointer;background:linear-gradient(135deg,#34d399,#10b981);box-shadow:0 4px 18px rgba(16,185,129,.4)}
.call-btn.hangup{background:linear-gradient(135deg,#f87171,#ef4444);box-shadow:0 4px 18px rgba(239,68,68,.4)}
.call-btn.hidden{display:none}
/* active call banner */
.call-banner{display:flex;align-items:center;justify-content:space-between;margin:0 16px 8px;padding:12px 14px;border-radius:12px;background:#1a1a1a;border:1px solid #333}
.call-banner .info{min-width:0}
.call-banner .remote{font-size:16px;font-weight:700}
.call-banner .state{font-size:12px;color:#6ee7b7}
.call-banner .end{width:44px;height:44px;border-radius:50%;border:none;background:#ef4444;color:#fff;font-size:18px;cursor:pointer;flex-shrink:0}
.call-banner .answer{width:44px;height:44px;border-radius:50%;border:none;background:#10b981;color:#fff;font-size:18px;cursor:pointer;flex-shrink:0;margin-right:8px}
.call-banner .keypad{width:40px;height:40px;border-radius:50%;border:none;background:#2c2c2c;color:#ececec;font-size:16px;cursor:pointer;flex-shrink:0;margin-right:8px}
.call-banner .keypad.active{background:#2563eb}
.hidden{display:none!important}
/* views */
.views{flex:1;overflow-y:auto;padding:4px 16px 8px;min-height:0}
/* dial view = call history: search + toolbar on top, the list (or T9 matches) scrolls, keypad pinned to the bottom */
#view-dial{display:flex;flex-direction:column;height:100%;min-height:0}
#view-dial .entry,#view-dial .hist-toolbar{flex-shrink:0}
#view-dial .hist-toolbar{position:static}
.dial-scroll{flex:1;overflow-y:auto;min-height:60px}
#view-dial .suggestions{padding:4px 0}
#dial-entry{padding:6px 0 0}
#dialpad{gap:8px 12px;padding:8px 28px 4px}
#dialpad .key{height:56px}
.sugg-row b{color:#4db8ff;font-weight:700}
.sugg-row .call{background:none;border:none;font-size:18px;cursor:pointer;padding:4px 6px;flex-shrink:0}
.dir-ic{display:inline-block;flex-shrink:0;line-height:1;text-align:center}
.dir-ic.out{color:#3b82f6}
.dir-ic.in{color:#22c55e}
.dir-ic.missed{color:#ef4444}
#view-dial .call-panel{flex:1;flex-shrink:1;overflow-y:auto;min-height:0}
.dial-bottom{flex-shrink:0}
.view h2{font-size:15px;color:#999;margin:10px 0;font-weight:600}
.contact-row{display:flex;align-items:center;gap:12px;padding:12px 4px;border-bottom:1px solid #222}
.hist-row{padding:4px 4px;border-bottom:1px solid #1c1c1c;cursor:pointer}
.hist-main{display:flex;align-items:center;gap:8px;min-height:34px}
.hist-row .ic{font-size:18px}
.hist-row .dir-ic{font-size:16px;width:18px}
.hist-row .h-time{font-size:13px;color:#999;font-variant-numeric:tabular-nums;flex-shrink:0;width:40px}
.hist-row .who{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hist-main .h-ic{width:30px;height:30px;flex-shrink:0;margin:0;background:none;border:none;border-radius:8px;font-size:15px;color:#ececec;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0}
.hist-main .h-ic:active{background:#262626}
.hist-main .h-ic.dim{opacity:.35}
.hist-main .hist-play{color:#34d399;font-size:13px}
.hist-row .who,.contact-row .cname{font-size:15px;font-weight:600}
.hist-row .sub,.contact-row .sub{font-size:12px;color:#999}
.contact-row .cname-text{cursor:text;border-bottom:1px dashed transparent}
.contact-row .cname-text:hover{border-bottom-color:#555}
.contact-row .cname-edit{font:inherit;font-size:15px;font-weight:600;color:#fff;background:#111;border:1px solid #2563eb;border-radius:6px;padding:3px 6px;width:100%;max-width:320px;outline:none}
.contact-row .cname-status{font-size:11px;font-weight:400;color:#34d399;margin-left:6px}
.contact-row .cname-status.err{color:#f87171}
.hist-row .meta{margin-left:auto;font-size:12px;color:#999;text-align:right}
.hist-actions{display:flex;gap:6px;margin:8px 0 2px 30px}
.hist-action{background:#1a1a1a;border:none;color:#ccc;width:30px;height:30px;border-radius:8px;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.hist-action:active{background:#262626}
#audio-hint{position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:1000;background:#f5a623;color:#1a1100;padding:7px 14px;border-radius:999px;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.5);white-space:nowrap}
#audio-hint.hidden{display:none}
.hist-play{background:#1a1a1a;border:none;color:#34d399;width:30px;height:30px;border-radius:50%;font-size:13px;cursor:pointer;margin-left:8px;flex-shrink:0}
.hist-play:active{background:#262626}
.hist-player{margin:6px 0 4px 26px;font-size:12px;color:#999}
.hist-tx-btn{flex-shrink:0;width:46px;height:46px;border:none;border-radius:10px;background:#1a1a1a;color:#ececec;font-size:17px;cursor:pointer}
.hist-tx-btn.on{background:linear-gradient(135deg,#4db8ff,#2563eb)}
.hist-match{margin:0 0 4px 74px;font-size:12.5px;color:#ccc;font-style:italic;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hist-match mark{background:#f7c948;color:#000;border-radius:2px;font-style:normal}
.hist-player audio{width:100%;height:36px}
.hist-transcript{margin-top:6px;max-height:40vh;overflow-y:auto;font-size:13px;line-height:1.45;color:#ccc}
.hist-transcript .tl{padding:2px 0;cursor:pointer}
.hist-transcript .tl .ts{color:#4db8ff;margin-right:6px;font-variant-numeric:tabular-nums}
.hist-transcript .tl .who{font-weight:600;margin-right:4px;color:#f5a623}
.hist-transcript .tl.us .who{color:#34d399}
.hist-transcript .tl.hit{background:#3a3210;border-radius:6px}
#cd-pane-transcript .hist-transcript{max-height:none}
.hist-transcript button{background:#2c2c2c;border:none;color:#ececec;border-radius:8px;padding:6px 10px;font-size:12px;cursor:pointer}
.contact-row .mini-call{width:38px;height:38px;border-radius:50%;border:none;background:#10b981;color:#fff;font-size:16px;cursor:pointer;flex-shrink:0}
.empty{color:#666;text-align:center;padding:28px 0;font-size:14px}
.day-head{font-size:11px;font-weight:700;letter-spacing:.5px;color:#888;text-transform:uppercase;padding:14px 4px 6px;position:sticky;top:0;background:transparent}
.contact-row.selected{background:#262626;border-radius:10px;padding-left:8px;padding-right:8px}
.msg-row{display:flex;align-items:flex-start;gap:12px;padding:12px 4px;border-bottom:1px solid #222}
.msg-row .ic{font-size:18px}
.msg-row .who{font-size:14px;font-weight:600}
.msg-row .subj{font-size:13px;color:#ccc;margin-top:1px}
.msg-row .sub{font-size:12px;color:#999;margin-top:2px}
.msg-row .meta{margin-left:auto;font-size:12px;color:#999;flex-shrink:0}
/* bottom menu */
.bottom-menu{display:flex;border-top:1px solid #222;background:#0a0a0a;padding:6px 0 env(safe-area-inset-bottom)}
.menu-btn{flex:1;background:none;border:none;color:#888;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;padding:6px 0;font-size:10px}
.menu-btn .ico{font-size:20px}
.menu-btn.active{color:#4db8ff}
/* big green handset button in the bottom bar: dials a typed number, otherwise opens the keypad; red during a call = hang up */
.dial-fab{flex:1;background:none;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0}
.dial-fab .fab{width:64px;height:64px;margin:-26px 0 -4px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:30px;background:linear-gradient(135deg,#34d399,#10b981);box-shadow:0 4px 18px rgba(16,185,129,.45)}
.dial-fab:active .fab{transform:scale(.95)}
.dial-fab.in-call .fab{background:linear-gradient(135deg,#f87171,#ef4444);box-shadow:0 4px 18px rgba(239,68,68,.45)}
.callbar{display:none}
/* compact settings dialog */
.modal-card.compact{padding:14px;max-width:380px;max-height:92vh;overflow-y:auto}
.modal-card.compact .modal-head{margin-bottom:10px;font-size:16px}
.modal-card.compact .set-field{margin-bottom:8px}
.modal-card.compact .set-field label{font-size:11px;margin-bottom:3px}
.modal-card.compact .set-field input[type=text],.modal-card.compact .acc-select{padding:8px 10px;font-size:14px;border-radius:8px}
.modal-card.compact textarea{min-height:56px;padding:8px 10px}
.modal-card.compact .switch-row{margin-bottom:8px}
.modal-card.compact .dev-hint{margin-top:8px;font-size:11px}
.set-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 8px}
.set-grid .wide{grid-column:1/-1}
.acc-row{display:flex;gap:6px;margin-bottom:8px}
.acc-row .acc-select{flex:1;min-width:0}
.acc-mini{flex-shrink:0;width:38px;border:none;border-radius:8px;background:#2c2c2c;color:#ececec;font-size:16px;cursor:pointer}
.acc-mini.del{background:#3f1d1d}
.set-actions{display:flex;gap:8px;margin-top:4px}
.set-actions button{flex:1;width:auto;padding:11px;border:none;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer}
.set-cancel{background:#2c2c2c;color:#ececec}
/* menu + settings */
.menu-icon{background:none;border:none;color:#ececec;font-size:22px;cursor:pointer;padding:4px;line-height:1;flex-shrink:0}
.menu-drawer{position:fixed;top:64px;right:12px;background:#1a1a1a;border:1px solid #2c2c2c;border-radius:12px;padding:6px;z-index:40;min-width:170px;box-shadow:0 10px 30px rgba(0,0,0,.5)}
.menu-drawer button{display:block;width:100%;text-align:left;background:none;border:none;color:#ececec;padding:12px 14px;font-size:15px;border-radius:8px;cursor:pointer}
.menu-drawer button:active{background:#2c2c2c}
.modal{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:50;padding:20px}
.modal-card{background:#161616;border:1px solid #2c2c2c;border-radius:16px;padding:20px;width:100%;max-width:360px}
.modal-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;font-size:17px;font-weight:700}
.modal-head button{background:none;border:none;color:#999;font-size:18px;cursor:pointer}
.set-field{margin-bottom:16px}
.set-field label{display:block;font-size:12px;color:#999;margin-bottom:6px}
.set-field input[type=text]{width:100%;padding:12px 14px;border:none;border-radius:10px;background:#1a1a1a;color:#fff;font-size:15px;outline:none}
.acc-select{width:100%;padding:12px 14px;border:none;border-radius:10px;background:#1a1a1a;color:#fff;font-size:15px;outline:none;appearance:none;-webkit-appearance:none}
.acc-actions{display:flex;gap:8px;margin-bottom:16px}
.acc-actions button{flex:1;padding:11px;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer}
.acc-save{background:linear-gradient(135deg,#34d399,#10b981);color:#04210f}
.acc-delete{background:#3f1d1d;color:#fca5a5}
.acc-new{background:#2c2c2c;color:#ececec}
.switch-row{display:flex;align-items:center;justify-content:space-between;padding:4px 0;margin-bottom:16px}
.switch-row span{font-size:15px}
.switch{position:relative;width:48px;height:28px;flex-shrink:0}
.switch input{opacity:0;width:0;height:0}
.switch .track{position:absolute;inset:0;background:#444;border-radius:28px;cursor:pointer;transition:background .15s}
.switch .track::before{content:"";position:absolute;top:3px;left:3px;width:22px;height:22px;background:#fff;border-radius:50%;transition:transform .15s}
.switch input:checked + .track{background:#4db8ff}
.switch input:checked + .track::before{transform:translateX(20px)}
.save-btn{width:100%;padding:13px;border:none;border-radius:12px;background:linear-gradient(135deg,#4db8ff,#2563eb);color:#fff;font-size:16px;font-weight:600;cursor:pointer}
.dev-hint{font-size:12px;color:#999;margin-top:10px;text-align:center}
/* desktop full-screen */
@media (min-width:900px){
  .app{max-width:1200px}
  .dialpad{max-width:380px;margin:0 auto}
  .detail-card{max-width:760px}
  .compose-card{max-width:720px}
}
/* selection highlight */
.hist-row.selected,.msg-row.selected{background:#262626;border-radius:10px}
/* parameter table */
.p-head{display:flex;align-items:center;gap:8px;padding:2px 0 8px;position:sticky;top:0;z-index:6;background:#000}
.p-filter{width:100%;box-sizing:border-box;padding:9px 12px;border:none;border-radius:10px;background:#1a1a1a;color:#fff;font-size:14px;outline:none;margin-bottom:4px}
.ptable{width:100%;border-collapse:collapse;font-size:13px}
.ptable td{padding:7px 4px;border-bottom:1px solid #1c1c1c;vertical-align:middle}
.ptable tr.hidden{display:none}
.ptable .p-group td{padding:16px 4px 6px;font-size:11px;font-weight:700;letter-spacing:.5px;color:#f0a33c;text-transform:uppercase;border-bottom:1px solid #2c2c2c}
.ptable .p-name{width:46%;line-height:1.25}
.ptable tr.changed .p-name{color:#ffd479}
.p-note{font-size:11px;color:#888;margin-top:2px;line-height:1.3;font-weight:400}
.p-val{width:32%}
.p-select{width:100%;box-sizing:border-box;min-width:64px;padding:7px 4px;border:none;border-radius:8px;background:#1a1a1a;color:#fff;font-size:13px;outline:none}
.p-val input{width:100%;box-sizing:border-box;min-width:64px;padding:7px 8px;border:none;border-radius:8px;background:#1a1a1a;color:#fff;font-size:14px;outline:none}
.p-val input.bad{outline:1px solid #ef4444}
.p-unit{display:block;font-size:10px;color:#888;margin-top:1px}
.p-def{color:#888;font-size:12px;text-align:right;white-space:nowrap}
.p-reset{background:none;border:none;color:#4db8ff;cursor:pointer;font-size:15px;padding:2px 4px}
.p-foot{padding:14px 0 8px;text-align:center}
.p-foot button{width:100%;padding:11px;border:none;border-radius:10px;background:#2c2c2c;color:#ececec;font-size:14px;cursor:pointer;margin-bottom:8px}
.hist-toolbar{display:flex;gap:6px;padding:6px 0 8px;position:sticky;top:0;z-index:5;background:#000}
.hist-toolbar button{flex:1;padding:10px 2px;border:none;border-radius:10px;background:#2c2c2c;color:#ececec;font-size:13px;cursor:pointer;white-space:nowrap}
.hist-toolbar button:disabled{opacity:.35;cursor:default}
.hist-toolbar button.green:not(:disabled){background:linear-gradient(135deg,#34d399,#10b981);color:#04210f;font-weight:600}
/* action bar */
.action-bar{position:fixed;left:50%;transform:translateX(-50%);bottom:76px;background:#1a1a1a;border:1px solid #2c2c2c;border-radius:14px;padding:8px;display:flex;gap:8px;z-index:45;box-shadow:0 8px 30px rgba(0,0,0,.6);max-width:94vw}
.action-bar button{background:#2c2c2c;border:none;color:#ececec;padding:10px 16px;border-radius:10px;font-size:14px;cursor:pointer;white-space:nowrap}
.action-bar button.primary{background:linear-gradient(135deg,#4db8ff,#2563eb)}
.action-bar button.green{background:linear-gradient(135deg,#34d399,#10b981);color:#04210f}
.action-bar button.x{background:none;padding:10px;color:#999}
/* full-screen detail + compose modals */
.full-modal{position:fixed;inset:0;background:rgba(5,8,16,.86);z-index:60;display:flex;flex-direction:column;overflow:hidden;padding:16px}
.detail-card{background:#161616;border:1px solid #2c2c2c;border-radius:16px;margin:auto;width:100%;max-width:720px;max-height:92vh;display:flex;flex-direction:column;overflow:hidden}
.detail-head{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #2c2c2c;flex-shrink:0}
.detail-head .t{font-size:17px;font-weight:700}
.detail-head button{background:none;border:none;color:#999;font-size:20px;cursor:pointer}
.detail-body{flex:1;overflow-y:auto;padding:18px 20px;line-height:1.55}
.detail-foot{display:flex;gap:10px;padding:14px 20px;border-top:1px solid #2c2c2c;flex-shrink:0;flex-wrap:wrap}
.detail-foot button{flex:1;min-width:110px;padding:12px;border:none;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;background:#2c2c2c;color:#ececec}
.detail-foot button.primary{background:linear-gradient(135deg,#4db8ff,#2563eb)}
.detail-foot button.green{background:linear-gradient(135deg,#34d399,#10b981);color:#04210f}
.detail-row{display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid #222;font-size:14px}
.detail-row .k{color:#999;flex-shrink:0}
.detail-row .v{text-align:right;word-break:break-word}
.msg-body{margin-top:14px;font-size:15px;color:#ececec;white-space:pre-wrap;word-break:break-word}
.msg-html{display:block;width:100%;min-height:200px;margin-top:14px;border:0;border-radius:8px;background:#fff}
.compose-card{background:#161616;border:1px solid #2c2c2c;border-radius:16px;margin:auto;width:100%;max-width:640px;display:flex;flex-direction:column;overflow:hidden;max-height:92vh}
.compose-field{padding:12px 20px;border-bottom:1px solid #222}
.compose-field label{display:block;font-size:11px;color:#999;margin-bottom:4px}
.compose-field input,.compose-field textarea{width:100%;background:none;border:none;color:#fff;font-size:15px;outline:none;resize:none;font-family:inherit}
.compose-field textarea{min-height:220px}
/* colored headings + accents */
.user-name{color:#4db8ff}
.detail-head .t{color:#4db8ff}
.modal-head{color:#4db8ff}
.day-head{color:#f0a33c}
.view h2{color:#f0a33c;border-left:3px solid #f0a33c;padding-left:8px}
#view-contacts h2{color:#4db8ff;border-left-color:#4db8ff}
#view-messages h2{color:#34d399;border-left-color:#34d399}
#view-favourites h2{color:#f7c948;border-left-color:#f7c948}
.msg-row .subj{color:#e6e6e6}
/* favourites star */
.fav-star{flex-shrink:0;background:none;border:none;font-size:24px;line-height:1;cursor:pointer;padding:2px 4px;color:#555;width:38px;margin-left:auto}
.fav-star.on{color:#f7c948}
/* in-call panel: caller name + tabs (Sales/Quotations, Call History, Notes, Jot) */
.call-panel{margin:8px 16px 0;background:#1a1a1a;border:1px solid #2c2c2c;border-radius:14px;overflow:hidden}
.cp-head{padding:12px 14px 2px;display:flex;align-items:center;gap:8px}
.cp-caller{font-size:16px;font-weight:700;color:#ececec;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0}
.cp-tabs{display:flex;border-bottom:1px solid #2c2c2c;padding:0 4px;margin-top:8px;overflow-x:auto;scrollbar-width:none}
.cp-tab{flex:1 0 auto;background:none;border:none;color:#999;font-size:11.5px;font-weight:600;padding:10px 6px;cursor:pointer;border-bottom:2px solid transparent;white-space:nowrap}
.cp-tab.active{color:#4db8ff;border-bottom-color:#4db8ff}
.cp-body{padding:12px 14px;max-height:500px;overflow-y:auto}
.cp-pane textarea{width:100%;min-height:120px;background:#111;border:1px solid #2c2c2c;border-radius:10px;color:#fff;font-size:14px;padding:12px 14px;outline:none;resize:none;font-family:inherit;line-height:1.5}
.cp-pane .tox-tinymce{border-color:#2c2c2c}
.cp-quote-row{display:flex;justify-content:space-between;gap:8px;padding:10px 4px;border-bottom:1px solid #222;font-size:14px}
.cp-quote-row .n{font-weight:600}
.cp-quote-row .n .dt{font-weight:400;color:#999;font-size:12px}
.cp-quote-row .items{color:#ccc;font-size:12.5px;font-family:ui-monospace,Menlo,Consolas,monospace;margin-top:2px}
.cp-quote-row .st{color:#999;font-size:12px}
.cp-quote-row .amt{color:#34d399;font-weight:700;flex-shrink:0}
.dtmf-sent{min-height:34px;text-align:center;font-size:24px;letter-spacing:3px;color:#ececec;font-variant-numeric:tabular-nums;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;direction:rtl}
.dtmf-sent:empty::before{content:"Tap keys to send tones";direction:ltr;font-size:13px;letter-spacing:0;color:#666}
#dtmf-pad{padding:8px 4px 4px;max-width:340px;margin:0 auto}
.cp-hist-row{display:flex;justify-content:space-between;padding:9px 4px;border-bottom:1px solid #222;font-size:13px;color:#ccc}
.jot-toolbar{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.jot-status{font-size:12px;color:#34d399;margin-left:auto;white-space:nowrap}
.save-chip{background:#2c2c2c;border:none;color:#ececec;padding:8px 12px;border-radius:8px;font-size:13px;cursor:pointer;flex-shrink:0}
/* Jot engine: toolbar + scrollable canvas viewport (see createJot()) */
.jt-wrap{display:flex;flex-direction:column;gap:8px}
.jt-toolbar{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.jt-btn{background:#2c2c2c;border:none;color:#ececec;width:34px;height:34px;border-radius:8px;font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;flex-shrink:0}
.jt-btn.ghost{background:none;border:1px solid #333;color:#999}
.jt-btn.jt-mode.active{background:#2563eb;color:#fff}
.jt-btn.armed{background:#2563eb;color:#fff}
.jt-btn svg{width:20px;height:20px;display:block}
.jt-btn.jt-zoom-label{width:auto;padding:0 8px;font-size:12px}
.jt-wordinfo{margin-left:auto;font-size:11px;color:#888;white-space:nowrap;font-variant-numeric:tabular-nums}
.jt-convinfo{font-size:11px;color:#34d399;white-space:nowrap}
.jt-sep{width:1px;align-self:stretch;background:#2c2c2c;margin:2px 4px}
.jt-text{width:100%;border-radius:10px;background:#1e1e1e;border:1px solid #2c2c2c;padding:14px 16px;overflow-y:auto;white-space:pre-wrap;font-size:16px;line-height:1.55;color:#e9ecef;box-sizing:border-box}
.jt-text.hidden,.jt-canvas-wrap.hidden{display:none}
.jt-text-note{color:#999;font-style:italic}
.jt-text-saved{margin-top:8px;font-size:12px;color:#34d399;font-style:normal;min-height:15px}
.jt-text{display:flex;flex-direction:column}
.jt-text-edit{flex:1;width:100%;min-height:120px;background:transparent;border:none;outline:none;resize:none;color:#e9ecef;font:inherit;font-size:16px;line-height:1.55;padding:0}
#jot-canvas .jt-text{height:420px}
#cd-jot-canvas .jt-text{height:58vh}
.jt-btn.jt-totext{width:auto;padding:0 9px;font-weight:700;font-size:14px}
.jt-canvas-wrap{width:100%;border-radius:10px;background:#1e1e1e;border:1px solid #2c2c2c;overflow:hidden}
.jt-canvas-wrap canvas{display:block;cursor:none}
#jot-canvas .jt-canvas-wrap{height:420px}
#cd-jot-canvas .jt-canvas-wrap{height:58vh}
/* call detail view: in-screen (not a dialog), Details/Notes/Jot tabs, sized for phones */
.cd-head{display:flex;align-items:center;gap:8px;padding:2px 0 10px}
.cd-back{background:none;border:none;color:#4db8ff;font-size:24px;line-height:1;cursor:pointer;padding:4px 8px;flex-shrink:0}
.cd-title{flex:1;min-width:0}
.cd-name{font-size:17px;font-weight:700;color:#ececec;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cd-sub{font-size:12px;color:#999}
.cd-callback{background:linear-gradient(135deg,#34d399,#10b981);border:none;color:#04210f;width:40px;height:40px;border-radius:50%;font-size:17px;cursor:pointer;flex-shrink:0}
.cd-callback.hidden{display:none}
.cd-body{padding-top:6px}
.ct-name-edit{width:100%;font:inherit;font-size:16px;font-weight:600;color:#fff;background:#111;border:1px solid #2c2c2c;border-radius:8px;padding:9px 11px;outline:none}
.ct-name-edit:focus{border-color:#2563eb}
.ct-label{display:flex;justify-content:space-between;font-size:12px;color:#999;margin:4px 0 6px}
.ct-addr{white-space:pre-line;text-align:right}
.ct-totals{display:flex;gap:10px;margin:14px 0 6px}
.ct-total{flex:1;background:#1a1a1a;border:1px solid #2c2c2c;border-radius:12px;padding:12px}
.ct-total .k{font-size:12px;color:#999}
.ct-total .v{font-size:19px;font-weight:700;color:#34d399;margin-top:2px}
.ct-total .n{font-size:11px;color:#777}
.cd-footer{padding:16px 0 4px}
.qt-panel{margin:10px 0 0;background:#111;border:1px solid #2c2c2c;border-radius:12px;padding:8px;max-height:200px;overflow-y:auto}
.qt-panel .qt-head{font-size:11px;color:#999;text-transform:uppercase;letter-spacing:.5px;padding:4px 8px 8px}
.qt-row{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:8px;cursor:pointer;font-size:14px}
.qt-row:active,.qt-row:hover{background:#262626}
.qt-row .code{color:#4db8ff;font-weight:700;font-size:13px;min-width:30px}
.qt-row .txt{flex:1;color:#ececec}
/* settings textarea */
.set-field textarea{width:100%;padding:12px 14px;border:none;border-radius:10px;background:#1a1a1a;color:#fff;font-size:14px;outline:none;resize:none;font-family:inherit;line-height:1.5;min-height:110px}
/* TinyMCE dark editors */
.tox-tinymce{border-radius:10px}
.compose-field .tox-tinymce{border:0}
</style>
</head>
<body>
<div class="app">
  <header class="topbar">
    <div class="avatar" id="avatar">\u{1F464}<span class="status-dot warn" id="status-dot" title="Loading\u2026"></span></div>
    <div class="identity">
      <div class="user-name" id="acc-name-display">Phone</div>
      <div class="caller-id" id="acc-caller-display">Caller ID: \u2014</div>
    </div>
    <div class="reg-status" id="phone-status">Loading\u2026</div>
    <button class="install-btn hidden" id="install-btn" onclick="installApp()">\u2B07 Install</button>
    <button class="menu-icon" onclick="toggleMenu()" aria-label="Menu">\u2630</button>
  </header>

  <div class="install-tip hidden" id="install-tip">
    Tap <strong>Share</strong> then <strong>Add to Home Screen</strong> to install.
    <button onclick="dismissInstallTip()" aria-label="Dismiss">\u2715</button>
  </div>

  <div class="install-tip hidden" id="update-tip">
    <span id="update-text"></span>
    <button onclick="dismissAppUpdate()" aria-label="Dismiss">\u2715</button>
  </div>

  <div class="call-banner hidden" id="call-banner">
    <div class="info">
      <div class="remote" id="banner-remote"></div>
      <div class="state" id="banner-state"></div>
    </div>
    <button class="keypad hidden" id="banner-keypad" onclick="toggleInCallKeypad()" aria-label="Keypad">\u2328\uFE0F</button>
    <button class="answer hidden" id="banner-answer" onclick="answerCall()">\u{1F4DE}</button>
    <button class="end" onclick="hangup()">\u{1F4F4}</button>
  </div>

  <div class="views">
    <!-- DIAL VIEW -->
    <div class="view" id="view-dial">
      <div class="hist-toolbar" id="hist-toolbar">
        <button class="green" data-action="call" onclick="histAction('call')" disabled>\u{1F4DE} Call</button>
        <button data-action="email" onclick="histAction('email')" disabled>\u2709\uFE0F Email</button>
        <button data-action="details" onclick="histAction('details')" disabled>\u{1F4C4} Details</button>
        <button data-action="contact" onclick="histAction('contact')" disabled>\u{1F464} Contact</button>
      </div>
      <div class="dial-scroll" id="history-list"><div class="empty">Loading\u2026</div></div>
      <div class="dial-scroll suggestions hidden" id="dial-suggestions"></div>
      <div class="call-panel hidden" id="call-panel">
        <div class="cp-head">
          <div class="cp-caller" id="cp-caller-name">Unknown caller</div>
          <span class="jot-status" id="cp-save-status"></span>
        </div>
        <div class="cp-tabs">
          <button class="cp-tab" data-tab="sales" onclick="switchCallTab('sales')">Sales / Quotations</button>
          <button class="cp-tab" data-tab="history" onclick="switchCallTab('history')">Call History</button>
          <button class="cp-tab" data-tab="emails" onclick="switchCallTab('emails')">Emails</button>
          <button class="cp-tab active" data-tab="notes" onclick="switchCallTab('notes')">Notes</button>
          <button class="cp-tab" data-tab="jot" onclick="switchCallTab('jot')">Jot</button>
          <button class="cp-tab hidden" data-tab="keypad" id="cp-tab-keypad" onclick="switchCallTab('keypad')">Keypad</button>
        </div>
        <div class="cp-body">
          <div class="cp-pane hidden" id="cp-pane-sales"><div class="empty">\u2014</div></div>
          <div class="cp-pane hidden" id="cp-pane-history"><div class="empty">\u2014</div></div>
          <div class="cp-pane hidden" id="cp-pane-emails"><div class="empty">\u2014</div></div>
          <div class="cp-pane" id="cp-pane-notes">
            <textarea id="call-notes" placeholder="Call notes\u2026 (press # for quick text)" autocomplete="off"></textarea>
            <div class="qt-panel hidden" id="qt-panel">
              <div class="qt-head">Quick text \u2014 tap to insert</div>
              <div id="qt-list"></div>
            </div>
          </div>
          <div class="cp-pane hidden" id="cp-pane-jot">
            <div class="jot-toolbar"><span class="jot-status" id="jot-status"></span></div>
            <div id="jot-canvas"></div>
          </div>
          <div class="cp-pane hidden" id="cp-pane-keypad">
            <div class="dtmf-sent" id="dtmf-sent"></div>
            <div class="dialpad" id="dtmf-pad">
              <button class="key" data-d="1"><span class="digit">1</span><span class="letters"></span></button>
              <button class="key" data-d="2"><span class="digit">2</span><span class="letters">ABC</span></button>
              <button class="key" data-d="3"><span class="digit">3</span><span class="letters">DEF</span></button>
              <button class="key" data-d="4"><span class="digit">4</span><span class="letters">GHI</span></button>
              <button class="key" data-d="5"><span class="digit">5</span><span class="letters">JKL</span></button>
              <button class="key" data-d="6"><span class="digit">6</span><span class="letters">MNO</span></button>
              <button class="key" data-d="7"><span class="digit">7</span><span class="letters">PQRS</span></button>
              <button class="key" data-d="8"><span class="digit">8</span><span class="letters">TUV</span></button>
              <button class="key" data-d="9"><span class="digit">9</span><span class="letters">WXYZ</span></button>
              <button class="key" data-d="*"><span class="digit">*</span><span class="letters"></span></button>
              <button class="key" data-d="0"><span class="digit">0</span><span class="letters"></span></button>
              <button class="key" data-d="#"><span class="digit">#</span><span class="letters"></span></button>
            </div>
          </div>
        </div>
      </div>
      <div class="dial-bottom" id="dial-bottom">
        <div class="entry" id="dial-entry">
          <input id="dial-input" type="text" placeholder="Number or name (T9)" autocomplete="off" autocapitalize="off">
          <button class="hist-tx-btn" id="hist-tx-btn" onclick="toggleTranscriptSearch()" title="Search call transcripts">\u{1F4AC}</button>
          <button class="backspace" onclick="backspace()">\u232B</button>
        </div>
        <div class="dialpad" id="dialpad">
          <button class="key" data-d="1"><span class="digit">1</span><span class="letters"></span></button>
          <button class="key" data-d="2"><span class="digit">2</span><span class="letters">ABC</span></button>
          <button class="key" data-d="3"><span class="digit">3</span><span class="letters">DEF</span></button>
          <button class="key" data-d="4"><span class="digit">4</span><span class="letters">GHI</span></button>
          <button class="key" data-d="5"><span class="digit">5</span><span class="letters">JKL</span></button>
          <button class="key" data-d="6"><span class="digit">6</span><span class="letters">MNO</span></button>
          <button class="key" data-d="7"><span class="digit">7</span><span class="letters">PQRS</span></button>
          <button class="key" data-d="8"><span class="digit">8</span><span class="letters">TUV</span></button>
          <button class="key" data-d="9"><span class="digit">9</span><span class="letters">WXYZ</span></button>
          <button class="key" data-d="*"><span class="digit">*</span><span class="letters"></span></button>
          <button class="key" data-d="0"><span class="digit">0</span><span class="letters">+</span></button>
          <button class="key" data-d="#"><span class="digit">#</span><span class="letters"></span></button>
        </div>
        <div class="callbar" id="dial-callbar">
          <button class="call-btn" id="btn-call" onclick="dialAction()">\u{1F4DE}</button>
          <button class="call-btn hangup hidden" id="btn-end" onclick="hangup()">\u{1F4F4}</button>
        </div>
      </div>
    </div>

    <!-- PARAMETERS VIEW (opened from the menu) -->
    <div class="view hidden" id="view-params">
      <div class="p-head">
        <button class="cd-back" onclick="closeParams()" aria-label="Back">\u2190</button>
        <div class="cd-title"><strong>Parameters</strong></div>
        <span class="jot-status" id="params-status"></span>
      </div>
      <input class="p-filter" id="params-filter" type="text" placeholder="Filter (name, group\u2026)" autocomplete="off" autocapitalize="off">
      <table class="ptable" id="params-table"></table>
      <div class="p-foot">
        <button id="params-reset-all" onclick="resetAllParams()">Reset all to defaults</button>
        <div class="p-note">Saved automatically, on this device only. Jot values apply to Jot pages opened afterwards.</div>
      </div>
    </div>

    <!-- CALL DETAIL VIEW (drill-down from History \u2014 in-screen, not a dialog) -->
    <div class="view hidden" id="view-call-detail">
      <div class="cd-head">
        <button class="cd-back" onclick="closeCallDetailView()">\u2190</button>
        <div class="cd-title">
          <div class="cd-name" id="cd-caller-name">Call</div>
          <div class="cd-sub" id="cd-caller-sub"></div>
        </div>
        <button class="cd-callback hidden" id="cd-callback-btn" onclick="dialBackSelected()">\u{1F4DE}</button>
      </div>
      <div class="cp-tabs">
        <button class="cp-tab" data-tab="details" onclick="switchCallDetailTab('details')">Details</button>
        <button class="cp-tab" data-tab="notes" onclick="switchCallDetailTab('notes')">Notes</button>
        <button class="cp-tab" data-tab="transcript" onclick="switchCallDetailTab('transcript')">Transcript</button>
        <button class="cp-tab active" data-tab="jot" onclick="switchCallDetailTab('jot')">Jot</button>
      </div>
      <div class="cd-body">
        <div class="cp-pane hidden" id="cd-pane-details"></div>
        <div class="cp-pane hidden" id="cd-pane-notes"><div class="empty">Loading\u2026</div></div>
        <div class="cp-pane hidden" id="cd-pane-transcript"></div>
        <div class="cp-pane" id="cd-pane-jot">
          <div class="jot-toolbar"><span class="jot-status" id="cd-jot-status"></span></div>
          <div id="cd-jot-canvas"></div>
        </div>
      </div>
      <div class="cd-footer">
        <span class="jot-status" id="cd-save-status"></span>
      </div>
    </div>

    <!-- CONTACT DETAIL VIEW (drill-down from Contacts / History) -->
    <div class="view hidden" id="view-contact-detail">
      <div class="cd-head">
        <button class="cd-back" onclick="closeContactView()" aria-label="Back">\u2190</button>
        <div class="cd-title">
          <div class="cd-name" id="ct-name">Contact</div>
          <div class="cd-sub" id="ct-sub"></div>
        </div>
        <button class="cd-callback hidden" id="ct-dial-btn" onclick="dialContactView()">\u{1F4DE}</button>
      </div>
      <div class="cp-tabs">
        <button class="cp-tab active" data-tab="details" onclick="switchContactTab('details')">Details</button>
        <button class="cp-tab" data-tab="sales" onclick="switchContactTab('sales')">Sales / Purchases</button>
        <button class="cp-tab" data-tab="messages" onclick="switchContactTab('messages')">Messages</button>
        <button class="cp-tab" data-tab="calls" onclick="switchContactTab('calls')">Calls</button>
      </div>
      <div class="cd-body">
        <div class="cp-pane" id="ct-pane-details"></div>
        <div class="cp-pane hidden" id="ct-pane-sales"></div>
        <div class="cp-pane hidden" id="ct-pane-messages"></div>
        <div class="cp-pane hidden" id="ct-pane-calls"></div>
      </div>
    </div>

    <!-- FAVOURITES VIEW -->
    <div class="view hidden" id="view-favourites">
      <h2>\u2B50 Favourites</h2>
      <div id="fav-list"><div class="empty">No favourites yet</div></div>
    </div>

    <!-- CONTACTS VIEW -->
    <div class="view hidden" id="view-contacts">
      <h2>\u{1F465} Contacts</h2>
      <div class="entry">
        <input id="contact-search" type="text" placeholder="Search contacts" autocomplete="off">
      </div>
      <div id="contacts-list"><div class="empty">Type to search</div></div>
    </div>

    <!-- MESSAGES VIEW -->
    <div class="view hidden" id="view-messages">
      <h2 id="msg-title">\u{1F4AC} Messages</h2>
      <div id="messages-list"><div class="empty">Select a contact to view messages</div></div>
    </div>
  </div>

  <nav class="bottom-menu">
    <button class="menu-btn active" data-view="dial" onclick="switchView('dial')"><span class="ico">\u{1F550}</span><span>History</span></button>
    <button class="menu-btn" data-view="favourites" onclick="switchView('favourites')"><span class="ico">\u2B50</span><span>Favourites</span></button>
    <button class="dial-fab" id="nav-dial" onclick="navDialAction()" aria-label="Dial"><span class="fab">\u{1F4DE}</span></button>
    <button class="menu-btn" data-view="contacts" onclick="switchView('contacts')"><span class="ico">\u{1F465}</span><span>Contacts</span></button>
    <button class="menu-btn" data-view="messages" onclick="switchView('messages')"><span class="ico">\u{1F4AC}</span><span>Messages</span></button>
  </nav>
  <div class="action-bar hidden" id="action-bar"></div>
</div>

<div class="menu-drawer hidden" id="menu-drawer">
  <button class="hidden" id="menu-install-btn" onclick="menuInstallApp()">\u2B07 Install App</button>
  <button onclick="openSettings()">\u2699\uFE0F Settings</button>
  <button onclick="openParams()">\u{1F4CB} Parameters</button>
</div>

<div class="modal hidden" id="settings-modal">
  <div class="modal-card compact">
    <div class="modal-head"><span>\u2699\uFE0F Settings</span><button onclick="cancelSettings()" aria-label="Cancel">\u2715</button></div>

    <div class="acc-row">
      <select id="set-account" class="acc-select" onchange="onAccountSelect()"></select>
      <button class="acc-mini" onclick="newAccount()" title="New account" aria-label="New account">\uFF0B</button>
      <button class="acc-mini del" onclick="deleteAccount()" title="Delete account" aria-label="Delete account">\u{1F5D1}</button>
    </div>

    <div id="account-editor" class="hidden">
      <div class="set-grid">
        <div class="set-field"><label>Name</label><input id="acc-name" type="text" placeholder="Desk phone" autocomplete="off"></div>
        <div class="set-field"><label>Caller ID</label><input id="acc-callerid" type="text" placeholder="+15551234567" autocomplete="off"></div>
        <div class="set-field"><label>Username</label><input id="acc-username" type="text" placeholder="201" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
        <div class="set-field"><label>Password</label><input id="acc-password" type="text" placeholder="SIP password" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
        <div class="set-field wide"><label>Proxy / Server</label><input id="acc-server" type="text" placeholder="wss://host/ws" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
        <div class="set-field"><label>Transport</label>
          <select id="acc-transport" class="acc-select">
            <option value="wss">WSS (secure WebSocket)</option>
            <option value="ws">WS (WebSocket)</option>
            <option value="udp">UDP</option>
            <option value="tcp">TCP</option>
            <option value="tls">TLS</option>
          </select>
        </div>
        <div class="set-field"><label>Domain</label><input id="acc-domain" type="text" placeholder="pbx.example.com" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
      </div>
    </div>

    <div class="switch-row">
      <span>Dev Mode</span>
      <label class="switch"><input type="checkbox" id="set-dev"><span class="track"></span></label>
    </div>

    <div class="set-field">
      <label>Quick Text \u2014 one per line: #nn **text** (e.g. #1 **Order received**)</label>
      <textarea id="set-quicktext" placeholder="#1 **Order received**&#10;#2 **Call back later**"></textarea>
    </div>

    <div class="set-actions">
      <button class="set-cancel" onclick="cancelSettings()">Cancel</button>
      <button class="save-btn" onclick="applyAndReconnect()">Save</button>
    </div>
    <div class="dev-hint">Save reconnects with these settings. Dev Mode skips the server connection.</div>
  </div>
</div>

<div class="full-modal hidden" id="detail-modal">
  <div class="detail-card">
    <div class="detail-head"><span class="t" id="detail-title">Detail</span><button onclick="closeDetail()">\u2715</button></div>
    <div class="detail-body" id="detail-body"></div>
    <div class="detail-foot" id="detail-foot"></div>
  </div>
</div>

<div class="full-modal hidden" id="compose-modal">
  <div class="compose-card">
    <div class="detail-head"><span class="t" id="compose-title">\u2709\uFE0F New Message</span><button onclick="closeCompose()">\u2715</button></div>
    <div class="compose-field"><label>To</label><input id="comp-to" type="text" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
    <div class="compose-field"><label>Subject</label><input id="comp-subject" type="text" autocomplete="off"></div>
    <div class="compose-field"><label>Message</label><textarea id="comp-body"></textarea></div>
    <div class="detail-foot">
      <button class="primary" id="comp-send" onclick="sendCompose()">Send</button>
      <button onclick="closeCompose()">Cancel</button>
    </div>
  </div>
</div>

<script>
// \u2500\u2500 config \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
var SERVER = __SERVER_CONFIG__;
var API = location.origin;
// Every API route needs a session (src/auth.ts); when it's missing or the
// token was changed, send the user to sign in again.
(function() {
  var origFetch = window.fetch;
  window.fetch = function() {
    return origFetch.apply(this, arguments).then(function(r) {
      if (r.status === 401 && location.pathname !== "/login") location.href = "/login?next=" + encodeURIComponent(location.pathname);
      return r;
    });
  };
})();

// \u2500\u2500 Parameter table \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Every tunable that used to be a hardcoded literal is declared here once
// (label, unit, default, valid range). Overrides are per-device
// (localStorage "vb_params") and applied at startup: code reads PV.<id>, or
// the JOT_*/... globals that a parameter's setter assigns.
var PARAMS = [], PV = {};
function defParam(group, id, label, def, o, set) {
  o = o || {};
  PARAMS.push({ group: group, id: id, label: label, def: def, type: o.choices ? "choice" : (typeof def === "string" ? "text" : "number"),
    choices: o.choices || null, unit: o.unit || "", min: o.min, max: o.max, step: o.step || 1, note: o.note || "", set: set || null });
  PV[id] = def;
}
var G_CALL = "Calls & audio", G_LIST = "Lists & search", G_TIME = "Timing (typing & taps)";
var J_INK = "Jot: ink", J_WORD = "Jot: word detection", J_LAY = "Jot: layout & splitting", J_DOT = "Jot: periods", J_GEST = "Jot: gestures", J_BOX = "Jot: page & zoom";

defParam(G_CALL, "wsKeepAliveSec", "WebSocket keep-alive", 25, { unit: "s", min: 0, max: 300, step: 5, note: "Ping the SIP server this often (0 = off); applies on next connect" });
defParam(G_CALL, "reconnectMinMs", "Reconnect first retry", 2000, { unit: "ms", min: 500, max: 60000, step: 500, note: "Wait before the first reconnect after the connection drops; doubles on each failure" });
defParam(G_CALL, "reconnectMaxMs", "Reconnect max retry", 60000, { unit: "ms", min: 5000, max: 600000, step: 1000, note: "Longest wait between reconnect attempts" });
defParam(G_CALL, "reconnectCheckMs", "Connection check interval", 30000, { unit: "ms", min: 5000, max: 600000, step: 1000, note: "How often to check the softphone is still registered (change applies after reload)" });
defParam(G_CALL, "regTimeoutMs", "SIP registration timeout", 8000, { unit: "ms", min: 1000, max: 120000, step: 500, note: "Give up if the server never answers REGISTER" }, function(v) { REG_TIMEOUT_MS = v; });
defParam(G_CALL, "sipLoadTimeoutMs", "SIP.js load timeout", 15000, { unit: "ms", min: 1000, max: 120000, step: 1000 });
defParam(G_CALL, "defaultWs", "Default SIP WebSocket", SERVER.sipWsUrl, { note: "Used for new accounts and a blank Proxy field" }, function(v) { DEFAULT_WS = v; });
defParam(G_CALL, "defaultDomain", "Default SIP domain", SERVER.sipDomain, { note: "Used when an account has no domain" });
defParam(G_CALL, "autoAnswerWindowMs", "Answer-tap window", 30000, { unit: "ms", min: 1000, max: 300000, step: 1000, note: "After tapping the call notification, a call arriving within this time auto-answers" });
defParam(G_CALL, "autoAnswerDelayMs", "Auto-answer delay", 400, { unit: "ms", min: 0, max: 5000, step: 50, note: "Pause between the call ringing in and answering it" });
defParam(G_CALL, "ringIntervalMs", "Incoming ring repeat", 3000, { unit: "ms", min: 1000, max: 15000, step: 250 });
defParam(G_CALL, "ringbackIntervalMs", "Ringback tone repeat", 3000, { unit: "ms", min: 1000, max: 15000, step: 250 });
defParam(G_CALL, "longPressPlusMs", "Hold 0 for +", 600, { unit: "ms", min: 200, max: 3000, step: 50, note: "Long-press time on the 0 key" });

defParam(G_LIST, "historyLimit", "History rows loaded", 200, { min: 1, max: 1000, step: 10 });
defParam(G_LIST, "callPanelHistoryLimit", "Call history in call panel", 20, { min: 1, max: 200, step: 5 });
defParam(G_LIST, "suggestionsLimit", "Contact suggestions while dialling", 6, { min: 1, max: 30 });
defParam(G_LIST, "contactsLimit", "Contacts loaded", 100, { min: 1, max: 1000, step: 10 });
defParam(G_LIST, "callPanelMessagesLimit", "Messages in call panel", 100, { min: 1, max: 500, step: 10 });
defParam(G_LIST, "contactMessagesLimit", "Messages per contact", 50, { min: 1, max: 500, step: 10 });
defParam(G_LIST, "contactOrdersLimit", "Sales orders per contact", 20, { min: 1, max: 100, step: 5 });
defParam(G_LIST, "recentMessagesDays", "Recent messages: days back", 7, { unit: "days", min: 1, max: 90 });
defParam(G_LIST, "recentMessagesLimit", "Recent messages: max", 50, { min: 1, max: 500, step: 10 });

defParam(G_TIME, "suggestDebounceMs", "Dial T9 search delay", 60, { unit: "ms", min: 0, max: 2000, step: 10, note: "Wait after typing before searching" });
defParam(G_TIME, "historyDebounceMs", "History search delay", 250, { unit: "ms", min: 0, max: 2000, step: 10 });
defParam(G_TIME, "contactsDebounceMs", "Contacts search delay", 250, { unit: "ms", min: 0, max: 2000, step: 10 });
defParam(G_TIME, "doubleTapMs", "Double-tap window", 300, { unit: "ms", min: 100, max: 1000, step: 10, note: "Contacts / messages rows" });
defParam(G_TIME, "jotAutoConvertMs", "Jot auto-convert delay", 1500, { unit: "ms", min: 0, max: 30000, step: 100, note: "Wait after the last finished word before the handwriting is read and copied into the notes" });
defParam(G_TIME, "jotTextAutosaveMs", "Jot text edit autosave delay", 800, { unit: "ms", min: 200, max: 10000, step: 100, note: "Wait after the last keystroke before copying edited Aa text into the notes" });
defParam(G_TIME, "contactRenameAutosaveMs", "Contact rename autosave delay", 900, { unit: "ms", min: 200, max: 10000, step: 100, note: "Wait after the last keystroke before saving the name to Odoo" });
defParam(G_TIME, "notesAutosaveMs", "Notes autosave delay", 900, { unit: "ms", min: 200, max: 10000, step: 100, note: "Wait after the last edit before saving" });
defParam(G_TIME, "quickTextTimeoutMs", "Quick-text panel timeout", 4000, { unit: "ms", min: 500, max: 30000, step: 500 });

defParam(J_INK, "jotInk", "Ink colour", "#e9ecef", { note: "CSS colour" }, function(v) { JOT_INK = v; });
defParam(J_INK, "jotStrokeSize", "Stroke width", 5, { unit: "px", min: 0.5, max: 30, step: 0.5 }, function(v) { JOT_STROKE_OPTS.size = v; });
defParam(J_INK, "jotStrokeThinning", "Stroke thinning", 0.6, { min: -1, max: 1, step: 0.05, note: "How much speed thins the line" }, function(v) { JOT_STROKE_OPTS.thinning = v; });
defParam(J_INK, "jotStrokeSmoothing", "Stroke smoothing", 0.5, { min: 0, max: 1, step: 0.05 }, function(v) { JOT_STROKE_OPTS.smoothing = v; });
defParam(J_INK, "jotStrokeStreamline", "Stroke streamline", 0.5, { min: 0, max: 1, step: 0.05 }, function(v) { JOT_STROKE_OPTS.streamline = v; });
defParam(J_INK, "jotDefaultPressure", "Default pen pressure", 0.5, { min: 0.05, max: 1, step: 0.05, note: "For mouse / pens that report no pressure" });

defParam(J_WORD, "jotNewWordPauseMs", "New word: pause", 900, { unit: "ms", min: 0, max: 10000, step: 50, note: "A new word needs BOTH this pause AND the gap below" });
defParam(J_WORD, "jotNewWordGapMm", "New word: gap", 2, { unit: "mm", min: 0, max: 100, step: 0.5, note: "Sideways distance from the word so far (or distance below it), on screen; ink above the word never counts" });
defParam(J_WORD, "jotNewLineMm", "New line = new word", 2, { unit: "mm", min: 0, max: 50, step: 0.5, note: "A stroke whose middle is this far below the word so far starts a new word straight away, with no pause needed" });
defParam(J_WORD, "jotWordSettleMs", "Word settle delay", 2500, { unit: "ms", min: 500, max: 20000, step: 100, note: "With no new stroke for this long, the word is laid out; the next stroke then always starts a new word" });
// Touch devices lay out at ~160 CSS px per inch (Android dp / iOS points), desktops at 96.
var JOT_DEFAULT_PX_PER_MM = (window.matchMedia && window.matchMedia("(pointer: coarse)").matches ? 160 : 96) / 25.4;
defParam(J_WORD, "jotPxPerMm", "Screen px per mm", JOT_DEFAULT_PX_PER_MM, { unit: "px/mm", min: 1, max: 20, step: 0.01, note: "CSS pixels per real millimetre (~6.3 on phones, ~3.8 on desktops)" }, function(v) { JOT_PX_PER_MM = v; });

defParam(J_LAY, "jotMaxTilt", "Max levelling tilt", 30, { unit: "deg", min: 0, max: 90, step: 1, note: "Cap on how far a run is rotated flat" }, function(v) { JOT_MAX_TILT = v * Math.PI / 180; });
defParam(J_LAY, "jotLineHeight", "Line height", 42, { unit: "px", min: 10, max: 200, step: 1 }, function(v) { JOT_LINE_HEIGHT = v; });
defParam(J_LAY, "jotWordHeight", "Word height", 26, { unit: "px", min: 5, max: 150, step: 1, note: "Handwriting is scaled to this" }, function(v) { JOT_WORD_HEIGHT = v; });
defParam(J_LAY, "jotWordGap", "Word gap", 10, { unit: "px", min: 0, max: 100, step: 1 }, function(v) { JOT_WORD_GAP = v; });
defParam(J_LAY, "jotParaMargin", "Paragraph margin", 14, { unit: "px", min: 0, max: 100, step: 1 }, function(v) { JOT_PARA_MARGIN = v; });
defParam(J_LAY, "jotParaTop", "Top padding", 32, { unit: "px", min: 0, max: 200, step: 1 }, function(v) { JOT_PARA_TOP = v; });
defParam(J_LAY, "jotRunScaleMax", "Max handwriting enlargement", 4, { min: 1, max: 20, step: 0.5, note: "Upper limit when scaling small writing up to word height" });
defParam(J_LAY, "jotUntiltedSpread", "Upright threshold", 0.15, { min: 0, max: 1, step: 0.05, note: "Sideways spread below this fraction of height = upright, no tilt (an I with serifs needs ~0.35)" });
defParam(J_LAY, "jotMinRunHeight", "Minimum writing height", 10, { unit: "px", min: 1, max: 100, step: 1, note: "Floor when scaling handwriting to word height" });
defParam(J_LAY, "jotMinWordWidth", "Minimum word width", 10, { unit: "px", min: 1, max: 100, step: 1 });
defParam(J_LAY, "jotBoxBottomPad", "Space below last line", 10, { unit: "px", min: 0, max: 100, step: 1 });

defParam(J_DOT, "jotDotMaxRaw", "Tap size counted as a period", 6, { unit: "px", min: 0, max: 50, step: 1 }, function(v) { JOT_DOT_MAX_RAW = v; });
defParam(J_DOT, "jotDotScale", "Period render scale", 0.5, { min: 0.1, max: 3, step: 0.05 }, function(v) { JOT_DOT_SCALE = v; });
defParam(J_DOT, "jotDotWidth", "Period layout width", 8, { unit: "px", min: 0, max: 60, step: 1 }, function(v) { JOT_DOT_WIDTH = v; });

defParam(J_GEST, "jotGestureMinLen", "Gesture leg minimum length", 22, { unit: "px", min: 5, max: 200, step: 1, note: "Backspace / Return strokes; screen px, zoom-independent" }, function(v) { JOT_GESTURE_MIN_LEN = v; });
defParam(J_GEST, "jotGestureStraightness", "Gesture straightness", 0.7, { min: 0.3, max: 1, step: 0.05, note: "Net travel / path length, per leg" }, function(v) { JOT_GESTURE_STRAIGHTNESS = v; });
defParam(J_GEST, "jotGestureAxisDominance", "Gesture axis dominance", 1.6, { min: 1, max: 6, step: 0.1, note: "One axis must beat the other by this ratio" }, function(v) { JOT_GESTURE_AXIS_DOMINANCE = v; });
var GESTURE_PATHS = ["left-down", "down-left", "right-down", "down-right", "left-up", "up-left", "right-up", "up-right"];
defParam(J_GEST, "jotGestureBackspace", "Backspace gesture", "left-down", { choices: GESTURE_PATHS, note: "Pen path: first leg, then second leg. Must differ from Return" });
defParam(J_GEST, "jotGestureReturn", "Return gesture", "down-left", { choices: GESTURE_PATHS, note: "Starts a new handwriting box; the finished box is read in the background" });

defParam(J_BOX, "jotZoomMin", "Zoom minimum", 0.25, { min: 0.05, max: 1, step: 0.05 });
defParam(J_BOX, "jotZoomMax", "Zoom maximum", 4, { min: 1, max: 20, step: 0.5 });
defParam(J_BOX, "jotZoomStep", "Zoom button step", 1.25, { min: 1.05, max: 3, step: 0.05 });
defParam(J_BOX, "jotHitPad", "Touch tolerance (erase)", 10, { unit: "px", min: 0, max: 60, step: 1 });
defParam(J_BOX, "jotViewportMinW", "Canvas minimum width", 280, { unit: "px", min: 100, max: 2000, step: 10 });
defParam(J_BOX, "jotViewportMinH", "Canvas minimum height", 200, { unit: "px", min: 100, max: 2000, step: 10 });

function paramOverrides() {
  try { var o = JSON.parse(localStorage.getItem("vb_params") || "{}"); return (o && typeof o === "object") ? o : {}; } catch (e) { return {}; }
}
function saveParamOverrides(o) { try { localStorage.setItem("vb_params", JSON.stringify(o)); } catch (e) {} }
function hasOverride(o, id) { return Object.prototype.hasOwnProperty.call(o, id); }
function paramFind(id) { for (var i = 0; i < PARAMS.length; i++) if (PARAMS[i].id === id) return PARAMS[i]; return null; }
function paramFmt(v) { return typeof v === "number" ? String(parseFloat(v.toPrecision(6))) : String(v); }
function paramChoiceLabel(c) { return String(c).split("-").join(", then "); }
function paramField(p, attrs) {
  if (p.type === "choice") {
    var h = '<select class="p-select" data-id="' + p.id + '">';
    for (var i = 0; i < p.choices.length; i++) h += '<option value="' + esc(p.choices[i]) + '"' + (p.choices[i] === PV[p.id] ? " selected" : "") + '>' + esc(paramChoiceLabel(p.choices[i])) + '</option>';
    return h + '</select>';
  }
  return '<input data-id="' + p.id + '"' + attrs + ' value="' + esc(paramFmt(PV[p.id])) + '" autocomplete="off">';
}
function paramValid(p, v) {
  if (p.type === "choice") return p.choices.indexOf(v) !== -1;
  if (p.type === "text") return typeof v === "string" && v.trim() !== "";
  if (typeof v !== "number" || !isFinite(v)) return false;
  if (p.min !== undefined && v < p.min) return false;
  if (p.max !== undefined && v > p.max) return false;
  return true;
}
function paramApply(p, v) {
  PV[p.id] = v;
  if (p.set) p.set(v);
  if (p.group.indexOf("Jot") === 0) {
    // derived from the layout values above
    JOT_BOX_MIN_HEIGHT = JOT_PARA_TOP + JOT_LINE_HEIGHT;
  }
}
function applyAllParams() {
  var o = paramOverrides();
  for (var i = 0; i < PARAMS.length; i++) {
    var p = PARAMS[i];
    if (hasOverride(o, p.id) && paramValid(p, o[p.id])) paramApply(p, o[p.id]);
  }
}

var paramsReturnView = "dial", paramTimers = {}, paramStatusTimer = null, resetAllArmed = null;
function paramStatus(msg, bad) {
  var el = document.getElementById("params-status");
  el.textContent = msg;
  el.style.color = bad ? "#f87171" : "";
  clearTimeout(paramStatusTimer);
  if (!bad) paramStatusTimer = setTimeout(function() { el.textContent = ""; }, 2500);
}
function openParams() {
  document.getElementById("menu-drawer").classList.add("hidden");
  var views = document.querySelectorAll(".view");
  for (var i = 0; i < views.length; i++) {
    if (!views[i].classList.contains("hidden") && views[i].id !== "view-params") paramsReturnView = views[i].id.replace("view-", "");
  }
  document.getElementById("params-filter").value = "";
  renderParams();
  switchView("params");
}
function closeParams() { switchView(paramsReturnView || "dial"); }
function renderParams() {
  var o = paramOverrides(), html = "", grp = "";
  for (var i = 0; i < PARAMS.length; i++) {
    var p = PARAMS[i];
    if (p.group !== grp) { grp = p.group; html += '<tr class="p-group"><td colspan="3">' + esc(grp) + '</td></tr>'; }
    var changed = hasOverride(o, p.id) && paramValid(p, o[p.id]);
    var attrs = p.type === "text" ? ' type="text" autocapitalize="off" spellcheck="false"'
      : ' type="number" step="' + p.step + '"' + (p.min !== undefined ? ' min="' + p.min + '"' : "") + (p.max !== undefined ? ' max="' + p.max + '"' : "");
    html += '<tr class="p-row' + (changed ? " changed" : "") + '" data-id="' + p.id + '" data-search="' + esc((p.group + " " + p.label + " " + p.id).toLowerCase()) + '">'
      + '<td class="p-name">' + esc(p.label) + (p.note ? '<div class="p-note">' + esc(p.note) + '</div>' : "") + '</td>'
      + '<td class="p-val">' + paramField(p, attrs) + (p.unit ? '<span class="p-unit">' + esc(p.unit) + '</span>' : "") + '</td>'
      + '<td class="p-def">' + esc(p.type === "choice" ? paramChoiceLabel(p.def) : paramFmt(p.def)) + '<button class="p-reset" data-id="' + p.id + '" title="Reset to default"' + (changed ? "" : ' style="visibility:hidden"') + '>\u21BA</button></td></tr>';
  }
  document.getElementById("params-table").innerHTML = html;
  filterParams();
}
function filterParams() {
  var q = document.getElementById("params-filter").value.trim().toLowerCase();
  var rows = document.querySelectorAll("#params-table tr");
  var groupRow = null, groupHas = false;
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (r.classList.contains("p-group")) {
      if (groupRow) groupRow.classList.toggle("hidden", !groupHas);
      groupRow = r; groupHas = false;
      continue;
    }
    var show = !q || r.getAttribute("data-search").indexOf(q) !== -1;
    r.classList.toggle("hidden", !show);
    if (show) groupHas = true;
  }
  if (groupRow) groupRow.classList.toggle("hidden", !groupHas);
}
function commitParam(id, inp) {
  var p = paramFind(id);
  if (!p) return;
  clearTimeout(paramTimers[id]);
  var raw = inp.value.trim();
  var v = p.type === "number" ? (raw === "" ? NaN : Number(raw)) : raw;
  if (!paramValid(p, v)) {
    inp.classList.add("bad");
    paramStatus("\u26A0 " + p.label + ": " + (p.type === "number" ? "enter a number" + (p.min !== undefined ? " from " + p.min : "") + (p.max !== undefined ? " to " + p.max : "") : "can't be empty"), true);
    return;
  }
  inp.classList.remove("bad");
  var o = paramOverrides();
  var same = p.type === "number" ? Math.abs(v - p.def) < 0.0001 : v === p.def;
  if (same) { delete o[id]; paramApply(p, p.def); } else { o[id] = v; paramApply(p, v); }
  saveParamOverrides(o);
  var row = inp.closest(".p-row");
  row.classList.toggle("changed", !same);
  row.querySelector(".p-reset").style.visibility = same ? "hidden" : "visible";
  paramStatus("Saved \u2713 " + p.label, false);
}
function resetParam(id) {
  var p = paramFind(id);
  if (!p) return;
  var o = paramOverrides();
  delete o[id];
  saveParamOverrides(o);
  paramApply(p, p.def);
  renderParams();
  paramStatus("Reset \u2713 " + p.label, false);
}
function resetAllParams() {
  var btn = document.getElementById("params-reset-all");
  if (!resetAllArmed) {
    btn.textContent = "Tap again to confirm";
    resetAllArmed = setTimeout(function() { resetAllArmed = null; btn.textContent = "Reset all to defaults"; }, 3000);
    return;
  }
  clearTimeout(resetAllArmed); resetAllArmed = null;
  btn.textContent = "Reset all to defaults";
  saveParamOverrides({});
  for (var i = 0; i < PARAMS.length; i++) paramApply(PARAMS[i], PARAMS[i].def);
  renderParams();
  paramStatus("All parameters reset \u2713", false);
}
document.getElementById("params-filter").addEventListener("input", filterParams);
document.getElementById("params-table").addEventListener("input", function(e) {
  var inp = e.target.closest("input,select");
  if (!inp) return;
  var id = inp.getAttribute("data-id");
  clearTimeout(paramTimers[id]);
  paramTimers[id] = setTimeout(function() { commitParam(id, inp); }, 700);
});
document.getElementById("params-table").addEventListener("change", function(e) {
  var inp = e.target.closest("input,select");
  if (inp) commitParam(inp.getAttribute("data-id"), inp);
});
document.getElementById("params-table").addEventListener("click", function(e) {
  var b = e.target.closest(".p-reset");
  if (b) resetParam(b.getAttribute("data-id"));
});
var DEFAULT_WS = SERVER.sipWsUrl;
var settings = loadSettings();
var accounts = loadAccounts();
var activeAccountId = localStorage.getItem("vb_activeAccount") || "";
var favourites = loadFavourites();

function loadFavourites() {
  try {
    var raw = localStorage.getItem("vb_favourites");
    if (raw) { var a = JSON.parse(raw); if (Array.isArray(a)) return a; }
  } catch (e) {}
  return [];
}
function persistFavourites() {
  try { localStorage.setItem("vb_favourites", JSON.stringify(favourites)); } catch (e) {}
  try {
    fetch(API + "/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ favourites: JSON.stringify(favourites) })
    });
  } catch (e) {}
}
function isFav(id) { id = String(id); for (var i = 0; i < favourites.length; i++) if (String(favourites[i].id) === id) return true; return false; }
function toggleFav(c) {
  var id = c && c.id != null ? String(c.id) : null;
  if (id == null) return;
  if (isFav(id)) { favourites = favourites.filter(function(x) { return String(x.id) !== id; }); }
  else { favourites.push({ id: id, name: c.name || "", num: c.mobile || c.phone || "" }); }
  persistFavourites();
}

function defaultAccounts() {
  return [
    { id: "default", name: "My extension", username: "", password: "", server: DEFAULT_WS, transport: "wss", domain: SERVER.sipDomain, callerId: SERVER.callerId }
  ];
}
function loadAccounts() {
  try {
    var raw = localStorage.getItem("vb_accounts");
    if (raw) { var a = JSON.parse(raw); if (Array.isArray(a) && a.length) return a; }
  } catch (e) {}
  return defaultAccounts();
}
function activeAccount() {
  if (activeAccountId) {
    for (var i = 0; i < accounts.length; i++) if (accounts[i].id === activeAccountId) return accounts[i];
  }
  return accounts[0] || null;
}
function persistAccounts() {
  // Deliberately local-only (localStorage), never synced to the shared
  // server-side settings row: two devices are meant to run different SIP
  // identities (e.g. desktop on 201, phone on 202) at the same time. That
  // used to push here too, so whichever device saved last would silently
  // overwrite what every other device loads on its next boot() \u2014 causing
  // exactly the kind of duplicate/flapping registration that made a single
  // decline look like it needed a second one.
  try {
    localStorage.setItem("vb_accounts", JSON.stringify(accounts));
    localStorage.setItem("vb_activeAccount", activeAccountId);
  } catch (e) {}
}

function loadSettings() {
  try {
    return {
      devMode: localStorage.getItem("vb_devMode") === "1",
      quickText: localStorage.getItem("vb_quickText") || ""
    };
  } catch (e) { return { devMode: false, quickText: "" }; }
}
function saveSettings() {
  try {
    localStorage.setItem("vb_devMode", settings.devMode ? "1" : "0");
    localStorage.setItem("vb_quickText", settings.quickText || "");
  } catch (e) {}
  try {
    fetch(API + "/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ devMode: settings.devMode ? "1" : "0", quickText: settings.quickText || "" })
    });
  } catch (e) {}
}

// Load sip.js lazily so the page renders even if the CDN is slow/unreachable.
// Self-hosted on the Worker (/sip.min.js); falls back to jsdelivr if needed.
function loadSipJs() {
  return new Promise(function(resolve, reject) {
    if (typeof SIP !== "undefined") { resolve(); return; }
    var s = document.createElement("script");
    s.src = API + "/sip.min.js";
    s.onload = function() { resolve(); };
    s.onerror = function() {
      var s2 = document.createElement("script");
      s2.src = "https://cdn.jsdelivr.net/npm/sip.js@0.16.0/dist/sip.min.js";
      s2.onload = function() { resolve(); };
      s2.onerror = function() { reject(new Error("sip.js CDN failed")); };
      document.head.appendChild(s2);
    };
    document.head.appendChild(s);
    setTimeout(function() { if (typeof SIP === "undefined") reject(new Error("sip.js load timeout")); }, PV.sipLoadTimeoutMs);
  });
}

// \u2500\u2500 TinyMCE rich text (call notes + email compose) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Open-source (GPL) build from jsDelivr \u2014 no API key, no domain nag.
// Loaded lazily on first use.
var tinyMceLoadPromise = null;
function loadTinyMce() {
  if (typeof tinymce !== "undefined") return Promise.resolve();
  if (!tinyMceLoadPromise) {
    tinyMceLoadPromise = new Promise(function(resolve, reject) {
      var s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/tinymce@6/tinymce.min.js";
      s.onload = function() { resolve(); };
      s.onerror = function() { reject(new Error("tinymce load failed")); };
      document.head.appendChild(s);
    });
  }
  return tinyMceLoadPromise;
}

var tinyReady = { "call-notes": false, "comp-body": false };

function initCallNotesEditor() {
  if (tinyReady["call-notes"]) return;
  tinyReady["call-notes"] = true;
  tinymce.init({
    target: document.getElementById("call-notes"),
    menubar: false,
    statusbar: false,
    plugins: "lists link table code fullscreen autolink",
    toolbar: "undo redo | blocks | bold italic underline | forecolor backcolor | bullist numlist | link table | blockquote | removeformat | code fullscreen",
    height: 180,
    branding: false,
    skin: "oxide-dark",
    content_css: "dark",
    setup: function(editor) { editor.on("input change undo redo", scheduleCallSave); }
  });
}
// Plain-textarea fallback (TinyMCE failed to load) still autosaves on input.
document.getElementById("call-notes").addEventListener("input", function() { scheduleCallSave(); });

function initComposeEditor() {
  var el = document.getElementById("comp-body");
  if (tinyReady["comp-body"]) { tinymce.get("comp-body").setContent(el.value); return; }
  tinyReady["comp-body"] = true;
  tinymce.init({
    target: el,
    menubar: false,
    statusbar: false,
    plugins: "lists link table code fullscreen autolink",
    toolbar: "undo redo | blocks | bold italic underline strikethrough | forecolor backcolor | bullist numlist | link table | blockquote | removeformat | code fullscreen",
    height: 320,
    branding: false,
    skin: "oxide-dark",
    content_css: "dark"
  });
}

// \u2500\u2500 softphone runtime state \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

var sipUA, sipSession, currentCall, heldSession, muted = false, onHold = false;
var regTimer = null, REG_TIMEOUT_MS = 8000;

// \u2500\u2500 audio unlock (autoplay policy) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Chrome keeps a page silent until it has been clicked, and a call can
// arrive on a freshly loaded, untouched tab. So one AudioContext is created
// up front, resumed by the first click/key press, and reused for every ring;
// while it's still locked a pill asks for that click.
var sharedAudioCtx = null;
function sharedAudio() {
  if (!sharedAudioCtx) {
    try { sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
    sharedAudioCtx.onstatechange = updateAudioHint;
  }
  return sharedAudioCtx;
}
function unlockAudio() {
  var ctx = sharedAudio();
  if (ctx && ctx.state !== "running") ctx.resume().then(updateAudioHint).catch(function() {});
  askCallNotifications();
}
document.addEventListener("pointerdown", unlockAudio, true);
document.addEventListener("keydown", unlockAudio, true);
function updateAudioHint() {
  var el = document.getElementById("audio-hint");
  if (!el) {
    el = document.createElement("div");
    el.id = "audio-hint";
    el.className = "hidden";
    el.textContent = "\u{1F507} Click anywhere to enable call ringing";
    document.body.appendChild(el);
  }
  var ctx = sharedAudio();
  el.classList.toggle("hidden", settings.devMode || !ctx || ctx.state === "running");
}

// \u2500\u2500 desktop notification for incoming calls (web only) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Shown when the tab isn't in front, so a call is visible with the browser
// minimised or on another tab. The native app has its own (FCM) notification.
var callNotif = null, notifAsked = false;
function callNotificationsSupported() { return ("Notification" in window) && !nativePush(); }
function askCallNotifications() {
  if (notifAsked || !callNotificationsSupported() || Notification.permission !== "default") return;
  notifAsked = true;
  try { Notification.requestPermission(); } catch (e) {}
}
function showCallNotification(who) {
  closeCallNotification();
  if (!callNotificationsSupported() || Notification.permission !== "granted") return;
  if (!document.hidden && document.hasFocus()) return;
  try {
    callNotif = new Notification("Incoming call", { body: who || "Unknown caller", tag: "vb-incoming-call", requireInteraction: true });
    callNotif.onclick = function() { window.focus(); closeCallNotification(); };
  } catch (e) { callNotif = null; }
}
function closeCallNotification() {
  if (callNotif) { try { callNotif.close(); } catch (e) {} callNotif = null; }
}

// \u2500\u2500 incoming-call ringtone (dual-tone, 1s on / 3s off, looped) \u2500
// Vibration runs alongside the tone, not instead of it \u2014 it's a fallback
// for when audio is blocked by autoplay policy (Chrome/Android; iOS Safari
// has never implemented the Vibration API at all, and desktop has no
// hardware to vibrate), not a guaranteed workaround for it: browsers apply
// the same "needs a recent user gesture" restriction to vibrate() as they
// do to audio autoplay, so on a completely untouched tab neither may fire.
// Each ring hangs off ringGain, so stopping cuts off a tone mid-beep without
// closing the shared context.
var ringGain = null, ringTimer = null;
function startRingtone() {
  stopRingtone();
  var ctx = sharedAudio();
  if (ctx) {
    if (ctx.state !== "running") ctx.resume().catch(function() {});
    ringGain = ctx.createGain();
    ringGain.connect(ctx.destination);
  }
  ringCycle();
}
function ringCycle() {
  var ctx = sharedAudioCtx;
  if (ctx && ringGain) {
    var t0 = ctx.currentTime;
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, t0);
    gain.gain.exponentialRampToValueAtTime(0.2, t0 + 0.02);
    gain.gain.setValueAtTime(0.2, t0 + 0.9);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 1);
    gain.connect(ringGain);
    var osc1 = ctx.createOscillator(); osc1.type = "sine"; osc1.frequency.value = 440;
    var osc2 = ctx.createOscillator(); osc2.type = "sine"; osc2.frequency.value = 480;
    osc1.connect(gain); osc2.connect(gain);
    osc1.start(t0); osc2.start(t0);
    osc1.stop(t0 + 1); osc2.stop(t0 + 1);
  }
  try { if (navigator.vibrate) navigator.vibrate([400, 200, 400]); } catch (e) {}
  ringTimer = setTimeout(ringCycle, PV.ringIntervalMs);
}
function stopRingtone() {
  if (ringTimer) { clearTimeout(ringTimer); ringTimer = null; }
  if (ringGain) { try { ringGain.disconnect(); } catch (e) {} ringGain = null; }
  closeCallNotification();
  try { if (navigator.vibrate) navigator.vibrate(0); } catch (e) {}
}

// \u2500\u2500 outgoing ringback (UK-style 400+450Hz double burst) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Only used when the far end says "180 Ringing" without sending early-media
// audio (SDP) of its own \u2014 if the carrier does send ringback in-band, that
// plays through the remote-audio element instead and this stays silent.
var rbCtx = null, rbTimer = null;
function startRingback() {
  if (rbCtx) return;
  try { rbCtx = new (window.AudioContext || window.webkitAudioContext)(); rbCtx.resume().catch(function() {}); } catch (e) { rbCtx = null; return; }
  rbCycle();
}
function rbCycle() {
  if (!rbCtx) return;
  var t0 = rbCtx.currentTime;
  var gain = rbCtx.createGain();
  gain.gain.value = 0.1;
  gain.connect(rbCtx.destination);
  [0, 0.6].forEach(function(off) {
    [400, 450].forEach(function(f) {
      var o = rbCtx.createOscillator(); o.type = "sine"; o.frequency.value = f;
      o.connect(gain); o.start(t0 + off); o.stop(t0 + off + 0.4);
    });
  });
  rbTimer = setTimeout(rbCycle, PV.ringbackIntervalMs);
}
function stopRingback() {
  if (rbTimer) { clearTimeout(rbTimer); rbTimer = null; }
  if (rbCtx) { try { rbCtx.close(); } catch (e) {} rbCtx = null; }
}

// \u2500\u2500 view switching \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// The big green button. From another tab it lands on History (the dial view)
// with the keypad open. There: a typed number gets dialled; otherwise it
// opens/closes the keypad under the list (open by default). During a call it
// hangs up.
var dialKeypadOpen = true;
function onDialView() { return !document.getElementById("view-dial").classList.contains("hidden"); }
function navDialAction() {
  if (currentCall) { hangup(); return; }
  if (!onDialView()) { switchView("dial"); dialKeypadOpen = true; updateDialBottomVisibility(); return; }
  if (document.getElementById("dial-input").value.trim() && !historyTxSearch) { dialAction(); return; }
  dialKeypadOpen = !dialKeypadOpen;
  updateDialBottomVisibility();
}
document.addEventListener("DOMContentLoaded", updateDialBottomVisibility);

function switchView(name) {
  if (name === "history") name = "dial"; // History and the dialpad are one screen now
  var views = document.querySelectorAll(".view");
  for (var i = 0; i < views.length; i++) views[i].classList.add("hidden");
  document.getElementById("view-" + name).classList.remove("hidden");
  var btns = document.querySelectorAll(".menu-btn");
  for (var j = 0; j < btns.length; j++) btns[j].classList.remove("active");
  var b = document.querySelector('.menu-btn[data-view="' + name + '"]');
  if (b) b.classList.add("active");
  if (name === "dial") { loadHistory(); loadT9Corpus(); }
  if (name === "favourites") renderFavourites();
  if (name === "contacts") loadContacts(document.getElementById("contact-search").value);
  if (name === "messages") loadMessages();
}

// \u2500\u2500 dialpad input \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
var pressTimer = null, longPressFired = false;

function insertChar(c) {
  var inp = document.getElementById("dial-input");
  inp.value += c;
  onDialInput();
}

function backspace() {
  var inp = document.getElementById("dial-input");
  inp.value = inp.value.slice(0, -1);
  onDialInput();
}

function keyDown(d) {
  if (inCall()) { padTone(d); return; }
  if (d === "0") { longPressFired = false; pressTimer = setTimeout(function() { longPressFired = true; insertChar("+"); }, PV.longPressPlusMs); return; }
  insertChar(d);
}
function keyUp(d) {
  if (inCall()) return;
  if (d === "0") { clearTimeout(pressTimer); if (!longPressFired) insertChar("0"); }
}

var pad = document.getElementById("dialpad");
pad.addEventListener("pointerdown", function(e) {
  var k = e.target.closest(".key"); if (!k) return; keyDown(k.getAttribute("data-d"));
});
pad.addEventListener("pointerup", function(e) {
  var k = e.target.closest(".key"); if (!k) return; keyUp(k.getAttribute("data-d"));
});

// \u2500\u2500 in-call DTMF + quick text \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
var qtBuffer = "", qtTimer = null;

function inCall() { return currentCall && currentCall.state === "active"; }

function padTone(d) {
  if (d === "#") {
    var p = document.getElementById("qt-panel");
    if (!p.classList.contains("hidden")) closeQuickText(); else openQuickText();
    return;
  }
  // While quick-text panel is open, digits select a #nn code instead of DTMF.
  var panel = document.getElementById("qt-panel");
  if (!panel.classList.contains("hidden") && /^[0-9]$/.test(d)) { qtBuffer += d; tryQuickText(); return; }
  sendDtmf(d);
}

function sendDtmf(tone) {
  if (!sipSession) return;
  try {
    var sdh = sipSession.sessionDescriptionHandler;
    if (sdh && sdh.sendDtmf) { sdh.sendDtmf(tone); return; }
  } catch (e) {}
  try { if (sipSession.sendDTMF) sipSession.sendDTMF(tone); } catch (e) {}
}

// Keypad tab: unlike the dial keypad, # here is a real tone (IVRs need it),
// not the quick-text shortcut.
function sendDtmfFromPad(d) {
  if (!inCall()) return;
  sendDtmf(d);
  var el = document.getElementById("dtmf-sent");
  el.textContent = (el.textContent + d).slice(-40);
}
document.getElementById("dtmf-pad").addEventListener("pointerdown", function(e) {
  var k = e.target.closest(".key"); if (!k) return;
  e.preventDefault();
  sendDtmfFromPad(k.getAttribute("data-d"));
});

function quickTexts() {
  var out = [];
  var lines = String(settings.quickText || "").split(String.fromCharCode(10));
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line || line.charAt(0) !== "#") continue;
    var rest = line.slice(1);
    var j = 0;
    while (j < rest.length && j < 2 && rest.charAt(j) >= "0" && rest.charAt(j) <= "9") j++;
    if (j === 0) continue;
    var code = rest.slice(0, j);
    var text = rest.slice(j).trim();
    // strip surrounding ** markers (e.g. "#1 **Order received**")
    if (text.indexOf("**") === 0) text = text.slice(2);
    if (text.length >= 2 && text.lastIndexOf("**") === text.length - 2) text = text.slice(0, -2);
    text = text.trim();
    if (text) out.push({ code: code, text: text });
  }
  return out;
}

function renderQuickText() {
  var el = document.getElementById("qt-list");
  var items = quickTexts();
  if (!items.length) { el.innerHTML = '<div class="qt-row"><span class="txt">No quick text set \u2014 add lines like <b>#1 **Order received**</b> in Settings.</span></div>'; return; }
  el.innerHTML = items.map(function(q) {
    return '<div class="qt-row" data-code="' + esc(q.code) + '" data-text="' + esc(q.text) + '"><span class="code">#' + esc(q.code) + '</span><span class="txt">' + esc(q.text) + '</span></div>';
  }).join("");
}

function openQuickText() {
  qtBuffer = "";
  renderQuickText();
  var panel = document.getElementById("qt-panel");
  panel.classList.remove("hidden");
  // auto-close after a few seconds if the user doesn't pick a code
  clearTimeout(qtTimer);
  qtTimer = setTimeout(function() { panel.classList.add("hidden"); qtBuffer = ""; }, PV.quickTextTimeoutMs);
}

function tryQuickText() {
  var items = quickTexts();
  var exact = null, prefix = false;
  for (var i = 0; i < items.length; i++) {
    if (items[i].code === qtBuffer) { exact = items[i]; break; }
    if (items[i].code.indexOf(qtBuffer) === 0) prefix = true;
  }
  if (exact) { addNoteLine(exact.text); closeQuickText(); return; }
  if (qtBuffer.length >= 2 || !prefix) { closeQuickText(); }
}

function closeQuickText() {
  clearTimeout(qtTimer);
  document.getElementById("qt-panel").classList.add("hidden");
  qtBuffer = "";
}

// Tap a quick-text row to insert it directly.
document.getElementById("qt-list").addEventListener("click", function(e) {
  var row = e.target.closest(".qt-row");
  if (!row) return;
  var text = row.getAttribute("data-text");
  if (text) addNoteLine(text);
  closeQuickText();
});

// \u2500\u2500 call notes \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function addNoteLine(text) {
  var ed = (typeof tinymce !== "undefined") ? tinymce.get("call-notes") : null;
  if (ed) {
    var cur = ed.getContent();
    ed.setContent(cur ? (cur + "<br>" + esc(text)) : esc(text));
  } else {
    var ta = document.getElementById("call-notes");
    var cur = ta.value;
    ta.value = cur ? (cur + String.fromCharCode(10) + text) : text;
    ta.scrollTop = ta.scrollHeight;
  }
}
// Jot's text goes into the notes as one "From Jot" block, replaced (not
// duplicated) by later conversions, removed when the page is emptied. Works on the TinyMCE editor, its plain
// textarea fallback, or (neither mounted yet) the stored html via setHtml.
var JOT_NOTES_HEAD = "\u270D\uFE0F From Jot";
function jotNotesBlock(text) {
  return '<div data-jot-text="1"><p><strong>' + JOT_NOTES_HEAD + '</strong></p>'
    + text.split(NL).map(function(l) { return '<p>' + (esc(l) || "&nbsp;") + '</p>'; }).join("") + '</div>';
}
function upsertJotNotesHtml(html, text) {
  var box = document.createElement("div");
  box.innerHTML = html || "";
  var old = box.querySelector("[data-jot-text]");
  if (!text) { if (old) old.remove(); return box.innerHTML; }
  if (old) { old.outerHTML = jotNotesBlock(text); return box.innerHTML; }
  return (html || "") + jotNotesBlock(text);
}
function upsertJotNotesPlain(value, text) {
  var head = JOT_NOTES_HEAD + ":";
  var i = value.indexOf(head);
  var block = head + NL + text;
  if (i >= 0) {
    var end = value.indexOf(NL + NL, i);
    if (!text) return (value.slice(0, i) + (end >= 0 ? value.slice(end + 2) : "")).trim();
    return value.slice(0, i) + block + (end >= 0 ? value.slice(end) : "");
  }
  if (!text) return value;
  return value ? value + NL + NL + block : block;
}
// The From Jot block's text, from the editor, its textarea, or stored html.
function getJotTextFromNotes(editorId, html) {
  var ed = (typeof tinymce !== "undefined") ? tinymce.get(editorId) : null;
  if (ed && !ed.initialized) ed = null;
  var ta = document.getElementById(editorId);
  if (!ed && html.indexOf("data-jot-text") < 0 && ta) {
    var head = JOT_NOTES_HEAD + ":", i = ta.value.indexOf(head);
    if (i < 0) return "";
    var end = ta.value.indexOf(NL + NL, i);
    return ta.value.slice(i + head.length + 1, end >= 0 ? end : undefined);
  }
  var box = document.createElement("div");
  box.innerHTML = ed ? ed.getContent() : html;
  var block = box.querySelector("[data-jot-text]");
  if (!block) return "";
  var ps = block.querySelectorAll("p"), lines = [];
  for (var k = 1; k < ps.length; k++) lines.push(ps[k].textContent.split(String.fromCharCode(160)).join(" ").trim());
  return lines.join(NL);
}
function putJotTextInNotes(editorId, text, getHtml, setHtml) {
  var ed = (typeof tinymce !== "undefined") ? tinymce.get(editorId) : null;
  if (ed && !ed.initialized) ed = null;
  var ta = document.getElementById(editorId);
  if (ed) { ed.setContent(upsertJotNotesHtml(ed.getContent(), text)); return; }
  // No editor yet: keep the stored html current too, so an editor that
  // finishes loading later starts from it.
  if (setHtml) setHtml(upsertJotNotesHtml(getHtml(), text));
  if (ta) ta.value = upsertJotNotesPlain(ta.value, text);
}
// \u2500\u2500 in-call panel: caller name + tabs \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
var activeCpTab = "notes";
var currentCallPartner = null;

function showCallPanel(show) {
  document.getElementById("call-panel").classList.toggle("hidden", !show);
  if (!show) { closeQuickText(); currentCallPartner = null; document.getElementById("dtmf-sent").textContent = ""; return; }
  if (activeCpTab === "keypad" && !inCall()) activeCpTab = "notes";
  updateCallPanelCaller();
  switchCallTab(activeCpTab || "notes");
}

function updateCallPanelCaller() {
  var el = document.getElementById("cp-caller-name");
  if (!currentCall) return;
  el.textContent = currentCall.remote || "Unknown caller";
  currentCallPartner = null;
  fetch(API + "/caller-lookup?number=" + encodeURIComponent(currentCall.remote)).then(function(r){return r.json();}).then(function(d){
    if (!currentCall) return;
    if (d.found) {
      currentCallPartner = { id: d.id, name: d.name };
      el.textContent = d.name + " \u2014 " + currentCall.remote;
      if (activeCpTab === "sales") loadQuotationsTab();
      if (activeCpTab === "emails") loadEmailsTab();
    }
  }).catch(function(){});
}

function switchCallTab(tab) {
  activeCpTab = tab;
  var tabs = document.querySelectorAll(".cp-tab");
  for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle("active", tabs[i].getAttribute("data-tab") === tab);
  var panes = document.querySelectorAll(".cp-pane");
  for (var j = 0; j < panes.length; j++) panes[j].classList.toggle("hidden", panes[j].id !== "cp-pane-" + tab);
  if (tab === "notes" && !tinyReady["call-notes"]) loadTinyMce().then(initCallNotesEditor).catch(function() {});
  if (tab === "history") loadCallHistoryTab();
  if (tab === "sales") loadQuotationsTab();
  if (tab === "emails") loadEmailsTab();
  if (tab === "jot") initJotEditor();
  document.getElementById("banner-keypad").classList.toggle("active", tab === "keypad");
}

// \u2500\u2500 Jot: handwriting canvas (perfect-freehand, vendored inline \u2014 ~5KB, no
// network request, no framework) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Vendored from perfect-freehand@1.2.3 (MIT, github.com/steveruizok/perfect-freehand).
var PerfectFreehand=(()=>{var Q=Object.defineProperty;var zn=Object.getOwnPropertyDescriptor;var An=Object.getOwnPropertyNames;var bn=Object.prototype.hasOwnProperty;var In=(n,t)=>{for(var r in t)Q(n,r,{get:t[r],enumerable:!0})},Tn=(n,t,r,u)=>{if(t&&typeof t=="object"||typeof t=="function")for(let i of An(t))!bn.call(n,i)&&i!==r&&Q(n,i,{get:()=>t[i],enumerable:!(u=zn(t,i))||u.enumerable});return n};var jn=n=>Tn(Q({},"__esModule",{value:!0}),n);var Nn={};In(Nn,{default:()=>Kn,getStroke:()=>yn,getStrokeOutlinePoints:()=>dn,getStrokePoints:()=>xn});var{PI:wn}=Math,F=wn+1e-4,rn=.5,un=[1,1];function on(n,t,r,u=i=>i){return n*u(.5-t*(.5-r))}var{min:U}=Math;function gn(n,t,r){let u=U(1,t/r);return U(1,n+(U(1,1-u)-n)*(u*.275))}function Fn(n){return[-n[0],-n[1]]}function g(n,t){return[n[0]+t[0],n[1]+t[1]]}function en(n,t,r){return n[0]=t[0]+r[0],n[1]=t[1]+r[1],n}function L(n,t){return[n[0]-t[0],n[1]-t[1]]}function X(n,t,r){return n[0]=t[0]-r[0],n[1]=t[1]-r[1],n}function y(n,t){return[n[0]*t,n[1]*t]}function V(n,t,r){return n[0]=t[0]*r,n[1]=t[1]*r,n}function On(n,t){return[n[0]/t,n[1]/t]}function vn(n){return[n[1],-n[0]]}function W(n,t){let r=t[0];return n[0]=t[1],n[1]=-r,n}function sn(n,t){return n[0]*t[0]+n[1]*t[1]}function Rn(n,t){return n[0]===t[0]&&n[1]===t[1]}function _n(n){return Math.hypot(n[0],n[1])}function cn(n,t){let r=n[0]-t[0],u=n[1]-t[1];return r*r+u*u}function Mn(n){return On(n,_n(n))}function qn(n,t){return Math.hypot(n[1]-t[1],n[0]-t[0])}function Y(n,t,r){let u=Math.sin(r),i=Math.cos(r),e=n[0]-t[0],o=n[1]-t[1],c=e*i-o*u,v=e*u+o*i;return[c+t[0],v+t[1]]}function ln(n,t,r,u){let i=Math.sin(u),e=Math.cos(u),o=t[0]-r[0],c=t[1]-r[1],v=o*e-c*i,P=o*i+c*e;return n[0]=v+r[0],n[1]=P+r[1],n}function fn(n,t,r){return g(n,y(L(t,n),r))}function Bn(n,t,r,u){let i=r[0]-t[0],e=r[1]-t[1];return n[0]=t[0]+i*u,n[1]=t[1]+e*u,n}function mn(n,t,r){return g(n,y(t,r))}var l=[0,0],d=[0,0],x=[0,0];function Cn(n,t){let r=mn(n,Mn(vn(L(n,g(n,[1,1])))),-t),u=[],i=1/13;for(let e=i;e<=1;e+=i)u.push(Y(r,n,F*2*e));return u}function Dn(n,t,r){let u=[],i=1/r;for(let e=i;e<=1;e+=i)u.push(Y(t,n,F*e));return u}function En(n,t,r){let u=L(t,r),i=y(u,.5),e=y(u,.51);return[L(n,i),L(n,e),g(n,e),g(n,i)]}function Gn(n,t,r,u){let i=[],e=mn(n,t,r),o=1/u;for(let c=o;c<1;c+=o)i.push(Y(e,n,F*3*c));return i}function Hn(n,t,r){return[g(n,y(t,r)),g(n,y(t,r*.99)),L(n,y(t,r*.99)),L(n,y(t,r))]}function hn(n,t,r){return n===!1||n===void 0?0:n===!0?Math.max(t,r):n}function Jn(n,t,r){return n.slice(0,10).reduce((u,i)=>{let e=i.pressure;return t&&(e=gn(u,i.distance,r)),(u+e)/2},n[0].pressure)}function dn(n,t={}){let{size:r=16,smoothing:u=.5,thinning:i=.5,simulatePressure:e=!0,easing:o=s=>s,start:c={},end:v={},last:P=!1}=t,{cap:M=!0,easing:O=s=>s*(2-s)}=c,{cap:f=!0,easing:h=s=>--s*s*s+1}=v;if(n.length===0||r<=0)return[];let p=n[n.length-1].runningLength,A=hn(c.taper,r,p),b=hn(v.taper,r,p),Z=(r*u)**2,I=[],z=[],$=Jn(n,e,r),a=on(r,i,n[n.length-1].pressure,o),C,D=n[0].vector,T=n[0].point,R=T,S=T,k=R,E=!1;for(let s=0;s<n.length;s++){let{pressure:K}=n[s],{point:m,vector:j,distance:Ln,runningLength:w}=n[s],q=s===n.length-1;if(!q&&p-w<3)continue;i?(e&&(K=gn($,Ln,r)),a=on(r,i,K,o)):a=r/2,C===void 0&&(C=a);let Pn=w<A?O(w/A):1,Sn=p-w<b?h((p-w)/b):1;a=Math.max(.01,a*Math.min(Pn,Sn));let nn=(q?n[s]:n[s+1]).vector,N=q?1:sn(j,nn),kn=sn(j,D)<0&&!E,tn=N!==null&&N<0;if(kn||tn){W(l,D),V(l,l,a);for(let B=0;B<=1;B+=.07692307692307693)X(d,m,l),ln(d,d,m,F*B),S=[d[0],d[1]],I.push(S),en(x,m,l),ln(x,x,m,F*-B),k=[x[0],x[1]],z.push(k);T=S,R=k,tn&&(E=!0);continue}if(E=!1,q){W(l,j),V(l,l,a),I.push(L(m,l)),z.push(g(m,l));continue}Bn(l,nn,j,N),W(l,l),V(l,l,a),X(d,m,l),S=[d[0],d[1]],(s<=1||cn(T,S)>Z)&&(I.push(S),T=S),en(x,m,l),k=[x[0],x[1]],(s<=1||cn(R,k)>Z)&&(z.push(k),R=k),$=K,D=j}let G=[n[0].point[0],n[0].point[1]],H=n.length>1?[n[n.length-1].point[0],n[n.length-1].point[1]]:g(n[0].point,[1,1]),J=[],_=[];if(n.length===1){if(!(A||b)||P)return Cn(G,C||a)}else{A||b&&n.length===1||(M?J.push(...Dn(G,z[0],13)):J.push(...En(G,I[0],z[0])));let s=vn(Fn(n[n.length-1].vector));b||A&&n.length===1?_.push(H):f?_.push(...Gn(H,s,a,29)):_.push(...Hn(H,s,a))}return I.concat(_,z.reverse(),J)}var an=[0,0];function pn(n){return n!=null&&n>=0}function xn(n,t={}){let{streamline:r=.5,size:u=16,last:i=!1}=t;if(n.length===0)return[];let e=.15+(1-r)*.85,o=Array.isArray(n[0])?n:n.map(({x:f,y:h,pressure:p=rn})=>[f,h,p]);if(o.length===2){let f=o[1];o=o.slice(0,-1);for(let h=1;h<5;h++)o.push(fn(o[0],f,h/4))}o.length===1&&(o=[...o,[...g(o[0],un),...o[0].slice(2)]]);let c=[{point:[o[0][0],o[0][1]],pressure:pn(o[0][2])?o[0][2]:.25,vector:[...un],distance:0,runningLength:0}],v=!1,P=0,M=c[0],O=o.length-1;for(let f=1;f<o.length;f++){let h=i&&f===O?[o[f][0],o[f][1]]:fn(M.point,o[f],e);if(Rn(M.point,h))continue;let p=qn(h,M.point);if(P+=p,f<O&&!v){if(P<u)continue;v=!0}X(an,M.point,h),M={point:h,pressure:pn(o[f][2])?o[f][2]:rn,vector:Mn(an),distance:p,runningLength:P},c.push(M)}return c[0].vector=c[1]?.vector||[0,0],c}function yn(n,t={}){return dn(xn(n,t),t)}var Kn=yn;return jn(Nn);})();

// \u2500\u2500 Jot engine: Jot (one auto-growing, word-wrapping page of handwriting,
// read into the notes) / Draw (freehand pencil ink) / Erase, undo, zoom, save/load \u2500\u2500
var JOT_INK = "#e9ecef";
var JOT_STROKE_OPTS = { size: 5, thinning: 0.6, smoothing: 0.5, streamline: 0.5 };
// End-of-word detection: a stroke on a new line (see jtOnNewLine) is always a
// new word; otherwise a new stroke starts a new word only when BOTH
//   pause since the previous stroke lifted >= PV.jotNewWordPauseMs
//   AND gap (on screen, mm) between the new stroke and the word so far >= PV.jotNewWordGapMm.
// Anything else joins the current word. Separately, a word settles (is laid
// out into its box) after PV.jotWordSettleMs with no new stroke; that is
// final \u2014 the raw ink moves into the text flow, so there is nothing left to
// measure a gap against.
var JOT_PX_PER_MM = JOT_DEFAULT_PX_PER_MM;  // CSS px per real mm
function jtStartsNewWord(pauseMs, gapMm) {
  return pauseMs >= PV.jotNewWordPauseMs && gapMm >= PV.jotNewWordGapMm;
}
// Gap (logical px) between the word so far and a new stroke, measured along
// the writing direction: the sideways gap, or how far the stroke sits wholly
// BELOW the word (the next line). Space above the word doesn't count, so a
// T's crossbar, an i/j dot or an accent written above the letter stays part
// of the word however high it floats, as long as it overlaps it sideways.
function jtWordGap(word, stroke) {
  var dx = Math.max(0, word.minX - stroke.maxX, stroke.minX - word.maxX);
  var below = Math.max(0, stroke.minY - word.maxY);
  return Math.max(dx, below);
}
// Writing on the next line down always starts a new word, however quickly:
// the stroke's middle sits at least PV.jotNewLineMm (on screen) below the
// bottom of the word so far. Descenders and a T's crossbar never get there.
function jtOnNewLine(word, stroke, scale) {
  var midY = (stroke.minY + stroke.maxY) / 2;
  return (midY - word.maxY) * scale / JOT_PX_PER_MM >= PV.jotNewLineMm;
}
// Cap the leveling rotation: a lone near-vertical stroke (e.g. a single "l")
// has no horizontal spread, so the best-fit line through it is ~90\xB0 and
// would otherwise get "leveled" straight into a horizontal line.
var JOT_MAX_TILT = 30 * Math.PI / 180;
var JOT_LINE_HEIGHT = 42;
var JOT_WORD_HEIGHT = 26;     // normalized word height (logical px)
var JOT_WORD_GAP = 10;
var JOT_PARA_MARGIN = 14;
var JOT_PARA_TOP = 32;
// A standalone tap (near-zero movement) reads as a period, not a letter \u2014
// left to the normal word-height scaling it would blow up into a blob
// (the height floor that scaling divides by is much bigger than a tap).
var JOT_DOT_MAX_RAW = 6;   // raw local px \u2014 a lone stroke this small or smaller is a tap
var JOT_DOT_SCALE = 0.5;   // fixed small render scale for a period
var JOT_DOT_WIDTH = 8;     // layout width reserved for a period
// Jot-mode commands: a single continuous stroke with one corner \u2014 two straight,
// roughly perpendicular legs (see jtClassifyGesture). The pen's path decides it,
// in order: e.g. "left-down" is draw leftward, turn, draw downward. Two paths
// are commands, chosen in Parameters (Jot: gestures):
//   Backspace  (default left-down)  undoes the in-progress word, or the last
//              committed action if nothing's in progress.
//   Return     (default down-left)  inserts a line break: the next word starts
//              on the next line, left-aligned.
// Each leg must be reasonably long and straight, so ordinary letters (which
// curve) are never mistaken for a command.
var JOT_GESTURE_MIN_LEN = 22;         // screen px \u2014 minimum net travel per leg (zoom-independent)
var JOT_GESTURE_STRAIGHTNESS = 0.7;   // net displacement / actual path length, per leg
var JOT_GESTURE_AXIS_DOMINANCE = 1.6; // one axis must outrun the other by this ratio, per leg
// The page box (one per Jot page) word-wraps at its width and grows down.
var JOT_BOX_MIN_WIDTH = 80;
var JOT_BOX_MIN_HEIGHT = JOT_PARA_TOP + JOT_LINE_HEIGHT;
var JOT_BOX_GAP = 10;        // space between handwriting boxes (a Return starts a new one)

function jtOutline(pts) { return PerfectFreehand.getStroke(pts, JOT_STROKE_OPTS); }
function jtFillOutline(ctx, outline) {
  if (!outline || outline.length < 3) return;
  ctx.beginPath();
  ctx.moveTo(outline[0][0], outline[0][1]);
  for (var i = 1; i < outline.length; i++) ctx.lineTo(outline[i][0], outline[i][1]);
  ctx.closePath();
  ctx.fill();
}
function jtBBox(pts) {
  var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (var i = 0; i < pts.length; i++) {
    var x = pts[i][0], y = pts[i][1];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
}
function jtBBoxUnion(a, b) {
  return { minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY) };
}
// Straight-line direction of one leg of a candidate gesture stroke \u2014 the
// dominant cardinal axis + sign of its net displacement \u2014 or null if it's
// too short/curved/diagonal to count as a deliberate straight leg.
function jtLegDir(pts, scale) {
  var p0 = pts[0], pN = pts[pts.length - 1];
  var dx = pN[0] - p0[0], dy = pN[1] - p0[1];
  var net = Math.hypot(dx, dy);
  if (net * (scale || 1) < JOT_GESTURE_MIN_LEN) return null;
  var pathLen = 0;
  for (var i = 1; i < pts.length; i++) pathLen += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  if (!pathLen || net / pathLen < JOT_GESTURE_STRAIGHTNESS) return null;
  var adx = Math.abs(dx), ady = Math.abs(dy);
  if (adx > ady * JOT_GESTURE_AXIS_DOMINANCE) return { axis: "x", sign: dx < 0 ? -1 : 1 };
  if (ady > adx * JOT_GESTURE_AXIS_DOMINANCE) return { axis: "y", sign: dy < 0 ? -1 : 1 };
  return null;
}
// The point of a stroke that deviates furthest from the straight line
// between its endpoints \u2014 the corner of an L-shaped gesture stroke.
function jtFindCorner(pts) {
  var p0 = pts[0], pN = pts[pts.length - 1];
  var cx = pN[0] - p0[0], cy = pN[1] - p0[1];
  var chordLen = Math.hypot(cx, cy) || 1;
  var ux = cx / chordLen, uy = cy / chordLen;
  var best = -1, bestDist = -1;
  for (var i = 1; i < pts.length - 1; i++) {
    var vx = pts[i][0] - p0[0], vy = pts[i][1] - p0[1];
    var proj = vx * ux + vy * uy;
    var perpx = vx - proj * ux, perpy = vy - proj * uy;
    var dist = Math.hypot(perpx, perpy);
    if (dist > bestDist) { bestDist = dist; best = i; }
  }
  return best;
}
// Classifies a single completed Jot-mode stroke as the "backspace" or
// "return" L-shaped command (see the constants above), or null if it's just
// ordinary handwriting.
function jtClassifyGesture(pts, scale) {
  if (pts.length < 3) return null;
  var corner = jtFindCorner(pts);
  if (corner < 1 || corner > pts.length - 2) return null;
  var leg1 = jtLegDir(pts.slice(0, corner + 1), scale);
  var leg2 = jtLegDir(pts.slice(corner), scale);
  if (!leg1 || !leg2 || leg1.axis === leg2.axis) return null;
  // The command is the pen's path: the first leg's direction, then the
  // second's ("left-down" = draw leftward, turn, draw downward). Order matters,
  // so the same two legs drawn the other way round can be a different command.
  // Which path is Backspace and which is Return is set in Parameters
  // (Jot: gestures); anything else, including a plain "L", is just ink.
  var code = jtDirName(leg1) + "-" + jtDirName(leg2);
  if (code === PV.jotGestureBackspace) return "backspace";
  if (code === PV.jotGestureReturn) return "return";
  return null;
}
function jtDirName(l) { return l.axis === "x" ? (l.sign < 0 ? "left" : "right") : (l.sign < 0 ? "up" : "down"); }
// Best-fit line through a whole written run's combined points -> rotation
// to level it, and the run's own centroid (mx,my) to rotate around.
function jtPCAFrame(pts) {
  var n = pts.length, mx = 0, my = 0;
  for (var i = 0; i < n; i++) { mx += pts[i][0]; my += pts[i][1]; }
  mx /= n; my /= n;
  var sxx = 0, syy = 0, sxy = 0;
  for (i = 0; i < n; i++) { var dx = pts[i][0] - mx, dy = pts[i][1] - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  var angle;
  // A run with little to no horizontal spread (e.g. a single vertical
  // stroke like "I" or "l") has no reliable tilt to measure \u2014 sxy is just
  // noise there, and atan2 turns that noise into an essentially random
  // +/-90 degree result. Rather than clamp that noise to +/-JOT_MAX_TILT
  // (still visibly wrong, and unstable in sign), treat it as untilted.
  if (Math.sqrt(sxx / n) < Math.sqrt(syy / n) * PV.jotUntiltedSpread) {
    angle = 0;
  } else {
    angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    // Handwriting is only ever leveled clockwise (or left untilted), never
    // counterclockwise \u2014 a negative (counterclockwise) result gets zeroed,
    // not mirrored, since mirroring would invent a tilt that was never there.
    angle = Math.min(0, angle);
    angle = Math.max(-JOT_MAX_TILT, angle);
  }
  return { mx: mx, my: my, angle: angle };
}
function jtToLocal(pt, frame) {
  var cos = Math.cos(-frame.angle), sin = Math.sin(-frame.angle);
  var dx = pt[0] - frame.mx, dy = pt[1] - frame.my;
  return [dx * cos - dy * sin, dx * sin + dy * cos];
}
// Lay out one word from its raw strokes \u2014 the strokes are never split again
// here; word boundaries are decided only by jtStartsNewWord (pause AND gap).
// The word's own extent decides its rotation and scale. "prevRotate"/
// "prevScale" are the previously-committed word's (or null), borrowed by a
// word of 1-2 strokes since that's too little ink for its own leveling/sizing
// estimate to be reliable.
function jtMakeWord(strokes, prevRotate, prevScale) {
  var allPts = [];
  for (var i = 0; i < strokes.length; i++) for (var j = 0; j < strokes[i].length; j++) allPts.push(strokes[i][j]);
  var frame = jtPCAFrame(allPts);
  function extent(angle) {
    var f = { mx: frame.mx, my: frame.my, angle: angle };
    var e = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    for (var k = 0; k < allPts.length; k++) {
      var lp = jtToLocal(allPts[k], f);
      if (lp[0] < e.minX) e.minX = lp[0]; if (lp[0] > e.maxX) e.maxX = lp[0];
      if (lp[1] < e.minY) e.minY = lp[1]; if (lp[1] > e.maxY) e.maxY = lp[1];
    }
    return e;
  }
  var own = extent(frame.angle);
  var ownH = Math.max(own.maxY - own.minY, PV.jotMinRunHeight);
  var isDot = strokes.length === 1 && (own.maxX - own.minX) <= JOT_DOT_MAX_RAW && (own.maxY - own.minY) <= JOT_DOT_MAX_RAW;
  var isShort = strokes.length <= 2;
  var useRotate = (isShort && typeof prevRotate === "number") ? prevRotate : frame.angle;
  var useScale = (isShort && typeof prevScale === "number") ? prevScale : Math.min(JOT_WORD_HEIGHT / ownH, PV.jotRunScaleMax);
  // Borrowing a different angle than the word was leveled at: recompute its
  // extent against that angle so the anchor matches the rendered rotation.
  var e = useRotate === frame.angle ? own : extent(useRotate);
  var cos2 = Math.cos(useRotate), sin2 = Math.sin(useRotate);
  return {
    rawStrokes: strokes,
    anchor: [e.minX * cos2 - e.maxY * sin2 + frame.mx, e.minX * sin2 + e.maxY * cos2 + frame.my],
    rotate: useRotate,
    scale: isDot ? JOT_DOT_SCALE : useScale,
    width: isDot ? JOT_DOT_WIDTH : Math.max(e.maxX - e.minX, PV.jotMinWordWidth) * useScale,
    height: JOT_WORD_HEIGHT,
    dot: isDot
  };
}

// notesText, if given, links the page's text to the call's notes:
// save(text) stores a conversion or edit, saved() returns what's there.
// The handwriting is read automatically (PV.jotAutoConvertMs after the last
// finished word) and saved into the notes; Aa shows/edits that text.
function createJot(hostEl, onChange, notesText) {
  hostEl.innerHTML = "";
  hostEl.classList.add("jt-wrap");

  var toolbar = document.createElement("div");
  toolbar.className = "jt-toolbar";
  toolbar.innerHTML =
    '<button class="jt-btn jt-mode active" data-mode="jot" title="Jot: handwriting, read into the notes">\u{1F58A}\uFE0F</button>' +
    '<button class="jt-btn jt-mode" data-mode="draw" title="Freehand drawing">\u270F\uFE0F</button>' +
    '<button class="jt-btn jt-mode" data-mode="erase" title="Erase">\u{1F9FD}</button>' +
    '<span class="jt-sep"></span>' +
    '<button class="jt-btn" data-act="undo" title="Undo">\u21B6</button>' +
    '<button class="jt-btn" data-act="zoomout" title="Zoom out">\u2212</button>' +
    '<button class="jt-btn jt-zoom-label" data-act="zoomreset" title="Reset zoom">100%</button>' +
    '<button class="jt-btn" data-act="zoomin" title="Zoom in">+</button>' +
    '<span class="jt-sep"></span>' +
    '<button class="jt-btn ghost" data-act="clear" title="Clear all">\u{1F5D1}</button>' +
    '<button class="jt-btn jt-totext" data-act="totext" title="Show / edit the text saved to Notes (tap again for the ink)">Aa</button>' +
    '<span class="jt-wordinfo" title="Last stroke: pause, gap from the word, and the decision"></span>' +
    '<span class="jt-convinfo"></span>';
  hostEl.appendChild(toolbar);
  var convInfo = toolbar.querySelector(".jt-convinfo");

  var canvasWrap = document.createElement("div");
  canvasWrap.className = "jt-canvas-wrap";
  var canvas = document.createElement("canvas");
  canvasWrap.appendChild(canvas);
  hostEl.appendChild(canvasWrap);
  var textView = document.createElement("div");
  textView.className = "jt-text hidden";
  hostEl.appendChild(textView);

  var ctx = canvas.getContext("2d");
  var dpr = window.devicePixelRatio || 1;
  // The canvas element always exactly fills its viewport (never grows with
  // content) \u2014 the document itself is unbounded, and "camera" below is the
  // window onto it. This keeps the canvas backing store viewport-sized
  // (cheap, no browser canvas-size limits) instead of trying to size a DOM
  // element to hold everything ever written.
  var viewportW = Math.max(PV.jotViewportMinW, canvasWrap.getBoundingClientRect().width || hostEl.getBoundingClientRect().width || 320);
  var viewportH = Math.max(PV.jotViewportMinH, canvasWrap.getBoundingClientRect().height || 420);
  canvas.width = viewportW * dpr;
  canvas.height = viewportH * dpr;
  canvas.style.width = viewportW + "px";
  canvas.style.height = viewportH + "px";
  canvas.style.touchAction = "none";
  // DOC_WIDTH is only informational (persisted for reference / as an SVG
  // width floor) \u2014 the page box wraps at the width it was opened at.
  var DOC_WIDTH = viewportW;
  function updateDocWidth() {
    DOC_WIDTH = Math.max(160, viewportW / camera.scale);
  }

  // One page box, always there and always the write target in Jot mode, so
  // writing starts the moment the tab opens. It spans the screen width at
  // 100% zoom and grows downward as words are laid out.
  var mode = "jot";       // "jot" | "draw" | "erase" | null (deselected -> pan/zoom)
  var camera = { x: 0, y: 0, scale: 1 }; // document-space coords of viewport top-left, and zoom
  var nextId = 1;
  var drawStrokes = {};   // id -> { points:[[x,y,p],...], bbox } \u2014 freehand pencil ink, not in the box
  var box = { wrapWidth: Math.max(JOT_BOX_MIN_WIDTH, viewportW), h: JOT_BOX_MIN_HEIGHT, words: [], segs: [] };
  var actions = [];        // undo log (words/breaks, strokes, erases \u2014 not pan/zoom)
  var current = null;      // in-progress stroke while pointer is down
  var writingWord = null;  // { strokes:[...], bbox } \u2014 raw ink of the word being written
  var wordPauseTimer = null;
  var lastStrokeUpAt = 0;  // performance.now() when the last Jot stroke lifted
  var strokeDownAt = 0;    // performance.now() when the in-progress Jot stroke landed
  var erasing = false;
  var activePointers = {}; // pointerId -> {x,y}, for pan/pinch-zoom
  var panState = null;     // {x,y} last client point, while 1 finger drags with no tool selected
  var pinchState = null;   // {dist, anchorDoc}, while 2 fingers are down

  // Text conversion state. textSig() names the words currently on the page;
  // convertedSig is the one the notes' text was read from, so a conversion
  // only runs when the words actually changed (drawing never triggers one).
  // Each box is read on its own: segTexts caches a box's text by its words
  // (segSig), so only the box that changed is sent again.
  var jotTextCache = null, jotTextMode = false, jotTextSaveTimer = null;
  var convertTimer = null, convertSeq = 0, convertedSig = "";
  var segTexts = {}, segReading = {};

  function notifyChange() { scheduleAutoConvert(); if (onChange) onChange(); }

  function pointerIds() { return Object.keys(activePointers); }
  function pointerDistance(ids) {
    var a = activePointers[ids[0]], b = activePointers[ids[1]];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
  function pointerMidpoint(ids) {
    var a = activePointers[ids[0]], b = activePointers[ids[1]];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
  function updateZoomLabel() {
    var label = toolbar.querySelector(".jt-zoom-label");
    if (label) label.textContent = Math.round(camera.scale * 100) + "%";
  }

  // Lays the words out into boxes stacked down the page: each Return (a
  // hidden marker word, see jtBreakWord) closes the box it ends and starts a
  // new one below. Each box word-wraps at wrapWidth and grows with its words.
  // A Return in a box with no words yet does nothing, so there's never an
  // empty box above another.
  function relayoutBox() {
    var segs = [], seg = null, top = 0;
    function openSeg() { seg = { top: top, h: JOT_BOX_MIN_HEIGHT, words: [], closed: false, line: 0, x: JOT_PARA_MARGIN }; segs.push(seg); }
    function sizeSeg() {
      seg.h = Math.max(Math.ceil(JOT_PARA_TOP + seg.line * JOT_LINE_HEIGHT + JOT_PARA_MARGIN + PV.jotBoxBottomPad), JOT_BOX_MIN_HEIGHT);
      top = seg.top + seg.h + JOT_BOX_GAP;
    }
    var maxWidth = box.wrapWidth - JOT_PARA_MARGIN * 2;
    openSeg();
    for (var i = 0; i < box.words.length; i++) {
      var w = box.words[i];
      if (w.isBreak) {
        w.line = seg.line; w.x = JOT_PARA_MARGIN; w.y = seg.top + JOT_PARA_TOP;
        if (seg.words.length) { seg.closed = true; sizeSeg(); openSeg(); }
        continue;
      }
      if (seg.x + w.width > maxWidth && seg.x > JOT_PARA_MARGIN) { seg.line++; seg.x = JOT_PARA_MARGIN; }
      w.line = seg.line;
      w.x = seg.x;
      w.y = seg.top + JOT_PARA_TOP + seg.line * JOT_LINE_HEIGHT;
      seg.x += w.width + JOT_WORD_GAP;
      seg.words.push(w);
    }
    sizeSeg();
    box.segs = segs;
    box.h = seg.top + seg.h;
  }

  function hasText() {
    for (var i = 0; i < box.words.length; i++) if (!box.words[i].isBreak) return true;
    return false;
  }
  function textSig() {
    var ids = [];
    for (var i = 0; i < box.words.length; i++) ids.push(box.words[i].id);
    return ids.join(",");
  }

  function redraw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewportW, viewportH);
    if (!box.words.length && !writingWord && !current && !Object.keys(drawStrokes).length) {
      ctx.fillStyle = "#666";
      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(mode === "draw" ? "Draw anywhere" : "Write here", viewportW / 2, viewportH / 2);
      ctx.textAlign = "start";
    }
    // Everything below is drawn in document space; this transform maps it
    // through the camera (pan + zoom) onto the viewport-sized canvas.
    ctx.setTransform(camera.scale * dpr, 0, 0, camera.scale * dpr, -camera.x * camera.scale * dpr, -camera.y * camera.scale * dpr);
    ctx.strokeStyle = "#3a3a3a";
    ctx.lineWidth = 1 / camera.scale;
    for (var si = 0; si < box.segs.length; si++) {
      var sg = box.segs[si];
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(2, sg.top + 2, box.wrapWidth - 4, sg.h - 4, 8);
      else ctx.rect(2, sg.top + 2, box.wrapWidth - 4, sg.h - 4);
      ctx.stroke();
    }
    ctx.fillStyle = JOT_INK;
    for (var id in drawStrokes) jtFillOutline(ctx, jtOutline(drawStrokes[id].points));
    for (var wi = 0; wi < box.words.length; wi++) {
      var w = box.words[wi];
      if (w.isBreak) continue;
      ctx.save();
      ctx.translate(w.x, w.y);
      ctx.rotate(-w.rotate);
      ctx.scale(w.scale, w.scale);
      ctx.translate(-w.anchor[0], -w.anchor[1]);
      for (var s = 0; s < w.rawStrokes.length; s++) jtFillOutline(ctx, jtOutline(w.rawStrokes[s]));
      ctx.restore();
    }
    if (writingWord) for (var ws = 0; ws < writingWord.strokes.length; ws++) jtFillOutline(ctx, jtOutline(writingWord.strokes[ws]));
    if (current) jtFillOutline(ctx, jtOutline(current.points));
  }

  // A Return is stored as its own zero-width "word" (rather than a flag
  // deferred onto whatever gets written next) so it's captured in the
  // actions/words log \u2014 and therefore in getJSON()/undo \u2014 the instant the
  // gesture fires, and can never be silently lost if nothing follows it.
  function jtBreakWord(id) {
    return { id: id, isBreak: true, rawStrokes: [], anchor: [0, 0], rotate: 0, scale: 1, width: 0, height: JOT_WORD_HEIGHT };
  }
  function wordFromAction(a) {
    return { id: a.id, rawStrokes: a.rawStrokes, anchor: a.anchor, rotate: a.rotate, scale: a.scale, width: a.width, height: a.height, dot: !!a.dot };
  }

  // Rebuilds the words/ink from the action log (undo).
  function rebuildFromActions() {
    drawStrokes = {}; box.words = [];
    for (var i = 0; i < actions.length; i++) {
      var a = actions[i];
      if (a.type === "add-stroke") drawStrokes[a.id] = { points: a.points, bbox: jtBBox(a.points) };
      else if (a.type === "erase-stroke") delete drawStrokes[a.targetId];
      else if (a.type === "add-word") box.words.push(wordFromAction(a));
      else if (a.type === "add-break") box.words.push(jtBreakWord(a.id));
      else if (a.type === "erase-word") { for (var j = 0; j < box.words.length; j++) if (box.words[j].id === a.targetId) { box.words.splice(j, 1); break; } }
    }
    relayoutBox();
  }

  function toLogical(clientX, clientY) {
    var r = canvas.getBoundingClientRect();
    var sx = (clientX - r.left) / r.width * viewportW;
    var sy = (clientY - r.top) / r.height * viewportH;
    return [sx / camera.scale + camera.x, sy / camera.scale + camera.y];
  }

  // The rotation/scale to hand a short (1-2 stroke) word that's about to be
  // finalized \u2014 the last real (non-break, non-period) word's own, so a single
  // letter follows the size and slant of the line it's sitting on instead of
  // leveling/sizing itself off too little ink to do that reliably.
  function jtLastWordRef() {
    for (var i = box.words.length - 1; i >= 0; i--) if (!box.words[i].isBreak && !box.words[i].dot) return box.words[i];
    return null;
  }

  function finalizeWord() {
    if (wordPauseTimer) { clearTimeout(wordPauseTimer); wordPauseTimer = null; }
    var added = commitWritingWord();
    writingWord = null;
    redraw();
    if (added) notifyChange();
  }
  // Adds writingWord to the box as a laid-out word (without clearing
  // writingWord); returns true if there was something to add.
  function commitWritingWord() {
    if (!writingWord || !writingWord.strokes.length) return false;
    var lastWord = jtLastWordRef();
    var t = jtMakeWord(writingWord.strokes, lastWord ? lastWord.rotate : null, lastWord ? lastWord.scale : null);
    var action = { type: "add-word", id: nextId++, rawStrokes: t.rawStrokes, anchor: t.anchor, rotate: t.rotate, scale: t.scale, width: t.width, height: t.height };
    if (t.dot) action.dot = true;
    actions.push(action);
    box.words.push(wordFromAction(action));
    relayoutBox();
    return true;
  }
  // Runs fn with the in-progress word temporarily laid out, so a save
  // captures it \u2014 then takes it back out. Autosave must never end a word:
  // it runs ~1s after every stroke, so finalizing here split words at any
  // pause between strokes (e.g. a T's stem committed before its crossbar).
  function withPendingWord(fn) {
    var added = commitWritingWord();
    try { return fn(); }
    finally { if (added) { actions.pop(); box.words.pop(); relayoutBox(); } }
  }

  // Takes back the last committed action. Callers deal with an in-progress word first (see jtGestureBackspace).
  function doUndo() {
    if (!actions.length) return;
    actions.pop();
    rebuildFromActions();
    writingWord = null;
    redraw();
    notifyChange();
  }

  // Backspace (path set in Parameters): an in-progress (not yet settled)
  // word is discarded first \u2014 same as backspacing mid-word in a text editor.
  // Otherwise it's a real Undo of the last committed action.
  function jtGestureBackspace() {
    if (wordPauseTimer) { clearTimeout(wordPauseTimer); wordPauseTimer = null; }
    if (writingWord) { writingWord = null; redraw(); notifyChange(); return; }
    doUndo();
  }
  // Return (path set in Parameters): commits whatever preceded the gesture,
  // then inserts a hidden marker (see jtBreakWord) that starts a new box. The
  // finished box is read straight away in the background while writing
  // carries on in the new one.
  function jtGestureReturn() {
    finalizeWord();
    var id = nextId++;
    actions.push({ type: "add-break", id: id });
    box.words.push(jtBreakWord(id));
    relayoutBox();
    // Keep the new box on screen.
    var last = box.segs[box.segs.length - 1];
    var bottom = last.top + last.h + JOT_BOX_GAP;
    if ((bottom - camera.y) * camera.scale > viewportH) camera.y = bottom - viewportH / camera.scale;
    redraw();
    notifyChange();
    convertText();
  }

  function hitTest(lx, ly) {
    var pad = PV.jotHitPad;
    for (var id in drawStrokes) {
      var bx = drawStrokes[id].bbox;
      if (lx >= bx.minX - pad && lx <= bx.maxX + pad && ly >= bx.minY - pad && ly <= bx.maxY + pad) return { kind: "stroke", id: id };
    }
    for (var wi = box.words.length - 1; wi >= 0; wi--) {
      var w = box.words[wi];
      if (w.isBreak) continue;
      if (lx >= w.x - pad && lx <= w.x + w.width + pad && ly >= w.y - w.height - pad && ly <= w.y + pad) return { kind: "word", id: w.id };
    }
    return null;
  }

  function eraseAt(lx, ly) {
    var hit = hitTest(lx, ly);
    if (!hit) return;
    if (hit.kind === "stroke") { delete drawStrokes[hit.id]; actions.push({ type: "erase-stroke", targetId: hit.id }); }
    else {
      for (var j = 0; j < box.words.length; j++) if (box.words[j].id === hit.id) { box.words.splice(j, 1); break; }
      relayoutBox();
      actions.push({ type: "erase-word", targetId: hit.id });
    }
    redraw();
    notifyChange();
  }

  function onDown(e) {
    activePointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = pointerIds();
    // Two or more simultaneous touches are always a pinch/pan on the camera,
    // no matter which tool is selected \u2014 ink is only ever drawn by a single
    // active pointer (two fingers fed in as strokes garbled words and their
    // scale).
    if (ids.length >= 2) {
      if (current) { current = null; redraw(); }
      erasing = false;
      panState = null;
      var downIds = ids.slice(0, 2);
      var mid = pointerMidpoint(downIds);
      pinchState = { dist: pointerDistance(downIds), anchorDoc: toLogical(mid.x, mid.y) };
      return;
    }
    if (!mode) {
      // No tool selected: single-finger panning of the camera.
      panState = { x: e.clientX, y: e.clientY };
      pinchState = null;
      return;
    }
    canvas.setPointerCapture(e.pointerId);
    var p = toLogical(e.clientX, e.clientY);
    var pressure = e.pointerType === "mouse" ? PV.jotDefaultPressure : (e.pressure || PV.jotDefaultPressure);
    if (mode === "erase") { erasing = true; eraseAt(p[0], p[1]); return; }
    if (mode === "jot") {
      // Starting a new stroke always cancels any pending "finalize the word
      // on pause" timer \u2014 otherwise a slightly-longer-than-usual pause
      // before the next letter can fire mid-stroke and split the word.
      if (wordPauseTimer) { clearTimeout(wordPauseTimer); wordPauseTimer = null; }
      if (convertTimer) { clearTimeout(convertTimer); convertTimer = null; }
    }
    strokeDownAt = performance.now();
    current = { points: [[p[0], p[1], pressure]] };
    redraw();
  }
  function onMove(e) {
    if (activePointers[e.pointerId]) activePointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = pointerIds();
    if (ids.length >= 2 && pinchState) {
      var downIds = ids.slice(0, 2);
      var mid = pointerMidpoint(downIds);
      var d = pointerDistance(downIds);
      if (d) {
        var newScale = Math.max(PV.jotZoomMin, Math.min(PV.jotZoomMax, camera.scale * (d / pinchState.dist)));
        pinchState.dist = d;
        var r = canvas.getBoundingClientRect();
        var sx = (mid.x - r.left) / r.width * viewportW;
        var sy = (mid.y - r.top) / r.height * viewportH;
        camera.scale = newScale;
        camera.x = pinchState.anchorDoc[0] - sx / newScale;
        camera.y = pinchState.anchorDoc[1] - sy / newScale;
        updateZoomLabel();
        updateDocWidth();
        redraw();
      }
      e.preventDefault();
      return;
    }
    if (!mode) {
      if (ids.length === 1 && panState) {
        var dx = e.clientX - panState.x, dy = e.clientY - panState.y;
        panState = { x: e.clientX, y: e.clientY };
        camera.x -= dx / camera.scale;
        camera.y -= dy / camera.scale;
        redraw();
        e.preventDefault();
      }
      return;
    }
    var p = toLogical(e.clientX, e.clientY);
    if (mode === "erase") { if (erasing) eraseAt(p[0], p[1]); return; }
    if (!current) return; // mid-pinch (this pointer was cancelled when a 2nd finger landed)
    var pressure = e.pointerType === "mouse" ? PV.jotDefaultPressure : (e.pressure || PV.jotDefaultPressure);
    current.points.push([p[0], p[1], pressure]);
    redraw();
  }
  function onUp(e) {
    delete activePointers[e.pointerId];
    var ids = pointerIds();
    if (ids.length < 2) pinchState = null;
    panState = (!mode && ids.length === 1) ? { x: activePointers[ids[0]].x, y: activePointers[ids[0]].y } : null;
    if (!mode) return;
    if (pinchState) return; // still mid-pinch (a 3rd+ finger lifted) \u2014 not the end of a stroke
    if (mode === "erase") { erasing = false; return; }
    if (!current) return;
    var stroke = current;
    current = null;
    if (stroke.points.length < 2) stroke.points.push([stroke.points[0][0] + 0.1, stroke.points[0][1] + 0.1, stroke.points[0][2]]);
    if (mode === "jot") {
      // A single-stroke L-shaped command (see jtClassifyGesture) is checked
      // before treating the stroke as ink \u2014 a real command never gets added
      // to the word as a stray mark.
      var gestureCmd = jtClassifyGesture(stroke.points, camera.scale);
      if (gestureCmd === "backspace") { jtGestureBackspace(); redraw(); return; }
      if (gestureCmd === "return") { jtGestureReturn(); redraw(); return; }

      var bbox = jtBBox(stroke.points);
      var pauseMs = lastStrokeUpAt ? Math.max(0, strokeDownAt - lastStrokeUpAt) : Infinity;
      lastStrokeUpAt = performance.now();
      var gapMm = writingWord ? jtWordGap(writingWord.bbox, bbox) * camera.scale / JOT_PX_PER_MM : Infinity;
      var newLine = !!writingWord && jtOnNewLine(writingWord.bbox, bbox, camera.scale);
      var joins = !!writingWord && !newLine && !jtStartsNewWord(pauseMs, gapMm);
      toolbar.querySelector(".jt-wordinfo").textContent = writingWord
        ? (pauseMs / 1000).toFixed(2) + "s \xB7 " + gapMm.toFixed(1) + "mm \xB7 " + (joins ? "same word" : newLine ? "NEW line" : "NEW word")
        : "new word";
      if (joins) {
        writingWord.strokes.push(stroke.points);
        writingWord.bbox = jtBBoxUnion(writingWord.bbox, bbox);
      } else {
        finalizeWord();
        writingWord = { strokes: [stroke.points], bbox: bbox };
      }
      if (wordPauseTimer) clearTimeout(wordPauseTimer);
      wordPauseTimer = setTimeout(finalizeWord, PV.jotWordSettleMs);
      redraw();
      if (onChange) onChange();
    } else {
      var id = nextId++;
      drawStrokes[id] = { points: stroke.points, bbox: jtBBox(stroke.points) };
      actions.push({ type: "add-stroke", id: id, points: stroke.points });
      redraw();
      notifyChange();
    }
  }

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);

  // Zooms while keeping the document point under (pivotClientX, pivotClientY)
  // \u2014 the viewport center by default \u2014 fixed on screen.
  function setZoom(scale, pivotClientX, pivotClientY) {
    var newScale = Math.max(PV.jotZoomMin, Math.min(PV.jotZoomMax, scale));
    var r = canvas.getBoundingClientRect();
    var px = (pivotClientX != null) ? pivotClientX : (r.left + r.width / 2);
    var py = (pivotClientY != null) ? pivotClientY : (r.top + r.height / 2);
    var anchorDoc = toLogical(px, py);
    camera.scale = newScale;
    var sx = (px - r.left) / r.width * viewportW;
    var sy = (py - r.top) / r.height * viewportH;
    camera.x = anchorDoc[0] - sx / newScale;
    camera.y = anchorDoc[1] - sy / newScale;
    updateZoomLabel();
    updateDocWidth();
    redraw();
  }

  function syncToolbar() {
    var btns = toolbar.querySelectorAll(".jt-mode");
    for (var i = 0; i < btns.length; i++) btns[i].classList.toggle("active", btns[i].getAttribute("data-mode") === mode);
  }

  // \u2500\u2500 automatic handwriting \u2192 text (Workers AI), saved into the notes \u2500\u2500
  function setConvInfo(msg) { convInfo.textContent = msg; }
  function scheduleAutoConvert() {
    if (!notesText) return;
    if (convertTimer) clearTimeout(convertTimer);
    convertTimer = setTimeout(autoConvert, PV.jotAutoConvertMs);
  }
  function autoConvert() {
    convertTimer = null;
    // Mid-word: wait for it to settle (finalizeWord schedules us again).
    if (writingWord || current) return;
    if (textSig() !== convertedSig) convertText();
  }
  function segSig(seg) {
    var ids = [];
    for (var i = 0; i < seg.words.length; i++) ids.push(seg.words[i].id);
    return ids.join(",");
  }
  // One box's words (not the freehand drawing), on their own.
  function segSVG(seg) {
    var wSvg = Math.ceil(Math.max(DOC_WIDTH, box.wrapWidth)), h = Math.ceil(seg.h + 10);
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + wSvg + ' ' + h + '" width="' + wSvg + '" height="' + h + '"><rect width="100%" height="100%" fill="#1e1e1e"/>';
    for (var wi = 0; wi < seg.words.length; wi++) {
      var w = seg.words[wi];
      var deg = (-w.rotate * 180 / Math.PI).toFixed(2);
      svg += '<g transform="translate(' + w.x.toFixed(2) + ',' + (w.y - seg.top).toFixed(2) + ') rotate(' + deg + ') scale(' + w.scale.toFixed(4) + ') translate(' + (-w.anchor[0]).toFixed(2) + ',' + (-w.anchor[1]).toFixed(2) + ')">';
      for (var s = 0; s < w.rawStrokes.length; s++) svg += jtOutlineToPath(jtOutline(w.rawStrokes[s]));
      svg += '</g>';
    }
    return svg + '</svg>';
  }
  // The recogniser breaks lines where the box wrapped them: those go, so a
  // box is one line of text, and only the Return that closed it is kept.
  function jtOneLine(text) {
    return String(text || "").split(String.fromCharCode(10)).map(function(l) { return l.trim(); }).filter(Boolean).join(" ");
  }
  // Sends every box not read yet (in the background \u2014 writing carries on);
  // once all are in, joins them into the notes' text.
  function convertText() {
    if (convertTimer) { clearTimeout(convertTimer); convertTimer = null; }
    var gen = convertSeq, missing = false;
    box.segs.forEach(function(seg) {
      if (!seg.words.length) return;
      var sig = segSig(seg);
      if (sig in segTexts) return;
      missing = true;
      if (segReading[sig]) return;
      segReading[sig] = true;
      jotToImage(segSVG(seg)).then(function(image) {
        return fetch(API + "/jot-to-text", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: image }) });
      }).then(function(r) { return r.json(); }).then(function(d) {
        if (gen !== convertSeq) return;
        delete segReading[sig];
        if (d.error) throw new Error(d.error);
        segTexts[sig] = jtOneLine(d.text);
        convertText();
      }).catch(function(err) {
        if (gen !== convertSeq) return;
        delete segReading[sig];
        setConvInfo("Read failed");
        if (jotTextMode) textView.innerHTML = '<span class="jt-text-note">Conversion failed: ' + esc(err.message) + '</span>';
      });
    });
    if (missing) { setConvInfo("Reading\u2026"); return; }
    var text = "";
    box.segs.forEach(function(seg) {
      if (seg.words.length) text += segTexts[segSig(seg)] + (seg.closed ? String.fromCharCode(10) : "");
    });
    var sig = textSig();
    if (sig === convertedSig && text === jotTextCache) return;
    convertedSig = sig;
    jotTextCache = text;
    if (notesText) notesText.save(jotTextCache);
    setConvInfo(jotTextCache ? "In Notes \u2713" : "");
    if (jotTextMode) renderJotTextEditor(jotTextCache ? "Saved to Notes \u2713" : "");
  }
  // Seeds segTexts from text already in the notes, when it still splits
  // into exactly one line per box (it won't after an Aa edit added lines).
  function seedSegTexts(text) {
    var lines = String(text || "").split(String.fromCharCode(10)), withWords = [];
    box.segs.forEach(function(seg) { if (seg.words.length) withWords.push(seg); });
    var lastClosed = withWords.length && withWords[withWords.length - 1].closed;
    if (lastClosed) { if (lines[lines.length - 1] !== "") return; lines.pop(); }
    if (lines.length !== withWords.length) return;
    withWords.forEach(function(seg, i) { segTexts[segSig(seg)] = lines[i]; });
  }

  // Aa: swap the ink for the text that's in the notes, editable.
  function setTextMode(on) {
    if (!on) flushJotTextSave();
    jotTextMode = on;
    canvasWrap.classList.toggle("hidden", on);
    textView.classList.toggle("hidden", !on);
    toolbar.querySelector('[data-act="totext"]').classList.toggle("armed", on);
    if (on) showJotText();
  }
  function showJotText() {
    finalizeWord();
    if (!hasText()) { textView.innerHTML = '<span class="jt-text-note">Nothing written yet</span>'; return; }
    if (textSig() === convertedSig && jotTextCache !== null) { renderJotTextEditor(""); return; }
    textView.innerHTML = '<span class="jt-text-note">Converting handwriting\u2026</span>';
    convertText();
  }
  // Editable text; changes autosave into the notes (debounced). The next
  // handwriting change re-reads the page and replaces the text.
  function renderJotTextEditor(status) {
    textView.innerHTML = '<textarea class="jt-text-edit" placeholder="(no text recognised)"></textarea><div class="jt-text-note jt-text-saved"></div>';
    var ta = textView.querySelector("textarea"), st = textView.querySelector(".jt-text-saved");
    ta.value = jotTextCache || "";
    st.textContent = status;
    ta.addEventListener("input", function() {
      jotTextCache = ta.value;
      if (!notesText) return;
      st.textContent = "Saving\u2026";
      clearTimeout(jotTextSaveTimer);
      jotTextSaveTimer = setTimeout(function() {
        jotTextSaveTimer = null;
        notesText.save(jotTextCache);
        st.textContent = "Saved to Notes \u2713";
      }, PV.jotTextAutosaveMs);
    });
  }
  function flushJotTextSave() {
    if (!jotTextSaveTimer) return;
    clearTimeout(jotTextSaveTimer);
    jotTextSaveTimer = null;
    if (notesText) notesText.save(jotTextCache || "");
  }

  function resetAll() {
    if (wordPauseTimer) { clearTimeout(wordPauseTimer); wordPauseTimer = null; }
    writingWord = null; current = null;
    actions = []; drawStrokes = {}; box.words = [];
    segTexts = {}; segReading = {};
    relayoutBox();
    camera.x = 0; camera.y = 0;
  }

  toolbar.addEventListener("click", function(e) {
    var btn = e.target.closest(".jt-btn");
    if (!btn) return;
    if (btn.getAttribute("data-act") === "totext") { setTextMode(!jotTextMode); return; }
    // Any other tool goes back to the ink first.
    if (jotTextMode) setTextMode(false);
    var m = btn.getAttribute("data-mode");
    if (m) {
      finalizeWord();
      mode = (mode === m) ? null : m;
      syncToolbar();
      redraw();
      return;
    }
    var act = btn.getAttribute("data-act");
    // Same rule as the Backspace gesture: a word still being written goes first;
    // only when there is none does Undo take back the last committed action.
    if (act === "undo") jtGestureBackspace();
    else if (act === "zoomin") setZoom(camera.scale * PV.jotZoomStep);
    else if (act === "zoomout") setZoom(camera.scale / PV.jotZoomStep);
    else if (act === "zoomreset") setZoom(1);
    else if (act === "clear") { resetAll(); setZoom(1); notifyChange(); }
  });

  relayoutBox();
  redraw();

  var api = {
    // Reset for a new call: nothing is written back to the notes.
    clear: function() {
      convertSeq++;
      if (convertTimer) { clearTimeout(convertTimer); convertTimer = null; }
      resetAll();
      convertedSig = ""; jotTextCache = null; setConvInfo("");
      camera.scale = 1; updateZoomLabel(); updateDocWidth(); redraw();
    },
    isEmpty: function() { return actions.length === 0 && !writingWord; },
    getJSON: function() { return withPendingWord(function() {
      var ds = [], id;
      for (id in drawStrokes) ds.push({ id: id, points: drawStrokes[id].points });
      var words = box.words.map(function(w) { return w.isBreak ? { id: w.id, isBreak: true } : { id: w.id, rawStrokes: w.rawStrokes, anchor: w.anchor, rotate: w.rotate, scale: w.scale, width: w.width, height: w.height, dot: !!w.dot }; });
      // textSig: which words the notes' text was read from, so a reload
      // knows whether it's stale (e.g. the page closed mid-conversion).
      return { v: 3, canvasWidth: DOC_WIDTH, textSig: convertedSig, drawStrokes: ds, boxes: [{ id: 0, x: 0, y: 0, wrapWidth: box.wrapWidth, words: words }] };
    }); },
    // textOnly: just the box's words, for reading the handwriting.
    getSVG: function(textOnly) { return withPendingWord(function() {
      var maxY = box.h + 10, maxX = Math.max(DOC_WIDTH, box.wrapWidth);
      var id;
      if (!textOnly) for (id in drawStrokes) { maxY = Math.max(maxY, drawStrokes[id].bbox.maxY); maxX = Math.max(maxX, drawStrokes[id].bbox.maxX); }
      var h = Math.ceil(maxY + 20);
      var wSvg = Math.ceil(maxX);
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + wSvg + ' ' + h + '" width="' + wSvg + '" height="' + h + '"><rect width="100%" height="100%" fill="#1e1e1e"/>';
      if (!textOnly) for (id in drawStrokes) svg += jtOutlineToPath(jtOutline(drawStrokes[id].points));
      for (var wi = 0; wi < box.words.length; wi++) {
        var w = box.words[wi];
        if (w.isBreak) continue;
        var deg = (-w.rotate * 180 / Math.PI).toFixed(2);
        svg += '<g transform="translate(' + w.x.toFixed(2) + ',' + w.y.toFixed(2) + ') rotate(' + deg + ') scale(' + w.scale.toFixed(4) + ') translate(' + (-w.anchor[0]).toFixed(2) + ',' + (-w.anchor[1]).toFixed(2) + ')">';
        for (var s = 0; s < w.rawStrokes.length; s++) svg += jtOutlineToPath(jtOutline(w.rawStrokes[s]));
        svg += '</g>';
      }
      svg += '</svg>';
      return svg;
    }); },
    loadJSON: function(data) {
      // Loaded content becomes seed entries in the action log (not just
      // direct state) so it replays correctly through rebuildFromActions()
      // \u2014 otherwise the first Undo after loading would rebuild from an
      // empty log and wipe the loaded content instead of the last edit.
      convertSeq++;
      if (convertTimer) { clearTimeout(convertTimer); convertTimer = null; }
      resetAll();
      function seedId(id) { if (nextId <= Number(id)) nextId = Number(id) + 1; }
      function seedWord(w) {
        if (w.isBreak) { actions.push({ type: "add-break", id: w.id }); return; }
        actions.push({ type: "add-word", id: w.id, rawStrokes: w.rawStrokes, anchor: w.anchor, rotate: w.rotate, scale: w.scale, width: w.width, height: w.height, dot: !!w.dot });
      }
      // nextId first goes past every saved id, so the breaks minted below
      // to join old boxes can't collide with one.
      var oldWords = [], bi, wi;
      if (data && data.boxes) for (bi = 0; bi < data.boxes.length; bi++) oldWords = oldWords.concat(data.boxes[bi].words || []);
      else if (data && data.words) oldWords = data.words;
      for (wi = 0; wi < oldWords.length; wi++) seedId(oldWords[wi].id);
      if (data && data.drawStrokes) for (var i = 0; i < data.drawStrokes.length; i++) {
        var d = data.drawStrokes[i];
        actions.push({ type: "add-stroke", id: d.id, points: d.points });
        seedId(d.id);
      }
      if (data && data.boxes) {
        // Older saves could hold several boxes: they become one page, each
        // old box starting on a new line.
        for (var j = 0; j < data.boxes.length; j++) {
          var bws = data.boxes[j].words || [];
          if (j > 0 && bws.length) { var bid = nextId++; actions.push({ type: "add-break", id: bid }); }
          for (var k = 0; k < bws.length; k++) seedWord(bws[k]);
        }
      } else if (data && data.words) {
        // Legacy (v1): a single flat page of words.
        for (var m = 0; m < data.words.length; m++) seedWord(data.words[m]);
      }
      rebuildFromActions();
      redraw();
      // Text already in the notes is current if it was read from exactly
      // these words (or, for saves from before textSig, if there is any).
      var prev = notesText ? notesText.saved() : "";
      var sig = textSig();
      var upToDate = data && typeof data.textSig === "string" ? data.textSig === sig : !!prev;
      if (upToDate || !hasText()) { convertedSig = sig; jotTextCache = prev || ""; if (upToDate) seedSegTexts(prev); }
      else { convertedSig = null; jotTextCache = null; scheduleAutoConvert(); }
    },
    destroy: function() {
      flushJotTextSave();
      finalizeWord();
      // A conversion still pending or in flight is dropped (this page's
      // notes may belong to another call by the time it lands); the stale
      // textSig in the saved JSON makes the next open re-read it.
      convertSeq++;
      if (convertTimer) { clearTimeout(convertTimer); convertTimer = null; }
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
    }
  };
  return api;
}
// Jot SVG (light ink on dark) \u2192 dark-on-white JPEG data URL for the vision
// model, at most JOT_OCR_MAX_W wide.
var JOT_OCR_MAX_W = 1000, JOT_OCR_MAX_H = 4000;
function jotToImage(svg) {
  svg = svg.split("#1e1e1e").join("#ffffff").split("#e9ecef").join("#000000");
  return new Promise(function(resolve, reject) {
    var img = new Image();
    var url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    img.onload = function() {
      URL.revokeObjectURL(url);
      var k = Math.min(1, JOT_OCR_MAX_W / img.width, JOT_OCR_MAX_H / img.height);
      var c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.width * k));
      c.height = Math.max(1, Math.round(img.height * k));
      var g = c.getContext("2d");
      g.fillStyle = "#fff";
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = function() { URL.revokeObjectURL(url); reject(new Error("couldn't render the jot")); };
    img.src = url;
  });
}
function jtOutlineToPath(outline) {
  if (!outline || outline.length < 3) return "";
  var d = "M " + outline[0][0].toFixed(2) + " " + outline[0][1].toFixed(2);
  for (var i = 1; i < outline.length; i++) d += " L " + outline[i][0].toFixed(2) + " " + outline[i][1].toFixed(2);
  d += " Z";
  return '<path d="' + d + '" fill="#e9ecef"/>';
}

function initJotEditor() {
  var host = document.getElementById("jot-canvas");
  if (liveJot) { resetJotIfNewCall(); return; }
  liveJot = createJot(host, scheduleCallSave, {
    save: function(text) { putJotTextInNotes("call-notes", text); scheduleCallSave(); },
    saved: function() { return getJotTextFromNotes("call-notes", ""); }
  });
  jotCallId = currentCall ? currentCall.id : null;
}

var liveJot = null, jotCallId = null;

function resetJotIfNewCall() {
  var id = currentCall ? currentCall.id : null;
  if (liveJot && id !== jotCallId) {
    liveJot.clear();
    jotCallId = id;
    setJotStatus("");
  }
}

function clearJot() {
  if (!liveJot) return;
  liveJot.clear();
  setJotStatus("Cleared");
}

function setJotStatus(msg) {
  var el = document.getElementById("jot-status");
  if (el) el.textContent = msg;
}

// Persist the live in-call Notes editor + Jot sketch (SVG + re-editable JSON)
// to the call_log row created by logCallEvent("ring").
function setCallSaveStatus(msg) {
  var el = document.getElementById("cp-save-status");
  if (el) el.textContent = msg;
}
// Autosave: any edit to notes or the jot sketch schedules a debounced save,
// so there's no separate save action for the user to remember to press.
var callSaveTimer = null;
function scheduleCallSave() {
  if (!currentCall) return;
  setCallSaveStatus("Saving\u2026");
  clearTimeout(callSaveTimer);
  callSaveTimer = setTimeout(saveCallRecord, PV.notesAutosaveMs);
}
function flushCallSave() {
  if (!callSaveTimer) return;
  clearTimeout(callSaveTimer);
  callSaveTimer = null;
  saveCallRecord();
}
function saveCallRecord() {
  clearTimeout(callSaveTimer);
  callSaveTimer = null;
  if (!currentCall) { setCallSaveStatus(""); return; }
  var callId = currentCall.id;
  var ed = (typeof tinymce !== "undefined") ? tinymce.get("call-notes") : null;
  var ta = document.getElementById("call-notes");
  var notesHtml = ed ? ed.getContent() : (ta ? ta.value : "");
  setCallSaveStatus("Saving\u2026");
  var jotSvg = (liveJot && !liveJot.isEmpty()) ? liveJot.getSVG() : "";
  var jotJson = liveJot ? JSON.stringify(liveJot.getJSON()) : "";
  postCallSave(callId, notesHtml, jotSvg, jotJson);
}
function postCallSave(callId, notesHtml, jotSvg, jotJson) {
  fetch(API + "/call-notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ call_id: callId, notes_html: notesHtml, jot_svg: jotSvg, jot_json: jotJson })
  }).then(function(r) { return r.json(); }).then(function(d) {
    setCallSaveStatus(d.ok ? "Saved \u2713" : "Save failed");
  }).catch(function() { setCallSaveStatus("Save failed"); });
}

function loadCallHistoryTab() {
  var el = document.getElementById("cp-pane-history");
  var num = currentCall && currentCall.remote;
  if (!num) { el.innerHTML = '<div class="empty">No number</div>'; return; }
  el.innerHTML = '<div class="empty">Loading\u2026</div>';
  fetch(API + "/call-history?limit=" + PV.callPanelHistoryLimit + "&q=" + encodeURIComponent(num)).then(function(r){return r.json();}).then(function(d){
    var calls = (d.calls || []).filter(function(c) { return !currentCall || c.call_id !== currentCall.id; });
    if (!calls.length) { el.innerHTML = '<div class="empty">No previous calls with this number</div>'; return; }
    el.innerHTML = calls.map(function(c) {
      var when = c.start_date ? new Date(c.start_date).toLocaleString() : "";
      var dur = c.duration > 0 ? fmtDur(c.duration) : "\u2014";
      var dir = c.direction === "outgoing" ? "\u2B06" : "\u2B07";
      return '<div class="cp-hist-row"><span>' + dir + ' ' + esc(when) + '</span><span>' + esc(dur) + '</span></div>';
    }).join("");
  }).catch(function(){ el.innerHTML = '<div class="empty">Error loading history</div>'; });
}

function loadQuotationsTab() {
  var el = document.getElementById("cp-pane-sales");
  if (!currentCallPartner) { el.innerHTML = '<div class="empty">No matching contact yet</div>'; return; }
  el.innerHTML = '<div class="empty">Loading\u2026</div>';
  fetch(API + "/quotations?contact=" + encodeURIComponent(currentCallPartner.id)).then(function(r){return r.json();}).then(function(d){
    var list = d.quotations || [];
    if (!list.length) { el.innerHTML = '<div class="empty">No quotations found</div>'; return; }
    el.innerHTML = list.map(function(o) {
      var when = o.date_order ? new Date(o.date_order.replace(" ", "T") + "Z").toLocaleDateString() : "";
      return '<div class="cp-quote-row">'
        + '<div>'
        + '<div class="n">' + esc(o.name) + (when ? ' <span class="dt">' + esc(when) + '</span>' : '') + '</div>'
        + (o.items_summary ? '<div class="items">' + esc(o.items_summary) + '</div>' : '')
        + (o.state ? '<div class="st">' + esc(o.state) + '</div>' : '')
        + '</div>'
        + (o.amount_total != null ? '<span class="amt">' + esc(fmtMoney(o.amount_total)) + '</span>' : '')
        + '</div>';
    }).join("");
  }).catch(function(){ el.innerHTML = '<div class="empty">Error loading quotations</div>'; });
}

// Last 100 emails for the identified caller \u2014 reuses the same /messages
// endpoint, row renderer, and cache as the full-screen Messages view
// (loadMessages/renderMessageRow below), filtered down to Gmail-sourced
// entries only (that endpoint also returns Odoo's internal mail.message
// notes, which aren't "emails"). Tapping a row opens it straight away \u2014
// no select-then-tap-again dance, since this is a quick glance mid-call
// rather than the full Messages screen's reply/compose workflow.
function loadEmailsTab() {
  var el = document.getElementById("cp-pane-emails");
  if (!currentCallPartner) { el.innerHTML = '<div class="empty">No matching contact yet</div>'; return; }
  el.innerHTML = '<div class="empty">Loading\u2026</div>';
  fetch(API + "/messages?contact=" + encodeURIComponent(currentCallPartner.id) + "&limit=" + PV.callPanelMessagesLimit).then(function(r){return r.json();}).then(function(d){
    var msgs = (d.messages || []).filter(function(m) { return m.source === "gmail"; });
    if (!msgs.length) { el.innerHTML = '<div class="empty">No emails found</div>'; return; }
    el.innerHTML = msgs.map(function(m) { return renderMessageRow(m); }).join("");
  }).catch(function(){ el.innerHTML = '<div class="empty">Error loading emails</div>'; });
}
document.getElementById("cp-pane-emails").addEventListener("click", function(e) {
  var row = e.target.closest(".msg-row");
  if (!row) return;
  var m = messagesCache[row.getAttribute("data-key")];
  if (m) openMessageFull(m);
});
function fmtMoney(n) { try { return "\xA3" + Number(n).toFixed(2); } catch (e) { return String(n); } }

// Keyboard: digits/* send DTMF during a call; # opens quick text.
document.addEventListener("keydown", function(e) {
  if (!inCall()) return;
  if (e.target && e.target.tagName === "INPUT") return;
  var k = e.key;
  var onKeypadTab = activeCpTab === "keypad";
  if (k === "#") { e.preventDefault(); if (onKeypadTab) sendDtmfFromPad("#"); else padTone("#"); return; }
  if (k === "*") { e.preventDefault(); if (onKeypadTab) sendDtmfFromPad("*"); else sendDtmf("*"); return; }
  if (onKeypadTab && /^[0-9]$/.test(k)) { e.preventDefault(); sendDtmfFromPad(k); return; }
  if (/^[0-9]$/.test(k)) {
    e.preventDefault();
    var panel = document.getElementById("qt-panel");
    if (!panel.classList.contains("hidden")) { qtBuffer += k; tryQuickText(); }
    else sendDtmf(k);
  }
});
pad.addEventListener("pointerleave", function(e) {
  var k = e.target.closest(".key"); if (!k) return; if (k.getAttribute("data-d") === "0") { clearTimeout(pressTimer); }
});

// \u2500\u2500 dial box: smart T9 search \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Keypad digits match contact/caller names the way phone dialers do: "564"
// finds JOHn, "7648" SMITh, "5647648" JOHN SMITh, "57" initials J S \u2014 plus
// any number containing the digits (a leading 0 also matches home-country numbers).
// Letters typed on a keyboard match names directly. The corpus is every
// contact with a phone (D1 cache) plus names/numbers from loaded history.
var T9_KEYS = { a:2,b:2,c:2,d:3,e:3,f:3,g:4,h:4,i:4,j:5,k:5,l:5,m:6,n:6,o:6,p:7,q:7,r:7,s:7,t:8,u:8,v:8,w:9,x:9,y:9,z:9 };
var t9Corpus = [], t9LoadedAt = 0, suggestTimer = null;
function t9Char(ch) {
  ch = ch.toLowerCase();
  if (ch >= "0" && ch <= "9") return ch;
  var d = T9_KEYS[ch.normalize ? ch.normalize("NFD").charAt(0) : ch];
  return d ? String(d) : "";
}
function digitsOnly(s) { return String(s || "").replace(/[^0-9]/g, ""); }
// Name -> words with their T9 digits and where each starts in the name.
function t9Words(name) {
  var words = [], cur = null;
  for (var i = 0; i < name.length; i++) {
    var d = t9Char(name.charAt(i));
    if (!d) { cur = null; continue; }
    if (!cur) { cur = { at: i, t9: "", txt: "" }; words.push(cur); }
    cur.t9 += d; cur.txt += name.charAt(i).toLowerCase();
  }
  return words;
}
function t9Entry(name, num) {
  name = String(name || "").trim();
  var digits = digitsOnly(num);
  var nums = digits ? [digits] : [];
  if (digits.indexOf(SERVER.countryCode) === 0) nums.push("0" + digits.slice(SERVER.countryCode.length));
  return { name: name, num: String(num || ""), digits: digits, nums: nums, words: t9Words(name) };
}
function loadT9Corpus(force) {
  if (!force && t9LoadedAt && Date.now() - t9LoadedAt < 10 * 60 * 1000) return;
  t9LoadedAt = Date.now();
  fetch(API + "/contacts/t9").then(function(r){return r.json();}).then(function(d){
    var list = d.contacts || [], out = [];
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.mobile) out.push(t9Entry(c.name, c.mobile));
      if (c.phone && digitsOnly(c.phone) !== digitsOnly(c.mobile)) out.push(t9Entry(c.name, c.phone));
    }
    t9Corpus = out;
  }).catch(function(){ t9LoadedAt = 0; });
}
// Best match of q against one entry: { score, hl: [start,end] ranges in name, numHl }.
function t9Match(e, q, letters) {
  var best = null, w = e.words;
  function take(score, hl, numHl) { if (!best || score > best.score) best = { score: score, hl: hl || [], numHl: numHl || null }; }
  for (var i = 0; i < w.length; i++) {
    // q runs from the start of word i, possibly across the following words.
    var rest = q, hl = [];
    for (var k = i; k < w.length && rest; k++) {
      var part = letters ? w[k].txt : w[k].t9;
      var n = Math.min(part.length, rest.length);
      if (part.slice(0, n) !== rest.slice(0, n)) break;
      hl.push([w[k].at, n]);
      rest = rest.slice(n);
      if (n < part.length) break;
    }
    if (!rest) take((i === 0 ? 60 : 50) + Math.min(q.length, 20), hl);
  }
  if (!letters && q.length >= 2 && w.length >= q.length) {
    for (var s = 0; s + q.length <= w.length; s++) {
      var ok = true, ih = [];
      for (var m = 0; m < q.length; m++) { if (w[s + m].t9.charAt(0) !== q.charAt(m)) { ok = false; break; } ih.push([w[s + m].at, 1]); }
      if (ok) { take(40 + q.length, ih); break; }
    }
  }
  if (letters) {
    var at = e.name.toLowerCase().indexOf(q);
    if (at >= 0) take(30, [[at, q.length]]);
  } else {
    for (var j = 0; j < e.nums.length; j++) {
      var pos = e.nums[j].indexOf(q);
      if (pos < 0) continue;
      // Highlight on the stored number's own digits (the 0 form maps back to 44).
      var dpos = j === 0 ? pos : (pos === 0 ? 0 : pos + 1), dlen = j === 0 || pos > 0 ? q.length : q.length + 1;
      take((pos === 0 ? 35 : 20) + Math.min(q.length, 20), null, [dpos, dlen]);
    }
  }
  return best;
}
function hlName(name, ranges) {
  var marks = {};
  for (var r = 0; r < ranges.length; r++) {
    var at = ranges[r][0], left = ranges[r][1];
    for (var i = at; i < name.length && left > 0; i++) { if (t9Char(name.charAt(i))) { marks[i] = 1; left--; } }
  }
  var out = "";
  for (var j = 0; j < name.length; j++) out += marks[j] ? "<b>" + esc(name.charAt(j)) + "</b>" : esc(name.charAt(j));
  return out.replace(/<[/]b><b>/g, "");
}
function hlNum(num, range) {
  if (!range) return esc(num);
  var out = "", di = -1;
  for (var i = 0; i < num.length; i++) {
    var ch = num.charAt(i);
    if (ch >= "0" && ch <= "9") di++;
    var on = ch >= "0" && ch <= "9" && di >= range[0] && di < range[0] + range[1];
    out += on ? "<b>" + esc(ch) + "</b>" : esc(ch);
  }
  return out.replace(/<[/]b><b>/g, "");
}
function onDialInput() {
  updateDialBottomVisibility();
  if (historyTxSearch) {
    if (historyTimer) clearTimeout(historyTimer);
    historyTimer = setTimeout(loadHistory, PV.historyDebounceMs);
    return;
  }
  if (suggestTimer) clearTimeout(suggestTimer);
  suggestTimer = setTimeout(renderT9, PV.suggestDebounceMs);
}
function renderT9() {
  var el = document.getElementById("dial-suggestions");
  var raw = document.getElementById("dial-input").value.trim();
  if (!raw || historyTxSearch) { el.innerHTML = ""; return; }
  var letters = /[a-zA-Z]/.test(raw);
  var q = letters ? raw.toLowerCase() : digitsOnly(raw);
  if (!q) { el.innerHTML = ""; return; }
  // History callers first (recently in touch), then the contact book.
  // One entry per number; a named one replaces a nameless history caller.
  var pool = [], byNum = {};
  function add(e) {
    if (!e.digits) return;
    var at = byNum[e.digits];
    if (at === undefined) { byNum[e.digits] = pool.length; pool.push(e); }
    else if (!pool[at].name && e.name) pool[at] = e;
  }
  for (var k in callsCache) {
    var c = callsCache[k], num = histNumber(c);
    if (num && num !== "unknown") add(t9Entry(c.partner_name, num));
  }
  for (var t = 0; t < t9Corpus.length; t++) add(t9Corpus[t]);
  var hits = [];
  for (var i = 0; i < pool.length; i++) {
    var m = t9Match(pool[i], q, letters);
    if (m) hits.push({ e: pool[i], m: m, order: i });
  }
  hits.sort(function(a, b) { return (b.m.score - a.m.score) || (a.order - b.order); });
  hits = hits.slice(0, PV.suggestionsLimit);
  if (!hits.length) { el.innerHTML = '<div class="empty">' + (letters ? "No matching contacts" : "No matches \u2014 press \u{1F4DE} to dial " + esc(raw)) + '</div>'; return; }
  el.innerHTML = hits.map(function(h) {
    var e = h.e, name = e.name || e.num;
    return '<div class="sugg-row" data-num="' + esc(e.num) + '"><div><div class="n">' + (e.name ? hlName(e.name, h.m.hl) : hlNum(e.num, h.m.numHl)) + '</div>'
      + (e.name ? '<div class="s">' + hlNum(e.num, h.m.numHl) + '</div>' : '') + '</div><button class="call" title="Call ' + esc(name) + '">\u{1F4DE}</button></div>';
  }).join("");
}
// Tap a match to put its number in the box; its \u{1F4DE} calls straight away.
document.getElementById("dial-suggestions").addEventListener("click", function(e) {
  var row = e.target.closest(".sugg-row");
  if (!row) return;
  var num = row.getAttribute("data-num");
  if (e.target.closest(".call")) { dialOut(num); return; }
  document.getElementById("dial-input").value = num;
  onDialInput();
});
document.getElementById("dial-input").addEventListener("input", onDialInput);
document.getElementById("dial-input").addEventListener("keydown", function(e) { if (e.key === "Enter" && !historyTxSearch) { e.preventDefault(); dialAction(); } });
function esc(s) { return String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/'/g,"&#39;").replace(/"/g,"&quot;"); }
// Combined color+direction indicator: \u25B2 outgoing / \u25BC incoming, colored green
// (completed in), blue (completed out), or red (missed/rejected/aborted).
function dirIcon(dir, missed) {
  var shape = dir === "out" ? "\u25B2" : "\u25BC";
  var cls = missed ? "missed" : dir;
  return '<span class="dir-ic ' + cls + '">' + shape + '</span>';
}

// \u2500\u2500 call actions \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// \u2500\u2500 call logging (D1 call_log) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// The browser softphone talks straight to Asterisk over WSS \u2014 no server-side
// AGI hook sees these calls \u2014 so the client logs ring/answer/hangup itself
// via the same /call-event endpoint the Asterisk-side integration uses.
function logCallEvent(event, extra) {
  if (!currentCall) return;
  var body = new URLSearchParams();
  body.set("event", event);
  body.set("callId", currentCall.id);
  body.set("caller", currentCall.remote || "unknown");
  body.set("did", "");
  body.set("direction", currentCall.dir === "out" ? "outgoing" : "incoming");
  // Which extension this softphone is, so the call shows under it in Odoo.
  var acc = activeAccount();
  if (acc && acc.username) body.set("ext", String(acc.username));
  if (extra) { for (var k in extra) body.set(k, String(extra[k])); }
  return fetch(API + "/call-event", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString() }).catch(function() {});
}
function logHangup() {
  if (!currentCall) return;
  var dur = currentCall.answeredAt ? Math.round((Date.now() - currentCall.answeredAt) / 1000) : 0;
  // The hangup reply comes back once the number has a contact (an existing
  // one, or a new "dd/mm/yy number" one) \u2014 refresh so the name shows.
  var p = logCallEvent("hangup", { duration: dur });
  if (p) p.then(refreshCallLists);
}
function refreshCallLists() {
  if (onDialView()) loadHistory();
}

function dialAction() {
  var num = document.getElementById("dial-input").value.trim();
  if (currentCall) { hangup(); return; }
  if (!num) return;
  dialOut(num);
}
function dialOut(num) {
  if (!num) return;
  num = String(num).replace(/[^+0-9*#]/g, "");
  if (num.startsWith("0")) num = "+" + SERVER.countryCode + num.slice(1);
  // Asterisk strips the leading "+" from caller ID (see caller-lookup /
  // history), so a redialled/history number often arrives here as bare
  // digits with the country code already included (e.g. "441283246490")
  // instead of "+441234567890". Left alone, that reaches the trunk
  // unnormalized and gets rejected outright (voip.ms: 403, Twilio: 400
  // Invalid phone number) instead of ringing. Only real international
  // numbers are this long \u2014 short internal extensions (200/201/202) and
  // feature codes are never mistaken for one.
  else if (!num.startsWith("+") && num.length > 6) num = "+" + num;
  if (!sipUA) { setStatus("\u274C Not registered", true); return; }
  var acc = activeAccount();
  var domain = (acc && acc.domain) || PV.defaultDomain;
  var target = SIP.UserAgent.makeURI("sip:" + num + "@" + domain);
  // earlyMedia: apply the SDP from a 183 Session Progress so the carrier's
  // in-band ringback tone is actually heard (SIP.js ignores it by default).
  var inviter = new SIP.Inviter(sipUA, target, { earlyMedia: true, sessionDescriptionHandlerOptions: { constraints: { audio: true, video: false } } });
  sipSession = inviter;
  currentCall = { id: inviter.request.callId, dir: "out", remote: num, state: "calling" };
  renderCallUI();
  logCallEvent("ring");
  inviter.stateChange.on(function(state) {
    if (state === SIP.SessionState.Established) { stopRingback(); ensureRemoteAudio(inviter); currentCall.state = "active"; currentCall.answeredAt = Date.now(); renderCallUI(); logCallEvent("answer"); }
    if (state === SIP.SessionState.Terminated) { logHangup(); resetCall(); }
  });
  attachRemoteAudio(inviter);
  inviter.invite({ requestDelegate: { onProgress: function(response) {
    // 183 with SDP = carrier is sending ringback as audio; 180 without = we
    // have to make the ringing tone ourselves.
    var hasMedia = !!(response && response.message && response.message.body);
    if (hasMedia) stopRingback(); else if (currentCall && currentCall.state === "calling") startRingback();
  } } });
}
function hangup() {
  stopRingtone();
  if (sipSession) {
    // dispose() is only a real hangup (sends BYE) once a call is actually
    // established \u2014 before that (Initial/Establishing, i.e. our "ringing"
    // or "calling" state) it's a silent local no-op that never reaches the
    // far end, so a still-ringing call would just keep ringing there.
    // Incoming needs a proper decline (reject, a SIP rejection response);
    // outgoing needs a proper cancel (a SIP CANCEL of the pending INVITE).
    // The dialplan rings 200/201/202 in parallel (Dial(PJSIP/200&PJSIP/201&
    // PJSIP/202,30)) \u2014 a default reject() sends 480 (Temporarily
    // Unavailable), which SIP treats as a per-branch failure only, so
    // Asterisk correctly keeps ringing the other extensions. 603 (Decline)
    // is the standard "the person explicitly doesn't want this call"
    // response, which a forking Dial() should treat as cancelling the
    // whole attempt, not just this branch.
    var stillRinging = currentCall && (currentCall.state === "ringing" || currentCall.state === "calling");
    if (stillRinging && currentCall.dir === "in" && typeof sipSession.reject === "function") sipSession.reject({ statusCode: 603 }).catch(function() {});
    else if (stillRinging && currentCall.dir === "out" && typeof sipSession.cancel === "function") sipSession.cancel().catch(function() {});
    else sipSession.dispose();
  }
  resetCall();
}
function answerCall() {
  if (!sipSession || !currentCall || currentCall.dir !== "in" || currentCall.state !== "ringing") return;
  stopRingtone();
  attachRemoteAudio(sipSession);
  var ac = new (window.AudioContext || window.webkitAudioContext)();
  ac.resume().catch(function() {});
  sipSession.accept({ sessionDescriptionHandlerOptions: { constraints: { audio: true, video: false } } }).catch(function() {});
}
function resetCall() {
  stopRingtone();
  stopRingback();
  clearRemoteAudio();
  flushCallSave();
  if (heldSession) { try { heldSession.dispose(); } catch(e) {} heldSession = null; }
  sipSession = null; currentCall = null; onHold = false; muted = false;
  renderCallUI();
  if (onDialView()) loadHistory();
}
// The dialpad is only useful before a call connects \u2014 during one, DTMF
// lives in the in-call panel's Keypad tab. The banner \u2328\uFE0F button jumps to
// that tab and back to whichever tab was open before.
var tabBeforeKeypad = "notes";
function toggleInCallKeypad() {
  if (!inCall()) return;
  if (activeCpTab === "keypad") switchCallTab(tabBeforeKeypad || "notes");
  else { tabBeforeKeypad = activeCpTab; switchCallTab("keypad"); }
}
function updateDialBottomVisibility() {
  // Keypad (+ the history list, + the plain call button) hides for the whole
  // life of a call \u2014 ringing/dialling included, not just once connected \u2014
  // so the in-call tabs showing who it is take over the screen right away.
  // The Keypad tab (and banner-keypad shortcut) only appear once the call
  // is actually connected \u2014 DTMF is meaningless before that.
  var inAnyCall = !!currentCall;
  var connected = !!(currentCall && currentCall.state === "active");
  document.getElementById("nav-dial").classList.toggle("in-call", inAnyCall);
  document.getElementById("nav-dial").setAttribute("aria-label", inAnyCall ? "Hang up" : "Dial");
  // Typing shows T9 matches in place of the list \u2014 unless \u{1F4AC} is on, when the
  // box searches transcripts and the list itself shows the hits.
  var typed = !!document.getElementById("dial-input").value.trim() && !historyTxSearch;
  document.getElementById("dialpad").classList.toggle("hidden", inAnyCall || !dialKeypadOpen);
  document.getElementById("dial-entry").classList.toggle("hidden", inAnyCall || !(dialKeypadOpen || typed || historyTxSearch));
  document.getElementById("dial-callbar").classList.toggle("hidden", inAnyCall);
  document.getElementById("hist-toolbar").classList.toggle("hidden", inAnyCall);
  document.getElementById("history-list").classList.toggle("hidden", inAnyCall || typed);
  document.getElementById("dial-suggestions").classList.toggle("hidden", inAnyCall || !typed);
  document.getElementById("banner-keypad").classList.toggle("hidden", !connected);
  document.getElementById("banner-keypad").classList.toggle("active", connected && activeCpTab === "keypad");
  document.getElementById("cp-tab-keypad").classList.toggle("hidden", !connected);
}
function renderCallUI() {
  var banner = document.getElementById("call-banner");
  var btnCall = document.getElementById("btn-call");
  var btnEnd = document.getElementById("btn-end");
  if (!currentCall) {
    banner.classList.add("hidden");
    btnCall.classList.remove("hidden"); btnCall.classList.remove("hangup");
    btnEnd.classList.add("hidden");
    showCallPanel(false);
    updateDialBottomVisibility();
    return;
  }
  banner.classList.remove("hidden");
  document.getElementById("banner-remote").textContent = currentCall.remote;
  var si = { ringing: "\u{1F514} Incoming\u2026", calling: "\u{1F4DE} Calling\u2026", active: "\u{1F50A} Connected" }[currentCall.state] || currentCall.state;
  document.getElementById("banner-state").textContent = (currentCall.dir === "in" ? "\u2B07 " : "\u2B06 ") + si;
  document.getElementById("banner-answer").classList.toggle("hidden", !(currentCall.state === "ringing" && currentCall.dir === "in"));
  btnCall.classList.add("hidden");
  btnEnd.classList.remove("hidden");
  showCallPanel(true);
  updateDialBottomVisibility();
}

function setStatus(msg, isErr) {
  var el = document.getElementById("phone-status");
  el.textContent = msg;
  el.className = "reg-status" + (isErr ? " err" : " ok");
  var dot = document.getElementById("status-dot");
  if (dot) {
    var state = isErr ? "err" : (/registered/i.test(msg) && !/unregistered/i.test(msg)) ? "ok" : "warn";
    dot.className = "status-dot " + state;
    dot.title = msg;
  }
}

// \u2500\u2500 history \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
var historyTimer = null;
var historyTxSearch = false;
// \u{1F4AC} beside the dial box: the box searches what was said on calls instead
// of T9-matching names/numbers.
function toggleTranscriptSearch() {
  historyTxSearch = !historyTxSearch;
  document.getElementById("hist-tx-btn").classList.toggle("on", historyTxSearch);
  var inp = document.getElementById("dial-input");
  inp.placeholder = historyTxSearch ? "Search transcripts" : "Number or name (T9)";
  inp.value = "";
  inp.focus();
  onDialInput();
  loadHistory();
}
function historyQuery() { return historyTxSearch ? document.getElementById("dial-input").value.trim() : ""; }
function loadHistory() {
  var q = historyQuery();
  var el = document.getElementById("history-list");
  if (historyTxSearch && !q) { el.innerHTML = '<div class="empty">Type words to find in call transcripts</div>'; return; }
  if (!el.querySelector(".hist-row")) el.innerHTML = '<div class="empty">Loading\u2026</div>';
  fetch(API + "/call-history?limit=" + PV.historyLimit + "&q=" + encodeURIComponent(q) + (historyTxSearch ? "&in=transcript" : "")).then(function(r){return r.json();}).then(function(d){
    if (q !== historyQuery()) return;
    var calls = d.calls || [];
    if (!calls.length) { el.innerHTML = '<div class="empty">' + (historyTxSearch ? "No transcripts mention that" : q ? "No matching calls" : "No calls yet") + '</div>'; return; }
    if (selected && selected.type === "call") deselect();
    el.innerHTML = renderHistory(calls);
  }).catch(function(){ el.innerHTML = '<div class="empty">Error loading history</div>'; });
}
function renderHistory(calls) {
  callsCache = {};
  var html = "", day = "";
  for (var i = 0; i < calls.length; i++) {
    var c = calls[i];
    var dayKey = c.start_date ? fmtDay(c.start_date) : "";
    if (dayKey && dayKey !== day) { day = dayKey; html += '<div class="day-head">' + day + '</div>'; }
    html += renderHistoryRow(c);
  }
  return html;
}
// One line per call: direction, time, caller name, then fixed slots for the
// notes / transcript / recording icons so rows line up. The number only
// stands in when there's no name.
function renderHistoryRow(c) {
  var dir = c.direction === "outgoing" ? "out" : "in";
  var missed = c.state === "missed" || c.state === "rejected" || c.state === "aborted";
  var name = (c.partner_name || "").trim();
  var num = (c.phone_number && c.phone_number !== "unknown") ? String(c.phone_number) : (c.did || "unknown");
  var d = c.start_date ? new Date(c.start_date) : null;
  var when = d ? ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2) : "";
  var key = "h-" + c.id;
  callsCache[key] = c;
  var note = c.has_notes ? '<button class="h-ic h-note" title="Notes">\u{1F4DD}</button>' : '<span class="h-ic"></span>';
  var tx = c.has_transcript ? '<button class="h-ic h-tx" title="Transcript">\u{1F4AC}</button>'
    : c.has_recording ? '<button class="h-ic h-tx dim" title="Transcribe">\u{1F4AC}</button>' : '<span class="h-ic"></span>';
  var play = c.has_recording ? '<button class="h-ic hist-play" title="Play recording">\u25B6</button>' : '<span class="h-ic"></span>';
  return '<div class="hist-row" data-key="' + esc(key) + '">'
    + '<div class="hist-main">' + dirIcon(dir, missed) + '<span class="h-time">' + when + '</span>'
    + '<span class="who">' + esc(name || num) + (c.voicemail ? ' <span title="Voicemail">\u{1F4FC}</span>' : '') + '</span>'
    + note + tx + play + '</div>'
    + (c.match ? '<div class="hist-match">' + markMatch(c.match, historyQuery()) + '</div>' : '')
    + '</div>';
}
// Row icon taps shared by History and a contact's Calls tab: \u25B6 plays under
// the row, \u{1F4DD} / \u{1F4AC} open the call on its Notes / Transcript tab.
function histIconTap(e, row, c) {
  var key = row.getAttribute("data-key");
  if (e.target.closest(".hist-play")) { toggleRecording(row, c); return true; }
  if (e.target.closest(".h-note")) { selectItem("call", c, key); openCallDetailView(c, { tab: "notes" }); return true; }
  if (e.target.closest(".h-tx")) { selectItem("call", c, key); openCallDetailView(c, { tab: "transcript" }); return true; }
  return false;
}
// Escaped text with the (case-insensitive) search term highlighted.
function markMatch(text, term) {
  var i = term ? text.toLowerCase().indexOf(term.toLowerCase()) : -1;
  if (i < 0) return esc(text);
  // Keep the hit on screen when it's deep into a long line.
  if (i > 40) { text = "\u2026" + text.slice(i - 30); i = 31; }
  return esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + term.length)) + '</mark>' + esc(text.slice(i + term.length));
}
function fmtDur(sec) {
  sec = Math.round(sec || 0);
  if (sec < 60) return sec + "s";
  var m = Math.floor(sec / 60), s = sec % 60;
  return m + ":" + ("0" + s).slice(-2);
}
function fmtDay(ts) {
  var d = new Date(ts), now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  var y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}

document.getElementById("history-list").addEventListener("click", function(e) {
  var row = e.target.closest(".hist-row");
  if (!row) return;
  var key = row.getAttribute("data-key");
  var c = callsCache[key];
  if (!c) return;
  if (e.target.closest(".hist-player")) return;
  if (histIconTap(e, row, c)) return;
  // A transcript search hit opens straight into the call's details.
  if (c.match) { selectItem("call", c, key); openCallDetailView(c, { tab: "transcript", highlight: historyQuery() }); return; }
  // Otherwise selecting is all a tap does; the toolbar above the list acts on the selection.
  if (row.classList.contains("selected")) deselect(); else selectItem("call", c, key);
});
// Recording player, opened under the row. The audio is fetched as a blob so
// seeking works even though Asterisk serves it without range support.
function toggleRecording(row, c) {
  var open = row.querySelector(".hist-player");
  if (open) { closeRecording(open); return; }
  var prev = document.querySelectorAll(".hist-player");
  for (var i = 0; i < prev.length; i++) closeRecording(prev[i]);
  var box = document.createElement("div");
  box.className = "hist-player";
  row.appendChild(box);
  row.querySelector(".hist-play").textContent = "\u25A0";
  fillRecordingPlayer(box, c, true);
}
// Audio player + transcript into box (shared by History rows and the call
// detail Transcript tab). Tapping a transcript line seeks the audio there.
// highlight: optional search term whose first matching line is marked and
// scrolled into view.
function fillRecordingPlayer(box, c, autoplay, highlight) {
  box.innerHTML = '<div class="hist-audio">' + (c.has_recording ? "Loading recording\u2026" : "No recording for this call") + '</div><div class="hist-transcript"></div>';
  var audioBox = box.querySelector(".hist-audio"), tBox = box.querySelector(".hist-transcript");
  if (c.has_recording) {
    fetch(API + "/recording?call_id=" + encodeURIComponent(c.rec_call_id || c.call_id)).then(function(r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.blob();
    }).then(function(blob) {
      if (!box.parentNode || !box.contains(audioBox)) return;
      var a = document.createElement("audio");
      a.controls = true;
      a.src = URL.createObjectURL(blob);
      audioBox.textContent = "";
      audioBox.appendChild(a);
      if (autoplay) a.play().catch(function() {});
    }).catch(function(err) {
      audioBox.textContent = "Couldn't load recording (" + err.message + ")";
    });
  }
  if (!c.call_id || (!c.has_recording && !c.has_transcript)) return;
  tBox.textContent = "Loading transcript\u2026";
  fetch(API + "/transcript?call_id=" + encodeURIComponent(c.rec_call_id || c.call_id)).then(function(r) { return r.json(); }).then(function(d) {
    if (!box.contains(tBox)) return;
    renderTranscript(tBox, c, d.transcript);
    if (highlight) highlightTranscriptLine(tBox, highlight);
  }).catch(function() { tBox.textContent = "Couldn't load transcript"; });
}
function highlightTranscriptLine(tBox, term) {
  var lines = tBox.querySelectorAll(".tl"), t = term.toLowerCase();
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].textContent.toLowerCase().indexOf(t) < 0) continue;
    lines[i].classList.add("hit");
    lines[i].scrollIntoView({ block: "center" });
    return;
  }
}
function stopRecordingPlayer(box) {
  var a = box && box.querySelector("audio");
  if (a) { a.pause(); URL.revokeObjectURL(a.src); }
}
// transcript: null = never transcribed (offer the button), "" = nothing said.
function renderTranscript(tBox, c, transcript) {
  if (transcript === null || transcript === undefined) {
    tBox.innerHTML = '<button>Transcribe</button>';
    tBox.querySelector("button").onclick = function() {
      tBox.textContent = "Transcribing\u2026 (about 10s per minute of call)";
      fetch(API + "/transcribe?call_id=" + encodeURIComponent(c.rec_call_id || c.call_id), { method: "POST" }).then(function(r) { return r.json(); }).then(function(d) {
        if (d.error) { tBox.textContent = "Transcription failed: " + d.error; return; }
        c.has_transcript = 1;
        renderTranscript(tBox, c, d.transcript);
      }).catch(function(err) { tBox.textContent = "Transcription failed: " + err.message; });
    };
    return;
  }
  if (!transcript) { tBox.textContent = "(no speech detected)"; return; }
  var lines = transcript.split(String.fromCharCode(10)), html = "";
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i], close = line.indexOf("] ");
    var ts = (line.charAt(0) === "[" && close > 0) ? line.slice(1, close) : "";
    var parts = ts.split(":");
    var sec = parts.length === 2 ? parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10) : 0;
    var text = ts ? line.slice(close + 2) : line, who = "", cls = "tl";
    if (text.indexOf("Us: ") === 0) { who = "Us"; cls = "tl us"; text = text.slice(4); }
    else if (text.indexOf("Them: ") === 0) { who = (c.partner_name || "").trim().split(" ")[0] || "Them"; text = text.slice(6); }
    html += '<div class="' + cls + '" data-t="' + sec + '">' + (ts ? '<span class="ts">' + esc(ts) + '</span>' : '') + (who ? '<span class="who">' + esc(who) + ':</span>' : '') + esc(text) + '</div>';
  }
  tBox.innerHTML = html;
  tBox.onclick = function(e) {
    var tl = e.target.closest(".tl"), a = tBox.parentNode.querySelector("audio");
    if (!tl || !a) return;
    a.currentTime = parseInt(tl.getAttribute("data-t"), 10) || 0;
    a.play().catch(function() {});
  };
}
function closeRecording(box) {
  stopRecordingPlayer(box);
  var btn = box.parentNode.querySelector(".hist-play");
  if (btn) btn.textContent = "\u25B6";
  box.parentNode.removeChild(box);
}
function histSelectedCall() { return (selected && selected.type === "call") ? selected.data : null; }
function histNumber(c) { return (c.phone_number && c.phone_number !== "unknown") ? c.phone_number : (c.did || ""); }
function updateHistToolbar() {
  var c = histSelectedCall();
  var num = c ? histNumber(c) : "";
  var can = { call: !!(num && /^[+0-9*#]/.test(num)), email: !!(c && c.partner_email), details: !!c, contact: !!(c && c.partner_id) };
  var btns = document.querySelectorAll("#hist-toolbar button");
  for (var i = 0; i < btns.length; i++) btns[i].disabled = !can[btns[i].getAttribute("data-action")];
}
function histAction(action) {
  var c = histSelectedCall();
  if (!c) return;
  if (action === "call") dialOut(histNumber(c));
  else if (action === "email") openCompose(c.partner_email, "", "");
  else if (action === "details") openCallDetailView(c);
  else if (action === "contact") openContactById(c.partner_id);
}
function openContactById(id) {
  if (!id) return;
  var c = selected && selected.data;
  openContactFull({ id: id, name: (c && c.partner_name) || "" });
}
function fmtTime(ts) {
  var d = new Date(ts);
  var now = new Date();
  var sameDay = d.toDateString() === now.toDateString();
  var hh = ("0" + d.getHours()).slice(-2), mm = ("0" + d.getMinutes()).slice(-2);
  return sameDay ? hh + ":" + mm : d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) + " " + hh + ":" + mm;
}

// \u2500\u2500 favourites \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function renderFavourites() {
  var el = document.getElementById("fav-list");
  if (!favourites.length) { el.innerHTML = '<div class="empty">No favourites yet \u2014 tap \u2605 on a contact</div>'; return; }
  el.innerHTML = favourites.map(function(f) {
    var num = f.num || "";
    return '<div class="contact-row" data-id="' + esc(f.id) + '"><div><div class="cname">' + esc(f.name || f.id) + '</div>' + (num ? '<div class="sub">' + esc(num) + '</div>' : '') + '</div><button class="fav-star on" data-id="' + esc(f.id) + '">\u2605</button>' + (num ? '<button class="mini-call" data-num="' + esc(num) + '">\u{1F4DE}</button>' : '') + '</div>';
  }).join("");
}
document.getElementById("fav-list").addEventListener("click", function(e) {
  var fav = e.target.closest(".fav-star");
  if (fav) {
    toggleFav({ id: fav.getAttribute("data-id") });
    renderFavourites();
    return;
  }
  var mini = e.target.closest(".mini-call");
  if (mini) { prepareDial(mini.getAttribute("data-num")); return; }
});

// \u2500\u2500 contacts (D1 cache, debounced type-ahead) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
var contactTimer = null;
var contactsCache = {};
function loadContacts(q) {
  var el = document.getElementById("contacts-list");
  el.innerHTML = '<div class="empty">Loading\u2026</div>';
  fetch(API + "/contacts/cache?q=" + encodeURIComponent(q) + "&limit=" + PV.contactsLimit).then(function(r){return r.json();}).then(function(d){
    var list = d.contacts || [];
    contactsCache = {};
    for (var i = 0; i < list.length; i++) contactsCache[list[i].id] = list[i];
    if (!list.length) { el.innerHTML = '<div class="empty">No contacts found</div>'; return; }
    el.innerHTML = list.map(function(c) {
      var num = c.mobile || c.phone || "";
      var sel = (activeContact && activeContact.id === c.id) ? " selected" : "";
      var star = '<button class="fav-star' + (isFav(c.id) ? ' on' : '') + '" data-id="' + esc(c.id) + '">\u2605</button>';
      return '<div class="contact-row' + sel + '" data-id="' + esc(c.id) + '" data-key="c-' + esc(c.id) + '"><div style="flex:1;min-width:0"><div class="cname"><span class="cname-text" title="Click to rename">' + esc(c.name) + '</span>' + (c.is_company ? " \u{1F3E2}" : "") + '<span class="cname-status"></span></div>' + (num ? '<div class="sub">' + esc(num) + '</div>' : '') + (c.email ? '<div class="sub">' + esc(c.email) + '</div>' : '') + '</div>' + star + (num ? '<button class="mini-call" data-num="' + esc(num) + '">\u{1F4DE}</button>' : '') + '</div>';
    }).join("");
  }).catch(function(){ el.innerHTML = '<div class="empty">Error</div>'; });
}
document.getElementById("contact-search").addEventListener("input", function(e) {
  var q = e.target.value.trim();
  if (contactTimer) clearTimeout(contactTimer);
  contactTimer = setTimeout(function() { loadContacts(q); }, PV.contactsDebounceMs);
});
document.getElementById("contacts-list").addEventListener("click", function(e) {
  var fav = e.target.closest(".fav-star");
  if (fav) {
    e.stopPropagation();
    var c = contactsCache[fav.getAttribute("data-id")];
    if (c) {
      toggleFav(c);
      fav.classList.toggle("on", isFav(c.id));
    }
    return;
  }
  var mini = e.target.closest(".mini-call");
  if (mini) { prepareDial(mini.getAttribute("data-num")); return; }
  if (e.target.closest(".cname-edit")) return;
  var nameEl = e.target.closest(".cname-text");
  if (nameEl) { startContactRename(nameEl); return; }
  var row = e.target.closest(".contact-row");
  if (!row) return;
  var c = contactsCache[row.getAttribute("data-id")];
  if (!c) return;
  rowClick(row.getAttribute("data-key"), "contact", c, function() { openContactFull(c); });
});

// \u2500\u2500 contact rename (click the name; autosaves to Odoo) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function startContactRename(nameEl) {
  var row = nameEl.closest(".contact-row");
  var c = contactsCache[row.getAttribute("data-id")];
  if (!c) return;
  var status = row.querySelector(".cname-status");
  var inp = document.createElement("input");
  inp.className = "cname-edit";
  inp.value = c.name;
  nameEl.replaceWith(inp);
  inp.focus();
  inp.select();
  var saved = c.name, timer = null, done = false;
  function setStatus(t, err) { status.textContent = t; status.classList.toggle("err", !!err); }
  function save() {
    clearTimeout(timer); timer = null;
    var name = inp.value.trim();
    if (!name || name === saved) return;
    setStatus("Saving\u2026");
    fetch(API + "/contacts/" + c.id, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name }) })
      .then(function(r) { return r.json().then(function(d) { if (!r.ok) throw new Error(d.error || "failed"); return d; }); })
      .then(function() {
        saved = name;
        c.name = name;
        for (var i = 0; i < favourites.length; i++) if (String(favourites[i].id) === String(c.id)) { favourites[i].name = name; persistFavourites(); }
        if (activeContact && activeContact.id === c.id) activeContact.name = name;
        setStatus("Saved");
        setTimeout(function() { if (status.textContent === "Saved") setStatus(""); }, 2000);
      })
      .catch(function() { setStatus("Not saved", true); });
  }
  function finish(revert) {
    if (done) return;
    done = true;
    if (revert) { clearTimeout(timer); inp.value = saved; } else save();
    var span = document.createElement("span");
    span.className = "cname-text";
    span.title = "Click to rename";
    span.textContent = inp.value.trim() || saved;
    inp.replaceWith(span);
  }
  inp.addEventListener("input", function() {
    setStatus("");
    clearTimeout(timer);
    timer = setTimeout(save, PV.contactRenameAutosaveMs);
  });
  inp.addEventListener("keydown", function(e) {
    if (e.key === "Enter") { e.preventDefault(); finish(false); }
    else if (e.key === "Escape") { e.preventDefault(); finish(true); }
  });
  inp.addEventListener("blur", function() { finish(false); });
}

// \u2500\u2500 contact selection + messages \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
var activeContact = null;
function prepareDial(num) {
  document.getElementById("dial-input").value = num || "";
  document.getElementById("dial-suggestions").innerHTML = "";
  dialKeypadOpen = true;
  switchView("dial");
  onDialInput();
}
function openMessages() { switchView("messages"); }

// \u2500\u2500 selection (click = select, double-click = open) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
var selected = null;
var clickTimer = null, pendingKey = null;
var callsCache = {};
var messagesCache = {};
var NL = String.fromCharCode(10);

function rowClick(key, type, data, openFn) {
  if (clickTimer && pendingKey === key) {
    clearTimeout(clickTimer); clickTimer = null; pendingKey = null;
    openFn();
    return;
  }
  selectItem(type, data, key);
  pendingKey = key;
  if (clickTimer) clearTimeout(clickTimer);
  clickTimer = setTimeout(function() { clickTimer = null; pendingKey = null; }, PV.doubleTapMs);
}
function selectItem(type, data, key) {
  selected = { type: type, data: data };
  var rows = document.querySelectorAll(".hist-row.selected,.contact-row.selected,.msg-row.selected");
  for (var i = 0; i < rows.length; i++) rows[i].classList.remove("selected");
  var el = document.querySelector('[data-key="' + key + '"]');
  if (el) el.classList.add("selected");
  if (type === "contact") activeContact = { id: data.id, name: data.name, email: data.email || "", phone: data.phone || data.mobile || "" };
  renderActionBar();
}
function deselect() {
  selected = null;
  var rows = document.querySelectorAll(".hist-row.selected,.contact-row.selected,.msg-row.selected");
  for (var i = 0; i < rows.length; i++) rows[i].classList.remove("selected");
  document.getElementById("action-bar").classList.add("hidden");
  updateHistToolbar();
}
function renderActionBar() {
  var bar = document.getElementById("action-bar");
  updateHistToolbar();
  if (selected && selected.type === "call") { bar.classList.add("hidden"); bar.innerHTML = ""; return; }
  if (!selected) { bar.classList.add("hidden"); bar.innerHTML = ""; return; }
  var h = "";
  if (selected.type === "contact") {
    var c = selected.data;
    var num = c.phone || c.mobile || "";
    h = (num ? '<button class="green" onclick="prepareDialSelected()">\u{1F4DE} Dial</button>' : '') + '<button onclick="openMessages()">\u{1F4AC} Messages</button>' + '<button class="primary" onclick="openContactFull()">\u{1F464} Open</button>';
  } else if (selected.type === "message") {
    h = '<button onclick="replyMessage()">\u21A9 Reply</button>' + '<button class="primary" onclick="openMessageFull()">\u{1F4D6} Open</button>';
  } else if (selected.type === "call") {
    var n = selected.data.phone_number;
    h = (n && /^[+0-9*#]/.test(n) ? '<button class="green" onclick="dialBackSelected()">\u{1F4DE} Call back</button>' : '') + '<button class="primary" onclick="openCallDetailView()">\u{1F4D6} Open</button>';
  }
  h += '<button class="x" onclick="deselect()">\u2715</button>';
  bar.innerHTML = h;
  bar.classList.remove("hidden");
}
function prepareDialSelected() { var c = selected && selected.data; prepareDial(c ? (c.phone || c.mobile || "") : ""); }
function dialBackSelected() { var c = selected && selected.data; if (c && c.phone_number) dialOut(c.phone_number); }

// \u2500\u2500 detail views (full-screen) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function openDetail() { document.getElementById("detail-modal").classList.remove("hidden"); }
function closeDetail() { document.getElementById("detail-modal").classList.add("hidden"); }
function setDetail(title, bodyHtml, footHtml) {
  document.getElementById("detail-title").textContent = title;
  document.getElementById("detail-body").innerHTML = bodyHtml;
  document.getElementById("detail-foot").innerHTML = footHtml || "";
  openDetail();
}
// \u2500\u2500 contact detail: in-screen view (Details / Sales / Messages / Calls) \u2500\u2500
var ctContact = null, ctReturnView = "contacts", ctData = null, ctLoaded = {};
var ctNameTimer = null;
function currentViewName() {
  var v = document.querySelector(".view:not(.hidden)");
  return v ? v.id.replace("view-", "") : "contacts";
}
function openContactFull(c) {
  c = c || (selected && selected.data);
  if (!c) return;
  var id = c.id || c.partner_id;
  if (!id) return;
  var from = currentViewName();
  if (from !== "contact-detail") ctReturnView = from;
  ctContact = { id: id, name: c.name || c.partner_name || "", phone: c.phone || "", mobile: c.mobile || "", email: c.email || "" };
  ctData = null; ctLoaded = {};
  deselect();
  renderContactHead();
  document.getElementById("ct-pane-details").innerHTML = '<div class="empty">Loading\u2026</div>';
  switchView("contact-detail");
  switchContactTab("details");
  // Cached details first (instant), then Odoo's address + totals on top.
  fetch(API + "/contacts/" + id + "?cached=1").then(function(r) { return r.json(); }).then(function(d) {
    if (!ctContact || ctContact.id !== id || ctData || !d || !d.contact) return;
    applyContactData(d);
  }).catch(function() {});
  fetch(API + "/contacts/" + id).then(function(r) { return r.json(); }).then(function(d) {
    if (!ctContact || ctContact.id !== id) return;
    if (!d || !d.contact) { if (!ctData) document.getElementById("ct-pane-details").innerHTML = '<div class="empty">Contact not found</div>'; else { ctData.totals = {}; renderContactTotals(); renderContactInfo(); } return; }
    applyContactData(d);
  }).catch(function() {
    if (!ctData) document.getElementById("ct-pane-details").innerHTML = '<div class="empty">Error loading contact</div>';
    else { ctData.totals = {}; renderContactTotals(); renderContactInfo(); }
  });
}
function applyContactData(d) {
  var first = !ctData;
  ctData = d;
  var k = d.contact;
  ctContact.phone = k.phone || ""; ctContact.mobile = k.mobile || ""; ctContact.email = k.email || "";
  // Leave the name alone once the box is showing \u2014 the user may be typing.
  if (first) ctContact.name = k.name || ctContact.name;
  renderContactHead();
  if (first) renderContactDetails();
  renderContactTotals();
  renderContactInfo();
  if (ctLoaded.calls) renderContactCalls();
}
function closeContactView() {
  flushContactName();
  ctContact = null;
  switchView(ctReturnView || "contacts");
}
function dialContactView() { if (ctContact) prepareDial(ctContact.phone || ctContact.mobile || ""); }
function renderContactHead() {
  var num = ctContact.phone || ctContact.mobile || "";
  document.getElementById("ct-name").textContent = ctContact.name || "Contact";
  document.getElementById("ct-sub").textContent = [num, ctContact.email].filter(Boolean).join(" \xB7 ");
  document.getElementById("ct-dial-btn").classList.toggle("hidden", !num);
}
function switchContactTab(tab) {
  var tabs = document.querySelectorAll("#view-contact-detail .cp-tab");
  for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle("active", tabs[i].getAttribute("data-tab") === tab);
  var panes = document.querySelectorAll("#view-contact-detail .cp-pane");
  for (var j = 0; j < panes.length; j++) panes[j].classList.toggle("hidden", panes[j].id !== "ct-pane-" + tab);
  if (!ctContact || ctLoaded[tab]) return;
  ctLoaded[tab] = true;
  if (tab === "sales") loadContactSales();
  if (tab === "messages") loadContactMessages();
  if (tab === "calls") renderContactCalls();
}
function renderContactDetails() {
  document.getElementById("ct-pane-details").innerHTML = '<div class="ct-label"><span>Name</span><span class="jot-status" id="ct-name-status"></span></div>'
    + '<input class="ct-name-edit" id="ct-name-input" type="text" autocomplete="off" value="' + esc(ctContact.name) + '">'
    + '<div class="ct-totals" id="ct-totals"></div><div id="ct-info"></div>';
  document.getElementById("ct-name-input").addEventListener("input", function() {
    setContactNameStatus("", false);
    if (ctNameTimer) clearTimeout(ctNameTimer);
    ctNameTimer = setTimeout(saveContactName, PV.contactRenameAutosaveMs);
  });
  document.getElementById("ct-name-input").addEventListener("blur", flushContactName);
}
// totals === null means the Odoo lookup is still on its way.
function renderContactTotals() {
  var el = document.getElementById("ct-totals");
  if (!el || !ctData) return;
  var t = ctData.totals, wait = t === null;
  t = t || {};
  function money(v) { return wait ? "\u2026" : (v == null ? "\u2014" : esc(fmtMoney(v))); }
  el.innerHTML = '<div class="ct-total"><div class="k">Total Sales Orders</div><div class="v">' + money(t.sales_total) + '</div>'
    + (t.sales_count != null ? '<div class="n">' + t.sales_count + ' order' + (t.sales_count === 1 ? "" : "s") + '</div>' : '') + '</div>'
    + '<div class="ct-total"><div class="k">Invoiced</div><div class="v">' + money(t.invoiced_total) + '</div></div>';
}
function renderContactInfo() {
  var el = document.getElementById("ct-info");
  if (!el || !ctData) return;
  var k = ctData.contact;
  var cityLine = [k.city, k.state, k.zip].filter(Boolean).join(", ");
  var addr = [k.street, k.street2, cityLine, k.country].filter(Boolean).join(NL);
  var rows = '<div class="detail-row"><span class="k">Address</span><span class="v ct-addr">' + (addr ? esc(addr) : (ctData.totals === null ? "\u2026" : "\u2014")) + '</span></div>';
  var fields = [["Phone", k.phone], ["Mobile", k.mobile], ["Email", k.email], ["Website", k.website], ["VAT", k.vat], ["Role", k["function"]]];
  for (var i = 0; i < fields.length; i++) {
    if (fields[i][1]) rows += '<div class="detail-row"><span class="k">' + fields[i][0] + '</span><span class="v">' + esc(fields[i][1]) + '</span></div>';
  }
  el.innerHTML = rows;
}
function flushContactName() {
  if (!ctNameTimer) return;
  clearTimeout(ctNameTimer);
  saveContactName();
}
function setContactNameStatus(text, err) {
  var st = document.getElementById("ct-name-status");
  if (!st) return;
  st.textContent = text;
  st.style.color = err ? "#f87171" : "";
}
function saveContactName() {
  ctNameTimer = null;
  var inp = document.getElementById("ct-name-input");
  if (!inp || !ctContact) return;
  var id = ctContact.id, name = inp.value.trim();
  if (!name || name === ctContact.name) return;
  setContactNameStatus("Saving\u2026", false);
  fetch(API + "/contacts/" + id, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name }) })
    .then(function(r) { return r.json(); }).then(function(d) {
      if (!d.ok) { setContactNameStatus("Save failed", true); return; }
      if (contactsCache[id]) contactsCache[id].name = name;
      if (activeContact && activeContact.id === id) activeContact.name = name;
      if (ctContact && ctContact.id === id) { ctContact.name = name; renderContactHead(); setContactNameStatus("Saved \u2713", false); }
    }).catch(function() { setContactNameStatus("Save failed", true); });
}
function loadContactSales() {
  var el = document.getElementById("ct-pane-sales"), id = ctContact.id;
  el.innerHTML = '<div class="empty">Loading\u2026</div>';
  fetch(API + "/quotations?contact=" + encodeURIComponent(id) + "&limit=" + PV.contactOrdersLimit).then(function(r) { return r.json(); }).then(function(d) {
    if (!ctContact || ctContact.id !== id) return;
    var list = d.quotations || [];
    if (!list.length) { el.innerHTML = '<div class="empty">No sales orders found</div>'; return; }
    el.innerHTML = list.map(function(o) {
      var when = o.date_order ? new Date(o.date_order.replace(" ", "T") + "Z").toLocaleDateString() : "";
      return '<div class="cp-quote-row"><div>'
        + '<div class="n">' + esc(o.name) + (when ? ' <span class="dt">' + esc(when) + '</span>' : '') + '</div>'
        + (o.state ? '<div class="st">' + esc(orderStateLabel(o.state)) + '</div>' : '')
        + '</div><span class="amt">' + esc(fmtMoney(o.amount_total || 0)) + '</span></div>';
    }).join("");
  }).catch(function() { el.innerHTML = '<div class="empty">Error loading sales orders</div>'; });
}
function orderStateLabel(st) {
  return { draft: "Quotation", sent: "Quotation sent", sale: "Sales order", done: "Locked", cancel: "Cancelled" }[st] || st;
}
function loadContactMessages() {
  var el = document.getElementById("ct-pane-messages"), id = ctContact.id;
  el.innerHTML = '<div class="empty">Loading\u2026</div>';
  fetch(API + "/messages?contact=" + encodeURIComponent(id) + "&limit=" + PV.contactMessagesLimit).then(function(r) { return r.json(); }).then(function(d) {
    if (!ctContact || ctContact.id !== id) return;
    var msgs = (d.messages || []).filter(function(m) { return m.source === "gmail" || m.message_type === "email"; });
    if (!msgs.length) { el.innerHTML = '<div class="empty">No emails found</div>'; return; }
    el.innerHTML = msgs.map(function(m) { return renderMessageRow(m); }).join("");
  }).catch(function() { el.innerHTML = '<div class="empty">Error loading emails</div>'; });
}
document.getElementById("ct-pane-messages").addEventListener("click", function(e) {
  var row = e.target.closest(".msg-row");
  if (!row) return;
  var m = messagesCache[row.getAttribute("data-key")];
  if (m) openMessageFull(m);
});
function renderContactCalls() {
  var el = document.getElementById("ct-pane-calls");
  if (!ctData) { el.innerHTML = '<div class="empty">Loading\u2026</div>'; return; }
  var calls = ctData.calls || [];
  el.innerHTML = calls.length ? renderHistory(calls) : '<div class="empty">No calls yet</div>';
}
document.getElementById("ct-pane-calls").addEventListener("click", function(e) {
  var row = e.target.closest(".hist-row");
  if (!row) return;
  var c = callsCache[row.getAttribute("data-key")];
  if (!c || e.target.closest(".hist-player")) return;
  if (histIconTap(e, row, c)) return;
  selectItem("call", c, row.getAttribute("data-key"));
  openCallDetailView(c);
});
// \u2500\u2500 call detail: in-screen view (Details / Notes / Jot) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// A drill-down from History, not a dialog \u2014 replaces the whole screen like
// any other view (see switchView), with a back arrow to return.
var cdReturnView = "dial";
var cdCall = null, cdTranscriptLoaded = false, cdHighlight = "";
var cdOpenCallId = null, cdLoadedNotes = {}, cdJotData = null, activeCdTab = "details";
var cdJot = null;


// opts.tab picks the starting tab; opts.highlight marks a transcript line.
function openCallDetailView(c, opts) {
  c = c || (selected && selected.data);
  if (!c) return;
  opts = opts || {};
  destroyCallDetailEditors();
  cdCall = c; cdTranscriptLoaded = false; cdHighlight = opts.highlight || "";
  cdReturnView = currentViewName() === "contact-detail" ? "contact-detail" : "dial";
  var name = (c.partner_name || "").trim();
  var num = c.phone_number || c.did || "";
  document.getElementById("cd-caller-name").textContent = name || num || "Unknown";
  document.getElementById("cd-caller-sub").textContent = name ? num : "";
  document.getElementById("cd-callback-btn").classList.toggle("hidden", !(num && /^[+0-9*#]/.test(num)));
  renderCallDetailsPane(c);
  switchView("call-detail");
  switchCallDetailTab(opts.tab || "jot");
  loadCallDetailNotes(c.call_id || null);
}

function renderCallDetailsPane(c) {
  var dur = c.duration > 0 ? fmtDur(c.duration) : "\u2014";
  var when = c.start_date ? new Date(c.start_date).toLocaleString() : "\u2014";
  var rows = '<div class="detail-row"><span class="k">Number</span><span class="v">' + esc(c.phone_number || c.did || "unknown") + '</span></div>'
    + '<div class="detail-row"><span class="k">Direction</span><span class="v">' + esc(c.direction || "incoming") + '</span></div>'
    + '<div class="detail-row"><span class="k">State</span><span class="v">' + esc(c.state || "") + '</span></div>'
    + '<div class="detail-row"><span class="k">When</span><span class="v">' + esc(when) + '</span></div>'
    + '<div class="detail-row"><span class="k">Duration</span><span class="v">' + esc(dur) + '</span></div>'
    + (c.partner_name ? '<div class="detail-row"><span class="k">Contact</span><span class="v">' + esc(c.partner_name) + '</span></div>' : '');
  document.getElementById("cd-pane-details").innerHTML = rows;
}

function closeCallDetailView() {
  destroyCallDetailEditors();
  switchView(cdReturnView);
}

function switchCallDetailTab(tab) {
  activeCdTab = tab;
  var tabs = document.querySelectorAll("#view-call-detail .cp-tab");
  for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle("active", tabs[i].getAttribute("data-tab") === tab);
  var panes = document.querySelectorAll("#view-call-detail .cp-pane");
  for (var j = 0; j < panes.length; j++) panes[j].classList.toggle("hidden", panes[j].id !== "cd-pane-" + tab);
  if (tab === "jot" && !cdJot) initCallDetailJot();
  if (tab === "transcript" && !cdTranscriptLoaded && cdCall) {
    cdTranscriptLoaded = true;
    fillRecordingPlayer(document.getElementById("cd-pane-transcript"), cdCall, false, cdHighlight);
  }
}

function loadCallDetailNotes(callId) {
  cdOpenCallId = callId;
  cdLoadedNotes = {}; cdJotData = null;
  document.getElementById("cd-pane-notes").innerHTML = '<div class="empty">Loading\u2026</div>';
  if (!callId) { renderCallDetailNotesPane(); return; }
  fetch(API + "/call-notes?call_id=" + encodeURIComponent(callId)).then(function(r) { return r.json(); }).then(function(d) {
    cdLoadedNotes = (d && d.notes) || {};
    cdJotData = safeParseJson(cdLoadedNotes.jot_json);
    renderCallDetailNotesPane();
    // If the Jot tab was already opened/mounted before this fetch resolved
    // (fast tap right after opening the call), backfill it now instead of
    // leaving \u2014 or letting a later Save persist \u2014 a blank scene.
    if (cdJot && cdJotData) cdJot.loadJSON(cdJotData);
  }).catch(function() { renderCallDetailNotesPane(); });
}

function renderCallDetailNotesPane() {
  var pane = document.getElementById("cd-pane-notes");
  if (!pane) return; // navigated away before the fetch resolved
  pane.innerHTML = '<textarea id="cd-notes"></textarea>';
  document.getElementById("cd-notes").addEventListener("input", function() { scheduleCallDetailSave(); });
  loadTinyMce().then(function() { initCallDetailNotesEditor(cdLoadedNotes.notes_html || ""); })
    .catch(function() {
      var ta = document.getElementById("cd-notes");
      if (ta) { ta.value = stripHtml(cdLoadedNotes.notes_html || ""); ta.setAttribute("data-plain", "1"); }
    });
}

function initCallDetailNotesEditor(html) {
  var target = document.getElementById("cd-notes");
  if (!target) return;
  tinymce.init({
    target: target,
    menubar: false,
    statusbar: false,
    plugins: "lists link table code fullscreen autolink",
    toolbar: "undo redo | blocks | bold italic underline | forecolor backcolor | bullist numlist | link table | blockquote | removeformat | code fullscreen",
    height: 320,
    branding: false,
    skin: "oxide-dark",
    content_css: "dark",
    setup: function(editor) {
      editor.on("init", function() { editor.setContent(cdLoadedNotes.notes_html || html || ""); });
      editor.on("input change undo redo", scheduleCallDetailSave);
    }
  });
}

function initCallDetailJot() {
  var host = document.getElementById("cd-jot-canvas");
  if (!host) return;
  cdJot = createJot(host, scheduleCallDetailSave, {
    save: function(text) {
      putJotTextInNotes("cd-notes", text, function() { return cdLoadedNotes.notes_html || ""; }, function(html) { cdLoadedNotes.notes_html = html; });
      scheduleCallDetailSave();
    },
    saved: function() { return getJotTextFromNotes("cd-notes", cdLoadedNotes.notes_html || ""); }
  });
  if (cdJotData) cdJot.loadJSON(cdJotData);
}

function destroyCallDetailEditors() {
  flushCallDetailSave();
  var tp = document.getElementById("cd-pane-transcript");
  stopRecordingPlayer(tp);
  tp.innerHTML = "";
  try { if (typeof tinymce !== "undefined" && tinymce.get("cd-notes")) tinymce.get("cd-notes").remove(); } catch (e) {}
  try { if (cdJot) cdJot.destroy(); } catch (e) {}
  cdJot = null;
}

function stripHtml(h) { return String(h || "").replace(/<[^>]*>/g, " ").replace(/ +/g, " ").trim(); }
function safeParseJson(s) { if (!s) return null; try { return JSON.parse(s); } catch (e) { return null; } }

function setCallDetailSaveStatus(msg) {
  var el = document.getElementById("cd-save-status");
  if (el) el.textContent = msg;
}
// Autosave: same debounced pattern as the live in-call panel (see
// scheduleCallSave) \u2014 no separate save action for the user to press.
var cdSaveTimer = null;
function scheduleCallDetailSave() {
  if (!cdOpenCallId) return;
  setCallDetailSaveStatus("Saving\u2026");
  clearTimeout(cdSaveTimer);
  cdSaveTimer = setTimeout(saveCallDetailEdits, PV.notesAutosaveMs);
}
function flushCallDetailSave() {
  if (!cdSaveTimer) return;
  clearTimeout(cdSaveTimer);
  cdSaveTimer = null;
  saveCallDetailEdits();
}
function saveCallDetailEdits() {
  clearTimeout(cdSaveTimer);
  cdSaveTimer = null;
  if (!cdOpenCallId) return;
  var ed = (typeof tinymce !== "undefined" && tinymce.get("cd-notes")) ? tinymce.get("cd-notes") : null;
  var ta = document.getElementById("cd-notes");
  // Until the editor is up, the stored html is the truth (the bare textarea
  // only holds notes when TinyMCE failed to load).
  var notesHtml = (ed && ed.initialized) ? ed.getContent() : (ta && ta.getAttribute("data-plain") ? ta.value : (cdLoadedNotes.notes_html || ""));

  if (cdJot) {
    var jotSvg = cdJot.isEmpty() ? "" : cdJot.getSVG();
    var jotJson = JSON.stringify(cdJot.getJSON());
    postCallDetailSave(notesHtml, jotSvg, jotJson);
  } else {
    postCallDetailSave(notesHtml, cdLoadedNotes.jot_svg || "", cdLoadedNotes.jot_json || "");
  }
}

function postCallDetailSave(notesHtml, jotSvg, jotJson) {
  var callId = cdOpenCallId;
  fetch(API + "/call-notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ call_id: callId, notes_html: notesHtml, jot_svg: jotSvg, jot_json: jotJson })
  }).then(function(r) { return r.json(); }).then(function(d) {
    if (d.ok) {
      if (cdOpenCallId === callId) cdLoadedNotes = { notes_html: notesHtml, jot_svg: jotSvg, jot_json: jotJson };
      setCallDetailSaveStatus("Saved \u2713");
    } else {
      setCallDetailSaveStatus("Save failed");
    }
  }).catch(function() { setCallDetailSaveStatus("Save failed"); });
}
function openMessageFull(m) {
  m = m || (selected && selected.data);
  if (!m) return;
  if (m.source === "gmail" && !m._full) { fetchMessageFull(m); return; }
  renderMessageFull(m);
}
function fetchMessageFull(m) {
  var key = (m.id != null) ? ("id=" + encodeURIComponent(m.id)) : ("gmail_id=" + encodeURIComponent(m.gmail_id));
  fetch(API + "/message?" + key).then(function(r){ return r.json(); }).then(function(d){
    if (d.message) { m.body = d.message.body; m.body_html = d.message.body_html || ""; m.email_from = m.email_from || d.message.email_from; m.subject = m.subject || d.message.subject; m._full = true; }
    renderMessageFull(m);
  }).catch(function(){ renderMessageFull(m); });
}
// HTML emails render in a sandboxed iframe (no scripts, no access to this
// page), so their own styles and markup can't leak out; others as text.
function renderMessageFull(m) {
  var body = m.body_html ? "" : String(m.body || "").replace(/<[^>]*>/g, " ");
  var rows = '<div class="detail-row"><span class="k">From</span><span class="v">' + esc(m.email_from || "\u2014") + '</span></div>'
    + '<div class="detail-row"><span class="k">Subject</span><span class="v">' + esc(m.subject || "(no subject)") + '</span></div>'
    + '<div class="detail-row"><span class="k">When</span><span class="v">' + esc(m.date ? new Date(m.date).toLocaleString() : "\u2014") + '</span></div>'
    + (m.body_html ? '<iframe class="msg-html" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer"></iframe>' : '<div class="msg-body">' + esc(body) + '</div>');
  var foot = '<button onclick="replyMessage()">\u21A9 Reply</button><button class="primary" onclick="newMessage()">\u2709\uFE0F New Message</button>';
  setDetail("\u2709\uFE0F " + (m.subject || "Message"), rows, foot);
  var frame = document.querySelector("#detail-body .msg-html");
  if (frame) {
    // Links open in a new tab; light background since most emails assume one.
    frame.srcdoc = '<base target="_blank"><style>body{margin:12px;font-family:sans-serif;background:#fff;color:#111;word-break:break-word}img{max-width:100%;height:auto}</style>' + m.body_html;
    frame.onload = function() { try { frame.style.height = (frame.contentDocument.documentElement.scrollHeight + 4) + "px"; } catch (e) {} };
  }
}
function extractEmail(s) {
  var m = String(s || "").match(/[A-Za-z0-9_.+-]+@[A-Za-z0-9_.-]+[.][A-Za-z]+/);
  return m ? m[0] : "";
}
function replyMessage() {
  var m = selected && selected.data;
  if (!m) return;
  var to = extractEmail(m.email_from) || (activeContact && activeContact.email) || "";
  var subject = (m.subject || "").replace(/^Re:[ ]*/i, "");
  // The composer is a rich editor (and the worker sends HTML as HTML), so
  // the quote goes in as a blockquote with its line breaks kept.
  var quote = String(m.body || "").replace(/<[^>]*>/g, " ").replace(/ +/g, " ").trim();
  var body = "<p></p>" + (m.date ? "<p>On " + esc(new Date(m.date).toLocaleString()) + ", " + esc(m.email_from || "") + " wrote:</p>" : "")
    + "<blockquote>" + esc(quote).split(NL).join("<br>") + "</blockquote>";
  openCompose(to, "Re: " + subject, body);
  closeDetail();
}
function newMessage() {
  var to = (activeContact && activeContact.email) || "";
  if (!to && selected && selected.type === "message") to = extractEmail(selected.data.email_from);
  openCompose(to, "", "");
  closeDetail();
}
function openCompose(to, subject, body) {
  document.getElementById("comp-to").value = to || "";
  document.getElementById("comp-subject").value = subject || "";
  document.getElementById("comp-body").value = body || "";
  document.getElementById("compose-title").textContent = "\u2709\uFE0F " + (subject && subject.indexOf("Re:") === 0 ? "Reply" : "New Message");
  document.getElementById("compose-modal").classList.remove("hidden");
  loadTinyMce().then(initComposeEditor).catch(function() {});
}
function closeCompose() { document.getElementById("compose-modal").classList.add("hidden"); }
function sendCompose() {
  var to = document.getElementById("comp-to").value.trim();
  var subject = document.getElementById("comp-subject").value.trim();
  var body = (typeof tinymce !== "undefined" && tinymce.get("comp-body")) ? tinymce.get("comp-body").getContent() : document.getElementById("comp-body").value;
  if (!to) { alert("Recipient (To) is required"); return; }
  var m = (selected && selected.type === "message") ? selected.data : null;
  var payload = { to: to, subject: subject, body: body };
  if (m && m.source === "gmail" && m.gmail_id) payload.replyToGmailId = m.gmail_id;
  var btn = document.getElementById("comp-send");
  if (btn) { btn.textContent = "Sending\u2026"; btn.disabled = true; }
  fetch(API + "/send-message", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
    .then(function(r){ return r.json(); }).then(function(d){
      if (btn) { btn.textContent = "Send"; btn.disabled = false; }
      if (d.ok) { closeCompose(); if (activeContact) loadMessages(); }
      else alert("Send failed: " + (d.error || "unknown"));
    }).catch(function(e){ if (btn) { btn.textContent = "Send"; btn.disabled = false; } alert("Send failed: " + e.message); });
}
function loadMessages() {
  var el = document.getElementById("messages-list");
  if (!activeContact) {
    document.getElementById("msg-title").textContent = "\u{1F4E5} Recent emails (7 days)";
    el.innerHTML = '<div class="empty">Downloading recent emails\u2026</div>';
    messagesCache = {};
    fetch(API + "/messages/recent?days=" + PV.recentMessagesDays + "&limit=" + PV.recentMessagesLimit).then(function(r){return r.json();}).then(function(d){
      var msgs = d.messages || [];
      if (!msgs.length) { el.innerHTML = '<div class="empty">No emails in the last week</div>'; return; }
      el.innerHTML = msgs.map(function(m) { return renderMessageRow(m); }).join("");
    }).catch(function(){ el.innerHTML = '<div class="empty">Error loading emails</div>'; });
    return;
  }
  document.getElementById("msg-title").textContent = "\u{1F4AC} " + activeContact.name;
  el.innerHTML = '<div class="empty">Downloading messages\u2026</div>';
  messagesCache = {};
  fetch(API + "/messages?contact=" + encodeURIComponent(activeContact.id) + "&limit=" + PV.contactMessagesLimit).then(function(r){return r.json();}).then(function(d){
    var msgs = d.messages || [];
    if (!msgs.length) { el.innerHTML = '<div class="empty">No messages found</div>'; return; }
    el.innerHTML = msgs.map(function(m) { return renderMessageRow(m); }).join("");
  }).catch(function(){ el.innerHTML = '<div class="empty">Error loading messages</div>'; });
}
function renderMessageRow(m) {
  var dir = m.direction === "outgoing" ? "\u2B06" : "\u2B07";
  var isGmail = m.source === "gmail";
  var who = m.email_from || (m.direction === "outgoing" ? "Us" : "Contact");
  var title = m.subject || (isGmail ? "Gmail" : "Message");
  var when = m.date ? fmtTime(m.date) : "";
  var body = String(m.body || "").replace(/<[^>]*>/g, " ").replace(/ +/g, " ").trim();
  var key = "m-" + (m.id != null ? m.id : "g" + m.gmail_id);
  messagesCache[key] = m;
  return '<div class="msg-row" data-key="' + esc(key) + '"><span class="ic">' + (isGmail ? "\u2709\uFE0F" : "\u{1F4AC}") + '</span><div><div class="who">' + dir + ' ' + esc(who) + '</div><div class="subj">' + esc(title) + '</div>' + (body ? '<div class="sub">' + esc(body.slice(0, 120)) + '</div>' : '') + '</div><div class="meta">' + when + '</div></div>';
}
document.getElementById("messages-list").addEventListener("click", function(e) {
  var row = e.target.closest(".msg-row");
  if (!row) return;
  var m = messagesCache[row.getAttribute("data-key")];
  if (!m) return;
  rowClick(row.getAttribute("data-key"), "message", m, function() { openMessageFull(m); });
});

// \u2500\u2500 PWA install \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
if ("serviceWorker" in navigator) {
  window.addEventListener("load", function() { navigator.serviceWorker.register("/sw.js").catch(function() {}); });
}
var deferredInstallPrompt = null;
function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}
window.addEventListener("beforeinstallprompt", function(e) {
  e.preventDefault();
  deferredInstallPrompt = e;
  if (!isStandalone()) showInstallButtons();
});
window.addEventListener("appinstalled", function() {
  deferredInstallPrompt = null;
  hideInstallButtons();
  document.getElementById("install-tip").classList.add("hidden");
});
function showInstallButtons() {
  document.getElementById("install-btn").classList.remove("hidden");
  document.getElementById("menu-install-btn").classList.remove("hidden");
}
function hideInstallButtons() {
  document.getElementById("install-btn").classList.add("hidden");
  document.getElementById("menu-install-btn").classList.add("hidden");
}
function installApp() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.finally(function() { deferredInstallPrompt = null; });
    return;
  }
  // No beforeinstallprompt support (iOS Safari) \u2014 show manual instructions.
  document.getElementById("install-tip").classList.remove("hidden");
}
function menuInstallApp() {
  document.getElementById("menu-drawer").classList.add("hidden");
  installApp();
}
function dismissInstallTip() {
  document.getElementById("install-tip").classList.add("hidden");
}

// \u2500\u2500 Android app update prompt \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// The native shell rarely changes (the UI is this page), but when a new APK
// is published to /app/ (scripts/android-release.sh), tell the app's users.
// Builds 2+ hand the download to the browser (MainActivity's download
// listener); build 1 was a debug build that can't, and needs a reinstall.
var appUpdateCode = 0;
function checkAppUpdate() {
  var Cap = window.Capacitor;
  if (!Cap || !Cap.isNativePlatform || !Cap.isNativePlatform()) return;
  var AppPlugin = Cap.Plugins && Cap.Plugins.App;
  if (!AppPlugin || !AppPlugin.getInfo) return;
  Promise.all([
    AppPlugin.getInfo(),
    fetch(API + "/app/version.json", { cache: "no-store" }).then(function(r) { return r.ok ? r.json() : null; })
  ]).then(function(res) {
    var installed = parseInt(res[0].build, 10) || 0;
    var latest = res[1];
    if (!latest || !(latest.versionCode > installed)) return;
    if (localStorage.getItem("vb_update_dismissed") === String(latest.versionCode)) return;
    appUpdateCode = latest.versionCode;
    var text = document.getElementById("update-text");
    text.textContent = "";
    if (installed >= 2) {
      text.append("VoIP Bridge " + latest.versionName + " is available. ");
      var a = document.createElement("a");
      a.href = API + "/app/";
      a.textContent = "Update";
      a.style.color = "#60a5fa";
      a.style.fontWeight = "700";
      text.append(a);
    } else {
      text.append("A new version of the app is out. Open " + API.replace("https://", "") + "/app/ in Chrome to install it.");
    }
    document.getElementById("update-tip").classList.remove("hidden");
  }).catch(function() {});
}
function dismissAppUpdate() {
  if (appUpdateCode) localStorage.setItem("vb_update_dismissed", String(appUpdateCode));
  document.getElementById("update-tip").classList.add("hidden");
}
document.addEventListener("visibilitychange", function() { if (!document.hidden) checkAppUpdate(); });
(function() {
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (isIOS && !isStandalone()) showInstallButtons();
})();

// \u2500\u2500 menu + settings \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function toggleMenu() {
  document.getElementById("menu-drawer").classList.toggle("hidden");
}
var settingsBackup = null;
function openSettings() {
  document.getElementById("menu-drawer").classList.add("hidden");
  // Picking/adding an account in the form switches activeAccountId right away;
  // remember it so Cancel can put it back.
  settingsBackup = { activeAccountId: activeAccountId };
  document.getElementById("set-dev").checked = settings.devMode;
  document.getElementById("set-quicktext").value = settings.quickText || "";
  renderAccountSelect();
  document.getElementById("settings-modal").classList.remove("hidden");
}

function cancelSettings() {
  if (settingsBackup) activeAccountId = settingsBackup.activeAccountId;
  settingsBackup = null;
  closeSettings();
}
function closeSettings() {
  document.getElementById("settings-modal").classList.add("hidden");
}

// \u2500\u2500 SIP account management \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
var editingAccountId = null;
function renderAccountSelect() {
  var sel = document.getElementById("set-account");
  var active = activeAccount();
  editingAccountId = active ? active.id : null;
  var html = "";
  for (var i = 0; i < accounts.length; i++) {
    var a = accounts[i];
    html += '<option value="' + esc(a.id) + '"' + (activeAccountId === a.id ? " selected" : "") + '>' + esc(a.name) + ' \u2014 ' + esc(a.username) + '@' + esc(a.domain) + '</option>';
  }
  html += '<option value="__new">\uFF0B New account\u2026</option>';
  sel.innerHTML = html;
  if (active) loadAccountIntoForm(active);
  document.getElementById("account-editor").classList.remove("hidden");
}
function loadAccountIntoForm(a) {
  document.getElementById("acc-name").value = a.name || "";
  document.getElementById("acc-username").value = a.username || "";
  document.getElementById("acc-password").value = a.password || "";
  document.getElementById("acc-server").value = a.server || "";
  document.getElementById("acc-transport").value = a.transport || "wss";
  document.getElementById("acc-domain").value = a.domain || "";
  document.getElementById("acc-callerid").value = a.callerId || "";
}
function onAccountSelect() {
  var id = document.getElementById("set-account").value;
  if (id === "__new") { newAccount(); return; }
  activeAccountId = id;
  var a = activeAccount();
  editingAccountId = id;
  if (a) loadAccountIntoForm(a);
}
function newAccount() {
  activeAccountId = "";
  editingAccountId = "__new";
  var a = { id: "", name: "New account", username: "", password: "", server: DEFAULT_WS, transport: "wss", domain: "", callerId: "" };
  loadAccountIntoForm(a);
  var sel = document.getElementById("set-account");
  sel.value = "__new";
}
function saveAccount() {
  var a = {
    id: editingAccountId === "__new" ? "acc-" + Date.now() : editingAccountId,
    name: document.getElementById("acc-name").value.trim() || "Account",
    username: document.getElementById("acc-username").value.trim(),
    password: document.getElementById("acc-password").value,
    server: document.getElementById("acc-server").value.trim() || DEFAULT_WS,
    transport: document.getElementById("acc-transport").value,
    domain: document.getElementById("acc-domain").value.trim() || PV.defaultDomain,
    callerId: document.getElementById("acc-callerid").value.trim()
  };
  if (!a.username) { alert("Username is required"); return false; }
  var found = -1;
  for (var i = 0; i < accounts.length; i++) if (accounts[i].id === a.id) { found = i; break; }
  if (found >= 0) accounts[found] = a; else accounts.push(a);
  activeAccountId = a.id;
  editingAccountId = a.id;
  persistAccounts();
  renderAccountSelect();
  updateAccountHeader();
  setStatus("\u{1F4BE} Saved \u2014 reconnect to apply", false);
  return true;
}
function deleteAccount() {
  if (accounts.length <= 1) { alert("Need at least one account"); return; }
  var id = editingAccountId === "__new" ? null : editingAccountId;
  if (!id) return;
  var next = [];
  for (var i = 0; i < accounts.length; i++) if (accounts[i].id !== id) next.push(accounts[i]);
  accounts = next;
  if (activeAccountId === id) activeAccountId = accounts[0].id;
  persistAccounts();
  renderAccountSelect();
  updateAccountHeader();
}
function updateAccountHeader() {
  var a = activeAccount();
  if (!a) return;
  // Always show the actual registered username alongside the free-text
  // name \u2014 editing an account's credentials without also updating its
  // display name (e.g. switching a device from extension 201 to 202)
  // previously left the header showing the old extension, looking like
  // the switch hadn't taken effect even though it had.
  var label = a.name || "";
  var extTag = "Ext " + (a.username || "?");
  document.getElementById("acc-name-display").textContent = label && label.indexOf(a.username) === -1 ? label + " (" + extTag + ")" : (label || extTag);
  document.getElementById("acc-caller-display").textContent = "Caller ID: " + (a.callerId || "\u2014");
}
function applyAndReconnect() {
  // persist any pending form edit before reconnecting
  if (editingAccountId && !saveAccount()) return;
  settings.devMode = document.getElementById("set-dev").checked;
  settings.quickText = document.getElementById("set-quicktext").value;
  saveSettings();
  settingsBackup = null;
  closeSettings();
  teardownSoftphone();
  if (settings.devMode) { setStatus("\u{1F6E0} Dev mode", false); }
  else { initSoftphone(); }
}
function teardownSoftphone() {
  clearTimeout(regTimer);
  try { if (sipSession) sipSession.dispose(); } catch (e) {}
  try { if (sipUA) sipUA.stop(); } catch (e) {}
  sipUA = null; sipSession = null; currentCall = null;
  renderCallUI();
}
document.addEventListener("click", function(e) {
  var d = document.getElementById("menu-drawer");
  if (!d.classList.contains("hidden") && !e.target.closest(".menu-icon") && !e.target.closest("#menu-drawer")) {
    d.classList.add("hidden");
  }
});

// \u2500\u2500 softphone init \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Wire the remote audio track to an <audio> element so we can actually hear
// the other party. sip.js does NOT auto-play remote media \u2014 both the inbound
// (Invitation) and outbound (Inviter) paths must do this, or calls are one-way
// (you hear nothing on the outbound leg). Works for both, with a retry loop
// because the peer connection is created asynchronously during invite/answer.
// One shared <audio> element for the remote party. Built from the receiver's
// track rather than only from the "track" event, because on an incoming call
// that event fires the instant the call is answered (often before we hook it)
// and the offer may carry no stream id, leaving evt.streams empty \u2014 either way
// the call connected with full RTP both ways but nothing was ever played.
var remoteAudioEl = null;
function playRemoteStream(stream) {
  if (!remoteAudioEl) {
    remoteAudioEl = document.createElement("audio");
    remoteAudioEl.autoplay = true;
    document.body.appendChild(remoteAudioEl);
  }
  remoteAudioEl.srcObject = stream;
  remoteAudioEl.play().catch(function() {});
}
function ensureRemoteAudio(session) {
  try {
    var pc = session && session.sessionDescriptionHandler && session.sessionDescriptionHandler.peerConnection;
    if (!pc) return;
    var tracks = pc.getReceivers().map(function(r) { return r.track; }).filter(function(t) { return t && t.kind === "audio" && t.readyState === "live"; });
    if (!tracks.length) return;
    if (remoteAudioEl && remoteAudioEl.srcObject && remoteAudioEl.srcObject.getAudioTracks().length) return;
    playRemoteStream(new MediaStream(tracks));
  } catch (e) {}
}
function clearRemoteAudio() {
  if (!remoteAudioEl) return;
  try { remoteAudioEl.srcObject = null; remoteAudioEl.remove(); } catch (e) {}
  remoteAudioEl = null;
}
function attachRemoteAudio(session) {
  var tries = 0;
  function wire() {
    var pc = null;
    try { pc = session.sessionDescriptionHandler && session.sessionDescriptionHandler.peerConnection; } catch (e) {}
    if (pc && pc.ontrack !== undefined) {
      pc.ontrack = function(evt) {
        if (evt.track && evt.track.kind === "audio") {
          playRemoteStream((evt.streams && evt.streams[0]) || new MediaStream([evt.track]));
        }
      };
      ensureRemoteAudio(session);
      return;
    }
    if (++tries < 50) setTimeout(wire, 100);
  }
  wire();
}

// \u2500\u2500 Android app (Capacitor) push registration \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Only runs inside the native shell. Ties this device's FCM token to the SIP
// extension it registers as, so the worker can wake the app for inbound calls.
var pushListenerAdded = false;
function nativePush() {
  var Cap = window.Capacitor;
  if (!Cap || !Cap.isNativePlatform || !Cap.isNativePlatform()) return null;
  return (Cap.Plugins && Cap.Plugins.PushNotifications) || null;
}
function registerPush() {
  var PN = nativePush();
  if (!PN) return;
  if (!pushListenerAdded) {
    pushListenerAdded = true;
    PN.addListener("registration", function(t) {
      var a = activeAccount();
      if (!a || !t || !t.value) return;
      fetch(API + "/push/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: t.value, extension: a.username })
      }).catch(function() {});
    });
  }
  PN.requestPermissions().then(function(r) { if (r && r.receive === "granted") PN.register(); }).catch(function() {});
}

// Native app only: MainActivity leaves a short-lived cookie when the person
// tapped the incoming-call notification, meaning "answer as soon as it arrives".
// Timestamp of a fresh tap-to-answer cookie, or 0. Peeking doesn't consume it.
function autoAnswerStamp() {
  // No regex/backslashes here: this file is a template literal, which strips them.
  var parts = String(document.cookie || "").split(";");
  var stamp = 0;
  for (var i = 0; i < parts.length; i++) {
    var kv = parts[i].split("=");
    if (kv[0].trim() === "vb_autoanswer") stamp = Number(kv[1]) || 0;
  }
  return (stamp && Date.now() - stamp < PV.autoAnswerWindowMs) ? stamp : 0;
}
function consumeAutoAnswer() {
  var fresh = autoAnswerStamp() > 0;
  document.cookie = "vb_autoanswer=; Max-Age=0; Path=/";
  return fresh;
}

function initSoftphone() {
  var el = document.getElementById("phone-status");
  if (typeof SIP === "undefined") { setStatus("\u274C sip.js missing", true); return; }
  var acc = activeAccount();
  if (!acc || !acc.username) { setStatus("\u274C No SIP account configured", true); return; }
  updateAccountHeader();
  setStatus("Connecting\u2026", false);
  try {
    sipUA = new SIP.UserAgent({
      uri: SIP.UserAgent.makeURI("sip:" + acc.username + "@" + (acc.domain || PV.defaultDomain)),
      // CRLF pings keep NAT/proxies from idling the socket out, and make a
      // dead one fail (\u2192 onDisconnect \u2192 reconnect) instead of hanging silently.
      transportOptions: { server: acc.server || DEFAULT_WS, keepAliveInterval: PV.wsKeepAliveSec },
      authorizationUsername: acc.username,
      authorizationPassword: acc.password,
      sessionDescriptionHandlerFactoryOptions: { constraints: { audio: true, video: false } }
    });
  } catch(e) { setStatus("\u274C Init: " + e.message, true); return; }

  // Events from a UA that has since been torn down (stop() fires its own
  // disconnect/unregister) must not touch the current one.
  var ua = sipUA;
  sipRegistered = false;
  sipStartedAt = Date.now();
  var registerer = new SIP.Registerer(sipUA, { expires: 3600 });
  registerer.stateChange.on(function(state) {
    if (ua !== sipUA) return;
    if (state === SIP.RegistererState.Registered) { clearTimeout(regTimer); sipRegistered = true; reconnectDelay = 0; setStatus("\u2705 Registered", false); registerPush(); }
    else if (state === SIP.RegistererState.Unregistered) { clearTimeout(regTimer); sipRegistered = false; setStatus("\u274C Unregistered", true); scheduleReconnect(); }
    else setStatus("\u23F3 " + state, false);
  });

  sipUA.delegate = {
    onDisconnect: function(err) {
      if (ua !== sipUA) return;
      sipRegistered = false;
      setStatus("\u274C Connection lost" + (err && err.message ? " (" + err.message + ")" : ""), true);
      scheduleReconnect();
    },
    onInvite: function(inv) {
      // Already ringing or on a call \u2014 send the same 486 (Busy Here) a
      // hardware desk phone's firmware would send automatically. The
      // dialplan turns that into DIALSTATUS=BUSY and routes to voicemail
      // instead of just failing the call; this session's own active call
      // is left completely untouched.
      if (currentCall) { inv.reject({ statusCode: 486 }).catch(function() {}); return; }
      // Call reached the page \u2014 drop the native "incoming call" notification
      // (it would keep ringing over the in-page ringtone otherwise).
      var PN = nativePush();
      if (PN && PN.removeAllDeliveredNotifications) PN.removeAllDeliveredNotifications().catch(function() {});
      sipSession = inv;
      currentCall = { id: inv.request.callId, dir: "in", remote: inv.remoteIdentity.uri.user || inv.remoteIdentity.displayName, state: "ringing" };
      renderCallUI();
      logCallEvent("ring");
      startRingtone();
      showCallNotification(inv.remoteIdentity.displayName || currentCall.remote);
      if (consumeAutoAnswer()) setTimeout(function() { if (currentCall && currentCall.state === "ringing") answerCall(); }, PV.autoAnswerDelayMs);
      inv.stateChange.on(function(state) {
        if (state === SIP.SessionState.Established) { stopRingtone(); ensureRemoteAudio(inv); currentCall.state = "active"; currentCall.answeredAt = Date.now(); renderCallUI(); logCallEvent("answer"); }
        if (state === SIP.SessionState.Terminated) { stopRingtone(); logHangup(); resetCall(); }
      });
      // Remote audio is attached once actually answered (see answerCall) \u2014
      // wiring it here would arm attachRemoteAudio's retry loop while the
      // call just sits ringing, and it'd give up (after 5s) before the
      // peer connection exists if the person takes longer than that to pick
      // up.
    }
  };

  sipUA.start().then(function() { registerer.register(); });

  // If the server never answers, stop hanging and surface a clear error.
  clearTimeout(regTimer);
  regTimer = setTimeout(function() {
    if (ua !== sipUA) return;
    setStatus("\u274C Server unreachable (timeout)", true);
    try { sipUA.stop(); } catch (e) {}
    sipUA = null;
    scheduleReconnect();
  }, REG_TIMEOUT_MS);
}

// \u2500\u2500 keep the softphone registered \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// The WebSocket drops on network blips, PC sleep, or a server restart, and
// sip.js doesn't reconnect by itself, so rebuild the connection (what Save
// does by hand) with backoff. Never while a call is up: it would end it.
var sipRegistered = false, sipStartedAt = 0, reconnectTimer = null, reconnectDelay = 0;
function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectDelay = Math.min(Math.max(reconnectDelay * 2, PV.reconnectMinMs), PV.reconnectMaxMs);
  setStatus("\u23F3 Reconnecting in " + Math.round(reconnectDelay / 1000) + "s\u2026", true);
  reconnectTimer = setTimeout(function() { reconnectTimer = null; ensureRegistered(true); }, reconnectDelay);
}
function ensureRegistered(now) {
  if (settings.devMode || !bootStarted || currentCall) return;
  if (sipUA && sipRegistered && sipUA.isConnected()) return;
  // Still connecting, or a backed-off retry is already queued: leave it,
  // unless asked to retry right now (network just came back).
  if (!now && (reconnectTimer || (sipUA && Date.now() - sipStartedAt < REG_TIMEOUT_MS))) return;
  clearTimeout(reconnectTimer); reconnectTimer = null;
  teardownSoftphone();
  initSoftphone();
}
// Check right away when the network or the PC comes back, and periodically.
window.addEventListener("online", function() { reconnectDelay = 0; ensureRegistered(true); });
document.addEventListener("visibilitychange", function() { if (document.visibilityState === "visible") ensureRegistered(); });
setInterval(ensureRegistered, PV.reconnectCheckMs);

// \u2500\u2500 boot \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function applyBoot() {
  updateAudioHint();
  updateAccountHeader();
  loadHistory();
  loadT9Corpus();
  if (settings.devMode) { setStatus("\u{1F6E0} Dev mode", false); return; }
  loadSipJs().then(initSoftphone).catch(function(e) { setStatus("\u274C " + e.message, true); });
}
applyAllParams();
var bootStarted = false;
function applyBootOnce() { if (bootStarted) return; bootStarted = true; applyBoot(); }
function boot() {
  // Merge server-side settings (D1) over localStorage, then start. SIP
  // accounts/activeAccount are deliberately excluded \u2014 those are per-device
  // identity (see persistAccounts), not a shared preference.
  // If the app was opened from a ringing-call notification, the caller is
  // waiting on us to register: start SIP right away instead of after the
  // settings round trip (which can still merge in afterwards).
  if (autoAnswerStamp()) applyBootOnce();
  fetch(API + "/settings").then(function(r){return r.json();}).then(function(d){
    var s = d.settings || {};
    if (s.devMode === "1") settings.devMode = true;
    if (s.quickText) settings.quickText = s.quickText;
    if (s.favourites) {
      try {
        var f = JSON.parse(s.favourites);
        if (Array.isArray(f)) favourites = f;
      } catch (e) {}
    }
    applyBootOnce();
  }).catch(applyBootOnce);
  // Calls from numbers that only became contacts later have no name yet \u2014
  // link them up, then redraw the lists if anything changed.
  fetch(API + "/call-history/resolve-names", { method: "POST" }).then(function(r) { return r.json(); }).then(function(d) {
    if (d && d.linked > 0) refreshCallLists();
  }).catch(function() {});
}
document.addEventListener("DOMContentLoaded", boot);
document.addEventListener("DOMContentLoaded", checkAppUpdate);
<\/script>
</body>
</html>`;
  const html = template.replace("__SERVER_CONFIG__", () => JSON.stringify(client).replace(/</g, "\\u003c"));
  return new Response(html, { headers: { "Content-Type": "text/html;charset=utf-8", "Cache-Control": "no-store, no-cache, must-revalidate" } });
}
__name(serveDashboard, "serveDashboard");

// src/push.ts
var cachedToken2 = null;
function b64url2(input) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let s2 = "";
  for (const b of bytes) s2 += String.fromCharCode(b);
  return btoa(s2).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
__name(b64url2, "b64url");
async function accessToken(sa) {
  if (cachedToken2 && cachedToken2.expires > Date.now() + 6e4) return cachedToken2.value;
  const now = Math.floor(Date.now() / 1e3);
  const header = b64url2(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url2(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  }));
  const pem = sa.private_key.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claims}`));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${b64url2(sig)}`
    })
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("FCM auth failed: " + (data.error_description || res.status));
  cachedToken2 = { value: data.access_token, expires: Date.now() + (data.expires_in || 3600) * 1e3 };
  return cachedToken2.value;
}
__name(accessToken, "accessToken");
async function sendData(env, token, data) {
  const sa = JSON.parse(env.FCM_SERVICE_ACCOUNT);
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken(sa)}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message: { token, data, android: { priority: "HIGH", ttl: "30s" } } })
  });
  if (res.ok) return "ok";
  const body = await res.text();
  console.log(`fcm send failed ${res.status}: ${body}`);
  return res.status === 404 || body.includes("UNREGISTERED") ? "gone" : "error";
}
__name(sendData, "sendData");
async function handlePushRegister(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const token = String(body.token || "").trim();
  const extension = String(body.extension || "").trim();
  if (!token || !/^\d{2,6}$/.test(extension)) return Response.json({ error: "token and numeric extension required" }, { status: 400 });
  await env.DB.batch([
    env.DB.prepare("INSERT INTO push_tokens (token, extension) VALUES (?, ?) ON CONFLICT(token) DO UPDATE SET extension = excluded.extension, updated_at = datetime('now')").bind(token, extension)
  ]);
  return Response.json({ ok: true });
}
__name(handlePushRegister, "handlePushRegister");
async function handlePushWake(request, env) {
  if (!env.FCM_SERVICE_ACCOUNT) return Response.json({ error: "push is not set up" }, { status: 503 });
  const q = new URL(request.url).searchParams;
  let body = {};
  if (request.method === "POST") {
    try {
      body = await request.json();
    } catch {
    }
  }
  const extension = String(body.extension || q.get("extension") || "").trim();
  if (!extension) return Response.json({ error: "missing extension" }, { status: 400 });
  const type = (body.type || q.get("type")) === "call_cancelled" ? "call_cancelled" : "incoming_call";
  const caller = String(body.caller || q.get("caller") || "");
  const rows = await env.DB.prepare("SELECT token FROM push_tokens WHERE extension = ?").bind(extension).all();
  const tokens = (rows.results || []).map((r) => r.token);
  let sent = 0;
  for (const t of tokens) {
    const r = await sendData(env, t, { type, caller });
    if (r === "ok") sent++;
    else if (r === "gone") await env.DB.prepare("DELETE FROM push_tokens WHERE token = ?").bind(t).run();
  }
  return Response.json({ ok: true, devices: tokens.length, sent });
}
__name(handlePushWake, "handlePushWake");

// src/voicemail.ts
var BOX = /^(main|\d{2,6})$/;
var MAX_SECONDS = 120;
var RATE = 8e3;
function isBox(box) {
  return BOX.test(box);
}
__name(isBox, "isBox");
function putSetting(env, key, value) {
  return env.DB.prepare(
    "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at"
  ).bind(key, value, Date.now());
}
__name(putSetting, "putSetting");
async function getSetting(env, key) {
  return (await env.DB.prepare("SELECT value FROM settings WHERE key = ?1").bind(key).first())?.value ?? "";
}
__name(getSetting, "getSetting");
async function nudgePbx(env) {
  try {
    await pbx(env).syncGreetings();
  } catch (e) {
    console.error("voicemail sync failed:", e);
  }
}
__name(nudgePbx, "nudgePbx");
async function syncText(env) {
  const [rows, direct] = await Promise.all([
    env.DB.prepare("SELECT box, enabled, greeting_version FROM voicemail_boxes ORDER BY box").all(),
    getSetting(env, "vm_direct")
  ]);
  const lines = [`direct ${direct === "1" ? 1 : 0}`];
  const boxes = rows.results || [];
  if (!boxes.some((r) => r.box === "main")) lines.push("box main 1 -");
  for (const r of boxes) lines.push(`box ${r.box} ${r.enabled ? 1 : 0} ${r.greeting_version ?? "-"}`);
  return lines.join("\n") + "\n";
}
__name(syncText, "syncText");
async function handleListBoxes(env) {
  const [rows, want, applied, appliedAt] = await Promise.all([
    env.DB.prepare("SELECT box, enabled, greeting_version, duration_ms FROM voicemail_boxes ORDER BY box").all(),
    syncText(env),
    getSetting(env, "vm_applied"),
    getSetting(env, "vm_applied_at")
  ]);
  return Response.json({
    boxes: (rows.results || []).map((r) => ({ box: r.box, enabled: !!r.enabled, greeting: r.greeting_version != null, duration_ms: r.duration_ms })),
    synced: applied === want,
    synced_at: Number(appliedAt) || null
  });
}
__name(handleListBoxes, "handleListBoxes");
async function handlePutBox(request, env, box) {
  if (!isBox(box)) return Response.json({ error: "bad box" }, { status: 400 });
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const enabled = body.enabled === false ? 0 : 1;
  const now = Date.now();
  const writes = [];
  if (typeof body.greeting === "string") {
    let wav;
    try {
      wav = toAsteriskWav(Uint8Array.from(atob(body.greeting), (c) => c.charCodeAt(0)));
    } catch (e) {
      return Response.json({ error: String(e.message || e) }, { status: 400 });
    }
    writes.push(env.DB.prepare(
      `INSERT INTO voicemail_boxes (box, enabled, greeting, greeting_version, duration_ms, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?4)
       ON CONFLICT(box) DO UPDATE SET enabled=excluded.enabled, greeting=excluded.greeting, greeting_version=excluded.greeting_version,
         duration_ms=excluded.duration_ms, updated_at=excluded.updated_at`
    ).bind(box, enabled, wav, now, Math.round((wav.length - 44) / 2 / RATE * 1e3)));
  } else if (body.greeting === null) {
    writes.push(env.DB.prepare(
      `INSERT INTO voicemail_boxes (box, enabled, updated_at) VALUES (?1, ?2, ?3)
       ON CONFLICT(box) DO UPDATE SET enabled=excluded.enabled, greeting=NULL, greeting_version=NULL, duration_ms=NULL, updated_at=excluded.updated_at`
    ).bind(box, enabled, now));
  } else {
    writes.push(env.DB.prepare(
      `INSERT INTO voicemail_boxes (box, enabled, updated_at) VALUES (?1, ?2, ?3)
       ON CONFLICT(box) DO UPDATE SET enabled=excluded.enabled, updated_at=excluded.updated_at`
    ).bind(box, enabled, now));
  }
  if (box === "main" && typeof body.direct === "boolean") writes.push(putSetting(env, "vm_direct", body.direct ? "1" : "0"));
  await env.DB.batch(writes);
  await nudgePbx(env);
  return handleListBoxes(env);
}
__name(handlePutBox, "handlePutBox");
async function handleDeleteBox(env, box) {
  if (!isBox(box)) return Response.json({ error: "bad box" }, { status: 400 });
  await env.DB.prepare("DELETE FROM voicemail_boxes WHERE box = ?1").bind(box).run();
  await nudgePbx(env);
  return handleListBoxes(env);
}
__name(handleDeleteBox, "handleDeleteBox");
async function handleBoxGreeting(env, box) {
  const row = await env.DB.prepare("SELECT greeting FROM voicemail_boxes WHERE box = ?1").bind(box).first();
  if (!row?.greeting) return new Response("Not found", { status: 404 });
  const bytes = Array.isArray(row.greeting) ? new Uint8Array(row.greeting) : new Uint8Array(row.greeting);
  return new Response(bytes, { headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" } });
}
__name(handleBoxGreeting, "handleBoxGreeting");
async function handleVoicemailSync(env) {
  return new Response(await syncText(env), { headers: { "Content-Type": "text/plain" } });
}
__name(handleVoicemailSync, "handleVoicemailSync");
async function handleVoicemailSynced(request, env) {
  const applied = new URLSearchParams(await request.text()).get("applied") ?? "";
  await env.DB.batch([putSetting(env, "vm_applied", applied), putSetting(env, "vm_applied_at", String(Date.now()))]);
  return Response.json({ ok: true });
}
__name(handleVoicemailSynced, "handleVoicemailSynced");
function toAsteriskWav(b) {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const tag = /* @__PURE__ */ __name((at) => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]), "tag");
  if (b.length < 44 || tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("The greeting must be a WAV file.");
  let rate = 0, channels = 0;
  for (let at = 12; at + 8 <= b.length; ) {
    const size = view.getUint32(at + 4, true);
    if (tag(at) === "fmt ") {
      if (view.getUint16(at + 8, true) !== 1 || view.getUint16(at + 22, true) !== 16) throw new Error("The greeting must be an uncompressed 16-bit WAV.");
      channels = view.getUint16(at + 10, true);
      rate = view.getUint32(at + 12, true);
    }
    if (tag(at) === "data") {
      if (!rate || !channels) throw new Error("The WAV has no format header.");
      const frames = Math.floor(Math.min(size, b.length - at - 8) / (2 * channels));
      if (frames / rate > MAX_SECONDS + 0.5) throw new Error(`Greetings can be at most ${MAX_SECONDS / 60} minutes.`);
      if (frames / rate < 0.2) throw new Error("The greeting is empty.");
      const sample = /* @__PURE__ */ __name((frame) => {
        let sum = 0;
        for (let c = 0; c < channels; c++) sum += view.getInt16(at + 8 + (frame * channels + c) * 2, true);
        return sum / channels;
      }, "sample");
      const outLen = Math.floor(frames * RATE / rate);
      const out = new Int16Array(outLen);
      for (let i = 0; i < outLen; i++) {
        const pos = i * rate / RATE;
        const i0 = Math.floor(pos), i1 = Math.min(i0 + 1, frames - 1), t = pos - i0;
        out[i] = Math.max(-32768, Math.min(32767, Math.round(sample(i0) * (1 - t) + sample(i1) * t)));
      }
      return monoWav(out, RATE);
    }
    at += 8 + size + (size & 1);
  }
  throw new Error("The WAV has no audio data.");
}
__name(toAsteriskWav, "toAsteriskWav");

// src/jottext.ts
var MODEL2 = "@cf/meta/llama-4-scout-17b-16e-instruct";
var PROMPT = "Transcribe the handwritten notes in this image exactly as written. Keep the original line breaks. Output only the transcribed text - no commentary, no quotes, no markdown. If a word is unreadable, write [?]. If there is no handwriting, output nothing.";
async function jotToText(env, image) {
  const out = await env.AI.run(MODEL2, {
    messages: [{
      role: "user",
      content: [
        { type: "text", text: PROMPT },
        { type: "image_url", image_url: { url: image } }
      ]
    }],
    max_tokens: 1024,
    temperature: 0
  });
  return String(out?.response ?? "").trim();
}
__name(jotToText, "jotToText");

// src/webcallback.ts
var SLOT_MINUTES = 30;
var LATER_DAYS = 5;
var HOUR = 36e5;
var MAX_PER_IP_HOUR = 3;
var MAX_PER_PHONE_HOUR = 2;
var MAX_TOTAL_HOUR = 30;
function localParts(cfg, at) {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: cfg.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short"
  });
  const p = {};
  for (const x of f.formatToParts(new Date(at))) p[x.type] = x.value;
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  return { y: +p.year, m: +p.month, d: +p.day, minutes: +p.hour * 60 + +p.minute, weekday };
}
__name(localParts, "localParts");
function localToEpoch(cfg, y, m, d, minutes2) {
  const guess = Date.UTC(y, m - 1, d, 0, minutes2);
  const p = localParts(cfg, guess);
  const offset = Date.UTC(p.y, p.m - 1, p.d, 0, p.minutes) - guess;
  return guess - offset;
}
__name(localToEpoch, "localToEpoch");
function isOpen(cfg, at = Date.now()) {
  const { openDays, openFrom, openUntil } = cfg.callback;
  const p = localParts(cfg, at);
  return openDays.includes(p.weekday) && p.minutes >= openFrom && p.minutes < openUntil;
}
__name(isOpen, "isOpen");
function laterSlots(cfg, now = Date.now()) {
  const { openDays, openFrom, openUntil } = cfg.callback;
  const days = [];
  const dayFmt = new Intl.DateTimeFormat(cfg.locale, { timeZone: cfg.timeZone, weekday: "long", day: "numeric", month: "short" });
  for (let i = 0; days.length < LATER_DAYS && i < 14; i++) {
    const p = localParts(cfg, now + i * 24 * HOUR);
    if (!openDays.includes(p.weekday)) continue;
    const times = [];
    for (let t = openFrom; t < openUntil; t += SLOT_MINUTES) {
      const at = localToEpoch(cfg, p.y, p.m, p.d, t);
      if (at < now + HOUR) continue;
      times.push({ label: `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`, at });
    }
    if (times.length) days.push({ label: i === 0 ? "Today" : i === 1 ? "Tomorrow" : dayFmt.format(new Date(now + i * 24 * HOUR)), times });
  }
  return days;
}
__name(laterSlots, "laterSlots");
function fmtLocal(cfg, at) {
  return new Intl.DateTimeFormat(cfg.locale, { timeZone: cfg.timeZone, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(at));
}
__name(fmtLocal, "fmtLocal");
function normaliseCallbackNumber(input, country) {
  const raw = (input || "").trim();
  let digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+")) {
  } else if (digits.startsWith("00")) digits = digits.slice(2);
  else if (country === "IE") digits = "353" + digits.replace(/^0/, "");
  else digits = "44" + digits.replace(/^0/, "");
  if (digits.startsWith("44")) {
    const n = digits.slice(2);
    if (!/^(1\d{8,9}|2\d{9}|3\d{9}|7[1-57-9]\d{8})$/.test(n)) return null;
    return "+" + digits;
  }
  if (digits.startsWith("353")) {
    const n = digits.slice(3);
    if (/^1[58]/.test(n)) return null;
    if (!/^([124-79]\d{6,8}|8[35-9]\d{7})$/.test(n)) return null;
    return "+" + digits;
  }
  return null;
}
__name(normaliseCallbackNumber, "normaliseCallbackNumber");
function esc(s2) {
  return s2.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
__name(esc, "esc");
function newId() {
  const b = crypto.getRandomValues(new Uint8Array(12));
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}
__name(newId, "newId");
async function count(env, where, ...args) {
  const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM web_callbacks WHERE ${where}`).bind(...args).first();
  return r?.n ?? 0;
}
__name(count, "count");
async function appendNote(env, callId, html) {
  await env.DB.prepare("UPDATE call_log SET notes_html = COALESCE(notes_html, '') || ?1, write_date = ?2 WHERE call_id = ?3").bind(html, Date.now(), callId).run();
}
__name(appendNote, "appendNote");
async function linkContact(env, callId, phone, name) {
  const contact = await lookupCaller(env, phone) ?? await createContactForNumber(env, phone, Date.now(), name);
  if (contact) await env.DB.prepare("UPDATE call_log SET partner_id = ?1 WHERE call_id = ?2").bind(contact.id, callId).run();
}
__name(linkContact, "linkContact");
function handleWebCallbackConfig(env) {
  const cfg = config(env);
  if (!cfg.callback.did) return Response.json({ error: "Callbacks are not set up." }, { status: 503 });
  return Response.json({ open: isOpen(cfg), slots: laterSlots(cfg), callFrom: displayNumber(env, cfg.callback.did) }, { headers: { "Cache-Control": "no-store" } });
}
__name(handleWebCallbackConfig, "handleWebCallbackConfig");
async function handleWebCallback(request, env, ctx) {
  const cfg = config(env);
  if (!cfg.callback.did) return Response.json({ error: "Callbacks are not set up." }, { status: 503 });
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const name = (body.name ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  const phone = normaliseCallbackNumber(body.phone ?? "", body.country === "IE" ? "IE" : "GB");
  if (!name) return Response.json({ error: "Please enter your name." }, { status: 400 });
  if (!phone) return Response.json({ error: "Please enter a valid UK or Irish phone number." }, { status: 400 });
  const page = (body.page ?? "").slice(0, 300);
  const ip = request.headers.get("CF-Connecting-IP") ?? "";
  const now = Date.now();
  if (body.website) return Response.json({ ok: true, id: newId(), state: "scheduled" });
  const since = now - HOUR;
  if (ip && await count(env, "ip = ?1 AND created_at > ?2", ip, since) >= MAX_PER_IP_HOUR || await count(env, "phone = ?1 AND created_at > ?2", phone, since) >= MAX_PER_PHONE_HOUR || await count(env, "created_at > ?1", since) >= MAX_TOTAL_HOUR) {
    return Response.json({ error: "We've already got your request. We'll be in touch shortly." }, { status: 429 });
  }
  let mode = body.mode === "later" || !isOpen(cfg, now) ? "later" : "now";
  let preferredAt = null;
  if (mode === "later") {
    const at = Number(body.at);
    const valid = laterSlots(cfg, now).some((d) => d.times.some((t) => t.at === at));
    preferredAt = valid ? at : null;
  }
  const id = newId();
  const callId = `web-${id}`;
  const notes = `<p><b>Website callback request</b>: ${esc(name)}, ${esc(phone)}</p><p>${mode === "now" ? "Asked to be called now." : preferredAt ? `Asked to be called ${esc(fmtLocal(cfg, preferredAt))}.` : "Asked to be called back."}</p>` + (page ? `<p>From ${esc(page)}</p>` : "");
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO web_callbacks (id, name, phone, mode, preferred_at, page, ip, state, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)`
    ).bind(id, name, phone, mode, preferredAt, page, ip, mode === "now" ? "calling" : "scheduled", now),
    env.DB.prepare(
      `INSERT INTO call_log (call_id, phone_number, did, direction, state, start_date, end_date, notes_html, write_date)
       VALUES (?1, ?2, ?3, 'incoming', ?4, ?5, ?6, ?7, ?5)`
    ).bind(callId, phone, cfg.callback.did, mode === "now" ? "calling" : "missed", now, mode === "now" ? null : now, notes)
  ]);
  if (mode === "now") {
    let ok = false;
    try {
      ok = await pbx(env).webCallback({ id, name, number: phone });
    } catch (e) {
      console.error("web-callback originate failed:", e);
    }
    if (!ok) {
      mode = "later";
      await markMissed(env, id, "<p>Couldn't start the call.</p>", "failed");
    }
  }
  ctx.waitUntil((async () => {
    try {
      await linkContact(env, callId, phone, name);
    } catch (e) {
      console.error("web-callback contact failed:", e);
    }
    if (mode === "later") await pushCallToOdoo(env, callId).catch((e) => console.error("pushCallToOdoo failed:", e));
  })());
  const state = (await env.DB.prepare("SELECT state FROM web_callbacks WHERE id = ?1").bind(id).first())?.state;
  return Response.json({ ok: true, id, state });
}
__name(handleWebCallback, "handleWebCallback");
async function handleWebCallbackStatus(request, env) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const row = await env.DB.prepare("SELECT state FROM web_callbacks WHERE id = ?1").bind(id).first();
  if (!row) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ state: row.state }, { headers: { "Cache-Control": "no-store" } });
}
__name(handleWebCallbackStatus, "handleWebCallbackStatus");
async function markMissed(env, id, note, state = "missed") {
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("UPDATE web_callbacks SET state = ?1, updated_at = ?2 WHERE id = ?3").bind(state, now, id),
    env.DB.prepare("UPDATE call_log SET state = 'missed', end_date = ?1 WHERE call_id = ?2").bind(now, `web-${id}`)
  ]);
  await appendNote(env, `web-${id}`, note);
}
__name(markMissed, "markMissed");
async function handleWebCallbackEvent(request, env, ctx) {
  const params = new URLSearchParams(await request.text());
  const id = params.get("id") ?? "";
  const callId = `web-${id}`;
  const event = params.get("event");
  const now = Date.now();
  if (event === "agent") {
    await env.DB.batch([
      env.DB.prepare("UPDATE web_callbacks SET state = 'connecting', updated_at = ?1 WHERE id = ?2").bind(now, id),
      env.DB.prepare("UPDATE call_log SET state = 'ongoing' WHERE call_id = ?1").bind(callId)
    ]);
  } else if (event === "missed") {
    await markMissed(env, id, "<p>Nobody answered, so this needs calling back.</p>");
    ctx.waitUntil(pushCallToOdoo(env, callId).catch((e) => console.error("pushCallToOdoo failed:", e)));
  } else if (event === "done") {
    const status = params.get("status") ?? "";
    const talk = parseInt(params.get("talk") ?? "0") || 0;
    const answered = status === "ANSWER";
    await env.DB.batch([
      env.DB.prepare("UPDATE web_callbacks SET state = ?1, updated_at = ?2 WHERE id = ?3").bind(answered ? "connected" : "no-answer", now, id),
      env.DB.prepare("UPDATE call_log SET state = ?1, end_date = ?2 WHERE call_id = ?3").bind(answered ? "terminated" : "missed", now, callId)
    ]);
    await appendNote(env, callId, answered ? `<p>Connected (${Math.floor(talk / 60)}m ${talk % 60}s).</p>` : `<p>Called back but the visitor didn't answer (${esc(status.toLowerCase() || "no answer")}).</p>`);
    ctx.waitUntil(pushCallToOdoo(env, callId).catch((e) => console.error("pushCallToOdoo failed:", e)));
  } else {
    return Response.json({ error: "unknown event" }, { status: 400 });
  }
  return Response.json({ ok: true });
}
__name(handleWebCallbackEvent, "handleWebCallbackEvent");

// src/callstate.ts
var CallState = class {
  static {
    __name(this, "CallState");
  }
  calls = /* @__PURE__ */ new Map();
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/create") {
      const { callId, caller, did, partnerId, partnerName } = await request.json();
      this.calls.set(callId, { id: callId, caller, did, status: "ringing", startTime: Date.now(), partnerId, partnerName });
      return Response.json({ ok: true });
    }
    if (request.method === "POST" && url.pathname === "/update") {
      const { callId, ...fields } = await request.json();
      const call = this.calls.get(callId);
      if (call) Object.assign(call, fields);
      return Response.json({ ok: true });
    }
    if (request.method === "GET" && url.pathname === "/get") {
      const callId = url.searchParams.get("callId");
      return Response.json(callId ? this.calls.get(callId) ?? null : null);
    }
    if (request.method === "GET" && url.pathname === "/active") {
      const now = Date.now();
      const active = [...this.calls.values()].filter((c) => {
        if (c.status === "ringing" && now - c.startTime > 3e5) {
          c.status = "hungup";
          c.endTime = now;
        }
        return c.status !== "hungup";
      });
      return Response.json(active);
    }
    return new Response("Not found", { status: 404 });
  }
};

// src/index.ts
async function handleCallEvent(request, env, ctx) {
  const body = await request.text();
  const params = new URLSearchParams(body);
  const event = params.get("event") ?? "unknown";
  const callId = params.get("callId") ?? crypto.randomUUID();
  const caller = params.get("caller") ?? "unknown";
  const did = params.get("did") ?? "";
  const direction = params.get("direction") === "outgoing" ? "outgoing" : "incoming";
  const ext = /^\d{2,6}$/.test(params.get("ext") ?? "") ? params.get("ext") : null;
  const doId = env.CALL_STATE.idFromName("global");
  const stub = env.CALL_STATE.get(doId);
  if (event === "ring") {
    const partner = await lookupCaller(env, caller);
    await stub.fetch(new Request("https://do/create", {
      method: "POST",
      body: JSON.stringify({ callId, caller, did, partnerId: partner?.id, partnerName: partner?.name })
    }));
    await env.DB.prepare(
      `INSERT INTO call_log (call_id, phone_number, did, direction, state, start_date, partner_id, extension)
       VALUES (?1, ?2, ?3, ?4, 'calling', ?5, ?6, ?7)
       ON CONFLICT(call_id) DO UPDATE SET phone_number=excluded.phone_number, did=excluded.did, direction=excluded.direction,
         partner_id=excluded.partner_id, extension=COALESCE(excluded.extension, call_log.extension)`
    ).bind(callId, caller, did, direction, Date.now(), partner?.id ?? null, ext).run();
    return Response.json({ action: "ring", caller, partner: partner?.name ?? null });
  }
  if (event === "answer") {
    await stub.fetch(new Request("https://do/update", {
      method: "POST",
      body: JSON.stringify({ callId, status: "answered", answerTime: Date.now() })
    }));
    await env.DB.prepare("UPDATE call_log SET state='ongoing', extension=COALESCE(?2, extension) WHERE call_id=?1").bind(callId, ext).run();
    return Response.json({ action: "answered" });
  }
  if (event === "voicemail") {
    const box = params.get("box") ?? "";
    await env.DB.prepare("UPDATE call_log SET voicemail=1, voicemail_box=?1 WHERE call_id=?2").bind(isBox(box) ? box : "main", callId).run();
    return Response.json({ action: "voicemail" });
  }
  if (event === "recording") {
    const file = params.get("file") ?? "";
    if (!/^[A-Za-z0-9_-]+$/.test(file)) return Response.json({ error: "bad file" }, { status: 400 });
    await env.DB.prepare("UPDATE call_log SET recording=?1 WHERE call_id=?2").bind(file, callId).run();
    let transcribed = false;
    try {
      await transcribeCall(env, callId);
      transcribed = true;
    } catch (e) {
      console.error("transcribeCall failed:", e);
    }
    ctx.waitUntil(pushCallToOdoo(env, callId, true).catch((e) => console.error("pushCallToOdoo failed:", e)));
    return Response.json({ action: "recording", file, transcribed });
  }
  if (event === "hangup") {
    const duration = parseInt(params.get("duration") ?? "0");
    const state = duration > 0 ? "terminated" : direction === "outgoing" ? "aborted" : "missed";
    await stub.fetch(new Request("https://do/update", {
      method: "POST",
      body: JSON.stringify({ callId, status: "hungup", endTime: Date.now() })
    }));
    await env.DB.prepare("UPDATE call_log SET state=CASE WHEN voicemail=1 THEN 'missed' ELSE ?1 END, end_date=?2 WHERE call_id=?3").bind(state, Date.now(), callId).run();
    let partner = null;
    try {
      partner = await ensureCallContact(env, callId, caller);
    } catch (e) {
      console.error("ensureCallContact failed:", e);
    }
    ctx.waitUntil(pushCallToOdoo(env, callId).catch((e) => console.error("pushCallToOdoo failed:", e)));
    return Response.json({ action: "hangup", duration, partner: partner?.name ?? null });
  }
  return Response.json({ action: "unknown", event });
}
__name(handleCallEvent, "handleCallEvent");
async function handleClick2Call(request, env) {
  const body = await request.json();
  const cfg = config(env);
  const callerId = body.callerId || cfg.defaultCallerId;
  if (!body.destination) {
    return Response.json({ error: "missing destination" }, { status: 400 });
  }
  const destination = toInternational(cfg, body.destination);
  try {
    const r = await pbx(env).clickToCall(destination, callerId);
    if (r.ok) return Response.json({ ok: true, msg: r.msg || `Calling ${destination} \u2014 your phone will ring when they answer` });
    return Response.json({ error: r.msg || "click-to-call failed" }, { status: 500 });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
__name(handleClick2Call, "handleClick2Call");
async function handleAnswer(request, env) {
  const { channelId } = await request.json();
  if (!channelId) return Response.json({ error: "missing channelId" }, { status: 400 });
  try {
    await pbx(env).answer(channelId);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
__name(handleAnswer, "handleAnswer");
async function handleHangupCall(request, env) {
  const { channelId } = await request.json();
  if (!channelId) return Response.json({ error: "missing channelId" }, { status: 400 });
  try {
    await pbx(env).hangup(channelId);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
__name(handleHangupCall, "handleHangupCall");
async function handleCallerLookup(request, env) {
  const url = new URL(request.url);
  const number = url.searchParams.get("number") ?? "";
  const partner = await lookupCaller(env, number);
  return Response.json(partner ? { found: true, name: partner.name, id: partner.id } : { found: false });
}
__name(handleCallerLookup, "handleCallerLookup");
async function handleActiveCalls(_request, env) {
  const doId = env.CALL_STATE.idFromName("global");
  const stub = env.CALL_STATE.get(doId);
  return stub.fetch(new Request("https://do/active"));
}
__name(handleActiveCalls, "handleActiveCalls");
var CALL_HISTORY_SELECT = `SELECT c.id, c.call_id, c.phone_number, c.did, c.direction, c.state,
     COALESCE(c.start_date, c.create_date) AS start_date,
     c.end_date,
     CASE WHEN c.end_date > c.start_date THEN (c.end_date - c.start_date) / 1000 ELSE 0 END AS duration,
     c.partner_id AS partner_id,
     COALESCE(p.name, '') AS partner_name,
     COALESCE(p.email, '') AS partner_email,
     CASE WHEN COALESCE(c.notes_html, '') != '' THEN 1 ELSE 0 END AS has_notes,
     CASE WHEN COALESCE(c.recording, '') != '' THEN 1 ELSE 0 END AS has_recording,
     CASE WHEN c.transcript IS NOT NULL THEN 1 ELSE 0 END AS has_transcript,
     c.voicemail
   FROM call_log c
   LEFT JOIN contacts p ON p.id = c.partner_id`;
function mergeCallLegs(rows) {
  return groupCallLegs(rows).map((legs) => {
    if (legs.length === 1) return legs[0];
    const trunkLeg = legs.find((l) => l.did);
    const answered = legs.find((l) => !l.did && (l.state === "terminated" || l.state === "ongoing"));
    const primary = legs.find((l) => l.has_notes) ?? answered ?? trunkLeg ?? legs[0];
    const rec = legs.find((l) => l.has_recording) ?? legs.find((l) => l.has_transcript) ?? primary;
    const out = { ...primary };
    out.start_date = Math.min(...legs.map((l) => Number(l.start_date) || Infinity));
    out.did = trunkLeg?.did ?? primary.did;
    if (answered) {
      out.state = answered.state;
      out.duration = answered.duration;
      out.end_date = answered.end_date;
    } else if (trunkLeg) {
      out.state = trunkLeg.state;
      out.duration = trunkLeg.duration;
      out.end_date = trunkLeg.end_date;
    }
    for (const f of ["has_notes", "has_recording", "has_transcript", "voicemail"]) out[f] = legs.some((l) => Number(l[f])) ? 1 : 0;
    for (const f of ["partner_id", "partner_name", "partner_email", "match"]) out[f] = legs.find((l) => l[f])?.[f] ?? primary[f];
    out.rec_call_id = rec.call_id;
    return out;
  });
}
__name(mergeCallLegs, "mergeCallLegs");
async function handleCallHistory(request, env) {
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50") || 50, 200);
  const q = (url.searchParams.get("q") ?? "").trim();
  const select = CALL_HISTORY_SELECT;
  let rows;
  if (q && url.searchParams.get("in") === "transcript") {
    rows = await env.DB.prepare(
      `${select.replace("c.voicemail", "c.voicemail, c.transcript")}
       WHERE c.transcript LIKE ?1
       ORDER BY COALESCE(c.start_date, c.create_date) DESC LIMIT ?2`
    ).bind(`%${q}%`, limit).all();
    const needle = q.toLowerCase();
    for (const r of rows.results || []) {
      const lines = String(r.transcript || "").split("\n");
      r.match = lines.find((l) => l.toLowerCase().includes(needle)) ?? "";
      delete r.transcript;
    }
  } else if (q) {
    const like = `%${q}%`;
    rows = await env.DB.prepare(
      `${select}
       WHERE c.phone_number LIKE ?1 OR c.did LIKE ?1 OR p.name LIKE ?1
       ORDER BY COALESCE(c.start_date, c.create_date) DESC LIMIT ?2`
    ).bind(like, limit).all();
  } else {
    rows = await env.DB.prepare(
      `${select} ORDER BY COALESCE(c.start_date, c.create_date) DESC LIMIT ?1`
    ).bind(limit).all();
  }
  return Response.json({ calls: mergeCallLegs(rows.results || []) });
}
__name(handleCallHistory, "handleCallHistory");
function sqlPhoneKey(col) {
  let e = col;
  for (const ch of [" ", "-", "+", "(", ")", ".", "/"]) e = `REPLACE(${e}, '${ch}', '')`;
  return `substr(${e}, -9)`;
}
__name(sqlPhoneKey, "sqlPhoneKey");
async function findCachedContact(env, key) {
  return await env.DB.prepare(
    `SELECT id, name, phone, mobile, email FROM contacts
     WHERE active = 1 AND (${sqlPhoneKey("phone")} = ?1 OR ${sqlPhoneKey("mobile")} = ?1)
     ORDER BY id LIMIT 1`
  ).bind(key).first();
}
__name(findCachedContact, "findCachedContact");
async function linkCallsToContact(env, key, contactId) {
  const r = await env.DB.prepare(
    `UPDATE call_log SET partner_id = ?1
     WHERE ${sqlPhoneKey("phone_number")} = ?2
       AND (partner_id IS NULL OR partner_id NOT IN (SELECT id FROM contacts))`
  ).bind(contactId, key).run();
  return Number(r.meta.changes) || 0;
}
__name(linkCallsToContact, "linkCallsToContact");
async function claimLookup(env, slot, ttlMs) {
  const now = Date.now();
  const r = await env.DB.prepare(
    `INSERT INTO phone_lookup (key, at) VALUES (?1, ?2)
     ON CONFLICT(key) DO UPDATE SET at = excluded.at WHERE phone_lookup.at < ?3`
  ).bind(slot, now, now - ttlMs).run();
  return Number(r.meta.changes) > 0;
}
__name(claimLookup, "claimLookup");
async function ensureCallContact(env, callId, caller) {
  const key = phoneKey(caller);
  if (!key) return null;
  const row = await env.DB.prepare(
    "SELECT p.id, p.name FROM call_log c JOIN contacts p ON p.id = c.partner_id WHERE c.call_id = ?1"
  ).bind(callId).first();
  if (row) return row;
  let contact = await findCachedContact(env, key) ?? await lookupCaller(env, caller);
  if (!contact) {
    if (!await claimLookup(env, "create:" + key, 6e4)) return null;
    contact = await createContactForNumber(env, caller);
  }
  if (contact) await linkCallsToContact(env, key, contact.id);
  return contact;
}
__name(ensureCallContact, "ensureCallContact");
async function handleResolveHistoryNames(env) {
  const rows = await env.DB.prepare(
    `SELECT c.phone_number FROM call_log c LEFT JOIN contacts p ON p.id = c.partner_id
     WHERE p.id IS NULL AND c.phone_number IS NOT NULL AND c.phone_number != ''
     GROUP BY c.phone_number ORDER BY MAX(COALESCE(c.start_date, c.create_date)) DESC LIMIT 200`
  ).all();
  const numbers = /* @__PURE__ */ new Map();
  for (const r of rows.results || []) {
    const k = phoneKey(r.phone_number);
    if (k && !numbers.has(k)) numbers.set(k, r.phone_number);
  }
  let linked = 0, odooAsked = 0;
  const askOdoo = [];
  for (const [key, number] of numbers) {
    const cached = await findCachedContact(env, key);
    if (cached) {
      linked += await linkCallsToContact(env, key, cached.id);
      continue;
    }
    if (askOdoo.length < 8) askOdoo.push([key, number]);
  }
  for (const [key, number] of askOdoo) {
    if (!await claimLookup(env, "miss:" + key, 24 * 36e5)) continue;
    odooAsked++;
    const hit = await lookupCaller(env, number);
    if (hit) {
      linked += await linkCallsToContact(env, key, hit.id);
      await env.DB.prepare("DELETE FROM phone_lookup WHERE key = ?1").bind("miss:" + key).run();
    }
  }
  return Response.json({ ok: true, linked, odooAsked });
}
__name(handleResolveHistoryNames, "handleResolveHistoryNames");
async function handleCreateMissingContacts(env) {
  const rows = await env.DB.prepare(
    `SELECT c.phone_number, MIN(COALESCE(c.start_date, c.create_date)) AS first FROM call_log c
     LEFT JOIN contacts p ON p.id = c.partner_id
     WHERE p.id IS NULL AND c.phone_number IS NOT NULL AND c.phone_number != ''
     GROUP BY c.phone_number ORDER BY first`
  ).all();
  const todo = /* @__PURE__ */ new Map();
  for (const r of rows.results || []) {
    const key = phoneKey(r.phone_number);
    if (!key || /7700900\d{3}$/.test(r.phone_number.replace(/\D/g, ""))) continue;
    if (!todo.has(key)) todo.set(key, { number: r.phone_number, first: r.first });
  }
  let created = 0, linked = 0, processed = 0;
  const failed = [];
  for (const [key, { number, first }] of todo) {
    if (processed >= 8) break;
    processed++;
    let contact = await findCachedContact(env, key) ?? await lookupCaller(env, number);
    if (!contact && await claimLookup(env, "create:" + key, 6e4)) {
      contact = await createContactForNumber(env, number, first || Date.now());
      if (contact) created++;
    }
    if (contact) linked += await linkCallsToContact(env, key, contact.id);
    else failed.push(number);
  }
  return Response.json({ ok: true, created, linked, failed, remaining: Math.max(0, todo.size - processed) });
}
__name(handleCreateMissingContacts, "handleCreateMissingContacts");
async function handleRenameContact(request, env, id) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const name = (body.name ?? "").trim();
  if (!name) return Response.json({ error: "name required" }, { status: 400 });
  const ok = await renameContact(env, id, name);
  return ok ? Response.json({ ok: true, id, name }) : Response.json({ error: "Odoo update failed" }, { status: 502 });
}
__name(handleRenameContact, "handleRenameContact");
async function handleGetCallNotes(request, env) {
  const url = new URL(request.url);
  const callId = url.searchParams.get("call_id") ?? "";
  if (!callId) return Response.json({ error: "missing call_id" }, { status: 400 });
  const row = await env.DB.prepare(
    "SELECT call_id, notes_html, jot_svg, jot_json FROM call_log WHERE call_id = ?1"
  ).bind(callId).first();
  if (!row) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ notes: row });
}
__name(handleGetCallNotes, "handleGetCallNotes");
async function handleSaveCallNotes(request, env, ctx) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const callId = (body.call_id ?? "").trim();
  if (!callId) return Response.json({ error: "missing call_id" }, { status: 400 });
  const result = await env.DB.prepare(
    `UPDATE call_log SET notes_html=?1, jot_svg=?2, jot_json=?3, write_date=?4 WHERE call_id=?5`
  ).bind(body.notes_html ?? "", body.jot_svg ?? "", body.jot_json ?? "", Date.now(), callId).run();
  if (!result.meta.changes) return Response.json({ error: "call not found" }, { status: 404 });
  ctx.waitUntil(pushCallToOdoo(env, callId).catch((e) => console.error("pushCallToOdoo failed:", e)));
  return Response.json({ ok: true });
}
__name(handleSaveCallNotes, "handleSaveCallNotes");
async function handleGetRecording(request, env) {
  const callId = new URL(request.url).searchParams.get("call_id") ?? "";
  const row = await env.DB.prepare("SELECT recording FROM call_log WHERE call_id = ?1").bind(callId).first();
  if (!row?.recording) return Response.json({ error: "no recording" }, { status: 404 });
  return playbackResponse(env, row.recording);
}
__name(handleGetRecording, "handleGetRecording");
async function handleParked(env) {
  try {
    return Response.json({ parked: await pbx(env).parkedCalls() });
  } catch (e) {
    return Response.json({ error: String(e.message || e), parked: [] }, { status: 502 });
  }
}
__name(handleParked, "handleParked");
async function handleGetTranscript(request, env) {
  const callId = new URL(request.url).searchParams.get("call_id") ?? "";
  const row = await env.DB.prepare("SELECT transcript FROM call_log WHERE call_id = ?1").bind(callId).first();
  if (!row) return Response.json({ error: "call not found" }, { status: 404 });
  return Response.json({ transcript: row.transcript });
}
__name(handleGetTranscript, "handleGetTranscript");
async function handleTranscribe(request, env, ctx) {
  const callId = new URL(request.url).searchParams.get("call_id") ?? "";
  try {
    const transcript = await transcribeCall(env, callId);
    ctx.waitUntil(pushCallToOdoo(env, callId).catch((e) => console.error("pushCallToOdoo failed:", e)));
    return Response.json({ transcript });
  } catch (e) {
    return Response.json({ error: String(e.message || e) }, { status: 502 });
  }
}
__name(handleTranscribe, "handleTranscribe");
async function handleMessages(request, env) {
  const url = new URL(request.url);
  const contactId = parseInt(url.searchParams.get("contact") ?? "0");
  if (!contactId) return Response.json({ error: "missing contact id" }, { status: 400 });
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50") || 50, 100);
  const contact = await env.DB.prepare("SELECT id, name, email FROM contacts WHERE id = ?1").bind(contactId).first();
  if (!contact) return Response.json({ error: "contact not found" }, { status: 404 });
  let odooOk = false;
  try {
    await searchContactMessages(env, contactId, limit);
    odooOk = true;
  } catch (e) {
    console.error("Odoo message sync failed:", e);
  }
  let gmailOk = false;
  const email = (contact.email || "").trim();
  if (email) {
    try {
      const g = await searchGmailMessages(env, email, limit);
      await upsertMessages(env, g.map((m) => ({ ...m, contact_id: contactId })));
      gmailOk = true;
    } catch (e) {
      console.error("Gmail message sync failed:", e);
    }
  }
  const rows = await env.DB.prepare(
    `SELECT id, odoo_id, gmail_id, contact_id, subject, body, email_from, author_id, message_type, direction, source, date
     FROM messages WHERE contact_id = ?1 ORDER BY COALESCE(date, 0) DESC LIMIT ?2`
  ).bind(contactId, limit * 2).all();
  return Response.json({
    contact: { id: contact.id, name: contact.name, email: contact.email },
    odooOk,
    gmailOk,
    messages: rows.results || []
  });
}
__name(handleMessages, "handleMessages");
async function handleRecentMessages(request, env) {
  const url = new URL(request.url);
  const days = Math.max(1, Math.min(parseInt(url.searchParams.get("days") ?? "7") || 7, 30));
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50") || 50, 100);
  let gmailOk = false;
  let messages = [];
  try {
    messages = await searchRecentGmailMessages(env, days, limit);
    gmailOk = true;
  } catch (e) {
    console.error("Recent Gmail sync failed:", e);
  }
  return Response.json({ days, gmailOk, messages });
}
__name(handleRecentMessages, "handleRecentMessages");
async function handleQuotations(request, env) {
  const url = new URL(request.url);
  const contactId = parseInt(url.searchParams.get("contact") ?? "0");
  if (!contactId) return Response.json({ error: "missing contact id" }, { status: 400 });
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20") || 20, 100);
  const quotations = await searchQuotations(env, contactId, limit);
  return Response.json({ quotations });
}
__name(handleQuotations, "handleQuotations");
async function handleMessageDetail(request, env) {
  const url = new URL(request.url);
  const id = parseInt(url.searchParams.get("id") ?? "0");
  const gmailId = url.searchParams.get("gmail_id") ?? "";
  if (!id && gmailId) {
    const { text, html } = await getGmailBody(env, gmailId);
    if (!text && !html) return Response.json({ error: "body unavailable" }, { status: 404 });
    return Response.json({ message: { gmail_id: gmailId, source: "gmail", body: text, body_html: html } });
  }
  if (!id) return Response.json({ error: "missing id" }, { status: 400 });
  const row = await env.DB.prepare("SELECT * FROM messages WHERE id = ?1").bind(id).first();
  if (!row) return Response.json({ error: "not found" }, { status: 404 });
  if (row.source === "gmail" && row.gmail_id) {
    const { text, html } = await getGmailBody(env, String(row.gmail_id));
    if (text) row.body = text;
    row.body_html = html;
  }
  return Response.json({ message: row });
}
__name(handleMessageDetail, "handleMessageDetail");
async function handleSendMessage(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.to || !String(body.to).trim()) return Response.json({ error: "missing recipient" }, { status: 400 });
  const res = await sendGmailMessage(env, {
    to: String(body.to).trim(),
    subject: body.subject ?? "",
    body: body.body ?? "",
    html: body.html,
    replyToGmailId: body.replyToGmailId
  });
  return Response.json(res, { status: res.ok ? 200 : 502 });
}
__name(handleSendMessage, "handleSendMessage");
async function handleContacts(request, env) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50") || 50, 200);
  const contacts = await searchContacts(env, q, limit);
  return Response.json({ contacts });
}
__name(handleContacts, "handleContacts");
async function handleContactsCache(request, env) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50") || 50, 200);
  const select = "SELECT id, name, company_type, is_company, phone, mobile, email, website, vat, function, city, active FROM contacts";
  let rows;
  if (q) {
    const like = `%${q}%`;
    rows = await env.DB.prepare(
      `${select} WHERE name LIKE ?1 OR phone LIKE ?1 OR mobile LIKE ?1 OR email LIKE ?1 ORDER BY name LIMIT ?2`
    ).bind(like, limit).all();
  } else {
    rows = await env.DB.prepare(
      `${select} WHERE name != '' AND active = 1 ORDER BY name LIMIT ?1`
    ).bind(limit).all();
  }
  return Response.json({ contacts: rows.results || [] });
}
__name(handleContactsCache, "handleContactsCache");
async function handleContactsT9(env) {
  const rows = await env.DB.prepare(
    "SELECT name, phone, mobile FROM contacts WHERE active = 1 AND (COALESCE(phone, '') != '' OR COALESCE(mobile, '') != '') ORDER BY name"
  ).all();
  return Response.json({ contacts: rows.results || [] });
}
__name(handleContactsT9, "handleContactsT9");
async function handleSync(env) {
  try {
    const contacts = await syncContacts(env);
    const callLog = await syncCallLog(env, 100);
    return Response.json({ ok: true, contacts, callLog });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
__name(handleSync, "handleSync");
async function handlePushCalls(request, env) {
  const params = new URL(request.url).searchParams;
  const callId = params.get("call_id");
  if (callId) {
    try {
      return Response.json({ odoo_id: await pushCallToOdoo(env, callId, true) });
    } catch (e) {
      return Response.json({ error: String(e.message || e) }, { status: 502 });
    }
  }
  const limit = Math.min(parseInt(params.get("limit") ?? "10") || 10, 50);
  return Response.json(await pushCallHistory(env, limit));
}
__name(handlePushCalls, "handlePushCalls");
async function handleGetSettings(env) {
  const rows = await env.DB.prepare("SELECT key, value FROM settings").all();
  const settings = {};
  for (const r of rows.results || []) settings[r.key] = r.value;
  return Response.json({ settings });
}
__name(handleGetSettings, "handleGetSettings");
async function handleSetSettings(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const statements = [];
  for (const [k, v] of Object.entries(body)) {
    if (typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean") continue;
    statements.push(env.DB.prepare(
      "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at"
    ).bind(k, String(v), Date.now()));
  }
  if (statements.length) await env.DB.batch(statements);
  return Response.json({ ok: true, count: statements.length });
}
__name(handleSetSettings, "handleSetSettings");
function digitsOf(s2) {
  return (s2 || "").replace(/\D/g, "");
}
__name(digitsOf, "digitsOf");
var CONTACT_DETAIL_FIELDS = ["id", "name", "company_type", "is_company", "phone", "mobile", "email", "website", "vat", "function", "street", "street2", "zip", "city", "state_id", "country_id", "active"];
function m2oLabel(v) {
  return Array.isArray(v) ? String(v[1] ?? "") : "";
}
__name(m2oLabel, "m2oLabel");
async function fetchOdooContact(env, id) {
  const uid = await odooAuth(env);
  if (!uid) return null;
  const result = await odooCall(
    env,
    uid,
    "res.partner",
    "search_read",
    [[["id", "=", id]]],
    { fields: CONTACT_DETAIL_FIELDS, limit: 1 }
  );
  const p = (result.parsed || [])[0];
  if (!p) return null;
  const contact = {};
  for (const f of CONTACT_DETAIL_FIELDS) contact[f] = p[f] === false ? "" : p[f];
  contact.state = m2oLabel(p.state_id);
  contact.country = m2oLabel(p.country_id);
  delete contact.state_id;
  delete contact.country_id;
  return contact;
}
__name(fetchOdooContact, "fetchOdooContact");
async function handleContactDetail(env, id, cachedOnly) {
  const [odooContact, totals] = cachedOnly ? [null, null] : await Promise.all([fetchOdooContact(env, id), contactTotals(env, id)]);
  const contact = odooContact ?? await env.DB.prepare(
    "SELECT id, name, company_type, is_company, phone, mobile, email, website, vat, function, city, active FROM contacts WHERE id = ?1"
  ).bind(id).first();
  if (!contact) return Response.json({ error: "not found" }, { status: 404 });
  const keys = [contact.phone, contact.mobile].map((p) => digitsOf(String(p || "")).slice(-7)).filter((d) => d.length >= 7);
  const where = ["c.partner_id = ?1", ...keys.map((_, i) => `c.phone_number LIKE ?${i + 2}`)].join(" OR ");
  const calls = await env.DB.prepare(
    `${CALL_HISTORY_SELECT} WHERE ${where} ORDER BY COALESCE(c.start_date, c.create_date) DESC LIMIT 100`
  ).bind(id, ...keys.map((k) => `%${k}%`)).all();
  return Response.json({ contact, totals, calls: mergeCallLegs(calls.results || []) });
}
__name(handleContactDetail, "handleContactDetail");
async function handleJotToText(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const image = body.image ?? "";
  if (!/^data:image\/(png|jpeg);base64,/.test(image)) return Response.json({ error: "image must be a PNG/JPEG data URL" }, { status: 400 });
  if (image.length > 4e6) return Response.json({ error: "image too large" }, { status: 413 });
  try {
    return Response.json({ text: await jotToText(env, image) });
  } catch (e) {
    console.error("Jot to text failed:", e);
    return Response.json({ error: String(e) }, { status: 502 });
  }
}
__name(handleJotToText, "handleJotToText");
function androidAssetLinks(env) {
  const { packageName, certSha256 } = config(env).android;
  if (!packageName || !certSha256.length) return Response.json([]);
  return Response.json([{
    relation: ["delegate_permission/common.handle_all_urls"],
    target: { namespace: "android_app", package_name: packageName, sha256_cert_fingerprints: certSha256 }
  }]);
}
__name(androidAssetLinks, "androidAssetLinks");
function dashboard(env) {
  const cfg = config(env);
  return serveDashboard({ countryCode: cfg.countryCode, sipWsUrl: cfg.sipWsUrl, sipDomain: cfg.sipDomain, callerId: cfg.defaultCallerId });
}
__name(dashboard, "dashboard");
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
}
__name(corsHeaders, "corsHeaders");
var index_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    let response = await authorize(request, env);
    if (response) {
    } else if ((request.method === "GET" || request.method === "POST") && url.pathname === "/login") response = await handleLogin(request, env);
    else if (request.method === "POST" && url.pathname === "/logout") response = handleLogout();
    else if (request.method === "GET" && url.pathname === "/health") response = Response.json({ ok: true, version: VERSION, provider: env.PBX_PROVIDER || "asterisk" });
    else if (request.method === "POST" && url.pathname === "/call-event") response = await handleCallEvent(request, env, ctx);
    else if (request.method === "POST" && url.pathname === "/click2call") response = await handleClick2Call(request, env);
    else if (request.method === "POST" && url.pathname === "/answer") response = await handleAnswer(request, env);
    else if (request.method === "POST" && url.pathname === "/hangup-call") response = await handleHangupCall(request, env);
    else if (request.method === "POST" && url.pathname === "/sync") response = await handleSync(env);
    else if (request.method === "POST" && url.pathname === "/odoo/push-calls") response = await handlePushCalls(request, env);
    else if (request.method === "GET" && url.pathname === "/web-callback/config") response = handleWebCallbackConfig(env);
    else if (request.method === "GET" && url.pathname === "/web-callback/status") response = await handleWebCallbackStatus(request, env);
    else if (request.method === "POST" && url.pathname === "/web-callback") response = await handleWebCallback(request, env, ctx);
    else if (request.method === "POST" && url.pathname === "/web-callback/event") response = await handleWebCallbackEvent(request, env, ctx);
    else if (request.method === "POST" && url.pathname === "/push/register") response = await handlePushRegister(request, env);
    else if ((request.method === "POST" || request.method === "GET") && url.pathname === "/push/wake") response = await handlePushWake(request, env);
    else if (request.method === "GET" && url.pathname === "/settings") response = await handleGetSettings(env);
    else if (request.method === "POST" && url.pathname === "/settings") response = await handleSetSettings(request, env);
    else if (request.method === "GET" && url.pathname === "/caller-lookup") response = await handleCallerLookup(request, env);
    else if (request.method === "GET" && url.pathname === "/active-calls") response = await handleActiveCalls(request, env);
    else if (request.method === "GET" && url.pathname === "/call-history") response = await handleCallHistory(request, env);
    else if (request.method === "POST" && url.pathname === "/call-history/resolve-names") response = await handleResolveHistoryNames(env);
    else if (request.method === "POST" && url.pathname === "/call-history/create-missing-contacts") response = await handleCreateMissingContacts(env);
    else if (request.method === "GET" && url.pathname === "/call-notes") response = await handleGetCallNotes(request, env);
    else if (request.method === "POST" && url.pathname === "/call-notes") response = await handleSaveCallNotes(request, env, ctx);
    else if (request.method === "GET" && url.pathname === "/recording") response = await handleGetRecording(request, env);
    else if (request.method === "POST" && url.pathname === "/jot-to-text") response = await handleJotToText(request, env);
    else if (request.method === "GET" && url.pathname === "/parked") response = await handleParked(env);
    else if (request.method === "GET" && url.pathname === "/transcript") response = await handleGetTranscript(request, env);
    else if (request.method === "POST" && url.pathname === "/transcribe") response = await handleTranscribe(request, env, ctx);
    else if (request.method === "GET" && url.pathname === "/voicemail/boxes") response = await handleListBoxes(env);
    else if (request.method === "PUT" && /^\/voicemail\/boxes\/[^/]+$/.test(url.pathname)) response = await handlePutBox(request, env, url.pathname.split("/")[3]);
    else if (request.method === "DELETE" && /^\/voicemail\/boxes\/[^/]+$/.test(url.pathname)) response = await handleDeleteBox(env, url.pathname.split("/")[3]);
    else if (request.method === "GET" && /^\/voicemail\/boxes\/[^/]+\/greeting$/.test(url.pathname)) response = await handleBoxGreeting(env, url.pathname.split("/")[3]);
    else if (request.method === "GET" && url.pathname === "/voicemail/sync") response = await handleVoicemailSync(env);
    else if (request.method === "POST" && url.pathname === "/voicemail/synced") response = await handleVoicemailSynced(request, env);
    else if (request.method === "GET" && url.pathname === "/quotations") response = await handleQuotations(request, env);
    else if (request.method === "GET" && url.pathname === "/messages") response = await handleMessages(request, env);
    else if (request.method === "GET" && url.pathname === "/messages/recent") response = await handleRecentMessages(request, env);
    else if (request.method === "GET" && url.pathname === "/message") response = await handleMessageDetail(request, env);
    else if (request.method === "POST" && url.pathname === "/send-message") response = await handleSendMessage(request, env);
    else if (request.method === "GET" && url.pathname === "/contacts") response = await handleContacts(request, env);
    else if (request.method === "GET" && url.pathname === "/contacts/t9") response = await handleContactsT9(env);
    else if (request.method === "GET" && url.pathname === "/contacts/cache") response = await handleContactsCache(request, env);
    else if (request.method === "GET" && /^\/contacts\/\d+$/.test(url.pathname)) response = await handleContactDetail(env, parseInt(url.pathname.split("/")[2]), url.searchParams.get("cached") === "1");
    else if (request.method === "POST" && /^\/contacts\/\d+$/.test(url.pathname)) response = await handleRenameContact(request, env, parseInt(url.pathname.split("/")[2]));
    else if (url.pathname === "/") response = Response.redirect(new URL("/dashboard", url).toString(), 302);
    else if (url.pathname === "/.well-known/assetlinks.json") response = androidAssetLinks(env);
    else if (url.pathname === "/dashboard") response = dashboard(env);
    else response = new Response("Not found", { status: 404 });
    const headers = new Headers(response.headers);
    const ch = corsHeaders();
    for (const [k, v] of Object.entries(ch)) headers.set(k, v);
    return new Response(response.body, { status: response.status, headers });
  }
};
export {
  CallState,
  index_default as default
};
//# sourceMappingURL=index.js.map
