from odoo import _, api, fields, models
from odoo.exceptions import ValidationError

from .phone_bridge_number import normalize_number

MOBILE_FIELDS = ("phone_bridge_mobile", "phone_bridge_mobile_delay")


class ResUsers(models.Model):
    _inherit = "res.users"

    phone_bridge_extension_id = fields.Many2one(
        "phone_bridge.extension", "Softphone Extension",
        domain="[('user_id', '=', id)]",
        help="The extension the softphone in Odoo signs in as. Don't use one that another device is signed in to at the same time.")
    phone_bridge_extension_ids = fields.One2many("phone_bridge.extension", "user_id", "Extensions")
    phone_bridge_favourite_ids = fields.Many2many(
        "res.partner", "phone_bridge_favourite_rel", "user_id", "partner_id", "Phone Favourites")
    phone_bridge_mobile = fields.Char(
        "Mobile to Ring",
        help="Rings along with your extensions when one of the phone numbers is called (if that number rings "
             "users' mobiles). International format, e.g. +44 7700 900123. Leave empty for none.")
    phone_bridge_mobile_delay = fields.Integer(
        "Ring Mobile After (Seconds)", default=20,
        help="The extensions ring alone for this long first. 0 rings the mobile straight away.")

    @api.constrains(*MOBILE_FIELDS)
    def _check_phone_bridge_mobile(self):
        for user in self:
            if user.phone_bridge_mobile and normalize_number(user.phone_bridge_mobile) != user.phone_bridge_mobile:
                raise ValidationError(_("Enter the mobile in international format, e.g. +44 7700 900123."))
            if not 0 <= user.phone_bridge_mobile_delay <= 120:
                raise ValidationError(_("Ring the mobile after 0 to 120 seconds."))

    @api.model_create_multi
    def create(self, vals_list):
        return super().create([self._clean_mobile(dict(v)) for v in vals_list])

    def write(self, vals):
        res = super().write(self._clean_mobile(dict(vals)))
        if any(f in vals for f in MOBILE_FIELDS) and self.sudo().phone_bridge_extension_ids:
            self.env["phone_bridge.extension"]._sync_pbx()
        return res

    @staticmethod
    def _clean_mobile(vals):
        if vals.get("phone_bridge_mobile"):
            vals["phone_bridge_mobile"] = normalize_number(vals["phone_bridge_mobile"]) or vals["phone_bridge_mobile"]
        return vals

    @property
    def SELF_READABLE_FIELDS(self):
        return super().SELF_READABLE_FIELDS + ["phone_bridge_extension_id", "phone_bridge_extension_ids", "phone_bridge_favourite_ids",
                                             *MOBILE_FIELDS]

    @property
    def SELF_WRITEABLE_FIELDS(self):
        return super().SELF_WRITEABLE_FIELDS + ["phone_bridge_extension_id", "phone_bridge_favourite_ids", *MOBILE_FIELDS]
