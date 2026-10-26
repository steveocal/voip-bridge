"""Deploys the worker bundle into a Cloudflare account through the REST API.

The steps, and the bundle's manifest.json, are described in docs/bundle.md
of the worker repository. Every step looks before it acts, so Deploy can be
pressed again at any time (that is also how upgrades are installed).
"""

import base64
import hashlib
import json
import mimetypes
from datetime import datetime, timezone
from pathlib import Path

import requests

API = "https://api.cloudflare.com/client/v4"
TIMEOUT = 60


class CloudflareError(Exception):
    pass


class Cloudflare:
    def __init__(self, account_id, token):
        self.account_id = account_id.strip()
        self.session = requests.Session()
        self.session.headers["Authorization"] = f"Bearer {token.strip()}"

    def _url(self, path):
        return f"{API}/accounts/{self.account_id}{path}" if not path.startswith("/user") else f"{API}{path}"

    def request(self, method, path, ok_codes=(), **kwargs):
        """The `result` of a Cloudflare API call. Errors whose codes are in
        ok_codes come back as None instead of raising."""
        res = self.session.request(method, self._url(path), timeout=TIMEOUT, **kwargs)
        try:
            body = res.json()
        except ValueError:
            raise CloudflareError(f"{method} {path}: HTTP {res.status_code}") from None
        if body.get("success"):
            return body.get("result")
        errors = body.get("errors") or []
        if errors and all(e.get("code") in ok_codes for e in errors):
            return None
        detail = "; ".join(f"{e.get('code')}: {e.get('message')}" for e in errors) or f"HTTP {res.status_code}"
        raise CloudflareError(f"{method} {path}: {detail}")


def asset_hash(content, path):
    """32 hex characters identifying a file to the assets service (what
    wrangler sends, except that it uses BLAKE3 where the stdlib has none)."""
    ext = Path(path).suffix.lstrip(".")
    return hashlib.sha256(base64.b64encode(content) + ext.encode()).hexdigest()[:32]


class Provisioner:
    def __init__(self, account_id, token, worker_name, bundle_dir):
        self.cf = Cloudflare(account_id, token)
        self.name = worker_name.strip()
        self.bundle_dir = Path(bundle_dir)
        self.log = []

    def step(self, message):
        self.log.append(f"{datetime.now(timezone.utc):%H:%M:%S} {message}")

    def log_text(self):
        return "\n".join(self.log)

    def run(self, manifest, settings):
        self.check_token()
        db_id = self.ensure_d1()
        self.apply_migrations(db_id, manifest["d1_migrations"])
        subdomain = self.ensure_subdomain()
        assets_jwt = self.upload_assets(manifest["assets"])
        self.upload_script(manifest, settings, db_id, assets_jwt)
        self.enable_workers_dev()
        url = f"https://{self.name}.{subdomain}.workers.dev"
        self.step(f"Worker URL {url}")
        return {"d1_database_id": db_id, "worker_url": url, "version": manifest["version"]}

    # ── Steps ──

    def check_token(self):
        # Account-owned tokens verify under the account, user tokens under /user;
        # which kind this is isn't known up front.
        try:
            result = self.cf.request("GET", "/tokens/verify")
        except CloudflareError:
            result = self.cf.request("GET", "/user/tokens/verify")
        if result.get("status") != "active":
            raise CloudflareError(f"The API token is {result.get('status')}.")
        self.step("API token is active")

    def ensure_d1(self):
        found = self.cf.request("GET", "/d1/database", params={"name": self.name}) or []
        db = next((d for d in found if d.get("name") == self.name), None)
        if db:
            self.step(f"D1 database {self.name} exists")
        else:
            db = self.cf.request("POST", "/d1/database", json={"name": self.name})
            self.step(f"Created D1 database {self.name}")
        return db["uuid"]

    def _query(self, db_id, sql, params=None):
        return self.cf.request("POST", f"/d1/database/{db_id}/query", json={"sql": sql, "params": params or []})

    def apply_migrations(self, db_id, migrations):
        # The same bookkeeping table `wrangler d1 migrations apply` uses.
        self._query(db_id, "CREATE TABLE IF NOT EXISTS d1_migrations ("
                           "id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, "
                           "applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)")
        rows = self._query(db_id, "SELECT name FROM d1_migrations")
        done = {r["name"] for r in (rows[0].get("results") or [])} if rows else set()
        pending = [m for m in migrations if m["name"] not in done]
        for m in pending:
            self._query(db_id, m["sql"])
            self._query(db_id, "INSERT INTO d1_migrations (name) VALUES (?)", [m["name"]])
            self.step(f"Applied D1 migration {m['name']}")
        if not pending:
            self.step("D1 schema is up to date")

    def ensure_subdomain(self):
        # The error for "never chose one" isn't documented, so any failure
        # here means "none yet"; claiming one below surfaces real problems.
        try:
            result = self.cf.request("GET", "/workers/subdomain")
        except CloudflareError:
            result = None
        if result and result.get("subdomain"):
            return result["subdomain"]
        # A new account has none yet; claim one from the account id.
        wanted = f"pb-{self.cf.account_id[:12]}".lower()
        result = self.cf.request("PUT", "/workers/subdomain", json={"subdomain": wanted})
        self.step(f"Registered workers.dev subdomain {result['subdomain']}")
        return result["subdomain"]

    def upload_assets(self, assets):
        root = self.bundle_dir / assets["directory"]
        files = {}
        for f in assets["files"]:
            content = (root / f["path"].lstrip("/")).read_bytes()
            files[f["path"]] = {"content": content, "hash": asset_hash(content, f["path"]), "size": len(content)}
        session = self.cf.request("POST", f"/workers/scripts/{self.name}/assets-upload-session", json={
            "manifest": {p: {"hash": v["hash"], "size": v["size"]} for p, v in files.items()},
        })
        jwt = session["jwt"]
        buckets = session.get("buckets") or []
        by_hash = {v["hash"]: (p, v) for p, v in files.items()}
        uploaded = 0
        for bucket in buckets:
            parts = []
            for h in bucket:
                path, v = by_hash[h]
                mime = mimetypes.guess_type(path)[0] or "application/octet-stream"
                parts.append((h, (h, base64.b64encode(v["content"]), mime)))
            res = requests.post(f"{API}/accounts/{self.cf.account_id}/workers/assets/upload",
                                params={"base64": "true"}, headers={"Authorization": f"Bearer {jwt}"},
                                files=parts, timeout=TIMEOUT)
            body = res.json()
            if not body.get("success"):
                raise CloudflareError(f"asset upload: {body.get('errors') or res.status_code}")
            uploaded += len(bucket)
            if (body.get("result") or {}).get("jwt"):
                jwt = body["result"]["jwt"]
        self.step(f"Static assets: {uploaded} uploaded, {len(files) - uploaded} unchanged")
        return jwt

    def _current_migration_tag(self):
        scripts = self.cf.request("GET", "/workers/scripts") or []
        script = next((s for s in scripts if s.get("id") == self.name), None)
        return script.get("migration_tag") if script else None

    def upload_script(self, manifest, settings, db_id, assets_jwt):
        kinds = {s["name"]: s["kind"] for s in manifest["settings"]}
        bindings = []
        for b in manifest["bindings"]:
            b = dict(b)
            if b.get("database_id") == "{{D1_DATABASE_ID}}":
                b["database_id"] = db_id
            bindings.append(b)
        for name, value in settings.items():
            kind = "secret_text" if kinds.get(name) == "secret" else "plain_text"
            bindings.append({"type": kind, "name": name, "text": value})

        metadata = {
            "main_module": manifest["main_module"],
            "compatibility_date": manifest["compatibility_date"],
            "bindings": bindings,
            "assets": {"jwt": assets_jwt, "config": {}},
        }
        if manifest["assets"].get("headers"):
            metadata["assets"]["config"]["_headers"] = manifest["assets"]["headers"]

        # Durable Object migrations the live script hasn't had yet, as one step.
        tags = [m["tag"] for m in manifest["durable_object_migrations"]]
        current = self._current_migration_tag()
        todo = manifest["durable_object_migrations"][tags.index(current) + 1:] if current in tags \
            else manifest["durable_object_migrations"]
        if todo:
            steps = [{k: v for k, v in m.items() if k != "tag"} for m in todo]
            metadata["migrations"] = {"new_tag": todo[-1]["tag"], "steps": steps}
            if current:
                metadata["migrations"]["old_tag"] = current

        module = (self.bundle_dir / "worker" / manifest["main_module"]).read_bytes()
        if hashlib.sha256(module).hexdigest() != manifest["main_module_sha256"]:
            raise CloudflareError("The worker bundle in the module is damaged (checksum mismatch).")
        files = [
            ("metadata", (None, json.dumps(metadata), "application/json")),
            (manifest["main_module"], (manifest["main_module"], module, "application/javascript+module")),
        ]
        self.cf.request("PUT", f"/workers/scripts/{self.name}", files=files)
        self.step(f"Uploaded worker {self.name} {manifest['version']} with {len(settings)} settings")

    def enable_workers_dev(self):
        self.cf.request("POST", f"/workers/scripts/{self.name}/subdomain",
                        json={"enabled": True, "previews_enabled": False})
        self.step("Enabled on workers.dev")


def health(worker_url):
    res = requests.get(f"{worker_url.rstrip('/')}/health", timeout=15)
    res.raise_for_status()
    return res.json()
