from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestBridgeUpsert(TransactionCase):

    def setUp(self):
        super().setUp()
        self.Call = self.env["phone_bridge.call"]
        self.partner = self.env["res.partner"].create({"name": "Caller", "phone": "01234 567890"})

    def test_upsert_creates_then_updates_one_record(self):
        vals = {"bridge_call_id": "1.1", "phone_number": "+441234567890", "state": "calling",
                "start_date": "2026-10-25 10:00:00", "partner_id": self.partner.id}
        first = self.Call.bridge_upsert(vals)
        second = self.Call.bridge_upsert({**vals, "state": "terminated", "end_date": "2026-10-25 10:01:00"})
        self.assertEqual(first, second)
        call = self.Call.browse(first)
        self.assertEqual(call.state, "terminated")
        self.assertEqual(call.duration, 60)
        self.assertEqual(self.partner.phone_bridge_call_count, 1)

    def test_upsert_ignores_unknown_fields_and_dead_partners(self):
        call = self.Call.browse(self.Call.bridge_upsert({
            "bridge_call_id": "1.2", "phone_number": "1", "partner_id": 999999, "from_a_newer_worker": True}))
        self.assertFalse(call.partner_id)

    def test_upsert_needs_an_id(self):
        with self.assertRaises(ValueError):
            self.Call.bridge_upsert({"phone_number": "1"})
