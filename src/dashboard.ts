export function serveDashboard(): Response {
  const html = `<!DOCTYPE html>
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
.call-banner .answer{width:44px;height:44px;border-radius:50%;border:none;background:#10b981;color:#fff;font-size:18px;cursor:pointer;flex-shrink:0;margin-right:8px}
.call-banner .keypad{width:40px;height:40px;border-radius:50%;border:none;background:#2c2c2c;color:#ececec;font-size:16px;cursor:pointer;flex-shrink:0;margin-right:8px}
.call-banner .keypad.active{background:#2563eb}
.hidden{display:none!important}
/* views */
.views{flex:1;overflow-y:auto;padding:4px 16px 8px;min-height:0}
/* dial view: entry + recent calls scroll, keypad+call button pinned to the bottom */
#view-dial{display:flex;flex-direction:column;height:100%;min-height:0}
#view-dial .entry{flex-shrink:0}
#view-dial .suggestions{flex:1;overflow-y:auto;min-height:0}
.dial-recent{flex:1;overflow-y:auto;min-height:40px}
.dial-recent-row{display:flex;align-items:center;gap:10px;padding:10px 4px;border-bottom:1px solid #1c1c1c;cursor:pointer}
.dial-recent-row:active{background:#161616}
.dial-recent-row .ic{font-size:15px;flex-shrink:0}
.dir-ic{display:inline-block;flex-shrink:0;line-height:1;text-align:center}
.dir-ic.out{color:#3b82f6}
.dir-ic.in{color:#22c55e}
.dir-ic.missed{color:#ef4444}
.dial-recent-row .dir-ic{font-size:18px;width:20px}
.dial-recent-row .who{flex:1;min-width:0;font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dial-recent-row .meta{font-size:11px;color:#999;flex-shrink:0}
#view-dial .call-panel{flex:1;flex-shrink:1;overflow-y:auto;min-height:0}
.dial-bottom{flex-shrink:0}
.view h2{font-size:15px;color:#999;margin:10px 0;font-weight:600}
.contact-row{display:flex;align-items:center;gap:12px;padding:12px 4px;border-bottom:1px solid #222}
.hist-row{padding:10px 4px;border-bottom:1px solid #222;cursor:pointer}
.hist-main{display:flex;align-items:center;gap:12px}
.hist-row .ic{font-size:18px}
.hist-row .dir-ic{font-size:24px;width:26px}
.hist-row .who,.contact-row .cname{font-size:15px;font-weight:600}
.hist-row .sub,.contact-row .sub{font-size:12px;color:#999}
.hist-row .meta{margin-left:auto;font-size:12px;color:#999;text-align:right}
.hist-actions{display:flex;gap:6px;margin:8px 0 2px 30px}
.hist-action{background:#1a1a1a;border:none;color:#ccc;width:30px;height:30px;border-radius:8px;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.hist-action:active{background:#262626}
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
.cp-quote-row .n .dt{font-weight:400;color:#999;font-size:12px}
.cp-quote-row .items{color:#ccc;font-size:12.5px;font-family:ui-monospace,Menlo,Consolas,monospace;margin-top:2px}
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
.jt-btn.armed{background:#2563eb;color:#fff}
.jt-btn svg{width:20px;height:20px;display:block}
.jt-btn.jt-zoom-label{width:auto;padding:0 8px;font-size:12px}
.jt-wordinfo{margin-left:auto;font-size:11px;color:#888;white-space:nowrap;font-variant-numeric:tabular-nums}
.jt-sep{width:1px;align-self:stretch;background:#2c2c2c;margin:2px 4px}
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
    <div class="avatar" id="avatar">👤<span class="status-dot warn" id="status-dot" title="Loading…"></span></div>
    <div class="identity">
      <div class="user-name" id="acc-name-display">Ext 201</div>
      <div class="caller-id" id="acc-caller-display">Caller ID: +44 7898 117226</div>
    </div>
    <div class="reg-status" id="phone-status">Loading…</div>
    <button class="install-btn hidden" id="install-btn" onclick="installApp()">⬇ Install</button>
    <button class="menu-icon" onclick="toggleMenu()" aria-label="Menu">☰</button>
  </header>

  <div class="install-tip hidden" id="install-tip">
    Tap <strong>Share</strong> then <strong>Add to Home Screen</strong> to install.
    <button onclick="dismissInstallTip()" aria-label="Dismiss">✕</button>
  </div>

  <div class="call-banner hidden" id="call-banner">
    <div class="info">
      <div class="remote" id="banner-remote"></div>
      <div class="state" id="banner-state"></div>
    </div>
    <button class="keypad hidden" id="banner-keypad" onclick="toggleInCallKeypad()" aria-label="Keypad">⌨️</button>
    <button class="answer hidden" id="banner-answer" onclick="answerCall()">📞</button>
    <button class="end" onclick="hangup()">📴</button>
  </div>

  <div class="views">
    <!-- DIAL VIEW -->
    <div class="view" id="view-dial">
      <div class="entry">
        <input id="dial-input" type="text" placeholder="Enter number or name" autocomplete="off" autocapitalize="off">
        <button class="backspace" onclick="backspace()">⌫</button>
      </div>
      <div class="suggestions hidden" id="dial-suggestions"></div>
      <div class="dial-recent" id="dial-recent-list"></div>
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
        </div>
        <div class="cp-body">
          <div class="cp-pane hidden" id="cp-pane-sales"><div class="empty">—</div></div>
          <div class="cp-pane hidden" id="cp-pane-history"><div class="empty">—</div></div>
          <div class="cp-pane hidden" id="cp-pane-emails"><div class="empty">—</div></div>
          <div class="cp-pane" id="cp-pane-notes">
            <textarea id="call-notes" placeholder="Call notes… (press # for quick text)" autocomplete="off"></textarea>
            <div class="qt-panel hidden" id="qt-panel">
              <div class="qt-head">Quick text — tap to insert</div>
              <div id="qt-list"></div>
            </div>
          </div>
          <div class="cp-pane hidden" id="cp-pane-jot">
            <div class="jot-toolbar"><span class="jot-status" id="jot-status"></span></div>
            <div id="jot-canvas"></div>
          </div>
        </div>
      </div>
      <div class="dial-bottom" id="dial-bottom">
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
          <button class="call-btn" id="btn-call" onclick="dialAction()">📞</button>
          <button class="call-btn hangup hidden" id="btn-end" onclick="hangup()">📴</button>
        </div>
      </div>
    </div>

    <!-- HISTORY VIEW -->
    <div class="view hidden" id="view-history">
      <h2>🕐 History</h2>
      <div class="entry">
        <input id="history-search" type="text" placeholder="Search calls (name / number)" autocomplete="off" autocapitalize="off">
      </div>
      <div class="hist-toolbar" id="hist-toolbar">
        <button class="green" data-action="call" onclick="histAction('call')" disabled>📞 Call</button>
        <button data-action="email" onclick="histAction('email')" disabled>✉️ Email</button>
        <button data-action="details" onclick="histAction('details')" disabled>📄 Details</button>
        <button data-action="contact" onclick="histAction('contact')" disabled>👤 Contact</button>
      </div>
      <div id="history-list"><div class="empty">Loading…</div></div>
    </div>

    <!-- PARAMETERS VIEW (opened from the menu) -->
    <div class="view hidden" id="view-params">
      <div class="p-head">
        <button class="cd-back" onclick="closeParams()" aria-label="Back">←</button>
        <div class="cd-title"><strong>Parameters</strong></div>
        <span class="jot-status" id="params-status"></span>
      </div>
      <input class="p-filter" id="params-filter" type="text" placeholder="Filter (name, group…)" autocomplete="off" autocapitalize="off">
      <table class="ptable" id="params-table"></table>
      <div class="p-foot">
        <button id="params-reset-all" onclick="resetAllParams()">Reset all to defaults</button>
        <div class="p-note">Saved automatically, on this device only. Jot values apply to Jot boxes opened afterwards.</div>
      </div>
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
        <button class="cp-tab" data-tab="details" onclick="switchCallDetailTab('details')">Details</button>
        <button class="cp-tab" data-tab="notes" onclick="switchCallDetailTab('notes')">Notes</button>
        <button class="cp-tab active" data-tab="jot" onclick="switchCallDetailTab('jot')">Jot</button>
      </div>
      <div class="cd-body">
        <div class="cp-pane hidden" id="cd-pane-details"></div>
        <div class="cp-pane hidden" id="cd-pane-notes"><div class="empty">Loading…</div></div>
        <div class="cp-pane" id="cd-pane-jot">
          <div class="jot-toolbar"><span class="jot-status" id="cd-jot-status"></span></div>
          <div id="cd-jot-canvas"></div>
        </div>
      </div>
      <div class="cd-footer">
        <span class="jot-status" id="cd-save-status"></span>
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
    <button class="dial-fab" id="nav-dial" onclick="navDialAction()" aria-label="Dial"><span class="fab">📞</span></button>
    <button class="menu-btn" data-view="contacts" onclick="switchView('contacts')"><span class="ico">👥</span><span>Contacts</span></button>
    <button class="menu-btn" data-view="messages" onclick="switchView('messages')"><span class="ico">💬</span><span>Messages</span></button>
  </nav>
  <div class="action-bar hidden" id="action-bar"></div>
</div>

<div class="menu-drawer hidden" id="menu-drawer">
  <button class="hidden" id="menu-install-btn" onclick="menuInstallApp()">⬇ Install App</button>
  <button onclick="openSettings()">⚙️ Settings</button>
  <button onclick="openParams()">📋 Parameters</button>
</div>

<div class="modal hidden" id="settings-modal">
  <div class="modal-card compact">
    <div class="modal-head"><span>⚙️ Settings</span><button onclick="cancelSettings()" aria-label="Cancel">✕</button></div>

    <div class="acc-row">
      <select id="set-account" class="acc-select" onchange="onAccountSelect()"></select>
      <button class="acc-mini" onclick="newAccount()" title="New account" aria-label="New account">＋</button>
      <button class="acc-mini del" onclick="deleteAccount()" title="Delete account" aria-label="Delete account">🗑</button>
    </div>

    <div id="account-editor" class="hidden">
      <div class="set-grid">
        <div class="set-field"><label>Name</label><input id="acc-name" type="text" placeholder="Asterisk (WebPhone 201)" autocomplete="off"></div>
        <div class="set-field"><label>Caller ID</label><input id="acc-callerid" type="text" placeholder="+44 7898 117226" autocomplete="off"></div>
        <div class="set-field"><label>Username</label><input id="acc-username" type="text" placeholder="201" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
        <div class="set-field"><label>Password</label><input id="acc-password" type="text" placeholder="webphone201" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
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
        <div class="set-field"><label>Domain</label><input id="acc-domain" type="text" placeholder="64.176.181.195" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
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

    <div class="set-actions">
      <button class="set-cancel" onclick="cancelSettings()">Cancel</button>
      <button class="save-btn" onclick="applyAndReconnect()">Save</button>
    </div>
    <div class="dev-hint">Save reconnects with these settings. Dev Mode skips the server connection.</div>
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

// ── Parameter table ────────────────────────────────────────────
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
var J_INK = "Jot: ink", J_WORD = "Jot: word detection", J_LAY = "Jot: layout & splitting", J_DOT = "Jot: periods", J_GEST = "Jot: gestures", J_BOX = "Jot: boxes & zoom";

defParam(G_CALL, "regTimeoutMs", "SIP registration timeout", 8000, { unit: "ms", min: 1000, max: 120000, step: 500, note: "Give up if the server never answers REGISTER" }, function(v) { REG_TIMEOUT_MS = v; });
defParam(G_CALL, "sipLoadTimeoutMs", "SIP.js load timeout", 15000, { unit: "ms", min: 1000, max: 120000, step: 1000 });
defParam(G_CALL, "defaultWs", "Default SIP WebSocket", "wss://64.176.181.195.nip.io/ws", { note: "Used for new accounts and a blank Proxy field" }, function(v) { DEFAULT_WS = v; });
defParam(G_CALL, "defaultDomain", "Default SIP domain", "64.176.181.195", { note: "Used when an account has no domain" });
defParam(G_CALL, "autoAnswerWindowMs", "Answer-tap window", 30000, { unit: "ms", min: 1000, max: 300000, step: 1000, note: "After tapping the call notification, a call arriving within this time auto-answers" });
defParam(G_CALL, "autoAnswerDelayMs", "Auto-answer delay", 400, { unit: "ms", min: 0, max: 5000, step: 50, note: "Pause between the call ringing in and answering it" });
defParam(G_CALL, "ringIntervalMs", "Incoming ring repeat", 3000, { unit: "ms", min: 1000, max: 15000, step: 250 });
defParam(G_CALL, "ringbackIntervalMs", "Ringback tone repeat", 3000, { unit: "ms", min: 1000, max: 15000, step: 250 });
defParam(G_CALL, "longPressPlusMs", "Hold 0 for +", 600, { unit: "ms", min: 200, max: 3000, step: 50, note: "Long-press time on the 0 key" });

defParam(G_LIST, "historyLimit", "History rows loaded", 200, { min: 1, max: 1000, step: 10 });
defParam(G_LIST, "recentCallsLimit", "Recent calls on Dial screen", 8, { min: 1, max: 50 });
defParam(G_LIST, "callPanelHistoryLimit", "Call history in call panel", 20, { min: 1, max: 200, step: 5 });
defParam(G_LIST, "suggestionsLimit", "Contact suggestions while dialling", 6, { min: 1, max: 30 });
defParam(G_LIST, "contactsLimit", "Contacts loaded", 100, { min: 1, max: 1000, step: 10 });
defParam(G_LIST, "callPanelMessagesLimit", "Messages in call panel", 100, { min: 1, max: 500, step: 10 });
defParam(G_LIST, "contactMessagesLimit", "Messages per contact", 50, { min: 1, max: 500, step: 10 });
defParam(G_LIST, "recentMessagesDays", "Recent messages: days back", 7, { unit: "days", min: 1, max: 90 });
defParam(G_LIST, "recentMessagesLimit", "Recent messages: max", 50, { min: 1, max: 500, step: 10 });

defParam(G_TIME, "suggestDebounceMs", "Dial suggestions delay", 220, { unit: "ms", min: 0, max: 2000, step: 10, note: "Wait after typing before searching" });
defParam(G_TIME, "historyDebounceMs", "History search delay", 250, { unit: "ms", min: 0, max: 2000, step: 10 });
defParam(G_TIME, "contactsDebounceMs", "Contacts search delay", 250, { unit: "ms", min: 0, max: 2000, step: 10 });
defParam(G_TIME, "doubleTapMs", "Double-tap window", 300, { unit: "ms", min: 100, max: 1000, step: 10, note: "Contacts / messages rows" });
defParam(G_TIME, "notesAutosaveMs", "Notes autosave delay", 900, { unit: "ms", min: 200, max: 10000, step: 100, note: "Wait after the last edit before saving" });
defParam(G_TIME, "quickTextTimeoutMs", "Quick-text panel timeout", 4000, { unit: "ms", min: 500, max: 30000, step: 500 });

defParam(J_INK, "jotInk", "Ink colour", "#e9ecef", { note: "CSS colour" }, function(v) { JOT_INK = v; });
defParam(J_INK, "jotStrokeSize", "Stroke width", 5, { unit: "px", min: 0.5, max: 30, step: 0.5 }, function(v) { JOT_STROKE_OPTS.size = v; });
defParam(J_INK, "jotStrokeThinning", "Stroke thinning", 0.6, { min: -1, max: 1, step: 0.05, note: "How much speed thins the line" }, function(v) { JOT_STROKE_OPTS.thinning = v; });
defParam(J_INK, "jotStrokeSmoothing", "Stroke smoothing", 0.5, { min: 0, max: 1, step: 0.05 }, function(v) { JOT_STROKE_OPTS.smoothing = v; });
defParam(J_INK, "jotStrokeStreamline", "Stroke streamline", 0.5, { min: 0, max: 1, step: 0.05 }, function(v) { JOT_STROKE_OPTS.streamline = v; });
defParam(J_INK, "jotDefaultPressure", "Default pen pressure", 0.5, { min: 0.05, max: 1, step: 0.05, note: "For mouse / pens that report no pressure" });

defParam(J_WORD, "jotNewWordPauseMs", "New word: pause", 900, { unit: "ms", min: 0, max: 10000, step: 50, note: "A new word needs BOTH this pause AND the gap below" });
defParam(J_WORD, "jotNewWordGapMm", "New word: gap", 2, { unit: "mm", min: 0, max: 100, step: 0.5, note: "Distance from the word so far (on screen)" });
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
defParam(J_GEST, "jotGestureReturn", "Return gesture", "down-left", { choices: GESTURE_PATHS, note: "Starts a new line, left-aligned" });

defParam(J_BOX, "jotBoxMinWidth", "Box minimum width", 80, { unit: "px", min: 20, max: 600, step: 5 }, function(v) { JOT_BOX_MIN_WIDTH = v; });
defParam(J_BOX, "jotNewBoxRows", "New box height", 1, { unit: "lines", min: 1, max: 20, step: 1, note: "For boxes made with the + button" }, function(v) { JOT_NEW_BOX_ROWS = v; });
defParam(J_BOX, "jotBoxHandleSize", "Resize handle size", 18, { unit: "px", min: 8, max: 60, step: 1 }, function(v) { JOT_BOX_HANDLE_SIZE = v; });
defParam(J_BOX, "jotNewBoxWMin", "Default new-box width: min", 140, { unit: "px", min: 40, max: 1000, step: 5 });
defParam(J_BOX, "jotNewBoxWMax", "Default new-box width: max", 340, { unit: "px", min: 40, max: 2000, step: 5 });
defParam(J_BOX, "jotNewBoxWFrac", "Default new-box width: screen share", 0.55, { min: 0.1, max: 1, step: 0.05 });
defParam(J_BOX, "jotZoomMin", "Zoom minimum", 0.25, { min: 0.05, max: 1, step: 0.05 });
defParam(J_BOX, "jotZoomMax", "Zoom maximum", 4, { min: 1, max: 20, step: 0.5 });
defParam(J_BOX, "jotZoomStep", "Zoom button step", 1.25, { min: 1.05, max: 3, step: 0.05 });
defParam(J_BOX, "jotHitPad", "Touch tolerance (erase / select)", 10, { unit: "px", min: 0, max: 60, step: 1 });
defParam(J_BOX, "jotHandleHitMin", "Resize handle touch area: min", 10, { unit: "px", min: 2, max: 60, step: 1 });
defParam(J_BOX, "jotHandleHitFactor", "Resize handle touch area: scale", 0.9, { min: 0.3, max: 3, step: 0.05 });
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
    JOT_NEW_BOX_HEIGHT = JOT_PARA_TOP + JOT_NEW_BOX_ROWS * JOT_LINE_HEIGHT;
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
      + '<td class="p-def">' + esc(p.type === "choice" ? paramChoiceLabel(p.def) : paramFmt(p.def)) + '<button class="p-reset" data-id="' + p.id + '" title="Reset to default"' + (changed ? "" : ' style="visibility:hidden"') + '>↺</button></td></tr>';
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
    paramStatus("⚠ " + p.label + ": " + (p.type === "number" ? "enter a number" + (p.min !== undefined ? " from " + p.min : "") + (p.max !== undefined ? " to " + p.max : "") : "can't be empty"), true);
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
  paramStatus("Saved ✓ " + p.label, false);
}
function resetParam(id) {
  var p = paramFind(id);
  if (!p) return;
  var o = paramOverrides();
  delete o[id];
  saveParamOverrides(o);
  paramApply(p, p.def);
  renderParams();
  paramStatus("Reset ✓ " + p.label, false);
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
  paramStatus("All parameters reset ✓", false);
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
  // Deliberately local-only (localStorage), never synced to the shared
  // server-side settings row: two devices are meant to run different SIP
  // identities (e.g. desktop on 201, phone on 202) at the same time. That
  // used to push here too, so whichever device saved last would silently
  // overwrite what every other device loads on its next boot() — causing
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

// ── incoming-call ringtone (dual-tone, 1s on / 3s off, looped) ─
// Vibration runs alongside the tone, not instead of it — it's a fallback
// for when audio is blocked by autoplay policy (Chrome/Android; iOS Safari
// has never implemented the Vibration API at all, and desktop has no
// hardware to vibrate), not a guaranteed workaround for it: browsers apply
// the same "needs a recent user gesture" restriction to vibrate() as they
// do to audio autoplay, so on a completely untouched tab neither may fire.
var ringCtx = null, ringTimer = null;
function startRingtone() {
  stopRingtone();
  try { ringCtx = new (window.AudioContext || window.webkitAudioContext)(); ringCtx.resume().catch(function() {}); } catch (e) { ringCtx = null; }
  ringCycle();
}
function ringCycle() {
  if (ringCtx) {
    var t0 = ringCtx.currentTime;
    var gain = ringCtx.createGain();
    gain.gain.setValueAtTime(0.001, t0);
    gain.gain.exponentialRampToValueAtTime(0.2, t0 + 0.02);
    gain.gain.setValueAtTime(0.2, t0 + 0.9);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 1);
    gain.connect(ringCtx.destination);
    var osc1 = ringCtx.createOscillator(); osc1.type = "sine"; osc1.frequency.value = 440;
    var osc2 = ringCtx.createOscillator(); osc2.type = "sine"; osc2.frequency.value = 480;
    osc1.connect(gain); osc2.connect(gain);
    osc1.start(t0); osc2.start(t0);
    osc1.stop(t0 + 1); osc2.stop(t0 + 1);
  }
  try { if (navigator.vibrate) navigator.vibrate([400, 200, 400]); } catch (e) {}
  ringTimer = setTimeout(ringCycle, PV.ringIntervalMs);
}
function stopRingtone() {
  if (ringTimer) { clearTimeout(ringTimer); ringTimer = null; }
  if (ringCtx) { try { ringCtx.close(); } catch (e) {} ringCtx = null; }
  try { if (navigator.vibrate) navigator.vibrate(0); } catch (e) {}
}

// ── outgoing ringback (UK-style 400+450Hz double burst) ────────
// Only used when the far end says "180 Ringing" without sending early-media
// audio (SDP) of its own — if the carrier does send ringback in-band, that
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

// ── view switching ─────────────────────────────────────────────
// The big green button. From another tab it lands on Dial with the keypad open. On
// Dial: a typed number gets dialled; otherwise it opens/closes the keypad
// (which starts tucked away). During a call it toggles the in-call keypad.
var dialKeypadOpen = false;
function onDialView() { return !document.getElementById("view-dial").classList.contains("hidden"); }
function navDialAction() {
  if (currentCall) { hangup(); return; }
  if (!onDialView()) { switchView("dial"); dialKeypadOpen = true; updateDialBottomVisibility(); return; }
  if (document.getElementById("dial-input").value.trim()) { dialAction(); return; }
  dialKeypadOpen = !dialKeypadOpen;
  updateDialBottomVisibility();
}
document.addEventListener("DOMContentLoaded", updateDialBottomVisibility);

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
}

// ── Jot: handwriting canvas (perfect-freehand, vendored inline — ~5KB, no
// network request, no framework) ────────────────────────────────
// Vendored from perfect-freehand@1.2.3 (MIT, github.com/steveruizok/perfect-freehand).
var PerfectFreehand=(()=>{var Q=Object.defineProperty;var zn=Object.getOwnPropertyDescriptor;var An=Object.getOwnPropertyNames;var bn=Object.prototype.hasOwnProperty;var In=(n,t)=>{for(var r in t)Q(n,r,{get:t[r],enumerable:!0})},Tn=(n,t,r,u)=>{if(t&&typeof t=="object"||typeof t=="function")for(let i of An(t))!bn.call(n,i)&&i!==r&&Q(n,i,{get:()=>t[i],enumerable:!(u=zn(t,i))||u.enumerable});return n};var jn=n=>Tn(Q({},"__esModule",{value:!0}),n);var Nn={};In(Nn,{default:()=>Kn,getStroke:()=>yn,getStrokeOutlinePoints:()=>dn,getStrokePoints:()=>xn});var{PI:wn}=Math,F=wn+1e-4,rn=.5,un=[1,1];function on(n,t,r,u=i=>i){return n*u(.5-t*(.5-r))}var{min:U}=Math;function gn(n,t,r){let u=U(1,t/r);return U(1,n+(U(1,1-u)-n)*(u*.275))}function Fn(n){return[-n[0],-n[1]]}function g(n,t){return[n[0]+t[0],n[1]+t[1]]}function en(n,t,r){return n[0]=t[0]+r[0],n[1]=t[1]+r[1],n}function L(n,t){return[n[0]-t[0],n[1]-t[1]]}function X(n,t,r){return n[0]=t[0]-r[0],n[1]=t[1]-r[1],n}function y(n,t){return[n[0]*t,n[1]*t]}function V(n,t,r){return n[0]=t[0]*r,n[1]=t[1]*r,n}function On(n,t){return[n[0]/t,n[1]/t]}function vn(n){return[n[1],-n[0]]}function W(n,t){let r=t[0];return n[0]=t[1],n[1]=-r,n}function sn(n,t){return n[0]*t[0]+n[1]*t[1]}function Rn(n,t){return n[0]===t[0]&&n[1]===t[1]}function _n(n){return Math.hypot(n[0],n[1])}function cn(n,t){let r=n[0]-t[0],u=n[1]-t[1];return r*r+u*u}function Mn(n){return On(n,_n(n))}function qn(n,t){return Math.hypot(n[1]-t[1],n[0]-t[0])}function Y(n,t,r){let u=Math.sin(r),i=Math.cos(r),e=n[0]-t[0],o=n[1]-t[1],c=e*i-o*u,v=e*u+o*i;return[c+t[0],v+t[1]]}function ln(n,t,r,u){let i=Math.sin(u),e=Math.cos(u),o=t[0]-r[0],c=t[1]-r[1],v=o*e-c*i,P=o*i+c*e;return n[0]=v+r[0],n[1]=P+r[1],n}function fn(n,t,r){return g(n,y(L(t,n),r))}function Bn(n,t,r,u){let i=r[0]-t[0],e=r[1]-t[1];return n[0]=t[0]+i*u,n[1]=t[1]+e*u,n}function mn(n,t,r){return g(n,y(t,r))}var l=[0,0],d=[0,0],x=[0,0];function Cn(n,t){let r=mn(n,Mn(vn(L(n,g(n,[1,1])))),-t),u=[],i=1/13;for(let e=i;e<=1;e+=i)u.push(Y(r,n,F*2*e));return u}function Dn(n,t,r){let u=[],i=1/r;for(let e=i;e<=1;e+=i)u.push(Y(t,n,F*e));return u}function En(n,t,r){let u=L(t,r),i=y(u,.5),e=y(u,.51);return[L(n,i),L(n,e),g(n,e),g(n,i)]}function Gn(n,t,r,u){let i=[],e=mn(n,t,r),o=1/u;for(let c=o;c<1;c+=o)i.push(Y(e,n,F*3*c));return i}function Hn(n,t,r){return[g(n,y(t,r)),g(n,y(t,r*.99)),L(n,y(t,r*.99)),L(n,y(t,r))]}function hn(n,t,r){return n===!1||n===void 0?0:n===!0?Math.max(t,r):n}function Jn(n,t,r){return n.slice(0,10).reduce((u,i)=>{let e=i.pressure;return t&&(e=gn(u,i.distance,r)),(u+e)/2},n[0].pressure)}function dn(n,t={}){let{size:r=16,smoothing:u=.5,thinning:i=.5,simulatePressure:e=!0,easing:o=s=>s,start:c={},end:v={},last:P=!1}=t,{cap:M=!0,easing:O=s=>s*(2-s)}=c,{cap:f=!0,easing:h=s=>--s*s*s+1}=v;if(n.length===0||r<=0)return[];let p=n[n.length-1].runningLength,A=hn(c.taper,r,p),b=hn(v.taper,r,p),Z=(r*u)**2,I=[],z=[],$=Jn(n,e,r),a=on(r,i,n[n.length-1].pressure,o),C,D=n[0].vector,T=n[0].point,R=T,S=T,k=R,E=!1;for(let s=0;s<n.length;s++){let{pressure:K}=n[s],{point:m,vector:j,distance:Ln,runningLength:w}=n[s],q=s===n.length-1;if(!q&&p-w<3)continue;i?(e&&(K=gn($,Ln,r)),a=on(r,i,K,o)):a=r/2,C===void 0&&(C=a);let Pn=w<A?O(w/A):1,Sn=p-w<b?h((p-w)/b):1;a=Math.max(.01,a*Math.min(Pn,Sn));let nn=(q?n[s]:n[s+1]).vector,N=q?1:sn(j,nn),kn=sn(j,D)<0&&!E,tn=N!==null&&N<0;if(kn||tn){W(l,D),V(l,l,a);for(let B=0;B<=1;B+=.07692307692307693)X(d,m,l),ln(d,d,m,F*B),S=[d[0],d[1]],I.push(S),en(x,m,l),ln(x,x,m,F*-B),k=[x[0],x[1]],z.push(k);T=S,R=k,tn&&(E=!0);continue}if(E=!1,q){W(l,j),V(l,l,a),I.push(L(m,l)),z.push(g(m,l));continue}Bn(l,nn,j,N),W(l,l),V(l,l,a),X(d,m,l),S=[d[0],d[1]],(s<=1||cn(T,S)>Z)&&(I.push(S),T=S),en(x,m,l),k=[x[0],x[1]],(s<=1||cn(R,k)>Z)&&(z.push(k),R=k),$=K,D=j}let G=[n[0].point[0],n[0].point[1]],H=n.length>1?[n[n.length-1].point[0],n[n.length-1].point[1]]:g(n[0].point,[1,1]),J=[],_=[];if(n.length===1){if(!(A||b)||P)return Cn(G,C||a)}else{A||b&&n.length===1||(M?J.push(...Dn(G,z[0],13)):J.push(...En(G,I[0],z[0])));let s=vn(Fn(n[n.length-1].vector));b||A&&n.length===1?_.push(H):f?_.push(...Gn(H,s,a,29)):_.push(...Hn(H,s,a))}return I.concat(_,z.reverse(),J)}var an=[0,0];function pn(n){return n!=null&&n>=0}function xn(n,t={}){let{streamline:r=.5,size:u=16,last:i=!1}=t;if(n.length===0)return[];let e=.15+(1-r)*.85,o=Array.isArray(n[0])?n:n.map(({x:f,y:h,pressure:p=rn})=>[f,h,p]);if(o.length===2){let f=o[1];o=o.slice(0,-1);for(let h=1;h<5;h++)o.push(fn(o[0],f,h/4))}o.length===1&&(o=[...o,[...g(o[0],un),...o[0].slice(2)]]);let c=[{point:[o[0][0],o[0][1]],pressure:pn(o[0][2])?o[0][2]:.25,vector:[...un],distance:0,runningLength:0}],v=!1,P=0,M=c[0],O=o.length-1;for(let f=1;f<o.length;f++){let h=i&&f===O?[o[f][0],o[f][1]]:fn(M.point,o[f],e);if(Rn(M.point,h))continue;let p=qn(h,M.point);if(P+=p,f<O&&!v){if(P<u)continue;v=!0}X(an,M.point,h),M={point:h,pressure:pn(o[f][2])?o[f][2]:rn,vector:Mn(an),distance:p,runningLength:P},c.push(M)}return c[0].vector=c[1]?.vector||[0,0],c}function yn(n,t={}){return dn(xn(n,t),t)}var Kn=yn;return jn(Nn);})();

// ── Jot engine: Jot (auto-growing, word-wrapping text boxes, handwriting-
// recognized) / Draw (freehand pencil ink) / Erase, undo, zoom, save/load ──
var JOT_INK = "#e9ecef";
var JOT_STROKE_OPTS = { size: 5, thinning: 0.6, smoothing: 0.5, streamline: 0.5 };
// End-of-word detection: a new stroke starts a new word only when BOTH
//   pause since the previous stroke lifted >= PV.jotNewWordPauseMs
//   AND gap (on screen, mm) between the new stroke and the word so far >= PV.jotNewWordGapMm.
// Anything else joins the current word. Separately, a word settles (is laid
// out into its box) after PV.jotWordSettleMs with no new stroke; that is
// final — the raw ink moves into the text flow, so there is nothing left to
// measure a gap against.
var JOT_PX_PER_MM = JOT_DEFAULT_PX_PER_MM;  // CSS px per real mm
function jtStartsNewWord(pauseMs, gapMm) {
  return pauseMs >= PV.jotNewWordPauseMs && gapMm >= PV.jotNewWordGapMm;
}
// Shortest distance between two bboxes (0 if they overlap), logical px.
function jtBBoxGap(a, b) {
  var dx = Math.max(0, a.minX - b.maxX, b.minX - a.maxX);
  var dy = Math.max(0, a.minY - b.maxY, b.minY - a.maxY);
  return Math.sqrt(dx * dx + dy * dy);
}
// Cap the leveling rotation: a lone near-vertical stroke (e.g. a single "l")
// has no horizontal spread, so the best-fit line through it is ~90° and
// would otherwise get "leveled" straight into a horizontal line.
var JOT_MAX_TILT = 30 * Math.PI / 180;
var JOT_LINE_HEIGHT = 42;
var JOT_WORD_HEIGHT = 26;     // normalized word height (logical px)
var JOT_WORD_GAP = 10;
var JOT_PARA_MARGIN = 14;
var JOT_PARA_TOP = 32;
// A standalone tap (near-zero movement) reads as a period, not a letter —
// left to the normal word-height scaling it would blow up into a blob
// (the height floor that scaling divides by is much bigger than a tap).
var JOT_DOT_MAX_RAW = 6;   // raw local px — a lone stroke this small or smaller is a tap
var JOT_DOT_SCALE = 0.5;   // fixed small render scale for a period
var JOT_DOT_WIDTH = 8;     // layout width reserved for a period
// Jot-mode commands: a single continuous stroke with one corner — two straight,
// roughly perpendicular legs (see jtClassifyGesture). The pen's path decides it,
// in order: e.g. "left-down" is draw leftward, turn, draw downward. Two paths
// are commands, chosen in Parameters (Jot: gestures):
//   Backspace  (default left-down)  undoes the in-progress word, or the last
//              committed action if nothing's in progress.
//   Return     (default down-left)  inserts a line break: the next word starts
//              on the next line, left-aligned.
// Each leg must be reasonably long and straight, so ordinary letters (which
// curve) are never mistaken for a command.
var JOT_GESTURE_MIN_LEN = 22;         // screen px — minimum net travel per leg (zoom-independent)
var JOT_GESTURE_STRAIGHTNESS = 0.7;   // net displacement / actual path length, per leg
var JOT_GESTURE_AXIS_DOMINANCE = 1.6; // one axis must outrun the other by this ratio, per leg
// Text boxes: created by tapping empty canvas in Jot mode. Each owns its own
// word-wrapped layout (wrapWidth -> contentHeight, exactly like the old
// single full-page layout, just scoped per box). Outside Jot mode a box
// becomes a plain movable/resizable object — dragging its body moves it,
// dragging its corner handle stretches it (w/h independent of wrapWidth,
// rendered as a uniform scale over the box's content so text grows/shrinks
// without re-wrapping). Re-entering Jot mode on a stretched box "bakes" its
// current width back in as the new wrapWidth and re-wraps at that width.
var JOT_BOX_MIN_WIDTH = 80;
var JOT_BOX_MIN_HEIGHT = JOT_PARA_TOP + JOT_LINE_HEIGHT;
var JOT_NEW_BOX_ROWS = 1;   // boxes made with the + button start this many lines tall
var JOT_NEW_BOX_HEIGHT = JOT_PARA_TOP + JOT_NEW_BOX_ROWS * JOT_LINE_HEIGHT;
var JOT_BOX_HANDLE_SIZE = 18; // kept a constant on-screen size regardless of zoom

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
// Straight-line direction of one leg of a candidate gesture stroke — the
// dominant cardinal axis + sign of its net displacement — or null if it's
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
// between its endpoints — the corner of an L-shaped gesture stroke.
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
  // stroke like "I" or "l") has no reliable tilt to measure — sxy is just
  // noise there, and atan2 turns that noise into an essentially random
  // +/-90 degree result. Rather than clamp that noise to +/-JOT_MAX_TILT
  // (still visibly wrong, and unstable in sign), treat it as untilted.
  if (Math.sqrt(sxx / n) < Math.sqrt(syy / n) * PV.jotUntiltedSpread) {
    angle = 0;
  } else {
    angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    // Handwriting is only ever leveled clockwise (or left untilted), never
    // counterclockwise — a negative (counterclockwise) result gets zeroed,
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
// Lay out one word from its raw strokes — the strokes are never split again
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

function createJot(hostEl, onChange) {
  function notifyChange() { if (onChange) onChange(); }
  hostEl.innerHTML = "";
  hostEl.classList.add("jt-wrap");

  var toolbar = document.createElement("div");
  toolbar.className = "jt-toolbar";
  toolbar.innerHTML =
    '<button class="jt-btn jt-mode active" data-mode="jot" title="Jot: tap to add/edit a text box">🖊️</button>' +
    '<button class="jt-btn jt-mode" data-mode="draw" title="Draw">✏️</button>' +
    '<button class="jt-btn jt-mode" data-mode="erase" title="Erase">🧽</button>' +
    '<button class="jt-btn" data-act="newbox" title="New jot box: tap this, then tap the page to place a full-width box">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="2.5" y="5" width="19" height="14" rx="2" stroke-dasharray="3 2.5"/><path d="M12 9v6M9 12h6"/></svg>' +
    '</button>' +
    '<span class="jt-sep"></span>' +
    '<button class="jt-btn" data-act="undo" title="Undo">↶</button>' +
    '<button class="jt-btn" data-act="zoomout" title="Zoom out">−</button>' +
    '<button class="jt-btn jt-zoom-label" data-act="zoomreset" title="Reset zoom">100%</button>' +
    '<button class="jt-btn" data-act="zoomin" title="Zoom in">+</button>' +
    '<span class="jt-sep"></span>' +
    '<button class="jt-btn ghost" data-act="clear" title="Clear all">🗑</button>' +
    '<span class="jt-wordinfo" title="Last stroke: pause, gap from the word, and the decision"></span>';
  hostEl.appendChild(toolbar);

  var canvasWrap = document.createElement("div");
  canvasWrap.className = "jt-canvas-wrap";
  var canvas = document.createElement("canvas");
  canvasWrap.appendChild(canvas);
  hostEl.appendChild(canvasWrap);

  var ctx = canvas.getContext("2d");
  var dpr = window.devicePixelRatio || 1;
  // The canvas element always exactly fills its viewport (never grows with
  // content) — the document itself is unbounded, and "camera" below is the
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
  // DOC_WIDTH is only informational now (persisted for reference / as an SVG
  // width floor) — each text box owns its own word-wrap width independent of
  // zoom, unlike the old single full-page layout.
  var DOC_WIDTH = viewportW;
  function updateDocWidth() {
    DOC_WIDTH = Math.max(160, viewportW / camera.scale);
  }
  // Default width for a freshly-created box — scaled to the viewport so it
  // reads sensibly on both the narrow in-call panel and the wider call-detail
  // view.
  function jotDefaultBoxWidth() {
    return Math.max(PV.jotNewBoxWMin, Math.min(PV.jotNewBoxWMax, viewportW * PV.jotNewBoxWFrac));
  }

  var mode = "jot";       // "jot" | "draw" | "erase" | null (deselected -> pan/zoom + box move/resize)
  var camera = { x: 0, y: 0, scale: 1 }; // document-space coords of viewport top-left, and zoom
  var nextId = 1;
  var drawStrokes = {};   // id -> { points:[[x,y,p],...], bbox } — freehand pencil ink, not boxed
  var boxes = [];          // ordered [{ id, x, y, wrapWidth, contentHeight, w, h, stretched, words:[...] }]
  var activeBoxId = null;  // the box currently being written into in Jot mode
  var placingBox = false;  // + button armed: the next tap on the canvas drops a new full-width box there
  var actions = [];        // undo log (box creation, words/breaks within a box, erases — not moves/resizes/pan/zoom)
  var current = null;      // in-progress stroke while pointer is down
  var writingWord = null;  // { strokes:[...], bbox } — belongs to activeBoxId
  var wordPauseTimer = null;
  var lastStrokeUpAt = 0;  // performance.now() when the last Jot stroke lifted
  var strokeDownAt = 0;    // performance.now() when the in-progress Jot stroke landed
  var erasing = false;
  var activePointers = {}; // pointerId -> {x,y}, tracked whenever a tool is deselected (pan/pinch-zoom)
  var panState = null;     // {x,y} last client point, while 1 finger drags with no tool selected
  var pinchState = null;   // {dist, anchorDoc}, while 2 fingers are down with no tool selected
  var boxDragState = null;   // {box, offsetX, offsetY}, while dragging a box's body with no tool selected
  var boxResizeState = null; // {box, startW, startH, startX, startY}, while dragging a box's corner handle

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

  function findBox(id) {
    for (var i = 0; i < boxes.length; i++) if (boxes[i].id === id) return boxes[i];
    return null;
  }
  function activeBox() { return activeBoxId != null ? findBox(activeBoxId) : null; }

  // Content height a box's current words actually need at its wrapWidth —
  // this is what "the box will grow automatically in length as words are
  // entered" means: height always tracks this unless the box has been
  // manually stretched (see "stretched" below).
  function jtBoxContentHeight(b) {
    var maxY = JOT_PARA_TOP;
    for (var i = 0; i < b.words.length; i++) if (b.words[i].y > maxY) maxY = b.words[i].y;
    return Math.max(Math.ceil(maxY + JOT_PARA_MARGIN + PV.jotBoxBottomPad), b.minH || JOT_BOX_MIN_HEIGHT);
  }

  function relayoutBox(b) {
    var lineIdx = 0, x = JOT_PARA_MARGIN;
    var maxWidth = b.wrapWidth - JOT_PARA_MARGIN * 2;
    for (var i = 0; i < b.words.length; i++) {
      var w = b.words[i];
      // A Return (the down+back gesture) is a hidden marker word, not real
      // ink — it always starts a new line and takes no width itself, same
      // idea as running out of width, but never on the very first item so a
      // break with nothing before it doesn't leave a blank opening line.
      if (w.isBreak) {
        if (i > 0) { lineIdx++; x = JOT_PARA_MARGIN; }
        w.line = lineIdx; w.x = x; w.y = JOT_PARA_TOP + lineIdx * JOT_LINE_HEIGHT;
        continue;
      }
      if (x + w.width > maxWidth && x > JOT_PARA_MARGIN) { lineIdx++; x = JOT_PARA_MARGIN; }
      w.line = lineIdx;
      w.x = x;
      w.y = JOT_PARA_TOP + lineIdx * JOT_LINE_HEIGHT;
      x += w.width + JOT_WORD_GAP;
    }
    b.contentHeight = jtBoxContentHeight(b);
    // Only auto-follow the content size while the box hasn't been manually
    // stretched (outside Jot mode) — a stretched box keeps its own w/h and
    // just re-wraps/re-scales relative to them (see bakeBox()).
    if (!b.stretched) { b.w = b.wrapWidth; b.h = b.contentHeight; }
  }

  // Adopts a manually-stretched box's current on-screen width as its new
  // authoring width and re-wraps at that width — this is the "if the box is
  // resized, words will wordwrap" behavior, triggered the moment Jot mode
  // resumes editing a box that was resized while Jot mode was off.
  function bakeBox(b) {
    if (!b.stretched) return;
    b.wrapWidth = Math.max(JOT_BOX_MIN_WIDTH, b.w);
    b.stretched = false;
    relayoutBox(b);
  }

  function createBoxAt(p, full) {
    // full: a box from the + button — spans the visible width and starts
    // JOT_NEW_BOX_ROWS lines tall (it still grows past that as text needs it).
    var b = {
      id: nextId++, x: full ? camera.x : p[0], y: p[1],
      wrapWidth: full ? Math.max(JOT_BOX_MIN_WIDTH, Math.floor(viewportW / camera.scale)) : jotDefaultBoxWidth(),
      minH: full ? JOT_NEW_BOX_HEIGHT : 0,
      contentHeight: full ? JOT_NEW_BOX_HEIGHT : JOT_BOX_MIN_HEIGHT,
      w: 0, h: 0, stretched: false, words: []
    };
    b.w = b.wrapWidth; b.h = b.contentHeight;
    boxes.push(b);
    actions.push({ type: "add-box", id: b.id, x: b.x, y: b.y, wrapWidth: b.wrapWidth, minH: b.minH });
    return b;
  }

  function hitTestBoxBody(p) {
    for (var i = boxes.length - 1; i >= 0; i--) {
      var b = boxes[i];
      if (p[0] >= b.x && p[0] <= b.x + b.w && p[1] >= b.y && p[1] <= b.y + b.h) return b;
    }
    return null;
  }
  function hitTestBoxHandle(p) {
    var pad = Math.max(JOT_BOX_HANDLE_SIZE / camera.scale, PV.jotHandleHitMin) * PV.jotHandleHitFactor;
    for (var i = boxes.length - 1; i >= 0; i--) {
      var b = boxes[i];
      var hx = b.x + b.w, hy = b.y + b.h;
      if (Math.abs(p[0] - hx) <= pad && Math.abs(p[1] - hy) <= pad) return b;
    }
    return null;
  }

  function redraw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewportW, viewportH);
    if (!boxes.length && !Object.keys(drawStrokes).length) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#777";
      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(placingBox ? "Tap here to place the jot box" : "Tap the + box button, then tap here", viewportW / 2, viewportH / 2);
      ctx.textAlign = "start";
    }
    // Everything below is drawn in document space; this transform maps it
    // through the camera (pan + zoom) onto the viewport-sized canvas.
    ctx.setTransform(camera.scale * dpr, 0, 0, camera.scale * dpr, -camera.x * camera.scale * dpr, -camera.y * camera.scale * dpr);
    ctx.fillStyle = JOT_INK;
    var id;
    for (id in drawStrokes) jtFillOutline(ctx, jtOutline(drawStrokes[id].points));
    for (var bi = 0; bi < boxes.length; bi++) {
      var b = boxes[bi];
      var sx = b.w / b.wrapWidth, sy = b.h / Math.max(b.contentHeight, 1);
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.scale(sx, sy);
      var isSelected = mode === "jot" && b.id === activeBoxId;
      ctx.strokeStyle = isSelected ? "rgba(37,99,235,0.95)" : (mode !== "jot") ? "rgba(37,99,235,0.55)" : "rgba(255,255,255,0.22)";
      ctx.setLineDash(mode !== "jot" || isSelected ? [] : [4, 3]);
      ctx.lineWidth = 1 / Math.max(Math.min(sx, sy), 0.01);
      ctx.strokeRect(0, 0, b.wrapWidth, b.contentHeight);
      ctx.setLineDash([]);
      ctx.fillStyle = JOT_INK;
      for (var wi = 0; wi < b.words.length; wi++) {
        var w = b.words[wi];
        if (w.isBreak) continue;
        ctx.save();
        ctx.translate(w.x, w.y);
        ctx.rotate(-w.rotate);
        ctx.scale(w.scale, w.scale);
        ctx.translate(-w.anchor[0], -w.anchor[1]);
        for (var s = 0; s < w.rawStrokes.length; s++) jtFillOutline(ctx, jtOutline(w.rawStrokes[s]));
        ctx.restore();
      }
      ctx.restore();
      var hs = JOT_BOX_HANDLE_SIZE / camera.scale; // kept a roughly constant on-screen size
      ctx.fillStyle = (mode !== "jot") ? "#2563eb" : "rgba(37,99,235,0.7)";
      ctx.fillRect(b.x + b.w - hs / 2, b.y + b.h - hs / 2, hs, hs);
    }
    if (writingWord) { ctx.fillStyle = JOT_INK; for (var ws = 0; ws < writingWord.strokes.length; ws++) jtFillOutline(ctx, jtOutline(writingWord.strokes[ws])); }
    if (current) { ctx.fillStyle = JOT_INK; jtFillOutline(ctx, jtOutline(current.points)); }
  }

  // A Return is stored as its own zero-width "word" (rather than a flag
  // deferred onto whatever gets written next) so it's captured in the
  // actions/words log — and therefore in getJSON()/undo — the instant the
  // gesture fires, and can never be silently lost if nothing follows it.
  function jtBreakWord(id) {
    return { id: id, isBreak: true, rawStrokes: [], anchor: [0, 0], rotate: 0, scale: 1, width: 0, height: JOT_WORD_HEIGHT };
  }

  // Rebuilds boxes/words/ink from the action log (undo). Box moves/resizes
  // are deliberately not part of this log — same as pan/zoom not being
  // undoable — so a box touched by Undo reverts to its authored position
  // and auto-height.
  function rebuildFromActions() {
    // Moves/resizes aren't in the action log, so carry each surviving box's
    // current geometry across the rebuild (otherwise undoing a word would
    // snap its box back to the size/position it was created with).
    var oldGeo = {};
    for (var oi = 0; oi < boxes.length; oi++) { var ob = boxes[oi]; oldGeo[ob.id] = ob; }
    drawStrokes = {}; boxes = [];
    for (var i = 0; i < actions.length; i++) {
      var a = actions[i];
      if (a.type === "add-stroke") drawStrokes[a.id] = { points: a.points, bbox: jtBBox(a.points) };
      else if (a.type === "erase-stroke") delete drawStrokes[a.targetId];
      else if (a.type === "add-box") boxes.push({ id: a.id, x: a.x, y: a.y, wrapWidth: a.wrapWidth, minH: a.minH || 0, contentHeight: a.minH || JOT_BOX_MIN_HEIGHT, w: a.wrapWidth, h: a.minH || JOT_BOX_MIN_HEIGHT, stretched: false, words: [] });
      else if (a.type === "add-word") { var b1 = findBox(a.boxId); if (b1) b1.words.push({ id: a.id, rawStrokes: a.rawStrokes, anchor: a.anchor, rotate: a.rotate, scale: a.scale, width: a.width, height: a.height, dot: !!a.dot }); }
      else if (a.type === "add-break") { var b2 = findBox(a.boxId); if (b2) b2.words.push(jtBreakWord(a.id)); }
      else if (a.type === "erase-word") { var b3 = findBox(a.boxId); if (b3) for (var j = 0; j < b3.words.length; j++) if (b3.words[j].id === a.targetId) { b3.words.splice(j, 1); break; } }
    }
    for (var k = 0; k < boxes.length; k++) {
      var og = oldGeo[boxes[k].id];
      if (og) { var nb2 = boxes[k]; nb2.x = og.x; nb2.y = og.y; nb2.wrapWidth = og.wrapWidth; nb2.minH = og.minH; nb2.stretched = og.stretched; nb2.w = og.w; nb2.h = og.h; }
      relayoutBox(boxes[k]);
    }
  }

  function toLogical(clientX, clientY) {
    var r = canvas.getBoundingClientRect();
    var sx = (clientX - r.left) / r.width * viewportW;
    var sy = (clientY - r.top) / r.height * viewportH;
    return [sx / camera.scale + camera.x, sy / camera.scale + camera.y];
  }

  // The rotation/scale to hand a short (1-2 stroke) word that's about to
  // be finalized — the last real (non-break, non-period) committed word's own (within
  // the active box), so a single letter follows the size and slant of the
  // line it's sitting on instead of leveling/sizing itself off too little
  // ink to do that reliably.
  function jtLastWordRef() {
    var b = activeBox();
    if (!b) return null;
    for (var i = b.words.length - 1; i >= 0; i--) if (!b.words[i].isBreak && !b.words[i].dot) return b.words[i];
    return null;
  }

  function finalizeWord() {
    if (wordPauseTimer) { clearTimeout(wordPauseTimer); wordPauseTimer = null; }
    if (!writingWord || !writingWord.strokes.length) { writingWord = null; return; }
    var b = activeBox();
    if (!b) { writingWord = null; return; }
    var lastWord = jtLastWordRef();
    var t = jtMakeWord(writingWord.strokes, lastWord ? lastWord.rotate : null, lastWord ? lastWord.scale : null);
    var id = nextId++;
    var action = { type: "add-word", id: id, boxId: b.id, rawStrokes: t.rawStrokes, anchor: t.anchor, rotate: t.rotate, scale: t.scale, width: t.width, height: t.height };
    if (t.dot) action.dot = true;
    actions.push(action);
    b.words.push({ id: id, rawStrokes: action.rawStrokes, anchor: action.anchor, rotate: action.rotate, scale: action.scale, width: action.width, height: action.height, dot: !!action.dot });
    relayoutBox(b);
    writingWord = null;
    redraw();
    notifyChange();
  }

  // Takes back the last committed action. Callers deal with an in-progress word first (see jtGestureBackspace).
  function doUndo() {
    actions.pop();
    rebuildFromActions();
    writingWord = null;
    redraw();
    notifyChange();
  }

  // A single-stroke "L" gesture (see jtClassifyGesture) is recognized and
  // consumed entirely on its own completed stroke — it never touches
  // writingWord, so there's nothing to undo there first.
  // Backspace (path set in Parameters): if there's an in-progress (not yet
  // paused/finalized) word, that's what gets discarded — same as
  // backspacing while mid-word in a text editor. Otherwise it's a real Undo
  // of the last committed action (word, stroke, erase, or even a previous
  // Return).
  function jtGestureBackspace() {
    if (wordPauseTimer) { clearTimeout(wordPauseTimer); wordPauseTimer = null; }
    if (writingWord) { writingWord = null; redraw(); notifyChange(); return; }
    doUndo();
  }
  // Return (path set in Parameters): commits whatever preceded the gesture
  // normally, then inserts a hidden line-break marker (see jtBreakWord)
  // immediately — not a flag deferred onto the next word — so it survives a
  // save even if nothing else is written afterward.
  function jtGestureReturn() {
    finalizeWord();
    var b = activeBox();
    if (!b) return;
    var id = nextId++;
    actions.push({ type: "add-break", id: id, boxId: b.id });
    b.words.push(jtBreakWord(id));
    relayoutBox(b);
    notifyChange();
  }

  function hitTest(lx, ly) {
    var pad = PV.jotHitPad;
    var id;
    for (id in drawStrokes) {
      var bx = drawStrokes[id].bbox;
      if (lx >= bx.minX - pad && lx <= bx.maxX + pad && ly >= bx.minY - pad && ly <= bx.maxY + pad) return { kind: "stroke", id: id };
    }
    for (var bi = boxes.length - 1; bi >= 0; bi--) {
      var b = boxes[bi];
      if (lx < b.x - pad || lx > b.x + b.w + pad || ly < b.y - pad || ly > b.y + b.h + pad) continue;
      var sx = b.w / b.wrapWidth, sy = b.h / Math.max(b.contentHeight, 1);
      var localX = (lx - b.x) / sx, localY = (ly - b.y) / sy;
      for (var wi = b.words.length - 1; wi >= 0; wi--) {
        var w = b.words[wi];
        if (w.isBreak) continue;
        if (localX >= w.x - pad && localX <= w.x + w.width + pad && localY >= w.y - w.height - pad && localY <= w.y + pad) return { kind: "word", boxId: b.id, id: w.id };
      }
    }
    return null;
  }

  function eraseAt(lx, ly) {
    var hit = hitTest(lx, ly);
    if (!hit) return;
    if (hit.kind === "stroke") { delete drawStrokes[hit.id]; actions.push({ type: "erase-stroke", targetId: hit.id }); }
    else {
      var b = findBox(hit.boxId);
      if (b) { for (var j = 0; j < b.words.length; j++) if (b.words[j].id === hit.id) { b.words.splice(j, 1); break; } relayoutBox(b); }
      actions.push({ type: "erase-word", boxId: hit.boxId, targetId: hit.id });
    }
    redraw();
    notifyChange();
  }

  function onDown(e) {
    activePointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = pointerIds();
    // Two or more simultaneous touches are always a pinch/pan on the camera,
    // no matter which tool is selected. Previously this pinch/pan handling
    // only ran when no tool was active ("mode" falsy) — pinching while
    // Draw/Jot was selected instead fed both fingers in as two independent,
    // interleaved strokes: in Draw that showed up as a single garbled stroke
    // sweeping the screen (looking like "the whole page zooms"), and in Jot,
    // that stroke got picked up as a "word" whose huge/tiny bounding box
    // then drove its rendered scale — the word-size-changes-and-rewraps bug.
    // Reserving 2+ pointers for camera control fixes both: pinch always
    // zooms the camera, ink is only ever drawn by a single active pointer.
    if (ids.length >= 2) {
      if (current) { current = null; redraw(); }
      erasing = false;
      panState = null; boxDragState = null; boxResizeState = null;
      var downIds = ids.slice(0, 2);
      var mid = pointerMidpoint(downIds);
      pinchState = { dist: pointerDistance(downIds), anchorDoc: toLogical(mid.x, mid.y) };
      return;
    }
    if (placingBox) {
      // + button armed: this tap only places the box (no ink), then the box is
      // the active one in Jot mode so the next stroke is written into it.
      finalizeWord();
      var nb = createBoxAt(toLogical(e.clientX, e.clientY), true);
      activeBoxId = nb.id;
      placingBox = false;
      mode = "jot";
      syncToolbar();
      redraw();
      notifyChange();
      return;
    }
    if (!mode) {
      // No tool selected: this is also the "arrange" state — a box's body
      // moves it, its corner handle resizes it (text scales, no rewrap; see
      // bakeBox() for what happens when Jot mode resumes editing it).
      // Otherwise, single-finger panning of the camera, same as before.
      var p0 = toLogical(e.clientX, e.clientY);
      var handleBox = hitTestBoxHandle(p0);
      if (handleBox) {
        canvas.setPointerCapture(e.pointerId);
        boxResizeState = { box: handleBox, startW: handleBox.w, startH: handleBox.h, startX: p0[0], startY: p0[1] };
        pinchState = null;
        return;
      }
      var bodyBox = hitTestBoxBody(p0);
      if (bodyBox) {
        canvas.setPointerCapture(e.pointerId);
        boxDragState = { box: bodyBox, offsetX: p0[0] - bodyBox.x, offsetY: p0[1] - bodyBox.y };
        pinchState = null;
        return;
      }
      panState = { x: e.clientX, y: e.clientY };
      pinchState = null;
      return;
    }
    canvas.setPointerCapture(e.pointerId);
    var p = toLogical(e.clientX, e.clientY);
    var pressure = e.pointerType === "mouse" ? PV.jotDefaultPressure : (e.pressure || PV.jotDefaultPressure);
    if (mode === "erase") { erasing = true; eraseAt(p[0], p[1]); return; }
    if (mode === "jot") {
      // Tapping inside an existing box continues writing into it (baking in
      // any manual resize it picked up while Jot mode was off). Tapping empty
      // canvas keeps writing into the selected box; boxes are only created
      // with the + button.
      var jotHandleBox = hitTestBoxHandle(p);
      if (jotHandleBox) {
        // Corner handle in Jot mode: resizing changes the box's wrap width
        // (and minimum height), so the text re-wraps live as it's dragged.
        finalizeWord();
        activeBoxId = jotHandleBox.id;
        if (jotHandleBox.stretched) bakeBox(jotHandleBox);
        boxResizeState = { box: jotHandleBox, startW: jotHandleBox.w, startH: jotHandleBox.h, startX: p[0], startY: p[1], wrap: true };
        return;
      }
      var target = hitTestBoxBody(p);
      if (target) {
        if (activeBoxId !== target.id) { finalizeWord(); activeBoxId = target.id; }
        // Bake regardless of whether this was already the active box — it
        // may have been stretched (outside Jot mode) since it was last
        // written into, even without activeBoxId ever changing.
        if (target.stretched) bakeBox(target);
      } else if (!activeBox()) {
        // No box selected: nothing to write into.
        finalizeWord();
        return;
      }
      // else: the selected box stays the write target even when the stroke
      // lands outside its outline (a 1-line box is easy to write past) — the
      // word is normalized into the box once it's finalized.
      // Starting a new stroke always cancels any pending "finalize the word
      // on pause" timer — otherwise a slightly-longer-than-usual pause
      // before the next letter (very common right at the start of a word,
      // while repositioning) can fire mid-stroke and split the word right as
      // the user keeps writing it.
      if (wordPauseTimer) { clearTimeout(wordPauseTimer); wordPauseTimer = null; }
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
    if (boxResizeState) {
      var pr = toLogical(e.clientX, e.clientY);
      var rb = boxResizeState.box;
      if (boxResizeState.wrap) {
        rb.wrapWidth = Math.max(JOT_BOX_MIN_WIDTH, boxResizeState.startW + (pr[0] - boxResizeState.startX));
        rb.minH = Math.max(JOT_BOX_MIN_HEIGHT, boxResizeState.startH + (pr[1] - boxResizeState.startY));
        rb.stretched = false;
        relayoutBox(rb);
      } else {
        rb.w = Math.max(JOT_BOX_MIN_WIDTH, boxResizeState.startW + (pr[0] - boxResizeState.startX));
        rb.h = Math.max(JOT_BOX_MIN_HEIGHT, boxResizeState.startH + (pr[1] - boxResizeState.startY));
        rb.stretched = true;
      }
      redraw();
      e.preventDefault();
      return;
    }
    if (boxDragState) {
      var pd = toLogical(e.clientX, e.clientY);
      var db = boxDragState.box;
      db.x = pd[0] - boxDragState.offsetX;
      db.y = pd[1] - boxDragState.offsetY;
      redraw();
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
    if (boxResizeState) { boxResizeState = null; notifyChange(); return; }
    if (boxDragState) { boxDragState = null; notifyChange(); return; }
    panState = (!mode && ids.length === 1) ? { x: activePointers[ids[0]].x, y: activePointers[ids[0]].y } : null;
    if (!mode) return;
    if (pinchState) return; // still mid-pinch (a 3rd+ finger lifted) — not the end of a stroke
    if (mode === "erase") { erasing = false; return; }
    if (!current) return;
    var stroke = current;
    current = null;
    if (stroke.points.length < 2) stroke.points.push([stroke.points[0][0] + 0.1, stroke.points[0][1] + 0.1, stroke.points[0][2]]);
    if (mode === "jot") {
      // A single-stroke L-shaped command (see jtClassifyGesture) is checked
      // before treating the stroke as ink — a real command never gets added
      // to the word as a stray mark.
      var gestureCmd = jtClassifyGesture(stroke.points, camera.scale);
      if (gestureCmd === "backspace") { jtGestureBackspace(); redraw(); return; }
      if (gestureCmd === "return") { jtGestureReturn(); redraw(); return; }

      var bbox = jtBBox(stroke.points);
      var pauseMs = lastStrokeUpAt ? Math.max(0, strokeDownAt - lastStrokeUpAt) : Infinity;
      lastStrokeUpAt = performance.now();
      var gapMm = writingWord ? jtBBoxGap(writingWord.bbox, bbox) * camera.scale / JOT_PX_PER_MM : Infinity;
      var joins = !!writingWord && !jtStartsNewWord(pauseMs, gapMm);
      toolbar.querySelector(".jt-wordinfo").textContent = writingWord
        ? (pauseMs / 1000).toFixed(2) + "s · " + gapMm.toFixed(1) + "mm · " + (joins ? "same word" : "NEW word")
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
      notifyChange();
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
  // — the viewport center by default — fixed on screen.
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
    var nbBtn = toolbar.querySelector('[data-act="newbox"]');
    if (nbBtn) nbBtn.classList.toggle("armed", placingBox);
    canvas.style.outline = placingBox ? "2px dashed #2563eb" : "";
    canvas.style.outlineOffset = "-2px";
  }

  toolbar.addEventListener("click", function(e) {
    var btn = e.target.closest(".jt-btn");
    if (!btn) return;
    var m = btn.getAttribute("data-mode");
    if (m) {
      finalizeWord();
      mode = (mode === m) ? null : m;
      // The selected box lasts exactly as long as Jot mode: leaving it (to
      // Draw/Erase/none) deselects, so re-entering means picking a box again.
      if (mode !== "jot") activeBoxId = null;
      placingBox = false;
      syncToolbar();
      redraw();
      return;
    }
    var act = btn.getAttribute("data-act");
    if (act === "newbox") {
      // Arm placement (tap again to cancel). Jot mode is switched on so the
      // new box can be written into straight away.
      finalizeWord();
      placingBox = !placingBox;
      if (placingBox) mode = "jot";
      syncToolbar();
      redraw();
      return;
    }
    // Same rule as the Backspace gesture: a word still being written goes first;
    // only when there is none does Undo take back the last committed action.
    if (act === "undo") jtGestureBackspace();
    else if (act === "zoomin") setZoom(camera.scale * PV.jotZoomStep);
    else if (act === "zoomout") setZoom(camera.scale / PV.jotZoomStep);
    else if (act === "zoomreset") setZoom(1);
    else if (act === "clear") { finalizeWord(); actions = []; drawStrokes = {}; boxes = []; activeBoxId = null; camera.x = 0; camera.y = 0; setZoom(1); redraw(); notifyChange(); }
  });

  redraw();

  return {
    clear: function() { finalizeWord(); actions = []; drawStrokes = {}; boxes = []; activeBoxId = null; camera.x = 0; camera.y = 0; camera.scale = 1; updateZoomLabel(); updateDocWidth(); redraw(); },
    isEmpty: function() { return actions.length === 0 && !writingWord; },
    getJSON: function() {
      finalizeWord();
      var ds = [], id;
      for (id in drawStrokes) ds.push({ id: id, points: drawStrokes[id].points });
      var bs = boxes.map(function(b) {
        return {
          id: b.id, x: b.x, y: b.y, wrapWidth: b.wrapWidth, minH: b.minH || 0, w: b.w, h: b.h, stretched: b.stretched,
          words: b.words.map(function(w) { return w.isBreak ? { id: w.id, isBreak: true } : { id: w.id, rawStrokes: w.rawStrokes, anchor: w.anchor, rotate: w.rotate, scale: w.scale, width: w.width, height: w.height, dot: !!w.dot }; })
        };
      });
      return { v: 2, canvasWidth: DOC_WIDTH, drawStrokes: ds, boxes: bs };
    },
    getSVG: function() {
      finalizeWord();
      var maxY = JOT_PARA_TOP, maxX = DOC_WIDTH;
      var id;
      for (id in drawStrokes) { maxY = Math.max(maxY, drawStrokes[id].bbox.maxY); maxX = Math.max(maxX, drawStrokes[id].bbox.maxX); }
      for (var i = 0; i < boxes.length; i++) { var bx = boxes[i]; maxY = Math.max(maxY, bx.y + bx.h + 10); maxX = Math.max(maxX, bx.x + bx.w + 10); }
      var h = Math.ceil(maxY + 20);
      var wSvg = Math.ceil(maxX);
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + wSvg + ' ' + h + '" width="' + wSvg + '" height="' + h + '"><rect width="100%" height="100%" fill="#1e1e1e"/>';
      for (id in drawStrokes) svg += jtOutlineToPath(jtOutline(drawStrokes[id].points));
      for (i = 0; i < boxes.length; i++) {
        var b = boxes[i];
        var sx = b.w / b.wrapWidth, sy = b.h / Math.max(b.contentHeight, 1);
        svg += '<g transform="translate(' + b.x.toFixed(2) + ',' + b.y.toFixed(2) + ') scale(' + sx.toFixed(4) + ',' + sy.toFixed(4) + ')">';
        for (var wi = 0; wi < b.words.length; wi++) {
          var w = b.words[wi];
          if (w.isBreak) continue;
          var deg = (-w.rotate * 180 / Math.PI).toFixed(2);
          svg += '<g transform="translate(' + w.x.toFixed(2) + ',' + w.y.toFixed(2) + ') rotate(' + deg + ') scale(' + w.scale.toFixed(4) + ') translate(' + (-w.anchor[0]).toFixed(2) + ',' + (-w.anchor[1]).toFixed(2) + ')">';
          for (var s = 0; s < w.rawStrokes.length; s++) svg += jtOutlineToPath(jtOutline(w.rawStrokes[s]));
          svg += '</g>';
        }
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
      drawStrokes = {}; boxes = []; activeBoxId = null;
      if (data && data.drawStrokes) for (var i = 0; i < data.drawStrokes.length; i++) {
        var d = data.drawStrokes[i];
        actions.push({ type: "add-stroke", id: d.id, points: d.points });
        drawStrokes[d.id] = { points: d.points, bbox: jtBBox(d.points) };
        if (nextId <= Number(d.id)) nextId = Number(d.id) + 1;
      }
      if (data && data.boxes) {
        for (var j = 0; j < data.boxes.length; j++) {
          var bd = data.boxes[j];
          actions.push({ type: "add-box", id: bd.id, x: bd.x, y: bd.y, wrapWidth: bd.wrapWidth, minH: bd.minH || 0 });
          var b = { id: bd.id, x: bd.x, y: bd.y, wrapWidth: bd.wrapWidth, minH: bd.minH || 0, contentHeight: bd.minH || JOT_BOX_MIN_HEIGHT, w: bd.w || bd.wrapWidth, h: bd.h || bd.minH || JOT_BOX_MIN_HEIGHT, stretched: !!bd.stretched, words: [] };
          boxes.push(b);
          if (nextId <= Number(bd.id)) nextId = Number(bd.id) + 1;
          if (bd.words) for (var k = 0; k < bd.words.length; k++) {
            var w = bd.words[k];
            if (w.isBreak) {
              actions.push({ type: "add-break", id: w.id, boxId: b.id });
              b.words.push(jtBreakWord(w.id));
            } else {
              actions.push({ type: "add-word", id: w.id, boxId: b.id, rawStrokes: w.rawStrokes, anchor: w.anchor, rotate: w.rotate, scale: w.scale, width: w.width, height: w.height, dot: !!w.dot });
              b.words.push({ id: w.id, rawStrokes: w.rawStrokes, anchor: w.anchor, rotate: w.rotate, scale: w.scale, width: w.width, height: w.height, dot: !!w.dot });
            }
            if (nextId <= Number(w.id)) nextId = Number(w.id) + 1;
          }
          relayoutBox(b);
        }
      } else if (data && data.words && data.words.length) {
        // Legacy (v1) content: a single flat page of handwritten words with
        // no boxes — migrate it into one implicit box so old saved notes
        // keep showing instead of disappearing.
        for (var mi = 0; mi < data.words.length; mi++) if (nextId <= Number(data.words[mi].id)) nextId = Number(data.words[mi].id) + 1;
        var legacyWidth = Math.max(jotDefaultBoxWidth(), data.canvasWidth || jotDefaultBoxWidth());
        var lb = { id: nextId++, x: JOT_PARA_MARGIN, y: JOT_PARA_MARGIN, wrapWidth: legacyWidth, contentHeight: JOT_BOX_MIN_HEIGHT, w: legacyWidth, h: JOT_BOX_MIN_HEIGHT, stretched: false, words: [] };
        boxes.push(lb);
        actions.push({ type: "add-box", id: lb.id, x: lb.x, y: lb.y, wrapWidth: lb.wrapWidth });
        for (var m = 0; m < data.words.length; m++) {
          var lw = data.words[m];
          if (lw.isBreak) {
            actions.push({ type: "add-break", id: lw.id, boxId: lb.id });
            lb.words.push(jtBreakWord(lw.id));
          } else {
            actions.push({ type: "add-word", id: lw.id, boxId: lb.id, rawStrokes: lw.rawStrokes, anchor: lw.anchor, rotate: lw.rotate, scale: lw.scale, width: lw.width, height: lw.height });
            lb.words.push({ id: lw.id, rawStrokes: lw.rawStrokes, anchor: lw.anchor, rotate: lw.rotate, scale: lw.scale, width: lw.width, height: lw.height });
          }
        }
        relayoutBox(lb);
      }
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
  liveJot = createJot(host, scheduleCallSave);
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
  el.innerHTML = '<div class="empty">Loading…</div>';
  fetch(API + "/call-history?limit=" + PV.callPanelHistoryLimit + "&q=" + encodeURIComponent(num)).then(function(r){return r.json();}).then(function(d){
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

// Last 100 emails for the identified caller — reuses the same /messages
// endpoint, row renderer, and cache as the full-screen Messages view
// (loadMessages/renderMessageRow below), filtered down to Gmail-sourced
// entries only (that endpoint also returns Odoo's internal mail.message
// notes, which aren't "emails"). Tapping a row opens it straight away —
// no select-then-tap-again dance, since this is a quick glance mid-call
// rather than the full Messages screen's reply/compose workflow.
function loadEmailsTab() {
  var el = document.getElementById("cp-pane-emails");
  if (!currentCallPartner) { el.innerHTML = '<div class="empty">No matching contact yet</div>'; return; }
  el.innerHTML = '<div class="empty">Loading…</div>';
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
  document.getElementById("dial-suggestions").classList.toggle("hidden", !q);
  document.getElementById("dial-recent-list").classList.toggle("hidden", !!q || !!currentCall);
  if (suggestTimer) clearTimeout(suggestTimer);
  suggestTimer = setTimeout(function() { searchSuggestions(q); }, PV.suggestDebounceMs);
}
function searchSuggestions(q) {
  var el = document.getElementById("dial-suggestions");
  if (!q) { el.innerHTML = ""; return; }
  fetch(API + "/contacts?q=" + encodeURIComponent(q) + "&limit=" + PV.suggestionsLimit).then(function(r){return r.json();}).then(function(d){
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
// Combined color+direction indicator: ▲ outgoing / ▼ incoming, colored green
// (completed in), blue (completed out), or red (missed/rejected/aborted).
function dirIcon(dir, missed) {
  var shape = dir === "out" ? "▲" : "▼";
  var cls = missed ? "missed" : dir;
  return '<span class="dir-ic ' + cls + '">' + shape + '</span>';
}

// ── dial view: recent calls (tap to load into the input for redial) ────
var dialRecentCache = {};
function loadDialRecent() {
  var el = document.getElementById("dial-recent-list");
  fetch(API + "/call-history?limit=" + PV.recentCallsLimit).then(function(r){return r.json();}).then(function(d){
    var calls = d.calls || [];
    if (!calls.length) { el.innerHTML = '<div class="empty">No recent calls</div>'; return; }
    dialRecentCache = {};
    el.innerHTML = calls.map(function(c) {
      var dir = c.direction === "outgoing" ? "out" : "in";
      var missed = c.state === "missed" || c.state === "rejected" || c.state === "aborted";
      var name = (c.partner_name || "").trim();
      var num = (c.phone_number && c.phone_number !== "unknown") ? String(c.phone_number) : (c.did || "unknown");
      var who = name || num;
      var when = c.start_date ? fmtTime(c.start_date) : "";
      var key = "r-" + c.id;
      dialRecentCache[key] = num;
      return '<div class="dial-recent-row" data-key="' + esc(key) + '">' + dirIcon(dir, missed) + '<span class="who">' + esc(who) + '</span><span class="meta">' + when + '</span></div>';
    }).join("");
  }).catch(function(){ el.innerHTML = ""; });
}
document.getElementById("dial-recent-list").addEventListener("click", function(e) {
  var row = e.target.closest(".dial-recent-row");
  if (!row) return;
  var num = dialRecentCache[row.getAttribute("data-key")];
  if (!num || num === "unknown") return;
  document.getElementById("dial-input").value = num;
  onDialInput();
});

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
  // Asterisk strips the leading "+" from caller ID (see caller-lookup /
  // history), so a redialled/history number often arrives here as bare
  // digits with the country code already included (e.g. "441283246490")
  // instead of "+441283246490". Left alone, that reaches the trunk
  // unnormalized and gets rejected outright (voip.ms: 403, Twilio: 400
  // Invalid phone number) instead of ringing. Only real international
  // numbers are this long — short internal extensions (200/201/202) and
  // feature codes are never mistaken for one.
  else if (!num.startsWith("+") && num.length > 6) num = "+" + num;
  if (!sipUA) { setStatus("❌ Not registered", true); return; }
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
    // established — before that (Initial/Establishing, i.e. our "ringing"
    // or "calling" state) it's a silent local no-op that never reaches the
    // far end, so a still-ringing call would just keep ringing there.
    // Incoming needs a proper decline (reject, a SIP rejection response);
    // outgoing needs a proper cancel (a SIP CANCEL of the pending INVITE).
    // The dialplan rings 200/201/202 in parallel (Dial(PJSIP/200&PJSIP/201&
    // PJSIP/202,30)) — a default reject() sends 480 (Temporarily
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
  loadDialRecent();
}
// The dialpad is only useful before a call connects (dialing) or as an
// explicit DTMF overlay during one (see toggleInCallKeypad) — once
// connected it defaults to hidden so the in-call tabs (call-panel) get the
// screen space instead.
var keypadOverlayOpen = false;
function toggleInCallKeypad() {
  if (!inCall()) return;
  keypadOverlayOpen = !keypadOverlayOpen;
  updateDialBottomVisibility();
}
function updateDialBottomVisibility() {
  // Keypad (+ recent calls, + the plain call button) hides for the whole
  // life of a call — ringing/dialling included, not just once connected —
  // so the in-call tabs showing who it is take over the screen right away.
  // The DTMF overlay (banner-keypad) is the one exception: it's only
  // meaningful, and only offered, once the call is actually connected.
  var inAnyCall = !!currentCall;
  var connected = !!(currentCall && currentCall.state === "active");
  document.getElementById("nav-dial").classList.toggle("in-call", inAnyCall);
  document.getElementById("nav-dial").setAttribute("aria-label", inAnyCall ? "Hang up" : "Dial");
  document.getElementById("dialpad").classList.toggle("hidden", inAnyCall ? !keypadOverlayOpen : !dialKeypadOpen);
  document.getElementById("dial-callbar").classList.toggle("hidden", inAnyCall);
  document.getElementById("dial-recent-list").classList.toggle("hidden", inAnyCall);
  document.getElementById("banner-keypad").classList.toggle("hidden", !connected);
  document.getElementById("banner-keypad").classList.toggle("active", connected && keypadOverlayOpen);
}
function renderCallUI() {
  var banner = document.getElementById("call-banner");
  var btnCall = document.getElementById("btn-call");
  var btnEnd = document.getElementById("btn-end");
  if (!currentCall) {
    banner.classList.add("hidden");
    btnCall.classList.remove("hidden"); btnCall.classList.remove("hangup");
    btnEnd.classList.add("hidden");
    keypadOverlayOpen = false;
    showCallPanel(false);
    updateDialBottomVisibility();
    return;
  }
  banner.classList.remove("hidden");
  document.getElementById("banner-remote").textContent = currentCall.remote;
  var si = { ringing: "🔔 Incoming…", calling: "📞 Calling…", active: "🔊 Connected" }[currentCall.state] || currentCall.state;
  document.getElementById("banner-state").textContent = (currentCall.dir === "in" ? "⬇ " : "⬆ ") + si;
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

// ── history ────────────────────────────────────────────────────
var historyTimer = null;
function loadHistory() {
  var q = document.getElementById("history-search").value.trim();
  var el = document.getElementById("history-list");
  el.innerHTML = '<div class="empty">Loading…</div>';
  fetch(API + "/call-history?limit=" + PV.historyLimit + "&q=" + encodeURIComponent(q)).then(function(r){return r.json();}).then(function(d){
    var calls = d.calls || [];
    if (!calls.length) { el.innerHTML = '<div class="empty">' + (q ? "No matching calls" : "No calls yet") + '</div>'; return; }
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
function renderHistoryRow(c) {
  var dir = c.direction === "outgoing" ? "out" : "in";
  var missed = c.state === "missed" || c.state === "rejected" || c.state === "aborted";
  var name = (c.partner_name || "").trim();
  var num = (c.phone_number && c.phone_number !== "unknown") ? String(c.phone_number) : (c.did || "unknown");
  var who = name || num;
  var sub = name ? num : (c.did && c.did !== num ? "→ " + c.did : "");
  var dur = (c.duration > 0) ? " · " + fmtDur(c.duration) : "";
  var when = c.start_date ? fmtTime(c.start_date) : "";
  var notesFlag = c.has_notes ? ' <span title="Has notes">📝</span>' : "";
  var key = "h-" + c.id;
  callsCache[key] = c;
  return '<div class="hist-row" data-key="' + esc(key) + '">'
    + '<div class="hist-main">' + dirIcon(dir, missed) + '<div><div class="who">' + esc(who) + notesFlag + '</div>' + (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') + '</div><div class="meta">' + when + dur + '</div></div>'
    + '</div>';
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
  historyTimer = setTimeout(loadHistory, PV.historyDebounceMs);
});
document.getElementById("history-list").addEventListener("click", function(e) {
  var row = e.target.closest(".hist-row");
  if (!row) return;
  var key = row.getAttribute("data-key");
  var c = callsCache[key];
  if (!c) return;
  // Selecting is all a tap does; the toolbar above the list acts on the selection.
  if (row.classList.contains("selected")) deselect(); else selectItem("call", c, key);
});
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
  fetch(API + "/contacts/" + id).then(function(r) { return r.json(); }).then(function(d) {
    if (!d || !d.contact) return;
    selectItem("contact", d.contact, "hc-" + d.contact.id);
    openContactFull(d.contact);
  }).catch(function() {});
}
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
  fetch(API + "/contacts/cache?q=" + encodeURIComponent(q) + "&limit=" + PV.contactsLimit).then(function(r){return r.json();}).then(function(d){
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
  onDialInput();
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
  switchView("call-detail");
  switchCallDetailTab("jot");
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
  document.getElementById("cd-notes").addEventListener("input", function() { scheduleCallDetailSave(); });
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
    setup: function(editor) {
      editor.on("init", function() { editor.setContent(html || ""); });
      editor.on("input change undo redo", scheduleCallDetailSave);
    }
  });
}

function initCallDetailJot() {
  var host = document.getElementById("cd-jot-canvas");
  if (!host) return;
  cdJot = createJot(host, scheduleCallDetailSave);
  if (cdJotData) cdJot.loadJSON(cdJotData);
}

function destroyCallDetailEditors() {
  flushCallDetailSave();
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
// scheduleCallSave) — no separate save action for the user to press.
var cdSaveTimer = null;
function scheduleCallDetailSave() {
  if (!cdOpenCallId) return;
  setCallDetailSaveStatus("Saving…");
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
  var callId = cdOpenCallId;
  fetch(API + "/call-notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ call_id: callId, notes_html: notesHtml, jot_svg: jotSvg, jot_json: jotJson })
  }).then(function(r) { return r.json(); }).then(function(d) {
    if (d.ok) {
      if (cdOpenCallId === callId) cdLoadedNotes = { notes_html: notesHtml, jot_svg: jotSvg, jot_json: jotJson };
      setCallDetailSaveStatus("Saved ✓");
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
    fetch(API + "/messages/recent?days=" + PV.recentMessagesDays + "&limit=" + PV.recentMessagesLimit).then(function(r){return r.json();}).then(function(d){
      var msgs = d.messages || [];
      if (!msgs.length) { el.innerHTML = '<div class="empty">No emails in the last week</div>'; return; }
      el.innerHTML = msgs.map(function(m) { return renderMessageRow(m); }).join("");
    }).catch(function(){ el.innerHTML = '<div class="empty">Error loading emails</div>'; });
    return;
  }
  document.getElementById("msg-title").textContent = "💬 " + activeContact.name;
  el.innerHTML = '<div class="empty">Downloading messages…</div>';
  messagesCache = {};
  fetch(API + "/messages?contact=" + encodeURIComponent(activeContact.id) + "&limit=" + PV.contactMessagesLimit).then(function(r){return r.json();}).then(function(d){
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

// ── PWA install ──────────────────────────────────────────────
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
  // No beforeinstallprompt support (iOS Safari) — show manual instructions.
  document.getElementById("install-tip").classList.remove("hidden");
}
function menuInstallApp() {
  document.getElementById("menu-drawer").classList.add("hidden");
  installApp();
}
function dismissInstallTip() {
  document.getElementById("install-tip").classList.add("hidden");
}
(function() {
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (isIOS && !isStandalone()) showInstallButtons();
})();

// ── menu + settings ────────────────────────────────────────────
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
  setStatus("💾 Saved — reconnect to apply", false);
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
  // name — editing an account's credentials without also updating its
  // display name (e.g. switching a device from extension 201 to 202)
  // previously left the header showing the old extension, looking like
  // the switch hadn't taken effect even though it had.
  var label = a.name || "";
  var extTag = "Ext " + (a.username || "?");
  document.getElementById("acc-name-display").textContent = label && label.indexOf(a.username) === -1 ? label + " (" + extTag + ")" : (label || extTag);
  document.getElementById("acc-caller-display").textContent = "Caller ID: " + (a.callerId || "—");
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
// One shared <audio> element for the remote party. Built from the receiver's
// track rather than only from the "track" event, because on an incoming call
// that event fires the instant the call is answered (often before we hook it)
// and the offer may carry no stream id, leaving evt.streams empty — either way
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

// ── Android app (Capacitor) push registration ──────────────────
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
  if (typeof SIP === "undefined") { setStatus("❌ sip.js missing", true); return; }
  var acc = activeAccount();
  if (!acc) { setStatus("❌ No SIP account configured", true); return; }
  updateAccountHeader();
  setStatus("Connecting…", false);
  try {
    sipUA = new SIP.UserAgent({
      uri: SIP.UserAgent.makeURI("sip:" + acc.username + "@" + (acc.domain || PV.defaultDomain)),
      transportOptions: { server: acc.server || DEFAULT_WS },
      authorizationUsername: acc.username,
      authorizationPassword: acc.password,
      sessionDescriptionHandlerFactoryOptions: { constraints: { audio: true, video: false } }
    });
  } catch(e) { setStatus("❌ Init: " + e.message, true); return; }

  var registerer = new SIP.Registerer(sipUA, { expires: 3600 });
  registerer.stateChange.on(function(state) {
    if (state === SIP.RegistererState.Registered) { clearTimeout(regTimer); setStatus("✅ Registered", false); registerPush(); }
    else if (state === SIP.RegistererState.Unregistered) { clearTimeout(regTimer); setStatus("❌ Unregistered", true); }
    else setStatus("⏳ " + state, false);
  });

  sipUA.delegate = {
    onInvite: function(inv) {
      // Already ringing or on a call — send the same 486 (Busy Here) a
      // hardware desk phone's firmware would send automatically. The
      // dialplan turns that into DIALSTATUS=BUSY and routes to voicemail
      // instead of just failing the call; this session's own active call
      // is left completely untouched.
      if (currentCall) { inv.reject({ statusCode: 486 }).catch(function() {}); return; }
      // Call reached the page — drop the native "incoming call" notification
      // (it would keep ringing over the in-page ringtone otherwise).
      var PN = nativePush();
      if (PN && PN.removeAllDeliveredNotifications) PN.removeAllDeliveredNotifications().catch(function() {});
      sipSession = inv;
      currentCall = { id: inv.request.callId, dir: "in", remote: inv.remoteIdentity.uri.user || inv.remoteIdentity.displayName, state: "ringing" };
      renderCallUI();
      logCallEvent("ring");
      startRingtone();
      if (consumeAutoAnswer()) setTimeout(function() { if (currentCall && currentCall.state === "ringing") answerCall(); }, PV.autoAnswerDelayMs);
      inv.stateChange.on(function(state) {
        if (state === SIP.SessionState.Established) { stopRingtone(); ensureRemoteAudio(inv); currentCall.state = "active"; currentCall.answeredAt = Date.now(); renderCallUI(); logCallEvent("answer"); }
        if (state === SIP.SessionState.Terminated) { stopRingtone(); logHangup(); resetCall(); }
      });
      // Remote audio is attached once actually answered (see answerCall) —
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
    setStatus("❌ Server unreachable (timeout)", true);
    try { sipUA.stop(); } catch (e) {}
    sipUA = null;
  }, REG_TIMEOUT_MS);
}

// ── boot ───────────────────────────────────────────────────────
function applyBoot() {
  updateAccountHeader();
  loadDialRecent();
  if (settings.devMode) { setStatus("🛠 Dev mode", false); return; }
  loadSipJs().then(initSoftphone).catch(function(e) { setStatus("❌ " + e.message, true); });
}
applyAllParams();
var bootStarted = false;
function applyBootOnce() { if (bootStarted) return; bootStarted = true; applyBoot(); }
function boot() {
  // Merge server-side settings (D1) over localStorage, then start. SIP
  // accounts/activeAccount are deliberately excluded — those are per-device
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
}
document.addEventListener("DOMContentLoaded", boot);
</script>
</body>
</html>`;
  return new Response(html, { headers: { "Content-Type": "text/html;charset=utf-8", "Cache-Control": "no-store, no-cache, must-revalidate" } });
}
