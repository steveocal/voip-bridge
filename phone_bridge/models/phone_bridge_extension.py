import logging
import secrets

from odoo import _, api, fields, models
from odoo.exceptions import UserError, ValidationError

_logger = logging.getLogger(__name__)


class PhoneBridgeExtension(models.Model):
    """A SIP extension on the phone system, and its voicemail box.

    This record is the extension: the PBX builds its endpoint (password,
    device settings, internal dialling) from it. After every change the worker
    is told to re-read the extensions (POST /extensions/sync), and the PBX
    pulls them from the worker (pbx-sync.sh), so no one edits the PBX by hand.
    The voicemail settings go to the worker the same way
    (phone_bridge.installation._sync_voicemail_box).
    """

    _name = "phone_bridge.extension"
    _description = "Phone Extension"
    _order = "number"
    _rec_names_search = ["number", "name"]

    number = fields.Char(required=True, index=True, help="The extension number on the phone system, e.g. 201.")
    name = fields.Char(help="What it is, e.g. Desk phone, Android app.")
    user_id = fields.Many2one("res.users", "User",
                              help="Who takes this extension's calls and gets its voicemail alerts: any user, "
                                   "internal, portal or public. Odoo only links internal users to employees, so "
                                   "an employee record is not required.")
    user_share = fields.Boolean(related="user_id.share", string="Portal/Public User")
    sip_password = fields.Char("SIP Password", groups="base.group_system", copy=False,
                               default=lambda self: secrets.token_urlsafe(18),
                               help="The phone system uses this as the extension's password; the user's softphone, "
                                    "app or desk phone signs in with it. A strong one is made for new extensions.")
    device_type = fields.Selection([("webrtc", "Browser or app"), ("sip", "Desk phone (SIP)")], "Device",
                                   default="webrtc", required=True,
                                   help="Browser or app: the dashboard, the Odoo softphone or the Android app (WebRTC). "
                                        "Desk phone: a SIP handset or softphone such as Linphone.")
    wake_app = fields.Boolean("Wake the Phone App",
                              help="The Android app signs in as this extension: send it a push to wake it before ringing.")
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

    @api.constrains("sip_password")
    def _check_sip_password(self):
        for ext in self.sudo():
            pw = ext.sip_password or ""
            # The PBX config is generated from it, so keep it to safe characters.
            if pw and (len(pw) < 6 or len(pw) > 64 or not all(c.isascii() and (c.isalnum() or c in "._~-") for c in pw)):
                raise ValidationError(_("A SIP password is 6 to 64 letters, digits or . _ ~ -"))

    # ── Keep the worker's copy in step ──

    VOICEMAIL_FIELDS = ("number", "voicemail_enabled", "greeting", "active")
    PBX_FIELDS = ("number", "name", "user_id", "sip_password", "device_type", "wake_app", "active")

    @api.model_create_multi
    def create(self, vals_list):
        exts = super().create(vals_list)
        for ext in exts:
            ext._push_box(with_greeting=True)
        self._sync_pbx()
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
        if any(f in vals for f in self.PBX_FIELDS):
            self._sync_pbx()
        return res

    def unlink(self):
        numbers = self.mapped("number")
        res = super().unlink()
        installation = self.env["phone_bridge.installation"]._get_installation()
        for number in numbers:
            installation._delete_voicemail_box(number)
        self._sync_pbx()
        return res

    @api.model
    def _sync_pbx(self):
        """Have the worker re-read the extensions and pass them to the PBX.
        Saving never fails on this: the PBX also pulls them every few minutes."""
        try:
            self.env["phone_bridge.installation"]._get_installation()._worker_request("POST", "/extensions/sync")
        except UserError as e:
            _logger.warning("phone_bridge: extension sync to the worker failed: %s", e)

    def _push_box(self, with_greeting):
        self.ensure_one()
        self.env["phone_bridge.installation"]._get_installation()._sync_voicemail_box(
            self.number, self.voicemail_enabled, self.greeting if with_greeting else None, with_greeting)
