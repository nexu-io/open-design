"""Bluesky search via AT Protocol (requires app password).

Uses bsky.social for auth and public.api.bsky.app for post search.
Requires BSKY_HANDLE and BSKY_APP_PASSWORD env vars.
"""

import math
import re
import sys
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from . import http, log

BSKY_SESSION_URL = "https://bsky.social/xrpc/com.atproto.server.createSession"
BSKY_SEARCH_URL = "https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts"

DEPTH_CONFIG = {
    "quick": 15,
    "default": 30,
    "deep": 60,
}

# Module-level token cache (valid for the lifetime of a single research run)
_cached_token: Optional[str] = None
_token_created_at: float = 0.0
_session_error: Optional[str] = None
_TOKEN_MAX_AGE_SECONDS = 5400  # 90 minutes (conservative, tokens last ~2 hours)


def _log(msg: str):
    log.source_log("Bluesky", msg)


def _create_session(handle: str, app_password: str) -> Optional[str]:
    """Create an AT Protocol session and return the access token.

    Args:
        handle: Bluesky handle (e.g. user.bsky.social)
        app_password: App password from bsky.app/settings/app-passwords

    Returns:
        Access JWT string, or None on failure. Sets _session_error on failure.
    """
    global _cached_token, _token_created_at, _session_error
    if _cached_token and (time.monotonic() - _token_created_at < _TOKEN_MAX_AGE_SECONDS):
        return _cached_token
    if _cached_token:
        _log("Session token expired, re-authenticating")
        _cached_token = None
        _token_created_at = 0.0

    try:
        response = http.request(
            "POST",
            BSKY_SESSION_URL,
            json_data={"identifier": handle, "password": app_password},
            timeout=15,
        )
        token = response.get("accessJwt")
        if token:
            _cached_token = token
            _token_created_at = time.monotonic()
            _session_error = None
            _log("Session created successfully")
            return token
        _log("No accessJwt in session response")
        _session_error = "No accessJwt in session response"
        return None
    except http.HTTPError as e:
        if e.status_code == 403 and e.body and "cloudflare" in e.body.lower():
            _session_error = "Cloudflare blocked the request (403 Forbidden). This is a network-level block, not an auth issue. Try a different network or VPN."
        elif e.status_code == 401:
            _session_error = "Invalid credentials (401 Unauthorized). Check BSKY_HANDLE and BSKY_APP_PASSWORD."
        else:
            _session_error = f"Session request failed: {e}"
        _log(f"Session creation failed: {_session_error}")
        return None
    except Exception as e:
        _session_error = f"Session request failed: {type(e).__name__}: {e}"
        _log(f"Session creation failed: {_session_error}")
        return None


def _reset_session_cache() -> None:
    global _cached_token, _token_created_at, _session_error
    _cached_token = None
    _token_created_at = 0.0
    _session_error = None


def _extract_core_subject(topic: str) -> str:
    """Extract core subject from verbose query for Bluesky search."""
    from .query import extract_core_subject
    _BSKY_NOISE = frozenset({
        'best', 'top', 'good', 'great', 'awesome',
        'latest', 'new', 'news', 'update', 'updates',
        'trending', 'hottest', 'popular', 'viral',
        'practices', 'features', 'recommendations', 'advice',
    })
    return extract_core_subject(topic, noise=_BSKY_NOISE)


def _parse_date(item: Dict[str, Any]) -> Optional[str]:
    """Parse date from Bluesky post to YYYY-MM-DD.

    AT Protocol uses ISO 8601 format in indexedAt and createdAt fields.
    """
    for key in ("indexedAt", "createdAt"):
        val = item.get(key)
        if val and isinstance(val, str):
            try:
                dt = datetime.fromisoformat(val.replace("Z", "+00:00"))
                return dt.strftime("%Y-%m-%d")
            except (ValueError, TypeError):
                pass
    return None


def search_bluesky(
    topic: str,
    from_date: str,
    to_date: str,
    depth: str = "default",
    config: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Search Bluesky via AT Protocol API.

    Args:
        topic: Search topic
        from_date: Start date (YYYY-MM-DD)
        to_date: End date (YYYY-MM-DD)
        depth: 'quick', 'default', or 'deep'
        config: Config dict with BSKY_HANDLE and BSKY_APP_PASSWORD

    Returns:
        Dict with 'posts' list from AT Protocol response.
    """
    config = config or {}
    handle = config.get("BSKY_HANDLE", "")
    app_password = config.get("BSKY_APP_PASSWORD", "")

    if not handle or not app_password:
        return {"posts": [], "error": "Bluesky credentials not configured"}

    count = DEPTH_CONFIG.get(depth, DEPTH_CONFIG["default"])
    core_topic = _extract_core_subject(topic)

    _log(f"Searching for '{core_topic}' (depth={depth}, limit={count})")

    from urllib.parse import urlencode
    params = {
        "q": core_topic,
        "limit": str(min(count, 100)),
        "sort": "top",
    }
    url = f"{BSKY_SEARCH_URL}?{urlencode(params)}"

    def _auth_and_search() -> tuple[Optional[Dict[str, Any]], Optional[str]]:
        token = _create_session(handle, app_password)
        if not token:
            error_msg = _session_error or "Bluesky session creation failed (unknown error)"
            return None, error_msg
        try:
            response = http.request(
                "GET", url,
                headers={"Authorization": f"Bearer {token}"},
                timeout=30,
            )
            return response, None
        except http.HTTPError as e:
            _log(f"Search failed: {e}")
            if e.status_code == 401:
                _reset_session_cache()
                return None, "refresh"
            if e.status_code == 403 and e.body and "cloudflare" in e.body.lower():
                return None, "Bluesky search blocked by Cloudflare (403). This is a network-level block - try a different network or VPN."
            return None, f"Bluesky search failed: {e}"
        except Exception as e:
            _log(f"Search failed: {e}")
            return None, f"Bluesky search failed: {type(e).__name__}: {e}"

    response, error_msg = _auth_and_search()
    if error_msg == "refresh":
        _log("Session expired; recreating token and retrying once")
        response, error_msg = _auth_and_search()
    if error_msg:
        return {"posts": [], "error": error_msg}
    if response is None:
        return {"posts": [], "error": "Bluesky search failed (unknown error)"}

    posts = response.get("posts", [])
    _log(f"Found {len(posts)} posts")
    return response


def parse_bluesky_response(response: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Parse AT Protocol response into normalized item dicts.

    Returns:
        List of item dicts ready for normalization.
    """
    posts = response.get("posts", [])
    items = []

    for i, post in enumerate(posts):
        record = post.get("record") or {}
        text = record.get("text") or ""

        author = post.get("author") or {}
        handle = author.get("handle") or ""
        display_name = author.get("displayName") or handle

        # Post URI -> URL
        # URI format: at://did:plc:xxx/app.bsky.feed.post/rkey
        uri = post.get("uri") or ""
        rkey = uri.rsplit("/", 1)[-1] if uri else ""
        url = f"https://bsky.app/profile/{handle}/post/{rkey}" if handle and rkey else ""

        likes = post.get("likeCount") or 0
        reposts = post.get("repostCount") or 0
        replies = post.get("replyCount") or 0
        quotes = post.get("quoteCount") or 0

        date_str = _parse_date(post) or _parse_date(record)

        # Relevance: position-based (AT Protocol sorts by relevance with sort=top)
        rank_score = max(0.3, 1.0 - (i * 0.02))
        engagement_boost = min(0.2, math.log1p(likes + reposts) / 40)
        relevance = min(1.0, rank_score * 0.7 + engagement_boost + 0.1)

        items.append({
            "handle": handle,
            "display_name": display_name,
            "text": text,
            "url": url,
            "date": date_str,
            "engagement": {
                "likes": likes,
                "reposts": reposts,
                "replies": replies,
                "quotes": quotes,
            },
            "relevance": round(relevance, 2),
            "why_relevant": f"Bluesky: @{handle}: {text[:60]}" if text else f"Bluesky: {handle}",
        })

    return items
