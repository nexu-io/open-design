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
import type Database from 'better-sqlite3';
import type { CritiqueConfig, CritiqueRunStatus } from '@open-design/contracts/critique';
import type { CritiqueLoopConfig, LoopEvent } from './loop-types.js';
import { loopEventToSse } from './loop-types.js';
import type { CritiqueSseBus } from './orchestrator.js';
import { runOrchestrator, type OrchestratorParams, type OrchestratorResult } from './orchestrator.js';
import { aggregateCritiqueFeedback, extractFeedbackFromEvents } from './loop-feedback.js';
import { generateLoopRunId } from './loop-utils.js';
import {
  critiqueLoopIterationsTotal,
  critiqueLoopConvergedTotal,
  critiqueLoopExhaustedTotal,
} from './metrics-loop.js';
import { logCritique } from '../logging/critique.js';
import { loadLessonsAsContext } from './lessons-loop.js';

// ============================================================================
// 类型定义
// ============================================================================

/** 循环引擎参数 */
export interface LoopEngineParams {
  loopCfg: CritiqueLoopConfig;
  critiqueCfg: CritiqueConfig;
  db: Database.Database;
  bus: CritiqueSseBus;
  projectId: string;
  artifactDir: string;
  /** 项目工作目录，用于加载 Outer Loop Memory (.loop/lessons.md) */
  projectDir: string;
  adapter: string;
  skill: string | undefined;
  conversationId?: string | null;
  signal?: AbortSignal;
  /** 为每次迭代创建一个新的 agent 进程及其输出资源 */
  createIteration: (
    iteration: number,
    feedback: ReturnType<typeof extractFeedbackFromEvents> | null,
    runId: string,
  ) => IterationResources | Promise<IterationResources>;
}

export interface IterationResources {
  stdout: AsyncIterable<string>;
  child: Pick<ChildProcess, 'kill'>;
  childExitPromise: Promise<{ code: number | null; signal: string | null }>;
}

/** 单次循环迭代结果 */
export interface LoopIterationResult {
  iteration: number;
  orchestratorResult: OrchestratorResult;
  converged: boolean;
}

/** 循环引擎最终结果 */
export interface LoopEngineResult {
  status: 'converged' | 'exhausted' | 'interrupted' | 'timed_out' | 'degraded' | 'failed';
  totalIterations: number;
  iterations: LoopIterationResult[];
  finalArtifactPath: string | null;
  bestComposite: number | null;
  totalDurationMs: number;
}

// ============================================================================
// 裁决函数
// ============================================================================

function hasConverged(
  result: OrchestratorResult,
  cfg: CritiqueConfig,
  strategy: CritiqueLoopConfig['loopStrategy'],
): boolean {
  if (result.status !== 'shipped' && result.status !== 'below_threshold') return false;
  const lastRound = result.rounds[result.rounds.length - 1];
  if (result.composite === null || lastRound === undefined) return false;

  const scorePasses = result.composite >= cfg.scoreThreshold - 1e-9;
  const mustFixPasses = lastRound.mustFix === 0;
  switch (strategy) {
    case 'score_only':
      return scorePasses;
    case 'mustFix_only':
      return mustFixPasses;
    case 'converge':
      return scorePasses && mustFixPasses;
  }
}

function shouldRetry(result: OrchestratorResult): boolean {
  return result.status === 'below_threshold' || result.status === 'shipped';
}

function terminalLoopStatus(status: CritiqueRunStatus): LoopEngineResult['status'] {
  switch (status) {
    case 'interrupted':
    case 'timed_out':
    case 'degraded':
    case 'failed':
      return status;
    case 'shipped':
    case 'below_threshold':
      return 'exhausted';
    case 'legacy':
      return 'failed';
  }
}

// ============================================================================
// 主循环入口
// ============================================================================

export async function startCritiqueLoop(params: LoopEngineParams): Promise<LoopEngineResult> {
  const {
    loopCfg, critiqueCfg, db, bus, projectId, artifactDir, projectDir,
    adapter, skill = 'unknown', conversationId = null, signal,
    createIteration,
  } = params;

  if (!loopCfg.enabled) throw new Error('startCritiqueLoop: loopCfg.enabled must be true');
  if (!Number.isFinite(loopCfg.maxIterations) || loopCfg.maxIterations < 1) {
    throw new RangeError(`startCritiqueLoop: maxIterations must be >= 1, got ${loopCfg.maxIterations}`);
  }

  const startTime = Date.now();
  const loopDeadline = loopCfg.loopTotalTimeoutMs > 0
    ? startTime + loopCfg.loopTotalTimeoutMs
    : null;
  const iterations: LoopIterationResult[] = [];
  let accumulatedFeedback: ReturnType<typeof extractFeedbackFromEvents> | null = null;

  // --- Outer Loop Memory: 加载历史经验 ---
  const historicalLessons = await loadLessonsAsContext(projectDir);
  if (historicalLessons) {
    logCritique({ event: 'loop_lessons_loaded', projectId, adapter });
  }

  logCritique({ event: 'loop_started', projectId, adapter, maxIterations: loopCfg.maxIterations, strategy: loopCfg.loopStrategy });

  emitLoopEvent(bus, { type: 'loop_started', projectId, maxIterations: loopCfg.maxIterations });

  for (let iteration = 1; iteration <= loopCfg.maxIterations; iteration++) {
    if (signal?.aborted) {
      logCritique({ event: 'loop_aborted', projectId, iteration, reason: 'external_signal' });
      emitLoopEvent(bus, { type: 'loop_aborted', projectId, iteration, reason: 'external_signal' });
      return buildResult('interrupted', iterations, null, startTime);
    }
    const remainingLoopMs = loopDeadline === null ? null : loopDeadline - Date.now();
    if (remainingLoopMs !== null && remainingLoopMs <= 0) {
      logCritique({ event: 'loop_aborted', projectId, iteration, reason: 'total_timeout' });
      emitLoopEvent(bus, { type: 'loop_aborted', projectId, iteration, reason: 'total_timeout' });
      return buildResult('timed_out', iterations, null, startTime);
    }

    logCritique({ event: 'loop_iteration_start', projectId, iteration });

    emitLoopEvent(bus, {
      type: 'loop_iteration_start', projectId, iteration,
      totalMaxIterations: loopCfg.maxIterations,
      hasPriorFeedback: accumulatedFeedback !== null,
    });

    // --- 提交评审 ---
    const runId = generateLoopRunId(projectId, iteration);
    const runStart = Date.now();

    try {
      const iterationResources = await createIteration(iteration, accumulatedFeedback, runId);
      const iterationTimeoutMs = Math.max(1, Math.floor(Math.min(
        critiqueCfg.totalTimeoutMs,
        loopCfg.fixTimeoutMs,
        remainingLoopMs ?? Number.POSITIVE_INFINITY,
      )));
      const iterationCritiqueCfg = {
        ...critiqueCfg,
        perRoundTimeoutMs: Math.min(critiqueCfg.perRoundTimeoutMs, iterationTimeoutMs),
        totalTimeoutMs: iterationTimeoutMs,
      };
      const orchestratorResult = await runOrchestrator({
        runId, projectId, conversationId,
        artifactId: `loop-i${iteration}-${runId}`,
        artifactDir, adapter, skill,
        cfg: iterationCritiqueCfg, db, bus,
        stdout: iterationResources.stdout,
        ...(signal !== undefined ? { signal } : {}),
        child: iterationResources.child,
        childExitPromise: iterationResources.childExitPromise,
      });

      const converged = hasConverged(orchestratorResult, critiqueCfg, loopCfg.loopStrategy);
      iterations.push({ iteration, orchestratorResult, converged });
      critiqueLoopIterationsTotal.inc({ adapter, skill, iteration: String(iteration) });

      emitLoopEvent(bus, {
        type: 'loop_iteration_end', projectId, iteration,
        status: orchestratorResult.status,
        composite: orchestratorResult.composite ?? 0,
        converged,
      });

      logCritique({
        event: 'loop_iteration_end', projectId, iteration,
        status: orchestratorResult.status, composite: orchestratorResult.composite,
        converged, runDurationMs: Date.now() - runStart,
      });

      if (converged) {
        critiqueLoopConvergedTotal.inc({ adapter, skill });
        emitLoopEvent(bus, {
          type: 'loop_converged',
          projectId,
          totalIterations: iterations.length,
          finalComposite: orchestratorResult.composite ?? 0,
          totalDurationMs: Date.now() - startTime,
        });
        return buildResult('converged', iterations, orchestratorResult.artifactPath, startTime);
      }

      if (shouldRetry(orchestratorResult)) {
        const currentFeedback = extractFeedbackFromEvents(
          orchestratorResult.events,
          orchestratorResult.rounds,
          orchestratorResult.status,
        );
        accumulatedFeedback = aggregateCritiqueFeedback(
          accumulatedFeedback,
          currentFeedback,
          loopCfg.feedbackAggregation,
        );
        if (historicalLessons) {
          accumulatedFeedback.historicalLessons = historicalLessons;
        }
        continue;
      }

      critiqueLoopExhaustedTotal.inc({ adapter, skill, reason: orchestratorResult.status });
      return buildResult(
        terminalLoopStatus(orchestratorResult.status),
        iterations,
        orchestratorResult.artifactPath,
        startTime,
      );
    } catch (err) {
      logCritique({ event: 'loop_iteration_error', projectId, iteration, error: err instanceof Error ? err.message : String(err) });
      return buildResult('failed', iterations, null, startTime);
    }
  }

  critiqueLoopExhaustedTotal.inc({ adapter, skill, reason: 'max_iterations' });
  logCritique({ event: 'loop_exhausted', projectId, totalIterations: loopCfg.maxIterations });

  emitLoopEvent(bus, {
    type: 'loop_exhausted', projectId, totalIterations: loopCfg.maxIterations,
    bestComposite: getBestComposite(iterations),
  });

  return buildResult('exhausted', iterations, null, startTime);
}

// ============================================================================
// 辅助函数
// ============================================================================

/** 向 SSE bus 发送循环事件（类型适配：LoopEvent 不在 CritiqueSseEvent 联合中） */
function emitLoopEvent(bus: { emit(e: { event: string; data: unknown }): void }, event: LoopEvent): void {
  bus.emit(loopEventToSse(event));
}

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
