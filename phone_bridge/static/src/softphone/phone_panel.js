import { Component, onWillStart, onWillUnmount, useEffect, useState } from "@odoo/owl";
import { rpc } from "@web/core/network/rpc";
import { useService } from "@web/core/utils/hooks";
import { user } from "@web/core/user";
import { _t } from "@web/core/l10n/translation";
import { t9Entry, t9Search } from "./t9";

const KEYS = [
    ["1", ""], ["2", "ABC"], ["3", "DEF"],
    ["4", "GHI"], ["5", "JKL"], ["6", "MNO"],
    ["7", "PQRS"], ["8", "TUV"], ["9", "WXYZ"],
    ["*", ""], ["0", "+"], ["#", ""],
];

// The panel is personal even for administrators (who can see every call in
// the backend): your own calls, and the ones nobody answered.
const MY_CALLS = ["|", ["user_id", "=", user.userId], ["user_id", "=", false]];

/** The phone: a phone-shaped panel docked at the right, laid out like the
 *  VoIP Bridge dashboard. Tabs along the bottom (Activities, Recent, the
 *  keypad, Contacts); an in-call screen takes over while a call is up. */
export class PhonePanel extends Component {
    static template = "phone_bridge.PhonePanel";
    static props = {};

    setup() {
        this.phone = useService("phone_bridge_softphone");
        this.orm = useService("orm");
        this.action = useService("action");
        this.state = useState(this.phone.state);
        this.keys = KEYS;
        this.ui = useState({
            tab: localStorage.getItem("phone_bridge.tab") || "activities",
            contactsTab: localStorage.getItem("phone_bridge.contactsTab") || "all",
            number: "",
            picked: null,       // { num, partner } when the number came from a keypad match
            corpus: [],         // keypad matching: recent callers, then contacts
            search: "",
            dtmf: false,
            xfer: false,        // the transfer box is open
            xferTo: "",
            xferMode: "transfer", // "transfer", or "add" for ➕ Add (a conference)
            loading: false,
            activities: [],
            recent: [],
            contacts: [],
            favouriteIds: [],
            emails: [],
            emailsUpdating: false,
            emailsError: false,
            google: undefined,  // the user's connected Google account; false = none
            reading: null,      // the email open in the reader { id, subject, from, text, html, loading }
            now: Date.now(),
        });
        const tick = setInterval(() => (this.ui.now = Date.now()), 1000);
        // Parked calls change from other phones, so check while the panel is open.
        this.phone.loadParked();
        const parkedPoll = setInterval(() => !document.hidden && this.phone.loadParked(), 5000);
        onWillUnmount(() => { clearInterval(tick); clearInterval(parkedPoll); });
        onWillStart(() => this.loadTab());
        // Lists change after every call.
        useEffect(() => { this.loadTab(); }, () => [this.state.callsChanged]);
    }

    // ── Tabs ──

    setTab(tab) {
        this.ui.tab = tab;
        localStorage.setItem("phone_bridge.tab", tab);
        this.loadTab();
    }

    setContactsTab(tab) {
        this.ui.contactsTab = tab;
        localStorage.setItem("phone_bridge.contactsTab", tab);
        this.loadContacts();
    }

    async loadTab() {
        // Activities always load: the bottom bar shows how many are waiting.
        const loads = [this.loadActivities()];
        if (this.ui.tab === "recent") loads.push(this.loadRecent());
        else if (this.ui.tab === "contacts") loads.push(this.loadContacts());
        else if (this.ui.tab === "emails") loads.push(this.loadEmails());
        else if (this.ui.tab === "keypad") loads.push(this.loadCorpus());
        await Promise.all(loads);
    }

    async loadActivities() {
        this.ui.loading = true;
        try {
            this.ui.activities = await rpc("/phone_bridge/activities", {});
        } finally {
            this.ui.loading = false;
        }
    }

    async loadRecent() {
        this.ui.loading = true;
        try {
            this.ui.recent = await this.orm.searchRead("phone_bridge.call", MY_CALLS,
                ["partner_id", "phone_number", "direction", "state", "start_date", "duration", "voicemail", "voicemail_heard"],
                { limit: 40, order: "start_date desc, id desc" });
        } finally {
            this.ui.loading = false;
        }
    }

    async loadContacts() {
        this.ui.loading = true;
        try {
            const [me] = await this.orm.read("res.users", [user.userId], ["phone_bridge_favourite_ids"]);
            this.ui.favouriteIds = me.phone_bridge_favourite_ids;
            const fields = ["display_name", "phone", "mobile", "is_company", "parent_id"];
            if (this.ui.contactsTab === "favourites") {
                this.ui.contacts = this.ui.favouriteIds.length
                    ? await this.orm.searchRead("res.partner", [["id", "in", this.ui.favouriteIds]], fields, { order: "name" })
                    : [];
            } else {
                const q = this.ui.search.trim();
                const domain = [["active", "=", true], "|", ["phone", "!=", false], ["mobile", "!=", false]];
                if (q) domain.push("|", "|", ["name", "ilike", q], ["phone", "ilike", q], ["mobile", "ilike", q]);
                this.ui.contacts = await this.orm.searchRead("res.partner", domain, fields, { limit: 50, order: "name" });
            }
        } finally {
            this.ui.loading = false;
        }
    }

    // ── Emails: the last week's mail in Odoo, newest first. The last list
    // shows at once (localStorage) and a fresh one replaces it in the
    // background; a failed refresh keeps the old list. ──

    // Emails come from the worker's Gmail (the last week, newest first). The
    // last list shows at once from localStorage ("updating…") and is
    // refreshed in the background; a failed refresh keeps it ("offline copy").
    async loadEmails() {
        const key = `phone_bridge.gmail.${user.userId}`;
        if (!this.ui.emails.length) {
            try {
                this.ui.emails = JSON.parse(localStorage.getItem(key) || "{}").messages || [];
            } catch {
                this.ui.emails = [];
            }
        }
        this.ui.emailsUpdating = true;
        this.ui.emailsError = false;
        rpc("/phone_bridge/google_status", {}).then((g) => (this.ui.google = g), () => {});
        try {
            const res = await rpc("/phone_bridge/emails", { days: 7 });
            if (!res.ok) throw new Error("no gmail");
            const text = (html) => new DOMParser().parseFromString(html || "", "text/html").body.textContent;
            const emails = res.messages
                .map((m) => ({
                    id: m.gmail_id,
                    from: (m.email_from || "").replace(/<.*>/, "").replace(/"/g, "").trim() || m.email_from,
                    outgoing: m.direction === "outgoing",
                    subject: m.subject || _t("(no subject)"),
                    // Gmail's snippet is HTML-escaped text.
                    preview: text(m.body).replace(/\s+/g, " ").trim().slice(0, 110),
                    date: m.date || 0,
                }))
                .sort((a, b) => b.date - a.date);
            this.ui.emails = emails;
            try {
                localStorage.setItem(key, JSON.stringify({ at: Date.now(), messages: emails }));
            } catch {
                // storage full or blocked: the list still shows, just not cached
            }
        } catch {
            this.ui.emailsError = true;
        } finally {
            this.ui.emailsUpdating = false;
        }
    }

    emailWhen(email) {
        const d = luxon.DateTime.fromMillis(email.date);
        return d.hasSame(luxon.DateTime.local(), "day") ? d.toFormat("HH:mm") : d.toFormat("ccc d LLL");
    }

    async openEmail(email) {
        this.ui.reading = { ...email, loading: true, text: "", html: "" };
        const body = await rpc("/phone_bridge/email", { gmail_id: email.id }).catch(() => ({}));
        if (this.ui.reading?.id === email.id) Object.assign(this.ui.reading, { loading: false, text: body.text || "", html: body.html || "" });
    }

    closeEmail() {
        this.ui.reading = null;
    }

    // An HTML email in a sandboxed iframe: no scripts, links open in a new
    // tab, a light page since most emails assume one.
    get readingDoc() {
        return '<base target="_blank"><style>body{margin:10px;font-family:sans-serif;background:#fff;color:#111;word-break:break-word}img{max-width:100%;height:auto}</style>' +
            this.ui.reading.html;
    }

    fitEmailFrame(ev) {
        try {
            ev.target.style.height = `${ev.target.contentDocument.documentElement.scrollHeight + 4}px`;
        } catch {
            // cross-origin: keep the default height
        }
    }

    onSearch(ev) {
        this.ui.search = ev.target.value;
        clearTimeout(this.searchTimer);
        this.searchTimer = setTimeout(() => this.loadContacts(), 250);
    }

    async toggleFavourite(partner) {
        const on = this.ui.favouriteIds.includes(partner.id);
        await this.orm.write("res.users", [user.userId], {
            phone_bridge_favourite_ids: [[on ? 3 : 4, partner.id]],
        });
        await this.loadContacts();
    }

    // ── Recent, grouped by day (headers scroll with the list) ──

    get recentGroups() {
        const groups = [];
        const today = new Date().toDateString();
        const yesterday = new Date(Date.now() - 86400000).toDateString();
        for (const call of this.ui.recent) {
            const d = call.start_date ? luxon.DateTime.fromSQL(call.start_date, { zone: "utc" }).toLocal() : null;
            const key = d ? d.toJSDate().toDateString() : "";
            const label = !d ? _t("Earlier") : key === today ? _t("Today") : key === yesterday ? _t("Yesterday") : d.toFormat("ccc d LLL");
            if (!groups.length || groups.at(-1).key !== key) groups.push({ key, label, calls: [] });
            groups.at(-1).calls.push({ ...call, time: d ? d.toFormat("HH:mm") : "" });
        }
        return groups;
    }

    callIcon(call) {
        if (call.voicemail) return "fa-envelope-o";
        if (call.state === "missed") return "fa-phone text-danger";
        return call.direction === "outgoing" ? "fa-arrow-up" : "fa-arrow-down";
    }

    // ── Keypad matches: recent callers first, then every contact with a
    // number (reloaded at most every 10 minutes) ──

    async loadCorpus() {
        if (this.corpusAt && Date.now() - this.corpusAt < 10 * 60 * 1000) return;
        this.corpusAt = Date.now();
        try {
            const [recent, partners] = await Promise.all([
                this.orm.searchRead("phone_bridge.call", [...MY_CALLS, ["phone_number", "!=", false]], ["partner_id", "phone_number"], { limit: 100, order: "start_date desc, id desc" }),
                this.orm.searchRead("res.partner", [["active", "=", true], "|", ["phone", "!=", false], ["mobile", "!=", false]], ["display_name", "phone", "mobile"], { limit: 5000, order: "name" }),
            ]);
            const out = [];
            for (const c of recent) {
                const partner = c.partner_id ? { id: c.partner_id[0], name: c.partner_id[1] } : null;
                out.push(t9Entry(partner ? partner.name : "", c.phone_number, partner));
            }
            for (const p of partners) {
                const partner = { id: p.id, name: p.display_name };
                if (p.mobile) out.push(t9Entry(p.display_name, p.mobile, partner));
                if (p.phone && p.phone.replace(/[^0-9]/g, "") !== (p.mobile || "").replace(/[^0-9]/g, "")) out.push(t9Entry(p.display_name, p.phone, partner));
            }
            this.ui.corpus = out;
        } catch {
            this.corpusAt = 0;
        }
    }

    get suggestions() {
        if (this.ui.picked && this.ui.picked.num === this.ui.number) return [];
        return t9Search(this.ui.corpus, this.ui.number, 8);
    }

    // Tap a match to put its number in the box; its phone icon calls straight away.
    pickSuggestion(s) {
        this.ui.number = s.num;
        this.ui.picked = { num: s.num, partner: s.partner };
    }

    callSuggestion(s) {
        this.phone.dial(s.num, s.partner ? { partner: s.partner } : {});
        this.ui.number = "";
        this.ui.picked = null;
    }

    // ── Dialling ──

    pressKey(key) {
        if (this.state.call) this.phone.sendDtmf(key);
        else this.ui.number += key;
    }

    backspace() {
        this.ui.number = this.ui.number.slice(0, -1);
    }

    dialTyped() {
        const n = this.ui.number.trim();
        if (!n) return;
        const picked = this.ui.picked && this.ui.picked.num === this.ui.number ? this.ui.picked.partner : null;
        this.phone.dial(n, picked ? { partner: picked } : {});
        this.ui.number = "";
        this.ui.picked = null;
    }

    onKeypadInput(ev) {
        this.ui.number = ev.target.value;
    }

    onKeypadKeydown(ev) {
        if (ev.key === "Enter") this.dialTyped();
    }

    callContact(partner, number) {
        this.phone.dial(number, { partner: { id: partner.id, name: partner.display_name } });
    }

    callRecent(call) {
        this.phone.dial(call.phone_number, call.partner_id ? { partner: { id: call.partner_id[0], name: call.partner_id[1] } } : {});
    }

    callActivity(act) {
        this.phone.dial(act.phone, { partner: act.partner || { id: 0, name: act.record_name }, activity: { id: act.id, summary: act.summary } });
    }

    async activityDone(act) {
        await rpc("/phone_bridge/activity_done", { activity_id: act.id });
        await this.loadActivities();
    }

    async markFinishedDone() {
        await this.phone.markActivityDone();
        await this.loadActivities();
    }

    // ── Opening records ──

    openPartner(id) {
        if (id) this.action.doAction({ type: "ir.actions.act_window", res_model: "res.partner", res_id: id, views: [[false, "form"]] });
    }

    openRecord(model, id) {
        this.action.doAction({ type: "ir.actions.act_window", res_model: model, res_id: id, views: [[false, "form"]] });
    }

    openCall(id) {
        this.action.doAction({ type: "ir.actions.act_window", res_model: "phone_bridge.call", res_id: id, views: [[false, "form"]] });
    }

    // ── In call ──

    // ── Transfer / park ──

    /** mode "add" is ➕ Add: the same box, but only "Call" (a consult that
     *  👥 Merge then joins into a conference). */
    openTransfer(mode = "transfer") {
        this.ui.xfer = !(this.ui.xfer && this.ui.xferMode === mode);
        this.ui.xferMode = mode;
        this.ui.xferTo = "";
        this.ui.dtmf = false;
    }

    transfer(blind) {
        const to = this.ui.xferTo.trim();
        if (!to) return;
        this.ui.xfer = false;
        if (blind) this.phone.blindTransfer(to);
        else this.phone.consultTransfer(to);
    }

    pickUpParked(slot) {
        if (!this.state.call) this.phone.dial(slot);
    }

    get callStatus() {
        const call = this.state.call;
        if (!call) return "";
        const consult = this.state.consult;
        if (consult && call.conf) return consult.up ? _t("Talking to %s · conference waiting", consult.target) : _t("Calling %s · conference waiting", consult.target);
        if (consult) return consult.up ? _t("Talking to %s · caller on hold", consult.target) : _t("Calling %s · caller on hold", consult.target);
        if (this.state.merging) return _t("Merging…");
        if (call.conf && call.held) return _t("Conference · you're muted");
        if (call.held) return _t("On hold");
        if (call.state === "ringing") return call.dir === "in" ? _t("Incoming call") : _t("Calling…");
        const s = Math.max(0, Math.floor((this.ui.now - call.answeredAt) / 1000));
        return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    }

    get statusLabel() {
        return { registered: _t("Ready"), connecting: _t("Connecting…"), error: _t("Offline") }[this.state.status] || _t("Off");
    }
}
