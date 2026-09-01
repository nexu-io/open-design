import { describe, expect, it } from 'vitest';

import {
  collectStderrTailSummary,
  collectStdoutTailSummary,
  summarizeRunDiagnosticsForAnalytics,
} from '../src/run-diagnostics.js';

describe('run diagnostics', () => {
  it('summarizes tool execution lifecycle evidence with bounded low-cardinality fields', () => {
    const result = summarizeRunDiagnosticsForAnalytics({
      events: [
        {
          event: 'agent',
          data: {
            type: 'diagnostic',
            name: 'tool_execution_lifecycle',
            schema: 'vela.tool_execution_lifecycle',
            version: 1,
            toolCallIdHash: 'acp_deadbeefdeadbeefdeadbeef',
            trigger: 'deadline',
            terminal: 'interrupted',
            droppedEvents: 2,
            events: [
              { phase: 'kill_requested' },
              { phase: 'kill_sent' },
              { phase: 'close', stdoutClosed: true, stderrClosed: false },
            ],
            toolTerminal: { source: 'processor_cleanup', confirmed: false },
          },
        },
      ],
    });

    expect(result).toMatchObject({
      tool_execution_lifecycle_seen: true,
      tool_execution_lifecycle_count_bucket: '1',
      tool_execution_trigger: 'deadline',
      tool_execution_terminal: 'interrupted',
      tool_terminal_source: 'processor_cleanup',
      tool_kill_outcome: 'sent',
      tool_child_close_seen: true,
      tool_stdout_close_seen: true,
      tool_stderr_close_seen: false,
      tool_execution_evidence_incomplete: true,
    });
    expect(JSON.stringify(result)).not.toContain('acp_deadbeefdeadbeefdeadbeef');
  });

  it('aggregates only the latest lifecycle snapshot for each tool execution', () => {
    const toolCallIdHash = 'acp_0123456789abcdef01234567';
    const result = summarizeRunDiagnosticsForAnalytics({
      events: [
        {
          event: 'agent',
          data: {
            type: 'diagnostic',
            name: 'tool_execution_lifecycle',
            schema: 'vela.tool_execution_lifecycle',
            version: 1,
            toolCallIdHash,
            terminal: 'running',
          },
        },
        {
          event: 'agent',
          data: {
            type: 'diagnostic',
            name: 'tool_execution_lifecycle',
            schema: 'vela.tool_execution_lifecycle',
            version: 1,
            toolCallIdHash,
            trigger: 'exit',
            terminal: 'returned',
            events: [{ phase: 'close', stdoutClosed: true, stderrClosed: true }],
            toolTerminal: { source: 'tool_result', confirmed: true },
          },
        },
      ],
    });

    expect(result).toMatchObject({
      tool_execution_lifecycle_count_bucket: '1',
      tool_execution_terminal: 'returned',
      tool_execution_evidence_incomplete: false,
    });
  });

  it('bounds lifecycle aggregation to the latest 64 distinct diagnostics', () => {
    const events = Array.from({ length: 100 }, (_, index) => ({
      event: 'agent',
      data: {
        type: 'diagnostic',
        name: 'tool_execution_lifecycle',
        schema: 'vela.tool_execution_lifecycle',
        version: 1,
        toolCallIdHash: `acp_${index.toString(16).padStart(24, '0')}`,
        trigger: index < 36 ? 'deadline' : 'exit',
        terminal: 'returned',
        events: [{ phase: 'close', stdoutClosed: true, stderrClosed: true }],
        toolTerminal: { source: 'tool_result', confirmed: true },
      },
    }));

    expect(summarizeRunDiagnosticsForAnalytics({ events })).toMatchObject({
      tool_execution_lifecycle_count_bucket: 'gt_20',
      tool_execution_trigger: 'exit',
      tool_execution_terminal: 'returned',
      tool_terminal_source: 'tool_result',
      tool_execution_evidence_incomplete: false,
    });
  });

  it('ignores arbitrary persisted diagnostic objects without blocking run_finished', () => {
    const circular: Record<string, unknown> = { command: 'cat /private/secret' };
    circular.self = circular;
    const events = [{
      event: 'agent',
      data: {
        type: 'diagnostic',
        name: 'tool_execution_lifecycle',
        schema: 'vela.tool_execution_lifecycle',
        version: 1,
        toolCallIdHash: 'acp_0123456789abcdef01234567',
        trigger: 'exit',
        terminal: 'returned',
        events: [{ phase: 'close', stdoutClosed: true, stderrClosed: true }],
        toolTerminal: { source: 'tool_result', confirmed: true },
        metadata: circular,
      },
    }];

    expect(() => summarizeRunDiagnosticsForAnalytics({ events })).not.toThrow();
    const serialized = JSON.stringify(summarizeRunDiagnosticsForAnalytics({ events }));
    expect(serialized).not.toContain('/private/secret');
    expect(serialized).not.toContain('command');
  });

  it('summarizes stderr into redacted bounded tails for Langfuse', () => {
    const events = Array.from({ length: 25 }, (_, i) => ({
      event: 'stderr',
      data: {
        chunk: `line ${i + 1} OPENAI_API_KEY=sk-${'a'.repeat(48)}\n`,
      },
    }));

    const summary = collectStderrTailSummary(events);

    expect(summary).toBeTruthy();
    expect(summary?.lineCount).toBe(25);
    expect(summary?.truncated).toBe(true);
    expect(summary?.tail).toContain('line 6');
    expect(summary?.tail).toContain('[REDACTED:sk_key]');
    expect(summary?.tail).not.toContain('sk-');
  });

  it('flags resume_auto_reseeded when an agent_resume_auto_reseed event is present', () => {
    const result = summarizeRunDiagnosticsForAnalytics({
      events: [
        { event: 'diagnostic', data: { type: 'agent_resume_auto_reseed', agent_id: 'amr', reason: 'resume_failed' } },
        { event: 'diagnostic', data: { type: 'runtime_close', rpc_close_reason: 'exit_0' } },
      ],
      exitCode: 0,
      signal: null,
    });
    expect(result.resume_auto_reseeded).toBe(true);
    // The reseed succeeded transparently — terminal reason is a clean exit.
    expect(result.rpc_close_reason).toBe('exit_0');
  });

  it('flags resume_auto_reseeded from native session recovery diagnostics', () => {
    const result = summarizeRunDiagnosticsForAnalytics({
      events: [
        {
          event: 'diagnostic',
          data: {
            type: 'native_session_recovery',
            nativeSessionRecovery: { state: 'auto_reseeded' },
          },
        },
      ],
      exitCode: 0,
      signal: null,
    });

    expect(result.resume_auto_reseeded).toBe(true);
  });

  it('returns only low-cardinality stderr fields for PostHog analytics', () => {
    const result = summarizeRunDiagnosticsForAnalytics({
      events: [
        { event: 'stderr', data: { chunk: 'warning 1\nwarning 2\n' } },
      ],
      exitCode: 1,
      signal: null,
    });

    expect(result).toEqual({
      diagnostic_source: 'stderr',
      stderr_present: true,
      stderr_line_count_bucket: '1_5',
      stdout_present: false,
      stdout_line_count_bucket: 'none',
      rpc_close_reason: 'exit_nonzero',
      first_token_seen: false,
      user_visible_output_seen: false,
      tool_call_seen: false,
      tool_result_sent: false,
      approval_requested: false,
      artifact_write_seen: false,
      live_artifact_seen: false,
      resume_auto_reseeded: false,
    });
  });

  it('counts stderr lines from the merged stream, not per-chunk', () => {
    // The merged stream is exactly 5 non-empty lines ('1_5' bucket), but the
    // final line is split across two chunks. Summing per-chunk counts would
    // double-count the split line as 6 lines and drift into the '6_20' bucket.
    const result = summarizeRunDiagnosticsForAnalytics({
      events: [
        { event: 'stderr', data: { chunk: 'line1\nline2\nline3\nline4\nli' } },
        { event: 'stderr', data: { chunk: 'ne5' } },
      ],
      exitCode: 1,
      signal: null,
    });

    expect(result).toEqual({
      diagnostic_source: 'stderr',
      stderr_present: true,
      stderr_line_count_bucket: '1_5',
      stdout_present: false,
      stdout_line_count_bucket: 'none',
      rpc_close_reason: 'exit_nonzero',
      first_token_seen: false,
      user_visible_output_seen: false,
      tool_call_seen: false,
      tool_result_sent: false,
      approval_requested: false,
      artifact_write_seen: false,
      live_artifact_seen: false,
      resume_auto_reseeded: false,
    });
  });

  it('prefers structured error events over stderr as diagnostic source', () => {
    const result = summarizeRunDiagnosticsForAnalytics({
      events: [
        { event: 'stderr', data: { chunk: 'raw provider warning\n' } },
        { event: 'error', data: { message: 'typed failure' } },
      ],
      exitCode: 1,
      signal: null,
    });

    expect(result).toEqual({
      diagnostic_source: 'error_event',
      stderr_present: true,
      stderr_line_count_bucket: '1_5',
      stdout_present: false,
      stdout_line_count_bucket: 'none',
      rpc_close_reason: 'exit_nonzero',
      first_token_seen: false,
      user_visible_output_seen: false,
      tool_call_seen: false,
      tool_result_sent: false,
      approval_requested: false,
      artifact_write_seen: false,
      live_artifact_seen: false,
      resume_auto_reseeded: false,
    });
  });

  it('summarizes stdout into redacted bounded tails for Langfuse', () => {
    const summary = collectStdoutTailSummary([
      { event: 'stdout', data: { chunk: 'visible line\nOPENAI_API_KEY=sk-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n' } },
    ]);

    expect(summary).toBeTruthy();
    expect(summary?.lineCount).toBe(2);
    expect(summary?.tail).toContain('visible line');
    expect(summary?.tail).toContain('[REDACTED:sk_key]');
    expect(summary?.tail).not.toContain('sk-');
  });

  it('captures close reason and side-effect flags for aggregation', () => {
    const result = summarizeRunDiagnosticsForAnalytics({
      events: [
        { event: 'stdout', data: { chunk: 'hello\n' } },
        { event: 'agent', data: { type: 'tool_use', name: 'Read', id: 'tool-1' } },
        { event: 'agent', data: { type: 'artifact' } },
      ],
      exitCode: null,
      signal: 'SIGTERM',
      firstTokenSeen: true,
      liveArtifactSeen: true,
    });

    expect(result).toMatchObject({
      diagnostic_source: 'signal',
      stdout_present: true,
      stdout_line_count_bucket: '1_5',
      rpc_close_reason: 'signal',
      first_token_seen: true,
      user_visible_output_seen: true,
      tool_call_seen: true,
      // A tool_use with no following tool_result → not delivered.
      tool_result_sent: false,
      approval_requested: false,
      artifact_write_seen: true,
      live_artifact_seen: true,
    });
  });

  it('flags tool_result_sent / approval_requested (E-lite root-cause discriminators)', () => {
    // Every committed tool_use resolved (paired by id) → delivered.
    const resolved = summarizeRunDiagnosticsForAnalytics({
      events: [
        { event: 'agent', data: { type: 'tool_use', name: 'Read', id: 't1' } },
        { event: 'agent', data: { type: 'tool_result', toolUseId: 't1' } },
      ],
      exitCode: 0,
      signal: null,
    });
    expect(resolved.tool_call_seen).toBe(true);
    expect(resolved.tool_result_sent).toBe(true);

    // Two parallel tool_uses both resolve (interleaved) → delivered.
    const parallelResolved = summarizeRunDiagnosticsForAnalytics({
      events: [
        { event: 'agent', data: { type: 'tool_use', name: 'Read', id: 'a' } },
        { event: 'agent', data: { type: 'tool_use', name: 'Grep', id: 'b' } },
        { event: 'agent', data: { type: 'tool_result', toolUseId: 'a' } },
        { event: 'agent', data: { type: 'tool_result', toolUseId: 'b' } },
      ],
      exitCode: 0,
      signal: null,
    });
    expect(parallelResolved.tool_result_sent).toBe(true);

    // The reviewer's regression case: tool_use(A), tool_use(B), tool_result(A).
    // B is still outstanding, so a result arriving for A must NOT mark delivered.
    const parallelHung = summarizeRunDiagnosticsForAnalytics({
      events: [
        { event: 'agent', data: { type: 'tool_use', name: 'Read', id: 'a' } },
        { event: 'agent', data: { type: 'tool_use', name: 'Bash', id: 'b' } },
        { event: 'agent', data: { type: 'tool_result', toolUseId: 'a' } },
      ],
      exitCode: null,
      signal: 'SIGKILL',
    });
    expect(parallelHung.tool_call_seen).toBe(true);
    expect(parallelHung.tool_result_sent).toBe(false);

    // The last tool_use of a sequential turn has no result → not delivered.
    const hung = summarizeRunDiagnosticsForAnalytics({
      events: [
        { event: 'agent', data: { type: 'tool_use', name: 'Read', id: 'a' } },
        { event: 'agent', data: { type: 'tool_result', toolUseId: 'a' } },
        { event: 'agent', data: { type: 'tool_use', name: 'Bash', id: 'b' } },
      ],
      exitCode: null,
      signal: 'SIGKILL',
    });
    expect(hung.tool_call_seen).toBe(true);
    expect(hung.tool_result_sent).toBe(false);

    // Degraded provider events carry a null id on BOTH sides (pi-rpc,
    // copilot-stream emit `toolCallId ?? null`). An unpaired id-less tool call
    // must NOT fall through to "delivered".
    const idlessHung = summarizeRunDiagnosticsForAnalytics({
      events: [
        { event: 'agent', data: { type: 'tool_use', name: 'Read', id: null } },
      ],
      exitCode: null,
      signal: 'SIGKILL',
    });
    expect(idlessHung.tool_call_seen).toBe(true);
    expect(idlessHung.tool_result_sent).toBe(false);

    // ...but an id-less tool call that DID get its (also id-less) result counts.
    const idlessResolved = summarizeRunDiagnosticsForAnalytics({
      events: [
        { event: 'agent', data: { type: 'tool_use', name: 'Read', id: null } },
        { event: 'agent', data: { type: 'tool_result', toolUseId: null } },
      ],
      exitCode: 0,
      signal: null,
    });
    expect(idlessResolved.tool_result_sent).toBe(true);

    // An ACP approval diagnostic flips approval_requested.
    const approved = summarizeRunDiagnosticsForAnalytics({
      events: [
        {
          event: 'agent',
          data: { type: 'diagnostic', name: 'acp_approval_request', optionId: 'allow_once' },
        },
      ],
      exitCode: 0,
      signal: null,
    });
    expect(approved.approval_requested).toBe(true);
  });

  it('surfaces bounded AMR OpenCode timeout context from structured RPC error details', () => {
    const result = summarizeRunDiagnosticsForAnalytics({
      events: [
        {
          event: 'error',
          data: {
            message: 'json-rpc id 4: opencode prompt timed out after 30m0s',
            error: {
              code: 'AGENT_EXECUTION_FAILED',
              details: {
                kind: 'opencode_prompt_error',
                phase: 'timeout',
                runtime: 'opencode',
                openCodeSessionId: 'session-must-not-reach-analytics',
                lastEventType: 'tool_call',
                lastToolCallId: 'call-must-not-reach-analytics',
                lastToolStatus: 'in_progress',
                lastToolKind: 'write',
              },
            },
          },
        },
      ],
      exitCode: 1,
      signal: null,
    });

    expect(result).toMatchObject({
      amr_opencode_error_phase: 'timeout',
      amr_opencode_last_event_type: 'tool_call',
      amr_opencode_last_tool_status: 'in_progress',
      amr_opencode_last_tool_kind: 'write',
    });
    expect(JSON.stringify(result)).not.toContain('session-must-not-reach-analytics');
    expect(JSON.stringify(result)).not.toContain('call-must-not-reach-analytics');
  });

  it('surfaces AMR OpenCode timeout context when structured details omit runtime', () => {
    const result = summarizeRunDiagnosticsForAnalytics({
      events: [
        {
          event: 'error',
          data: {
            error: {
              details: {
                kind: 'opencode_prompt_error',
                phase: 'timeout',
                lastEventType: 'tool_call_update',
                lastToolStatus: 'completed',
                lastToolKind: 'read',
              },
            },
          },
        },
      ],
      exitCode: 1,
      signal: null,
    });

    expect(result).toMatchObject({
      amr_opencode_error_phase: 'timeout',
      amr_opencode_last_event_type: 'tool_call_update',
      amr_opencode_last_tool_status: 'completed',
      amr_opencode_last_tool_kind: 'read',
    });
  });

  it('buckets unknown AMR OpenCode context instead of forwarding raw values', () => {
    const result = summarizeRunDiagnosticsForAnalytics({
      events: [
        {
          event: 'error',
          data: {
            error: {
              details: {
                kind: 'opencode_prompt_error',
                runtime: 'opencode',
                phase: 'customer-specific-phase',
                lastEventType: 'custom.plugin.event',
                lastToolStatus: 'waiting_for_customer_secret',
                lastToolKind: 'mcp_customer_secret_tool',
              },
            },
          },
        },
      ],
      exitCode: 1,
      signal: null,
    });

    expect(result).toMatchObject({
      amr_opencode_error_phase: 'other',
      amr_opencode_last_event_type: 'other',
      amr_opencode_last_tool_status: 'other',
      amr_opencode_last_tool_kind: 'other',
    });
    expect(JSON.stringify(result)).not.toContain('customer');
    expect(JSON.stringify(result)).not.toContain('custom.plugin.event');
  });
});
