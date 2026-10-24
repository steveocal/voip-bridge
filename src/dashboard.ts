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
.loc-box{border-top:1px solid #333;margin:4px 0 10px;padding-top:8px}
.loc-box .loc-title{font-size:13px;font-weight:600;margin-bottom:6px}
.loc-box .loc-row{display:flex;gap:6px;align-items:center;margin-bottom:6px}
.loc-box select,.loc-box input{flex:1;min-width:0}
.loc-box button{padding:6px 10px;border-radius:6px;border:1px solid #444;background:#2a2a2a;color:inherit;font-size:13px}
.loc-box .loc-status{font-size:12px;color:#999;line-height:1.5}
.loc-box .loc-warn{color:#e0a030}
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
/* voicemail */
.vm-sync{font-size:12px;color:#34d399;margin:2px 0 10px}
.vm-sync.pending{color:#f0a33c}
.vm-head{font-size:11px;font-weight:700;letter-spacing:.5px;color:#f0a33c;text-transform:uppercase;padding:14px 0 6px;border-bottom:1px solid #2c2c2c}
.vm-row{display:flex;align-items:center;gap:8px;padding:8px 2px;border-bottom:1px solid #1c1c1c}
.vm-row.active{background:#10241b;border-radius:10px}
.vm-row input[type=radio]{width:18px;height:18px;flex-shrink:0;accent-color:#34d399;margin:0 2px}
.vm-name{flex:1;min-width:0;font-size:14px}
input.vm-name{padding:7px 8px;border:none;border-radius:8px;background:#1a1a1a;color:#fff;outline:none}
.vm-stock{color:#ccc;padding:7px 0}
.vm-dur{font-size:12px;color:#999;flex-shrink:0}
.vm-row .hist-play{margin-left:0}
.vm-del{background:none;border:none;font-size:15px;cursor:pointer;padding:4px;flex-shrink:0;opacity:.8}
.vm-del.armed{background:#3f1d1d;border-radius:8px;opacity:1;font-size:12px;color:#fca5a5}
.vm-add{display:flex;gap:8px;margin-top:12px}
.vm-add button{flex:1;padding:11px;border:none;border-radius:10px;background:#2c2c2c;color:#ececec;font-size:14px;cursor:pointer}
.vm-add button.rec{background:#7f1d1d;color:#fff}
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

  <div class="install-tip hidden" id="update-tip">
    <span id="update-text"></span>
    <button onclick="dismissAppUpdate()" aria-label="Dismiss">✕</button>
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
      <div class="hist-toolbar" id="hist-toolbar">
        <button class="green" data-action="call" onclick="histAction('call')" disabled>📞 Call</button>
        <button data-action="email" onclick="histAction('email')" disabled>✉️ Email</button>
        <button data-action="details" onclick="histAction('details')" disabled>📄 Details</button>
        <button data-action="contact" onclick="histAction('contact')" disabled>👤 Contact</button>
      </div>
      <div class="dial-scroll" id="history-list"><div class="empty">Loading…</div></div>
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
          <button class="hist-tx-btn" id="hist-tx-btn" onclick="toggleTranscriptSearch()" title="Search call transcripts">💬</button>
          <button class="backspace" onclick="backspace()">⌫</button>
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
          <button class="call-btn" id="btn-call" onclick="dialAction()">📞</button>
          <button class="call-btn hangup hidden" id="btn-end" onclick="hangup()">📴</button>
        </div>
      </div>
    </div>

    <!-- PARAMETERS VIEW (opened from the menu) -->
    <div class="view hidden" id="view-voicemail">
      <div class="p-head">
        <button class="cd-back" onclick="closeVoicemail()" aria-label="Back">←</button>
        <div class="cd-title"><strong>Voicemail</strong></div>
        <span class="jot-status" id="vm-status"></span>
      </div>
      <div class="vm-sync" id="vm-sync"></div>
      <div class="switch-row">
        <span>Straight to voicemail<div class="p-note">Phones don't ring; every caller hears the greeting.</div></span>
        <label class="switch"><input type="checkbox" id="vm-direct" onchange="setVmDirect(this.checked)"><span class="track"></span></label>
      </div>
      <div class="vm-head">Greeting</div>
      <div id="vm-list"><div class="empty">Loading…</div></div>
      <div class="vm-add">
        <button id="vm-rec-btn" onclick="toggleVmRecording()">🎙 Record</button>
        <button onclick="document.getElementById('vm-file').click()">⬆ Upload audio</button>
      </div>
      <input type="file" id="vm-file" accept="audio/*" class="hidden">
      <div class="p-foot"><div class="p-note">Calls nobody answers within 45s, or that hit busy phones, go to voicemail. Messages appear in History with ▶ and a transcript.</div></div>
    </div>

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
        <div class="p-note">Saved automatically, on this device only. Jot values apply to Jot pages opened afterwards.</div>
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
        <button class="cp-tab" data-tab="transcript" onclick="switchCallDetailTab('transcript')">Transcript</button>
        <button class="cp-tab active" data-tab="jot" onclick="switchCallDetailTab('jot')">Jot</button>
      </div>
      <div class="cd-body">
        <div class="cp-pane hidden" id="cd-pane-details"></div>
        <div class="cp-pane hidden" id="cd-pane-notes"><div class="empty">Loading…</div></div>
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
        <button class="cd-back" onclick="closeContactView()" aria-label="Back">←</button>
        <div class="cd-title">
          <div class="cd-name" id="ct-name">Contact</div>
          <div class="cd-sub" id="ct-sub"></div>
        </div>
        <button class="cd-callback hidden" id="ct-dial-btn" onclick="dialContactView()">📞</button>
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
    <button class="menu-btn active" data-view="dial" onclick="switchView('dial')"><span class="ico">🕐</span><span>History</span></button>
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
  <button onclick="openVoicemail()">📼 Voicemail</button>
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

    <div class="loc-box hidden" id="loc-box">
      <div class="loc-title">📍 Location tracking</div>
      <div id="loc-signed-out">
        <div class="loc-row">
          <select id="loc-employee" class="acc-select"></select>
          <input id="loc-pin" type="password" inputmode="numeric" placeholder="PIN" autocomplete="off">
          <button onclick="staffSignIn()">Sign in</button>
        </div>
      </div>
      <div id="loc-signed-in" class="hidden">
        <div class="loc-row"><span id="loc-name" style="flex:1"></span><button onclick="staffSignOut()">Sign out</button></div>
        <div class="loc-row">
          <button onclick="staffFixPermissions()">Location: always</button>
          <button onclick="staffBattery()">Battery</button>
          <button onclick="staffAutostart()">Autostart</button>
        </div>
      </div>
      <div class="loc-status" id="loc-status"></div>
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
var J_INK = "Jot: ink", J_WORD = "Jot: word detection", J_LAY = "Jot: layout & splitting", J_DOT = "Jot: periods", J_GEST = "Jot: gestures", J_BOX = "Jot: page & zoom";

defParam(G_CALL, "wsKeepAliveSec", "WebSocket keep-alive", 25, { unit: "s", min: 0, max: 300, step: 5, note: "Ping the SIP server this often (0 = off); applies on next connect" });
defParam(G_CALL, "reconnectMinMs", "Reconnect first retry", 2000, { unit: "ms", min: 500, max: 60000, step: 500, note: "Wait before the first reconnect after the connection drops; doubles on each failure" });
defParam(G_CALL, "reconnectMaxMs", "Reconnect max retry", 60000, { unit: "ms", min: 5000, max: 600000, step: 1000, note: "Longest wait between reconnect attempts" });
defParam(G_CALL, "reconnectCheckMs", "Connection check interval", 30000, { unit: "ms", min: 5000, max: 600000, step: 1000, note: "How often to check the softphone is still registered (change applies after reload)" });
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

// ── audio unlock (autoplay policy) ─────────────────────────────
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
    el.textContent = "🔇 Click anywhere to enable call ringing";
    document.body.appendChild(el);
  }
  var ctx = sharedAudio();
  el.classList.toggle("hidden", settings.devMode || !ctx || ctx.state === "running");
}

// ── desktop notification for incoming calls (web only) ─────────
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

// ── incoming-call ringtone (dual-tone, 1s on / 3s off, looped) ─
// Vibration runs alongside the tone, not instead of it — it's a fallback
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
// Jot's text goes into the notes as one "From Jot" block, replaced (not
// duplicated) by later conversions, removed when the page is emptied. Works on the TinyMCE editor, its plain
// textarea fallback, or (neither mounted yet) the stored html via setHtml.
var JOT_NOTES_HEAD = "✍️ From Jot";
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
// ── in-call panel: caller name + tabs ───────────────────────────
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
  document.getElementById("banner-keypad").classList.toggle("active", tab === "keypad");
}

// ── Jot: handwriting canvas (perfect-freehand, vendored inline — ~5KB, no
// network request, no framework) ────────────────────────────────
// Vendored from perfect-freehand@1.2.3 (MIT, github.com/steveruizok/perfect-freehand).
var PerfectFreehand=(()=>{var Q=Object.defineProperty;var zn=Object.getOwnPropertyDescriptor;var An=Object.getOwnPropertyNames;var bn=Object.prototype.hasOwnProperty;var In=(n,t)=>{for(var r in t)Q(n,r,{get:t[r],enumerable:!0})},Tn=(n,t,r,u)=>{if(t&&typeof t=="object"||typeof t=="function")for(let i of An(t))!bn.call(n,i)&&i!==r&&Q(n,i,{get:()=>t[i],enumerable:!(u=zn(t,i))||u.enumerable});return n};var jn=n=>Tn(Q({},"__esModule",{value:!0}),n);var Nn={};In(Nn,{default:()=>Kn,getStroke:()=>yn,getStrokeOutlinePoints:()=>dn,getStrokePoints:()=>xn});var{PI:wn}=Math,F=wn+1e-4,rn=.5,un=[1,1];function on(n,t,r,u=i=>i){return n*u(.5-t*(.5-r))}var{min:U}=Math;function gn(n,t,r){let u=U(1,t/r);return U(1,n+(U(1,1-u)-n)*(u*.275))}function Fn(n){return[-n[0],-n[1]]}function g(n,t){return[n[0]+t[0],n[1]+t[1]]}function en(n,t,r){return n[0]=t[0]+r[0],n[1]=t[1]+r[1],n}function L(n,t){return[n[0]-t[0],n[1]-t[1]]}function X(n,t,r){return n[0]=t[0]-r[0],n[1]=t[1]-r[1],n}function y(n,t){return[n[0]*t,n[1]*t]}function V(n,t,r){return n[0]=t[0]*r,n[1]=t[1]*r,n}function On(n,t){return[n[0]/t,n[1]/t]}function vn(n){return[n[1],-n[0]]}function W(n,t){let r=t[0];return n[0]=t[1],n[1]=-r,n}function sn(n,t){return n[0]*t[0]+n[1]*t[1]}function Rn(n,t){return n[0]===t[0]&&n[1]===t[1]}function _n(n){return Math.hypot(n[0],n[1])}function cn(n,t){let r=n[0]-t[0],u=n[1]-t[1];return r*r+u*u}function Mn(n){return On(n,_n(n))}function qn(n,t){return Math.hypot(n[1]-t[1],n[0]-t[0])}function Y(n,t,r){let u=Math.sin(r),i=Math.cos(r),e=n[0]-t[0],o=n[1]-t[1],c=e*i-o*u,v=e*u+o*i;return[c+t[0],v+t[1]]}function ln(n,t,r,u){let i=Math.sin(u),e=Math.cos(u),o=t[0]-r[0],c=t[1]-r[1],v=o*e-c*i,P=o*i+c*e;return n[0]=v+r[0],n[1]=P+r[1],n}function fn(n,t,r){return g(n,y(L(t,n),r))}function Bn(n,t,r,u){let i=r[0]-t[0],e=r[1]-t[1];return n[0]=t[0]+i*u,n[1]=t[1]+e*u,n}function mn(n,t,r){return g(n,y(t,r))}var l=[0,0],d=[0,0],x=[0,0];function Cn(n,t){let r=mn(n,Mn(vn(L(n,g(n,[1,1])))),-t),u=[],i=1/13;for(let e=i;e<=1;e+=i)u.push(Y(r,n,F*2*e));return u}function Dn(n,t,r){let u=[],i=1/r;for(let e=i;e<=1;e+=i)u.push(Y(t,n,F*e));return u}function En(n,t,r){let u=L(t,r),i=y(u,.5),e=y(u,.51);return[L(n,i),L(n,e),g(n,e),g(n,i)]}function Gn(n,t,r,u){let i=[],e=mn(n,t,r),o=1/u;for(let c=o;c<1;c+=o)i.push(Y(e,n,F*3*c));return i}function Hn(n,t,r){return[g(n,y(t,r)),g(n,y(t,r*.99)),L(n,y(t,r*.99)),L(n,y(t,r))]}function hn(n,t,r){return n===!1||n===void 0?0:n===!0?Math.max(t,r):n}function Jn(n,t,r){return n.slice(0,10).reduce((u,i)=>{let e=i.pressure;return t&&(e=gn(u,i.distance,r)),(u+e)/2},n[0].pressure)}function dn(n,t={}){let{size:r=16,smoothing:u=.5,thinning:i=.5,simulatePressure:e=!0,easing:o=s=>s,start:c={},end:v={},last:P=!1}=t,{cap:M=!0,easing:O=s=>s*(2-s)}=c,{cap:f=!0,easing:h=s=>--s*s*s+1}=v;if(n.length===0||r<=0)return[];let p=n[n.length-1].runningLength,A=hn(c.taper,r,p),b=hn(v.taper,r,p),Z=(r*u)**2,I=[],z=[],$=Jn(n,e,r),a=on(r,i,n[n.length-1].pressure,o),C,D=n[0].vector,T=n[0].point,R=T,S=T,k=R,E=!1;for(let s=0;s<n.length;s++){let{pressure:K}=n[s],{point:m,vector:j,distance:Ln,runningLength:w}=n[s],q=s===n.length-1;if(!q&&p-w<3)continue;i?(e&&(K=gn($,Ln,r)),a=on(r,i,K,o)):a=r/2,C===void 0&&(C=a);let Pn=w<A?O(w/A):1,Sn=p-w<b?h((p-w)/b):1;a=Math.max(.01,a*Math.min(Pn,Sn));let nn=(q?n[s]:n[s+1]).vector,N=q?1:sn(j,nn),kn=sn(j,D)<0&&!E,tn=N!==null&&N<0;if(kn||tn){W(l,D),V(l,l,a);for(let B=0;B<=1;B+=.07692307692307693)X(d,m,l),ln(d,d,m,F*B),S=[d[0],d[1]],I.push(S),en(x,m,l),ln(x,x,m,F*-B),k=[x[0],x[1]],z.push(k);T=S,R=k,tn&&(E=!0);continue}if(E=!1,q){W(l,j),V(l,l,a),I.push(L(m,l)),z.push(g(m,l));continue}Bn(l,nn,j,N),W(l,l),V(l,l,a),X(d,m,l),S=[d[0],d[1]],(s<=1||cn(T,S)>Z)&&(I.push(S),T=S),en(x,m,l),k=[x[0],x[1]],(s<=1||cn(R,k)>Z)&&(z.push(k),R=k),$=K,D=j}let G=[n[0].point[0],n[0].point[1]],H=n.length>1?[n[n.length-1].point[0],n[n.length-1].point[1]]:g(n[0].point,[1,1]),J=[],_=[];if(n.length===1){if(!(A||b)||P)return Cn(G,C||a)}else{A||b&&n.length===1||(M?J.push(...Dn(G,z[0],13)):J.push(...En(G,I[0],z[0])));let s=vn(Fn(n[n.length-1].vector));b||A&&n.length===1?_.push(H):f?_.push(...Gn(H,s,a,29)):_.push(...Hn(H,s,a))}return I.concat(_,z.reverse(),J)}var an=[0,0];function pn(n){return n!=null&&n>=0}function xn(n,t={}){let{streamline:r=.5,size:u=16,last:i=!1}=t;if(n.length===0)return[];let e=.15+(1-r)*.85,o=Array.isArray(n[0])?n:n.map(({x:f,y:h,pressure:p=rn})=>[f,h,p]);if(o.length===2){let f=o[1];o=o.slice(0,-1);for(let h=1;h<5;h++)o.push(fn(o[0],f,h/4))}o.length===1&&(o=[...o,[...g(o[0],un),...o[0].slice(2)]]);let c=[{point:[o[0][0],o[0][1]],pressure:pn(o[0][2])?o[0][2]:.25,vector:[...un],distance:0,runningLength:0}],v=!1,P=0,M=c[0],O=o.length-1;for(let f=1;f<o.length;f++){let h=i&&f===O?[o[f][0],o[f][1]]:fn(M.point,o[f],e);if(Rn(M.point,h))continue;let p=qn(h,M.point);if(P+=p,f<O&&!v){if(P<u)continue;v=!0}X(an,M.point,h),M={point:h,pressure:pn(o[f][2])?o[f][2]:rn,vector:Mn(an),distance:p,runningLength:P},c.push(M)}return c[0].vector=c[1]?.vector||[0,0],c}function yn(n,t={}){return dn(xn(n,t),t)}var Kn=yn;return jn(Nn);})();

// ── Jot engine: Jot (one auto-growing, word-wrapping page of handwriting,
// read into the notes) / Draw (freehand pencil ink) / Erase, undo, zoom, save/load ──
var JOT_INK = "#e9ecef";
var JOT_STROKE_OPTS = { size: 5, thinning: 0.6, smoothing: 0.5, streamline: 0.5 };
// End-of-word detection: a stroke on a new line (see jtOnNewLine) is always a
// new word; otherwise a new stroke starts a new word only when BOTH
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
    '<button class="jt-btn jt-mode active" data-mode="jot" title="Jot: handwriting, read into the notes">🖊️</button>' +
    '<button class="jt-btn jt-mode" data-mode="draw" title="Freehand drawing">✏️</button>' +
    '<button class="jt-btn jt-mode" data-mode="erase" title="Erase">🧽</button>' +
    '<span class="jt-sep"></span>' +
    '<button class="jt-btn" data-act="undo" title="Undo">↶</button>' +
    '<button class="jt-btn" data-act="zoomout" title="Zoom out">−</button>' +
    '<button class="jt-btn jt-zoom-label" data-act="zoomreset" title="Reset zoom">100%</button>' +
    '<button class="jt-btn" data-act="zoomin" title="Zoom in">+</button>' +
    '<span class="jt-sep"></span>' +
    '<button class="jt-btn ghost" data-act="clear" title="Clear all">🗑</button>' +
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
  // DOC_WIDTH is only informational (persisted for reference / as an SVG
  // width floor) — the page box wraps at the width it was opened at.
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
  var drawStrokes = {};   // id -> { points:[[x,y,p],...], bbox } — freehand pencil ink, not in the box
  var box = { wrapWidth: Math.max(JOT_BOX_MIN_WIDTH, viewportW), h: JOT_BOX_MIN_HEIGHT, words: [], segs: [] };
  var actions = [];        // undo log (words/breaks, strokes, erases — not pan/zoom)
  var current = null;      // in-progress stroke while pointer is down
  var writingWord = null;  // { strokes:[...], bbox } — raw ink of the word being written
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
  // actions/words log — and therefore in getJSON()/undo — the instant the
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
  // finalized — the last real (non-break, non-period) word's own, so a single
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
  // captures it — then takes it back out. Autosave must never end a word:
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
  // word is discarded first — same as backspacing mid-word in a text editor.
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
    // no matter which tool is selected — ink is only ever drawn by a single
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
      // on pause" timer — otherwise a slightly-longer-than-usual pause
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
      var gapMm = writingWord ? jtWordGap(writingWord.bbox, bbox) * camera.scale / JOT_PX_PER_MM : Infinity;
      var newLine = !!writingWord && jtOnNewLine(writingWord.bbox, bbox, camera.scale);
      var joins = !!writingWord && !newLine && !jtStartsNewWord(pauseMs, gapMm);
      toolbar.querySelector(".jt-wordinfo").textContent = writingWord
        ? (pauseMs / 1000).toFixed(2) + "s · " + gapMm.toFixed(1) + "mm · " + (joins ? "same word" : newLine ? "NEW line" : "NEW word")
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
  }

  // ── automatic handwriting → text (Workers AI), saved into the notes ──
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
  // Sends every box not read yet (in the background — writing carries on);
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
    if (missing) { setConvInfo("Reading…"); return; }
    var text = "";
    box.segs.forEach(function(seg) {
      if (seg.words.length) text += segTexts[segSig(seg)] + (seg.closed ? String.fromCharCode(10) : "");
    });
    var sig = textSig();
    if (sig === convertedSig && text === jotTextCache) return;
    convertedSig = sig;
    jotTextCache = text;
    if (notesText) notesText.save(jotTextCache);
    setConvInfo(jotTextCache ? "In Notes ✓" : "");
    if (jotTextMode) renderJotTextEditor(jotTextCache ? "Saved to Notes ✓" : "");
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
    textView.innerHTML = '<span class="jt-text-note">Converting handwriting…</span>';
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
      st.textContent = "Saving…";
      clearTimeout(jotTextSaveTimer);
      jotTextSaveTimer = setTimeout(function() {
        jotTextSaveTimer = null;
        notesText.save(jotTextCache);
        st.textContent = "Saved to Notes ✓";
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
      // — otherwise the first Undo after loading would rebuild from an
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
// Jot SVG (light ink on dark) → dark-on-white JPEG data URL for the vision
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

// ── dial box: smart T9 search ──────────────────────────────────
// Keypad digits match contact/caller names the way phone dialers do: "564"
// finds JOHn, "7648" SMITh, "5647648" JOHN SMITh, "57" initials J S — plus
// any number containing the digits (a leading 0 also matches +44 numbers).
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
  if (digits.indexOf("44") === 0) nums.push("0" + digits.slice(2));
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
  if (!hits.length) { el.innerHTML = '<div class="empty">' + (letters ? "No matching contacts" : "No matches — press 📞 to dial " + esc(raw)) + '</div>'; return; }
  el.innerHTML = hits.map(function(h) {
    var e = h.e, name = e.name || e.num;
    return '<div class="sugg-row" data-num="' + esc(e.num) + '"><div><div class="n">' + (e.name ? hlName(e.name, h.m.hl) : hlNum(e.num, h.m.numHl)) + '</div>'
      + (e.name ? '<div class="s">' + hlNum(e.num, h.m.numHl) + '</div>' : '') + '</div><button class="call" title="Call ' + esc(name) + '">📞</button></div>';
  }).join("");
}
// Tap a match to put its number in the box; its 📞 calls straight away.
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
// Combined color+direction indicator: ▲ outgoing / ▼ incoming, colored green
// (completed in), blue (completed out), or red (missed/rejected/aborted).
function dirIcon(dir, missed) {
  var shape = dir === "out" ? "▲" : "▼";
  var cls = missed ? "missed" : dir;
  return '<span class="dir-ic ' + cls + '">' + shape + '</span>';
}

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
  return fetch(API + "/call-event", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString() }).catch(function() {});
}
function logHangup() {
  if (!currentCall) return;
  var dur = currentCall.answeredAt ? Math.round((Date.now() - currentCall.answeredAt) / 1000) : 0;
  // The hangup reply comes back once the number has a contact (an existing
  // one, or a new "dd/mm/yy number" one) — refresh so the name shows.
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
  if (onDialView()) loadHistory();
}
// The dialpad is only useful before a call connects — during one, DTMF
// lives in the in-call panel's Keypad tab. The banner ⌨️ button jumps to
// that tab and back to whichever tab was open before.
var tabBeforeKeypad = "notes";
function toggleInCallKeypad() {
  if (!inCall()) return;
  if (activeCpTab === "keypad") switchCallTab(tabBeforeKeypad || "notes");
  else { tabBeforeKeypad = activeCpTab; switchCallTab("keypad"); }
}
function updateDialBottomVisibility() {
  // Keypad (+ the history list, + the plain call button) hides for the whole
  // life of a call — ringing/dialling included, not just once connected —
  // so the in-call tabs showing who it is take over the screen right away.
  // The Keypad tab (and banner-keypad shortcut) only appear once the call
  // is actually connected — DTMF is meaningless before that.
  var inAnyCall = !!currentCall;
  var connected = !!(currentCall && currentCall.state === "active");
  document.getElementById("nav-dial").classList.toggle("in-call", inAnyCall);
  document.getElementById("nav-dial").setAttribute("aria-label", inAnyCall ? "Hang up" : "Dial");
  // Typing shows T9 matches in place of the list — unless 💬 is on, when the
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
var historyTxSearch = false;
// 💬 beside the dial box: the box searches what was said on calls instead
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
  if (!el.querySelector(".hist-row")) el.innerHTML = '<div class="empty">Loading…</div>';
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
  var note = c.has_notes ? '<button class="h-ic h-note" title="Notes">📝</button>' : '<span class="h-ic"></span>';
  var tx = c.has_transcript ? '<button class="h-ic h-tx" title="Transcript">💬</button>'
    : c.has_recording ? '<button class="h-ic h-tx dim" title="Transcribe">💬</button>' : '<span class="h-ic"></span>';
  var play = c.has_recording ? '<button class="h-ic hist-play" title="Play recording">▶</button>' : '<span class="h-ic"></span>';
  return '<div class="hist-row" data-key="' + esc(key) + '">'
    + '<div class="hist-main">' + dirIcon(dir, missed) + '<span class="h-time">' + when + '</span>'
    + '<span class="who">' + esc(name || num) + (c.voicemail ? ' <span title="Voicemail">📼</span>' : '') + '</span>'
    + note + tx + play + '</div>'
    + (c.match ? '<div class="hist-match">' + markMatch(c.match, historyQuery()) + '</div>' : '')
    + '</div>';
}
// Row icon taps shared by History and a contact's Calls tab: ▶ plays under
// the row, 📝 / 💬 open the call on its Notes / Transcript tab.
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
  if (i > 40) { text = "…" + text.slice(i - 30); i = 31; }
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
  row.querySelector(".hist-play").textContent = "■";
  fillRecordingPlayer(box, c, true);
}
// Audio player + transcript into box (shared by History rows and the call
// detail Transcript tab). Tapping a transcript line seeks the audio there.
// highlight: optional search term whose first matching line is marked and
// scrolled into view.
function fillRecordingPlayer(box, c, autoplay, highlight) {
  box.innerHTML = '<div class="hist-audio">' + (c.has_recording ? "Loading recording…" : "No recording for this call") + '</div><div class="hist-transcript"></div>';
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
  tBox.textContent = "Loading transcript…";
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
      tBox.textContent = "Transcribing… (about 10s per minute of call)";
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
  if (btn) btn.textContent = "▶";
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
      return '<div class="contact-row' + sel + '" data-id="' + esc(c.id) + '" data-key="c-' + esc(c.id) + '"><div style="flex:1;min-width:0"><div class="cname"><span class="cname-text" title="Click to rename">' + esc(c.name) + '</span>' + (c.is_company ? " 🏢" : "") + '<span class="cname-status"></span></div>' + (num ? '<div class="sub">' + esc(num) + '</div>' : '') + (c.email ? '<div class="sub">' + esc(c.email) + '</div>' : '') + '</div>' + star + (num ? '<button class="mini-call" data-num="' + esc(num) + '">📞</button>' : '') + '</div>';
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

// ── contact rename (click the name; autosaves to Odoo) ─────────
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
    setStatus("Saving…");
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

// ── contact selection + messages ───────────────────────────────
var activeContact = null;
function prepareDial(num) {
  document.getElementById("dial-input").value = num || "";
  document.getElementById("dial-suggestions").innerHTML = "";
  dialKeypadOpen = true;
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
// ── contact detail: in-screen view (Details / Sales / Messages / Calls) ──
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
  document.getElementById("ct-pane-details").innerHTML = '<div class="empty">Loading…</div>';
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
  // Leave the name alone once the box is showing — the user may be typing.
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
  document.getElementById("ct-sub").textContent = [num, ctContact.email].filter(Boolean).join(" · ");
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
  function money(v) { return wait ? "…" : (v == null ? "—" : esc(fmtMoney(v))); }
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
  var rows = '<div class="detail-row"><span class="k">Address</span><span class="v ct-addr">' + (addr ? esc(addr) : (ctData.totals === null ? "…" : "—")) + '</span></div>';
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
  setContactNameStatus("Saving…", false);
  fetch(API + "/contacts/" + id, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name }) })
    .then(function(r) { return r.json(); }).then(function(d) {
      if (!d.ok) { setContactNameStatus("Save failed", true); return; }
      if (contactsCache[id]) contactsCache[id].name = name;
      if (activeContact && activeContact.id === id) activeContact.name = name;
      if (ctContact && ctContact.id === id) { ctContact.name = name; renderContactHead(); setContactNameStatus("Saved ✓", false); }
    }).catch(function() { setContactNameStatus("Save failed", true); });
}
function loadContactSales() {
  var el = document.getElementById("ct-pane-sales"), id = ctContact.id;
  el.innerHTML = '<div class="empty">Loading…</div>';
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
  el.innerHTML = '<div class="empty">Loading…</div>';
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
  if (!ctData) { el.innerHTML = '<div class="empty">Loading…</div>'; return; }
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
// ── call detail: in-screen view (Details / Notes / Jot) ────────
// A drill-down from History, not a dialog — replaces the whole screen like
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

// ── Android app update prompt ──────────────────────────────────
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

// ── voicemail ──────────────────────────────────────────────────
// Greetings are stored on the worker, and Asterisk keeps its own copy of the
// active one (greetings-sync.sh), so "synced" says whether the phone system
// has caught up with the latest change. Everything saves as it's changed.
var vmState = null, vmReturnView = "dial", vmStatusTimer = null, vmPollTimer = null;
var vmRenameTimers = {}, vmDeleteArmed = {}, vmRec = null, vmPreview = null;
var VM_MAX_SECONDS = 120; // the worker stores greetings in D1, which caps a row at 2 MB
function openVoicemail() {
  document.getElementById("menu-drawer").classList.add("hidden");
  var views = document.querySelectorAll(".view");
  for (var i = 0; i < views.length; i++) {
    if (!views[i].classList.contains("hidden") && views[i].id !== "view-voicemail") vmReturnView = views[i].id.replace("view-", "");
  }
  switchView("voicemail");
  loadVoicemail();
}
function closeVoicemail() {
  stopVmRecording(true);
  stopVmPreview();
  clearTimeout(vmPollTimer);
  switchView(vmReturnView || "dial");
}
function vmStatus(msg, bad) {
  var el = document.getElementById("vm-status");
  el.textContent = msg;
  el.style.color = bad ? "#f87171" : "";
  clearTimeout(vmStatusTimer);
  if (!bad) vmStatusTimer = setTimeout(function() { el.textContent = ""; }, 2500);
}
function vmRequest(method, path, body, contentType) {
  var opts = { method: method };
  if (body !== undefined) {
    opts.body = contentType ? body : JSON.stringify(body);
    opts.headers = { "Content-Type": contentType || "application/json" };
  }
  return fetch(API + path, opts).then(function(r) {
    return r.json().catch(function() { return {}; }).then(function(d) {
      if (!r.ok) throw new Error(d.error || ("HTTP " + r.status));
      return d;
    });
  });
}
function loadVoicemail() {
  vmRequest("GET", "/voicemail").then(setVmState).catch(function(err) { vmStatus("Couldn't load: " + err.message, true); });
}
function setVmState(d) {
  vmState = d;
  renderVoicemail();
  // Asterisk applies a change a moment after it's saved; check back until it has.
  clearTimeout(vmPollTimer);
  if (!d.synced && !document.getElementById("view-voicemail").classList.contains("hidden")) vmPollTimer = setTimeout(loadVoicemail, 3000);
}
function renderVoicemail() {
  var d = vmState;
  document.getElementById("vm-direct").checked = !!d.direct;
  var sync = document.getElementById("vm-sync");
  sync.textContent = d.synced ? "✓ Phone system is up to date" : "⏳ Updating the phone system…";
  sync.className = "vm-sync" + (d.synced ? "" : " pending");
  // Don't rebuild the list under someone typing a name.
  var list = document.getElementById("vm-list"), focused = document.activeElement;
  if (focused && list.contains(focused) && focused.classList.contains("vm-name")) return;
  stopVmPreview();
  var html = '<label class="vm-row' + (d.greeting == null ? " active" : "") + '"><input type="radio" name="vm-greeting" value=""' + (d.greeting == null ? " checked" : "") + '>'
    + '<span class="vm-name vm-stock">Standard prompt</span><span class="vm-dur">“Please leave your message after the tone”</span></label>';
  for (var i = 0; i < d.greetings.length; i++) {
    var g = d.greetings[i], on = d.greeting === g.id;
    html += '<div class="vm-row' + (on ? " active" : "") + '" data-id="' + g.id + '">'
      + '<input type="radio" name="vm-greeting" value="' + g.id + '"' + (on ? " checked" : "") + '>'
      + '<input class="vm-name" type="text" value="' + esc(g.name) + '" autocomplete="off">'
      + '<span class="vm-dur">' + fmtDur(g.duration_ms / 1000) + '</span>'
      + '<button class="hist-play vm-play" title="Play">▶</button>'
      + '<button class="vm-del" title="Delete">🗑</button></div>';
  }
  list.innerHTML = html;
}
function setVmDirect(on) {
  vmRequest("POST", "/voicemail", { direct: on }).then(function(d) {
    setVmState(d);
    vmStatus(on ? "Calls go straight to voicemail ✓" : "Phones ring again ✓", false);
  }).catch(function(err) {
    document.getElementById("vm-direct").checked = !on;
    vmStatus("Not saved: " + err.message, true);
  });
}
function setVmGreeting(id) {
  vmRequest("POST", "/voicemail", { greeting: id }).then(function(d) {
    setVmState(d);
    vmStatus("Saved ✓", false);
  }).catch(function(err) { vmStatus("Not saved: " + err.message, true); if (vmState) renderVoicemail(); });
}
function saveVmName(id, inp) {
  clearTimeout(vmRenameTimers[id]);
  delete vmRenameTimers[id];
  var name = inp.value.trim();
  if (!name) return;
  vmRequest("POST", "/greetings/" + id, { name: name }).then(function(d) {
    vmState = d;
    vmStatus("Saved ✓", false);
  }).catch(function(err) { vmStatus("Name not saved: " + err.message, true); });
}
function deleteVmGreeting(id, btn) {
  if (!vmDeleteArmed[id]) {
    btn.textContent = "Delete?";
    btn.classList.add("armed");
    vmDeleteArmed[id] = setTimeout(function() { delete vmDeleteArmed[id]; btn.textContent = "🗑"; btn.classList.remove("armed"); }, 3000);
    return;
  }
  clearTimeout(vmDeleteArmed[id]);
  delete vmDeleteArmed[id];
  vmRequest("DELETE", "/greetings/" + id).then(function(d) {
    setVmState(d);
    vmStatus("Deleted ✓", false);
  }).catch(function(err) { vmStatus("Not deleted: " + err.message, true); });
}
function stopVmPreview() {
  if (!vmPreview) return;
  vmPreview.audio.pause();
  vmPreview.btn.textContent = "▶";
  vmPreview = null;
}
function toggleVmPreview(id, btn) {
  var same = vmPreview && vmPreview.btn === btn;
  stopVmPreview();
  if (same) return;
  var a = new Audio(API + "/greetings/" + id + "/audio");
  vmPreview = { audio: a, btn: btn };
  btn.textContent = "■";
  a.onended = function() { if (vmPreview && vmPreview.audio === a) stopVmPreview(); };
  a.play().catch(function(err) { stopVmPreview(); vmStatus("Can't play: " + err.message, true); });
}
var vmList = document.getElementById("vm-list");
vmList.addEventListener("change", function(e) {
  if (e.target.name !== "vm-greeting") return;
  setVmGreeting(e.target.value === "" ? null : Number(e.target.value));
});
vmList.addEventListener("input", function(e) {
  if (!e.target.classList.contains("vm-name")) return;
  var id = e.target.closest(".vm-row").getAttribute("data-id"), inp = e.target;
  clearTimeout(vmRenameTimers[id]);
  vmRenameTimers[id] = setTimeout(function() { saveVmName(id, inp); }, 900);
});
vmList.addEventListener("focusout", function(e) {
  if (!e.target.classList.contains("vm-name")) return;
  var id = e.target.closest(".vm-row").getAttribute("data-id");
  if (vmRenameTimers[id]) saveVmName(id, e.target);
});
vmList.addEventListener("keydown", function(e) {
  if (e.key === "Enter" && e.target.classList.contains("vm-name")) e.target.blur();
});
vmList.addEventListener("click", function(e) {
  var row = e.target.closest(".vm-row[data-id]");
  if (!row) return;
  var id = row.getAttribute("data-id");
  if (e.target.closest(".vm-play")) toggleVmPreview(id, e.target.closest(".vm-play"));
  else if (e.target.closest(".vm-del")) deleteVmGreeting(id, e.target.closest(".vm-del"));
});
// Any audio the browser can decode becomes the 8 kHz mono 16-bit WAV that
// Asterisk plays as is. Decoding through an 8 kHz context does the
// resampling; channels are averaged; the level is raised so a quiet mic
// recording isn't faint on the phone.
function vmToWav(buf) {
  var off = new OfflineAudioContext(1, 1, 8000);
  return new Promise(function(res, rej) { off.decodeAudioData(buf, res, rej); }).then(function(dec) {
    if (dec.duration > VM_MAX_SECONDS + 0.5) throw new Error("greetings can be at most 2 minutes");
    var n = dec.length, mono = new Float32Array(n), ch, c, i;
    for (c = 0; c < dec.numberOfChannels; c++) {
      ch = dec.getChannelData(c);
      for (i = 0; i < n; i++) mono[i] += ch[i] / dec.numberOfChannels;
    }
    var peak = 0;
    for (i = 0; i < n; i++) peak = Math.max(peak, Math.abs(mono[i]));
    var gain = peak > 0.01 ? Math.min(8, 0.9 / peak) : 1;
    var out = new ArrayBuffer(44 + n * 2), v = new DataView(out);
    var str = function(at, t) { for (var k = 0; k < t.length; k++) v.setUint8(at + k, t.charCodeAt(k)); };
    str(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); str(8, "WAVEfmt ");
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, "data"); v.setUint32(40, n * 2, true);
    for (i = 0; i < n; i++) {
      var s = Math.max(-1, Math.min(1, mono[i] * gain));
      v.setInt16(44 + i * 2, s < 0 ? s * 32768 : s * 32767, true);
    }
    return out;
  });
}
function uploadVmGreeting(buf, name) {
  vmStatus("Saving greeting…", false);
  return vmToWav(buf).then(function(wav) {
    return vmRequest("POST", "/greetings?name=" + encodeURIComponent(name), wav, "audio/wav");
  }).then(function(d) {
    setVmState(d);
    vmStatus("Greeting saved ✓", false);
  }).catch(function(err) { vmStatus("Not saved: " + err.message, true); });
}
document.getElementById("vm-file").addEventListener("change", function(e) {
  var f = e.target.files && e.target.files[0];
  e.target.value = "";
  if (!f) return;
  var dot = f.name.lastIndexOf(".");
  f.arrayBuffer().then(function(buf) { uploadVmGreeting(buf, dot > 0 ? f.name.slice(0, dot) : f.name); });
});
function toggleVmRecording() { if (vmRec) stopVmRecording(false); else startVmRecording(); }
function startVmRecording() {
  if (!navigator.mediaDevices || !window.MediaRecorder) { vmStatus("This browser can't record audio", true); return; }
  stopVmPreview();
  navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
    var rec = new MediaRecorder(stream), chunks = [], btn = document.getElementById("vm-rec-btn"), started = Date.now();
    vmRec = { rec: rec, stream: stream, discard: false, timer: null };
    rec.ondataavailable = function(e) { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = function() {
      var r = vmRec;
      vmRec = null;
      clearInterval(r.timer);
      stream.getTracks().forEach(function(t) { t.stop(); });
      btn.textContent = "🎙 Record";
      btn.classList.remove("rec");
      if (r.discard || !chunks.length) return;
      new Blob(chunks, { type: rec.mimeType }).arrayBuffer().then(function(buf) {
        uploadVmGreeting(buf, "Recorded " + new Date().toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }));
      });
    };
    var tick = function() {
      var secs = Math.floor((Date.now() - started) / 1000);
      btn.textContent = "■ Stop  " + fmtDur(secs);
      if (secs >= VM_MAX_SECONDS) stopVmRecording(false);
    };
    btn.classList.add("rec");
    tick();
    vmRec.timer = setInterval(tick, 500);
    rec.start();
  }).catch(function(err) { vmStatus("No microphone: " + err.message, true); });
}
function stopVmRecording(discard) {
  if (!vmRec) return;
  vmRec.discard = discard;
  if (vmRec.rec.state !== "inactive") vmRec.rec.stop();
}

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
  renderStaffLocation();
  document.getElementById("settings-modal").classList.remove("hidden");
}

// ── Staff location tracking (Android app only) ─────────────────
// Signs an employee in with their Odoo Attendances PIN; the native
// StaffLocation plugin then sends a location every 15 minutes in the
// background (see android/.../LocationWorker.java and src/staff.ts).
function staffPlugin() {
  var Cap = window.Capacitor;
  if (!Cap || !Cap.isNativePlatform || !Cap.isNativePlatform()) return null;
  return (Cap.Plugins && Cap.Plugins.StaffLocation) || null;
}
function staffTime(ms) {
  if (!ms) return "never";
  var d = new Date(ms);
  return d.toLocaleDateString([], { day: "numeric", month: "short" }) + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function renderStaffLocation() {
  var SL = staffPlugin();
  var box = document.getElementById("loc-box");
  if (!SL) { box.classList.add("hidden"); return; }
  box.classList.remove("hidden");
  SL.status().then(showStaffStatus).catch(function() {});
}
function showStaffStatus(s) {
  document.getElementById("loc-signed-in").classList.toggle("hidden", !s.signedIn);
  document.getElementById("loc-signed-out").classList.toggle("hidden", !!s.signedIn);
  var st = document.getElementById("loc-status");
  if (!s.signedIn) {
    st.textContent = "Not tracking.";
    loadStaffEmployees();
    return;
  }
  document.getElementById("loc-name").textContent = s.name;
  var warn = [];
  if (s.location !== "granted") warn.push("location permission off");
  else if (s.background !== "granted") warn.push("location not set to 'Allow all the time'");
  if (!s.batteryUnrestricted) warn.push("battery saving on");
  st.innerHTML = "";
  var line = document.createElement("div");
  line.textContent = "Last reading " + staffTime(s.lastFixAt) + ", last sent " + staffTime(s.lastSentAt) + (s.lastError ? " (" + s.lastError + ")" : "");
  st.appendChild(line);
  if (warn.length) {
    var w = document.createElement("div");
    w.className = "loc-warn";
    w.textContent = "⚠ " + warn.join(", ") + ". Also allow Autostart.";
    st.appendChild(w);
  }
}
function loadStaffEmployees() {
  var sel = document.getElementById("loc-employee");
  fetch(API + "/staff/employees").then(function(r) { return r.json(); }).then(function(d) {
    sel.innerHTML = "";
    var list = d.employees || [];
    if (!list.length) {
      var o = document.createElement("option");
      o.textContent = "No employees have a PIN";
      sel.appendChild(o);
      return;
    }
    list.forEach(function(e) {
      var o = document.createElement("option");
      o.value = e.id;
      o.textContent = e.name;
      sel.appendChild(o);
    });
  }).catch(function() {});
}
function staffSignIn() {
  var SL = staffPlugin();
  if (!SL) return;
  var st = document.getElementById("loc-status");
  var pinEl = document.getElementById("loc-pin");
  var id = parseInt(document.getElementById("loc-employee").value, 10);
  if (!id || !pinEl.value) { st.textContent = "Pick your name and enter your PIN."; return; }
  st.textContent = "Signing in…";
  fetch(API + "/staff/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employee_id: id, pin: pinEl.value })
  }).then(function(r) { return r.json(); }).then(function(d) {
    pinEl.value = "";
    if (!d.token) { st.textContent = d.error || "Sign-in failed."; return; }
    return SL.signIn({ token: d.token, name: d.employee.name, url: API }).then(function() {
      return SL.requestLocation();
    }).then(showStaffStatus);
  }).catch(function() { st.textContent = "Sign-in failed (no connection?)."; });
}
function staffSignOut() {
  var SL = staffPlugin();
  if (SL) SL.signOut().then(showStaffStatus).catch(function() {});
}
function staffFixPermissions() {
  var SL = staffPlugin();
  if (SL) SL.requestLocation().then(showStaffStatus).catch(function() {});
}
function staffBattery() {
  var SL = staffPlugin();
  if (SL) SL.openBatterySettings();
}
function staffAutostart() {
  var SL = staffPlugin();
  if (SL) SL.openAutostartSettings();
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
      // CRLF pings keep NAT/proxies from idling the socket out, and make a
      // dead one fail (→ onDisconnect → reconnect) instead of hanging silently.
      transportOptions: { server: acc.server || DEFAULT_WS, keepAliveInterval: PV.wsKeepAliveSec },
      authorizationUsername: acc.username,
      authorizationPassword: acc.password,
      sessionDescriptionHandlerFactoryOptions: { constraints: { audio: true, video: false } }
    });
  } catch(e) { setStatus("❌ Init: " + e.message, true); return; }

  // Events from a UA that has since been torn down (stop() fires its own
  // disconnect/unregister) must not touch the current one.
  var ua = sipUA;
  sipRegistered = false;
  sipStartedAt = Date.now();
  var registerer = new SIP.Registerer(sipUA, { expires: 3600 });
  registerer.stateChange.on(function(state) {
    if (ua !== sipUA) return;
    if (state === SIP.RegistererState.Registered) { clearTimeout(regTimer); sipRegistered = true; reconnectDelay = 0; setStatus("✅ Registered", false); registerPush(); }
    else if (state === SIP.RegistererState.Unregistered) { clearTimeout(regTimer); sipRegistered = false; setStatus("❌ Unregistered", true); scheduleReconnect(); }
    else setStatus("⏳ " + state, false);
  });

  sipUA.delegate = {
    onDisconnect: function(err) {
      if (ua !== sipUA) return;
      sipRegistered = false;
      setStatus("❌ Connection lost" + (err && err.message ? " (" + err.message + ")" : ""), true);
      scheduleReconnect();
    },
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
      showCallNotification(inv.remoteIdentity.displayName || currentCall.remote);
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
    if (ua !== sipUA) return;
    setStatus("❌ Server unreachable (timeout)", true);
    try { sipUA.stop(); } catch (e) {}
    sipUA = null;
    scheduleReconnect();
  }, REG_TIMEOUT_MS);
}

// ── keep the softphone registered ─────────────────────────────
// The WebSocket drops on network blips, PC sleep, or a server restart, and
// sip.js doesn't reconnect by itself, so rebuild the connection (what Save
// does by hand) with backoff. Never while a call is up: it would end it.
var sipRegistered = false, sipStartedAt = 0, reconnectTimer = null, reconnectDelay = 0;
function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectDelay = Math.min(Math.max(reconnectDelay * 2, PV.reconnectMinMs), PV.reconnectMaxMs);
  setStatus("⏳ Reconnecting in " + Math.round(reconnectDelay / 1000) + "s…", true);
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

// ── boot ───────────────────────────────────────────────────────
function applyBoot() {
  updateAudioHint();
  updateAccountHeader();
  loadHistory();
  loadT9Corpus();
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
  // Calls from numbers that only became contacts later have no name yet —
  // link them up, then redraw the lists if anything changed.
  fetch(API + "/call-history/resolve-names", { method: "POST" }).then(function(r) { return r.json(); }).then(function(d) {
    if (d && d.linked > 0) refreshCallLists();
  }).catch(function() {});
}
document.addEventListener("DOMContentLoaded", boot);
document.addEventListener("DOMContentLoaded", checkAppUpdate);
</script>
</body>
</html>`;
  return new Response(html, { headers: { "Content-Type": "text/html;charset=utf-8", "Cache-Control": "no-store, no-cache, must-revalidate" } });
}
