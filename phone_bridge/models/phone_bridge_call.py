from odoo import _, api, fields, models

CALL_STATES = [
    ("calling", "Calling"),
    ("ongoing", "Ongoing"),
    ("terminated", "Answered"),
    ("missed", "Missed"),
    ("rejected", "Rejected"),
    ("aborted", "Cancelled"),
]


class PhoneBridgeCall(models.Model):
    """One call, as the worker logged it (all of its legs folded into one).

    The worker writes these through bridge_upsert() only, so this model is the
    contract between the two; phone_bridge_enterprise extends bridge_upsert to
    mirror calls into Odoo's own voip.call.
    """

    _name = "phone_bridge.call"
    _description = "Phone Call"
    _inherit = ["mail.thread", "mail.activity.mixin"]
    _order = "start_date desc, id desc"
    _rec_name = "display_name"

    bridge_call_id = fields.Char("PBX Call ID", index=True, readonly=True, copy=False)
    phone_number = fields.Char(required=True, index=True)
    direction = fields.Selection([("incoming", "Incoming"), ("outgoing", "Outgoing")], required=True, default="incoming")
    state = fields.Selection(CALL_STATES, required=True, default="calling", tracking=True)
    start_date = fields.Datetime(index=True)
    end_date = fields.Datetime()
    duration = fields.Integer("Duration (s)", compute="_compute_duration", store=True)
    partner_id = fields.Many2one("res.partner", "Contact", index=True, tracking=True)
    user_id = fields.Many2one("res.users", "User", index=True,
                              help="Who made or took the call: the owner of its extension.")
    extension = fields.Char(readonly=True, index=True,
                            help="The extension that made or took the call; empty for calls to our numbers nobody answered.")
    extension_id = fields.Many2one("phone_bridge.extension", "Extension Record",
                                   compute="_compute_extension_id", store=True)
    did = fields.Char("Our Number", readonly=True)
    voicemail = fields.Boolean(readonly=True)
    notes = fields.Html()
    transcript = fields.Text(readonly=True)
    recording = fields.Binary(attachment=True, readonly=True)
    recording_filename = fields.Char(readonly=True)

    voicemail_box = fields.Char("Mailbox", readonly=True, index=True,
                                help='"main" for calls to our numbers, otherwise the extension the message was left for.')
    voicemail_extension_id = fields.Many2one("phone_bridge.extension", "For Extension",
                                             compute="_compute_voicemail_extension_id", store=True)
    voicemail_heard = fields.Boolean("Heard")
    voicemail_notified = fields.Boolean(readonly=True, copy=False)

    _sql_constraints = [
        ("bridge_call_id_uniq", "unique(bridge_call_id)", "This PBX call is already logged."),
    ]

    # Fields the worker may set through bridge_upsert.
    BRIDGE_FIELDS = (
        "phone_number", "direction", "state", "start_date", "end_date", "partner_id",
        "did", "extension", "voicemail", "voicemail_box", "notes", "transcript",
    )

    @api.depends("extension")
    def _compute_extension_id(self):
        Extension = self.env["phone_bridge.extension"].with_context(active_test=False)
        for call in self:
            call.extension_id = Extension.search([("number", "=", call.extension)], limit=1) if call.extension else False

    @api.depends("voicemail_box")
    def _compute_voicemail_extension_id(self):
        Extension = self.env["phone_bridge.extension"].with_context(active_test=False)
        for call in self:
            box = call.voicemail_box
            call.voicemail_extension_id = Extension.search([("number", "=", box)], limit=1) if box and box != "main" else False

    def action_mark_heard(self):
        self.write({"voicemail_heard": True})
        self.activity_feedback(["mail.mail_activity_data_todo"], feedback=_("Listened"))

    @api.model
    def bridge_notify_voicemail(self, ids):
        """The worker calls this once a voicemail's audio is in. Emails the
        box's address(es) with the transcript and audio, and gives the box's
        user a to-do activity. Each message is only sent out once."""
        calls = self.browse(ids).exists().filtered(lambda c: c.voicemail and not c.voicemail_notified)
        installation = self.env["phone_bridge.installation"]._get_installation()
        template = self.env.ref("phone_bridge.mail_template_voicemail", raise_if_not_found=False)
        for call in calls:
            ext = call.voicemail_extension_id
            if ext:
                email_to, user = ext.voicemail_email, ext.user_id
            else:
                email_to, user = installation.main_voicemail_email, installation.main_voicemail_user_id
            if email_to and template:
                attachments = self.env["ir.attachment"].sudo().search([
                    ("res_model", "=", self._name), ("res_id", "=", call.id), ("res_field", "=", "recording")], limit=1)
                copies = attachments.copy({"res_field": False, "name": call.recording_filename or "voicemail.wav",
                                           "mimetype": "audio/wav"}) if attachments else attachments
                template.send_mail(call.id, email_values={"email_to": email_to, "attachment_ids": copies.ids})
            # Portal and public users can't open calls in Odoo, so they get
            # the email only.
            if user and not user.share:
                call.activity_schedule(
                    "mail.mail_activity_data_todo", user_id=user.id,
                    summary=_("Voicemail from %s", call.partner_id.name or call.phone_number),
                    note=call.transcript or _("No transcript."))
            call.voicemail_notified = True
        return True

    def _voicemail_box_label(self):
        self.ensure_one()
        if self.voicemail_extension_id:
            return self.voicemail_extension_id.display_name
        return _("main number") if self.voicemail_box in (False, "main") else self.voicemail_box

    @api.depends("start_date", "end_date")
    def _compute_duration(self):
        for call in self:
            if call.start_date and call.end_date and call.end_date > call.start_date:
                call.duration = int((call.end_date - call.start_date).total_seconds())
            else:
                call.duration = 0

    @api.depends("partner_id", "phone_number", "direction")
    def _compute_display_name(self):
        for call in self:
            who = call.partner_id.name or call.phone_number or ""
            call.display_name = f"{'To' if call.direction == 'outgoing' else 'From'} {who}"

    @api.model
    def bridge_upsert(self, vals):
        """Create or update the call identified by vals["bridge_call_id"].

        Called by the worker over XML-RPC; unknown keys are ignored so an
        older module keeps working with a newer worker. Returns the call id.
        """
        call_id = vals.get("bridge_call_id")
        if not call_id:
            raise ValueError("bridge_call_id is required")
        clean = {k: vals[k] for k in self.BRIDGE_FIELDS if k in vals}
        if clean.get("partner_id") and not self.env["res.partner"].browse(clean["partner_id"]).exists():
            clean["partner_id"] = False
        # A known extension makes the call that user's (their own call history).
        if clean.get("extension"):
            ext = self.env["phone_bridge.extension"].with_context(active_test=False).search(
                [("number", "=", str(clean["extension"]))], limit=1)
            if ext.user_id:
                clean["user_id"] = ext.user_id.id
        call = self.search([("bridge_call_id", "=", call_id)], limit=1)
        if call:
            call.write(clean)
        else:
            call = self.create({**clean, "bridge_call_id": call_id})
        return call.id
