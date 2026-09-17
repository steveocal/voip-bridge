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
/* in-call panel: caller name + tabs (Sales/Quotations, Call History, Notes, Jot) */
.call-panel{margin:8px 16px 0;background:#1a1a1a;border:1px solid #2c2c2c;border-radius:14px;overflow:hidden}
.cp-head{padding:12px 14px 2px;display:flex;align-items:center;gap:8px}
.cp-caller{font-size:16px;font-weight:700;color:#ececec;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0}
.cp-tabs{display:flex;border-bottom:1px solid #2c2c2c;padding:0 4px;margin-top:8px}
.cp-tab{flex:1;background:none;border:none;color:#999;font-size:11.5px;font-weight:600;padding:10px 2px;cursor:pointer;border-bottom:2px solid transparent;white-space:nowrap}
.cp-tab.active{color:#4db8ff;border-bottom-color:#4db8ff}
.cp-body{padding:12px 14px;max-height:500px;overflow-y:auto}
.cp-pane textarea{width:100%;min-height:120px;background:#111;border:1px solid #2c2c2c;border-radius:10px;color:#fff;font-size:14px;padding:12px 14px;outline:none;resize:none;font-family:inherit;line-height:1.5}
.cp-pane .tox-tinymce{border-color:#2c2c2c}
.cp-quote-row{display:flex;justify-content:space-between;gap:8px;padding:10px 4px;border-bottom:1px solid #222;font-size:14px}
.cp-quote-row .n{font-weight:600}
.cp-quote-row .st{color:#999;font-size:12px}
.cp-quote-row .amt{color:#34d399;font-weight:700;flex-shrink:0}
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
.jt-btn.jt-zoom-label{width:auto;padding:0 8px;font-size:12px}
.jt-sep{width:1px;align-self:stretch;background:#2c2c2c;margin:2px 4px}
.jt-canvas-wrap{width:100%;border-radius:10px;background:#1e1e1e;border:1px solid #2c2c2c;overflow:auto}
.jt-canvas-wrap canvas{display:block}
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
      <div class="call-panel hidden" id="call-panel">
        <div class="cp-head">
          <div class="cp-caller" id="cp-caller-name">Unknown caller</div>
          <button class="save-chip" onclick="saveCallRecord()">💾 Save</button>
          <span class="jot-status" id="cp-save-status"></span>
        </div>
        <div class="cp-tabs">
          <button class="cp-tab" data-tab="sales" onclick="switchCallTab('sales')">Sales / Quotations</button>
          <button class="cp-tab" data-tab="history" onclick="switchCallTab('history')">Call History</button>
          <button class="cp-tab active" data-tab="notes" onclick="switchCallTab('notes')">Notes</button>
          <button class="cp-tab" data-tab="jot" onclick="switchCallTab('jot')">Jot</button>
        </div>
        <div class="cp-body">
          <div class="cp-pane hidden" id="cp-pane-sales"><div class="empty">—</div></div>
          <div class="cp-pane hidden" id="cp-pane-history"><div class="empty">—</div></div>
          <div class="cp-pane" id="cp-pane-notes">
            <textarea id="call-notes" placeholder="Call notes… (press # for quick text)" autocomplete="off"></textarea>
            <div class="qt-panel hidden" id="qt-panel">
              <div class="qt-head">Quick text — tap to insert</div>
              <div id="qt-list"></div>
            </div>
          </div>
          <div class="cp-pane hidden" id="cp-pane-jot">
            <div class="jot-toolbar"><button class="save-chip" onclick="saveJotToNotes()">💾 Save to Notes</button><span class="jot-status" id="jot-status"></span></div>
            <div id="jot-canvas"></div>
          </div>
        </div>
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

    <!-- CALL DETAIL VIEW (drill-down from History — in-screen, not a dialog) -->
    <div class="view hidden" id="view-call-detail">
      <div class="cd-head">
        <button class="cd-back" onclick="closeCallDetailView()">←</button>
        <div class="cd-title">
          <div class="cd-name" id="cd-caller-name">Call</div>
          <div class="cd-sub" id="cd-caller-sub"></div>
        </div>
        <button class="cd-callback hidden" id="cd-callback-btn" onclick="dialBackSelected()">📞</button>
      </div>
      <div class="cp-tabs">
        <button class="cp-tab active" data-tab="details" onclick="switchCallDetailTab('details')">Details</button>
        <button class="cp-tab" data-tab="notes" onclick="switchCallDetailTab('notes')">Notes</button>
        <button class="cp-tab" data-tab="jot" onclick="switchCallDetailTab('jot')">Jot</button>
      </div>
      <div class="cd-body">
        <div class="cp-pane" id="cd-pane-details"></div>
        <div class="cp-pane hidden" id="cd-pane-notes"><div class="empty">Loading…</div></div>
        <div class="cp-pane hidden" id="cd-pane-jot">
          <div class="jot-toolbar"><span class="jot-status" id="cd-jot-status"></span></div>
          <div id="cd-jot-canvas"></div>
        </div>
      </div>
      <div class="cd-footer">
        <button class="save-btn" id="cd-save-btn" onclick="saveCallDetailEdits()">💾 Save</button>
      </div>
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
// Open-source (GPL) build from jsDelivr — no API key, no domain nag.
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
    content_css: "dark"
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
    plugins: "lists link table code fullscreen autolink",
    toolbar: "undo redo | blocks | bold italic underline strikethrough | forecolor backcolor | bullist numlist | link table | blockquote | removeformat | code fullscreen",
    height: 320,
    branding: false,
    skin: "oxide-dark",
    content_css: "dark"
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
// ── in-call panel: caller name + tabs ───────────────────────────
var activeCpTab = "notes";
var currentCallPartner = null;

function showCallPanel(show) {
  document.getElementById("call-panel").classList.toggle("hidden", !show);
  if (!show) { closeQuickText(); currentCallPartner = null; return; }
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
      el.textContent = d.name + " — " + currentCall.remote;
      if (activeCpTab === "sales") loadQuotationsTab();
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
  if (tab === "jot") initJotEditor();
}

// ── Jot: handwriting canvas (perfect-freehand, vendored inline — ~5KB, no
// network request, no framework) ────────────────────────────────
// Vendored from perfect-freehand@1.2.3 (MIT, github.com/steveruizok/perfect-freehand).
var PerfectFreehand=(()=>{var Q=Object.defineProperty;var zn=Object.getOwnPropertyDescriptor;var An=Object.getOwnPropertyNames;var bn=Object.prototype.hasOwnProperty;var In=(n,t)=>{for(var r in t)Q(n,r,{get:t[r],enumerable:!0})},Tn=(n,t,r,u)=>{if(t&&typeof t=="object"||typeof t=="function")for(let i of An(t))!bn.call(n,i)&&i!==r&&Q(n,i,{get:()=>t[i],enumerable:!(u=zn(t,i))||u.enumerable});return n};var jn=n=>Tn(Q({},"__esModule",{value:!0}),n);var Nn={};In(Nn,{default:()=>Kn,getStroke:()=>yn,getStrokeOutlinePoints:()=>dn,getStrokePoints:()=>xn});var{PI:wn}=Math,F=wn+1e-4,rn=.5,un=[1,1];function on(n,t,r,u=i=>i){return n*u(.5-t*(.5-r))}var{min:U}=Math;function gn(n,t,r){let u=U(1,t/r);return U(1,n+(U(1,1-u)-n)*(u*.275))}function Fn(n){return[-n[0],-n[1]]}function g(n,t){return[n[0]+t[0],n[1]+t[1]]}function en(n,t,r){return n[0]=t[0]+r[0],n[1]=t[1]+r[1],n}function L(n,t){return[n[0]-t[0],n[1]-t[1]]}function X(n,t,r){return n[0]=t[0]-r[0],n[1]=t[1]-r[1],n}function y(n,t){return[n[0]*t,n[1]*t]}function V(n,t,r){return n[0]=t[0]*r,n[1]=t[1]*r,n}function On(n,t){return[n[0]/t,n[1]/t]}function vn(n){return[n[1],-n[0]]}function W(n,t){let r=t[0];return n[0]=t[1],n[1]=-r,n}function sn(n,t){return n[0]*t[0]+n[1]*t[1]}function Rn(n,t){return n[0]===t[0]&&n[1]===t[1]}function _n(n){return Math.hypot(n[0],n[1])}function cn(n,t){let r=n[0]-t[0],u=n[1]-t[1];return r*r+u*u}function Mn(n){return On(n,_n(n))}function qn(n,t){return Math.hypot(n[1]-t[1],n[0]-t[0])}function Y(n,t,r){let u=Math.sin(r),i=Math.cos(r),e=n[0]-t[0],o=n[1]-t[1],c=e*i-o*u,v=e*u+o*i;return[c+t[0],v+t[1]]}function ln(n,t,r,u){let i=Math.sin(u),e=Math.cos(u),o=t[0]-r[0],c=t[1]-r[1],v=o*e-c*i,P=o*i+c*e;return n[0]=v+r[0],n[1]=P+r[1],n}function fn(n,t,r){return g(n,y(L(t,n),r))}function Bn(n,t,r,u){let i=r[0]-t[0],e=r[1]-t[1];return n[0]=t[0]+i*u,n[1]=t[1]+e*u,n}function mn(n,t,r){return g(n,y(t,r))}var l=[0,0],d=[0,0],x=[0,0];function Cn(n,t){let r=mn(n,Mn(vn(L(n,g(n,[1,1])))),-t),u=[],i=1/13;for(let e=i;e<=1;e+=i)u.push(Y(r,n,F*2*e));return u}function Dn(n,t,r){let u=[],i=1/r;for(let e=i;e<=1;e+=i)u.push(Y(t,n,F*e));return u}function En(n,t,r){let u=L(t,r),i=y(u,.5),e=y(u,.51);return[L(n,i),L(n,e),g(n,e),g(n,i)]}function Gn(n,t,r,u){let i=[],e=mn(n,t,r),o=1/u;for(let c=o;c<1;c+=o)i.push(Y(e,n,F*3*c));return i}function Hn(n,t,r){return[g(n,y(t,r)),g(n,y(t,r*.99)),L(n,y(t,r*.99)),L(n,y(t,r))]}function hn(n,t,r){return n===!1||n===void 0?0:n===!0?Math.max(t,r):n}function Jn(n,t,r){return n.slice(0,10).reduce((u,i)=>{let e=i.pressure;return t&&(e=gn(u,i.distance,r)),(u+e)/2},n[0].pressure)}function dn(n,t={}){let{size:r=16,smoothing:u=.5,thinning:i=.5,simulatePressure:e=!0,easing:o=s=>s,start:c={},end:v={},last:P=!1}=t,{cap:M=!0,easing:O=s=>s*(2-s)}=c,{cap:f=!0,easing:h=s=>--s*s*s+1}=v;if(n.length===0||r<=0)return[];let p=n[n.length-1].runningLength,A=hn(c.taper,r,p),b=hn(v.taper,r,p),Z=(r*u)**2,I=[],z=[],$=Jn(n,e,r),a=on(r,i,n[n.length-1].pressure,o),C,D=n[0].vector,T=n[0].point,R=T,S=T,k=R,E=!1;for(let s=0;s<n.length;s++){let{pressure:K}=n[s],{point:m,vector:j,distance:Ln,runningLength:w}=n[s],q=s===n.length-1;if(!q&&p-w<3)continue;i?(e&&(K=gn($,Ln,r)),a=on(r,i,K,o)):a=r/2,C===void 0&&(C=a);let Pn=w<A?O(w/A):1,Sn=p-w<b?h((p-w)/b):1;a=Math.max(.01,a*Math.min(Pn,Sn));let nn=(q?n[s]:n[s+1]).vector,N=q?1:sn(j,nn),kn=sn(j,D)<0&&!E,tn=N!==null&&N<0;if(kn||tn){W(l,D),V(l,l,a);for(let B=0;B<=1;B+=.07692307692307693)X(d,m,l),ln(d,d,m,F*B),S=[d[0],d[1]],I.push(S),en(x,m,l),ln(x,x,m,F*-B),k=[x[0],x[1]],z.push(k);T=S,R=k,tn&&(E=!0);continue}if(E=!1,q){W(l,j),V(l,l,a),I.push(L(m,l)),z.push(g(m,l));continue}Bn(l,nn,j,N),W(l,l),V(l,l,a),X(d,m,l),S=[d[0],d[1]],(s<=1||cn(T,S)>Z)&&(I.push(S),T=S),en(x,m,l),k=[x[0],x[1]],(s<=1||cn(R,k)>Z)&&(z.push(k),R=k),$=K,D=j}let G=[n[0].point[0],n[0].point[1]],H=n.length>1?[n[n.length-1].point[0],n[n.length-1].point[1]]:g(n[0].point,[1,1]),J=[],_=[];if(n.length===1){if(!(A||b)||P)return Cn(G,C||a)}else{A||b&&n.length===1||(M?J.push(...Dn(G,z[0],13)):J.push(...En(G,I[0],z[0])));let s=vn(Fn(n[n.length-1].vector));b||A&&n.length===1?_.push(H):f?_.push(...Gn(H,s,a,29)):_.push(...Hn(H,s,a))}return I.concat(_,z.reverse(),J)}var an=[0,0];function pn(n){return n!=null&&n>=0}function xn(n,t={}){let{streamline:r=.5,size:u=16,last:i=!1}=t;if(n.length===0)return[];let e=.15+(1-r)*.85,o=Array.isArray(n[0])?n:n.map(({x:f,y:h,pressure:p=rn})=>[f,h,p]);if(o.length===2){let f=o[1];o=o.slice(0,-1);for(let h=1;h<5;h++)o.push(fn(o[0],f,h/4))}o.length===1&&(o=[...o,[...g(o[0],un),...o[0].slice(2)]]);let c=[{point:[o[0][0],o[0][1]],pressure:pn(o[0][2])?o[0][2]:.25,vector:[...un],distance:0,runningLength:0}],v=!1,P=0,M=c[0],O=o.length-1;for(let f=1;f<o.length;f++){let h=i&&f===O?[o[f][0],o[f][1]]:fn(M.point,o[f],e);if(Rn(M.point,h))continue;let p=qn(h,M.point);if(P+=p,f<O&&!v){if(P<u)continue;v=!0}X(an,M.point,h),M={point:h,pressure:pn(o[f][2])?o[f][2]:rn,vector:Mn(an),distance:p,runningLength:P},c.push(M)}return c[0].vector=c[1]?.vector||[0,0],c}function yn(n,t={}){return dn(xn(n,t),t)}var Kn=yn;return jn(Nn);})();

// ── Jot engine: Draw / Write / Erase, undo, zoom, save/load ────
var JOT_INK = "#e9ecef";
var JOT_STROKE_OPTS = { size: 6, thinning: 0.6, smoothing: 0.5, streamline: 0.5 };
var JOT_PAUSE_MS = 500;
var JOT_PROXIMITY = 1.6;      // word-boundary proximity factor (x current word bbox size)
var JOT_LINE_HEIGHT = 42;
var JOT_WORD_HEIGHT = 26;     // normalized word height (logical px)
var JOT_WORD_GAP = 10;
var JOT_PARA_MARGIN = 14;
var JOT_PARA_TOP = 32;

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
function jtBBoxNear(a, b, factor) {
  var pad = Math.max((a.maxX - a.minX), (a.maxY - a.minY), 20) * factor;
  return !(b.minX > a.maxX + pad || b.maxX < a.minX - pad || b.minY > a.maxY + pad || b.maxY < a.minY - pad);
}
// Best-fit line through a word's combined points -> rotation to level it,
// plus a baseline-left anchor (in raw space) and the scale needed to
// normalize its height to JOT_WORD_HEIGHT.
function jtWordTransform(strokes) {
  var pts = [];
  for (var i = 0; i < strokes.length; i++) for (var j = 0; j < strokes[i].length; j++) pts.push(strokes[i][j]);
  var n = pts.length, mx = 0, my = 0;
  for (i = 0; i < n; i++) { mx += pts[i][0]; my += pts[i][1]; }
  mx /= n; my /= n;
  var sxx = 0, syy = 0, sxy = 0;
  for (i = 0; i < n; i++) { var dx = pts[i][0] - mx, dy = pts[i][1] - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  var angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  var cos = Math.cos(-angle), sin = Math.sin(-angle);
  var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (i = 0; i < n; i++) {
    dx = pts[i][0] - mx; dy = pts[i][1] - my;
    var lx = dx * cos - dy * sin, ly = dx * sin + dy * cos;
    if (lx < minX) minX = lx; if (lx > maxX) maxX = lx;
    if (ly < minY) minY = ly; if (ly > maxY) maxY = ly;
  }
  var w = Math.max(maxX - minX, 10), h = Math.max(maxY - minY, 10);
  var cos2 = Math.cos(angle), sin2 = Math.sin(angle);
  var ax = minX * cos2 - maxY * sin2 + mx;
  var ay = minX * sin2 + maxY * cos2 + my;
  var scale = Math.min(JOT_WORD_HEIGHT / h, 4);
  return { anchor: [ax, ay], rotate: angle, scale: scale, width: w * scale, height: JOT_WORD_HEIGHT };
}

function createJot(hostEl) {
  hostEl.innerHTML = "";
  hostEl.classList.add("jt-wrap");

  var toolbar = document.createElement("div");
  toolbar.className = "jt-toolbar";
  toolbar.innerHTML =
    '<button class="jt-btn jt-mode active" data-mode="draw" title="Draw">✏️</button>' +
    '<button class="jt-btn jt-mode" data-mode="write" title="Write">🖊️</button>' +
    '<button class="jt-btn jt-mode" data-mode="erase" title="Erase">🧽</button>' +
    '<span class="jt-sep"></span>' +
    '<button class="jt-btn" data-act="undo" title="Undo">↶</button>' +
    '<button class="jt-btn" data-act="zoomout" title="Zoom out">−</button>' +
    '<button class="jt-btn jt-zoom-label" data-act="zoomreset" title="Reset zoom">100%</button>' +
    '<button class="jt-btn" data-act="zoomin" title="Zoom in">+</button>' +
    '<span class="jt-sep"></span>' +
    '<button class="jt-btn ghost" data-act="clear" title="Clear all">🗑</button>';
  hostEl.appendChild(toolbar);

  var canvasWrap = document.createElement("div");
  canvasWrap.className = "jt-canvas-wrap";
  var canvas = document.createElement("canvas");
  canvasWrap.appendChild(canvas);
  hostEl.appendChild(canvasWrap);

  var ctx = canvas.getContext("2d");
  var dpr = window.devicePixelRatio || 1;
  var logicalW = Math.max(280, canvasWrap.getBoundingClientRect().width || hostEl.getBoundingClientRect().width || 320);
  var logicalH = 1400;
  canvas.width = logicalW * dpr;
  canvas.height = logicalH * dpr;
  canvas.style.width = logicalW + "px";
  canvas.style.height = logicalH + "px";
  ctx.scale(dpr, dpr);
  canvas.style.touchAction = "none";

  var mode = "draw";
  var view = { scale: 1 };
  var nextId = 1;
  var drawStrokes = {};   // id -> { points:[[x,y,p],...], bbox }
  var words = [];          // ordered [{ id, rawStrokes, anchor, rotate, scale, width, height, x, y }]
  var actions = [];        // undo log
  var current = null;      // in-progress stroke while pointer is down
  var writingWord = null;  // { strokes:[...], bbox }
  var wordPauseTimer = null;
  var erasing = false;

  function relayout() {
    var lineIdx = 0, x = JOT_PARA_MARGIN;
    var maxWidth = logicalW - JOT_PARA_MARGIN * 2;
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (x + w.width > maxWidth && x > JOT_PARA_MARGIN) { lineIdx++; x = JOT_PARA_MARGIN; }
      w.line = lineIdx;
      w.x = x;
      w.y = JOT_PARA_TOP + lineIdx * JOT_LINE_HEIGHT;
      x += w.width + JOT_WORD_GAP;
    }
  }

  function redraw() {
    ctx.clearRect(0, 0, logicalW, logicalH);
    ctx.fillStyle = JOT_INK;
    var id;
    for (id in drawStrokes) jtFillOutline(ctx, jtOutline(drawStrokes[id].points));
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
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

  function rebuildFromActions() {
    drawStrokes = {}; words = [];
    for (var i = 0; i < actions.length; i++) {
      var a = actions[i];
      if (a.type === "add-stroke") drawStrokes[a.id] = { points: a.points, bbox: jtBBox(a.points) };
      else if (a.type === "add-word") words.push({ id: a.id, rawStrokes: a.rawStrokes, anchor: a.anchor, rotate: a.rotate, scale: a.scale, width: a.width, height: a.height });
      else if (a.type === "erase-stroke") delete drawStrokes[a.targetId];
      else if (a.type === "erase-word") { for (var j = 0; j < words.length; j++) if (words[j].id === a.targetId) { words.splice(j, 1); break; } }
    }
    relayout();
  }

  function toLogical(clientX, clientY) {
    var r = canvas.getBoundingClientRect();
    return [(clientX - r.left) / r.width * logicalW, (clientY - r.top) / r.height * logicalH];
  }

  function finalizeWord() {
    if (wordPauseTimer) { clearTimeout(wordPauseTimer); wordPauseTimer = null; }
    if (!writingWord || !writingWord.strokes.length) { writingWord = null; return; }
    var t = jtWordTransform(writingWord.strokes);
    var id = nextId++;
    var action = { type: "add-word", id: id, rawStrokes: writingWord.strokes, anchor: t.anchor, rotate: t.rotate, scale: t.scale, width: t.width, height: t.height };
    actions.push(action);
    words.push({ id: id, rawStrokes: action.rawStrokes, anchor: action.anchor, rotate: action.rotate, scale: action.scale, width: action.width, height: action.height });
    relayout();
    writingWord = null;
    redraw();
  }

  function hitTest(lx, ly) {
    var pad = 10;
    var id;
    for (id in drawStrokes) {
      var b = drawStrokes[id].bbox;
      if (lx >= b.minX - pad && lx <= b.maxX + pad && ly >= b.minY - pad && ly <= b.maxY + pad) return { kind: "stroke", id: id };
    }
    for (var i = words.length - 1; i >= 0; i--) {
      var w = words[i];
      if (lx >= w.x - pad && lx <= w.x + w.width + pad && ly >= w.y - w.height - pad && ly <= w.y + pad) return { kind: "word", id: w.id };
    }
    return null;
  }

  function eraseAt(lx, ly) {
    var hit = hitTest(lx, ly);
    if (!hit) return;
    if (hit.kind === "stroke") { delete drawStrokes[hit.id]; actions.push({ type: "erase-stroke", targetId: hit.id }); }
    else { for (var j = 0; j < words.length; j++) if (words[j].id === hit.id) { words.splice(j, 1); break; } actions.push({ type: "erase-word", targetId: hit.id }); relayout(); }
    redraw();
  }

  function onDown(e) {
    canvas.setPointerCapture(e.pointerId);
    var p = toLogical(e.clientX, e.clientY);
    var pressure = e.pointerType === "mouse" ? 0.5 : (e.pressure || 0.5);
    if (mode === "erase") { erasing = true; eraseAt(p[0], p[1]); return; }
    current = { points: [[p[0], p[1], pressure]] };
    redraw();
  }
  function onMove(e) {
    var p = toLogical(e.clientX, e.clientY);
    if (mode === "erase") { if (erasing) eraseAt(p[0], p[1]); return; }
    if (!current) return;
    var pressure = e.pointerType === "mouse" ? 0.5 : (e.pressure || 0.5);
    current.points.push([p[0], p[1], pressure]);
    redraw();
  }
  function onUp() {
    if (mode === "erase") { erasing = false; return; }
    if (!current) return;
    var stroke = current;
    current = null;
    if (stroke.points.length < 2) stroke.points.push([stroke.points[0][0] + 0.1, stroke.points[0][1] + 0.1, stroke.points[0][2]]);
    if (mode === "write") {
      var bbox = jtBBox(stroke.points);
      if (writingWord && jtBBoxNear(writingWord.bbox, bbox, JOT_PROXIMITY)) {
        writingWord.strokes.push(stroke.points);
        writingWord.bbox = jtBBoxUnion(writingWord.bbox, bbox);
      } else {
        finalizeWord();
        writingWord = { strokes: [stroke.points], bbox: bbox };
      }
      if (wordPauseTimer) clearTimeout(wordPauseTimer);
      wordPauseTimer = setTimeout(finalizeWord, JOT_PAUSE_MS);
      redraw();
    } else {
      var id = nextId++;
      drawStrokes[id] = { points: stroke.points, bbox: jtBBox(stroke.points) };
      actions.push({ type: "add-stroke", id: id, points: stroke.points });
      redraw();
    }
  }

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);

  function setZoom(scale) {
    view.scale = Math.max(0.5, Math.min(3, scale));
    canvas.style.width = (logicalW * view.scale) + "px";
    canvas.style.height = (logicalH * view.scale) + "px";
    var label = toolbar.querySelector(".jt-zoom-label");
    if (label) label.textContent = Math.round(view.scale * 100) + "%";
  }

  toolbar.addEventListener("click", function(e) {
    var btn = e.target.closest(".jt-btn");
    if (!btn) return;
    var m = btn.getAttribute("data-mode");
    if (m) {
      finalizeWord();
      mode = m;
      var btns = toolbar.querySelectorAll(".jt-mode");
      for (var i = 0; i < btns.length; i++) btns[i].classList.toggle("active", btns[i] === btn);
      return;
    }
    var act = btn.getAttribute("data-act");
    if (act === "undo") { actions.pop(); rebuildFromActions(); writingWord = null; redraw(); }
    else if (act === "zoomin") setZoom(view.scale * 1.25);
    else if (act === "zoomout") setZoom(view.scale / 1.25);
    else if (act === "zoomreset") setZoom(1);
    else if (act === "clear") { finalizeWord(); actions = []; drawStrokes = {}; words = []; setZoom(1); redraw(); }
  });

  redraw();

  return {
    clear: function() { finalizeWord(); actions = []; drawStrokes = {}; words = []; redraw(); },
    isEmpty: function() { return actions.length === 0 && !writingWord; },
    getJSON: function() {
      finalizeWord();
      var ds = [], id;
      for (id in drawStrokes) ds.push({ id: id, points: drawStrokes[id].points });
      var ws = words.map(function(w) { return { id: w.id, rawStrokes: w.rawStrokes, anchor: w.anchor, rotate: w.rotate, scale: w.scale, width: w.width, height: w.height }; });
      return { v: 1, canvasWidth: logicalW, drawStrokes: ds, words: ws };
    },
    getSVG: function() {
      finalizeWord();
      var maxY = JOT_PARA_TOP;
      var id;
      for (id in drawStrokes) maxY = Math.max(maxY, drawStrokes[id].bbox.maxY);
      for (var i = 0; i < words.length; i++) maxY = Math.max(maxY, words[i].y + 10);
      var h = Math.ceil(maxY + 20);
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + logicalW + ' ' + h + '" width="' + logicalW + '" height="' + h + '"><rect width="100%" height="100%" fill="#1e1e1e"/>';
      for (id in drawStrokes) svg += jtOutlineToPath(jtOutline(drawStrokes[id].points));
      for (i = 0; i < words.length; i++) {
        var w = words[i];
        var deg = (-w.rotate * 180 / Math.PI).toFixed(2);
        svg += '<g transform="translate(' + w.x.toFixed(2) + ',' + w.y.toFixed(2) + ') rotate(' + deg + ') scale(' + w.scale.toFixed(4) + ') translate(' + (-w.anchor[0]).toFixed(2) + ',' + (-w.anchor[1]).toFixed(2) + ')">';
        for (var s = 0; s < w.rawStrokes.length; s++) svg += jtOutlineToPath(jtOutline(w.rawStrokes[s]));
        svg += '</g>';
      }
      svg += '</svg>';
      return svg;
    },
    loadJSON: function(data) {
      // Loaded content becomes seed entries in the action log (not just
      // direct state) so it replays correctly through rebuildFromActions()
      // — otherwise the first Undo after loading would rebuild from an
      // empty log and wipe the loaded content instead of the last edit.
      actions = [];
      drawStrokes = {}; words = [];
      if (data && data.drawStrokes) for (var i = 0; i < data.drawStrokes.length; i++) {
        var d = data.drawStrokes[i];
        actions.push({ type: "add-stroke", id: d.id, points: d.points });
        drawStrokes[d.id] = { points: d.points, bbox: jtBBox(d.points) };
        if (nextId <= Number(d.id)) nextId = Number(d.id) + 1;
      }
      if (data && data.words) for (var j = 0; j < data.words.length; j++) {
        var w = data.words[j];
        actions.push({ type: "add-word", id: w.id, rawStrokes: w.rawStrokes, anchor: w.anchor, rotate: w.rotate, scale: w.scale, width: w.width, height: w.height });
        words.push({ id: w.id, rawStrokes: w.rawStrokes, anchor: w.anchor, rotate: w.rotate, scale: w.scale, width: w.width, height: w.height });
        if (nextId <= Number(w.id)) nextId = Number(w.id) + 1;
      }
      relayout();
      redraw();
    },
    destroy: function() {
      finalizeWord();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
    }
  };
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
  liveJot = createJot(host);
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

function saveJotToNotes() {
  if (!liveJot || liveJot.isEmpty()) { setJotStatus("Nothing to save"); return; }
  setJotStatus("Saving\u2026");
  var html = liveJot.getSVG();
  var ed = (typeof tinymce !== "undefined") ? tinymce.get("call-notes") : null;
  if (ed) {
    var cur = ed.getContent();
    ed.setContent(cur ? (cur + "<br>" + html) : html);
  } else {
    var ta = document.getElementById("call-notes");
    ta.value = (ta.value ? ta.value + String.fromCharCode(10) : "") + "[Jot sketch attached \u2014 open Notes with rich text to view]";
  }
  setJotStatus("Saved to Notes \u2713");
}

// Persist the live in-call Notes editor + Jot sketch (SVG + re-editable JSON)
// to the call_log row created by logCallEvent("ring").
function setCallSaveStatus(msg) {
  var el = document.getElementById("cp-save-status");
  if (el) el.textContent = msg;
}
function saveCallRecord() {
  if (!currentCall) { setCallSaveStatus("No active call"); return; }
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
  el.innerHTML = '<div class="empty">Loading…</div>';
  fetch(API + "/call-history?limit=20&q=" + encodeURIComponent(num)).then(function(r){return r.json();}).then(function(d){
    var calls = (d.calls || []).filter(function(c) { return !currentCall || c.call_id !== currentCall.id; });
    if (!calls.length) { el.innerHTML = '<div class="empty">No previous calls with this number</div>'; return; }
    el.innerHTML = calls.map(function(c) {
      var when = c.start_date ? new Date(c.start_date).toLocaleString() : "";
      var dur = c.duration > 0 ? fmtDur(c.duration) : "—";
      var dir = c.direction === "outgoing" ? "⬆" : "⬇";
      return '<div class="cp-hist-row"><span>' + dir + ' ' + esc(when) + '</span><span>' + esc(dur) + '</span></div>';
    }).join("");
  }).catch(function(){ el.innerHTML = '<div class="empty">Error loading history</div>'; });
}

function loadQuotationsTab() {
  var el = document.getElementById("cp-pane-sales");
  if (!currentCallPartner) { el.innerHTML = '<div class="empty">No matching contact yet</div>'; return; }
  el.innerHTML = '<div class="empty">Loading…</div>';
  fetch(API + "/quotations?contact=" + encodeURIComponent(currentCallPartner.id)).then(function(r){return r.json();}).then(function(d){
    var list = d.quotations || [];
    if (!list.length) { el.innerHTML = '<div class="empty">No quotations found</div>'; return; }
    el.innerHTML = list.map(function(o) {
      return '<div class="cp-quote-row"><div><div class="n">' + esc(o.name) + '</div>' + (o.state ? '<div class="st">' + esc(o.state) + '</div>' : '') + '</div>' + (o.amount_total != null ? '<span class="amt">' + esc(fmtMoney(o.amount_total)) + '</span>' : '') + '</div>';
    }).join("");
  }).catch(function(){ el.innerHTML = '<div class="empty">Error loading quotations</div>'; });
}
function fmtMoney(n) { try { return "£" + Number(n).toFixed(2); } catch (e) { return String(n); } }

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
// ── call logging (D1 call_log) ──────────────────────────────────
// The browser softphone talks straight to Asterisk over WSS — no server-side
// AGI hook sees these calls — so the client logs ring/answer/hangup itself
// via the same /call-event endpoint the Asterisk-side integration uses.
function logCallEvent(event, extra) {
  if (!currentCall) return;
  var body = new URLSearchParams();
  body.set("event", event);
  body.set("callId", currentCall.id);
  body.set("caller", currentCall.remote || "unknown");
  body.set("did", "");
  body.set("direction", currentCall.dir === "out" ? "outgoing" : "incoming");
  if (extra) { for (var k in extra) body.set(k, String(extra[k])); }
  fetch(API + "/call-event", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString() }).catch(function() {});
}
function logHangup() {
  if (!currentCall) return;
  var dur = currentCall.answeredAt ? Math.round((Date.now() - currentCall.answeredAt) / 1000) : 0;
  logCallEvent("hangup", { duration: dur });
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
  if (num.startsWith("0")) num = "+44" + num.slice(1);
  if (!sipUA) { setStatus("❌ Not registered", true); return; }
  var acc = activeAccount();
  var domain = (acc && acc.domain) || "64.176.181.195";
  var target = SIP.UserAgent.makeURI("sip:" + num + "@" + domain);
  var inviter = new SIP.Inviter(sipUA, target, { sessionDescriptionHandlerOptions: { constraints: { audio: true, video: false } } });
  sipSession = inviter;
  currentCall = { id: inviter.request.callId, dir: "out", remote: num, state: "calling" };
  renderCallUI();
  logCallEvent("ring");
  inviter.stateChange.on(function(state) {
    if (state === SIP.SessionState.Established) { currentCall.state = "active"; currentCall.answeredAt = Date.now(); renderCallUI(); logCallEvent("answer"); }
    if (state === SIP.SessionState.Terminated) { logHangup(); resetCall(); }
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
    showCallPanel(false);
    return;
  }
  banner.classList.remove("hidden");
  document.getElementById("banner-remote").textContent = currentCall.remote;
  var si = { ringing: "🔔 Incoming…", calling: "📞 Calling…", active: "🔊 Connected" }[currentCall.state] || currentCall.state;
  document.getElementById("banner-state").textContent = (currentCall.dir === "in" ? "⬇ " : "⬆ ") + si;
  btnCall.classList.add("hidden");
  btnEnd.classList.remove("hidden");
  showCallPanel(true);
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
  var notesFlag = c.has_notes ? ' <span title="Has notes">📝</span>' : "";
  var key = "h-" + c.id;
  callsCache[key] = c;
  return '<div class="hist-row" data-key="' + esc(key) + '"><span class="ic">' + icon + '</span><div><div class="who">' + arrow + ' ' + esc(who) + notesFlag + '</div>' + (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') + '</div><div class="meta">' + when + dur + '</div></div>';
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
  rowClick(row.getAttribute("data-key"), "call", c, function() { openCallDetailView(c); });
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
    h = (n && /^[+0-9*#]/.test(n) ? '<button class="green" onclick="dialBackSelected()">📞 Call back</button>' : '') + '<button class="primary" onclick="openCallDetailView()">📖 Open</button>';
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
// ── call detail: in-screen view (Details / Notes / Jot) ────────
// A drill-down from History, not a dialog — replaces the whole screen like
// any other view (see switchView), with a back arrow to return.
var cdOpenCallId = null, cdLoadedNotes = {}, cdJotData = null, activeCdTab = "details";
var cdJot = null;


function openCallDetailView(c) {
  c = c || (selected && selected.data);
  if (!c) return;
  destroyCallDetailEditors();
  var name = (c.partner_name || "").trim();
  var num = c.phone_number || c.did || "";
  document.getElementById("cd-caller-name").textContent = name || num || "Unknown";
  document.getElementById("cd-caller-sub").textContent = name ? num : "";
  document.getElementById("cd-callback-btn").classList.toggle("hidden", !(num && /^[+0-9*#]/.test(num)));
  renderCallDetailsPane(c);
  activeCdTab = "details";
  switchView("call-detail");
  switchCallDetailTab("details");
  loadCallDetailNotes(c.call_id || null);
}

function renderCallDetailsPane(c) {
  var dur = c.duration > 0 ? fmtDur(c.duration) : "—";
  var when = c.start_date ? new Date(c.start_date).toLocaleString() : "—";
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
  switchView("history");
}

function switchCallDetailTab(tab) {
  activeCdTab = tab;
  var tabs = document.querySelectorAll("#view-call-detail .cp-tab");
  for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle("active", tabs[i].getAttribute("data-tab") === tab);
  var panes = document.querySelectorAll("#view-call-detail .cp-pane");
  for (var j = 0; j < panes.length; j++) panes[j].classList.toggle("hidden", panes[j].id !== "cd-pane-" + tab);
  if (tab === "jot" && !cdJot) initCallDetailJot();
}

function loadCallDetailNotes(callId) {
  cdOpenCallId = callId;
  cdLoadedNotes = {}; cdJotData = null;
  document.getElementById("cd-pane-notes").innerHTML = '<div class="empty">Loading…</div>';
  if (!callId) { renderCallDetailNotesPane(); return; }
  fetch(API + "/call-notes?call_id=" + encodeURIComponent(callId)).then(function(r) { return r.json(); }).then(function(d) {
    cdLoadedNotes = (d && d.notes) || {};
    cdJotData = safeParseJson(cdLoadedNotes.jot_json);
    renderCallDetailNotesPane();
    // If the Jot tab was already opened/mounted before this fetch resolved
    // (fast tap right after opening the call), backfill it now instead of
    // leaving — or letting a later Save persist — a blank scene.
    if (cdJot && cdJotData) cdJot.loadJSON(cdJotData);
  }).catch(function() { renderCallDetailNotesPane(); });
}

function renderCallDetailNotesPane() {
  var pane = document.getElementById("cd-pane-notes");
  if (!pane) return; // navigated away before the fetch resolved
  pane.innerHTML = '<textarea id="cd-notes"></textarea>';
  loadTinyMce().then(function() { initCallDetailNotesEditor(cdLoadedNotes.notes_html || ""); })
    .catch(function() {
      var ta = document.getElementById("cd-notes");
      if (ta) ta.value = stripHtml(cdLoadedNotes.notes_html || "");
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
    setup: function(editor) { editor.on("init", function() { editor.setContent(html || ""); }); }
  });
}

function initCallDetailJot() {
  var host = document.getElementById("cd-jot-canvas");
  if (!host) return;
  cdJot = createJot(host);
  if (cdJotData) cdJot.loadJSON(cdJotData);
}

function destroyCallDetailEditors() {
  try { if (typeof tinymce !== "undefined" && tinymce.get("cd-notes")) tinymce.get("cd-notes").remove(); } catch (e) {}
  try { if (cdJot) cdJot.destroy(); } catch (e) {}
  cdJot = null;
}

function stripHtml(h) { return String(h || "").replace(/<[^>]*>/g, " ").replace(/ +/g, " ").trim(); }
function safeParseJson(s) { if (!s) return null; try { return JSON.parse(s); } catch (e) { return null; } }

function saveCallDetailEdits() {
  if (!cdOpenCallId) { alert("This call has no call_id to save against."); return; }
  var btn = document.getElementById("cd-save-btn");
  if (btn) { btn.textContent = "Saving…"; btn.disabled = true; }
  var ed = (typeof tinymce !== "undefined" && tinymce.get("cd-notes")) ? tinymce.get("cd-notes") : null;
  var ta = document.getElementById("cd-notes");
  var notesHtml = ed ? ed.getContent() : (ta ? ta.value : (cdLoadedNotes.notes_html || ""));

  if (cdJot) {
    var jotSvg = cdJot.isEmpty() ? "" : cdJot.getSVG();
    var jotJson = JSON.stringify(cdJot.getJSON());
    postCallDetailSave(notesHtml, jotSvg, jotJson);
  } else {
    postCallDetailSave(notesHtml, cdLoadedNotes.jot_svg || "", cdLoadedNotes.jot_json || "");
  }
}

function postCallDetailSave(notesHtml, jotSvg, jotJson) {
  fetch(API + "/call-notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ call_id: cdOpenCallId, notes_html: notesHtml, jot_svg: jotSvg, jot_json: jotJson })
  }).then(function(r) { return r.json(); }).then(function(d) {
    var btn = document.getElementById("cd-save-btn");
    if (d.ok) {
      cdLoadedNotes = { notes_html: notesHtml, jot_svg: jotSvg, jot_json: jotJson };
      if (btn) { btn.disabled = false; btn.textContent = "Saved ✓"; setTimeout(function() { btn.textContent = "💾 Save"; }, 1500); }
    } else {
      if (btn) { btn.disabled = false; btn.textContent = "💾 Save"; }
      alert("Save failed: " + (d.error || "unknown"));
    }
  }).catch(function() {
    var btn = document.getElementById("cd-save-btn");
    if (btn) { btn.disabled = false; btn.textContent = "💾 Save"; }
    alert("Save failed");
  });
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
      logCallEvent("ring");
      inv.stateChange.on(function(state) {
        if (state === SIP.SessionState.Established) { currentCall.state = "active"; currentCall.answeredAt = Date.now(); renderCallUI(); logCallEvent("answer"); }
        if (state === SIP.SessionState.Terminated) { logHangup(); resetCall(); }
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
  return new Response(html, { headers: { "Content-Type": "text/html;charset=utf-8", "Cache-Control": "no-store, no-cache, must-revalidate" } });
}
