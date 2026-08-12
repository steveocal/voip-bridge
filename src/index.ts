// ── Minimal Workers Runtime Types ────────────────────────────
// These are always available in the Workers runtime as ambient globals.
// Declared here for TypeScript checking without @cloudflare/workers-types.

declare class DurableObjectState {
  readonly id: DurableObjectId;
  storage: DurableObjectStorage;
  waitUntil(promise: Promise<unknown>): void;
  blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>;
}

declare class DurableObjectId {
  toString(): string;
  equals(other: DurableObjectId): boolean;
}

declare class DurableObjectStub {
  readonly id: DurableObjectId;
  fetch(input: RequestInfo, init?: RequestInit): Promise<Response>;
}

declare class DurableObjectNamespace {
  newUniqueId(options?: { jurisdiction?: string }): DurableObjectId;
  idFromName(name: string): DurableObjectId;
  idFromString(id: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}

declare class DurableObjectStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
  list(): Promise<Map<string, unknown>>;
  transaction<T>(callback: () => Promise<T>): Promise<T>;
}

declare class D1Database {
  prepare(query: string): D1PreparedStatement;
  exec(query: string): Promise<D1Result>;
}

declare class D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
  raw<T = unknown[]>(): Promise<T[]>;
}

interface D1Result<T = Record<string, unknown>> {
  results?: T[];
  success: boolean;
  meta: Record<string, unknown>;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

interface Env {
  CALL_STATE: DurableObjectNamespace;
  DB: D1Database;
  ODOO_URL: string;
  ODOO_DB: string;
  ODOO_USER: string;
  ODOO_PASS: string;
  ASTERISK_URL: string;
  ASTERISK_USER: string;
  ASTERISK_PASS: string;
}

// ── Odoo XML-RPC client ──────────────────────────────────────

async function odooAuth(env: Env): Promise<number | null> {
  const url = `${env.ODOO_URL}/xmlrpc/2/common`;
  const body = xmlrpcRequest("authenticate", env.ODOO_DB, "", env.ODOO_PASS, "common", [env.ODOO_DB, env.ODOO_USER, env.ODOO_PASS, {}]);
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "text/xml" }, body });
  const text = await res.text();
  const uidMatch = text.match(/<int>(\d+)<\/int>/);
  return uidMatch ? parseInt(uidMatch[1]) : null;
}

async function odooCall(env: Env, uid: number, model: string, method: string, args: unknown[]) {
  const url = `${env.ODOO_URL}/xmlrpc/2/object`;
  const body = xmlrpcRequest("execute_kw", env.ODOO_DB, String(uid), env.ODOO_PASS, model, [method, args]);
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "text/xml" }, body });
  const text = await res.text();
  const parsed = parseXmlrpcResponse(text);
  return { parsed, _xml: text.substring(0, 800) };
}

function xmlrpcRequest(method: string, db: string, uid: string, pass: string, model: string, args: unknown[]) {
  // For common endpoint (authenticate), use different body format
  if (model === "common") {
    return `<?xml version="1.0"?>
<methodCall>
  <methodName>${method}</methodName>
  <params>
    <param><value><string>${db}</string></value></param>
    <param><value><string>${args[1] || ""}</string></value></param>
    <param><value><string>${args[2] || ""}</string></value></param>
    <param><value><struct/></value></param>
  </params>
</methodCall>`;
  }
  const argsXml = args.map(a => xmlrpcValue(a)).join("");
  return `<?xml version="1.0"?>
<methodCall>
  <methodName>execute_kw</methodName>
  <params>
    <param><value><string>${db}</string></value></param>
    <param><value><int>${uid}</int></value></param>
    <param><value><string>${pass}</string></value></param>
    <param><value><string>${model}</string></value></param>
    <param><value><string>${method}</string></value></param>
    <param><value><array><data>${argsXml}</data></array></value></param>
  </params>
</methodCall>`;
}

function xmlrpcValue(v: unknown): string {
  if (typeof v === "string") return `<value><string>${escapeXml(v)}</string></value>`;
  if (typeof v === "number") return `<value><int>${v}</int></value>`;
  if (typeof v === "boolean") return `<value><boolean>${v ? 1 : 0}</boolean></value>`;
  if (Array.isArray(v)) return `<value><array><data>${v.map(xmlrpcValue).join("")}</data></array></value>`;
  if (v === null || v === undefined) return "<value><nil/></value>";
  if (typeof v === "object") {
    return `<value><struct>${Object.entries(v as Record<string, unknown>).map(([k, val]) =>
      `<member><name>${escapeXml(k)}</name>${xmlrpcValue(val)}</member>`
    ).join("")}</struct></value>`;
  }
  return `<value><string>${escapeXml(String(v))}</string></value>`;
}

function escapeXml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function parseXmlrpcResponse(xml: string): unknown {
  // Try <data> wrapper (array responses from search_read, etc.)
  const dataMatch = xml.match(/<data>([\s\S]*?)<\/data>/);
  if (dataMatch) {
    const values = [...dataMatch[1].matchAll(/<value>([\s\S]*?)<\/value>/g)];
    return values.map(v => parseXmlrpcScalar(v[1]));
  }
  // Try single value (int from create, etc.)
  const singleMatch = xml.match(/<param>\s*<value>([\s\S]*?)<\/value>\s*<\/param>/);
  if (singleMatch) return parseXmlrpcScalar(singleMatch[1]);
  return null;
}

function parseXmlrpcScalar(inner: string): unknown {
  const intMatch = inner.match(/<int>(\d+)<\/int>/);
  if (intMatch) return parseInt(intMatch[1]);
  const strMatch = inner.match(/<string>(.*?)<\/string>/s);
  if (strMatch) return strMatch[1];
  const boolMatch = inner.match(/<boolean>(\d)<\/boolean>/);
  if (boolMatch) return boolMatch[1] === "1";
  return inner.trim();
}

// ── Asterisk ARI client ───────────────────────────────────────

async function ariRequest(env: Env, path: string, method = "GET", body?: Record<string, unknown>) {
  const url = `${env.ASTERISK_URL}/ari/${path}`;
  const auth = btoa(`${env.ASTERISK_USER}:${env.ASTERISK_PASS}`);
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return res.json();
}

// ── Caller lookup via Odoo ────────────────────────────────────

async function lookupCaller(env: Env, number: string) {
  if (!number || number === "unknown") return null;
  const clean = number.startsWith("+44") ? "0" + number.slice(3) : number;
  try {
    const uid = await odooAuth(env);
    if (!uid) return null;
    const result = await odooCall(env, uid, "res.partner", "search_read", [[
      ["|", ["phone", "=ilike", `%${clean}%`], ["mobile", "=ilike", `%${clean}%`]],
      { fields: ["id", "name", "phone", "mobile", "email"], limit: 5 },
    ]]) as { parsed: Array<Record<string, unknown>>, _xml: string };
    const partners = result.parsed || [];
    return partners.length > 0 ? partners[0] : null;
  } catch (e) {
    console.error("Odoo lookup failed:", e);
    return null;
  }
}

// Track call data for Odoo logging on hangup: callId → {caller, partnerId, startTime}
const callData = new Map<string, {caller: string, partnerId?: number, startTime: number}>();

async function logCompletedCall(env: Env, callId: string, caller: string, did: string, duration: number) {
  const data = callData.get(callId);
  if (!data) return;
  callData.delete(callId);

  try {
    const uid = await odooAuth(env);
    if (!uid) return;

    // Find partner by caller number
    let partnerId: number | false = data.partnerId || false;
    if (!partnerId) {
      const partner = await lookupCaller(env, caller);
      partnerId = (partner as any)?.id || false;
    }

    const outcome = duration > 0 ? "answered" : "no_answer";
    await odooCall(env, uid, "mail.message", "log_call", [[{
      res_model: partnerId ? "res.partner" : "res.users",
      res_id: partnerId || uid,
      direction: "inbound" as string,
      duration: duration,
      outcome: outcome,
      caller_number: caller,
      callee_number: did,
    }]]);
  } catch (e) {
    console.error("logCompletedCall failed:", e);
  }
}

// ── Durable Object: CallState ──────────────────────────────────

export class CallState {
  private calls = new Map<string, CallRecord>();

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/create") {
      const { callId, caller, did, partnerId, partnerName } = await request.json() as CallCreate;
      this.calls.set(callId, { id: callId, caller, did, status: "ringing", startTime: Date.now(), partnerId, partnerName });
      return Response.json({ ok: true });
    }

    if (request.method === "POST" && url.pathname === "/update") {
      const { callId, ...fields } = await request.json() as { callId: string } & Partial<CallRecord>;
      const call = this.calls.get(callId);
      if (call) Object.assign(call, fields);
      return Response.json({ ok: true });
    }

    if (request.method === "GET" && url.pathname === "/get") {
      const callId = url.searchParams.get("callId");
      return Response.json(callId ? (this.calls.get(callId) ?? null) : null);
    }

    if (request.method === "GET" && url.pathname === "/active") {
      const now = Date.now();
      const active = [...this.calls.values()].filter(c => {
        // Auto-expire ringing calls older than 5 minutes
        if (c.status === "ringing" && (now - c.startTime) > 300000) {
          c.status = "hungup";
          c.endTime = now;
        }
        return c.status !== "hungup";
      });
      return Response.json(active);
    }

    return new Response("Not found", { status: 404 });
  }
}

interface CallCreate {
  callId: string;
  caller: string;
  did: string;
  partnerId?: number;
  partnerName?: string;
}

interface CallRecord {
  id: string;
  caller: string;
  did: string;
  status: "ringing" | "answered" | "hungup";
  partnerId?: number;
  partnerName?: string;
  startTime: number;
  answerTime?: number;
  endTime?: number;
}

// ── Route handlers ─────────────────────────────────────────────

async function handleCallEvent(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const body = await request.text();
  const params = new URLSearchParams(body);
  const event = params.get("event") ?? "unknown";
  const callId = params.get("callId") ?? crypto.randomUUID();
  const caller = params.get("caller") ?? "unknown";
  const did = params.get("did") ?? "";

  const doId = env.CALL_STATE.idFromName("global");
  const stub = env.CALL_STATE.get(doId);

  if (event === "ring") {
    const partner = await lookupCaller(env, caller);
    await stub.fetch(new Request("https://do/create", {
      method: "POST",
      body: JSON.stringify({ callId, caller, did, partnerId: (partner as any)?.id, partnerName: (partner as any)?.name }),
    }));
    callData.set(callId, { caller, partnerId: (partner as any)?.id, startTime: Date.now() });
    return Response.json({ action: "ring", caller, partner: (partner as any)?.name ?? null });
  }

  if (event === "answer") {
    await stub.fetch(new Request("https://do/update", {
      method: "POST",
      body: JSON.stringify({ callId, status: "answered", answerTime: Date.now() }),
    }));
    await env.DB.prepare("INSERT INTO call_log (call_id, caller, did, status, start_time) VALUES (?1, ?2, ?3, 'answered', ?4)")
      .bind(callId, caller, did, Date.now()).run();
    return Response.json({ action: "answered" });
  }

  if (event === "hangup") {
    const duration = parseInt(params.get("duration") ?? "0");
    await stub.fetch(new Request("https://do/update", {
      method: "POST",
      body: JSON.stringify({ callId, status: "hungup", endTime: Date.now() }),
    }));
    await env.DB.prepare("UPDATE call_log SET status='hungup', end_time=?1, duration=?2 WHERE call_id=?3")
      .bind(Date.now(), duration, callId).run();
    ctx.waitUntil(logCompletedCall(env, callId, caller, did, duration));
    return Response.json({ action: "hangup", duration });
  }

  return Response.json({ action: "unknown", event });
}

async function handleClick2Call(request: Request, _env: Env): Promise<Response> {
  const body = await request.json() as {
    destination: string; callerId?: string;
  };
  let destination = body.destination;
  const callerId = body.callerId ?? "+447****7226";

  if (!destination) {
    return Response.json({ error: "missing destination" }, { status: 400 });
  }

  // Normalize: 0... → +44...
  if (destination.startsWith("0")) {
    destination = "+44" + destination.slice(1);
  }

  try {
    // Call VPS AMI bridge — uses proper AMI Originate with post-answer routing
    const res = await fetch("http://64.176.181.195.nip.io/click2call-ami", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destination, callerId }),
    });
    const data = await res.json() as { ok: boolean; msg: string };
    console.log(`click2call: AMI bridge -> ${JSON.stringify(data)}`);

    if (data.ok) {
      return Response.json({ ok: true, msg: data.msg || `Calling ${destination} — Linphone will ring when they answer` });
    }
    return Response.json({ error: data.msg || "AMI bridge failed" }, { status: 500 });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

async function handleAnswer(request: Request, env: Env): Promise<Response> {
  const { channelId } = await request.json() as { channelId: string };
  if (!channelId) return Response.json({ error: "missing channelId" }, { status: 400 });
  try {
    await ariRequest(env, `channels/${channelId}/answer`, "POST");
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

async function handleHangupCall(request: Request, env: Env): Promise<Response> {
  const { channelId } = await request.json() as { channelId: string };
  if (!channelId) return Response.json({ error: "missing channelId" }, { status: 400 });
  try {
    await ariRequest(env, `channels/${channelId}`, "DELETE");
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

async function handleCallerLookup(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const number = url.searchParams.get("number") ?? "";
  const partner = await lookupCaller(env, number);
  return Response.json(partner ? { found: true, name: partner.name, id: partner.id } : { found: false });
}

async function handleActiveCalls(_request: Request, env: Env): Promise<Response> {
  const doId = env.CALL_STATE.idFromName("global");
  const stub = env.CALL_STATE.get(doId);
  return stub.fetch(new Request("https://do/active"));
}

// ── Main router ────────────────────────────────────────────────

function serveDashboard(): Response {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#1a1a2e">
<title>VoIP Bridge</title>
<link rel="manifest" href="data:application/json,${encodeURIComponent(JSON.stringify({name:"VoIP Bridge",short_name:"VoIP",start_url:"/dashboard",display:"standalone",background_color:"#1a1a2e",theme_color:"#1a1a2e",icons:[{src:"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E📞%3C/text%3E%3C/svg%3E",sizes:"100x100",type:"image/svg+xml"}]}))}">
<script src="https://cdn.jsdelivr.net/npm/sip.js@0.16.0/dist/sip.min.js"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#1a1a2e;color:#eee;min-height:100vh;padding:16px}
h1{font-size:24px;margin-bottom:16px;text-align:center}
.card{background:#16213e;border-radius:12px;padding:16px;margin-bottom:12px}
.card h2{font-size:16px;margin-bottom:8px;color:#0f3460}
.status{display:inline-block;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:bold}
.ringing{background:#e94560;color:white}.active{background:#0f3460;color:white}.ended{background:#555;color:#aaa}
.dial-form{display:flex;gap:8px}
.dial-form input{flex:1;padding:10px;border:none;border-radius:8px;background:#0f3460;color:white;font-size:16px}
.dial-form button,.btn-row button{padding:10px 16px;border:none;border-radius:8px;background:#e94560;color:white;font-size:14px;cursor:pointer;margin:4px}
.dial-form button:hover,.btn-row button:hover{background:#c23152}
.btn-row button.hangup-btn{background:#e94560}
.btn-row button.action-btn{background:#0f3460}
.call-row{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #1a1a2e}
.call-row:last-child{border:none}
.call-number{font-weight:bold;font-size:15px}
.call-info{font-size:12px;color:#888}
.hidden{display:none}
#notify-status{text-align:center;font-size:12px;color:#888;margin-top:8px}
#call-controls{margin-top:8px}
#call-info{font-size:15px;text-align:center;margin-bottom:8px}
#phone-status{font-size:12px;text-align:center}
input[type=text]{padding:8px;border:none;border-radius:6px;background:#0f3460;color:white;font-size:13px;width:120px}
</style>
</head>
<body>
<h1>📞 VoIP Bridge <span id="phone-status" style="font-size:12px;color:#888">Loading...</span></h1>

<div class="card">
  <h2>☎️ Softphone</h2>
  <div class="dial-form">
    <input id="dial-number" type="tel" placeholder="+44...">
    <button onclick="clickToDial(document.getElementById('dial-number').value)">Call</button>
    <button onclick="hangup()" style="background:#e94560">End</button>
  </div>
  <div id="call-info">Ready</div>
  <div id="call-controls" class="hidden">
    <div class="btn-row">
      <button id="btn-hold" class="action-btn" onclick="toggleHold()">⏸ Hold</button>
      <button id="btn-mute" class="action-btn" onclick="toggleMute()">🔇 Mute</button>
      <button class="action-btn" onclick="sendDTMF('*')">DTMF</button>
      <button class="action-btn" onclick="hangup()">📴 Hang Up</button>
    </div>
    <div style="margin-top:8px">
      <input id="transfer-num" type="text" placeholder="Transfer to...">
      <button class="action-btn" onclick="blindTransfer(document.getElementById('transfer-num').value)">Blind</button>
      <button class="action-btn" onclick="attendedTransfer(document.getElementById('transfer-num').value)">Attended</button>
    </div>
  </div>
</div>

<div class="card">
  <h2>📁 Directory</h2>
  <div class="dial-form">
    <input id="dir-search" type="text" placeholder="Search contacts...">
    <button onclick="searchDir()">Search</button>
  </div>
  <div id="dir-results" style="font-size:13px;margin-top:8px"></div>
</div>

<div class="card">
  <h2>🔔 Active Calls <span id="active-count" style="font-size:14px;color:#888"></span></h2>
  <div id="active-calls">No active calls</div>
</div>

<div id="notify-status">Notifications: checking...</div>

<script>
// Unlock audio — browsers block WebRTC audio until user gesture
var audioUnlocked = false;
document.addEventListener("click", function unlockAudio() {
  if (audioUnlocked) return;
  var ctx = new (window.AudioContext || window.webkitAudioContext)();
  var osc = ctx.createOscillator();
  var gain = ctx.createGain(); gain.gain.value = 0.001;
  osc.connect(gain); gain.connect(ctx.destination);
  osc.start(0); osc.stop(ctx.currentTime + 0.001);
  ctx.resume().then(function() { audioUnlocked = true; });
  document.getElementById("phone-status").textContent = "🔓 Audio unlocked";
  setTimeout(function() { if (audioUnlocked && document.getElementById("phone-status").textContent === "🔓 Audio unlocked") document.getElementById("phone-status").textContent = "✅ Registered"; }, 2000);
  console.log("AudioContext unlocked, state:", ctx.state);
}, { once: true });

const API = "https://voip-bridge.wandering-mode-c597.workers.dev";
const seen = new Set();
// Init softphone on load
document.addEventListener("DOMContentLoaded", initSoftphone);

// Directory search
async function searchDir() {
  var q = document.getElementById("dir-search").value.trim();
  if (!q) return;
  try {
    var r = await fetch(API + "/caller-lookup?number=" + encodeURIComponent(q));
    var d = await r.json();
    var el = document.getElementById("dir-results");
    el.innerHTML = d.found ? '<div style="cursor:pointer;color:#4ecca3" onclick="dialOut(\\'' + q + '\\')">📞 ' + d.name + " - " + q + "</div>" : "Not found";
  } catch(e) {}
}

async function clickToDial(num) {
  console.log("clickToDial called with:", num);
  if (!num) return;
  try {
    var r = await fetch(API + "/click2call", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({destination: num}) });
    var d = await r.json();
    console.log("click2call response:", d);
    var info = document.getElementById("call-info");
    info.textContent = d.ok ? "📞 " + d.msg : "❌ " + (d.error || "Failed");
  } catch(e) {
    console.error("clickToDial error:", e);
    document.getElementById("call-info").textContent = "❌ " + e.message;
  }
}

document.getElementById("dial-number").addEventListener("keydown", function(e) {
  if (e.key === "Enter") clickToDial(document.getElementById("dial-number").value);
});
document.getElementById("dir-search").addEventListener("keydown", function(e) {
  if (e.key === "Enter") searchDir();
});

// Active calls refresh
async function refreshActive() {
  try {
    var r = await fetch(API + "/active-calls");
    var calls = await r.json();
    var el = document.getElementById("active-calls");
    var cnt = document.getElementById("active-count");
    cnt.textContent = calls.length ? "(" + calls.length + ")" : "";
    if (!calls.length) { el.innerHTML = "No active calls"; return; }
    el.innerHTML = calls.map(function(c) {
      var cls = c.status === "ringing" ? "ringing" : c.status === "answered" ? "active" : "ended";
      return '<div class="call-row"><div><span class="call-number">' + c.caller + '</span><br><span class="call-info">→ ' + c.did + '</span></div><span class="status ' + cls + '">' + c.status + '</span></div>';
    }).join("");
    for (var i = 0; i < calls.length; i++) {
      var c = calls[i];
      if (c.status === "ringing" && !seen.has(c.id)) {
        seen.add(c.id);
        if (Notification.permission === "granted") {
          new Notification("📞 Incoming call", {body: c.caller + (c.partnerName ? " — " + c.partnerName : ""), tag: c.id});
        }
      }
    }
  } catch(e) {}
}

function setupNotifications() {
  var s = document.getElementById("notify-status");
  if (!("Notification" in window)) { s.textContent = "Notifications: not supported"; return; }
  if (Notification.permission === "granted") { s.textContent = "Notifications: ✅ enabled"; return; }
  if (Notification.permission === "denied") { s.textContent = "Notifications: ❌ denied"; return; }
  s.innerHTML = '<button onclick="Notification.requestPermission().then(function(p){location.reload()})" style="background:#0f3460;color:white;border:none;padding:4px 12px;border-radius:4px;cursor:pointer">Enable Notifications</button>';
}

if ("serviceWorker" in navigator) {
  try {
    navigator.serviceWorker.register("data:application/javascript," + encodeURIComponent(
      "self.addEventListener('install',function(e){self.skipWaiting()});self.addEventListener('activate',function(e){e.waitUntil(clients.claim())});self.addEventListener('fetch',function(e){e.respondWith(fetch(e.request))})"
    )).catch(function(){});
  } catch(e) {}
}

setupNotifications();
setInterval(refreshActive, 2000);
refreshActive();

// === softphone.js inline ===
var wsProto = location.protocol === "https:" ? "wss" : "ws";
var wsHost = "64.176.181.195.nip.io";
var SIP_CFG = { wsUri: wsProto + "://" + wsHost + "/ws", uri: "sip:201@64.176.181.195", password: "webphone201" };
var sipUA, sipSession, currentCall, heldSession, muted = false, onHold = false;

function initSoftphone() {
  var el = document.getElementById("phone-status");
  el.textContent = "Checking SIP.js...";
  if (typeof SIP === "undefined") { el.textContent = "❌ sip.js not loaded"; el.style.color = "#e94560"; return; }
  el.textContent = "Connecting to " + SIP_CFG.wsUri + "...";
  try {
    sipUA = new SIP.UserAgent({
      uri: SIP.UserAgent.makeURI(SIP_CFG.uri),
      transportOptions: { server: SIP_CFG.wsUri },
      authorizationUsername: "201",
      authorizationPassword: SIP_CFG.password,
      sessionDescriptionHandlerFactoryOptions: { constraints: { audio: true, video: false } },
    });
  } catch(e) { el.textContent = "❌ Init: " + e.message; el.style.color = "#e94560"; return; }

  var registerer = new SIP.Registerer(sipUA, { expires: 3600 });
  registerer.stateChange.on(function(state) {
    if (state === SIP.RegistererState.Registered) { el.textContent = "✅ Registered"; el.style.color = "#4ecca3"; }
    else if (state === SIP.RegistererState.Unregistered) { el.textContent = "❌ Unregistered"; el.style.color = "#e94560"; }
    else { el.textContent = "⏳ " + state; el.style.color = "#888"; }
  });

  sipUA.delegate = {
    onInvite: function(inv) {
      sipSession = inv;
      currentCall = { id: inv.request.callId, dir: "in", remote: inv.remoteIdentity.uri.user || inv.remoteIdentity.displayName, state: "ringing" };
      renderCallUI();
      inv.stateChange.on(function(state) {
        if (state === SIP.SessionState.Established) {
          currentCall.state = "active";
          renderCallUI();
        }
        if (state === SIP.SessionState.Terminated) resetCall();
      });
      // Hook ontrack BEFORE accept for remote audio playback
      if (inv.sessionDescriptionHandler && inv.sessionDescriptionHandler.peerConnection) {
        inv.sessionDescriptionHandler.peerConnection.ontrack = function(evt) {
          console.log("ontrack fired, track kind:", evt.track.kind, "streams:", evt.streams.length);
          if (evt.track.kind === "audio") {
            var a = document.createElement("audio");
            a.autoplay = true; a.srcObject = evt.streams[0];
            a.play().then(function() { console.log("Audio playing"); }).catch(function(e) { console.error("Audio play failed:", e); });
            document.body.appendChild(a);
          }
        };
      }
      inv.accept({ sessionDescriptionHandlerOptions: { constraints: { audio: true, video: false } } });
      var ac = new (window.AudioContext || window.webkitAudioContext)();
      ac.resume().catch(function(){});
    },
  };

  sipUA.start().then(function() { registerer.register(); });
}

function dialOut(num) {
  if (!num) return;
  if (num.startsWith("0")) num = "+44" + num.slice(1);
  var target = SIP.UserAgent.makeURI("sip:" + num + "@64.176.181.195");
  var inviter = new SIP.Inviter(sipUA, target, { sessionDescriptionHandlerOptions: { constraints: { audio: true, video: false } } });
  sipSession = inviter;
  currentCall = { id: inviter.request.callId, dir: "out", remote: num, state: "calling" };
  renderCallUI();
  inviter.stateChange.on(function(state) {
    if (state === SIP.SessionState.Established) { currentCall.state = "active"; renderCallUI(); }
    if (state === SIP.SessionState.Terminated) resetCall();
  });
  inviter.send();
}

function hangup() { if (sipSession) { sipSession.dispose(); resetCall(); } }
function resetCall() { if (heldSession) { try { heldSession.dispose(); } catch(e) {} heldSession = null; } sipSession = null; currentCall = null; onHold = false; muted = false; renderCallUI(); }
function toggleHold() { if (!sipSession) return; if (onHold) { sipSession.unhold(); onHold = false; } else { sipSession.hold(); onHold = true; } renderCallUI(); }
function toggleMute() { if (!sipSession) return; muted = !muted; if (sipSession.mute) sipSession.mute(muted); renderCallUI(); }
function blindTransfer(target) { if (!sipSession || !target) return; sipSession.refer(SIP.UserAgent.makeURI("sip:" + target + "@64.176.181.195")).then(resetCall).catch(function(e){}); }
function attendedTransfer(target) {
  if (!sipSession || !target) return;
  sipSession.hold(); onHold = true; heldSession = sipSession;
  var tUri = SIP.UserAgent.makeURI("sip:" + target + "@64.176.181.195");
  var ns = new SIP.Inviter(sipUA, tUri);
  sipSession = ns;
  currentCall = { id: ns.request.callId, dir: "out", remote: target, state: "calling" };
  renderCallUI();
  ns.stateChange.on(function(state) {
    if (state === SIP.SessionState.Established) { currentCall.state = "active"; renderCallUI(); heldSession.refer(tUri).then(function(){ heldSession = null; }).catch(function(){}); }
    if (state === SIP.SessionState.Terminated) { if (heldSession) { sipSession = heldSession; heldSession = null; sipSession.unhold(); onHold = false; renderCallUI(); } else resetCall(); }
  });
  ns.send();
}
function sendDTMF(d) { if (sipSession && sipSession.dtmf) sipSession.dtmf(d); }
function renderCallUI() {
  var ctrl = document.getElementById("call-controls");
  var info = document.getElementById("call-info");
  if (!currentCall) { ctrl.classList.add("hidden"); info.textContent = "Ready"; return; }
  ctrl.classList.remove("hidden");
  var dir = currentCall.dir === "in" ? "⬇" : "⬆";
  var si = { ringing: "🔔", calling: "📞", active: "🔊" }[currentCall.state] || "📞";
  info.textContent = si + " " + dir + " " + currentCall.remote + " (" + currentCall.state + ")";
  document.getElementById("btn-hold").textContent = onHold ? "▶ Resume" : "⏸ Hold";
  document.getElementById("btn-mute").textContent = muted ? "🔊 Unmute" : "🔇 Mute";
}
</script>
</body>
</html>`;
  return new Response(html, { headers: { "Content-Type": "text/html;charset=utf-8" } });
}

// ── CORS ───────────────────────────────────────────────────────

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    let response: Response;
    if (request.method === "POST" && url.pathname === "/call-event") response = await handleCallEvent(request, env, ctx);
    else if (request.method === "POST" && url.pathname === "/click2call") response = await handleClick2Call(request, env);
    else if (request.method === "POST" && url.pathname === "/answer") response = await handleAnswer(request, env);
    else if (request.method === "POST" && url.pathname === "/hangup-call") response = await handleHangupCall(request, env);
    else if (request.method === "GET" && url.pathname === "/caller-lookup") response = await handleCallerLookup(request, env);
    else if (request.method === "GET" && url.pathname === "/active-calls") response = await handleActiveCalls(request, env);
    else if (url.pathname === "/") response = Response.json({ service: "voip-bridge", routes: ["/call-event", "/click2call", "/caller-lookup", "/active-calls", "/answer", "/hangup-call"] });
    else if (url.pathname === "/dashboard") response = serveDashboard();
    else response = new Response("Not found", { status: 404 });

    // Add CORS headers
    const headers = new Headers(response.headers);
    const ch = corsHeaders();
    for (const [k, v] of Object.entries(ch)) headers.set(k, v);
    return new Response(response.body, { status: response.status, headers });
  },
};
