/**
 * Adapter conformance harness (Phase 10).
 *
 * The plan asks the nightly cycle to feed every production adapter the
 * same 10 brief templates and classify each run as `shipped`, `degraded`,
 * or `failed`. The harness sits one level below that schedule: it knows
 * how to take an `AsyncIterable<string>` (everything a real adapter
 * exposes is some flavour of that, whether it's a child process's stdout
 * or an in-process stub) plus the parser config and produce a
 * `ConformanceOutcome`. The synthetic fixtures from
 * `__fixtures__/adapters/` are the deterministic inputs the test
 * harness uses; production code in `runOrchestrator` already covers
 * the live path, so this helper exists to give CI a way to validate
 * end-to-end shape without depending on a network model.
 *
 * The plan's retry budget (one retry per degraded template, two
 * consecutive degraded counts as one failure, ≥ 90% shipped + ≥ 95%
 * clean-parse thresholds) is intentionally NOT implemented here.
 * Those policies live in the scheduler that calls this helper N times
 * across the adapter × template matrix; keeping the harness scoped to
 * a single run makes it testable in isolation.
 *
 * Classification rules (each row that matches wins, top to bottom):
 *
 *   1. The parser threw a MalformedBlockError / OversizeBlockError /
 *      MissingArtifactError → degraded with that reason.
 *   2. The adapter source threw any other error → failed
 *      (`unexpected_error`).
 *   3. The parser yielded a `parser_warning` event anywhere in the
 *      stream → degraded (`parser_warning`). The parser tolerated a
 *      soft violation (weak debate, unknown role, clamped score,
 *      composite mismatch, duplicate ship) but the conformance gate
 *      treats any of those as a "this adapter is not protocol-clean"
 *      signal (lefarcen P2 on PR #1316).
 *   4. The parser yielded a `ship` event but the cast declared by
 *      `run_started` did not all emit `panelist_close` → degraded
 *      (`incomplete_panel`). The parser only enforces the round-1
 *      designer-artifact invariant; the harness is what catches a
 *      ship that skipped panelists or never scored them (codex P2 on
 *      PR #1316).
 *   5. The parser yielded a `ship` event with a complete panel and no
 *      parser warnings → shipped.
 *   6. The stream ended without a `ship` event → failed (`no_ship`).
 */

import type { DegradedReason, PanelEvent, PanelistRole } from '@open-design/contracts/critique';

import { parseCritiqueStream, type ShipArtifactPayload } from './parser.js';
import {
  MalformedBlockError,
  MissingArtifactError,
  OversizeBlockError,
} from './errors.js';
import {
  ADAPTER_DEGRADED_DEFAULT_TTL_MS,
  markDegraded,
} from './adapter-degraded.js';

/**
 * Local degraded reasons. `'parser_warning'` and `'incomplete_panel'`
 * are conformance-harness-only: they describe a stream the contracts
 * `DegradedReason` does not currently model as a discrete value. The
 * adapter-degraded registry stores the closest contracts reason via
 * `toContractReason` below, so a downstream listing of degraded
 * adapters still uses the wire-shape enum.
 */
export type ConformanceDegradedReason =
  | 'malformed_block'
  | 'oversize_block'
  | 'missing_artifact'
  | 'parser_warning'
  | 'incomplete_panel';

export type ConformanceOutcome =
  | { kind: 'shipped'; round: number; composite: number; events: PanelEvent[] }
  | { kind: 'degraded'; reason: ConformanceDegradedReason; events: PanelEvent[] }
  | { kind: 'failed'; cause: 'no_ship' | 'unexpected_error'; events: PanelEvent[]; error?: string };

export interface RunConformanceParams {
  adapterId: string;
  runId: string;
  source: AsyncIterable<string>;
  parserMaxBlockBytes?: number;
  projectId?: string;
  artifactId?: string;
}

/**
 * Map a local conformance reason back to a contracts `DegradedReason`
 * so the adapter-degraded registry stays consistent with the wire
 * enum. Parser warnings collapse to `malformed_block` (the closest
 * "the stream is not well-formed" reason) and an incomplete panel
 * collapses to `missing_artifact` (the closest "required pieces
 * absent" reason).
 */
function toContractReason(r: ConformanceDegradedReason): DegradedReason {
  switch (r) {
    case 'parser_warning':   return 'malformed_block';
    case 'incomplete_panel': return 'missing_artifact';
    default:                 return r;
  }
}

/**
 * Run a synthetic (or recorded) adapter source through the parser and
 * classify the outcome. Side-effect: when the outcome is `degraded`,
 * the adapter is marked degraded for the default 24h TTL via
 * `markDegraded`. The caller can flip the policy by calling
 * `clearDegraded(adapterId)` afterwards if it wants to gate the mark
 * on a "two consecutive failures" rule.
 */
export async function runAdapterConformance(
  params: RunConformanceParams,
): Promise<ConformanceOutcome> {
  const events: PanelEvent[] = [];
  let shipPayload: ShipArtifactPayload | null = null;
  let parserWarningSeen = false;
  let castRoles: PanelistRole[] | null = null;
  const closedRoles = new Set<string>();

  try {
    for await (const event of parseCritiqueStream(params.source, {
      runId: params.runId,
      adapter: params.adapterId,
      parserMaxBlockBytes: params.parserMaxBlockBytes ?? 262_144,
      projectId: params.projectId ?? 'conformance',
      artifactId: params.artifactId ?? `conformance-${params.runId}`,
      onArtifact: (payload) => {
        shipPayload = payload;
      },
    })) {
      events.push(event);
      if (event.type === 'run_started') {
        castRoles = event.cast;
      } else if (event.type === 'panelist_close') {
        closedRoles.add(event.role);
      } else if (event.type === 'parser_warning') {
        parserWarningSeen = true;
      } else if (event.type === 'ship') {
        // Tightening over "ship event seen = shipped": any earlier
        // parser_warning makes the stream non-clean (lefarcen P2);
        // an incomplete cast makes the ship premature (codex P2).
        if (parserWarningSeen) {
          return mark(params.adapterId, 'parser_warning', events);
        }
        const expected = castRoles ?? ['designer', 'critic', 'brand', 'a11y', 'copy'];
        const missing = expected.filter((r) => !closedRoles.has(r));
        if (missing.length > 0) {
          return mark(params.adapterId, 'incomplete_panel', events);
        }
        return {
          kind: 'shipped',
          round: event.round,
          composite: event.composite,
          events,
        };
      }
    }
  } catch (err) {
    const reason
      = err instanceof MalformedBlockError ? 'malformed_block'
      : err instanceof OversizeBlockError ? 'oversize_block'
      : err instanceof MissingArtifactError ? 'missing_artifact'
      : null;
    if (reason) {
      return mark(params.adapterId, reason, events);
    }
    return {
      kind: 'failed',
      cause: 'unexpected_error',
      events,
      error: err instanceof Error ? err.message : String(err),
    };
  }
  // Silence the unused-locals lint: shipPayload is filled by the
  // onArtifact callback but only the parser-yielded SHIP event drives
  // routing here, so the body is informational for callers that need
  // it later (e.g. a follow-up that asserts artifact bytes round-trip).
  void shipPayload;

  return { kind: 'failed', cause: 'no_ship', events };
}

function mark(
  adapterId: string,
  reason: ConformanceDegradedReason,
  events: PanelEvent[],
): ConformanceOutcome {
  markDegraded(
    adapterId,
    toContractReason(reason),
    ADAPTER_DEGRADED_DEFAULT_TTL_MS,
    'conformance',
  );
  return { kind: 'degraded', reason, events };
}
