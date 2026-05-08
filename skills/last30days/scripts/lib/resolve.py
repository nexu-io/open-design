"""Auto-resolve subreddits, X handles, and current events context for a topic.

Uses web search (Brave/Exa/Serper) to discover relevant communities and context
before the planner runs. This is the engine-side equivalent of SKILL.md Steps
0.55/0.75 which use Claude Code's WebSearch tool.
"""

from __future__ import annotations

import re
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Optional

from . import categories, dates, grounding

MAX_SUBS = 10


def _log(msg: str) -> None:
    print(f"[Resolve] {msg}", file=sys.stderr)


def _merge_category_peers(topic: str, subreddits: list[str]) -> tuple[list[str], Optional[str]]:
    """Extend the WebSearch-extracted subreddit list with category peers.

    Classifies the topic, fetches the category's peer subs, dedupes
    case-insensitively against the existing list, and appends missing
    peers in priority order. Caps the final list at MAX_SUBS, preserving
    every WebSearch-returned sub (they are the freshest signal) and
    trimming from the peer-additions end.

    Returns a tuple of (merged_subs, matched_category_id_or_None).
    Emits a [Resolve] Matched category log line only when peers were
    actually added (not when every peer was already in the WebSearch set).

    Classification failures degrade to "no match" — the unwidened list
    is returned and a warning is logged.
    """
    try:
        category = categories.detect_category(topic)
    except Exception as exc:
        _log(f"Category classification failed: {exc}")
        return list(subreddits)[:MAX_SUBS], None

    if category is None:
        return list(subreddits)[:MAX_SUBS], None

    peers = categories.peer_subs_for(category)
    if not peers:
        return list(subreddits)[:MAX_SUBS], category

    existing_lower = {s.lower() for s in subreddits}
    merged = list(subreddits)
    added: list[str] = []
    for peer in peers:
        if len(merged) >= MAX_SUBS:
            break
        if peer.lower() in existing_lower:
            continue
        merged.append(peer)
        existing_lower.add(peer.lower())
        added.append(peer)

    if added:
        _log(f"Matched category={category}, adding peers: {', '.join(added)}")

    return merged, category


def _has_backend(config: dict) -> bool:
    """Check if any web search backend is available."""
    return bool(
        config.get("BRAVE_API_KEY")
        or config.get("EXA_API_KEY")
        or config.get("SERPER_API_KEY")
        or config.get("PARALLEL_API_KEY")
        or config.get("OPENROUTER_API_KEY")
    )


def _extract_subreddits(items: list[dict]) -> list[str]:
    """Parse subreddit names from search result titles and snippets."""
    pattern = re.compile(r"r/([A-Za-z0-9_]{2,21})")
    seen: set[str] = set()
    results: list[str] = []
    for item in items:
        text = f"{item.get('title', '')} {item.get('snippet', '')} {item.get('url', '')}"
        for match in pattern.findall(text):
            lower = match.lower()
            if lower not in seen:
                seen.add(lower)
                results.append(match)
    return results


def _extract_x_handle(items: list[dict]) -> str:
    """Extract the most likely X/Twitter handle from search results."""
    pattern = re.compile(r"@([A-Za-z0-9_]{1,15})")
    url_pattern = re.compile(r"(?:twitter\.com|x\.com)/([A-Za-z0-9_]{1,15})(?:/|$|\?)")
    counts: dict[str, int] = {}
    for item in items:
        text = f"{item.get('title', '')} {item.get('snippet', '')}"
        url = item.get("url", "")
        for match in pattern.findall(text):
            lower = match.lower()
            counts[lower] = counts.get(lower, 0) + 1
        for match in url_pattern.findall(url):
            lower = match.lower()
            # URL matches are stronger signals
            counts[lower] = counts.get(lower, 0) + 3
    # Filter out generic handles
    skip = {"twitter", "x", "search", "hashtag", "intent", "share", "i", "home", "explore", "settings"}
    counts = {k: v for k, v in counts.items() if k not in skip}
    if not counts:
        return ""
    return max(counts, key=counts.get)


def _extract_github_user(items: list[dict]) -> str:
    """Extract GitHub username from search results."""
    url_pattern = re.compile(r"github\.com/([A-Za-z0-9_-]{1,39})(?:/|$|\?)")
    counts: dict[str, int] = {}
    for item in items:
        url = item.get("url", "")
        text = f"{item.get('title', '')} {item.get('snippet', '')}"
        for match in url_pattern.findall(url):
            lower = match.lower()
            counts[lower] = counts.get(lower, 0) + 3
        for match in url_pattern.findall(text):
            lower = match.lower()
            counts[lower] = counts.get(lower, 0) + 1
    # Filter out org/repo-like names and generic pages
    skip = {"topics", "explore", "settings", "orgs", "search", "features", "about", "pricing", "enterprise"}
    counts = {k: v for k, v in counts.items() if k not in skip}
    if not counts:
        return ""
    return max(counts, key=counts.get)


def _extract_github_repos(items: list[dict]) -> list[str]:
    """Extract owner/repo strings from search results."""
    repo_pattern = re.compile(r"github\.com/([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)")
    skip_owners = {"topics", "explore", "settings", "orgs", "search", "features", "about", "pricing", "enterprise"}
    seen: set[str] = set()
    repos: list[str] = []
    for item in items:
        url = item.get("url", "")
        text = f"{item.get('title', '')} {item.get('snippet', '')}"
        for source in [url, text]:
            for match in repo_pattern.findall(source):
                owner = match.split("/")[0].lower()
                if owner in skip_owners:
                    continue
                lower = match.lower()
                if lower not in seen:
                    seen.add(lower)
                    repos.append(match)
    return repos[:5]  # cap at 5 repos


def _build_context_summary(items: list[dict]) -> str:
    """Build a 1-2 sentence current events summary from news search results."""
    snippets: list[str] = []
    for item in items[:3]:
        snippet = item.get("snippet", "").strip()
        if snippet:
            snippets.append(snippet)
    if not snippets:
        return ""
    # Take the first two meaningful snippets and truncate to keep it concise
    combined = " ".join(snippets[:2])
    if len(combined) > 300:
        combined = combined[:297] + "..."
    return combined


def auto_resolve(topic: str, config: dict) -> dict:
    """Discover subreddits, X handles, and current events context for a topic.

    Args:
        topic: The research topic.
        config: Dict with API keys (BRAVE_API_KEY, EXA_API_KEY, SERPER_API_KEY).

    Returns:
        Dict with keys: subreddits, x_handle, github_user, github_repos,
        context, category, searches_run. Returns empty result if no web
        search backend is available.
    """
    empty = {
        "subreddits": [],
        "x_handle": "",
        "github_user": "",
        "github_repos": [],
        "context": "",
        "category": None,
        "searches_run": 0,
    }

    if not _has_backend(config):
        _log("No web search backend available, skipping resolve")
        return empty

    from_date, to_date = dates.get_date_range(30)
    date_range = (from_date, to_date)
    now = datetime.now(timezone.utc)
    current_month = now.strftime("%B")
    current_year = now.strftime("%Y")

    queries = {
        "subreddit": f"{topic} subreddit reddit",
        "news": f"{topic} news {current_month} {current_year}",
        "x_handle": f"{topic} X twitter handle",
        "github": f"{topic} github profile site:github.com",
    }

    results: dict[str, list[dict]] = {}
    searches_run = 0

    def _search(label: str, query: str) -> tuple[str, list[dict]]:
        items, _artifact = grounding.web_search(query, date_range, config)
        return label, items

    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = {
            executor.submit(_search, label, q): label
            for label, q in queries.items()
        }
        for future in as_completed(futures):
            label = futures[future]
            try:
                _label, items = future.result()
                results[label] = items
                searches_run += 1
            except Exception as exc:
                _log(f"Search failed for {label}: {exc}")
                results[label] = []

    subreddits = _extract_subreddits(results.get("subreddit", []))
    x_handle = _extract_x_handle(results.get("x_handle", []))
    github_user = _extract_github_user(results.get("github", []))
    github_repos = _extract_github_repos(results.get("github", []))
    context = _build_context_summary(results.get("news", []))

    subreddits, category = _merge_category_peers(topic, subreddits)

    _log(f"Resolved {len(subreddits)} subreddits, x_handle={x_handle!r}, github_user={github_user!r}, github_repos={github_repos!r}, context_len={len(context)}, category={category!r}")

    return {
        "subreddits": subreddits,
        "x_handle": x_handle,
        "github_user": github_user,
        "github_repos": github_repos,
        "context": context,
        "category": category,
        "searches_run": searches_run,
    }
