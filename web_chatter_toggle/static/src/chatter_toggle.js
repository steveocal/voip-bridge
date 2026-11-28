/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { registry } from "@web/core/registry";
import { reactive, toRaw, useState } from "@odoo/owl";
import { browser } from "@web/core/browser/browser";
import { _t } from "@web/core/l10n/translation";
import { FormController } from "@web/views/form/form_controller";

const STORAGE_PREFIX = "web_chatter_toggle:";

// Shared, reactive {model: hidden} map. The form control panel button writes
// it, the Chatter reads it, so both re-render together.
const store = reactive({});

function readHidden(model) {
    try {
        return browser.localStorage.getItem(STORAGE_PREFIX + model) === "1";
    } catch {
        return false;
    }
}

function writeHidden(model, hidden) {
    try {
        if (hidden) {
            browser.localStorage.setItem(STORAGE_PREFIX + model, "1");
        } else {
            browser.localStorage.removeItem(STORAGE_PREFIX + model);
        }
    } catch {
        // storage unavailable (private mode, quota) - toggle still works for
        // the current session, it just won't be remembered.
    }
}

// Seed a model's value without notifying observers (safe during setup).
function ensureModel(model) {
    const raw = toRaw(store);
    if (model && !(model in raw)) {
        raw[model] = readHidden(model);
    }
}

// --- Form control panel button ------------------------------------------
patch(FormController.prototype, {
    setup() {
        super.setup(...arguments);
        const xmlDoc = this.archInfo && this.archInfo.xmlDoc;
        this.chatterToggleModel = this.props.resModel;
        this.hasChatterToggle = Boolean(
            xmlDoc && xmlDoc.querySelector("chatter, div.oe_chatter")
        );
        ensureModel(this.chatterToggleModel);
        this.chatterToggle = useState(store);
    },

    get chatterToggleHidden() {
        return Boolean(this.chatterToggle[this.chatterToggleModel]);
    },

    get chatterToggleTitle() {
        return this.chatterToggleHidden ? _t("Show chatter") : _t("Hide chatter");
    },

    onClickToggleChatter() {
        const model = this.chatterToggleModel;
        const hidden = !this.chatterToggleHidden;
        this.chatterToggle[model] = hidden;
        writeHidden(model, hidden);
    },
});

// --- Chatter: carry the hidden flag as a data attribute on its root -------
// The Chatter component has moved around between Odoo versions. Resolve it
// from the module loader at service start instead of a hard import that would
// break the whole asset bundle on the wrong path.
function resolveChatter() {
    const known = [
        "@mail/chatter/web_portal/chatter",
        "@mail/chatter/web/chatter",
        "@mail/core/web/chatter",
        "@mail/core_web/chatter",
    ];
    const modules = odoo.loader.modules;
    for (const path of known) {
        const mod = modules.get(path);
        if (mod && mod.Chatter) {
            return mod.Chatter;
        }
    }
    for (const [, mod] of modules) {
        if (mod && mod.Chatter && mod.Chatter.template === "mail.Chatter") {
            return mod.Chatter;
        }
    }
    return null;
}

function patchChatter(Chatter) {
    patch(Chatter.prototype, {
        setup() {
            super.setup(...arguments);
            ensureModel(this.props.threadModel);
            this.chatterToggle = useState(store);
        },

        get chatterToggleHidden() {
            return Boolean(this.chatterToggle && this.chatterToggle[this.props.threadModel]);
        },
    });
}

registry.category("services").add("web_chatter_toggle", {
    start() {
        const Chatter = resolveChatter();
        if (Chatter) {
            patchChatter(Chatter);
        } else {
            console.warn("web_chatter_toggle: Chatter component not found; toggle disabled");
        }
        return {};
    },
});
