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
 *      stream (before OR after `ship`) → degraded (`parser_warning`).
 *      The parser tolerated a soft violation (weak debate, unknown
 *      role, clamped score, composite mismatch, duplicate ship) but
 *      the conformance gate treats any of those as a "this adapter
 *      is not protocol-clean" signal (lefarcen P2 on PR #1316,
 *      tightened to post-ship warnings in lefarcen P2 on PR #1316
 *      follow-up: the parser emits `duplicate_ship` AFTER the first
 *      ship event yields, so the harness must drain the rest of the
 *      stream before classifying instead of returning at first ship).
 *   4. The parser yielded a `ship` event but the cast declared by
 *      `run_started` did not all emit `panelist_close` IN THE
 *      SHIPPING ROUND → degraded (`incomplete_panel`). The parser
 *      only enforces the round-1 designer-artifact invariant; the
 *      harness is what catches a ship that skipped panelists or
 *      reused earlier-round closes to fake a complete cast (codex
 *      P2 on PR #1316; per-round bucketing added in lefarcen P2 on
 *      PR #1316 follow-up).
 *   5. The parser yielded a `ship` event with a complete panel and no
 *      parser warnings → shipped.
 *   6. The stream ended without a `ship` event → failed (`no_ship`).
 */

import type { DegradedReason, PanelEvent, PanelistRole } from '@open-design/contracts/critique';
import { CRITIQUE_PROTOCOL_VERSION } from '@open-design/contracts/critique';

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
  | 'incomplete_panel'
  | 'protocol_version_mismatch';

export type ConformanceOutcome =
  | {
      kind: 'shipped';
      round: number;
      composite: number;
      events: PanelEvent[];
      /**
       * Artifact bytes the parser handed back via the `onArtifact`
       * callback for the SHIP event. Callers that want to pin
       * MIME / byte-length / hash on the nightly cycle read this
       * directly. Always set on `shipped` because the parser rejects
       * a missing-artifact SHIP with `MissingArtifactError` upstream
       * (lefarcen P2 on PR #1317: previously captured-but-never-
       * returned, masked by a `void shipPayload` lint trick).
       */
      artifact: ShipArtifactPayload | null;
    }
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
  // Per-round closed-roles map keyed by `round`. Built incrementally
  // as panelist_close events arrive and consulted at SHIP time so the
  // shipping round must independently satisfy the full cast. A round
  // that closes only some panelists cannot piggy-back on an earlier
  // round's closes (lefarcen P2 on PR #1316 follow-up).
  const closedRolesByRound = new Map<number, Set<string>>();
  // Captured SHIP event details. Set on the first SHIP the parser
  // yields. The loop continues draining the stream so any
  // `parser_warning` that arrives AFTER the ship (notably the
  // `duplicate_ship` kind, which the parser emits when it sees a
  // second `<SHIP>` block) still flips the run to degraded
  // (lefarcen P2 on PR #1316 follow-up).
  let shipEvent: Extract<PanelEvent, { type: 'ship' }> | null = null;

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
        // Codex P2 on PR #1485: a `run_started` carrying a non-current
        // protocol version cannot be routed safely. The parser does not
        // know which fields a future protocol revision adds or drops, so
        // even a valid-looking SHIP would be misinterpreted. Reject the
        // adapter as degraded with `protocol_version_mismatch` the
        // moment we see the mismatch; this is the same reason value
        // the contracts package already lists in DEGRADED_REASONS.
        if (event.protocolVersion !== CRITIQUE_PROTOCOL_VERSION) {
          markDegraded(
            params.adapterId,
            'protocol_version_mismatch',
            ADAPTER_DEGRADED_DEFAULT_TTL_MS,
            'conformance',
          );
          return { kind: 'degraded', reason: 'protocol_version_mismatch', events };
        }
        castRoles = event.cast;
      } else if (event.type === 'panelist_close') {
        let bucket = closedRolesByRound.get(event.round);
        if (!bucket) {
          bucket = new Set<string>();
          closedRolesByRound.set(event.round, bucket);
        }
        bucket.add(event.role);
      } else if (event.type === 'parser_warning') {
        parserWarningSeen = true;
      } else if (event.type === 'ship' && shipEvent === null) {
        // Capture the first ship but keep iterating so a later
        // `parser_warning` (e.g. duplicate_ship) still tightens the
        // classification to degraded.
        shipEvent = event;
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

  // Rule 3 (parser_warning anywhere → degraded) is checked BEFORE rule
  // 6 (no_ship → failed) to preserve the docstring's top-to-bottom
  // priority: a stream that emits a `parser_warning` and then dies
  // without a `SHIP` (adapter crash, EOF, run-out-of-rounds) is
  // protocol-degraded, not protocol-clean-but-incomplete. Without this
  // ordering, an adapter emitting a clean degraded signal stays
  // UNMARKED in the registry while one with a clean SHIP after a late
  // warning gets the 24h mark, exactly opposite of what the docstring
  // promises and what the rollout gate consumes downstream (PerishCode
  // P3 on PR #1317).
  if (parserWarningSeen) {
    return mark(params.adapterId, 'parser_warning', events);
  }

  if (shipEvent === null) {
    return { kind: 'failed', cause: 'no_ship', events };
  }

  const expected = castRoles ?? ['designer', 'critic', 'brand', 'a11y', 'copy'];
  const shippingRoundClosed
    = closedRolesByRound.get(shipEvent.round) ?? new Set<string>();
  const missing = expected.filter((r) => !shippingRoundClosed.has(r));
  if (missing.length > 0) {
    return mark(params.adapterId, 'incomplete_panel', events);
  }

  return {
    kind: 'shipped',
    round: shipEvent.round,
    composite: shipEvent.composite,
    events,
    artifact: shipPayload,
  };
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
