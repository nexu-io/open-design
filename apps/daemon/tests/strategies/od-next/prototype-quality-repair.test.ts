import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DeliverableQualityEvidence } from '@open-design/contracts';
import {
  interruptedPrototypeQuality, emptyPrototypeQualityAttempt, recordPrototypeQuality, prototypeQualityRepairDecision,
  settlePrototypeCorrection, startPrototypeCorrectionBudget,
} from '../../../src/strategies/od-next/prototype-quality-repair.js';
import {
  composePrototypeQualityRepairTurn, parsePrototypeQualityRepairTurn,
} from '../../../src/strategies/od-next/prototype-quality-repair-turn.js';
const failure: DeliverableQualityEvidence = {
  schema: 'open-design.deliverable-quality/v1', checker: 'prototype-interaction@1', status: 'fail',
  candidateHash: 'a'.repeat(64), entryFile: 'index.html', checkedAt: 10, durationMs: 20,
  coverage: { expected: 1, checked: 1, complete: true },
  checks: [{ id: 'hash', kind: 'static', status: 'fail', reason: 'hashchange wrong target' }],
};
afterEach(() => vi.useRealTimers());
describe('bounded prototype correction', () => {
  it('does not invent a candidate history record when a pre-snapshot check is unavailable', () => {
    const attempt = emptyPrototypeQualityAttempt();
    const unknown = recordPrototypeQuality(attempt, { ...failure, candidateHash: '', status: 'incomplete',
      checks: [{ id: 'budget', kind: 'static', status: 'incomplete', reason: 'host_budget_exhausted' }] });
    expect(unknown).toMatchObject({ candidateHash: '', status: 'incomplete', history: [] });
    expect(attempt.history).toEqual([]);
  });
  it('reports interruption without claiming the prior candidate is current, while preserving a current fault', () => {
    const attempt = emptyPrototypeQualityAttempt();
    recordPrototypeQuality(attempt, failure); attempt.attempts = 1;
    expect(interruptedPrototypeQuality(attempt, undefined, 'repair_time_budget')).toMatchObject({ status: 'incomplete', candidateHash: '',
      initialStatus: 'fail', history: [{ candidateHash: failure.candidateHash, status: 'fail' }], repair: { reason: 'repair_time_budget' } });
    expect(interruptedPrototypeQuality(attempt, failure, 'user_canceled')).toMatchObject({ status: 'fail', candidateHash: failure.candidateHash,
      repair: { reason: 'user_canceled' } });
  });
  it('preserves a deterministic initial syntax fault fixed by the host before navigation checks', () => {
    const final = recordPrototypeQuality(emptyPrototypeQualityAttempt(), { ...failure, status: 'pass', initialStatus: 'fail' });
    expect(final.initialStatus).toBe('fail');
    expect(final.repair?.attempts).toBe(0);
  });
  it('retains the initial fault and checks every new candidate under the shared budget', () => {
    const state = emptyPrototypeQualityAttempt();
    const first = recordPrototypeQuality(state, failure);
    expect(prototypeQualityRepairDecision(state, first, false, {}).allowed).toBe(true);
    state.attempts = 1;
    state.correctionStartedAt = 100;
    settlePrototypeCorrection(state, 140);
    const latest = recordPrototypeQuality(state, { ...failure, status: 'pass', candidateHash: 'b'.repeat(64), checks: [] });
    expect(latest.initialStatus).toBe('fail');
    expect(latest.history?.map(item => item.candidateHash)).toEqual(['a'.repeat(64), 'b'.repeat(64)]);
    expect(latest.repair).toMatchObject({ attempts: 1, durationMs: 40 });
    expect(state.hostDurationMs).toBe(40);
    expect(prototypeQualityRepairDecision(state, latest, false, {}).allowed).toBe(false);
  });
  it.each([
    [{ attempts: 2 }, failure, false, {}, 'repair_attempt_limit'],
    [{ agentDurationMs: 120_000 }, failure, false, {}, 'repair_time_budget'],
    [{ hostDurationMs: 30_000 }, failure, false, {}, 'host_check_budget'],
    [{}, { ...failure, status: 'incomplete' }, false, {}, 'checks_incomplete'],
    [{}, { ...failure, candidateHash: '' }, false, {}, 'candidate_identity_unavailable'],
    [{}, failure, true, {}, 'user_canceled'],
    [{}, failure, false, { OD_PROTOTYPE_QUALITY_REPAIR: '0' }, 'repair_disabled'],
  ] as const)('stops for %s', (over, quality, canceled, env, reason) => {
    expect(prototypeQualityRepairDecision({ ...emptyPrototypeQualityAttempt(), ...over }, quality, canceled, env))
      .toEqual({ allowed: false, reason });
  });
  it('invokes real stopping at the remaining cumulative time, and clears on completion', () => {
    vi.useFakeTimers(); vi.setSystemTime(100);
    const stop = vi.fn();
    const state = { ...emptyPrototypeQualityAttempt(), agentDurationMs: 119_990 };
    const clear = startPrototypeCorrectionBudget({ attempt: state, onBudgetElapsed: stop });
    vi.advanceTimersByTime(9); expect(stop).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(stop).toHaveBeenCalledOnce();
    clear();
    const stopped = vi.fn();
    const clearCanceled = startPrototypeCorrectionBudget({ attempt: emptyPrototypeQualityAttempt(), onBudgetElapsed: stopped });
    clearCanceled(); vi.advanceTimersByTime(120_000); expect(stopped).not.toHaveBeenCalled();
  });
  it('binds correction authority to the definite fault and canonical candidate identity', () => {
    const input = { taskExecutionId: 'task', stage: 'production' as const, route: 'full_plan' as const,
      executionMode: 'simple' as const, taskRunIndex: 2, sourceRunId: 'source', candidateHash: failure.candidateHash,
      round: 1 as const, promptBundleSha256: 'b'.repeat(64), quality: failure };
    const text = composePrototypeQualityRepairTurn(input);
    expect(parsePrototypeQualityRepairTurn(text)).toMatchObject({ sourceRunId: 'source', round: 1, candidateHash: failure.candidateHash });
    expect(() => composePrototypeQualityRepairTurn({ ...input, quality: { ...failure, status: 'incomplete' } })).toThrow();
    expect(() => composePrototypeQualityRepairTurn({ ...input, candidateHash: 'c'.repeat(64) })).toThrow();
    expect(() => parsePrototypeQualityRepairTurn(text + '\n')).toThrow();
    expect(() => composePrototypeQualityRepairTurn({ ...input, stage: 'request', route: 'direct_edit', executionMode: null })).toThrow();
    expect(() => composePrototypeQualityRepairTurn({ ...input, stage: 'request', route: 'direct_edit', executionMode: 'complex' })).toThrow();
  });
});
