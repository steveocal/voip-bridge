import math
from datetime import timedelta

from markupsafe import Markup, escape

from odoo import Command, _, api, fields, models

EARTH_RADIUS_M = 6371000.0


def distance_m(lat1, lon1, lat2, lon2):
    """Great-circle distance in metres (haversine)."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


class StaffLocationStay(models.Model):
    """One place an employee stayed. Each 15-minute reading within
    staff_location.same_place_m of the current stop only moves last_seen on,
    so a stop keeps its arrival time and the visit's length."""

    _name = "staff.location.stay"
    _description = "Staff stop"
    _order = "arrived_at desc"
    _rec_name = "employee_id"

    employee_id = fields.Many2one("hr.employee", required=True, index=True, ondelete="cascade")
    latitude = fields.Float(digits=(10, 7), required=True)
    longitude = fields.Float(digits=(10, 7), required=True)
    accuracy = fields.Integer("Accuracy (m)")
    arrived_at = fields.Datetime("Arrived", required=True, index=True)
    last_seen = fields.Datetime("Last Seen", required=True)
    fix_count = fields.Integer("Readings", default=1)
    duration = fields.Integer("Duration (min)", compute="_compute_duration", store=True)
    partner_id = fields.Many2one("res.partner", "Contact", index=True)
    partner_distance = fields.Integer("Distance to Contact (m)")
    is_meeting = fields.Boolean("Customer Meeting", index=True, readonly=True)
    event_id = fields.Many2one("calendar.event", "Calendar Event", readonly=True, ondelete="set null")

    @api.depends("arrived_at", "last_seen")
    def _compute_duration(self):
        for stay in self:
            if stay.arrived_at and stay.last_seen:
                stay.duration = int((stay.last_seen - stay.arrived_at).total_seconds() // 60)
            else:
                stay.duration = 0

    def _param(self, key, default):
        return float(self.env["ir.config_parameter"].sudo().get_param(f"staff_location.{key}", default))

    # ── Called by the voip-bridge worker ──────────────────────────────────

    @api.model
    def record_fix(self, employee_id, latitude, longitude, accuracy=0, at=False):
        """Add one location reading for an employee. Returns the stop's id."""
        employee = self.env["hr.employee"].browse(int(employee_id)).exists()
        if not employee:
            return False
        at = fields.Datetime.to_datetime(at) if at else fields.Datetime.now()
        last = self.search([("employee_id", "=", employee.id)], order="last_seen desc", limit=1)
        if last and at >= last.last_seen \
                and at - last.last_seen <= timedelta(minutes=self._param("max_gap_min", 120)) \
                and distance_m(last.latitude, last.longitude, latitude, longitude) <= self._param("same_place_m", 20):
            last.write({"last_seen": at, "fix_count": last.fix_count + 1})
            last._check_meeting()
            return last.id
        stay = self.create({
            "employee_id": employee.id,
            "latitude": latitude,
            "longitude": longitude,
            "accuracy": int(accuracy or 0),
            "arrived_at": at,
            "last_seen": at,
        })
        stay._match_partner()
        return stay.id

    # ── Contact matching ──────────────────────────────────────────────────

    def _match_partner(self):
        radius = self._param("match_radius_m", 150)
        # Our own premises aren't customer visits.
        own = self.env["res.company"].sudo().search([]).partner_id
        for stay in self:
            dlat = radius / 111320.0
            dlon = radius / (111320.0 * max(math.cos(math.radians(stay.latitude)), 0.01))
            candidates = self.env["res.partner"].search([
                ("partner_latitude", ">=", stay.latitude - dlat),
                ("partner_latitude", "<=", stay.latitude + dlat),
                ("partner_longitude", ">=", stay.longitude - dlon),
                ("partner_longitude", "<=", stay.longitude + dlon),
                ("partner_latitude", "!=", 0),
                ("commercial_partner_id", "not in", own.ids),
            ])
            best = None
            for partner in candidates:
                d = distance_m(stay.latitude, stay.longitude, partner.partner_latitude, partner.partner_longitude)
                # Nearest wins; at the same address prefer the company record.
                key = (round(d), not partner.is_company)
                if d <= radius and (best is None or key < best[0]):
                    best = (key, partner, d)
            if best:
                stay.write({"partner_id": best[1].id, "partner_distance": int(best[2])})

    # ── Meetings ──────────────────────────────────────────────────────────

    def _check_meeting(self):
        """A long enough stop at a contact becomes a meeting: one calendar
        event (stretched as the stop goes on) and one note on the contact."""
        meeting_min = self._param("meeting_min", 20)
        # Calendar must not email the customer about events we log for them.
        quiet = {"dont_notify": True, "no_mail_to_attendees": True, "mail_create_nolog": True}
        for stay in self.filtered("partner_id"):
            if stay.is_meeting:
                if stay.event_id:
                    stay.event_id.with_context(**quiet).write({"stop": stay.last_seen})
                continue
            if stay.duration < meeting_min:
                continue
            partner = stay.partner_id
            employee = stay.employee_id
            attendees = partner | employee.work_contact_id
            event = self.env["calendar.event"].with_context(**quiet).create({
                "name": _("Visit: %(contact)s", contact=partner.display_name),
                "start": stay.arrived_at,
                "stop": stay.last_seen,
                "user_id": employee.user_id.id or self.env.user.id,
                "partner_ids": [Command.set(attendees.ids)],
                "location": ", ".join(filter(None, (
                    (partner.street or "").strip(), (partner.street2 or "").strip(),
                    (partner.city or "").strip(), (partner.zip or "").strip()))),
                "description": Markup("<p>%s</p>") % _(
                    "Logged from %(employee)s's phone location.", employee=employee.name),
            })
            stay.write({"is_meeting": True, "event_id": event.id})
            partner.message_post(
                body=Markup("<p>📍 %s</p>") % escape(_(
                    "Visit by %(employee)s, arrived %(time)s.",
                    employee=employee.name,
                    time=fields.Datetime.context_timestamp(stay, stay.arrived_at).strftime("%d %b %Y %H:%M"))),
                subtype_xmlid="mail.mt_note",
            )

    def action_open_map(self):
        return {
            "type": "ir.actions.client",
            "tag": "staff_location.map",
            "name": _("Staff Map"),
            "params": {"stay_ids": self.ids},
        }
