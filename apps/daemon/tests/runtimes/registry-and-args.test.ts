import { test } from 'vitest';
import {
  AGENT_DEFS, amp, assert, chmodSync, claude, codex, cursorAgent, detectAgents, grokBuild, join, mkdirSync, mkdtempSync, rmSync, tmpdir, withEnvSnapshot, withPlatform, writeFileSync,
} from './helpers/test-helpers.js';
import { codexNeedsDangerFullAccessSandbox } from '../../src/runtimes/defs/codex.js';
import {
  clearRememberedLiveModels,
  getRememberedLiveModels,
  isKnownServiceTier,
  rememberLiveModels,
} from '../../src/runtimes/models.js';
import { readLocalAgentProfileDefs } from '../../src/runtimes/registry.js';

interface CliFixtureResponse {
  args: string[];
  stdout?: string;
  exitCode?: number;
}

function writeCliFixture(
  dir: string,
  name: string,
  responses: CliFixtureResponse[],
  defaultExitCode = 0,
): string {
  const scriptPath = join(dir, `${name}-fixture.cjs`);
  writeFileSync(
    scriptPath,
    `const responses = ${JSON.stringify(responses)};\n`
      + 'const args = process.argv.slice(2);\n'
      + 'const response = responses.find((candidate) => candidate.args.length === args.length && candidate.args.every((value, index) => value === args[index]));\n'
      + `if (!response) process.exit(${defaultExitCode});\n`
      + "if (response.stdout) process.stdout.write(response.stdout.endsWith('\\n') ? response.stdout : `${response.stdout}\\n`);\n"
      + 'process.exit(response.exitCode ?? 0);\n',
  );
  const launcherPath = join(dir, process.platform === 'win32' ? `${name}.cmd` : name);
  if (process.platform === 'win32') {
    writeFileSync(
      launcherPath,
      `@echo off\r\n"${process.execPath}" "${scriptPath}" %*\r\nexit /b %ERRORLEVEL%\r\n`,
    );
  } else {
    writeFileSync(
      launcherPath,
      `#!/bin/sh\nexec "${process.execPath}" "${scriptPath}" "$@"\n`,
    );
    chmodSync(launcherPath, 0o755);
  }
  return launcherPath;
}

function writeEnvSensitiveCodexFixture(
  dir: string,
  signalEnvKey: string,
  genericModel: string,
  strictModel: string,
): string {
  const scriptPath = join(dir, 'codex-env-catalog-fixture.cjs');
  writeFileSync(
    scriptPath,
    `const args = process.argv.slice(2);\n`
      + `if (args.includes('--version')) { console.log('codex-cli 9.9.9'); process.exit(0); }\n`
      + `if (args[0] === 'login' && args[1] === 'status') { console.log('Logged in using ChatGPT'); process.exit(0); }\n`
      + `if (args[0] === 'debug' && args[1] === 'models') {\n`
      + `  const slug = process.env[${JSON.stringify(signalEnvKey)}] ? ${JSON.stringify(genericModel)} : ${JSON.stringify(strictModel)};\n`
      + `  console.log(JSON.stringify({ models: [{ slug, display_name: slug, visibility: 'list', supported_reasoning_levels: [{ effort: 'future-deep' }] }] }));\n`
      + `  process.exit(0);\n`
      + `}\n`
      + `process.exit(0);\n`,
  );
  const launcherPath = join(dir, process.platform === 'win32' ? 'codex.cmd' : 'codex');
  if (process.platform === 'win32') {
    writeFileSync(
      launcherPath,
      `@echo off\r\n"${process.execPath}" "${scriptPath}" %*\r\nexit /b %ERRORLEVEL%\r\n`,
    );
  } else {
    writeFileSync(
      launcherPath,
      `#!/bin/sh\nexec "${process.execPath}" "${scriptPath}" "$@"\n`,
    );
    chmodSync(launcherPath, 0o755);
  }
  return launcherPath;
}

test('AGENT_DEFS ids are unique', () => {
  const ids = AGENT_DEFS.map((a) => a.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  assert.deepEqual(dupes, [], `duplicate agent ids: ${JSON.stringify(dupes)}`);
});

test('local agent profiles inherit a base adapter and can pin the default model', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-local-agent-profiles-'));
  try {
    await withEnvSnapshot(['OD_AGENT_PROFILES_CONFIG'], async () => {
      const config = join(dir, 'agents.local.json');
      writeFileSync(
        config,
        JSON.stringify({
          agents: [
            {
              id: 'zcode',
              name: 'ZCode',
              baseAgent: 'claude',
              bin: 'zcode',
              args: ['run'],
              defaultModel: 'zyb-claude',
              models: [
                { id: 'zyb-claude', label: 'zyb-claude' },
                { id: 'zyb-gpt', label: 'zyb-gpt' },
              ],
              env: {
                ZCODE_ROUTE: 'design',
                RETRIES: 2,
                'BAD-NAME': 'ignored',
              },
            },
          ],
        }),
      );
      process.env.OD_AGENT_PROFILES_CONFIG = config;

      const profiles = readLocalAgentProfileDefs();
      assert.equal(profiles.length, 1);
      const [profile] = profiles;
      assert.ok(profile);
      assert.equal(profile.id, 'zcode');
      assert.equal(profile.name, 'ZCode');
      assert.equal(profile.bin, 'zcode');
      assert.equal(profile.promptViaStdin, true);
      assert.equal(profile.streamFormat, 'claude-stream-json');
      assert.deepEqual(profile.fallbackModels.map((model) => model.id), [
        'default',
        'zyb-claude',
        'zyb-gpt',
      ]);
      assert.deepEqual(profile.env, {
        ZCODE_ROUTE: 'design',
        RETRIES: '2',
      });
      assert.equal(profile.authProbe, undefined);

      const defaultArgs = profile.buildArgs('', [], [], {});
      assert.deepEqual(defaultArgs.slice(0, 2), ['run', '-p']);
      assert.ok(defaultArgs.includes('--model'));
      assert.equal(defaultArgs[defaultArgs.indexOf('--model') + 1], 'zyb-claude');

      const explicitArgs = profile.buildArgs('', [], [], { model: 'zyb-gpt' });
      assert.equal(explicitArgs[explicitArgs.indexOf('--model') + 1], 'zyb-gpt');
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('local agent profiles skip explicit unknown baseAgent without falling back', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-local-agent-profiles-invalid-'));
  try {
    await withEnvSnapshot(['OD_AGENT_PROFILES_CONFIG'], async () => {
      const config = join(dir, 'agents.local.json');
      writeFileSync(
        config,
        JSON.stringify({
          agents: [
            { id: 'claude', bin: 'duplicate' },
            { id: 'bad id with spaces', bin: 'bad' },
            { id: 'unknown-base', baseAgent: 'does-not-exist', bin: 'bad' },
            { id: 'ok-wrapper', bin: 'ok-wrapper' },
          ],
        }),
      );
      process.env.OD_AGENT_PROFILES_CONFIG = config;

      const profiles = readLocalAgentProfileDefs();

      assert.deepEqual(profiles.map((profile) => profile.id), ['ok-wrapper']);
      assert.equal(profiles[0]?.bin, 'ok-wrapper');
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('sandbox mode ignores implicit and host explicit local agent profiles', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-local-agent-profiles-sandbox-'));
  try {
    await withEnvSnapshot(['OD_AGENT_PROFILES_CONFIG', 'OD_SANDBOX_MODE', 'OD_DATA_DIR'], async () => {
      const config = join(dir, 'agents.local.json');
      writeFileSync(
        config,
        JSON.stringify({
          agents: [{ id: 'explicit-wrapper', bin: 'explicit-wrapper' }],
        }),
      );

      process.env.OD_SANDBOX_MODE = '1';
      delete process.env.OD_DATA_DIR;
      delete process.env.OD_AGENT_PROFILES_CONFIG;
      assert.deepEqual(readLocalAgentProfileDefs(), []);

      process.env.OD_AGENT_PROFILES_CONFIG = config;
      assert.deepEqual(readLocalAgentProfileDefs(), []);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('codex args disable plugins when OD_CODEX_DISABLE_PLUGINS is 1', () => {
  withEnvSnapshot(['OD_CODEX_DISABLE_PLUGINS', 'OD_CODEX_SANDBOX'], () => {
    process.env.OD_CODEX_DISABLE_PLUGINS = '1';
    delete process.env.OD_CODEX_SANDBOX;

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
});

test('codex args disable plugins for an externally attributed Local Codex run', () => {
  withEnvSnapshot(['OD_CODEX_DISABLE_PLUGINS', 'OD_CODEX_SANDBOX'], () => {
    delete process.env.OD_CODEX_DISABLE_PLUGINS;
    delete process.env.OD_CODEX_SANDBOX;

    withPlatform('darwin', () => {
      const args = codex.buildArgs('', [], [], {}, {
        cwd: '/tmp/od-project',
        disablePlugins: true,
      });

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
});

test('codex args use workspace-write sandbox on macOS and Linux', () => {
  withEnvSnapshot(['OD_CODEX_DISABLE_PLUGINS', 'OD_CODEX_SANDBOX', 'WSL_DISTRO_NAME'], () => {
    delete process.env.OD_CODEX_DISABLE_PLUGINS;
    delete process.env.OD_CODEX_SANDBOX;

    for (const platform of ['darwin', 'linux'] as const) {
      withPlatform(platform, () => {
        delete process.env.WSL_DISTRO_NAME;
        const args = codex.buildArgs('', [], [], {}, { cwd: '/tmp/od-project' });
        assert.equal(args.includes('--full-auto'), false);
        assert.deepEqual(args.slice(0, 5), [
          'exec',
          '--json',
          '--skip-git-repo-check',
          '--sandbox',
          'workspace-write',
        ]);
        assert.equal(
          args.includes('-c'),
          true,
        );
        assert.equal(args.some((arg) => arg.includes('default_permissions')), false);
      });
    }
  });
});

test('codex args use danger-full-access sandbox on WSL because workspace-write stays read-only', () => {
  withPlatform('linux', () => {
    withEnvSnapshot(['OD_CODEX_DISABLE_PLUGINS', 'OD_CODEX_SANDBOX', 'WSL_DISTRO_NAME'], () => {
      delete process.env.OD_CODEX_DISABLE_PLUGINS;
      delete process.env.OD_CODEX_SANDBOX;
      process.env.WSL_DISTRO_NAME = 'Ubuntu';
      assert.equal(codexNeedsDangerFullAccessSandbox('linux', process.env), true);
      const args = codex.buildArgs('', [], [], {}, { cwd: '/tmp/od-project' });
      assert.deepEqual(args.slice(0, 5), [
        'exec',
        '--json',
        '--skip-git-repo-check',
        '--sandbox',
        'danger-full-access',
      ]);
      assert.equal(args.some((arg) => arg.includes('default_permissions')), false);
    });
  });
});

test('codex args allow OD_CODEX_SANDBOX danger-full-access override on Linux', () => {
  withPlatform('linux', () => {
    withEnvSnapshot(['OD_CODEX_DISABLE_PLUGINS', 'OD_CODEX_SANDBOX', 'WSL_DISTRO_NAME'], () => {
      delete process.env.OD_CODEX_DISABLE_PLUGINS;
      process.env.OD_CODEX_SANDBOX = 'danger-full-access';
      delete process.env.WSL_DISTRO_NAME;

      assert.equal(codexNeedsDangerFullAccessSandbox('linux', process.env), true);
      const args = codex.buildArgs('', [], [], {}, { cwd: '/tmp/od-project' });
      assert.deepEqual(args.slice(0, 5), [
        'exec',
        '--json',
        '--skip-git-repo-check',
        '--sandbox',
        'danger-full-access',
      ]);
      assert.equal(
        args.includes('sandbox_workspace_write.network_access=true'),
        false,
      );
    });
  });
});

test('codex args ignore unknown OD_CODEX_SANDBOX values', () => {
  withPlatform('linux', () => {
    withEnvSnapshot(['OD_CODEX_DISABLE_PLUGINS', 'OD_CODEX_SANDBOX', 'WSL_DISTRO_NAME'], () => {
      delete process.env.OD_CODEX_DISABLE_PLUGINS;
      process.env.OD_CODEX_SANDBOX = 'workspace-write';
      delete process.env.WSL_DISTRO_NAME;

      assert.equal(codexNeedsDangerFullAccessSandbox('linux', process.env), false);
      const args = codex.buildArgs('', [], [], {}, { cwd: '/tmp/od-project' });
      assert.deepEqual(args.slice(0, 5), [
        'exec',
        '--json',
        '--skip-git-repo-check',
        '--sandbox',
        'workspace-write',
      ]);
    });
  });
});

test('codex args use danger-full-access sandbox on Windows because workspace-write blocks PowerShell', () => {
  // Codex CLI's workspace-write sandbox mode on Windows lacks a working
  // OS-level sandbox and falls back to a policy that rejects shell
  // invocations such as powershell.exe with "blocked by policy".
  // The agent cannot list files or run any shell-backed tool under that
  // policy. danger-full-access is Codex CLI's documented Windows-compatible
  // mode (issue #1721).
  withEnvSnapshot(['OD_CODEX_DISABLE_PLUGINS', 'OD_CODEX_SANDBOX'], () => {
    delete process.env.OD_CODEX_DISABLE_PLUGINS;
    delete process.env.OD_CODEX_SANDBOX;

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
      assert.equal(args.some((arg) => arg.includes('default_permissions')), false);
    });
  });
});

test('codex args keep plugins enabled when OD_CODEX_DISABLE_PLUGINS is unset', () => {
  withEnvSnapshot(['OD_CODEX_DISABLE_PLUGINS', 'OD_CODEX_SANDBOX'], () => {
    delete process.env.OD_CODEX_DISABLE_PLUGINS;
    delete process.env.OD_CODEX_SANDBOX;

    withPlatform('darwin', () => {
      const args = codex.buildArgs('', [], [], {}, { cwd: '/tmp/od-project' });

      assert.equal(args.includes('--disable'), false);
      assert.equal(args.includes('plugins'), false);
    });
  });
});

test('codex args keep plugins enabled when OD_CODEX_DISABLE_PLUGINS is not 1', () => {
  withEnvSnapshot(['OD_CODEX_DISABLE_PLUGINS', 'OD_CODEX_SANDBOX'], () => {
    process.env.OD_CODEX_DISABLE_PLUGINS = 'true';
    delete process.env.OD_CODEX_SANDBOX;

    withPlatform('darwin', () => {
      const args = codex.buildArgs('', [], [], {}, { cwd: '/tmp/od-project' });

      assert.equal(args.includes('--disable'), false);
      assert.equal(args.includes('plugins'), false);
    });
  });
});

test('codex model picker includes current OpenAI choices in priority order', async () => {
  const expectedModels = [
    'default',
    'gpt-5.6-sol',
    'gpt-5.6-terra',
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
  assert.deepEqual(
    codex.fallbackModels.find((m) => m.id === 'gpt-5.5')?.serviceTierOptions,
    [{ id: 'fast', label: 'Fast' }],
  );
  assert.ok(codex.reasoningOptions, 'codex must define reasoningOptions');
  assert.deepEqual(codex.reasoningOptions.map((o) => o.id), [
    'default',
    'none',
    'minimal',
    'low',
    'medium',
    'high',
    'xhigh',
    'max',
    'ultra',
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

  const futureArgs = codex.buildArgs(
    '',
    [],
    [],
    { model: 'gpt-future', reasoning: 'future-deep' },
    { cwd: '/tmp/od-project' },
  );
  assert.ok(futureArgs.includes('gpt-future'));
  assert.ok(futureArgs.includes('model_reasoning_effort="future-deep"'));

  const fastArgs = codex.buildArgs(
    '',
    [],
    [],
    { model: 'gpt-5.5', serviceTier: 'fast' },
    { cwd: '/tmp/od-project' },
  );
  assert.ok(fastArgs.includes('service_tier="fast"'));

  const dir = mkdtempSync(join(tmpdir(), 'od-agents-codex-models-'));
  try {
    await withEnvSnapshot(['PATH', 'OD_AGENT_HOME', 'CODEX_BIN'], async () => {
      const codexBin = writeCliFixture(dir, 'codex', [
        { args: ['--version'], stdout: 'codex 1.0.0' },
      ]);
      process.env.OD_AGENT_HOME = dir;
      process.env.PATH = dir;
      process.env.CODEX_BIN = codexBin;

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

test('codex derives service tiers from live speed tiers when service_tiers is absent', () => {
  assert.ok(codex.listModels, 'codex must define live model discovery');
  const parsed = codex.listModels.parse(JSON.stringify({
    models: [
      {
        slug: 'gpt-5.5',
        display_name: 'GPT 5.5',
        visibility: 'list',
        additional_speed_tiers: ['fast'],
        supported_reasoning_levels: [
          { effort: 'low' },
          { effort: 'xhigh' },
        ],
      },
    ],
  }));

  assert.deepEqual(parsed, [
    { id: 'default', label: 'Default (CLI config)' },
    {
      id: 'gpt-5.5',
      label: 'GPT 5.5',
      additionalSpeedTiers: ['fast'],
      serviceTierOptions: [{ id: 'fast', label: 'Fast' }],
      supportedReasoningLevels: ['low', 'xhigh'],
    },
  ]);
});

test('codex preserves explicit live service tiers from debug models JSON', () => {
  assert.ok(codex.listModels, 'codex must define live model discovery');
  const parsed = codex.listModels.parse(JSON.stringify({
    models: [
      {
        slug: 'gpt-6-codex',
        display_name: 'GPT-6 Codex',
        visibility: 'list',
        service_tiers: [
          { id: 'priority', name: 'Fast' },
          { id: 'standard', name: 'Standard' },
        ],
      },
    ],
  }));

  assert.deepEqual(parsed, [
    { id: 'default', label: 'Default (CLI config)' },
    {
      id: 'gpt-6-codex',
      label: 'GPT-6 Codex',
      serviceTierOptions: [
        { id: 'priority', label: 'Fast' },
        { id: 'standard', label: 'Standard' },
      ],
    },
  ]);
});

test('codex live model metadata does not inherit an unreported static service tier', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-agents-codex-live-tier-'));
  try {
    await withEnvSnapshot(['PATH', 'OD_AGENT_HOME', 'CODEX_BIN'], async () => {
      const codexBin = writeCliFixture(dir, 'codex', [
        { args: ['--version'], stdout: 'codex-cli 9.9.9' },
        {
          args: ['debug', 'models'],
          stdout: '{"models":[{"slug":"gpt-5.5","display_name":"GPT 5.5","visibility":"list"}]}',
        },
        { args: ['login', 'status'], stdout: 'Logged in using ChatGPT' },
      ], 2);
      process.env.OD_AGENT_HOME = dir;
      process.env.PATH = dir;
      process.env.CODEX_BIN = codexBin;

      const agents = await detectAgents();
      const detected = agents.find((agent) => agent.id === 'codex');
      const model = detected?.models.find((m: { id: string }) => m.id === 'gpt-5.5');

      assert.equal(model?.serviceTierOptions, undefined);
      assert.equal(isKnownServiceTier(codex, 'gpt-5.5', 'fast'), false);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('claude probes auth status so rescans reflect CLI auth changes', async () => {
  assert.deepEqual(claude.authProbe, {
    args: ['auth', 'status'],
    timeoutMs: 5000,
  });

  const dir = mkdtempSync(join(tmpdir(), 'od-agents-claude-auth-'));
  try {
    await withEnvSnapshot(['PATH', 'OD_AGENT_HOME', 'CLAUDE_BIN'], async () => {
      const claudeBin = writeCliFixture(dir, 'claude', [
        { args: ['--version'], stdout: '2.1.168 (Claude Code)' },
        { args: ['-p', '--help'], stdout: '--include-partial-messages --add-dir' },
        { args: ['auth', 'status'], stdout: '{"authenticated":true,"source":"claude.ai"}' },
      ]);
      process.env.OD_AGENT_HOME = dir;
      process.env.PATH = dir;
      process.env.CLAUDE_BIN = claudeBin;

      const agents = await detectAgents();
      const detected = agents.find((agent) => agent.id === 'claude');

      assert.ok(detected);
      assert.equal(detected.available, true);
      assert.equal(detected.authStatus, 'ok');
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('claude API key env satisfies auth probe without requiring local login', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-agents-claude-api-key-auth-'));
  try {
    await withEnvSnapshot(['PATH', 'OD_AGENT_HOME', 'CLAUDE_BIN', 'ANTHROPIC_API_KEY'], async () => {
      const claudeBin = writeCliFixture(dir, 'claude', [
        { args: ['--version'], stdout: '2.1.168 (Claude Code)' },
        { args: ['-p', '--help'], stdout: '--include-partial-messages --add-dir' },
        { args: ['auth', 'status'], stdout: '{"authenticated":false}', exitCode: 1 },
      ]);
      process.env.OD_AGENT_HOME = dir;
      process.env.PATH = dir;
      process.env.ANTHROPIC_API_KEY = 'sk-anthropic';
      process.env.CLAUDE_BIN = claudeBin;

      const agents = await detectAgents();
      const detected = agents.find((agent) => agent.id === 'claude');

      assert.ok(detected);
      assert.equal(detected.available, true);
      assert.equal(detected.authStatus, 'ok');
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('codex probes login status so rescans reflect CLI auth changes', async () => {
  assert.deepEqual(codex.authProbe, {
    args: ['login', 'status'],
    timeoutMs: 5000,
  });

  const dir = mkdtempSync(join(tmpdir(), 'od-agents-codex-auth-'));
  try {
    await withEnvSnapshot(['PATH', 'OD_AGENT_HOME', 'CODEX_BIN'], async () => {
      const codexBin = writeCliFixture(dir, 'codex', [
        { args: ['--version'], stdout: 'codex-cli 9.9.9' },
        { args: ['login', 'status'], stdout: 'Logged in using ChatGPT' },
      ]);
      process.env.OD_AGENT_HOME = dir;
      process.env.PATH = dir;
      process.env.CODEX_BIN = codexBin;

      const agents = await detectAgents();
      const detected = agents.find((agent) => agent.id === 'codex');

      assert.ok(detected);
      assert.equal(detected.available, true);
      assert.equal(detected.authStatus, 'ok');
      assert.equal(detected.chatgptAuthStatus, 'ok');
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('codex API key env satisfies generic auth but not the official ChatGPT route', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-agents-codex-api-key-auth-'));
  try {
    await withEnvSnapshot(['PATH', 'OD_AGENT_HOME', 'CODEX_BIN', 'CODEX_API_KEY'], async () => {
      const codexBin = writeCliFixture(dir, 'codex', [
        { args: ['--version'], stdout: 'codex-cli 9.9.9' },
        { args: ['debug', 'models'], stdout: '{"models":[]}' },
        { args: ['login', 'status'], stdout: 'Not logged in', exitCode: 1 },
      ]);
      process.env.OD_AGENT_HOME = dir;
      process.env.PATH = dir;
      process.env.CODEX_API_KEY = 'sk-codex';
      process.env.CODEX_BIN = codexBin;

      const agents = await detectAgents();
      const detected = agents.find((agent) => agent.id === 'codex');

      assert.ok(detected);
      assert.equal(detected.available, true);
      assert.equal(detected.authStatus, 'ok');
      assert.equal(detected.chatgptAuthStatus, 'missing');
      assert.equal(detected.chatgptReady, false);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('codex detection keeps generic and ChatGPT-strict live catalogs isolated', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-agents-codex-scoped-models-'));
  const codexHome = join(dir, 'codex-home');
  try {
    mkdirSync(codexHome, { recursive: true });
    await withEnvSnapshot(['PATH', 'OD_AGENT_HOME', 'CODEX_BIN'], async () => {
      const codexBin = writeEnvSensitiveCodexFixture(
        dir,
        'CODEX_API_KEY',
        'provider-only-model',
        'chatgpt-only-model',
      );
      process.env.OD_AGENT_HOME = dir;
      process.env.PATH = dir;
      process.env.CODEX_BIN = codexBin;
      rememberLiveModels(
        'codex',
        [{ id: 'stale-chatgpt-model', label: 'Stale ChatGPT model' }],
        'chatgpt',
      );

      const agents = await detectAgents({
        codex: {
          CODEX_HOME: codexHome,
          CODEX_API_KEY: 'generic-provider-key',
        },
      });
      const detected = agents.find((agent) => agent.id === 'codex') as any;

      assert.deepEqual(detected.models.map((model: { id: string }) => model.id), [
        'default',
        'provider-only-model',
      ]);
      assert.deepEqual(
        detected.chatgptModels.map((model: { id: string }) => model.id),
        ['default', 'chatgpt-only-model'],
      );
      assert.equal(detected.chatgptModelsSource, 'live');
      assert.equal(detected.chatgptReady, true);
      assert.deepEqual(
        getRememberedLiveModels('codex').map((model) => model.id),
        ['default', 'provider-only-model'],
      );
      assert.deepEqual(
        getRememberedLiveModels('codex', 'chatgpt').map((model) => model.id),
        ['default', 'chatgpt-only-model'],
      );
    });
  } finally {
    clearRememberedLiveModels('codex');
    clearRememberedLiveModels('codex', 'chatgpt');
    rmSync(dir, { recursive: true, force: true });
  }
});

test('codex detection does not mark a selected custom provider ready for ChatGPT runs', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-agents-codex-custom-provider-'));
  const codexHome = join(dir, 'codex-home');
  try {
    mkdirSync(codexHome, { recursive: true });
    writeFileSync(
      join(codexHome, 'config.toml'),
      [
        'model_provider = "local-gateway"',
        '',
        '[model_providers.local-gateway]',
        'base_url = "https://example.invalid/v1"',
        'env_key = "LOCAL_PROVIDER_KEY"',
        '',
      ].join('\n'),
    );
    await withEnvSnapshot(['PATH', 'OD_AGENT_HOME', 'CODEX_BIN'], async () => {
      const codexBin = writeEnvSensitiveCodexFixture(
        dir,
        'LOCAL_PROVIDER_KEY',
        'provider-only-model',
        'must-not-be-surfaced',
      );
      process.env.OD_AGENT_HOME = dir;
      process.env.PATH = dir;
      process.env.CODEX_BIN = codexBin;
      rememberLiveModels(
        'codex',
        [{ id: 'stale-chatgpt-model', label: 'Stale ChatGPT model' }],
        'chatgpt',
      );

      const agents = await detectAgents({
        codex: {
          CODEX_HOME: codexHome,
          LOCAL_PROVIDER_KEY: 'generic-provider-key',
        },
      });
      const detected = agents.find((agent) => agent.id === 'codex') as any;

      assert.equal(detected.authStatus, 'ok');
      assert.deepEqual(detected.models.map((model: { id: string }) => model.id), [
        'default',
        'provider-only-model',
      ]);
      assert.equal(detected.chatgptAuthStatus, 'ok');
      assert.deepEqual(detected.chatgptModels, []);
      assert.equal(detected.chatgptModelsSource, 'unavailable');
      assert.equal(detected.chatgptReady, false);
      assert.match(detected.chatgptReadyMessage, /custom providers/i);
      assert.deepEqual(getRememberedLiveModels('codex', 'chatgpt'), []);
    });
  } finally {
    clearRememberedLiveModels('codex');
    clearRememberedLiveModels('codex', 'chatgpt');
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

test('codex derives service tiers from live speed tiers when service_tiers is absent', () => {
  assert.ok(codex.listModels, 'codex must define live model discovery');
  const parsed = codex.listModels.parse(JSON.stringify({
    models: [
      {
        slug: 'gpt-5.5',
        display_name: 'GPT-5.5',
        visibility: 'list',
        additional_speed_tiers: ['fast'],
      },
    ],
  }));

  assert.deepEqual(parsed, [
    { id: 'default', label: 'Default (CLI config)' },
    {
      id: 'gpt-5.5',
      label: 'GPT-5.5',
      additionalSpeedTiers: ['fast'],
      serviceTierOptions: [{ id: 'fast', label: 'Fast' }],
    },
  ]);
});

test('codex preserves explicit live service tiers from debug models JSON', () => {
  assert.ok(codex.listModels, 'codex must define live model discovery');
  const parsed = codex.listModels.parse(JSON.stringify({
    models: [
      {
        slug: 'gpt-6-codex',
        display_name: 'GPT-6 Codex',
        visibility: 'list',
        service_tiers: [
          { id: 'priority', name: 'Fast' },
          { id: 'standard', name: 'Standard' },
        ],
      },
    ],
  }));

  assert.deepEqual(parsed, [
    { id: 'default', label: 'Default (CLI config)' },
    {
      id: 'gpt-6-codex',
      label: 'GPT-6 Codex',
      serviceTierOptions: [
        { id: 'priority', label: 'Fast' },
        { id: 'standard', label: 'Standard' },
      ],
    },
  ]);
});

test('codex preserves service tier labels from bare-array debug models JSON', () => {
  assert.ok(codex.listModels, 'codex must define live model discovery');
  const parsed = codex.listModels.parse(JSON.stringify([
    {
      slug: 'gpt-5.5',
      display_name: 'GPT-5.5',
      visibility: 'list',
      service_tiers: [{ id: 'priority', label: 'Fast' }],
    },
  ]));

  assert.deepEqual(parsed, [
    { id: 'default', label: 'Default (CLI config)' },
    {
      id: 'gpt-5.5',
      label: 'GPT-5.5',
      serviceTierOptions: [{ id: 'priority', label: 'Fast' }],
    },
  ]);
});

test('codex detection surfaces live debug models separately from fallback models', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-agents-codex-live-models-'));
  try {
    await withEnvSnapshot(['PATH', 'OD_AGENT_HOME', 'CODEX_BIN'], async () => {
      const codexBin = writeCliFixture(dir, 'codex', [
        { args: ['--version'], stdout: 'codex-cli 9.9.9' },
        {
          args: ['debug', 'models'],
          stdout: '{"models":[{"slug":"gpt-6-codex","display_name":"GPT-6 Codex","visibility":"list"}]}',
        },
        { args: ['login', 'status'], stdout: 'Logged in using ChatGPT' },
      ], 2);
      process.env.OD_AGENT_HOME = dir;
      process.env.PATH = dir;
      process.env.CODEX_BIN = codexBin;

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

test('codex detection does not invent missing live GPT-5.5 compatibility metadata', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-agents-codex-sparse-live-models-'));
  try {
    await withEnvSnapshot(['PATH', 'OD_AGENT_HOME', 'CODEX_BIN'], async () => {
      const codexBin = writeCliFixture(dir, 'codex', [
        { args: ['--version'], stdout: 'codex-cli 9.9.9' },
        {
          args: ['debug', 'models'],
          stdout: '{"models":[{"slug":"gpt-5.5","display_name":"GPT-5.5","visibility":"list"}]}',
        },
      ], 2);
      process.env.OD_AGENT_HOME = dir;
      process.env.PATH = dir;
      process.env.CODEX_BIN = codexBin;

      const agents = await detectAgents();
      const detected = agents.find((agent) => agent.id === 'codex');
      const gpt55 = detected?.models.find((model) => model.id === 'gpt-5.5');

      assert.ok(detected);
      assert.equal(detected.available, true);
      assert.equal(detected.modelsSource, 'live');
      assert.deepEqual(gpt55, {
        id: 'gpt-5.5',
        label: 'GPT-5.5',
      });
      assert.equal(isKnownServiceTier(codex, 'gpt-5.5', 'fast'), false);
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

test('cursor-agent parses live model ids separately from display labels', () => {
  assert.ok(cursorAgent.listModels, 'cursor-agent must define live model discovery');
  const parsed = cursorAgent.listModels.parse([
    'Available models',
    'auto - Auto',
    'composer-2.5 - Composer 2.5 (current)',
    'grok-4.3 - Grok 4.3 1M',
  ].join('\n'));

  assert.deepEqual(parsed, [
    { id: 'default', label: 'Default (CLI config)' },
    { id: 'auto', label: 'Auto' },
    { id: 'composer-2.5', label: 'Composer 2.5 (current)' },
    { id: 'grok-4.3', label: 'Grok 4.3 1M' },
  ]);
});

test('grok-build filters login headers from live model discovery output', () => {
  assert.ok(grokBuild.listModels, 'grok-build must define live model discovery');
  const parsed = grokBuild.listModels.parse([
    'You are logged in with grok.com.',
    '',
    'Default model: grok-build',
    '',
    'Available models:',
    '',
    '- grok-composer-2.5-fast',
    '* grok-build (default)',
  ].join('\n'));

  assert.deepEqual(parsed, [
    { id: 'default', label: 'Default (CLI config)' },
    { id: 'grok-composer-2.5-fast', label: 'grok-composer-2.5-fast' },
    { id: 'grok-build', label: 'grok-build' },
  ]);
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

test('amp uses headless execute mode with the Claude-compatible stream parser', () => {
  assert.equal(amp.streamFormat, 'claude-stream-json');
  assert.equal(amp.promptViaStdin, true);
  // Plain-text stdin (default): the daemon writes the composed prompt and
  // closes stdin for a clean one-shot turn. We must NOT opt into
  // stream-json input mode (that keeps stdin open for tool_result loops).
  assert.notEqual(amp.promptInputFormat, 'stream-json');
  assert.equal(amp.supportsCustomModel, false);

  const base = amp.buildArgs('', [], [], {});
  assert.deepEqual(base, ['-x', '--stream-json', '--dangerously-allow-all']);

  // The synthetic 'default' model must not leak a flag.
  const def = amp.buildArgs('', [], [], { model: 'default' });
  assert.equal(def.includes('--mode'), false);

  // A known mode maps onto Amp's `--mode`.
  const smart = amp.buildArgs('', [], [], { model: 'smart' });
  assert.deepEqual(smart, ['-x', '--stream-json', '--dangerously-allow-all', '--mode', 'smart']);

  // An unknown model id is ignored rather than passed as a bogus mode.
  const bogus = amp.buildArgs('', [], [], { model: 'gpt-5' });
  assert.equal(bogus.includes('--mode'), false);
});
