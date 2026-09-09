import { describe, expect, it } from 'vitest';

import { harnessAnalyticsFromRolloutDecision } from '../src/analytics/events.js';

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
