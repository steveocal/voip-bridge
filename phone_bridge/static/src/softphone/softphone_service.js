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
            call: null,         // { id, dir: "in"|"out", number, partner, state: "ringing"|"active", answeredAt, muted, activity, conf, confWith }
            finishedActivity: null, // the activity the last call was made for, to offer "Mark done"
            callsChanged: 0,    // bumped after every call, so lists reload
            consult: null,      // { target, up } while talking to a transfer target or someone to add, the caller on hold
            merging: false,     // 👥 Merge is moving everyone into the conference room
            parked: [],         // [{ slot, number, name }] waiting in the PBX's parking lot
        });
        let config = null;
        let ua = null;
        let session = null;
        let consultSession = null;
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

        // ── Hold / transfer / park ──
        // Hold is a re-INVITE with the SDP made sendonly (the PBX plays the
        // caller music on hold). A blind transfer REFERs the caller to the
        // target; an attended one holds the caller, calls the target, then
        // REFERs the caller onto that call. Park is a blind transfer to the
        // PBX's parking extension.
        async function setHold(s, hold) {
            const sdh = s.sessionDescriptionHandler;
            const options = hold && sdh ? { sessionDescriptionHandlerModifiers: [(d) => sdh.holdModifier(d)] } : {};
            await s.invite(options);
            for (const sender of s.sessionDescriptionHandler?.peerConnection?.getSenders() || []) {
                if (sender.track?.kind === "audio") sender.track.enabled = !hold && !state.call?.muted;
            }
        }
        function target(number) {
            return SIP.UserAgent.makeURI(`sip:${normalise(number)}@${config.domain}`);
        }
        function referOn(s, to) {
            return new Promise((resolve, reject) => {
                s.refer(to, { requestDelegate: { onAccept: resolve, onReject: () => reject(new Error(_t("Transfer refused"))) } })
                    .catch(reject);
            });
        }
        function refer(to) {
            return referOn(session, to);
        }
        function setSending(s, on) {
            for (const sender of s?.sessionDescriptionHandler?.peerConnection?.getSenders() || []) {
                if (sender.track?.kind === "audio") sender.track.enabled = on;
            }
        }
        // In a conference, hold just stops our mic: a re-INVITE there gains
        // nothing, and the room's audio isn't played while we talk to someone
        // else (attachAudio plays one call at a time).
        async function holdLeg(hold) {
            if (state.call?.conf) setSending(session, !hold && !state.call.muted);
            else await setHold(session, hold);
        }
        function endSession(s) {
            if (s.state === SIP.SessionState.Established) s.bye().catch(() => {});
            else if (s instanceof SIP.Inviter) s.cancel().catch(() => {});
            else s.dispose();
        }
        // The consult call is over: back to the caller, off hold.
        async function backToCaller() {
            consultSession = null;
            state.consult = null;
            if (session?.state !== SIP.SessionState.Established) return;
            attachAudio(session);
            await holdLeg(false).catch(() => {});
            if (state.call) state.call.held = false;
        }
        async function loadParked() {
            state.parked = await rpc("/phone_bridge/parked", {}).catch(() => state.parked);
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

        // ── Conference ──
        // ➕ Add calls someone while the caller waits, as "Talk first" does.
        // 👥 Merge then REFERs both far ends into the PBX's conference room
        // for this extension (Conference Prefix + extension, e.g. 8201) and
        // dials into it as the host. Once in the room, merging someone
        // REFERs just their leg in. The PBX ends the room for everyone when
        // the host hangs up (docs/asterisk.md).
        function conferenceRoom() {
            return target(config.conference_prefix + config.extension);
        }
        function joinConference(room) {
            if (!state.call) return; // hung up while merging
            const inv = new SIP.Inviter(ua, room, { sessionDescriptionHandlerOptions: { constraints: { audio: true, video: false } } });
            session = inv;
            state.merging = false;
            state.call.held = false;
            audio.srcObject = null;
            inv.stateChange.addListener((st) => {
                if (session !== inv) return;
                if (st === SIP.SessionState.Established) {
                    attachAudio(inv);
                    setSending(inv, !state.call?.muted);
                } else if (st === SIP.SessionState.Terminated) {
                    finishCall();
                }
            });
            inv.invite().catch(() => {
                if (session !== inv) return;
                notification.add(_t("Couldn't join the conference"), { type: "danger" });
                finishCall();
            });
        }

        function finishCall() {
            stopRing();
            closeNotification();
            const call = state.call;
            const duration = call?.answeredAt ? Math.round((Date.now() - call.answeredAt) / 1000) : 0;
            event("hangup", { duration }).then(() => state.callsChanged++);
            audio.srcObject = null;
            session = null;
            if (consultSession) endSession(consultSession);
            consultSession = null;
            state.consult = null;
            state.merging = false;
            loadParked();
            if (call?.activity) state.finishedActivity = { ...call.activity, answered: !!call.answeredAt };
            state.call = null;
        }

        function watch(s) {
            s.stateChange.addListener((st) => {
                // A merge moves the call onto the conference leg; this leg
                // hanging up then isn't the call ending.
                if (session !== s) return;
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
                    finishCall();
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
                        state.call = { id: inv.request.callId, dir: "in", number, partner: null, state: "ringing", muted: false, held: false };
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
                    partner: options.partner || null, state: "ringing", muted: false, held: false, activity: options.activity || null,
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
                if (!session) {
                    if (state.merging) finishCall();
                    return;
                }
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
                // Muting while held (in a conference) must not unmute the mic.
                const sending = !state.call.muted && !(state.call.conf && state.call.held);
                for (const sender of pc.getSenders()) {
                    if (sender.track?.kind === "audio") sender.track.enabled = sending;
                }
            },
            async toggleHold() {
                if (session?.state !== SIP.SessionState.Established || state.consult || !state.call) return;
                const hold = !state.call.held;
                try {
                    await holdLeg(hold);
                    state.call.held = hold;
                } catch (e) {
                    notification.add(e.message || _t("Hold failed"), { type: "danger" });
                }
            },
            /** Send the caller to `number` straight away. */
            async blindTransfer(number) {
                const to = target(number);
                if (!to || session?.state !== SIP.SessionState.Established) return;
                // The PBX hangs our leg up once the caller is on their way.
                await refer(to).catch((e) => notification.add(e.message || String(e), { type: "danger" }));
            },
            /** Hold the caller and call `number` to talk first. */
            async consultTransfer(number) {
                const to = target(number);
                if (!to || session?.state !== SIP.SessionState.Established || consultSession) return;
                try {
                    if (!state.call.held) await holdLeg(true);
                    state.call.held = true;
                } catch (e) {
                    notification.add(e.message || _t("Hold failed"), { type: "danger" });
                    return;
                }
                const inv = new SIP.Inviter(ua, to, { sessionDescriptionHandlerOptions: { constraints: { audio: true, video: false } } });
                consultSession = inv;
                state.consult = { target: normalise(number), up: false };
                inv.stateChange.addListener((st) => {
                    if (st === SIP.SessionState.Established && state.consult) {
                        state.consult.up = true;
                        attachAudio(inv);
                    } else if (st === SIP.SessionState.Terminated && consultSession === inv) {
                        backToCaller();
                    }
                });
                inv.invite().catch(() => consultSession === inv && backToCaller());
            },
            /** Put the caller through to the person we've been talking to. */
            async completeTransfer() {
                if (consultSession?.state !== SIP.SessionState.Established) return;
                await refer(consultSession).catch((e) => notification.add(e.message || String(e), { type: "danger" }));
            },
            cancelConsult() {
                const c = consultSession;
                if (!c) return;
                consultSession = null;
                endSession(c);
                backToCaller();
            },
            canConference() {
                return !!(config?.conference_prefix && config.extension);
            },
            /** Join the caller and the person we've been talking to into one call. */
            async merge() {
                const c = consultSession;
                if (c?.state !== SIP.SessionState.Established || !state.call || !config?.conference_prefix) return;
                const room = conferenceRoom();
                const who = state.consult.target;
                consultSession = null;
                state.consult = null;
                if (state.call.conf) {
                    state.call.confWith.push(who);
                    // The PBX hangs their leg to us up once they're in the room.
                    referOn(c, room).catch((e) => {
                        notification.add(e.message || _t("Couldn't add %s", who), { type: "danger" });
                        endSession(c);
                    });
                    await backToCaller();
                    return;
                }
                const old = session;
                // Out of `session`, so the old legs hanging up doesn't end the call.
                session = null;
                state.merging = true;
                state.call.conf = true;
                state.call.confWith = [state.call.partner?.name || state.call.number, who];
                try {
                    await Promise.all([referOn(c, room), referOn(old, room)]);
                } catch (e) {
                    notification.add(e.message || _t("Merge failed"), { type: "danger" });
                    if (!state.call) return;
                    if (old.state === SIP.SessionState.Established) {
                        session = old;
                        state.merging = false;
                        state.call.conf = false;
                        if (c.state === SIP.SessionState.Established) {
                            consultSession = c;
                            state.consult = { target: who, up: true };
                        } else {
                            await backToCaller();
                        }
                        return;
                    }
                    // The caller is already in the room; whoever made it is there.
                }
                joinConference(room);
            },
            canPark() {
                return !!config?.park_extension;
            },
            async park() {
                if (!config?.park_extension || session?.state !== SIP.SessionState.Established) return;
                await refer(target(config.park_extension))
                    .then(() => setTimeout(loadParked, 1500))
                    .catch((e) => notification.add(e.message || String(e), { type: "danger" }));
            },
            loadParked,
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
