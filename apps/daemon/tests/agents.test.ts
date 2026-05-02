// @ts-nocheck
import { afterEach, test } from 'vitest';
import assert from 'node:assert/strict';
import { AGENT_DEFS } from '../src/agents.js';

const codex = AGENT_DEFS.find((agent) => agent.id === 'codex');
const cursorAgent = AGENT_DEFS.find((agent) => agent.id === 'cursor-agent');
const kiro = AGENT_DEFS.find((agent) => agent.id === 'kiro');
const claude = AGENT_DEFS.find((agent) => agent.id === 'claude');
const originalDisablePlugins = process.env.OD_CODEX_DISABLE_PLUGINS;

afterEach(() => {
  if (originalDisablePlugins == null) {
    delete process.env.OD_CODEX_DISABLE_PLUGINS;
  } else {
    process.env.OD_CODEX_DISABLE_PLUGINS = originalDisablePlugins;
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
  assert.equal(args.at(-1), '-');
});

test('codex args keep plugins enabled when OD_CODEX_DISABLE_PLUGINS is unset', () => {
  delete process.env.OD_CODEX_DISABLE_PLUGINS;

  const args = codex.buildArgs('', [], [], {}, { cwd: '/tmp/od-project' });

  assert.equal(args.includes('--disable'), false);
  assert.equal(args.includes('plugins'), false);
  assert.equal(args.at(-1), '-');
});

test('codex args keep plugins enabled when OD_CODEX_DISABLE_PLUGINS is not 1', () => {
  process.env.OD_CODEX_DISABLE_PLUGINS = 'true';

  const args = codex.buildArgs('', [], [], {}, { cwd: '/tmp/od-project' });

  assert.equal(args.includes('--disable'), false);
  assert.equal(args.includes('plugins'), false);
  assert.equal(args.at(-1), '-');
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

test('kiro args use acp subcommand for json-rpc streaming', () => {
  const args = kiro.buildArgs('', [], [], {});

  assert.deepEqual(args, ['acp']);
  assert.equal(kiro.streamFormat, 'acp-json-rpc');
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
