"""Instagram Reels search via ScrapeCreators API for /last30days.

Uses ScrapeCreators REST API to search Instagram Reels by keyword, extract
engagement metrics (views, likes, comments), and fetch video transcripts.

Requires SCRAPECREATORS_API_KEY in config. 100 free API calls, then PAYG.
API docs: https://scrapecreators.com/docs
"""

import re
import sys
from datetime import datetime
from typing import Any, Dict, List, Optional, Set

try:
    import requests as _requests
except ImportError:
    _requests = None

from . import dates, http, log

SCRAPECREATORS_BASE = "https://api.scrapecreators.com"

# Depth configurations: how many results to fetch / captions to extract
DEPTH_CONFIG = {
    "quick":   {"results_per_page": 10, "max_captions": 3},
    "default": {"results_per_page": 20, "max_captions": 5},
    "deep":    {"results_per_page": 40, "max_captions": 8},
}

# Max words to keep from each caption
CAPTION_MAX_WORDS = 500

from .relevance import token_overlap_relevance as _compute_relevance


def _extract_core_subject(topic: str) -> str:
    """Extract core subject from verbose query for Instagram search."""
    from .query import extract_core_subject
    _INSTAGRAM_NOISE = frozenset({
        'best', 'top', 'good', 'great', 'awesome', 'killer',
        'latest', 'new', 'news', 'update', 'updates',
        'trending', 'hottest', 'popular', 'viral',
        'practices', 'features',
        'recommendations', 'advice',
        'prompt', 'prompts', 'prompting',
        'methods', 'strategies', 'approaches',
    })
    return extract_core_subject(topic, noise=_INSTAGRAM_NOISE)


def _infer_query_intent(topic: str) -> str:
    """Tiny local intent classifier for Instagram query expansion."""
    text = topic.lower().strip()
    if re.search(r"\b(vs|versus|compare|difference between)\b", text):
        return "comparison"
    if re.search(r"\b(how to|tutorial|guide|setup|step by step|deploy|install)\b", text):
        return "how_to"
    if re.search(r"\b(thoughts on|worth it|should i|opinion|review)\b", text):
        return "opinion"
    if re.search(r"\b(pricing|feature|features|best .* for)\b", text):
        return "product"
    return "breaking_news"


def expand_instagram_queries(topic: str, depth: str) -> List[str]:
    """Generate multiple Instagram search queries from a topic.

    Mirrors reddit.py's expand_reddit_queries() pattern:
    1. Extract core subject (strip noise words)
    2. Include original topic if different from core
    3. Add intent-specific OR-joined content-type variants
    4. Cap by depth: 1 for quick, 2 for default, 3 for deep

    Returns 1-3 query strings depending on depth.
    """
    core = _extract_core_subject(topic)
    queries = [core]

    # Include cleaned original topic as variant if different from core
    original_clean = topic.strip().rstrip('?!.')
    if core.lower() != original_clean.lower() and len(original_clean.split()) <= 8:
        queries.append(original_clean)

    qtype = _infer_query_intent(topic)

    # Intent-specific Instagram content-type variants
    if qtype == "breaking_news":
        queries.append(f"{core} reaction OR edit")
    elif qtype == "opinion":
        queries.append(f"{core} reaction OR edit")
    elif qtype == "product":
        queries.append(f"{core} review OR haul")
    elif qtype == "comparison":
        queries.append(f"{core} vs OR compared")
    elif qtype == "how_to":
        queries.append(f"{core} tutorial OR hack")
    else:
        queries.append(f"{core} reaction OR edit")

    # Deep depth: add viral content variant
    if depth == "deep":
        queries.append(f"{core} viral OR trending OR reel")

    # Cap by depth budget
    caps = {"quick": 1, "default": 2, "deep": 3}
    cap = caps.get(depth, 2)
    return queries[:cap]


def _log(msg: str):
    log.source_log("Instagram", msg)


def _parse_date(item: Dict[str, Any]) -> Optional[str]:
    """Parse date from ScrapeCreators Instagram item to YYYY-MM-DD.

    Handles taken_at as ISO string (e.g. "2026-02-26T16:00:00.000Z")
    or unix timestamp.
    """
    ts = item.get("taken_at")
    if not ts:
        return None

    # Try ISO string first (ScrapeCreators reels/search returns this)
    if isinstance(ts, str):
        try:
            # Handle "2026-02-26T16:00:00.000Z" format
            dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            return dt.strftime("%Y-%m-%d")
        except (ValueError, TypeError):
            pass
        # Try just the date portion
        if len(ts) >= 10:
            return ts[:10]

    # Fall back to unix timestamp
    try:
        return dates.timestamp_to_date(int(ts))
    except (ValueError, TypeError):
        pass

    return None


def _extract_hashtags(caption_text: str) -> List[str]:
    """Extract hashtags from Instagram caption text."""
    if not caption_text:
        return []
    return re.findall(r'#(\w+)', caption_text)


def _parse_items(raw_items: List[Dict[str, Any]], core_topic: str) -> List[Dict[str, Any]]:
    """Parse raw Instagram items into normalized dicts."""
    items = []
    for raw in raw_items:
        if not isinstance(raw, dict):
            continue

        # Extract reel ID and shortcode
        reel_pk = str(raw.get("id", raw.get("pk", "")))
        shortcode = raw.get("shortcode", raw.get("code", ""))

        # Caption text -- can be a string or dict depending on endpoint
        caption_obj = raw.get("caption", "")
        if isinstance(caption_obj, dict):
            text = caption_obj.get("text", "")
        elif isinstance(caption_obj, str):
            text = caption_obj
        else:
            text = raw.get("desc", raw.get("text", ""))

        # Engagement metrics
        play_count = raw.get("video_play_count") or raw.get("video_view_count") or raw.get("play_count") or 0
        like_count = raw.get("like_count") or 0
        comment_count = raw.get("comment_count") or 0

        # Author info -- 'owner' in reels/search, 'user' in user/reels
        owner_raw = raw.get("owner") or raw.get("user")
        if isinstance(owner_raw, dict):
            author_name = owner_raw.get("username", "")
        elif isinstance(owner_raw, str):
            author_name = owner_raw
        else:
            author_name = ""

        # Duration
        duration = raw.get("video_duration")

        # Date
        date_str = _parse_date(raw)

        # Hashtags from caption text
        hashtags = _extract_hashtags(text)

        # Compute relevance with hashtag boost
        relevance = _compute_relevance(core_topic, text, hashtags)

        # Build URL -- prefer API-provided url, fallback to shortcode
        url = raw.get("url", "")
        if not url and shortcode:
            url = f"https://www.instagram.com/reel/{shortcode}"

        items.append({
            "video_id": reel_pk,
            "text": text,
            "url": url,
            "author_name": author_name,
            "date": date_str,
            "engagement": {
                "views": play_count,
                "likes": like_count,
                "comments": comment_count,
            },
            "hashtags": hashtags,
            "duration": duration,
            "relevance": relevance,
            "why_relevant": f"Instagram: {text[:60]}" if text else f"Instagram: {core_topic}",
            "caption_snippet": "",  # populated by fetch_captions
        })
    return items


def _user_reels(
    handle: str,
    token: str,
) -> List[Dict[str, Any]]:
    """Fetch an Instagram user's recent reels via ScrapeCreators.

    Args:
        handle: Instagram username (without @)
        token: ScrapeCreators API key

    Returns:
        List of raw Instagram reel dicts.
    """
    _log(f"User reels: @{handle}")
    reels_url = f"{SCRAPECREATORS_BASE}/v1/instagram/user/reels"
    if not _requests:
        try:
            from urllib.parse import urlencode
            params = urlencode({"handle": handle})
            url = f"{reels_url}?{params}"
            headers = http.scrapecreators_headers(token)
            headers["User-Agent"] = http.USER_AGENT
            data = http.get(url, headers=headers, timeout=30, retries=2)
        except Exception as e:
            _log(f"User reels error (urllib) for @{handle}: {e}")
            return []
    else:
        try:
            resp = _requests.get(
                reels_url,
                params={"handle": handle},
                headers=http.scrapecreators_headers(token),
                timeout=30,
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            _log(f"User reels error for @{handle}: {e}")
            return []

    raw_items = data.get("items") or data.get("reels") or data.get("data") or []
    _log(f"  -> {len(raw_items)} reels from @{handle}")
    return raw_items


def search_instagram(
    topic: str,
    from_date: str,
    to_date: str,
    depth: str = "default",
    token: str = None,
) -> Dict[str, Any]:
    """Search Instagram Reels via ScrapeCreators API.

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

    _log(f"Searching Instagram for '{core_topic}' (depth={depth}, count={config['results_per_page']})")

    if not _requests:
        _log("requests library not installed, falling back to urllib")
        try:
            from urllib.parse import urlencode
            params = urlencode({"query": core_topic})
            url = f"{SCRAPECREATORS_BASE}/v2/instagram/reels/search?{params}"
            headers = http.scrapecreators_headers(token)
            headers["User-Agent"] = http.USER_AGENT
            data = http.get(url, headers=headers, timeout=30, retries=2)
        except Exception as e:
            _log(f"ScrapeCreators error (urllib): {e}")
            return {"items": [], "error": f"{type(e).__name__}: {e}"}
    else:
        try:
            resp = _requests.get(
                f"{SCRAPECREATORS_BASE}/v2/instagram/reels/search",
                params={"query": core_topic},
                headers=http.scrapecreators_headers(token),
                timeout=30,
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            _log(f"ScrapeCreators error: {e}")
            return {"items": [], "error": f"{type(e).__name__}: {e}"}

    # Items are in the 'reels' array (ScrapeCreators v2 response)
    raw_items = data.get("reels") or data.get("items") or data.get("data") or []

    # Limit to configured count
    raw_items = raw_items[:config["results_per_page"]]

    # Parse items
    items = _parse_items(raw_items, core_topic)

    # Hard date filter
    in_range = [i for i in items if i["date"] and from_date <= i["date"] <= to_date]
    out_of_range = len(items) - len(in_range)
    if in_range:
        items = in_range
        if out_of_range:
            _log(f"Filtered {out_of_range} reels outside date range")
    else:
        _log(f"No reels within date range, keeping all {len(items)}")

    # Sort by views descending
    items.sort(key=lambda x: x["engagement"]["views"], reverse=True)

    _log(f"Found {len(items)} Instagram reels")
    return {"items": items}


def fetch_captions(
    video_items: List[Dict[str, Any]],
    token: str,
    depth: str = "default",
) -> Dict[str, str]:
    """Fetch transcripts for top N Instagram reels via ScrapeCreators.

    Strategy:
    1. Use the 'text' field (caption) as baseline
    2. For top N, call /v2/instagram/media/transcript for spoken-word captions

    Args:
        video_items: Items from search_instagram()
        token: ScrapeCreators API key
        depth: Depth level for caption limit

    Returns:
        Dict mapping video_id -> caption text (truncated to 500 words)
    """
    config = DEPTH_CONFIG.get(depth, DEPTH_CONFIG["default"])
    max_captions = config["max_captions"]

    if not video_items or not token or not _requests:
        return {}

    top_items = video_items[:max_captions]
    _log(f"Enriching captions for {len(top_items)} reels")

    captions = {}

    # First pass: use text field as caption (always available, free)
    for item in top_items:
        vid = item["video_id"]
        text = item.get("text", "")
        if text:
            words = text.split()
            if len(words) > CAPTION_MAX_WORDS:
                text = ' '.join(words[:CAPTION_MAX_WORDS]) + '...'
            captions[vid] = text

    # Second pass: try to get spoken-word transcripts (1 credit each)
    for item in top_items:
        vid = item["video_id"]
        url = item.get("url", "")
        if not url:
            continue
        try:
            resp = _requests.get(
                f"{SCRAPECREATORS_BASE}/v2/instagram/media/transcript",
                params={"url": url},
                headers=http.scrapecreators_headers(token),
                timeout=15,
            )
            if resp.status_code == 200:
                data = resp.json()
                transcripts = data.get("transcripts") or []
                if transcripts and isinstance(transcripts, list):
                    # Combine all transcript segments
                    transcript_text = " ".join(
                        t.get("text", "") for t in transcripts
                        if isinstance(t, dict) and t.get("text")
                    )
                    if transcript_text:
                        words = transcript_text.split()
                        if len(words) > CAPTION_MAX_WORDS:
                            transcript_text = ' '.join(words[:CAPTION_MAX_WORDS]) + '...'
                        captions[vid] = transcript_text
        except Exception as e:
            _log(f"Transcript fetch failed for {vid}: {e}")

    got = sum(1 for v in captions.values() if v)
    _log(f"Got captions for {got}/{len(top_items)} reels")
    return captions


def search_and_enrich(
    topic: str,
    from_date: str,
    to_date: str,
    depth: str = "default",
    token: str = None,
    ig_creators: List[str] | None = None,
) -> Dict[str, Any]:
    """Full Instagram search: find reels, then fetch captions for top results.

    Uses expand_instagram_queries() to generate multiple search queries,
    runs ScrapeCreators for each, and merges/deduplicates results by video ID.

    Args:
        topic: Search topic (raw topic, not planner's narrowed query)
        from_date: Start date (YYYY-MM-DD)
        to_date: End date (YYYY-MM-DD)
        depth: 'quick', 'default', or 'deep'
        token: ScrapeCreators API key
        ig_creators: Optional list of Instagram creator handles to fetch reels from

    Returns:
        Dict with 'items' list. Each item has a 'caption_snippet' field.
    """
    core_topic = _extract_core_subject(topic)
    seen_ids: Set[str] = set()
    items: List[Dict[str, Any]] = []
    last_error = None

    # Step 0: Creator reels (high-signal, runs first)
    if ig_creators and token:
        for creator in ig_creators:
            raw_items = _user_reels(creator, token)
            parsed = _parse_items(raw_items, core_topic)
            for item in parsed:
                vid = item.get("video_id", "")
                if vid and vid not in seen_ids:
                    seen_ids.add(vid)
                    items.append(item)

    # Step 1: Multi-query keyword search — run ScrapeCreators for each expanded query
    queries = expand_instagram_queries(topic, depth)
    for q in queries:
        search_result = search_instagram(q, from_date, to_date, depth, token)
        if search_result.get("error"):
            last_error = search_result["error"]
        for item in search_result.get("items", []):
            vid = item.get("video_id", "")
            if vid and vid not in seen_ids:
                seen_ids.add(vid)
                items.append(item)

    # Sort merged results by views descending
    items.sort(key=lambda x: x.get("engagement", {}).get("views", 0), reverse=True)

    if not items:
        return {"items": [], "error": last_error}

    # Step 2: Fetch captions for top N
    captions = fetch_captions(items, token, depth)

    # Step 3: Attach captions to items
    for item in items:
        vid = item["video_id"]
        caption = captions.get(vid)
        if caption:
            item["caption_snippet"] = caption

    return {"items": items, "error": last_error}


def parse_instagram_response(response: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Parse Instagram search response to normalized format.

    Returns:
        List of item dicts ready for normalization.
    """
    return response.get("items", [])
