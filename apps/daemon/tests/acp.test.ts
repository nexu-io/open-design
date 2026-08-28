import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import { PassThrough } from 'node:stream';
import path from 'node:path';
import { expect, test, vi } from 'vitest';
import { attachAcpSession, buildAcpSessionNewParams, createJsonLineStream, normalizeModels } from '../src/agent-protocol/index.js';
import {
  acpTelemetryToolCallId,
  acpToolName,
  isAcpPartialRedactToolName,
} from '../src/agent-protocol/acp/updates.js';
import { countNewArtifacts } from '../src/runtimes/run-artifacts.js';
import { excludeAcpImagePathsAlreadyDeliveredAsResources } from '../src/runtimes/chat-prompt-inputs.js';

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

test('attachAcpSession stops an AMR turn when session/set_model rejects the selected model', () => {
  const child = new FakeAcpChild();
  const writes: string[] = [];
  const events: Array<{ event: string; payload: unknown }> = [];
  child.stdin.on('data', (chunk) => writes.push(String(chunk)));

  const session = attachAcpSession({
    child: child as never,
    prompt: 'hello',
    cwd: '/tmp/od-project',
    model: 'claude-opus-5',
    mcpServers: [],
    modelUnavailableErrorCode: 'AMR_MODEL_UNAVAILABLE',
    send: (event, payload) => events.push({ event, payload }),
  });

  try {
    writeAcpResult(child, 1, {});
    writeAcpResult(child, 2, {
      sessionId: 'session-1',
      models: { currentModelId: null },
    });
    writeAcpError(child, 3, {
      code: -32602,
      message: 'session/set_model modelId is not available',
    });

    const requests = parseRpcWrites(writes);
    assert.equal(requests.some((entry) => entry.method === 'session/set_model'), true);
    assert.equal(requests.some((entry) => entry.method === 'session/prompt'), false);
    assert.deepEqual(agentModelStatuses(events), []);
    assert.equal(session.hasFatalError(), true);
    assert.equal(session.completedSuccessfully(), false);
    assert.deepEqual(events.filter((entry) => entry.event === 'error'), [
      {
        event: 'error',
        payload: {
          message: 'json-rpc id 3: session/set_model modelId is not available',
          error: {
            code: 'AMR_MODEL_UNAVAILABLE',
            message: 'json-rpc id 3: session/set_model modelId is not available',
            retryable: false,
            details: { kind: 'amr_model', action: 'choose_model' },
          },
        },
      },
    ]);
  } finally {
    session.abort();
  }
});

test('attachAcpSession preserves default-model recovery for other ACP agents', () => {
  const child = new FakeAcpChild();
  const writes: string[] = [];
  const events: Array<{ event: string; payload: unknown }> = [];
  child.stdin.on('data', (chunk) => writes.push(String(chunk)));

  const session = attachAcpSession({
    child: child as never,
    prompt: 'hello',
    cwd: '/tmp/od-project',
    model: 'optional-model',
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
  });

  try {
    writeAcpResult(child, 1, {});
    writeAcpResult(child, 2, {
      sessionId: 'session-1',
      models: { currentModelId: null },
    });
    writeAcpError(child, 3, {
      code: -32602,
      message: 'optional model selection is unavailable',
    });

    assert.equal(
      parseRpcWrites(writes).some((entry) => entry.method === 'session/prompt'),
      true,
    );
    assert.deepEqual(agentModelStatuses(events), ['default']);

    writeAcpResult(child, 4, {});
    assert.equal(session.hasFatalError(), false);
    assert.equal(session.completedSuccessfully(), true);
    assert.deepEqual(events.filter((entry) => entry.event === 'error'), []);
  } finally {
    session.abort();
  }
});

test('attachAcpSession includes frozen PDF, text, and image attachments as ACP resource links', () => {
  const child = new FakeAcpChild();
  const writes: string[] = [];
  child.stdin.on('data', (chunk) => writes.push(String(chunk)));
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-acp-image-'));
  const imagePath = path.join(tmpDir, 'screenshot.png');
  const pdfPath = path.join(tmpDir, 'brief.pdf');
  const textPath = path.join(tmpDir, 'notes.txt');
  fs.writeFileSync(imagePath, 'png');
  fs.writeFileSync(pdfPath, '%PDF-1.7\nbrief');
  fs.writeFileSync(textPath, 'notes');

  attachAcpSession({
    child: child as never,
    prompt: 'describe this image',
    cwd: '/tmp/od-project',
    model: null,
    imagePaths: excludeAcpImagePathsAlreadyDeliveredAsResources(
      [imagePath],
      [pdfPath, textPath, imagePath],
    ),
    resourcePaths: [pdfPath, textPath, imagePath],
    mcpServers: [],
    send: () => {},
  });

  writeAcpResult(child, 1, {});
  writeAcpResult(child, 2, { sessionId: 'session-1' });
  writeAcpResult(child, 3, {});

  const requests = parseRpcWrites(writes);
  const promptRequest = requests.find((entry) => entry.method === 'session/prompt');
  assert.deepEqual(promptRequest?.params, {
    sessionId: 'session-1',
    prompt: [
      { type: 'text', text: 'describe this image' },
      { type: 'resource_link', uri: pdfPath },
      { type: 'resource_link', uri: textPath },
      { type: 'resource_link', uri: imagePath },
    ],
  });
});

test('attachAcpSession preserves duplicate ordinary image resource links', () => {
  const child = new FakeAcpChild();
  const writes: string[] = [];
  child.stdin.on('data', (chunk) => writes.push(String(chunk)));
  const imagePath = '/tmp/ordinary-duplicate.png';

  attachAcpSession({
    child: child as never,
    prompt: 'describe both image occurrences',
    cwd: '/tmp/od-project',
    model: null,
    imagePaths: [imagePath, imagePath],
    mcpServers: [],
    send: () => {},
  });
  child.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, result: { protocolVersion: 1 } })}\n`);
  child.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, result: { sessionId: 'session-1' } })}\n`);

  const promptRequest = writes
    .map((line) => JSON.parse(line) as { method?: string; params?: unknown })
    .find((entry) => entry.method === 'session/prompt');
  expect(promptRequest?.params).toEqual({
    sessionId: 'session-1',
    prompt: [
      { type: 'text', text: 'describe both image occurrences' },
      { type: 'resource_link', uri: imagePath },
      { type: 'resource_link', uri: imagePath },
    ],
  });
});

test('attachAcpSession converts cumulative ACP message snapshots into deltas', () => {
  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: unknown }> = [];

  attachAcpSession({
    child: child as never,
    prompt: 'describe the project',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
  });

  writeAcpResult(child, 1, {});
  writeAcpResult(child, 2, { sessionId: 'session-1' });
  writeAcpUpdate(child, {
    sessionUpdate: 'agent_message_chunk',
    content: { text: 'Agent Haven' },
  });
  writeAcpUpdate(child, {
    sessionUpdate: 'agent_message_chunk',
    content: { text: 'Agent Haven — managed AI agents' },
  });
  writeAcpUpdate(child, {
    sessionUpdate: 'agent_message_chunk',
    content: { text: 'Agent Haven — managed AI agents' },
  });
  writeAcpResult(child, 3, { usage: { inputTokens: 1, outputTokens: 2 } });

  const textDeltas = events
    .filter((entry) => entry.event === 'agent' && (entry.payload as { type?: unknown }).type === 'text_delta')
    .map((entry) => (entry.payload as { delta?: unknown }).delta);

  assert.deepEqual(textDeltas, ['Agent Haven', ' — managed AI agents']);
});

test('attachAcpSession keeps incremental ACP message chunks unchanged', () => {
  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: unknown }> = [];

  attachAcpSession({
    child: child as never,
    prompt: 'describe the project',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
  });

  writeAcpResult(child, 1, {});
  writeAcpResult(child, 2, { sessionId: 'session-1' });
  writeAcpUpdate(child, {
    sessionUpdate: 'agent_message_chunk',
    content: { text: 'Agent Haven' },
  });
  writeAcpUpdate(child, {
    sessionUpdate: 'agent_message_chunk',
    content: { text: ' — managed AI agents' },
  });
  writeAcpResult(child, 3, { usage: { inputTokens: 1, outputTokens: 2 } });

  const textDeltas = events
    .filter((entry) => entry.event === 'agent' && (entry.payload as { type?: unknown }).type === 'text_delta')
    .map((entry) => (entry.payload as { delta?: unknown }).delta);

  assert.deepEqual(textDeltas, ['Agent Haven', ' — managed AI agents']);
});

test('attachAcpSession forwards ACP status message details', () => {
  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: unknown }> = [];

  attachAcpSession({
    child: child as never,
    prompt: 'describe the project',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
  });

  writeAcpResult(child, 1, {});
  writeAcpResult(child, 2, { sessionId: 'session-1' });
  writeAcpUpdate(child, {
    sessionUpdate: 'context_compaction',
    status: 'in_progress',
    message: 'Compacting conversation history after a context-length error',
  });
  writeAcpResult(child, 3, { usage: { inputTokens: 1, outputTokens: 2 } });

  const status = events
    .filter((entry) => entry.event === 'agent')
    .map((entry) => entry.payload as { type?: string; label?: string; detail?: string })
    .find((payload) => payload.type === 'status' && payload.label === 'context_compaction');

  assert.equal(status?.detail, 'Compacting conversation history after a context-length error');
});

test('attachAcpSession suppresses split duplicate DSML artifact text and preserves trailing prose', () => {
  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: unknown }> = [];

  attachAcpSession({
    child: child as never,
    prompt: 'build landing page',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
  });

  writeAcpResult(child, 1, {});
  writeAcpResult(child, 2, { sessionId: 'session-1' });
  writeAcpUpdate(child, {
    sessionUpdate: 'tool_call_update',
    toolCallId: 'call-1',
    title: 'edit',
    status: 'completed',
  });
  writeAcpUpdate(child, {
    sessionUpdate: 'agent_message_chunk',
    content: { text: 'Build passes. No AI slop detected.\n\n< | DSML artifact identifier="page" type="text/html">' },
  });
  assert.equal(child.stdin.writableEnded, false);
  writeAcpUpdate(child, {
    sessionUpdate: 'agent_message_chunk',
    content: { text: '\n<!doctype html><html><body>raw html</body></html>\n</art' },
  });
  writeAcpUpdate(child, {
    sessionUpdate: 'agent_message_chunk',
    content: { text: 'ifact>Tail' },
  });
  writeAcpResult(child, 3, { usage: { inputTokens: 1, outputTokens: 2 } });

  const textDeltas = events
    .filter((entry) => entry.event === 'agent' && (entry.payload as { type?: unknown }).type === 'text_delta')
    .map((entry) => (entry.payload as { delta?: unknown }).delta);

  assert.deepEqual(textDeltas, ['Build passes. No AI slop detected.\n\n', 'Tail']);
  assert.equal(
    events.some((entry) => entry.event === 'agent' && (entry.payload as { type?: unknown }).type === 'usage'),
    true,
  );
});

test('attachAcpSession suppresses split duplicate legacy artifact text', () => {
  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: unknown }> = [];

  attachAcpSession({
    child: child as never,
    prompt: 'build landing page',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
  });

  writeAcpResult(child, 1, {});
  writeAcpResult(child, 2, { sessionId: 'session-1' });
  writeAcpUpdate(child, {
    sessionUpdate: 'tool_call_update',
    toolCallId: 'call-1',
    title: 'edit',
    status: 'completed',
  });
  writeAcpUpdate(child, {
    sessionUpdate: 'agent_message_chunk',
    content: { text: 'Ready to output.\n\n<art' },
  });
  assert.equal(child.stdin.writableEnded, false);
  writeAcpUpdate(child, {
    sessionUpdate: 'agent_message_chunk',
    content: { text: 'ifact identifier="page" type="text/html">\n<!doctype html><html></html></artifact>' },
  });
  assert.equal(child.stdin.writableEnded, false);
  writeAcpResult(child, 3, { usage: { inputTokens: 1, outputTokens: 2 } });

  const textDeltas = events
    .filter((entry) => entry.event === 'agent' && (entry.payload as { type?: unknown }).type === 'text_delta')
    .map((entry) => (entry.payload as { delta?: unknown }).delta);

  assert.deepEqual(textDeltas, ['Ready to output.\n\n']);
});

test('attachAcpSession suppresses DSML echo after opaque completed write update', () => {
  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: unknown }> = [];

  attachAcpSession({
    child: child as never,
    prompt: 'build landing page',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
  });

  writeAcpResult(child, 1, {});
  writeAcpResult(child, 2, { sessionId: 'session-1' });
  writeAcpUpdate(child, {
    sessionUpdate: 'tool_call',
    toolCallId: 'tc-opaque',
    title: 'edit',
    status: 'pending',
  });
  writeAcpUpdate(child, {
    sessionUpdate: 'tool_call_update',
    toolCallId: 'tc-opaque',
    status: 'completed',
  });
  writeAcpUpdate(child, {
    sessionUpdate: 'agent_message_chunk',
    content: { text: 'Done\n\n<artifact identifier="page">raw html</artifact>Tail' },
  });
  writeAcpUpdate(child, {
    sessionUpdate: 'agent_message_chunk',
    content: { text: ' Later docs mention <artifact identifier="example">literal</artifact> syntax.' },
  });
  writeAcpResult(child, 3, { usage: { inputTokens: 1, outputTokens: 2 } });

  const textDeltas = events
    .filter((entry) => entry.event === 'agent' && (entry.payload as { type?: unknown }).type === 'text_delta')
    .map((entry) => (entry.payload as { delta?: unknown }).delta);

  assert.deepEqual(textDeltas, [
    'Done\n\nTail',
    ' Later docs mention <artifact identifier="example">literal</artifact> syntax.',
  ]);
});

test('attachAcpSession mirrors artifact-write tool calls into countable tool_use/tool_result events', () => {
  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: unknown }> = [];

  attachAcpSession({
    child: child as never,
    prompt: 'build a page',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
  });

  writeAcpResult(child, 1, {});
  writeAcpResult(child, 2, { sessionId: 'session-1' });
  // A file-write tool call: announced as pending, then completes.
  writeAcpUpdate(child, {
    sessionUpdate: 'tool_call',
    toolCallId: 'write-1',
    title: 'Write index.html',
    status: 'pending',
    locations: [{ path: 'index.html' }],
  });
  writeAcpUpdate(child, {
    sessionUpdate: 'tool_call_update',
    toolCallId: 'write-1',
    status: 'completed',
  });
  // A read-only tool call must still produce tool_use/tool_result, but must
  // NOT surface as an artifact.
  writeAcpUpdate(child, {
    sessionUpdate: 'tool_call',
    toolCallId: 'grep-1',
    title: 'grep',
    status: 'completed',
  });
  writeAcpResult(child, 3, { usage: { inputTokens: 1, outputTokens: 2 } });

  // Re-shape into the run.events form (`{ event, data }`) that the daemon
  // persists and that run-artifacts scans.
  const runEvents = events
    .filter((e) => e.event === 'agent')
    .map((e) => ({ event: 'agent', data: e.payload }));

  const toolUses = runEvents.filter((e) => (e.data as { type?: string }).type === 'tool_use');
  const writeUse = toolUses.find((e) => (e.data as { id?: string }).id === acpTelemetryToolCallId('write-1'));
  assert.ok(writeUse, 'expected a tool_use event for the ACP write tool call');
  assert.equal((writeUse.data as { name?: string }).name, 'Write');
  assert.equal(
    (writeUse.data as { input?: { file_path?: string } }).input?.file_path,
    'index.html',
  );

  const grepUse = toolUses.find((e) => (e.data as { id?: string }).id === acpTelemetryToolCallId('grep-1'));
  assert.ok(grepUse, 'expected a tool_use event for the read-only grep call');
  assert.notEqual((grepUse.data as { name?: string }).name, 'Write');
  const grepResult = runEvents.find(
    (e) =>
      (e.data as { type?: string; toolUseId?: string }).type === 'tool_result' &&
      (e.data as { toolUseId?: string }).toolUseId === acpTelemetryToolCallId('grep-1'),
  );
  assert.ok(grepResult, 'expected a paired tool_result for grep');

  const writeResult = runEvents.find(
    (e) =>
      (e.data as { type?: string; toolUseId?: string }).type === 'tool_result' &&
      (e.data as { toolUseId?: string }).toolUseId === acpTelemetryToolCallId('write-1'),
  );
  assert.ok(writeResult, 'expected a paired tool_result event');
  assert.equal((writeResult.data as { isError?: boolean }).isError, false);

  // Before the fix this returned 0 for every ACP run; the read-only grep call
  // must not inflate the count.
  assert.equal(countNewArtifacts(runEvents), 1);
});

test('attachAcpSession preserves AMR assistant and model-step lifecycle diagnostics', () => {
  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: unknown }> = [];

  attachAcpSession({
    child: child as never,
    prompt: 'build a page',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
  });

  writeAcpResult(child, 1, {});
  writeAcpResult(child, 2, { sessionId: 'session-1' });
  writeAcpUpdate(child, {
    sessionUpdate: 'assistant_message_lifecycle',
    phase: 'start',
    status: 'running',
    assistantMessageIndex: 1,
    startedAtMs: 1_700_000_000_000,
    timingEvidence: 'source_timestamp',
    provider: 'amr',
    model: 'qwen3.8-max',
    errorClass: 'rate_limited',
  });
  writeAcpUpdate(child, {
    sessionUpdate: 'model_step_lifecycle',
    phase: 'start',
    status: 'running',
    assistantMessageIndex: 1,
    stepIndex: 1,
    startedAtMs: 1_700_000_000_100,
    timingEvidence: 'bridge_observed_step_boundary',
  });
  writeAcpUpdate(child, {
    sessionUpdate: 'model_step_lifecycle',
    phase: 'end',
    status: 'completed',
    reason: 'tool-calls',
    assistantMessageIndex: 1,
    stepIndex: 1,
    startedAtMs: 1_700_000_000_100,
    endedAtMs: 1_700_000_001_600,
    durationMs: 1_500,
    timingEvidence: 'bridge_observed_step_boundary',
    usage: { reasoningTokens: 7, inputTokens: 10, outputTokens: 3 },
  });
  writeAcpUpdate(child, {
    sessionUpdate: 'model_retry',
    attempt: 1,
  });
  writeAcpResult(child, 3, { usage: { inputTokens: 10, outputTokens: 3 } });

  const diagnostics = events
    .filter((entry) => entry.event === 'agent')
    .map((entry) => entry.payload as Record<string, unknown>)
    .filter((payload) => payload.type === 'diagnostic');
  assert.deepEqual(
    diagnostics.map((payload) => payload.name),
    [
      'assistant_message_lifecycle',
      'model_step_lifecycle',
      'model_step_lifecycle',
      'model_retry',
    ],
  );
  assert.deepEqual(diagnostics[2], {
    type: 'diagnostic',
    name: 'model_step_lifecycle',
    source: 'amr-opencode',
    elapsedMs: diagnostics[2]?.elapsedMs,
    phase: 'end',
    status: 'completed',
    reason: 'tool-calls',
    timingEvidence: 'bridge_observed_step_boundary',
    assistantMessageIndex: 1,
    stepIndex: 1,
    startedAtMs: 1_700_000_000_100,
    endedAtMs: 1_700_000_001_600,
    durationMs: 1_500,
    usage: { inputTokens: 10, outputTokens: 3, reasoningTokens: 7 },
  });
  assert.deepEqual(diagnostics[0], {
    type: 'diagnostic',
    name: 'assistant_message_lifecycle',
    source: 'amr-opencode',
    elapsedMs: diagnostics[0]?.elapsedMs,
    phase: 'start',
    status: 'running',
    provider: 'amr',
    model: 'qwen3.8-max',
    errorClass: 'rate_limited',
    timingEvidence: 'source_timestamp',
    assistantMessageIndex: 1,
    startedAtMs: 1_700_000_000_000,
  });
});

test('attachAcpSession consumes negotiated Vela child evidence only on the AMR path', () => {
  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: unknown }> = [];

  attachAcpSession({
    child: child as never,
    prompt: 'delegate research',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    modelUnavailableErrorCode: 'AMR_MODEL_UNAVAILABLE',
    send: (event, payload) => events.push({ event, payload }),
  });

  writeAcpResult(child, 1, {
    protocolVersion: 1,
    agentInfo: { name: 'Vela OpenCode', version: '0.0.0' },
    agentCapabilities: {
      extensions: {
        'vela.opencode.child_agent_lifecycle': { schemaVersion: 1 },
      },
    },
  });
  writeAcpResult(child, 2, { sessionId: 'session-1' });
  writeVelaAcpUpdate(child, {
    sessionUpdate: 'child_agent_lifecycle',
    extension: 'vela.opencode.child_agent_lifecycle',
    schemaVersion: 1,
    evidenceId: 'evidence-start',
    phase: 'start',
    status: 'running',
    childSessionId: 'child-1',
    parentSessionId: 'root-1',
    toolCallId: 'task-1',
    startedAtMs: 100,
    timingEvidence: 'source_timestamp',
    lifecycleCompleteness: 'complete',
    sourceEvidence: ['root_task_metadata', 'session.created'],
    prompt: {
      availability: 'hash_only',
      sha256: 'a'.repeat(64),
      bytes: 4,
    },
    usage: {
      availability: 'unavailable',
      completeness: 'unavailable',
    },
  });
  writeVelaAcpUpdate(child, {
    sessionUpdate: 'child_agent_lifecycle',
    extension: 'vela.opencode.child_agent_lifecycle',
    schemaVersion: 1,
    evidenceId: 'evidence-1',
    phase: 'end',
    status: 'completed',
    childSessionId: 'child-1',
    parentSessionId: 'root-1',
    toolCallId: 'task-1',
    startedAtMs: 100,
    endedAtMs: 200,
    timingEvidence: 'source_timestamp',
    lifecycleCompleteness: 'complete',
    sourceEvidence: [
      'root_task_metadata',
      'session.created',
      'child_session_status',
      'unknown-secret-source',
    ],
    prompt: {
      availability: 'hash_only',
      sha256: 'a'.repeat(64),
      bytes: 4,
      text: 'Summarize the public fixture.',
    },
    usage: {
      availability: 'available',
      completeness: 'complete',
      source: 'child_step_finish',
      inputTokens: 2,
      outputTokens: 1,
      totalTokens: 3,
      authorization: 'Bearer do-not-forward',
    },
    privateLog: '/Users/alice/private.log',
  });
  writeAcpUpdate(child, {
    sessionUpdate: 'agent_message_chunk',
    content: { text: 'Research complete.' },
  });
  writeAcpResult(child, 3, { usage: { inputTokens: 5, outputTokens: 2 } });

  const diagnostics = events
    .filter((entry) => entry.event === 'agent')
    .map((entry) => entry.payload as Record<string, unknown>)
    .filter((payload) => payload.type === 'diagnostic');
  expect(diagnostics.find((payload) => payload.name === 'vela_opencode_child_evidence_capability'))
    .toMatchObject({
      supported: true,
      schemaVersion: 1,
      candidatePublished: false,
      candidateCommit: 'c833b74e82e31c89414b7eaf01edabab1e2d0b06',
    });
  expect(diagnostics.find((payload) => (
    payload.name === 'vela_opencode_child_agent_lifecycle' && payload.state === 'completed'
  )))
    .toMatchObject({
      state: 'completed',
      rootSessionId: 'root-1',
      childSessionId: 'child-1',
      toolCallId: 'task-1',
      evidenceLevel: 'L2',
      l3Eligible: false,
      usage: { inputTokens: 2, outputTokens: 1, totalTokens: 3 },
    });
  const serialized = JSON.stringify(events);
  expect(serialized).toContain('Summarize the public fixture.');
  expect(serialized).not.toContain('Bearer do-not-forward');
  expect(serialized).not.toContain('/Users/alice/private.log');
  expect(events).toContainEqual(expect.objectContaining({
    event: 'agent',
    payload: expect.objectContaining({
      type: 'usage',
      usage: { input_tokens: 5, output_tokens: 2 },
    }),
  }));
});

test('attachAcpSession keeps old AMR child evidence unknown without changing root usage', () => {
  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: unknown }> = [];

  attachAcpSession({
    child: child as never,
    prompt: 'ordinary turn',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    modelUnavailableErrorCode: 'AMR_MODEL_UNAVAILABLE',
    send: (event, payload) => events.push({ event, payload }),
  });
  writeAcpResult(child, 1, { protocolVersion: 1 });
  writeAcpResult(child, 2, { sessionId: 'session-1' });
  writeVelaAcpUpdate(child, {
    sessionUpdate: 'child_agent_lifecycle',
    extension: 'vela.opencode.child_agent_lifecycle',
    schemaVersion: 1,
    malicious: 'must-not-fall-through',
  });
  writeAcpUpdate(child, {
    sessionUpdate: 'agent_message_chunk',
    content: { text: 'Ordinary answer.' },
  });
  writeAcpResult(child, 3, { usage: { inputTokens: 8, outputTokens: 3 } });

  const diagnostics = events
    .filter((entry) => entry.event === 'agent')
    .map((entry) => entry.payload as Record<string, unknown>)
    .filter((payload) => payload.type === 'diagnostic');
  expect(diagnostics).toContainEqual(expect.objectContaining({
    name: 'vela_opencode_child_evidence_rejected',
    reason: 'capability_not_negotiated',
  }));
  expect(diagnostics.some((payload) => payload.name === 'vela_opencode_child_agent_lifecycle'))
    .toBe(false);
  expect(JSON.stringify(events)).not.toContain('must-not-fall-through');
  expect(events).toContainEqual(expect.objectContaining({
    event: 'agent',
    payload: expect.objectContaining({
      type: 'usage',
      usage: { input_tokens: 8, output_tokens: 3 },
    }),
  }));
});

test('attachAcpSession does not enable the Vela extension for generic ACP agents', () => {
  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: unknown }> = [];

  attachAcpSession({
    child: child as never,
    prompt: 'generic ACP turn',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
  });
  writeAcpResult(child, 1, {
    agentCapabilities: {
      extensions: {
        'vela.opencode.child_agent_lifecycle': { schemaVersion: 1 },
      },
    },
  });
  writeAcpResult(child, 2, { sessionId: 'session-1' });
  writeVelaAcpUpdate(child, {
    sessionUpdate: 'child_agent_lifecycle',
    extension: 'vela.opencode.child_agent_lifecycle',
    schemaVersion: 1,
  });
  writeAcpResult(child, 3, {});

  const diagnostics = events
    .filter((entry) => entry.event === 'agent')
    .map((entry) => entry.payload as Record<string, unknown>)
    .filter((payload) => payload.type === 'diagnostic');
  expect(diagnostics.some((payload) => String(payload.name).startsWith('vela_opencode_child')))
    .toBe(false);
  expect(hasAgentStatus(events, 'child_agent_lifecycle')).toBe(true);
});

test('a truly PATHLESS ACP write is NOT coerced into an artifact (no false positive)', () => {
  // A write tool call whose only label is "edit" — no locations, no path, ever.
  // We must not fabricate an artifact extension: without a concrete path the
  // call carries no evidence it touched an artifact, so it stays uncounted
  // rather than inflating artifact_count for ordinary non-artifact edits.
  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: unknown }> = [];

  attachAcpSession({
    child: child as never,
    prompt: 'edit something',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
  });

  writeAcpResult(child, 1, {});
  writeAcpResult(child, 2, { sessionId: 'session-1' });
  writeAcpUpdate(child, { sessionUpdate: 'tool_call', toolCallId: 'edit-1', title: 'edit', status: 'pending' });
  writeAcpUpdate(child, { sessionUpdate: 'tool_call_update', toolCallId: 'edit-1', status: 'completed' });
  writeAcpResult(child, 3, { usage: { inputTokens: 1, outputTokens: 2 } });

  const runEvents = events
    .filter((e) => e.event === 'agent')
    .map((e) => ({ event: 'agent', data: e.payload }));

  const toolUse = runEvents.find((e) => (e.data as { type?: string }).type === 'tool_use');
  assert.ok(toolUse, 'pathless edit may still emit tool_use');
  const filePath = (toolUse?.data as { input?: { file_path?: string } } | undefined)?.input?.file_path ?? '';
  assert.doesNotMatch(filePath, /\.html$/, 'must not fabricate a synthetic .html extension');
  assert.notEqual(filePath, 'edit-1', 'must not use toolCallId as file_path');
  assert.equal(countNewArtifacts(runEvents), 0);
});

test('an ACP artifact path arriving only on the completing frame is still counted', () => {
  // ACP frequently sends `locations` only on the terminal update. Accumulate
  // partial frames and emit exactly one tool_use + tool_result at terminal
  // with the late path so classification sees landing.html.
  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: unknown }> = [];

  attachAcpSession({
    child: child as never,
    prompt: 'build a page',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
  });

  writeAcpResult(child, 1, {});
  writeAcpResult(child, 2, { sessionId: 'session-1' });
  writeAcpUpdate(child, { sessionUpdate: 'tool_call', toolCallId: 'w-2', title: 'write', status: 'pending' });
  writeAcpUpdate(child, {
    sessionUpdate: 'tool_call_update',
    toolCallId: 'w-2',
    status: 'completed',
    locations: [{ path: 'landing.html' }], // path only appears here
  });
  writeAcpResult(child, 3, { usage: { inputTokens: 1, outputTokens: 2 } });

  const runEvents = events
    .filter((e) => e.event === 'agent')
    .map((e) => ({ event: 'agent', data: e.payload }));
  const toolUses = runEvents.filter(
    (e) =>
      (e.data as { type?: string; id?: string }).type === 'tool_use' &&
      (e.data as { id?: string }).id === acpTelemetryToolCallId('w-2'),
  );
  const toolResults = runEvents.filter(
    (e) =>
      (e.data as { type?: string; toolUseId?: string }).type === 'tool_result' &&
      (e.data as { toolUseId?: string }).toolUseId === acpTelemetryToolCallId('w-2'),
  );
  assert.equal(toolUses.length, 1, 'exactly one tool_use even when path arrives late');
  assert.equal(toolResults.length, 1, 'exactly one tool_result');
  assert.equal(
    (toolUses[0]?.data as { input?: { file_path?: string } } | undefined)?.input?.file_path,
    'landing.html',
  );
  assert.equal(countNewArtifacts(runEvents), 1);
});

test('kind:read + title containing update stays Read, not Write', () => {
  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: unknown }> = [];

  attachAcpSession({
    child: child as never,
    prompt: 'read file',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
  });

  writeAcpResult(child, 1, {});
  writeAcpResult(child, 2, { sessionId: 'session-1' });
  writeAcpUpdate(child, {
    sessionUpdate: 'tool_call',
    toolCallId: 'read-upd',
    kind: 'read',
    title: 'update cache from disk',
    status: 'completed',
    locations: [{ path: 'cache.json' }],
  });
  writeAcpResult(child, 3, { usage: { inputTokens: 1, outputTokens: 2 } });

  const runEvents = events
    .filter((e) => e.event === 'agent')
    .map((e) => ({ event: 'agent', data: e.payload }));
  const toolUse = runEvents.find((e) => (e.data as { type?: string }).type === 'tool_use');
  assert.ok(toolUse);
  assert.equal((toolUse.data as { name?: string }).name, 'Read');
  assert.equal(countNewArtifacts(runEvents), 0);
});

test('kind:read + explicit noncanonical name read_file normalizes to Read', () => {
  // Content-tool redaction only matches canonical families (Read/Write/Edit/…).
  // ACP adapters commonly send kind:"read" with name:"read_file"; the transcript
  // must still emit Read so rawOutput is redacted in Langfuse, not serialized.
  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: unknown }> = [];

  attachAcpSession({
    child: child as never,
    prompt: 'read secrets',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
  });

  writeAcpResult(child, 1, {});
  writeAcpResult(child, 2, { sessionId: 'session-1' });
  writeAcpUpdate(child, {
    sessionUpdate: 'tool_call',
    toolCallId: 'read-file-1',
    kind: 'read',
    name: 'read_file',
    status: 'completed',
    locations: [{ path: 'secrets.env' }],
    rawOutput: 'API_KEY=super-secret\nPASSWORD=also-secret\n',
  });
  writeAcpResult(child, 3, { usage: { inputTokens: 1, outputTokens: 2 } });

  const toolUse = events.find(
    (e) => e.event === 'agent' && (e.payload as { type?: string }).type === 'tool_use',
  );
  const toolResult = events.find(
    (e) => e.event === 'agent' && (e.payload as { type?: string }).type === 'tool_result',
  );
  assert.ok(toolUse);
  assert.equal((toolUse.payload as { name?: string }).name, 'Read');
  assert.ok(toolResult);
  assert.match(
    String((toolResult.payload as { content?: string }).content ?? ''),
    /API_KEY=super-secret/,
  );
});

test('kind:other keeps explicit custom tool name', () => {
  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: unknown }> = [];

  attachAcpSession({
    child: child as never,
    prompt: 'custom tool',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
  });

  writeAcpResult(child, 1, {});
  writeAcpResult(child, 2, { sessionId: 'session-1' });
  writeAcpUpdate(child, {
    sessionUpdate: 'tool_call',
    toolCallId: 'custom-1',
    kind: 'other',
    name: 'my_special_tool',
    status: 'completed',
    rawOutput: 'ok',
  });
  writeAcpResult(child, 3, { usage: { inputTokens: 1, outputTokens: 2 } });

  const toolUse = events.find(
    (e) => e.event === 'agent' && (e.payload as { type?: string }).type === 'tool_use',
  );
  assert.ok(toolUse);
  assert.equal((toolUse.payload as { name?: string }).name, 'my_special_tool');
});

test('kind:other redacts path-like custom tool names before transcript emit', () => {
  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: unknown }> = [];

  attachAcpSession({
    child: child as never,
    prompt: 'custom tool path name',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
  });

  writeAcpResult(child, 1, {});
  writeAcpResult(child, 2, { sessionId: 'session-1' });
  writeAcpUpdate(child, {
    sessionUpdate: 'tool_call',
    toolCallId: 'custom-path-1',
    kind: 'other',
    // Untrusted free-text that must not become a tool_use name / Langfuse label.
    name: '/Users/alice/.ssh/id_rsa',
    status: 'completed',
    rawOutput: 'ok',
  });
  writeAcpResult(child, 3, { usage: { inputTokens: 1, outputTokens: 2 } });

  const toolUse = events.find(
    (e) => e.event === 'agent' && (e.payload as { type?: string }).type === 'tool_use',
  );
  assert.ok(toolUse);
  assert.equal((toolUse.payload as { name?: string }).name, 'Other');
  const serialized = JSON.stringify(events);
  assert.equal(serialized.includes('/Users/alice'), false);
  assert.equal(serialized.includes('id_rsa'), false);
});

test('kind:other cannot claim Bash-like names that unlock partial redaction', () => {
  // Direct resolver: custom kind:other + Bash-like identifier collapses to Other
  // so Langfuse fail-closed redaction still applies to rawInput.
  for (const impersonator of ['Bash', 'bash', 'shell', 'Execute', 'terminal']) {
    assert.equal(
      acpToolName({ kind: 'other', name: impersonator }),
      'Other',
      `kind:other name=${impersonator}`,
    );
    assert.equal(isAcpPartialRedactToolName(impersonator), true);
  }
  // Trusted execute-family kinds still map to Bash.
  assert.equal(acpToolName({ kind: 'execute', name: 'run_cmd' }), 'Bash');
  assert.equal(acpToolName({ kind: 'bash' }), 'Bash');
  // Non-Bash custom identifiers remain available for UI/transcript.
  assert.equal(acpToolName({ kind: 'other', name: 'my_special_tool' }), 'my_special_tool');

  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: unknown }> = [];

  attachAcpSession({
    child: child as never,
    prompt: 'custom bash-named tool',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
  });

  writeAcpResult(child, 1, {});
  writeAcpResult(child, 2, { sessionId: 'session-1' });
  writeAcpUpdate(child, {
    sessionUpdate: 'tool_call',
    toolCallId: 'fake-bash-1',
    kind: 'other',
    // Identifier-like but must not enter Langfuse's Bash partial-redact allowlist.
    name: 'Bash',
    status: 'completed',
    rawInput: { secret: 'API_KEY=super-secret', command: 'cat /Users/alice/.env' },
    rawOutput: 'should not matter',
  });
  writeAcpResult(child, 3, { usage: { inputTokens: 1, outputTokens: 2 } });

  const toolUse = events.find(
    (e) => e.event === 'agent' && (e.payload as { type?: string }).type === 'tool_use',
  );
  assert.ok(toolUse);
  assert.equal((toolUse.payload as { name?: string }).name, 'Other');
  // Name collapsed; payload may still carry input in the live transcript — Langfuse
  // fail-closed redaction keys off the emitted name (Other → full redact).
  assert.equal(isAcpPartialRedactToolName((toolUse.payload as { name?: string }).name ?? ''), false);
});

test('missing kind cannot claim Bash-like names that unlock partial redaction', () => {
  // No-kind is the bypass left after kind:other was fail-closed: an adapter
  // that omits kind but sends name/title "Bash" must not enter Langfuse's
  // partial-redact allowlist. Only a recognized execute-family kind may.
  for (const impersonator of ['Bash', 'bash', 'shell', 'Execute', 'terminal']) {
    assert.equal(
      acpToolName({ name: impersonator }),
      'Other',
      `no-kind name=${impersonator}`,
    );
  }
  assert.equal(acpToolName({ title: 'Bash' }), 'Other');
  assert.equal(acpToolName({ title: 'run shell command' }), 'Other');
  // Non-Bash identifiers without kind remain available.
  assert.equal(acpToolName({ name: 'my_special_tool' }), 'my_special_tool');
  // Execute-family kinds still unlock Bash.
  assert.equal(acpToolName({ kind: 'execute', name: 'Bash' }), 'Bash');
  assert.equal(acpToolName({ kind: 'shell', title: 'run something' }), 'Bash');

  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: unknown }> = [];

  attachAcpSession({
    child: child as never,
    prompt: 'no-kind bash-named tool',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
  });

  writeAcpResult(child, 1, {});
  writeAcpResult(child, 2, { sessionId: 'session-1' });
  writeAcpUpdate(child, {
    sessionUpdate: 'tool_call',
    toolCallId: 'no-kind-bash-1',
    // Intentionally omit kind — name alone must not unlock partial redaction.
    name: 'Bash',
    status: 'completed',
    rawInput: { secret: 'API_KEY=super-secret', command: 'cat /Users/alice/.env' },
    rawOutput: 'should not matter',
  });
  writeAcpResult(child, 3, { usage: { inputTokens: 1, outputTokens: 2 } });

  const toolUse = events.find(
    (e) => e.event === 'agent' && (e.payload as { type?: string }).type === 'tool_use',
  );
  assert.ok(toolUse);
  assert.equal((toolUse.payload as { name?: string }).name, 'Other');
  assert.equal(isAcpPartialRedactToolName((toolUse.payload as { name?: string }).name ?? ''), false);
});

test('sticky thinkOnly: pending Thinking then status-only completed emits no tool events', () => {
  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: unknown }> = [];

  attachAcpSession({
    child: child as never,
    prompt: 'think',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
  });

  writeAcpResult(child, 1, {});
  writeAcpResult(child, 2, { sessionId: 'session-1' });
  writeAcpUpdate(child, {
    sessionUpdate: 'tool_call',
    toolCallId: 'think-1',
    title: 'Thinking',
    status: 'pending',
  });
  // Terminal frame is status-only (no title) — must not clear sticky thinkOnly.
  writeAcpUpdate(child, {
    sessionUpdate: 'tool_call_update',
    toolCallId: 'think-1',
    status: 'completed',
  });
  writeAcpResult(child, 3, { usage: { inputTokens: 1, outputTokens: 2 } });

  const toolUses = events.filter(
    (e) => e.event === 'agent' && (e.payload as { type?: string }).type === 'tool_use',
  );
  const toolResults = events.filter(
    (e) => e.event === 'agent' && (e.payload as { type?: string }).type === 'tool_result',
  );
  assert.equal(toolUses.length, 0, 'think-only must not emit tool_use');
  assert.equal(toolResults.length, 0, 'think-only must not emit tool_result');
});

test('exactly-once emission: repeated terminal frames for same toolCallId emit one pair', () => {
  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: unknown }> = [];

  attachAcpSession({
    child: child as never,
    prompt: 'write once',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
  });

  writeAcpResult(child, 1, {});
  writeAcpResult(child, 2, { sessionId: 'session-1' });
  writeAcpUpdate(child, {
    sessionUpdate: 'tool_call',
    toolCallId: 'once-1',
    kind: 'write',
    status: 'pending',
    locations: [{ path: 'page.html' }],
  });
  writeAcpUpdate(child, {
    sessionUpdate: 'tool_call_update',
    toolCallId: 'once-1',
    status: 'completed',
  });
  // Duplicate terminal (agent retry / replay) must not double-emit.
  writeAcpUpdate(child, {
    sessionUpdate: 'tool_call_update',
    toolCallId: 'once-1',
    status: 'completed',
  });
  writeAcpResult(child, 3, { usage: { inputTokens: 1, outputTokens: 2 } });

  const toolUses = events.filter(
    (e) =>
      e.event === 'agent' &&
      (e.payload as { type?: string; id?: string }).type === 'tool_use' &&
      (e.payload as { id?: string }).id === acpTelemetryToolCallId('once-1'),
  );
  const toolResults = events.filter(
    (e) =>
      e.event === 'agent' &&
      (e.payload as { type?: string; toolUseId?: string }).type === 'tool_result' &&
      (e.payload as { toolUseId?: string }).toolUseId === acpTelemetryToolCallId('once-1'),
  );
  assert.equal(toolUses.length, 1);
  assert.equal(toolResults.length, 1);
});

test('flush retains tool ids so late terminal cannot emit a second contradictory pair', () => {
  // Regression: flushOpenAcpTools must not clear acpToolRunEventState. A racy
  // completed tool_call_update after abort/timeout flush must not recreate the
  // same id as a fresh open tool and emit a successful pair after isError=true.
  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: unknown }> = [];

  const session = attachAcpSession({
    child: child as never,
    prompt: 'run a long bash',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
  });

  writeAcpResult(child, 1, {});
  writeAcpResult(child, 2, { sessionId: 'session-1' });
  writeAcpUpdate(child, {
    sessionUpdate: 'tool_call',
    toolCallId: 'flush-race-1',
    kind: 'execute',
    title: 'bash',
    status: 'in_progress',
    rawInput: { command: 'sleep 999' },
  });
  // Abort flushes the open tool as isError=true and must retain the map entry.
  session.abort();

  const afterAbortUses = events.filter(
    (e) =>
      e.event === 'agent' &&
      (e.payload as { type?: string; id?: string }).type === 'tool_use' &&
      (e.payload as { id?: string }).id === acpTelemetryToolCallId('flush-race-1'),
  );
  const afterAbortResults = events.filter(
    (e) =>
      e.event === 'agent' &&
      (e.payload as { type?: string; toolUseId?: string }).type === 'tool_result' &&
      (e.payload as { toolUseId?: string }).toolUseId === acpTelemetryToolCallId('flush-race-1'),
  );
  assert.equal(afterAbortUses.length, 1, 'abort must flush exactly one tool_use');
  assert.equal(afterAbortResults.length, 1, 'abort must flush exactly one tool_result');
  assert.equal((afterAbortResults[0]?.payload as { isError?: boolean }).isError, true);

  // Late terminal (buffered agent stdout racing cancel). Must not add a second pair.
  writeAcpUpdate(child, {
    sessionUpdate: 'tool_call_update',
    toolCallId: 'flush-race-1',
    status: 'completed',
    content: [{ type: 'content', content: { type: 'text', text: 'should not win' } }],
  });

  const finalUses = events.filter(
    (e) =>
      e.event === 'agent' &&
      (e.payload as { type?: string; id?: string }).type === 'tool_use' &&
      (e.payload as { id?: string }).id === acpTelemetryToolCallId('flush-race-1'),
  );
  const finalResults = events.filter(
    (e) =>
      e.event === 'agent' &&
      (e.payload as { type?: string; toolUseId?: string }).type === 'tool_result' &&
      (e.payload as { toolUseId?: string }).toolUseId === acpTelemetryToolCallId('flush-race-1'),
  );
  assert.equal(finalUses.length, 1, 'late terminal must not emit a second tool_use');
  assert.equal(finalResults.length, 1, 'late terminal must not emit a second tool_result');
  assert.equal(
    (finalResults[0]?.payload as { isError?: boolean }).isError,
    true,
    'flushed failure must not be replaced by a successful late terminal',
  );
});

test('sticky kind name: kind:read pending then title-only completed stays Read', () => {
  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: unknown }> = [];

  attachAcpSession({
    child: child as never,
    prompt: 'read file',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
  });

  writeAcpResult(child, 1, {});
  writeAcpResult(child, 2, { sessionId: 'session-1' });
  writeAcpUpdate(child, {
    sessionUpdate: 'tool_call',
    toolCallId: 'read-sticky',
    kind: 'read',
    status: 'pending',
  });
  writeAcpUpdate(child, {
    sessionUpdate: 'tool_call_update',
    toolCallId: 'read-sticky',
    title: 'Update cache',
    status: 'completed',
  });
  writeAcpResult(child, 3, { usage: { inputTokens: 1, outputTokens: 2 } });

  const toolUse = events.find(
    (e) => e.event === 'agent' && (e.payload as { type?: string }).type === 'tool_use',
  );
  assert.ok(toolUse);
  assert.equal((toolUse.payload as { name?: string }).name, 'Read');
});

test('tool_use carries startedAt from firstSeenAt for duration analytics', () => {
  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: unknown }> = [];
  const before = Date.now();

  attachAcpSession({
    child: child as never,
    prompt: 'bash',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
  });

  writeAcpResult(child, 1, {});
  writeAcpResult(child, 2, { sessionId: 'session-1' });
  writeAcpUpdate(child, {
    sessionUpdate: 'tool_call',
    toolCallId: 'dur-1',
    kind: 'execute',
    status: 'pending',
    rawInput: { command: 'echo hi' },
  });
  writeAcpUpdate(child, {
    sessionUpdate: 'tool_call_update',
    toolCallId: 'dur-1',
    status: 'completed',
    rawOutput: 'hi\n',
  });
  writeAcpResult(child, 3, { usage: { inputTokens: 1, outputTokens: 2 } });
  const after = Date.now();

  const toolUse = events.find(
    (e) =>
      e.event === 'agent' &&
      (e.payload as { type?: string; id?: string }).type === 'tool_use' &&
      (e.payload as { id?: string }).id === acpTelemetryToolCallId('dur-1'),
  );
  assert.ok(toolUse);
  const startedAt = (toolUse.payload as { startedAt?: number }).startedAt;
  assert.equal(typeof startedAt, 'number');
  assert.ok(Number.isFinite(startedAt));
  assert.ok(startedAt! >= before && startedAt! <= after);
});

test('rawInput.filePath (camelCase) is recognized as file_path', () => {
  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: unknown }> = [];

  attachAcpSession({
    child: child as never,
    prompt: 'write page',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
  });

  writeAcpResult(child, 1, {});
  writeAcpResult(child, 2, { sessionId: 'session-1' });
  writeAcpUpdate(child, {
    sessionUpdate: 'tool_call',
    toolCallId: 'fp-1',
    kind: 'write',
    status: 'completed',
    rawInput: { filePath: 'pages/home.html' },
  });
  writeAcpResult(child, 3, { usage: { inputTokens: 1, outputTokens: 2 } });

  const runEvents = events
    .filter((e) => e.event === 'agent')
    .map((e) => ({ event: 'agent', data: e.payload }));
  const toolUse = runEvents.find((e) => (e.data as { type?: string }).type === 'tool_use');
  assert.ok(toolUse);
  assert.equal(
    (toolUse.data as { input?: { file_path?: string } }).input?.file_path,
    'pages/home.html',
  );
  assert.equal(countNewArtifacts(runEvents), 1);
});

test('terminal status-only frame keeps earlier rawOutput content', () => {
  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: unknown }> = [];

  attachAcpSession({
    child: child as never,
    prompt: 'run cmd',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
  });

  writeAcpResult(child, 1, {});
  writeAcpResult(child, 2, { sessionId: 'session-1' });
  writeAcpUpdate(child, {
    sessionUpdate: 'tool_call',
    toolCallId: 'out-1',
    kind: 'execute',
    status: 'in_progress',
    rawInput: { command: 'echo hi' },
    rawOutput: 'hi\n',
  });
  writeAcpUpdate(child, {
    sessionUpdate: 'tool_call_update',
    toolCallId: 'out-1',
    status: 'completed',
    // status-only — no rawOutput on terminal frame
  });
  writeAcpResult(child, 3, { usage: { inputTokens: 1, outputTokens: 2 } });

  const runEvents = events
    .filter((e) => e.event === 'agent')
    .map((e) => ({ event: 'agent', data: e.payload }));
  const toolResult = runEvents.find((e) => (e.data as { type?: string }).type === 'tool_result');
  assert.ok(toolResult);
  // Earlier rawOutput is retained, then redacted at emit for execute tools.
  assert.equal(
    (toolResult.data as { content?: string }).content,
    `[REDACTED:acp_bash_output:${'hi\n'.length}_chars]`,
  );
});

test('an ACP write whose title names a NON-artifact file is not counted', () => {
  // Symmetry with the claude path: a real extension extracted from the title
  // (e.g. "edit config.json") must be filtered out by isArtifactPath.
  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: unknown }> = [];

  attachAcpSession({
    child: child as never,
    prompt: 'tweak config',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
  });

  writeAcpResult(child, 1, {});
  writeAcpResult(child, 2, { sessionId: 'session-1' });
  writeAcpUpdate(child, {
    sessionUpdate: 'tool_call',
    toolCallId: 'cfg-1',
    title: 'Edit config.json',
    status: 'completed',
    locations: [{ path: 'config.json' }],
  });
  writeAcpResult(child, 3, { usage: { inputTokens: 1, outputTokens: 2 } });

  const runEvents = events
    .filter((e) => e.event === 'agent')
    .map((e) => ({ event: 'agent', data: e.payload }));
  assert.equal(countNewArtifacts(runEvents), 0);
});

test('attachAcpSession mirrors bash-like ACP tools with command input and rawOutput result', () => {
  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: unknown }> = [];

  attachAcpSession({
    child: child as never,
    prompt: 'list files',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
  });

  writeAcpResult(child, 1, {});
  writeAcpResult(child, 2, { sessionId: 'session-1' });
  writeAcpUpdate(child, {
    sessionUpdate: 'tool_call',
    toolCallId: 'bash-1',
    kind: 'execute',
    title: 'ls',
    status: 'pending',
    rawInput: { command: 'ls -la' },
  });
  writeAcpUpdate(child, {
    sessionUpdate: 'tool_call_update',
    toolCallId: 'bash-1',
    status: 'completed',
    rawOutput: 'total 0\n.',
  });
  writeAcpResult(child, 3, { usage: { inputTokens: 1, outputTokens: 2 } });

  const runEvents = events
    .filter((e) => e.event === 'agent')
    .map((e) => ({ event: 'agent', data: e.payload }));
  const toolUse = runEvents.find(
    (e) =>
      (e.data as { type?: string; id?: string }).type === 'tool_use' &&
      (e.data as { id?: string }).id === acpTelemetryToolCallId('bash-1'),
  );
  assert.ok(toolUse, 'expected bash tool_use');
  assert.equal((toolUse.data as { name?: string }).name, 'Bash');
  assert.equal(
    (toolUse.data as { input?: { command?: string } }).input?.command,
    'ls -la',
  );
  const toolResult = runEvents.find(
    (e) =>
      (e.data as { type?: string; toolUseId?: string }).type === 'tool_result' &&
      (e.data as { toolUseId?: string }).toolUseId === acpTelemetryToolCallId('bash-1'),
  );
  assert.ok(toolResult);
  // Execute stdout is replaced with a length summary so private dumps (cat .env)
  // never enter the canonical tool_result transcript / Langfuse path.
  assert.equal(
    (toolResult.data as { content?: string }).content,
    `[REDACTED:acp_bash_output:${'total 0\n.'.length}_chars]`,
  );
  assert.equal(countNewArtifacts(runEvents), 0);
});

test('ACP execute tool_result redacts private stdout (cat .env)', () => {
  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: unknown }> = [];
  const secretDump = 'API_KEY=super-secret\nPASSWORD=also-secret\n';

  attachAcpSession({
    child: child as never,
    prompt: 'cat secrets',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
  });

  writeAcpResult(child, 1, {});
  writeAcpResult(child, 2, { sessionId: 'session-1' });
  writeAcpUpdate(child, {
    sessionUpdate: 'tool_call',
    toolCallId: 'bash-secret-1',
    kind: 'execute',
    status: 'completed',
    rawInput: { command: 'cat .env' },
    rawOutput: secretDump,
  });
  writeAcpResult(child, 3, { usage: { inputTokens: 1, outputTokens: 2 } });

  const toolUse = events.find(
    (e) =>
      e.event === 'agent' &&
      (e.payload as { type?: string; id?: string }).type === 'tool_use' &&
      (e.payload as { id?: string }).id === acpTelemetryToolCallId('bash-secret-1'),
  );
  const toolResult = events.find(
    (e) =>
      e.event === 'agent' &&
      (e.payload as { type?: string; toolUseId?: string }).type === 'tool_result' &&
      (e.payload as { toolUseId?: string }).toolUseId === acpTelemetryToolCallId('bash-secret-1'),
  );
  assert.ok(toolUse);
  assert.equal((toolUse.payload as { name?: string }).name, 'Bash');
  // Command stays for observability; only stdout is redacted.
  assert.equal(
    (toolUse.payload as { input?: { command?: string } }).input?.command,
    'cat .env',
  );
  assert.ok(toolResult);
  const content = String((toolResult.payload as { content?: string }).content ?? '');
  assert.equal(content, `[REDACTED:acp_bash_output:${secretDump.length}_chars]`);
  assert.doesNotMatch(content, /API_KEY|PASSWORD|super-secret/);
});

test('ACP adapter toolCallId is always hashed before tool_use/tool_result emission', () => {
  // Path-like, identifier-shaped secrets, and plain local ids must all become
  // opaque hashes — never pass through to Langfuse span ids / metadata.
  const cases = [
    'read:/home/alice/.env',
    'sk-proj-abcdefghijklmnopqrstuvwxyz012345',
    'ghp_abcdefghijklmnopqrstuvwxyz012345',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature',
    'call-1',
  ];
  for (const rawToolCallId of cases) {
    assert.match(
      acpTelemetryToolCallId(rawToolCallId),
      /^acp_[0-9a-f]{24}$/,
      `expected opaque hash for ${rawToolCallId.slice(0, 24)}…`,
    );
    assert.notEqual(acpTelemetryToolCallId(rawToolCallId), rawToolCallId);
  }
  // Empty / whitespace collapses to a fixed non-secret sentinel.
  assert.equal(acpTelemetryToolCallId(''), 'acp_empty');
  assert.equal(acpTelemetryToolCallId('   '), 'acp_empty');

  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: unknown }> = [];
  // Adapter-derived id that embeds a user home path / secret file name.
  const rawToolCallId = 'read:/home/alice/.env';

  attachAcpSession({
    child: child as never,
    prompt: 'read env',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
  });

  writeAcpResult(child, 1, {});
  writeAcpResult(child, 2, { sessionId: 'session-1' });
  writeAcpUpdate(child, {
    sessionUpdate: 'tool_call',
    toolCallId: rawToolCallId,
    kind: 'read',
    status: 'completed',
    locations: [{ path: '/home/alice/.env' }],
  });
  writeAcpResult(child, 3, { usage: { inputTokens: 1, outputTokens: 2 } });

  const toolUse = events.find(
    (e) => e.event === 'agent' && (e.payload as { type?: string }).type === 'tool_use',
  );
  const toolResult = events.find(
    (e) => e.event === 'agent' && (e.payload as { type?: string }).type === 'tool_result',
  );
  assert.ok(toolUse, 'expected tool_use for adapter toolCallId');
  assert.ok(toolResult, 'expected tool_result for adapter toolCallId');
  const useId = (toolUse.payload as { id?: string }).id ?? '';
  const resultId = (toolResult.payload as { toolUseId?: string }).toolUseId ?? '';
  // Transcript/telemetry must not carry the raw adapter id.
  assert.equal(useId, acpTelemetryToolCallId(rawToolCallId));
  assert.equal(resultId, useId, 'tool_use and tool_result stay paired');
  assert.match(useId, /^acp_[0-9a-f]{24}$/);
  assert.doesNotMatch(useId, /alice|\.env|\/home\/|sk-proj|ghp_/);
  assert.equal(
    events.some(
      (e) =>
        e.event === 'agent' &&
        (e.payload as { type?: string; id?: string }).type === 'tool_use' &&
        String((e.payload as { id?: string }).id ?? '').includes('alice'),
    ),
    false,
  );
});

test('ACP title Image.open must not become file_path', () => {
  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: unknown }> = [];

  attachAcpSession({
    child: child as never,
    prompt: 'open image',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
  });

  writeAcpResult(child, 1, {});
  writeAcpResult(child, 2, { sessionId: 'session-1' });
  writeAcpUpdate(child, {
    sessionUpdate: 'tool_call',
    toolCallId: 'img-1',
    title: 'Image.open',
    status: 'completed',
  });
  writeAcpResult(child, 3, { usage: { inputTokens: 1, outputTokens: 2 } });

  const runEvents = events
    .filter((e) => e.event === 'agent')
    .map((e) => ({ event: 'agent', data: e.payload }));
  const toolUse = runEvents.find((e) => (e.data as { type?: string }).type === 'tool_use');
  assert.ok(toolUse);
  const filePath = (toolUse.data as { input?: { file_path?: string } }).input?.file_path;
  assert.notEqual(filePath, 'Image.open');
  assert.equal(countNewArtifacts(runEvents), 0);
});

test('ACP tool_result content is forwarded from rawOutput and truncated when huge', () => {
  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: unknown }> = [];

  attachAcpSession({
    child: child as never,
    prompt: 'read big file',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
  });

  writeAcpResult(child, 1, {});
  writeAcpResult(child, 2, { sessionId: 'session-1' });
  const huge = 'x'.repeat(9000);
  writeAcpUpdate(child, {
    sessionUpdate: 'tool_call',
    toolCallId: 'read-1',
    kind: 'read',
    status: 'completed',
    rawOutput: huge,
  });
  writeAcpResult(child, 3, { usage: { inputTokens: 1, outputTokens: 2 } });

  const runEvents = events
    .filter((e) => e.event === 'agent')
    .map((e) => ({ event: 'agent', data: e.payload }));
  const toolResult = runEvents.find(
    (e) => (e.data as { type?: string }).type === 'tool_result',
  );
  assert.ok(toolResult);
  const content = (toolResult.data as { content?: string }).content ?? '';
  assert.ok(content.endsWith('\n…[truncated]'), 'expected truncation suffix');
  assert.ok(content.length < huge.length);
  assert.ok(content.startsWith('xxxx'));
});

test('attachAcpSession emits tool_use pairs for write + bash in one turn', () => {
  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: unknown }> = [];

  attachAcpSession({
    child: child as never,
    prompt: 'write and list',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
  });

  writeAcpResult(child, 1, {});
  writeAcpResult(child, 2, { sessionId: 'session-1' });
  writeAcpUpdate(child, {
    sessionUpdate: 'tool_call',
    toolCallId: 'w-multi',
    title: 'Write index.html',
    status: 'completed',
    locations: [{ path: 'index.html' }],
  });
  writeAcpUpdate(child, {
    sessionUpdate: 'tool_call',
    toolCallId: 'b-multi',
    kind: 'bash',
    status: 'completed',
    rawInput: { command: 'ls' },
    rawOutput: 'index.html\n',
  });
  writeAcpResult(child, 3, { usage: { inputTokens: 1, outputTokens: 2 } });

  const runEvents = events
    .filter((e) => e.event === 'agent')
    .map((e) => ({ event: 'agent', data: e.payload }));
  const toolUses = runEvents.filter((e) => (e.data as { type?: string }).type === 'tool_use');
  const toolResults = runEvents.filter((e) => (e.data as { type?: string }).type === 'tool_result');
  assert.ok(toolUses.some((e) => (e.data as { id?: string }).id === acpTelemetryToolCallId('w-multi')));
  assert.ok(toolUses.some((e) => (e.data as { id?: string }).id === acpTelemetryToolCallId('b-multi')));
  assert.ok(toolResults.some((e) => (e.data as { toolUseId?: string }).toolUseId === acpTelemetryToolCallId('w-multi')));
  assert.ok(toolResults.some((e) => (e.data as { toolUseId?: string }).toolUseId === acpTelemetryToolCallId('b-multi')));
  assert.equal(countNewArtifacts(runEvents), 1);
});

test('attachAcpSession suppresses incremental artifact echo after earlier assistant text', () => {
  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: unknown }> = [];

  attachAcpSession({
    child: child as never,
    prompt: 'build landing page',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
  });

  writeAcpResult(child, 1, {});
  writeAcpResult(child, 2, { sessionId: 'session-1' });
  writeAcpUpdate(child, {
    sessionUpdate: 'agent_message_chunk',
    content: { text: 'Planning changes.\n' },
  });
  writeAcpUpdate(child, {
    sessionUpdate: 'tool_call_update',
    toolCallId: 'call-1',
    title: 'edit',
    status: 'completed',
  });
  writeAcpUpdate(child, {
    sessionUpdate: 'agent_message_chunk',
    content: { text: 'Done.\n\n<artifact identifier="page">raw html</artifact>Tail' },
  });
  writeAcpResult(child, 3, { usage: { inputTokens: 1, outputTokens: 2 } });

  const textDeltas = events
    .filter((entry) => entry.event === 'agent' && (entry.payload as { type?: unknown }).type === 'text_delta')
    .map((entry) => (entry.payload as { delta?: unknown }).delta);

  assert.deepEqual(textDeltas, ['Planning changes.\n', 'Done.\n\nTail']);
});

test('attachAcpSession clears ACP suppression after plain prose before later literal artifact text', () => {
  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: unknown }> = [];

  attachAcpSession({
    child: child as never,
    prompt: 'build landing page',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
  });

  writeAcpResult(child, 1, {});
  writeAcpResult(child, 2, { sessionId: 'session-1' });
  writeAcpUpdate(child, {
    sessionUpdate: 'tool_call_update',
    toolCallId: 'call-1',
    title: 'edit',
    status: 'completed',
  });
  writeAcpUpdate(child, {
    sessionUpdate: 'agent_message_chunk',
    content: { text: 'Build passes.\n\n' },
  });
  writeAcpUpdate(child, {
    sessionUpdate: 'agent_message_chunk',
    content: { text: 'Later docs mention <artifact identifier="example">literal</artifact> syntax.' },
  });
  writeAcpResult(child, 3, { usage: { inputTokens: 1, outputTokens: 2 } });

  const textDeltas = events
    .filter((entry) => entry.event === 'agent' && (entry.payload as { type?: unknown }).type === 'text_delta')
    .map((entry) => (entry.payload as { delta?: unknown }).delta);

  assert.deepEqual(textDeltas, [
    'Build passes.\n\n',
    'Later docs mention <artifact identifier="example">literal</artifact> syntax.',
  ]);
});

test('attachAcpSession keeps ACP suppression after plain incremental prose before echo chunk', () => {
  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: unknown }> = [];

  attachAcpSession({
    child: child as never,
    prompt: 'build landing page',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
  });

  writeAcpResult(child, 1, {});
  writeAcpResult(child, 2, { sessionId: 'session-1' });
  writeAcpUpdate(child, {
    sessionUpdate: 'tool_call_update',
    toolCallId: 'call-1',
    title: 'edit',
    status: 'completed',
  });
  writeAcpUpdate(child, {
    sessionUpdate: 'agent_message_chunk',
    content: { text: 'Build passes.\n\n' },
  });
  writeAcpUpdate(child, {
    sessionUpdate: 'agent_message_chunk',
    content: { text: '<artifact identifier="page">raw html</artifact>Tail' },
  });
  writeAcpResult(child, 3, { usage: { inputTokens: 1, outputTokens: 2 } });

  const textDeltas = events
    .filter((entry) => entry.event === 'agent' && (entry.payload as { type?: unknown }).type === 'text_delta')
    .map((entry) => (entry.payload as { delta?: unknown }).delta);

  assert.deepEqual(textDeltas, ['Build passes.\n\n', 'Tail']);
});

test('attachAcpSession suppresses prose-prefixed delayed artifact echo after plain prose', () => {
  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: unknown }> = [];

  attachAcpSession({
    child: child as never,
    prompt: 'build landing page',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
  });

  writeAcpResult(child, 1, {});
  writeAcpResult(child, 2, { sessionId: 'session-1' });
  writeAcpUpdate(child, {
    sessionUpdate: 'tool_call_update',
    toolCallId: 'call-1',
    title: 'edit',
    status: 'completed',
  });
  writeAcpUpdate(child, {
    sessionUpdate: 'agent_message_chunk',
    content: { text: 'Build passes.\n\n' },
  });
  writeAcpUpdate(child, {
    sessionUpdate: 'agent_message_chunk',
    content: { text: 'Here is the generated file:\n<artifact identifier="page">raw html</artifact>Tail' },
  });
  writeAcpResult(child, 3, { usage: { inputTokens: 1, outputTokens: 2 } });

  const textDeltas = events
    .filter((entry) => entry.event === 'agent' && (entry.payload as { type?: unknown }).type === 'text_delta')
    .map((entry) => (entry.payload as { delta?: unknown }).delta);

  assert.deepEqual(textDeltas, ['Build passes.\n\n', 'Here is the generated file:\nTail']);
});

test('attachAcpSession keeps ACP suppression after unrelated failed tool before echo chunk', () => {
  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: unknown }> = [];

  attachAcpSession({
    child: child as never,
    prompt: 'build landing page',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
  });

  writeAcpResult(child, 1, {});
  writeAcpResult(child, 2, { sessionId: 'session-1' });
  writeAcpUpdate(child, {
    sessionUpdate: 'tool_call_update',
    toolCallId: 'write-1',
    title: 'edit',
    status: 'completed',
  });
  writeAcpUpdate(child, {
    sessionUpdate: 'tool_call_update',
    toolCallId: 'grep-1',
    title: 'grep',
    status: 'failed',
  });
  writeAcpUpdate(child, {
    sessionUpdate: 'agent_message_chunk',
    content: { text: 'Build passes.\n\n<artifact identifier="page">raw html</artifact>Tail' },
  });
  writeAcpResult(child, 3, { usage: { inputTokens: 1, outputTokens: 2 } });

  const textDeltas = events
    .filter((entry) => entry.event === 'agent' && (entry.payload as { type?: unknown }).type === 'text_delta')
    .map((entry) => (entry.payload as { delta?: unknown }).delta);

  assert.deepEqual(textDeltas, ['Build passes.\n\nTail']);
});

test('attachAcpSession keeps ACP suppression across plain cumulative snapshots', () => {
  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: unknown }> = [];

  attachAcpSession({
    child: child as never,
    prompt: 'build landing page',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
  });

  writeAcpResult(child, 1, {});
  writeAcpResult(child, 2, { sessionId: 'session-1' });
  writeAcpUpdate(child, {
    sessionUpdate: 'tool_call_update',
    toolCallId: 'call-1',
    title: 'edit',
    status: 'completed',
  });
  writeAcpUpdate(child, {
    sessionUpdate: 'agent_message_chunk',
    content: { text: 'Build passes.\n\n' },
  });
  writeAcpUpdate(child, {
    sessionUpdate: 'agent_message_chunk',
    content: { text: 'Build passes.\n\n<artifact identifier="page">raw html</artifact>Tail' },
  });
  writeAcpResult(child, 3, { usage: { inputTokens: 1, outputTokens: 2 } });

  const textDeltas = events
    .filter((entry) => entry.event === 'agent' && (entry.payload as { type?: unknown }).type === 'text_delta')
    .map((entry) => (entry.payload as { delta?: unknown }).delta);

  assert.deepEqual(textDeltas, ['Build passes.\n\n', 'Tail']);
});

test('attachAcpSession preserves literal artifact prose before any write echo is expected', () => {
  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: unknown }> = [];

  attachAcpSession({
    child: child as never,
    prompt: 'document artifact syntax',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
  });

  const literal = 'To show the syntax, write <artifact identifier="page">literal</artifact> in docs.';

  writeAcpResult(child, 1, {});
  writeAcpResult(child, 2, { sessionId: 'session-1' });
  writeAcpUpdate(child, {
    sessionUpdate: 'agent_message_chunk',
    content: { text: literal },
  });
  writeAcpResult(child, 3, { usage: { inputTokens: 1, outputTokens: 2 } });

  const textDeltas = events
    .filter((entry) => entry.event === 'agent' && (entry.payload as { type?: unknown }).type === 'text_delta')
    .map((entry) => (entry.payload as { delta?: unknown }).delta);

  assert.deepEqual(textDeltas, [literal]);
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

test('attachAcpSession.abort closes stdin so the agent shuts down on EOF', () => {
  const child = new FakeAcpChild();

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

  assert.equal(child.stdin.writableEnded, false);
  session.abort();
  // EOF on stdin lets the vela ACP bridge tear down its OpenCode server
  // without waiting for the caller's SIGTERM fallback.
  assert.equal(child.stdin.writableEnded, true);
});

test('attachAcpSession.abort during startup ends stdin without sending session/cancel', () => {
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

  // Abort before session/new resolves (no sessionId yet) — e.g. the user
  // cancels during ACP startup. stdin must still close so OpenCode tears down.
  assert.equal(child.stdin.writableEnded, false);
  session.abort();
  assert.equal(child.stdin.writableEnded, true);

  // No session to cancel yet, so no session/cancel RPC should be emitted.
  const cancelRequests = parseRpcWrites(writes).filter(
    (entry) => entry.method === 'session/cancel',
  );
  assert.equal(cancelRequests.length, 0);
});

test('attachAcpSession accepts pretty-printed ACP startup responses', () => {
  const child = new FakeAcpChild();
  const writes: string[] = [];
  const events: Array<{ event: string; payload: unknown }> = [];
  child.stdin.on('data', (chunk) => writes.push(String(chunk)));

  attachAcpSession({
    child: child as never,
    prompt: 'hello',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
  });

  child.stdout.write('{\n  "id": 1,\n  "result":\n  {}\n}\n');
  child.stdout.write('{\n  "id": 2,\n  "result":\n  {\n    "sessionId": "session-1"\n  }\n}\n');

  const methods = parseRpcWrites(writes)
    .map((entry) => entry.method)
    .filter(Boolean);
  assert.deepEqual(methods, ['initialize', 'session/new', 'session/prompt']);
  assert.equal(events.some((entry) => entry.event === 'error'), false);
});

test('attachAcpSession recovers when bracket-prefixed logs precede JSON frames', () => {
  const child = new FakeAcpChild();
  const writes: string[] = [];
  const events: Array<{ event: string; payload: unknown }> = [];
  child.stdin.on('data', (chunk) => writes.push(String(chunk)));

  attachAcpSession({
    child: child as never,
    prompt: 'hello',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
  });

  child.stdout.write('[vela] starting OpenCode bridge\n');
  child.stdout.write(`${JSON.stringify({ id: 1, result: {} })}\n`);
  child.stdout.write('{not json but looks like an object log\n');
  child.stdout.write('more startup text after the bad object log\n');
  child.stdout.write(`${JSON.stringify({ id: 2, result: { sessionId: 'session-1' } })}\n`);

  const methods = parseRpcWrites(writes)
    .map((entry) => entry.method)
    .filter(Boolean);
  assert.deepEqual(methods, ['initialize', 'session/new', 'session/prompt']);
  assert.equal(events.some((entry) => entry.event === 'error'), false);
});

test('attachAcpSession emits a waiting status after submitting the prompt', () => {
  const child = new FakeAcpChild();
  const writes: string[] = [];
  const events: Array<{ event: string; payload: unknown }> = [];
  child.stdin.on('data', (chunk) => writes.push(String(chunk)));

  attachAcpSession({
    child: child as never,
    prompt: 'make a simple deck',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
  });

  writeAcpResult(child, 1, {});
  writeAcpResult(child, 2, { sessionId: 'session-1' });

  const promptRequest = parseRpcWrites(writes).find((entry) => entry.method === 'session/prompt');
  assert.ok(promptRequest, 'expected session/prompt to be submitted');
  assert.ok(
    hasAgentStatus(events, 'waiting_for_first_output'),
    `expected waiting status after session/prompt, got ${JSON.stringify(events)}`,
  );
});

test('attachAcpSession surfaces non-text ACP updates as status progress', () => {
  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: unknown }> = [];

  attachAcpSession({
    child: child as never,
    prompt: 'make a simple deck',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
  });

  writeAcpResult(child, 1, {});
  writeAcpResult(child, 2, { sessionId: 'session-1' });
  writeAcpUpdate(child, { sessionUpdate: 'tool_call_update', toolCallId: 'call-1', status: 'in_progress' });

  assert.ok(
    hasAgentStatus(events, 'tool_call_update'),
    `expected tool_call_update status progress, got ${JSON.stringify(events)}`,
  );
});

test('attachAcpSession does not surface stabilized ACP metadata updates as status', () => {
  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: unknown }> = [];

  attachAcpSession({
    child: child as never,
    prompt: 'make a simple deck',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
  });

  writeAcpResult(child, 1, {});
  writeAcpResult(child, 2, { sessionId: 'session-1' });
  for (const sessionUpdate of ['usage_update', 'session_info_update', 'available_commands_update']) {
    writeAcpUpdate(child, { sessionUpdate });
  }
  writeAcpUpdate(child, {
    sessionUpdate: 'context_compaction',
    status: 'in_progress',
    message: 'Compacting conversation history',
  });
  writeAcpUpdate(child, {
    sessionUpdate: 'agent_message_chunk',
    content: { text: 'Visible answer' },
  });
  writeAcpUpdate(child, {
    sessionUpdate: 'agent_thought_chunk',
    content: { text: 'Private reasoning' },
  });
  writeAcpResult(child, 3, { usage: { inputTokens: 1, outputTokens: 2 } });

  const statuses = events
    .filter((entry) => entry.event === 'agent')
    .map((entry) => entry.payload as { type?: string; label?: string; detail?: string })
    .filter((payload) => payload.type === 'status');
  assert.deepEqual(
    statuses.filter((payload) =>
      ['usage_update', 'session_info_update', 'available_commands_update'].includes(payload.label ?? ''),
    ),
    [],
  );
  assert.equal(
    statuses.find((payload) => payload.label === 'context_compaction')?.detail,
    'Compacting conversation history',
  );
  assert.deepEqual(
    events
      .filter((entry) => entry.event === 'agent')
      .map((entry) => entry.payload as { type?: string; delta?: string })
      .filter((payload) => payload.type === 'text_delta' || payload.type === 'thinking_delta')
      .map((payload) => payload.delta),
    ['Visible answer', 'Private reasoning'],
  );
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

function writeAcpError(child: FakeAcpChild, id: number, error: unknown): void {
  child.stdout.write(`${JSON.stringify({ id, error })}\n`);
}

function writeAcpUpdate(child: FakeAcpChild, update: unknown): void {
  child.stdout.write(`${JSON.stringify({ method: 'session/update', params: { update } })}\n`);
}

function writeVelaAcpUpdate(child: FakeAcpChild, update: unknown): void {
  child.stdout.write(`${JSON.stringify({
    method: 'session/update',
    params: { sessionId: 'session-1', update },
  })}\n`);
}

function agentModelStatuses(events: Array<{ event: string; payload: unknown }>): unknown[] {
  return events
    .filter((entry) => {
      const payload = entry.payload as { type?: unknown; label?: unknown };
      return entry.event === 'agent' && payload.type === 'status' && payload.label === 'model';
    })
    .map((entry) => (entry.payload as { model?: unknown }).model);
}

function hasAgentStatus(events: Array<{ event: string; payload: unknown }>, label: string): boolean {
  return events.some((entry) => {
    const payload = entry.payload as { type?: unknown; label?: unknown };
    return entry.event === 'agent' && payload.type === 'status' && payload.label === label;
  });
}

test('attachAcpSession force-terminates the child after a clean prompt completion if it does not exit on stdin.end()', async () => {
  vi.useFakeTimers();
  try {
    const child = new FakeAcpChild();

    const session = attachAcpSession({
      child: child as never,
      prompt: 'hello',
      cwd: '/tmp/od-project',
      model: null,
      mcpServers: [],
      send: () => {},
    });

    // Drive the protocol through to a clean prompt completion.
    child.stdout.write(`${JSON.stringify({ id: 1, result: {} })}\n`);
    child.stdout.write(`${JSON.stringify({ id: 2, result: { sessionId: 'session-1' } })}\n`);
    child.stdout.write(`${JSON.stringify({ id: 3, result: { usage: { inputTokens: 1, outputTokens: 2 } } })}\n`);

    // Child has not exited yet (simulates Devin for Terminal keeping the
    // process alive past stdin.end()).
    assert.equal(child.killed, false);

    // After the grace period elapses, attachAcpSession should SIGTERM the
    // child so child.on('close') can fire and the chat run can finalize.
    await vi.advanceTimersByTimeAsync(500);
    assert.equal(child.killed, true);

    // The session reports the prompt completed successfully so the consumer
    // can mark the run as 'succeeded' even though the underlying exit was
    // signal-driven.
    assert.equal(session.completedSuccessfully(), true);
    assert.equal(session.hasFatalError(), false);
  } finally {
    vi.useRealTimers();
  }
});

test('attachAcpSession does not double-kill a child that exits cleanly on stdin.end()', async () => {
  vi.useFakeTimers();
  try {
    const child = new FakeAcpChild();

    attachAcpSession({
      child: child as never,
      prompt: 'hello',
      cwd: '/tmp/od-project',
      model: null,
      mcpServers: [],
      send: () => {},
    });

    child.stdout.write(`${JSON.stringify({ id: 1, result: {} })}\n`);
    child.stdout.write(`${JSON.stringify({ id: 2, result: { sessionId: 'session-1' } })}\n`);
    child.stdout.write(`${JSON.stringify({ id: 3, result: {} })}\n`);

    // Well-behaved agent exits on its own before the grace period elapses.
    child.emit('close', 0, null);
    assert.equal(child.killed, false);

    // The grace-period timer should have been cleared by the close handler,
    // so advancing time should not trigger a SIGTERM on the now-closed child.
    await vi.advanceTimersByTimeAsync(2_000);
    assert.equal(child.killed, false);
  } finally {
    vi.useRealTimers();
  }
});

test('attachAcpSession preserves redacted stderr diagnostics for startup exits', () => {
  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: unknown }> = [];
  const apiKey = `sk-test-${'a'.repeat(24)}`;

  const session = attachAcpSession({
    child: child as never,
    prompt: 'hello',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
  });

  child.stderr.write(`\u001b[31mHermes startup failed\u001b[0m\nAPI key: ${apiKey}\n`);
  child.emit('close', 1, null);

  assert.equal(session.hasFatalError(), true);
  const error = events.find((entry) => entry.event === 'error')?.payload as {
    error?: { details?: Record<string, unknown> };
  };
  assert.deepEqual(error.error?.details, {
    kind: 'acp_child_exit',
    phase: 'initialize',
    exit_code: 1,
    signal: null,
    stderr_tail: 'Hermes startup failed\nAPI key: [REDACTED:sk_key]',
  });
  assert.equal(JSON.stringify(error).includes(apiKey), false);
});

test('attachAcpSession redacts stderr credentials split by ANSI sequences', () => {
  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: unknown }> = [];
  const apiKey = `sk-test-${'a'.repeat(12)}${'b'.repeat(12)}`;
  const ansiSplitApiKey = `sk-test-${'a'.repeat(12)}\u001b[31m${'b'.repeat(12)}\u001b[0m`;

  attachAcpSession({
    child: child as never,
    prompt: 'hello',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
  });

  child.stderr.write(`API key: ${ansiSplitApiKey}\n`);
  child.emit('close', 1, null);

  const error = events.find((entry) => entry.event === 'error')?.payload as {
    error?: { details?: Record<string, unknown> };
  };
  assert.equal(error.error?.details?.stderr_tail, 'API key: [REDACTED:sk_key]');
  assert.equal(JSON.stringify(error).includes(apiKey), false);
});

test('attachAcpSession classifies exits after initialize as session setup failures', () => {
  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: unknown }> = [];

  attachAcpSession({
    child: child as never,
    prompt: 'hello',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
  });

  writeAcpResult(child, 1, {});
  child.stderr.write('Kimi could not create a session\n');
  child.emit('close', 1, null);

  const error = events.find((entry) => entry.event === 'error')?.payload as {
    error?: { details?: Record<string, unknown> };
  };
  assert.equal(error.error?.details?.phase, 'session/new');
});

test('attachAcpSession accepts an opted-in ACP turn_end update as prompt completion', () => {
  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: unknown }> = [];

  const session = attachAcpSession({
    child: child as never,
    prompt: 'hello',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    completePromptOnTurnEnd: true,
    send: (event, payload) => events.push({ event, payload }),
  });

  writeAcpResult(child, 1, {});
  writeAcpResult(child, 2, { sessionId: 'session-1' });
  writeAcpUpdate(child, {
    sessionUpdate: 'agent_message_chunk',
    content: { type: 'text', text: 'done' },
  });
  writeAcpUpdate(child, {
    sessionUpdate: 'turn_end',
    usage: { inputTokens: 1, outputTokens: 1 },
  });
  child.emit('close', 0, null);

  assert.equal(session.completedSuccessfully(), true);
  assert.equal(session.hasFatalError(), false);
  assert.equal(events.some((entry) => entry.event === 'error'), false);
});

test('attachAcpSession.completedSuccessfully reflects abort and fatal-error states', () => {
  const child = new FakeAcpChild();

  const session = attachAcpSession({
    child: child as never,
    prompt: 'hello',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: () => {},
  });

  // Before any protocol traffic the session is not yet complete.
  assert.equal(session.completedSuccessfully(), false);

  // Drive through session creation, then abort before the prompt completes.
  child.stdout.write(`${JSON.stringify({ id: 1, result: {} })}\n`);
  child.stdout.write(`${JSON.stringify({ id: 2, result: { sessionId: 'session-1' } })}\n`);
  session.abort();

  // Aborted runs are not "successful completions" even though `finished` is
  // set internally — the consumer should treat them as canceled, not
  // succeeded.
  assert.equal(session.completedSuccessfully(), false);
});

test('attachAcpSession default stage timeout tolerates >3min of silence between chunks', async () => {
  vi.useFakeTimers();
  try {
    const child = new FakeAcpChild();
    const events: Array<{ event: string; payload: unknown }> = [];

    attachAcpSession({
      child: child as never,
      prompt: 'write a large landing page',
      cwd: '/tmp/od-project',
      model: null,
      mcpServers: [],
      send: (event, payload) => events.push({ event, payload }),
    });

    child.stdout.write(`${JSON.stringify({ id: 1, result: {} })}\n`);
    child.stdout.write(`${JSON.stringify({ id: 2, result: { sessionId: 'session-1' } })}\n`);

    // Simulate an agent silently writing a large artifact for ~4 minutes —
    // longer than the historical 180_000ms default that killed long
    // generations mid-response.
    await vi.advanceTimersByTimeAsync(240_000);

    const errors = events.filter((e) => e.event === 'error');
    assert.equal(errors.length, 0, `expected no stage-timeout error, got: ${JSON.stringify(errors)}`);
    assert.equal(child.killed, false);
  } finally {
    vi.useRealTimers();
  }
});

test('attachAcpSession honors caller-supplied stageTimeoutMs override', async () => {
  vi.useFakeTimers();
  try {
    const child = new FakeAcpChild();
    const events: Array<{ event: string; payload: unknown }> = [];

    attachAcpSession({
      child: child as never,
      prompt: 'hello',
      cwd: '/tmp/od-project',
      model: null,
      mcpServers: [],
      send: (event, payload) => events.push({ event, payload }),
      stageTimeoutMs: 1_000,
    });

    child.stdout.write(`${JSON.stringify({ id: 1, result: {} })}\n`);
    child.stdout.write(`${JSON.stringify({ id: 2, result: { sessionId: 'session-1' } })}\n`);

    await vi.advanceTimersByTimeAsync(1_500);

    const error = events.find((e) => e.event === 'error');
    assert.ok(error, 'expected a stage-timeout error event');
    const message = (error.payload as { message?: string }).message ?? '';
    assert.match(message, /1000ms/);
  } finally {
    vi.useRealTimers();
  }
});

test('fail paths flush open ACP tools as errored tool_use/tool_result pairs', async () => {
  // tool_use is deferred until terminal status. If the session fails while a
  // tool is still open (stage timeout / child exit), the pending entry must
  // still appear in the transcript as isError so Langfuse/PostHog keep it.
  vi.useFakeTimers();
  try {
    const child = new FakeAcpChild();
    const events: Array<{ event: string; payload: unknown }> = [];

    attachAcpSession({
      child: child as never,
      prompt: 'run a long bash',
      cwd: '/tmp/od-project',
      model: null,
      mcpServers: [],
      send: (event, payload) => events.push({ event, payload }),
      stageTimeoutMs: 1_000,
    });

    writeAcpResult(child, 1, {});
    writeAcpResult(child, 2, { sessionId: 'session-1' });
    writeAcpUpdate(child, {
      sessionUpdate: 'tool_call',
      toolCallId: 'open-bash-1',
      kind: 'execute',
      title: 'bash',
      status: 'in_progress',
      rawInput: { command: 'sleep 999' },
    });
    // No terminal tool_call_update — session dies mid-tool.

    await vi.advanceTimersByTimeAsync(1_500);

    const error = events.find((e) => e.event === 'error');
    assert.ok(error, 'expected stage-timeout failure');

    const toolUse = events.find(
      (e) =>
        e.event === 'agent' &&
        (e.payload as { type?: string; id?: string }).type === 'tool_use' &&
        (e.payload as { id?: string }).id === acpTelemetryToolCallId('open-bash-1'),
    );
    assert.ok(toolUse, 'open tool must be flushed as tool_use on fail');
    assert.equal((toolUse.payload as { name?: string }).name, 'Bash');

    const toolResult = events.find(
      (e) =>
        e.event === 'agent' &&
        (e.payload as { type?: string; toolUseId?: string }).type === 'tool_result' &&
        (e.payload as { toolUseId?: string }).toolUseId === acpTelemetryToolCallId('open-bash-1'),
    );
    assert.ok(toolResult, 'open tool must be flushed as tool_result on fail');
    assert.equal((toolResult.payload as { isError?: boolean }).isError, true);

    // tool pair must precede the terminal error event so analytics consumers
    // that stop at first error still see the open tool.
    const toolUseIdx = events.indexOf(toolUse);
    const errorIdx = events.indexOf(error);
    assert.ok(toolUseIdx < errorIdx, 'flush open tools before sending error');
  } finally {
    vi.useRealTimers();
  }
});

test('child-exit fail path flushes open ACP tools as errored pairs', () => {
  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: unknown }> = [];

  attachAcpSession({
    child: child as never,
    prompt: 'read a file',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
  });

  writeAcpResult(child, 1, {});
  writeAcpResult(child, 2, { sessionId: 'session-1' });
  writeAcpUpdate(child, {
    sessionUpdate: 'tool_call',
    toolCallId: 'open-read-1',
    kind: 'read',
    title: 'Read src/app.ts',
    status: 'pending',
    locations: [{ path: 'src/app.ts' }],
  });
  // Process dies before terminal tool_call_update.
  child.emit('close', 1, null);

  const error = events.find((e) => e.event === 'error');
  assert.ok(error, 'expected exit-before-completion failure');
  assert.match(
    (error.payload as { message?: string }).message ?? '',
    /exited before completion/,
  );

  const toolUse = events.find(
    (e) =>
      e.event === 'agent' &&
      (e.payload as { type?: string; id?: string }).type === 'tool_use' &&
      (e.payload as { id?: string }).id === acpTelemetryToolCallId('open-read-1'),
  );
  assert.ok(toolUse, 'open tool must be flushed on child-exit fail');
  assert.equal((toolUse.payload as { name?: string }).name, 'Read');

  const toolResult = events.find(
    (e) =>
      e.event === 'agent' &&
      (e.payload as { type?: string; toolUseId?: string }).type === 'tool_result' &&
      (e.payload as { toolUseId?: string }).toolUseId === acpTelemetryToolCallId('open-read-1'),
  );
  assert.ok(toolResult, 'open tool must flush tool_result on child-exit fail');
  assert.equal((toolResult.payload as { isError?: boolean }).isError, true);
});

test('abort flushes open ACP tools as errored pairs', () => {
  // User cancel calls abort() without going through fail(). Deferred tools
  // must still emit tool_use/tool_result so canceled runs keep a complete
  // transcript for Langfuse/PostHog (same as timeout / child-exit fails).
  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: unknown }> = [];

  const session = attachAcpSession({
    child: child as never,
    prompt: 'run a long bash',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
  });

  writeAcpResult(child, 1, {});
  writeAcpResult(child, 2, { sessionId: 'session-1' });
  writeAcpUpdate(child, {
    sessionUpdate: 'tool_call',
    toolCallId: 'open-bash-cancel-1',
    kind: 'execute',
    title: 'bash',
    status: 'in_progress',
    rawInput: { command: 'sleep 999' },
  });
  // No terminal tool_call_update — user cancels mid-tool.
  session.abort();

  const toolUse = events.find(
    (e) =>
      e.event === 'agent' &&
      (e.payload as { type?: string; id?: string }).type === 'tool_use' &&
      (e.payload as { id?: string }).id === acpTelemetryToolCallId('open-bash-cancel-1'),
  );
  assert.ok(toolUse, 'open tool must be flushed as tool_use on abort');
  assert.equal((toolUse.payload as { name?: string }).name, 'Bash');

  const toolResult = events.find(
    (e) =>
      e.event === 'agent' &&
      (e.payload as { type?: string; toolUseId?: string }).type === 'tool_result' &&
      (e.payload as { toolUseId?: string }).toolUseId === acpTelemetryToolCallId('open-bash-cancel-1'),
  );
  assert.ok(toolResult, 'open tool must be flushed as tool_result on abort');
  assert.equal((toolResult.payload as { isError?: boolean }).isError, true);

  // Idempotent: second abort must not re-emit the pair.
  const agentCountBefore = events.filter((e) => e.event === 'agent').length;
  session.abort();
  assert.equal(
    events.filter((e) => e.event === 'agent').length,
    agentCountBefore,
    'abort flush must be idempotent',
  );
});

test('attachAcpSession treats stageTimeoutMs <= 0 as a watchdog disable, not an immediate-failure schedule', async () => {
  vi.useFakeTimers();
  try {
    const child = new FakeAcpChild();
    const events: Array<{ event: string; payload: unknown }> = [];

    attachAcpSession({
      child: child as never,
      prompt: 'hello',
      cwd: '/tmp/od-project',
      model: null,
      mcpServers: [],
      send: (event, payload) => events.push({ event, payload }),
      // OD_ACP_STAGE_TIMEOUT_MS=0 escape hatch: operator wants to disable the
      // inner stage watchdog entirely (e.g. when relying solely on the outer
      // chat inactivity watchdog). Must NOT schedule a 0ms setTimeout that
      // would fail every ACP session on the next tick.
      stageTimeoutMs: 0,
    });

    // Drive past where the next-tick failure would have fired, plus a long
    // silent period that would trip any positive default watchdog.
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

    const errors = events.filter((e) => e.event === 'error');
    assert.equal(
      errors.length,
      0,
      `expected stageTimeoutMs=0 to disable the watchdog, got: ${JSON.stringify(errors)}`,
    );
    assert.equal(child.killed, false);
  } finally {
    vi.useRealTimers();
  }
});

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

test('attachAcpSession does not fail a tool-only AMR turn that emits no assistant text', () => {
  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: unknown }> = [];

  attachAcpSession({
    child: child as never,
    prompt: 'change all card backgrounds to gray',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    modelUnavailableErrorCode: 'AMR_MODEL_UNAVAILABLE',
    send: (event, payload) => events.push({ event, payload }),
  });

  writeAcpResult(child, 1, {});
  writeAcpResult(child, 2, { sessionId: 'session-1' });
  // The model does real work via a tool/file edit but emits no closing assistant text.
  writeAcpUpdate(child, { sessionUpdate: 'tool_call', toolCallId: 'tc-1', title: 'edit', status: 'pending' });
  writeAcpUpdate(child, { sessionUpdate: 'tool_call_update', toolCallId: 'tc-1', status: 'completed' });
  writeAcpResult(child, 3, { usage: { inputTokens: 1, outputTokens: 2 } });

  const errorEvents = events.filter((entry) => entry.event === 'error');
  assert.deepEqual(errorEvents, [], 'a turn that produced tool calls must not be reported as model-unavailable');
});

test('successful session/prompt with open concrete tool flushes clean (not no-output fail)', () => {
  // Regression: session/prompt can succeed after an in-progress tool frame without a
  // terminal tool_call_update. Clean-flush the open tool before AMR no-output
  // classification so the run succeeds with isError=false instead of failing and
  // re-flushing the tool as an error.
  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: unknown }> = [];

  const session = attachAcpSession({
    child: child as never,
    prompt: 'read a file',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    modelUnavailableErrorCode: 'AMR_MODEL_UNAVAILABLE',
    send: (event, payload) => events.push({ event, payload }),
  });

  writeAcpResult(child, 1, {});
  writeAcpResult(child, 2, { sessionId: 'session-1' });
  writeAcpUpdate(child, {
    sessionUpdate: 'tool_call',
    toolCallId: 'open-read-1',
    kind: 'read',
    title: 'Read src/app.ts',
    status: 'in_progress',
    locations: [{ path: 'src/app.ts' }],
  });
  // Prompt completes successfully with usage but no terminal tool_call_update.
  writeAcpResult(child, 3, {
    stopReason: 'end_turn',
    usage: { inputTokens: 10, outputTokens: 50, totalTokens: 60 },
  });

  assert.equal(session.hasFatalError(), false);
  assert.equal(session.completedSuccessfully(), true);

  const errorEvents = events.filter((entry) => entry.event === 'error');
  assert.deepEqual(errorEvents, [], 'open concrete tool must not trigger acp_no_visible_output');

  const toolUse = events.find(
    (e) =>
      e.event === 'agent' &&
      (e.payload as { type?: string; id?: string }).type === 'tool_use' &&
      (e.payload as { id?: string }).id === acpTelemetryToolCallId('open-read-1'),
  );
  assert.ok(toolUse, 'open concrete tool must be clean-flushed as tool_use');
  assert.equal((toolUse.payload as { name?: string }).name, 'Read');

  const toolResult = events.find(
    (e) =>
      e.event === 'agent' &&
      (e.payload as { type?: string; toolUseId?: string }).type === 'tool_result' &&
      (e.payload as { toolUseId?: string }).toolUseId === acpTelemetryToolCallId('open-read-1'),
  );
  assert.ok(toolResult, 'open concrete tool must be clean-flushed as tool_result');
  assert.equal((toolResult.payload as { isError?: boolean }).isError, false);
});

test('attachAcpSession still fails an AMR turn that produces no text and no tool calls', () => {
  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: unknown }> = [];
  const onPromptComplete = vi.fn();

  attachAcpSession({
    child: child as never,
    prompt: 'do something',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    modelUnavailableErrorCode: 'AMR_MODEL_UNAVAILABLE',
    onPromptComplete,
    send: (event, payload) => events.push({ event, payload }),
  });

  writeAcpResult(child, 1, {});
  writeAcpResult(child, 2, { sessionId: 'session-1' });
  writeAcpResult(child, 3, {}); // empty turn: no updates at all

  const errorEvents = events.filter((entry) => entry.event === 'error');
  assert.equal(errorEvents.length, 1, 'a genuinely empty turn must still fail');
  assert.match(
    (errorEvents[0]?.payload as { message?: string }).message ?? '',
    /without producing any assistant text/,
  );
  assert.equal(onPromptComplete.mock.calls.length, 0);
});

test('attachAcpSession reports clean empty completion exactly once without usage', () => {
  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: unknown }> = [];
  const onPromptComplete = vi.fn();

  attachAcpSession({
    child: child as never,
    prompt: 'hello',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    onPromptComplete,
    send: (event, payload) => events.push({ event, payload }),
  });

  writeAcpResult(child, 1, {});
  writeAcpResult(child, 2, { sessionId: 'session-1' });
  writeAcpResult(child, 3, {});
  writeAcpResult(child, 3, {});

  assert.equal(onPromptComplete.mock.calls.length, 1);
  assert.equal(
    events.filter((entry) =>
      entry.event === 'agent' &&
      (entry.payload as { type?: string }).type === 'usage'
    ).length,
    0,
  );
  assert.deepEqual(events.filter((entry) => entry.event === 'error'), []);
});

test('attachAcpSession promotes allowlisted OpenCode role-marker ACP errors', () => {
  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: unknown }> = [];

  attachAcpSession({
    child: child as never,
    prompt: 'hello',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
  });

  const details = {
    kind: 'opencode_session_error',
    source: 'opencode',
    code: 'ROLE_MARKER_HALLUCINATION',
    upstream_name: 'RoleMarkerHallucinationError',
    message: 'Model emitted fabricated role marker ("## user"). Response was truncated to prevent unauthorized instruction injection.',
    marker: '## user',
    retryable: true,
  };

  writeAcpResult(child, 1, {});
  writeAcpResult(child, 2, { sessionId: 'session-1' });
  writeAcpError(child, 3, {
    code: -32600,
    message: 'OpenCode session failed: ROLE_MARKER_HALLUCINATION',
    data: details,
  });

  const errorEvents = events.filter((entry) => entry.event === 'error');
  assert.equal(errorEvents.length, 1);
  assert.deepEqual(errorEvents[0]?.payload, {
    message: details.message,
    error: {
      code: 'ROLE_MARKER_HALLUCINATION',
      message: details.message,
      retryable: true,
      details: {
        ...details,
        promoted_by: 'open_design_acp',
      },
    },
  });
});

test('attachAcpSession preserves structured OpenCode session error details from ACP failures', () => {
  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: unknown }> = [];

  attachAcpSession({
    child: child as never,
    prompt: 'hello',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
  });

  const details = {
    kind: 'opencode_session_error',
    source: 'opencode',
    code: 'SOME_UNKNOWN_UPSTREAM_ERROR',
    message: 'Not Found',
    statusCode: 404,
    retryable: false,
    url: 'https://example.invalid/v1/chat/completions',
    suggestion: 'Check the configured AMR Link URL or model route.',
  };

  writeAcpResult(child, 1, {});
  writeAcpResult(child, 2, { sessionId: 'session-1' });
  writeAcpError(child, 3, {
    code: -32600,
    message: 'OpenCode session failed: Not Found',
    data: details,
  });

  const errorEvents = events.filter((entry) => entry.event === 'error');
  assert.equal(errorEvents.length, 1);
  assert.deepEqual(errorEvents[0]?.payload, {
    message: 'json-rpc id 3: OpenCode session failed: Not Found',
    error: {
      code: 'AGENT_EXECUTION_FAILED',
      message: 'json-rpc id 3: OpenCode session failed: Not Found',
      retryable: false,
      details,
    },
  });
});

test('attachAcpSession marks OpenCode upstream idle session errors retryable', () => {
  const child = new FakeAcpChild();
  const events: Array<{ event: string; payload: unknown }> = [];

  attachAcpSession({
    child: child as never,
    prompt: 'hello',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
  });

  const details = {
    kind: 'opencode_prompt_error',
    phase: 'event_stream',
    runtime: 'opencode',
    openCodeSessionId: 'ses_test',
    lastEventType: 'tool_call_update',
    lastToolKind: 'todowrite',
  };

  writeAcpResult(child, 1, {});
  writeAcpResult(child, 2, { sessionId: 'session-1' });
  writeAcpError(child, 3, {
    code: -32600,
    message:
      'opencode event stream: {"type":"session.error","properties":{"error":{"data":{"message":"[code=upstream_error] stream idle timeout: no data received within configured window"}}}}',
    data: details,
  });

  const errorEvents = events.filter((entry) => entry.event === 'error');
  assert.equal(errorEvents.length, 1);
  const payload = errorEvents[0]?.payload as {
    error?: { retryable?: unknown; details?: unknown };
  };
  assert.equal(payload.error?.retryable, true);
  assert.deepEqual(payload.error?.details, details);
});

test('attachAcpSession resumes via session/load when resumeSessionId is set', () => {
  const child = new FakeAcpChild();
  const writes: string[] = [];
  child.stdin.on('data', (chunk) => writes.push(String(chunk)));

  attachAcpSession({
    child: child as never,
    prompt: 'hello',
    cwd: '/tmp/od-project',
    resumeSessionId: 'oc-prev',
    send: () => {},
  });

  writeAcpResult(child, 1, {}); // initialize ack -> drives the resume handshake

  const requests = parseRpcWrites(writes);
  const loadReq = requests.find((entry) => entry.method === 'session/load');
  assert.ok(loadReq, 'expected a session/load request on resume');
  assert.deepEqual(loadReq?.params, {
    sessionId: 'oc-prev',
    cwd: path.resolve('/tmp/od-project'),
  });
  assert.equal(requests.some((entry) => entry.method === 'session/new'), false);
});

test('attachAcpSession captures the durable session handle from the result', () => {
  const child = new FakeAcpChild();
  const session = attachAcpSession({
    child: child as never,
    prompt: 'hello',
    cwd: '/tmp/od-project',
    send: () => {},
  });

  writeAcpResult(child, 1, {});
  writeAcpResult(child, 2, { sessionId: 'vela-opencode-1', openCodeSessionId: 'oc-handle' });

  assert.equal(session.getDurableSessionId(), 'oc-handle');
});

test('createJsonLineStream replays absorbed complete frames when a value-position aggregate turns invalid', () => {
  const received: Array<Record<string, unknown>> = [];
  const parser = createJsonLineStream((message) => {
    received.push(message as Record<string, unknown>);
  });

  // A truncated line ending in value position ("expecting a value") starts an
  // aggregate; the next complete frame slots into that value hole, so the
  // aggregate stays syntactically plausible and absorbs it. The third frame
  // makes the aggregate invalid. The absorbed frame must still be delivered.
  parser.feed('{"truncated":\n');
  parser.feed(`${JSON.stringify({ id: 1, result: {} })}\n`);
  parser.feed(`${JSON.stringify({ id: 2, result: { sessionId: 'session-1' } })}\n`);

  assert.deepEqual(received.map((message) => message.id), [1, 2]);
});

test('createJsonLineStream flush replays absorbed complete frames from a dead aggregate', () => {
  const received: Array<Record<string, unknown>> = [];
  const parser = createJsonLineStream((message) => {
    received.push(message as Record<string, unknown>);
  });

  parser.feed('{"truncated":\n');
  parser.feed(`${JSON.stringify({ id: 7, result: {} })}\n`);
  parser.flush();

  assert.deepEqual(received.map((message) => message.id), [7]);
});

test('createJsonLineStream replays absorbed complete frames when the aggregate exceeds its size bound', () => {
  const received: Array<Record<string, unknown>> = [];
  const parser = createJsonLineStream((message) => {
    received.push(message as Record<string, unknown>);
  });

  parser.feed('{"big":\n');
  parser.feed(`${JSON.stringify({ id: 3, result: {} })}\n`);
  // An unterminated string keeps the aggregate classified `incomplete` while
  // pushing it past the 128k size bound, forcing the bounds eviction path.
  parser.feed(`{"pad":"${'x'.repeat(130_000)}\n`);

  assert.deepEqual(received.map((message) => message.id), [3]);
});

test('createJsonLineStream still assembles a legitimate multiline JSON response', () => {
  const received: Array<Record<string, unknown>> = [];
  const parser = createJsonLineStream((message) => {
    received.push(message as Record<string, unknown>);
  });

  parser.feed('{\n  "id": 5,\n  "result":\n  {}\n}\n');

  assert.deepEqual(received.map((message) => message.id), [5]);
});
