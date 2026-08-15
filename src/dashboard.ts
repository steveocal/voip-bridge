export function serveDashboard(): Response {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<meta name="theme-color" content="#0b0f19">
<title>VoIP Bridge</title>
<link rel="manifest" href="data:application/json,${encodeURIComponent(JSON.stringify({name:"VoIP Bridge",short_name:"VoIP",start_url:"/dashboard",display:"standalone",background_color:"#0b0f19",theme_color:"#0b0f19",icons:[{src:"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E📞%3C/text%3E%3C/svg%3E",sizes:"100x100",type:"image/svg+xml"}]}))}">
<script src="https://cdn.jsdelivr.net/npm/sip.js@0.16.0/dist/sip.min.js"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{height:100%}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:radial-gradient(1200px 600px at 50% -10%,#1b2440 0%,#0b0f19 60%);color:#e8ecf4;height:100dvh;overflow:hidden;display:flex;justify-content:center}
.app{width:100%;max-width:430px;height:100dvh;display:flex;flex-direction:column;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom)}
/* header */
.topbar{display:flex;align-items:center;gap:12px;padding:14px 16px 8px}
.avatar{width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#3b82f6,#2563eb);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0}
.identity{flex:1;min-width:0}
.user-name{font-size:17px;font-weight:700}
.caller-id{font-size:13px;color:#8b95a9}
.reg-status{font-size:12px;color:#8b95a9;text-align:right;max-width:120px}
.reg-status.ok{color:#34d399}
.reg-status.err{color:#f87171}
/* entry box */
.entry{display:flex;align-items:center;gap:8px;padding:8px 16px}
.entry input{flex:1;padding:13px 14px;border:none;border-radius:12px;background:#141b2e;color:#fff;font-size:20px;letter-spacing:.5px;outline:none}
.entry input::placeholder{color:#4b5568}
.backspace{width:46px;height:46px;border:none;border-radius:12px;background:#141b2e;color:#cbd5e1;font-size:20px;cursor:pointer}
.suggestions{padding:0 16px 6px;min-height:0}
.sugg-row{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-radius:10px;background:#141b2e;margin-bottom:6px;cursor:pointer}
.sugg-row .n{font-size:15px;font-weight:600}
.sugg-row .s{font-size:13px;color:#8b95a9}
.sugg-row .call{color:#34d399;font-weight:700}
/* dialpad */
.dialpad{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:12px 28px}
.key{height:66px;border:none;border-radius:50%;background:#161e33;color:#fff;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;user-select:none;transition:transform .05s}
.key:active{transform:scale(.94);background:#1f2a44}
.key .digit{font-size:26px;line-height:1;font-weight:500}
.key .letters{font-size:9px;letter-spacing:2px;color:#8b95a9;margin-top:2px}
/* call action */
.callbar{display:flex;justify-content:center;gap:24px;padding:14px 0 8px}
.call-btn{width:64px;height:64px;border-radius:50%;border:none;font-size:26px;cursor:pointer;background:linear-gradient(135deg,#34d399,#10b981);box-shadow:0 4px 18px rgba(16,185,129,.4)}
.call-btn.hangup{background:linear-gradient(135deg,#f87171,#ef4444);box-shadow:0 4px 18px rgba(239,68,68,.4)}
.call-btn.hidden{display:none}
/* active call banner */
.call-banner{display:flex;align-items:center;justify-content:space-between;margin:0 16px 8px;padding:12px 14px;border-radius:12px;background:#13291f;border:1px solid #1f4d38}
.call-banner .info{min-width:0}
.call-banner .remote{font-size:16px;font-weight:700}
.call-banner .state{font-size:12px;color:#6ee7b7}
.call-banner .end{width:44px;height:44px;border-radius:50%;border:none;background:#ef4444;color:#fff;font-size:18px;cursor:pointer;flex-shrink:0}
.hidden{display:none!important}
/* views */
.views{flex:1;overflow-y:auto;padding:4px 16px 8px}
.view h2{font-size:15px;color:#8b95a9;margin:10px 0;font-weight:600}
.hist-row,.contact-row{display:flex;align-items:center;gap:12px;padding:12px 4px;border-bottom:1px solid #1a2238}
.hist-row{cursor:pointer}
.hist-row .ic{font-size:18px}
.hist-row .who,.contact-row .cname{font-size:15px;font-weight:600}
.hist-row .sub,.contact-row .sub{font-size:12px;color:#8b95a9}
.hist-row .meta{margin-left:auto;font-size:12px;color:#8b95a9;text-align:right}
.contact-row .mini-call{margin-left:auto;width:38px;height:38px;border-radius:50%;border:none;background:#10b981;color:#fff;font-size:16px;cursor:pointer}
.empty{color:#4b5568;text-align:center;padding:28px 0;font-size:14px}
/* bottom menu */
.bottom-menu{display:flex;border-top:1px solid #1a2238;background:#0d1322;padding:6px 0 env(safe-area-inset-bottom)}
.menu-btn{flex:1;background:none;border:none;color:#64748b;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;padding:6px 0;font-size:10px}
.menu-btn .ico{font-size:20px}
.menu-btn.active{color:#3b82f6}
</style>
</head>
<body>
<div class="app">
  <header class="topbar">
    <div class="avatar">👤</div>
    <div class="identity">
      <div class="user-name">Ext 201</div>
      <div class="caller-id">Caller ID: +44 7898 117226</div>
    </div>
    <div class="reg-status" id="phone-status">Loading…</div>
  </header>

  <div class="call-banner hidden" id="call-banner">
    <div class="info">
      <div class="remote" id="banner-remote"></div>
      <div class="state" id="banner-state"></div>
    </div>
    <button class="end" onclick="hangup()">📴</button>
  </div>

  <div class="views">
    <!-- DIAL VIEW -->
    <div class="view" id="view-dial">
      <div class="entry">
        <input id="dial-input" type="text" placeholder="Enter number or name" autocomplete="off" autocapitalize="off">
        <button class="backspace" onclick="backspace()">⌫</button>
      </div>
      <div class="suggestions" id="dial-suggestions"></div>
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
      <div class="callbar">
        <button class="call-btn" id="btn-call" onclick="dialAction()">📞</button>
        <button class="call-btn hangup hidden" id="btn-end" onclick="hangup()">📴</button>
      </div>
    </div>

    <!-- HISTORY VIEW -->
    <div class="view hidden" id="view-history">
      <h2>🕐 History</h2>
      <div id="history-list"><div class="empty">Loading…</div></div>
    </div>

    <!-- FAVOURITES VIEW -->
    <div class="view hidden" id="view-favourites">
      <h2>⭐ Favourites</h2>
      <div id="fav-list"><div class="empty">No favourites yet</div></div>
    </div>

    <!-- CONTACTS VIEW -->
    <div class="view hidden" id="view-contacts">
      <h2>👥 Contacts</h2>
      <div class="entry">
        <input id="contact-search" type="text" placeholder="Search contacts" autocomplete="off">
      </div>
      <div id="contacts-list"><div class="empty">Type to search</div></div>
    </div>

    <!-- MESSAGES VIEW -->
    <div class="view hidden" id="view-messages">
      <h2>💬 Messages</h2>
      <div id="messages-list"><div class="empty">No messages yet</div></div>
    </div>
  </div>

  <nav class="bottom-menu">
    <button class="menu-btn" data-view="history" onclick="switchView('history')"><span class="ico">🕐</span><span>History</span></button>
    <button class="menu-btn" data-view="favourites" onclick="switchView('favourites')"><span class="ico">⭐</span><span>Favourites</span></button>
    <button class="menu-btn active" data-view="dial" onclick="switchView('dial')"><span class="ico">📞</span><span>Dial</span></button>
    <button class="menu-btn" data-view="contacts" onclick="switchView('contacts')"><span class="ico">👥</span><span>Contacts</span></button>
    <button class="menu-btn" data-view="messages" onclick="switchView('messages')"><span class="ico">💬</span><span>Messages</span></button>
  </nav>
</div>

<script>
// ── config ─────────────────────────────────────────────────────
var API = "https://voip-bridge.wandering-mode-c597.workers.dev";
var wsProto = location.protocol === "https:" ? "wss" : "ws";
var wsHost = "64.176.181.195.nip.io";
var SIP_CFG = {
  wsUri: wsProto + "://" + wsHost + "/ws",
  uri: "sip:201@64.176.181.195",
  password: "webphone201",
  callerId: "+44 7898 117226"
};

var sipUA, sipSession, currentCall, heldSession, muted = false, onHold = false;

// ── audio unlock (WebRTC autoplay policy) ──────────────────────
var audioUnlocked = false;
document.addEventListener("click", function unlockAudio() {
  if (audioUnlocked) return;
  var ctx = new (window.AudioContext || window.webkitAudioContext)();
  var osc = ctx.createOscillator(); var gain = ctx.createGain(); gain.gain.value = 0.001;
  osc.connect(gain); gain.connect(ctx.destination);
  osc.start(0); osc.stop(ctx.currentTime + 0.001);
  ctx.resume().then(function() { audioUnlocked = true; });
}, { once: true });

// ── view switching ─────────────────────────────────────────────
function switchView(name) {
  var views = document.querySelectorAll(".view");
  for (var i = 0; i < views.length; i++) views[i].classList.add("hidden");
  document.getElementById("view-" + name).classList.remove("hidden");
  var btns = document.querySelectorAll(".menu-btn");
  for (var j = 0; j < btns.length; j++) btns[j].classList.remove("active");
  var b = document.querySelector('.menu-btn[data-view="' + name + '"]');
  if (b) b.classList.add("active");
  if (name === "history") loadHistory();
  if (name === "contacts") loadContacts(document.getElementById("contact-search").value);
}

// ── dialpad input ──────────────────────────────────────────────
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
  if (d === "0") { longPressFired = false; pressTimer = setTimeout(function() { longPressFired = true; insertChar("+"); }, 600); return; }
  insertChar(d);
}
function keyUp(d) {
  if (d === "0") { clearTimeout(pressTimer); if (!longPressFired) insertChar("0"); }
}

var pad = document.getElementById("dialpad");
pad.addEventListener("pointerdown", function(e) {
  var k = e.target.closest(".key"); if (!k) return; keyDown(k.getAttribute("data-d"));
});
pad.addEventListener("pointerup", function(e) {
  var k = e.target.closest(".key"); if (!k) return; keyUp(k.getAttribute("data-d"));
});
pad.addEventListener("pointerleave", function(e) {
  var k = e.target.closest(".key"); if (!k) return; if (k.getAttribute("data-d") === "0") { clearTimeout(pressTimer); }
});

// ── universal text box: live contact suggestions ───────────────
var suggestTimer = null;
function onDialInput() {
  var q = document.getElementById("dial-input").value.trim();
  if (suggestTimer) clearTimeout(suggestTimer);
  suggestTimer = setTimeout(function() { searchSuggestions(q); }, 220);
}
function searchSuggestions(q) {
  var el = document.getElementById("dial-suggestions");
  if (!q) { el.innerHTML = ""; return; }
  fetch(API + "/contacts?q=" + encodeURIComponent(q) + "&limit=6").then(function(r){return r.json();}).then(function(d){
    var list = d.contacts || [];
    if (!list.length) { el.innerHTML = ""; return; }
    el.innerHTML = list.map(function(c) {
      var num = c.mobile || c.phone || "";
      return '<div class="sugg-row" onclick="pickSuggestion(\'' + esc(num) + '\', \'' + esc(c.name) + '\')"><div><div class="n">' + esc(c.name) + '</div>' + (num ? '<div class="s">' + esc(num) + '</div>' : '') + '</div>' + (num ? '<span class="call">📞</span>' : '') + '</div>';
    }).join("");
  }).catch(function(){});
}
function pickSuggestion(num, name) {
  var inp = document.getElementById("dial-input");
  inp.value = num || name;
  document.getElementById("dial-suggestions").innerHTML = "";
}
function esc(s) { return String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/'/g,"&#39;").replace(/"/g,"&quot;"); }

// ── call actions ───────────────────────────────────────────────
function dialAction() {
  var num = document.getElementById("dial-input").value.trim();
  if (currentCall) { hangup(); return; }
  if (!num) return;
  dialOut(num);
}
function dialOut(num) {
  if (!num) return;
  num = String(num).replace(/[^+0-9*#]/g, "");
  if (num.startsWith("0")) num = "+44" + num.slice(1);
  if (!sipUA) { setStatus("❌ Not registered", true); return; }
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
function hangup() { if (sipSession) { sipSession.dispose(); } resetCall(); }
function resetCall() {
  if (heldSession) { try { heldSession.dispose(); } catch(e) {} heldSession = null; }
  sipSession = null; currentCall = null; onHold = false; muted = false;
  renderCallUI();
}
function renderCallUI() {
  var banner = document.getElementById("call-banner");
  var btnCall = document.getElementById("btn-call");
  var btnEnd = document.getElementById("btn-end");
  if (!currentCall) {
    banner.classList.add("hidden");
    btnCall.classList.remove("hidden"); btnCall.classList.remove("hangup");
    btnEnd.classList.add("hidden");
    return;
  }
  banner.classList.remove("hidden");
  document.getElementById("banner-remote").textContent = currentCall.remote;
  var si = { ringing: "🔔 Incoming…", calling: "📞 Calling…", active: "🔊 Connected" }[currentCall.state] || currentCall.state;
  document.getElementById("banner-state").textContent = (currentCall.dir === "in" ? "⬇ " : "⬆ ") + si;
  btnCall.classList.add("hidden");
  btnEnd.classList.remove("hidden");
}

function setStatus(msg, isErr) {
  var el = document.getElementById("phone-status");
  el.textContent = msg;
  el.className = "reg-status" + (isErr ? " err" : " ok");
}

// ── history ────────────────────────────────────────────────────
function loadHistory() {
  var el = document.getElementById("history-list");
  el.innerHTML = '<div class="empty">Loading…</div>';
  fetch(API + "/call-history?limit=100").then(function(r){return r.json();}).then(function(d){
    var calls = d.calls || [];
    if (!calls.length) { el.innerHTML = '<div class="empty">No calls yet</div>'; return; }
    el.innerHTML = calls.map(function(c) {
      var icon = (c.state === "missed" || c.state === "rejected" || c.state === "aborted") ? "🔴" : (c.state === "calling" ? "🟡" : "🟢");
      var who = c.phone_number && c.phone_number !== "unknown" ? c.phone_number : (c.did || "unknown");
      var when = c.start_date ? fmtTime(c.start_date) : "";
      var dur = c.duration ? " · " + Math.round(c.duration) + "s" : "";
      var dialable = /^[+0-9*#]/.test(who);
      return '<div class="hist-row"' + (dialable ? ' onclick="dialOut(\'' + who + '\')"' : '') + '><span class="ic">' + icon + '</span><div><div class="who">' + esc(who) + '</div>' + (c.did ? '<div class="sub">→ ' + esc(c.did) + '</div>' : '') + '</div><div class="meta">' + when + dur + '</div></div>';
    }).join("");
  }).catch(function(){ el.innerHTML = '<div class="empty">Error loading history</div>'; });
}
function fmtTime(ts) {
  var d = new Date(ts);
  var now = new Date();
  var sameDay = d.toDateString() === now.toDateString();
  var hh = ("0" + d.getHours()).slice(-2), mm = ("0" + d.getMinutes()).slice(-2);
  return sameDay ? hh + ":" + mm : d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) + " " + hh + ":" + mm;
}

// ── contacts ───────────────────────────────────────────────────
function loadContacts(q) {
  var el = document.getElementById("contacts-list");
  if (!q) { el.innerHTML = '<div class="empty">Type to search</div>'; return; }
  el.innerHTML = '<div class="empty">Loading…</div>';
  fetch(API + "/contacts?q=" + encodeURIComponent(q) + "&limit=60").then(function(r){return r.json();}).then(function(d){
    var list = d.contacts || [];
    if (!list.length) { el.innerHTML = '<div class="empty">No contacts found</div>'; return; }
    el.innerHTML = list.map(function(c) {
      var num = c.mobile || c.phone || "";
      return '<div class="contact-row"><div><div class="cname">' + esc(c.name) + (c.is_company ? " 🏢" : "") + '</div>' + (num ? '<div class="sub">' + esc(num) + '</div>' : '') + (c.email ? '<div class="sub">' + esc(c.email) + '</div>' : '') + '</div>' + (num ? '<button class="mini-call" onclick="dialOut(\'' + esc(num) + '\')">📞</button>' : '') + '</div>';
    }).join("");
  }).catch(function(){ el.innerHTML = '<div class="empty">Error</div>'; });
}
document.getElementById("contact-search").addEventListener("input", function(e) {
  var q = e.target.value.trim();
  if (q) loadContacts(q); else loadContacts("");
});

// ── softphone init ─────────────────────────────────────────────
function initSoftphone() {
  var el = document.getElementById("phone-status");
  if (typeof SIP === "undefined") { setStatus("❌ sip.js missing", true); return; }
  setStatus("Connecting…", false);
  try {
    sipUA = new SIP.UserAgent({
      uri: SIP.UserAgent.makeURI(SIP_CFG.uri),
      transportOptions: { server: SIP_CFG.wsUri },
      authorizationUsername: "201",
      authorizationPassword: SIP_CFG.password,
      sessionDescriptionHandlerFactoryOptions: { constraints: { audio: true, video: false } }
    });
  } catch(e) { setStatus("❌ Init: " + e.message, true); return; }

  var registerer = new SIP.Registerer(sipUA, { expires: 3600 });
  registerer.stateChange.on(function(state) {
    if (state === SIP.RegistererState.Registered) setStatus("✅ Registered", false);
    else if (state === SIP.RegistererState.Unregistered) setStatus("❌ Unregistered", true);
    else setStatus("⏳ " + state, false);
  });

  sipUA.delegate = {
    onInvite: function(inv) {
      sipSession = inv;
      currentCall = { id: inv.request.callId, dir: "in", remote: inv.remoteIdentity.uri.user || inv.remoteIdentity.displayName, state: "ringing" };
      renderCallUI();
      inv.stateChange.on(function(state) {
        if (state === SIP.SessionState.Established) { currentCall.state = "active"; renderCallUI(); }
        if (state === SIP.SessionState.Terminated) resetCall();
      });
      if (inv.sessionDescriptionHandler && inv.sessionDescriptionHandler.peerConnection) {
        inv.sessionDescriptionHandler.peerConnection.ontrack = function(evt) {
          if (evt.track.kind === "audio") {
            var a = document.createElement("audio");
            a.autoplay = true; a.srcObject = evt.streams[0];
            a.play().catch(function(){});
            document.body.appendChild(a);
          }
        };
      }
      inv.accept({ sessionDescriptionHandlerOptions: { constraints: { audio: true, video: false } } });
      var ac = new (window.AudioContext || window.webkitAudioContext)();
      ac.resume().catch(function(){});
    }
  };

  sipUA.start().then(function() { registerer.register(); });
}

// ── boot ───────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", initSoftphone);
</script>
</body>
</html>`;
  return new Response(html, { headers: { "Content-Type": "text/html;charset=utf-8" } });
}
