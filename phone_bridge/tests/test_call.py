from unittest.mock import patch

from odoo.tests import TransactionCase, tagged

from ..models.phone_bridge_installation import PhoneBridgeInstallation


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

    def test_extension_makes_it_the_owners_call(self):
        owner = self.env["res.users"].create({"name": "Ext User", "login": "ext_user_call"})
        with patch.object(PhoneBridgeInstallation, "_worker_request", lambda *a, **k: None):
            self.env["phone_bridge.extension"].create({"number": "9301", "user_id": owner.id})
        call = self.Call.browse(self.Call.bridge_upsert({
            "bridge_call_id": "int.1", "phone_number": "9302", "direction": "outgoing", "extension": "9301"}))
        self.assertEqual(call.extension, "9301")
        self.assertEqual(call.extension_id.number, "9301")
        self.assertEqual(call.user_id, owner)


@tagged("post_install", "-at_install")
class TestDeletedReachWorker(TransactionCase):
    """Deleting calls or contacts queues one post-commit request to the worker."""

    def setUp(self):
        super().setUp()
        self.sent = []
        patcher = patch.object(PhoneBridgeInstallation, "_notify_deleted",
                               lambda _self, calls=(), contacts=(): self.sent.append((list(calls), list(contacts))))
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_deleting_a_call_sends_its_bridge_id(self):
        Call = self.env["phone_bridge.call"]
        call = Call.browse(Call.bridge_upsert({"bridge_call_id": "9.1", "phone_number": "1"}))
        call.unlink()
        self.assertIn((["9.1"], []), self.sent)

    def test_deleting_a_contact_sends_its_id(self):
        partner = self.env["res.partner"].create({"name": "Gone"})
        pid = partner.id
        partner.unlink()
        self.assertIn(([], [pid]), self.sent)


@tagged("post_install", "-at_install")
class TestNotifyDeleted(TransactionCase):

    def test_waits_for_commit_and_skips_when_not_deployed(self):
        inst = self.env["phone_bridge.installation"]._get_installation()
        inst.sudo().write({"worker_url": False})
        before = len(self.env.cr.postcommit._funcs)
        self.env["phone_bridge.installation"]._notify_deleted(calls=["1.1"])
        self.assertEqual(len(self.env.cr.postcommit._funcs), before)
        inst.sudo().write({"worker_url": "https://w.example", "api_token": "t"})
        with patch("requests.post") as post:
            self.env["phone_bridge.installation"]._notify_deleted(calls=["1.1"], contacts=[5])
            post.assert_not_called()  # not before the commit
            self.assertEqual(len(self.env.cr.postcommit._funcs), before + 1)
            self.env.cr.postcommit._funcs[-1]()
            post.assert_called_once()
            self.assertEqual(post.call_args.kwargs["json"], {"calls": ["1.1"], "contacts": [5]})
