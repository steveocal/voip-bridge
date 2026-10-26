from datetime import date, timedelta

from odoo.tests import HttpCase, tagged


@tagged("post_install", "-at_install")
class TestPhonePanel(HttpCase):

    def test_call_activities_come_with_a_number(self):
        partner = self.env["res.partner"].create({"name": "Panel Test", "mobile": "07700 900456"})
        admin = self.env.ref("base.user_admin")
        call_type = self.env.ref("mail.mail_activity_data_call")
        todo_type = self.env.ref("mail.mail_activity_data_todo")
        overdue = partner.activity_schedule(activity_type_id=call_type.id, user_id=admin.id,
                                            summary="Chase quote", date_deadline=date.today() - timedelta(days=2))
        partner.activity_schedule(activity_type_id=todo_type.id, user_id=admin.id, summary="Not a call")

        self.authenticate("admin", "admin")
        acts = self.make_jsonrpc_request("/phone_bridge/activities", {})
        mine = [a for a in acts if a["id"] == overdue.id]
        self.assertEqual(len(mine), 1)
        self.assertEqual(mine[0]["phone"], "07700 900456")
        self.assertEqual(mine[0]["state"], "overdue")
        self.assertEqual(mine[0]["partner"]["id"], partner.id)
        self.assertFalse([a for a in acts if a["summary"] == "Not a call"])

        self.make_jsonrpc_request("/phone_bridge/activity_done", {"activity_id": overdue.id})
        self.assertFalse(overdue.exists())
