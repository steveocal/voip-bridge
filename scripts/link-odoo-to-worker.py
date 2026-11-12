#!/usr/bin/env python3
"""Link the Odoo phone_bridge addon to the live voip-bridge Worker.

The Odoo phone panel sends its call events, and fetches Emails, Google status
and the Parked list, through the Worker. For that, Odoo's Phone Bridge
Installation needs the Worker URL and an API token that the Worker also has
(secret API_TOKEN, checked in src/users.ts sessionUser).

This script:
  1. makes a new random token (it is never printed);
  2. sets it on the Worker:  wrangler secret put API_TOKEN;
  3. writes worker_url + api_token on Odoo's phone_bridge.installation,
     signing in to Odoo with the login and password (or API key) you type.

Run from the repo root:  python3 scripts/link-odoo-to-worker.py
Running it again makes a new token and updates both sides.
"""
import getpass
import json
import secrets
import subprocess
import sys
import urllib.error
import urllib.request

ODOO_URL = "https://www.infraredheaterpanels.co.uk"
ODOO_DB = "www.infraredheaterpanels.co.uk"
WORKER_URL = "https://voip-bridge.wandering-mode-c597.workers.dev"
# The site's firewall answers 403 to Python's default "Python-urllib" user agent.
UA = {"User-Agent": "voip-bridge-script/1.0"}


def rpc(service, method, *args):
    body = json.dumps({"jsonrpc": "2.0", "method": "call",
                       "params": {"service": service, "method": method, "args": args}}).encode()
    req = urllib.request.Request(f"{ODOO_URL}/jsonrpc", body, {"Content-Type": "application/json", **UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        res = json.load(r)
    if res.get("error"):
        raise SystemExit("Odoo: " + (res["error"].get("data", {}).get("message") or res["error"]["message"]))
    return res["result"]


def main():
    import os
    login = os.environ.get("ODOO_LOGIN", "").strip()
    password = os.environ.get("ODOO_PASSWORD", "")
    if not (login and password):
        if not sys.stdin.isatty():
            raise SystemExit("No keyboard here (Claude's ! runs without one). Run it in your own terminal:\n"
                             "  cd ~/dDev/voip-bridge && python3 scripts/link-odoo-to-worker.py\n"
                             "or set ODOO_LOGIN and ODOO_PASSWORD first.")
        login = login or input("Odoo login (e.g. admin@ihpltd.co.uk): ").strip()
        password = password or getpass.getpass("Odoo password or API key: ")
    uid = rpc("common", "authenticate", ODOO_DB, login, password, {})
    if not uid:
        raise SystemExit("Odoo sign-in failed; nothing changed.")
    inst = rpc("object", "execute_kw", ODOO_DB, uid, password,
               "phone_bridge.installation", "search", [[]], {"limit": 1})
    if not inst:
        raise SystemExit("No Phone Bridge Installation record in Odoo; nothing changed.")

    token = secrets.token_urlsafe(32)
    print("Setting API_TOKEN on the Worker…")
    put = subprocess.run(["npx", "wrangler", "secret", "put", "API_TOKEN"], input=token + "\n",
                         text=True, capture_output=True)
    if put.returncode != 0:
        sys.stderr.write(put.stdout + put.stderr)
        raise SystemExit("wrangler secret put failed; Odoo not changed.")

    print("Writing Worker URL and token in Odoo…")
    rpc("object", "execute_kw", ODOO_DB, uid, password, "phone_bridge.installation", "write",
        [inst, {"worker_url": WORKER_URL, "api_token": token}])

    # Check: the Worker accepts the token (as the Odoo user who ran this).
    req = urllib.request.Request(f"{WORKER_URL}/google/status",
                                 headers={"Authorization": f"Bearer {token}", "X-Odoo-User": str(uid), **UA})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            print("Worker check:", r.status, r.read(200).decode(errors="replace"))
    except urllib.error.HTTPError as e:
        print("Worker check failed:", e.code, "(the secret can take a few seconds to apply; run the check again)")
    print("Done. Refresh Odoo so the phone panel picks it up.")


if __name__ == "__main__":
    main()
