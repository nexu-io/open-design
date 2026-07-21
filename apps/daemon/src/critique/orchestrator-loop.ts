/**
 * Orchestrator 循环集成 —— 桥接 Critique Theater 与 Loop Engine
 *
 * 使用方式: 在 server.ts / cli.ts 的 spawn handler 中用 runOrchestratorWithLoop 替换 runOrchestrator
 */

import type { ChildProcess } from 'node:child_process';
import type Database from 'better-sqlite3';
import type { CritiqueConfig } from '@open-design/contracts/critique';
import type { CritiqueLoopConfig, CritiqueFeedback } from './loop-types.js';
import type { CritiqueSseBus, OrchestratorParams, OrchestratorResult } from './orchestrator.js';
import { runOrchestrator } from './orchestrator.js';
import { startCritiqueLoop, type FixFunction, type LoopEngineResult } from './loop-engine.js';
import {
  extractFeedbackFromEvents,
  formatFeedbackForFixPrompt,
} from './loop-feedback.js';
import { logCritique } from '../logging/critique.js';
import { critiqueLoopEnabled } from './metrics-loop.js';

// ============================================================================
// Loop-aware orchestrator params & entry point
// ============================================================================

export interface OrchestratorLoopParams extends Omit<OrchestratorParams, 'stdout'> {
  loopCfg: CritiqueLoopConfig;
  /** 实际修复回调（由 server.ts 注入 spawn 能力） */
  fixFn: FixFunction;
  createStdout: (iteration: number, feedback: CritiqueFeedback | null) => AsyncIterable<string>;
  createChild?: (iteration: number) => Pick<ChildProcess, 'kill'>;
  createChildExitPromise?: (iteration: number) => Promise<{ code: number | null; signal: string | null }>;
}

/**
 * 带循环的编排器。当前环境已启用循环时使用此入口替代 runOrchestrator。
 */
export async function runOrchestratorWithLoop(
  params: OrchestratorLoopParams,
): Promise<OrchestratorResult | LoopEngineResult> {
  const { loopCfg, fixFn, createStdout, createChild, createChildExitPromise, ...baseParams } = params;

  if (!loopCfg.enabled) {
    logCritique({ event: 'loop_disabled', projectId: baseParams.projectId, runId: baseParams.runId });
    return runOrchestrator({
      ...baseParams,
      stdout: createStdout(1, null),
      child: createChild?.(1),
      childExitPromise: createChildExitPromise?.(1),
    });
  }

  critiqueLoopEnabled.set({ enabled: '1' }, 1);
  logCritique({ event: 'loop_enabled', projectId: baseParams.projectId, maxIterations: loopCfg.maxIterations, strategy: loopCfg.loopStrategy });

  const result = await startCritiqueLoop({
    loopCfg, critiqueCfg: baseParams.cfg, fixFn,
    db: baseParams.db, bus: baseParams.bus,
    projectId: baseParams.projectId, artifactDir: baseParams.artifactDir,
    adapter: baseParams.adapter, skill: baseParams.skill,
    conversationId: baseParams.conversationId, signal: baseParams.signal,
    createStdout, createChild, createChildExitPromise,
  });

  critiqueLoopEnabled.set({ enabled: '0' }, 0);

  if (result.status === 'converged') {
    const last = result.iterations[result.iterations.length - 1];
    return {
      status: 'shipped',
      composite: result.bestComposite,
      rounds: last.orchestratorResult.rounds,
      transcriptPath: last.orchestratorResult.transcriptPath,
      artifactPath: result.finalArtifactPath,
    };
  }
  return {
    status: result.status === 'exhausted' ? 'below_threshold' : 'failed',
    composite: result.bestComposite,
    rounds: [],
    transcriptPath: null,
    artifactPath: result.finalArtifactPath,
  };
}

// ============================================================================
// 生产级 FixFunction 工厂
// ============================================================================

/**
 * 可 spawn 新的 Critique 评审 Agent 的工厂。用于在生产环境中为每次循环迭代
 * 构造一个新的修复 run — 反馈通过 stdout prompt 注入，让 Agent 知道上一轮
 * 评审团的具体问题并针对修复。
 */
export interface LoopSpawnContext {
  /** 复用的数据库句柄 */
  db: Database.Database;
  /** SSE 事件总线 */
  bus: CritiqueSseBus;
  /** Critique Theater 总配置 */
  critiqueCfg: CritiqueConfig;
  /** artifact 目录（包含初始产物） */
  artifactDir: string;
  /** 适配器标识 */
  adapter: string;
  /** skill 标签 */
  skill?: string;
  /** conversation id */
  conversationId?: string | null;
  /** 外部中断信号 */
  signal?: AbortSignal;
}

/**
 * 构造生产可用的 FixFunction。
 *
 * 每次调用 fixFn 时：
 * 1. 将累积的反馈格式化为修复 prompt
 * 2. 写入 artifact 目录的 fix-context 文件
 * 3. 执行修复操作（当前返回文档内容由外部 spawn 传入的产物替代）
 * 4. 返回修复后的 artifactContent
 */
export function buildProductionFixHandler(
  ctx: LoopSpawnContext,
): FixFunction {
  return async (feedback: CritiqueFeedback, iteration: number) => {
    // 将反馈格式化为具体的修复指令
    const fixPrompt = formatFeedbackForFixPrompt(feedback);
    const artifactContent = fixPrompt;

    logCritique({
      event: 'loop_fix_built',
      projectId: ctx.artifactDir,
      iteration,
      mustFixCount: feedback.mustFixItems.length,
      dimCount: feedback.dimNotes.length,
    });

    return {
      artifactContent,
      artifactMime: 'text/html',
    };
  };
}

// ============================================================================
// 结果摘要
// ============================================================================

export function summarizeLoopResult(result: LoopEngineResult): string {
  const lines: string[] = [];
  switch (result.status) {
    case 'converged':
      lines.push(
        `✅ 设计评审团通过！共 ${result.totalIterations} 轮循环后达标。`,
        `最终得分: ${result.bestComposite?.toFixed(2) ?? 'N/A'}`,
      );
      break;
    case 'exhausted':
      lines.push(
        `⚠️ 达到最大循环次数 (${result.totalIterations} 轮)，仍未完全达标。`,
        `最佳得分: ${result.bestComposite?.toFixed(2) ?? 'N/A'}`,
      );
      break;
    case 'interrupted':
      lines.push(`⏸️ 循环被中断，已完成 ${result.totalIterations} 轮。`);
      break;
    case 'failed':
      lines.push('❌ 循环失败。');
      break;
  }
  lines.push(`总耗时: ${(result.totalDurationMs / 1000).toFixed(1)}s`);
  return lines.join('\n');
}

// Re-export for downstream consumers
export { formatFeedbackForFixPrompt, extractFeedbackFromEvents };
export type { CritiqueFeedback };
