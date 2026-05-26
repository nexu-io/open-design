"""Discover peer entities ("competitors") for a topic via web search.

Mirrors the `resolve.auto_resolve()` pattern: fan out 2-3 web searches via
`grounding.web_search()`, then extract capitalized entity candidates from
titles and snippets with deterministic text mining. No LLM call — the
hosting reasoning model can always override discovery via
`--competitors-list`.

Returned list is ordered by score (frequency across queries) and capped to
the caller's requested count.
"""

from __future__ import annotations

import re
import sys
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed

from . import dates, grounding
from .resolve import _has_backend

# A "brand-shaped" token starts with uppercase OR is camelCase with an
# uppercase letter later. Catches "Anthropic", "OpenAI", "xAI", "iPhone",
# "eBay", "Hugging", "Face".
_BRAND_TOKEN = (
    r"(?:[A-Z][A-Za-z0-9&.\-]*"
    r"|[a-z][A-Za-z0-9&.\-]*[A-Z][A-Za-z0-9&.\-]*)"
)

# A capitalized phrase of 1-4 brand tokens separated by whitespace.
_CAPITALIZED_PHRASE = re.compile(
    rf"\b{_BRAND_TOKEN}(?:\s+{_BRAND_TOKEN}){{0,3}}\b"
)

# Title-case fillers common in listicle SERPs. Kept flat — extraction
# rejects a candidate whose entire tokens are stopwords, not candidates
# that merely contain one.
_STOPWORD_TOKENS: frozenset[str] = frozenset(
    token.lower()
    for token in (
        # Listicle fillers
        "Top", "Best", "Worst", "Popular", "Leading", "Similar",
        "Alternatives", "Alternative", "Competitor", "Competitors",
        "vs", "Vs", "Versus", "Review", "Reviews", "Comparison",
        "Guide", "List", "Lists", "Full", "Complete", "Free", "Paid",
        "Tools", "Tool", "Options", "Rivals", "Rival", "Similar",
        "Pick", "Picks", "Ranking", "Ranked", "Recommended",
        # Grammar / time
        "The", "A", "An", "Of", "In", "For", "To", "With", "On", "At",
        "By", "From", "Is", "Are", "And", "Or", "But", "Than", "As",
        "This", "That", "These", "Those", "Our", "Your", "Their",
        "January", "February", "March", "April", "May", "June", "July",
        "August", "September", "October", "November", "December",
        # Years likely to appear as standalone tokens
        *(str(year) for year in range(2018, 2031)),
        # Miscellaneous SERP noise
        "AI", "Apps", "App", "Software", "Platform", "Service", "Startups",
        "Companies", "Company", "Products", "Product", "Brands", "Brand",
    )
)


def _log(msg: str) -> None:
    print(f"[Competitors] {msg}", file=sys.stderr)


def _topic_tokens(topic: str) -> set[str]:
    """Return lowercase alphanumeric tokens of the topic for filtering."""
    return {tok for tok in re.findall(r"[A-Za-z0-9]+", topic.lower()) if tok}


def _candidate_ok(candidate: str, topic_tokens: set[str]) -> bool:
    """Filter a candidate phrase against stopwords and topic overlap."""
    tokens = [t for t in re.findall(r"[A-Za-z0-9&.\-]+", candidate) if t]
    if not tokens:
        return False
    # Reject candidates made entirely of stopwords (e.g., "Top Alternatives").
    if all(tok.lower() in _STOPWORD_TOKENS for tok in tokens):
        return False
    # Reject candidates that overlap with the topic (e.g., topic="OpenAI"
    # should not return "OpenAI Alternatives" or "OpenAI").
    lower_tokens = {tok.lower() for tok in tokens}
    if lower_tokens & topic_tokens:
        return False
    # Reject too-short one-letter tokens like "I" or single digits.
    if len(tokens) == 1 and len(tokens[0]) < 2:
        return False
    return True


def _normalize_candidate(candidate: str) -> str:
    """Collapse whitespace and strip trailing punctuation."""
    return re.sub(r"\s+", " ", candidate).strip(".,;:!?'\"()[] ")


def _extract_peer_entities(
    items: list[dict], topic: str, limit: int,
) -> list[str]:
    """Score capitalized candidates across SERP items and return top `limit`.

    Scoring is bag-of-phrases frequency across all items in the input. Ties
    are broken by first-seen order so the output is deterministic.
    """
    topic_tokens = _topic_tokens(topic)
    counts: Counter[str] = Counter()
    first_seen: dict[str, int] = {}
    order = 0
    # Group candidates into a frequency map keyed by lowercased normalized
    # form so "xAI" and "xAI" count together regardless of case.
    canonical: dict[str, str] = {}
    for item in items:
        text = f"{item.get('title', '')} {item.get('snippet', '')}"
        for raw in _CAPITALIZED_PHRASE.findall(text):
            candidate = _normalize_candidate(raw)
            if not _candidate_ok(candidate, topic_tokens):
                continue
            key = candidate.lower()
            if key not in canonical:
                canonical[key] = candidate
                first_seen[key] = order
                order += 1
            counts[key] += 1

    ranked_keys = sorted(
        counts.keys(),
        key=lambda k: (-counts[k], first_seen[k]),
    )
    return [canonical[k] for k in ranked_keys[:limit]]


def _queries_for(topic: str) -> dict[str, str]:
    return {
        "competitors": f"{topic} competitors",
        "alternatives": f"{topic} alternatives",
        "vs": f"{topic} vs",
    }


def discover_competitors(
    topic: str,
    count: int,
    config: dict,
    *,
    lookback_days: int = 30,
) -> list[str]:
    """Discover `count` peer entities for `topic` via web search.

    Args:
        topic: The primary research topic.
        count: Desired number of competitor entities (1..N).
        config: Runtime config dict — expects the same shape as the engine
            config (BRAVE_API_KEY / EXA_API_KEY / SERPER_API_KEY / etc.).
        lookback_days: Date range for freshness. Defaults to 30.

    Returns:
        A list of up to `count` entity names, deduped and ordered by score.
        Empty list when no web backend is configured or every search fails
        or returns zero usable candidates.
    """
    if count < 1:
        return []
    if not _has_backend(config):
        _log("No web search backend available, skipping competitor discovery")
        return []

    date_range = dates.get_date_range(lookback_days)
    queries = _queries_for(topic)
    collected: list[dict] = []
    searches_run = 0

    def _search(label: str, query: str) -> tuple[str, list[dict]]:
        items, _artifact = grounding.web_search(query, date_range, config)
        return label, items

    with ThreadPoolExecutor(max_workers=len(queries)) as executor:
        futures = {
            executor.submit(_search, label, q): label
            for label, q in queries.items()
        }
        for future in as_completed(futures):
            label = futures[future]
            try:
                _label, items = future.result()
                collected.extend(items)
                searches_run += 1
            except Exception as exc:
                _log(f"Search failed for {label}: {exc}")

    if not collected:
        _log(f"No SERP results for {topic!r} across {searches_run}/{len(queries)} queries")
        return []

    entities = _extract_peer_entities(collected, topic, limit=count)
    _log(
        f"Discovered {len(entities)} competitor(s) for {topic!r} "
        f"from {searches_run}/{len(queries)} queries: {entities}"
    )
    return entities
