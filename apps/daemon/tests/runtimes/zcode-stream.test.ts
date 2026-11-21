import { describe, expect, it } from 'vitest';
import { createZcodeStreamHandler } from '../../src/runtimes/zcode-stream.js';

type Event = Record<string, unknown>;

function sessionEvent(payload: Record<string, unknown>, seq = 1): Event {
  return { method: 'session/event', params: { seq, deliveryKind: 'desktop-continuous', payload } };
}
function stateUpdated(reason: string): Event {
  return { method: 'state.updated', params: { reason, scope: 'session' } };
}

function collect(frames: Event[]): Event[] {
  const events: Event[] = [];
  const handler = createZcodeStreamHandler((event) => events.push(event));
  for (const frame of frames) handler.handleFrame(frame);
  return events;
}

describe('createZcodeStreamHandler', () => {
  it('maps a plain text turn: reasoning → text → usage → completed', () => {
    const events = collect([
      stateUpdated('prompt_started'),
      sessionEvent({ kind: 'reasoning_delta', delta: 'The', done: false }),
      sessionEvent({ kind: 'reasoning_delta', delta: ' user wants a count.', done: false }),
      sessionEvent({ kind: 'text_delta', delta: '一', done: false }),
      sessionEvent({ kind: 'text_delta', delta: '\n二\n三', done: false }),
      sessionEvent({
        resultType: 'success',
        response: '一\n二\n三',
        tokenCount: 17450,
        duration: 7726,
        toolCallCount: 0,
        usage: {
          inputTokens: 17378,
          outputTokens: 72,
          totalTokens: 17450,
          cacheReadTokens: 16256,
          cacheWriteTokens: 0,
          reasoningTokens: 0,
        },
      }),
      stateUpdated('prompt_completed'),
    ]);

    expect(events).toEqual([
      { type: 'status', label: 'running' },
      { type: 'thinking_start' },
      { type: 'thinking_delta', delta: 'The' },
      { type: 'thinking_delta', delta: ' user wants a count.' },
      { type: 'text_delta', delta: '一' },
      { type: 'text_delta', delta: '\n二\n三' },
      {
        type: 'usage',
        usage: {
          input_tokens: 17378,
          output_tokens: 72,
          thought_tokens: 0,
          cached_read_tokens: 16256,
          cached_write_tokens: 0,
        },
        durationMs: 7726,
      },
      { type: 'status', label: 'completed' },
    ]);
  });

  it('maps a tool call: tool_use + tool_result, dropping input/scheduler/anchor frames', () => {
    const events = collect([
      sessionEvent({ kind: 'tool_input_start', toolCallId: 'call_x', toolName: 'Bash', delta: '' }),
      sessionEvent({ kind: 'tool_input_delta', toolCallId: 'call_x', delta: '{"command":"echo hi"}' }),
      sessionEvent({ kind: 'tool_input_end', toolCallId: 'call_x', delta: '' }),
      sessionEvent({
        kind: 'tool_call',
        toolCallId: 'call_x',
        toolName: 'Bash',
        input: { command: 'echo hi', description: 'print' },
      }),
      // per-iteration result — NOT a turn end, must be ignored
      sessionEvent({ stopReason: 'tool-calls', content: '', usage: { inputTokens: 1 }, toolCallCount: 1 }),
      sessionEvent({ kind: 'scheduled', toolCallId: 'call_x', toolName: 'Bash' }),
      sessionEvent({ kind: 'started', toolCallId: 'call_x', startedAt: 1 }),
      sessionEvent({
        kind: 'result',
        toolCallId: 'call_x',
        result: { success: true, content: 'hi', perf: { exitCode: 0 } },
        duration: 39,
      }),
      sessionEvent({ kind: 'batch', toolCallIds: ['call_x'], successCount: 1, errorCount: 0 }),
      sessionEvent({ kind: 'tool_result', anchorId: 'a:b', toolCallId: 'call_x', committedAt: 'now' }),
      sessionEvent({ resultType: 'success', usage: { inputTokens: 5, outputTokens: 2 }, duration: 10 }),
    ]);

    expect(events).toEqual([
      { type: 'tool_use', id: 'call_x', name: 'Bash', input: { command: 'echo hi', description: 'print' } },
      { type: 'tool_result', toolUseId: 'call_x', content: 'hi', isError: false },
      { type: 'usage', usage: { input_tokens: 5, output_tokens: 2 }, durationMs: 10 },
    ]);
  });

  it('flags a failed tool result as isError', () => {
    const events = collect([
      sessionEvent({
        kind: 'result',
        toolCallId: 'call_y',
        result: { success: false, content: 'command not found' },
      }),
    ]);
    expect(events).toEqual([
      { type: 'tool_result', toolUseId: 'call_y', content: 'command not found', isError: true },
    ]);
  });

  it('maps an upstream failure to an error event + failed status', () => {
    const events = collect([
      sessionEvent({
        error: {
          type: 'unknown_error',
          message: '令牌已过期或验证不正确',
          detail: 'Turn execution failed\nProvider authentication failed.\nreason=auth_failed status=401',
          stack: 'Error: Turn execution failed\n    at ...',
        },
        turnPhase: 'model_request',
      }),
      stateUpdated('prompt_failed'),
    ]);

    expect(events).toEqual([
      {
        type: 'error',
        message: '令牌已过期或验证不正确',
        raw: 'Turn execution failed\nProvider authentication failed.\nreason=auth_failed status=401',
      },
      { type: 'status', label: 'failed' },
    ]);
  });

  it('never forwards model-request telemetry frames (which carry headers)', () => {
    const events = collect([
      sessionEvent({
        type: 'model_request_started',
        baseURL: 'https://open.bigmodel.cn/api/anthropic',
        requestId: 'r1',
        requestHeaders: { 'x-api-key': 'super-secret', authorization: 'Bearer secret' },
        requestHeaderCount: 8,
      }),
      sessionEvent({
        type: 'model_request_failed',
        reason: 'auth_failed',
        statusCode: 401,
        retryable: false,
        responseHeaders: { 'set-cookie': 'session=secret' },
      }),
      // iteration marker + model snapshot — also noise
      sessionEvent({ messageCount: 6, model: 'builtin:bigmodel/GLM-5.2', toolCount: 16, iteration: 0 }),
    ]);
    expect(events).toEqual([]);
  });

  it('maps only the generated title to conversation_title, not the first_input echo', () => {
    const events = collect([
      sessionEvent({ previousTitle: '', source: 'first_input', title: '请帮我数数' }),
      sessionEvent({ source: 'generated', title: '中文数字一到八', messageID: 'm1' }),
    ]);
    expect(events).toEqual([{ type: 'conversation_title', title: '中文数字一到八' }]);
  });

  it('emits thinking_start once per turn and resets across turns', () => {
    const events = collect([
      stateUpdated('prompt_started'),
      sessionEvent({ kind: 'reasoning_delta', delta: 'a' }),
      sessionEvent({ kind: 'reasoning_delta', delta: 'b' }),
      stateUpdated('prompt_completed'),
      stateUpdated('prompt_started'),
      sessionEvent({ kind: 'reasoning_delta', delta: 'c' }),
    ]);

    const thinkingStarts = events.filter((e) => e.type === 'thinking_start');
    expect(thinkingStarts).toHaveLength(2);
    expect(events).toEqual([
      { type: 'status', label: 'running' },
      { type: 'thinking_start' },
      { type: 'thinking_delta', delta: 'a' },
      { type: 'thinking_delta', delta: 'b' },
      { type: 'status', label: 'completed' },
      { type: 'status', label: 'running' },
      { type: 'thinking_start' },
      { type: 'thinking_delta', delta: 'c' },
    ]);
  });

  it('ignores non-stream frames (responses, server requests) without throwing', () => {
    const events = collect([
      { id: 'send', result: { accepted: true } },
      { id: 'srv-1', method: 'interaction/requestProviderRuntimeHeaders', params: { requestId: 'r' } },
      { not: 'a frame' } as Event,
    ]);
    expect(events).toEqual([]);
  });
});
