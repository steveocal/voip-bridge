from unittest.mock import patch

from odoo.exceptions import UserError, ValidationError
from odoo.tests import TransactionCase, tagged

from ..models.phone_bridge_installation import PhoneBridgeInstallation

SYNC = ("POST", "/extensions/sync", None)


@tagged("post_install", "-at_install")
class TestExtensionPbx(TransactionCase):
    """The PBX builds its extensions from these records: every change that
    matters to it has the worker re-read them."""

    def setUp(self):
        super().setUp()
        self.sent = []
        patcher = patch.object(PhoneBridgeInstallation, "_worker_request",
                               lambda inst, method, path, payload=None: self.sent.append((method, path, payload)) or {})
        patcher.start()
        self.addCleanup(patcher.stop)
        self.Ext = self.env["phone_bridge.extension"]

    def test_new_extension_gets_a_strong_password_and_syncs(self):
        ext = self.Ext.create({"number": "9301"})
        self.assertGreaterEqual(len(ext.sip_password), 20)
        self.assertEqual(ext.device_type, "webrtc")
        self.assertIn(SYNC, self.sent)
        other = self.Ext.create({"number": "9302"})
        self.assertNotEqual(ext.sip_password, other.sip_password)

    def test_pbx_fields_sync_and_others_dont(self):
        ext = self.Ext.create({"number": "9303", "sip_password": "test200", "device_type": "sip"})
        for vals in ({"device_type": "webrtc"}, {"wake_app": True}, {"sip_password": "Another.pw-1"},
                     {"name": "Desk"}, {"active": False}):
            self.sent.clear()
            ext.write(vals)
            self.assertIn(SYNC, self.sent, vals)
        self.sent.clear()
        ext.write({"voicemail_email": "x@example.com"})
        self.assertNotIn(SYNC, self.sent)
        ext.unlink()
        self.assertIn(SYNC, self.sent)

    def test_password_must_be_safe_for_the_pbx_config(self):
        for bad in ("short", "has space1", "semi;colon1", "quote\"1234", "bracket]123", "é-accent-1"):
            with self.assertRaises(ValidationError, msg=bad):
                self.Ext.create({"number": "9304", "sip_password": bad})

    def test_saving_survives_an_unreachable_worker(self):
        def fail(inst, method, path, payload=None):
            if path == "/extensions/sync":
                raise UserError("Couldn't reach the phone bridge worker")
            return {}
        with patch.object(PhoneBridgeInstallation, "_worker_request", fail):
            ext = self.Ext.create({"number": "9305"})
            ext.write({"device_type": "sip"})
        self.assertEqual(ext.device_type, "sip")

    def test_portal_user_can_own_an_extension(self):
        portal = self.env["res.users"].create({"name": "Portal Phone", "login": "pb_portal_phone",
                                               "groups_id": [(6, 0, [self.env.ref("base.group_portal").id])]})
        ext = self.Ext.create({"number": "9306", "user_id": portal.id})
        self.assertTrue(ext.user_share)
        self.assertFalse(self.Ext._fields["user_id"].domain)
