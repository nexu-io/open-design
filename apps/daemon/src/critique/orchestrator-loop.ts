/**
 * Orchestrator 循环集成 —— 桥接 Critique Theater 与 Loop Engine
 *
 * 职责:
 *   1. 启用/禁用 Critique Loop 的开关
 *   2. Inner Loop: 驱动修复-评审迭代
 *   3. Outer Loop: 记录经验教训，自动提炼技能文件
 *
 * 使用方式: 在 server.ts / cli.ts 的 spawn handler 中用 runOrchestratorWithLoop 替换 runOrchestrator
 */

import type { ChildProcess } from 'node:child_process';
import type Database from 'better-sqlite3';
import type { CritiqueConfig } from '@open-design/contracts/critique';
import type { CritiqueLoopConfig } from './loop-types.js';
import type { CritiqueSseBus, OrchestratorParams, OrchestratorResult } from './orchestrator.js';
import { runOrchestrator } from './orchestrator.js';
import { startCritiqueLoop, type FixFunction, type LoopEngineResult } from './loop-engine.js';
import { extractFeedbackFromEvents, formatFeedbackAsPrompt, type CritiqueFeedback } from './loop-feedback.js';
import { logCritique } from '../logging/critique.js';
import { critiqueLoopEnabled } from './metrics-loop.js';
import { recordLesson, appendLessonToFile, loadLessonsAsContext } from './lessons-loop.js';
import { distillSkillsFromLessons } from './skills-loop.js';
import type { LessonCategory, LessonSeverity } from './lessons-loop.js';

export interface OrchestratorLoopParams extends Omit<OrchestratorParams, 'stdout'> {
  loopCfg: CritiqueLoopConfig;
  fixFn: FixFunction;
  /** 项目工作目录，用于 Outer Loop Memory 文件读写 */
  projectDir: string;
  createStdout: (iteration: number, feedback: CritiqueFeedback | null) => AsyncIterable<string>;
  createChild?: (iteration: number) => Pick<ChildProcess, 'kill'>;
  createChildExitPromise?: (iteration: number) => Promise<{ code: number | null; signal: string | null }>;
}

export async function runOrchestratorWithLoop(
  params: OrchestratorLoopParams,
): Promise<OrchestratorResult | LoopEngineResult> {
  const { loopCfg, fixFn, projectDir, createStdout, createChild, createChildExitPromise, ...baseParams } = params;

  if (!loopCfg.enabled) {
    logCritique({ event: 'loop_disabled', projectId: baseParams.projectId, runId: baseParams.runId });
    return runOrchestrator({
      ...baseParams,
      stdout: createStdout(1, null),
      ...(createChild?.(1) !== undefined ? { child: createChild!(1) } : {}),
      ...(createChildExitPromise?.(1) !== undefined ? { childExitPromise: createChildExitPromise!(1) } : {}),
    });
  }

  critiqueLoopEnabled.set({ enabled: '1' }, 1);
  logCritique({ event: 'loop_enabled', projectId: baseParams.projectId, maxIterations: loopCfg.maxIterations, strategy: loopCfg.loopStrategy });

  const loopId = `critique-loop-${baseParams.projectId.slice(0, 8)}-${Date.now().toString(36)}`;

  const result = await startCritiqueLoop({
    loopCfg, critiqueCfg: baseParams.cfg, fixFn,
    db: baseParams.db, bus: baseParams.bus,
    projectId: baseParams.projectId, artifactDir: baseParams.artifactDir,
    projectDir,
    adapter: baseParams.adapter, skill: baseParams.skill,
    conversationId: baseParams.conversationId,
    ...(baseParams.signal !== undefined ? { signal: baseParams.signal } : {}),
    createStdout,
    ...(createChild !== undefined ? { createChild } : {}),
    ...(createChildExitPromise !== undefined ? { createChildExitPromise } : {}),
  });

  critiqueLoopEnabled.set({ enabled: '0' }, 0);

  // --- Outer Loop Memory: 记录经验教训 ---
  await persistLessons(baseParams.db, baseParams.projectId, projectDir, result);

  // --- Outer Loop Skills: 收敛后提炼技能文件 ---
  if (result.status === 'converged') {
    try {
      const skillResult = await distillSkillsFromLessons(
        baseParams.db, projectDir, baseParams.projectId,
      );
      if (skillResult.generated) {
        logCritique({
          event: 'loop_skills_distilled',
          projectId: baseParams.projectId,
          lessonCount: skillResult.lessonCount,
          categories: skillResult.categories,
          outputPath: skillResult.outputPath,
        });
      }
    } catch (err) {
      logCritique({
        event: 'loop_skills_distill_error',
        projectId: baseParams.projectId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const last = result.iterations[result.iterations.length - 1];
  if (result.status === 'converged' && last) {
    return {
      status: 'shipped', composite: result.bestComposite,
      rounds: last.orchestratorResult.rounds,
      transcriptPath: last.orchestratorResult.transcriptPath,
      artifactPath: result.finalArtifactPath,
    };
  }

  return {
    status: result.status === 'exhausted' ? 'below_threshold' : 'failed',
    composite: result.bestComposite, rounds: [], transcriptPath: null,
    artifactPath: result.finalArtifactPath,
  };
}

// ============================================================================
// Outer Loop Memory: 经验持久化
// ============================================================================

async function persistLessons(
  db: Database.Database,
  projectId: string,
  projectDir: string,
  result: LoopEngineResult,
): Promise<void> {
  const now = Date.now().toString(36);
  const loopId = `loop-${projectId.slice(0, 8)}-${now}`;

  if (result.status === 'converged') {
    // 收敛：所有修复经验标记为高有效性
    for (const iter of result.iterations) {
      for (const round of iter.orchestratorResult.rounds) {
        if (round.mustFix === 0) continue;

        const lesson = recordLesson(db, {
          loopId,
          projectId,
          iteration: iter.iteration,
          category: categorizeRound(round),
          severity: 'info',
          problem: `第 ${iter.iteration} 轮评审 — 已修复 mustFix 问题`,
          resolution: `经过 ${result.totalIterations} 轮循环修复，最终达标（composite: ${result.bestComposite?.toFixed(2) ?? 'N/A'}）`,
          effectiveness: 8,
          tags: ['converged', `iterations:${result.totalIterations}`],
        });
        await appendLessonToFile(projectDir, lesson);
      }
    }
  } else if (result.status === 'exhausted') {
    // 耗尽：未解决问题记录为 warning
    for (const iter of result.iterations) {
      for (const round of iter.orchestratorResult.rounds) {
        if (round.mustFix === 0) continue;

        const lesson = recordLesson(db, {
          loopId,
          projectId,
          iteration: iter.iteration,
          category: categorizeRound(round),
          severity: 'warning',
          problem: `第 ${iter.iteration} 轮评审 — ${round.mustFix} 个 mustFix 项未在迭代中完全修复`,
          resolution: `循环耗尽（best composite: ${result.bestComposite?.toFixed(2) ?? 'N/A'}），建议人工介入`,
          effectiveness: null,
          tags: ['exhausted', `mustFix:${round.mustFix}`],
        });
        await appendLessonToFile(projectDir, lesson);
      }
    }
  }
}

/**
 * 根据评审轮次内容推断经验类別
 */
function categorizeRound(round: { mustFix: number; decision?: string }): LessonCategory {
  // 默认归为通用类別，后续可通过评审面板员角色进行更精确分类
  return 'general';
}

// ============================================================================
// 公共函数
// ============================================================================

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

