export function serveDashboard(): Response {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<meta name="theme-color" content="#0b0f19">
<title>VoIP Bridge</title>
<link rel="manifest" href="data:application/json,${encodeURIComponent(JSON.stringify({name:"VoIP Bridge",short_name:"VoIP",start_url:"/dashboard",display:"standalone",background_color:"#0b0f19",theme_color:"#0b0f19",icons:[{src:"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E📞%3C/text%3E%3C/svg%3E",sizes:"100x100",type:"image/svg+xml"}]}))}">
<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{height:100%}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:radial-gradient(1200px 600px at 50% -10%,#2a2a2a 0%,#000 60%);color:#ececec;height:100dvh;overflow:hidden;display:flex;justify-content:center}
.app{width:100%;max-width:430px;height:100dvh;display:flex;flex-direction:column;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom)}
/* header */
.topbar{display:flex;align-items:center;gap:12px;padding:14px 16px 8px}
.avatar{width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#4db8ff,#2563eb);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0}
.identity{flex:1;min-width:0}
.user-name{font-size:17px;font-weight:700}
.caller-id{font-size:13px;color:#999}
.reg-status{font-size:12px;color:#999;text-align:right;max-width:120px}
.reg-status.ok{color:#34d399}
.reg-status.err{color:#f87171}
/* entry box */
.entry{display:flex;align-items:center;gap:8px;padding:8px 16px}
.entry input{flex:1;padding:13px 14px;border:none;border-radius:12px;background:#1a1a1a;color:#fff;font-size:20px;letter-spacing:.5px;outline:none}
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
.hidden{display:none!important}
/* views */
.views{flex:1;overflow-y:auto;padding:4px 16px 8px}
.view h2{font-size:15px;color:#999;margin:10px 0;font-weight:600}
.hist-row,.contact-row{display:flex;align-items:center;gap:12px;padding:12px 4px;border-bottom:1px solid #222}
.hist-row{cursor:pointer}
.hist-row .ic{font-size:18px}
.hist-row .who,.contact-row .cname{font-size:15px;font-weight:600}
.hist-row .sub,.contact-row .sub{font-size:12px;color:#999}
.hist-row .meta{margin-left:auto;font-size:12px;color:#999;text-align:right}
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
#view-history h2{color:#c792ea;border-left-color:#c792ea}
.msg-row .subj{color:#e6e6e6}
/* favourites star */
.fav-star{flex-shrink:0;background:none;border:none;font-size:24px;line-height:1;cursor:pointer;padding:2px 4px;color:#555;width:38px;margin-left:auto}
.fav-star.on{color:#f7c948}
/* call notes + quick text */
.notes-wrap{padding:0 16px;margin-top:2px}
.notes-wrap textarea{width:100%;min-height:76px;background:#1a1a1a;border:1px solid #2c2c2c;border-radius:12px;color:#fff;font-size:14px;padding:12px 14px;outline:none;resize:none;font-family:inherit;line-height:1.5}
.qt-panel{margin:8px 16px 0;background:#1a1a1a;border:1px solid #2c2c2c;border-radius:12px;padding:8px;max-height:200px;overflow-y:auto}
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
.notes-wrap .tox-tinymce{border-color:#2c2c2c}
</style>
</head>
<body>
<div class="app">
  <header class="topbar">
    <div class="avatar">👤</div>
    <div class="identity">
      <div class="user-name" id="acc-name-display">Ext 201</div>
      <div class="caller-id" id="acc-caller-display">Caller ID: +44 7898 117226</div>
    </div>
    <div class="reg-status" id="phone-status">Loading…</div>
    <button class="menu-icon" onclick="toggleMenu()" aria-label="Menu">☰</button>
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
      <div class="notes-wrap hidden" id="notes-wrap">
        <textarea id="call-notes" placeholder="Call notes… (press # for quick text)" autocomplete="off"></textarea>
      </div>
      <div class="qt-panel hidden" id="qt-panel">
        <div class="qt-head">Quick text — tap to insert</div>
        <div id="qt-list"></div>
      </div>
      <div class="callbar">
        <button class="call-btn" id="btn-call" onclick="dialAction()">📞</button>
        <button class="call-btn hangup hidden" id="btn-end" onclick="hangup()">📴</button>
      </div>
    </div>

    <!-- HISTORY VIEW -->
    <div class="view hidden" id="view-history">
      <h2>🕐 History</h2>
      <div class="entry">
        <input id="history-search" type="text" placeholder="Search calls (name / number)" autocomplete="off" autocapitalize="off">
      </div>
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
      <h2 id="msg-title">💬 Messages</h2>
      <div id="messages-list"><div class="empty">Select a contact to view messages</div></div>
    </div>
  </div>

  <nav class="bottom-menu">
    <button class="menu-btn" data-view="history" onclick="switchView('history')"><span class="ico">🕐</span><span>History</span></button>
    <button class="menu-btn" data-view="favourites" onclick="switchView('favourites')"><span class="ico">⭐</span><span>Favourites</span></button>
    <button class="menu-btn active" data-view="dial" onclick="switchView('dial')"><span class="ico">📞</span><span>Dial</span></button>
    <button class="menu-btn" data-view="contacts" onclick="switchView('contacts')"><span class="ico">👥</span><span>Contacts</span></button>
    <button class="menu-btn" data-view="messages" onclick="switchView('messages')"><span class="ico">💬</span><span>Messages</span></button>
  </nav>
  <div class="action-bar hidden" id="action-bar"></div>
</div>

<div class="menu-drawer hidden" id="menu-drawer">
  <button onclick="openSettings()">⚙️ Settings</button>
</div>

<div class="modal hidden" id="settings-modal">
  <div class="modal-card">
    <div class="modal-head"><span>⚙️ Settings</span><button onclick="closeSettings()">✕</button></div>

    <div class="set-field">
      <label>SIP Account</label>
      <select id="set-account" class="acc-select" onchange="onAccountSelect()"></select>
    </div>

    <div id="account-editor" class="hidden">
      <div class="set-field">
        <label>Name</label>
        <input id="acc-name" type="text" placeholder="Asterisk (WebPhone 201)" autocomplete="off">
      </div>
      <div class="set-field">
        <label>Username</label>
        <input id="acc-username" type="text" placeholder="201" autocomplete="off" autocapitalize="off" spellcheck="false">
      </div>
      <div class="set-field">
        <label>Password</label>
        <input id="acc-password" type="text" placeholder="webphone201" autocomplete="off" autocapitalize="off" spellcheck="false">
      </div>
      <div class="set-field">
        <label>Proxy / Server</label>
        <input id="acc-server" type="text" placeholder="wss://host/ws" autocomplete="off" autocapitalize="off" spellcheck="false">
      </div>
      <div class="set-field">
        <label>Transport</label>
        <select id="acc-transport" class="acc-select">
          <option value="wss">WSS (secure WebSocket)</option>
          <option value="ws">WS (WebSocket)</option>
          <option value="udp">UDP</option>
          <option value="tcp">TCP</option>
          <option value="tls">TLS</option>
        </select>
      </div>
      <div class="set-field">
        <label>Domain (SIP URI host)</label>
        <input id="acc-domain" type="text" placeholder="64.176.181.195" autocomplete="off" autocapitalize="off" spellcheck="false">
      </div>
      <div class="set-field">
        <label>Caller ID</label>
        <input id="acc-callerid" type="text" placeholder="+44 7898 117226" autocomplete="off">
      </div>
      <div class="acc-actions">
        <button class="acc-save" onclick="saveAccount()">💾 Save account</button>
        <button class="acc-delete" onclick="deleteAccount()">🗑 Delete</button>
        <button class="acc-new" onclick="newAccount()">＋ New</button>
      </div>
    </div>

    <div class="switch-row">
      <span>Dev Mode</span>
      <label class="switch"><input type="checkbox" id="set-dev"><span class="track"></span></label>
    </div>

    <div class="set-field">
      <label>Quick Text — one per line: #nn **text** (e.g. #1 **Order received**)</label>
      <textarea id="set-quicktext" placeholder="#1 **Order received**&#10;#2 **Call back later**"></textarea>
    </div>

    <button class="save-btn" onclick="applyAndReconnect()">Save &amp; Reconnect</button>
    <div class="dev-hint">Dev Mode skips the server connection. Browser softphones only support WSS/WS — Twilio SIP Domains don't accept WebSocket, so a direct-Twilio account won't register here (use Linphone for that).</div>
  </div>
</div>

<div class="full-modal hidden" id="detail-modal">
  <div class="detail-card">
    <div class="detail-head"><span class="t" id="detail-title">Detail</span><button onclick="closeDetail()">✕</button></div>
    <div class="detail-body" id="detail-body"></div>
    <div class="detail-foot" id="detail-foot"></div>
  </div>
</div>

<div class="full-modal hidden" id="compose-modal">
  <div class="compose-card">
    <div class="detail-head"><span class="t" id="compose-title">✉️ New Message</span><button onclick="closeCompose()">✕</button></div>
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
// ── config ─────────────────────────────────────────────────────
var API = "https://voip-bridge.wandering-mode-c597.workers.dev";
var DEFAULT_WS = "wss://64.176.181.195.nip.io/ws";
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
    { id: "asterisk", name: "Asterisk (WebPhone 201)", username: "201", password: "webphone201", server: DEFAULT_WS, transport: "wss", domain: "64.176.181.195", callerId: "+44 7898 117226" }
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
  try {
    localStorage.setItem("vb_accounts", JSON.stringify(accounts));
    localStorage.setItem("vb_activeAccount", activeAccountId);
  } catch (e) {}
  try {
    fetch(API + "/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accounts: JSON.stringify(accounts), activeAccount: activeAccountId })
    });
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
    setTimeout(function() { if (typeof SIP === "undefined") reject(new Error("sip.js load timeout")); }, 15000);
  });
}

// ── TinyMCE rich text (call notes + email compose) ─────────────
// Self-hosted on the Worker (/tinymce); falls back to jsdelivr.
var tinyMceLoadPromise = null;
function loadTinyMce() {
  if (typeof tinymce !== "undefined") return Promise.resolve();
  if (!tinyMceLoadPromise) {
    tinyMceLoadPromise = new Promise(function(resolve, reject) {
      var s = document.createElement("script");
      s.src = API + "/tinymce/tinymce.min.js";
      s.onload = function() { resolve(); };
      s.onerror = function() {
        var s2 = document.createElement("script");
        s2.src = "https://cdn.jsdelivr.net/npm/tinymce@8.8.2/tinymce.min.js";
        s2.onload = function() { resolve(); };
        s2.onerror = function() { reject(new Error("tinymce load failed")); };
        document.head.appendChild(s2);
      };
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
    plugins: "lists link autolink",
    toolbar: "bold italic | bullist numlist | link | removeformat",
    height: 130,
    skin: "oxide-dark",
    content_css: "dark",
    license_key: "gpl"
  });
}

function initComposeEditor() {
  var el = document.getElementById("comp-body");
  if (tinyReady["comp-body"]) { tinymce.get("comp-body").setContent(el.value); return; }
  tinyReady["comp-body"] = true;
  tinymce.init({
    target: el,
    menubar: false,
    statusbar: false,
    plugins: "lists link autolink code",
    toolbar: "undo redo | bold italic underline strikethrough | bullist numlist | link blockquote | removeformat | code",
    height: 260,
    skin: "oxide-dark",
    content_css: "dark",
    license_key: "gpl"
  });
}

// ── softphone runtime state ────────────────────────────────────

var sipUA, sipSession, currentCall, heldSession, muted = false, onHold = false;
var regTimer = null, REG_TIMEOUT_MS = 8000;

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
  if (name === "favourites") renderFavourites();
  if (name === "contacts") loadContacts(document.getElementById("contact-search").value);
  if (name === "messages") loadMessages();
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
  if (inCall()) { padTone(d); return; }
  if (d === "0") { longPressFired = false; pressTimer = setTimeout(function() { longPressFired = true; insertChar("+"); }, 600); return; }
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

// ── in-call DTMF + quick text ──────────────────────────────────
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
  if (!items.length) { el.innerHTML = '<div class="qt-row"><span class="txt">No quick text set — add lines like <b>#1 **Order received**</b> in Settings.</span></div>'; return; }
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
  qtTimer = setTimeout(function() { panel.classList.add("hidden"); qtBuffer = ""; }, 4000);
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

// ── call notes ─────────────────────────────────────────────────
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
function showNotes(show) {
  document.getElementById("notes-wrap").classList.toggle("hidden", !show);
  if (!show) { closeQuickText(); return; }
  if (!tinyReady["call-notes"]) loadTinyMce().then(initCallNotesEditor).catch(function() {});
}

// Keyboard: digits/* send DTMF during a call; # opens quick text.
document.addEventListener("keydown", function(e) {
  if (!inCall()) return;
  var k = e.key;
  if (k === "#") { e.preventDefault(); padTone("#"); return; }
  if (k === "*") { e.preventDefault(); sendDtmf("*"); return; }
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
      return '<div class="sugg-row" onclick="pickSuggestion(\\'' + esc(num) + '\\', \\'' + esc(c.name) + '\\')"><div><div class="n">' + esc(c.name) + '</div>' + (num ? '<div class="s">' + esc(num) + '</div>' : '') + '</div>' + (num ? '<span class="call">📞</span>' : '') + '</div>';
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
  var acc = activeAccount();
  var domain = (acc && acc.domain) || "64.176.181.195";
  var target = SIP.UserAgent.makeURI("sip:" + num + "@" + domain);
  var inviter = new SIP.Inviter(sipUA, target, { sessionDescriptionHandlerOptions: { constraints: { audio: true, video: false } } });
  sipSession = inviter;
  currentCall = { id: inviter.request.callId, dir: "out", remote: num, state: "calling" };
  renderCallUI();
  inviter.stateChange.on(function(state) {
    if (state === SIP.SessionState.Established) { currentCall.state = "active"; renderCallUI(); }
    if (state === SIP.SessionState.Terminated) resetCall();
  });
  attachRemoteAudio(inviter);
  inviter.invite();
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
    showNotes(false);
    return;
  }
  banner.classList.remove("hidden");
  document.getElementById("banner-remote").textContent = currentCall.remote;
  var si = { ringing: "🔔 Incoming…", calling: "📞 Calling…", active: "🔊 Connected" }[currentCall.state] || currentCall.state;
  document.getElementById("banner-state").textContent = (currentCall.dir === "in" ? "⬇ " : "⬆ ") + si;
  btnCall.classList.add("hidden");
  btnEnd.classList.remove("hidden");
  showNotes(currentCall.state === "active");
}

function setStatus(msg, isErr) {
  var el = document.getElementById("phone-status");
  el.textContent = msg;
  el.className = "reg-status" + (isErr ? " err" : " ok");
}

// ── history ────────────────────────────────────────────────────
var historyTimer = null;
function loadHistory() {
  var q = document.getElementById("history-search").value.trim();
  var el = document.getElementById("history-list");
  el.innerHTML = '<div class="empty">Loading…</div>';
  fetch(API + "/call-history?limit=200&q=" + encodeURIComponent(q)).then(function(r){return r.json();}).then(function(d){
    var calls = d.calls || [];
    if (!calls.length) { el.innerHTML = '<div class="empty">' + (q ? "No matching calls" : "No calls yet") + '</div>'; return; }
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
function renderHistoryRow(c) {
  var dir = c.direction === "outgoing" ? "out" : "in";
  var missed = c.state === "missed" || c.state === "rejected" || c.state === "aborted";
  var icon = missed ? "🔴" : (dir === "out" ? "🟦" : "🟢");
  var arrow = dir === "out" ? "⬆" : "⬇";
  var name = (c.partner_name || "").trim();
  var num = (c.phone_number && c.phone_number !== "unknown") ? String(c.phone_number) : (c.did || "unknown");
  var who = name || num;
  var sub = name ? num : (c.did && c.did !== num ? "→ " + c.did : "");
  var dur = (c.duration > 0) ? " · " + fmtDur(c.duration) : "";
  var when = c.start_date ? fmtTime(c.start_date) : "";
  var key = "h-" + c.id;
  callsCache[key] = c;
  return '<div class="hist-row" data-key="' + esc(key) + '"><span class="ic">' + icon + '</span><div><div class="who">' + arrow + ' ' + esc(who) + '</div>' + (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') + '</div><div class="meta">' + when + dur + '</div></div>';
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
document.getElementById("history-search").addEventListener("input", function(e) {
  if (historyTimer) clearTimeout(historyTimer);
  historyTimer = setTimeout(loadHistory, 250);
});
document.getElementById("history-list").addEventListener("click", function(e) {
  var row = e.target.closest(".hist-row");
  if (!row) return;
  var c = callsCache[row.getAttribute("data-key")];
  if (!c) return;
  rowClick(row.getAttribute("data-key"), "call", c, function() { openCallFull(c); });
});
function fmtTime(ts) {
  var d = new Date(ts);
  var now = new Date();
  var sameDay = d.toDateString() === now.toDateString();
  var hh = ("0" + d.getHours()).slice(-2), mm = ("0" + d.getMinutes()).slice(-2);
  return sameDay ? hh + ":" + mm : d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) + " " + hh + ":" + mm;
}

// ── favourites ─────────────────────────────────────────────────
function renderFavourites() {
  var el = document.getElementById("fav-list");
  if (!favourites.length) { el.innerHTML = '<div class="empty">No favourites yet — tap ★ on a contact</div>'; return; }
  el.innerHTML = favourites.map(function(f) {
    var num = f.num || "";
    return '<div class="contact-row" data-id="' + esc(f.id) + '"><div><div class="cname">' + esc(f.name || f.id) + '</div>' + (num ? '<div class="sub">' + esc(num) + '</div>' : '') + '</div><button class="fav-star on" data-id="' + esc(f.id) + '">★</button>' + (num ? '<button class="mini-call" data-num="' + esc(num) + '">📞</button>' : '') + '</div>';
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

// ── contacts (D1 cache, debounced type-ahead) ─────────────────
var contactTimer = null;
var contactsCache = {};
function loadContacts(q) {
  var el = document.getElementById("contacts-list");
  el.innerHTML = '<div class="empty">Loading…</div>';
  fetch(API + "/contacts/cache?q=" + encodeURIComponent(q) + "&limit=100").then(function(r){return r.json();}).then(function(d){
    var list = d.contacts || [];
    contactsCache = {};
    for (var i = 0; i < list.length; i++) contactsCache[list[i].id] = list[i];
    if (!list.length) { el.innerHTML = '<div class="empty">No contacts found</div>'; return; }
    el.innerHTML = list.map(function(c) {
      var num = c.mobile || c.phone || "";
      var sel = (activeContact && activeContact.id === c.id) ? " selected" : "";
      var star = '<button class="fav-star' + (isFav(c.id) ? ' on' : '') + '" data-id="' + esc(c.id) + '">★</button>';
      return '<div class="contact-row' + sel + '" data-id="' + esc(c.id) + '" data-key="c-' + esc(c.id) + '"><div><div class="cname">' + esc(c.name) + (c.is_company ? " 🏢" : "") + '</div>' + (num ? '<div class="sub">' + esc(num) + '</div>' : '') + (c.email ? '<div class="sub">' + esc(c.email) + '</div>' : '') + '</div>' + star + (num ? '<button class="mini-call" data-num="' + esc(num) + '">📞</button>' : '') + '</div>';
    }).join("");
  }).catch(function(){ el.innerHTML = '<div class="empty">Error</div>'; });
}
document.getElementById("contact-search").addEventListener("input", function(e) {
  var q = e.target.value.trim();
  if (contactTimer) clearTimeout(contactTimer);
  contactTimer = setTimeout(function() { loadContacts(q); }, 250);
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
  var row = e.target.closest(".contact-row");
  if (!row) return;
  var c = contactsCache[row.getAttribute("data-id")];
  if (!c) return;
  rowClick(row.getAttribute("data-key"), "contact", c, function() { openContactFull(c); });
});

// ── contact selection + messages ───────────────────────────────
var activeContact = null;
function prepareDial(num) {
  document.getElementById("dial-input").value = num || "";
  document.getElementById("dial-suggestions").innerHTML = "";
  switchView("dial");
}
function openMessages() { switchView("messages"); }

// ── selection (click = select, double-click = open) ─────────────
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
  clickTimer = setTimeout(function() { clickTimer = null; pendingKey = null; }, 300);
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
}
function renderActionBar() {
  var bar = document.getElementById("action-bar");
  if (!selected) { bar.classList.add("hidden"); bar.innerHTML = ""; return; }
  var h = "";
  if (selected.type === "contact") {
    var c = selected.data;
    var num = c.phone || c.mobile || "";
    h = (num ? '<button class="green" onclick="prepareDialSelected()">📞 Dial</button>' : '') + '<button onclick="openMessages()">💬 Messages</button>' + '<button class="primary" onclick="openContactFull()">👤 Open</button>';
  } else if (selected.type === "message") {
    h = '<button onclick="replyMessage()">↩ Reply</button>' + '<button class="primary" onclick="openMessageFull()">📖 Open</button>';
  } else if (selected.type === "call") {
    var n = selected.data.phone_number;
    h = (n && /^[+0-9*#]/.test(n) ? '<button class="green" onclick="dialBackSelected()">📞 Call back</button>' : '') + '<button class="primary" onclick="openCallFull()">📖 Open</button>';
  }
  h += '<button class="x" onclick="deselect()">✕</button>';
  bar.innerHTML = h;
  bar.classList.remove("hidden");
}
function prepareDialSelected() { var c = selected && selected.data; prepareDial(c ? (c.phone || c.mobile || "") : ""); }
function dialBackSelected() { var c = selected && selected.data; if (c && c.phone_number) dialOut(c.phone_number); }

// ── detail views (full-screen) ─────────────────────────────────
function openDetail() { document.getElementById("detail-modal").classList.remove("hidden"); }
function closeDetail() { document.getElementById("detail-modal").classList.add("hidden"); }
function setDetail(title, bodyHtml, footHtml) {
  document.getElementById("detail-title").textContent = title;
  document.getElementById("detail-body").innerHTML = bodyHtml;
  document.getElementById("detail-foot").innerHTML = footHtml || "";
  openDetail();
}
function openContactFull(c) {
  c = c || (selected && selected.data);
  if (!c) return;
  var rows = "";
  var fields = [["Phone", c.phone], ["Mobile", c.mobile], ["Email", c.email], ["Website", c.website], ["VAT", c.vat], ["Role", c.function], ["City", c.city]];
  for (var i = 0; i < fields.length; i++) {
    if (fields[i][1]) rows += '<div class="detail-row"><span class="k">' + fields[i][0] + '</span><span class="v">' + esc(fields[i][1]) + '</span></div>';
  }
  var foot = '<button class="green" onclick="prepareDialSelected()">📞 Dial</button><button onclick="openMessages()">💬 Messages</button><button class="primary" onclick="newMessage()">✉️ Message</button>';
  setDetail((c.is_company ? "🏢 " : "👤 ") + c.name, rows || '<div class="empty">No details</div>', foot);
}
function openCallFull(c) {
  c = c || (selected && selected.data);
  if (!c) return;
  var dur = c.duration > 0 ? fmtDur(c.duration) : "—";
  var when = c.start_date ? new Date(c.start_date).toLocaleString() : "—";
  var rows = '<div class="detail-row"><span class="k">Number</span><span class="v">' + esc(c.phone_number || c.did || "unknown") + '</span></div>'
    + '<div class="detail-row"><span class="k">Direction</span><span class="v">' + esc(c.direction || "incoming") + '</span></div>'
    + '<div class="detail-row"><span class="k">State</span><span class="v">' + esc(c.state || "") + '</span></div>'
    + '<div class="detail-row"><span class="k">When</span><span class="v">' + esc(when) + '</span></div>'
    + '<div class="detail-row"><span class="k">Duration</span><span class="v">' + esc(dur) + '</span></div>'
    + (c.partner_name ? '<div class="detail-row"><span class="k">Contact</span><span class="v">' + esc(c.partner_name) + '</span></div>' : '');
  var foot = '<button class="green" onclick="dialBackSelected()">📞 Call back</button>';
  setDetail("📞 Call", rows, foot);
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
    if (d.message) { m.body = d.message.body; m.email_from = m.email_from || d.message.email_from; m.subject = m.subject || d.message.subject; m._full = true; }
    renderMessageFull(m);
  }).catch(function(){ renderMessageFull(m); });
}
function renderMessageFull(m) {
  var body = String(m.body || "").replace(/<[^>]*>/g, " ");
  var rows = '<div class="detail-row"><span class="k">From</span><span class="v">' + esc(m.email_from || "—") + '</span></div>'
    + '<div class="detail-row"><span class="k">Subject</span><span class="v">' + esc(m.subject || "(no subject)") + '</span></div>'
    + '<div class="detail-row"><span class="k">When</span><span class="v">' + esc(m.date ? new Date(m.date).toLocaleString() : "—") + '</span></div>'
    + '<div class="msg-body">' + esc(body) + '</div>';
  var foot = '<button onclick="replyMessage()">↩ Reply</button><button class="primary" onclick="newMessage()">✉️ New Message</button>';
  setDetail("✉️ " + (m.subject || "Message"), rows, foot);
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
  var quote = String(m.body || "").replace(/<[^>]*>/g, " ").replace(/ +/g, " ").trim();
  var body = NL + NL + (m.date ? "On " + new Date(m.date).toLocaleString() + ", " + (m.email_from || "") + " wrote:" + NL : "") + "> " + quote.split(NL).join(NL + "> ");
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
  document.getElementById("compose-title").textContent = "✉️ " + (subject && subject.indexOf("Re:") === 0 ? "Reply" : "New Message");
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
  if (btn) { btn.textContent = "Sending…"; btn.disabled = true; }
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
    document.getElementById("msg-title").textContent = "📥 Recent emails (7 days)";
    el.innerHTML = '<div class="empty">Downloading recent emails…</div>';
    messagesCache = {};
    fetch(API + "/messages/recent?days=7&limit=50").then(function(r){return r.json();}).then(function(d){
      var msgs = d.messages || [];
      if (!msgs.length) { el.innerHTML = '<div class="empty">No emails in the last week</div>'; return; }
      el.innerHTML = msgs.map(function(m) { return renderMessageRow(m); }).join("");
    }).catch(function(){ el.innerHTML = '<div class="empty">Error loading emails</div>'; });
    return;
  }
  document.getElementById("msg-title").textContent = "💬 " + activeContact.name;
  el.innerHTML = '<div class="empty">Downloading messages…</div>';
  messagesCache = {};
  fetch(API + "/messages?contact=" + encodeURIComponent(activeContact.id) + "&limit=50").then(function(r){return r.json();}).then(function(d){
    var msgs = d.messages || [];
    if (!msgs.length) { el.innerHTML = '<div class="empty">No messages found</div>'; return; }
    el.innerHTML = msgs.map(function(m) { return renderMessageRow(m); }).join("");
  }).catch(function(){ el.innerHTML = '<div class="empty">Error loading messages</div>'; });
}
function renderMessageRow(m) {
  var dir = m.direction === "outgoing" ? "⬆" : "⬇";
  var isGmail = m.source === "gmail";
  var who = m.email_from || (m.direction === "outgoing" ? "Us" : "Contact");
  var title = m.subject || (isGmail ? "Gmail" : "Message");
  var when = m.date ? fmtTime(m.date) : "";
  var body = String(m.body || "").replace(/<[^>]*>/g, " ").replace(/ +/g, " ").trim();
  var key = "m-" + (m.id != null ? m.id : "g" + m.gmail_id);
  messagesCache[key] = m;
  return '<div class="msg-row" data-key="' + esc(key) + '"><span class="ic">' + (isGmail ? "✉️" : "💬") + '</span><div><div class="who">' + dir + ' ' + esc(who) + '</div><div class="subj">' + esc(title) + '</div>' + (body ? '<div class="sub">' + esc(body.slice(0, 120)) + '</div>' : '') + '</div><div class="meta">' + when + '</div></div>';
}
document.getElementById("messages-list").addEventListener("click", function(e) {
  var row = e.target.closest(".msg-row");
  if (!row) return;
  var m = messagesCache[row.getAttribute("data-key")];
  if (!m) return;
  rowClick(row.getAttribute("data-key"), "message", m, function() { openMessageFull(m); });
});

// ── menu + settings ────────────────────────────────────────────
function toggleMenu() {
  document.getElementById("menu-drawer").classList.toggle("hidden");
}
function openSettings() {
  document.getElementById("menu-drawer").classList.add("hidden");
  document.getElementById("set-dev").checked = settings.devMode;
  document.getElementById("set-quicktext").value = settings.quickText || "";
  renderAccountSelect();
  document.getElementById("settings-modal").classList.remove("hidden");
}
function closeSettings() {
  document.getElementById("settings-modal").classList.add("hidden");
}

// ── SIP account management ─────────────────────────────────────
var editingAccountId = null;
function renderAccountSelect() {
  var sel = document.getElementById("set-account");
  var active = activeAccount();
  editingAccountId = active ? active.id : null;
  var html = "";
  for (var i = 0; i < accounts.length; i++) {
    var a = accounts[i];
    html += '<option value="' + esc(a.id) + '"' + (activeAccountId === a.id ? " selected" : "") + '>' + esc(a.name) + ' — ' + esc(a.username) + '@' + esc(a.domain) + '</option>';
  }
  html += '<option value="__new">＋ New account…</option>';
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
    domain: document.getElementById("acc-domain").value.trim() || "64.176.181.195",
    callerId: document.getElementById("acc-callerid").value.trim()
  };
  if (!a.username) { alert("Username is required"); return; }
  var found = -1;
  for (var i = 0; i < accounts.length; i++) if (accounts[i].id === a.id) { found = i; break; }
  if (found >= 0) accounts[found] = a; else accounts.push(a);
  activeAccountId = a.id;
  editingAccountId = a.id;
  persistAccounts();
  renderAccountSelect();
  updateAccountHeader();
  setStatus("💾 Saved — reconnect to apply", false);
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
  document.getElementById("acc-name-display").textContent = a.name;
  document.getElementById("acc-caller-display").textContent = "Caller ID: " + (a.callerId || "—");
}
function applyAndReconnect() {
  // persist any pending form edit before reconnecting
  if (editingAccountId) saveAccount();
  settings.devMode = document.getElementById("set-dev").checked;
  settings.quickText = document.getElementById("set-quicktext").value;
  saveSettings();
  closeSettings();
  teardownSoftphone();
  if (settings.devMode) { setStatus("🛠 Dev mode", false); }
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

// ── softphone init ─────────────────────────────────────────────
// Wire the remote audio track to an <audio> element so we can actually hear
// the other party. sip.js does NOT auto-play remote media — both the inbound
// (Invitation) and outbound (Inviter) paths must do this, or calls are one-way
// (you hear nothing on the outbound leg). Works for both, with a retry loop
// because the peer connection is created asynchronously during invite/answer.
function attachRemoteAudio(session) {
  var tries = 0;
  function wire() {
    var pc = null;
    try { pc = session.sessionDescriptionHandler && session.sessionDescriptionHandler.peerConnection; } catch (e) {}
    if (pc && pc.ontrack !== undefined) {
      pc.ontrack = function(evt) {
        if (evt.track && evt.track.kind === "audio") {
          var stream = evt.streams && evt.streams[0];
          if (stream) {
            var a = document.createElement("audio");
            a.autoplay = true; a.srcObject = stream;
            a.play().catch(function(){});
            document.body.appendChild(a);
          }
        }
      };
      return;
    }
    if (++tries < 50) setTimeout(wire, 100);
  }
  wire();
}

function initSoftphone() {
  var el = document.getElementById("phone-status");
  if (typeof SIP === "undefined") { setStatus("❌ sip.js missing", true); return; }
  var acc = activeAccount();
  if (!acc) { setStatus("❌ No SIP account configured", true); return; }
  updateAccountHeader();
  setStatus("Connecting…", false);
  try {
    sipUA = new SIP.UserAgent({
      uri: SIP.UserAgent.makeURI("sip:" + acc.username + "@" + (acc.domain || "64.176.181.195")),
      transportOptions: { server: acc.server || DEFAULT_WS },
      authorizationUsername: acc.username,
      authorizationPassword: acc.password,
      sessionDescriptionHandlerFactoryOptions: { constraints: { audio: true, video: false } }
    });
  } catch(e) { setStatus("❌ Init: " + e.message, true); return; }

  var registerer = new SIP.Registerer(sipUA, { expires: 3600 });
  registerer.stateChange.on(function(state) {
    if (state === SIP.RegistererState.Registered) { clearTimeout(regTimer); setStatus("✅ Registered", false); }
    else if (state === SIP.RegistererState.Unregistered) { clearTimeout(regTimer); setStatus("❌ Unregistered", true); }
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
      attachRemoteAudio(inv);
      inv.accept({ sessionDescriptionHandlerOptions: { constraints: { audio: true, video: false } } });
      var ac = new (window.AudioContext || window.webkitAudioContext)();
      ac.resume().catch(function(){});
    }
  };

  sipUA.start().then(function() { registerer.register(); });

  // If the server never answers, stop hanging and surface a clear error.
  clearTimeout(regTimer);
  regTimer = setTimeout(function() {
    setStatus("❌ Server unreachable (timeout)", true);
    try { sipUA.stop(); } catch (e) {}
    sipUA = null;
  }, REG_TIMEOUT_MS);
}

// ── boot ───────────────────────────────────────────────────────
function applyBoot() {
  updateAccountHeader();
  if (settings.devMode) { setStatus("🛠 Dev mode", false); return; }
  loadSipJs().then(initSoftphone).catch(function(e) { setStatus("❌ " + e.message, true); });
}
function boot() {
  // Merge server-side settings (D1) over localStorage, then start.
  fetch(API + "/settings").then(function(r){return r.json();}).then(function(d){
    var s = d.settings || {};
    if (s.devMode === "1") settings.devMode = true;
    if (s.quickText) settings.quickText = s.quickText;
    if (s.accounts) {
      try {
        var remote = JSON.parse(s.accounts);
        if (Array.isArray(remote) && remote.length) accounts = remote;
      } catch (e) {}
    }
    if (s.activeAccount) activeAccountId = s.activeAccount;
    if (s.favourites) {
      try {
        var f = JSON.parse(s.favourites);
        if (Array.isArray(f)) favourites = f;
      } catch (e) {}
    }
    applyBoot();
  }).catch(applyBoot);
}
document.addEventListener("DOMContentLoaded", boot);
</script>
</body>
</html>`;
  return new Response(html, { headers: { "Content-Type": "text/html;charset=utf-8" } });
}
