"""Xiaohongshu HTTP API search client for last30days.

Uses xpzouying/xiaohongshu-mcp REST endpoints:
- GET/POST /api/v1/feeds/search
- GET /api/v1/login/status
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from . import http


def _to_int(value: Any) -> int:
    """Convert Xiaohongshu count strings to int.

    Supports plain ints and Chinese suffixes like 1.2万 / 3亿.
    """
    if value is None:
        return 0
    if isinstance(value, (int, float)):
        return int(value)

    text = str(value).strip().lower().replace(",", "")
    if not text:
        return 0

    try:
        if text.endswith("万"):
            return int(float(text[:-1]) * 10000)
        if text.endswith("亿"):
            return int(float(text[:-1]) * 100000000)
        return int(float(text))
    except (TypeError, ValueError):
        return 0


def _timestamp_to_date_ms(ts: Any) -> Optional[str]:
    """Convert millisecond timestamp to YYYY-MM-DD."""
    try:
        iv = int(ts)
        if iv <= 0:
            return None
        # API examples use milliseconds.
        dt = datetime.fromtimestamp(iv / 1000.0, tz=timezone.utc)
        return dt.strftime("%Y-%m-%d")
    except (TypeError, ValueError, OSError):
        return None


def _relevance_from_interactions(likes: int, comments: int, favorites: int) -> float:
    """Heuristic relevance score from engagement metrics."""
    # Weighted engagement with soft caps to [0, 1].
    weighted = (likes * 1.0) + (comments * 2.5) + (favorites * 1.5)
    # 5000 weighted engagement ~= strong relevance.
    score = min(1.0, max(0.05, weighted / 5000.0))
    return round(score, 3)


def _build_note_url(feed_id: str, xsec_token: str) -> str:
    """Build a stable Xiaohongshu note URL."""
    if xsec_token:
        return f"https://www.xiaohongshu.com/explore/{feed_id}?xsec_token={xsec_token}"
    return f"https://www.xiaohongshu.com/explore/{feed_id}"


def search_feeds(
    topic: str,
    from_date: str,
    to_date: str,
    base_url: str,
    depth: str = "default",
) -> List[Dict[str, Any]]:
    """Search Xiaohongshu feeds and normalize to web-item shape."""
    base = (base_url or "").rstrip("/")
    if not base:
        raise ValueError("Missing Xiaohongshu API base URL")

    # Quick login sanity check.
    login = http.get(f"{base}/api/v1/login/status", timeout=8, retries=1)
    is_logged_in = (
        login.get("data", {}).get("is_logged_in")
        if isinstance(login, dict) else False
    )
    if not is_logged_in:
        raise http.HTTPError("Xiaohongshu API reachable but not logged in")

    # API supports filters; use recency-oriented defaults.
    publish_time = "一天内" if depth == "quick" else "一周内" if depth == "default" else "半年内"
    payload = {
        "keyword": topic,
        "filters": {
            "sort_by": "综合",
            "note_type": "不限",
            "publish_time": publish_time,
            "search_scope": "不限",
            "location": "不限",
        },
    }

    resp = http.post(f"{base}/api/v1/feeds/search", payload, timeout=20, retries=1)
    feeds = resp.get("data", {}).get("feeds", []) if isinstance(resp, dict) else []
    if not isinstance(feeds, list):
        feeds = []

    # Cap source volume similarly to other web sources.
    limit = {"quick": 8, "default": 15, "deep": 25}.get(depth, 15)
    items: List[Dict[str, Any]] = []

    for i, feed in enumerate(feeds[:limit]):
        if not isinstance(feed, dict):
            continue
        note = feed.get("noteCard") or {}
        if not isinstance(note, dict):
            note = {}
        interact = note.get("interactInfo") or {}
        if not isinstance(interact, dict):
            interact = {}

        feed_id = str(feed.get("id") or note.get("noteId") or "").strip()
        if not feed_id:
            continue

        xsec_token = str(feed.get("xsecToken") or note.get("xsecToken") or "").strip()
        title = str(
            note.get("displayTitle")
            or note.get("title")
            or ""
        ).strip()
        snippet = str(
            note.get("desc")
            or note.get("displayDesc")
            or title
            or ""
        ).strip()

        likes = _to_int(interact.get("likedCount"))
        comments = _to_int(interact.get("commentCount"))
        favorites = _to_int(interact.get("collectedCount"))

        date_value = _timestamp_to_date_ms(note.get("time"))
        why = f"Xiaohongshu engagement: likes={likes}, comments={comments}, favorites={favorites}"

        items.append({
            "id": f"XHS{i+1}",
            "title": title[:200] if title else f"Xiaohongshu note {feed_id}",
            "url": _build_note_url(feed_id, xsec_token),
            "source_domain": "xiaohongshu.com",
            "snippet": snippet[:500],
            "date": date_value,
            "date_confidence": "high" if date_value else "low",
            "relevance": _relevance_from_interactions(likes, comments, favorites),
            "why_relevant": why,
            # Keep raw engagement for debugging/possible future rendering.
            "engagement": {
                "likes": likes,
                "comments": comments,
                "favorites": favorites,
            },
        })

    return items
