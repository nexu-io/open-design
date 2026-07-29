// Re-export shared loop type contracts so the daemon and any consumer
// that imports from ./critique/loop-types.js gets the canonical types
// from @open-design/contracts.
export type {
  LoopStrategy,
  CritiqueLoopConfig,
  ExtendedCritiqueConfig,
} from '@open-design/contracts/critique-loop';
export { LOOP_STRATEGIES } from '@open-design/contracts/critique-loop';

// ---------------------------------------------------------------------------
// Daemon-side runtime defaults and SSE transport helpers
// ---------------------------------------------------------------------------

export const DEFAULT_ITERATION_CAP = 5;

export function defaultCritiqueLoopConfig(): import('@open-design/contracts/critique-loop').CritiqueLoopConfig {
  return {
    enabled: false,
    maxIterations: DEFAULT_ITERATION_CAP,
    loopStrategy: 'converge',
    fixTimeoutMs: 300_000,
    loopTotalTimeoutMs: 600_000,
    feedbackAggregation: 'cumulative',
  };
}

// ---------------------------------------------------------------------------
// Critique loop SSE event types
// ---------------------------------------------------------------------------

export type LoopEventType =
  | 'loop_started'
  | 'loop_aborted'
  | 'loop_iteration_start'
  | 'loop_iteration_end'
  | 'loop_converged'
  | 'loop_exhausted';

export interface LoopEvent {
  type: LoopEventType;
  projectId: string;
  [key: string]: unknown;
}

/**
 * Convert a loop engine event to an SSE transport object compatible with
 * the CritiqueSseBus emit interface. The emit callback expects
 * `{ event: string; data: unknown }`.
 */
export function loopEventToSse(event: LoopEvent): { event: string; data: unknown } {
  return { event: event.type, data: event };
}
