import { type CritiqueConfig } from './critique';

// ---------------------------------------------------------------------------
// Shared critique loop type contracts
//
// These types define the shape of the critique loop configuration shared
// between the daemon and web layers. The daemon's runtime defaults
// (defaultCritiqueLoopConfig) live in daemon/src/critique/loop-types.ts
// and re-export these shared types.
// ---------------------------------------------------------------------------

export type LoopStrategy = 'converge' | 'score_only' | 'mustFix_only';
export const LOOP_STRATEGIES: readonly LoopStrategy[] = ['converge', 'score_only', 'mustFix_only'];

export interface CritiqueLoopConfig {
  enabled: boolean;
  maxIterations: number;
  loopStrategy: LoopStrategy;
  fixTimeoutMs: number;
  loopTotalTimeoutMs: number;
  feedbackAggregation: 'cumulative' | 'last_round';
}

/**
 * Full critique configuration including the loop sub-config.
 * The daemon loads this from environment variables via loadCritiqueConfigFromEnv
 * and passes it to the orchestrator.
 */
export interface ExtendedCritiqueConfig extends CritiqueConfig {
  loop: CritiqueLoopConfig;
}
