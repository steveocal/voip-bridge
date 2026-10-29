import base64
from unittest.mock import patch

from odoo.tests import TransactionCase, tagged

from ..models.phone_bridge_installation import PhoneBridgeInstallation

WAV = base64.b64encode(b"RIFF$\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00@\x1f\x00\x00\x80>\x00\x00\x02\x00\x10\x00data\x00\x00\x00\x00")


@tagged("post_install", "-at_install")
class TestVoicemail(TransactionCase):

    # Extension numbers no real installation uses, so the tests can run on a
    # database that already has extensions.
    def setUp(self):
        super().setUp()
        # Never talk to a real worker from tests; record what would be sent.
        self.sent = []
        patcher = patch.object(PhoneBridgeInstallation, "_worker_request",
                               lambda inst, method, path, payload=None: self.sent.append((method, path, payload)) or {"synced": False})
        patcher.start()
        self.addCleanup(patcher.stop)
        self.user = self.env["res.users"].create({"name": "Ext Owner", "login": "ext_owner", "email": "owner@example.com"})
        self.ext = self.env["phone_bridge.extension"].create({"number": "9201", "name": "Desk", "user_id": self.user.id})
        self.Call = self.env["phone_bridge.call"]

    def test_extension_defaults_and_sync(self):
        self.assertEqual(self.ext.voicemail_email, "owner@example.com")
        self.assertIn(("PUT", "/voicemail/boxes/9201", {"enabled": True, "greeting": None}), self.sent)
        self.sent.clear()
        self.ext.write({"voicemail_enabled": False})
        self.assertEqual(self.sent, [("PUT", "/voicemail/boxes/9201", {"enabled": False})])
        self.sent.clear()
        self.ext.write({"number": "9205"})
        self.assertIn(("DELETE", "/voicemail/boxes/9201", None), self.sent)
        self.assertIn(("PUT", "/voicemail/boxes/9205", {"enabled": False, "greeting": None}), self.sent)
        self.sent.clear()
        self.ext.unlink()
        self.assertEqual(self.sent, [("DELETE", "/voicemail/boxes/9205", None)])

    def test_greeting_is_sent_only_when_it_changes(self):
        self.sent.clear()
        self.ext.write({"greeting": WAV, "greeting_filename": "hello.wav"})
        self.assertEqual(self.sent[-1][2]["greeting"], WAV.decode())
        self.sent.clear()
        self.ext.write({"name": "Desk phone"})
        self.assertEqual(self.sent, [])

    def test_main_box_settings_sync(self):
        inst = self.env["phone_bridge.installation"]._get_installation()
        self.sent.clear()
        inst.write({"main_voicemail_direct": True})
        self.assertEqual(self.sent, [("PUT", "/voicemail/boxes/main", {"enabled": True, "direct": True})])

    def _voicemail(self, box, call_id="vm.1"):
        call = self.Call.browse(self.Call.bridge_upsert({
            "bridge_call_id": call_id, "phone_number": "+441234567890", "state": "missed",
            "voicemail": True, "voicemail_box": box, "transcript": "[0:01] Them: call me back",
            "start_date": "2026-10-26 09:00:00"}))
        call.write({"recording": WAV, "recording_filename": "vm.wav"})
        return call

    def test_notify_emails_with_audio_and_alerts_once(self):
        call = self._voicemail("9201")
        self.assertEqual(call.voicemail_extension_id, self.ext)
        self.Call.bridge_notify_voicemail([call.id])
        mail = self.env["mail.mail"].search([("model", "=", "phone_bridge.call"), ("res_id", "=", call.id)])
        self.assertEqual(len(mail), 1)
        self.assertEqual(mail.email_to, "owner@example.com")
        self.assertIn("call me back", mail.body_html)
        self.assertIn("for 9201 Desk", mail.subject)
        self.assertEqual(mail.attachment_ids.mapped("mimetype"), ["audio/wav"])
        activity = call.activity_ids
        self.assertEqual(activity.user_id, self.user)
        self.assertIn("Voicemail from", activity.summary)
        # The worker may call again (e.g. a re-push); nothing is sent twice.
        self.Call.bridge_notify_voicemail([call.id])
        self.assertEqual(self.env["mail.mail"].search_count([("model", "=", "phone_bridge.call"), ("res_id", "=", call.id)]), 1)
        call.action_mark_heard()
        self.assertTrue(call.voicemail_heard)
        self.assertFalse(call.activity_ids)

    def test_portal_owner_gets_email_without_activity(self):
        portal = self.env["res.users"].create({"name": "Portal Owner", "login": "ext_portal", "email": "portal@example.com",
                                               "groups_id": [(6, 0, [self.env.ref("base.group_portal").id])]})
        self.env["hr.employee"].create({"name": "Portal Owner", "user_id": portal.id})
        self.ext.write({"user_id": portal.id, "voicemail_email": "portal@example.com"})
        self.assertTrue(self.ext.user_share)
        call = self._voicemail("9201", "vm.3")
        self.Call.bridge_notify_voicemail([call.id])
        mail = self.env["mail.mail"].search([("model", "=", "phone_bridge.call"), ("res_id", "=", call.id)])
        self.assertEqual(mail.email_to, "portal@example.com")
        self.assertFalse(call.activity_ids)

    def test_main_box_uses_installation_settings(self):
        inst = self.env["phone_bridge.installation"]._get_installation()
        inst.write({"main_voicemail_email": "office@example.com", "main_voicemail_user_id": self.user.id})
        call = self._voicemail("main", "vm.2")
        self.Call.bridge_notify_voicemail([call.id])
        mail = self.env["mail.mail"].search([("model", "=", "phone_bridge.call"), ("res_id", "=", call.id)])
        self.assertEqual(mail.email_to, "office@example.com")
        self.assertIn("main number", mail.subject)
