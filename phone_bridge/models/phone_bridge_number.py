import re

from odoo import _, api, fields, models
from odoo.exceptions import ValidationError


def normalize_number(value):
    """+44 1283 246490 / 0044 (1283) 246490 → +441283246490; None when it
    isn't an international number. The PBX config is built from it, so only
    digits get through."""
    s = re.sub(r"[\s().-]", "", value or "")
    if s.startswith("00"):
        s = "+" + s[2:]
    if not re.fullmatch(r"\+[1-9]\d{6,14}", s):
        return None
    return s


class PhoneBridgeNumber(models.Model):
    """One of the phone numbers callers ring (a DID on the trunk), and who
    answers it. The PBX routes calls to it from here (pbx-sync.sh keeps its
    copy in step through the worker), so nobody edits the dialplan for it."""

    _name = "phone_bridge.number"
    _description = "Phone Number"
    _order = "number"
    _rec_names_search = ["number", "name"]

    number = fields.Char(required=True, index=True,
                         help="In international format, e.g. +44 1283 246490: the number callers dial.")
    name = fields.Char(help="What it is, e.g. Sales, Website.")
    extension_ids = fields.Many2many("phone_bridge.extension", "phone_bridge_number_extension_rel",
                                     "number_id", "extension_id", "Ring These Extensions",
                                     help="They all ring at once. An extension forwarded \"Always\" rings its "
                                          "forwarding number instead.")
    ring_mobiles = fields.Boolean("Ring Their Users' Mobiles", default=True,
                                  help="Also ring the mobile of each user these extensions belong to (set on the "
                                       "user, with how long the phones get first).")
    ring_seconds = fields.Integer("Ring For (Seconds)", default=45, required=True)
    no_answer = fields.Selection([("voicemail", "Voicemail"), ("forward", "Forward to a number"), ("hangup", "Hang up")],
                                 "When Nobody Answers", default="voicemail", required=True)
    no_answer_number = fields.Char("Forward To", help="In international format, e.g. +44 7700 900123.")
    record = fields.Boolean("Record Calls", default=True)
    answer = fields.Selection([("ring", "Ring extensions"), ("menu", "Play a menu")], "Answer With",
                              default="ring", required=True,
                              help="During opening hours (or always, without opening hours).")
    menu_id = fields.Many2one("phone_bridge.menu", "Menu")
    calendar_id = fields.Many2one("resource.calendar", "Opening Hours",
                                  help="A Working Schedule (with its public holidays and closures). Outside it, "
                                       "calls get the out-of-hours handling below. Empty: always open.")
    closed_message = fields.Text("Out-of-Hours Message",
                                 help="Spoken first out of hours, e.g. \"We're closed. Our hours are 9 to 5.\" Optional.")
    voice = fields.Selection("_voices", default="athena", required=True)
    closed_action = fields.Selection([("voicemail", "Voicemail"), ("forward", "Forward to a number"),
                                      ("menu", "Play a menu"), ("hangup", "Hang up")],
                                     "Out of Hours", default="voicemail", required=True)
    closed_number = fields.Char("Forward To (Out of Hours)")
    closed_menu_id = fields.Many2one("phone_bridge.menu", "Menu (Out of Hours)")
    active = fields.Boolean(default=True)

    @api.model
    def _voices(self):
        from .phone_bridge_menu import VOICES
        return VOICES

    _sql_constraints = [("number_uniq", "unique(number)", "That number is already set up.")]

    @api.depends("number", "name")
    def _compute_display_name(self):
        for num in self:
            num.display_name = f"{num.number} {num.name}" if num.name else num.number

    @api.constrains("number", "no_answer", "no_answer_number", "ring_seconds", "answer", "menu_id",
                    "calendar_id", "closed_action", "closed_number", "closed_menu_id", "closed_message")
    def _check_number(self):
        for num in self:
            if normalize_number(num.number) != num.number:
                raise ValidationError(_("Enter the number in international format, e.g. +44 1283 246490."))
            if num.no_answer == "forward" and not normalize_number(num.no_answer_number):
                raise ValidationError(_("Enter the number to forward to in international format, e.g. +44 7700 900123."))
            if not 5 <= num.ring_seconds <= 300:
                raise ValidationError(_("Ring for 5 to 300 seconds."))
            if num.answer == "menu" and not num.menu_id:
                raise ValidationError(_("Choose the menu to answer with."))
            if num.calendar_id and num.closed_action == "forward" and not normalize_number(num.closed_number):
                raise ValidationError(_("Enter the out-of-hours number in international format, e.g. +44 7700 900123."))
            if num.calendar_id and num.closed_action == "menu" and not num.closed_menu_id:
                raise ValidationError(_("Choose the out-of-hours menu."))
            if len(num.closed_message or "") > 1000:
                raise ValidationError(_("Keep the out-of-hours message to 1000 characters."))

    @staticmethod
    def _clean(vals):
        for f in ("number", "no_answer_number", "closed_number"):
            if vals.get(f):
                vals[f] = normalize_number(vals[f]) or vals[f]
        return vals

    @api.model_create_multi
    def create(self, vals_list):
        nums = super().create([self._clean(dict(v)) for v in vals_list])
        self.env["phone_bridge.extension"]._sync_pbx()
        return nums

    def write(self, vals):
        res = super().write(self._clean(dict(vals)))
        self.env["phone_bridge.extension"]._sync_pbx()
        return res

    def unlink(self):
        res = super().unlink()
        self.env["phone_bridge.extension"]._sync_pbx()
        return res
