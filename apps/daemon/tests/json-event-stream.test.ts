// @ts-nocheck
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createJsonEventStreamHandler } from '../src/json-event-stream.js';

test('opencode json stream emits text and usage events', () => {
  const events = [];
  const handler = createJsonEventStreamHandler('opencode', (event) => events.push(event));

  handler.feed(
    '{"type":"step_start","sessionID":"ses-1","part":{"type":"step-start"}}\n' +
      '{"type":"text","sessionID":"ses-1","part":{"type":"text","text":"hello"}}\n' +
      '{"type":"step_finish","sessionID":"ses-1","part":{"type":"step-finish","tokens":{"input":11,"output":7,"reasoning":3,"cache":{"read":5,"write":2}},"cost":0}}\n',
  );

  assert.deepEqual(events, [
    { type: 'status', label: 'running' },
    { type: 'text_delta', delta: 'hello' },
    {
      type: 'usage',
      usage: {
        input_tokens: 11,
        output_tokens: 7,
        thought_tokens: 3,
        cached_read_tokens: 5,
        cached_write_tokens: 2,
      },
      costUsd: 0,
    },
  ]);
});

test('opencode json stream emits tool events', () => {
  const events = [];
  const handler = createJsonEventStreamHandler('opencode', (event) => events.push(event));

  handler.feed(
    JSON.stringify({
      type: 'tool_use',
      part: {
        tool: 'read',
        callID: 'call-1',
        state: {
          input: JSON.stringify({ file: 'foo.txt' }),
          output: 'done',
          status: 'completed',
        },
      },
    }) + '\n',
  );

  assert.deepEqual(events, [
    { type: 'tool_use', id: 'call-1', name: 'read', input: { file: 'foo.txt' } },
    { type: 'tool_result', toolUseId: 'call-1', content: 'done', isError: false },
  ]);
});

test('unknown json stream lines become raw events', () => {
  const events = [];
  const handler = createJsonEventStreamHandler('opencode', (event) => events.push(event));

  handler.feed('not-json\n');
  handler.flush();

  assert.deepEqual(events, [{ type: 'raw', line: 'not-json' }]);
});

test('gemini stream emits init text and usage events', () => {
  const events = [];
  const handler = createJsonEventStreamHandler('gemini', (event) => events.push(event));

  handler.feed(
    JSON.stringify({ type: 'init', session_id: 'gm-1', model: 'gemini-3-flash-preview' }) + '\n' +
      JSON.stringify({ type: 'message', role: 'assistant', content: 'hello', delta: true }) + '\n' +
      JSON.stringify({
        type: 'result',
        status: 'success',
        stats: { input_tokens: 9, output_tokens: 4, cached: 2, duration_ms: 321 },
      }) +
      '\n',
  );

  assert.deepEqual(events, [
    { type: 'status', label: 'initializing', model: 'gemini-3-flash-preview' },
    { type: 'text_delta', delta: 'hello' },
    {
      type: 'usage',
      usage: { input_tokens: 9, output_tokens: 4, cached_read_tokens: 2 },
      durationMs: 321,
    },
  ]);
});

test('cursor stream emits partial text once and usage events', () => {
  const events = [];
  const handler = createJsonEventStreamHandler('cursor-agent', (event) => events.push(event));

  handler.feed(
    JSON.stringify({ type: 'system', subtype: 'init', model: 'GPT-5 Mini' }) + '\n' +
      JSON.stringify({
        type: 'assistant',
        timestamp_ms: 1,
        message: { role: 'assistant', content: [{ type: 'text', text: 'OD' }] },
      }) +
      '\n' +
      JSON.stringify({
        type: 'assistant',
        timestamp_ms: 2,
        message: { role: 'assistant', content: [{ type: 'text', text: '_OK' }] },
      }) +
      '\n' +
      JSON.stringify({
        type: 'assistant',
        message: { role: 'assistant', content: [{ type: 'text', text: 'OD_OK' }] },
      }) +
      '\n' +
      JSON.stringify({
        type: 'result',
        duration_ms: 120,
        usage: { inputTokens: 5, outputTokens: 2, cacheReadTokens: 1, cacheWriteTokens: 0 },
      }) +
      '\n',
  );

  assert.deepEqual(events, [
    { type: 'status', label: 'initializing', model: 'GPT-5 Mini' },
    { type: 'text_delta', delta: 'OD' },
    { type: 'text_delta', delta: '_OK' },
    {
      type: 'usage',
      usage: { input_tokens: 5, output_tokens: 2, cached_read_tokens: 1, cached_write_tokens: 0 },
      durationMs: 120,
    },
  ]);
});

test('cursor stream emits suffix when final assistant extends partial text', () => {
  const events = [];
  const handler = createJsonEventStreamHandler('cursor-agent', (event) => events.push(event));

  handler.feed(
    JSON.stringify({
      type: 'assistant',
      timestamp_ms: 1,
      message: { role: 'assistant', content: [{ type: 'text', text: 'hello' }] },
    }) +
      '\n' +
      JSON.stringify({
        type: 'assistant',
        message: { role: 'assistant', content: [{ type: 'text', text: 'hello world' }] },
      }) +
      '\n',
  );

  assert.deepEqual(events, [
    { type: 'text_delta', delta: 'hello' },
    { type: 'text_delta', delta: ' world' },
  ]);
});

test('cursor stream de-duplicates cumulative timestamped assistant chunks', () => {
  const events = [];
  const handler = createJsonEventStreamHandler('cursor-agent', (event) => events.push(event));

  handler.feed(
    JSON.stringify({
      type: 'assistant',
      timestamp_ms: 1,
      message: { role: 'assistant', content: [{ type: 'text', text: 'hello' }] },
    }) +
      '\n' +
      JSON.stringify({
        type: 'assistant',
        timestamp_ms: 2,
        message: { role: 'assistant', content: [{ type: 'text', text: 'hello world' }] },
      }) +
      '\n' +
      JSON.stringify({
        type: 'assistant',
        timestamp_ms: 3,
        message: { role: 'assistant', content: [{ type: 'text', text: 'hello world' }] },
      }) +
      '\n',
  );

  assert.deepEqual(events, [
    { type: 'text_delta', delta: 'hello' },
    { type: 'text_delta', delta: ' world' },
  ]);
});

test('codex json stream emits status text and usage events', () => {
  const events = [];
  const handler = createJsonEventStreamHandler('codex', (event) => events.push(event));

  handler.feed(
    JSON.stringify({ type: 'thread.started', thread_id: 'thr-1' }) + '\n' +
      JSON.stringify({ type: 'turn.started' }) + '\n' +
      JSON.stringify({
        type: 'item.completed',
        item: { id: 'item-1', type: 'agent_message', text: 'hello' },
      }) +
      '\n' +
      JSON.stringify({
        type: 'turn.completed',
        usage: { input_tokens: 12, cached_input_tokens: 4, output_tokens: 3 },
      }) +
      '\n',
  );

  assert.deepEqual(events, [
    { type: 'status', label: 'initializing' },
    { type: 'status', label: 'running' },
    { type: 'text_delta', delta: 'hello' },
    { type: 'usage', usage: { input_tokens: 12, output_tokens: 3, cached_read_tokens: 4 } },
  ]);
});

test('codex json stream emits command execution tool events', () => {
  const events = [];
  const handler = createJsonEventStreamHandler('codex', (event) => events.push(event));

  handler.feed(
    JSON.stringify({
      type: 'item.started',
      item: {
        id: 'item-1',
        type: 'command_execution',
        command: "/bin/zsh -lc 'echo hello-from-codex'",
        aggregated_output: '',
        exit_code: null,
        status: 'in_progress',
      },
    }) +
      '\n' +
      JSON.stringify({
        type: 'item.completed',
        item: {
          id: 'item-1',
          type: 'command_execution',
          command: "/bin/zsh -lc 'echo hello-from-codex'",
          aggregated_output: 'hello-from-codex\n',
          exit_code: 0,
          status: 'completed',
        },
      }) +
      '\n',
  );

  assert.deepEqual(events, [
    {
      type: 'tool_use',
      id: 'item-1',
      name: 'Bash',
      input: { command: "/bin/zsh -lc 'echo hello-from-codex'" },
    },
    {
      type: 'tool_result',
      toolUseId: 'item-1',
      content: 'hello-from-codex\n',
      isError: false,
    },
  ]);
});

test('unhandled structured events fall back to raw', () => {
  const events = [];
  const handler = createJsonEventStreamHandler('codex', (event) => events.push(event));

  handler.feed(JSON.stringify({ type: 'unhandled.event', foo: 'bar' }) + '\n');

  assert.deepEqual(events, [{ type: 'raw', line: '{"type":"unhandled.event","foo":"bar"}' }]);
});
