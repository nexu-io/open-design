import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachAcpSession } from '../src/agent-protocol/acp/session.js';
import {
  summarizeRunDiagnosticsForAnalytics,
  summarizeRunToolProgress,
  type RunEventForDiagnostics,
} from '../src/run-diagnostics.js';
import { classifyRunFailure } from '../src/run-failure-classification.js';

class InMemoryAcpChild extends EventEmitter {
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  kill() { return true; }
}

const sessions: ReturnType<typeof attachAcpSession>[] = [];
afterEach(() => {
  for (const session of sessions.splice(0)) session.abort();
  vi.useRealTimers();
});

function startAttempt(events: RunEventForDiagnostics[] = []) {
  vi.useFakeTimers();
  const child = new InMemoryAcpChild();
  events.push({ event: 'start', data: {} });
  const session = attachAcpSession({
    child: child as never,
    prompt: 'Synthetic diagnostics fixture',
    stageTimeoutMs: 100,
    // Like the daemon transcript path, retain payloads without copying the
    // bridge's out-of-band metadata into the public event record.
    send: (event, data) => events.push({ event, data }),
  });
  sessions.push(session);
  const frame = (value: unknown) => child.stdout.write(JSON.stringify(value) + '\n');
  frame({ id: 1, result: {} });
  frame({ id: 2, result: { sessionId: 'fixture-session' } });
  const tool = (id: string, status: string, kind = 'execute') => frame({
    method: 'session/update',
    params: { update: { sessionUpdate: 'tool_call_update', toolCallId: id, kind, status } },
  });
  return { events, session, frame, tool };
}

function failureStage(events: RunEventForDiagnostics[]) {
  const error = events.slice().reverse().find(({ event }) => event === 'error')?.data as
    { message?: string } | undefined;
  return classifyRunFailure({
    result: 'failed',
    status: { status: 'failed', error: error?.message ?? 'ACP response timed out', exitCode: 1, signal: null },
    errorCode: 'AGENT_EXIT_1',
    agentId: 'amr',
    events,
  })?.failure_stage;
}

function expectOutstanding(events: RunEventForDiagnostics[]) {
  expect(summarizeRunToolProgress(events)).toEqual({
    toolCallSeen: true, toolResultSent: false, hasOutstandingTool: true,
  });
  expect(summarizeRunDiagnosticsForAnalytics({ events })).toMatchObject({
    tool_call_seen: true, tool_result_sent: false,
  });
  expect(failureStage(events)).toBe('tool_outstanding');
}

function toolEvents(events: RunEventForDiagnostics[]) {
  return events.filter(({ data }) => (data as { type?: string })?.type?.startsWith('tool_'));
}

describe('ACP tool completion diagnostics', () => {
  it.each([
    ['execute', 'pending'], ['execute', 'in_progress'], ['write', 'pending'],
  ])('keeps %s / %s outstanding after a host timeout flush', async (kind, status) => {
    const attempt = startAttempt();
    attempt.tool('open-tool', status, kind);
    await vi.advanceTimersByTimeAsync(100);
    expect(attempt.events.some(({ event }) => event === 'error')).toBe(true);
    expect(toolEvents(attempt.events)).toHaveLength(2);
    expect(toolEvents(attempt.events)[1]?.data).toMatchObject({ type: 'tool_result', isError: true });
    expectOutstanding(attempt.events);
  });

  it('keeps a pending tool outstanding when the agent reports an SSE disconnect', () => {
    const attempt = startAttempt();
    attempt.tool('open-tool', 'pending', 'write');
    attempt.frame({
      id: 3,
      error: {
        code: -32603,
        message: 'SSE stream disconnected',
        data: {
          kind: 'opencode_prompt_error', runtime: 'opencode', phase: 'event_stream',
          lastEventType: 'tool_call_update', lastToolKind: 'write', lastToolStatus: 'pending',
        },
      },
    });
    expect(attempt.session.hasFatalError()).toBe(true);
    // The chat close handler adds this verdict before classifying the run.
    attempt.events.push({
      event: 'diagnostic', data: { type: 'runtime_close', rpc_close_reason: 'fatal_rpc_error' },
    });
    expect(toolEvents(attempt.events)).toHaveLength(2);
    expectOutstanding(attempt.events);
  });

  it.each(['completed', 'failed'])('retains agent-confirmed %s results', async (status) => {
    const attempt = startAttempt();
    attempt.tool('real-tool', 'in_progress');
    attempt.tool('real-tool', status);
    await vi.advanceTimersByTimeAsync(100);
    expect(summarizeRunToolProgress(attempt.events)).toEqual({
      toolCallSeen: true, toolResultSent: true, hasOutstandingTool: false,
    });
    expect(failureStage(attempt.events)).toBe('post_tool_resume');
    expect(toolEvents(attempt.events)).toHaveLength(2);
  });

  it('does not let a completed parallel tool hide a host-flushed tool', async () => {
    const attempt = startAttempt();
    attempt.tool('real-tool', 'completed');
    attempt.tool('open-tool', 'in_progress');
    await vi.advanceTimersByTimeAsync(100);
    expect(toolEvents(attempt.events)).toHaveLength(4);
    expectOutstanding(attempt.events);
  });

  it('ignores late terminals and duplicate flushes after the failure verdict', async () => {
    const attempt = startAttempt();
    attempt.tool('open-tool', 'pending');
    await vi.advanceTimersByTimeAsync(100);
    const count = attempt.events.length;
    attempt.tool('open-tool', 'completed');
    attempt.session.abort();
    attempt.session.abort();
    expect(attempt.events).toHaveLength(count);
    expectOutstanding(attempt.events);
  });

  it.each([true, false])('isolates reused tool ids across attempts (first completed: %s)', async (firstCompleted) => {
    const first = startAttempt();
    first.tool('reused-tool', firstCompleted ? 'completed' : 'pending');
    await vi.advanceTimersByTimeAsync(100);
    const second = startAttempt(first.events);
    second.tool('reused-tool', firstCompleted ? 'pending' : 'completed');
    await vi.advanceTimersByTimeAsync(100);
    if (firstCompleted) expectOutstanding(second.events);
    else {
      expect(summarizeRunToolProgress(second.events).toolResultSent).toBe(true);
      expect(failureStage(second.events)).toBe('post_tool_resume');
    }
  });

  it('does not carry an earlier outstanding tool into a tool-free attempt', async () => {
    const first = startAttempt();
    first.tool('previous-tool', 'pending');
    await vi.advanceTimersByTimeAsync(100);
    const second = startAttempt(first.events);
    await vi.advanceTimersByTimeAsync(100);
    expect(summarizeRunToolProgress(second.events)).toEqual({
      toolCallSeen: false, toolResultSent: false, hasOutstandingTool: false,
    });
    expect(failureStage(second.events)).toBe('first_token_wait');
  });

  it('keeps a best-effort clean flush distinct from confirmed tool completion', () => {
    const attempt = startAttempt();
    attempt.tool('open-tool', 'pending');
    attempt.frame({ id: 3, result: { stopReason: 'end_turn' } });
    expect(attempt.session.completedSuccessfully()).toBe(true);
    expect(toolEvents(attempt.events)[1]?.data).toMatchObject({ isError: false });
    expectOutstanding(attempt.events);
  });

  it('does not serialize provenance or reinterpret unmarked legacy pairs', async () => {
    const attempt = startAttempt();
    attempt.tool('open-tool', 'pending');
    await vi.advanceTimersByTimeAsync(100);
    const serialized = JSON.stringify(attempt.events);
    expect(serialized).not.toContain('hostSynthesized');
    expect(serialized).not.toContain('host_flush');
    // Persistence has no completion provenance contract. Existing records keep
    // their legacy behavior; this change must not guess their origin from text.
    expect(summarizeRunToolProgress(JSON.parse(serialized)).toolResultSent).toBe(true);
    expectOutstanding(attempt.events);
  });

  it('preserves idless pairing and does not trust payload-supplied provenance', () => {
    const events = [
      { event: 'agent', data: { type: 'tool_use', id: null } },
      { event: 'agent', data: { type: 'tool_result', toolUseId: null, hostSynthesized: true } },
    ];
    expect(summarizeRunToolProgress(events)).toEqual({
      toolCallSeen: true, toolResultSent: true, hasOutstandingTool: false,
    });
  });
});
