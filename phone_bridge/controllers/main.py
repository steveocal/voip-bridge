import logging
import re

import requests

from odoo import fields, http
from odoo.http import request

_logger = logging.getLogger(__name__)


def phone_key(number):
    """Last 9 digits, the same comparison key the worker uses (phoneKey)."""
    digits = re.sub(r"\D", "", number or "")
    return digits[-9:] if len(digits) >= 7 else ""


class PhoneBridgeController(http.Controller):

    def _installation(self):
        return request.env["phone_bridge.installation"].sudo().search([], limit=1)

    @http.route("/phone_bridge/softphone/config", type="json", auth="user")
    def softphone_config(self):
        inst = self._installation()
        ext = request.env.user.phone_bridge_extension_id.sudo()
        config = {
            "ws_url": inst.sip_ws_url or "",
            "domain": inst.sip_domain or "",
            "extension": ext.number or "",
            "password": ext.sip_password or "",
            "caller_id": inst.default_caller_id or "",
            "country_code": inst.country_code or "44",
        }
        config["enabled"] = all(config[k] for k in ("ws_url", "domain", "extension", "password"))
        return config

    @http.route("/phone_bridge/call_event", type="json", auth="user")
    def call_event(self, event, call_id, caller="", direction="incoming", duration=0):
        """The softphone's own call events, passed on to the worker with the
        API token, which never reaches the browser."""
        inst = self._installation()
        if not (inst.worker_url and inst.api_token):
            return {"ok": False, "error": "not deployed"}
        data = {"event": event, "callId": call_id, "caller": caller or "unknown", "did": "",
                "direction": "outgoing" if direction == "outgoing" else "incoming"}
        if event == "hangup":
            data["duration"] = int(duration or 0)
        try:
            res = requests.post(f"{inst.worker_url}/call-event", data=data, timeout=15,
                                headers={"Authorization": f"Bearer {inst.api_token}"})
            return res.json()
        except (requests.RequestException, ValueError) as e:
            _logger.warning("phone_bridge: call event %s for %s failed: %s", event, call_id, e)
            return {"ok": False, "error": str(e)}

    @http.route("/phone_bridge/lookup", type="json", auth="user")
    def lookup(self, number):
        """The contact a number belongs to, matched like the worker does: a
        wildcard between every digit (Odoo numbers are free text), then the
        last 9 digits compared exactly."""
        key = phone_key(number)
        if not key:
            return False
        pattern = "%" + "%".join(key) + "%"
        Partner = request.env["res.partner"]
        for p in Partner.search(["|", ("phone", "=ilike", pattern), ("mobile", "=ilike", pattern)], limit=10):
            if key in (phone_key(p.phone), phone_key(p.mobile)):
                return {"id": p.id, "name": p.display_name}
        return False

    # ── Phone panel data ──

    @staticmethod
    def _record_phone(record):
        """The number to ring for a record an activity is on: its own phone
        fields, else its contact's (leads, orders, tickets…)."""
        for name in ("phone", "mobile", "partner_phone", "phone_sanitized"):
            if name in record._fields and record[name]:
                return record[name], record.partner_id if "partner_id" in record._fields else record
        partner = record.partner_id if "partner_id" in record._fields else (record if record._name == "res.partner" else None)
        if partner:
            return partner.phone or partner.mobile or "", partner
        return "", None

    @http.route("/phone_bridge/activities", type="json", auth="user")
    def activities(self, limit=50):
        """The user's open "Call" activities, soonest first, each with the
        number to ring, as in Odoo Enterprise's phone."""
        acts = request.env["mail.activity"].search([
            ("user_id", "=", request.env.uid),
            ("activity_type_id.category", "=", "phonecall"),
        ], order="date_deadline, id", limit=limit)
        out = []
        for act in acts:
            record = request.env[act.res_model].browse(act.res_id).exists()
            if not record:
                continue
            phone, partner = self._record_phone(record)
            out.append({
                "id": act.id,
                "summary": act.summary or act.activity_type_id.name,
                "note": act.note and re.sub(r"<[^>]+>", " ", act.note).strip()[:140],
                "deadline": fields.Date.to_string(act.date_deadline),
                "state": act.state,  # overdue / today / planned
                "record_name": record.display_name,
                "res_model": act.res_model,
                "res_id": act.res_id,
                "partner": {"id": partner.id, "name": partner.display_name} if partner and partner._name == "res.partner" else False,
                "phone": phone,
            })
        return out

    @http.route("/phone_bridge/activity_done", type="json", auth="user")
    def activity_done(self, activity_id, feedback=""):
        act = request.env["mail.activity"].browse(int(activity_id)).exists()
        if act and act.user_id == request.env.user:
            act.action_feedback(feedback=feedback or None)
        return True
