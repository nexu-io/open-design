"""Threads keyword search via ScrapeCreators API for /last30days.

Uses ScrapeCreators REST API to search Threads by keyword, extracting
engagement metrics (likes, replies) from short text posts.

Requires SCRAPECREATORS_API_KEY in config. Opt-in source via INCLUDE_SOURCES.
API docs: https://scrapecreators.com/docs
"""

import math
import re
from typing import Any, Dict, List, Optional

from . import dates, http, log
from .relevance import token_overlap_relevance as _compute_relevance

SCRAPECREATORS_BASE = "https://api.scrapecreators.com/v1/threads"

# Depth configurations: how many results to fetch
DEPTH_CONFIG = {
    "quick":   {"results": 10},
    "default": {"results": 20},
    "deep":    {"results": 40},
}


def _log(msg: str):
    log.source_log("Threads", msg)


def _extract_core_subject(topic: str) -> str:
    """Extract core subject from verbose query for Threads search."""
    from .query import extract_core_subject
    _THREADS_NOISE = frozenset({
        'best', 'top', 'good', 'great', 'awesome',
        'latest', 'new', 'news', 'update', 'updates',
        'trending', 'hottest', 'popular', 'viral',
        'practices', 'features', 'recommendations', 'advice',
    })
    return extract_core_subject(topic, noise=_THREADS_NOISE)


def _parse_date(item: Dict[str, Any]) -> Optional[str]:
    """Parse date from Threads item to YYYY-MM-DD.

    Tries common timestamp fields in order: taken_at and create_time
    (unix timestamps in Meta APIs), then created_at, published_at, and
    date (ISO 8601 strings). dates.parse_date() handles both.
    """
    for key in ("taken_at", "create_time", "created_at", "published_at", "date"):
        val = item.get(key)
        if val is None:
            continue
        dt = dates.parse_date(str(val))
        if dt:
            return dt.strftime("%Y-%m-%d")
    return None


def _parse_items(raw_items: List[Dict[str, Any]], core_topic: str) -> List[Dict[str, Any]]:
    """Parse raw Threads items into normalized dicts."""
    items = []
    for i, raw in enumerate(raw_items):
        post_id = str(
            raw.get("id")
            or raw.get("pk")
            or raw.get("code")
            or f"TH{i + 1}"
        )
        text = raw.get("text") or raw.get("caption") or raw.get("content") or ""
        if isinstance(text, dict):
            text = text.get("text", "")

        # Author extraction
        user = raw.get("user") or raw.get("author") or {}
        if isinstance(user, dict):
            handle = user.get("username") or user.get("handle") or ""
            display_name = user.get("full_name") or user.get("displayName") or handle
        elif isinstance(user, str):
            handle = user
            display_name = user
        else:
            handle = ""
            display_name = ""

        # Engagement metrics
        likes = raw.get("like_count") or raw.get("likes") or 0
        replies = raw.get("reply_count") or raw.get("replies") or 0
        reposts = raw.get("repost_count") or raw.get("reposts") or 0
        quotes = raw.get("quote_count") or raw.get("quotes") or 0

        date_str = _parse_date(raw)

        # Build URL
        code = raw.get("code") or raw.get("shortcode") or ""
        url = raw.get("url") or raw.get("share_url") or ""
        if not url and code:
            url = f"https://www.threads.net/post/{code}"
        elif not url and handle and post_id:
            url = f"https://www.threads.net/@{handle}/post/{post_id}"

        # Relevance: position-based + engagement boost (similar to bluesky)
        rank_score = max(0.3, 1.0 - (i * 0.02))
        engagement_boost = min(0.2, math.log1p(likes + reposts) / 40)
        text_relevance = _compute_relevance(core_topic, text)
        relevance = min(1.0, text_relevance * 0.5 + rank_score * 0.3 + engagement_boost + 0.1)

        items.append({
            "id": post_id,
            "handle": handle,
            "display_name": display_name,
            "text": text,
            "url": url,
            "date": date_str,
            "engagement": {
                "likes": likes,
                "replies": replies,
                "reposts": reposts,
                "quotes": quotes,
            },
            "relevance": round(relevance, 2),
            "why_relevant": f"Threads: @{handle}: {text[:60]}" if text else f"Threads: {handle}",
        })
    return items


def search_threads(
    topic: str,
    from_date: str,
    to_date: str,
    depth: str = "default",
    token: str = None,
) -> Dict[str, Any]:
    """Search Threads via ScrapeCreators API.

    Args:
        topic: Search topic
        from_date: Start date (YYYY-MM-DD)
        to_date: End date (YYYY-MM-DD)
        depth: 'quick', 'default', or 'deep'
        token: ScrapeCreators API key

    Returns:
        Dict with 'items' list and optional 'error'.
    """
    if not token:
        return {"items": [], "error": "No SCRAPECREATORS_API_KEY configured"}

    config = DEPTH_CONFIG.get(depth, DEPTH_CONFIG["default"])
    core_topic = _extract_core_subject(topic)

    _log(f"Searching for '{core_topic}' (depth={depth}, limit={config['results']})")

    try:
        import requests as _requests
    except ImportError:
        _requests = None

    if not _requests:
        _log("requests library not installed, falling back to urllib")
        try:
            from urllib.parse import urlencode
            params = urlencode({"keyword": core_topic})
            url = f"{SCRAPECREATORS_BASE}/search?{params}"
            headers = http.scrapecreators_headers(token)
            headers["User-Agent"] = http.USER_AGENT
            data = http.get(url, headers=headers, timeout=30, retries=2)
        except Exception as e:
            _log(f"ScrapeCreators error (urllib): {e}")
            return {"items": [], "error": f"{type(e).__name__}: {e}"}
    else:
        try:
            resp = _requests.get(
                f"{SCRAPECREATORS_BASE}/search",
                params={"keyword": core_topic},
                headers=http.scrapecreators_headers(token),
                timeout=30,
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            _log(f"ScrapeCreators error: {e}")
            return {"items": [], "error": f"{type(e).__name__}: {e}"}

    # Extract items from response (try common SC response shapes)
    raw_items = (
        data.get("items")
        or data.get("data")
        or data.get("threads")
        or data.get("posts")
        or data.get("search_results")
        or []
    )

    # Limit to configured count
    raw_items = raw_items[:config["results"]]

    # Parse items
    items = _parse_items(raw_items, core_topic)

    # Date filter
    in_range = [i for i in items if i["date"] and from_date <= i["date"] <= to_date]
    out_of_range = len(items) - len(in_range)
    if in_range:
        items = in_range
        if out_of_range:
            _log(f"Filtered {out_of_range} posts outside date range")
    else:
        _log(f"No posts within date range, keeping all {len(items)}")

    # Sort by engagement (likes) descending
    items.sort(key=lambda x: x["engagement"]["likes"], reverse=True)

    _log(f"Found {len(items)} Threads posts")
    return {"items": items}


def parse_threads_response(response: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Parse Threads search response to normalized format.

    Returns:
        List of item dicts ready for normalization.
    """
    return response.get("items", [])
