#!/usr/bin/env python3
"""Publish the repository's post-update "What's New" document to R2.

The daemon reads one hosted JSON document and resolves anything malformed to
"no highlight" instead of an error (apps/daemon/src/services/whats-new.ts).
A successful upload therefore proves nothing on its own: a broken document
uploads just as cleanly as a good one and simply removes the card. This
publisher is built around that asymmetry:

  * the bytes are parsed before they are sent, so a broken document cannot
    reach the bucket at all;
  * the object is read back from the public origin the daemon actually
    fetches, with the edge cache bypassed, and the round-tripped bytes must
    equal what was sent.

Structural validation of the document against the shipping parser lives in
`scripts/check-whats-new-document.ts` (part of `pnpm guard`); the workflow
runs it before this script so there is exactly one implementation of the
content contract.

Environment:
  WHATS_NEW_DOCUMENT              path to the source document
  WHATS_NEW_OBJECT_KEY            object key in the bucket
  WHATS_NEW_PUBLIC_URL            public URL the daemon reads
  WHATS_NEW_STORAGE_ENDPOINT      R2 S3 endpoint origin
  WHATS_NEW_STORAGE_BUCKET        bucket name
  WHATS_NEW_STORAGE_ACCESS_KEY_ID / WHATS_NEW_STORAGE_SECRET_ACCESS_KEY
  WHATS_NEW_DRY_RUN               "true" to validate and diff without uploading
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
import urllib.error
import urllib.request
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib.github import append_summary  # noqa: E402
from lib.r2 import R2Client, R2Credentials, R2Error  # noqa: E402

# Matches the `Cache-Control` the object is already served with. Short enough
# that an edit reaches users promptly, long enough that Home activations do
# not hammer the origin. The daemon adds its own ~10 minute process cache.
CACHE_CONTROL = "public, max-age=300"
CONTENT_TYPE = "application/json"
READ_BACK_TIMEOUT = 20.0
# The public origin sits behind Cloudflare, which answers the stdlib default
# `Python-urllib/x.y` User-Agent with 403. Without an explicit one, read-back
# verification fails on every run and the publisher can never confirm anything.
READ_HEADERS = {
    "accept": "application/json",
    "user-agent": "open-design-whats-new-publisher/1 (+https://github.com/nexu-io/open-design)",
}

REQUIRED_STORAGE_VARS = (
    "WHATS_NEW_STORAGE_ENDPOINT",
    "WHATS_NEW_STORAGE_BUCKET",
    "WHATS_NEW_STORAGE_ACCESS_KEY_ID",
    "WHATS_NEW_STORAGE_SECRET_ACCESS_KEY",
)

# The GitHub environment that holds the R2 credentials, named here because the
# missing-credentials error is the one place an operator reads when the publish
# fails — and following it to the wrong place reopens the trust boundary.
# Repository secrets are readable from any job on any branch, so storing them
# there would let a modified workflow dispatched from an unreviewed ref publish
# to every installed client. The environment's deployment-branch policy allows
# `main` and trusted `release/v*` branches; see docs/whats-new.md.
PUBLISH_ENVIRONMENT = "whats-new-publish"


class PublishError(RuntimeError):
    pass


def _env(name: str, default: str | None = None) -> str:
    value = os.environ.get(name, default if default is not None else "").strip()
    if not value:
        raise PublishError(f"{name} is required")
    return value


def _highlight_id(payload: object) -> str | None:
    if not isinstance(payload, dict):
        return None
    value = payload.get("id")
    return value.strip() if isinstance(value, str) and value.strip() else None


def read_document(path: Path) -> tuple[bytes, object]:
    """Read the source document, refusing anything that is not valid JSON."""
    try:
        body = path.read_bytes()
    except OSError as error:
        raise PublishError(f"cannot read {path}: {error}") from error
    if not body.strip():
        raise PublishError(f"{path} is empty; publish `{{}}` to retire the card instead")
    try:
        payload = json.loads(body)
    except json.JSONDecodeError as error:
        raise PublishError(f"{path} is not valid JSON: {error}") from error
    if not isinstance(payload, dict):
        raise PublishError(f"{path} must contain a JSON object")
    return body, payload


def fetch_live(url: str) -> tuple[bytes | None, object | None]:
    """Fetch the currently published document. Absence is not an error."""
    try:
        request = urllib.request.Request(url, headers=READ_HEADERS)
        with urllib.request.urlopen(request, timeout=READ_BACK_TIMEOUT) as response:
            body = response.read()
    except (urllib.error.URLError, TimeoutError) as error:
        print(f"note: could not read the live document ({error}); continuing")
        return None, None
    try:
        return body, json.loads(body)
    except json.JSONDecodeError:
        print("note: the live document is not valid JSON; continuing")
        return body, None


def read_back(url: str, expected: bytes) -> None:
    """Verify the object from the origin the daemon reads, past the edge cache.

    The object is served with a 300s `Cache-Control`, so a plain GET right
    after the upload can legitimately return the previous document. A unique
    query string produces a distinct cache key, which forces the edge to go
    to the bucket and makes this a real check on what was stored rather than
    a check on what happens to be cached.
    """
    separator = "&" if "?" in url else "?"
    probe = f"{url}{separator}publish-verify={uuid.uuid4().hex}"
    try:
        request = urllib.request.Request(probe, headers=READ_HEADERS)
        with urllib.request.urlopen(request, timeout=READ_BACK_TIMEOUT) as response:
            status = response.status
            body = response.read()
            content_type = response.headers.get("content-type", "")
            cache_control = response.headers.get("cache-control", "")
    except (urllib.error.URLError, TimeoutError) as error:
        raise PublishError(f"read-back of {url} failed: {error}") from error

    if status != 200:
        raise PublishError(f"read-back of {url} returned HTTP {status}")
    if body != expected:
        raise PublishError(
            f"read-back of {url} returned {len(body)} bytes that differ from the {len(expected)} bytes uploaded"
        )
    if "json" not in content_type.lower():
        raise PublishError(f"read-back of {url} returned content-type {content_type!r}, expected JSON")
    print(f"read-back verified: {url} serves the uploaded bytes (cache-control: {cache_control or 'unset'})")


def main() -> int:
    document_path = Path(_env("WHATS_NEW_DOCUMENT", "docs/whats-new.json"))
    object_key = _env("WHATS_NEW_OBJECT_KEY", "whats-new.json")
    public_url = _env("WHATS_NEW_PUBLIC_URL", "https://whatsnew.open-design.ai/whats-new.json")
    dry_run = os.environ.get("WHATS_NEW_DRY_RUN", "").strip().lower() == "true"

    body, payload = read_document(document_path)
    new_id = _highlight_id(payload)
    print(f"source: {document_path} ({len(body)} bytes), highlight id: {new_id or '(none — card retired)'}")

    _, live_payload = fetch_live(public_url)
    live_id = _highlight_id(live_payload)
    print(f"live:   {public_url}, highlight id: {live_id or '(none)'}")

    notes: list[str] = []
    if new_id is not None and new_id == live_id:
        # The client stores the last id it showed and only re-opens the card
        # when the id changes, so republishing under the same id updates the
        # document for new profiles but shows nothing to anyone who already
        # dismissed it. That is a legitimate copy-fix flow, not an error.
        notes.append(
            f"`id` is unchanged (`{new_id}`), so users who already saw this card will not see it again. "
            "Change `id` when the card should re-appear."
        )
    if new_id is None:
        notes.append("This document resolves to no highlight, which takes the card down.")

    for note in notes:
        print(f"note: {note}")

    if dry_run:
        print("dry run: skipping upload")
        append_summary(
            "\n".join(
                [
                    "### What's New — dry run",
                    "",
                    f"- source: `{document_path}` → `{object_key}`",
                    f"- would publish id: `{new_id or '(none)'}` (live: `{live_id or '(none)'}`)",
                    *[f"- note: {note}" for note in notes],
                ]
            )
        )
        return 0

    missing = [name for name in REQUIRED_STORAGE_VARS if not os.environ.get(name, "").strip()]
    if missing:
        raise PublishError(
            "missing R2 credentials: "
            + ", ".join(missing)
            + f". These must be environment secrets on the `{PUBLISH_ENVIRONMENT}` GitHub"
            " environment, restricted to `main` and trusted `release/v*` branches. Do NOT add them as repository"
            " secrets: those are readable from any job on any branch and would let an"
            " unreviewed ref publish to every installed client. See docs/whats-new.md."
        )

    client = R2Client(
        endpoint=_env("WHATS_NEW_STORAGE_ENDPOINT"),
        bucket=_env("WHATS_NEW_STORAGE_BUCKET"),
        credentials=R2Credentials(
            _env("WHATS_NEW_STORAGE_ACCESS_KEY_ID"),
            _env("WHATS_NEW_STORAGE_SECRET_ACCESS_KEY"),
        ),
    )
    # Unlike release artifacts, this object is deliberately mutable: the whole
    # point of the file is that operators overwrite it.
    client.put_bytes(
        key=object_key,
        body=body,
        content_type=CONTENT_TYPE,
        cache_control=CACHE_CONTROL,
        if_none_match=False,
    )
    print(f"uploaded {object_key} ({len(body)} bytes)")

    read_back(public_url, body)

    append_summary(
        "\n".join(
            [
                "### What's New published",
                "",
                f"- source: `{document_path}` → `{object_key}`",
                f"- highlight id: `{new_id or '(none)'}` (was `{live_id or '(none)'}`)",
                f"- verified at {public_url}",
                *[f"- note: {note}" for note in notes],
                "",
                "Edge cache and the daemon's own cache mean users see this within ~15 minutes.",
            ]
        )
    )
    return 0


def self_check() -> None:
    """Prove the read-back gate can fail before trusting it to pass.

    Read-back is the only thing standing between "the upload command exited
    zero" and "the card users fetch is the one we meant to publish", so a
    green read-back is worthless unless a wrong body actually turns it red.
    """
    import http.server
    import threading

    served: dict[str, bytes] = {"body": b'{"id":"served"}'}
    requested: list[str] = []

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802 - stdlib naming
            requested.append(self.path)
            body = served["body"]
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.send_header("cache-control", CACHE_CONTROL)
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *_args: object) -> None:
            return

    server = http.server.HTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    url = f"http://127.0.0.1:{server.server_address[1]}/whats-new.json"
    try:
        read_back(url, served["body"])
        if len(requested) != 1 or "publish-verify=" not in requested[0]:
            raise PublishError("read-back must bypass the edge cache with a unique query string")

        served["body"] = b'{"id":"stale"}'
        try:
            read_back(url, b'{"id":"fresh"}')
        except PublishError:
            pass
        else:
            raise PublishError("read-back accepted a body that differs from what was uploaded")

        with tempfile.TemporaryDirectory() as scratch:
            path = Path(scratch) / "whats-new.json"
            for bad in (b"", b"{ not json }", b"[]"):
                path.write_bytes(bad)
                try:
                    read_document(path)
                except PublishError:
                    continue
                raise PublishError(f"read_document accepted an invalid document: {bad!r}")
    finally:
        server.shutdown()
        server.server_close()
    print("publish_whats_new self-check passed")


if __name__ == "__main__":
    try:
        if len(sys.argv) > 1 and sys.argv[1] == "self-check":
            self_check()
            raise SystemExit(0)
        raise SystemExit(main())
    except (PublishError, R2Error) as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1) from error
