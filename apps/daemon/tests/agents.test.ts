// @ts-nocheck
import { afterEach, test } from 'vitest';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AGENT_DEFS,
  resolveAgentExecutable,
  spawnEnvForAgent,
} from '../src/agents.js';

const codex = AGENT_DEFS.find((agent) => agent.id === 'codex');
const copilot = AGENT_DEFS.find((agent) => agent.id === 'copilot');
const cursorAgent = AGENT_DEFS.find((agent) => agent.id === 'cursor-agent');
const kiro = AGENT_DEFS.find((agent) => agent.id === 'kiro');
const vibe = AGENT_DEFS.find((agent) => agent.id === 'vibe');
const claude = AGENT_DEFS.find((agent) => agent.id === 'claude');
const devin = AGENT_DEFS.find((agent) => agent.id === 'devin');
const gemini = AGENT_DEFS.find((agent) => agent.id === 'gemini');
const originalDisablePlugins = process.env.OD_CODEX_DISABLE_PLUGINS;
const originalPath = process.env.PATH;
const originalHome = process.env.HOME;
const originalAgentHome = process.env.OD_AGENT_HOME;

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
});

test('codex args disable plugins when OD_CODEX_DISABLE_PLUGINS is 1', () => {
  process.env.OD_CODEX_DISABLE_PLUGINS = '1';

  const args = codex.buildArgs('', [], [], {}, { cwd: '/tmp/od-project' });

  assert.deepEqual(args.slice(0, 8), [
    'exec',
    '--json',
    '--skip-git-repo-check',
    '--full-auto',
    '-c',
    'sandbox_workspace_write.network_access=true',
    '--disable',
    'plugins',
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

  const withModel = codex.buildArgs('', [], [], { model: 'gpt-5-codex' }, { cwd: '/tmp/od-project' });
  assert.equal(withModel.includes('-'), false);

  const withReasoning = codex.buildArgs('', [], [], { reasoning: 'high' }, { cwd: '/tmp/od-project' });
  assert.equal(withReasoning.includes('-'), false);

  process.env.OD_CODEX_DISABLE_PLUGINS = '1';
  const withDisablePlugins = codex.buildArgs('', [], [], {}, { cwd: '/tmp/od-project' });
  assert.equal(withDisablePlugins.includes('-'), false);
});

test('cursor-agent args deliver prompts via stdin without passing a literal dash prompt', () => {
  const args = cursorAgent.buildArgs('', [], [], {}, { cwd: '/tmp/od-project' });

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

// `-p -` puts Copilot in prompt mode and tells it to read the body from
// stdin. Without this pair the daemon writes the prompt to the child's
// stdin pipe (because `promptViaStdin: true`) but Copilot stays
// interactive, ignores stdin, and rejects the run with
// `error: too many arguments. Expected 0 arguments but got N`. Pin the
// pair as the leading argv elements so the regression in #350 can't
// drift back. Also pin the order — Copilot expects `-p` before any other
// flag, including model / add-dir extensions.
test('copilot args lead with `-p -` so the stdin prompt is actually consumed (regression of #350)', () => {
  const baseArgs = copilot.buildArgs('', [], [], {});
  assert.equal(baseArgs[0], '-p');
  assert.equal(baseArgs[1], '-');
  assert.deepEqual(baseArgs, [
    '-p',
    '-',
    '--allow-all-tools',
    '--output-format',
    'json',
  ]);
});

test('copilot args keep `-p -` at the front when model and extra dirs are added', () => {
  const args = copilot.buildArgs(
    '',
    [],
    ['/tmp/od-skills', '/tmp/od-design-systems'],
    { model: 'claude-sonnet-4.6' },
  );
  assert.equal(args[0], '-p');
  assert.equal(args[1], '-');
  assert.deepEqual(args, [
    '-p',
    '-',
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

test('copilot drops empty / non-string entries from extraAllowedDirs without breaking the `-p -` lead', () => {
  const args = copilot.buildArgs('', [], ['', null, '/tmp/od-skills', undefined], {});
  assert.equal(args[0], '-p');
  assert.equal(args[1], '-');
  // Only the one valid path survives.
  const addDirIndex = args.indexOf('--add-dir');
  assert.equal(args[addDirIndex + 1], '/tmp/od-skills');
  assert.equal(args.filter((a) => a === '--add-dir').length, 1);
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

test('kiro fetchModels falls back to fallbackModels when detection fails', async () => {
  // fetchModels rejects when the binary doesn't exist; the daemon's
  // probe() catches this and uses fallbackModels instead.
  const result = await kiro.fetchModels('/nonexistent/kiro-cli').catch(() => null);

  assert.equal(result, null);
  assert.ok(Array.isArray(kiro.fallbackModels));
  assert.equal(kiro.fallbackModels[0].id, 'default');
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
    [undefined,            'minimal', 'low'],
    ['default',            'minimal', 'low'],
    ['gpt-5.2',            'minimal', 'low'],
    ['gpt-5.3',            'minimal', 'low'],
    ['gpt-5.4',            'minimal', 'low'],
    ['gpt-5.5',            'minimal', 'low'],
    ['gpt-5.5',            'low',     'low'],
    ['gpt-5.5',            'medium',  'medium'],
    ['gpt-5.5',            'high',    'high'],
    ['vendor/gpt-5.5-foo', 'minimal', 'low'],     // path-style id
    // gpt-5.1: xhigh isn't supported, others pass through.
    ['gpt-5.1',            'xhigh',   'high'],
    ['gpt-5.1',            'high',    'high'],
    // gpt-5.1-codex-mini: caps at medium / high only.
    ['gpt-5.1-codex-mini', 'minimal', 'medium'],
    ['gpt-5.1-codex-mini', 'low',     'medium'],
    ['gpt-5.1-codex-mini', 'medium',  'medium'],
    ['gpt-5.1-codex-mini', 'high',    'high'],
    ['gpt-5.1-codex-mini', 'xhigh',   'high'],
    // Unknown / future families: pass through; let the API surface its error
    // as the signal a new rule belongs in clampCodexReasoning.
    ['gpt-6',              'minimal', 'minimal'],
  ];
  for (const [model, reasoning, expected] of cases) {
    const args = codex.buildArgs('', [], [], { model, reasoning }, { cwd: '/tmp/od-project' });
    assert.ok(
      args.includes(`model_reasoning_effort="${expected}"`),
      `(model=${model ?? '<none>'}, reasoning=${reasoning}) → expected ${expected}; args=${JSON.stringify(args)}`,
    );
  }
});

test('codex buildArgs omits model_reasoning_effort when reasoning is "default"', () => {
  const args = codex.buildArgs('', [], [], { reasoning: 'default' }, { cwd: '/tmp/od-project' });

  assert.equal(
    args.some((a) => typeof a === 'string' && a.startsWith('model_reasoning_effort=')),
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
  const args = claude.buildArgs(longPrompt, [], [], {}, { cwd: '/tmp/od-project' });

  assert.ok(Array.isArray(args), 'claude.buildArgs must return argv');
  assert.equal(args.includes(longPrompt), false, 'prompt must not appear in argv');
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

fsTest('resolveAgentExecutable prefers def.bin over fallbackBins when bin is on PATH', () => {
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
});

fsTest('resolveAgentExecutable falls back through fallbackBins when def.bin is missing', () => {
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
});

fsTest('resolveAgentExecutable returns null when neither def.bin nor any fallback is on PATH', () => {
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
});

fsTest('resolveAgentExecutable searches mise node bins when PATH is minimal', () => {
  const home = mkdtempSync(join(tmpdir(), 'od-agents-home-'));
  try {
    const dir = join(home, '.local', 'share', 'mise', 'installs', 'node', '24.14.1', 'bin');
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
});

fsTest('resolveAgentExecutable still resolves agents without a fallbackBins field', () => {
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
});

test('vibe args use empty array for acp-json-rpc streaming', () => {
  const args = vibe.buildArgs('', [], [], {});

  assert.deepEqual(args, []);
  assert.equal(vibe.streamFormat, 'acp-json-rpc');
});

test('vibe fetchModels falls back to fallbackModels when detection fails', async () => {
  // fetchModels rejects when the binary doesn't exist; the daemon's
  // probe() catches this and uses fallbackModels instead.
  const result = await vibe.fetchModels('/nonexistent/vibe-acp').catch(() => null);

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

test('spawnEnvForAgent does not mutate the input env', () => {
  const original = { ANTHROPIC_API_KEY: 'sk-leak', PATH: '/usr/bin' };
  const env = spawnEnvForAgent('claude', original);

  assert.equal(original.ANTHROPIC_API_KEY, 'sk-leak');
  assert.notEqual(env, original);
});
