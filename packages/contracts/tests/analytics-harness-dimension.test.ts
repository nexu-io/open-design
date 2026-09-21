import { describe, expect, it } from 'vitest';

import {
  harnessAnalyticsFromRolloutDecision,
  odNextAgentLaunchFromRunFacts,
  odNextBlockedAnalyticsFromStrategyTask,
  odNextTaskIdentityAnalyticsFromStrategyTask,
  odNextTaskSettlementAnalyticsFromStrategyTask,
} from '../src/analytics/events.js';

describe('harnessAnalyticsFromRolloutDecision', () => {
  it('reports od_next with no fallback reason when the strategy ran', () => {
    expect(
      harnessAnalyticsFromRolloutDecision({ effectiveMode: 'active', primaryReasonCode: 'od_next_rollout_eligible' }),
    ).toEqual({ harness: 'od_next' });
  });

  it('carries why a run fell back so "I turned it on and nothing changed" is answerable', () => {
    expect(
      harnessAnalyticsFromRolloutDecision({
        effectiveMode: 'observe',
        primaryReasonCode: 'od_next_rollout_agent_ineligible',
      }),
    ).toEqual({ harness: 'ordinary', harness_fallback_reason: 'od_next_rollout_agent_ineligible' });
  });

  it('treats off the same as observe — neither produced the new harness', () => {
    expect(
      harnessAnalyticsFromRolloutDecision({ effectiveMode: 'off', primaryReasonCode: 'od_next_rollout_off' }),
    ).toEqual({ harness: 'ordinary', harness_fallback_reason: 'od_next_rollout_off' });
  });

  it('stays silent when there is no decision at all', () => {
    // Absent and "took the ordinary route" are different facts: every run from
    // before the strategy existed would otherwise be counted as a control-group
    // sample it never was.
    expect(harnessAnalyticsFromRolloutDecision(null)).toEqual({});
    expect(harnessAnalyticsFromRolloutDecision(undefined)).toEqual({});
    expect(harnessAnalyticsFromRolloutDecision({})).toEqual({});
  });

  it('omits an empty reason rather than emitting a blank string', () => {
    expect(harnessAnalyticsFromRolloutDecision({ effectiveMode: 'off', primaryReasonCode: '' })).toEqual({
      harness: 'ordinary',
    });
  });
});

describe('odNextBlockedAnalyticsFromStrategyTask', () => {
  it('carries the gate that refused the turn', () => {
    expect(
      odNextBlockedAnalyticsFromStrategyTask({
        terminal: true,
        outcome: 'blocked',
        blockedContext: {
          reasonCodes: [
            'od_next_canonical_deliverable_invalid',
            'od_next_protocol_runtime_state_missing',
          ],
        },
      }),
    ).toEqual({ od_next_blocked_reason_code: 'od_next_canonical_deliverable_invalid' });
  });

  it('stays silent for a task that refused nothing', () => {
    // `harness` already says an OD Next task passed through. This field means
    // "and it was refused" — a completed task must not land in that bucket.
    expect(
      odNextBlockedAnalyticsFromStrategyTask({ terminal: true, outcome: 'completed' }),
    ).toEqual({});
    expect(
      odNextBlockedAnalyticsFromStrategyTask({ terminal: true, outcome: 'canceled' }),
    ).toEqual({});
  });

  it('stays silent for a task that has not settled', () => {
    // A running task may block later or may not; counting it now would report
    // a refusal that never happened.
    expect(
      odNextBlockedAnalyticsFromStrategyTask({
        terminal: false,
        outcome: 'blocked',
        blockedContext: { reasonCodes: ['od_next_protocol_runtime_state_missing'] },
      }),
    ).toEqual({});
  });

  it('stays silent when a blocked task carries no reason', () => {
    // An older daemon projects a blocked task without `blockedContext`. An
    // empty string is not a bucket.
    expect(
      odNextBlockedAnalyticsFromStrategyTask({ terminal: true, outcome: 'blocked' }),
    ).toEqual({});
    expect(
      odNextBlockedAnalyticsFromStrategyTask({
        terminal: true,
        outcome: 'blocked',
        blockedContext: { reasonCodes: [] },
      }),
    ).toEqual({});
  });

  it('stays silent for a run that had no strategy task at all', () => {
    expect(odNextBlockedAnalyticsFromStrategyTask(undefined)).toEqual({});
    expect(odNextBlockedAnalyticsFromStrategyTask(null)).toEqual({});
  });
});

describe('odNextTaskIdentityAnalyticsFromStrategyTask', () => {
  it('names the strategy package the task was frozen on and the round the Run is', () => {
    expect(
      odNextTaskIdentityAnalyticsFromStrategyTask({
        strategy: { version: '2.0.4', packageHash: 'c'.repeat(64) },
        inputStage: 'production',
        outcome: 'running',
      }),
    ).toEqual({
      od_next_strategy_version: '2.0.4',
      od_next_strategy_package_hash: 'c'.repeat(64),
      od_next_task_stage: 'production',
    });
  });

  it('stays silent for a run with no task and omits blank identity values', () => {
    expect(odNextTaskIdentityAnalyticsFromStrategyTask(undefined)).toEqual({});
    expect(odNextTaskIdentityAnalyticsFromStrategyTask(null)).toEqual({});
    expect(
      odNextTaskIdentityAnalyticsFromStrategyTask({ strategy: { version: '', packageHash: undefined } }),
    ).toEqual({});
  });
});

describe('odNextTaskSettlementAnalyticsFromStrategyTask', () => {
  it('carries the settlement of a completed task without any blocked field', () => {
    expect(
      odNextTaskSettlementAnalyticsFromStrategyTask({
        outcome: 'completed',
        terminal: true,
        settlementReason: 'question',
        autoRoundCount: 0,
        deliverableWritten: false,
      }),
    ).toEqual({
      od_next_task_outcome: 'completed',
      od_next_settlement_reason: 'question',
      od_next_auto_round_count: 0,
      od_next_deliverable_written: false,
    });
  });

  it('carries every gate reason code of a blocked task next to the primary one', () => {
    expect(
      odNextTaskSettlementAnalyticsFromStrategyTask({
        outcome: 'blocked',
        terminal: true,
        autoRoundCount: 1,
        deliverableWritten: false,
        blockedContext: { reasonCodes: ['od_next_physical_run_failed', 'od_next_session_unavailable'] },
      }),
    ).toEqual({
      od_next_task_outcome: 'blocked',
      od_next_auto_round_count: 1,
      od_next_deliverable_written: false,
      od_next_reason_codes: ['od_next_physical_run_failed', 'od_next_session_unavailable'],
      od_next_blocked_reason_code: 'od_next_physical_run_failed',
    });
  });

  it('reports a still-running task as running with no settlement', () => {
    expect(
      odNextTaskSettlementAnalyticsFromStrategyTask({
        outcome: 'running',
        terminal: false,
        // A settlement reason on a non-terminal projection is not a settlement.
        settlementReason: 'text_only',
        autoRoundCount: 1,
        deliverableWritten: true,
      }),
    ).toEqual({
      od_next_task_outcome: 'running',
      od_next_auto_round_count: 1,
      od_next_deliverable_written: true,
    });
  });

  it('stays silent for a run with no task', () => {
    expect(odNextTaskSettlementAnalyticsFromStrategyTask(undefined)).toEqual({});
    expect(odNextTaskSettlementAnalyticsFromStrategyTask(null)).toEqual({});
  });
});

describe('odNextAgentLaunchFromRunFacts', () => {
  it('counts only a failed run with none of the three signals as never started', () => {
    const silent = { firstTokenSeen: false, toolCallSeen: false, userVisibleOutputSeen: false };
    expect(odNextAgentLaunchFromRunFacts({ status: 'failed', ...silent })).toBe('not_started');
    expect(odNextAgentLaunchFromRunFacts({ status: 'succeeded', ...silent })).toBe('started');
    expect(odNextAgentLaunchFromRunFacts({ status: 'canceled', ...silent })).toBe('started');
    expect(odNextAgentLaunchFromRunFacts({ status: 'failed', ...silent, firstTokenSeen: true })).toBe('started');
    expect(odNextAgentLaunchFromRunFacts({ status: 'failed', ...silent, toolCallSeen: true })).toBe('started');
    expect(odNextAgentLaunchFromRunFacts({ status: 'failed', ...silent, userVisibleOutputSeen: true })).toBe('started');
  });
});
