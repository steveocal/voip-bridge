import { Component } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { standardFieldProps } from "@web/views/fields/standard_field_props";

// Inline <audio> player for a Binary field holding a WAV/MP3 file.
export class AudioField extends Component {
    static template = "voip_bridge.AudioField";
    static props = { ...standardFieldProps };

    get src() {
        const { record, name } = this.props;
        const params = new URLSearchParams({
            model: record.resModel,
            id: record.resId,
            field: name,
            filename_field: "recording_filename",
            mimetype: "audio/wav",
        });
        return `/web/content?${params}`;
    }
}

registry.category("fields").add("audio_player", {
    component: AudioField,
    supportedTypes: ["binary"],
});
