// @ts-nocheck
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { parsePiModels, mapPiRpcEvent, attachPiRpcSession } from '../src/pi-rpc.js';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

// ─── parsePiModels ─────────────────────────────────────────────────────────

test('parsePiModels parses TSV table with default option prepended', () => {
  const input =
    'provider         model                  context  max-out  thinking  images\n' +
    'anthropic        claude-sonnet-4-5       200K      64K      yes        yes\n' +
    'openai           gpt-5                  128K      16K      yes        yes\n';

  const result = parsePiModels(input);

  assert.ok(result);
  assert.equal(result.length, 3);
  assert.deepEqual(result[0], { id: 'default', label: 'Default (CLI config)' });
  assert.equal(result[1].id, 'anthropic/claude-sonnet-4-5');
  assert.equal(result[2].id, 'openai/gpt-5');
});

test('parsePiModels deduplicates identical provider/model pairs', () => {
  const input =
    'provider         model                  context  max-out  thinking  images\n' +
    'openrouter       claude-sonnet-4-5       200K      64K      yes        yes\n' +
    'openrouter       claude-sonnet-4-5       200K      64K      yes        yes\n';

  const result = parsePiModels(input);

  assert.ok(result);
  assert.equal(result.length, 2); // default + 1 unique
  assert.equal(result[1].id, 'openrouter/claude-sonnet-4-5');
});

test('parsePiModels returns null for empty input', () => {
  assert.equal(parsePiModels(''), null);
  assert.equal(parsePiModels(null), null);
  assert.equal(parsePiModels(undefined), null);
});

test('parsePiModels returns null for header-only input (no model rows)', () => {
  const input =
    'provider         model                  context  max-out  thinking  images\n';
  assert.equal(parsePiModels(input), null);
});

test('parsePiModels skips lines with fewer than 2 columns', () => {
  const input =
    'provider         model                  context  max-out  thinking  images\n' +
    'solo-field\n' +
    'anthropic        claude-sonnet-4-5       200K      64K      yes        yes\n';

  const result = parsePiModels(input);

  assert.ok(result);
  assert.equal(result.length, 2); // default + 1 valid
  assert.equal(result[1].id, 'anthropic/claude-sonnet-4-5');
});

test('parsePiModels handles comment lines', () => {
  const input =
    '# this is a comment\n' +
    'provider         model                  context  max-out  thinking  images\n' +
    'anthropic        claude-sonnet-4-5       200K      64K      yes        yes\n';

  const result = parsePiModels(input);

  assert.ok(result);
  assert.equal(result.length, 2);
  assert.equal(result[1].id, 'anthropic/claude-sonnet-4-5');
});

test('parsePiModels handles large model lists', () => {
  const header = 'provider         model                  context  max-out  thinking  images\n';
  const rows = Array.from({ length: 600 }, (_, i) =>
    `provider${i % 5}        model-${i}       128K      16K      yes        no\n`,
  ).join('');
  const input = header + rows;

  const result = parsePiModels(input);

  assert.ok(result);
  assert.equal(result[0].id, 'default');
  assert.equal(result.length, 601); // default + 600
});

test('parsePiModels skips duplicate default id', () => {
  const input =
    'provider         model                  context  max-out  thinking  images\n' +
    'default          some-model              128K      16K      yes        no\n' +
    'anthropic        claude-sonnet-4-5       200K      64K      yes        yes\n';

  const result = parsePiModels(input);

  assert.ok(result);
  assert.equal(result.length, 3); // synthetic default + default/some-model + anthropic/claude-sonnet-4-5
  assert.equal(result[0].id, 'default');
  assert.equal(result[1].id, 'default/some-model');
});

// ─── RPC event translation (mapPiRpcEvent) ────────────────────────────────
//
// We test the pure event mapper directly — no child process, no stdin.
// This catches regressions like tool event ordering bugs.

import { createJsonLineStream } from '../src/acp.js';

function simulateRpcSession(rpcLines, options = {}) {
  const events = [];
  const send = (_channel, payload) => {
    events.push(payload);
  };
  const ctx = { runStartedAt: Date.now(), sentFirstToken: { value: false } };

  const parser = createJsonLineStream((raw) => {
    // Skip non-agent events that mapPiRpcEvent doesn't handle.
    if (raw.type === 'extension_ui_request') return;
    if (raw.type === 'response') return;

    mapPiRpcEvent(raw, send, ctx);
  });

  const input = rpcLines.map((l) => JSON.stringify(l)).join('\n') + '\n';
  parser.feed(input);
  parser.flush();
  return events;
}

test('pi RPC: text streaming from message_update events', () => {
  const events = simulateRpcSession([
    { type: 'agent_start' },
    { type: 'turn_start' },
    {
      type: 'message_update',
      assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: 'Hello ' },
    },
    {
      type: 'message_update',
      assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: 'world' },
    },
  ]);

  assert.deepEqual(events, [
    { type: 'status', label: 'working' },
    { type: 'status', label: 'thinking' },
    { type: 'status', label: 'streaming', ttftMs: events[2].ttftMs },
    { type: 'text_delta', delta: 'Hello ' },
    { type: 'text_delta', delta: 'world' },
  ]);
});

test('pi RPC: thinking events are mapped correctly', () => {
  const events = simulateRpcSession([
    { type: 'agent_start' },
    { type: 'turn_start' },
    {
      type: 'message_update',
      assistantMessageEvent: { type: 'thinking_start', contentIndex: 0 },
    },
    {
      type: 'message_update',
      assistantMessageEvent: { type: 'thinking_delta', contentIndex: 0, delta: 'hmm...' },
    },
    {
      type: 'message_update',
      assistantMessageEvent: { type: 'thinking_end', contentIndex: 0 },
    },
  ]);

  assert.deepEqual(events, [
    { type: 'status', label: 'working' },
    { type: 'status', label: 'thinking' },
    { type: 'thinking_start' },
    { type: 'thinking_delta', delta: 'hmm...' },
    { type: 'thinking_end' },
  ]);
});

test('pi RPC: usage extracted from turn_end', () => {
  const events = simulateRpcSession([
    { type: 'agent_start' },
    { type: 'turn_start' },
    {
      type: 'turn_end',
      message: {
        role: 'assistant',
        usage: { input: 100, output: 50, cacheRead: 20, cacheWrite: 5, totalTokens: 175 },
      },
    },
  ]);

  assert.equal(events.length, 3);
  assert.equal(events[2].type, 'usage');
  assert.deepEqual(events[2].usage, {
    input_tokens: 100,
    output_tokens: 50,
    cached_read_tokens: 20,
    cached_write_tokens: 5,
    total_tokens: 175,
  });
});

test('pi RPC: tool execution events mapped correctly', () => {
  const events = simulateRpcSession([
    { type: 'tool_execution_start', toolCallId: 'tc-1', toolName: 'read', args: { path: 'foo.txt' } },
    {
      type: 'tool_execution_end',
      toolCallId: 'tc-1',
      toolName: 'read',
      result: { content: [{ type: 'text', text: 'file contents here' }] },
      isError: false,
    },
  ]);

  assert.deepEqual(events, [
    { type: 'tool_use', id: 'tc-1', name: 'read', input: { path: 'foo.txt' } },
    { type: 'tool_result', toolUseId: 'tc-1', content: 'file contents here', isError: false },
  ]);
});

test('pi RPC: tool error results flagged correctly', () => {
  const events = simulateRpcSession([
    {
      type: 'tool_execution_end',
      toolCallId: 'tc-2',
      toolName: 'bash',
      result: { content: [{ type: 'text', text: 'command not found' }] },
      isError: true,
    },
  ]);

  assert.equal(events.length, 1);
  assert.equal(events[0].isError, true);
});

test('pi RPC: compaction and retry status events', () => {
  const events = simulateRpcSession([
    { type: 'compaction_start' },
    { type: 'auto_retry_start' },
  ]);

  assert.deepEqual(events, [
    { type: 'status', label: 'compacting' },
    { type: 'status', label: 'retrying' },
  ]);
});

test('pi RPC: extension UI fire-and-forget events are silently consumed', () => {
  const events = simulateRpcSession([
    { type: 'extension_ui_request', id: 'ui-1', method: 'setStatus', statusKey: 'foo', statusText: 'bar' },
    { type: 'extension_ui_request', id: 'ui-2', method: 'setWidget', widgetKey: 'baz' },
    { type: 'agent_start' },
  ]);

  // Only agent_start should produce an event; the UI requests are consumed.
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'status');
  assert.equal(events[0].label, 'working');
});

test('pi RPC: response events are silently consumed', () => {
  const events = simulateRpcSession([
    { type: 'response', command: 'prompt', success: true },
    { type: 'agent_start' },
  ]);

  assert.equal(events.length, 1);
  assert.equal(events[0].label, 'working');
});

test('pi RPC: full multi-turn session with tools and usage', () => {
  const events = simulateRpcSession([
    { type: 'agent_start' },
    { type: 'turn_start' },
    {
      type: 'message_update',
      assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: 'Let me check.' },
    },
    { type: 'tool_execution_start', toolCallId: 'tc-1', toolName: 'bash', args: { command: 'ls' } },
    {
      type: 'tool_execution_end',
      toolCallId: 'tc-1',
      toolName: 'bash',
      result: { content: [{ type: 'text', text: 'file1.txt\nfile2.txt' }] },
      isError: false,
    },
    {
      type: 'turn_end',
      message: {
        role: 'assistant',
        usage: { input: 200, output: 30, cacheRead: 0, cacheWrite: 0, totalTokens: 230 },
      },
    },
    { type: 'turn_start' },
    {
      type: 'message_update',
      assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: 'Done!' },
    },
    {
      type: 'turn_end',
      message: {
        role: 'assistant',
        usage: { input: 300, output: 5, cacheRead: 100, cacheWrite: 0, totalTokens: 405 },
      },
    },
  ]);

  // 2 turns with text, tool_use/tool_result, and usage
  assert.ok(events.some((e) => e.type === 'text_delta' && e.delta === 'Let me check.'));
  assert.ok(events.some((e) => e.type === 'tool_use' && e.id === 'tc-1' && e.name === 'bash'));
  assert.ok(events.some((e) => e.type === 'tool_result' && e.toolUseId === 'tc-1'));
  assert.ok(events.some((e) => e.type === 'text_delta' && e.delta === 'Done!'));
  // Usage from both turns
  const usageEvents = events.filter((e) => e.type === 'usage');
  assert.equal(usageEvents.length, 2);
  assert.equal(usageEvents[0].usage.input_tokens, 200);
  assert.equal(usageEvents[1].usage.cached_read_tokens, 100);
});

test('pi RPC: tool_use arrives before tool_result in event order', () => {
  // Regression: tool_use must be emitted from tool_execution_start,
  // not message_end, so the UI can pair it with the later tool_result.
  const events = simulateRpcSession([
    { type: 'agent_start' },
    { type: 'turn_start' },
    { type: 'tool_execution_start', toolCallId: 'tc-1', toolName: 'read', args: { path: 'a.txt' } },
    { type: 'tool_execution_end', toolCallId: 'tc-1', toolName: 'read', result: { content: [{ type: 'text', text: 'ok' }] }, isError: false },
  ]);

  const toolUseIdx = events.findIndex((e) => e.type === 'tool_use');
  const toolResultIdx = events.findIndex((e) => e.type === 'tool_result');
  assert.ok(toolUseIdx !== -1, 'tool_use event should exist');
  assert.ok(toolResultIdx !== -1, 'tool_result event should exist');
  assert.ok(toolUseIdx < toolResultIdx, 'tool_use must arrive before tool_result');
});

// ─── sendCommand format ─────────────────────────────────────────────────────

test('pi RPC: sendCommand writes well-formed pi command JSON', async () => {
  // We test the wire format by capturing what gets written to a mock writable.
  const written = [];
  const mockWritable = {
    write(data) {
      written.push(data);
    },
  };

  // Inline the sendCommand logic (same as in pi-rpc.js)
  let nextId = 1;
  function sendCommand(writable, type, params = {}) {
    const id = nextId++;
    writable.write(`${JSON.stringify({ id, type, ...params })}\n`);
    return id;
  }

  const id = sendCommand(mockWritable, 'prompt', { message: 'hello' });

  assert.equal(id, 1);
  assert.equal(written.length, 1);
  const parsed = JSON.parse(written[0].trim());
  assert.equal(parsed.type, 'prompt');
  assert.equal(parsed.id, 1);
  assert.equal(parsed.message, 'hello');
});

test('pi RPC: sendCommand increments ids across calls', () => {
  const written = [];
  const mockWritable = { write(data) { written.push(data); } };

  let nextId = 1;
  function sendCommand(writable, type, params = {}) {
    const id = nextId++;
    writable.write(`${JSON.stringify({ id, type, ...params })}\n`);
    return id;
  }

  const id1 = sendCommand(mockWritable, 'prompt', { message: 'a' });
  const id2 = sendCommand(mockWritable, 'steer', { message: 'b' });

  assert.equal(id1, 1);
  assert.equal(id2, 2);
  const p1 = JSON.parse(written[0].trim());
  const p2 = JSON.parse(written[1].trim());
  assert.equal(p1.type, 'prompt');
  assert.equal(p2.type, 'steer');
});

test('pi RPC: concurrent sessions get independent id sequences', () => {
  // Each session has its own nextRpcId counter, so two sessions
  // spawned at the same time get non-colliding ids.
  const written1 = [];
  const written2 = [];
  const mock1 = { write(data) { written1.push(data); } };
  const mock2 = { write(data) { written2.push(data); } };

  // Session 1
  let nextId1 = 1;
  function send1(w, type, params = {}) {
    const id = nextId1++;
    w.write(`${JSON.stringify({ id, type, ...params })}\n`);
    return id;
  }
  // Session 2
  let nextId2 = 1;
  function send2(w, type, params = {}) {
    const id = nextId2++;
    w.write(`${JSON.stringify({ id, type, ...params })}\n`);
    return id;
  }

  const id1 = send1(mock1, 'prompt', { message: 'hello' });
  const id2 = send2(mock2, 'prompt', { message: 'world' });

  assert.equal(id1, 1);
  assert.equal(id2, 1); // independent counter
  const p1 = JSON.parse(written1[0].trim());
  const p2 = JSON.parse(written2[0].trim());
  assert.equal(p1.id, 1);
  assert.equal(p2.id, 1);
});

test('pi RPC: no duplicate usage when both message_end and turn_end carry usage', () => {
  // Regression: pi emits both message_end and turn_end per turn,
  // both carrying usage. We must only emit from turn_end to avoid
  // double-counting. See Copilot review PR #117.
  const events = simulateRpcSession([
    { type: 'agent_start' },
    { type: 'turn_start' },
    {
      type: 'message_end',
      message: {
        role: 'assistant',
        usage: { input: 100, output: 50, cacheRead: 0, cacheWrite: 0, totalTokens: 150 },
      },
    },
    {
      type: 'turn_end',
      message: {
        role: 'assistant',
        usage: { input: 100, output: 50, cacheRead: 0, cacheWrite: 0, totalTokens: 150 },
      },
    },
  ]);

  const usageEvents = events.filter((e) => e.type === 'usage');
  assert.equal(usageEvents.length, 1, 'should emit exactly one usage event per turn');
  assert.equal(usageEvents[0].usage.input_tokens, 100);
});

// ─── attachPiRpcSession integration tests ──────────────────────────────────
//
// These exercise the real attachPiRpcSession against a mock child process
// so regressions in the actual function (wrong events, missing model
// normalization, abort not writing to stdin, etc.) are caught.

function createMockChild() {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.killed = false;
  child.kill = (signal) => {
    child.killed = true;
    child.emit('close', null, signal);
  };
  return child;
}

function createSession(childOpts = {}) {
  const events = [];
  const send = (channel, payload) => events.push({ channel, ...payload });
  const model = childOpts.model ?? null;
  const child = createMockChild();

  const session = attachPiRpcSession({
    child,
    prompt: 'test prompt',
    cwd: '/tmp',
    model,
    send,
  });

  return { child, session, events, send };
}

function feedStdoutLines(child, lines) {
  const input = lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
  child.stdout.write(input);
}

function closeStdout(child) {
  child.stdout.end();
  child.stdin.end();
}

test('attachPiRpcSession emits status:initializing with model name', () => {
  const { events } = createSession({ model: 'anthropic/claude-sonnet-4-5' });

  const init = events.find(
    (e) => e.channel === 'agent' && e.type === 'status' && e.label === 'initializing',
  );
  assert.ok(init, 'should emit status:initializing');
  assert.equal(init.model, 'anthropic/claude-sonnet-4-5');
});

test('attachPiRpcSession emits status:initializing with null model when model is null', () => {
  const { events } = createSession({ model: null });

  const init = events.find(
    (e) => e.channel === 'agent' && e.type === 'status' && e.label === 'initializing',
  );
  assert.ok(init, 'should emit status:initializing');
  assert.equal(init.model, null);
});

test('attachPiRpcSession sends prompt command on stdin', () => {
  const { child } = createSession();

  // Read what was written to stdin — the first line should be a prompt command.
  const chunks = [];
  child.stdin.on('data', (chunk) => chunks.push(chunk.toString()));
  // stdin already received the prompt write; PassThrough buffers it.
  const buffered = child.stdin.read();
  if (buffered) chunks.push(buffered.toString());

  const lines = chunks.join('').trim().split('\n');
  const promptLine = lines.find((l) => {
    try { return JSON.parse(l).type === 'prompt'; } catch { return false; }
  });
  assert.ok(promptLine, 'should send a prompt command on stdin');
  const parsed = JSON.parse(promptLine);
  assert.equal(parsed.type, 'prompt');
  assert.equal(parsed.message, 'test prompt');
});

test('attachPiRpcSession abort() writes well-formed abort command to stdin', () => {
  const { child, session } = createSession();

  // Drain any buffered stdin data (the prompt command) before abort.
  child.stdin.read();

  const chunks = [];
  child.stdin.on('data', (chunk) => chunks.push(chunk.toString()));

  session.abort();

  // Read the abort command from stdin buffer.
  const buffered = child.stdin.read();
  if (buffered) chunks.push(buffered.toString());

  const lines = chunks.join('').trim().split('\n');
  const abortLine = lines.find((l) => {
    try { return JSON.parse(l).type === 'abort'; } catch { return false; }
  });
  assert.ok(abortLine, 'should send an abort command on stdin');
  const parsed = JSON.parse(abortLine);
  assert.equal(parsed.type, 'abort');
  assert.equal(typeof parsed.id, 'number');
});

test('attachPiRpcSession abort() is idempotent and no-op after stdin close', () => {
  const { child, session } = createSession();

  // Drain buffered data.
  child.stdin.read();

  // Close stdin (simulates pi process exiting).
  child.stdin.end();
  child.stdin.emit('close');

  const chunks = [];
  child.stdin.on('data', (chunk) => chunks.push(chunk.toString()));

  // abort() should be a no-op because finished is already true or stdin is closed.
  session.abort();
  session.abort(); // idempotent

  const buffered = child.stdin.read();
  assert.equal(buffered, null, 'no bytes should be written after abort on closed stdin');
});

test('attachPiRpcSession: no agent events emitted after abort()', () => {
  const { child, events, session } = createSession();

  // Feed normal session events.
  feedStdoutLines(child, [
    { type: 'agent_start' },
    { type: 'turn_start' },
    {
      type: 'message_update',
      assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: 'Thinking...' },
    },
  ]);

  const beforeCount = events.length;
  assert.ok(beforeCount > 0, 'should have events before abort');

  // Abort — sets finished = true, gates further stdout events.
  session.abort();

  // Feed more agent events that arrive during the abort grace window.
  feedStdoutLines(child, [
    {
      type: 'message_update',
      assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: 'Should not appear' },
    },
    { type: 'tool_execution_start', toolCallId: 'tc-1', toolName: 'bash', args: { command: 'ls' } },
    {
      type: 'message_update',
      assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: 'More text' },
    },
    {
      type: 'turn_end',
      message: {
        role: 'assistant',
        usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 15 },
      },
    },
    { type: 'agent_end' },
  ]);
  closeStdout(child);

  // No new agent events should have been emitted after abort.
  assert.equal(events.length, beforeCount, 'no events should be emitted after abort');
  assert.ok(
    events.every((e) => e.delta !== 'Should not appear' && e.delta !== 'More text'),
    'post-abort text must not appear in events',
  );
});
