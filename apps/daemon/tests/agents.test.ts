// @ts-nocheck
import { afterEach, test } from 'vitest';
import assert from 'node:assert/strict';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AGENT_DEFS,
  buildLiveArtifactsMcpServersForAgent,
  checkPromptArgvBudget,
  checkWindowsCmdShimCommandLineBudget,
  checkWindowsDirectExeCommandLineBudget,
  detectAgents,
  resolveAgentExecutable,
  spawnEnvForAgent,
} from '../src/agents.js';
import { createLiveArtifactsMcpTools, handleLiveArtifactsMcpRequest } from '../src/mcp-live-artifacts-server.js';

const codex = AGENT_DEFS.find((agent) => agent.id === 'codex');
const hermes = AGENT_DEFS.find((agent) => agent.id === 'hermes');
const kimi = AGENT_DEFS.find((agent) => agent.id === 'kimi');

const copilot = AGENT_DEFS.find((agent) => agent.id === 'copilot');
const cursorAgent = AGENT_DEFS.find((agent) => agent.id === 'cursor-agent');
const kiro = AGENT_DEFS.find((agent) => agent.id === 'kiro');
const kilo = AGENT_DEFS.find((agent) => agent.id === 'kilo');
const vibe = AGENT_DEFS.find((agent) => agent.id === 'vibe');
const claude = AGENT_DEFS.find((agent) => agent.id === 'claude');
const devin = AGENT_DEFS.find((agent) => agent.id === 'devin');
const pi = AGENT_DEFS.find((agent) => agent.id === 'pi');
const deepseek = AGENT_DEFS.find((agent) => agent.id === 'deepseek');
const gemini = AGENT_DEFS.find((agent) => agent.id === 'gemini');
const qoder = AGENT_DEFS.find((agent) => agent.id === 'qoder');
const originalDisablePlugins = process.env.OD_CODEX_DISABLE_PLUGINS;
const originalPath = process.env.PATH;
const originalHome = process.env.HOME;
const originalAgentHome = process.env.OD_AGENT_HOME;
const originalDaemonUrl = process.env.OD_DAEMON_URL;
const originalToolToken = process.env.OD_TOOL_TOKEN;
const originalNpmConfigPrefix = process.env.NPM_CONFIG_PREFIX;
const originalFetch = globalThis.fetch;

afterEach(() => {
  if (originalDisablePlugins == null) {
    delete process.env.OD_CODEX_DISABLE_PLUGINS;
  } else {
    process.env.OD_CODEX_DISABLE_PLUGINS = originalDisablePlugins;
  }
  process.env.PATH = originalPath;
  if (originalHome == null) {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalHome;
  }
  if (originalAgentHome == null) {
    delete process.env.OD_AGENT_HOME;
  } else {
    process.env.OD_AGENT_HOME = originalAgentHome;
  }
  if (originalDaemonUrl == null) {
    delete process.env.OD_DAEMON_URL;
  } else {
    process.env.OD_DAEMON_URL = originalDaemonUrl;
  }
  if (originalToolToken == null) {
    delete process.env.OD_TOOL_TOKEN;
  } else {
    process.env.OD_TOOL_TOKEN = originalToolToken;
  }
  if (originalNpmConfigPrefix == null) {
    delete process.env.NPM_CONFIG_PREFIX;
  } else {
    process.env.NPM_CONFIG_PREFIX = originalNpmConfigPrefix;
  }
  globalThis.fetch = originalFetch;
});

test('AGENT_DEFS ids are unique', () => {
  const ids = AGENT_DEFS.map((a) => a.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  assert.deepEqual(dupes, [], `duplicate agent ids: ${JSON.stringify(dupes)}`);
});

test('codex args disable plugins when OD_CODEX_DISABLE_PLUGINS is 1', () => {
  process.env.OD_CODEX_DISABLE_PLUGINS = '1';

  const args = codex.buildArgs('', [], [], {}, { cwd: '/tmp/od-project' });

  assert.deepEqual(args.slice(0, 9), [
    'exec',
    '--json',
    '--skip-git-repo-check',
    '--sandbox',
    'workspace-write',
    '-c',
    'sandbox_workspace_write.network_access=true',
    '--disable',
    'plugins',
  ]);
});

test('codex args use workspace-write sandbox instead of deprecated full-auto', () => {
  delete process.env.OD_CODEX_DISABLE_PLUGINS;

  const args = codex.buildArgs('', [], [], {}, { cwd: '/tmp/od-project' });

  assert.equal(args.includes('--full-auto'), false);
  assert.deepEqual(args.slice(0, 5), [
    'exec',
    '--json',
    '--skip-git-repo-check',
    '--sandbox',
    'workspace-write',
  ]);
});

test('codex args keep plugins enabled when OD_CODEX_DISABLE_PLUGINS is unset', () => {
  delete process.env.OD_CODEX_DISABLE_PLUGINS;

  const args = codex.buildArgs('', [], [], {}, { cwd: '/tmp/od-project' });

  assert.equal(args.includes('--disable'), false);
  assert.equal(args.includes('plugins'), false);
});

test('codex args keep plugins enabled when OD_CODEX_DISABLE_PLUGINS is not 1', () => {
  process.env.OD_CODEX_DISABLE_PLUGINS = 'true';

  const args = codex.buildArgs('', [], [], {}, { cwd: '/tmp/od-project' });

  assert.equal(args.includes('--disable'), false);
  assert.equal(args.includes('plugins'), false);
});

// Recent Codex CLI versions reject a bare `-` argv sentinel; passing it
// alongside the stdin pipe causes `error: unexpected argument '-' found`
// and exit code 2 before any prompt is read. We deliver the prompt via
// stdin pipe alone (gated by `promptViaStdin: true`). Regression of #237.
test('codex args do not include the literal `-` stdin sentinel (regression of #237)', () => {
  delete process.env.OD_CODEX_DISABLE_PLUGINS;

  const baseArgs = codex.buildArgs('', [], [], {}, { cwd: '/tmp/od-project' });
  assert.equal(baseArgs.includes('-'), false);

  const withModel = codex.buildArgs(
    '',
    [],
    [],
    { model: 'gpt-5-codex' },
    { cwd: '/tmp/od-project' },
  );
  assert.equal(withModel.includes('-'), false);

  const withReasoning = codex.buildArgs(
    '',
    [],
    [],
    { reasoning: 'high' },
    { cwd: '/tmp/od-project' },
  );
  assert.equal(withReasoning.includes('-'), false);

  process.env.OD_CODEX_DISABLE_PLUGINS = '1';
  const withDisablePlugins = codex.buildArgs(
    '',
    [],
    [],
    {},
    { cwd: '/tmp/od-project' },
  );
  assert.equal(withDisablePlugins.includes('-'), false);
});

test('codex args pass valid extraAllowedDirs with repeatable --add-dir flags', () => {
  delete process.env.OD_CODEX_DISABLE_PLUGINS;

  const args = codex.buildArgs(
    '',
    [],
    ['/repo/skills', '', null, '/tmp/codex/generated_images', undefined],
    {},
    { cwd: '/tmp/od-project' },
  );

  assert.deepEqual(
    args.filter((arg, index) => arg === '--add-dir' || args[index - 1] === '--add-dir'),
    ['--add-dir', '/repo/skills', '--add-dir', '/tmp/codex/generated_images'],
  );
});

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
    }),
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

  const initialized = await handleLiveArtifactsMcpRequest({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
  assert.equal(initialized.result.serverInfo.name, 'open-design-live-artifacts');
  assert.deepEqual(initialized.result.capabilities, { tools: {} });

  const listed = await handleLiveArtifactsMcpRequest({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  assert.deepEqual(listed.result.tools.map((tool) => tool.name), tools.map((tool) => tool.name));

  const createTool = tools.find((tool) => tool.name === 'live_artifacts_create')!;
  const updateTool = tools.find((tool) => tool.name === 'live_artifacts_update')!;
  const createProperties = createTool.inputSchema.properties as Record<string, unknown>;
  const updateProperties = updateTool.inputSchema.properties as Record<string, unknown>;
  assert.deepEqual(Object.keys(createProperties).sort(), ['input', 'provenanceJson', 'templateHtml']);
  assert.deepEqual(Object.keys(updateProperties).sort(), ['artifactId', 'input', 'provenanceJson', 'templateHtml']);
});

test('live artifact MCP create forwards input and artifact payload fields to daemon tools', async () => {
  process.env.OD_DAEMON_URL = 'http://127.0.0.1:17456';
  process.env.OD_TOOL_TOKEN = 'test-tool-token';
  const calls = [];
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
  });

  assert.equal(response.error, undefined);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://127.0.0.1:17456/api/tools/live-artifacts/create');
  assert.deepEqual(JSON.parse(calls[0].init.body), { input, templateHtml, provenanceJson });
});

test('live artifact MCP update preserves nested input and artifact payload fields', async () => {
  process.env.OD_DAEMON_URL = 'http://127.0.0.1:17456';
  process.env.OD_TOOL_TOKEN = 'test-tool-token';
  const calls = [];
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
  });

  assert.equal(response.error, undefined);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://127.0.0.1:17456/api/tools/live-artifacts/update');
  assert.deepEqual(JSON.parse(calls[0].init.body), { artifactId: 'artifact-1', input, templateHtml, provenanceJson });
});

test('cursor-agent args deliver prompts via stdin without passing a literal dash prompt', () => {
  const args = cursorAgent.buildArgs(
    '',
    [],
    [],
    {},
    { cwd: '/tmp/od-project' },
  );

  assert.deepEqual(args, [
    '--print',
    '--output-format',
    'stream-json',
    '--stream-partial-output',
    '--force',
    '--trust',
    '--workspace',
    '/tmp/od-project',
  ]);
});

// Copilot reads the prompt from stdin when `-p` is omitted entirely
// (upstream copilot-cli issue #1046, confirmed working as
// `echo "..." | copilot --model <id>`). The earlier `-p -` attempt
// was a dead end because Copilot takes `-` as a literal one-character
// prompt; omitting `-p` is a separate code path that does delegate to
// stdin under a non-TTY pipe. Pin `promptViaStdin: true` and the
// stdin-only argv shape so a future refactor can't silently bring
// `-p <prompt>` back and reintroduce the Windows ENAMETOOLONG
// regression (issue #705).
test('copilot delivers the prompt via stdin (no -p, no prompt body in argv)', () => {
  const prompt = 'design a landing page';
  const baseArgs = copilot.buildArgs(prompt, [], [], {});
  assert.equal(copilot.promptViaStdin, true);
  assert.ok(
    !baseArgs.includes('-p'),
    'copilot argv must not include -p; the prompt rides stdin',
  );
  assert.ok(
    !baseArgs.includes(prompt),
    'copilot argv must not include the prompt body; it rides stdin',
  );
  assert.deepEqual(baseArgs, [
    '--allow-all-tools',
    '--output-format',
    'json',
  ]);
});

test('copilot args append model and extra dirs after the base flags without reintroducing -p', () => {
  const prompt = 'design a landing page';
  const args = copilot.buildArgs(
    prompt,
    [],
    ['/tmp/od-skills', '/tmp/od-design-systems'],
    { model: 'claude-sonnet-4.6' },
  );
  assert.ok(!args.includes('-p'));
  assert.ok(!args.includes(prompt));
  assert.deepEqual(args, [
    '--allow-all-tools',
    '--output-format',
    'json',
    '--model',
    'claude-sonnet-4.6',
    '--add-dir',
    '/tmp/od-skills',
    '--add-dir',
    '/tmp/od-design-systems',
  ]);
});

test('copilot drops empty / non-string entries from extraAllowedDirs without reintroducing -p', () => {
  const prompt = 'design a landing page';
  const args = copilot.buildArgs(
    prompt,
    [],
    ['', null, '/tmp/od-skills', undefined],
    {},
  );
  assert.ok(!args.includes('-p'));
  // Only the one valid path survives.
  const addDirIndex = args.indexOf('--add-dir');
  assert.equal(args[addDirIndex + 1], '/tmp/od-skills');
  assert.equal(args.filter((a) => a === '--add-dir').length, 1);
});

// Mirror of the Claude Code 200_000-char synthetic-prompt guard: even
// when the composed prompt is large enough to blow the Windows
// CreateProcess command-line cap (~32 KB direct, ~8 KB through a `.cmd`
// shim), no argv entry must ever carry the prompt body. This is the
// structural assertion that the issue #705 fix can't quietly regress.
test('copilot flags promptViaStdin and never embeds the prompt in argv', () => {
  assert.equal(copilot.promptViaStdin, true);

  const longPrompt = 'x'.repeat(200_000);
  const args = copilot.buildArgs(longPrompt, [], [], {});

  assert.ok(Array.isArray(args), 'copilot.buildArgs must return argv');
  assert.equal(
    args.includes(longPrompt),
    false,
    'prompt must not appear in argv',
  );
  for (const arg of args) {
    assert.ok(
      typeof arg === 'string' && arg.length < 1000,
      `no argv entry should carry the prompt body (saw length ${arg.length})`,
    );
  }
});

test('kiro args use acp subcommand for json-rpc streaming', () => {
  const args = kiro.buildArgs('', [], [], {});

  assert.deepEqual(args, ['acp']);
  assert.equal(kiro.streamFormat, 'acp-json-rpc');
});

test('devin args use acp subcommand for json-rpc streaming', () => {
  const args = devin.buildArgs('', [], [], {});

  assert.deepEqual(args, [
    '--permission-mode',
    'dangerous',
    '--respect-workspace-trust',
    'false',
    'acp',
  ]);
  assert.equal(devin.streamFormat, 'acp-json-rpc');
});

test('pi args use rpc mode without --no-session and append model/thinking options', () => {
  const baseArgs = pi.buildArgs('', [], [], {}, {});

  assert.deepEqual(baseArgs, ['--mode', 'rpc']);
  assert.ok(!baseArgs.includes('--no-session'), 'pi must not pass --no-session');
  assert.equal(pi.promptViaStdin, true);
  assert.equal(pi.streamFormat, 'pi-rpc');
  assert.equal(pi.supportsImagePaths, true);

  const withModel = pi.buildArgs('', [], [], { model: 'anthropic/claude-sonnet-4-5' }, {});
  assert.deepEqual(withModel, [
    '--mode',
    'rpc',
    '--model',
    'anthropic/claude-sonnet-4-5',
  ]);

  const withThinking = pi.buildArgs('', [], [], { reasoning: 'high' }, {});
  assert.deepEqual(withThinking, [
    '--mode',
    'rpc',
    '--thinking',
    'high',
  ]);
});

test('pi args forward extraAllowedDirs as --append-system-prompt flags', () => {
  const args = pi.buildArgs(
    '',
    [],
    ['/tmp/skills', '/tmp/design-systems'],
    {},
    {},
  );

  assert.deepEqual(args, [
    '--mode',
    'rpc',
    '--append-system-prompt',
    '/tmp/skills',
    '--append-system-prompt',
    '/tmp/design-systems',
  ]);
});

test('pi args filter relative paths from extraAllowedDirs', () => {
  const args = pi.buildArgs(
    '',
    [],
    ['/tmp/skills', 'relative/path', '/tmp/design-systems'],
    {},
    {},
  );

  // Relative paths should be filtered out.
  assert.deepEqual(args, [
    '--mode',
    'rpc',
    '--append-system-prompt',
    '/tmp/skills',
    '--append-system-prompt',
    '/tmp/design-systems',
  ]);
});

test('pi args combine model, thinking, and extraAllowedDirs', () => {
  const args = pi.buildArgs(
    '',
    [],
    ['/tmp/skills'],
    { model: 'openai/gpt-5', reasoning: 'medium' },
    {},
  );

  assert.deepEqual(args, [
    '--mode',
    'rpc',
    '--model',
    'openai/gpt-5',
    '--thinking',
    'medium',
    '--append-system-prompt',
    '/tmp/skills',
  ]);
});

test('gemini args avoid version-fragile trust flags', () => {
  const args = gemini.buildArgs('', [], [], {});

  assert.deepEqual(args, ['--output-format', 'stream-json', '--yolo']);
  assert.equal(args.includes('--skip-trust'), false);
  assert.deepEqual(gemini.env, { GEMINI_CLI_TRUST_WORKSPACE: 'true' });
});

test('gemini args preserve custom model selection', () => {
  const args = gemini.buildArgs('', [], [], { model: 'gemini-2.5-pro' });

  assert.deepEqual(args, [
    '--output-format',
    'stream-json',
    '--yolo',
    '--model',
    'gemini-2.5-pro',
  ]);
});

test('qoder entry uses qodercli with stream-json stdin delivery and tier model hints', () => {
  assert.equal(qoder.name, 'Qoder CLI');
  assert.equal(qoder.bin, 'qodercli');
  assert.deepEqual(qoder.versionArgs, ['--version']);
  assert.equal(qoder.promptViaStdin, true);
  assert.equal(qoder.streamFormat, 'qoder-stream-json');
  assert.deepEqual(qoder.fallbackModels.map((m) => m.id), [
    'default',
    'lite',
    'efficient',
    'auto',
    'performance',
    'ultimate',
  ]);
});

test('qoder args use non-interactive print mode with cwd, model, and add-dir', () => {
  const args = qoder.buildArgs(
    'prompt must not appear in argv',
    ['/tmp/uploads/logo.png', '/tmp/uploads/hero concept.png'],
    [
      '/repo/skills',
      '',
      null,
      './relative-skills',
      'relative-design-systems',
      '/repo/design-systems',
    ],
    { model: 'performance' },
    { cwd: '/tmp/od-project' },
  );

  assert.deepEqual(args, [
    '-p',
    '--output-format',
    'stream-json',
    '--yolo',
    '-w',
    '/tmp/od-project',
    '--model',
    'performance',
    '--add-dir',
    '/repo/skills',
    '--add-dir',
    '/repo/design-systems',
    '--attachment',
    '/tmp/uploads/logo.png',
    '--attachment',
    '/tmp/uploads/hero concept.png',
  ]);
  assert.equal(args.includes('prompt must not appear in argv'), false);
  assert.equal(args.includes('./relative-skills'), false);
  assert.equal(args.includes('relative-design-systems'), false);
});

test('qoder args omit default model and cwd when absent', () => {
  const args = qoder.buildArgs('', [], [], { model: 'default' }, {});

  assert.deepEqual(args, [
    '-p',
    '--output-format',
    'stream-json',
    '--yolo',
  ]);
  assert.equal(args.includes('--model'), false);
  assert.equal(args.includes('-w'), false);
});

test('qoder args omit empty, non-string, and relative add-dir entries', () => {
  const args = qoder.buildArgs('', [], [
    '',
    null,
    undefined,
    42,
    './skills',
    'design-systems',
  ]);

  assert.equal(args.includes('--add-dir'), false);
});

test('qoder args omit empty, non-string, and relative image attachment entries', () => {
  const args = qoder.buildArgs('', [
    '',
    null,
    undefined,
    42,
    './uploads/logo.png',
    'uploads/hero.png',
    '/tmp/uploads/logo.png',
  ]);

  assert.deepEqual(
    args.filter((arg) => arg === '--attachment').length,
    1,
  );
  assert.ok(args.includes('/tmp/uploads/logo.png'));
  assert.equal(args.includes('./uploads/logo.png'), false);
  assert.equal(args.includes('uploads/hero.png'), false);
});

test('qoder adapter inherits QODER_PERSONAL_ACCESS_TOKEN from daemon env', () => {
  const env = spawnEnvForAgent('qoder', {
    QODER_PERSONAL_ACCESS_TOKEN: 'qoder-pat',
    PATH: '/usr/bin',
    OD_DAEMON_URL: 'http://127.0.0.1:7456',
  });

  assert.equal(env.QODER_PERSONAL_ACCESS_TOKEN, 'qoder-pat');
  assert.equal(env.PATH, '/usr/bin');
  assert.equal(env.OD_DAEMON_URL, 'http://127.0.0.1:7456');
});

test('qoder adapter does not define static secret env', () => {
  assert.equal(qoder.env?.QODER_PERSONAL_ACCESS_TOKEN, undefined);
});

test('detectAgents keeps qoder unavailable with fallback metadata when qodercli is missing', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-agents-empty-'));
  try {
    process.env.OD_AGENT_HOME = dir;
    process.env.PATH = dir;

    const agents = await detectAgents();
    const detected = agents.find((agent) => agent.id === 'qoder');

    assert.ok(detected);
    assert.equal(detected.available, false);
    assert.equal(detected.bin, 'qodercli');
    assert.deepEqual(detected.models.map((m) => m.id), [
      'default',
      'lite',
      'efficient',
      'auto',
      'performance',
      'ultimate',
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('kiro fetchModels falls back to fallbackModels when detection fails', async () => {
  // fetchModels rejects when the binary doesn't exist; the daemon's
  // probe() catches this and uses fallbackModels instead.
  const result = await kiro
    .fetchModels('/nonexistent/kiro-cli')
    .catch(() => null);

  assert.equal(result, null);
  assert.ok(Array.isArray(kiro.fallbackModels));
  assert.equal(kiro.fallbackModels[0].id, 'default');
});

test('kilo args use acp subcommand for json-rpc streaming', () => {
  const args = kilo.buildArgs('', [], [], {});

  assert.deepEqual(args, ['acp']);
  assert.equal(kilo.streamFormat, 'acp-json-rpc');
});

test('kilo fetchModels falls back to fallbackModels when detection fails', async () => {
  const result = await kilo.fetchModels('/nonexistent/kilo').catch(() => null);

  assert.equal(result, null);
  assert.ok(Array.isArray(kilo.fallbackModels));
  assert.equal(kilo.fallbackModels[0].id, 'default');
  assert.equal(kilo.fallbackModels.length, 1);
});

// ---- reasoning-effort clamp ------------------------------------------------
// Drives clampCodexReasoning through the public buildArgs surface so the
// helper stays non-exported. The wire-level `-c model_reasoning_effort="..."`
// flag is what the codex CLI (and ultimately OpenAI) actually sees.

test('codex buildArgs clamps reasoning effort per model', () => {
  const cases = [
    // [model, reasoning, expected wire-level effort]
    // gpt-5.5 family (and unknown / 'default' which we treat as 5.5):
    // minimal -> low, others pass through.
    [undefined, 'minimal', 'low'],
    ['default', 'minimal', 'low'],
    ['gpt-5.2', 'minimal', 'low'],
    ['gpt-5.3', 'minimal', 'low'],
    ['gpt-5.4', 'minimal', 'low'],
    ['gpt-5.5', 'minimal', 'low'],
    ['gpt-5.5', 'low', 'low'],
    ['gpt-5.5', 'medium', 'medium'],
    ['gpt-5.5', 'high', 'high'],
    ['vendor/gpt-5.5-foo', 'minimal', 'low'], // path-style id
    // gpt-5.1: xhigh isn't supported, others pass through.
    ['gpt-5.1', 'xhigh', 'high'],
    ['gpt-5.1', 'high', 'high'],
    // gpt-5.1-codex-mini: caps at medium / high only.
    ['gpt-5.1-codex-mini', 'minimal', 'medium'],
    ['gpt-5.1-codex-mini', 'low', 'medium'],
    ['gpt-5.1-codex-mini', 'medium', 'medium'],
    ['gpt-5.1-codex-mini', 'high', 'high'],
    ['gpt-5.1-codex-mini', 'xhigh', 'high'],
    // Unknown / future families: pass through; let the API surface its error
    // as the signal a new rule belongs in clampCodexReasoning.
    ['gpt-6', 'minimal', 'minimal'],
  ];
  for (const [model, reasoning, expected] of cases) {
    const args = codex.buildArgs(
      '',
      [],
      [],
      { model, reasoning },
      { cwd: '/tmp/od-project' },
    );
    assert.ok(
      args.includes(`model_reasoning_effort="${expected}"`),
      `(model=${model ?? '<none>'}, reasoning=${reasoning}) → expected ${expected}; args=${JSON.stringify(args)}`,
    );
  }
});

test('codex buildArgs omits model_reasoning_effort when reasoning is "default"', () => {
  const args = codex.buildArgs(
    '',
    [],
    [],
    { reasoning: 'default' },
    { cwd: '/tmp/od-project' },
  );

  assert.equal(
    args.some(
      (a) => typeof a === 'string' && a.startsWith('model_reasoning_effort='),
    ),
    false,
  );
});

test('claude flags promptViaStdin and never embeds the prompt in argv', () => {
  // Long composed prompts (system prompt + design system + skill body +
  // user message) routinely exceed Linux MAX_ARG_STRLEN (~128 KB) and the
  // Windows CreateProcess command-line cap (~32 KB direct, ~8 KB via .cmd
  // shim). The fix is to deliver the prompt on stdin instead of argv —
  // these assertions guard that contract.
  assert.equal(claude.promptViaStdin, true);

  const longPrompt = 'x'.repeat(200_000);
  const args = claude.buildArgs(
    longPrompt,
    [],
    [],
    {},
    { cwd: '/tmp/od-project' },
  );

  assert.ok(Array.isArray(args), 'claude.buildArgs must return argv');
  assert.equal(
    args.includes(longPrompt),
    false,
    'prompt must not appear in argv',
  );
  for (const arg of args) {
    assert.ok(
      typeof arg === 'string' && arg.length < 1000,
      `no argv entry should carry the prompt body (saw length ${arg.length})`,
    );
  }
  // `-p` (print mode) must still be present; without it claude drops into
  // an interactive REPL that the daemon has no TTY for.
  assert.ok(args.includes('-p'), 'claude argv must include -p');
});

// ---- Claude Code --add-dir capability (issue #430) -------------------------
// Skill seeds (`skills/<id>/assets/template.html`) and design-system specs
// (`design-systems/<id>/DESIGN.md`) live outside the project cwd. Without
// `--add-dir`, Claude Code's directory access policy blocks reads on any
// path outside the working directory. Bug was that we probed global `claude
// --help` for `--add-dir` but that flag only appears in `claude -p --help`.

test('claude buildArgs passes --add-dir when dirs are supplied (issue #430, probing-failed baseline)', () => {
  // This is the default state before any capability probe runs: agentCapabilities
  // has no entry -> buildArgs gets `caps = {}` -> caps.addDir is undefined ->
  // undefined !== false -> true. This is also the "probing threw" case: timeout,
  // binary not found, non-zero exit code from --help. Dirs are always passed
  // unless capability probing explicitly detected --help and found no --add-dir.
  const args = claude.buildArgs(
    '',
    [],
    ['/repo/skills', '/repo/design-systems'],
    {},
  );

  const addDirIndex = args.indexOf('--add-dir');
  assert.ok(addDirIndex >= 0, '--add-dir must be present by default (safe baseline)');
  assert.equal(args[addDirIndex + 1], '/repo/skills');
  assert.equal(args[addDirIndex + 2], '/repo/design-systems');
  // Check flag ordering: --add-dir comes before --permission-mode
  const permModeIndex = args.indexOf('--permission-mode');
  assert.ok(
    addDirIndex < permModeIndex,
    `--add-dir (index ${addDirIndex}) should appear before --permission-mode (index ${permModeIndex})`,
  );
});

test('claude buildArgs drops empty / null dirs but keeps valid ones (issue #430 edge case)', () => {
  const args = claude.buildArgs('', [], ['', null, '/repo/skills', undefined], {});

  const addDirIndex = args.indexOf('--add-dir');
  assert.ok(addDirIndex >= 0, '--add-dir should survive filter');
  // Only the one valid path survives after --add-dir.
  assert.equal(args[addDirIndex + 1], '/repo/skills');
  // Should NOT have multiple --add-dir flags (one flag, N arguments).
  assert.equal(args.filter((a) => a === '--add-dir').length, 1);
  // Should NOT have null / undefined / '' sneaking into argv.
  assert.equal(args.includes(''), false);
  assert.equal(args.includes(null), false);
  assert.equal(args.includes(undefined), false);
});

test('claude helpArgs probes the -p subcommand where --add-dir lives (issue #430 root cause)', () => {
  assert.deepEqual(
    claude.helpArgs,
    ['-p', '--help'],
    `claude.helpArgs must be ['-p', '--help'], not just ['--help'], because --add-dir lives under the -p subcommand. Probing global help never finds it! Got: ${JSON.stringify(claude.helpArgs)}`,
  );
});

// ---- OpenClaude fallback (issue #235) -------------------------------------
// OpenClaude (https://github.com/Gitlawb/openclaude) is a Claude Code fork
// that ships under a different binary name but speaks an argv-compatible
// CLI. Users with only `openclaude` on PATH should be auto-detected as the
// Claude Code agent without writing a wrapper script. The mechanism is the
// `fallbackBins` array on the Claude AGENT_DEF, consumed by
// `resolveAgentExecutable`.

test('claude entry declares openclaude as a fallback bin (issue #235)', () => {
  assert.ok(
    Array.isArray(claude.fallbackBins),
    'claude.fallbackBins must be an array',
  );
  assert.ok(
    claude.fallbackBins.includes('openclaude'),
    `claude.fallbackBins must include 'openclaude'; got ${JSON.stringify(claude.fallbackBins)}`,
  );
});

// resolveAgentExecutable touches the filesystem via existsSync; on
// Windows resolveOnPath also walks PATHEXT extensions, which our fixture
// files don't carry. Skip the filesystem-backed cases there — the
// declarative `fallbackBins`-on-claude assertion above still runs on
// every platform and is what catches regressions in the AGENT_DEF.
const fsTest = process.platform === 'win32' ? test.skip : test;

fsTest(
  'resolveAgentExecutable prefers def.bin over fallbackBins when bin is on PATH',
  () => {
    const dir = mkdtempSync(join(tmpdir(), 'od-agents-resolve-'));
    try {
      writeFileSync(join(dir, 'claude'), '');
      writeFileSync(join(dir, 'openclaude'), '');
      chmodSync(join(dir, 'claude'), 0o755);
      chmodSync(join(dir, 'openclaude'), 0o755);
      process.env.OD_AGENT_HOME = dir;
      process.env.PATH = dir;

      const resolved = resolveAgentExecutable({
        bin: 'claude',
        fallbackBins: ['openclaude'],
      });
      assert.equal(resolved, join(dir, 'claude'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

fsTest(
  'resolveAgentExecutable falls back through fallbackBins when def.bin is missing',
  () => {
    const dir = mkdtempSync(join(tmpdir(), 'od-agents-resolve-'));
    try {
      // Only `openclaude` is installed (Claude Code fork-only setup).
      writeFileSync(join(dir, 'openclaude'), '');
      chmodSync(join(dir, 'openclaude'), 0o755);
      process.env.OD_AGENT_HOME = dir;
      process.env.PATH = dir;

      const resolved = resolveAgentExecutable({
        bin: 'claude',
        fallbackBins: ['openclaude'],
      });
      assert.equal(resolved, join(dir, 'openclaude'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

fsTest(
  'resolveAgentExecutable returns null when neither def.bin nor any fallback is on PATH',
  () => {
    const dir = mkdtempSync(join(tmpdir(), 'od-agents-resolve-'));
    try {
      process.env.OD_AGENT_HOME = dir;
      process.env.PATH = dir;

      const resolved = resolveAgentExecutable({
        bin: 'claude',
        fallbackBins: ['openclaude'],
      });
      assert.equal(resolved, null);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

fsTest(
  'resolveAgentExecutable searches mise node bins when PATH is minimal',
  () => {
    const home = mkdtempSync(join(tmpdir(), 'od-agents-home-'));
    try {
      const dir = join(
        home,
        '.local',
        'share',
        'mise',
        'installs',
        'node',
        '24.14.1',
        'bin',
      );
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'codex'), '');
      chmodSync(join(dir, 'codex'), 0o755);
      process.env.OD_AGENT_HOME = home;
      process.env.PATH = '/usr/bin:/bin';

      const resolved = resolveAgentExecutable({
        bin: 'codex',
      });
      assert.equal(resolved, join(dir, 'codex'));
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  },
);

fsTest(
  'resolveAgentExecutable still resolves agents without a fallbackBins field',
  () => {
    // Guard against a regression that would require every AGENT_DEF to
    // declare fallbackBins. Most agents (codex / gemini / opencode / ...)
    // only have a single binary name and must keep working unchanged.
    const dir = mkdtempSync(join(tmpdir(), 'od-agents-resolve-'));
    try {
      writeFileSync(join(dir, 'codex'), '');
      chmodSync(join(dir, 'codex'), 0o755);
      process.env.PATH = dir;

      const resolved = resolveAgentExecutable({ bin: 'codex' });
      assert.equal(resolved, join(dir, 'codex'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

// Issue #442: GUI-launched daemons (Finder/Dock on macOS, .desktop on Linux)
// inherit a stripped PATH that doesn't include the user's npm global prefix.
// Most third-party "fix npm EACCES without sudo" tutorials configure
// `~/.npm-global` as the prefix, so any CLI installed via `npm i -g <cli>`
// lives at `~/.npm-global/bin/<cli>`. The daemon must search there even when
// the inherited PATH only carries `/usr/bin:/bin:...`.
fsTest(
  'resolveAgentExecutable searches ~/.npm-global/bin under a minimal GUI-launched PATH (issue #442)',
  () => {
    const home = mkdtempSync(join(tmpdir(), 'od-agents-npm-global-'));
    try {
      const dir = join(home, '.npm-global', 'bin');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'gemini'), '');
      chmodSync(join(dir, 'gemini'), 0o755);
      process.env.OD_AGENT_HOME = home;
      // Mirror the launchd default a `.app` actually inherits — no
      // `~/.npm-global/bin`, no `/opt/homebrew/bin`, nothing user-side.
      process.env.PATH = '/usr/bin:/bin';

      const resolved = resolveAgentExecutable({ bin: 'gemini' });
      assert.equal(resolved, join(dir, 'gemini'));
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  },
);

// Same root cause as #442 but for the second-most-common alternative
// non-canonical npm prefix shipped in older "fix sudo-free npm" guides.
fsTest(
  'resolveAgentExecutable also searches ~/.npm-packages/bin (alt npm prefix)',
  () => {
    const home = mkdtempSync(join(tmpdir(), 'od-agents-npm-packages-'));
    try {
      const dir = join(home, '.npm-packages', 'bin');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'gemini'), '');
      chmodSync(join(dir, 'gemini'), 0o755);
      process.env.OD_AGENT_HOME = home;
      process.env.PATH = '/usr/bin:/bin';

      const resolved = resolveAgentExecutable({ bin: 'gemini' });
      assert.equal(resolved, join(dir, 'gemini'));
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  },
);

// Test isolation: when OD_AGENT_HOME points at a sandbox, an exported
// $NPM_CONFIG_PREFIX / $npm_config_prefix on the developer's or CI
// runner's environment must not leak a real <prefix>/bin into the
// sandboxed search list. Otherwise an agent installed by the host
// machine could satisfy a "not on PATH" assertion in the sandbox and
// make detection tests environment-dependent. Raised in PR review on
// #442 (review comment by @mrcfps on apps/daemon/src/agents.ts:742).
fsTest(
  'OD_AGENT_HOME isolates resolution from $NPM_CONFIG_PREFIX leakage',
  () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'od-agents-sandbox-'));
    const realPrefix = mkdtempSync(join(tmpdir(), 'od-agents-real-prefix-'));
    const realPrefixBin = join(realPrefix, 'bin');
    try {
      // Sandbox is empty — gemini does not exist under OD_AGENT_HOME.
      // Real prefix has a gemini, simulating the developer's /opt/...
      // or ~/.npm-global install. NPM_CONFIG_PREFIX points at it.
      mkdirSync(realPrefixBin, { recursive: true });
      writeFileSync(join(realPrefixBin, 'gemini'), '');
      chmodSync(join(realPrefixBin, 'gemini'), 0o755);

      process.env.OD_AGENT_HOME = sandbox;
      process.env.PATH = '/usr/bin:/bin';
      process.env.NPM_CONFIG_PREFIX = realPrefix;

      const resolved = resolveAgentExecutable({ bin: 'gemini' });
      assert.equal(
        resolved,
        null,
        `OD_AGENT_HOME sandbox must not see the real $NPM_CONFIG_PREFIX bin; ` +
          `got ${resolved}`,
      );
    } finally {
      // afterEach restores NPM_CONFIG_PREFIX to its pre-test value (or
      // deletes it when it was unset), so do not unconditionally
      // `delete` it here — that would clobber an export the developer
      // / CI runner had already set, leaking into the next test in the
      // same Vitest worker.
      rmSync(sandbox, { recursive: true, force: true });
      rmSync(realPrefix, { recursive: true, force: true });
    }
  },
);

// DeepSeek TUI's exec subcommand requires the prompt as a positional
// argument (no `-` stdin sentinel; clap declares `prompt: String` as a
// required field). `--auto` enables agentic mode with auto-approval —
// the daemon runs every CLI without a TTY, so the interactive approval
// prompt would hang the run.
test('deepseek args use exec --auto and append prompt as positional', () => {
  const args = deepseek.buildArgs('write hello world', [], [], {});

  assert.deepEqual(args, ['exec', '--auto', 'write hello world']);
  assert.equal(deepseek.streamFormat, 'plain');
});

test('deepseek args inject --model when the user picks one', () => {
  const args = deepseek.buildArgs('hi', [], [], { model: 'deepseek-v4-pro' });

  assert.deepEqual(args, [
    'exec',
    '--auto',
    '--model',
    'deepseek-v4-pro',
    'hi',
  ]);
});

test('deepseek args omit --model when model is "default"', () => {
  const args = deepseek.buildArgs('hi', [], [], { model: 'default' });

  assert.equal(args.includes('--model'), false);
});

// DeepSeek's exec mode requires the prompt as a positional argv arg
// (no `-` stdin sentinel upstream), so a sufficiently large composed
// prompt — system text + history + skills/design-system content + the
// user message — could blow Windows' ~32 KB CreateProcess command-line
// limit (or Linux MAX_ARG_STRLEN on extreme edges) and surface as a
// generic spawn ENAMETOOLONG / E2BIG instead of a DeepSeek-specific,
// user-actionable message. The adapter declares `maxPromptArgBytes` so
// /api/chat can fail fast with guidance ("reduce skills/design context
// or use an adapter with stdin support") before calling `spawn`. Pin
// the field so removing it can't silently regress the guard.
test('deepseek declares a conservative argv-byte budget for the prompt', () => {
  assert.equal(
    typeof deepseek.maxPromptArgBytes,
    'number',
    'deepseek must set maxPromptArgBytes so the spawn path can pre-flight oversized prompts before hitting CreateProcess / E2BIG',
  );
  assert.ok(
    deepseek.maxPromptArgBytes > 0 && deepseek.maxPromptArgBytes < 32_768,
    `deepseek.maxPromptArgBytes must stay strictly under the Windows CreateProcess limit (~32 KB); got ${deepseek.maxPromptArgBytes}`,
  );
});

// Regression: composed prompts larger than the deepseek argv budget
// (chosen as a conservative under-Windows-CreateProcess size) must
// trip `checkPromptArgvBudget` with the DeepSeek-named, actionable
// `AGENT_PROMPT_TOO_LARGE` payload the chat handler emits over SSE,
// while normal-sized prompts must pass through cleanly so the chat
// happy path keeps working. This exercises the same pure helper the
// `/api/chat` spawn path uses, so removing the guard or letting the
// budget drift over the Windows limit fails this test before any
// real spawn would surface a generic ENAMETOOLONG / E2BIG.
test('checkPromptArgvBudget flags oversized DeepSeek prompts and lets short prompts through', () => {
  const oversized = 'x'.repeat(deepseek.maxPromptArgBytes + 1);
  const flagged = checkPromptArgvBudget(deepseek, oversized);
  assert.ok(flagged, 'oversized prompts must trip the argv-byte guard');
  assert.equal(flagged.code, 'AGENT_PROMPT_TOO_LARGE');
  assert.equal(flagged.limit, deepseek.maxPromptArgBytes);
  assert.equal(flagged.bytes, deepseek.maxPromptArgBytes + 1);
  assert.match(flagged.message, /DeepSeek/);
  assert.match(flagged.message, /command-line argument/);
  assert.match(flagged.message, /stdin support/);

  // Normal-sized prompts must not trip the guard; the chat happy path
  // depends on this returning null so it can proceed to spawn.
  assert.equal(checkPromptArgvBudget(deepseek, 'hello'), null);

  // The exact-budget edge: a prompt right at the limit must pass; the
  // guard fires only when the byte count strictly exceeds the budget.
  const atLimit = 'x'.repeat(deepseek.maxPromptArgBytes);
  assert.equal(checkPromptArgvBudget(deepseek, atLimit), null);

  // A multi-byte UTF-8 prompt (e.g. CJK characters) is measured in
  // bytes, not code points — pin that so a 3-byte-per-char prompt
  // can't sneak past a code-point-based regression of the helper.
  const cjkOversized = '汉'.repeat(
    Math.ceil(deepseek.maxPromptArgBytes / 3) + 1,
  );
  const cjkFlagged = checkPromptArgvBudget(deepseek, cjkOversized);
  assert.ok(cjkFlagged, 'byte-counted UTF-8 prompts must also trip the guard');
  assert.equal(cjkFlagged.code, 'AGENT_PROMPT_TOO_LARGE');
});

// Adapters that ship the prompt over stdin (every other code agent
// today) don't declare `maxPromptArgBytes` and must skip the guard
// entirely — applying it to them would refuse perfectly valid huge
// prompts those CLIs handle just fine via stdin.
test('checkPromptArgvBudget is a no-op for adapters without maxPromptArgBytes', () => {
  assert.equal(claude.maxPromptArgBytes, undefined);
  const huge = 'x'.repeat(100_000);
  assert.equal(checkPromptArgvBudget(claude, huge), null);
});

// On Windows an npm-installed `deepseek` resolves to a `.cmd` shim and
// the spawn path wraps the call in `cmd.exe /d /s /c "<inner>"`, with
// every embedded `"` doubled by `quoteWindowsCommandArg`. A prompt that
// fits under the raw `maxPromptArgBytes` budget but is heavy on quote
// characters (code blocks, JSON-shaped skill seeds) can therefore still
// expand past CreateProcess's 32_767-char `lpCommandLine` cap — surfacing
// as a generic spawn ENAMETOOLONG instead of the actionable DeepSeek-
// named error the budget guard was meant to provide. The post-buildArgs
// check `checkWindowsCmdShimCommandLineBudget` computes the would-be
// command line length using the same quoting math the platform layer
// uses on Windows, so a quote-heavy prompt under the byte budget still
// fails with `AGENT_PROMPT_TOO_LARGE` before spawn.
test('checkWindowsCmdShimCommandLineBudget flags quote-heavy prompts that expand past CreateProcess limit', () => {
  // Prompt is *under* the raw byte budget, but ~entirely `"` chars so
  // cmd.exe's quote-doubling roughly doubles its command-line cost.
  const quoteHeavyPromptLength = deepseek.maxPromptArgBytes - 100;
  const quoteHeavyPrompt = '"'.repeat(quoteHeavyPromptLength);

  // Sanity: the raw-byte guard must let this through, otherwise the new
  // post-buildArgs check would never fire on a real run.
  assert.equal(
    checkPromptArgvBudget(deepseek, quoteHeavyPrompt),
    null,
    'quote-heavy prompt under the raw byte budget must pass the pre-buildArgs guard',
  );

  const args = deepseek.buildArgs(quoteHeavyPrompt, [], [], {});
  // Use a realistic npm-style Windows install path so the resolved-bin
  // contribution mirrors a real user's environment.
  const resolvedBin = 'C:\\Users\\Tester\\AppData\\Roaming\\npm\\deepseek.cmd';
  const flagged = checkWindowsCmdShimCommandLineBudget(
    deepseek,
    resolvedBin,
    args,
  );

  assert.ok(
    flagged,
    'quote-heavy prompt that doubles past the CreateProcess cap must trip the cmd-shim guard',
  );
  assert.equal(flagged.code, 'AGENT_PROMPT_TOO_LARGE');
  assert.ok(
    flagged.commandLineLength > flagged.limit,
    `commandLineLength (${flagged.commandLineLength}) must exceed limit (${flagged.limit})`,
  );
  assert.ok(
    flagged.limit < 32_768,
    'guard must keep its safe limit strictly under the documented Windows CreateProcess cap',
  );
  assert.match(flagged.message, /DeepSeek/);
  assert.match(flagged.message, /cmd\.exe quote-doubling/);
  assert.match(flagged.message, /stdin support/);
});

test('checkWindowsCmdShimCommandLineBudget lets ordinary prompts through .cmd resolutions', () => {
  // Same Windows-shim resolution path, but a plain prompt — well under
  // every limit. The guard must return null so the chat happy path
  // proceeds to spawn.
  const args = deepseek.buildArgs('write hello world', [], [], {});
  const resolvedBin = 'C:\\Users\\Tester\\AppData\\Roaming\\npm\\deepseek.cmd';
  assert.equal(
    checkWindowsCmdShimCommandLineBudget(deepseek, resolvedBin, args),
    null,
  );
});

test('checkWindowsCmdShimCommandLineBudget is a no-op for non-.cmd resolutions', () => {
  // POSIX hosts (and direct `.exe` resolutions on Windows) don't go
  // through the cmd.exe wrap, so the cmd-shim guard never fires on
  // those — `checkPromptArgvBudget` catches POSIX oversize argv, and
  // `checkWindowsDirectExeCommandLineBudget` catches direct-exe argv
  // expansion under libuv's quoting rules. Use a non-quote-heavy prompt
  // so this test stays focused on the `.cmd`/`.bat` path filter rather
  // than overlapping with the direct-exe guard's contract.
  const args = deepseek.buildArgs('x'.repeat(20_000), [], [], {});
  assert.equal(
    checkWindowsCmdShimCommandLineBudget(
      deepseek,
      '/usr/local/bin/deepseek',
      args,
    ),
    null,
  );
  assert.equal(
    checkWindowsCmdShimCommandLineBudget(
      deepseek,
      'C:\\Program Files\\DeepSeek\\deepseek.exe',
      args,
    ),
    null,
  );
});

// Security regression: cmd.exe runs percent-expansion on the inner line
// of `cmd /s /c "..."` regardless of quote state, so a `.cmd` shim spawn
// whose argv carries an attacker-influenced `%DEEPSEEK_API_KEY%` substring
// would otherwise let cmd substitute the daemon's env value into the
// prompt before the child ran. The cmd-shim quoting in agents.ts (which
// the budget guard uses to compute the projected line) must mirror the
// platform fix: each `%` is wrapped in `"^%"` so cmd's `^` escape makes
// the next `%` literal while `CommandLineToArgvW` concatenates the quote
// segments back into the original arg byte-for-byte. The budget math
// reflects the longer projected line; pinning the projection here means a
// regression that drops the `%` escape would surface as a budget mismatch
// (or, worse, as cmd silently expanding the env var on a real Windows
// run). Composes the prompt right at the cmd-shim limit so the guard's
// length math also has to add up.
test('checkWindowsCmdShimCommandLineBudget projects the %var% escape into the command line length', () => {
  // Carry exactly 200 `%DEEPSEEK_API_KEY%` references in the prompt; each
  // raw `%` (400 total) becomes `"^%"` (4 chars) in the projected line, so
  // a regression that drops the `%` escape shifts the projected length by
  // 1200 chars and breaks the budget math without obviously failing in
  // unrelated tests.
  const promptPiece = '%DEEPSEEK_API_KEY%';
  const prompt = promptPiece.repeat(200);

  // Pre-buildArgs guard: the raw prompt is well under DeepSeek's argv
  // budget, so this path must let it through.
  assert.equal(checkPromptArgvBudget(deepseek, prompt), null);

  const args = deepseek.buildArgs(prompt, [], [], {});
  const resolvedBin = 'C:\\Users\\Tester\\AppData\\Roaming\\npm\\deepseek.cmd';
  const flagged = checkWindowsCmdShimCommandLineBudget(
    deepseek,
    resolvedBin,
    args,
  );
  // The prompt is short enough that the cmd-shim budget should still pass —
  // the test isn't about an oversized prompt; it's about the *content* of
  // the projected line. A null result here means the escape is in place
  // and didn't push us past the limit.
  assert.equal(flagged, null);
});

test('checkWindowsCmdShimCommandLineBudget no-ops when resolvedBin is null or adapter has no budget', () => {
  // Bin resolution failed but the run continued long enough to reach
  // this guard — must be a no-op so the existing AGENT_UNAVAILABLE path
  // still fires from server.ts.
  assert.equal(checkWindowsCmdShimCommandLineBudget(deepseek, null, []), null);
  // Stdin-delivered adapters never declare `maxPromptArgBytes` — the
  // guard must skip them even when handed a `.cmd` path.
  assert.equal(
    checkWindowsCmdShimCommandLineBudget(claude, 'C:\\fake\\claude.cmd', []),
    null,
  );
});

// Companion to the cmd-shim guard for non-shim Windows installs (e.g. a
// cargo-built `deepseek.exe` rather than the npm `.cmd` shim). The
// cmd-shim guard early-returns on `.exe` paths because those skip the
// `cmd.exe /d /s /c` wrap, but Node/libuv still composes a
// CreateProcess `lpCommandLine` by walking each argv element through
// `quote_cmd_arg` — every embedded `"` becomes `\"`, backslashes
// adjacent to a quote get doubled. A quote-heavy prompt that fits under
// `maxPromptArgBytes` can therefore still expand past the 32_767-char
// kernel cap on a direct `.exe` spawn. The new guard recomputes the
// would-be command line using the exact libuv math so those users hit
// the same actionable `AGENT_PROMPT_TOO_LARGE` instead of a generic
// `spawn ENAMETOOLONG`.
test('checkWindowsDirectExeCommandLineBudget flags quote-heavy prompts on a direct .exe resolution', () => {
  // Prompt is *under* the raw byte budget, but ~entirely `"` chars so
  // libuv's `\"` escaping roughly doubles its command-line cost.
  const quoteHeavyPromptLength = deepseek.maxPromptArgBytes - 100;
  const quoteHeavyPrompt = '"'.repeat(quoteHeavyPromptLength);

  // Sanity: the raw-byte guard must let this through, otherwise the
  // post-buildArgs check would never fire on a real run.
  assert.equal(
    checkPromptArgvBudget(deepseek, quoteHeavyPrompt),
    null,
    'quote-heavy prompt under the raw byte budget must pass the pre-buildArgs guard',
  );

  const args = deepseek.buildArgs(quoteHeavyPrompt, [], [], {});
  // Realistic non-shim install: a cargo-built `.exe` under Program Files
  // (path has spaces so the resolved-bin contribution itself gets
  // wrapped in `"…"`, which mirrors what libuv would do on Windows).
  const resolvedBin = 'C:\\Program Files\\DeepSeek\\deepseek.exe';
  const flagged = checkWindowsDirectExeCommandLineBudget(
    deepseek,
    resolvedBin,
    args,
  );

  assert.ok(
    flagged,
    'quote-heavy prompt that expands past the CreateProcess cap on a direct .exe spawn must trip the guard',
  );
  assert.equal(flagged.code, 'AGENT_PROMPT_TOO_LARGE');
  assert.ok(
    flagged.commandLineLength > flagged.limit,
    `commandLineLength (${flagged.commandLineLength}) must exceed limit (${flagged.limit})`,
  );
  assert.ok(
    flagged.limit < 32_768,
    'guard must keep its safe limit strictly under the documented Windows CreateProcess cap',
  );
  assert.match(flagged.message, /DeepSeek/);
  assert.match(flagged.message, /libuv quote-escaping/);
  assert.match(flagged.message, /stdin support/);
});

test('checkWindowsDirectExeCommandLineBudget lets ordinary prompts through .exe resolutions', () => {
  // Non-shim `.exe` install with a plain prompt — well under every
  // limit. Guard must return null so the chat happy path proceeds to
  // spawn.
  const args = deepseek.buildArgs('write hello world', [], [], {});
  const resolvedBin = 'C:\\Program Files\\DeepSeek\\deepseek.exe';
  assert.equal(
    checkWindowsDirectExeCommandLineBudget(deepseek, resolvedBin, args),
    null,
  );
});

test('checkWindowsDirectExeCommandLineBudget no-ops on .cmd / .bat resolutions and POSIX paths', () => {
  // The cmd-shim guard owns `.bat` / `.cmd` — the direct-exe guard must
  // skip them so an oversized prompt on a `.cmd` install doesn't trip
  // both guards (and double-emit an SSE error).
  const args = deepseek.buildArgs(
    '"'.repeat(deepseek.maxPromptArgBytes - 100),
    [],
    [],
    {},
  );
  assert.equal(
    checkWindowsDirectExeCommandLineBudget(
      deepseek,
      'C:\\Users\\Tester\\AppData\\Roaming\\npm\\deepseek.cmd',
      args,
    ),
    null,
  );
  assert.equal(
    checkWindowsDirectExeCommandLineBudget(
      deepseek,
      'C:\\Users\\Tester\\AppData\\Roaming\\npm\\deepseek.bat',
      args,
    ),
    null,
  );
  // POSIX hosts never go through Windows' CreateProcess — `execvp`
  // accepts each argv buffer separately, so there's no command-line
  // concatenation to bust. The pre-buildArgs `checkPromptArgvBudget` is
  // the one responsible for catching oversized argv on those hosts.
  assert.equal(
    checkWindowsDirectExeCommandLineBudget(
      deepseek,
      '/usr/local/bin/deepseek',
      args,
    ),
    null,
  );
  assert.equal(
    checkWindowsDirectExeCommandLineBudget(
      deepseek,
      '/home/dev/.cargo/bin/deepseek',
      args,
    ),
    null,
  );
});

test('checkWindowsDirectExeCommandLineBudget no-ops when resolvedBin is null/empty or adapter has no budget', () => {
  // Bin resolution failed but the run continued long enough to reach
  // this guard — must be a no-op so the existing AGENT_UNAVAILABLE path
  // still fires from server.ts.
  assert.equal(
    checkWindowsDirectExeCommandLineBudget(deepseek, null, []),
    null,
  );
  assert.equal(checkWindowsDirectExeCommandLineBudget(deepseek, '', []), null);
  // Stdin-delivered adapters never declare `maxPromptArgBytes` — the
  // guard must skip them even when handed a Windows `.exe` path.
  assert.equal(
    checkWindowsDirectExeCommandLineBudget(claude, 'C:\\fake\\claude.exe', []),
    null,
  );
});

// The two post-buildArgs guards are deliberately exclusive: the
// cmd-shim guard owns `.cmd` / `.bat` (cmd.exe quote-doubling math),
// the direct-exe guard owns everything else on Windows (libuv
// quote-escaping math). For any single resolved bin, at most one
// should ever fire — otherwise an oversized prompt would emit two
// SSE error events back to back. Pin both branches with a quote-heavy
// prompt that's over the kernel cap under either quoting rule.
test('cmd-shim and direct-exe guards are mutually exclusive on a single resolution', () => {
  const quoteHeavy = '"'.repeat(deepseek.maxPromptArgBytes - 100);
  const args = deepseek.buildArgs(quoteHeavy, [], [], {});

  const cmdPath = 'C:\\Users\\Tester\\AppData\\Roaming\\npm\\deepseek.cmd';
  assert.ok(checkWindowsCmdShimCommandLineBudget(deepseek, cmdPath, args));
  assert.equal(
    checkWindowsDirectExeCommandLineBudget(deepseek, cmdPath, args),
    null,
  );

  const exePath = 'C:\\Program Files\\DeepSeek\\deepseek.exe';
  assert.equal(
    checkWindowsCmdShimCommandLineBudget(deepseek, exePath, args),
    null,
  );
  assert.ok(checkWindowsDirectExeCommandLineBudget(deepseek, exePath, args));
});

test('deepseek entry does not advertise deepseek-tui as a fallback bin', () => {
  // `deepseek` is the dispatcher that owns `exec` / `--auto`; `deepseek-tui`
  // is the runtime companion the dispatcher invokes. Upstream installs both
  // together (npm and cargo). A `deepseek-tui`-only host is not a supported
  // install, and `deepseek-tui` itself doesn't accept `exec --auto <prompt>`
  // — surfacing it via fallbackBins would advertise availability but make
  // the first /api/chat run fail. Pin the absence so the fallback can't
  // drift back without an accompanying buildArgs branch + test.
  assert.equal(
    Array.isArray(deepseek.fallbackBins) && deepseek.fallbackBins.length > 0,
    false,
    `deepseek must not declare fallbackBins until the deepseek-tui-only invocation is implemented and tested; got ${JSON.stringify(deepseek.fallbackBins)}`,
  );
});

test('vibe args use empty array for acp-json-rpc streaming', () => {
  const args = vibe.buildArgs('', [], [], {});

  assert.deepEqual(args, []);
  assert.equal(vibe.streamFormat, 'acp-json-rpc');
});

test('vibe fetchModels falls back to fallbackModels when detection fails', async () => {
  // fetchModels rejects when the binary doesn't exist; the daemon's
  // probe() catches this and uses fallbackModels instead.
  const result = await vibe
    .fetchModels('/nonexistent/vibe-acp')
    .catch(() => null);

  assert.equal(result, null);
  assert.ok(Array.isArray(vibe.fallbackModels));
  assert.equal(vibe.fallbackModels[0].id, 'default');
});

// Issue #398: Claude Code prefers ANTHROPIC_API_KEY over `claude login`
// credentials, silently billing API usage. Strip it for the claude
// adapter so the user's subscription wins.
test('spawnEnvForAgent strips ANTHROPIC_API_KEY for the claude adapter', () => {
  const env = spawnEnvForAgent('claude', {
    ANTHROPIC_API_KEY: 'sk-leak',
    PATH: '/usr/bin',
    OD_DAEMON_URL: 'http://127.0.0.1:7456',
  });

  assert.equal('ANTHROPIC_API_KEY' in env, false);
  assert.equal(env.PATH, '/usr/bin');
  assert.equal(env.OD_DAEMON_URL, 'http://127.0.0.1:7456');
});

test('spawnEnvForAgent applies configured Claude Code env before auth stripping', () => {
  const env = spawnEnvForAgent(
    'claude',
    {
      ANTHROPIC_API_KEY: 'sk-leak',
      PATH: '/usr/bin',
    },
    {
      CLAUDE_CONFIG_DIR: '/Users/test/.claude-2',
    },
  );

  assert.equal(env.CLAUDE_CONFIG_DIR, '/Users/test/.claude-2');
  assert.equal('ANTHROPIC_API_KEY' in env, false);
  assert.equal(env.PATH, '/usr/bin');
});

test('spawnEnvForAgent applies configured Codex env without mutating the base env', () => {
  const base = { PATH: '/usr/bin' };
  const env = spawnEnvForAgent('codex', base, {
    CODEX_HOME: '/Users/test/.codex-alt',
    CODEX_BIN: '/Users/test/bin/codex',
  });

  assert.equal(env.CODEX_HOME, '/Users/test/.codex-alt');
  assert.equal(env.CODEX_BIN, '/Users/test/bin/codex');
  assert.equal(env.PATH, '/usr/bin');
  assert.equal('CODEX_HOME' in base, false);
  assert.equal('CODEX_BIN' in base, false);
});

test('resolveAgentExecutable prefers a configured CODEX_BIN override over PATH resolution', () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-codex-bin-'));
  try {
    const configured = join(dir, 'codex-custom');
    writeFileSync(configured, '#!/bin/sh\nexit 0\n');
    chmodSync(configured, 0o755);
    process.env.PATH = '';
    process.env.OD_AGENT_HOME = dir;

    const resolved = resolveAgentExecutable(
      { id: 'codex', bin: 'codex' },
      { CODEX_BIN: configured },
    );

    assert.equal(resolved, configured);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('resolveAgentExecutable ignores relative CODEX_BIN overrides', () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-codex-bin-rel-'));
  const oldCwd = process.cwd();
  try {
    const configured = 'codex-custom';
    writeFileSync(join(dir, configured), '#!/bin/sh\nexit 0\n');
    chmodSync(join(dir, configured), 0o755);
    process.chdir(dir);
    process.env.PATH = '';
    process.env.OD_AGENT_HOME = dir;

    const resolved = resolveAgentExecutable(
      { id: 'codex', bin: 'codex' },
      { CODEX_BIN: configured },
    );

    assert.equal(resolved, null);
  } finally {
    process.chdir(oldCwd);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('detectAgents applies configured env while probing the CLI', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-agent-env-'));
  try {
    const bin = join(dir, process.platform === 'win32' ? 'claude.cmd' : 'claude');
    if (process.platform === 'win32') {
      writeFileSync(
        bin,
        '@echo off\r\nif "%~1"=="--version" (\r\n  echo %CLAUDE_CONFIG_DIR%\r\n  exit /b 0\r\n)\r\nif "%~1"=="-p" (\r\n  echo --add-dir --include-partial-messages\r\n  exit /b 0\r\n)\r\nexit /b 0\r\n',
      );
    } else {
      writeFileSync(
        bin,
        '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "$CLAUDE_CONFIG_DIR"; exit 0; fi\nif [ "$1" = "-p" ]; then echo "--add-dir --include-partial-messages"; exit 0; fi\nexit 0\n',
      );
      chmodSync(bin, 0o755);
    }
    process.env.PATH = dir;
    process.env.OD_AGENT_HOME = dir;

    const agents = await detectAgents({
      claude: { CLAUDE_CONFIG_DIR: '/tmp/claude-config-probe' },
    });

    const detected = agents.find((agent) => agent.id === 'claude');
    assert.equal(detected?.available, true);
    assert.equal(detected?.version, '/tmp/claude-config-probe');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Windows env-var names are case-insensitive at the kernel level, but
// spreading process.env into a plain object loses Node's case-insensitive
// accessor — a `Anthropic_Api_Key` key would survive a literal
// `delete env.ANTHROPIC_API_KEY` and still reach Claude Code on Windows.
test('spawnEnvForAgent strips ANTHROPIC_API_KEY case-insensitively for the claude adapter', () => {
  const env = spawnEnvForAgent('claude', {
    Anthropic_Api_Key: 'sk-mixed-case',
    anthropic_api_key: 'sk-lower-case',
    PATH: '/usr/bin',
  });

  const remaining = Object.keys(env).filter(
    (k) => k.toUpperCase() === 'ANTHROPIC_API_KEY',
  );
  assert.deepEqual(remaining, []);
  assert.equal(env.PATH, '/usr/bin');
});

test('spawnEnvForAgent preserves ANTHROPIC_API_KEY for non-claude adapters', () => {
  for (const agentId of ['codex', 'gemini', 'opencode', 'devin']) {
    const env = spawnEnvForAgent(agentId, {
      ANTHROPIC_API_KEY: 'sk-keep',
      PATH: '/usr/bin',
    });
    assert.equal(
      env.ANTHROPIC_API_KEY,
      'sk-keep',
      `expected ${agentId} to preserve ANTHROPIC_API_KEY`,
    );
  }
});

test('spawnEnvForAgent preserves ANTHROPIC_API_KEY when ANTHROPIC_BASE_URL is set', () => {
  const env = spawnEnvForAgent('claude', {
    ANTHROPIC_API_KEY: 'sk-kimi',
    ANTHROPIC_BASE_URL: 'https://api.moonshot.cn/v1',
    PATH: '/usr/bin',
  });

  assert.equal(env.ANTHROPIC_API_KEY, 'sk-kimi');
  assert.equal(env.ANTHROPIC_BASE_URL, 'https://api.moonshot.cn/v1');
  assert.equal(env.PATH, '/usr/bin');
});

test('spawnEnvForAgent strips ANTHROPIC_API_KEY when ANTHROPIC_BASE_URL is empty', () => {
  const env = spawnEnvForAgent('claude', {
    ANTHROPIC_API_KEY: 'sk-leak',
    ANTHROPIC_BASE_URL: '',
    PATH: '/usr/bin',
  });

  assert.equal('ANTHROPIC_API_KEY' in env, false);
  assert.equal(env.PATH, '/usr/bin');
});

test('spawnEnvForAgent strips ANTHROPIC_API_KEY when ANTHROPIC_BASE_URL is whitespace', () => {
  const env = spawnEnvForAgent('claude', {
    ANTHROPIC_API_KEY: 'sk-leak',
    ANTHROPIC_BASE_URL: '   ',
    PATH: '/usr/bin',
  });

  assert.equal('ANTHROPIC_API_KEY' in env, false);
  assert.equal(env.PATH, '/usr/bin');
});

test('spawnEnvForAgent does not mutate the input env', () => {
  const original = { ANTHROPIC_API_KEY: 'sk-leak', PATH: '/usr/bin' };
  const env = spawnEnvForAgent('claude', original);

  assert.equal(original.ANTHROPIC_API_KEY, 'sk-leak');
  assert.notEqual(env, original);
});
