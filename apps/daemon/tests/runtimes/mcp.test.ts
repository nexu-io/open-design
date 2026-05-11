import { test } from 'vitest';
import { createLiveArtifactsMcpTools, handleLiveArtifactsMcpRequest } from '../../src/mcp-live-artifacts-server.js';
import { AGENT_DEFS, assert, buildLiveArtifactsMcpServersForAgent, hermes, kimi } from './helpers/test-helpers.js';

test('live artifact MCP discovery is limited to mature ACP agents', () => {
  assert.deepEqual(buildLiveArtifactsMcpServersForAgent(hermes), [
    {
      name: 'open-design-live-artifacts',
      command: 'od',
      args: ['mcp', 'live-artifacts'],
      env: [],
    },
  ]);
  assert.deepEqual(buildLiveArtifactsMcpServersForAgent(kimi), [
    {
      name: 'open-design-live-artifacts',
      command: 'od',
      args: ['mcp', 'live-artifacts'],
      env: [],
    },
  ]);

  for (const agent of AGENT_DEFS) {
    if (agent.id === 'hermes' || agent.id === 'kimi') continue;
    assert.deepEqual(buildLiveArtifactsMcpServersForAgent(agent), []);
  }
});

test('live artifact MCP discovery is disabled when run-scoped tool auth is unavailable', () => {
  assert.deepEqual(buildLiveArtifactsMcpServersForAgent(hermes, { enabled: false }), []);
});

test('live artifact MCP discovery can use daemon-resolved CLI command', () => {
  assert.deepEqual(
    buildLiveArtifactsMcpServersForAgent(hermes, {
      command: process.execPath,
      argsPrefix: ['/workspace/apps/daemon/dist/cli.js'],
    } as unknown as Parameters<typeof buildLiveArtifactsMcpServersForAgent>[1]),
    [
      {
        name: 'open-design-live-artifacts',
        command: process.execPath,
        args: ['/workspace/apps/daemon/dist/cli.js', 'mcp', 'live-artifacts'],
        env: [],
      },
    ],
  );
});

test('MCP-capable agents can discover equivalent live artifact and connector tools', async () => {
  const tools = createLiveArtifactsMcpTools();
  assert.deepEqual(tools.map((tool) => tool.name), [
    'live_artifacts_create',
    'live_artifacts_list',
    'live_artifacts_update',
    'live_artifacts_refresh',
    'connectors_list',
    'connectors_execute',
  ]);

  for (const tool of tools) {
    assert.equal(typeof tool.description, 'string');
    assert.match(tool.description, /POSIX equivalent: `"\$OD_NODE_BIN" "\$OD_BIN" tools /u);
    assert.equal(tool.inputSchema.type, 'object');
  }

  const initialized = await handleLiveArtifactsMcpRequest({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) as { result: { serverInfo: { name: string }; capabilities: unknown } };
  assert.equal(initialized.result.serverInfo.name, 'open-design-live-artifacts');
  assert.deepEqual(initialized.result.capabilities, { tools: {} });

  const listed = await handleLiveArtifactsMcpRequest({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) as { result: { tools: Array<{ name: string }> } };
  assert.deepEqual(listed.result.tools.map((tool) => tool.name), tools.map((tool) => tool.name));

  const createTool = tools.find((tool) => tool.name === 'live_artifacts_create')!;
  const updateTool = tools.find((tool) => tool.name === 'live_artifacts_update')!;
  const connectorsListTool = tools.find((tool) => tool.name === 'connectors_list')!;
  const createProperties = createTool.inputSchema.properties as Record<string, unknown>;
  const updateProperties = updateTool.inputSchema.properties as Record<string, unknown>;
  const connectorsListProperties = connectorsListTool.inputSchema.properties as Record<string, unknown>;
  assert.deepEqual(Object.keys(createProperties).sort(), ['input', 'provenanceJson', 'templateHtml']);
  assert.deepEqual(Object.keys(updateProperties).sort(), ['artifactId', 'input', 'provenanceJson', 'templateHtml']);
  assert.deepEqual(Object.keys(connectorsListProperties).sort(), ['useCase']);
});

test('live artifact MCP connector list forwards daily digest use case to daemon tools', async () => {
  process.env.OD_DAEMON_URL = 'http://127.0.0.1:17456/base';
  process.env.OD_TOOL_TOKEN = 'test-tool-token';
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ connectors: [] }), { status: 200 });
  };

  const response = await handleLiveArtifactsMcpRequest({
    jsonrpc: '2.0',
    id: 5,
    method: 'tools/call',
    params: { name: 'connectors_list', arguments: { useCase: 'personal_daily_digest' } },
  }) as { error?: unknown };

  assert.equal(response.error, undefined);
  assert.equal(calls.length, 1);
  const call = calls[0];
  assert.ok(call);
  assert.equal(call.url, 'http://127.0.0.1:17456/base/api/tools/connectors/list?useCase=personal_daily_digest');
});

test('live artifact MCP create forwards input and artifact payload fields to daemon tools', async () => {
  process.env.OD_DAEMON_URL = 'http://127.0.0.1:17456';
  process.env.OD_TOOL_TOKEN = 'test-tool-token';
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ artifact: { id: 'artifact-1' } }), { status: 200 });
  };

  const input = { title: 'Demo', preview: { type: 'html', entry: 'index.html' } };
  const templateHtml = '<h1>{{data.title}}</h1>';
  const provenanceJson = { source: { type: 'mcp-test' } };
  const response = await handleLiveArtifactsMcpRequest({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: { name: 'live_artifacts_create', arguments: { input, templateHtml, provenanceJson } },
  }) as { error?: unknown };

  assert.equal(response.error, undefined);
  assert.equal(calls.length, 1);
  const call = calls[0];
  assert.ok(call);
  assert.ok(call.init);
  assert.equal(call.url, 'http://127.0.0.1:17456/api/tools/live-artifacts/create');
  assert.deepEqual(JSON.parse(call.init.body as string), { input, templateHtml, provenanceJson });
});

test('live artifact MCP update preserves nested input and artifact payload fields', async () => {
  process.env.OD_DAEMON_URL = 'http://127.0.0.1:17456';
  process.env.OD_TOOL_TOKEN = 'test-tool-token';
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ artifact: { id: 'artifact-1', title: 'Updated' } }), { status: 200 });
  };

  const input = { title: 'Updated', pinned: true };
  const templateHtml = '<p>{{data.value}}</p>';
  const provenanceJson = { source: { type: 'mcp-update-test' } };
  const response = await handleLiveArtifactsMcpRequest({
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: { name: 'live_artifacts_update', arguments: { artifactId: 'artifact-1', input, templateHtml, provenanceJson } },
  }) as { error?: unknown };

  assert.equal(response.error, undefined);
  assert.equal(calls.length, 1);
  const call = calls[0];
  assert.ok(call);
  assert.ok(call.init);
  assert.equal(call.url, 'http://127.0.0.1:17456/api/tools/live-artifacts/update');
  assert.deepEqual(JSON.parse(call.init.body as string), { artifactId: 'artifact-1', input, templateHtml, provenanceJson });
});
