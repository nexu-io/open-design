/**
 * 循环工程配置解析
 *
 * 环境变量: OD_CRITIQUE_LOOP_*
 *
 * 需合并到 apps/daemon/src/critique/config.ts
 */

import type { CritiqueLoopConfig, FeedbackAggregation, LoopStrategy } from './loop-types.js';
import { LOOP_STRATEGIES, defaultCritiqueLoopConfig } from './loop-types.js';

export function loadLoopConfigFromEnv(env: NodeJS.ProcessEnv = process.env): CritiqueLoopConfig {
  const defaults = defaultCritiqueLoopConfig();

  const enabled = parseEnabled(env.OD_CRITIQUE_LOOP_ENABLED, defaults.enabled);
  const maxIterations = parsePosInt('OD_CRITIQUE_LOOP_MAX_ITERATIONS', env.OD_CRITIQUE_LOOP_MAX_ITERATIONS, defaults.maxIterations);
  const loopStrategy = parseStrategy(env.OD_CRITIQUE_LOOP_STRATEGY, defaults.loopStrategy);
  const fixTimeoutMs = parsePosInt('OD_CRITIQUE_LOOP_FIX_TIMEOUT_MS', env.OD_CRITIQUE_LOOP_FIX_TIMEOUT_MS, defaults.fixTimeoutMs);
  const loopTotalTimeoutMs = parseNonNegInt('OD_CRITIQUE_LOOP_TOTAL_TIMEOUT_MS', env.OD_CRITIQUE_LOOP_TOTAL_TIMEOUT_MS, defaults.loopTotalTimeoutMs);
  const feedbackAggregation = parseAggregation(env.OD_CRITIQUE_LOOP_FEEDBACK_AGGREGATION, defaults.feedbackAggregation);

  if (fixTimeoutMs > loopTotalTimeoutMs && loopTotalTimeoutMs > 0) {
    throw new RangeError(`OD_CRITIQUE_LOOP_FIX_TIMEOUT_MS (${fixTimeoutMs}) must be <= OD_CRITIQUE_LOOP_TOTAL_TIMEOUT_MS (${loopTotalTimeoutMs})`);
  }

  return { enabled, maxIterations, loopStrategy, fixTimeoutMs, loopTotalTimeoutMs, feedbackAggregation };
}

function parseEnabled(raw: string | undefined, fallback: boolean): boolean {
  if (!raw) return fallback;
  const v = raw.toLowerCase().trim();
  return v === 'true' || v === '1' || v === 'yes' || v === 'on';
}

function parseStrategy(raw: string | undefined, fallback: LoopStrategy): LoopStrategy {
  if (!raw) return fallback;
  const v = raw.trim();
  const canonical = (LOOP_STRATEGIES as readonly string[]).find(
    (s) => s.toLowerCase() === v.toLowerCase(),
  );
  if (canonical) return canonical as LoopStrategy;
  throw new RangeError(`OD_CRITIQUE_LOOP_STRATEGY: expected ${LOOP_STRATEGIES.join('|')}, got "${v}"`);
}

function parsePosInt(key: string, raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) throw new RangeError(`${key}: expected positive integer, got "${raw}"`);
  return n;
}

function parseNonNegInt(key: string, raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) throw new RangeError(`${key}: expected non-negative integer, got "${raw}"`);
  return n;
}

function parseAggregation(raw: string | undefined, fallback: FeedbackAggregation): FeedbackAggregation {
  if (!raw) return fallback;
  const v = raw.trim().toLowerCase();
  if (v === 'cumulative' || v === 'last_round' || v === 'none') return v;
  throw new RangeError(`OD_CRITIQUE_LOOP_FEEDBACK_AGGREGATION: expected "cumulative"|"last_round"|"none", got "${v}"`);
}
