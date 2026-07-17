import { describe, expect, it } from 'vitest';
import { daemonAgentPayloadToPersistedAgentEvent } from '../src/runtimes/chat-run-messages.js';

describe('context compaction activity persistence', () => {
  it('preserves lifecycle identity and timing across reloads', () => {
    expect(daemonAgentPayloadToPersistedAgentEvent({
      type: 'activity',
      activity: 'context_compaction',
      activityId: 'compact-1',
      phase: 'completed',
      trigger: 'context_overflow',
      startedAt: 1_700_000_000_000,
      elapsedMs: 42_000,
      tokenCountSource: 'native',
      tokensBefore: 120_000,
      tokensAfter: 24_000,
      terminalSource: 'native',
      detail: 'COMPACT_SUMMARY_CANARY sk-secret-canary',
    })).toEqual({
      kind: 'activity',
      activity: 'context_compaction',
      activityId: 'compact-1',
      phase: 'completed',
      trigger: 'context_overflow',
      startedAt: 1_700_000_000_000,
      elapsedMs: 42_000,
      tokenCountSource: 'native',
      tokensBefore: 120_000,
      tokensAfter: 24_000,
      terminalSource: 'native',
    });
  });

  it('keeps completion-only events untimed instead of inventing zero duration', () => {
    expect(daemonAgentPayloadToPersistedAgentEvent({
      type: 'activity',
      activity: 'context_compaction',
      activityId: 'compact-completion-only',
      phase: 'completed',
      trigger: 'proactive',
    })).toEqual({
      kind: 'activity',
      activity: 'context_compaction',
      activityId: 'compact-completion-only',
      phase: 'completed',
      trigger: 'proactive',
    });
  });
});
