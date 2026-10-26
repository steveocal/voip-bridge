from odoo.exceptions import UserError
from odoo.tests import TransactionCase, tagged

from ..models.phone_bridge_installation import load_manifest


@tagged("post_install", "-at_install")
class TestInstallation(TransactionCase):

    def setUp(self):
        super().setUp()
        self.inst = self.env["phone_bridge.installation"]._get_installation()
        self.manifest = load_manifest()

    def test_singleton(self):
        self.assertEqual(self.env["phone_bridge.installation"]._get_installation(), self.inst)

    def test_every_manifest_setting_has_a_source(self):
        # _worker_settings raises if the bundle needs a setting the module doesn't know.
        self.inst.write({"asterisk_url": "https://pbx.test:8089", "asterisk_user": "ari", "asterisk_pass": "secret"})
        self.inst._ensure_generated()
        settings = self.inst._worker_settings(self.manifest)
        for name in ("API_TOKEN", "PBX_SECRET", "ODOO_URL", "ODOO_DB", "ODOO_USER", "ODOO_PASS", "ASTERISK_URL", "COUNTRY_CODE"):
            self.assertIn(name, settings)
        self.assertEqual(settings["ODOO_DB"], self.env.cr.dbname)

    def test_missing_required_settings_are_named(self):
        self.inst.write({"asterisk_url": False})
        self.inst._ensure_generated()
        with self.assertRaises(UserError) as e:
            self.inst._worker_settings(self.manifest)
        self.assertIn("ARI URL", str(e.exception))

    def test_generated_secrets_are_kept(self):
        self.inst._ensure_generated()
        token, key = self.inst.api_token, self.inst.odoo_api_key
        self.inst._ensure_generated()
        self.assertEqual((self.inst.api_token, self.inst.odoo_api_key), (token, key))
        uid = self.env["res.users.apikeys"]._check_credentials(scope="rpc", key=key)
        self.assertEqual(uid, self.inst.odoo_user_id.id)
