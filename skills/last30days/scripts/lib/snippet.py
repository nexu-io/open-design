"""Best-window extraction for rerankable evidence snippets."""

from __future__ import annotations

from . import relevance, schema


def _truncate_words(text: str, max_words: int) -> str:
    words = text.split()
    if len(words) <= max_words:
        return text.strip()
    return " ".join(words[:max_words]).strip() + "..."


def _windows(words: list[str], size: int, overlap: int) -> list[str]:
    if not words:
        return []
    if len(words) <= size:
        return [" ".join(words)]
    step = max(1, size - overlap)
    return [
        " ".join(words[start:start + size])
        for start in range(0, len(words), step)
    ]


def extract_best_snippet(
    item: schema.SourceItem,
    ranking_query: "str | relevance.PreparedQuery",
    max_words: int = 120,
) -> str:
    """Prefer existing snippets, else extract the best matching evidence window."""
    preferred = item.snippet.strip()
    if preferred:
        return _truncate_words(preferred, max_words)

    body = item.body.strip()
    if not body:
        return _truncate_words(item.title, max_words)

    words = body.split()
    candidates = _windows(words, size=min(max_words, 110), overlap=30)
    if not candidates:
        return _truncate_words(body, max_words)

    prepared_query = ranking_query if isinstance(ranking_query, relevance.PreparedQuery) else relevance.PreparedQuery(ranking_query)
    best = max(
        candidates,
        key=lambda candidate: relevance.token_overlap_relevance(prepared_query, candidate),
    )
    return _truncate_words(best, max_words)
