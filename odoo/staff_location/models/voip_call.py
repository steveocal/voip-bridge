from odoo import api, models


class VoipCall(models.Model):
    _inherit = "voip.call"

    @api.model_create_multi
    def create(self, vals_list):
        calls = super().create(vals_list)
        # A contact we're talking to gets a location if it has none yet, so
        # visits to them can be recognised later.
        partners = calls.partner_id.filtered(lambda p: not p.partner_latitude and (p.zip or p.street))
        if partners:
            try:
                with self.env.cr.savepoint():
                    partners._staff_geocode()
            except Exception:
                pass  # geocoding is best-effort; never lose the call over it
        return calls
