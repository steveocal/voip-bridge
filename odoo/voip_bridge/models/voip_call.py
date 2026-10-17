from odoo import api, fields, models


class VoipCall(models.Model):
    _inherit = "voip.call"

    bridge_call_id = fields.Char("Asterisk Call ID", index=True, readonly=True, copy=False)
    bridge_did = fields.Char("Our Number", readonly=True)
    voicemail = fields.Boolean(readonly=True)
    duration = fields.Integer("Duration (s)", compute="_compute_duration", store=True)
    notes = fields.Html()
    transcript = fields.Text(readonly=True)
    recording = fields.Binary(attachment=True, readonly=True)
    recording_filename = fields.Char(readonly=True)

    _sql_constraints = [
        ("bridge_call_id_uniq", "unique(bridge_call_id)", "This Asterisk call is already logged."),
    ]

    @api.depends("start_date", "end_date")
    def _compute_duration(self):
        for call in self:
            if call.start_date and call.end_date:
                call.duration = int((call.end_date - call.start_date).total_seconds())
            else:
                call.duration = 0
