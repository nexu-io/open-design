import { describe, expect, it } from 'vitest';
import {
  agentActivityAnalyticsEvent,
  createAgentActivityLifecycle,
  normalizeAgentActivityPayload,
  summarizeContextCompactionRunAnalytics,
  type AgentActivityPayload,
} from '../../src/runtimes/agent-activity-lifecycle.js';

function compaction(
  phase: AgentActivityPayload['phase'],
  overrides: Partial<AgentActivityPayload> = {},
): AgentActivityPayload {
  return {
    type: 'activity',
    activity: 'context_compaction',
    activityId: 'compact-1',
    phase,
    ...(phase === 'started' || phase === 'progress' ? { startedAt: 1_000 } : {}),
    ...overrides,
  } as AgentActivityPayload;
}

describe('agent activity lifecycle', () => {
  it('namespaces adapter-local ids by run and attempt without double-prefixing', () => {
    const firstAttempt = normalizeAgentActivityPayload(compaction('started'), {
      runId: 'run-1',
      attemptIndex: 0,
    });
    const retryAttempt = normalizeAgentActivityPayload(compaction('started'), {
      runId: 'run-1',
      attemptIndex: 1,
    });

    expect(firstAttempt.activityId).toBe('run-1:attempt-0:compact-1');
    expect(retryAttempt.activityId).toBe('run-1:attempt-1:compact-1');
    expect(normalizeAgentActivityPayload(retryAttempt, {
      runId: 'run-1',
      attemptIndex: 1,
    })).toEqual(retryAttempt);
  });

  it('drops untrusted adapter detail before persistence or SSE', () => {
    const normalized = normalizeAgentActivityPayload(compaction('completed', {
      detail: 'COMPACT_SUMMARY_CANARY sk-secret-canary',
    }), {
      runId: 'run-1',
      attemptIndex: 0,
    });

    expect(normalized).not.toHaveProperty('detail');
    expect(JSON.stringify(normalized)).not.toContain('COMPACT_SUMMARY_CANARY');
    expect(JSON.stringify(normalized)).not.toContain('sk-secret-canary');
  });

  it('builds content-free lifecycle analytics and ignores progress frames', () => {
    const terminal = compaction('completed', {
      detail: 'COMPACT_SUMMARY_CANARY sk-secret-canary',
      startedAt: 1_000,
      elapsedMs: 2_000,
      tokenCountSource: 'native',
      tokensBefore: 100_000,
      tokensAfter: 24_000,
      terminalSource: 'native',
    });
    const analytics = agentActivityAnalyticsEvent(terminal, {
      id: 'run-1',
      projectId: 'project-1',
      conversationId: 'conversation-1',
      agentId: 'amr',
      runtimeType: 'acp-json-rpc',
    });

    expect(analytics).toEqual({
      eventName: 'agent_context_compaction_completed',
      insertId: 'compact-1:completed',
      properties: {
        run_id: 'run-1',
        project_id: 'project-1',
        conversation_id: 'conversation-1',
        agent_id: 'amr',
        runtime_type: 'acp-json-rpc',
        activity_id: 'compact-1',
        trigger: 'unknown',
        page_name: 'chat_panel',
        area: 'chat_panel',
        token_count_source: 'native',
        started_signal_seen: true,
        duration_status: 'measured',
        elapsed_ms: 2_000,
        tokens_before: 100_000,
        tokens_after: 24_000,
        token_delta: -76_000,
        tokens_removed: 76_000,
        token_reduction_ratio: 0.76,
        terminal_source: 'native',
      },
    });
    expect(JSON.stringify(analytics)).not.toContain('COMPACT_SUMMARY_CANARY');
    expect(JSON.stringify(analytics)).not.toContain('sk-secret-canary');
    expect(agentActivityAnalyticsEvent(compaction('progress'), { id: 'run-1' })).toBeNull();
  });

  it('closes every active compaction with one truthful failed terminal', () => {
    const lifecycle = createAgentActivityLifecycle();

    expect(lifecycle.accept(compaction('started', { trigger: 'context_overflow' }))).toBe(true);
    expect(lifecycle.terminalEvents(4_000)).toEqual([
      {
        type: 'activity',
        activity: 'context_compaction',
        activityId: 'compact-1',
        phase: 'failed',
        trigger: 'context_overflow',
        startedAt: 1_000,
        elapsedMs: 3_000,
        failureReason: 'run_terminated',
        terminalSource: 'run_finalizer',
      },
    ]);
  });

  it('uses first-terminal-wins when a native completion races finalization', () => {
    const lifecycle = createAgentActivityLifecycle();

    expect(lifecycle.accept(compaction('started'))).toBe(true);
    expect(lifecycle.accept(compaction('completed', { startedAt: 1_000, elapsedMs: 2_000 }))).toBe(true);
    expect(lifecycle.terminalEvents(4_000)).toEqual([]);
    expect(lifecycle.accept(compaction('failed', { startedAt: 1_000, elapsedMs: 3_000 }))).toBe(false);
  });

  it('lets finalizer output pass through accept exactly once', () => {
    const lifecycle = createAgentActivityLifecycle();
    lifecycle.accept(compaction('started'));

    const [terminal] = lifecycle.terminalEvents(2_500);
    expect(terminal).toBeDefined();
    expect(lifecycle.accept(terminal!)).toBe(true);
    expect(lifecycle.accept(terminal!)).toBe(false);
  });

  it('summarizes recovery, token reduction, and UI-relevant post-compact output', () => {
    const summary = summarizeContextCompactionRunAnalytics([
      { event: 'agent', data: compaction('started', {
        trigger: 'context_overflow',
        tokenCountSource: 'native',
        tokensBefore: 100_000,
      }) },
      { event: 'agent', data: compaction('completed', {
        trigger: 'context_overflow',
        startedAt: 1_000,
        elapsedMs: 2_000,
        tokenCountSource: 'native',
        tokensBefore: 100_000,
        tokensAfter: 24_000,
        terminalSource: 'native',
      }) },
      { event: 'agent', data: { type: 'text_delta', delta: 'Continuing the task.' } },
      { event: 'agent', data: compaction('started', {
        activityId: 'compact-2',
        trigger: 'manual',
      }) },
      { event: 'agent', data: compaction('failed', {
        activityId: 'compact-2',
        startedAt: 4_000,
        elapsedMs: 1_000,
        failureReason: 'run_terminated',
        terminalSource: 'run_finalizer',
      }) },
    ]);

    expect(summary).toMatchObject({
      context_compaction_count: 2,
      context_compaction_completed_count: 1,
      context_compaction_failed_count: 1,
      context_compaction_incomplete_count: 0,
      context_compaction_observability_status: 'complete',
      context_compaction_duration_sample_count: 2,
      context_compaction_total_duration_ms: 3_000,
      context_compaction_max_duration_ms: 2_000,
      context_compaction_token_metrics_count: 1,
      context_compaction_native_terminal_count: 1,
      context_compaction_finalizer_terminal_count: 1,
      context_compaction_post_output_seen: true,
      context_compaction_last_trigger: 'manual',
      context_compaction_last_failure_reason: 'run_terminated',
      context_compaction_last_terminal_source: 'run_finalizer',
      context_compaction_total_tokens_removed: 76_000,
    });
  });
});
