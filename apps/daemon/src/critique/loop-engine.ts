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
import type { CritiqueConfig, PanelEvent, CritiqueRunStatus, CritiqueRoundSummary, CritiqueSseEvent } from '@open-design/contracts/critique';
import { panelEventToSse } from '@open-design/contracts/critique';
import type { CritiqueLoopConfig, LoopEvent } from './loop-types.js';
import { loopEventToSse } from './loop-types.js';
import type { CritiqueSseBus } from './orchestrator.js';
import { runOrchestrator, type OrchestratorParams, type OrchestratorResult } from './orchestrator.js';
import { extractFeedbackFromEvents } from './loop-feedback.js';
import { generateLoopRunId, createEmptyStdout } from './loop-utils.js';
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

/** 修复函数签名：接收反馈，返回修复后的产物 */
export type FixFunction = (
  feedback: ReturnType<typeof extractFeedbackFromEvents>,
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
  /** 项目工作目录，用于加载 Outer Loop Memory (.loop/lessons.md) */
  projectDir: string;
  adapter: string;
  skill: string | undefined;
  conversationId?: string | null;
  signal?: AbortSignal;
  /** 为每次迭代提供新的 stdout 流（由 spawn handler 注入） */
  createStdout: (iteration: number, feedback: ReturnType<typeof extractFeedbackFromEvents> | null) => AsyncIterable<string>;
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
// 裁决函数
// ============================================================================

function hasConverged(result: OrchestratorResult, cfg: CritiqueConfig): boolean {
  if (result.status !== 'shipped') return false;
  if (result.composite === null) return false;
  return result.composite >= cfg.scoreThreshold - 1e-9;
}

function shouldRetry(result: OrchestratorResult, rounds: CritiqueRoundSummary[]): boolean {
  if (result.status === 'interrupted' || result.status === 'failed' || result.status === 'degraded') return false;
  if (result.status === 'below_threshold') return true;
  if (result.status === 'shipped' && rounds.length > 0) {
    const lastRound = rounds[rounds.length - 1];
    if (lastRound.mustFix > 0) return true;
  }
  return false;
}

// ============================================================================
// 主循环入口
// ============================================================================

export async function startCritiqueLoop(params: LoopEngineParams): Promise<LoopEngineResult> {
  const {
    loopCfg, critiqueCfg, fixFn, db, bus, projectId, artifactDir, projectDir,
    adapter, skill = 'unknown', conversationId = null, signal,
    createStdout, createChild, createChildExitPromise,
  } = params;

  if (!loopCfg.enabled) throw new Error('startCritiqueLoop: loopCfg.enabled must be true');
  if (!Number.isFinite(loopCfg.maxIterations) || loopCfg.maxIterations < 1) {
    throw new RangeError(`startCritiqueLoop: maxIterations must be >= 1, got ${loopCfg.maxIterations}`);
  }

  const startTime = Date.now();
  const iterations: LoopIterationResult[] = [];
  let accumulatedFeedback: ReturnType<typeof extractFeedbackFromEvents> | null = null;

  // --- Outer Loop Memory: 加载历史经验 ---
  const historicalLessons = await loadLessonsAsContext(projectDir);
  if (historicalLessons) {
    logCritique({ event: 'loop_lessons_loaded', projectId, adapter });
  }

  logCritique({ event: 'loop_started', projectId, adapter, maxIterations: loopCfg.maxIterations, strategy: loopCfg.loopStrategy });

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
    if (accumulatedFeedback !== null) {
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

      const converged = hasConverged(orchestratorResult, critiqueCfg);
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

      if (shouldRetry(orchestratorResult, orchestratorResult.rounds)) {
        accumulatedFeedback = extractFeedbackFromEvents([], orchestratorResult.rounds, orchestratorResult.status);
        // 首次添加反馈时，注入历史经验（Outer Loop Memory）
        if (historicalLessons) {
          accumulatedFeedback.historicalLessons = loopCfg.feedbackAggregation === 'cumulative'
            ? historicalLessons
            : null;
        }
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
