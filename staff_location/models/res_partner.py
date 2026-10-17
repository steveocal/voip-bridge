from odoo import _, api, fields, models


class ResPartner(models.Model):
    _inherit = "res.partner"

    # Bulk geocoding hits OpenStreetMap's Nominatim, which allows one request
    # a second, so one click handles a batch rather than the whole selection.
    GEOCODE_BATCH = 40

    def _staff_geocode(self):
        """Geocode from street (falling back to postcode), never just the
        city: a city-centre point would match every stop in that town.
        Returns the partners that got coordinates."""
        geocoder = self.env["base.geocoder"]
        done = self.browse()
        for partner in self.with_context(lang="en_US"):
            if not (partner.zip or partner.street):
                continue
            country = partner.country_id.name or "United Kingdom"
            result = None
            if partner.street:
                result = geocoder.geo_find(geocoder.geo_query_address(
                    street=partner.street, zip=partner.zip, city=partner.city,
                    state=partner.state_id.name, country=country), force_country=country)
            if result is None and partner.zip:
                result = geocoder.geo_find(geocoder.geo_query_address(
                    zip=partner.zip, country=country), force_country=country)
            if result:
                partner.write({
                    "partner_latitude": result[0],
                    "partner_longitude": result[1],
                    "date_localization": fields.Date.context_today(partner),
                })
                done |= partner
        return done

    def action_staff_geocode(self):
        todo = self.filtered(lambda p: not p.partner_latitude and (p.zip or p.street))
        batch = todo[:self.GEOCODE_BATCH]
        done = batch._staff_geocode()
        left = len(todo) - len(batch)
        message = _("Located %(done)s of %(tried)s contacts.", done=len(done), tried=len(batch))
        if left:
            message += " " + _("%(left)s more still need locating: run it again.", left=left)
        return {
            "type": "ir.actions.client",
            "tag": "display_notification",
            "params": {"title": _("Geocode contacts"), "message": message, "sticky": bool(left),
                       "type": "success" if done else "warning"},
        }
