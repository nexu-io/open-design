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
