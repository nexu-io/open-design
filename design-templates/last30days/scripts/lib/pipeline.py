"""v3.0.0 orchestration pipeline."""

from __future__ import annotations

import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from shutil import which
from typing import Any

from . import (
    bird_x,
    bluesky,
    dates,
    dedupe,
    entity_extract,
    env,
    github,
    grounding,
    hackernews,
    instagram,
    normalize,
    perplexity,
    pinterest,
    planner,
    polymarket,
    providers,
    query,
    reddit,
    reddit_public,
    relevance,
    rerank,
    schema,
    signals,
    snippet,
    threads,
    tiktok,
    truthsocial,
    xai_x,
    xiaohongshu_api,
    xquik,
    xurl_x,
    youtube_yt,
)
from .cluster import cluster_candidates
from .fusion import weighted_rrf

DEPTH_SETTINGS = {
    "quick": {"per_stream_limit": 6, "pool_limit": 15, "rerank_limit": 12},
    "default": {"per_stream_limit": 12, "pool_limit": 40, "rerank_limit": 40},
    "deep": {"per_stream_limit": 20, "pool_limit": 60, "rerank_limit": 60},
}

SEARCH_ALIAS = {
    "hn": "hackernews",
    "bsky": "bluesky",
    "truth": "truthsocial",
    "web": "grounding",
    "xhs": "xiaohongshu",
    "xquik": "xquik",
}

MAX_SOURCE_FETCHES: dict[str, int] = {"x": 2}

MOCK_AVAILABLE_SOURCES = [
    "reddit",
    "x",
    "youtube",
    "tiktok",
    "instagram",
    "hackernews",
    "bluesky",
    "truthsocial",
    "polymarket",
    "grounding",
    "xiaohongshu",
    "github",
    "perplexity",
    "xquik",
]


def normalize_requested_sources(sources: list[str] | None) -> list[str] | None:
    if not sources:
        return None
    normalized = []
    for source in sources:
        key = SEARCH_ALIAS.get(source.lower(), source.lower())
        if key not in normalized:
            normalized.append(key)
    return normalized


def available_sources(config: dict[str, Any], requested_sources: list[str] | None = None) -> list[str]:
    available: list[str] = []
    # reddit_public needs no API key - always available
    available.append("reddit")
    if config.get("SCRAPECREATORS_API_KEY"):
        available.extend(["tiktok", "instagram"])
    if env.get_x_source(config):
        available.append("x")
    if which("yt-dlp") or env.is_youtube_sc_available(config):
        available.append("youtube")
    available.extend(["hackernews", "polymarket"])
    if config.get("GITHUB_TOKEN") or which("gh"):
        available.append("github")
    if env.is_bluesky_available(config):
        available.append("bluesky")
    if env.is_truthsocial_available(config):
        available.append("truthsocial")
    if config.get("BRAVE_API_KEY") or config.get("EXA_API_KEY") or config.get("SERPER_API_KEY") or config.get("PARALLEL_API_KEY"):
        available.append("grounding")
    # Perplexity Sonar: opt-in additive source via INCLUDE_SOURCES=perplexity
    include_sources = (config.get("INCLUDE_SOURCES") or "").lower().split(",")
    if config.get("OPENROUTER_API_KEY") and "perplexity" in include_sources:
        available.append("perplexity")
    if requested_sources and "xiaohongshu" in requested_sources and env.is_xiaohongshu_available(config):
        available.append("xiaohongshu")
    if env.is_threads_available(config):
        available.append("threads")
    if requested_sources and "pinterest" in requested_sources and env.is_pinterest_available(config):
        available.append("pinterest")
    if env.is_xquik_available(config):
        available.append("xquik")
    return available


def diagnose(config: dict[str, Any], requested_sources: list[str] | None = None) -> dict[str, Any]:
    requested_sources = normalize_requested_sources(requested_sources)
    google_key = _google_key(config)
    x_status = env.get_x_source_status(config)
    native_web_backend = None
    if config.get("BRAVE_API_KEY"):
        native_web_backend = "brave"
    elif config.get("EXA_API_KEY"):
        native_web_backend = "exa"
    elif config.get("SERPER_API_KEY"):
        native_web_backend = "serper"
    elif config.get("PARALLEL_API_KEY"):
        native_web_backend = "parallel"
    providers_status = {
        "google": bool(google_key),
        "openai": bool(config.get("OPENAI_API_KEY")) and config.get("OPENAI_AUTH_STATUS") == env.AUTH_STATUS_OK,
        "xai": bool(config.get("XAI_API_KEY")),
        "openrouter": bool(config.get("OPENROUTER_API_KEY")),
    }
    return {
        "providers": providers_status,
        "local_mode": not any(providers_status.values()),
        "reasoning_provider": (config.get("LAST30DAYS_REASONING_PROVIDER") or "auto").lower(),
        "x_backend": x_status["source"],
        "bird_installed": x_status["bird_installed"],
        "bird_authenticated": x_status["bird_authenticated"],
        "bird_username": x_status["bird_username"],
        "native_web_backend": native_web_backend,
        "has_scrapecreators": bool(config.get("SCRAPECREATORS_API_KEY")),
        "has_github": bool(config.get("GITHUB_TOKEN") or which("gh")),
        "available_sources": available_sources(config, requested_sources),
    }


def run(
    *,
    topic: str,
    config: dict[str, Any],
    depth: str,
    requested_sources: list[str] | None = None,
    mock: bool = False,
    x_handle: str | None = None,
    x_related: list[str] | None = None,
    web_backend: str = "auto",
    external_plan: dict | None = None,
    subreddits: list[str] | None = None,
    tiktok_hashtags: list[str] | None = None,
    tiktok_creators: list[str] | None = None,
    ig_creators: list[str] | None = None,
    lookback_days: int = 30,
    github_user: str | None = None,
    github_repos: list[str] | None = None,
    internal_subrun: bool = False,
) -> schema.Report:
    settings = DEPTH_SETTINGS[depth]
    requested_sources = normalize_requested_sources(requested_sources)
    from_date, to_date = dates.get_date_range(lookback_days)

    if mock:
        runtime = providers.mock_runtime(config, depth)
        reasoning_provider = None
        available = list(requested_sources or MOCK_AVAILABLE_SOURCES)
    else:
        runtime, reasoning_provider = providers.resolve_runtime(config, depth)
        available = available_sources(config, requested_sources)
        if requested_sources:
            available = [source for source in available if source in requested_sources]
    if web_backend == "none":
        available = [s for s in available if s != "grounding"]
    elif web_backend in ("brave", "exa", "serper") and "grounding" not in available:
        available.append("grounding")
    if not available:
        raise RuntimeError("No sources are available for this run.")

    if external_plan:
        # External plan provided (e.g., from Claude Code via --plan flag).
        # Parse it through the same sanitizer to validate structure.
        plan = planner._sanitize_plan(
            external_plan, topic, available, requested_sources, depth,
        )
        plan_source = "external"
    else:
        plan = planner.plan_query(
            topic=topic,
            available_sources=available,
            requested_sources=requested_sources,
            depth=depth,
            provider=None if mock else reasoning_provider,
            model=None if mock else runtime.planner_model,
            context=config.get("_auto_resolve_context", ""),
            internal_subrun=internal_subrun,
        )
        # Source labelling: the fallback path annotates notes with "fallback-plan"
        # or "deterministic-comparison-plan"; anything else came from the LLM.
        if any("fallback" in note or "deterministic" in note for note in (plan.notes or [])):
            plan_source = "deterministic"
        elif not mock and reasoning_provider and runtime.planner_model:
            plan_source = "llm"
        else:
            plan_source = "deterministic"

    # Safety net: ensure grounding appears in all subqueries even if the planner
    # omits it. This is redundant when the planner includes grounding via
    # SOURCE_CAPABILITIES, but kept as a fallback.
    if web_backend != "none" and "grounding" in available:
        for sq in plan.subqueries:
            if "grounding" not in sq.sources:
                sq.sources.append("grounding")

    # Always-on planner trace. Emits one summary line plus one per subquery
    # so retrieval-breadth failures like the 2026-04-19 Hermes Agent Use Cases
    # disaster are visible without --debug. Stderr only; does not leak into
    # the user-facing stdout synthesis.
    print(
        f"[Planner] Plan: intent={plan.intent}, freshness={plan.freshness_mode}, "
        f"cluster_mode={plan.cluster_mode}, subqueries={len(plan.subqueries)}, "
        f"source={plan_source}",
        file=sys.stderr,
    )
    if plan.subqueries:
        for index, sq in enumerate(plan.subqueries, start=1):
            sources_str = ",".join(sq.sources) if sq.sources else "(none)"
            print(
                f"[Planner]   sq{index} label={sq.label} "
                f'search="{sq.search_query}" sources=[{sources_str}]',
                file=sys.stderr,
            )
    else:
        print("[Planner]   (no subqueries in plan)", file=sys.stderr)

    bundle = schema.RetrievalBundle(artifacts={"grounding": []})
    # Expose plan_source to the renderer so render_compact can emit the
    # DEGRADED RUN banner when a named-entity topic was invoked bare
    # (source=deterministic AND no pre-research flags). LAW 7 backstop.
    bundle.artifacts["plan_source"] = plan_source

    # Project-mode or person-mode GitHub: run once before the main subquery loop
    _github_custom_done = False
    _github_enriched_repos: set[str] = set()

    # Project mode takes priority over person mode
    if github_repos and "github" in available:
        try:
            project_items = github.search_github_project(
                github_repos, from_date, to_date,
                depth=depth, token=config.get("GITHUB_TOKEN"),
            )
            if project_items:
                normalized = _normalize_score_dedupe(
                    "github", project_items, from_date, to_date,
                    freshness_mode=plan.freshness_mode,
                    ranking_query=f"What are {', '.join(github_repos)} doing on GitHub?",
                )
                primary_label = plan.subqueries[0].label if plan.subqueries else "primary"
                bundle.add_items(primary_label, "github", normalized)
                _github_custom_done = True
                _github_enriched_repos = {r.lower() for r in github_repos}
        except Exception as exc:
            bundle.errors_by_source["github"] = f"Project-mode failed: {exc}"

    _github_person_done = False
    if github_user and "github" in available and not _github_custom_done:
        try:
            person_items = github.search_github_person(
                github_user, from_date, to_date,
                depth=depth, token=config.get("GITHUB_TOKEN"),
            )
            if person_items:
                normalized = _normalize_score_dedupe(
                    "github", person_items, from_date, to_date,
                    freshness_mode=plan.freshness_mode,
                    ranking_query=f"What is @{github_user} doing on GitHub?",
                )
                # Use the first subquery's label so RRF can look up the weight
                primary_label = plan.subqueries[0].label if plan.subqueries else "primary"
                bundle.add_items(primary_label, "github", normalized)
                _github_person_done = True
        except Exception as exc:
            bundle.errors_by_source["github"] = f"Person-mode failed: {exc}"

    # Thread-safe set prevents redundant fetches after a source returns 429
    rate_limited_sources: set[str] = set()
    rate_limit_lock = threading.Lock()

    futures = {}
    # Per-source fetch budget prevents redundant API calls
    source_fetch_count: dict[str, int] = {}
    stream_count = sum(
        1
        for subquery in plan.subqueries
        for source in subquery.sources
        if source in available
    )
    max_workers = max(4, min(16, stream_count or 1))
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        for subquery in plan.subqueries:
            for source in subquery.sources:
                if source not in available:
                    continue
                # Skip GitHub keyword search if person-mode already ran
                if source == "github" and (_github_person_done or _github_custom_done):
                    continue
                # Enforce per-source fetch cap
                cap = MAX_SOURCE_FETCHES.get(source)
                if cap is not None:
                    current = source_fetch_count.get(source, 0)
                    if current >= cap:
                        continue
                    source_fetch_count[source] = current + 1
                futures[
                    executor.submit(
                        _retrieve_stream,
                        topic=topic,
                        subquery=subquery,
                        source=source,
                        config=config,
                        depth=depth,
                        date_range=(from_date, to_date),
                        runtime=runtime,
                        mock=mock,
                        rate_limited_sources=rate_limited_sources,
                        rate_limit_lock=rate_limit_lock,
                        web_backend=web_backend,
                        raw_topic=topic,
                        subreddits=subreddits,
                        tiktok_hashtags=tiktok_hashtags,
                        tiktok_creators=tiktok_creators,
                        ig_creators=ig_creators,
                    )
                ] = (subquery, source)

        for future in as_completed(futures):
            subquery, source = futures[future]
            try:
                raw_items, artifact = future.result()
            except Exception as exc:
                # Share 429 signal so pending futures skip this source
                if _is_rate_limit_error(exc):
                    with rate_limit_lock:
                        rate_limited_sources.add(source)
                    bundle.errors_by_source[source] = str(exc)
                    continue
                # Retry once for transient 5xx errors
                if _is_transient_error(exc):
                    time.sleep(3)
                    try:
                        raw_items, artifact = _retrieve_stream(
                            topic=topic, subquery=subquery, source=source,
                            config=config, depth=depth, date_range=(from_date, to_date),
                            runtime=runtime, mock=mock,
                            rate_limited_sources=rate_limited_sources,
                            rate_limit_lock=rate_limit_lock,
                            web_backend=web_backend,
                            raw_topic=topic,
                            subreddits=subreddits,
                            tiktok_hashtags=tiktok_hashtags,
                            tiktok_creators=tiktok_creators,
                            ig_creators=ig_creators,
                        )
                    except Exception as retry_exc:
                        bundle.errors_by_source[source] = f"{exc} (retried once, still failed: {retry_exc})"
                        continue
                else:
                    bundle.errors_by_source[source] = str(exc)
                    continue
            normalized = _normalize_score_dedupe(
                source, raw_items, from_date, to_date,
                freshness_mode=plan.freshness_mode,
                ranking_query=subquery.ranking_query,
            )
            normalized = normalized[: settings["per_stream_limit"]]
            bundle.add_items(subquery.label, source, normalized)
            if artifact:
                bundle.artifacts.setdefault("grounding", []).append(artifact)

    # Phase 2: supplemental entity-based searches
    _run_supplemental_searches(
        topic=topic,
        bundle=bundle,
        plan=plan,
        config=config,
        depth=depth,
        date_range=(from_date, to_date),
        runtime=runtime,
        mock=mock,
        rate_limited_sources=rate_limited_sources,
        rate_limit_lock=rate_limit_lock,
        x_handle=x_handle,
        x_related=x_related,
    )

    # Phase 2b: retry thin sources with simplified query
    # Note: _github_skip_sources tells the retry to not re-run GitHub keyword search
    # when project-mode or person-mode already provided authoritative data.
    _github_skip_retry = {"github"} if (_github_person_done or _github_custom_done) else set()
    _retry_thin_sources(
        topic=topic,
        bundle=bundle,
        plan=plan,
        config=config,
        depth=depth,
        date_range=(from_date, to_date),
        runtime=runtime,
        mock=mock,
        rate_limited_sources=rate_limited_sources,
        rate_limit_lock=rate_limit_lock,
        settings=settings,
        web_backend=web_backend,
        skip_sources=_github_skip_retry,
    )

    # Clear errors for sources that returned items despite partial failures.
    # A source that 429'd on one subquery but succeeded on another is not "errored".
    for source in list(bundle.errors_by_source):
        if bundle.items_by_source.get(source):
            del bundle.errors_by_source[source]

    items_by_source = _finalize_items_by_source(bundle.items_by_source, topic=topic, config=config)
    candidates = weighted_rrf(bundle.items_by_source_and_query, plan, pool_limit=settings["pool_limit"])
    ranked_candidates = rerank.rerank_candidates(
        topic=topic,
        plan=plan,
        candidates=candidates,
        provider=None if mock else reasoning_provider,
        model=None if mock else runtime.rerank_model,
        shortlist_size=settings["rerank_limit"],
    )
    rerank.score_fun(
        topic=topic,
        candidates=ranked_candidates,
        provider=None if mock else reasoning_provider,
        model=None if mock else runtime.rerank_model,
    )

    # Phase 3: post-rerank GitHub star enrichment
    if "github" in available and not mock:
        github.enrich_candidates_with_stars(
            ranked_candidates,
            token=config.get("GITHUB_TOKEN"),
            already_enriched=_github_enriched_repos,
        )

    clusters = cluster_candidates(ranked_candidates, plan)
    warnings = _warnings(items_by_source, ranked_candidates, bundle.errors_by_source)

    return schema.Report(
        topic=topic,
        range_from=from_date,
        range_to=to_date,
        generated_at=datetime.now(timezone.utc).isoformat(),
        provider_runtime=runtime,
        query_plan=plan,
        clusters=clusters,
        ranked_candidates=ranked_candidates,
        items_by_source=items_by_source,
        errors_by_source=bundle.errors_by_source,
        warnings=warnings,
        artifacts=bundle.artifacts,
    )


def _normalize_score_dedupe(
    source: str,
    raw_items: list[dict],
    from_date: str,
    to_date: str,
    freshness_mode: str,
    ranking_query: str,
) -> list[schema.SourceItem]:
    """Normalize, annotate, prune, dedupe, and extract snippets for a batch of raw items."""
    normalized = normalize.normalize_source_items(
        source, raw_items, from_date, to_date,
        freshness_mode=freshness_mode,
    )
    prepared_query = relevance.PreparedQuery(ranking_query)
    normalized = signals.annotate_stream(normalized, prepared_query, freshness_mode)
    normalized = signals.prune_low_relevance(normalized)
    normalized = dedupe.dedupe_items(normalized)
    for item in normalized:
        item.snippet = snippet.extract_best_snippet(item, prepared_query)
    return normalized


def _finalize_items_by_source(
    items_by_source_raw: dict[str, list[schema.SourceItem]],
    topic: str = "",
    config: dict | None = None,
) -> dict[str, list[schema.SourceItem]]:
    finalized = {}
    for source, items in items_by_source_raw.items():
        items = sorted(items, key=lambda item: item.local_rank_score or 0.0, reverse=True)
        items = dedupe.dedupe_items(items)
        # Post-merge topic-relevance filter for Polymarket: comparison queries
        # fan out into per-entity subqueries ("Hermes", "OpenClaw") whose topic
        # is too narrow for Gamma API to filter meaningfully. Re-validating the
        # merged list against the full original topic drops off-topic markets
        # (e.g., WTI crude oil, Elon tweet counts) before footer emission.
        if source == "polymarket" and topic:
            items = polymarket.filter_items_against_topic(topic, items)
            # --polymarket-keywords (via config): additional keyword filter
            # for ambiguous single-token topics (e.g., "Warriors" → nba,gsw).
            keywords = config.get("_polymarket_keywords") if isinstance(config, dict) else None
            if keywords:
                items = polymarket.filter_items_against_keywords(items, keywords)
        finalized[source] = items
    return finalized


def _warnings(
    items_by_source: dict[str, list[schema.SourceItem]],
    candidates: list[schema.Candidate],
    errors_by_source: dict[str, str],
) -> list[str]:
    warnings: list[str] = []
    if not candidates:
        warnings.append("No candidates survived retrieval and ranking.")
    if len(candidates) < 5:
        warnings.append("Evidence is thin for this topic.")
    top_sources = {
        source
        for candidate in candidates[:5]
        for source in schema.candidate_sources(candidate)
    }
    if len(top_sources) <= 1 and len(candidates) >= 3:
        warnings.append("Top evidence is highly concentrated in one source.")
    if errors_by_source:
        warnings.append(f"Some sources failed: {', '.join(sorted(errors_by_source))}")
    if not items_by_source:
        warnings.append("No source returned usable items.")
    return warnings


def _is_rate_limit_error(exc: Exception) -> bool:
    """Detect 429 rate-limit errors by status code or message text."""
    if hasattr(exc, "status_code") and getattr(exc, "status_code", None) == 429:
        return True
    return "429" in str(exc)


def _is_transient_error(exc: Exception) -> bool:
    """Detect 5xx server errors that are worth retrying."""
    status = getattr(exc, "status_code", None)
    if isinstance(status, int) and 500 <= status < 600:
        return True
    msg = str(exc)
    return any(code in msg for code in ("500", "502", "503", "504"))


def _run_supplemental_searches(
    *,
    topic: str,
    bundle: schema.RetrievalBundle,
    plan: schema.QueryPlan,
    config: dict[str, Any],
    depth: str,
    date_range: tuple[str, str],
    runtime: schema.ProviderRuntime,
    mock: bool,
    rate_limited_sources: set[str],
    rate_limit_lock: threading.Lock,
    x_handle: str | None = None,
    x_related: list[str] | None = None,
) -> None:
    """Phase 2: extract entities from Phase 1 results, run targeted supplemental searches."""
    if depth == "quick" or mock:
        return

    from_date, to_date = date_range

    # Convert SourceItems to dicts for entity_extract
    x_dicts = [
        {"author_handle": item.author or "", "text": item.body or ""}
        for item in bundle.items_by_source.get("x", [])
    ]
    reddit_dicts = [
        {
            "subreddit": item.container or "",
            "comment_insights": item.metadata.get("comment_insights", []),
            "top_comments": [
                {"excerpt": c.get("excerpt", c.get("text", ""))}
                for c in (item.metadata.get("top_comments") or [])
                if isinstance(c, dict)
            ],
        }
        for item in bundle.items_by_source.get("reddit", [])
    ]

    if not x_dicts and not reddit_dicts and not x_handle and not x_related:
        return

    entities = entity_extract.extract_entities(
        reddit_dicts, x_dicts,
        max_handles=3, max_subreddits=3,
    )

    handles = entities.get("x_handles", [])

    # Add explicit --x-handle if provided
    if x_handle:
        handle_clean = x_handle.lstrip("@").lower()
        if handle_clean not in [h.lower() for h in handles]:
            handles.insert(0, handle_clean)

    # Collect related handles (searched separately with lower weight)
    related_handles = []
    if x_related:
        primary_lower = x_handle.lstrip("@").lower() if x_handle else ""
        for rh in x_related:
            rh_clean = rh.lstrip("@").lower().strip()
            if rh_clean and rh_clean != primary_lower and rh_clean not in [h.lower() for h in handles]:
                related_handles.append(rh_clean)

    if not handles and not related_handles:
        return

    # Check if X is rate-limited
    if "x" in rate_limited_sources:
        return

    backend = runtime.x_search_backend or env.get_x_source(config)
    if backend != "bird":
        return  # Handle search only works with Bird CLI

    # Collect existing URLs for deduplication
    existing_urls = {
        item.url
        for items in bundle.items_by_source.values()
        for item in items
        if item.url
    }

    ranking_query = plan.subqueries[0].ranking_query if plan.subqueries else topic
    primary_label = plan.subqueries[0].label if plan.subqueries else "primary"

    # Search primary handles (full weight)
    if handles:
        try:
            raw_items = bird_x.search_handles(
                handles, topic, from_date, count_per=3,
            )
        except Exception as exc:
            print(f"[Pipeline] Phase 2 handle search failed: {exc}", file=sys.stderr)
            if not bundle.items_by_source.get("x"):
                bundle.errors_by_source["x"] = f"Phase 2 handle search: {exc}"
            raw_items = []

        if raw_items:
            normalized = _normalize_score_dedupe(
                "x", raw_items, from_date, to_date,
                freshness_mode=plan.freshness_mode,
                ranking_query=ranking_query,
            )
            # Deduplicate against Phase 1 URLs
            normalized = [item for item in normalized if item.url not in existing_urls]
            if normalized:
                bundle.add_items(primary_label, "x", normalized)
                # Update existing URLs for related-handle dedup
                for item in normalized:
                    if item.url:
                        existing_urls.add(item.url)

    # Search related handles with lower weight (0.3)
    if related_handles:
        try:
            raw_items = bird_x.search_handles(
                related_handles, topic, from_date, count_per=3,
            )
        except Exception as exc:
            print(f"[Pipeline] Phase 2 related handle search failed: {exc}", file=sys.stderr)
            raw_items = []

        if raw_items:
            normalized = _normalize_score_dedupe(
                "x", raw_items, from_date, to_date,
                freshness_mode=plan.freshness_mode,
                ranking_query=ranking_query,
            )
            # Deduplicate against all existing URLs (Phase 1 + primary handles)
            normalized = [item for item in normalized if item.url not in existing_urls]
            if normalized:
                # Use a separate subquery label with lower weight so RRF
                # scores related-handle results below primary results.
                bundle.add_items("supplemental-related", "x", normalized)
                # Register the supplemental-related label in the plan for fusion
                if not any(sq.label == "supplemental-related" for sq in plan.subqueries):
                    plan.subqueries.append(
                        schema.SubQuery(
                            label="supplemental-related",
                            search_query=", ".join(related_handles),
                            ranking_query=ranking_query,
                            sources=["x"],
                            weight=0.3,
                        )
                    )


def _retry_thin_sources(
    *,
    topic: str,
    bundle: schema.RetrievalBundle,
    plan: schema.QueryPlan,
    config: dict[str, Any],
    depth: str,
    date_range: tuple[str, str],
    runtime: schema.ProviderRuntime,
    mock: bool,
    rate_limited_sources: set[str],
    rate_limit_lock: threading.Lock,
    settings: dict[str, Any],
    web_backend: str = "auto",
    skip_sources: set[str] | None = None,
) -> None:
    """Retry sources with thin results using simplified core subject query."""
    if depth == "quick":
        return

    planned_sources: list[str] = []
    for subquery in plan.subqueries:
        for source in subquery.sources:
            if source not in planned_sources:
                planned_sources.append(source)
    _skip = skip_sources or set()
    thin_sources = [
        source
        for source in planned_sources
        if len(bundle.items_by_source.get(source, [])) < 3
        and source not in bundle.errors_by_source
        and source not in _skip
    ]

    if not thin_sources:
        return

    core = query.extract_core_subject(topic, max_words=3)
    if not core:
        return
    # Note: we intentionally do NOT skip when core == topic. For short topics
    # like "Kanye West", the 3-word core IS the topic — but the planner may
    # have sent a different (worse) query to the source. Retrying with the
    # raw core subject is still valuable.

    from_date, to_date = date_range

    # Create a retry subquery with the simplified core subject
    retry_subquery = schema.SubQuery(
        label="retry",
        search_query=core,
        ranking_query=f"What recent evidence from the last 30 days matters for {core}?",
        sources=thin_sources,
        weight=0.3,
    )

    def _retry_one_source(source: str) -> tuple[str, list[schema.SourceItem]]:
        raw_items, _artifact = _retrieve_stream(
            topic=topic,
            subquery=retry_subquery,
            source=source,
            config=config,
            depth=depth,
            date_range=date_range,
            runtime=runtime,
            mock=mock,
            rate_limited_sources=rate_limited_sources,
            rate_limit_lock=rate_limit_lock,
            web_backend=web_backend,
            raw_topic=topic,
        )
        normalized = _normalize_score_dedupe(
            source,
            raw_items,
            from_date,
            to_date,
            freshness_mode=plan.freshness_mode,
            ranking_query=retry_subquery.ranking_query,
        )
        return source, normalized[:settings["per_stream_limit"]]

    retryable = [s for s in thin_sources if s not in rate_limited_sources]

    from concurrent.futures import ThreadPoolExecutor, as_completed
    with ThreadPoolExecutor(max_workers=min(4, len(retryable) or 1)) as executor:
        futures = {executor.submit(_retry_one_source, s): s for s in retryable}
        for future in as_completed(futures):
            source = futures[future]
            try:
                source, normalized = future.result()
                existing_urls = {item.url for item in bundle.items_by_source.get(source, []) if item.url}
                new_items = [item for item in normalized if item.url not in existing_urls]

                if new_items:
                    bundle.items_by_source.setdefault(source, []).extend(new_items)
                    primary_label = plan.subqueries[0].label if plan.subqueries else "primary"
                    bundle.items_by_source_and_query.setdefault((primary_label, source), []).extend(new_items)
            except Exception as exc:
                print(f"[Pipeline] Retry failed for {source}: {type(exc).__name__}: {exc}", file=sys.stderr)


def _retrieve_stream(
    *,
    topic: str,
    subquery: schema.SubQuery,
    source: str,
    config: dict[str, Any],
    depth: str,
    date_range: tuple[str, str],
    runtime: schema.ProviderRuntime,
    mock: bool,
    rate_limited_sources: set[str] | None = None,
    rate_limit_lock: threading.Lock | None = None,
    web_backend: str = "auto",
    raw_topic: str = "",
    subreddits: list[str] | None = None,
    tiktok_hashtags: list[str] | None = None,
    tiktok_creators: list[str] | None = None,
    ig_creators: list[str] | None = None,
) -> tuple[list[dict], dict]:
    # Early exit if source was rate-limited by a sibling future
    if rate_limited_sources is not None and source in rate_limited_sources:
        return [], {}
    from_date, to_date = date_range
    if mock:
        return _mock_stream_results(source, subquery)
    if source == "grounding":
        return grounding.web_search(
            subquery.search_query, date_range, config, backend=web_backend)
    if source == "reddit":
        # Use raw_topic so expand_reddit_queries() generates diverse variants
        # from the original user topic, not the planner's narrowed search_query.
        reddit_query = raw_topic or subquery.search_query
        # Public Reddit first (free, gets comments); SC as backup
        try:
            public_results = reddit_public.search_reddit_public(
                reddit_query, from_date, to_date, depth=depth,
                subreddits=subreddits,
            )
            if public_results:
                return public_results, {}
        except Exception as exc:
            sys.stderr.write(
                f"[Reddit] Public search failed ({type(exc).__name__}: {exc})"
            )
            if not config.get("SCRAPECREATORS_API_KEY"):
                sys.stderr.write("\n")
                return [], {}
            sys.stderr.write(", using ScrapeCreators backup\n")
        # Fallback to ScrapeCreators if public returned empty or raised
        if config.get("SCRAPECREATORS_API_KEY"):
            try:
                result = reddit.search_and_enrich(
                    reddit_query,
                    from_date,
                    to_date,
                    depth=depth,
                    token=config.get("SCRAPECREATORS_API_KEY"),
                    subreddits=subreddits,
                )
                return reddit.parse_reddit_response(result), {}
            except Exception as exc:
                sys.stderr.write(
                    f"[Reddit] ScrapeCreators backup also failed "
                    f"({type(exc).__name__}: {exc})\n"
                )
        return [], {}
    if source == "x":
        backend = runtime.x_search_backend or env.get_x_source(config)
        if backend == "bird":
            result = bird_x.search_x(subquery.search_query, from_date, to_date, depth=depth)
            return bird_x.parse_bird_response(result, query=subquery.search_query), {}
        if backend == "xai":
            model = config.get("LAST30DAYS_X_MODEL") or config.get("XAI_MODEL_PIN") or providers.XAI_DEFAULT
            result = xai_x.search_x(
                config["XAI_API_KEY"],
                model,
                subquery.search_query,
                from_date,
                to_date,
                depth=depth,
            )
            return xai_x.parse_x_response(result), {}
        if backend == "xurl":
            result = xurl_x.search_x(subquery.search_query, depth=depth)
            return xurl_x.parse_x_response(result, topic=subquery.search_query), {}
        raise RuntimeError("No X backend is available.")
    if source == "youtube":
        # Use raw_topic so expand_youtube_queries() generates diverse variants
        # from the original user topic, not the planner's narrowed search_query.
        yt_query = raw_topic or subquery.search_query
        result = None
        # Try yt-dlp first, fall back to SC YouTube if it fails or isn't installed
        if which("yt-dlp"):
            try:
                result = youtube_yt.search_and_transcribe(yt_query, from_date, to_date, depth=depth)
            except Exception:
                result = None
        if (result is None or not result.get("items")) and env.is_youtube_sc_available(config):
            sc_token = config.get("SCRAPECREATORS_API_KEY", "")
            result = youtube_yt.search_youtube_sc(yt_query, from_date, to_date, depth=depth, token=sc_token)
        if result is None:
            result = {"items": []}
        # Enrich top videos with comments when SC key is available
        items = youtube_yt.parse_youtube_response(result)
        if items and env.is_youtube_comments_available(config):
            sc_token = config.get("SCRAPECREATORS_API_KEY", "")
            youtube_yt.enrich_with_comments(items, token=sc_token)
        return items, {}
    if source == "tiktok":
        # Use raw_topic so expand_tiktok_queries() generates diverse variants
        # from the original user topic, not the planner's narrowed search_query.
        tiktok_query = raw_topic or subquery.search_query
        result = tiktok.search_and_enrich(
            tiktok_query,
            from_date,
            to_date,
            depth=depth,
            token=env.get_tiktok_token(config),
            hashtags=tiktok_hashtags,
            creators=tiktok_creators,
        )
        items = tiktok.parse_tiktok_response(result)
        if items and env.is_tiktok_comments_available(config):
            sc_token = config.get("SCRAPECREATORS_API_KEY", "")
            tiktok.enrich_with_comments(items, token=sc_token)
        return items, {}
    if source == "instagram":
        # Use raw_topic so expand_instagram_queries() generates diverse variants
        # from the original user topic, not the planner's narrowed search_query.
        ig_query = raw_topic or subquery.search_query
        result = instagram.search_and_enrich(
            ig_query,
            from_date,
            to_date,
            depth=depth,
            token=env.get_instagram_token(config),
            ig_creators=ig_creators,
        )
        return instagram.parse_instagram_response(result), {}
    if source == "hackernews":
        result = hackernews.search_hackernews(subquery.search_query, from_date, to_date, depth=depth)
        return hackernews.parse_hackernews_response(result, query=subquery.search_query), {}
    if source == "bluesky":
        result = bluesky.search_bluesky(subquery.search_query, from_date, to_date, depth=depth, config=config)
        return bluesky.parse_bluesky_response(result), {}
    if source == "threads":
        result = threads.search_threads(
            subquery.search_query, from_date, to_date,
            depth=depth,
            token=config.get("SCRAPECREATORS_API_KEY"),
        )
        return threads.parse_threads_response(result), {}
    if source == "truthsocial":
        result = truthsocial.search_truthsocial(subquery.search_query, from_date, to_date, depth=depth, config=config)
        return truthsocial.parse_truthsocial_response(result), {}
    if source == "polymarket":
        result = polymarket.search_polymarket(subquery.search_query, from_date, to_date, depth=depth)
        return polymarket.parse_polymarket_response(result, topic=subquery.search_query), {}
    if source == "github":
        result = github.search_github(subquery.search_query, from_date, to_date, depth=depth, token=config.get("GITHUB_TOKEN"))
        return result, {}
    if source == "pinterest":
        result = pinterest.search_pinterest(
            subquery.search_query, from_date, to_date,
            depth=depth,
            token=env.get_pinterest_token(config),
        )
        return pinterest.parse_pinterest_response(result), {}
    if source == "xiaohongshu":
        return xiaohongshu_api.search_feeds(
            subquery.search_query,
            from_date,
            to_date,
            env.get_xiaohongshu_api_base(config),
            depth=depth,
        ), {}
    if source == "perplexity":
        return perplexity.search(subquery.search_query, date_range, config, deep=config.get("_deep_research", False))
    if source == "xquik":
        result = xquik.search_xquik(
            subquery.search_query, from_date, to_date,
            depth=depth,
            token=env.get_xquik_token(config),
        )
        return xquik.parse_xquik_response(result), {}
    raise RuntimeError(f"Unsupported source: {source}")


def _google_key(config: dict[str, Any]) -> str | None:
    return config.get("GOOGLE_API_KEY") or config.get("GEMINI_API_KEY") or config.get("GOOGLE_GENAI_API_KEY")




def _mock_stream_results(source: str, subquery: schema.SubQuery) -> tuple[list[dict], dict]:
    payloads = {
        "reddit": [
            {
                "id": "R1",
                "title": f"{subquery.search_query} discussion thread",
                "url": "https://reddit.com/r/example/comments/1",
                "subreddit": "example",
                "date": dates.get_date_range(5)[0],
                "engagement": {"score": 120, "num_comments": 48, "upvote_ratio": 0.91},
                "selftext": f"Community discussion about {subquery.search_query}.",
                "top_comments": [{"excerpt": "Strong firsthand feedback from users."}],
                "relevance": 0.82,
                "why_relevant": "Mock Reddit result",
            }
        ],
        "x": [
            {
                "id": "X1",
                "text": f"People on X are discussing {subquery.search_query} right now.",
                "url": "https://x.com/example/status/1",
                "author_handle": "example",
                "date": dates.get_date_range(2)[0],
                "engagement": {"likes": 200, "reposts": 35, "replies": 18, "quotes": 4},
                "relevance": 0.79,
                "why_relevant": "Mock X result",
            }
        ],
        "grounding": [
            {
                "id": "WB1",
                "title": f"{subquery.search_query} article",
                "url": "https://example.com/article",
                "source_domain": "example.com",
                "snippet": f"Recent web reporting about {subquery.search_query}.",
                "date": dates.get_date_range(7)[0],
                "relevance": 0.88,
                "why_relevant": "Brave web search",
            }
        ],
    }
    if source == "grounding":
        return payloads.get(source, []), {
            "label": subquery.label,
            "mock": True,
            "webSearchQueries": [subquery.search_query],
            "resultCount": 1,
        }
    return payloads.get(source, []), {}
