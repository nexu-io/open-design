import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { expect, test } from 'vitest';
import { attachAcpSession } from '../src/agent-protocol/index.js';

class FakeAcpChild extends EventEmitter {
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();

  kill() {
    return true;
  }
}

function frame(child: FakeAcpChild, value: unknown): void {
  child.stdout.write(`${JSON.stringify(value)}\n`);
}

function replayToolUpdates(updates: Record<string, unknown>[]): unknown[] {
  const child = new FakeAcpChild();
  const results: unknown[] = [];
  attachAcpSession({
    child: child as never,
    prompt: 'run a shell command',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => {
      if (
        event === 'agent' && payload && typeof payload === 'object' &&
        'type' in payload && payload.type === 'tool_result'
      ) results.push(payload);
    },
  });
  frame(child, { id: 1, result: {} });
  frame(child, { id: 2, result: { sessionId: 'session-1' } });
  for (const update of updates) {
    frame(child, {
      method: 'session/update',
      params: { update: { sessionUpdate: 'tool_call_update', ...update } },
    });
  }
  frame(child, { id: 3, result: { usage: { inputTokens: 1, outputTokens: 2 } } });
  return results;
}

test.each([
  ['exitCode', { exitCode: 1 }],
  ['exit_code', { exit_code: 1 }],
  ['isError', { isError: true }],
])('preserves earlier %s failure through a status-only completed frame', (_label, failure) => {
  const results = replayToolUpdates([
    {
      sessionUpdate: 'tool_call', toolCallId: 'failed-call', kind: 'execute',
      status: 'pending', rawInput: { command: 'run-build' },
    },
    {
      toolCallId: 'failed-call', status: 'in_progress', rawOutput: 'build failed', ...failure,
    },
    { toolCallId: 'failed-call', status: 'completed' },
  ]);
  expect(results).toMatchObject([{ type: 'tool_result', isError: true }]);
});

test('keeps an earlier zero exit successful through a status-only completed frame', () => {
  const results = replayToolUpdates([
    {
      toolCallId: 'success-call', kind: 'execute', status: 'in_progress', exitCode: 0,
      // Text is not evidence of the process exit status.
      rawInput: { command: 'printf "exit 1"' }, rawOutput: 'exit 1',
    },
    { toolCallId: 'success-call', status: 'completed' },
  ]);
  expect(results).toMatchObject([{ type: 'tool_result', isError: false }]);
});

test('keeps failure evidence isolated between interleaved tool call IDs', () => {
  const results = replayToolUpdates([
    { toolCallId: 'failed-call', kind: 'execute', status: 'in_progress', exitCode: 1 },
    { toolCallId: 'success-call', kind: 'execute', status: 'in_progress', exitCode: 0 },
    { toolCallId: 'success-call', status: 'completed' },
    { toolCallId: 'failed-call', status: 'completed' },
  ]);
  expect(results).toMatchObject([{ isError: false }, { isError: true }]);
});

test.each([1, 0])('preserves earlier exitCode %s when prompt completion flushes an open tool', (exitCode) => {
  const results = replayToolUpdates([
    { toolCallId: 'open-call', kind: 'execute', status: 'in_progress', exitCode },
  ]);
  expect(results).toMatchObject([{ type: 'tool_result', isError: exitCode !== 0 }]);
});

test('marks an ACP shell result with a non-zero exitCode as failed', () => {
  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: any }> = [];

  attachAcpSession({
    child: child as never,
    prompt: 'run a shell command',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
  });

  frame(child, { id: 1, result: {} });
  frame(child, { id: 2, result: { sessionId: 'session-1' } });
  frame(child, {
    method: 'session/update',
    params: {
      update: {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'bash-1',
        kind: 'execute',
        title: 'echo EXPECTED_FAILURE; exit 1',
        status: 'completed',
        rawInput: { command: 'echo EXPECTED_FAILURE; exit 1' },
        rawOutput: 'EXPECTED_FAILURE\n',
        exitCode: 1,
      },
    },
  });
  frame(child, { id: 3, result: { usage: { inputTokens: 1, outputTokens: 2 } } });

  const result = events
    .filter((entry) => entry.event === 'agent')
    .map((entry) => entry.payload)
    .find((payload) => payload.type === 'tool_result');

  expect(result).toMatchObject({ type: 'tool_result', isError: true });
});

test.each([
  ['snake_case exit_code', { exit_code: 1 }],
  ['explicit isError', { isError: true }],
])('marks a completed ACP shell result as failed when %s reports failure', (_label, failureField) => {
  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: any }> = [];

  attachAcpSession({
    child: child as never,
    prompt: 'run a shell command',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
  });

  frame(child, { id: 1, result: {} });
  frame(child, { id: 2, result: { sessionId: 'session-1' } });
  frame(child, {
    method: 'session/update',
    params: {
      update: {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'bash-1',
        kind: 'execute',
        title: 'echo EXPECTED_FAILURE; exit 1',
        status: 'completed',
        rawInput: { command: 'echo EXPECTED_FAILURE; exit 1' },
        rawOutput: 'EXPECTED_FAILURE\n',
        ...failureField,
      },
    },
  });
  frame(child, { id: 3, result: { usage: { inputTokens: 1, outputTokens: 2 } } });

  const result = events
    .filter((entry) => entry.event === 'agent')
    .map((entry) => entry.payload)
    .find((payload) => payload.type === 'tool_result');

  expect(result).toMatchObject({ type: 'tool_result', isError: true });
});

test('keeps a completed ACP shell result with exitCode zero successful', () => {
  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: any }> = [];

  attachAcpSession({
    child: child as never,
    prompt: 'run a shell command',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
  });

  frame(child, { id: 1, result: {} });
  frame(child, { id: 2, result: { sessionId: 'session-1' } });
  frame(child, {
    method: 'session/update',
    params: {
      update: {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'bash-1',
        kind: 'execute',
        title: 'echo EXPECTED_SUCCESS',
        status: 'completed',
        rawInput: { command: 'echo EXPECTED_SUCCESS' },
        rawOutput: 'EXPECTED_SUCCESS\n',
        exitCode: 0,
      },
    },
  });
  frame(child, { id: 3, result: { usage: { inputTokens: 1, outputTokens: 2 } } });

  const result = events
    .filter((entry) => entry.event === 'agent')
    .map((entry) => entry.payload)
    .find((payload) => payload.type === 'tool_result');

  expect(result).toMatchObject({ type: 'tool_result', isError: false });
});
