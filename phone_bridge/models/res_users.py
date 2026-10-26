from odoo import fields, models


class ResUsers(models.Model):
    _inherit = "res.users"

    phone_bridge_extension_id = fields.Many2one(
        "phone_bridge.extension", "Softphone Extension",
        domain="[('user_id', '=', id)]",
        help="The extension the softphone in Odoo signs in as. Don't use one that another device is signed in to at the same time.")
    phone_bridge_extension_ids = fields.One2many("phone_bridge.extension", "user_id", "Extensions")
    phone_bridge_favourite_ids = fields.Many2many(
        "res.partner", "phone_bridge_favourite_rel", "user_id", "partner_id", "Phone Favourites")

    @property
    def SELF_READABLE_FIELDS(self):
        return super().SELF_READABLE_FIELDS + ["phone_bridge_extension_id", "phone_bridge_extension_ids", "phone_bridge_favourite_ids"]

    @property
    def SELF_WRITEABLE_FIELDS(self):
        return super().SELF_WRITEABLE_FIELDS + ["phone_bridge_extension_id", "phone_bridge_favourite_ids"]
