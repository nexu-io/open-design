import { test } from 'vitest';
import {
  AGENT_DEFS, assert, chmodSync, codex, detectAgents, join, mkdtempSync, rmSync, tmpdir, withEnvSnapshot, withPlatform, writeFileSync,
} from './helpers/test-helpers.js';

test('AGENT_DEFS ids are unique', () => {
  const ids = AGENT_DEFS.map((a) => a.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  assert.deepEqual(dupes, [], `duplicate agent ids: ${JSON.stringify(dupes)}`);
});

test('codex args disable plugins when OD_CODEX_DISABLE_PLUGINS is 1', () => {
  process.env.OD_CODEX_DISABLE_PLUGINS = '1';

  withPlatform('darwin', () => {
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
});

test('codex args use workspace-write sandbox on macOS and Linux', () => {
  delete process.env.OD_CODEX_DISABLE_PLUGINS;

  for (const platform of ['darwin', 'linux'] as const) {
    withPlatform(platform, () => {
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
  }
});

test('codex args use danger-full-access sandbox on Windows because workspace-write blocks PowerShell', () => {
  // Codex CLI's workspace-write sandbox mode on Windows lacks a working
  // OS-level sandbox and falls back to a policy that rejects shell
  // invocations such as powershell.exe with "blocked by policy".
  // The agent cannot list files or run any shell-backed tool under that
  // policy. danger-full-access is Codex CLI's documented Windows-compatible
  // mode (issue #1721).
  delete process.env.OD_CODEX_DISABLE_PLUGINS;

  withPlatform('win32', () => {
    const args = codex.buildArgs('', [], [], {}, { cwd: '/tmp/od-project' });

    assert.deepEqual(args.slice(0, 5), [
      'exec',
      '--json',
      '--skip-git-repo-check',
      '--sandbox',
      'danger-full-access',
    ]);
    // The workspace-write-scoped network override is meaningless under
    // danger-full-access and must not appear on Windows.
    assert.equal(args.includes('workspace-write'), false);
    assert.equal(
      args.includes('sandbox_workspace_write.network_access=true'),
      false,
    );
  });
});

test('codex args keep plugins enabled when OD_CODEX_DISABLE_PLUGINS is unset', () => {
  delete process.env.OD_CODEX_DISABLE_PLUGINS;

  withPlatform('darwin', () => {
    const args = codex.buildArgs('', [], [], {}, { cwd: '/tmp/od-project' });

    assert.equal(args.includes('--disable'), false);
    assert.equal(args.includes('plugins'), false);
  });
});

test('codex args keep plugins enabled when OD_CODEX_DISABLE_PLUGINS is not 1', () => {
  process.env.OD_CODEX_DISABLE_PLUGINS = 'true';

  withPlatform('darwin', () => {
    const args = codex.buildArgs('', [], [], {}, { cwd: '/tmp/od-project' });

    assert.equal(args.includes('--disable'), false);
    assert.equal(args.includes('plugins'), false);
  });
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
    await withEnvSnapshot(['PATH', 'OD_AGENT_HOME'], async () => {
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
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('codex parses live model catalog from debug models JSON', () => {
  assert.ok(codex.listModels, 'codex must define live model discovery');
  const parsed = codex.listModels.parse(JSON.stringify({
    models: [
      {
        slug: 'gpt-6-codex',
        display_name: 'GPT-6 Codex',
        visibility: 'list',
      },
      {
        slug: 'gpt-6-codex-mini',
        display_name: 'GPT-6 Codex Mini',
        visibility: 'list',
      },
      {
        slug: 'gpt-hidden-internal',
        display_name: 'Hidden internal',
        visibility: 'hidden',
      },
    ],
  }));

  assert.deepEqual(parsed, [
    { id: 'default', label: 'Default (CLI config)' },
    { id: 'gpt-6-codex', label: 'GPT-6 Codex' },
    { id: 'gpt-6-codex-mini', label: 'GPT-6 Codex Mini' },
  ]);
});

test('codex detection surfaces live debug models separately from fallback models', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-agents-codex-live-models-'));
  try {
    await withEnvSnapshot(['PATH', 'OD_AGENT_HOME'], async () => {
      const codexBin = join(dir, 'codex');
      writeFileSync(
        codexBin,
        `#!/bin/sh
if [ "$1" = "--version" ]; then echo "codex-cli 9.9.9"; exit 0; fi
if [ "$1" = "debug" ] && [ "$2" = "models" ]; then
  printf '%s\\n' '{"models":[{"slug":"gpt-6-codex","display_name":"GPT-6 Codex","visibility":"list"}]}'
  exit 0
fi
exit 2
`,
      );
      chmodSync(codexBin, 0o755);
      process.env.OD_AGENT_HOME = dir;
      process.env.PATH = dir;

      const agents = await detectAgents();
      const detected = agents.find((agent) => agent.id === 'codex');

      assert.ok(detected);
      assert.equal(detected.available, true);
      assert.equal(detected.modelsSource, 'live');
      assert.deepEqual(detected.models.map((m: { id: string }) => m.id), [
        'default',
        'gpt-6-codex',
      ]);
    });
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
