import json
from unittest.mock import patch

from odoo.tests import BaseCase, tagged

from ..models import cloudflare
from ..models.phone_bridge_installation import BUNDLE_DIR, load_manifest


class FakeResponse:
    def __init__(self, body, status=200):
        self._body, self.status_code = body, status

    def json(self):
        return self._body


class FakeCloudflare:
    """Just enough of the Cloudflare API to deploy into, keeping state."""

    def __init__(self):
        self.databases, self.tables, self.migrations_done = {}, set(), []
        self.subdomain = None
        self.stored_hashes = set()
        self.script = None  # last metadata uploaded
        self.migration_tag = None
        self.calls = []

    def ok(self, result):
        return FakeResponse({"success": True, "errors": [], "result": result})

    def err(self, code, status=404):
        return FakeResponse({"success": False, "errors": [{"code": code, "message": "nope"}], "result": None}, status)

    def session_request(self, _session, method, url, timeout=None, params=None, json=None, files=None):
        path = url.split("/client/v4", 1)[1]
        path = path.split("/accounts/acc123", 1)[1] if path.startswith("/accounts/") else path
        self.calls.append((method, path))
        if path == "/tokens/verify":
            return self.ok({"status": "active"})
        if path == "/d1/database" and method == "GET":
            return self.ok([{"uuid": u, "name": n} for n, u in self.databases.items()])
        if path == "/d1/database" and method == "POST":
            self.databases[json["name"]] = "db-uuid-1"
            return self.ok({"uuid": "db-uuid-1", "name": json["name"]})
        if path.endswith("/query"):
            sql = json["sql"]
            if sql.startswith("SELECT name FROM d1_migrations"):
                return self.ok([{"results": [{"name": n} for n in self.migrations_done]}])
            if sql.startswith("INSERT INTO d1_migrations"):
                self.migrations_done.append(json["params"][0])
            return self.ok([{"results": []}])
        if path == "/workers/subdomain" and method == "GET":
            return self.ok({"subdomain": self.subdomain}) if self.subdomain else self.err(10007)
        if path == "/workers/subdomain" and method == "PUT":
            self.subdomain = json["subdomain"]
            return self.ok({"subdomain": self.subdomain})
        if path.endswith("/assets-upload-session"):
            missing = [h["hash"] for h in json["manifest"].values() if h["hash"] not in self.stored_hashes]
            return self.ok({"jwt": "upload-jwt" if missing else "done-jwt", "buckets": [missing] if missing else []})
        if path == "/workers/scripts" and method == "GET":
            return self.ok([{"id": "phone-bridge", "migration_tag": self.migration_tag}] if self.script else [])
        if path == "/workers/scripts/phone-bridge" and method == "PUT":
            meta = dict((name, part) for name, part in files)["metadata"]
            self.script = __import__("json").loads(meta[1])
            if "migrations" in self.script:
                self.migration_tag = self.script["migrations"]["new_tag"]
            return self.ok({"id": "phone-bridge"})
        if path.endswith("/subdomain") and method == "POST":
            return self.ok({"enabled": True})
        raise AssertionError(f"unexpected call {method} {path}")

    def assets_post(self, url, params=None, headers=None, files=None, timeout=None):
        assert headers["Authorization"] == "Bearer upload-jwt"
        for name, _part in files:
            self.stored_hashes.add(name)
        return FakeResponse({"success": True, "result": {"jwt": "done-jwt"}}, 201)


@tagged("post_install", "-at_install")
class TestProvisioner(BaseCase):

    def run_once(self, fake):
        manifest = load_manifest()
        settings = {"API_TOKEN": "t", "ODOO_PASS": "k", "COUNTRY_CODE": "44"}
        prov = cloudflare.Provisioner("acc123", "token", "phone-bridge", BUNDLE_DIR)
        with patch.object(cloudflare.requests.Session, "request", lambda s, *a, **k: fake.session_request(s, *a, **k)), \
                patch.object(cloudflare.requests, "post", fake.assets_post):
            return prov.run(manifest, settings), prov

    def test_fresh_account_then_redeploy(self):
        fake = FakeCloudflare()
        result, prov = self.run_once(fake)
        self.assertEqual(result["worker_url"], "https://phone-bridge.pb-acc123.workers.dev")
        self.assertEqual(result["d1_database_id"], "db-uuid-1")
        all_migrations = [m["name"] for m in load_manifest()["d1_migrations"]]
        self.assertEqual(fake.migrations_done, all_migrations)
        meta = fake.script
        d1 = next(b for b in meta["bindings"] if b["type"] == "d1")
        self.assertEqual(d1["database_id"], "db-uuid-1")
        kinds = {b["name"]: b["type"] for b in meta["bindings"]}
        self.assertEqual(kinds["API_TOKEN"], "secret_text")
        self.assertEqual(kinds["COUNTRY_CODE"], "plain_text")
        self.assertEqual(meta["migrations"]["new_tag"], "v1")
        self.assertNotIn("old_tag", meta["migrations"])
        self.assertEqual(meta["assets"]["jwt"], "done-jwt")
        self.assertIn("_headers", meta["assets"]["config"])

        # Second deploy: nothing new to migrate or upload, same URL.
        result2, prov2 = self.run_once(fake)
        self.assertEqual(result2["worker_url"], result["worker_url"])
        self.assertEqual(fake.migrations_done, all_migrations)
        self.assertNotIn("migrations", fake.script)
        self.assertIn("D1 schema is up to date", prov2.log_text())
        self.assertIn("0 uploaded", prov2.log_text())
