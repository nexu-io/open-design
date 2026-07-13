/**
 * Critique Theater 循环工程 — 类型定义与契约
 */

// ============================================================================
// 循环配置
// ============================================================================

export const LOOP_STRATEGIES = ['converge', 'score_only', 'mustFix_only'] as const;
export type LoopStrategy = (typeof LOOP_STRATEGIES)[number];

export interface CritiqueLoopConfig {
  enabled: boolean;
  maxIterations: number;
  loopStrategy: LoopStrategy;
  fixTimeoutMs: number;
  loopTotalTimeoutMs: number;
  feedbackAggregation: 'cumulative' | 'last_round';
}

export function defaultCritiqueLoopConfig(): CritiqueLoopConfig {
  return {
    enabled: false,
    maxIterations: 5,
    loopStrategy: 'converge',
    fixTimeoutMs: 300_000,
    loopTotalTimeoutMs: 1_800_000,
    feedbackAggregation: 'cumulative',
  };
}

// ============================================================================
// 扩展 CritiqueConfig（需合并到 contracts/critique.ts）
// ============================================================================

declare module '@open-design/contracts/critique' {
  interface CritiqueConfig {
    loop?: CritiqueLoopConfig;
  }
}

// ============================================================================
// 循环事件
// ============================================================================

export type LoopEvent =
  | { type: 'loop_started'; projectId: string; maxIterations: number }
  | { type: 'loop_iteration_start'; projectId: string; iteration: number; totalMaxIterations: number; hasPriorFeedback: boolean }
  | { type: 'loop_fix_started'; projectId: string; iteration: number; mustFixCount: number }
  | { type: 'loop_fix_completed'; projectId: string; iteration: number; fixDurationMs: number }
  | { type: 'loop_fix_failed'; projectId: string; iteration: number; error: string }
  | { type: 'loop_iteration_end'; projectId: string; iteration: number; status: string; composite: number; converged: boolean }
  | { type: 'loop_converged'; projectId: string; totalIterations: number; finalComposite: number; totalDurationMs: number }
  | { type: 'loop_exhausted'; projectId: string; totalIterations: number; bestComposite: number | null }
  | { type: 'loop_aborted'; projectId: string; iteration: number; reason: string };

const LOOP_EVENT_SSE: Record<LoopEvent['type'], string> = {
  loop_started: 'critique.loop.started',
  loop_iteration_start: 'critique.loop.iteration_start',
  loop_fix_started: 'critique.loop.fix_started',
  loop_fix_completed: 'critique.loop.fix_completed',
  loop_fix_failed: 'critique.loop.fix_failed',
  loop_iteration_end: 'critique.loop.iteration_end',
  loop_converged: 'critique.loop.converged',
  loop_exhausted: 'critique.loop.exhausted',
  loop_aborted: 'critique.loop.aborted',
};

export function loopEventToSse(event: LoopEvent): { event: string; data: LoopEvent } {
  return { event: LOOP_EVENT_SSE[event.type], data: event };
}
