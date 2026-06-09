import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createJsonEventStreamHandler } from '../src/json-event-stream.js';

type JsonStreamEvent = Record<string, unknown>;

function collectEvents(kind: string) {
  const events: JsonStreamEvent[] = [];
  const handler = createJsonEventStreamHandler(kind, (event) => events.push(event));
  return { events, handler };
}

test('opencode json stream emits text and usage events', () => {
  const { events, handler } = collectEvents('opencode');

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
  const { events, handler } = collectEvents('opencode');

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

test('opencode json stream emits structured errors as error events', () => {
  const { events, handler } = collectEvents('opencode');

  const errorLine = JSON.stringify({
    type: 'error',
    error: { data: { message: 'OpenCode auth failed: login required' } },
  });
  handler.feed(errorLine + '\n');

  assert.deepEqual(events, [
    { type: 'error', message: 'OpenCode auth failed: login required', raw: errorLine },
  ]);
});

test('opencode json stream preserves nested error messages', () => {
  const { events, handler } = collectEvents('opencode');

  const errorLine = JSON.stringify({
    type: 'error',
    error: { message: 'model not found: openai/nope' },
  });
  handler.feed(errorLine + '\n');

  assert.deepEqual(events, [
    { type: 'error', message: 'model not found: openai/nope', raw: errorLine },
  ]);
});

test('opencode json stream falls back to error name when data has no message', () => {
  const { events, handler } = collectEvents('opencode');

  const errorLine = JSON.stringify({
    type: 'error',
    error: { name: 'AuthError', data: {} },
  });
  handler.feed(errorLine + '\n');

  assert.deepEqual(events, [
    { type: 'error', message: 'AuthError', raw: errorLine },
  ]);
});

test('unknown json stream lines become raw events', () => {
  const { events, handler } = collectEvents('opencode');

  handler.feed('not-json\n');
  handler.flush();

  assert.deepEqual(events, [{ type: 'raw', line: 'not-json' }]);
});

// Regression coverage for #691: OpenCode emits structured error frames on
// stdout while still exiting 0. The parser must surface them as proper
// `error` events (matching the qoder-stream contract) so server.ts's
// `sendAgentEvent` flips the run to `failed` and forwards a visible SSE
// error to the chat. Previously these were downgraded to `type:'raw'`,
// which the chat UI doesn't render — the run looked like a fast clean
// success while the user actually got nothing back.
test('opencode json stream surfaces error frames as proper error events (regression of #691)', () => {
  const { events, handler } = collectEvents('opencode');

  const errorLine = JSON.stringify({
    type: 'error',
    error: {
      name: 'ProviderError',
      data: { message: 'Authentication expired — please re-login.' },
    },
  });
  handler.feed(errorLine + '\n');

  assert.deepEqual(events, [
    {
      type: 'error',
      message: 'Authentication expired — please re-login.',
      raw: errorLine,
    },
  ]);
});

test('opencode json stream falls back to error.name when error.data.message is absent', () => {
  const { events, handler } = collectEvents('opencode');

  const errorLine = JSON.stringify({
    type: 'error',
    error: { name: 'NetworkError' },
  });
  handler.feed(errorLine + '\n');

  assert.deepEqual(events, [
    {
      type: 'error',
      message: 'NetworkError',
      raw: errorLine,
    },
  ]);
});

test('opencode json stream falls back to a generic message when error has no usable detail', () => {
  const { events, handler } = collectEvents('opencode');

  const errorLine = JSON.stringify({ type: 'error', error: {} });
  handler.feed(errorLine + '\n');

  assert.deepEqual(events, [
    {
      type: 'error',
      message: 'OpenCode error',
      raw: errorLine,
    },
  ]);
});

test('gemini stream emits init text and usage events', () => {
  const { events, handler } = collectEvents('gemini');

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
  const { events, handler } = collectEvents('cursor-agent');

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
  const { events, handler } = collectEvents('cursor-agent');

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

test('cursor stream concatenates independent timestamped fragments verbatim', () => {
  const { events, handler } = collectEvents('cursor-agent');

  // cursor-agent --stream-partial-output sends timestamped assistant events
  // (without model_call_id) as INDEPENDENT incremental fragments — each
  // carries only the new text and the turn text is their in-order
  // concatenation. They must be emitted verbatim, including a fragment that
  // repeats earlier text; content-based equality/prefix dedup would silently
  // drop real output.
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
      message: { role: 'assistant', content: [{ type: 'text', text: ' world' }] },
    }) +
    '\n' +
    // A legitimately repeated fragment — must NOT be deduped away.
    JSON.stringify({
      type: 'assistant',
      timestamp_ms: 3,
      message: { role: 'assistant', content: [{ type: 'text', text: ' world' }] },
    }) +
    '\n',
  );

  assert.deepEqual(events, [
    { type: 'text_delta', delta: 'hello' },
    { type: 'text_delta', delta: ' world' },
    { type: 'text_delta', delta: ' world' },
  ]);
});

test('cursor stream skips model_call_id replay to avoid duplicate content', () => {
  const { events, handler } = collectEvents('cursor-agent');

  // Cursor sends incremental deltas as independent fragments, then a
  // final assistant message with model_call_id that replays the full
  // accumulated text. The replay must be skipped to avoid duplication.
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
      message: { role: 'assistant', content: [{ type: 'text', text: ' world' }] },
    }) +
    '\n' +
    // Full replay with model_call_id — should be skipped
    JSON.stringify({
      type: 'assistant',
      timestamp_ms: 3,
      model_call_id: 'call-1',
      message: { role: 'assistant', content: [{ type: 'text', text: 'hello world' }] },
    }) +
    '\n' +
    // New turn starts with fresh incremental deltas
    JSON.stringify({
      type: 'assistant',
      timestamp_ms: 4,
      message: { role: 'assistant', content: [{ type: 'text', text: 'second' }] },
    }) +
    '\n' +
    JSON.stringify({
      type: 'assistant',
      timestamp_ms: 5,
      message: { role: 'assistant', content: [{ type: 'text', text: ' turn' }] },
    }) +
    '\n' +
    // Full replay of second turn — should also be skipped
    JSON.stringify({
      type: 'assistant',
      timestamp_ms: 6,
      model_call_id: 'call-2',
      message: { role: 'assistant', content: [{ type: 'text', text: 'second turn' }] },
    }) +
    '\n',
  );

  assert.deepEqual(events, [
    { type: 'text_delta', delta: 'hello' },
    { type: 'text_delta', delta: ' world' },
    { type: 'text_delta', delta: 'second' },
    { type: 'text_delta', delta: ' turn' },
  ]);
});

test('cursor stream emits missing suffix from model_call_id replay when chunks are dropped', () => {
  const { events, handler } = collectEvents('cursor-agent');

  // Only partial fragments arrive — the last chunk is dropped
  handler.feed(
    JSON.stringify({
      type: 'assistant',
      timestamp_ms: 1,
      message: { role: 'assistant', content: [{ type: 'text', text: 'hello' }] },
    }) +
    '\n' +
    // " world" chunk was dropped / never received
    // Full replay arrives with model_call_id — should emit the missing suffix
    JSON.stringify({
      type: 'assistant',
      timestamp_ms: 2,
      model_call_id: 'call-1',
      message: { role: 'assistant', content: [{ type: 'text', text: 'hello world' }] },
    }) +
    '\n',
  );

  assert.deepEqual(events, [
    { type: 'text_delta', delta: 'hello' },
    { type: 'text_delta', delta: ' world' },
  ]);
});

test('cursor stream emits missing suffix from model_call_id replay in second turn', () => {
  const { events, handler } = collectEvents('cursor-agent');

  // Turn 1: all chunks arrive, replay matches
  handler.feed(
    JSON.stringify({
      type: 'assistant',
      timestamp_ms: 1,
      message: { role: 'assistant', content: [{ type: 'text', text: 'hello world' }] },
    }) +
    '\n' +
    JSON.stringify({
      type: 'assistant',
      timestamp_ms: 2,
      model_call_id: 'call-1',
      message: { role: 'assistant', content: [{ type: 'text', text: 'hello world' }] },
    }) +
    '\n',
  );

  // Turn 2: "second" arrives but " turn" is dropped
  handler.feed(
    JSON.stringify({
      type: 'assistant',
      timestamp_ms: 3,
      message: { role: 'assistant', content: [{ type: 'text', text: 'second' }] },
    }) +
    '\n' +
    // Replay contains "second turn" — should emit missing " turn"
    JSON.stringify({
      type: 'assistant',
      timestamp_ms: 4,
      model_call_id: 'call-2',
      message: { role: 'assistant', content: [{ type: 'text', text: 'second turn' }] },
    }) +
    '\n',
  );

  assert.deepEqual(events, [
    { type: 'text_delta', delta: 'hello world' },
    { type: 'text_delta', delta: 'second' },
    { type: 'text_delta', delta: ' turn' },
  ]);
});

test('cursor stream recovers dropped chunk via model_call_id after fallback-terminated turn', () => {
  const { events, handler } = collectEvents('cursor-agent');

  // Turn 1 ends via the non-model_call_id fallback path (no timestamp)
  handler.feed(
    JSON.stringify({
      type: 'assistant',
      timestamp_ms: 1,
      message: { role: 'assistant', content: [{ type: 'text', text: 'hello' }] },
    }) +
    '\n' +
    // Final replay without model_call_id — fallback path
    JSON.stringify({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: 'hello world' }] },
    }) +
    '\n',
  );

  // Turn 2: "second" arrives but " turn" is dropped, then model_call_id
  // replay recovers the missing suffix. Without the cursorTurnStart
  // advancement in the fallback path, turnLength would be computed from
  // position 0 (including turn 1's text), making the replay length
  // appear shorter than what was already emitted — losing " turn".
  handler.feed(
    JSON.stringify({
      type: 'assistant',
      timestamp_ms: 2,
      message: { role: 'assistant', content: [{ type: 'text', text: 'second' }] },
    }) +
    '\n' +
    JSON.stringify({
      type: 'assistant',
      timestamp_ms: 3,
      model_call_id: 'call-2',
      message: { role: 'assistant', content: [{ type: 'text', text: 'second turn' }] },
    }) +
    '\n',
  );

  assert.deepEqual(events, [
    { type: 'text_delta', delta: 'hello' },
    { type: 'text_delta', delta: ' world' },
    { type: 'text_delta', delta: 'second' },
    { type: 'text_delta', delta: ' turn' },
  ]);
});

test('cursor stream does not duplicate output across two fallback-terminated turns', () => {
  const { events, handler } = collectEvents('cursor-agent');

  // Both turns end via the non-model_call_id fallback replay path. The
  // terminal replay must reconcile against the CURRENT turn's emitted text
  // (cursorTextSoFar.slice(cursorTurnStart)), not the whole cross-turn
  // buffer. Otherwise turn 2's replay "second turn" is compared against
  // "hello worldsecond", misses the current-turn prefix, and re-appends the
  // whole replay — yielding duplicated output "secondsecond turn".
  handler.feed(
    // Turn 1: streamed "hello", fallback replay "hello world"
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
    '\n' +
    // Turn 2: streamed "second", fallback replay "second turn"
    JSON.stringify({
      type: 'assistant',
      timestamp_ms: 2,
      message: { role: 'assistant', content: [{ type: 'text', text: 'second' }] },
    }) +
    '\n' +
    JSON.stringify({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: 'second turn' }] },
    }) +
    '\n',
  );

  assert.deepEqual(events, [
    { type: 'text_delta', delta: 'hello' },
    { type: 'text_delta', delta: ' world' },
    { type: 'text_delta', delta: 'second' },
    { type: 'text_delta', delta: ' turn' },
  ]);
});

test('cursor stream preserves repeated real deltas on a later turn', () => {
  const { events, handler } = collectEvents('cursor-agent');

  // Turn 1 completes (delta "hi" + its model_call_id replay). Turn 2 streams
  // two legitimately identical real deltas "ha" + "ha" (turn text "haha"),
  // then the buffered model_call_id replay "haha". Both timestamped deltas
  // must be emitted (they are real content, not duplicates), and only the
  // replay is suppressed. A content equality/prefix check on the timestamped
  // path would wrongly drop the second "ha" and lose output.
  handler.feed(
    // Turn 1
    JSON.stringify({
      type: 'assistant',
      timestamp_ms: 1,
      message: { role: 'assistant', content: [{ type: 'text', text: 'hi' }] },
    }) +
    '\n' +
    JSON.stringify({
      type: 'assistant',
      timestamp_ms: 2,
      model_call_id: 'call-1',
      message: { role: 'assistant', content: [{ type: 'text', text: 'hi' }] },
    }) +
    '\n' +
    // Turn 2: two identical real deltas, then the buffered replay
    JSON.stringify({
      type: 'assistant',
      timestamp_ms: 3,
      message: { role: 'assistant', content: [{ type: 'text', text: 'ha' }] },
    }) +
    '\n' +
    JSON.stringify({
      type: 'assistant',
      timestamp_ms: 4,
      message: { role: 'assistant', content: [{ type: 'text', text: 'ha' }] },
    }) +
    '\n' +
    JSON.stringify({
      type: 'assistant',
      timestamp_ms: 5,
      model_call_id: 'call-2',
      message: { role: 'assistant', content: [{ type: 'text', text: 'haha' }] },
    }) +
    '\n',
  );

  assert.deepEqual(events, [
    { type: 'text_delta', delta: 'hi' },
    { type: 'text_delta', delta: 'ha' },
    { type: 'text_delta', delta: 'ha' },
  ]);
});

test('cursor stream does not duplicate output when emitted text is not a replay prefix', () => {
  const { events, handler } = collectEvents('cursor-agent');

  // A middle fragment (" brave") is dropped while a later fragment (" world")
  // still arrives, so the emitted turn text "hello world" is NOT a prefix of
  // the buffered replay "hello brave world". The replay is reconciled against
  // the emitted turn text: since it is not a verified prefix, the append-only
  // stream is left untouched rather than re-emitting an already-shown suffix
  // (which would yield "hello world world").
  handler.feed(
    JSON.stringify({
      type: 'assistant',
      timestamp_ms: 1,
      message: { role: 'assistant', content: [{ type: 'text', text: 'hello' }] },
    }) +
    '\n' +
    // " brave" fragment dropped; " world" still arrives
    JSON.stringify({
      type: 'assistant',
      timestamp_ms: 2,
      message: { role: 'assistant', content: [{ type: 'text', text: ' world' }] },
    }) +
    '\n' +
    JSON.stringify({
      type: 'assistant',
      timestamp_ms: 3,
      model_call_id: 'call-1',
      message: { role: 'assistant', content: [{ type: 'text', text: 'hello brave world' }] },
    }) +
    '\n',
  );

  assert.deepEqual(events, [
    { type: 'text_delta', delta: 'hello' },
    { type: 'text_delta', delta: ' world' },
  ]);
});

test('codex json stream emits status text and usage events', () => {
  const { events, handler } = collectEvents('codex');

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

test('codex json stream preserves line boundaries between assistant message items', () => {
  const { events, handler } = collectEvents('codex');

  handler.feed(
    JSON.stringify({ type: 'turn.started' }) + '\n' +
    JSON.stringify({
      type: 'item.completed',
      item: { id: 'item-1', type: 'agent_message', text: 'English: one' },
    }) +
    '\n' +
    JSON.stringify({
      type: 'item.completed',
      item: { id: 'item-2', type: 'agent_message', text: 'Chinese: 一' },
    }) +
    '\n' +
    JSON.stringify({
      type: 'item.completed',
      item: { id: 'item-3', type: 'agent_message', text: 'English: two' },
    }) +
    '\n',
  );

  const text = events
    .filter((event) => event.type === 'text_delta')
    .map((event) => event.delta)
    .join('');

  assert.equal(text, 'English: one\nChinese: 一\nEnglish: two');
});

test('codex json stream does not duplicate existing assistant message newlines', () => {
  const { events, handler } = collectEvents('codex');

  handler.feed(
    JSON.stringify({
      type: 'item.completed',
      item: { id: 'item-1', type: 'agent_message', text: 'English: one\n' },
    }) +
    '\n' +
    JSON.stringify({
      type: 'item.completed',
      item: { id: 'item-2', type: 'agent_message', text: 'Chinese: 一' },
    }) +
    '\n' +
    JSON.stringify({
      type: 'item.completed',
      item: { id: 'item-3', type: 'agent_message', text: '\nEnglish: two' },
    }) +
    '\n',
  );

  const text = events
    .filter((event) => event.type === 'text_delta')
    .map((event) => event.delta)
    .join('');

  assert.equal(text, 'English: one\nChinese: 一\nEnglish: two');
});

test('codex json stream emits structured errors once', () => {
  const { events, handler } = collectEvents('codex');

  handler.feed(
    JSON.stringify({
      type: 'error',
      message: JSON.stringify({
        detail: "The 'gpt-5.5' model requires a newer version of Codex.",
      }),
    }) +
    '\n' +
    JSON.stringify({
      type: 'turn.failed',
      error: { message: 'plain failure' },
    }) +
    '\n',
  );

  assert.deepEqual(events, [
    {
      type: 'error',
      message: "The 'gpt-5.5' model requires a newer version of Codex.",
    },
  ]);
});

test('codex json stream emits command execution tool events', () => {
  const { events, handler } = collectEvents('codex');

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
  const { events, handler } = collectEvents('codex');

  handler.feed(JSON.stringify({ type: 'unhandled.event', foo: 'bar' }) + '\n');

  assert.deepEqual(events, [{ type: 'raw', line: '{"type":"unhandled.event","foo":"bar"}' }]);
});
test('codex json stream treats reconnect errors as status warnings not fatal (regression of #1471)', () => {
  const { events, handler } = collectEvents('codex');

  handler.feed(
    JSON.stringify({ type: 'thread.started', thread_id: 'thr-1' }) + '\n' +
    JSON.stringify({ type: 'turn.started' }) + '\n' +
    JSON.stringify({ type: 'error', message: 'Reconnecting... 2/5 (timeout waiting for child process to exit)' }) + '\n' +
    JSON.stringify({ type: 'item.completed', item: { id: 'item-0', type: 'agent_message', text: 'OK' } }) + '\n' +
    JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 5, output_tokens: 2, cached_input_tokens: 0 } }) + '\n',
  );

  assert.deepEqual(events, [
    { type: 'status', label: 'initializing' },
    { type: 'status', label: 'running' },
    { type: 'status', label: 'Reconnecting... 2/5 (timeout waiting for child process to exit)' },
    { type: 'text_delta', delta: 'OK' },
    { type: 'usage', usage: { input_tokens: 5, output_tokens: 2, cached_read_tokens: 0 } },
  ]);
});

test('codex json stream still treats real errors as fatal after reconnect warnings', () => {
  const { events, handler } = collectEvents('codex');

  handler.feed(
    JSON.stringify({ type: 'error', message: 'Reconnecting... 2/5 (timeout waiting for child process to exit)' }) + '\n' +
    JSON.stringify({ type: 'error', message: 'Authentication failed: invalid API key' }) + '\n',
  );

  assert.deepEqual(events, [
    { type: 'status', label: 'Reconnecting... 2/5 (timeout waiting for child process to exit)' },
    { type: 'error', message: 'Authentication failed: invalid API key' },
  ]);
});
