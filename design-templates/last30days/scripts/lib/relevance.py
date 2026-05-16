"""Shared token-overlap relevance scoring for search result ranking.

The score is intentionally query-centric:
- exact phrase matches should score very high
- partial matches should pay a meaningful penalty
- matches on generic words alone ("odds", "review") should not pass as relevant
"""

import re
from typing import List, Optional, Set

# Stopwords for relevance computation (common English words that dilute token overlap)
STOPWORDS = frozenset({
    'the', 'a', 'an', 'to', 'for', 'how', 'is', 'in', 'of', 'on',
    'and', 'with', 'from', 'by', 'at', 'this', 'that', 'it', 'my',
    'your', 'i', 'me', 'we', 'you', 'what', 'are', 'do', 'can',
    'its', 'be', 'or', 'not', 'no', 'so', 'if', 'but', 'about',
    'all', 'just', 'get', 'has', 'have', 'was', 'will',
})

# Synonym groups for relevance scoring (bidirectional expansion)
# Superset of all platform-specific synonym dicts
SYNONYMS = {
    'hip': {'rap', 'hiphop'},
    'hop': {'rap', 'hiphop'},
    'rap': {'hip', 'hop', 'hiphop'},
    'hiphop': {'rap', 'hip', 'hop'},
    'js': {'javascript'},
    'javascript': {'js'},
    'ts': {'typescript'},
    'typescript': {'ts'},
    'ai': {'artificial', 'intelligence'},
    'ml': {'machine', 'learning'},
    'react': {'reactjs'},
    'reactjs': {'react'},
    'svelte': {'sveltejs'},
    'sveltejs': {'svelte'},
    'vue': {'vuejs'},
    'vuejs': {'vue'},
}

# Generic query words that should not carry relevance on their own.
# They still help when paired with stronger entity/topic matches.
LOW_SIGNAL_QUERY_TOKENS = frozenset({
    'advice', 'animation', 'animations', 'best', 'chance', 'chances',
    'code', 'compare', 'comparison', 'differences', 'explain', 'guide',
    'guides', 'how', 'latest', 'news', 'odds', 'opinion', 'opinions',
    'prediction', 'predictions', 'probability', 'probabilities', 'prompt',
    'prompting', 'prompts', 'rate', 'review', 'reviews', 'thoughts',
    'tip', 'tips', 'tutorial', 'tutorials', 'update', 'updates', 'use',
    'using', 'versus', 'vs', 'worth',
})


def tokenize(text: str) -> Set[str]:
    """Lowercase, strip punctuation, remove stopwords, drop single-char tokens.

    Expands tokens with synonyms for better cross-domain matching.
    """
    words = re.sub(r'[^\w\s]', ' ', text.lower()).split()
    tokens = {w for w in words if w not in STOPWORDS and len(w) > 1}
    expanded = set(tokens)
    for t in tokens:
        if t in SYNONYMS:
            expanded.update(SYNONYMS[t])
    return expanded


def _normalize_phrase(text: str) -> str:
    """Normalize text for phrase containment checks."""
    return ' '.join(re.sub(r'[^\w\s]', ' ', text.lower()).split())


class PreparedQuery:
    """Precomputed query shape reused across items in a stream.

    Built once per ranking_query; reused by token_overlap_relevance so the
    per-item normalize/score loops don't re-tokenize the same query N times.
    """

    __slots__ = ("raw", "q_tokens", "informative_q_tokens", "normalized_phrase")

    def __init__(self, query: str) -> None:
        self.raw = query
        self.q_tokens = tokenize(query)
        informative = {t for t in self.q_tokens if t not in LOW_SIGNAL_QUERY_TOKENS}
        self.informative_q_tokens = informative or self.q_tokens
        self.normalized_phrase = _normalize_phrase(query)


def _as_prepared(query: "str | PreparedQuery") -> PreparedQuery:
    return query if isinstance(query, PreparedQuery) else PreparedQuery(query)


def token_overlap_relevance(
    query: "str | PreparedQuery",
    text: str,
    hashtags: Optional[List[str]] = None,
) -> float:
    """Compute a query-centric relevance score between 0.0 and 1.0.

    The score combines:
    - query coverage
    - informative-token coverage
    - a small precision term to penalize extra noise
    - an exact phrase bonus

    Generic tokens alone are capped below typical relevance filter thresholds.

    Args:
        query: Search query
        text: Content text to match against
        hashtags: Optional list of hashtags (TikTok/Instagram). Concatenated
            hashtags are split to match query tokens (e.g. "claudecode" matches "claude").

    Returns:
        Float between 0.0 and 1.0 (0.5 for empty queries)
    """
    prepared = _as_prepared(query)
    q_tokens = prepared.q_tokens

    # Combine text and hashtags for matching
    combined = text
    if hashtags:
        combined = f"{text} {' '.join(hashtags)}"
    t_tokens = tokenize(combined)

    # Split concatenated hashtags (e.g., "claudecode" -> matches "claude", "code")
    if hashtags:
        for tag in hashtags:
            tag_lower = tag.lower()
            for qt in q_tokens:
                if qt in tag_lower and qt != tag_lower:
                    t_tokens.add(qt)

    if not q_tokens:
        return 0.5  # Neutral fallback for empty/stopword-only queries

    overlap_tokens = q_tokens & t_tokens
    overlap = len(overlap_tokens)
    if overlap == 0:
        return 0.0

    informative_q_tokens = prepared.informative_q_tokens

    coverage = overlap / len(q_tokens)
    informative_overlap = len(informative_q_tokens & t_tokens) / len(informative_q_tokens)
    precision_denominator = min(len(t_tokens), len(q_tokens) + 4) or 1
    precision = overlap / precision_denominator

    phrase_bonus = 0.0
    normalized_query = prepared.normalized_phrase
    normalized_text = _normalize_phrase(combined)
    if normalized_query and normalized_query in normalized_text:
        phrase_bonus = 0.12 if len(normalized_query.split()) > 1 else 0.16

    base = (
        0.55 * (coverage ** 1.35) +
        0.25 * informative_overlap +
        0.20 * precision
    )

    # If we only matched generic query words, keep the score below the
    # normal relevance filter threshold so these do not survive by default.
    if informative_q_tokens and not (informative_q_tokens & t_tokens):
        return round(min(0.24, base), 2)

    return round(min(1.0, base + phrase_bonus), 2)
