"""Stdlib-only Feishu transports. Observe/report; never authorize a release.

The archived electron POC supplies the signing, no-redirect and redaction model.
Application-bot credentials remain independent of fallback webhook credentials.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def signed_envelope(card, secret, timestamp=None):
    envelope = {"msg_type": "interactive", "card": card}
    if secret:
        timestamp = str(int(time.time()) if timestamp is None else timestamp)
        signature = hmac.new(f"{timestamp}\n{secret}".encode(), b"", hashlib.sha256).digest()
        envelope.update(timestamp=timestamp, sign=base64.b64encode(signature).decode())
    return envelope


def request_json(url, body, *, method="POST", token="", retry_codes=(), opener=None, sleep=time.sleep):
    parsed = urllib.parse.urlsplit(url)
    loopback = parsed.scheme == "http" and parsed.hostname in {"127.0.0.1", "::1", "localhost"}
    if (parsed.scheme != "https" and not loopback) or parsed.username or parsed.password:
        raise ValueError("Feishu transport requires HTTPS without URL credentials")
    opener = opener or urllib.request.build_opener(NoRedirect())
    for attempt in range(5):
        headers = {"Content-Type": "application/json; charset=utf-8"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        request = urllib.request.Request(url, data=json.dumps(body, ensure_ascii=False).encode(), headers=headers, method=method)
        retry = False
        try:
            with opener.open(request, timeout=15) as response:
                result = json.load(response)
            code = result.get("code", result.get("StatusCode"))
            if code == 0:
                return result
            retry = code in retry_codes
        except urllib.error.HTTPError as error:
            retry = error.code == 429 or error.code >= 500
        except (OSError, urllib.error.URLError):
            retry = True
        except (ValueError, AttributeError):
            pass
        if not retry or attempt == 4:
            raise RuntimeError("Feishu delivery failed (response details redacted)") from None
        sleep(2 ** attempt)


def send_webhook(card, *, env=os.environ, **kwargs):
    url = env.get("FEISHU_WEBHOOK", "")
    if not url:
        raise ValueError("FEISHU_WEBHOOK is required")
    return request_json(url, signed_envelope(card, env.get("FEISHU_SIGN_SECRET", "")), retry_codes=(9499,), **kwargs)


class AppClient:
    def __init__(self, app_id, app_secret, *, base_url=None, request=request_json, now=time.time):
        self.app_id, self.app_secret = app_id, app_secret
        self.base_url = (base_url or os.environ.get("FEISHU_BASE_URL", "https://open.feishu.cn")).rstrip("/")
        self.request, self.now = request, now
        self._token, self.expires = "", 0

    def call(self, path, body, **kwargs):
        return self.request(self.base_url + path, body, retry_codes=(99991400, 230020, 11232), **kwargs)

    def token(self):
        if self._token and self.now() < self.expires - 60:
            return self._token
        result = self.call("/open-apis/auth/v3/tenant_access_token/internal", {"app_id": self.app_id, "app_secret": self.app_secret})
        token = result.get("tenant_access_token")
        if not isinstance(token, str) or not token:
            raise ValueError("Feishu token response carried no token")
        ttl = result.get("expire", 7200)
        self._token, self.expires = token, self.now() + (ttl if isinstance(ttl, (int, float)) and ttl > 0 else 7200)
        return token

    def send_card(self, chat_id, card):
        result = self.call("/open-apis/im/v1/messages?receive_id_type=chat_id", {
            "receive_id": chat_id, "msg_type": "interactive", "content": json.dumps(card, ensure_ascii=False),
        }, token=self.token())
        message_id = result.get("data", {}).get("message_id")
        if not isinstance(message_id, str) or not message_id:
            raise ValueError("Feishu message send returned no message_id")
        return message_id

    def patch_card(self, message_id, card):
        self.call("/open-apis/im/v1/messages/" + urllib.parse.quote(message_id, safe=""),
                  {"content": json.dumps(card, ensure_ascii=False)}, method="PATCH", token=self.token())
