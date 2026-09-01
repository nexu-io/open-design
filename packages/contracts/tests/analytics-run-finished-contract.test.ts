import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  AnalyticsEventPayload,
  RunFinishedProps,
} from '../src/analytics/events.js';
import { EVENT_SCHEMA_VERSION } from '../src/analytics/public-params.js';
import { buildRunFinishedV4Aliases } from '../src/analytics/run-schema-v4.js';

function makeBaseRunFinishedProps(): RunFinishedProps {
  return {
    page_name: 'chat_panel',
    area: 'chat_panel',
    project_id: 'proj-1',
    conversation_id: 'conv-1',
    run_id: 'run-1',
    task_execution_id: 'task-1',
    initial_run_id: 'run-1',
    task_run_index: 0,
    project_kind: 'prototype',
    design_system_source: 'not_applicable',
    has_attachment: false,
    has_attachments: false,
    user_query_tokens: 24,
    model_id: 'claude-sonnet-4-5',
    agent_provider_id: 'claude_code',
    skill_id: null,
    mcp_id: null,
    token_count_source: 'unknown',
    tokens: {
      usage_count_source: 'unknown',
      user_query_tokens: 24,
    },
    result: 'failed',
    artifact_count: 0,
    asked_user_question: false,
    clarification_requested: false,
    primary_artifact_change: 'none',
    total_duration_ms: 1234,
    timing: { total_duration_ms: 1234 },
  };
}

describe('analytics run_finished contract', () => {
  it('accepts v3 evidence without retiring v2 or requiring new fields on legacy events', () => {
    expectTypeOf<RunFinishedProps['classifier_version']>()
      .toEqualTypeOf<'run-failure-v2' | 'run-failure-v3' | undefined>();
    expectTypeOf<RunFinishedProps['admission_phase']>()
      .toEqualTypeOf<'before_execution' | 'during_execution' | 'unknown' | undefined>();
    expectTypeOf<RunFinishedProps['admission_status']>()
      .toEqualTypeOf<'admitted' | 'rejected_policy' | 'unknown' | undefined>();
  });

  it('uses schema v4 for the task-level, aggregated run payload', () => {
    expect(EVENT_SCHEMA_VERSION).toBe(4);
  });

  it('keeps artifact write facts and groups failure-only runtime timings', () => {
    const aliases = buildRunFinishedV4Aliases({
      result: 'failed',
      user_query_tokens: 12,
      token_count_source: 'provider_usage',
      artifact_count: 2,
      artifact_write_duration_ms: 90,
      artifact_write_status: 'completed',
      artifact_write_source: 'write_tool',
      asked_user_question: false,
      total_duration_ms: 1_000,
      pre_spawn_duration_ms: 20,
      model_first_token_ms: 300,
    }, {
      task_execution_id: 'task-1',
      initial_run_id: 'run-1',
      task_run_index: 0,
    }, {
      artifactFiles: {
        changed_file_count: 1,
        created_file_count: 0,
        modified_file_count: 1,
      },
    });

    expect(aliases.run_activity?.artifacts).toEqual({
      changed_file_count: 1,
      created_file_count: 0,
      modified_file_count: 1,
      write_duration_ms: 90,
      write_status: 'completed',
      write_source: 'write_tool',
    });
    expect(aliases.diagnostics?.runtime_timing).toEqual({
      pre_spawn_duration_ms: 20,
      model_first_token_ms: 300,
    });
  });

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
        conversation_turn_index: 2,
        error_code: 'RATE_LIMITED',
        failure_category: 'rate_limit',
        failure_stage: 'session_init',
        failure_mechanism: 'policy_rejection',
        failure_domain: 'policy_admission',
        evidence_level: 'structured_code',
        repair_owner: 'policy_owner',
        admission_status: 'rejected_policy',
        terminal_integrity: 'reconciled',
        classifier_version: 'run-failure-v2',
        retryable: true,
        user_action: 'retry',
        terminal_reconciled: true,
        terminal_recovery_reason: 'daemon_restart',
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
        tool_result_sent: false,
        approval_requested: true,
        tool_execution_lifecycle_seen: true,
        tool_execution_lifecycle_count_bucket: '2_5',
        tool_execution_trigger: 'deadline',
        tool_execution_terminal: 'interrupted',
        tool_terminal_source: 'processor_cleanup',
        tool_kill_outcome: 'sent',
        tool_child_close_seen: true,
        tool_stdout_close_seen: true,
        tool_stderr_close_seen: false,
        tool_execution_evidence_incomplete: true,
        stdin_backpressure: false,
        last_progress_age_ms: 610_000,
        amr_opencode_error_phase: 'timeout',
        amr_opencode_last_event_type: 'tool_call',
        amr_opencode_last_tool_status: 'in_progress',
        amr_opencode_last_tool_kind: 'write',
        artifact_write_seen: false,
        live_artifact_seen: false,
        retry_attempt_count: 1,
        retry_final_result: 'success',
        agent_cli_version: 'vela 0.0.26',
        runtime_companion_name: 'opencode',
        runtime_companion_version: 'opencode 1.2.3',
        retry_original_failure_category: 'upstream_unavailable',
        retry_original_failure_detail: 'stream_disconnected',
        retry_original_failure_stage: 'first_token_wait',
        source_run_id: 'run-0',
        task_run_index: 1,
        recovery_action_type: 'manual_retry',
        recovery_action_instance_id: 'recovery-1',
        entry_source: 'chat_composer',
        interaction_mode: 'design',
        failure_reason: 'rate_limit_429',
        is_automatic_retry_eligible: true,
        run_context: {
          session_run_index: 3,
          project_run_index: 4,
          has_existing_artifacts: true,
          is_followup_run: true,
        },
        capabilities: {
          plugin_id: 'landing-page',
          skill_ids: ['frontend-design'],
          mcp_server_ids: ['figma'],
        },
        tokens: {
          usage_count_source: 'provider_usage',
          cache_token_source: 'anthropic',
          input_accounting_mode: 'additive',
          user_query_tokens: 24,
          provider_input_tokens: 120,
          effective_input_tokens: 180,
          output_tokens: 45,
          cache_read_tokens: 50,
          cache_write_tokens: 10,
          first_model_call: {
            provider_input_tokens: 100,
            effective_input_tokens: 150,
            cache_read_tokens: 40,
            cache_write_tokens: 10,
          },
        },
        timing: {
          total_duration_ms: 1234,
          queue_duration_ms: 120,
          process_spawn_duration_ms: 40,
          time_to_first_token_ms: 500,
          generation_duration_ms: 800,
          finalize_duration_ms: 30,
          collection_status: 'complete',
        },
        automatic_retry: {
          retry_count: 1,
          outcome: 'success',
        },
        run_activity: {
          tools: { call_count: 2, duration_ms: 350 },
          artifacts: {
            changed_file_count: 1,
            created_file_count: 0,
            modified_file_count: 1,
            supporting_asset_files_changed_count: 0,
          },
        },
        diagnostics: {
          failure_signal_source: 'error_event',
          run_close_reason: 'stream_error',
          last_observed_phase: 'first_token_wait',
          stderr_line_count_bucket: '1_5',
          stdout_line_count_bucket: '1_5',
          first_token_seen: true,
          user_visible_output_seen: true,
          tool_call_seen: true,
          artifact_write_seen: false,
          live_artifact_seen: false,
        },
        langfuse_delivery: {
          delivery_status: 'failed',
          drop_reason: 'relay_429',
        },
      },
    } satisfies Extract<AnalyticsEventPayload, { event: 'run_finished' }>;

    expect(payload.props.failure_category).toBe('rate_limit');
    expect(payload.props.conversation_turn_index).toBe(2);
      expect(payload.props.failure_stage).toBe('session_init');
      expect(payload.props.failure_domain).toBe('policy_admission');
      expect(payload.props.classifier_version).toBe('run-failure-v2');
    expect(payload.props.terminal_reconciled).toBe(true);
    expect(payload.props.terminal_recovery_reason).toBe('daemon_restart');
    expect(payload.props.user_action).toBe('retry');
    expect(payload.props.langfuse_delivery_status).toBe('failed');
    expect(payload.props.langfuse_drop_reason).toBe('relay_429');
    expect(payload.props.cache_token_source).toBe('anthropic');
    expect(payload.props.total_duration_ms).toBe(1234);
    expect(payload.props.tool_call_count).toBe(2);
    expect(payload.props.rpc_close_reason).toBe('stream_error');
    expect(payload.props.first_token_seen).toBe(true);
    expect(payload.props.tool_result_sent).toBe(false);
    expect(payload.props.approval_requested).toBe(true);
    expect(payload.props.tool_execution_trigger).toBe('deadline');
    expect(payload.props.tool_terminal_source).toBe('processor_cleanup');
    expect(payload.props.tool_execution_evidence_incomplete).toBe(true);
    expect(payload.props.stdin_backpressure).toBe(false);
    expect(payload.props.last_progress_age_ms).toBe(610_000);
    expect(payload.props.amr_opencode_error_phase).toBe('timeout');
    expect(payload.props.amr_opencode_last_tool_status).toBe('in_progress');
    expect(payload.props.retry_attempt_count).toBe(1);
    expect(payload.props.retry_final_result).toBe('success');
    expect(payload.props.agent_cli_version).toBe('vela 0.0.26');
    expect(payload.props.runtime_companion_version).toBe('opencode 1.2.3');
    expect(payload.props.retry_original_failure_detail).toBe('stream_disconnected');
    expect(payload.props.task_execution_id).toBe('task-1');
    expect(payload.props.tokens.input_accounting_mode).toBe('additive');
    expect(payload.props.run_activity?.artifacts?.modified_file_count).toBe(1);
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

  it.each(['tool_outstanding', 'post_tool_resume'] as const)(
    'accepts the %s failure stage for run outcomes',
    (failureStage) => {
      const payload = {
        event: 'run_finished',
        props: {
          ...makeBaseRunFinishedProps(),
          failure_category: 'timeout',
          failure_detail: 'inactivity_timeout',
          failure_stage: failureStage,
          retryable: true,
          user_action: 'retry',
        },
      } satisfies Extract<AnalyticsEventPayload, { event: 'run_finished' }>;

      expect(payload.props.failure_stage).toBe(failureStage);
    },
  );

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
        langfuse_report_trigger: 'terminal_fallback',
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

  it('accepts privacy-safe BYOK preflight block events', () => {
    const payload = {
      event: 'byok_preflight_blocked',
      props: {
        source: 'settings',
        reason: 'api_key_required',
        provider_id: 'anthropic',
        active_execution_mode: 'local_cli',
      },
    } satisfies Extract<
      AnalyticsEventPayload,
      { event: 'byok_preflight_blocked' }
    >;

    expect(payload.props).toEqual({
      source: 'settings',
      reason: 'api_key_required',
      provider_id: 'anthropic',
      active_execution_mode: 'local_cli',
    });
  });
});
