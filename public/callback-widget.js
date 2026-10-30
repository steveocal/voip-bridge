// Website callback widget (replaces Nuacom's on infraredheaterpanels.co.uk).
// Embed:
//   <script src="https://voip-bridge.wandering-mode-c597.workers.dev/callback-widget.js" data-cfasync="false" async></script>
// Optional attributes on that tag: data-color, data-label, data-show-mobile.
// Links with data-callback (or Nuacom's old .nuacom-caller-node links) open
// the form on desktop and become tel: links on phones.
// Server side: src/webcallback.ts.
(function () {
  if (window.__ihpCallback) return;
  window.__ihpCallback = true;

  var script = document.currentScript || document.querySelector('script[src*="callback-widget.js"]');
  var API = script ? new URL(script.src, location.href).origin : "https://voip-bridge.wandering-mode-c597.workers.dev";
  var opt = script ? script.dataset : {};
  var COLOR = opt.color || "#0092c8";
  var LABEL = opt.label || "Speak with a heating expert";
  var SHOW_MOBILE = opt.showMobile === "true";
  var CALL_FROM = "01283 246490";
  var isMobile = function () { return window.matchMedia("(max-width: 640px), (pointer: coarse)").matches; };

  var ICON_PHONE = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.3 2.2z"/></svg>';
  var ICON_X = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7l-1.4-1.4L9.2 12 2.9 5.7l1.4-1.4 6.3 6.3 6.3-6.3z"/></svg>';

  var css = ''
    + ':host{all:initial}'
    + '*{box-sizing:border-box;font-family:inherit}'
    + '.wrap{position:fixed;right:20px;bottom:40px;z-index:2147483000;font:15px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#1d2433}'
    + '.launcher{width:58px;height:58px;border-radius:50%;border:0;background:' + COLOR + ';color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 20px rgba(0,0,0,.22);transition:transform .15s}'
    + '.launcher:hover{transform:scale(1.06)}'
    + '.launcher:focus-visible,button:focus-visible,select:focus-visible,input:focus-visible{outline:3px solid ' + COLOR + '66;outline-offset:2px}'
    + '.bubble{position:absolute;right:70px;bottom:9px;white-space:nowrap;background:#fff;border-radius:20px;padding:9px 34px 9px 16px;box-shadow:0 4px 16px rgba(0,0,0,.16);font-weight:600;font-size:14px;cursor:pointer;animation:pop .25s ease-out}'
    + '.bubble .x{position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:0;color:#8a93a3;cursor:pointer;padding:2px;display:flex}'
    + '@keyframes pop{from{opacity:0;transform:translateX(8px)}to{opacity:1;transform:none}}'
    + '.panel{position:absolute;right:0;bottom:72px;width:340px;max-width:calc(100vw - 32px);background:#fff;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.25);overflow:hidden;animation:up .2s ease-out}'
    + '@keyframes up{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}'
    + '.head{background:' + COLOR + ';color:#fff;padding:16px 44px 16px 18px;position:relative}'
    + '.head h2{margin:0;font-size:17px;font-weight:700;color:#fff}'
    + '.head p{margin:4px 0 0;font-size:13px;opacity:.92}'
    + '.head .x{position:absolute;right:10px;top:12px;background:none;border:0;color:#fff;cursor:pointer;padding:4px;display:flex;opacity:.85}'
    + '.tabs{display:flex;border-bottom:1px solid #e6e9ef}'
    + '.tab{flex:1;background:none;border:0;border-bottom:2px solid transparent;padding:11px 0;font-weight:600;font-size:14px;color:#5b6475;cursor:pointer}'
    + '.tab[aria-selected=true]{color:' + COLOR + ';border-bottom-color:' + COLOR + '}'
    + '.tab:disabled{color:#b8bfcc;cursor:default}'
    + 'form{padding:16px 18px 18px;display:flex;flex-direction:column;gap:12px}'
    + 'label{display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:600;color:#3a4252}'
    + 'input,select{font:inherit;font-size:15px;color:#1d2433;border:1px solid #cfd5df;border-radius:8px;padding:9px 10px;background:#fff;width:100%;min-width:0}'
    + '.row{display:flex;gap:8px}'
    + '.row select.cc{width:auto;flex:none}'
    + '.hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}'
    + '.go{background:' + COLOR + ';color:#fff;border:0;border-radius:8px;padding:12px;font-size:15px;font-weight:700;cursor:pointer}'
    + '.go:disabled{opacity:.6;cursor:default}'
    + '.err{color:#c62828;font-size:13px;margin:0}'
    + '.small{font-size:12px;color:#7a8394;margin:0}'
    + '.status{padding:26px 22px 24px;text-align:center}'
    + '.status h3{margin:12px 0 6px;font-size:17px}'
    + '.status p{margin:0;color:#4a5263;font-size:14px}'
    + '.status .go{margin-top:18px;width:100%}'
    + '.spin{width:40px;height:40px;margin:0 auto;border-radius:50%;border:4px solid ' + COLOR + '33;border-top-color:' + COLOR + ';animation:sp 1s linear infinite}'
    + '.ok{width:44px;height:44px;margin:0 auto;border-radius:50%;background:' + COLOR + ';color:#fff;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:700}'
    + '@keyframes sp{to{transform:rotate(360deg)}}'
    + '@media (max-width:640px){.wrap{right:16px;bottom:16px}.panel{position:fixed;left:16px;right:16px;bottom:16px;width:auto;max-width:none}.bubble{display:none}}'
    + '@media (prefers-reduced-motion:reduce){.panel,.bubble,.launcher{animation:none;transition:none}.spin{animation-duration:3s}}';

  var host = document.createElement("div");
  host.id = "ihp-callback-widget";
  var root = host.attachShadow({ mode: "open" });
  root.innerHTML = '<style>' + css + '</style><div class="wrap"></div>';
  var wrap = root.querySelector(".wrap");

  var config = null, mode = "now", pollTimer = null, panel = null, lastName = "";

  function el(html) { var t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function store(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (_e) { return null; } }

  function loadConfig() {
    return fetch(API + "/web-callback/config").then(function (r) { return r.json(); })
      .then(function (c) { config = c; return c; })
      .catch(function () { config = { open: false, slots: [] }; return config; });
  }

  // ── Launcher ──
  function renderLauncher() {
    if (isMobile() && !SHOW_MOBILE) return;
    var btn = el('<button class="launcher" type="button" aria-label="' + esc(LABEL) + '">' + ICON_PHONE + '</button>');
    btn.addEventListener("click", function () { panel ? close() : open(); });
    wrap.appendChild(btn);
    if (store("ihpcb-bubble") !== "off") {
      setTimeout(function () {
        if (panel) return;
        var b = el('<div class="bubble" role="button" tabindex="0">' + esc(LABEL) + '<button class="x" type="button" aria-label="Dismiss">' + ICON_X + '</button></div>');
        b.addEventListener("click", function (e) {
          b.remove();
          if (e.target.closest(".x")) { store("ihpcb-bubble", "off"); return; }
          open();
        });
        wrap.insertBefore(b, wrap.firstChild);
      }, 1500);
    }
  }

  // ── Panel ──
  function open() {
    var b = root.querySelector(".bubble"); if (b) b.remove();
    if (panel) return;
    panel = el('<div class="panel" role="dialog" aria-label="' + esc(LABEL) + '"></div>');
    wrap.insertBefore(panel, wrap.firstChild);
    panel.innerHTML = '<div class="status"><div class="spin"></div></div>';
    (config ? Promise.resolve(config) : loadConfig()).then(function () {
      if (!config.open) mode = "later";
      renderForm();
    });
    document.addEventListener("keydown", onKey);
  }
  function close() {
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
    if (panel) { panel.remove(); panel = null; }
    document.removeEventListener("keydown", onKey);
  }
  function onKey(e) { if (e.key === "Escape") close(); }

  function header(title, sub) {
    return '<div class="head"><h2>' + esc(title) + '</h2>' + (sub ? '<p>' + esc(sub) + '</p>' : '')
      + '<button class="x" type="button" aria-label="Close">' + ICON_X + '</button></div>';
  }
  function bindClose() { panel.querySelector(".head .x").addEventListener("click", close); }

  function renderForm(error, values) {
    values = values || {};
    var sub = config.open ? "Leave your number and one of our team will call you straight back."
      : "We're closed right now (Mon–Fri 9:00–17:30). Pick a time and we'll call you.";
    var slots = config.slots || [];
    var dayOpts = slots.map(function (d, i) { return '<option value="' + i + '">' + esc(d.label) + '</option>'; }).join("");
    panel.innerHTML = header(LABEL, sub)
      + '<div class="tabs" role="tablist">'
      + '<button class="tab" type="button" role="tab" data-mode="now"' + (config.open ? "" : " disabled") + ' aria-selected="' + (mode === "now") + '">Call me now</button>'
      + '<button class="tab" type="button" role="tab" data-mode="later" aria-selected="' + (mode === "later") + '"' + (slots.length ? "" : " disabled") + '>Call me later</button>'
      + '</div>'
      + '<form novalidate>'
      + '<label>Your name<input name="name" autocomplete="name" maxlength="80" required></label>'
      + '<label>Phone number<span class="row"><select class="cc" name="country" aria-label="Country"><option value="GB">🇬🇧 +44</option><option value="IE">🇮🇪 +353</option></select>'
      + '<input name="phone" type="tel" autocomplete="tel" inputmode="tel" placeholder="07123 456789" required></span></label>'
      + (mode === "later" ? '<span class="row"><label style="flex:1.4">Day<select name="day">' + dayOpts + '</select></label><label style="flex:1">Time<select name="at"></select></label></span>' : '')
      + '<label class="hp" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>'
      + (error ? '<p class="err" role="alert">' + esc(error) + '</p>' : '')
      + '<button class="go" type="submit">' + (mode === "now" ? "Call me now" : "Schedule my call") + '</button>'
      + '<p class="small">We\'ll only use your number to call you about your enquiry.</p>'
      + '</form>';
    bindClose();
    var form = panel.querySelector("form");
    form.name.value = values.name || "";
    form.phone.value = values.phone || "";
    if (values.country) form.country.value = values.country;
    panel.querySelectorAll(".tab").forEach(function (t) {
      t.addEventListener("click", function () {
        if (t.disabled) return;
        mode = t.dataset.mode;
        renderForm(null, { name: form.name.value, phone: form.phone.value, country: form.country.value });
      });
    });
    var fillTimes = function () {
      var d = slots[+form.day.value] || { times: [] };
      form.at.innerHTML = d.times.map(function (t) { return '<option value="' + t.at + '">' + esc(t.label) + '</option>'; }).join("");
    };
    if (form.day) {
      form.day.addEventListener("change", fillTimes);
      fillTimes();
    }
    form.addEventListener("submit", function (e) { e.preventDefault(); submit(form); });
    (values.name ? form.phone : form.name).focus();
  }

  function submit(form) {
    var values = { name: form.name.value.trim(), phone: form.phone.value.trim(), country: form.country.value };
    if (!values.name) return renderForm("Please enter your name.", values);
    if (values.phone.replace(/\D/g, "").length < 9) return renderForm("Please enter your phone number.", values);
    var btn = form.querySelector(".go");
    btn.disabled = true; btn.textContent = "Sending…";
    lastName = values.name.split(" ")[0];
    var at = form.at ? +form.at.value : undefined;
    var atLabel = form.at ? form.day.options[form.day.selectedIndex].text + " at " + form.at.options[form.at.selectedIndex].text : "";
    fetch(API + "/web-callback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: values.name, phone: values.phone, country: values.country, mode: mode, at: at, page: location.href, website: form.website.value }),
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok || !res.j.ok) return renderForm(res.j.error || "Sorry, something went wrong. Please try again.", values);
        if (res.j.state === "calling") return poll(res.j.id, Date.now());
        status(res.j.state, atLabel);
      })
      .catch(function () { renderForm("Sorry, we couldn't send that. Please check your connection and try again.", values); });
  }

  // ── Status ──
  var FINAL = { connected: 1, "no-answer": 1, missed: 1, failed: 1, scheduled: 1 };
  function status(state, atLabel) {
    if (!panel) return;
    var busy = state === "calling" || state === "connecting";
    var t = {
      calling: ["Calling our team…", "Please keep this window open. We're finding someone to talk to you."],
      connecting: ["Your phone is about to ring", "Answer the call from " + CALL_FROM + " to speak to one of our heating experts."],
      connected: ["Thanks for your call", "Good to speak to you" + (lastName ? ", " + lastName : "") + ". If you need anything else, just ask."],
      "no-answer": ["We couldn't get through", "We tried calling you but couldn't connect. We'll try you again soon."],
      missed: ["Our team is busy right now", "We've got your details and will call you back as soon as we can."],
      failed: ["Our team is busy right now", "We've got your details and will call you back as soon as we can."],
      scheduled: ["Your call is booked", atLabel ? "We'll call you " + atLabel + "." : "We'll call you back as soon as we can."],
    }[state] || ["Thank you", "We'll be in touch shortly."];
    panel.innerHTML = header(LABEL)
      + '<div class="status" role="status" aria-live="polite">' + (busy ? '<div class="spin"></div>' : '<div class="ok">✓</div>')
      + '<h3>' + esc(t[0]) + '</h3><p>' + esc(t[1]) + '</p>'
      + (busy ? '' : '<button class="go" type="button">Close</button>') + '</div>';
    bindClose();
    var done = panel.querySelector(".status .go");
    if (done) done.addEventListener("click", close);
  }

  function poll(id, started) {
    fetch(API + "/web-callback/status?id=" + encodeURIComponent(id)).then(function (r) { return r.json(); })
      .then(function (j) {
        status(j.state);
        if (!FINAL[j.state] && panel && Date.now() - started < 180000) pollTimer = setTimeout(function () { poll(id, started); }, 2000);
      })
      .catch(function () { if (panel) pollTimer = setTimeout(function () { poll(id, started); }, 4000); });
  }

  // ── In-page links ──
  function bindLinks() {
    document.querySelectorAll("[data-callback], .nuacom-caller-node").forEach(function (a) {
      if (a.__ihpcb) return;
      a.__ihpcb = true;
      var number = a.getAttribute("data-callback") || a.getAttribute("data-nuacom-call-number") || "";
      if (number && a.tagName === "A") a.setAttribute("href", "tel:" + number.replace(/[^\d+]/g, ""));
      a.addEventListener("click", function (e) {
        if (isMobile() && number) return; // let the phone dial it
        e.preventDefault();
        open();
      });
    });
  }

  function start() {
    document.body.appendChild(host);
    renderLauncher();
    bindLinks();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
