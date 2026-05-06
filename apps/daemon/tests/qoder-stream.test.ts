// @ts-nocheck
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createQoderStreamHandler } from '../src/qoder-stream.js';

function parseLines(lines) {
  const events = [];
  const handler = createQoderStreamHandler((event) => events.push(event));
  for (const line of lines) {
    handler.feed(`${line}\n`);
  }
  handler.flush();
  return events;
}

test('qoder stream parser maps system init to status', () => {
  const events = parseLines([
    JSON.stringify({
      type: 'system',
      subtype: 'init',
      qodercli_version: '0.2.6',
      model: 'auto',
      session_id: 'session-1',
    }),
  ]);

  assert.deepEqual(events, [
    {
      type: 'status',
      label: 'initializing',
      model: 'auto',
      sessionId: 'session-1',
      qodercliVersion: '0.2.6',
    },
  ]);
});

test('qoder stream parser maps assistant text content blocks to text deltas', () => {
  const events = parseLines([
    JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'text', text: ' world' },
        ],
      },
      session_id: 'session-1',
    }),
  ]);

  assert.deepEqual(events, [
    { type: 'text_delta', delta: 'Hello' },
    { type: 'text_delta', delta: ' world' },
  ]);
});

test('qoder stream parser maps thinking content blocks to thinking events', () => {
  const events = parseLines([
    JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'thinking',
            thinking: 'Considering the exact response.',
          },
        ],
      },
    }),
  ]);

  assert.deepEqual(events, [
    { type: 'thinking_start' },
    {
      type: 'thinking_delta',
      delta: 'Considering the exact response.',
    },
  ]);
});

test('qoder stream parser maps result usage and preserves modelUsage', () => {
  const usage = {
    input_tokens: 10,
    output_tokens: 2,
    service_tier: 'standard',
  };
  const modelUsage = {
    auto: {
      inputTokens: 10,
      outputTokens: 2,
      costUSD: 0,
    },
  };
  const events = parseLines([
    JSON.stringify({
      type: 'result',
      subtype: 'success',
      duration_ms: 10864,
      is_error: false,
      stop_reason: 'end_turn',
      total_cost_usd: 0,
      usage,
      modelUsage,
    }),
  ]);

  assert.deepEqual(events, [
    {
      type: 'usage',
      usage,
      modelUsage,
      costUsd: 0,
      durationMs: 10864,
      stopReason: 'end_turn',
      isError: false,
    },
  ]);
});

test('qoder stream parser forwards unknown and malformed lines as raw events', () => {
  const events = parseLines([
    '{"type":"unknown","value":1}',
    'not json',
  ]);

  assert.deepEqual(events, [
    { type: 'raw', line: '{"type":"unknown","value":1}' },
    { type: 'raw', line: 'not json' },
  ]);
});

test('qoder stream parser flushes a trailing line without newline', () => {
  const events = [];
  const handler = createQoderStreamHandler((event) => events.push(event));
  handler.feed(
    JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'OK' }] },
    }),
  );
  handler.flush();

  assert.deepEqual(events, [{ type: 'text_delta', delta: 'OK' }]);
});
