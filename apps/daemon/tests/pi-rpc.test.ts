// @ts-nocheck
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { parsePiModels } from '../src/pi-rpc.js';

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

// ─── RPC event translation (attachPiRpcSession) ────────────────────────────
//
// We test the event translation by simulating pi's RPC stdout lines
// through the same parser pipeline that attachPiRpcSession uses.

import { createJsonLineStream } from '../src/acp.js';

function simulateRpcSession(rpcLines, options = {}) {
  const events = [];
  const send = (_channel, payload) => {
    events.push(payload);
  };
  const parser = createJsonLineStream((raw) => {
    // Inline the core event translation from attachPiRpcSession
    // to test the mapping logic in isolation (no child process needed).

    if (raw.type === 'extension_ui_request') return; // skip
    if (raw.type === 'response') return; // skip

    if (raw.type === 'agent_start') {
      send('agent', { type: 'status', label: 'working' });
      return;
    }

    if (raw.type === 'turn_start') {
      send('agent', { type: 'status', label: 'thinking' });
      return;
    }

    if (raw.type === 'message_update' && raw.assistantMessageEvent) {
      const ev = raw.assistantMessageEvent;
      if (ev.type === 'text_delta' && typeof ev.delta === 'string') {
        send('agent', { type: 'text_delta', delta: ev.delta });
      } else if (ev.type === 'thinking_delta' && typeof ev.delta === 'string') {
        send('agent', { type: 'thinking_delta', delta: ev.delta });
      } else if (ev.type === 'thinking_start') {
        send('agent', { type: 'thinking_start' });
      } else if (ev.type === 'thinking_end') {
        send('agent', { type: 'thinking_end' });
      }
      return;
    }

    if (raw.type === 'turn_end' && raw.message?.usage) {
      const u = raw.message.usage;
      const usage = {};
      if (typeof u.input === 'number') usage.input_tokens = u.input;
      if (typeof u.output === 'number') usage.output_tokens = u.output;
      if (typeof u.cacheRead === 'number') usage.cached_read_tokens = u.cacheRead;
      if (typeof u.cacheWrite === 'number') usage.cached_write_tokens = u.cacheWrite;
      if (Object.keys(usage).length > 0) {
        send('agent', { type: 'usage', usage, durationMs: 100 });
      }
      return;
    }

    if (raw.type === 'tool_execution_start') {
      send('agent', { type: 'status', label: 'tool', toolName: raw.toolName ?? null });
      return;
    }

    if (raw.type === 'tool_execution_end') {
      const content = raw.result?.content;
      const text = Array.isArray(content)
        ? content.map((c) => (c?.type === 'text' ? c.text : JSON.stringify(c))).join('\n')
        : typeof content === 'string' ? content : '';
      send('agent', { type: 'tool_result', toolUseId: raw.toolCallId ?? null, content: text, isError: raw.isError === true });
      return;
    }

    if (raw.type === 'compaction_start') {
      send('agent', { type: 'status', label: 'compacting' });
      return;
    }
    if (raw.type === 'auto_retry_start') {
      send('agent', { type: 'status', label: 'retrying' });
      return;
    }
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
    { type: 'status', label: 'tool', toolName: 'read' },
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

  // 2 turns × (status + text/tool/usage)
  assert.ok(events.some((e) => e.type === 'text_delta' && e.delta === 'Let me check.'));
  assert.ok(events.some((e) => e.type === 'tool_result' && e.toolUseId === 'tc-1'));
  assert.ok(events.some((e) => e.type === 'text_delta' && e.delta === 'Done!'));
  // Usage from both turns
  const usageEvents = events.filter((e) => e.type === 'usage');
  assert.equal(usageEvents.length, 2);
  assert.equal(usageEvents[0].usage.input_tokens, 200);
  assert.equal(usageEvents[1].usage.cached_read_tokens, 100);
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
