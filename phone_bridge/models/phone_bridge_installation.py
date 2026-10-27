import json
import secrets
from pathlib import Path

from odoo import _, api, fields, models
from odoo.exceptions import UserError
from odoo.addons.base.models.res_partner import _tz_get

# The worker bundle shipped inside the module (npm run bundle:addon).
BUNDLE_DIR = Path(__file__).resolve().parent.parent / "data" / "worker"


def load_manifest():
    path = BUNDLE_DIR / "manifest.json"
    if not path.exists():
        raise UserError(_("The worker bundle is missing from the module (%s).", path))
    return json.loads(path.read_text())


class PhoneBridgeInstallation(models.Model):
    """This database's worker: where it lives on Cloudflare and every setting
    it runs with. There is one record (see _get_installation).

    Worker settings are the fields whose names are the lower-cased names in
    the bundle's manifest (settings.schema.json in the worker repo), apart
    from the few _worker_settings() fills in itself.
    """

    _name = "phone_bridge.installation"
    _description = "Phone Bridge Installation"
    _inherit = ["mail.thread"]

    name = fields.Char(default="Phone Bridge", required=True)

    # ── Cloudflare ──
    cloudflare_account_id = fields.Char("Cloudflare Account ID", tracking=True)
    cloudflare_api_token = fields.Char("Cloudflare API Token", groups="base.group_system")
    worker_name = fields.Char(default="phone-bridge", required=True, tracking=True,
                              help="Name of the Worker script (and D1 database) in your Cloudflare account.")
    d1_database_id = fields.Char("D1 Database ID", readonly=True)
    worker_url = fields.Char("Worker URL", readonly=True)
    deployed_version = fields.Char(readonly=True)
    bundle_version = fields.Char("Version in this module", compute="_compute_bundle_version")
    last_provisioned = fields.Datetime(readonly=True)
    state = fields.Selection([("draft", "Not deployed"), ("ready", "Deployed"), ("error", "Failed")],
                             default="draft", readonly=True, tracking=True)
    provision_log = fields.Text(readonly=True)

    # ── Odoo access for the worker ──
    odoo_url = fields.Char("Odoo URL", default=lambda self: self.env["ir.config_parameter"].sudo().get_param("web.base.url"),
                           help="Where the worker reaches this Odoo. Must be reachable from the internet.")
    odoo_user_id = fields.Many2one("res.users", "Worker signs in as", default=lambda self: self.env.user,
                                   domain=[("share", "=", False)],
                                   help="The worker uses an API key of this user to read contacts and write calls.")
    odoo_api_key = fields.Char("Odoo API Key", readonly=True, groups="base.group_system")

    # ── Secrets shared with the worker ──
    api_token = fields.Char("API Token", readonly=True, groups="base.group_system",
                            help="Odoo and the dashboard sign in to the worker with this. Generated on first deploy.")
    pbx_secret = fields.Char("PBX Secret", readonly=True, groups="base.group_system",
                             help="Your phone system sends this with every event it posts to the worker.")

    # ── Phone system ──
    pbx_provider = fields.Selection([("asterisk", "Asterisk")], "Phone System", default="asterisk", required=True)
    asterisk_url = fields.Char("ARI URL", help="e.g. https://pbx.example.com:8089")
    asterisk_user = fields.Char("ARI User")
    asterisk_pass = fields.Char("ARI Password", groups="base.group_system")
    asterisk_originate_url = fields.Char("Click-to-call Bridge URL")
    sip_ws_url = fields.Char("SIP WebSocket URL", help="e.g. wss://pbx.example.com:8089/ws")
    sip_domain = fields.Char("SIP Domain")
    default_caller_id = fields.Char("Default Caller ID")
    park_extension = fields.Char("Park Extension", default="700",
                                 help="The PBX's parking extension; the softphone's Park transfers calls there.")

    # ── Region ──
    country_code = fields.Char("Country Calling Code", default=lambda self: self._default_country_code(), required=True)
    timezone = fields.Selection(_tz_get, "Time Zone", default=lambda self: self.env.user.tz or "UTC", required=True)
    locale = fields.Char(default=lambda self: (self.env.user.lang or "en_US").replace("_", "-"), required=True)

    # ── Website callback ──
    callback_did = fields.Char("Callback Number", help="Callback requests are logged against this number and visitors are called from it. The widget is off until it is set.")
    callback_open_days = fields.Char("Open Days", default="1,2,3,4,5", help="0 = Sunday … 6 = Saturday")
    callback_open_from = fields.Char("Opens", default="09:00")
    callback_open_until = fields.Char("Closes", default="17:30")

    # ── Optional: Gmail, Android app ──
    own_email_domains = fields.Char("Our Email Domains", default=lambda self: self._default_email_domain())
    mail_from = fields.Char("Gmail From Header")
    google_client_id = fields.Char("Gmail Client ID", groups="base.group_system")
    google_client_secret = fields.Char("Gmail Client Secret", groups="base.group_system")
    google_refresh_token = fields.Char("Gmail Refresh Token", groups="base.group_system")
    fcm_service_account = fields.Text("Firebase Service Account (JSON)", groups="base.group_system")
    android_package = fields.Char("Android Package")
    android_cert_sha256 = fields.Char("Android Signing Key SHA-256")

    # ── Main voicemail box: calls to our numbers that nobody takes ──
    main_voicemail_enabled = fields.Boolean("Voicemail", default=True,
                                            help="When off, unanswered callers hear a busy tone.")
    main_voicemail_direct = fields.Boolean("Straight to Voicemail",
                                           help="Phones don't ring; every caller to our numbers hears the greeting.")
    main_greeting = fields.Binary("Greeting", attachment=True,
                                  help="A WAV recording (16-bit, any sample rate, up to 2 minutes). Without one, callers hear the standard prompt.")
    main_greeting_filename = fields.Char()
    main_voicemail_email = fields.Char("Email Voicemail To", help="Comma-separated.")
    main_voicemail_user_id = fields.Many2one("res.users", "Alert", domain=[("share", "=", False)],
                                             help="Gets a to-do activity for each message.")
    voicemail_synced = fields.Boolean("Phone system up to date", readonly=True)
    extension_ids = fields.Many2many("phone_bridge.extension", compute="_compute_extension_ids", string="Extensions")

    MAIN_BOX_FIELDS = ("main_voicemail_enabled", "main_voicemail_direct", "main_greeting")

    def _compute_extension_ids(self):
        for rec in self:
            rec.extension_ids = self.env["phone_bridge.extension"].search([])

    def _default_country_code(self):
        return str(self.env.company.country_id.phone_code or 44)

    def _default_email_domain(self):
        email = self.env.company.email or ""
        return email.split("@", 1)[1] if "@" in email else False

    def _compute_bundle_version(self):
        try:
            version = load_manifest()["version"]
        except UserError:
            version = False
        for rec in self:
            rec.bundle_version = version

    @api.model
    def _get_installation(self):
        return self.search([], limit=1) or self.create({})

    @api.model
    def action_open_installation(self):
        return {
            "type": "ir.actions.act_window",
            "res_model": self._name,
            "res_id": self._get_installation().id,
            "view_mode": "form",
            "target": "current",
        }

    # ── Values the worker runs with ──

    def _ensure_generated(self):
        """Secrets that are made, not typed: created on first deploy, then kept."""
        self.ensure_one()
        vals = {}
        if not self.api_token:
            vals["api_token"] = secrets.token_urlsafe(32)
        if not self.pbx_secret:
            vals["pbx_secret"] = secrets.token_urlsafe(24)
        if not self.odoo_api_key:
            user = self.odoo_user_id or self.env.user
            vals["odoo_api_key"] = self.env["res.users.apikeys"].with_user(user).sudo()._generate(
                None, f"Phone Bridge worker ({self.worker_name})", None)
        if vals:
            self.sudo().write(vals)

    def _worker_settings(self, manifest):
        """{name: value} for every manifest setting that has a value."""
        self.ensure_one()
        computed = {
            "API_TOKEN": self.api_token,
            "PBX_SECRET": self.pbx_secret,
            "ODOO_URL": (self.odoo_url or "").rstrip("/"),
            "ODOO_DB": self.env.cr.dbname,
            "ODOO_USER": (self.odoo_user_id or self.env.user).login,
            "ODOO_PASS": self.odoo_api_key,
            "PBX_PROVIDER": self.pbx_provider,
        }
        out = {}
        for setting in manifest["settings"]:
            name = setting["name"]
            if name in computed:
                value = computed[name]
            elif name.lower() in self._fields:
                value = self[name.lower()]
            else:
                raise UserError(_("The worker bundle needs setting %s, which this module doesn't know. Update the module.", name))
            if value not in (False, None, ""):
                out[name] = str(value)
        missing = [s["name"] for s in manifest["settings"]
                   if s.get("required") and s["name"] not in out
                   and s.get("provider", self.pbx_provider) == self.pbx_provider]
        if missing:
            labels = {s["name"]: s.get("label", s["name"]) for s in manifest["settings"]}
            raise UserError(_("Fill in before deploying: %s", ", ".join(labels[m] for m in missing)))
        return out

    # ── Buttons ──

    def action_provision(self):
        self.ensure_one()
        from .cloudflare import Provisioner
        if not (self.cloudflare_account_id and self.cloudflare_api_token):
            raise UserError(_("Enter the Cloudflare account ID and API token first."))
        manifest = load_manifest()
        self._ensure_generated()
        settings = self._worker_settings(manifest)
        provisioner = Provisioner(self.cloudflare_account_id, self.cloudflare_api_token, self.worker_name, BUNDLE_DIR)
        try:
            result = provisioner.run(manifest, settings)
        except Exception as e:  # noqa: BLE001 — every failure is reported on the record
            self.sudo().write({"state": "error", "provision_log": provisioner.log_text() + f"\n✗ {e}"})
            self.message_post(body=_("Deploy failed: %s", e))
            return self._notify(_("Deploy failed"), str(e), "danger")
        self.sudo().write({
            "state": "ready",
            "d1_database_id": result["d1_database_id"],
            "worker_url": result["worker_url"],
            "deployed_version": result["version"],
            "last_provisioned": fields.Datetime.now(),
            "provision_log": provisioner.log_text(),
        })
        self.message_post(body=_("Deployed version %s to %s", result["version"], result["worker_url"]))
        self._sync_all_voicemail_boxes()
        return self._notify(_("Deployed"), result["worker_url"], "success")

    def action_check(self):
        self.ensure_one()
        from .cloudflare import health
        if not self.worker_url:
            raise UserError(_("Deploy first."))
        try:
            info = health(self.worker_url)
        except Exception as e:  # noqa: BLE001
            return self._notify(_("Worker not reachable"), str(e), "danger")
        self.sudo().deployed_version = info.get("version")
        return self._notify(_("Worker is up"), _("Version %s, provider %s", info.get("version"), info.get("provider")), "success")

    def action_open_dashboard(self):
        self.ensure_one()
        if not self.worker_url:
            raise UserError(_("Deploy first."))
        return {"type": "ir.actions.act_url", "url": f"{self.worker_url}/login", "target": "new"}

    # ── Voicemail boxes on the worker ──

    def write(self, vals):
        res = super().write(vals)
        if any(f in vals for f in self.MAIN_BOX_FIELDS):
            for rec in self:
                rec._sync_voicemail_box("main", rec.main_voicemail_enabled,
                                        rec.main_greeting, "main_greeting" in vals,
                                        direct=rec.main_voicemail_direct)
        return res

    def _worker_request(self, method, path, payload=None):
        """A call to this installation's worker with the API token, or None
        when it isn't deployed yet (Deploy then pushes everything)."""
        self.ensure_one()
        import requests
        inst = self.sudo()
        if not (inst.worker_url and inst.api_token):
            return None
        try:
            res = requests.request(method, f"{inst.worker_url}{path}", json=payload, timeout=30,
                                   headers={"Authorization": f"Bearer {inst.api_token}"})
        except requests.RequestException as e:
            raise UserError(_("Couldn't reach the phone bridge worker: %s", e)) from e
        try:
            body = res.json()
        except ValueError:
            body = {}
        if not res.ok:
            raise UserError(body.get("error") or _("The worker answered %s.", res.status_code))
        return body

    def _sync_voicemail_box(self, box, enabled, greeting, send_greeting, direct=None):
        """greeting is the Binary field's base64 value (False = none); it's
        only sent when send_greeting, as it's the big part."""
        payload = {"enabled": bool(enabled)}
        if send_greeting:
            payload["greeting"] = greeting.decode() if isinstance(greeting, bytes) else (greeting or None)
        if direct is not None:
            payload["direct"] = bool(direct)
        result = self._worker_request("PUT", f"/voicemail/boxes/{box}", payload)
        if result is not None:
            self.sudo().voicemail_synced = bool(result.get("synced"))

    def _delete_voicemail_box(self, box):
        if box:
            self._worker_request("DELETE", f"/voicemail/boxes/{box}")

    def _sync_all_voicemail_boxes(self):
        self.ensure_one()
        self._sync_voicemail_box("main", self.main_voicemail_enabled, self.main_greeting, True,
                                 direct=self.main_voicemail_direct)
        for ext in self.env["phone_bridge.extension"].search([]):
            self._sync_voicemail_box(ext.number, ext.voicemail_enabled, ext.greeting, True)

    def action_check_voicemail_sync(self):
        self.ensure_one()
        result = self._worker_request("GET", "/voicemail/boxes")
        if result is None:
            raise UserError(_("Deploy first."))
        self.sudo().voicemail_synced = bool(result.get("synced"))
        if result.get("synced"):
            return self._notify(_("Voicemail"), _("The phone system has the current voicemail settings."), "success")
        return self._notify(_("Voicemail"), _("The phone system hasn't picked up the latest settings yet; it checks every few minutes."), "warning")

    def _notify(self, title, message, kind):
        return {
            "type": "ir.actions.client",
            "tag": "display_notification",
            "params": {"title": title, "message": message, "type": kind, "sticky": kind == "danger",
                       "next": {"type": "ir.actions.client", "tag": "soft_reload"}},
        }
