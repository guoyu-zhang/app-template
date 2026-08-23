#!/usr/bin/env python3
"""App Store Connect setup helper — step 2 of setup_guides/NEW_APP_CHECKLIST.md.

Automates the parts of the Apple setup that have an API, and tells you
plainly when you've hit the part that doesn't (the app record itself,
which is web-UI only).

Credentials — set these in the environment or a .env beside the repo root:

    ASC_KEY_ID           e.g. M4JWHCQM23  (the ...AuthKey_<KEY_ID>.p8 filename)
    ASC_ISSUER_ID        a UUID, from App Store Connect -> Users and Access
                         -> Integrations -> App Store Connect API (top of page)
    ASC_PRIVATE_KEY      path to the .p8  (default: secrets/AuthKey_<KEY_ID>.p8)

Usage:

    python3 scripts/asc_setup.py whoami
    python3 scripts/asc_setup.py list-bundle-ids
    python3 scripts/asc_setup.py register-bundle-id \
        --identifier com.xlaris.chinese --name "Chinese Learning"
    python3 scripts/asc_setup.py check-app --identifier com.xlaris.chinese

Only `cryptography` is required (already in the project venv); everything
else is stdlib.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

try:
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
except ImportError:
    sys.exit(
        "Missing dependency: cryptography\n"
        "  pip install cryptography   (or activate the project venv)"
    )

API_ROOT = "https://api.appstoreconnect.apple.com"
REPO_ROOT = Path(__file__).resolve().parent.parent


class ApiError(RuntimeError):
    """An error payload returned by App Store Connect."""


# --------------------------------------------------------------------------
# credentials
# --------------------------------------------------------------------------


def load_dotenv() -> None:
    """Populate os.environ from .env without overriding real env vars."""
    env_file = REPO_ROOT / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


def credentials() -> tuple[str, str, bytes]:
    load_dotenv()

    key_id = os.environ.get("ASC_KEY_ID")
    issuer_id = os.environ.get("ASC_ISSUER_ID")

    if not key_id:
        sys.exit(
            "ASC_KEY_ID is not set.\n"
            "It's the middle of your key filename: AuthKey_<KEY_ID>.p8"
        )
    if not issuer_id:
        sys.exit(
            "ASC_ISSUER_ID is not set.\n"
            "Find it at App Store Connect -> Users and Access -> Integrations\n"
            "-> App Store Connect API. It's the UUID shown above the key table."
        )

    key_path = Path(
        os.environ.get("ASC_PRIVATE_KEY")
        or REPO_ROOT / "secrets" / f"AuthKey_{key_id}.p8"
    )
    if not key_path.exists():
        sys.exit(f"Private key not found: {key_path}\nSet ASC_PRIVATE_KEY to its path.")

    return key_id, issuer_id, key_path.read_bytes()


# --------------------------------------------------------------------------
# ES256 JWT (hand-rolled so PyJWT isn't a dependency)
# --------------------------------------------------------------------------


def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def make_token(key_id: str, issuer_id: str, private_key_pem: bytes) -> str:
    key = serialization.load_pem_private_key(private_key_pem, password=None)
    if not isinstance(key, ec.EllipticCurvePrivateKey):
        sys.exit("Key is not an EC private key — is this really an App Store Connect .p8?")

    now = int(time.time())
    header = {"alg": "ES256", "kid": key_id, "typ": "JWT"}
    # Apple rejects tokens with a lifetime over 20 minutes.
    payload = {
        "iss": issuer_id,
        "iat": now,
        "exp": now + 900,
        "aud": "appstoreconnect-v1",
    }

    def part(obj: dict) -> str:
        return _b64url(json.dumps(obj, separators=(",", ":")).encode())

    signing_input = f"{part(header)}.{part(payload)}".encode()

    # cryptography returns a DER signature; JWS wants raw r||s, 32 bytes each.
    der = key.sign(signing_input, ec.ECDSA(hashes.SHA256()))
    r, s = decode_dss_signature(der)
    signature = r.to_bytes(32, "big") + s.to_bytes(32, "big")

    return f"{signing_input.decode()}.{_b64url(signature)}"


# --------------------------------------------------------------------------
# HTTP
# --------------------------------------------------------------------------


def api(
    method: str,
    path: str,
    token: str,
    body: dict | None = None,
    params: dict | None = None,
) -> dict:
    url = API_ROOT + path
    if params:
        url += "?" + urllib.parse.urlencode(params)

    payload = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(url, data=payload, method=method)
    request.add_header("Authorization", f"Bearer {token}")
    if payload:
        request.add_header("Content-Type", "application/json")

    try:
        with urllib.request.urlopen(request) as response:
            raw = response.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")
        try:
            errors = json.loads(detail).get("errors", [])
            rendered = "\n".join(
                f"  [{e.get('status')}] {e.get('title')}: {e.get('detail')}"
                for e in errors
            )
        except json.JSONDecodeError:
            rendered = f"  {detail}"
        raise ApiError(f"{method} {path} failed\n{rendered}") from None


# --------------------------------------------------------------------------
# commands
# --------------------------------------------------------------------------


def find_bundle_id(token: str, identifier: str) -> dict | None:
    result = api(
        "GET",
        "/v1/bundleIds",
        token,
        params={"filter[identifier]": identifier, "limit": 200},
    )
    # filter[identifier] is a prefix-ish match on some accounts, so confirm exactly.
    for entry in result.get("data", []):
        if entry["attributes"]["identifier"] == identifier:
            return entry
    return None


def cmd_whoami(args, token: str) -> int:
    result = api("GET", "/v1/apps", token, params={"limit": 1})
    print("Credentials OK — authenticated against App Store Connect.")
    total = result.get("meta", {}).get("paging", {}).get("total")
    if total is not None:
        print(f"Apps visible to this key: {total}")
    return 0


def cmd_list_bundle_ids(args, token: str) -> int:
    result = api("GET", "/v1/bundleIds", token, params={"limit": 200})
    rows = result.get("data", [])
    if not rows:
        print("No bundle IDs registered.")
        return 0
    width = max(len(r["attributes"]["identifier"]) for r in rows)
    for row in sorted(rows, key=lambda r: r["attributes"]["identifier"]):
        attrs = row["attributes"]
        print(f"  {attrs['identifier']:<{width}}  {attrs.get('name', '')}")
    return 0


def cmd_register_bundle_id(args, token: str) -> int:
    existing = find_bundle_id(token, args.identifier)
    if existing:
        print(f"Already registered: {args.identifier}")
        print(f"  name: {existing['attributes'].get('name')}")
        print(f"  id:   {existing['id']}")
        return 0

    attributes = {
        "identifier": args.identifier,
        "name": args.name,
        "platform": args.platform,
    }
    if args.seed_id:
        attributes["seedId"] = args.seed_id

    result = api(
        "POST",
        "/v1/bundleIds",
        token,
        body={"data": {"type": "bundleIds", "attributes": attributes}},
    )
    print(f"Registered {args.identifier}")
    print(f"  id: {result['data']['id']}")
    print("\nNext: create the app record in the App Store Connect web UI")
    print("      (https://appstoreconnect.apple.com/apps -> +) — no API exists.")
    print(f"      Then: {sys.argv[0]} check-app --identifier {args.identifier}")
    return 0


def cmd_check_app(args, token: str) -> int:
    """Confirm the (manually created) app record exists and print its numeric ID."""
    bundle = find_bundle_id(token, args.identifier)
    print(
        f"Bundle ID {args.identifier}: "
        + ("registered" if bundle else "NOT registered — run register-bundle-id")
    )

    result = api(
        "GET", "/v1/apps", token, params={"filter[bundleId]": args.identifier}
    )
    apps = result.get("data", [])
    if not apps:
        print("App record:  not found")
        print("\nCreate it at https://appstoreconnect.apple.com/apps (+ -> New App).")
        print("This is the one step with no API — it must be done in the browser.")
        return 1

    app = apps[0]
    print("App record:  found")
    print(f"  name:      {app['attributes'].get('name')}")
    print(f"  sku:       {app['attributes'].get('sku')}")
    print(f"  app id:    {app['id']}")
    print(f"\nSet in .env:\n  EXPO_PUBLIC_IOS_APP_STORE_ID={app['id']}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="App Store Connect setup helper",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("whoami", help="verify credentials work").set_defaults(
        func=cmd_whoami
    )
    sub.add_parser("list-bundle-ids", help="list registered bundle IDs").set_defaults(
        func=cmd_list_bundle_ids
    )

    register = sub.add_parser("register-bundle-id", help="register a new bundle ID")
    register.add_argument("--identifier", required=True, help="e.g. com.xlaris.chinese")
    register.add_argument("--name", required=True, help="display name in the portal")
    register.add_argument(
        "--platform",
        default="IOS",
        choices=["IOS", "MAC_OS", "UNIVERSAL"],
        help="IOS is the safe default; UNIVERSAL is rejected on some accounts",
    )
    register.add_argument("--seed-id", help="team ID; usually inferred, e.g. 2SWSWS8SCA")
    register.set_defaults(func=cmd_register_bundle_id)

    check = sub.add_parser("check-app", help="check for the app record, print its ID")
    check.add_argument("--identifier", required=True)
    check.set_defaults(func=cmd_check_app)

    args = parser.parse_args()

    key_id, issuer_id, private_key = credentials()
    token = make_token(key_id, issuer_id, private_key)

    try:
        return args.func(args, token)
    except ApiError as exc:
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
