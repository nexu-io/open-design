/**
 * Loop Engine — Critique Theater 的自动修复循环引擎
 *
 * 当设计评审团 (Design Jury) 发现评审问题时，自动触发重新修复并再次提交评审，
 * 直到达到设计评审团的质量标准。这是 Loop Engineering 范式在 Open Design 中的核心实现。
 *
 * ## 循环流程
 * 开始评审 → 发现问题 → 提取反馈 → 触发修复 → 重新提交评审 → ... → 达标 → 交付
 *
 * @see specs/current/critique-theater.md § Loop Engineering
 * @see packages/contracts/src/critique.ts § CritiqueLoopConfig
 */

import type { ChildProcess } from 'node:child_process';
import { promises as fs } from 'node:fs';
import type Database from 'better-sqlite3';
import type { CritiqueConfig, CritiqueRoundSummary } from '@open-design/contracts/critique';
import type { CritiqueLoopConfig, CritiqueFeedback } from './loop-types.js';
import { loopEventToSse } from './loop-types.js';
import type { CritiqueSseBus } from './orchestrator.js';
import { runOrchestrator, type OrchestratorResult } from './orchestrator.js';
import { extractFeedbackFromEvents } from './loop-feedback.js';
import { generateLoopRunId } from './loop-utils.js';
import {
  critiqueLoopConvergedTotal,
  critiqueLoopExhaustedTotal,
} from './metrics-loop.js';
import { logCritique } from '../logging/critique.js';

// ============================================================================
// 类型定义
// ============================================================================

/** 修复函数签名：接收反馈，返回修复后的产物 */
export type FixFunction = (
  feedback: CritiqueFeedback,
  iteration: number,
) => Promise<{ artifactContent: string; artifactMime: string }>;

/** 循环引擎参数 */
export interface LoopEngineParams {
  loopCfg: CritiqueLoopConfig;
  critiqueCfg: CritiqueConfig;
  fixFn: FixFunction;
  db: Database;
  bus: CritiqueSseBus;
  projectId: string;
  artifactDir: string;
  adapter: string;
  skill?: string;
  conversationId?: string | null;
  signal?: AbortSignal;
  /** 为每次迭代提供新的 stdout 流（由 spawn handler 注入） */
  createStdout: (iteration: number, feedback: CritiqueFeedback | null) => AsyncIterable<string>;
  createChild?: (iteration: number) => Pick<ChildProcess, 'kill'>;
  createChildExitPromise?: (iteration: number) => Promise<{ code: number | null; signal: string | null }>;
}

/** 单次循环迭代结果 */
export interface LoopIterationResult {
  iteration: number;
  orchestratorResult: OrchestratorResult;
  converged: boolean;
}

/** 循环引擎最终结果 */
export interface LoopEngineResult {
  status: 'converged' | 'exhausted' | 'interrupted' | 'failed';
  totalIterations: number;
  iterations: LoopIterationResult[];
  finalArtifactPath: string | null;
  bestComposite: number | null;
  totalDurationMs: number;
}

// ============================================================================
// 裁决函数 —— 强制按 loopStrategy 分支决策
// ============================================================================

/**
 * 总 mustFix 计数（汇总所有轮次）。
 * 反馈在重试路径上不能丢弃 — 累积所有轮的可操作 mustFix。
 */
function totalMustFix(rounds: CritiqueRoundSummary[]): number {
  let sum = 0;
  for (const r of rounds) sum += r.mustFix ?? 0;
  return sum;
}

/**
 * 按 loopStrategy 判定收敛。
 *
 * - converge:    分数达标 AND 零 mustFix（必须两者都满足）
 * - score_only:  只要分数达标（即使还有 mustFix 也通过）
 * - mustFix_only: 只要零 mustFix（不关心分数）
 */
function hasConverged(
  result: OrchestratorResult,
  cfg: CritiqueConfig,
  strategy: CritiqueLoopConfig['loopStrategy'],
): boolean {
  if (result.status !== 'shipped') return false;
  const composite = result.composite;
  if (composite === null) return false;

  const scoreOk = composite >= cfg.scoreThreshold - 1e-9;
  const mustFixOk = totalMustFix(result.rounds) === 0;

  switch (strategy) {
    case 'converge':
      return scoreOk && mustFixOk;
    case 'score_only':
      return scoreOk;
    case 'mustFix_only':
      return mustFixOk;
    default:
      return scoreOk && mustFixOk;
  }
}

/**
 * 按 loopStrategy 判定是否应重试。
 *
 * - converge:     分数不达标 OR (shipped 但仍有 mustFix)
 * - score_only:   分数不达标
 * - mustFix_only: shipped 但仍有 mustFix
 */
function shouldRetry(
  result: OrchestratorResult,
  rounds: CritiqueRoundSummary[],
  strategy: CritiqueLoopConfig['loopStrategy'],
): boolean {
  // 不可恢复的终止状态
  if (result.status === 'interrupted' || result.status === 'failed' || result.status === 'degraded') {
    return false;
  }

  const mustFix = totalMustFix(rounds);

  switch (strategy) {
    case 'converge':
      return result.status === 'below_threshold' || (result.status === 'shipped' && mustFix > 0);
    case 'score_only':
      return result.status === 'below_threshold';
    case 'mustFix_only':
      return result.status === 'shipped' && mustFix > 0;
    default:
      return result.status === 'below_threshold' || (result.status === 'shipped' && mustFix > 0);
  }
}

// ============================================================================
// 反馈累积
// ============================================================================

/**
 * 按 feedbackAggregation 策略合并新旧反馈。
 *
 * - cumulative:  累积所有轮的可操作 mustFixItems（去重）和 dimNotes，
 *                 确保 retry 路径不丢弃 jury 的任何反馈。
 * - last_round:  只保留最新一轮的反馈（旧反馈被覆盖）。
 * - none:        不累积反馈（不会触发修复）。
 */
function mergeFeedback(
  prev: CritiqueFeedback | null,
  next: CritiqueFeedback | null,
  aggregation: CritiqueLoopConfig['feedbackAggregation'],
): CritiqueFeedback | null {
  if (aggregation === 'none') return null;
  if (next === null) return prev;
  if (prev === null) return next;
  if (aggregation === 'last_round') return next;

  // cumulative: merge mustFixItems and dimNotes, keeping insertion order
  const seen = new Set(prev.mustFixItems);
  const mergedMustFix = [
    ...prev.mustFixItems,
    ...next.mustFixItems.filter((item) => !seen.has(item)),
  ];
  const seenDim = new Set(prev.dimNotes);
  const mergedDim = [
    ...prev.dimNotes,
    ...next.dimNotes.filter((n) => !seenDim.has(n)),
  ];

  return {
    mustFixItems: mergedMustFix,
    dimNotes: mergedDim,
    overallStatus: next.overallStatus ?? prev.overallStatus,
  };
}

// ============================================================================
// 主循环入口
// ============================================================================

export async function startCritiqueLoop(params: LoopEngineParams): Promise<LoopEngineResult> {
  const {
    loopCfg, critiqueCfg, fixFn, db, bus, projectId, artifactDir, adapter,
    skill = 'unknown', conversationId = null, signal,
    createStdout, createChild, createChildExitPromise,
  } = params;

  if (!loopCfg.enabled) throw new Error('startCritiqueLoop: loopCfg.enabled must be true');
  if (!Number.isFinite(loopCfg.maxIterations) || loopCfg.maxIterations < 1) {
    throw new RangeError(`startCritiqueLoop: maxIterations must be >= 1, got ${loopCfg.maxIterations}`);
  }

  const strategy = loopCfg.loopStrategy;
  const aggregation = loopCfg.feedbackAggregation;
  const startTime = Date.now();
  const iterations: LoopIterationResult[] = [];
  let accumulatedFeedback: CritiqueFeedback | null = null;

  logCritique({ event: 'loop_started', projectId, adapter, maxIterations: loopCfg.maxIterations, strategy, aggregation });

  bus.emit(loopEventToSse({ type: 'loop_started', projectId, maxIterations: loopCfg.maxIterations }));

  for (let iteration = 1; iteration <= loopCfg.maxIterations; iteration++) {
    if (signal?.aborted) {
      logCritique({ event: 'loop_aborted', projectId, iteration, reason: 'external_signal' });
      return buildResult('interrupted', iterations, null, startTime);
    }

    logCritique({ event: 'loop_iteration_start', projectId, iteration });

    bus.emit(loopEventToSse({
      type: 'loop_iteration_start', projectId, iteration,
      totalMaxIterations: loopCfg.maxIterations,
      hasPriorFeedback: accumulatedFeedback !== null,
    }));

    // --- 触发修复 ---
    if (accumulatedFeedback !== null && aggregation !== 'none') {
      const fixStart = Date.now();
      try {
        logCritique({ event: 'loop_fix_triggered', projectId, iteration, mustFixCount: accumulatedFeedback.mustFixItems.length });

        bus.emit(loopEventToSse({ type: 'loop_fix_started', projectId, iteration, mustFixCount: accumulatedFeedback.mustFixItems.length }));

        const { artifactContent, artifactMime } = await fixFn(accumulatedFeedback, iteration);
        const fixDurationMs = Date.now() - fixStart;

        logCritique({ event: 'loop_fix_completed', projectId, iteration, fixDurationMs, artifactMime });
        bus.emit(loopEventToSse({ type: 'loop_fix_completed', projectId, iteration, fixDurationMs }));

        await fs.mkdir(artifactDir, { recursive: true });
        await fs.writeFile(`${artifactDir}/fix-i${iteration}.html`, artifactContent, 'utf-8');
      } catch (err) {
        logCritique({ event: 'loop_fix_failed', projectId, iteration, error: err instanceof Error ? err.message : String(err) });
        bus.emit(loopEventToSse({ type: 'loop_fix_failed', projectId, iteration, error: err instanceof Error ? err.message : String(err) }));
        if (iterations.length > 0) return buildResult('exhausted', iterations, null, startTime);
        throw err;
      }
    }

    // --- 提交评审 ---
    const runId = generateLoopRunId(projectId, iteration);
    const runStart = Date.now();

    try {
      const orchestratorResult = await runOrchestrator({
        runId, projectId, conversationId,
        artifactId: `loop-i${iteration}-${runId}`,
        artifactDir, adapter, skill,
        cfg: critiqueCfg, db, bus,
        stdout: accumulatedFeedback !== null ? createStdout(iteration, accumulatedFeedback) : createStdout(iteration, null),
        signal,
        child: createChild?.(iteration),
        childExitPromise: createChildExitPromise?.(iteration),
      });

      const converged = hasConverged(orchestratorResult, critiqueCfg, strategy);
      iterations.push({ iteration, orchestratorResult, converged });

      bus.emit(loopEventToSse({
        type: 'loop_iteration_end', projectId, iteration,
        status: orchestratorResult.status,
        composite: orchestratorResult.composite ?? 0,
        converged,
      }));

      logCritique({
        event: 'loop_iteration_end', projectId, iteration,
        status: orchestratorResult.status, composite: orchestratorResult.composite,
        converged, runDurationMs: Date.now() - runStart,
      });

      if (converged) {
        critiqueLoopConvergedTotal.inc({ adapter, skill });
        return buildResult('converged', iterations, orchestratorResult.artifactPath, startTime);
      }

      if (shouldRetry(orchestratorResult, orchestratorResult.rounds, strategy)) {
        const currentFeedback = extractFeedbackFromEvents([], orchestratorResult.rounds, orchestratorResult.status);
        accumulatedFeedback = mergeFeedback(accumulatedFeedback, currentFeedback, aggregation);
        continue;
      }

      critiqueLoopExhaustedTotal.inc({ adapter, skill, reason: orchestratorResult.status });
      return buildResult('exhausted', iterations, null, startTime);
    } catch (err) {
      logCritique({ event: 'loop_iteration_error', projectId, iteration, error: err instanceof Error ? err.message : String(err) });
      if (iterations.length > 0) return buildResult('exhausted', iterations, null, startTime);
      return buildResult('failed', iterations, null, startTime);
    }
  }

  critiqueLoopExhaustedTotal.inc({ adapter, skill, reason: 'max_iterations' });
  logCritique({ event: 'loop_exhausted', projectId, totalIterations: loopCfg.maxIterations });

  bus.emit(loopEventToSse({
    type: 'loop_exhausted', projectId, totalIterations: loopCfg.maxIterations,
    bestComposite: getBestComposite(iterations),
  }));

  return buildResult('exhausted', iterations, null, startTime);
}

// ============================================================================
// 辅助函数
// ============================================================================

function buildResult(
  status: LoopEngineResult['status'],
  iterations: LoopIterationResult[],
  artifactPath: string | null,
  startTime: number,
): LoopEngineResult {
  return {
    status, totalIterations: iterations.length, iterations,
    finalArtifactPath: artifactPath,
    bestComposite: getBestComposite(iterations),
    totalDurationMs: Date.now() - startTime,
  };
}

function getBestComposite(iterations: LoopIterationResult[]): number | null {
  let best = -Infinity;
  for (const it of iterations) {
    if (it.orchestratorResult.composite !== null && it.orchestratorResult.composite > best) {
      best = it.orchestratorResult.composite;
    }
  }
  return best === -Infinity ? null : best;
}

// Re-export feedback extractor for downstream use
export { extractFeedbackFromEvents };
