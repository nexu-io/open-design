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
        diagnostic_source: 'error_event',
        stderr_present: true,
        stderr_line_count_bucket: '1_5',
        stdout_present: true,
        stdout_line_count_bucket: '1_5',
        rpc_close_reason: 'stream_error',
        first_token_seen: true,
        user_visible_output_seen: true,
        tool_call_seen: true,
        artifact_write_seen: false,
        live_artifact_seen: false,
        retry_attempt_count: 1,
        retry_final_result: 'success',
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
    expect(payload.props.rpc_close_reason).toBe('stream_error');
    expect(payload.props.first_token_seen).toBe(true);
    expect(payload.props.retry_attempt_count).toBe(1);
    expect(payload.props.retry_final_result).toBe('success');
  });

  it('accepts retry attempted and finished lifecycle events', () => {
    const attempted = {
      event: 'run_retry_attempted',
      props: {
        page_name: 'chat_panel',
        area: 'chat_panel',
        project_id: 'proj-1',
        conversation_id: 'conv-1',
        run_id: 'run-1',
        retry_of_run_id: 'run-1',
        retry_attempt_index: 1,
        retry_max_attempts: 2,
        retry_strategy: 'same_run_transient',
        agent_provider_id: 'claude_code',
        model_id: 'claude-sonnet-4-5',
        failure_category: 'upstream_unavailable',
        failure_detail: 'upstream_5xx',
        failure_stage: 'first_token_wait',
        error_code: 'UPSTREAM_UNAVAILABLE',
        retry_reason: 'transient_failure',
      },
    } satisfies Extract<AnalyticsEventPayload, { event: 'run_retry_attempted' }>;

    const finished = {
      event: 'run_retry_finished',
      props: {
        ...attempted.props,
        retry_result: 'suppressed',
        retry_suppressed_reason: 'tool_call_seen',
      },
    } satisfies Extract<AnalyticsEventPayload, { event: 'run_retry_finished' }>;

    expect(attempted.props.retry_strategy).toBe('same_run_transient');
    expect(finished.props.retry_suppressed_reason).toBe('tool_call_seen');
  });

  it('accepts Langfuse report result events for actual delivery monitoring', () => {
    const payload = {
      event: 'langfuse_report_result',
      props: {
        page_name: 'chat_panel',
        area: 'chat_panel',
        project_id: 'proj-1',
        conversation_id: 'conv-1',
        run_id: 'run-1',
        langfuse_trace_id: 'run-1',
        langfuse_expected: true,
        langfuse_delivery_status: 'failed',
        langfuse_drop_reason: 'network_error',
        langfuse_report_result: 'failed',
        langfuse_report_trigger: 'final_message',
        report_duration_ms: 123,
        result: 'failed',
        error_code: 'AGENT_EXECUTION_FAILED',
        agent_provider_id: 'codex_cli',
        model_id: 'default',
      },
    } satisfies Extract<AnalyticsEventPayload, { event: 'langfuse_report_result' }>;

    expect(payload.props.langfuse_report_result).toBe('failed');
    expect(payload.props.langfuse_delivery_status).toBe('failed');
  });
});
