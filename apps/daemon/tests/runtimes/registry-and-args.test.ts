import { test } from 'vitest';
import {
  AGENT_DEFS, assert, chmodSync, codex, detectAgents, join, mkdtempSync, rmSync, tmpdir, writeFileSync,
} from './helpers/test-helpers.js';

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

test('codex model picker includes current OpenAI choices in priority order', async () => {
  const expectedModels = [
    'default',
    'gpt-5.5',
    'gpt-5.4',
    'gpt-5.4-mini',
    'gpt-5.3-codex',
    'gpt-5.1',
    'gpt-5.1-codex-mini',
    'gpt-5-codex',
    'gpt-5',
    'o3',
    'o4-mini',
  ];

  assert.deepEqual(codex.fallbackModels.map((m) => m.id), expectedModels);
  assert.ok(codex.reasoningOptions, 'codex must define reasoningOptions');
  assert.deepEqual(codex.reasoningOptions.map((o) => o.id), [
    'default',
    'none',
    'minimal',
    'low',
    'medium',
    'high',
    'xhigh',
  ]);

  const args = codex.buildArgs(
    '',
    [],
    [],
    { model: 'gpt-5.5', reasoning: 'xhigh' },
    { cwd: '/tmp/od-project' },
  );
  assert.ok(args.includes('--model'));
  assert.ok(args.includes('gpt-5.5'));
  assert.ok(args.includes('model_reasoning_effort="xhigh"'));

  const dir = mkdtempSync(join(tmpdir(), 'od-agents-codex-models-'));
  try {
    const codexBin = join(dir, 'codex');
    writeFileSync(
      codexBin,
      '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "codex 1.0.0"; exit 0; fi\nexit 0\n',
    );
    chmodSync(codexBin, 0o755);
    process.env.OD_AGENT_HOME = dir;
    process.env.PATH = dir;

    const agents = await detectAgents();
    const detected = agents.find((agent) => agent.id === 'codex');

    assert.ok(detected);
    assert.equal(detected.available, true);
    assert.equal(detected.version, 'codex 1.0.0');
    assert.deepEqual(detected.models.map((m: { id: string }) => m.id), expectedModels);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('codex picker includes gpt-5.1 model family', () => {
  const pickerModels = new Set(codex.fallbackModels.map((model) => model.id));

  assert.equal(pickerModels.has('gpt-5.1'), true);
  assert.equal(pickerModels.has('gpt-5.1-codex-mini'), true);
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
    ['/repo/skills', '', null, '/tmp/codex/generated_images', undefined] as unknown as string[],
    {},
    { cwd: '/tmp/od-project' },
  );

  assert.deepEqual(
    args.filter((arg, index) => arg === '--add-dir' || args[index - 1] === '--add-dir'),
    ['--add-dir', '/repo/skills', '--add-dir', '/tmp/codex/generated_images'],
  );
});
