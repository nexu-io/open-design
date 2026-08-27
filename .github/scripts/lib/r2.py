from __future__ import annotations

import datetime as dt
import hashlib
import hmac
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from unittest.mock import patch


class R2Error(RuntimeError):
    pass


class R2PreconditionFailed(R2Error):
    pass


@dataclass(frozen=True)
class R2Credentials:
    access_key_id: str
    secret_access_key: str
    session_token: str | None = None

    def __post_init__(self) -> None:
        if not self.access_key_id or not self.secret_access_key:
            raise R2Error("R2 access key ID and secret access key are required")


def _sign(key: bytes, message: str) -> bytes:
    return hmac.new(key, message.encode(), hashlib.sha256).digest()


def _signing_key(secret: str, date: str, region: str) -> bytes:
    date_key = _sign(f"AWS4{secret}".encode(), date)
    region_key = _sign(date_key, region)
    service_key = _sign(region_key, "s3")
    return _sign(service_key, "aws4_request")


class R2Client:
    """Minimal Cloudflare R2 S3 client for immutable object publication."""

    def __init__(
        self,
        *,
        endpoint: str,
        bucket: str,
        credentials: R2Credentials,
        region: str = "auto",
        timeout: float = 15.0,
    ) -> None:
        parsed = urllib.parse.urlparse(endpoint.rstrip("/"))
        if parsed.scheme != "https" or not parsed.netloc or parsed.path not in {"", "/"}:
            raise R2Error("R2 endpoint must be an HTTPS origin without a path")
        if parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise R2Error("R2 endpoint must not contain credentials, query, or fragment")
        if not bucket or "/" in bucket:
            raise R2Error("R2 bucket must be a non-empty bucket name")
        self.endpoint = endpoint.rstrip("/")
        self.bucket = bucket
        self.credentials = credentials
        self.region = region
        self.timeout = timeout

    def put_file(
        self,
        *,
        key: str,
        file: Path,
        content_type: str = "application/json",
        cache_control: str = "public, max-age=31536000, immutable",
        if_none_match: bool = True,
    ) -> None:
        if not file.is_file() or file.stat().st_size == 0:
            raise R2Error(f"R2 upload source must be a non-empty file: {file}")
        self.put_bytes(
            key=key,
            body=file.read_bytes(),
            content_type=content_type,
            cache_control=cache_control,
            if_none_match=if_none_match,
        )

    def put_bytes(
        self,
        *,
        key: str,
        body: bytes,
        content_type: str = "application/json",
        cache_control: str = "public, max-age=31536000, immutable",
        if_none_match: bool = True,
    ) -> None:
        if not key or key.startswith("/") or ".." in key.split("/"):
            raise R2Error("R2 object key must be a safe relative key")
        if not body:
            raise R2Error("R2 object body must not be empty")

        now = dt.datetime.now(dt.timezone.utc)
        amz_date = now.strftime("%Y%m%dT%H%M%SZ")
        date = now.strftime("%Y%m%d")
        payload_hash = hashlib.sha256(body).hexdigest()
        canonical_uri = "/" + urllib.parse.quote(f"{self.bucket}/{key}", safe="/-_.~")
        url = f"{self.endpoint}{canonical_uri}"
        host = urllib.parse.urlparse(self.endpoint).netloc
        headers = {
            "cache-control": cache_control,
            "content-type": content_type,
            "host": host,
            "x-amz-content-sha256": payload_hash,
            "x-amz-date": amz_date,
        }
        if if_none_match:
            headers["if-none-match"] = "*"
        if self.credentials.session_token:
            headers["x-amz-security-token"] = self.credentials.session_token

        signed_headers = ";".join(sorted(headers))
        canonical_headers = "".join(f"{name}:{headers[name].strip()}\n" for name in sorted(headers))
        canonical_request = "\n".join(
            ["PUT", canonical_uri, "", canonical_headers, signed_headers, payload_hash]
        )
        scope = f"{date}/{self.region}/s3/aws4_request"
        string_to_sign = "\n".join(
            [
                "AWS4-HMAC-SHA256",
                amz_date,
                scope,
                hashlib.sha256(canonical_request.encode()).hexdigest(),
            ]
        )
        signature = hmac.new(
            _signing_key(self.credentials.secret_access_key, date, self.region),
            string_to_sign.encode(),
            hashlib.sha256,
        ).hexdigest()
        headers["authorization"] = (
            f"AWS4-HMAC-SHA256 Credential={self.credentials.access_key_id}/{scope}, "
            f"SignedHeaders={signed_headers}, Signature={signature}"
        )
        request = urllib.request.Request(url, data=body, headers=headers, method="PUT")
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                if response.status not in {200, 201}:
                    raise R2Error(f"R2 PUT returned HTTP {response.status}")
        except urllib.error.HTTPError as error:
            if error.code == 412:
                raise R2PreconditionFailed(f"R2 object already exists: {key}") from error
            detail = error.read(2048).decode("utf-8", "replace")
            raise R2Error(f"R2 PUT failed with HTTP {error.code}: {detail}") from error
        except urllib.error.URLError as error:
            raise R2Error(f"R2 PUT failed: {error.reason}") from error


def self_check() -> None:
    captured: list[urllib.request.Request] = []

    class Response:
        status = 200

        def __enter__(self):
            return self

        def __exit__(self, *_args) -> None:
            return None

    def open_request(request: urllib.request.Request, **_kwargs):
        captured.append(request)
        return Response()

    client = R2Client(
        endpoint="https://account.r2.cloudflarestorage.com",
        bucket="results",
        credentials=R2Credentials("access", "secret"),
    )
    with patch("urllib.request.urlopen", open_request):
        client.put_bytes(key="path/result.json", body=b"{}")
    if len(captured) != 1:
        raise R2Error("R2 self-check did not issue exactly one request")
    request = captured[0]
    if request.full_url != "https://account.r2.cloudflarestorage.com/results/path/result.json":
        raise R2Error("R2 self-check produced an unexpected URL")
    if request.get_header("If-none-match") != "*":
        raise R2Error("R2 self-check omitted the immutable write precondition")
    authorization = request.get_header("Authorization") or ""
    if not authorization.startswith("AWS4-HMAC-SHA256 Credential=access/"):
        raise R2Error("R2 self-check produced an invalid authorization header")
