from datetime import date, timedelta
from unittest.mock import patch

from odoo.tests import HttpCase, tagged

from ..models.phone_bridge_installation import PhoneBridgeInstallation


@tagged("post_install", "-at_install")
class TestPhonePanel(HttpCase):

    def setUp(self):
        super().setUp()
        # No real worker from tests (extension changes sync their mailbox).
        patcher = patch.object(PhoneBridgeInstallation, "_worker_request", lambda *a, **k: None)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_activities_come_with_a_number(self):
        partner = self.env["res.partner"].create({"name": "Panel Test", "mobile": "07700 900456"})
        admin = self.env.ref("base.user_admin")
        call_type = self.env.ref("mail.mail_activity_data_call")
        todo_type = self.env.ref("mail.mail_activity_data_todo")
        overdue = partner.activity_schedule(activity_type_id=call_type.id, user_id=admin.id,
                                            summary="Chase quote", date_deadline=date.today() - timedelta(days=2))
        todo = partner.activity_schedule(activity_type_id=todo_type.id, user_id=admin.id, summary="Not a call")

        self.authenticate("admin", "admin")
        acts = self.make_jsonrpc_request("/phone_bridge/activities", {})
        mine = [a for a in acts if a["id"] == overdue.id]
        self.assertEqual(len(mine), 1)
        self.assertEqual(mine[0]["phone"], "07700 900456")
        self.assertEqual(mine[0]["state"], "overdue")
        self.assertEqual(mine[0]["partner"]["id"], partner.id)
        self.assertTrue(mine[0]["is_call"])
        # Other activity types are listed too, with their own icon.
        other = [a for a in acts if a["id"] == todo.id]
        self.assertEqual(len(other), 1)
        self.assertFalse(other[0]["is_call"])
        self.assertEqual(other[0]["phone"], "07700 900456")
        self.assertEqual(other[0]["icon"], todo_type.icon or "fa-tasks")

        self.make_jsonrpc_request("/phone_bridge/activity_done", {"activity_id": overdue.id})
        self.assertFalse(overdue.exists())

    def test_softphone_calls_are_logged_in_odoo(self):
        admin = self.env.ref("base.user_admin")
        ext = self.env["phone_bridge.extension"].create({"number": "9203", "user_id": admin.id})
        admin.phone_bridge_extension_id = ext
        self.env["res.partner"].create({"name": "Panel Caller", "phone": "07700 900789"})
        self.authenticate("admin", "admin")
        for event, extra in (("ring", {}), ("answer", {}), ("hangup", {"duration": 42})):
            self.make_jsonrpc_request("/phone_bridge/call_event", {
                "event": event, "call_id": "sip-call-1", "caller": "+447700900789", "direction": "outgoing", **extra})
        call = self.env["phone_bridge.call"].search([("bridge_call_id", "=", "sip-call-1")])
        self.assertEqual(len(call), 1)
        self.assertEqual(call.extension, "9203")
        self.assertEqual(call.user_id, admin)
        self.assertEqual(call.state, "terminated")
        self.assertEqual(call.partner_id.name, "Panel Caller")
        self.assertTrue(call.start_date and call.end_date)
