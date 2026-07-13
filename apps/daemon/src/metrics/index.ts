/**
 * Critique Theater Prometheus registry (Phase 12).
 *
 * Nine series, all under the `open_design_critique_*` namespace, scoped
 * to the default `prom-client` registry so a single `/api/metrics`
 * scrape returns everything the dashboard panels query.
 *
 * Label cardinality is bounded:
 *   - `adapter` is the agent id, capped at installation-time discovery
 *   - `skill` is the SKILL.md id, capped at the skills registry size
 *   - `panelist` / `dim` are closed enums (`PANELIST_ROLES`, dimension
 *     names from the parser contract)
 *   - `reason` / `cause` / `kind` are closed enums in
 *     `packages/contracts/src/critique.ts`
 *   - `round` is small-integer (typical 1-3)
 *   - `status` and `version` are closed enums / small integers
 *
 * Histogram buckets follow `specs/current/critique-theater.md` §
 * Observability and are intentionally explicit so an operator can tune
 * them after the first 1000 runs without code changes.
 *
 * No call signed off on a particular skill label being globally
 * available; orchestrator call sites pass `skill ?? 'unknown'` when the
 * spawn handler did not thread the skill id. Defaulting to 'unknown'
 * keeps the series shape stable while threading the label is a
 * separate fix.
 */

import {
  Counter,
  Gauge,
  Histogram,
  register,
} from 'prom-client';

export const critiqueRunsTotal = new Counter({
  name: 'open_design_critique_runs_total',
  help: 'Total Critique Theater runs that reached a terminal phase.',
  labelNames: ['status', 'adapter', 'skill'] as const,
  registers: [register],
});

export const critiqueRoundsTotal = new Counter({
  name: 'open_design_critique_rounds_total',
  help: 'Total round_end events processed across all runs.',
  labelNames: ['adapter', 'skill'] as const,
  registers: [register],
});

export const critiqueRoundDurationMs = new Histogram({
  name: 'open_design_critique_round_duration_ms',
  help: 'Wall-clock duration of a single round, in milliseconds.',
  labelNames: ['adapter', 'skill', 'round'] as const,
  buckets: [100, 250, 500, 1000, 2500, 5000, 10000, 30000, 60000],
  registers: [register],
});

export const critiqueCompositeScore = new Histogram({
  name: 'open_design_critique_composite_score',
  help: 'Composite score reported by round_end events.',
  labelNames: ['adapter', 'skill'] as const,
  buckets: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  registers: [register],
});

export const critiqueMustFixTotal = new Counter({
  name: 'open_design_critique_must_fix_total',
  help: 'Total panelist_must_fix events emitted across all runs.',
  labelNames: ['panelist', 'dim', 'adapter', 'skill'] as const,
  registers: [register],
});

export const critiqueDegradedTotal = new Counter({
  name: 'open_design_critique_degraded_total',
  help: 'Total times an adapter was marked degraded (TTL-bounded).',
  labelNames: ['reason', 'adapter'] as const,
  registers: [register],
});

export const critiqueInterruptedTotal = new Counter({
  name: 'open_design_critique_interrupted_total',
  help: 'Total runs terminated via the user interrupt path.',
  labelNames: ['adapter'] as const,
  registers: [register],
});

export const critiqueParserErrorsTotal = new Counter({
  name: 'open_design_critique_parser_errors_total',
  help: 'Total parser_warning events surfaced from the SSE stream.',
  labelNames: ['kind', 'adapter'] as const,
  registers: [register],
});

export const critiqueProtocolVersion = new Gauge({
  name: 'open_design_critique_protocol_version',
  help: 'Highest protocolVersion observed in a run_started frame.',
  labelNames: ['version'] as const,
  registers: [register],
});

/**
 * Exposed to the `/api/metrics` route. Returns the full Prometheus
 * exposition format as a single string with the correct content type
 * available on `register.contentType`.
 */
export async function getCritiqueMetrics(): Promise<string> {
  return register.metrics();
}

export { register };

/**
 * Test-only: wipe the default registry so vitest cases can assert
 * series shape without leakage from a prior `runOrchestrator` call.
 * Production code never reaches this; the function name is deliberate
 * so a grep audit flags any accidental production caller.
 */
export function __resetCritiqueMetricsForTests(): void {
  critiqueRunsTotal.reset();
  critiqueRoundsTotal.reset();
  critiqueRoundDurationMs.reset();
  critiqueCompositeScore.reset();
  critiqueMustFixTotal.reset();
  critiqueDegradedTotal.reset();
  critiqueInterruptedTotal.reset();
  critiqueParserErrorsTotal.reset();
  critiqueProtocolVersion.reset();
}
