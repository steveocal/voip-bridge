from odoo import fields, models


class ResPartner(models.Model):
    _inherit = "res.partner"

    phone_bridge_call_ids = fields.One2many("phone_bridge.call", "partner_id", "Calls")
    phone_bridge_call_count = fields.Integer("Call Count", compute="_compute_phone_bridge_call_count")

    def _compute_phone_bridge_call_count(self):
        counts = dict(self.env["phone_bridge.call"]._read_group(
            [("partner_id", "in", self.ids)], ["partner_id"], ["__count"]))
        for partner in self:
            partner.phone_bridge_call_count = counts.get(partner, 0)

    def action_view_phone_bridge_calls(self):
        self.ensure_one()
        action = self.env["ir.actions.act_window"]._for_xml_id("phone_bridge.action_phone_bridge_call")
        action["domain"] = [("partner_id", "=", self.id)]
        action["context"] = {"default_partner_id": self.id}
        return action
