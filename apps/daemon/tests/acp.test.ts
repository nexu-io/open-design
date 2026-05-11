import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import path from 'node:path';
import { test } from 'vitest';
import { attachAcpSession, buildAcpSessionNewParams, normalizeModels } from '../src/acp.js';

const DEFAULT_MODEL_OPTION = { id: 'default', label: 'Default (CLI config)' };

test('ACP session params do not require MCP servers by default', () => {
  assert.deepEqual(buildAcpSessionNewParams('/tmp/od-project'), {
    cwd: path.resolve('/tmp/od-project'),
    mcpServers: [],
  });
});

test('ACP session params do not request global MCP config mutation', () => {
  const params = buildAcpSessionNewParams('/tmp/od-project');

  assert.equal('mcpConfigPath' in params, false);
  assert.equal('writeMcpConfig' in params, false);
  assert.equal('installMcpServers' in params, false);
});

test('ACP session params normalize explicit MCP servers to ACP stdio shape', () => {
  const mcpServers = [{ name: 'open-design-live-artifacts', command: 'od', args: ['mcp', 'live-artifacts'] }];

  assert.deepEqual(buildAcpSessionNewParams('/tmp/od-project', { mcpServers }), {
    cwd: path.resolve('/tmp/od-project'),
    mcpServers: [
      {
        type: 'stdio',
        name: 'open-design-live-artifacts',
        command: 'od',
        args: ['mcp', 'live-artifacts'],
        env: [],
      },
    ],
  });
});

test('ACP session params preserve caller-provided type and env fields', () => {
  const mcpServers = [
    { type: 'http', name: 'http-server', url: 'http://localhost:3000', headers: {}, env: [{ key: 'TOKEN', value: 'secret' }] },
  ];

  const result = buildAcpSessionNewParams('/tmp/od-project', { mcpServers });
  const server = result.mcpServers[0];
  assert.ok(server);
  assert.equal(server.type, 'http');
  assert.equal(server.name, 'http-server');
  assert.deepEqual(server.env, [{ key: 'TOKEN', value: 'secret' }]);
});

test('ACP model normalization prefers session configOptions models', () => {
  const models = normalizeModels(
    {
      currentModelId: 'legacy-model',
      availableModels: [{ modelId: 'legacy-model', name: 'Legacy Model' }],
    },
    DEFAULT_MODEL_OPTION,
    [
      {
        id: 'model',
        type: 'select',
        category: 'model',
        currentValue: 'swe-1-6-fast',
        options: [
          { value: 'claude-opus-4-6-thinking', name: 'Claude Opus 4.6 Thinking' },
          { id: 'swe-1-6-fast', name: 'SWE-1.6 Fast' },
        ],
      },
    ],
  );

  assert.deepEqual(models, [
    DEFAULT_MODEL_OPTION,
    {
      id: 'claude-opus-4-6-thinking',
      label: 'Claude Opus 4.6 Thinking (claude-opus-4-6-thinking)',
    },
    {
      id: 'swe-1-6-fast',
      label: 'SWE-1.6 Fast (swe-1-6-fast) • current',
    },
  ]);
});

test('ACP model normalization accepts category-less model configOptions', () => {
  const models = normalizeModels(null, DEFAULT_MODEL_OPTION, [
    {
      id: 'models',
      type: 'select',
      name: 'Model',
      currentValue: 'swe-1-6-fast',
      options: [
        { value: 'claude-opus-4-6-thinking', name: 'Claude Opus 4.6 Thinking' },
        { value: 'swe-1-6-fast', name: 'SWE-1.6 Fast' },
      ],
    },
  ]);

  assert.deepEqual(models, [
    DEFAULT_MODEL_OPTION,
    {
      id: 'claude-opus-4-6-thinking',
      label: 'Claude Opus 4.6 Thinking (claude-opus-4-6-thinking)',
    },
    {
      id: 'swe-1-6-fast',
      label: 'SWE-1.6 Fast (swe-1-6-fast) • current',
    },
  ]);
});

test('attachAcpSession sets selected models through ACP config options', () => {
  const child = new FakeAcpChild();
  const writes: string[] = [];
  const events: Array<{ event: string; payload: unknown }> = [];
  child.stdin.on('data', (chunk) => writes.push(String(chunk)));

  attachAcpSession({
    child: child as never,
    prompt: 'hello',
    cwd: '/tmp/od-project',
    model: 'claude-opus-4-6-thinking',
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
  });

  writeAcpResult(child, 1, {});
  writeAcpResult(child, 2, {
    sessionId: 'session-1',
    configOptions: [
      {
        id: 'models',
        type: 'select',
        name: 'Model',
        currentValue: 'swe-1-6-fast',
        options: [
          { value: 'claude-opus-4-6-thinking', name: 'Claude Opus 4.6 Thinking' },
          { value: 'swe-1-6-fast', name: 'SWE-1.6 Fast' },
        ],
      },
    ],
  });
  writeAcpResult(child, 3, {
    configOptions: [
      {
        id: 'models',
        type: 'select',
        name: 'Model',
        currentValue: 'claude-opus-4-6-thinking',
        options: [],
      },
    ],
  });
  writeAcpResult(child, 4, { usage: { inputTokens: 1, outputTokens: 2 } });

  const requests = parseRpcWrites(writes);
  const configRequest = requests.find((entry) => entry.method === 'session/set_config_option');
  assert.deepEqual(configRequest?.params, {
    sessionId: 'session-1',
    configId: 'models',
    value: 'claude-opus-4-6-thinking',
  });
  assert.equal(requests.some((entry) => entry.method === 'session/set_model'), false);
  assert.deepEqual(agentModelStatuses(events), [
    'swe-1-6-fast',
    'claude-opus-4-6-thinking',
  ]);
});

test('attachAcpSession keeps legacy session/set_model when no model config option exists', () => {
  const child = new FakeAcpChild();
  const writes: string[] = [];
  child.stdin.on('data', (chunk) => writes.push(String(chunk)));

  attachAcpSession({
    child: child as never,
    prompt: 'hello',
    cwd: '/tmp/od-project',
    model: 'legacy-model',
    mcpServers: [],
    send: () => {},
  });

  writeAcpResult(child, 1, {});
  writeAcpResult(child, 2, {
    sessionId: 'session-1',
    models: { currentModelId: 'default' },
  });
  writeAcpResult(child, 3, { models: { currentModelId: 'legacy-model' } });
  writeAcpResult(child, 4, {});

  const requests = parseRpcWrites(writes);
  const setModelRequest = requests.find((entry) => entry.method === 'session/set_model');
  assert.deepEqual(setModelRequest?.params, {
    sessionId: 'session-1',
    modelId: 'legacy-model',
  });
  assert.equal(requests.some((entry) => entry.method === 'session/set_config_option'), false);
});

test('attachAcpSession exposes abort and sends session cancel after session creation', () => {
  const child = new FakeAcpChild();
  const writes: string[] = [];
  child.stdin.on('data', (chunk) => writes.push(String(chunk)));

  const session = attachAcpSession({
    child: child as never,
    prompt: 'hello',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: () => {},
  });

  child.stdout.write(`${JSON.stringify({ id: 1, result: {} })}\n`);
  child.stdout.write(`${JSON.stringify({ id: 2, result: { sessionId: 'session-1' } })}\n`);

  assert.equal(typeof session.abort, 'function');
  session.abort();
  session.abort();

  const parsed = parseRpcWrites(writes);
  const cancelRequests = parsed.filter((entry) => entry.method === 'session/cancel');
  assert.equal(cancelRequests.length, 1);
  const cancelRequest = cancelRequests[0];
  assert.ok(cancelRequest);
  assert.deepEqual(cancelRequest.params, { sessionId: 'session-1' });
});

function parseRpcWrites(writes: string[]): Array<Record<string, unknown>> {
  return writes
    .join('')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function writeAcpResult(child: FakeAcpChild, id: number, result: unknown): void {
  child.stdout.write(`${JSON.stringify({ id, result })}\n`);
}

function agentModelStatuses(events: Array<{ event: string; payload: unknown }>): unknown[] {
  return events
    .filter((entry) => {
      const payload = entry.payload as { type?: unknown; label?: unknown };
      return entry.event === 'agent' && payload.type === 'status' && payload.label === 'model';
    })
    .map((entry) => (entry.payload as { model?: unknown }).model);
}

class FakeAcpChild extends EventEmitter {
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  killed = false;

  kill() {
    this.killed = true;
    return true;
  }
}
