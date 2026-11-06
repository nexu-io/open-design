"""X (Twitter) search via xurl CLI — official X API v2 with OAuth2.

xurl is an open-source CLI for the X API (https://github.com/openclaw/xurl).
It uses OAuth2 with PKCE and automatic token refresh, requiring only a free
X Developer App. No xAI subscription or browser cookies needed.

Install: npm install -g xurl
Auth:    xurl auth oauth2 login

Priority: xAI API > Bird/GraphQL > xurl > web-only fallback
"""

import json
import re
import subprocess
import sys
from typing import Any, Dict, List, Optional

from .relevance import token_overlap_relevance as _compute_relevance


def _log(msg: str) -> None:
    sys.stderr.write(f"[xurl] {msg}\n")
    sys.stderr.flush()


# Depth configurations: number of results to request
DEPTH_CONFIG = {
    "quick": 10,
    "default": 30,
    "deep": 60,
}


def is_available() -> bool:
    """Check if xurl is installed and has valid authentication.

    Returns True only if xurl binary is found AND the user is authenticated
    (i.e. ``xurl whoami`` exits 0 and returns a username field).
    """
    try:
        result = subprocess.run(
            ["xurl", "whoami"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        return result.returncode == 0 and '"username"' in result.stdout
    except (OSError, subprocess.TimeoutExpired):
        # OSError covers FileNotFoundError (no xurl on PATH) and
        # PermissionError (a non-executable match on PATH, e.g. WSL's
        # /mnt/c/.../WindowsApps shim returning EACCES on exec).
        return False


def search_x(
    query: str,
    depth: str = "default",
) -> Dict[str, Any]:
    """Search X via xurl CLI using X API v2 search/recent.

    Args:
        query: Search query string
        depth: "quick", "default", or "deep"

    Returns:
        Raw JSON response from X API v2 tweets/search/recent, or a dict
        with an "error" key on failure.
    """
    max_results = DEPTH_CONFIG.get(depth, DEPTH_CONFIG["default"])
    # X API v2 search/recent requires max_results in 10–100 range
    max_results = max(10, min(100, max_results))

    try:
        result = subprocess.run(
            ["xurl", "search", query, "-n", str(max_results)],
            capture_output=True,
            text=True,
            timeout=30,
        )

        if result.returncode != 0:
            error_text = result.stderr.strip() or result.stdout.strip()
            return {"error": f"xurl search failed: {error_text}"}

        return json.loads(result.stdout)

    except FileNotFoundError:
        return {"error": "xurl not found in PATH"}
    except subprocess.TimeoutExpired:
        return {"error": "xurl search timed out (30s)"}
    except json.JSONDecodeError as exc:
        return {"error": f"Invalid JSON from xurl: {exc}"}
    except Exception as exc:
        return {"error": f"{type(exc).__name__}: {exc}"}


def parse_x_response(
    response: Dict[str, Any],
    topic: str = "",
) -> List[Dict[str, Any]]:
    """Parse xurl search response into normalized item dicts.

    Output format matches the existing XItem schema used by xai_x and bird_x:
    id, text, url, author_handle, date, engagement, why_relevant, relevance.

    Args:
        response: Raw X API v2 response dict from search_x()
        topic: Original search topic (used for relevance scoring)

    Returns:
        List of item dicts.  Empty list on error or no results.
    """
    items: List[Dict[str, Any]] = []

    if "error" in response:
        _log(f"Error in response: {response['error']}")
        return items

    data = response.get("data") or []
    if not data:
        return items

    # Build author lookup from includes.users
    authors: Dict[str, Dict[str, Any]] = {}
    for user in (response.get("includes") or {}).get("users") or []:
        authors[user["id"]] = user

    for i, tweet in enumerate(data):
        author_id = tweet.get("author_id", "")
        author = authors.get(author_id, {})
        username = author.get("username", "")

        tweet_id = tweet.get("id", "")
        url = f"https://x.com/{username}/status/{tweet_id}" if username else ""

        # Parse public_metrics
        engagement: Optional[Dict[str, Any]] = None
        metrics = tweet.get("public_metrics") or {}
        if metrics:
            engagement = {
                "likes": metrics.get("like_count", 0),
                "reposts": metrics.get("retweet_count", 0),
                "replies": metrics.get("reply_count", 0),
                "quotes": metrics.get("quote_count", 0),
            }

        # Parse ISO 8601 date → YYYY-MM-DD
        date: Optional[str] = None
        created = tweet.get("created_at", "")
        if created:
            m = re.match(r"(\d{4}-\d{2}-\d{2})", created)
            if m:
                date = m.group(1)

        text = tweet.get("text", "").strip()

        # Relevance score via shared token-overlap function
        relevance = _compute_relevance(topic, text) if topic else 0.5

        items.append({
            "id": f"XURL{i + 1}",
            "text": text[:500],
            "url": url,
            "author_handle": username,
            "date": date,
            "engagement": engagement,
            "why_relevant": "",
            "relevance": relevance,
        })

    return items
