import { describe, test } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import {
  createRuntimeAdapter,
  RUNTIME_STREAM_FORMATS,
} from '../../src/runtimes/runtime-adapter.js';
import { AGENT_DEFS, assert, minimalAgentDef } from './helpers/test-helpers.js';

type MockChildProcess = EventEmitter & {
  stdin: PassThrough;
  stdout: PassThrough;
  stderr: PassThrough;
  killed: boolean;
  kill: (signal?: NodeJS.Signals | number) => boolean;
};

type SentEvent = {
  channel: string;
  payload: unknown;
};

function createMockChild(): MockChildProcess {
  const child = new EventEmitter() as MockChildProcess;
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.killed = false;
  child.kill = (signal?: NodeJS.Signals | number) => {
    child.killed = true;
    child.emit('close', null, signal);
    return true;
  };
  return child;
}

function agentEvents(events: SentEvent[]) {
  return events
    .filter((event) => event.channel === 'agent')
    .map((event) => event.payload);
}

function containsSubset(value: unknown, subset: unknown): boolean {
  if (subset === null || typeof subset !== 'object') {
    return Object.is(value, subset);
  }
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const valueRecord = value as Record<string, unknown>;
  const subsetRecord = subset as Record<string, unknown>;
  return Object.entries(subsetRecord).every(([key, expected]) => {
    return containsSubset(valueRecord[key], expected);
  });
}

describe('runtime adapter foundation', () => {
  test('covers every stream format used by current runtime definitions', () => {
    const definedFormats = new Set(AGENT_DEFS.map((def) => def.streamFormat));

    assert.deepEqual(
      [...definedFormats].sort(),
      [...RUNTIME_STREAM_FORMATS].sort(),
    );

    for (const def of AGENT_DEFS) {
      const adapter = createRuntimeAdapter(def);
      assert.equal(adapter.id, def.id);
      assert.equal(adapter.displayName, def.name);
      assert.equal(adapter.streamFormat, def.streamFormat);
      assert.equal(adapter.eventParser, def.eventParser || def.id);
    }
  });

  test('exposes stdin behavior without leaking protocol checks to callers', () => {
    for (const def of AGENT_DEFS) {
      const adapter = createRuntimeAdapter(def);
      assert.equal(
        adapter.stdinMode(),
        def.promptViaStdin || def.streamFormat === 'acp-json-rpc'
          ? 'pipe'
          : 'ignore',
      );
      assert.equal(
        adapter.shouldWritePromptToStdin(),
        Boolean(def.promptViaStdin && def.streamFormat !== 'pi-rpc'),
      );
    }
  });

  test('keeps critique theater eligibility as an adapter capability', () => {
    for (const def of AGENT_DEFS) {
      assert.equal(
        createRuntimeAdapter(def).supportsCritiqueTheater(),
        def.streamFormat === 'plain',
      );
    }
  });

  test('exposes ACP MCP support as an adapter capability', () => {
    for (const def of AGENT_DEFS) {
      assert.equal(
        createRuntimeAdapter(def).acceptsExternalMcpServers(),
        def.streamFormat === 'acp-json-rpc',
      );
    }
  });

  test('classifies close status through attachment state', () => {
    const child = new EventEmitter() as EventEmitter & { stdout: PassThrough };
    child.stdout = new PassThrough();
    const plain = createRuntimeAdapter(minimalAgentDef({
      bin: 'plain-agent',
      streamFormat: 'plain',
    })).attach({
      child: child as never,
      prompt: 'hello',
      send: () => {},
    });

    assert.equal(plain.classifyClose({ code: 0, signal: null }), 'succeeded');
    assert.equal(plain.classifyClose({ code: 1, signal: null }), 'failed');
    assert.equal(
      plain.classifyClose({ code: null, signal: 'SIGTERM', canceled: true }),
      'canceled',
    );
  });

  test('keeps structured empty-output failures in adapter close classification', () => {
    const child = new EventEmitter() as EventEmitter & { stdout: PassThrough };
    child.stdout = new PassThrough();
    const structured = createRuntimeAdapter(minimalAgentDef({
      bin: 'opencode',
      id: 'opencode',
      streamFormat: 'json-event-stream',
    })).attach({
      child: child as never,
      prompt: 'hello',
      send: () => {},
    });

    assert.equal(structured.trackingSubstantiveOutput, true);
    assert.equal(structured.producedSubstantiveOutput(), false);
    assert.equal(structured.classifyClose({ code: 0, signal: null }), 'failed');
  });

  test('attach routes structured stdout through the adapter-selected parser', () => {
    const cases = [
      {
        name: 'claude-stream-json',
        def: minimalAgentDef({
          bin: 'claude',
          id: 'claude',
          streamFormat: 'claude-stream-json',
        }),
        input: `${JSON.stringify({
          type: 'assistant',
          message: {
            id: 'msg-1',
            content: [{
              type: 'tool_use',
              id: 'toolu-1',
              name: 'TodoWrite',
              input: { todos: [{ content: 'Run QA', status: 'pending' }] },
            }],
          },
        })}\n`,
        expected: [{
          type: 'tool_use',
          id: 'toolu-1',
          name: 'TodoWrite',
          input: { todos: [{ content: 'Run QA', status: 'pending' }] },
        }],
        trackingSubstantiveOutput: false,
        producedSubstantiveOutput: false,
      },
      {
        name: 'qoder-stream-json',
        def: minimalAgentDef({
          bin: 'qoder',
          id: 'qoder',
          streamFormat: 'qoder-stream-json',
        }),
        input: `${JSON.stringify({
          type: 'system',
          subtype: 'init',
          qodercli_version: '0.2.6',
          model: 'auto',
          session_id: 'session-1',
        })}\n${JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Buffered output' }] },
        })}\n`,
        expected: [
          {
            type: 'status',
            label: 'initializing',
            model: 'auto',
            sessionId: 'session-1',
            qodercliVersion: '0.2.6',
          },
          { type: 'text_delta', delta: 'Buffered output' },
        ],
        trackingSubstantiveOutput: true,
        producedSubstantiveOutput: true,
      },
      {
        name: 'copilot-stream-json',
        def: minimalAgentDef({
          bin: 'copilot',
          id: 'copilot',
          streamFormat: 'copilot-stream-json',
        }),
        input: `${JSON.stringify({
          type: 'tool.execution_start',
          data: {
            toolCallId: 'call-1',
            toolName: 'TodoWrite',
            arguments: { todos: [{ content: 'Run QA', status: 'pending' }] },
          },
        })}\n`,
        expected: [{
          type: 'tool_use',
          id: 'call-1',
          name: 'TodoWrite',
          input: { todos: [{ content: 'Run QA', status: 'pending' }] },
        }],
        trackingSubstantiveOutput: false,
        producedSubstantiveOutput: false,
      },
      {
        name: 'json-event-stream',
        def: minimalAgentDef({
          bin: 'opencode',
          id: 'opencode',
          streamFormat: 'json-event-stream',
        }),
        input:
          '{"type":"step_start","sessionID":"ses-1","part":{"type":"step-start"}}\n' +
          '{"type":"text","sessionID":"ses-1","part":{"type":"text","text":"hello"}}\n',
        expected: [
          { type: 'status', label: 'running' },
          { type: 'text_delta', delta: 'hello' },
        ],
        trackingSubstantiveOutput: true,
        producedSubstantiveOutput: true,
      },
    ];

    for (const testCase of cases) {
      const child = createMockChild();
      const events: SentEvent[] = [];
      const attachment = createRuntimeAdapter(testCase.def).attach({
        child: child as never,
        prompt: 'hello',
        send: (channel, payload) => events.push({ channel, payload }),
      });

      child.stdout.write(testCase.input);
      child.emit('close', 0, null);

      assert.deepEqual(agentEvents(events), testCase.expected, testCase.name);
      assert.equal(attachment.trackingSubstantiveOutput, testCase.trackingSubstantiveOutput);
      assert.equal(attachment.producedSubstantiveOutput(), testCase.producedSubstantiveOutput);
    }
  });

  test('attach returns a Pi session handle and forwards Pi RPC agent events', () => {
    const child = createMockChild();
    const events: SentEvent[] = [];
    const attachment = createRuntimeAdapter(minimalAgentDef({
      bin: 'pi',
      id: 'pi',
      streamFormat: 'pi-rpc',
    })).attach({
      child: child as never,
      prompt: 'hello',
      model: 'openai/gpt-5',
      send: (channel, payload) => events.push({ channel, payload }),
    });

    assert.ok(attachment.session);
    assert.equal(typeof attachment.session?.abort, 'function');

    child.stdout.write([
      { type: 'agent_start' },
      { type: 'turn_start' },
      {
        type: 'message_update',
        assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: 'Hello from Pi' },
      },
    ].map((line) => JSON.stringify(line)).join('\n') + '\n');

    const emitted = agentEvents(events);
    assert.ok(emitted.some((event) => containsSubset(event, {
      type: 'status',
      label: 'initializing',
      model: 'openai/gpt-5',
    })));
    assert.ok(emitted.some((event) => containsSubset(event, {
      type: 'text_delta',
      delta: 'Hello from Pi',
    })));
    assert.equal(attachment.producedSubstantiveOutput(), true);
  });

  test('attach returns an ACP session handle and forwards ACP session events', () => {
    const child = createMockChild();
    const events: SentEvent[] = [];
    const attachment = createRuntimeAdapter(minimalAgentDef({
      bin: 'vibe',
      id: 'vibe',
      streamFormat: 'acp-json-rpc',
    })).attach({
      child: child as never,
      prompt: 'hello',
      cwd: '/tmp/od-project',
      model: 'legacy-model',
      mcpServers: [],
      send: (channel, payload) => events.push({ channel, payload }),
    });

    assert.ok(attachment.session);
    assert.equal(typeof attachment.session?.abort, 'function');

    child.stdout.write(`${JSON.stringify({ id: 1, result: {} })}\n`);
    child.stdout.write(`${JSON.stringify({
      id: 2,
      result: {
        sessionId: 'session-1',
        models: { currentModelId: 'default' },
      },
    })}\n`);
    child.stdout.write(`${JSON.stringify({
      id: 3,
      result: { models: { currentModelId: 'legacy-model' } },
    })}\n`);
    child.stdout.write(`${JSON.stringify({
      id: 4,
      result: { usage: { inputTokens: 1, outputTokens: 2 } },
    })}\n`);
    child.emit('close', 0, null);

    const emitted = agentEvents(events);
    assert.ok(emitted.some((event) => containsSubset(event, {
      type: 'status',
      label: 'model',
      model: 'legacy-model',
    })));
    assert.ok(emitted.some((event) => containsSubset(event, {
      type: 'usage',
      usage: { input_tokens: 1, output_tokens: 2 },
    })));
    assert.equal(attachment.session?.completedSuccessfully?.(), true);
  });

  test('fails fast for unknown stream formats', () => {
    const def = minimalAgentDef({
      bin: 'ghost-agent',
      id: 'ghost-agent',
      streamFormat: 'ghost-stream',
    });

    assert.throws(
      () => createRuntimeAdapter(def),
      /Unsupported streamFormat "ghost-stream" for runtime "ghost-agent"/,
    );
  });
});
