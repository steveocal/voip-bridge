import logging
import re

import requests

from odoo import _, fields, http
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
            "park_extension": inst.park_extension or "",
            "conference_prefix": inst.conference_prefix or "",
        }
        config["enabled"] = all(config[k] for k in ("ws_url", "domain", "extension", "password"))
        return config

    def _log_own_call(self, event, call_id, caller, direction, duration):
        """The softphone's call goes straight into Phone → Calls under the
        user's extension, so it is there whether or not a worker is deployed
        (the worker's own push later lands on the same record)."""
        Call = request.env["phone_bridge.call"].sudo()
        ext = request.env.user.phone_bridge_extension_id
        now = fields.Datetime.now()
        existing = Call.search([("bridge_call_id", "=", call_id)], limit=1)
        vals = {"bridge_call_id": call_id, "phone_number": caller or "unknown",
                "direction": direction, "extension": ext.number or False}
        if event == "ring":
            vals.update(state="calling", start_date=existing.start_date or now)
            partner = self.lookup(caller)
            if partner:
                vals["partner_id"] = partner["id"]
        elif event == "answer":
            vals["state"] = "ongoing"
        elif event == "hangup":
            vals.update(end_date=now, state="terminated" if int(duration or 0) > 0
                        else ("aborted" if direction == "outgoing" else "missed"))
            if not existing.start_date:
                vals["start_date"] = now
        else:
            return
        Call.bridge_upsert(vals)

    @http.route("/phone_bridge/call_event", type="json", auth="user")
    def call_event(self, event, call_id, caller="", direction="incoming", duration=0):
        """The softphone's own call events: logged in Odoo, then passed on to
        the worker with the API token, which never reaches the browser."""
        direction = "outgoing" if direction == "outgoing" else "incoming"
        try:
            self._log_own_call(event, call_id, caller, direction, duration)
        except Exception:  # noqa: BLE001 — logging a call must never break the phone
            _logger.exception("phone_bridge: logging call %s in Odoo failed", call_id)
        inst = self._installation()
        if not (inst.worker_url and inst.api_token):
            return {"ok": True, "worker": False}
        ext = request.env.user.phone_bridge_extension_id
        data = {"event": event, "callId": call_id, "caller": caller or "unknown", "did": "",
                "direction": direction}
        if ext:
            data["ext"] = ext.number
        if event == "hangup":
            data["duration"] = int(duration or 0)
        try:
            res = requests.post(f"{inst.worker_url}/call-event", data=data, timeout=15,
                                headers=self._worker_headers(inst))
            return res.json()
        except (requests.RequestException, ValueError) as e:
            _logger.warning("phone_bridge: call event %s for %s failed: %s", event, call_id, e)
            return {"ok": False, "error": str(e)}

    @staticmethod
    def _worker_headers(inst):
        """The API token, and which Odoo user we're asking for: the worker
        keeps calls, Gmail and settings per user."""
        return {"Authorization": f"Bearer {inst.api_token}", "X-Odoo-User": str(request.env.uid)}

    def _worker_get(self, path, params=None):
        """GET a worker route with the API token, as the current user; None
        when there's no worker or it can't be reached."""
        inst = self._installation()
        if not (inst.worker_url and inst.api_token):
            return None
        try:
            res = requests.get(f"{inst.worker_url}{path}", params=params or {}, timeout=20,
                               headers=self._worker_headers(inst))
            return res.json()
        except (requests.RequestException, ValueError) as e:
            _logger.warning("phone_bridge: worker %s failed: %s", path, e)
            return None

    # Each user reads their own Gmail through the worker, once they have
    # connected it (/phone_bridge/google_connect).
    @http.route("/phone_bridge/emails", type="json", auth="user")
    def emails(self, days=7):
        data = self._worker_get("/messages/recent", {"days": int(days), "limit": 50})
        if not data:
            return {"ok": False, "messages": []}
        return {"ok": bool(data.get("gmailOk")), "messages": data.get("messages", [])}

    @http.route("/phone_bridge/google_status", type="json", auth="user")
    def google_status(self):
        data = self._worker_get("/google/status") or {}
        return data.get("account") or False

    @http.route("/phone_bridge/google_connect", type="http", auth="user")
    def google_connect(self):
        """Off to Google's consent screen for the current user's account; the
        worker sends them back to Odoo afterwards."""
        back = request.httprequest.host_url.rstrip("/") + "/odoo"
        data = self._worker_get("/google/connect", {"json": "1", "back": back}) or {}
        if not data.get("url"):
            return request.make_response(_("The phone service couldn't start the Google sign-in."), status=502)
        return request.redirect(data["url"], local=False)

    @http.route("/phone_bridge/email", type="json", auth="user")
    def email(self, gmail_id):
        """One email's full body: plain text and, when it has one, HTML."""
        data = self._worker_get("/message", {"gmail_id": gmail_id}) or {}
        message = data.get("message") or {}
        return {"text": message.get("body") or "", "html": message.get("body_html") or ""}

    @http.route("/phone_bridge/parked", type="json", auth="user")
    def parked(self):
        """Calls waiting in the PBX's parking lot, from the worker."""
        inst = self._installation()
        if not (inst.worker_url and inst.api_token):
            return []
        try:
            res = requests.get(f"{inst.worker_url}/parked", timeout=10,
                               headers=self._worker_headers(inst))
            return res.json().get("parked", [])
        except (requests.RequestException, ValueError) as e:
            _logger.warning("phone_bridge: parked calls failed: %s", e)
            return []

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
    def activities(self, limit=100):
        """All the user's open activities, soonest first, each with the
        number to ring for its record (if there is one)."""
        acts = request.env["mail.activity"].search([
            ("user_id", "=", request.env.uid),
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
                "type": act.activity_type_id.name or "",
                "icon": act.activity_type_id.icon or "fa-tasks",
                "is_call": act.activity_type_id.category == "phonecall",
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
