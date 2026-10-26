import { reactive } from "@odoo/owl";
import { loadJS } from "@web/core/assets";
import { rpc } from "@web/core/network/rpc";
import { registry } from "@web/core/registry";
import { _t } from "@web/core/l10n/translation";

// ── Softphone ─────────────────────────────────────────────────
// sip.js against the phone system's WebSocket, as the user's own extension
// (Preferences → Phone). The PBX does the calling; this registers, rings,
// answers and dials, and tells the worker about calls it makes or takes
// (via /phone_bridge/call_event, so the worker's API token stays on the
// server). Clicking any tel: link in Odoo dials through it once it's
// registered.

const RECONNECT_MAX_MS = 60_000;

export const softphoneService = {
    dependencies: ["notification"],

    start(env, { notification }) {
        const state = reactive({
            enabled: false,     // the user has an extension and the installation has a PBX
            status: "off",      // off | connecting | registered | error
            error: "",
            open: false,        // panel shown
            call: null,         // { id, dir: "in"|"out", number, partner, state: "ringing"|"active", answeredAt, muted, activity }
            finishedActivity: null, // the activity the last call was made for, to offer "Mark done"
            callsChanged: 0,    // bumped after every call, so lists reload
        });
        let config = null;
        let ua = null;
        let session = null;
        let reconnectDelay = 2000;
        let reconnectTimer = null;
        const audio = Object.assign(document.createElement("audio"), { autoplay: true });
        document.body.appendChild(audio);
        let ring = null;
        let notif = null;

        // A desktop notification while Odoo is in the background; clicking it
        // answers (a click is a user gesture, so audio can start).
        function notifyIncoming(call) {
            if (!document.hidden || !("Notification" in window) || Notification.permission !== "granted") return;
            closeNotification();
            try {
                notif = new Notification(_t("Incoming call — click to answer"), {
                    body: call.partner?.name || call.number || _t("Unknown caller"),
                    tag: "phone_bridge-incoming", requireInteraction: true,
                });
                notif.onclick = () => {
                    window.focus();
                    closeNotification();
                    api.answer();
                };
            } catch {
                notif = null;
            }
        }
        function closeNotification() {
            if (notif) {
                notif.close();
                notif = null;
            }
        }

        function normalise(number) {
            let num = String(number || "").replace(/[^+0-9*#]/g, "");
            if (num.startsWith("00")) num = "+" + num.slice(2);
            else if (num.startsWith("0")) num = "+" + config.country_code + num.slice(1);
            // Long bare digit strings already carry their country code; short
            // ones are extensions and feature codes.
            else if (!num.startsWith("+") && num.length > 6) num = "+" + num;
            return num;
        }

        function event(name, extra = {}) {
            const call = state.call;
            if (!call) return Promise.resolve(null);
            return rpc("/phone_bridge/call_event", {
                event: name, call_id: call.id, caller: call.number,
                direction: call.dir === "out" ? "outgoing" : "incoming", ...extra,
            }).catch(() => null);
        }

        async function lookup(call) {
            const partner = await rpc("/phone_bridge/lookup", { number: call.number }).catch(() => false);
            if (partner && state.call && state.call.id === call.id) state.call.partner = partner;
        }

        function startRing() {
            stopRing();
            try {
                const ctx = new AudioContext();
                const beep = () => {
                    for (const at of [0, 0.4]) {
                        const osc = ctx.createOscillator();
                        const gain = ctx.createGain();
                        osc.frequency.value = 440;
                        gain.gain.value = 0.15;
                        osc.connect(gain).connect(ctx.destination);
                        osc.start(ctx.currentTime + at);
                        osc.stop(ctx.currentTime + at + 0.3);
                    }
                };
                beep();
                ring = { ctx, timer: setInterval(beep, 3000) };
            } catch {
                ring = null;
            }
        }
        function stopRing() {
            if (!ring) return;
            clearInterval(ring.timer);
            ring.ctx.close().catch(() => {});
            ring = null;
        }

        function attachAudio(s) {
            const pc = s.sessionDescriptionHandler?.peerConnection;
            if (!pc) return;
            const tracks = pc.getReceivers().map((r) => r.track).filter((t) => t && t.kind === "audio");
            if (tracks.length) {
                audio.srcObject = new MediaStream(tracks);
                audio.play().catch(() => {});
            }
        }

        function watch(s) {
            s.stateChange.addListener((st) => {
                if (st === SIP.SessionState.Established) {
                    stopRing();
                    closeNotification();
                    attachAudio(s);
                    if (state.call) {
                        state.call.state = "active";
                        state.call.answeredAt = Date.now();
                    }
                    event("answer");
                } else if (st === SIP.SessionState.Terminated) {
                    stopRing();
                    closeNotification();
                    const call = state.call;
                    const duration = call?.answeredAt ? Math.round((Date.now() - call.answeredAt) / 1000) : 0;
                    event("hangup", { duration }).then(() => state.callsChanged++);
                    audio.srcObject = null;
                    session = null;
                    if (call?.activity) state.finishedActivity = { ...call.activity, answered: !!call.answeredAt };
                    state.call = null;
                }
            });
        }

        function scheduleReconnect() {
            clearTimeout(reconnectTimer);
            reconnectTimer = setTimeout(connect, reconnectDelay);
            reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
        }

        async function connect() {
            if (ua) {
                const old = ua;
                ua = null;
                old.stop().catch(() => {});
            }
            state.status = "connecting";
            const me = new SIP.UserAgent({
                uri: SIP.UserAgent.makeURI(`sip:${config.extension}@${config.domain}`),
                transportOptions: { server: config.ws_url, keepAliveInterval: 25 },
                authorizationUsername: config.extension,
                authorizationPassword: config.password,
                sessionDescriptionHandlerFactoryOptions: { constraints: { audio: true, video: false } },
                delegate: {
                    onDisconnect: (err) => {
                        if (ua !== me) return;
                        state.status = "error";
                        state.error = err?.message || _t("Connection lost");
                        scheduleReconnect();
                    },
                    onInvite: (inv) => {
                        // Already on a call: busy, so the PBX can send it to voicemail.
                        if (state.call) {
                            inv.reject({ statusCode: 486 }).catch(() => {});
                            return;
                        }
                        session = inv;
                        const number = inv.remoteIdentity.uri.user || inv.remoteIdentity.displayName || "";
                        state.call = { id: inv.request.callId, dir: "in", number, partner: null, state: "ringing", muted: false };
                        state.open = true;
                        startRing();
                        watch(inv);
                        lookup(state.call).then(() => state.call?.state === "ringing" && notifyIncoming(state.call));
                        event("ring");
                    },
                },
            });
            ua = me;
            const registerer = new SIP.Registerer(me, { expires: 600 });
            registerer.stateChange.addListener((st) => {
                if (ua !== me) return;
                if (st === SIP.RegistererState.Registered) {
                    state.status = "registered";
                    state.error = "";
                    reconnectDelay = 2000;
                } else if (st === SIP.RegistererState.Unregistered) {
                    state.status = "error";
                    state.error = _t("Not registered");
                    scheduleReconnect();
                }
            });
            try {
                await me.start();
                await registerer.register();
            } catch (e) {
                if (ua !== me) return;
                state.status = "error";
                state.error = e.message || String(e);
                scheduleReconnect();
            }
        }

        async function init() {
            try {
                config = await rpc("/phone_bridge/softphone/config", {});
            } catch {
                return;
            }
            state.enabled = !!config.enabled;
            if (!state.enabled) return;
            await loadJS("/phone_bridge/static/lib/sip.min.js");
            await connect();
        }

        const api = {
            state,
            toggle() {
                state.open = !state.open;
                // Ask once, from a click, so incoming calls can notify later.
                if (state.enabled && "Notification" in window && Notification.permission === "default") {
                    Notification.requestPermission().catch(() => {});
                }
            },
            /** options.partner {id, name} shows who's being called;
             *  options.activity {id, summary} offers "Mark done" afterwards. */
            async dial(number, options = {}) {
                if (!state.enabled || !ua) {
                    notification.add(_t("Set your phone extension in Preferences → Phone first."), { type: "warning" });
                    return;
                }
                if (state.call) return;
                const target = SIP.UserAgent.makeURI(`sip:${normalise(number)}@${config.domain}`);
                if (!target) {
                    notification.add(_t("That number can't be dialled."), { type: "danger" });
                    return;
                }
                const inviter = new SIP.Inviter(ua, target, {
                    earlyMedia: true,
                    sessionDescriptionHandlerOptions: { constraints: { audio: true, video: false } },
                });
                session = inviter;
                state.finishedActivity = null;
                state.call = {
                    id: inviter.request.callId, dir: "out", number: normalise(number),
                    partner: options.partner || null, state: "ringing", muted: false, activity: options.activity || null,
                };
                state.open = true;
                watch(inviter);
                if (!options.partner) lookup(state.call);
                event("ring");
                inviter.invite().catch((e) => {
                    notification.add(e.message || String(e), { type: "danger" });
                    state.call = null;
                    session = null;
                });
            },
            async markActivityDone(feedback) {
                const act = state.finishedActivity;
                state.finishedActivity = null;
                if (act) await rpc("/phone_bridge/activity_done", { activity_id: act.id, feedback: feedback || "" });
            },
            dismissActivity() {
                state.finishedActivity = null;
            },
            answer() {
                if (session && state.call?.dir === "in" && state.call.state === "ringing") {
                    stopRing();
                    session.accept({ sessionDescriptionHandlerOptions: { constraints: { audio: true, video: false } } }).catch(() => {});
                }
            },
            hangup() {
                if (!session) return;
                stopRing();
                const st = session.state;
                if (st === SIP.SessionState.Established) session.bye().catch(() => {});
                else if (session instanceof SIP.Inviter) session.cancel().catch(() => {});
                else session.reject().catch(() => {});
            },
            toggleMute() {
                const pc = session?.sessionDescriptionHandler?.peerConnection;
                if (!pc || !state.call) return;
                state.call.muted = !state.call.muted;
                for (const sender of pc.getSenders()) {
                    if (sender.track?.kind === "audio") sender.track.enabled = !state.call.muted;
                }
            },
            sendDtmf(digit) {
                if (session?.state === SIP.SessionState.Established) {
                    session.sessionDescriptionHandler?.sendDtmf(digit);
                }
            },
        };

        // tel: links anywhere in Odoo dial through the softphone.
        document.addEventListener("click", (ev) => {
            const link = ev.target.closest?.('a[href^="tel:"]');
            if (!link || !state.enabled || state.status !== "registered") return;
            ev.preventDefault();
            ev.stopPropagation();
            api.dial(decodeURIComponent(link.getAttribute("href").slice(4)));
        }, true);

        init();
        return api;
    },
};

registry.category("services").add("phone_bridge_softphone", softphoneService);
