/**
 * Orchestrator 循环集成 —— 桥接 Critique Theater 与 Loop Engine
 *
 * 使用方式: 在 server.ts / cli.ts 的 spawn handler 中用 runOrchestratorWithLoop 替换 runOrchestrator
 */

import type { ChildProcess } from 'node:child_process';
import type Database from 'better-sqlite3';
import type { CritiqueConfig, OrchestratorResult } from '@open-design/contracts/critique';
import type { CritiqueLoopConfig } from './loop-types.js';
import type { CritiqueSseBus, OrchestratorParams } from './orchestrator.js';
import { runOrchestrator } from './orchestrator.js';
import { startCritiqueLoop, type FixFunction, type LoopEngineResult } from './loop-engine.js';
import { extractFeedbackFromEvents, formatFeedbackAsPrompt, type CritiqueFeedback } from './loop-feedback.js';
import { logCritique } from '../logging/critique.js';
import { critiqueLoopEnabled } from './metrics-loop.js';

export interface OrchestratorLoopParams extends Omit<OrchestratorParams, 'stdout'> {
  loopCfg: CritiqueLoopConfig;
  fixFn: FixFunction;
  createStdout: (iteration: number, feedback: CritiqueFeedback | null) => AsyncIterable<string>;
  createChild?: (iteration: number) => Pick<ChildProcess, 'kill'>;
  createChildExitPromise?: (iteration: number) => Promise<{ code: number | null; signal: string | null }>;
}

export async function runOrchestratorWithLoop(
  params: OrchestratorLoopParams,
): Promise<OrchestratorResult | LoopEngineResult> {
  const { loopCfg, fixFn, createStdout, createChild, createChildExitPromise, ...baseParams } = params;

  if (!loopCfg.enabled) {
    logCritique({ event: 'loop_disabled', projectId: baseParams.projectId, runId: baseParams.runId });
    return runOrchestrator({ ...baseParams, stdout: createStdout(1, null), child: createChild?.(1), childExitPromise: createChildExitPromise?.(1) });
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
    return { status: 'shipped', composite: result.bestComposite, rounds: last.orchestratorResult.rounds, transcriptPath: last.orchestratorResult.transcriptPath, artifactPath: result.finalArtifactPath };
  }
  return { status: result.status === 'exhausted' ? 'below_threshold' : 'failed', composite: result.bestComposite, rounds: [], transcriptPath: null, artifactPath: result.finalArtifactPath };
}

export function summarizeLoopResult(result: LoopEngineResult): string {
  const lines: string[] = [];
  switch (result.status) {
    case 'converged':
      lines.push(`✅ 设计评审团通过！共 ${result.totalIterations} 轮循环后达标。`, `最终得分: ${result.bestComposite?.toFixed(2) ?? 'N/A'}`);
      break;
    case 'exhausted':
      lines.push(`⚠️ 达到最大循环次数 (${result.totalIterations} 轮)，仍未完全达标。`, `最佳得分: ${result.bestComposite?.toFixed(2) ?? 'N/A'}`);
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

export { formatFeedbackAsPrompt, extractFeedbackFromEvents };
export type { CritiqueFeedback };
