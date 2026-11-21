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
    record_notice = fields.Boolean("Tell Callers Calls Are Recorded", default=False,
                                   help="Play the notice below before anything else, while the call is still "
                                        "ringing. UK GDPR expects callers to be told before they are recorded.")
    record_notice_text = fields.Char("Recording Notice",
                                     default="Calls may be recorded for training and quality purposes.")
    emergency_address = fields.Text("Emergency Address (999)",
                                    help="Where this number's phones are, for 999 and 112 calls: building, street, "
                                         "town and postcode. Calls to 999 from the extensions this number rings show "
                                         "this number, so the operator finds this address. Register the same address "
                                         "for this number with the phone carrier: the carrier holds the address the "
                                         "emergency services see.")
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
    queue_calls = fields.Boolean("Queue Callers",
                                 help="Hold callers in a queue, with music and their place in line, while the "
                                      "extensions ring, instead of going to \"When Nobody Answers\" after Ring For. "
                                      "Each ring attempt lasts Ring For; callers wait up to Longest Wait.")
    queue_strategy = fields.Selection([("ringall", "Ring everyone at once"),
                                       ("rrmemory", "One at a time, taking turns"),
                                       ("leastrecent", "One at a time, whoever answered least recently")],
                                      "Ring", default="ringall", required=True)
    queue_max_wait = fields.Integer("Longest Wait (Seconds)", default=300, required=True,
                                    help="Then the caller gets \"When Nobody Answers\".")
    queue_announce_position = fields.Boolean("Tell Callers Their Place in Line", default=True)
    queue_options = fields.Boolean("Offer a Message or a Callback", default=True,
                                   help="While waiting, callers can press 1 to leave a voicemail, or 2 to be called "
                                        "back: the call shows in the call history as missed, asking for a callback.")
    queue_message = fields.Text("Queue Message",
                                help="Spoken every 45 seconds while callers wait. Empty: \"Thank you for holding. "
                                     "We'll be with you as soon as we can.\" and, with the options on, how to "
                                     "leave a message or ask for a callback.")
    active = fields.Boolean(default=True)

    @api.model
    def _voices(self):
        from .phone_bridge_menu import VOICES
        return VOICES

    _number_uniq = models.Constraint(
        "unique(number)",
        "That number is already set up.",
    )

    @api.depends("number", "name")
    def _compute_display_name(self):
        for num in self:
            num.display_name = f"{num.number} {num.name}" if num.name else num.number

    @api.constrains("number", "no_answer", "no_answer_number", "ring_seconds", "answer", "menu_id",
                    "calendar_id", "closed_action", "closed_number", "closed_menu_id", "closed_message",
                    "queue_calls", "queue_max_wait", "queue_message")
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
            if num.queue_calls and not 30 <= num.queue_max_wait <= 3600:
                raise ValidationError(_("Let callers wait 30 to 3600 seconds in the queue."))
            if len(num.queue_message or "") > 500:
                raise ValidationError(_("Keep the queue message to 500 characters."))

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
