"""Truth Social search via Mastodon-compatible API (requires bearer token).

Uses truthsocial.com/api/v2/search endpoint.
Requires TRUTHSOCIAL_TOKEN env var (bearer token from browser dev tools).
"""

import math
import re
import sys
from typing import Any, Dict, List, Optional

from . import http, log

TRUTHSOCIAL_SEARCH_URL = "https://truthsocial.com/api/v2/search"

DEPTH_CONFIG = {
    "quick": 15,
    "default": 30,
    "deep": 60,
}


def _log(msg: str):
    log.source_log("TruthSocial", msg)


def _strip_html(html: str) -> str:
    """Strip HTML tags from Truth Social post content."""
    text = re.sub(r'<br\s*/?>', '\n', html)
    text = re.sub(r'<[^>]+>', '', text)
    return text.strip()


def _extract_core_subject(topic: str) -> str:
    """Extract core subject from verbose query for Truth Social search."""
    from .query import extract_core_subject
    _TS_NOISE = frozenset({
        'best', 'top', 'good', 'great', 'awesome',
        'latest', 'new', 'news', 'update', 'updates',
        'trending', 'hottest', 'popular', 'viral',
        'practices', 'features', 'recommendations', 'advice',
    })
    return extract_core_subject(topic, noise=_TS_NOISE)


def _parse_date(status: Dict[str, Any]) -> Optional[str]:
    """Parse date from Mastodon status to YYYY-MM-DD.

    Mastodon uses ISO 8601 format in created_at field.
    """
    val = status.get("created_at")
    if val and isinstance(val, str) and len(val) >= 10:
        return val[:10]
    return None


def search_truthsocial(
    topic: str,
    from_date: str,
    to_date: str,
    depth: str = "default",
    config: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Search Truth Social via Mastodon-compatible API.

    Args:
        topic: Search topic
        from_date: Start date (YYYY-MM-DD)
        to_date: End date (YYYY-MM-DD)
        depth: 'quick', 'default', or 'deep'
        config: Config dict with TRUTHSOCIAL_TOKEN

    Returns:
        Dict with 'statuses' list from Mastodon API response.
    """
    config = config or {}
    token = config.get("TRUTHSOCIAL_TOKEN", "")

    if not token:
        return {"statuses": [], "error": "Truth Social token not configured"}

    count = DEPTH_CONFIG.get(depth, DEPTH_CONFIG["default"])
    core_topic = _extract_core_subject(topic)

    _log(f"Searching for '{core_topic}' (depth={depth}, limit={count})")

    from urllib.parse import urlencode
    params = {
        "q": core_topic,
        "type": "statuses",
        "limit": str(min(count, 40)),
    }
    url = f"{TRUTHSOCIAL_SEARCH_URL}?{urlencode(params)}"

    try:
        response = http.request(
            "GET", url,
            headers={"Authorization": f"Bearer {token}"},
            timeout=30,
        )
    except http.HTTPError as e:
        if e.status_code == 401:
            _log("Token expired")
            return {"statuses": [], "error": "Truth Social token expired"}
        elif e.status_code == 403:
            _log("Access denied (Cloudflare)")
            return {"statuses": [], "error": "Truth Social access denied (Cloudflare)"}
        elif e.status_code == 429:
            _log("Rate limited")
            return {"statuses": [], "error": "Truth Social rate limited"}
        else:
            _log(f"Search failed: {e}")
            return {"statuses": [], "error": f"Truth Social search failed: {e.status_code}"}
    except Exception as e:
        _log(f"Search failed: {e}")
        return {"statuses": [], "error": str(e)}

    statuses = response.get("statuses", [])
    _log(f"Found {len(statuses)} posts")
    return response


def parse_truthsocial_response(response: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Parse Mastodon API response into normalized item dicts.

    Returns:
        List of item dicts ready for normalization.
    """
    statuses = response.get("statuses", [])
    items = []

    for i, status in enumerate(statuses):
        content_html = status.get("content") or ""
        text = _strip_html(content_html)

        account = status.get("account") or {}
        handle = account.get("acct") or account.get("username") or ""
        display_name = account.get("display_name") or handle

        url = status.get("url") or ""

        likes = status.get("favourites_count") or 0
        reposts = status.get("reblogs_count") or 0
        replies = status.get("replies_count") or 0

        date_str = _parse_date(status)

        # Relevance: position-based (search results are ranked by relevance)
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
            },
            "relevance": round(relevance, 2),
            "why_relevant": f"Truth Social: @{handle}: {text[:60]}" if text else f"Truth Social: {handle}",
        })

    return items
