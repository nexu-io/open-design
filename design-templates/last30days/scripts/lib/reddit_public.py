"""Standalone Reddit public JSON search module.

Searches Reddit using the free public JSON endpoints (no API key required).
Promoted from last-resort fallback to robust primary free path.

Endpoints:
- Global: https://www.reddit.com/search.json?q={query}&sort=relevance&t=month&limit={limit}
- Subreddit: https://www.reddit.com/r/{sub}/search.json?q={query}&restrict_sr=on&sort=relevance&t=month

Handles 429 rate limits with exponential backoff, HTML anti-bot responses,
network timeouts, and missing subreddits.
"""

import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from typing import Any, Dict, List, Optional


USER_AGENT = "last30days/3.0 (research tool)"

# Depth-aware limits for thread counts
DEPTH_LIMITS = {
    "quick": 10,
    "default": 25,
    "deep": 50,
}

# How many top posts to enrich with comments, by depth
ENRICH_LIMITS = {
    "quick": 3,
    "default": 5,
    "deep": 8,
}

MAX_RETRIES = 3
BASE_BACKOFF = 2.0  # seconds


def _log(msg: str):
    """Log to stderr."""
    sys.stderr.write(f"[RedditPublic] {msg}\n")
    sys.stderr.flush()


def _url_encode(text: str) -> str:
    """URL-encode a query string."""
    return urllib.parse.quote_plus(text)


def _fetch_json(url: str, timeout: int = 15) -> Optional[Dict[str, Any]]:
    """Fetch JSON from a URL with retry on 429 and error handling.

    Returns parsed JSON dict, or None on unrecoverable failure.
    """
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
    }
    req = urllib.request.Request(url, headers=headers)

    for attempt in range(MAX_RETRIES):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                content_type = resp.headers.get("Content-Type", "")
                if "json" not in content_type and "text/html" in content_type:
                    _log(f"Anti-bot HTML response (Content-Type: {content_type})")
                    return None

                body = resp.read().decode("utf-8")
                return json.loads(body)

        except urllib.error.HTTPError as e:
            if e.code == 429:
                delay = BASE_BACKOFF * (2 ** attempt)
                retry_after = None
                if hasattr(e, "headers"):
                    retry_after = e.headers.get("Retry-After")
                if retry_after:
                    try:
                        delay = float(retry_after)
                    except ValueError:
                        pass
                _log(f"429 rate limited, retry {attempt + 1}/{MAX_RETRIES} after {delay:.1f}s")
                if attempt < MAX_RETRIES - 1:
                    time.sleep(delay)
                    continue
                # Last attempt exhausted
                _log("429 retries exhausted")
                return None
            elif e.code == 404:
                _log(f"404 not found: {url}")
                return None
            elif e.code == 403:
                _log(f"403 forbidden: {url}")
                return None
            else:
                _log(f"HTTP {e.code}: {e.reason}")
                return None

        except (urllib.error.URLError, OSError, TimeoutError) as e:
            _log(f"Network error: {e}")
            return None

        except json.JSONDecodeError as e:
            _log(f"JSON decode error: {e}")
            return None

    return None


def _parse_posts(data: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Parse Reddit listing JSON into normalized post dicts."""
    if not data:
        return []

    children = data.get("data", {}).get("children", [])
    posts = []

    for child in children:
        if child.get("kind") != "t3":
            continue
        post = child.get("data", {})
        permalink = str(post.get("permalink", "")).strip()
        if not permalink or "/comments/" not in permalink:
            continue

        score = int(post.get("score", 0) or 0)
        num_comments = int(post.get("num_comments", 0) or 0)
        selftext = str(post.get("selftext", ""))
        author = str(post.get("author", "[deleted]"))
        created_utc = post.get("created_utc")

        # Parse date
        date_str = None
        if created_utc:
            try:
                from datetime import datetime, timezone
                dt = datetime.fromtimestamp(float(created_utc), tz=timezone.utc)
                date_str = dt.strftime("%Y-%m-%d")
            except (ValueError, TypeError, OSError):
                pass

        posts.append({
            "id": "",  # Will be assigned after dedup
            "title": str(post.get("title", "")).strip(),
            "url": f"https://www.reddit.com{permalink}",
            "score": score,
            "num_comments": num_comments,
            "subreddit": str(post.get("subreddit", "")).strip(),
            "created_utc": float(created_utc) if created_utc else None,
            "author": author if author not in ("[deleted]", "[removed]") else "[deleted]",
            "selftext": selftext[:500] if selftext else "",
            # Normalized fields matching ScrapeCreators output
            "date": date_str,
            "engagement": {
                "score": score,
                "num_comments": num_comments,
                "upvote_ratio": post.get("upvote_ratio"),
            },
            "relevance": _compute_relevance(score, num_comments),
            "why_relevant": "Reddit public search",
            "metadata": {},
        })

    return posts


def _compute_relevance(score: int, num_comments: int) -> float:
    """Estimate relevance from engagement signals."""
    score_component = min(1.0, max(0.0, score / 500.0))
    comments_component = min(1.0, max(0.0, num_comments / 200.0))
    return round((score_component * 0.6) + (comments_component * 0.4), 3)


def search(
    query: str,
    depth: str = "default",
    subreddit: Optional[str] = None,
    timeout: int = 15,
) -> List[Dict[str, Any]]:
    """Search Reddit via the public JSON endpoint.

    Args:
        query: Search query string
        depth: 'quick', 'default', or 'deep' — controls result limit
        subreddit: Optional subreddit name (without r/) for scoped search
        timeout: HTTP timeout in seconds

    Returns:
        List of normalized post dicts. Empty list on any failure.
    """
    limit = DEPTH_LIMITS.get(depth, DEPTH_LIMITS["default"])
    encoded_query = _url_encode(query)

    if subreddit:
        sub = subreddit.lstrip("r/").strip()
        url = (
            f"https://www.reddit.com/r/{sub}/search.json"
            f"?q={encoded_query}&restrict_sr=on&sort=relevance&t=month&limit={limit}&raw_json=1"
        )
    else:
        url = (
            f"https://www.reddit.com/search.json"
            f"?q={encoded_query}&sort=relevance&t=month&limit={limit}&raw_json=1"
        )

    data = _fetch_json(url, timeout=timeout)
    posts = _parse_posts(data)

    # Dedupe by URL and assign IDs
    seen_urls = set()
    unique = []
    for post in posts:
        if post["url"] not in seen_urls:
            seen_urls.add(post["url"])
            unique.append(post)

    for i, post in enumerate(unique):
        post["id"] = f"R{i + 1}"

    return unique[:limit]


def _enrich_post(item: Dict[str, Any], timeout: int = 10) -> Dict[str, Any]:
    """Enrich a single post with top comments. Never raises."""
    try:
        from . import reddit_enrich
        thread_data = reddit_enrich.fetch_thread_data(item["url"], timeout=timeout)
        if not thread_data:
            return item
        parsed = reddit_enrich.parse_thread_data(thread_data)
        comments = parsed.get("comments", [])
        top = reddit_enrich.get_top_comments(comments)
        item["top_comments"] = [
            {
                "score": c.get("score", 0),
                "excerpt": (c.get("body") or "")[:200],
                "author": c.get("author", ""),
            }
            for c in top[:10]
        ]
    except Exception:
        # Never discard — keep post with empty metadata
        pass
    return item


def _enrich_posts(posts: List[Dict[str, Any]], depth: str = "default") -> List[Dict[str, Any]]:
    """Enrich top N posts with comment data using threads. Total budget 45s."""
    limit = ENRICH_LIMITS.get(depth, ENRICH_LIMITS["default"])
    to_enrich = posts[:limit]
    rest = posts[limit:]

    if not to_enrich:
        return posts

    enriched = []
    try:
        with ThreadPoolExecutor(max_workers=min(limit, 4)) as executor:
            futures = {
                executor.submit(_enrich_post, post, 10): i
                for i, post in enumerate(to_enrich)
            }
            # Collect results with 45s total budget
            import concurrent.futures
            done, not_done = concurrent.futures.wait(futures, timeout=45)
            # Build result list preserving order
            result_map: Dict[int, Dict[str, Any]] = {}
            for future in done:
                idx = futures[future]
                try:
                    result_map[idx] = future.result(timeout=0)
                except Exception:
                    result_map[idx] = to_enrich[idx]
            # Any not-done futures: keep original post
            for future in not_done:
                idx = futures[future]
                result_map[idx] = to_enrich[idx]
                future.cancel()
            enriched = [result_map[i] for i in range(len(to_enrich))]
    except Exception:
        enriched = to_enrich

    return enriched + rest


def _search_subreddit(sub: str, topic: str, depth: str, timeout: int = 15) -> List[Dict[str, Any]]:
    """Search a single subreddit. Never raises."""
    try:
        return search(topic, depth=depth, subreddit=sub, timeout=timeout)
    except Exception as e:
        _log(f"Subreddit search failed for r/{sub}: {e}")
        return []


def search_reddit_public(
    topic: str,
    from_date: str,
    to_date: str,
    depth: str = "default",
    subreddits: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """High-level Reddit public search matching the openai_reddit interface.

    When subreddits are provided (from agent planning), searches each targeted
    sub first, then does global search, and deduplicates across both. This
    mirrors the SC search_and_enrich() flow where pre-resolved subreddits get
    priority.

    Args:
        topic: Search topic
        from_date: Start date (YYYY-MM-DD)
        to_date: End date (YYYY-MM-DD)
        depth: 'quick', 'default', or 'deep'
        subreddits: Optional list of subreddit names (without r/) for targeted search

    Returns:
        List of normalized item dicts matching ScrapeCreators output format.
    """
    all_posts: List[Dict[str, Any]] = []

    # Phase 1: Search targeted subreddits in parallel (if provided)
    if subreddits:
        _log(f"Searching {len(subreddits)} targeted subreddits: {subreddits}")
        workers = min(4, len(subreddits))
        with ThreadPoolExecutor(max_workers=workers) as executor:
            futures = {
                executor.submit(_search_subreddit, sub, topic, depth): sub
                for sub in subreddits
            }
            for future in futures:
                sub = futures[future]
                try:
                    sub_posts = future.result(timeout=30)
                    _log(f"  -> {len(sub_posts)} results from r/{sub}")
                    all_posts.extend(sub_posts)
                except (Exception, FuturesTimeoutError) as e:
                    _log(f"  -> r/{sub} failed: {e}")

    # Phase 2: Global search
    global_posts = search(topic, depth=depth)
    all_posts.extend(global_posts)

    # Deduplicate by URL (targeted results keep priority since they come first)
    seen_urls: set = set()
    results: List[Dict[str, Any]] = []
    for post in all_posts:
        if post["url"] not in seen_urls:
            seen_urls.add(post["url"])
            results.append(post)

    # Date filter: keep posts in range or with unknown dates
    filtered = []
    for item in results:
        d = item.get("date")
        if d is None or (from_date <= d <= to_date):
            filtered.append(item)

    # Sort by engagement (score desc)
    filtered.sort(
        key=lambda x: x.get("engagement", {}).get("score", 0),
        reverse=True,
    )

    # Enrich top posts with comments
    filtered = _enrich_posts(filtered, depth=depth)

    # Re-index IDs
    for i, item in enumerate(filtered):
        item["id"] = f"R{i + 1}"

    return filtered
