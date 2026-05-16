"""Candidate clustering and representative selection."""

from __future__ import annotations

import re

from . import dedupe, schema

CLUSTERABLE_INTENTS = {"breaking_news", "opinion", "comparison", "prediction"}

# Words too common to signal shared topic between clusters.
_ENTITY_STOPWORDS = frozenset({
    "the", "a", "an", "to", "for", "how", "is", "in", "of", "on", "and",
    "with", "from", "by", "at", "this", "that", "it", "what", "are", "do",
    "can", "his", "her", "he", "she", "its", "was", "has", "new", "just",
    "says", "said", "will", "about", "after", "now", "all", "been", "here",
    "not", "out", "up", "more", "also", "but", "who", "year", "first",
    "make", "being", "making", "over", "into", "than", "they", "their",
    "would", "could", "get", "got", "some", "like", "back", "going",
    "breaking", "https", "http", "www", "com",
})


def _candidate_text(candidate: schema.Candidate) -> str:
    return " ".join(part for part in [candidate.title, candidate.snippet] if part).strip()


def _extract_entities(text: str) -> set[str]:
    """Extract significant words (proper nouns, numbers, capitalized words) from text.

    Used for cross-source cluster merging where phrasing differs but entities overlap.
    """
    # Normalize but preserve word boundaries
    words = re.sub(r"[^\w\s]", " ", text).split()
    entities = set()
    for word in words:
        lower = word.lower()
        if lower in _ENTITY_STOPWORDS or len(word) <= 2:
            continue
        # Keep words that are: capitalized, ALL CAPS, contain digits, or 4+ chars
        if word[0].isupper() or word.isupper() or any(c.isdigit() for c in word) or len(word) >= 4:
            entities.add(lower)
    return entities


def _entity_overlap(entities_a: set[str], entities_b: set[str]) -> float:
    """Jaccard-style overlap on extracted entities."""
    if not entities_a or not entities_b:
        return 0.0
    intersection = entities_a & entities_b
    smaller = min(len(entities_a), len(entities_b))
    # Use overlap coefficient (intersection / min) instead of Jaccard,
    # because a short tweet about the same event as a long Reddit post
    # will have fewer total entities but high overlap with the larger set.
    return len(intersection) / smaller if smaller > 0 else 0.0


def _mmr_representatives(
    candidates: list[schema.Candidate],
    text_cache: dict[str, dedupe._PreparedText],
    limit: int = 3,
    diversity_lambda: float = 0.75,
) -> list[str]:
    selected: list[schema.Candidate] = []
    remaining_set = {c.candidate_id for c in candidates}
    remaining = list(candidates)
    while remaining and len(selected) < limit:
        if not selected:
            best = max(remaining, key=lambda candidate: candidate.final_score)
            selected.append(best)
            remaining_set.discard(best.candidate_id)
            remaining = [c for c in remaining if c.candidate_id in remaining_set]
            continue

        selected_preps = [text_cache[c.candidate_id] for c in selected]

        def score(candidate: schema.Candidate) -> float:
            prep = text_cache[candidate.candidate_id]
            diversity_penalty = max(
                dedupe.prepared_similarity(prep, sp) for sp in selected_preps
            )
            return (diversity_lambda * candidate.final_score) - ((1 - diversity_lambda) * diversity_penalty * 100)

        best = max(remaining, key=score)
        selected.append(best)
        remaining_set.discard(best.candidate_id)
        remaining = [c for c in remaining if c.candidate_id in remaining_set]
    return [candidate.candidate_id for candidate in selected]


def cluster_candidates(
    candidates: list[schema.Candidate],
    plan: schema.QueryPlan,
) -> list[schema.Cluster]:
    """Greedy clustering around high-ranked leaders."""
    if plan.intent not in CLUSTERABLE_INTENTS or plan.cluster_mode == "none":
        clusters = []
        for index, candidate in enumerate(candidates, start=1):
            cluster_id = f"cluster-{index}"
            candidate.cluster_id = cluster_id
            clusters.append(
                schema.Cluster(
                    cluster_id=cluster_id,
                    title=candidate.title,
                    candidate_ids=[candidate.candidate_id],
                    representative_ids=[candidate.candidate_id],
                    sources=sorted(schema.candidate_sources(candidate)),
                    score=candidate.final_score,
                    uncertainty=None,
                )
            )
        return clusters

    text_cache: dict[str, dedupe._PreparedText] = {
        c.candidate_id: dedupe._PreparedText(_candidate_text(c))
        for c in candidates
    }

    groups: list[list[schema.Candidate]] = []
    # Lower threshold for breaking_news: related articles share fewer exact
    # words but cover the same event.
    threshold = 0.42 if plan.intent == "breaking_news" else 0.48
    for candidate in candidates:
        assigned = False
        cand_prep = text_cache[candidate.candidate_id]
        for group in groups:
            leader = group[0]
            similarity = dedupe.prepared_similarity(cand_prep, text_cache[leader.candidate_id])
            if similarity >= threshold:
                group.append(candidate)
                assigned = True
                break
        if not assigned:
            groups.append([candidate])

    clusters: list[schema.Cluster] = []
    for index, group in enumerate(groups, start=1):
        group.sort(key=lambda candidate: candidate.final_score, reverse=True)
        cluster_id = f"cluster-{index}"
        representatives = _mmr_representatives(group, text_cache)
        for candidate in group:
            candidate.cluster_id = cluster_id
        clusters.append(
            schema.Cluster(
                cluster_id=cluster_id,
                title=group[0].title,
                candidate_ids=[candidate.candidate_id for candidate in group],
                representative_ids=representatives,
                sources=sorted({source for candidate in group for source in schema.candidate_sources(candidate)}),
                score=max(candidate.final_score for candidate in group),
                uncertainty=_cluster_uncertainty(group),
            )
        )

    # Second pass: merge small clusters that share entities across sources.
    clusters = _merge_entity_clusters(clusters, candidates)

    return sorted(clusters, key=lambda cluster: cluster.score, reverse=True)


def _merge_entity_clusters(
    clusters: list[schema.Cluster],
    all_candidates: list[schema.Candidate],
) -> list[schema.Cluster]:
    """Merge small clusters that cover the same story across different sources.

    The initial greedy pass uses text similarity which misses cross-source
    matches where phrasing differs. This second pass looks at entity overlap
    (proper nouns, names, numbers) to catch cases like:
      - Reddit: "Kanye West to headline all three nights of Wireless Festival 2026"
      - X: "BREAKING: Kanye West (Ye) is making his massive UK comeback!"
    """
    if len(clusters) < 2:
        return clusters

    candidate_map = {c.candidate_id: c for c in all_candidates}

    # Build entity sets per cluster
    cluster_entities: list[set[str]] = []
    for cl in clusters:
        entities: set[str] = set()
        for cid in cl.candidate_ids:
            cand = candidate_map.get(cid)
            if cand:
                entities |= _extract_entities(_candidate_text(cand))
        cluster_entities.append(entities)

    # Only merge clusters with <= 3 items (don't merge already-large clusters)
    merged_into: dict[int, int] = {}  # index -> merge target index
    for i in range(len(clusters)):
        if i in merged_into or len(clusters[i].candidate_ids) > 3:
            continue
        for j in range(i + 1, len(clusters)):
            if j in merged_into or len(clusters[j].candidate_ids) > 3:
                continue
            # Require different sources to merge (same-source should already be grouped)
            sources_i = set(clusters[i].sources)
            sources_j = set(clusters[j].sources)
            if sources_i == sources_j and len(sources_i) == 1:
                continue
            # Prevent Polymarket clusters from merging with non-Polymarket
            # clusters. Prediction markets about "Sam Altman equity" should not
            # merge into a news cluster about "Sam Altman rivalry" just because
            # both mention the same entity.
            poly_i = "polymarket" in sources_i
            poly_j = "polymarket" in sources_j
            if poly_i != poly_j:
                continue

            overlap = _entity_overlap(cluster_entities[i], cluster_entities[j])
            if overlap >= 0.45:
                merged_into[j] = i

    if not merged_into:
        return clusters

    # Build merged cluster list
    result: list[schema.Cluster] = []
    for i, cl in enumerate(clusters):
        if i in merged_into:
            continue
        # Collect all clusters merged into this one
        merge_sources = [i] + [j for j, target in merged_into.items() if target == i]
        if len(merge_sources) == 1:
            result.append(cl)
            continue

        # Combine candidates from all merged clusters
        combined_cids: list[str] = []
        combined_sources: set[str] = set()
        best_score = 0.0
        for idx in merge_sources:
            combined_cids.extend(clusters[idx].candidate_ids)
            combined_sources.update(clusters[idx].sources)
            best_score = max(best_score, clusters[idx].score)

        # Pick representatives from combined pool
        combined_candidates = [candidate_map[cid] for cid in combined_cids if cid in candidate_map]
        combined_candidates.sort(key=lambda c: c.final_score, reverse=True)
        merge_text_cache = {
            c.candidate_id: dedupe._PreparedText(_candidate_text(c))
            for c in combined_candidates
        }
        reps = _mmr_representatives(combined_candidates, merge_text_cache)

        cluster_id = cl.cluster_id
        for cid in combined_cids:
            cand = candidate_map.get(cid)
            if cand:
                cand.cluster_id = cluster_id

        result.append(schema.Cluster(
            cluster_id=cluster_id,
            title=combined_candidates[0].title if combined_candidates else cl.title,
            candidate_ids=combined_cids,
            representative_ids=reps,
            sources=sorted(combined_sources),
            score=best_score,
            uncertainty=_cluster_uncertainty(combined_candidates),
        ))

    return result


def _cluster_uncertainty(group: list[schema.Candidate]) -> str | None:
    sources = {source for candidate in group for source in schema.candidate_sources(candidate)}
    if len(sources) == 1:
        return "single-source"
    if max(candidate.final_score for candidate in group) < 55:
        return "thin-evidence"
    return None
