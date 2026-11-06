import { describe, expect, it } from 'vitest';

import {
  harnessAnalyticsFromRolloutDecision,
  odNextBlockedAnalyticsFromStrategyTask,
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
