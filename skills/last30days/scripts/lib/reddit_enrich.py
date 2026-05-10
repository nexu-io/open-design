"""Reddit thread enrichment with real engagement metrics.

Supports two backends:
1. ScrapeCreators API (preferred) - no rate limits, 1 credit/call
2. reddit.com/.json (fallback) - free but 429-prone
"""

import re
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from . import http, dates


def extract_reddit_path(url: str) -> Optional[str]:
    """Extract the path from a Reddit URL.

    Args:
        url: Reddit URL

    Returns:
        Path component or None
    """
    parsed = urlparse(url)
    if "reddit.com" not in parsed.netloc:
        return None
    return parsed.path


class RedditRateLimitError(Exception):
    """Raised when Reddit returns HTTP 429 (rate limited)."""
    pass


def fetch_thread_data(
    url: str,
    mock_data: Optional[Dict] = None,
    timeout: int = 30,
    retries: int = 3,
) -> Optional[Dict[str, Any]]:
    """Fetch Reddit thread JSON data.

    Args:
        url: Reddit thread URL
        mock_data: Mock data for testing
        timeout: HTTP timeout per attempt in seconds
        retries: Number of retries on failure

    Returns:
        Thread data dict or None on failure

    Raises:
        RedditRateLimitError: When Reddit returns 429 (caller should bail)
    """
    if mock_data is not None:
        return mock_data

    path = extract_reddit_path(url)
    if not path:
        return None

    try:
        data = http.get_reddit_json(path, timeout=timeout, retries=retries)
        return data
    except http.HTTPError as e:
        if e.status_code == 429:
            raise RedditRateLimitError(f"Reddit rate limited (429) fetching {url}") from e
        return None


def parse_thread_data(data: Any) -> Dict[str, Any]:
    """Parse Reddit thread JSON into structured data.

    Args:
        data: Raw Reddit JSON response

    Returns:
        Dict with submission and comments data
    """
    result = {
        "submission": None,
        "comments": [],
    }

    if not isinstance(data, list) or len(data) < 1:
        return result

    # First element is submission listing
    submission_listing = data[0]
    if isinstance(submission_listing, dict):
        children = submission_listing.get("data", {}).get("children", [])
        if children:
            sub_data = children[0].get("data", {})
            result["submission"] = {
                "score": sub_data.get("score"),
                "num_comments": sub_data.get("num_comments"),
                "upvote_ratio": sub_data.get("upvote_ratio"),
                "created_utc": sub_data.get("created_utc"),
                "permalink": sub_data.get("permalink"),
                "title": sub_data.get("title"),
                "selftext": sub_data.get("selftext", "")[:500],  # Truncate
            }

    # Second element is comments listing
    if len(data) >= 2:
        comments_listing = data[1]
        if isinstance(comments_listing, dict):
            children = comments_listing.get("data", {}).get("children", [])
            for child in children:
                if child.get("kind") != "t1":  # t1 = comment
                    continue
                c_data = child.get("data", {})
                if not c_data.get("body"):
                    continue

                comment = {
                    "score": c_data.get("score", 0),
                    "created_utc": c_data.get("created_utc"),
                    "author": c_data.get("author", "[deleted]"),
                    "body": c_data.get("body", "")[:300],  # Truncate
                    "permalink": c_data.get("permalink"),
                }
                result["comments"].append(comment)

    return result


def get_top_comments(comments: List[Dict], limit: int = 10) -> List[Dict[str, Any]]:
    """Get top comments sorted by score.

    Args:
        comments: List of comment dicts
        limit: Maximum number to return

    Returns:
        Top comments sorted by score
    """
    # Filter out deleted/removed
    valid = [c for c in comments if c.get("author") not in ("[deleted]", "[removed]")]

    # Sort by score descending
    sorted_comments = sorted(valid, key=lambda c: c.get("score", 0), reverse=True)

    return sorted_comments[:limit]


def extract_comment_insights(comments: List[Dict], limit: int = 7) -> List[str]:
    """Extract key insights from top comments.

    Uses simple heuristics to identify valuable comments:
    - Has substantive text
    - Contains actionable information
    - Not just agreement/disagreement

    Args:
        comments: Top comments
        limit: Max insights to extract

    Returns:
        List of insight strings
    """
    insights = []

    for comment in comments[:limit * 2]:  # Look at more comments than we need
        body = comment.get("body", "").strip()
        if not body or len(body) < 30:
            continue

        # Skip low-value patterns
        skip_patterns = [
            r'^(this|same|agreed|exactly|yep|nope|yes|no|thanks|thank you)\.?$',
            r'^lol|lmao|haha',
            r'^\[deleted\]',
            r'^\[removed\]',
        ]
        if any(re.match(p, body.lower()) for p in skip_patterns):
            continue

        # Truncate to first meaningful sentence or ~150 chars
        insight = body[:150]
        if len(body) > 150:
            # Try to find a sentence boundary
            for i, char in enumerate(insight):
                if char in '.!?' and i > 50:
                    insight = insight[:i+1]
                    break
            else:
                insight = insight.rstrip() + "..."

        insights.append(insight)
        if len(insights) >= limit:
            break

    return insights


def enrich_reddit_item(
    item: Dict[str, Any],
    mock_thread_data: Optional[Dict] = None,
    timeout: int = 10,
    retries: int = 1,
) -> Dict[str, Any]:
    """Enrich a Reddit item with real engagement data.

    Args:
        item: Reddit item dict
        mock_thread_data: Mock data for testing
        timeout: HTTP timeout per attempt (default 10s for enrichment)
        retries: Number of retries (default 1 — fail fast for enrichment)

    Returns:
        Enriched item dict

    Raises:
        RedditRateLimitError: Propagated so caller can bail on remaining items
    """
    url = item.get("url", "")

    # Fetch thread data (RedditRateLimitError propagates to caller)
    thread_data = fetch_thread_data(url, mock_thread_data, timeout=timeout, retries=retries)
    if not thread_data:
        return item

    parsed = parse_thread_data(thread_data)
    submission = parsed.get("submission")
    comments = parsed.get("comments", [])

    # Update engagement metrics
    if submission:
        item["engagement"] = {
            "score": submission.get("score"),
            "num_comments": submission.get("num_comments"),
            "upvote_ratio": submission.get("upvote_ratio"),
        }

        # Update date from actual data
        created_utc = submission.get("created_utc")
        if created_utc:
            item["date"] = dates.timestamp_to_date(created_utc)

    # Get top comments
    top_comments = get_top_comments(comments)
    item["top_comments"] = []
    for c in top_comments:
        permalink = c.get("permalink", "")
        comment_url = f"https://reddit.com{permalink}" if permalink else ""
        item["top_comments"].append({
            "score": c.get("score", 0),
            "date": dates.timestamp_to_date(c.get("created_utc")),
            "author": c.get("author", ""),
            "excerpt": c.get("body", "")[:200],
            "url": comment_url,
        })

    # Extract insights
    item["comment_insights"] = extract_comment_insights(top_comments)

    return item


def enrich_reddit_item_sc(
    item: Dict[str, Any],
    token: str,
    timeout: int = 30,
) -> Dict[str, Any]:
    """Enrich a Reddit item using ScrapeCreators comment API.

    No rate limit risk. Uses 1 credit per call.

    Args:
        item: Reddit item dict (already has engagement from search)
        token: ScrapeCreators API key
        timeout: HTTP timeout

    Returns:
        Enriched item with top_comments and comment_insights
    """
    from . import reddit as reddit_mod

    url = item.get("url", "")
    if not url:
        return item

    raw_comments = reddit_mod.fetch_post_comments(url, token)
    if not raw_comments:
        return item

    top_comments = []
    for c in raw_comments[:10]:
        body = c.get("body", "")
        if not body or body in ("[deleted]", "[removed]"):
            continue

        score = c.get("ups") or c.get("score", 0)
        author = c.get("author", "[deleted]")
        permalink = c.get("permalink", "")
        comment_url = f"https://reddit.com{permalink}" if permalink else ""

        top_comments.append({
            "score": score,
            "date": dates.timestamp_to_date(c.get("created_utc")) if c.get("created_utc") else None,
            "author": author,
            "body": body[:300],
            "excerpt": body[:200],
            "url": comment_url,
        })

    top_comments.sort(key=lambda c: c.get("score", 0), reverse=True)

    item["top_comments"] = []
    for c in top_comments:
        item["top_comments"].append({
            "score": c.get("score", 0),
            "date": c.get("date"),
            "author": c.get("author", ""),
            "excerpt": c.get("excerpt", ""),
            "url": c.get("url", ""),
        })

    item["comment_insights"] = extract_comment_insights(top_comments)

    return item
