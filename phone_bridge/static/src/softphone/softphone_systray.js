import { Component, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { PhonePanel } from "./phone_panel";

/** The phone icon in the navbar (status dot = registration); opens the panel. */
export class SoftphoneSystray extends Component {
    static template = "phone_bridge.SoftphoneSystray";
    static components = { PhonePanel };
    static props = {};

    setup() {
        this.phone = useService("phone_bridge_softphone");
        this.state = useState(this.phone.state);
    }

    get dotClass() {
        return { registered: "bg-success", connecting: "bg-warning", error: "bg-danger" }[this.state.status] || "bg-secondary";
    }
}

registry.category("systray").add("phone_bridge.softphone", { Component: SoftphoneSystray }, { sequence: 5 });
