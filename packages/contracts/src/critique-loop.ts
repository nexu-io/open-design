/**
 * Critique Theater — 循环工程 (Loop Engineering) 事件与配置类型扩展
 *
 * 定义设计评审团自动修复循环的所有事件类型、配置接口和 SSE 传输映射。
 * 此文件应合并到 packages/contracts/src/critique.ts 中。
 *
 * @see apps/daemon/src/critique/loop-engine.ts
 */

// ============================================================================
// 循环配置
// ============================================================================

/**
 * 循环策略
 * - 'converge': 持续循环直到综合得分达标且无 mustFix（默认）
 * - 'score_only': 仅根据综合得分判断（忽略 mustFix）
 * - 'mustFix_only': 仅根据 mustFix 判断（忽略得分阈值）
 */
export const LOOP_STRATEGIES = ['converge', 'score_only', 'mustFix_only'] as const;
export type LoopStrategy = (typeof LOOP_STRATEGIES)[number];

/**
 * Critique Theater 循环配置
 */
export interface CritiqueLoopConfig {
  /** 是否启用自动修复循环 */
  enabled: boolean;

  /** 最大循环迭代次数（≥1） */
  maxIterations: number;

  /** 循环策略 */
  loopStrategy: LoopStrategy;

  /** 单次修复超时 (ms) */
  fixTimeoutMs: number;

  /** 循环总超时 (ms)，0 表示不限制 */
  loopTotalTimeoutMs: number;

  /**
   * 反馈聚合策略
   * - 'cumulative': 累积所有历史反馈
   * - 'last_round': 仅传递最近一轮的反馈
   */
  feedbackAggregation: 'cumulative' | 'last_round';
}

/**
 * 默认循环配置
 */
export function defaultCritiqueLoopConfig(): CritiqueLoopConfig {
  return {
    enabled: false,
    maxIterations: 5,
    loopStrategy: 'converge',
    fixTimeoutMs: 300_000, // 5 分钟
    loopTotalTimeoutMs: 1_800_000, // 30 分钟
    feedbackAggregation: 'cumulative',
  };
}

// ============================================================================
// 循环事件类型
// ============================================================================

/**
 * 循环生命周期事件（补充 PanelEvent）
 */
export type LoopEvent =
  | LoopStartedEvent
  | LoopIterationStartEvent
  | LoopFixStartedEvent
  | LoopFixCompletedEvent
  | LoopFixFailedEvent
  | LoopIterationEndEvent
  | LoopConvergedEvent
  | LoopExhaustedEvent
  | LoopAbortedEvent;

/** 循环开始 */
export interface LoopStartedEvent {
  type: 'loop_started';
  projectId: string;
  maxIterations: number;
}

/** 单次迭代开始 */
export interface LoopIterationStartEvent {
  type: 'loop_iteration_start';
  projectId: string;
  /** 当前迭代次数 (1-based) */
  iteration: number;
  /** 最大迭代次数 */
  totalMaxIterations: number;
  /** 是否有上一轮的反馈 */
  hasPriorFeedback: boolean;
}

/** 修复阶段开始 */
export interface LoopFixStartedEvent {
  type: 'loop_fix_started';
  projectId: string;
  iteration: number;
  /** mustFix 项数量 */
  mustFixCount: number;
}

/** 修复阶段完成 */
export interface LoopFixCompletedEvent {
  type: 'loop_fix_completed';
  projectId: string;
  iteration: number;
  /** 修复耗时 (ms) */
  fixDurationMs: number;
}

/** 修复阶段失败 */
export interface LoopFixFailedEvent {
  type: 'loop_fix_failed';
  projectId: string;
  iteration: number;
  error: string;
}

/** 单次迭代结束（评审完成） */
export interface LoopIterationEndEvent {
  type: 'loop_iteration_end';
  projectId: string;
  iteration: number;
  /** 本轮评审最终状态 */
  status: string;
  /** 综合得分 */
  composite: number;
  /** 是否收敛 */
  converged: boolean;
}

/** 循环收敛 —— 达到评审团标准 */
export interface LoopConvergedEvent {
  type: 'loop_converged';
  projectId: string;
  /** 达到标准时的迭代次数 */
  totalIterations: number;
  /** 最终综合得分 */
  finalComposite: number;
  /** 总耗时 (ms) */
  totalDurationMs: number;
}

/** 循环耗尽 —— 达到最大迭代次数仍未达标 */
export interface LoopExhaustedEvent {
  type: 'loop_exhausted';
  projectId: string;
  totalIterations: number;
  /** 最佳综合得分 */
  bestComposite: number | null;
}

/** 循环中断 */
export interface LoopAbortedEvent {
  type: 'loop_aborted';
  projectId: string;
  iteration: number;
  reason: string;
}

// ============================================================================
// SSE 传输映射
// ============================================================================

/**
 * 循环事件名到 SSE 事件名的映射
 */
const LOOP_EVENT_TO_SSE: Record<LoopEvent['type'], `critique.loop.${string}`> = {
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

/**
 * SSE 传输事件接口
 */
interface SseTransportEvent<Name extends string, Payload> {
  id?: string;
  event: Name;
  data: Payload;
}

/** 所有循环 SSE 事件联合类型 */
export type CritiqueLoopSseEvent = {
  [K in LoopEvent['type']]: SseTransportEvent<
    (typeof LOOP_EVENT_TO_SSE)[K],
    Extract<LoopEvent, { type: K }>
  >;
}[LoopEvent['type']];

/**
 * 将 LoopEvent 转换为 SSE 传输事件
 */
export function loopEventToSse(event: LoopEvent): CritiqueLoopSseEvent {
  const eventName = LOOP_EVENT_TO_SSE[event.type];
  return {
    event: eventName,
    data: event,
  } as CritiqueLoopSseEvent;
}

// ============================================================================
// 扩展 CritiqueConfig（需要合并到的接口）
// ============================================================================

/**
 * CritiqueConfig 扩展字段 —— 循环工程
 *
 * 这些字段应合并到 packages/contracts/src/critique.ts 的 CritiqueConfig 接口中：
 *
 * ```ts
 * export interface CritiqueConfig {
 *   // ... 现有字段 ...
 *   /** 循环工程配置 *\/
 *   loop: CritiqueLoopConfig;
 * }
 * ```
 */

// ============================================================================
// 循环持久化表结构（需要添加到 SQLite schema）
// ============================================================================

/**
 * critique_loops 表行定义
 *
 * ```sql
 * CREATE TABLE IF NOT EXISTS critique_loops (
 *   id          TEXT PRIMARY KEY,          -- 格式: critique-loop-{projectId}-{timestamp}
 *   project_id  TEXT NOT NULL,
 *   status      TEXT NOT NULL DEFAULT 'running',  -- running | converged | exhausted | interrupted
 *   max_iterations INTEGER NOT NULL,
 *   total_iterations INTEGER NOT NULL DEFAULT 0,
 *   best_composite REAL,
 *   final_artifact_path TEXT,
 *   started_at   TEXT NOT NULL DEFAULT (datetime('now')),
 *   finished_at  TEXT,
 *   FOREIGN KEY (project_id) REFERENCES projects(id)
 * );
 * ```
 *
 * critique_loop_iterations 表行定义
 *
 * ```sql
 * CREATE TABLE IF NOT EXISTS critique_loop_iterations (
 *   id          TEXT PRIMARY KEY,
 *   loop_id     TEXT NOT NULL,
 *   iteration   INTEGER NOT NULL,
 *   run_id      TEXT NOT NULL,             -- 关联 critique_runs
 *   status      TEXT NOT NULL,
 *   composite   REAL,
 *   must_fix_count INTEGER NOT NULL DEFAULT 0,
 *   fix_duration_ms INTEGER,
 *   feedback_json TEXT,
 *   started_at  TEXT NOT NULL DEFAULT (datetime('now')),
 *   finished_at TEXT,
 *   FOREIGN KEY (loop_id) REFERENCES critique_loops(id),
 *   FOREIGN KEY (run_id) REFERENCES critique_runs(id)
 * );
 * ```
 */
