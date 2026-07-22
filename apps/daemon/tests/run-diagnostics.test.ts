import { describe, expect, it } from 'vitest';

import {
  collectStderrTailSummary,
  collectStdoutTailSummary,
  summarizeRunDiagnosticsForAnalytics,
} from '../src/run-diagnostics.js';

describe('run diagnostics', () => {
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
});
