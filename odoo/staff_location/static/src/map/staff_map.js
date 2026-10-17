import { Component, onMounted, onWillUnmount, useRef, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { loadCSS, loadJS } from "@web/core/assets";
import { serializeDateTime, formatDateTime } from "@web/core/l10n/dates";

const { DateTime } = luxon;

const LEAFLET = "/web_map/static/lib/leaflet/leaflet";
// One colour per employee for their route; meetings are drawn larger.
const COLOURS = ["#1f77b4", "#d62728", "#2ca02c", "#9467bd", "#ff7f0e", "#17becf", "#8c564b", "#e377c2"];

/** Map of staff stops for one day (or the stops picked in a list view),
 *  each employee's stops joined in time order. */
export class StaffMap extends Component {
    static template = "staff_location.StaffMap";
    static props = ["*"];

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.mapRef = useRef("map");
        const ids = this.props.action?.params?.stay_ids;
        this.state = useState({
            day: DateTime.local().toISODate(),
            employeeId: "",
            employees: [],
            stays: [],
            pickedIds: ids && ids.length ? ids : null,
        });
        onMounted(async () => {
            await Promise.all([loadCSS(`${LEAFLET}.css`), loadJS(`${LEAFLET}.js`)]);
            this.map = L.map(this.mapRef.el).setView([52.8, -1.6], 7);
            L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
                maxZoom: 19,
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            }).addTo(this.map);
            this.layer = L.layerGroup().addTo(this.map);
            this.state.employees = await this.orm.searchRead("hr.employee", [], ["name"], { order: "name" });
            await this.load();
        });
        onWillUnmount(() => this.map?.remove());
    }

    async load() {
        let domain;
        if (this.state.pickedIds) {
            domain = [["id", "in", this.state.pickedIds]];
        } else {
            const start = DateTime.fromISO(this.state.day).startOf("day");
            domain = [
                ["last_seen", ">=", serializeDateTime(start)],
                ["arrived_at", "<", serializeDateTime(start.plus({ days: 1 }))],
            ];
            if (this.state.employeeId) {
                domain.push(["employee_id", "=", parseInt(this.state.employeeId)]);
            }
        }
        this.state.stays = await this.orm.searchRead("staff.location.stay", domain,
            ["employee_id", "latitude", "longitude", "arrived_at", "last_seen", "duration", "partner_id", "is_meeting"],
            { order: "arrived_at asc" });
        this.draw();
    }

    draw() {
        this.layer.clearLayers();
        const byEmployee = new Map();
        for (const s of this.state.stays) {
            const key = s.employee_id[0];
            if (!byEmployee.has(key)) byEmployee.set(key, []);
            byEmployee.get(key).push(s);
        }
        const points = [];
        let i = 0;
        for (const stays of byEmployee.values()) {
            const colour = COLOURS[i++ % COLOURS.length];
            const line = stays.map((s) => [s.latitude, s.longitude]);
            if (line.length > 1) L.polyline(line, { color: colour, weight: 3, opacity: 0.6 }).addTo(this.layer);
            for (const s of stays) {
                const marker = L.circleMarker([s.latitude, s.longitude], {
                    radius: s.is_meeting ? 11 : s.partner_id ? 8 : 5,
                    color: colour,
                    fillColor: s.is_meeting ? "#2ca02c" : colour,
                    fillOpacity: s.is_meeting ? 0.9 : 0.5,
                    weight: 2,
                }).addTo(this.layer);
                marker.bindPopup(this.popup(s));
                marker.on("popupopen", (ev) => {
                    ev.popup.getElement().querySelector("a[data-stay]")?.addEventListener("click", (e) => {
                        e.preventDefault();
                        this.openStay(s.id);
                    });
                });
                points.push([s.latitude, s.longitude]);
            }
        }
        if (points.length) this.map.fitBounds(points, { padding: [40, 40], maxZoom: 16 });
    }

    popup(s) {
        const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
        const time = (v) => formatDateTime(DateTime.fromSQL(v, { zone: "utc" }).setZone("default"), { format: "HH:mm" });
        return `<b>${esc(s.employee_id[1])}</b><br/>`
            + (s.partner_id ? `${s.is_meeting ? "🤝 Meeting: " : "Near "}${esc(s.partner_id[1])}<br/>` : "")
            + `${time(s.arrived_at)}–${time(s.last_seen)} (${s.duration} min)<br/>`
            + `<a href="#" data-stay="${s.id}">Open stop</a>`;
    }

    openStay(id) {
        this.action.doAction({ type: "ir.actions.act_window", res_model: "staff.location.stay", res_id: id, views: [[false, "form"]] });
    }

    async onDay(ev) { this.state.day = ev.target.value; this.state.pickedIds = null; await this.load(); }
    async shiftDay(days) {
        this.state.day = DateTime.fromISO(this.state.day).plus({ days }).toISODate();
        this.state.pickedIds = null;
        await this.load();
    }
    async onEmployee(ev) { this.state.employeeId = ev.target.value; this.state.pickedIds = null; await this.load(); }
}

registry.category("actions").add("staff_location.map", StaffMap);
