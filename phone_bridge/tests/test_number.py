from unittest.mock import patch

from odoo.exceptions import ValidationError
from odoo.tests import TransactionCase, tagged

from ..models.phone_bridge_installation import PhoneBridgeInstallation
from ..models.phone_bridge_number import normalize_number

SYNC = ("POST", "/extensions/sync", None)


@tagged("post_install", "-at_install")
class TestNumberRouting(TransactionCase):
    """Phone numbers, forwarding and users' mobiles reach the PBX through the
    same worker sync as the extensions."""

    def setUp(self):
        super().setUp()
        self.sent = []
        patcher = patch.object(PhoneBridgeInstallation, "_worker_request",
                               lambda inst, method, path, payload=None: self.sent.append((method, path, payload)) or {})
        patcher.start()
        self.addCleanup(patcher.stop)
        self.Ext = self.env["phone_bridge.extension"]
        self.Num = self.env["phone_bridge.number"]

    def test_normalize_number(self):
        self.assertEqual(normalize_number("+44 1283 246490"), "+441283246490")
        self.assertEqual(normalize_number("0044 (1283) 246-490"), "+441283246490")
        for bad in ("01283 246490", "+0123456789", "+44 12x3", "", None, "+1234"):
            self.assertIsNone(normalize_number(bad), bad)

    def test_number_is_stored_clean_and_syncs(self):
        ext = self.Ext.create({"number": "9401"})
        self.sent.clear()
        num = self.Num.create({"number": "+44 1283 246499", "extension_ids": [(6, 0, ext.ids)]})
        self.assertEqual(num.number, "+441283246499")
        self.assertIn(SYNC, self.sent)
        for vals in ({"ring_seconds": 30}, {"no_answer": "hangup"}, {"record": False}, {"extension_ids": [(5,)]}):
            self.sent.clear()
            num.write(vals)
            self.assertIn(SYNC, self.sent, vals)
        self.sent.clear()
        num.unlink()
        self.assertIn(SYNC, self.sent)

    def test_number_checks(self):
        with self.assertRaises(ValidationError):
            self.Num.create({"number": "01283 246499"})
        with self.assertRaises(ValidationError):
            self.Num.create({"number": "+441283246498", "no_answer": "forward"})
        with self.assertRaises(ValidationError):
            self.Num.create({"number": "+441283246497", "ring_seconds": 2})
        num = self.Num.create({"number": "+441283246496", "no_answer": "forward", "no_answer_number": "07700 900123"
                               .replace("07700", "+44 7700")})
        self.assertEqual(num.no_answer_number, "+447700900123")

    def test_extension_forwarding(self):
        ext = self.Ext.create({"number": "9402"})
        with self.assertRaises(ValidationError):
            ext.write({"forward_mode": "always"})
        self.sent.clear()
        ext.write({"forward_mode": "noanswer", "forward_number": "+44 7700 900124", "forward_seconds": 15})
        self.assertEqual(ext.forward_number, "+447700900124")
        self.assertIn(SYNC, self.sent)
        with self.assertRaises(ValidationError):
            ext.write({"forward_seconds": 500})

    def test_user_mobile(self):
        user = self.env["res.users"].create({"name": "Mobile User", "login": "pb_mobile_user"})
        self.sent.clear()
        user.write({"phone_bridge_mobile": "+66 92 618 1049"})
        self.assertEqual(user.phone_bridge_mobile, "+66926181049")
        self.assertNotIn(SYNC, self.sent, "no extension yet, so nothing for the PBX")
        self.Ext.create({"number": "9403", "user_id": user.id})
        self.sent.clear()
        user.write({"phone_bridge_mobile_delay": 0})
        self.assertIn(SYNC, self.sent)
        with self.assertRaises(ValidationError):
            user.write({"phone_bridge_mobile": "0926181049"})

    def test_user_can_set_own_mobile(self):
        user = self.env["res.users"].create({"name": "Own Mobile", "login": "pb_own_mobile",
                                             "groups_id": [(6, 0, [self.env.ref("base.group_user").id])]})
        self.Ext.create({"number": "9404", "user_id": user.id})
        self.sent.clear()
        user.with_user(user).write({"phone_bridge_mobile": "+447700900125", "phone_bridge_mobile_delay": 10})
        self.assertEqual(user.phone_bridge_mobile, "+447700900125")
        self.assertIn(SYNC, self.sent)


@tagged("post_install", "-at_install")
class TestMenusAndHours(TransactionCase):
    def setUp(self):
        super().setUp()
        self.sent = []
        patcher = patch.object(PhoneBridgeInstallation, "_worker_request",
                               lambda inst, method, path, payload=None: self.sent.append((method, path, payload)) or {})
        patcher.start()
        self.addCleanup(patcher.stop)
        self.Menu = self.env["phone_bridge.menu"]
        self.Num = self.env["phone_bridge.number"]
        self.ext = self.env["phone_bridge.extension"].create({"number": "9411"})

    def test_menu_syncs_and_checks(self):
        self.sent.clear()
        menu = self.Menu.create({"name": "Main", "prompt": "For sales press 1.", "option_ids": [
            (0, 0, {"key": "1", "action": "ring", "extension_ids": [(6, 0, self.ext.ids)]}),
            (0, 0, {"key": "2", "action": "forward", "number": "+44 7700 900125"}),
        ]})
        self.assertIn(SYNC, self.sent)
        self.assertEqual(menu.option_ids.filtered(lambda o: o.key == "2").number, "+447700900125")
        self.sent.clear()
        menu.option_ids[0].write({"key": "3"})
        self.assertIn(SYNC, self.sent)
        with self.assertRaises(ValidationError):
            menu.write({"timeout": 0})
        with self.assertRaises(ValidationError):
            menu.write({"noinput_action": "menu"})
        with self.assertRaises(ValidationError):
            self.env["phone_bridge.menu.option"].create({"menu_id": menu.id, "key": "4", "action": "forward"})
        with self.assertRaises(ValidationError):
            menu.write({"prompt": "x" * 1001})

    def test_number_menu_and_hours(self):
        menu = self.Menu.create({"name": "Night", "prompt": "We're closed."})
        cal = self.env["resource.calendar"].create({"name": "Office", "tz": "Europe/London"})
        with self.assertRaises(ValidationError):
            self.Num.create({"number": "+441283246481", "answer": "menu"})
        num = self.Num.create({"number": "+441283246481", "answer": "menu", "menu_id": menu.id})
        with self.assertRaises(ValidationError):
            num.write({"calendar_id": cal.id, "closed_action": "forward"})
        with self.assertRaises(ValidationError):
            num.write({"calendar_id": cal.id, "closed_action": "menu"})
        self.sent.clear()
        num.write({"calendar_id": cal.id, "closed_action": "forward", "closed_number": "+44 7700 900126",
                   "closed_message": "Sorry, we're closed."})
        self.assertEqual(num.closed_number, "+447700900126")
        self.assertIn(SYNC, self.sent)
