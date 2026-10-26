from odoo import _, api, fields, models
from odoo.exceptions import ValidationError


class PhoneBridgeExtension(models.Model):
    """A SIP extension on the phone system, and its voicemail box.

    The extension itself (endpoint, password) is configured on the PBX; this
    record says who it belongs to, lets that user's softphone sign in as it,
    and holds the voicemail settings, which are sent to the worker on every
    change (see phone_bridge.installation._sync_voicemail_box).
    """

    _name = "phone_bridge.extension"
    _description = "Phone Extension"
    _order = "number"
    _rec_names_search = ["number", "name"]

    number = fields.Char(required=True, index=True, help="The extension number on the phone system, e.g. 201.")
    name = fields.Char(help="What it is, e.g. Desk phone, Android app.")
    user_id = fields.Many2one("res.users", "User", domain=[("share", "=", False)],
                              help="Who takes this extension's calls and gets its voicemail alerts.")
    sip_password = fields.Char("SIP Password", groups="base.group_system",
                               help="As set for this extension on the phone system. The user's softphone signs in with it.")
    active = fields.Boolean(default=True)

    voicemail_enabled = fields.Boolean("Voicemail", default=True,
                                       help="Unanswered calls go to voicemail. When off, callers hear a busy tone.")
    greeting = fields.Binary(attachment=True, help="A WAV recording (16-bit, any sample rate, up to 2 minutes). "
                                                   "Without one, callers hear the standard prompt.")
    greeting_filename = fields.Char()
    voicemail_email = fields.Char("Email Voicemail To", compute="_compute_voicemail_email", store=True, readonly=False,
                                  help="Comma-separated. Each message is emailed with its transcript and audio.")

    _sql_constraints = [("number_uniq", "unique(number)", "That extension already exists.")]

    @api.depends("user_id")
    def _compute_voicemail_email(self):
        for ext in self:
            if not ext.voicemail_email and ext.user_id.email:
                ext.voicemail_email = ext.user_id.email

    @api.depends("number", "name")
    def _compute_display_name(self):
        for ext in self:
            ext.display_name = f"{ext.number} {ext.name}" if ext.name else ext.number

    @api.constrains("number")
    def _check_number(self):
        for ext in self:
            if not (ext.number or "").isdigit() or not 2 <= len(ext.number) <= 6:
                raise ValidationError(_("An extension number is 2 to 6 digits."))

    # ── Keep the worker's copy in step ──

    VOICEMAIL_FIELDS = ("number", "voicemail_enabled", "greeting", "active")

    @api.model_create_multi
    def create(self, vals_list):
        exts = super().create(vals_list)
        for ext in exts:
            ext._push_box(with_greeting=True)
        return exts

    def write(self, vals):
        old_numbers = {ext.id: ext.number for ext in self} if "number" in vals or vals.get("active") is False else {}
        res = super().write(vals)
        if any(f in vals for f in self.VOICEMAIL_FIELDS):
            installation = self.env["phone_bridge.installation"]._get_installation()
            for ext in self:
                if ext.id in old_numbers and (old_numbers[ext.id] != ext.number or not ext.active):
                    installation._delete_voicemail_box(old_numbers[ext.id])
                if ext.active:
                    ext._push_box(with_greeting="greeting" in vals or "number" in vals)
        return res

    def unlink(self):
        numbers = self.mapped("number")
        res = super().unlink()
        installation = self.env["phone_bridge.installation"]._get_installation()
        for number in numbers:
            installation._delete_voicemail_box(number)
        return res

    def _push_box(self, with_greeting):
        self.ensure_one()
        self.env["phone_bridge.installation"]._get_installation()._sync_voicemail_box(
            self.number, self.voicemail_enabled, self.greeting if with_greeting else None, with_greeting)
