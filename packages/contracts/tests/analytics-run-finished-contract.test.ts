import { describe, expect, it } from 'vitest';
import type {
  AnalyticsEventPayload,
  RunFinishedProps,
} from '../src/analytics/events.js';

function makeBaseRunFinishedProps(): RunFinishedProps {
  return {
    page_name: 'chat_panel',
    area: 'chat_panel',
    project_id: 'proj-1',
    conversation_id: 'conv-1',
    run_id: 'run-1',
    project_kind: 'prototype',
    design_system_source: 'not_applicable',
    has_attachment: false,
    user_query_tokens: 24,
    model_id: 'claude-sonnet-4-5',
    agent_provider_id: 'claude_code',
    skill_id: null,
    mcp_id: null,
    token_count_source: 'unknown',
    result: 'failed',
    artifact_count: 0,
    asked_user_question: false,
    total_duration_ms: 1234,
  };
}

describe('analytics run_finished contract', () => {
  it('accepts a minimal run_finished payload without observability extensions', () => {
    const payload = {
      event: 'run_finished',
      props: makeBaseRunFinishedProps(),
    } satisfies Extract<AnalyticsEventPayload, { event: 'run_finished' }>;

    expect(payload.event).toBe('run_finished');
    expect(payload.props.result).toBe('failed');
    expect(payload.props.failure_category).toBeUndefined();
    expect(payload.props.langfuse_expected).toBeUndefined();
    expect(payload.props.input_tokens_effective).toBeUndefined();
  });

  it('accepts the full observability envelope for run_finished payloads', () => {
    const payload = {
      event: 'run_finished',
      props: {
        ...makeBaseRunFinishedProps(),
        token_count_source: 'provider_usage',
        error_code: 'RATE_LIMITED',
        failure_category: 'rate_limit',
        failure_stage: 'session_init',
        retryable: true,
        user_action: 'retry',
        langfuse_trace_id: 'trace-1',
        langfuse_expected: true,
        langfuse_delivery_status: 'failed',
        langfuse_drop_reason: 'relay_429',
        input_tokens: 120,
        input_tokens_provider: 120,
        input_tokens_effective: 180,
        output_tokens: 45,
        total_tokens: 225,
        cache_read_input_tokens: 50,
        cache_creation_input_tokens: 10,
        uncached_input_tokens: 70,
        estimated_context_tokens: 156,
        cache_hit_ratio: 50 / 180,
        cache_token_source: 'anthropic',
        queue_duration_ms: 120,
        pre_spawn_duration_ms: 80,
        process_spawn_duration_ms: 40,
        time_to_first_token_ms: 500,
        spawn_to_first_token_ms: 460,
        generation_duration_ms: 800,
        tool_call_count: 2,
        tool_duration_ms: 350,
        finalize_duration_ms: 30,
      },
    } satisfies Extract<AnalyticsEventPayload, { event: 'run_finished' }>;

    expect(payload.props.failure_category).toBe('rate_limit');
    expect(payload.props.failure_stage).toBe('session_init');
    expect(payload.props.user_action).toBe('retry');
    expect(payload.props.langfuse_delivery_status).toBe('failed');
    expect(payload.props.langfuse_drop_reason).toBe('relay_429');
    expect(payload.props.cache_token_source).toBe('anthropic');
    expect(payload.props.total_duration_ms).toBe(1234);
    expect(payload.props.tool_call_count).toBe(2);
  });
});
