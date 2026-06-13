// Phase 4 / spec §10.1 / plan §3.EE1 — pipeline simulator.
//
// Pure helper that walks a `PluginPipeline` against a caller-
// supplied signal stream and reports per-stage convergence
// without running an actual LLM / agent. Useful for plugin
// authors testing devloop convergence rules:
//
//   - 'does my critique-theater stage exit on score>=4?'
//   - 'does my build-test stage timeout after 8 iterations?'
//   - 'does my partial-decision diff-review re-prompt forever?'
//
// The simulator is deterministic: callers supply per-iteration
// signals as either a constant SignalSnapshot or a generator
// function `(iteration) => signals`. The pipeline's `until`
// expression is evaluated via the same evaluator the runtime
// uses (no parallel implementation drift).
//
// Sister of plugins/pipeline-runner.ts (which drives a live
// run); this module is the dry-run counterpart with no SQLite
// or SSE side effects.

import type { PluginPipeline } from '@open-design/contracts';
import { evaluateUntil, parseUntil, type UntilSignals } from './until.js';

export interface StageSignalProvider {
  /**
   * Returns the signals snapshot for a given (stageId, iteration)
   * tuple. The caller defines the simulation policy; common
   * choices:
   *
   *   - constant signals across every stage (`() => ({ 'critique.score': 5 })`)
   *   - per-stage tables (`(stageId) => stageSignals[stageId] ?? {}`)
   *   - increasing signals across iterations (e.g. score grows
   *     toward convergence)
   */
  (stageId: string, iteration: number): UntilSignals;
}

export interface SimulatePipelineInput {
  pipeline: PluginPipeline;
  signals:  StageSignalProvider | UntilSignals;
  // Per-stage iteration cap. Defaults to 10. The simulator clamps
  // 'repeat: true' stages at this ceiling even when the until
  // expression never satisfies — surfaces a 'never converges'
  // bug as a hit-cap event rather than an infinite loop.
  iterationCap?: number;
}

export interface SimulateStageOutcome {
  stageId:    string;
  iterations: number;
  // 'converged' = until satisfied. 'cap' = iterationCap hit before
  // until satisfied (for repeat:true stages). 'unparsable' = until
  // expression failed to parse (the simulator records this as a
  // single-iteration unparsable run rather than re-throwing).
  // 'single' = repeat:false stage; ran exactly once.
  outcome:    'converged' | 'cap' | 'unparsable' | 'single';
  // The signals snapshot from the iteration that triggered the
  // exit, for audit. For 'single' / 'cap', the last iteration's
  // snapshot.
  finalSignals: UntilSignals;
  // The matched conjunction (when outcome='converged'). Empty
  // otherwise. Useful when a stage has multiple OR branches and
  // the author wants to know which one fired.
  matched?: ReturnType<typeof evaluateUntil>['matched'];
  // Reason text for 'unparsable' / 'cap' outcomes. Absent on
  // converged / single.
  reason?: string;
}

export interface SimulatePipelineResult {
  stages: SimulateStageOutcome[];
  // Aggregate: total iterations across every stage.
  totalIterations: number;
  // 'all-converged' / 'all-single' / 'mixed' / 'cap-hit' /
  // 'unparsable'. Quick-look outcome the CLI prints first.
  outcome:    'all-converged' | 'all-single' | 'mixed' | 'cap-hit' | 'unparsable';
}

const DEFAULT_ITERATION_CAP = 10;

export function simulatePipeline(input: SimulatePipelineInput): SimulatePipelineResult {
  const cap = input.iterationCap ?? DEFAULT_ITERATION_CAP;
  const provider: StageSignalProvider = typeof input.signals === 'function'
    ? input.signals as StageSignalProvider
    : () => input.signals as UntilSignals;

  const stages: SimulateStageOutcome[] = [];
  for (const stage of input.pipeline.stages) {
    const stageOutcome = simulateStage(stage, provider, cap);
    stages.push(stageOutcome);
  }

  const totalIterations = stages.reduce((acc, s) => acc + s.iterations, 0);
  const outcome = aggregateOutcome(stages);
  return { stages, totalIterations, outcome };
}

function simulateStage(
  stage: PluginPipeline['stages'][number],
  provider: StageSignalProvider,
  cap: number,
): SimulateStageOutcome {
  const stageId = stage.id;
  const repeat = stage.repeat === true;
  const untilSource = stage.until;

  if (!repeat || !untilSource) {
    // Single-shot stage: one iteration, no until eval.
    const finalSignals = provider(stageId, 0);
    const out: SimulateStageOutcome = {
      stageId,
      iterations: 1,
      outcome:    'single',
      finalSignals,
    };
    return out;
  }

  let parsed;
  try {
    parsed = parseUntil(untilSource);
  } catch (err) {
    const finalSignals = provider(stageId, 0);
    return {
      stageId,
      iterations: 1,
      outcome:    'unparsable',
      finalSignals,
      reason:     (err as Error).message,
    };
  }

  let lastSignals: UntilSignals = {};
  for (let i = 0; i < cap; i++) {
    const signals = provider(stageId, i);
    lastSignals = signals;
    const eval_ = evaluateUntil(parsed, signals);
    if (eval_.satisfied) {
      const out: SimulateStageOutcome = {
        stageId,
        iterations: i + 1,
        outcome:    'converged',
        finalSignals: signals,
      };
      if (eval_.matched.length > 0) out.matched = eval_.matched;
      return out;
    }
  }
  return {
    stageId,
    iterations: cap,
    outcome:    'cap',
    finalSignals: lastSignals,
    reason:     `until expression never satisfied within iterationCap=${cap}`,
  };
}

function aggregateOutcome(stages: SimulateStageOutcome[]): SimulatePipelineResult['outcome'] {
  if (stages.length === 0) return 'all-single';
  if (stages.some((s) => s.outcome === 'unparsable')) return 'unparsable';
  if (stages.some((s) => s.outcome === 'cap')) return 'cap-hit';
  if (stages.every((s) => s.outcome === 'single')) return 'all-single';
  if (stages.every((s) => s.outcome === 'converged' || s.outcome === 'single')) {
    return stages.every((s) => s.outcome === 'converged') ? 'all-converged' : 'mixed';
  }
  return 'mixed';
}

// Convenience helper: parse a key=value list of signals from CLI
// flags. 'critique.score=4 build.passing=true tests.passing=false'
// → { 'critique.score': 4, 'build.passing': true, 'tests.passing': false }
//
// Respects the closed UntilSignals vocabulary: unknown keys are
// dropped with a warning so a typo doesn't silently make the
// simulator pass.
export function parseSignalKv(args: ReadonlyArray<string>): { signals: UntilSignals; warnings: string[] } {
  const out: UntilSignals = {};
  const warnings: string[] = [];
  const knownNumeric: Array<keyof UntilSignals> = ['critique.score', 'iterations'];
  const knownBoolean: Array<keyof UntilSignals> = ['user.confirmed', 'preview.ok', 'build.passing', 'tests.passing'];
  for (const arg of args) {
    const eq = arg.indexOf('=');
    if (eq <= 0) {
      warnings.push(`signal must be 'key=value', got '${arg}'`);
      continue;
    }
    const key = arg.slice(0, eq).trim();
    const raw = arg.slice(eq + 1).trim();
    if (knownNumeric.includes(key as keyof UntilSignals)) {
      const num = Number(raw);
      if (Number.isFinite(num)) {
        (out as Record<string, number>)[key] = num;
      } else {
        warnings.push(`signal ${key} expected number; got '${raw}'`);
      }
      continue;
    }
    if (knownBoolean.includes(key as keyof UntilSignals)) {
      if (raw === 'true' || raw === '1')      (out as Record<string, boolean>)[key] = true;
      else if (raw === 'false' || raw === '0') (out as Record<string, boolean>)[key] = false;
      else warnings.push(`signal ${key} expected boolean; got '${raw}'`);
      continue;
    }
    warnings.push(`unknown signal '${key}' (allowed: critique.score / iterations / user.confirmed / preview.ok / build.passing / tests.passing)`);
  }
  return { signals: out, warnings };
}
