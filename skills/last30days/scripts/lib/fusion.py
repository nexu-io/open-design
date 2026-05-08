"""Weighted reciprocal rank fusion for per-(subquery, source) streams."""

from __future__ import annotations

from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

from . import schema

# Standard RRF smoothing constant (Cormack et al. 2009)
RRF_K = 60


def _candidate_sort_key(c: schema.Candidate) -> tuple:
    return (-c.rrf_score, -c.local_relevance, -c.freshness, schema.candidate_source_label(c), c.title)


def _normalize_url(url: str) -> str:
    """Normalize URL for dedup: lowercase, strip www/old/m prefixes, remove tracking params."""
    parsed = urlparse(url.strip().lower())
    netloc = parsed.netloc
    for prefix in ("www.", "old.", "m."):
        if netloc.startswith(prefix):
            netloc = netloc[len(prefix):]
    # Strip tracking params
    params = parse_qs(parsed.query)
    clean_params = {k: v for k, v in params.items() if not k.startswith("utm_")}
    query = urlencode(clean_params, doseq=True)
    return urlunparse((parsed.scheme, netloc, parsed.path.rstrip("/"), "", query, ""))


def candidate_key(item: schema.SourceItem) -> str:
    if item.url:
        return _normalize_url(item.url)
    return f"{item.source}:{item.item_id}"


_DIVERSITY_RELEVANCE_THRESHOLD = 0.25

# Per-author cap: no single author/handle should dominate the pool.
_MAX_ITEMS_PER_AUTHOR = 3


def _extract_author(candidate: schema.Candidate) -> str | None:
    """Return a normalized author key from a candidate's source items."""
    for item in candidate.source_items:
        if item.author:
            return item.author.strip().lower()
    return None


def _apply_per_author_cap(
    candidates: list[schema.Candidate],
    max_per_author: int = _MAX_ITEMS_PER_AUTHOR,
) -> list[schema.Candidate]:
    """Keep at most *max_per_author* items from any single author.

    Candidates are assumed to already be sorted by quality (rrf_score etc.),
    so the first N encountered per author are the best ones.
    """
    author_counts: dict[str, int] = {}
    result: list[schema.Candidate] = []
    for c in candidates:
        author = _extract_author(c)
        if author is None:
            result.append(c)
            continue
        count = author_counts.get(author, 0)
        if count < max_per_author:
            result.append(c)
            author_counts[author] = count + 1
    return result


def _diversify_pool(
    fused: list[schema.Candidate],
    pool_limit: int,
    min_per_source: int = 2,
) -> list[schema.Candidate]:
    """Ensure at least *min_per_source* items per qualifying source survive truncation.

    Sources only qualify for reserved slots if their best item exceeds
    the relevance threshold. Low-relevance sources compete on merit only.
    """
    max_relevance: dict[str, float] = {}
    for c in fused:
        current = max_relevance.get(c.source, 0.0)
        if c.local_relevance > current:
            max_relevance[c.source] = c.local_relevance

    reserved: dict[str, list[schema.Candidate]] = {}
    remainder: list[schema.Candidate] = []
    for c in fused:
        qualifies = max_relevance.get(c.source, 0.0) >= _DIVERSITY_RELEVANCE_THRESHOLD
        bucket = reserved.setdefault(c.source, [])
        if qualifies and len(bucket) < min_per_source:
            bucket.append(c)
        else:
            remainder.append(c)
    pool = [c for per_source in reserved.values() for c in per_source]
    seen = {c.candidate_id for c in pool}
    for c in remainder:
        if len(pool) >= pool_limit:
            break
        if c.candidate_id not in seen:
            pool.append(c)
    pool.sort(key=_candidate_sort_key)
    return pool[:pool_limit]


def weighted_rrf(
    streams: dict[tuple[str, str], list[schema.SourceItem]],
    plan: schema.QueryPlan,
    *,
    pool_limit: int,
) -> list[schema.Candidate]:
    """Fuse ranked lists into a single candidate pool."""
    subqueries = {subquery.label: subquery for subquery in plan.subqueries}
    candidates: dict[str, schema.Candidate] = {}
    # Track (source, item_id) pairs already attached to each candidate for O(1) dedup.
    seen_source_items: dict[str, set[tuple[str, str]]] = {}

    for (label, source), items in streams.items():
        subquery = subqueries[label]
        weight = subquery.weight * plan.source_weights.get(source, 1.0)
        for rank, item in enumerate(items, start=1):
            key = candidate_key(item)
            score = weight / (RRF_K + rank)
            item_local_relevance = item.local_relevance if item.local_relevance is not None else float(item.metadata.get("local_relevance", item.relevance_hint))
            item_freshness = item.freshness if item.freshness is not None else int(item.metadata.get("freshness", 0))
            item_source_quality = item.source_quality if item.source_quality is not None else float(item.metadata.get("source_quality", 0.6))
            if key not in candidates:
                candidates[key] = schema.Candidate(
                    candidate_id=key,
                    item_id=item.item_id,
                    source=item.source,
                    title=item.title,
                    url=item.url,
                    snippet=item.snippet,
                    subquery_labels=[label],
                    native_ranks={f"{label}:{source}": rank},
                    local_relevance=item_local_relevance,
                    freshness=item_freshness,
                    engagement=item.engagement_score if item.engagement_score is not None else item.metadata.get("engagement_score"),
                    source_quality=item_source_quality,
                    rrf_score=score,
                    sources=[item.source],
                    source_items=[item],
                    metadata={
                        "provenance": [
                            {
                                "source": source,
                                "subquery_label": label,
                                "native_rank": rank,
                                "item_id": item.item_id,
                            }
                        ]
                    },
                )
                seen_source_items[key] = {(item.source, item.item_id)}
                continue

            candidate = candidates[key]
            candidate.rrf_score += score
            previous_primary_score = (candidate.local_relevance * 100.0) + candidate.freshness + (candidate.source_quality * 10.0)
            incoming_primary_score = (item_local_relevance * 100.0) + item_freshness + (item_source_quality * 10.0)
            candidate.local_relevance = max(
                candidate.local_relevance,
                item_local_relevance,
            )
            candidate.freshness = max(candidate.freshness, item_freshness)
            item_eng = item.engagement_score if item.engagement_score is not None else item.metadata.get("engagement_score")
            if candidate.engagement is None:
                candidate.engagement = item_eng
            elif item_eng is not None:
                candidate.engagement = max(candidate.engagement, item_eng)
            candidate.source_quality = max(
                candidate.source_quality,
                item_source_quality,
            )
            candidate.native_ranks[f"{label}:{source}"] = rank
            if label not in candidate.subquery_labels:
                candidate.subquery_labels.append(label)
            if item.source not in candidate.sources:
                candidate.sources.append(item.source)
            source_item_key = (item.source, item.item_id)
            if source_item_key not in seen_source_items[key]:
                seen_source_items[key].add(source_item_key)
                candidate.source_items.append(item)
            candidate.metadata.setdefault("provenance", []).append(
                {
                    "source": source,
                    "subquery_label": label,
                    "native_rank": rank,
                    "item_id": item.item_id,
                }
            )
            if incoming_primary_score > previous_primary_score:
                candidate.item_id = item.item_id
                candidate.source = item.source
                candidate.title = item.title
                candidate.snippet = item.snippet
            if len(candidate.snippet.split()) < len(item.snippet.split()):
                candidate.snippet = item.snippet

    fused = sorted(candidates.values(), key=_candidate_sort_key)
    fused = _apply_per_author_cap(fused)
    return _diversify_pool(fused, pool_limit)
