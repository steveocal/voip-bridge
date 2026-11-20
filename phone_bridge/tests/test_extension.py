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
                                               "group_ids": [(6, 0, [self.env.ref("base.group_portal").id])]})
        ext = self.Ext.create({"number": "9306", "user_id": portal.id})
        self.assertTrue(ext.user_share)
        self.assertFalse(self.Ext._fields["user_id"].domain)


@tagged("post_install", "-at_install")
class TestExtensionAppInvite(TransactionCase):
    """A browser/app extension given a user emails them the app install steps
    and a one-time setup link from the worker."""

    def setUp(self):
        super().setUp()
        self.sent = []

        def worker(inst, method, path, payload=None):
            self.sent.append((method, path, payload))
            if path == "/onboard/link":
                return {"url": "https://voip.example/dashboard?setup=tok", "install_url": "https://voip.example/app/", "days": 7}
            return {}
        patcher = patch.object(PhoneBridgeInstallation, "_worker_request", worker)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.Ext = self.env["phone_bridge.extension"]
        self.user = self.env["res.users"].create({"name": "New Starter", "login": "pb_new_starter", "email": "starter@example.com"})

    def _invites(self):
        return self.env["mail.mail"].search([("email_to", "ilike", "starter@example.com"),
                                             ("subject", "ilike", "phone app")])

    def test_new_extension_with_a_user_emails_the_app(self):
        ext = self.Ext.create({"number": "9311", "user_id": self.user.id})
        self.assertIn(("POST", "/onboard/link", {"ext": "9311"}), self.sent)
        self.assertTrue(ext.invite_sent)
        mail = self._invites()
        self.assertEqual(len(mail), 1)
        self.assertIn("setup=tok", mail.body_html)
        self.assertIn("https://voip.example/app/", mail.body_html)

    def test_desk_phone_and_no_user_send_nothing(self):
        self.Ext.create({"number": "9312", "user_id": self.user.id, "device_type": "sip"})
        self.Ext.create({"number": "9313"})
        self.assertNotIn("/onboard/link", [p for _m, p, _b in self.sent])

    def test_giving_an_extension_a_user_emails_them(self):
        ext = self.Ext.create({"number": "9314"})
        ext.write({"user_id": self.user.id})
        self.assertTrue(ext.invite_sent)

    def test_button_needs_an_email(self):
        self.user.email = False
        ext = self.Ext.create({"number": "9315", "user_id": self.user.id})
        with self.assertRaises(UserError):
            ext.action_send_app_invite()
