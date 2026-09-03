import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  createAntigravityStreamHandler,
  type AntigravityStreamEvent,
} from '../../src/runtimes/antigravity-stream.js';

test('antigravity-stream parses init event into status initializing', () => {
  const events: AntigravityStreamEvent[] = [];
  const handler = createAntigravityStreamHandler((e) => events.push(e));

  handler.feed(
    JSON.stringify({
      event: 'init',
      conversation_id: 'conv-12345',
      init: {
        cwd: 'D:\\projects\\demo',
        tools: ['write_to_file', 'run_command'],
      },
    }) + '\n',
  );
  handler.flush();

  assert.equal(events.length, 1);
  assert.deepEqual(events[0], {
    type: 'status',
    label: 'initializing',
    sessionId: 'conv-12345',
    tools: ['write_to_file', 'run_command'],
    cwd: 'D:\\projects\\demo',
  });
});

test('antigravity-stream streams text_delta chunks for agent_response', () => {
  const events: AntigravityStreamEvent[] = [];
  const handler = createAntigravityStreamHandler((e) => events.push(e));

  handler.feed(
    JSON.stringify({
      event: 'step_update',
      step_update: {
        step_index: 1,
        state: 'ACTIVE',
        step_type: 'agent_response',
        text_delta: 'Hello ',
      },
    }) + '\n',
  );
  handler.feed(
    JSON.stringify({
      event: 'step_update',
      step_update: {
        step_index: 1,
        state: 'ACTIVE',
        step_type: 'agent_response',
        text_delta: 'World!',
      },
    }) + '\n',
  );
  handler.flush();

  assert.equal(events.length, 2);
  assert.deepEqual(events[0], { type: 'text_delta', delta: 'Hello ' });
  assert.deepEqual(events[1], { type: 'text_delta', delta: 'World!' });
});

test('antigravity-stream maps tool lifecycle: ACTIVE -> DONE', () => {
  const events: AntigravityStreamEvent[] = [];
  const handler = createAntigravityStreamHandler((e) => events.push(e));

  handler.feed(
    JSON.stringify({
      event: 'step_update',
      step_update: {
        step_index: 2,
        state: 'ACTIVE',
        step_type: 'tool',
        tool_name: 'run_command',
        tool_info: {
          name: 'run_command',
          parameters: { CommandLine: 'git status' },
        },
      },
    }) + '\n',
  );

  assert.equal(events.length, 1);
  assert.deepEqual(events[0], {
    type: 'tool_use',
    id: 'agy-step-2',
    name: 'run_command',
    input: { CommandLine: 'git status' },
  });

  handler.feed(
    JSON.stringify({
      event: 'step_update',
      step_update: {
        step_index: 2,
        state: 'DONE',
        step_type: 'tool',
        duration_seconds: 0.45,
        tool_info: {
          output: 'On branch main\nnothing to commit',
        },
      },
    }) + '\n',
  );
  handler.flush();

  assert.equal(events.length, 2);
  assert.deepEqual(events[1], {
    type: 'tool_result',
    tool_use_id: 'agy-step-2',
    content: 'On branch main\nnothing to commit',
    is_error: false,
    durationMs: 450,
  });
});

test('antigravity-stream maps tool ERROR state with error message', () => {
  const events: AntigravityStreamEvent[] = [];
  const handler = createAntigravityStreamHandler((e) => events.push(e));

  handler.feed(
    JSON.stringify({
      event: 'step_update',
      step_update: {
        step_index: 3,
        state: 'ACTIVE',
        step_type: 'tool',
        tool_name: 'view_file',
        tool_info: {
          parameters: { AbsolutePath: '/non/existent' },
        },
      },
    }) + '\n',
  );

  handler.feed(
    JSON.stringify({
      event: 'step_update',
      step_update: {
        step_index: 3,
        state: 'ERROR',
        step_type: 'tool',
        duration_seconds: 0.12,
        tool_info: {
          error: { type: 'FILE_NOT_FOUND', message: 'File does not exist' },
        },
      },
    }) + '\n',
  );
  handler.flush();

  assert.equal(events.length, 2);
  assert.deepEqual(events[1], {
    type: 'tool_result',
    tool_use_id: 'agy-step-3',
    content: 'File does not exist',
    is_error: true,
    durationMs: 120,
  });
});

test('antigravity-stream maps result event with usage and duration', () => {
  const events: AntigravityStreamEvent[] = [];
  const handler = createAntigravityStreamHandler((e) => events.push(e));

  // Stream a delta first
  handler.feed(
    JSON.stringify({
      event: 'step_update',
      step_update: {
        step_index: 1,
        state: 'ACTIVE',
        step_type: 'agent_response',
        text_delta: 'All done.',
      },
    }) + '\n',
  );

  // Result event
  handler.feed(
    JSON.stringify({
      event: 'result',
      result: {
        status: 'SUCCESS',
        response: 'All done.',
        duration_seconds: 4.5,
        num_turns: 1,
        usage: {
          input_tokens: 1200,
          output_tokens: 350,
          thinking_tokens: 200,
          total_tokens: 1550,
        },
      },
    }) + '\n',
  );
  handler.flush();

  // text_delta was already emitted, so result should only emit usage, without duplicate text_delta
  assert.equal(events.length, 2);
  assert.deepEqual(events[0], { type: 'text_delta', delta: 'All done.' });
  assert.deepEqual(events[1], {
    type: 'usage',
    usage: {
      input_tokens: 1200,
      output_tokens: 350,
      thinking_tokens: 200,
      total_tokens: 1550,
    },
    durationMs: 4500,
    stopReason: 'SUCCESS',
    isError: false,
  });
});

test('antigravity-stream fallback: emits text_delta from result.response if no deltas were streamed', () => {
  const events: AntigravityStreamEvent[] = [];
  const handler = createAntigravityStreamHandler((e) => events.push(e));

  handler.feed(
    JSON.stringify({
      event: 'result',
      result: {
        status: 'SUCCESS',
        response: 'Direct response without streamed deltas',
        duration_seconds: 2.1,
        usage: { total_tokens: 100 },
      },
    }) + '\n',
  );
  handler.flush();

  assert.equal(events.length, 2);
  assert.deepEqual(events[0], {
    type: 'text_delta',
    delta: 'Direct response without streamed deltas',
  });
  assert.equal(events[1]?.type, 'usage');
});

test('antigravity-stream handles cross-chunk fragmentation correctly', () => {
  const events: AntigravityStreamEvent[] = [];
  const handler = createAntigravityStreamHandler((e) => events.push(e));

  const jsonStr = JSON.stringify({
    event: 'step_update',
    step_update: {
      step_index: 1,
      state: 'ACTIVE',
      step_type: 'agent_response',
      text_delta: 'Piece by piece',
    },
  });

  // Feed in 3 fragmented pieces
  const mid1 = 20;
  const mid2 = 45;
  handler.feed(jsonStr.slice(0, mid1));
  assert.equal(events.length, 0); // incomplete line, no events yet

  handler.feed(jsonStr.slice(mid1, mid2));
  assert.equal(events.length, 0); // still incomplete

  handler.feed(jsonStr.slice(mid2) + '\n');
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], { type: 'text_delta', delta: 'Piece by piece' });
});

test('antigravity-stream passes non-JSON text through as raw event', () => {
  const events: AntigravityStreamEvent[] = [];
  const handler = createAntigravityStreamHandler((e) => events.push(e));

  handler.feed('jetski: system warning notice\n');
  handler.flush();

  assert.equal(events.length, 1);
  assert.deepEqual(events[0], {
    type: 'raw',
    line: 'jetski: system warning notice',
  });
});
