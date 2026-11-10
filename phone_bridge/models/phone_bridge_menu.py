from odoo import _, api, fields, models
from odoo.exceptions import ValidationError

from .phone_bridge_number import normalize_number

# Workers AI Aura voices (the worker turns the prompts into speech).
VOICES = [("athena", "Athena (British, female)"), ("helios", "Helios (British, male)"),
          ("angus", "Angus (Irish, male)"), ("asteria", "Asteria (American, female)"),
          ("luna", "Luna (American, female)"), ("stella", "Stella (American, female)"),
          ("hera", "Hera (American, female)"), ("orion", "Orion (American, male)"),
          ("arcas", "Arcas (American, male)"), ("perseus", "Perseus (American, male)"),
          ("orpheus", "Orpheus (American, male)"), ("zeus", "Zeus (American, male)")]

ACTIONS = [("ring", "Ring extensions"), ("forward", "Forward to a number"), ("voicemail", "Voicemail"),
           ("menu", "Another menu"), ("repeat", "Repeat this menu"), ("hangup", "Hang up")]
# Keys only: who rings depends on the caller.
KEY_ACTIONS = ACTIONS[:1] + [("salesperson", "Customer's salesperson")] + ACTIONS[1:]
TEAM_RING = [("all", "All at once"), ("each", "One at a time")]

KEYS = [(k, k) for k in "1234567890*#"]

MAX_PROMPT = 1000


def check_action(rec, action, number, menu, what):
    if action == "forward" and not normalize_number(number):
        raise ValidationError(rec.env._("%s: enter the number to forward to in international format, e.g. +44 7700 900123.", what))
    if action == "menu" and not menu:
        raise ValidationError(rec.env._("%s: choose the menu to go to.", what))


class PhoneBridgeMenu(models.Model):
    """A phone menu (IVR): a spoken prompt and what each key does. The
    worker turns the prompt into speech and the PBX plays it, so the words
    are changed here, not on the PBX."""

    _name = "phone_bridge.menu"
    _description = "Phone Menu"
    _order = "name"

    name = fields.Char(required=True)
    prompt = fields.Text(required=True,
                         help="What callers hear, e.g. \"Thanks for calling. For sales press 1, for accounts press 2.\" "
                              "Spoken by the chosen voice.")
    voice = fields.Selection(VOICES, default="athena", required=True)
    option_ids = fields.One2many("phone_bridge.menu.option", "menu_id", "Keys", copy=True)
    timeout = fields.Integer("Wait For a Key (Seconds)", default=5, required=True)
    retries = fields.Integer("Repeat the Prompt", default=2, required=True,
                             help="How many more times the prompt is played when no key or a wrong key is pressed.")
    spoken = fields.Boolean("Callers Can Say Their Choice",
                            help="Callers can say what they want (\"sales\", \"my heater's stopped working\") instead of "
                                 "pressing a key. Their answer is matched against each key's Name and What It's For; "
                                 "keys still work. Give every key a name, and say the names in the prompt, e.g. "
                                 "\"Say sales or press 1, say technical or press 2.\"")
    direct_dial = fields.Boolean("Callers Can Dial an Extension",
                                 help="Callers who know an extension number can type it during the prompt.")
    ring_seconds = fields.Integer("Ring For (Seconds)", default=30, required=True,
                                  help="How long \"Ring extensions\" keys ring before voicemail. For \"Customer's "
                                       "salesperson\": how long the salesperson rings, then the sales team (each "
                                       "person in turn when they ring one at a time).")
    noinput_action = fields.Selection([a for a in ACTIONS if a[0] != "repeat"], "When No Key Is Pressed",
                                      default="voicemail", required=True,
                                      help="After the prompt has been repeated.")
    noinput_extension_ids = fields.Many2many("phone_bridge.extension", "phone_bridge_menu_noinput_ext_rel",
                                             "menu_id", "extension_id", "Ring These Extensions")
    noinput_number = fields.Char("Forward To")
    noinput_menu_id = fields.Many2one("phone_bridge.menu", "Go To Menu")
    active = fields.Boolean(default=True)

    @api.constrains("prompt", "timeout", "retries", "ring_seconds", "noinput_action", "noinput_number", "noinput_menu_id",
                    "spoken", "option_ids")
    def _check_menu(self):
        for menu in self:
            if menu.spoken:
                unnamed = menu.option_ids.filtered(lambda o: not (o.name or "").strip())
                if unnamed:
                    raise ValidationError(_("Callers can say their choice: give key %s a name (e.g. Sales) so it can be said.",
                                            ", ".join(unnamed.mapped("key"))))
            if len(menu.prompt or "") > MAX_PROMPT:
                raise ValidationError(_("Keep the prompt to %s characters.", MAX_PROMPT))
            if not 1 <= menu.timeout <= 30:
                raise ValidationError(_("Wait 1 to 30 seconds for a key."))
            if not 0 <= menu.retries <= 5:
                raise ValidationError(_("Repeat the prompt 0 to 5 times."))
            if not 5 <= menu.ring_seconds <= 300:
                raise ValidationError(_("Ring for 5 to 300 seconds."))
            check_action(menu, menu.noinput_action, menu.noinput_number, menu.noinput_menu_id, _("When no key is pressed"))

    @api.model_create_multi
    def create(self, vals_list):
        for v in vals_list:
            if v.get("noinput_number"):
                v["noinput_number"] = normalize_number(v["noinput_number"]) or v["noinput_number"]
        menus = super().create(vals_list)
        self.env["phone_bridge.extension"]._sync_pbx()
        return menus

    def write(self, vals):
        if vals.get("noinput_number"):
            vals = dict(vals, noinput_number=normalize_number(vals["noinput_number"]) or vals["noinput_number"])
        res = super().write(vals)
        self.env["phone_bridge.extension"]._sync_pbx()
        return res

    def unlink(self):
        res = super().unlink()
        self.env["phone_bridge.extension"]._sync_pbx()
        return res


class PhoneBridgeMenuOption(models.Model):
    _name = "phone_bridge.menu.option"
    _description = "Phone Menu Key"
    _order = "menu_id, sequence, key"

    menu_id = fields.Many2one("phone_bridge.menu", required=True, ondelete="cascade", index=True)
    sequence = fields.Integer(default=10)
    key = fields.Selection(KEYS, required=True)
    name = fields.Char("Name", help="The department or choice, e.g. Sales. In a menu callers can speak to, it's what "
                                    "they say, and they hear \"Putting you through to Sales\".")
    description = fields.Text("What It's For",
                              help="What this choice handles, so callers who describe what they want reach the right "
                                   "place, e.g. \"buying heaters, prices and quotes, placing an order\".")
    action = fields.Selection(KEY_ACTIONS, required=True, default="ring",
                              help="Customer's salesperson: callers whose number belongs to a contact with a "
                                   "Salesperson (or whose company has one) ring that salesperson's extension first. "
                                   "No answer, or no salesperson: the extensions listed here (the sales team) ring, "
                                   "then voicemail.")
    extension_ids = fields.Many2many("phone_bridge.extension", "phone_bridge_menu_option_ext_rel",
                                     "option_id", "extension_id", "Ring These Extensions",
                                     help="For \"Customer's salesperson\": the sales team, rung when the "
                                          "salesperson doesn't answer or the caller has none.")
    team_ring = fields.Selection(TEAM_RING, "Then Ring the Team", default="all",
                                 help="For \"Customer's salesperson\": ring the extensions all at once, or one at "
                                      "a time in the order listed.")
    number = fields.Char("Forward To")
    submenu_id = fields.Many2one("phone_bridge.menu", "Go To Menu")

    _sql_constraints = [("key_uniq", "unique(menu_id, key)", "Each key can only be used once in a menu.")]

    @api.constrains("action", "number", "submenu_id", "name")
    def _check_option(self):
        for opt in self:
            check_action(opt, opt.action, opt.number, opt.submenu_id, _("Key %s", opt.key))
            if opt.menu_id.spoken and not (opt.name or "").strip():
                raise ValidationError(_("Callers can say their choice: give key %s a name (e.g. Sales) so it can be said.", opt.key))
            if len(opt.name or "") > 60 or len(opt.description or "") > 500:
                raise ValidationError(_("Key %s: keep the name to 60 characters and What It's For to 500.", opt.key))

    @api.model_create_multi
    def create(self, vals_list):
        for v in vals_list:
            if v.get("number"):
                v["number"] = normalize_number(v["number"]) or v["number"]
        opts = super().create(vals_list)
        self.env["phone_bridge.extension"]._sync_pbx()
        return opts

    def write(self, vals):
        if vals.get("number"):
            vals = dict(vals, number=normalize_number(vals["number"]) or vals["number"])
        res = super().write(vals)
        self.env["phone_bridge.extension"]._sync_pbx()
        return res

    def unlink(self):
        res = super().unlink()
        self.env["phone_bridge.extension"]._sync_pbx()
        return res
