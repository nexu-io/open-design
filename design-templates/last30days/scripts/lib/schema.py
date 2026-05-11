"""Core data model for the v3.0.0 last30days pipeline."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field, is_dataclass
from typing import Any, Literal


def _drop_none(value: Any) -> Any:
    """Recursively remove None values from dataclass-derived structures."""
    if is_dataclass(value):
        return _drop_none(asdict(value))
    if isinstance(value, dict):
        return {
            key: _drop_none(item)
            for key, item in value.items()
            if item is not None
        }
    if isinstance(value, list):
        return [_drop_none(item) for item in value]
    return value


def _first_non_none(*values: Any) -> Any:
    for value in values:
        if value is not None:
            return value
    return None


@dataclass(frozen=True)
class ProviderRuntime:
    """Resolved runtime provider selection."""

    reasoning_provider: Literal["gemini", "openai", "xai", "local"]
    planner_model: str
    rerank_model: str
    x_search_backend: Literal["xai", "bird"] | None = None


@dataclass(frozen=True)
class SubQuery:
    """Planner-emitted retrieval unit."""

    label: str
    search_query: str
    ranking_query: str
    sources: list[str]
    weight: float = 1.0

    def __post_init__(self) -> None:
        if not self.sources:
            raise ValueError("SubQuery must have at least one source")
        if self.weight <= 0:
            raise ValueError(f"SubQuery weight must be positive, got {self.weight}")


@dataclass
class QueryPlan:
    """Planner output."""

    intent: str
    freshness_mode: str
    cluster_mode: str
    raw_topic: str
    subqueries: list[SubQuery]
    source_weights: dict[str, float]
    notes: list[str] = field(default_factory=list)


@dataclass
class SourceItem:
    """Generic normalized evidence item."""

    item_id: str
    source: str
    title: str
    body: str
    url: str
    author: str | None = None
    container: str | None = None
    published_at: str | None = None
    date_confidence: Literal["high", "med", "low"] = "low"
    engagement: dict[str, float | int] = field(default_factory=dict)
    relevance_hint: float = 0.5
    why_relevant: str = ""
    snippet: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)
    # Signal fields populated by signals.annotate_stream (after construction)
    local_relevance: float | None = None
    freshness: int | None = None
    engagement_score: float | None = None
    source_quality: float | None = None
    local_rank_score: float | None = None


@dataclass
class Candidate:
    """Global candidate after fusion and reranking."""

    candidate_id: str
    item_id: str
    source: str
    title: str
    url: str
    snippet: str
    subquery_labels: list[str]
    native_ranks: dict[str, int]
    local_relevance: float
    freshness: int
    engagement: int | float | None
    source_quality: float
    rrf_score: float
    sources: list[str] = field(default_factory=list)
    source_items: list[SourceItem] = field(default_factory=list)
    rerank_score: float | None = None
    final_score: float = 0.0
    explanation: str | None = None
    fun_score: float | None = None
    fun_explanation: str | None = None
    cluster_id: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class Cluster:
    """Ranked cluster of related candidates."""

    cluster_id: str
    title: str
    candidate_ids: list[str]
    representative_ids: list[str]
    sources: list[str]
    score: float
    uncertainty: Literal["single-source", "thin-evidence"] | None = None

    def __post_init__(self) -> None:
        if not set(self.representative_ids) <= set(self.candidate_ids):
            raise ValueError("representative_ids must be a subset of candidate_ids")


@dataclass
class Report:
    """Final pipeline output."""

    topic: str
    range_from: str
    range_to: str
    generated_at: str
    provider_runtime: ProviderRuntime
    query_plan: QueryPlan
    clusters: list[Cluster]
    ranked_candidates: list[Candidate]
    items_by_source: dict[str, list[SourceItem]]
    errors_by_source: dict[str, str]
    warnings: list[str] = field(default_factory=list)
    artifacts: dict[str, Any] = field(default_factory=dict)


@dataclass
class RetrievalBundle:
    """Structured retrieval output before global ranking."""

    items_by_source_and_query: dict[tuple[str, str], list[SourceItem]] = field(default_factory=dict)
    items_by_source: dict[str, list[SourceItem]] = field(default_factory=dict)
    errors_by_source: dict[str, str] = field(default_factory=dict)
    artifacts: dict[str, Any] = field(default_factory=dict)

    def add_items(self, label: str, source: str, items: list[SourceItem]) -> None:
        """Atomically append items to both items_by_source_and_query and items_by_source."""
        self.items_by_source_and_query.setdefault((label, source), []).extend(items)
        self.items_by_source.setdefault(source, []).extend(items)


def to_dict(value: Any) -> Any:
    """Serialize dataclasses and nested containers."""
    return _drop_none(value)


def provider_runtime_from_dict(payload: dict[str, Any]) -> ProviderRuntime:
    return ProviderRuntime(
        reasoning_provider=payload["reasoning_provider"],
        planner_model=payload["planner_model"],
        rerank_model=payload["rerank_model"],
        x_search_backend=payload.get("x_search_backend"),
    )


def subquery_from_dict(payload: dict[str, Any]) -> SubQuery:
    return SubQuery(
        label=payload["label"],
        search_query=payload["search_query"],
        ranking_query=payload["ranking_query"],
        sources=list(payload.get("sources") or []),
        weight=float(payload.get("weight") or 1.0),
    )


def query_plan_from_dict(payload: dict[str, Any]) -> QueryPlan:
    return QueryPlan(
        intent=payload["intent"],
        freshness_mode=payload["freshness_mode"],
        cluster_mode=payload["cluster_mode"],
        raw_topic=payload["raw_topic"],
        subqueries=[subquery_from_dict(item) for item in payload.get("subqueries") or []],
        source_weights=dict(payload.get("source_weights") or {}),
        notes=list(payload.get("notes") or []),
    )


def source_item_from_dict(payload: dict[str, Any]) -> SourceItem:
    meta = payload.get("metadata") or {}
    return SourceItem(
        item_id=payload["item_id"],
        source=payload["source"],
        title=payload["title"],
        body=payload.get("body") or "",
        url=payload.get("url") or "",
        author=payload.get("author"),
        container=payload.get("container"),
        published_at=payload.get("published_at"),
        date_confidence=payload.get("date_confidence") or "low",
        engagement=dict(payload.get("engagement") or {}),
        relevance_hint=float(_first_non_none(payload.get("relevance_hint"), 0.5)),
        why_relevant=payload.get("why_relevant") or "",
        snippet=payload.get("snippet") or "",
        metadata=dict(meta),
        local_relevance=_first_non_none(payload.get("local_relevance"), meta.get("local_relevance")),
        freshness=_first_non_none(payload.get("freshness"), meta.get("freshness")),
        engagement_score=_first_non_none(payload.get("engagement_score"), meta.get("engagement_score")),
        source_quality=_first_non_none(payload.get("source_quality"), meta.get("source_quality")),
        local_rank_score=_first_non_none(payload.get("local_rank_score"), meta.get("local_rank_score")),
    )


def candidate_from_dict(payload: dict[str, Any]) -> Candidate:
    return Candidate(
        candidate_id=payload["candidate_id"],
        item_id=payload["item_id"],
        source=payload["source"],
        title=payload["title"],
        url=payload.get("url") or "",
        snippet=payload.get("snippet") or "",
        subquery_labels=list(payload.get("subquery_labels") or []),
        native_ranks={key: int(value) for key, value in (payload.get("native_ranks") or {}).items()},
        local_relevance=float(_first_non_none(payload.get("local_relevance"), 0.0)),
        freshness=int(_first_non_none(payload.get("freshness"), 0)),
        engagement=payload.get("engagement"),
        source_quality=float(_first_non_none(payload.get("source_quality"), 0.0)),
        rrf_score=float(_first_non_none(payload.get("rrf_score"), 0.0)),
        sources=list(payload.get("sources") or []),
        source_items=[source_item_from_dict(item) for item in payload.get("source_items") or []],
        rerank_score=float(payload["rerank_score"]) if payload.get("rerank_score") is not None else None,
        final_score=float(_first_non_none(payload.get("final_score"), 0.0)),
        explanation=payload.get("explanation"),
        fun_score=float(payload["fun_score"]) if payload.get("fun_score") is not None else None,
        fun_explanation=payload.get("fun_explanation"),
        cluster_id=payload.get("cluster_id"),
        metadata=dict(payload.get("metadata") or {}),
    )


def cluster_from_dict(payload: dict[str, Any]) -> Cluster:
    return Cluster(
        cluster_id=payload["cluster_id"],
        title=payload["title"],
        candidate_ids=list(payload.get("candidate_ids") or []),
        representative_ids=list(payload.get("representative_ids") or []),
        sources=list(payload.get("sources") or []),
        score=float(_first_non_none(payload.get("score"), 0.0)),
        uncertainty=payload.get("uncertainty"),
    )


def report_from_dict(payload: dict[str, Any]) -> Report:
    return Report(
        topic=payload["topic"],
        range_from=payload["range_from"],
        range_to=payload["range_to"],
        generated_at=payload["generated_at"],
        provider_runtime=provider_runtime_from_dict(payload["provider_runtime"]),
        query_plan=query_plan_from_dict(payload["query_plan"]),
        clusters=[cluster_from_dict(item) for item in payload.get("clusters") or []],
        ranked_candidates=[candidate_from_dict(item) for item in payload.get("ranked_candidates") or []],
        items_by_source={
            source: [source_item_from_dict(item) for item in items]
            for source, items in (payload.get("items_by_source") or {}).items()
        },
        errors_by_source=dict(payload.get("errors_by_source") or {}),
        warnings=list(payload.get("warnings") or []),
        artifacts=dict(payload.get("artifacts") or {}),
    )


def candidate_sources(candidate: Candidate) -> list[str]:
    if candidate.sources:
        return candidate.sources
    return [candidate.source] if candidate.source else []


def candidate_source_label(candidate: Candidate) -> str:
    sources = candidate_sources(candidate)
    return ", ".join(sources) if sources else "unknown"


def candidate_best_published_at(candidate: Candidate) -> str | None:
    return max(
        (item.published_at for item in candidate.source_items if item.published_at),
        default=None,
    )


def candidate_primary_item(candidate: Candidate) -> SourceItem | None:
    if not candidate.source_items:
        return None
    for item in candidate.source_items:
        if item.source == candidate.source:
            return item
    return candidate.source_items[0]
