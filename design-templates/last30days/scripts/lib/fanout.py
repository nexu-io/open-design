"""Parallel multi-entity fan-out for the --competitors flag.

The orchestrator accepts a `main_runner()` for the topic and a
`competitor_runner(entity)` for each peer. It parallelizes their execution
via a `ThreadPoolExecutor` and collects per-entity Reports. Per-entity
failures are logged and dropped; the run survives as long as the main topic
plus at least one competitor succeed.

This module owns no business logic about pipeline arguments — the caller
(scripts/last30days.py main) builds the closures with the appropriate
config, depth, and overrides for each entity.
"""

from __future__ import annotations

import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Callable

from . import schema

# Sub-runs hit the same upstream APIs as the main topic. Cap parallelism so a
# 6-way fan-out does not stampede a single backend's rate limit.
MAX_PARALLEL_SUBRUNS = 6


def _log(msg: str) -> None:
    print(f"[Fanout] {msg}", file=sys.stderr)


def run_competitor_fanout(
    *,
    main_topic: str,
    main_runner: Callable[[], schema.Report],
    competitors: list[str],
    competitor_runner: Callable[[str], schema.Report],
) -> list[tuple[str, schema.Report]]:
    """Run main + competitor pipelines in parallel; return surviving reports.

    Args:
        main_topic: Display label for the user's primary topic.
        main_runner: Zero-arg callable returning the main topic's Report.
        competitors: Ordered list of competitor entity names.
        competitor_runner: Callable(entity_name) -> Report for each peer.

    Returns:
        Ordered list of (entity_name, Report) tuples for runs that succeeded.
        Empty list if every run raised; the caller decides how to surface
        partial-failure modes.
    """
    if not competitors:
        report = main_runner()
        return [(main_topic, report)]

    workers = min(len(competitors) + 1, MAX_PARALLEL_SUBRUNS)

    def _run_one(label: str, fn: Callable[[], schema.Report]) -> tuple[str, schema.Report | None, Exception | None]:
        try:
            return label, fn(), None
        except Exception as exc:
            return label, None, exc

    submissions: list[tuple[str, Callable[[], schema.Report]]] = [
        (main_topic, main_runner),
    ]
    for entity in competitors:
        submissions.append((entity, lambda e=entity: competitor_runner(e)))

    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {
            executor.submit(_run_one, label, fn): label
            for label, fn in submissions
        }
        results: dict[str, schema.Report] = {}
        for future in as_completed(futures):
            label, report, exc = future.result()
            if exc is not None:
                _log(f"Sub-run failed for {label!r}: {type(exc).__name__}: {exc}")
                continue
            assert report is not None
            results[label] = report

    # Preserve the original submission order rather than completion order so
    # the comparison render is deterministic across runs.
    return [(label, results[label]) for label, _ in submissions if label in results]
