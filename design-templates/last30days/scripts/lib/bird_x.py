"""Bird X search client for the v3.0.0 last30days pipeline.

Uses a vendored subset of @steipete/bird v0.8.0 (MIT License) to search X
via Twitter's GraphQL API. No external `bird` CLI binary needed - just Node.js.
See scripts/lib/vendor/bird-search/package.json for authoritative version.
"""

import json
import os
import shutil
import sys
from pathlib import Path

from . import http, log, subproc
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from .relevance import token_overlap_relevance as _compute_relevance


def _first_of(*values):
    """Return first value that is not None."""
    for v in values:
        if v is not None:
            return v
    return None

# Path to the vendored bird-search wrapper
_BIRD_SEARCH_MJS = Path(__file__).parent / "vendor" / "bird-search" / "bird-search.mjs"

# Depth configurations: number of results to request
DEPTH_CONFIG = {
    "quick": 12,
    "default": 30,
    "deep": 60,
}

# Module-level credentials injected from .env config
_credentials: Dict[str, str] = {}


def set_credentials(auth_token: Optional[str], ct0: Optional[str]):
    """Inject AUTH_TOKEN/CT0 from .env config so Node subprocesses can use them."""
    if auth_token:
        _credentials['AUTH_TOKEN'] = auth_token
    if ct0:
        _credentials['CT0'] = ct0


def _has_injected_credentials() -> bool:
    """Return True when both X session cookies were injected from config."""
    return bool(_credentials.get('AUTH_TOKEN') and _credentials.get('CT0'))


def _has_process_credentials() -> bool:
    """Return True when AUTH_TOKEN/CT0 are present in process env."""
    return bool(os.environ.get("AUTH_TOKEN") and os.environ.get("CT0"))


def _subprocess_env() -> Dict[str, str]:
    """Build env dict for Node subprocesses, merging injected credentials."""
    env = os.environ.copy()
    env.update(_credentials)
    # Hard-disable browser-cookie fallback so normal pipeline runs never hit
    # Safari/Chrome Keychain prompts during source detection or search.
    env["BIRD_DISABLE_BROWSER_COOKIES"] = "1"
    return env


def _log(msg: str):
    log.source_log("Bird", msg, tty_only=False)


def _extract_core_subject(topic: str) -> str:
    """Extract core subject from verbose query for X search.

    X search is literal keyword AND matching — all words must appear.
    Aggressively strip question/meta/research words to keep only the
    core product/concept name (max 5 words).
    """
    from .query import extract_core_subject
    return extract_core_subject(topic, max_words=5, strip_suffixes=True)


def is_bird_installed() -> bool:
    """Check if vendored Bird search module is available.

    Returns:
        True if bird-search.mjs exists and Node.js is in PATH.
    """
    if not _BIRD_SEARCH_MJS.exists():
        return False
    return shutil.which("node") is not None


def is_bird_authenticated() -> Optional[str]:
    """Check if explicit X credentials are available.

    Returns:
        Auth source string if authenticated, None otherwise.
    """
    if not is_bird_installed():
        return None

    if _has_injected_credentials():
        return "env AUTH_TOKEN"
    if _has_process_credentials():
        return "env AUTH_TOKEN"
    return None


def check_npm_available() -> bool:
    """Check if npm is available (kept for API compatibility).

    Returns:
        True if 'npm' command is available in PATH, False otherwise.
    """
    return shutil.which("npm") is not None


def install_bird() -> Tuple[bool, str]:
    """No-op. Bird search is vendored in v3.0.0, no installation needed.

    Returns:
        Tuple of (success, message).
    """
    if is_bird_installed():
        return True, "Bird search is bundled with /last30days v3.0.0 - no installation needed."
    if not shutil.which("node"):
        return False, "Node.js 22+ is required for X search. Install Node.js first."
    return False, f"Vendored bird-search.mjs not found at {_BIRD_SEARCH_MJS}"


def get_bird_status() -> Dict[str, Any]:
    """Get comprehensive Bird search status.

    Returns:
        Dict with keys: installed, authenticated, username, can_install
    """
    installed = is_bird_installed()
    auth_source = is_bird_authenticated() if installed else None

    return {
        "installed": installed,
        "authenticated": auth_source is not None,
        "username": auth_source,  # Now returns auth source (e.g., "Safari", "env AUTH_TOKEN")
        "can_install": True,  # Always vendored in v3.0.0
    }


def _run_bird_search(query: str, count: int, timeout: int) -> Dict[str, Any]:
    """Run a search using the vendored bird-search.mjs module.

    Args:
        query: Full search query string (including since: filter)
        count: Number of results to request
        timeout: Timeout in seconds

    Returns:
        Raw Bird JSON response or error dict.
    """
    cmd = [
        "node", str(_BIRD_SEARCH_MJS),
        query,
        "--count", str(count),
        "--json",
    ]

    pid_holder: list[int] = []

    def _register(pid: int) -> None:
        pid_holder.append(pid)
        try:
            from last30days import register_child_pid
            register_child_pid(pid)
        except ImportError:
            pass

    try:
        result = subproc.run_with_timeout(
            cmd,
            timeout=timeout,
            env=_subprocess_env(),
            on_pid=_register,
        )
    except subproc.SubprocTimeout:
        return {"error": f"Search timed out after {timeout}s", "items": []}
    except Exception as e:
        return {"error": str(e), "items": []}
    finally:
        if pid_holder:
            try:
                from last30days import unregister_child_pid
                unregister_child_pid(pid_holder[0])
            except Exception:
                pass

    if result.returncode != 0:
        error = result.stderr.strip() or "Bird search failed"
        return {"error": error, "items": []}

    output = result.stdout.strip()
    if not output:
        return {"items": []}

    try:
        parsed = json.loads(output)
    except json.JSONDecodeError as e:
        return {"error": f"Invalid JSON response: {e}", "items": []}

    if isinstance(parsed, list):
        return {"items": parsed}
    return parsed


def search_x(
    topic: str,
    from_date: str,
    to_date: str,
    depth: str = "default",
) -> Dict[str, Any]:
    """Search X using Bird CLI with automatic retry on 0 results.

    Args:
        topic: Search topic
        from_date: Start date (YYYY-MM-DD)
        to_date: End date (YYYY-MM-DD) - unused but kept for API compatibility
        depth: Research depth - "quick", "default", or "deep"

    Returns:
        Raw Bird JSON response or error dict.
    """
    count = DEPTH_CONFIG.get(depth, DEPTH_CONFIG["default"])
    timeout = 30 if depth == "quick" else 45 if depth == "default" else 60

    # Extract core subject - X search is literal, not semantic
    core_topic = _extract_core_subject(topic)
    query = f"{core_topic} since:{from_date}"

    _log(f"Searching: {query}")
    response = _run_bird_search(query, count, timeout)

    # Check if we got results
    items = parse_bird_response(response, query=core_topic)

    # Retry with OR groups for multi-word queries (X supports OR operator)
    core_words = core_topic.split()
    if not items and len(core_words) >= 2:
        from .query import extract_compound_terms
        compounds = extract_compound_terms(topic)
        if compounds:
            # Build OR-group query: ("multi-agent" OR "agent simulation") since:DATE
            or_parts = ' OR '.join(f'"{t}"' for t in compounds[:3])
            _log(f"0 results for '{core_topic}', retrying with OR groups: {or_parts}")
            query = f"({or_parts}) since:{from_date}"
            response = _run_bird_search(query, count, timeout)
            items = parse_bird_response(response, query=core_topic)

    # Retry with fewer keywords if still 0 results and query has 3+ words
    if not items and len(core_words) > 2:
        shorter = ' '.join(core_words[:2])
        _log(f"0 results for '{core_topic}', retrying with '{shorter}'")
        query = f"{shorter} since:{from_date}"
        response = _run_bird_search(query, count, timeout)
        items = parse_bird_response(response, query=core_topic)

    # Last-chance retry: use strongest remaining token (often the product name)
    if not items and core_words:
        low_signal = {
            'trendiest', 'trending', 'hottest', 'hot', 'popular', 'viral',
            'best', 'top', 'latest', 'new', 'plugin', 'plugins',
            'skill', 'skills', 'tool', 'tools',
        }
        candidates = [w for w in core_words if w not in low_signal]
        if candidates:
            strongest = max(candidates, key=len)
            _log(f"0 results for '{core_topic}', retrying with strongest token '{strongest}'")
            query = f"{strongest} since:{from_date}"
            response = _run_bird_search(query, count, timeout)

    return response


def search_handles(
    handles: List[str],
    topic: Optional[str],
    from_date: str,
    count_per: int = 5,
) -> List[Dict[str, Any]]:
    """Search specific X handles for topic-related content.

    Runs targeted Bird searches using `from:handle topic` syntax.
    Used in Phase 2 supplemental search after entity extraction.

    Args:
        handles: List of X handles to search (without @)
        topic: Search topic (core subject), or None for unfiltered search
        from_date: Start date (YYYY-MM-DD)
        count_per: Results to request per handle

    Returns:
        List of raw item dicts (same format as parse_bird_response output).
    """
    core_topic = _extract_core_subject(topic) if topic else None

    def _search_one_handle(handle: str) -> List[Dict[str, Any]]:
        handle = handle.lstrip("@")
        if core_topic:
            query = f"from:{handle} {core_topic} since:{from_date}"
        else:
            query = f"from:{handle} since:{from_date}"

        cmd = [
            "node", str(_BIRD_SEARCH_MJS),
            query,
            "--count", str(count_per),
            "--json",
        ]

        try:
            result = subproc.run_with_timeout(cmd, timeout=15, env=_subprocess_env())
        except subproc.SubprocTimeout:
            _log(f"Handle search timed out for @{handle}")
            return []
        except OSError as e:
            _log(f"Handle search error for @{handle}: {e}")
            return []

        if result.returncode != 0:
            _log(f"Handle search failed for @{handle}: {result.stderr.strip()}")
            return []

        output = result.stdout.strip()
        if not output:
            return []

        try:
            response = json.loads(output)
        except json.JSONDecodeError:
            _log(f"Invalid JSON from handle search for @{handle}")
            return []
        return parse_bird_response(response, query=core_topic)

    from concurrent.futures import ThreadPoolExecutor, as_completed

    all_items: List[Dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=min(5, len(handles))) as executor:
        futures = {executor.submit(_search_one_handle, h): h for h in handles}
        for future in as_completed(futures):
            all_items.extend(future.result())

    return all_items


def parse_bird_response(response: Dict[str, Any], query: str = "") -> List[Dict[str, Any]]:
    """Parse Bird response to match xai_x output format.

    Args:
        response: Raw Bird JSON response
        query: Original search query for relevance scoring

    Returns:
        List of normalized item dicts matching xai_x.parse_x_response() format.
    """
    items = []

    # Check for errors
    if "error" in response and response["error"]:
        _log(f"Bird error: {response['error']}")
        return items

    # Bird returns a list of tweets directly or under a key
    raw_items = response if isinstance(response, list) else response.get("items", response.get("tweets", []))

    if not isinstance(raw_items, list):
        return items

    for i, tweet in enumerate(raw_items):
        if not isinstance(tweet, dict):
            continue

        # Extract URL - Bird uses permanent_url or we construct from id
        url = tweet.get("permanent_url") or tweet.get("url", "")
        if not url and tweet.get("id"):
            # Try different field structures Bird might use
            author = tweet.get("author", {}) or tweet.get("user", {})
            screen_name = author.get("username") or author.get("screen_name", "")
            if screen_name:
                url = f"https://x.com/{screen_name}/status/{tweet['id']}"

        if not url:
            continue

        # Parse date from created_at/createdAt (e.g., "Wed Jan 15 14:30:00 +0000 2026")
        date = None
        created_at = tweet.get("createdAt") or tweet.get("created_at", "")
        if created_at:
            try:
                # Try ISO format first (e.g., "2026-02-03T22:33:32Z")
                # Check for ISO date separator, not just "T" (which appears in "Tue")
                if len(created_at) > 10 and created_at[10] == "T":
                    dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                else:
                    # Twitter format: "Wed Jan 15 14:30:00 +0000 2026"
                    dt = datetime.strptime(created_at, "%a %b %d %H:%M:%S %z %Y")
                date = dt.strftime("%Y-%m-%d")
            except (ValueError, TypeError):
                pass

        # Extract user info (Bird uses author.username, older format uses user.screen_name)
        author = tweet.get("author", {}) or tweet.get("user", {})
        author_handle = author.get("username") or author.get("screen_name", "") or tweet.get("author_handle", "")

        # Build engagement dict (Bird uses camelCase: likeCount, retweetCount, etc.)
        engagement = {
            "likes": _first_of(tweet.get("likeCount"), tweet.get("like_count"), tweet.get("favorite_count")),
            "reposts": _first_of(tweet.get("retweetCount"), tweet.get("retweet_count")),
            "replies": _first_of(tweet.get("replyCount"), tweet.get("reply_count")),
            "quotes": _first_of(tweet.get("quoteCount"), tweet.get("quote_count")),
        }
        # Convert to int where possible
        for key in engagement:
            if engagement[key] is not None:
                try:
                    engagement[key] = int(engagement[key])
                except (ValueError, TypeError):
                    engagement[key] = None

        # Build normalized item
        item = {
            "id": f"X{i+1}",
            "text": str(tweet.get("text", tweet.get("full_text", ""))).strip()[:500],
            "url": url,
            "author_handle": author_handle.lstrip("@"),
            "date": date,
            "engagement": engagement if any(v is not None for v in engagement.values()) else None,
            "why_relevant": "",  # Bird doesn't provide relevance explanations
            "relevance": _compute_relevance(query, str(tweet.get("text", ""))) if query else 0.7,
        }

        items.append(item)

    return items
