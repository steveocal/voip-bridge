import { Component, onWillStart, onWillUnmount, useEffect, useState } from "@odoo/owl";
import { rpc } from "@web/core/network/rpc";
import { useService } from "@web/core/utils/hooks";
import { user } from "@web/core/user";
import { _t } from "@web/core/l10n/translation";

const KEYS = [
    ["1", ""], ["2", "ABC"], ["3", "DEF"],
    ["4", "GHI"], ["5", "JKL"], ["6", "MNO"],
    ["7", "PQRS"], ["8", "TUV"], ["9", "WXYZ"],
    ["*", ""], ["0", "+"], ["#", ""],
];

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
            search: "",
            dtmf: false,
            loading: false,
            activities: [],
            recent: [],
            contacts: [],
            favouriteIds: [],
            emails: [],
            emailsUpdating: false,
            emailsError: false,
            now: Date.now(),
        });
        const tick = setInterval(() => (this.ui.now = Date.now()), 1000);
        onWillUnmount(() => clearInterval(tick));
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
            this.ui.recent = await this.orm.searchRead("phone_bridge.call", [],
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

    async loadEmails() {
        const key = `phone_bridge.emails.${user.userId}`;
        if (!this.ui.emails.length) {
            try {
                this.ui.emails = JSON.parse(localStorage.getItem(key) || "{}").messages || [];
            } catch {
                this.ui.emails = [];
            }
        }
        this.ui.emailsUpdating = true;
        this.ui.emailsError = false;
        try {
            const since = luxon.DateTime.utc().minus({ days: 7 }).toFormat("yyyy-MM-dd HH:mm:ss");
            const rows = await this.orm.searchRead("mail.message",
                [["message_type", "=", "email"], ["date", ">=", since]],
                ["author_id", "email_from", "subject", "body", "date", "model", "res_id", "record_name"],
                { limit: 50, order: "date desc, id desc" });
            const myPartner = user.partnerId;
            const emails = rows.map((m) => ({
                id: m.id,
                from: m.author_id ? m.author_id[1] : (m.email_from || "").replace(/<.*>/, "").trim() || m.email_from,
                partnerId: m.author_id ? m.author_id[0] : false,
                outgoing: !!(m.author_id && m.author_id[0] === myPartner),
                subject: m.subject || m.record_name || _t("(no subject)"),
                preview: new DOMParser().parseFromString(m.body || "", "text/html").body.textContent.replace(/\s+/g, " ").trim().slice(0, 110),
                date: m.date,
                model: m.model,
                resId: m.res_id,
                record: m.record_name,
            }));
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
        const d = luxon.DateTime.fromSQL(email.date, { zone: "utc" }).toLocal();
        return d.hasSame(luxon.DateTime.local(), "day") ? d.toFormat("HH:mm") : d.toFormat("ccc d LLL");
    }

    openEmail(email) {
        if (email.model && email.resId) this.openRecord(email.model, email.resId);
        else if (email.partnerId) this.openPartner(email.partnerId);
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
        this.phone.dial(n);
        this.ui.number = "";
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

    get callStatus() {
        const call = this.state.call;
        if (!call) return "";
        if (call.state === "ringing") return call.dir === "in" ? _t("Incoming call") : _t("Calling…");
        const s = Math.max(0, Math.floor((this.ui.now - call.answeredAt) / 1000));
        return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    }

    get statusLabel() {
        return { registered: _t("Ready"), connecting: _t("Connecting…"), error: _t("Offline") }[this.state.status] || _t("Off");
    }
}
