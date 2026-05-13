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
 */

import type { PanelEvent } from '@open-design/contracts/critique';

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

export type ConformanceOutcome =
  | { kind: 'shipped'; round: number; composite: number; events: PanelEvent[] }
  | { kind: 'degraded'; reason: 'malformed_block' | 'oversize_block' | 'missing_artifact'; events: PanelEvent[] }
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
      if (event.type === 'ship') {
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
      markDegraded(params.adapterId, reason, ADAPTER_DEGRADED_DEFAULT_TTL_MS, 'conformance');
      return { kind: 'degraded', reason, events };
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
