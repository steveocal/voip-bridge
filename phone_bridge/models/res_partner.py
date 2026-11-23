from odoo import api, fields, models

# Edits to these send the contact to the worker (see _notify_contacts_changed).
_WORKER_FIELDS = {"name", "company_type", "is_company", "phone", "mobile", "email",
                  "website", "vat", "function", "city", "active"}


class ResPartner(models.Model):
    _inherit = "res.partner"

    # Odoo 19 dropped res.partner.mobile; the phone panel, caller lookup and the
    # Cloudflare worker still rely on it, so phone_bridge provides it again.
    mobile = fields.Char("Mobile")

    phone_bridge_call_ids = fields.One2many("phone_bridge.call", "partner_id", "Calls")
    phone_bridge_call_count = fields.Integer("Call Count", compute="_compute_phone_bridge_call_count")

    @api.model_create_multi
    def create(self, vals_list):
        partners = super().create(vals_list)
        self.env["phone_bridge.installation"]._notify_contacts_changed(partners.ids)
        return partners

    def write(self, vals):
        res = super().write(vals)
        if _WORKER_FIELDS.intersection(vals):
            self.env["phone_bridge.installation"]._notify_contacts_changed(self.ids)
        return res

    def unlink(self):
        ids = self.ids
        res = super().unlink()
        self.env["phone_bridge.installation"]._notify_deleted(contacts=ids)
        return res

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
