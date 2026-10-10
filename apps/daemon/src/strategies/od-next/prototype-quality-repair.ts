import {
  parseOdNextPromptBundleV1, parseOdNextPromptBundleV2,
  type DeliverableQualityEvidence,
} from '@open-design/contracts';
import type { StrategyTaskExecutionRecord } from '../task-store.js';

export const PROTOTYPE_AGENT_REPAIR_MAX_ATTEMPTS = 2;
export const PROTOTYPE_AGENT_REPAIR_BUDGET_MS = 120_000;
export const PROTOTYPE_CHECK_BUDGET_MS = 30_000;
/** Internal run-state only; persisted and inherited across physical continuation Runs. */
export interface PrototypeQualityAttempt {
  attempts: number;
  hostDurationMs: number;
  agentDurationMs: number;
  correctionStartedAt?: number;
  stopReason?: string;
  initialStatus?: DeliverableQualityEvidence['status'];
  history: NonNullable<DeliverableQualityEvidence['history']>;
}
export function emptyPrototypeQualityAttempt(): PrototypeQualityAttempt {
  return { attempts: 0, hostDurationMs: 0, agentDurationMs: 0, history: [] };
}
export function prototypeOriginalBrief(task: StrategyTaskExecutionRecord): string {
  return task.promptBundle.schema === 'open-design.od-next-prompt-bundle/v2'
    ? parseOdNextPromptBundleV2(task.promptBundle.text).userFirstPrompt
    : parseOdNextPromptBundleV1(task.promptBundle.text).userPrompt;
}
export function settlePrototypeCorrection(attempt: PrototypeQualityAttempt, now = Date.now()): void {
  if (attempt.correctionStartedAt !== undefined) {
    attempt.agentDurationMs += Math.max(0, now - attempt.correctionStartedAt);
    delete attempt.correctionStartedAt;
  }
}
export function recordPrototypeQuality(
  attempt: PrototypeQualityAttempt, quality: DeliverableQualityEvidence,
): DeliverableQualityEvidence {
  attempt.hostDurationMs += Math.max(0, quality.durationMs);
  attempt.initialStatus ??= quality.initialStatus ?? quality.status;
  if (/^[a-f0-9]{64}$/.test(quality.candidateHash)) {
    attempt.history.push({ candidateHash: quality.candidateHash, status: quality.status, checkedAt: quality.checkedAt });
  }
  return { ...quality, initialStatus: attempt.initialStatus,
    history: [...attempt.history],
    repair: { attempts: attempt.attempts, maxAttempts: PROTOTYPE_AGENT_REPAIR_MAX_ATTEMPTS,
      durationMs: attempt.agentDurationMs },
  };
}
export function prototypeQualityRepairDecision(
  attempt: PrototypeQualityAttempt, quality: DeliverableQualityEvidence, canceled = false,
  env: NodeJS.ProcessEnv = process.env,
): { allowed: boolean; reason: string } {
  if (canceled) return { allowed: false, reason: 'user_canceled' };
  if (['0', 'false', 'off', 'no'].includes(env.OD_PROTOTYPE_QUALITY_REPAIR?.trim().toLowerCase() ?? '')) {
    return { allowed: false, reason: 'repair_disabled' };
  }
  if (quality.status !== 'fail') return { allowed: false, reason: quality.status === 'incomplete' ? 'checks_incomplete' : 'no_definite_fault' };
  if (!/^[a-f0-9]{64}$/.test(quality.candidateHash)) return { allowed: false, reason: 'candidate_identity_unavailable' };
  if (attempt.attempts >= PROTOTYPE_AGENT_REPAIR_MAX_ATTEMPTS) return { allowed: false, reason: 'repair_attempt_limit' };
  if (attempt.agentDurationMs >= PROTOTYPE_AGENT_REPAIR_BUDGET_MS) return { allowed: false, reason: 'repair_time_budget' };
  if (attempt.hostDurationMs >= PROTOTYPE_CHECK_BUDGET_MS) return { allowed: false, reason: 'host_check_budget' };
  return { allowed: true, reason: 'definite_fault' };
}

/** Budget expiry stops the active run; declaring a timeout alone is insufficient. */
export function startPrototypeCorrectionBudget(input: {
  attempt: PrototypeQualityAttempt;
  onBudgetElapsed: () => void;
  now?: number;
}): () => void {
  input.attempt.correctionStartedAt ??= input.now ?? Date.now();
  const remaining = Math.max(0, PROTOTYPE_AGENT_REPAIR_BUDGET_MS - input.attempt.agentDurationMs
    - Math.max(0, (input.now ?? Date.now()) - input.attempt.correctionStartedAt));
  const timer = setTimeout(input.onBudgetElapsed, remaining);
  timer.unref?.();
  return () => clearTimeout(timer);
}

/** An interrupted Run has no new verified identity; keep predecessor history as history. */
export function interruptedPrototypeQuality(attempt: PrototypeQualityAttempt,
  current: DeliverableQualityEvidence | undefined, reason: string): DeliverableQualityEvidence {
  const repair = { attempts: attempt.attempts, maxAttempts: PROTOTYPE_AGENT_REPAIR_MAX_ATTEMPTS,
    durationMs: attempt.agentDurationMs, reason };
  if (current?.status === 'fail') return { ...current, repair };
  return { schema: 'open-design.deliverable-quality/v1', checker: 'prototype-interaction@1',
    status: 'incomplete', candidateHash: '', entryFile: '', checkedAt: Date.now(), durationMs: 0,
    coverage: { expected: 0, checked: 0, complete: false },
    checks: [{ id: 'repair-interrupted', kind: 'static', status: 'incomplete', reason }],
    ...(attempt.initialStatus ? { initialStatus: attempt.initialStatus } : {}), history: [...attempt.history], repair };
}
