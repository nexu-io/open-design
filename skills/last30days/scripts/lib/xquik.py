"""Xquik X search source for the v3.0.0 last30days pipeline.

Uses the Xquik REST API (https://xquik.com/api/v1) to search X/Twitter
with full engagement metrics (likes, retweets, replies, quotes, views,
bookmarks). Requires an API key from xquik.com.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List

from . import http, log
from .relevance import token_overlap_relevance as _compute_relevance

# Depth configurations: number of results to request per query
DEPTH_CONFIG = {
    "quick": {"limit": 10, "queries": 1},
    "default": {"limit": 20, "queries": 2},
    "deep": {"limit": 40, "queries": 3},
}

_BASE_URL = "https://xquik.com/api/v1"


def _log(msg: str):
    log.source_log("Xquik", msg, tty_only=False)


def _extract_core_subject(topic: str) -> str:
    """Extract core subject for X search queries."""
    from .query import extract_core_subject
    return extract_core_subject(topic, max_words=5, strip_suffixes=True)


def expand_xquik_queries(topic: str, depth: str) -> List[str]:
    """Generate query variants based on depth.

    Args:
        topic: Research topic
        depth: "quick", "default", or "deep"

    Returns:
        List of query strings (1 for quick, 2 for default, 3 for deep).
    """
    core = _extract_core_subject(topic)
    queries = [core]

    # Add original topic if meaningfully different
    if topic.lower().strip() != core.lower().strip():
        queries.append(topic.strip())

    # Add compound term variant for deep searches
    if len(queries) < 3:
        from .query import extract_compound_terms
        compounds = extract_compound_terms(topic)
        if compounds:
            or_parts = " OR ".join(f'"{t}"' for t in compounds[:3])
            queries.append(f"({or_parts})")

    cap = DEPTH_CONFIG.get(depth, DEPTH_CONFIG["default"])["queries"]
    return queries[:cap]


def search_xquik(
    topic: str,
    from_date: str,
    to_date: str,
    depth: str = "default",
    token: str = "",
) -> Dict[str, Any]:
    """Search X via Xquik REST API.

    Args:
        topic: Search topic
        from_date: Start date (YYYY-MM-DD)
        to_date: End date (YYYY-MM-DD)
        depth: Research depth - "quick", "default", or "deep"
        token: Xquik API key

    Returns:
        Dict with "items" list and optional "error" string.
    """
    if not token:
        return {"items": [], "error": "No XQUIK_API_KEY configured"}

    cfg = DEPTH_CONFIG.get(depth, DEPTH_CONFIG["default"])
    queries = expand_xquik_queries(topic, depth)
    all_items: List[Dict[str, Any]] = []
    seen_ids: set[str] = set()

    for query_text in queries:
        try:
            url = f"{_BASE_URL}/x/tweets/search"
            # Build query with date filter
            q = f"{query_text} since:{from_date} until:{to_date}"
            params = f"q={_url_encode(q)}&queryType=Top&limit={cfg['limit']}"
            full_url = f"{url}?{params}"

            _log(f"Searching: {query_text}")
            response = http.get(
                full_url,
                headers={"X-Api-Key": token},
                timeout=30,
                retries=2,
            )

            tweets = response.get("tweets", [])
            if not isinstance(tweets, list):
                continue

            for i, tweet in enumerate(tweets):
                if not isinstance(tweet, dict):
                    continue
                tweet_id = str(tweet.get("id", ""))
                if tweet_id in seen_ids:
                    continue
                seen_ids.add(tweet_id)

                item = _parse_tweet(tweet, i + len(all_items), query_text)
                if item:
                    all_items.append(item)

        except http.HTTPError as exc:
            status = getattr(exc, "status_code", None)
            if status in (401, 403):
                return {"items": [], "error": f"Xquik auth failed ({status})"}
            _log(f"HTTP error for query '{query_text}': {exc}")
        except Exception as exc:
            _log(f"Error for query '{query_text}': {exc}")

    return {"items": all_items}


def search_and_enrich(
    topic: str,
    from_date: str,
    to_date: str,
    depth: str = "default",
    token: str = "",
) -> Dict[str, Any]:
    """Search X via Xquik and return results.

    Xquik API returns full engagement data by default, so no separate
    enrichment step is needed.
    """
    return search_xquik(topic, from_date, to_date, depth=depth, token=token)


def parse_xquik_response(response: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Extract items from search response.

    Args:
        response: Response dict from search_xquik()

    Returns:
        List of normalized item dicts.
    """
    return response.get("items", [])


def _parse_tweet(
    tweet: Dict[str, Any], index: int, query: str
) -> Dict[str, Any] | None:
    """Parse a single tweet from the API response into the standard item format."""
    author = tweet.get("author") or {}
    username = str(author.get("username", "")).lstrip("@")
    tweet_id = str(tweet.get("id", ""))

    # Build URL
    url = ""
    if username and tweet_id:
        url = f"https://x.com/{username}/status/{tweet_id}"
    if not url:
        return None

    # Parse date
    date = None
    created_at = tweet.get("createdAt") or ""
    if created_at:
        try:
            if len(created_at) > 10 and created_at[10] == "T":
                dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
            else:
                dt = datetime.strptime(created_at, "%a %b %d %H:%M:%S %z %Y")
            date = dt.strftime("%Y-%m-%d")
        except (ValueError, TypeError):
            pass

    text = str(tweet.get("text", "")).strip()[:500]

    # Build engagement dict with full metrics
    engagement = {
        "likes": _safe_int(tweet.get("likeCount")),
        "reposts": _safe_int(tweet.get("retweetCount")),
        "replies": _safe_int(tweet.get("replyCount")),
        "quotes": _safe_int(tweet.get("quoteCount")),
        "views": _safe_int(tweet.get("viewCount")),
        "bookmarks": _safe_int(tweet.get("bookmarkCount")),
    }

    return {
        "id": f"XQ{index + 1}",
        "text": text,
        "url": url,
        "author_handle": username,
        "date": date,
        "engagement": engagement,
        "relevance": _compute_relevance(query, text) if query else 0.7,
        "why_relevant": "",
    }


def _safe_int(value: Any) -> int | None:
    """Convert value to int, returning None on failure."""
    if value is None:
        return None
    try:
        return int(value)
    except (ValueError, TypeError):
        return None


def _url_encode(text: str) -> str:
    """URL-encode a string using stdlib."""
    from urllib.parse import quote
    return quote(text, safe="")
