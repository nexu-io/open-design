"""Reddit search via ScrapeCreators API for the v3 pipeline.

Uses ScrapeCreators REST API to search Reddit globally, discover relevant
subreddits, run targeted subreddit searches, and fetch comment trees.

Requires SCRAPECREATORS_API_KEY in config (same key as TikTok + Instagram).
API docs: https://scrapecreators.com/docs
"""

import re
import sys
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed, wait as futures_wait
from typing import Any, Dict, List, Optional, Set

def _first_of(*values, default=None):
    """Return first value that is not None."""
    for v in values:
        if v is not None:
            return v
    return default

from . import dates, http, log

SCRAPECREATORS_BASE = "https://api.scrapecreators.com/v1/reddit"

# Depth configurations: how many API calls per phase
DEPTH_CONFIG = {
    "quick": {
        "global_searches": 1,
        "subreddit_searches": 2,
        "comment_enrichments": 3,
        "timeframe": "week",
    },
    "default": {
        "global_searches": 2,
        "subreddit_searches": 3,
        "comment_enrichments": 5,
        "timeframe": "month",
    },
    "deep": {
        "global_searches": 3,
        "subreddit_searches": 5,
        "comment_enrichments": 8,
        "timeframe": "month",
    },
}

from .query import extract_core_subject as _query_extract
from .relevance import token_overlap_relevance

# Reddit-specific noise words (preserves original smaller set)
NOISE_WORDS = frozenset({
    'best', 'top', 'good', 'great', 'awesome', 'killer',
    'latest', 'new', 'news', 'update', 'updates',
    'trending', 'hottest', 'popular',
    'practices', 'features', 'tips',
    'recommendations', 'advice',
    'prompt', 'prompts', 'prompting',
    'methods', 'strategies', 'approaches',
    'how', 'to', 'the', 'a', 'an', 'for', 'with',
    'of', 'in', 'on', 'is', 'are', 'what', 'which',
    'guide', 'tutorial', 'using',
})


def _log(msg: str):
    log.source_log("Reddit", msg, tty_only=False)


def _extract_core_subject(topic: str) -> str:
    """Extract core subject from verbose query.

    Strips meta/research words to keep only the core product/concept name.
    """
    return _query_extract(topic, noise=NOISE_WORDS)


def expand_reddit_queries(topic: str, depth: str) -> List[str]:
    """Generate multiple Reddit search queries from a topic.

    Uses local logic (no LLM call needed):
    1. Extract core subject (strip noise words)
    2. Include original topic if different from core
    3. For default/deep: add casual/review variant
    4. For deep: add problem/issues variant

    Returns 1-4 query strings depending on depth.
    """
    core = _extract_core_subject(topic)
    queries = [core]

    # Broader variant: include more context from original topic
    original_clean = topic.strip().rstrip('?!.')
    if core.lower() != original_clean.lower() and len(original_clean.split()) <= 8:
        queries.append(original_clean)

    qtype = _infer_query_intent(topic)

    # Product queries: always include review-oriented variant to bias toward
    # review communities instead of keyword-matching unrelated subreddits.
    if qtype == "product":
        queries.append(f"{core} review OR recommendation OR best")

    # Comparison queries: include head-to-head discussion variant.
    if qtype == "comparison":
        queries.append(f"{core} worth it OR vs OR compared")

    # Opinion/review variants for default/deep depth.
    if depth in ("default", "deep") and qtype in ("product", "opinion"):
        queries.append(f"{core} worth it OR thoughts OR review")

    # Problem/bug variants are useful for tool workflows, not generic news.
    if depth == "deep" and qtype in ("product", "opinion", "how_to"):
        queries.append(f"{core} issues OR problems OR bug OR broken")

    return queries


def _infer_query_intent(topic: str) -> str:
    """Tiny local fallback for Reddit query expansion only."""
    text = topic.lower().strip()
    if re.search(r"\b(vs|versus|compare|difference between)\b", text):
        return "comparison"
    if re.search(r"\b(how to|tutorial|guide|setup|step by step|deploy|install|configuration|configure|troubleshoot|troubleshooting|error|errors|fix|debug)\b", text):
        return "how_to"
    if re.search(r"\b(thoughts on|worth it|should i|opinion|review)\b", text):
        return "opinion"
    if re.search(r"\b(pricing|feature|features|best .* for)\b", text):
        return "product"
    if re.search(r"\b(predict|prediction|odds|forecast|chance)\b", text):
        return "prediction"
    return "breaking_news"


# Known utility/meta subreddits that match queries but aren't discussion subs.
# These get a 0.3x penalty (not banned) in subreddit discovery scoring.
UTILITY_SUBS = frozenset({
    'namethatsong', 'findthatsong', 'tipofmytongue',
    'whatisthissong', 'helpmefind', 'whatisthisthing',
    'whatsthissong', 'findareddit', 'subredditdrama',
})


def discover_subreddits(
    results: List[Dict[str, Any]],
    topic: str = "",
    max_subs: int = 5,
) -> List[str]:
    """Extract top subreddits from global search results with relevance weighting.

    Uses frequency + topic-word matching + utility-sub penalties + engagement
    bonus to find discussion subs rather than utility/meta subs.

    Args:
        results: List of post dicts from global search
        topic: Original search topic (for relevance matching)
        max_subs: Maximum subreddits to return

    Returns:
        Top subreddit names sorted by weighted score
    """
    core = _extract_core_subject(topic) if topic else ""
    core_words = set(core.lower().split()) if core else set()

    scores = Counter()
    for post in results:
        sub = _extract_subreddit_name(post.get("subreddit", ""))
        if not sub:
            continue

        # Base: frequency count
        base = 1.0

        # Bonus: subreddit name contains a core topic word
        sub_lower = sub.lower()
        if core_words and any(w in sub_lower for w in core_words if len(w) > 2):
            base += 2.0

        # Penalty: known utility/meta subreddits
        if sub_lower in UTILITY_SUBS:
            base *= 0.3

        # Bonus: post engagement (high-engagement posts = better sub)
        ups = _first_of(post.get("ups"), post.get("score"), post.get("votes"), default=0)
        if ups and ups > 100:
            base += 0.5

        scores[sub] += base

    return [sub for sub, _ in scores.most_common(max_subs)]


def _parse_date(value) -> Optional[str]:
    """Convert Unix timestamp or ISO-8601 string to YYYY-MM-DD.

    Global search returns ``created_at`` as an ISO string
    (e.g. "2018-05-03T01:09:17.620000+0000"); subreddit search returns
    ``created_utc`` as a Unix timestamp. dates.parse_date() handles both,
    plus edge cases like Z suffix and +0000 (no colon) offset.

    Falsy inputs (None, "", 0) return None, matching the original behavior
    where a Unix timestamp of 0 meant "no date" rather than epoch 0.
    """
    if not value:
        return None
    dt = dates.parse_date(str(value))
    return dt.strftime("%Y-%m-%d") if dt else None


def _extract_subreddit_name(value: Any) -> str:
    """Extract subreddit name from string or API object dict."""
    if isinstance(value, dict):
        return str(value.get("name") or value.get("display_name") or "").strip()
    return str(value).strip()


def _extract_score(post: Dict[str, Any]) -> int:
    """Extract post score from either API schema.

    Global search uses ``votes``; subreddit search uses ``ups``/``score``.
    """
    return _first_of(post.get("ups"), post.get("score"), post.get("votes"), default=0)


def _extract_date(post: Dict[str, Any]) -> Optional[str]:
    """Extract date from either API schema.

    Global search uses ``created_at`` (ISO); subreddit search uses ``created_utc`` (Unix).
    """
    return _parse_date(
        post.get("created_utc") or post.get("created_at") or post.get("created_at_iso")
    )


def _normalize_reddit_id(raw_id: str) -> str:
    """Strip Reddit fullname prefix (t3_) for consistent dedup."""
    s = str(raw_id or "")
    return s[3:] if s.startswith("t3_") else s


def _total_engagement(item: Dict[str, Any]) -> int:
    """Combined engagement score: upvotes + comment count.

    Used for selecting which threads to enrich with comments.
    Threads with lots of comments are high-value even if upvote score is low.
    """
    eng = item.get("engagement", {})
    score = eng.get("score", 0) or 0
    num_comments = eng.get("num_comments", 0) or 0
    return score + num_comments


def _normalize_post(post: Dict[str, Any], idx: int, source_label: str = "global", query: str = "") -> Dict[str, Any]:
    """Normalize a ScrapeCreators Reddit post to our internal format.

    Handles both the global-search schema (``votes``, ``created_at``,
    ``subreddit`` as dict) and the subreddit-search schema (``ups``/``score``,
    ``created_utc``, ``subreddit`` as string).
    """
    permalink = post.get("permalink", "")
    url = f"https://www.reddit.com{permalink}" if permalink else post.get("url", "")

    # Ensure URL looks like a Reddit thread
    if url and "reddit.com" not in url:
        url = ""

    title = str(post.get("title", "")).strip()
    selftext = str(post.get("selftext", ""))

    # Score the title first, then let the body provide limited support.
    # This keeps long selftexts from overpowering the visible topic signal.
    relevance = _compute_post_relevance(query, title, selftext) if query else 0.7

    return {
        "id": f"R{idx}",
        "reddit_id": _normalize_reddit_id(post.get("id", "")),
        "title": title,
        "url": url,
        "subreddit": _extract_subreddit_name(post.get("subreddit", "")),
        "date": _extract_date(post),
        "engagement": {
            "score": _extract_score(post),
            "num_comments": post.get("num_comments", 0),
            "upvote_ratio": post.get("upvote_ratio"),
        },
        "relevance": relevance,
        "why_relevant": f"Reddit {source_label} search",
        "selftext": str(post.get("selftext", ""))[:500],
    }


def _compute_post_relevance(query: str, title: str, selftext: str) -> float:
    """Compute Reddit relevance with title-first weighting.

    Title should carry most of the weight because it is the visible summary the
    user sees. Selftext can lift a marginal match, but it should not rescue a
    weak or ambiguous title into the top ranks.
    """
    title_score = token_overlap_relevance(query, title)
    if not selftext.strip():
        return title_score

    body_score = token_overlap_relevance(query, selftext)
    support_score = max(title_score, body_score)
    return round(0.75 * title_score + 0.25 * support_score, 2)


def _global_search(
    query: str,
    token: str,
    sort: str = "relevance",
    timeframe: str = "month",
) -> List[Dict[str, Any]]:
    """Search across all of Reddit via ScrapeCreators global search.

    Args:
        query: Search query
        token: ScrapeCreators API key
        sort: Sort order (relevance, hot, top, new)
        timeframe: Time filter (hour, day, week, month, year, all)

    Returns:
        List of post dicts
    """
    try:
        data = http.get(
            f"{SCRAPECREATORS_BASE}/search",
            headers=http.scrapecreators_headers(token),
            params={"query": query, "sort": sort, "timeframe": timeframe},
            timeout=30,
            retries=2,
        )
        return data.get("posts", data.get("data", []))
    except http.HTTPError as e:
        if e.status_code in (401, 403):
            raise
        _log(f"Global search error: {e}")
        return []
    except Exception as e:
        _log(f"Global search error: {e}")
        return []


def _subreddit_search(
    subreddit: str,
    query: str,
    token: str,
    sort: str = "relevance",
    timeframe: str = "month",
) -> List[Dict[str, Any]]:
    """Search within a specific subreddit via ScrapeCreators.

    Args:
        subreddit: Subreddit name (without r/)
        query: Search query
        token: ScrapeCreators API key
        sort: Sort order
        timeframe: Time filter

    Returns:
        List of post dicts
    """
    try:
        data = http.get(
            f"{SCRAPECREATORS_BASE}/subreddit/search",
            headers=http.scrapecreators_headers(token),
            params={
                "subreddit": subreddit,
                "query": query,
                "sort": sort,
                "timeframe": timeframe,
            },
            timeout=30,
            retries=2,
        )
        return data.get("posts", data.get("data", []))
    except Exception as e:
        _log(f"Subreddit search error for r/{subreddit}: {e}")
        return []


def fetch_post_comments(
    url: str,
    token: str,
) -> List[Dict[str, Any]]:
    """Fetch comments for a Reddit post via ScrapeCreators.

    Args:
        url: Reddit post URL or permalink
        token: ScrapeCreators API key

    Returns:
        List of comment dicts with score, author, body, etc.
    """
    try:
        data = http.get(
            f"{SCRAPECREATORS_BASE}/post/comments",
            headers=http.scrapecreators_headers(token),
            params={"url": url},
            timeout=30,
            retries=2,
        )
        return data.get("comments", data.get("data", []))
    except Exception as e:
        _log(f"Comment fetch error: {e}")
        return []


def _dedupe_posts(posts: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Deduplicate posts by reddit_id, keeping first occurrence."""
    seen_ids = set()
    seen_urls = set()
    unique = []
    for post in posts:
        rid = post.get("reddit_id", "")
        url = post.get("url", "")
        if rid and rid in seen_ids:
            continue
        if url and url in seen_urls:
            continue
        if rid:
            seen_ids.add(rid)
        if url:
            seen_urls.add(url)
        unique.append(post)
    return unique


def search_reddit(
    topic: str,
    from_date: str,
    to_date: str,
    depth: str = "default",
    token: str = None,
    subreddits: List[str] | None = None,
) -> Dict[str, Any]:
    """Full Reddit search: multi-query global discovery + subreddit drill-down.

    This is the main v3 Reddit entry point.

    Args:
        topic: Search topic
        from_date: Start date (YYYY-MM-DD)
        to_date: End date (YYYY-MM-DD)
        depth: 'quick', 'default', or 'deep'
        token: ScrapeCreators API key
        subreddits: Optional list of subreddit names to search first (pre-resolved)

    Returns:
        Dict with 'items' list and optional 'error'.
    """
    if not token:
        return {"items": [], "error": "No SCRAPECREATORS_API_KEY configured"}

    config = DEPTH_CONFIG.get(depth, DEPTH_CONFIG["default"])
    timeframe = config["timeframe"]
    intent = _infer_query_intent(topic)

    # === Phase 1: Query Expansion ===
    queries = expand_reddit_queries(topic, depth)
    _log(f"Expanded '{topic}' into {len(queries)} queries: {queries}")

    core = _extract_core_subject(topic)

    # === Phase 1.5: Pre-resolved subreddit search (high-signal) ===
    all_raw_posts = []
    all_items: List[Dict[str, Any]] = []
    if subreddits:
        _log(f"Searching pre-resolved subreddits: {subreddits}")
        with ThreadPoolExecutor(max_workers=min(5, len(subreddits))) as executor:
            futures = {}
            for sub in subreddits:
                futures[executor.submit(_subreddit_search, sub, core, token, "relevance", timeframe)] = sub
            for future in as_completed(futures):
                sub = futures[future]
                sub_posts = future.result()
                _log(f"  -> {len(sub_posts)} results from pre-resolved r/{sub}")
                for j, post in enumerate(sub_posts):
                    item = _normalize_post(post, len(all_items) + j + 1, f"r/{sub}", query=core)
                    all_items.append(item)

    # === Phase 2: Global Discovery ===
    max_global = config["global_searches"]

    with ThreadPoolExecutor(max_workers=max_global or 1) as executor:
        futures = {}
        for i, query in enumerate(queries[:max_global]):
            # Product/comparison queries: sort=top surfaces high-engagement posts
            # from relevant communities instead of keyword-matched noise.
            sort = "top" if intent in ("product", "comparison") else ("relevance" if i == 0 else "top")
            _log(f"Global search {i+1}/{max_global}: '{query}' (sort={sort})")
            futures[executor.submit(_global_search, query, token, sort, timeframe)] = query
        for future in as_completed(futures):
            query = futures[future]
            posts = future.result()
            _log(f"  -> {len(posts)} results for '{query}'")
            all_raw_posts.extend(posts)

    # Normalize all posts (with query for relevance scoring)
    for i, post in enumerate(all_raw_posts):
        item = _normalize_post(post, i + 1, "global", query=core)
        all_items.append(item)

    # === Phase 3: Subreddit Discovery + Targeted Search ===
    subreddit_budget = 0 if intent == "how_to" else config["subreddit_searches"]
    discovered_subs = discover_subreddits(all_raw_posts, topic=topic, max_subs=subreddit_budget)
    _log(f"Discovered subreddits: {discovered_subs}")

    subreddit_limit = subreddit_budget
    if subreddit_limit > 0:
        with ThreadPoolExecutor(max_workers=subreddit_limit) as executor:
            futures = {}
            for sub in discovered_subs[:subreddit_limit]:
                _log(f"Subreddit search: r/{sub} for '{core}'")
                futures[executor.submit(_subreddit_search, sub, core, token, "relevance", timeframe)] = sub
            for future in as_completed(futures):
                sub = futures[future]
                sub_posts = future.result()
                _log(f"  -> {len(sub_posts)} results from r/{sub}")
                for j, post in enumerate(sub_posts):
                    item = _normalize_post(post, len(all_items) + j + 1, f"r/{sub}", query=core)
                    all_items.append(item)

    # === Phase 4: Deduplicate ===
    all_items = _dedupe_posts(all_items)
    _log(f"After dedup: {len(all_items)} unique posts")

    # === Phase 5: Date filter ===
    in_range = []
    out_of_range = 0
    for item in all_items:
        if item["date"] and from_date <= item["date"] <= to_date:
            in_range.append(item)
        elif item["date"] is None:
            in_range.append(item)  # Keep unknown dates
        else:
            out_of_range += 1

    if in_range:
        all_items = in_range
        if out_of_range:
            _log(f"Filtered {out_of_range} posts outside date range")
    else:
        _log(f"No posts within date range, keeping all {len(all_items)}")

    # === Phase 6: Sort by engagement (upvotes + comment count) ===
    all_items.sort(
        key=lambda x: _total_engagement(x),
        reverse=True,
    )

    # Re-index IDs
    for i, item in enumerate(all_items):
        item["id"] = f"R{i+1}"

    _log(f"Final: {len(all_items)} Reddit posts")
    return {"items": all_items}


def enrich_with_comments(
    items: List[Dict[str, Any]],
    token: str,
    depth: str = "default",
    budget_seconds: int = 60,
) -> List[Dict[str, Any]]:
    """Enrich top items with comment data from ScrapeCreators.

    Args:
        items: Reddit items from search_reddit()
        token: ScrapeCreators API key
        depth: Depth for comment limit
        budget_seconds: Maximum total time for enrichment. If exceeded,
            returns items with whatever enrichment completed. Never discards items.

    Returns:
        Items with top_comments and comment_insights added.
    """
    config = DEPTH_CONFIG.get(depth, DEPTH_CONFIG["default"])
    max_comments = config["comment_enrichments"]

    if not items or not token or max_comments <= 0:
        return items

    # Select the top threads by total engagement (upvotes + comment count),
    # not by list position. This ensures high-comment threads like [FRESH ALBUM]
    # always get enriched even if their upvote score is low.
    ranked = sorted(items, key=_total_engagement, reverse=True)
    top_items = ranked[:max_comments]
    _log(f"Enriching comments for {len(top_items)} posts (by total engagement)")

    start = time.monotonic()

    with ThreadPoolExecutor(max_workers=min(4, len(top_items))) as executor:
        futures = {
            executor.submit(fetch_post_comments, item.get("url", ""), token): item
            for item in top_items
            if item.get("url")
        }

        # Wait with budget instead of unbounded as_completed
        remaining = max(0, budget_seconds - (time.monotonic() - start))
        done, not_done = futures_wait(futures, timeout=remaining)

        enriched_count = 0
        for future in done:
            item = futures[future]
            try:
                raw_comments = future.result(timeout=0)
            except Exception:
                continue
            if not raw_comments:
                continue

            top_comments = []
            insights = []

            for ci, c in enumerate(raw_comments[:10]):
                body = c.get("body", "")
                if not body or body in ("[deleted]", "[removed]"):
                    continue

                score = c.get("ups") or c.get("score", 0)
                author = c.get("author", "[deleted]")
                permalink = c.get("permalink", "")
                comment_url = f"https://reddit.com{permalink}" if permalink else ""

                max_excerpt = 400 if ci == 0 else 300
                top_comments.append({
                    "score": score,
                    "date": _parse_date(c.get("created_utc")),
                    "author": author,
                    "excerpt": body[:max_excerpt],
                    "url": comment_url,
                })

                if len(body) >= 30 and author not in ("[deleted]", "[removed]", "AutoModerator"):
                    insight = body[:150]
                    if len(body) > 150:
                        for i, char in enumerate(insight):
                            if char in '.!?' and i > 50:
                                insight = insight[:i+1]
                                break
                        else:
                            insight = insight.rstrip() + "..."
                    insights.append(insight)

            top_comments.sort(key=lambda c: c.get("score", 0), reverse=True)
            item["top_comments"] = top_comments[:10]
            item["comment_insights"] = insights[:10]
            enriched_count += 1

        if not_done:
            _log(f"Enrichment budget hit ({budget_seconds}s): {enriched_count}/{len(futures)} posts enriched, {len(not_done)} skipped")
            for future in not_done:
                future.cancel()
        else:
            elapsed = time.monotonic() - start
            _log(f"Enriched {enriched_count}/{len(futures)} posts in {elapsed:.1f}s")

    return items


def search_and_enrich(
    topic: str,
    from_date: str,
    to_date: str,
    depth: str = "default",
    token: str = None,
    subreddits: List[str] | None = None,
) -> Dict[str, Any]:
    """Full Reddit pipeline: search + comment enrichment.

    This is the convenience function that does everything.

    Args:
        topic: Search topic
        from_date: Start date (YYYY-MM-DD)
        to_date: End date (YYYY-MM-DD)
        depth: 'quick', 'default', or 'deep'
        token: ScrapeCreators API key
        subreddits: Optional list of subreddit names to search first (pre-resolved)

    Returns:
        Dict with 'items' list. Items include top_comments and comment_insights.
    """
    result = search_reddit(topic, from_date, to_date, depth, token, subreddits=subreddits)
    items = result.get("items", [])

    if items and token:
        items = enrich_with_comments(items, token, depth)
        result["items"] = items

    return result


def parse_reddit_response(response: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Parse ScrapeCreators response to item list.

    Parse raw Reddit search output into the generic item shape.
    """
    return response.get("items", [])
