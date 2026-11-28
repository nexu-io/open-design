import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createJsonEventStreamHandler } from '../../src/runtimes/json-event-stream.js';

// OpenCode 2.x `run --format json` line shapes (verified against the v2.4.2
// CLI source, packages/cli/src/run/noninteractive.ts). Differences from the
// 1.x shapes the daemon was built on: the tool call id moved from
// `part.callID` to `part.id`, lines are CRLF-terminated on Windows, and new
// `retry` / `background_wait` line types must be ignored, not fatal.

function collect() {
  const events: Array<Record<string, unknown>> = [];
  const handler = createJsonEventStreamHandler('opencode', (event) => events.push(event));
  return { events, handler };
}

test('v2 tool_use parts carry the call id as `part.id` (renamed from `part.callID`)', () => {
  const { events, handler } = collect();
  handler.feed(
    '{"type":"step_start","timestamp":1,"sessionID":"ses_1","part":{"id":"prt_1","sessionID":"ses_1","messageID":"msg_1","type":"step-start"}}\r\n' +
    JSON.stringify({
      type: 'tool_use',
      timestamp: 2,
      sessionID: 'ses_1',
      part: {
        partID: 'prt_2',
        sessionID: 'ses_1',
        messageID: 'msg_1',
        type: 'tool',
        id: 'call_grep',
        tool: 'grep',
        state: {
          status: 'completed',
          input: { pattern: 'x' },
          output: 'Found 1 match',
          metadata: { metadata: { matches: 1 } },
          time: { start: 1, end: 2 },
        },
      },
    }) + '\r\n' +
    '{"type":"step_finish","timestamp":3,"sessionID":"ses_1","part":{"id":"prt_3","type":"step-finish","reason":"stop","cost":0,"tokens":{"input":5,"output":1,"reasoning":0,"cache":{"read":0,"write":0}}}}\r\n',
  );
  assert.deepEqual(events, [
    { type: 'status', label: 'running', sessionId: 'ses_1' },
    { type: 'tool_use', id: 'call_grep', name: 'grep', input: { pattern: 'x' } },
    { type: 'tool_result', toolUseId: 'call_grep', content: 'Found 1 match', isError: false },
    {
      type: 'usage',
      usage: {
        input_tokens: 5,
        output_tokens: 1,
        thought_tokens: 0,
        cached_read_tokens: 0,
        cached_write_tokens: 0,
      },
      costUsd: 0,
    },
  ]);
});

test('v2 error lines carry a structured error object and surface as an error event', () => {
  const { events, handler } = collect();
  handler.feed(
    '{"type":"error","timestamp":9,"sessionID":"","error":{"type":"provider.transport","message":"instructions unavailable"}}\n',
  );
  assert.equal(events.length, 1);
  assert.equal(events[0]!.type, 'error');
  assert.ok(String(events[0]!.message).includes('instructions unavailable'));
});

test('v2-only line types (`retry`, `background_wait`) are ignored without dropping the stream', () => {
  const { events, handler } = collect();
  handler.feed(
    '{"type":"step_start","timestamp":1,"sessionID":"ses_1","part":{"type":"step-start"}}\n' +
    '{"type":"retry","timestamp":2,"sessionID":"ses_1","messageID":"msg_1","attempt":1,"nextRetryAt":3,"error":{"type":"provider.transport","message":"flap"}}\n' +
    '{"type":"background_wait","timestamp":3,"sessionID":"ses_1","jobs":[{"id":"ses_child","kind":"subagent"}]}\n' +
    '{"type":"text","timestamp":4,"sessionID":"ses_1","part":{"type":"text","text":"done"}}\n',
  );
  assert.deepEqual(events, [
    { type: 'status', label: 'running', sessionId: 'ses_1' },
    { type: 'text_delta', delta: 'done' },
  ]);
});
