import { symlinkSync } from 'node:fs';
import { test, vi } from 'vitest';
import { homedir } from 'node:os';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as platform from '@open-design/platform';
import {
  assert, chmodSync, detectAgents, inspectAgentExecutableResolution, join, minimalAgentDef, mkdirSync, mkdtempSync, opencode, resolveAgentExecutable, rmSync, spawnEnvForAgent, tmpdir, withEnvSnapshot, withPlatform, writeFileSync,
} from './helpers/test-helpers.js';
import { isCursorAuthFailureText } from '../../src/runtimes/auth.js';

const fsTest = process.platform === 'win32' ? test.skip : test;
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

// Issue #398: Claude Code prefers Anthropic API credentials over `claude login`
// credentials, silently billing API usage. Strip them for the claude
// adapter so the user's subscription wins.
test('spawnEnvForAgent strips Anthropic API credentials for the claude adapter', () => {
  const env = spawnEnvForAgent('claude', {
    ANTHROPIC_API_KEY: 'sk-leak',
    ANTHROPIC_AUTH_TOKEN: 'sk-token-leak',
    PATH: '/usr/bin',
    OD_DAEMON_URL: 'http://127.0.0.1:7456',
  });

  assert.equal('ANTHROPIC_API_KEY' in env, false);
  assert.equal('ANTHROPIC_AUTH_TOKEN' in env, false);
  assert.equal(env.PATH, '/usr/bin');
  assert.equal(env.OD_DAEMON_URL, 'http://127.0.0.1:7456');
});

test('spawnEnvForAgent applies configured Claude Code env before auth stripping', () => {
  const env = spawnEnvForAgent(
    'claude',
    {
      ANTHROPIC_API_KEY: 'sk-leak',
      ANTHROPIC_AUTH_TOKEN: 'sk-token-leak',
      PATH: '/usr/bin',
    },
    {
      CLAUDE_CONFIG_DIR: '/Users/test/.claude-2',
    },
  );

  assert.equal(env.CLAUDE_CONFIG_DIR, '/Users/test/.claude-2');
  assert.equal('ANTHROPIC_API_KEY' in env, false);
  assert.equal('ANTHROPIC_AUTH_TOKEN' in env, false);
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

test('spawnEnvForAgent reapplies sandbox state roots after configured env overrides', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'od-agent-env-sandbox-'));
  try {
    const codexEnv = spawnEnvForAgent(
      'codex',
      {
        OD_DATA_DIR: dataDir,
        OD_SANDBOX_MODE: '1',
        PATH: '/usr/bin',
      },
      {
        CODEX_HOME: '/Users/test/.codex-host',
      },
    );
    assert.equal(
      codexEnv.CODEX_HOME,
      join(dataDir, 'sandbox', 'agent-home', '.codex'),
    );
    assert.equal(codexEnv.HOME, join(dataDir, 'sandbox', 'agent-home'));

    const claudeEnv = spawnEnvForAgent(
      'claude',
      {
        OD_DATA_DIR: dataDir,
        OD_SANDBOX_MODE: '1',
        PATH: '/usr/bin',
      },
      {
        CLAUDE_CONFIG_DIR: '/Users/test/.claude-host',
      },
    );
    assert.equal(
      claudeEnv.CLAUDE_CONFIG_DIR,
      join(dataDir, 'sandbox', 'config', 'claude'),
    );

    const amrEnv = spawnEnvForAgent(
      'amr',
      {
        OD_DATA_DIR: dataDir,
        OD_SANDBOX_MODE: '1',
        PATH: '/usr/bin',
      },
      {
        OPENCODE_TEST_HOME: '/Users/test/.opencode-host',
      },
    );
    assert.equal(
      amrEnv.OPENCODE_TEST_HOME,
      join(dataDir, 'sandbox', 'agent-home', '.opencode'),
    );
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('spawnEnvForAgent keeps sandbox roots pinned to the base OD_DATA_DIR', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'od-agent-env-sandbox-base-'));
  try {
    const env = spawnEnvForAgent(
      'codex',
      {
        OD_DATA_DIR: dataDir,
        OD_SANDBOX_MODE: '1',
        PATH: '/usr/bin',
      },
      {
        CODEX_HOME: '/Users/test/.codex-host',
        OD_DATA_DIR: '/host/path/.od',
      },
    );

    assert.equal(env.OD_DATA_DIR, dataDir);
    assert.equal(env.CODEX_HOME, join(dataDir, 'sandbox', 'agent-home', '.codex'));
    assert.equal(env.HOME, join(dataDir, 'sandbox', 'agent-home'));
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('spawnEnvForAgent resolves relative OD_DATA_DIR before applying sandbox roots', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'od-agent-env-sandbox-relative-'));
  try {
    const relativeDataDir = relative(repoRoot, dataDir);
    const env = spawnEnvForAgent(
      'codex',
      {
        OD_DATA_DIR: relativeDataDir,
        OD_SANDBOX_MODE: '1',
        PATH: '/usr/bin',
      },
      {
        CODEX_HOME: '/Users/test/.codex-host',
      },
    );

    assert.equal(
      env.CODEX_HOME,
      join(dataDir, 'sandbox', 'agent-home', '.codex'),
    );
    assert.equal(env.CLAUDE_CONFIG_DIR, join(dataDir, 'sandbox', 'config', 'claude'));
    assert.equal(env.HOME, join(dataDir, 'sandbox', 'agent-home'));
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('spawnEnvForAgent applies system proxy env to all agent runtimes before base env overrides', () => {
  const env = spawnEnvForAgent(
    'gemini',
    {
      HTTPS_PROXY: 'http://user-env:9000',
      PATH: '/usr/bin',
    },
    {},
    {
      HTTP_PROXY: 'http://system-http:7890',
      HTTPS_PROXY: 'http://system-https:7891',
      ALL_PROXY: 'socks5://system-socks:1080',
      NO_PROXY: '.local,localhost',
      NODE_USE_ENV_PROXY: '1',
    },
  );

  assert.equal(env.HTTP_PROXY, 'http://system-http:7890');
  assert.equal(env.HTTPS_PROXY, 'http://user-env:9000');
  assert.equal(env.ALL_PROXY, 'socks5://system-socks:1080');
  assert.equal(env.NO_PROXY, '.local,localhost');
  assert.equal(env.NODE_USE_ENV_PROXY, '1');
  assert.equal(env.PATH, '/usr/bin');
});

test('spawnEnvForAgent resolves system proxy env for each default agent launch', () => {
  const proxySpy = vi.spyOn(platform, 'resolveSystemProxyEnv').mockReturnValue({
    HTTPS_PROXY: 'http://system-https:7891',
    NODE_USE_ENV_PROXY: '1',
  });

  try {
    const env = spawnEnvForAgent('gemini', { PATH: '/usr/bin' });

    assert.deepEqual(proxySpy.mock.calls, [[]]);
    assert.equal(env.HTTPS_PROXY, 'http://system-https:7891');
    assert.equal(env.PATH, '/usr/bin');
  } finally {
    proxySpy.mockRestore();
  }
});

test('spawnEnvForAgent lets explicit lowercase proxy env override system uppercase proxy env', () => {
  const env = spawnEnvForAgent(
    'gemini',
    {
      https_proxy: 'http://user-lowercase:9000',
      PATH: '/usr/bin',
    },
    {},
    {
      HTTPS_PROXY: 'http://system-uppercase:7891',
      NODE_USE_ENV_PROXY: '1',
    },
  );

  assert.equal(env.HTTPS_PROXY, 'http://user-lowercase:9000');
  if (process.platform !== 'win32') {
    assert.equal(env.https_proxy, 'http://user-lowercase:9000');
  }
});

test('spawnEnvForAgent enables Node env proxy support for inherited lowercase proxy env', () => {
  const env = spawnEnvForAgent(
    'gemini',
    {
      http_proxy: 'http://user-lowercase:9000',
      PATH: '/usr/bin',
    },
    {},
    {},
  );

  assert.equal(env.HTTP_PROXY, 'http://user-lowercase:9000');
  assert.equal(env.NODE_USE_ENV_PROXY, '1');
  if (process.platform !== 'win32') {
    assert.equal(env.http_proxy, 'http://user-lowercase:9000');
  }
});

test('spawnEnvForAgent expands configured env home paths', () => {
  const env = spawnEnvForAgent('codex', { PATH: '/usr/bin' }, {
    CODEX_HOME: '~/.codex-alt',
    CODEX_CACHE: '~',
  });

  assert.equal(env.CODEX_HOME, join(homedir(), '.codex-alt'));
  assert.equal(env.CODEX_CACHE, homedir());
  assert.equal(env.PATH, '/usr/bin');
});

test('spawnEnvForAgent injects the resolved AMR profile after configured env', () => {
  const env = spawnEnvForAgent(
    'amr',
    {
      OPEN_DESIGN_AMR_PROFILE: 'test',
      VELA_PROFILE: 'prod',
      PATH: '/usr/bin',
    },
    {
      VELA_PROFILE: 'local',
    },
  );

  assert.equal(env.VELA_PROFILE, 'test');
  assert.equal(env.OPEN_DESIGN_AMR_PROFILE, 'test');
  assert.equal(env.PATH, '/usr/bin');
});

test('spawnEnvForAgent gives AMR a stable OpenCode home under OD_DATA_DIR', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'od-amr-data-'));
  try {
    const env = spawnEnvForAgent('amr', {
      OD_DATA_DIR: dataDir,
      PATH: '/usr/bin',
    });

    assert.equal(
      env.OPENCODE_TEST_HOME,
      join(dataDir, 'amr', 'opencode-home'),
    );
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('spawnEnvForAgent preserves a configured AMR OpenCode home override', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'od-amr-data-'));
  try {
    const configuredHome = join(dataDir, 'custom-opencode-home');
    const env = spawnEnvForAgent(
      'amr',
      {
        OD_DATA_DIR: dataDir,
        PATH: '/usr/bin',
      },
      {
        OPENCODE_TEST_HOME: configuredHome,
      },
    );

    assert.equal(env.OPENCODE_TEST_HOME, configuredHome);
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});

fsTest('spawnEnvForAgent gives AMR a discovered OpenCode binary under a minimal child PATH', () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-amr-opencode-home-'));
  try {
    return withEnvSnapshot(['PATH', 'OD_AGENT_HOME'], () => {
      const opencodeBinDir = join(dir, '.opencode', 'bin');
      const opencodeBin = join(opencodeBinDir, 'opencode');
      mkdirSync(opencodeBinDir, { recursive: true });
      writeFileSync(opencodeBin, '#!/bin/sh\nexit 0\n');
      chmodSync(opencodeBin, 0o755);
      process.env.PATH = '/usr/bin';
      process.env.OD_AGENT_HOME = dir;

      const env = spawnEnvForAgent('amr', { PATH: '/usr/bin' });

      assert.equal(env.PATH, '/usr/bin');
      assert.equal(env.VELA_OPENCODE_BIN, opencodeBin);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('resolveAgentExecutable prefers a configured CODEX_BIN override over PATH resolution', () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-codex-bin-'));
  try {
    return withEnvSnapshot(['PATH', 'OD_AGENT_HOME'], () => {
      const configured = join(dir, 'codex-custom');
      writeFileSync(configured, '#!/bin/sh\nexit 0\n');
      chmodSync(configured, 0o755);
      process.env.PATH = '';
      process.env.OD_AGENT_HOME = dir;

      const resolved = resolveAgentExecutable(
        minimalAgentDef({ id: 'codex', bin: 'codex' }),
        { CODEX_BIN: configured },
      );

      assert.equal(resolved, configured);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('inspectAgentExecutableResolution reports configured and PATH Codex binaries separately', () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-codex-bin-inspect-'));
  try {
    return withEnvSnapshot(['PATH', 'OD_AGENT_HOME'], () => {
      const configured = join(dir, 'codex-custom');
      const fallback = join(dir, 'codex');
      writeFileSync(configured, '#!/bin/sh\nexit 0\n');
      writeFileSync(fallback, '#!/bin/sh\nexit 0\n');
      chmodSync(configured, 0o755);
      chmodSync(fallback, 0o755);
      process.env.PATH = dir;
      process.env.OD_AGENT_HOME = dir;

      const resolution = inspectAgentExecutableResolution(
        minimalAgentDef({ id: 'codex', bin: 'codex' }),
        { CODEX_BIN: configured },
      );

      assert.deepEqual(resolution, {
        configuredOverridePath: configured,
        pathResolvedPath: fallback,
        selectedPath: configured,
      });
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('resolveAgentExecutable supports configured binary overrides for non-Codex adapters', () => {
  const cases: Array<[string, string, string]> = [
    ['claude', 'claude', 'CLAUDE_BIN'],
    ['gemini', 'gemini', 'GEMINI_BIN'],
    ['opencode', 'opencode', 'OPENCODE_BIN'],
    ['cursor-agent', 'cursor-agent', 'CURSOR_AGENT_BIN'],
    ['qwen', 'qwen', 'QWEN_BIN'],
    ['qoder', 'qodercli', 'QODER_BIN'],
    ['copilot', 'copilot', 'COPILOT_BIN'],
    ['deepseek', 'deepseek', 'DEEPSEEK_BIN'],
    ['trae-cli', 'traecli', 'TRAE_CLI_BIN'],
    ['aider', 'aider', 'AIDER_BIN'],
  ];
  const dir = mkdtempSync(join(tmpdir(), 'od-agent-bin-overrides-'));
  try {
    return withEnvSnapshot(['PATH', 'OD_AGENT_HOME'], () => {
      process.env.PATH = '';
      process.env.OD_AGENT_HOME = dir;

      for (const [id, binName, envKey] of cases) {
        const configured = join(dir, `${binName}-custom`);
        writeFileSync(configured, '#!/bin/sh\nexit 0\n');
        chmodSync(configured, 0o755);

        const resolved = resolveAgentExecutable(
          minimalAgentDef({ id, bin: binName }),
          { [envKey]: configured },
        );

        assert.equal(resolved, configured, `expected ${id} to use ${envKey}`);
      }
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('resolveAgentExecutable prefers opencode-cli before desktop opencode fallback', () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-opencode-cli-'));
  try {
    return withEnvSnapshot(['PATH', 'OD_AGENT_HOME'], () => {
      const cli = join(dir, 'opencode-cli');
      const desktop = join(dir, 'opencode');
      writeFileSync(cli, '#!/bin/sh\nexit 0\n');
      writeFileSync(desktop, '#!/bin/sh\nexit 0\n');
      chmodSync(cli, 0o755);
      chmodSync(desktop, 0o755);
      process.env.PATH = dir;
      process.env.OD_AGENT_HOME = dir;

      assert.equal(resolveAgentExecutable(opencode), cli);

      rmSync(cli, { force: true });
      assert.equal(resolveAgentExecutable(opencode), desktop);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('detectAgents includes sanitized install and docs metadata from split runtime metadata', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-agent-install-meta-'));
  try {
    return await withEnvSnapshot(['PATH', 'OD_AGENT_HOME'], async () => {
      process.env.PATH = dir;
      process.env.OD_AGENT_HOME = dir;

      const agents = await detectAgents();
      const qoder = agents.find((agent) => agent.id === 'qoder');
      const deepseek = agents.find((agent) => agent.id === 'deepseek');

      assert.ok(qoder);
      assert.equal(qoder.available, false);
      assert.equal(qoder.installUrl, 'https://qoder.com/download');
      assert.equal(qoder.docsUrl, 'https://docs.qoder.com/');
      assert.ok(deepseek);
      assert.equal(
        deepseek.docsUrl,
        'https://github.com/Hmbown/CodeWhale/blob/main/README.md',
      );
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

fsTest('detectAgents marks Codex available when nvm exposes a node shim but launch resolution upgrades it to the native binary', async () => {
  const home = mkdtempSync(join(tmpdir(), 'od-detect-codex-nvm-native-'));
  try {
    return await withEnvSnapshot(['HOME', 'PATH', 'OD_AGENT_HOME'], async () => {
      const wrapperBinDir = join(home, '.nvm', 'versions', 'node', '24.14.1', 'bin');
      const wrapperPkgDir = join(home, '.nvm', 'versions', 'node', '24.14.1', 'lib', 'node_modules', '@openai', 'codex');
      const wrapperRealPath = join(wrapperPkgDir, 'bin', 'codex.js');
      const wrapperLinkPath = join(wrapperBinDir, 'codex');
      const nativePkgDir = join(
        wrapperPkgDir,
        'node_modules',
        '@openai',
        `codex-${process.platform}-${process.arch}`,
      );
      const nativeTargetTriple = codexNativeTargetTriple();
      const nativePathDir = join(nativePkgDir, 'vendor', nativeTargetTriple, 'path');
      const nativeBin = join(nativePkgDir, 'vendor', nativeTargetTriple, 'codex', 'codex');

      mkdirSync(join(wrapperPkgDir, 'bin'), { recursive: true });
      mkdirSync(wrapperBinDir, { recursive: true });
      mkdirSync(join(nativePkgDir, 'vendor', nativeTargetTriple, 'codex'), { recursive: true });
      mkdirSync(nativePathDir, { recursive: true });
      writeFileSync(
        wrapperRealPath,
        '#!/usr/bin/env node\nconsole.log("wrapper should not be probed");\n',
      );
      writeFileSync(nativeBin, '#!/bin/sh\necho "codex 9.9.9"\n');
      chmodSync(wrapperRealPath, 0o755);
      chmodSync(nativeBin, 0o755);
      symlinkSync(wrapperRealPath, wrapperLinkPath);

      process.env.HOME = home;
      process.env.PATH = '/usr/bin:/bin';
      process.env.OD_AGENT_HOME = home;

      const agents = await detectAgents();
      const codexAgent = agents.find((agent) => agent.id === 'codex');

      assert.ok(codexAgent);
      assert.equal(codexAgent.available, true);
      assert.equal(codexAgent.path, wrapperLinkPath);
      assert.equal(codexAgent.version, 'codex 9.9.9');
    });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

fsTest('detectAgents keeps packaged built-in AMR unavailable when OpenCode cannot be resolved', async () => {
  const root = mkdtempSync(join(tmpdir(), 'od-detect-amr-built-in-'));
  try {
    return await withEnvSnapshot(['PATH', 'OD_AGENT_HOME', 'OD_RESOURCE_ROOT', 'VELA_OPENCODE_BIN'], async () => {
      const resourceRoot = join(root, 'resources', 'open-design');
      const builtInVela = join(resourceRoot, 'bin', 'vela');
      mkdirSync(join(resourceRoot, 'bin'), { recursive: true });
      writeFileSync(
        builtInVela,
        '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "vela manual-amr"; exit 0; fi\nexit 0\n',
      );
      chmodSync(builtInVela, 0o755);
      process.env.PATH = '';
      process.env.OD_AGENT_HOME = join(root, 'empty-home');
      process.env.OD_RESOURCE_ROOT = resourceRoot;
      delete process.env.VELA_OPENCODE_BIN;

      const agents = await detectAgents();
      const amrAgent = agents.find((agent) => agent.id === 'amr');

      assert.ok(amrAgent);
      assert.equal(amrAgent.available, false);
      assert.equal(amrAgent.path, undefined);
      assert.equal(amrAgent.version, undefined);
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

fsTest('detectAgents marks AMR available from packaged built-in Vela with the bundled OpenCode companion tree', async () => {
  const root = mkdtempSync(join(tmpdir(), 'od-detect-amr-built-in-'));
  try {
    return await withEnvSnapshot(['PATH', 'OD_AGENT_HOME', 'OD_RESOURCE_ROOT', 'VELA_OPENCODE_BIN'], async () => {
      const resourceRoot = join(root, 'resources', 'open-design');
      const builtInVela = join(resourceRoot, 'bin', 'vela');
      const companionTree = join(resourceRoot, 'bin', 'libexec', 'opencode');
      mkdirSync(join(resourceRoot, 'bin'), { recursive: true });
      mkdirSync(companionTree, { recursive: true });
      writeFileSync(
        builtInVela,
        '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "vela manual-amr"; exit 0; fi\nexit 0\n',
      );
      chmodSync(builtInVela, 0o755);
      // The companion tree is only "valid" when an actual `opencode`
      // executable lives inside — directory-only checks were treating an
      // empty/partial copy as available and the first real run had nothing
      // to launch. Match the resources.test.ts packaging contract.
      const companionExe = join(companionTree, 'opencode');
      writeFileSync(companionExe, '#!/bin/sh\nexit 0\n');
      chmodSync(companionExe, 0o755);
      process.env.PATH = '';
      process.env.OD_AGENT_HOME = join(root, 'empty-home');
      process.env.OD_RESOURCE_ROOT = resourceRoot;
      delete process.env.VELA_OPENCODE_BIN;

      const agents = await detectAgents();
      const amrAgent = agents.find((agent) => agent.id === 'amr');

      assert.ok(amrAgent);
      assert.equal(amrAgent.available, true);
      assert.equal(amrAgent.path, builtInVela);
      assert.equal(amrAgent.version, 'vela manual-amr');
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});


fsTest('detectAgents prefers configured AMR live models over stale fallback defaults', async () => {
  const root = mkdtempSync(join(tmpdir(), 'od-detect-amr-live-models-'));
  try {
    return await withEnvSnapshot(['PATH', 'OD_AGENT_HOME', 'OD_RESOURCE_ROOT', 'VELA_OPENCODE_BIN'], async () => {
      const fakeVela = join(root, 'vela');
      const fakeOpenCode = join(root, 'opencode');
      writeFileSync(
        fakeVela,
        `#!/bin/sh
if [ "$1" = "--version" ]; then echo "vela custom-live"; exit 0; fi
if [ "$1" = "model" ] && [ "$2" = "list" ]; then echo '{"source":"remote","data":[{"id":"deepseek-v4-flash"},{"id":"glm-5"}]}'; exit 0; fi
exit 0
`,
      );
      writeFileSync(fakeOpenCode, `#!/bin/sh
exit 0
`);
      chmodSync(fakeVela, 0o755);
      chmodSync(fakeOpenCode, 0o755);
      process.env.PATH = '';
      process.env.OD_AGENT_HOME = join(root, 'empty-home');
      delete process.env.OD_RESOURCE_ROOT;
      delete process.env.VELA_OPENCODE_BIN;

      const agents = await detectAgents({
        amr: {
          VELA_BIN: fakeVela,
          VELA_OPENCODE_BIN: fakeOpenCode,
        },
      });
      const amrAgent = agents.find((agent) => agent.id === 'amr');

      assert.ok(amrAgent);
      assert.equal(amrAgent.available, true);
      assert.equal(amrAgent.path, fakeVela);
      assert.equal(amrAgent.version, 'vela custom-live');
      assert.equal(amrAgent.modelsSource, 'live');
      assert.deepEqual(amrAgent.models, [
        { id: 'deepseek-v4-flash', label: 'deepseek-v4-flash' },
        { id: 'glm-5', label: 'glm-5' },
      ]);
      assert.equal(amrAgent.models.some((model) => model.id === 'default'), false);
      assert.equal(amrAgent.models.some((model) => model.id === 'gpt-5.4-mini'), false);
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function codexNativeTargetTriple(): string {
  if (process.platform === 'darwin' && process.arch === 'arm64') return 'aarch64-apple-darwin';
  if (process.platform === 'darwin' && process.arch === 'x64') return 'x86_64-apple-darwin';
  if (process.platform === 'linux' && process.arch === 'arm64') return 'aarch64-unknown-linux-musl';
  if (process.platform === 'linux' && process.arch === 'x64') return 'x86_64-unknown-linux-musl';
  if (process.platform === 'win32' && process.arch === 'arm64') return 'aarch64-pc-windows-msvc';
  if (process.platform === 'win32' && process.arch === 'x64') return 'x86_64-pc-windows-msvc';
  return `${process.platform}-${process.arch}`;
}

test('resolveAgentExecutable ignores relative CODEX_BIN overrides', () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-codex-bin-rel-'));
  const oldCwd = process.cwd();
  try {
    return withEnvSnapshot(['PATH', 'OD_AGENT_HOME'], () => {
      const configured = 'codex-custom';
      writeFileSync(join(dir, configured), '#!/bin/sh\nexit 0\n');
      chmodSync(join(dir, configured), 0o755);
      process.chdir(dir);
      process.env.PATH = '';
      process.env.OD_AGENT_HOME = dir;

      const resolved = resolveAgentExecutable(
        minimalAgentDef({ id: 'codex', bin: 'codex' }),
        { CODEX_BIN: configured },
      );

      assert.equal(resolved, null);
    });
  } finally {
    process.chdir(oldCwd);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('resolveAgentExecutable ignores configured binary overrides that are not executable files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-agent-bin-invalid-'));
  try {
    return withEnvSnapshot(['PATH', 'OD_AGENT_HOME'], () => {
      const directoryOverride = join(dir, 'as-directory');
      mkdirSync(directoryOverride);
      const fileOverride = join(dir, 'not-executable');
      writeFileSync(fileOverride, '#!/bin/sh\nexit 0\n');
      if (process.platform !== 'win32') chmodSync(fileOverride, 0o644);
      process.env.PATH = '';
      process.env.OD_AGENT_HOME = dir;

      assert.equal(
        resolveAgentExecutable(minimalAgentDef({ id: 'codex', bin: 'codex' }), { CODEX_BIN: directoryOverride }),
        null,
      );
      if (process.platform !== 'win32') {
        assert.equal(
          resolveAgentExecutable(minimalAgentDef({ id: 'codex', bin: 'codex' }), { CODEX_BIN: fileOverride }),
          null,
        );
      }
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('resolveAgentExecutable ignores Windows CODEX_BIN overrides without executable PATHEXT extension', () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-agent-bin-win-invalid-'));
  try {
    return withEnvSnapshot(['PATH', 'PATHEXT', 'OD_AGENT_HOME'], () => {
      const invalidOverride = join(dir, 'codex-custom.txt');
      const fallback = join(dir, 'codex.CMD');
      writeFileSync(invalidOverride, '@echo off\r\nexit /b 0\r\n');
      writeFileSync(fallback, '@echo off\r\nexit /b 0\r\n');
      process.env.PATH = dir;
      process.env.PATHEXT = '.EXE;.CMD;.BAT';
      process.env.OD_AGENT_HOME = dir;

      const resolved = withPlatform('win32', () =>
        resolveAgentExecutable(
          minimalAgentDef({ id: 'codex', bin: 'codex' }),
          { CODEX_BIN: invalidOverride },
        ),
      );

      assert.equal(resolved, fallback);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('resolveAgentExecutable accepts Windows CODEX_BIN overrides with executable PATHEXT extension', () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-agent-bin-win-valid-'));
  try {
    return withEnvSnapshot(['PATH', 'PATHEXT', 'OD_AGENT_HOME'], () => {
      const configured = join(dir, 'codex-custom.CMD');
      writeFileSync(configured, '@echo off\r\nexit /b 0\r\n');
      process.env.PATH = '';
      process.env.PATHEXT = '.EXE;.CMD;.BAT';
      process.env.OD_AGENT_HOME = dir;

      const resolved = withPlatform('win32', () =>
        resolveAgentExecutable(
          minimalAgentDef({ id: 'codex', bin: 'codex' }),
          { CODEX_BIN: configured },
        ),
      );

      assert.equal(resolved, configured);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('detectAgents applies configured env while probing the CLI', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-agent-env-'));
  try {
    await withEnvSnapshot(['PATH', 'OD_AGENT_HOME'], async () => {
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
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('detectAgents marks Cursor Agent auth ok when cursor-agent status succeeds', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-cursor-auth-ok-'));
  try {
    await withEnvSnapshot(['PATH', 'OD_AGENT_HOME'], async () => {
      const bin = join(dir, process.platform === 'win32' ? 'cursor-agent.cmd' : 'cursor-agent');
      if (process.platform === 'win32') {
        writeFileSync(
          bin,
          '@echo off\r\nif "%~1"=="--version" echo 2026.05.07-test& exit /b 0\r\nif "%~1"=="models" echo auto& exit /b 0\r\nif "%~1"=="status" echo Authenticated& exit /b 0\r\nexit /b 0\r\n',
        );
      } else {
        writeFileSync(
          bin,
          '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "2026.05.07-test"; exit 0; fi\nif [ "$1" = "models" ]; then echo "auto"; exit 0; fi\nif [ "$1" = "status" ]; then echo "Authenticated"; exit 0; fi\nexit 0\n',
        );
        chmodSync(bin, 0o755);
      }
      process.env.PATH = dir;
      process.env.OD_AGENT_HOME = dir;

      const agents = await detectAgents();
      const detected = agents.find((agent) => agent.id === 'cursor-agent');

      assert.equal(detected?.available, true);
      assert.equal(detected?.authStatus, 'ok');
      assert.equal(detected?.authMessage, undefined);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('detectAgents surfaces Cursor Agent model labels without putting labels in ids', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-cursor-model-labels-'));
  try {
    await withEnvSnapshot(['PATH', 'OD_AGENT_HOME'], async () => {
      const bin = join(dir, process.platform === 'win32' ? 'cursor-agent.cmd' : 'cursor-agent');
      if (process.platform === 'win32') {
        writeFileSync(
          bin,
          '@echo off\r\nif "%~1"=="--version" echo 2026.05.16-test& exit /b 0\r\nif "%~1"=="models" (\r\n  echo Available models\r\n  echo auto - Auto\r\n  echo composer-2.5 - Composer 2.5 (current)\r\n  exit /b 0\r\n)\r\nif "%~1"=="status" echo Authenticated& exit /b 0\r\nexit /b 0\r\n',
        );
      } else {
        writeFileSync(
          bin,
          '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "2026.05.16-test"; exit 0; fi\nif [ "$1" = "models" ]; then printf "%s\\n" "Available models" "auto - Auto" "composer-2.5 - Composer 2.5 (current)"; exit 0; fi\nif [ "$1" = "status" ]; then echo "Authenticated"; exit 0; fi\nexit 0\n',
        );
        chmodSync(bin, 0o755);
      }
      process.env.PATH = dir;
      process.env.OD_AGENT_HOME = dir;

      const agents = await detectAgents();
      const detected = agents.find((agent) => agent.id === 'cursor-agent');

      assert.equal(detected?.available, true);
      assert.equal(detected?.modelsSource, 'live');
      assert.deepEqual(detected?.models, [
        { id: 'default', label: 'Default (CLI config)' },
        { id: 'auto', label: 'Auto' },
        { id: 'composer-2.5', label: 'Composer 2.5 (current)' },
      ]);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('detectAgents keeps Cursor Agent available when auth is missing', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-cursor-auth-missing-'));
  try {
    await withEnvSnapshot(['PATH', 'OD_AGENT_HOME'], async () => {
      const bin = join(dir, process.platform === 'win32' ? 'cursor-agent.cmd' : 'cursor-agent');
      if (process.platform === 'win32') {
        writeFileSync(
          bin,
          '@echo off\r\nif "%~1"=="--version" echo 2026.05.07-test& exit /b 0\r\nif "%~1"=="models" echo No models available for this account.& exit /b 0\r\nif "%~1"=="status" echo Authentication required. Please run agent login first, or set CURSOR_API_KEY environment variable. 1>&2& exit /b 1\r\nexit /b 0\r\n',
        );
      } else {
        writeFileSync(
          bin,
          '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "2026.05.07-test"; exit 0; fi\nif [ "$1" = "models" ]; then echo "No models available for this account."; exit 0; fi\nif [ "$1" = "status" ]; then echo "Authentication required. Please run agent login first, or set CURSOR_API_KEY environment variable." >&2; exit 1; fi\nexit 0\n',
        );
        chmodSync(bin, 0o755);
      }
      process.env.PATH = dir;
      process.env.OD_AGENT_HOME = dir;

      const agents = await detectAgents();
      const detected = agents.find((agent) => agent.id === 'cursor-agent');

      assert.equal(detected?.available, true);
      assert.equal(detected?.authStatus, 'missing');
      assert.match(detected?.authMessage ?? '', /cursor-agent login/);
      assert.deepEqual(
        detected?.models.map((model) => model.id),
        ['default', 'auto', 'sonnet-4', 'sonnet-4-thinking', 'gpt-5'],
      );
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('detectAgents treats Cursor Agent Not logged in status as missing auth', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-cursor-not-logged-in-'));
  try {
    await withEnvSnapshot(['PATH', 'OD_AGENT_HOME'], async () => {
      const bin = join(dir, process.platform === 'win32' ? 'cursor-agent.cmd' : 'cursor-agent');
      if (process.platform === 'win32') {
        writeFileSync(
          bin,
          '@echo off\r\nif "%~1"=="--version" echo 2026.05.07-test& exit /b 0\r\nif "%~1"=="models" echo No models available for this account.& exit /b 0\r\nif "%~1"=="status" echo Not logged in 1>&2& exit /b 1\r\nexit /b 0\r\n',
        );
      } else {
        writeFileSync(
          bin,
          '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "2026.05.07-test"; exit 0; fi\nif [ "$1" = "models" ]; then echo "No models available for this account."; exit 0; fi\nif [ "$1" = "status" ]; then echo "Not logged in" >&2; exit 1; fi\nexit 0\n',
        );
        chmodSync(bin, 0o755);
      }
      process.env.PATH = dir;
      process.env.OD_AGENT_HOME = dir;

      const agents = await detectAgents();
      const detected = agents.find((agent) => agent.id === 'cursor-agent');

      assert.equal(detected?.available, true);
      assert.equal(detected?.authStatus, 'missing');
      assert.match(detected?.authMessage ?? '', /cursor-agent login/);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Cursor auth matcher covers current unauthenticated Cursor error records', () => {
  assert.equal(isCursorAuthFailureText('ConnectError: [unauthenticated]'), true);
  assert.equal(isCursorAuthFailureText('Error: [unauthenticated] Error'), true);
});

// agy's print mode (`-p -`) exits with code 0 but emits one of these
// shapes when the keyring entry is missing or expired. Without the
// matcher, the daemon treats this as a successful turn and shows the
// raw OAuth URL as the agent's "reply" — but the user has no way to
// complete OAuth from inside chat (agy `-p` has no input field to
// paste the auth code into). The matcher converts each shape into
// AGENT_AUTH_REQUIRED with actionable guidance.
test('antigravity auth matcher covers agy print-mode + log-file auth signals', async () => {
  const { isAntigravityAuthFailureText, antigravityAuthGuidance, classifyAgentAuthFailure } =
    await import('../../src/runtimes/auth.js');

  // print-mode stdout shape — user-visible
  assert.equal(
    isAntigravityAuthFailureText(
      'Authentication required. Please visit the URL to log in: https://accounts.google.com/o/oauth2/auth?…',
    ),
    true,
  );
  assert.equal(
    isAntigravityAuthFailureText('Waiting for authentication (timeout 30s)...\nError: authentication timed out.'),
    true,
  );

  // `agy --log-file` shape — surfaces in stderr / log-file probes
  assert.equal(
    isAntigravityAuthFailureText(
      'E log.go:398] Failed to poll ListExperiments: error getting token source: You are not logged into Antigravity.',
    ),
    true,
  );

  // Negative: prose mentioning "authentication" must not false-fire
  assert.equal(
    isAntigravityAuthFailureText('I added two-factor authentication to the login flow.'),
    false,
  );
  assert.equal(isAntigravityAuthFailureText(''), false);

  // Classifier wires the agy detector to the user-actionable guidance
  // text so the chat surfaces a re-auth message rather than the raw
  // OAuth URL the user can't act on from inside OD.
  const cls = classifyAgentAuthFailure(
    'antigravity',
    'Authentication required. Please visit the URL to log in: https://example',
  );
  assert.ok(cls);
  assert.equal(cls.status, 'missing');
  assert.equal(cls.message, antigravityAuthGuidance());
  assert.ok(
    antigravityAuthGuidance().includes('open a terminal and run `agy` once'),
    'guidance must tell the user exactly what one-time command to run',
  );
  assert.ok(
    antigravityAuthGuidance().includes('keyring'),
    'guidance must mention the keyring so users understand it persists',
  );

  // Non-matching text → null (don't claim auth failure on unrelated errors)
  assert.equal(
    classifyAgentAuthFailure('antigravity', 'rate limit exceeded'),
    null,
  );
});

// Windows env-var names are case-insensitive at the kernel level, but
// spreading process.env into a plain object loses Node's case-insensitive
// accessor — a `Anthropic_Api_Key` key would survive a literal
// `delete env.ANTHROPIC_API_KEY` and still reach Claude Code on Windows.
test('spawnEnvForAgent strips Anthropic credentials case-insensitively for the claude adapter', () => {
  const env = spawnEnvForAgent('claude', {
    Anthropic_Api_Key: 'sk-mixed-case',
    anthropic_api_key: 'sk-lower-case',
    Anthropic_Auth_Token: 'sk-token-mixed-case',
    PATH: '/usr/bin',
  });

  const remaining = Object.keys(env).filter(
    (k) => k.toUpperCase() === 'ANTHROPIC_API_KEY' || k.toUpperCase() === 'ANTHROPIC_AUTH_TOKEN',
  );
  assert.deepEqual(remaining, []);
  assert.equal(env.PATH, '/usr/bin');
});

test('spawnEnvForAgent preserves Anthropic credentials when claude resolves to OpenClaude fallback', () => {
  const env = spawnEnvForAgent(
    'claude',
    {
      ANTHROPIC_API_KEY: 'sk-openclaude',
      ANTHROPIC_AUTH_TOKEN: 'sk-token-openclaude',
      PATH: '/usr/bin',
    },
    {},
    {},
    { resolvedBin: '/tools/openclaude' },
  );

  assert.equal(env.ANTHROPIC_API_KEY, 'sk-openclaude');
  assert.equal(env.ANTHROPIC_AUTH_TOKEN, 'sk-token-openclaude');
  assert.equal(env.PATH, '/usr/bin');
});

test('spawnEnvForAgent preserves Anthropic credentials for non-claude adapters', () => {
  for (const agentId of ['codex', 'gemini', 'opencode', 'devin']) {
    const env = spawnEnvForAgent(agentId, {
      ANTHROPIC_API_KEY: 'sk-keep',
      ANTHROPIC_AUTH_TOKEN: 'sk-token-keep',
      PATH: '/usr/bin',
    });
    assert.equal(
      env.ANTHROPIC_API_KEY,
      'sk-keep',
      `expected ${agentId} to preserve ANTHROPIC_API_KEY`,
    );
    assert.equal(
      env.ANTHROPIC_AUTH_TOKEN,
      'sk-token-keep',
      `expected ${agentId} to preserve ANTHROPIC_AUTH_TOKEN`,
    );
  }
});

// Issue #2420: Codex CLI prefers OPENAI_API_KEY / CODEX_API_KEY over its own
// `codex login` OAuth credentials when both are set. When the user has not
// pointed Codex at a custom proxy via OPENAI_BASE_URL, a stale BYOK key
// silently outranks `~/.codex/auth.json` and trips 401 invalid_api_key.
// Strip the API keys in that case so Codex CLI's own auth resolution wins —
// mirroring the existing ANTHROPIC_API_KEY behavior the claude adapter has
// for issue #398.
test('spawnEnvForAgent strips OPENAI_API_KEY for the codex adapter when OPENAI_BASE_URL is absent', () => {
  const env = spawnEnvForAgent('codex', {
    OPENAI_API_KEY: 'sk-stale-byok',
    PATH: '/usr/bin',
    OD_DAEMON_URL: 'http://127.0.0.1:7456',
  });

  assert.equal('OPENAI_API_KEY' in env, false);
  assert.equal(env.PATH, '/usr/bin');
  assert.equal(env.OD_DAEMON_URL, 'http://127.0.0.1:7456');
});

test('spawnEnvForAgent strips CODEX_API_KEY for the codex adapter when OPENAI_BASE_URL is absent', () => {
  const env = spawnEnvForAgent('codex', {
    CODEX_API_KEY: 'sk-stale-byok',
    PATH: '/usr/bin',
  });

  assert.equal('CODEX_API_KEY' in env, false);
  assert.equal(env.PATH, '/usr/bin');
});

test('spawnEnvForAgent strips Codex API keys when OPENAI_BASE_URL is empty', () => {
  const env = spawnEnvForAgent('codex', {
    OPENAI_API_KEY: 'sk-stale-byok',
    CODEX_API_KEY: 'sk-stale-byok',
    OPENAI_BASE_URL: '',
    PATH: '/usr/bin',
  });

  assert.equal('OPENAI_API_KEY' in env, false);
  assert.equal('CODEX_API_KEY' in env, false);
  assert.equal(env.PATH, '/usr/bin');
});

test('spawnEnvForAgent strips Codex API keys when OPENAI_BASE_URL is whitespace', () => {
  const env = spawnEnvForAgent('codex', {
    OPENAI_API_KEY: 'sk-stale-byok',
    OPENAI_BASE_URL: '   ',
    PATH: '/usr/bin',
  });

  assert.equal('OPENAI_API_KEY' in env, false);
  assert.equal(env.PATH, '/usr/bin');
});

test('spawnEnvForAgent preserves Codex API keys when OPENAI_BASE_URL is set to a custom proxy', () => {
  const env = spawnEnvForAgent('codex', {
    OPENAI_API_KEY: 'sk-proxy',
    OPENAI_BASE_URL: 'https://proxy.example.com/v1',
    PATH: '/usr/bin',
  });

  assert.equal(env.OPENAI_API_KEY, 'sk-proxy');
  assert.equal(env.OPENAI_BASE_URL, 'https://proxy.example.com/v1');
  assert.equal(env.PATH, '/usr/bin');
});

test('spawnEnvForAgent preserves CODEX_API_KEY when OPENAI_BASE_URL is set to a custom proxy', () => {
  const env = spawnEnvForAgent('codex', {
    CODEX_API_KEY: 'sk-proxy',
    OPENAI_BASE_URL: 'https://proxy.example.com/v1',
    PATH: '/usr/bin',
  });

  assert.equal(env.CODEX_API_KEY, 'sk-proxy');
  assert.equal(env.OPENAI_BASE_URL, 'https://proxy.example.com/v1');
});

test('spawnEnvForAgent strips Codex API keys case-insensitively when OPENAI_BASE_URL is absent', () => {
  const env = spawnEnvForAgent('codex', {
    Openai_Api_Key: 'sk-mixed-case',
    openai_api_key: 'sk-lower-case',
    Codex_Api_Key: 'sk-mixed-case',
    PATH: '/usr/bin',
  });

  const remainingOpenAi = Object.keys(env).filter(
    (k) => k.toUpperCase() === 'OPENAI_API_KEY',
  );
  const remainingCodex = Object.keys(env).filter(
    (k) => k.toUpperCase() === 'CODEX_API_KEY',
  );
  assert.deepEqual(remainingOpenAi, []);
  assert.deepEqual(remainingCodex, []);
  assert.equal(env.PATH, '/usr/bin');
});

test('spawnEnvForAgent preserves Codex API keys for non-codex adapters', () => {
  for (const agentId of ['claude', 'gemini', 'opencode', 'devin']) {
    const env = spawnEnvForAgent(agentId, {
      OPENAI_API_KEY: 'sk-keep',
      CODEX_API_KEY: 'sk-keep',
      PATH: '/usr/bin',
    });
    assert.equal(
      env.OPENAI_API_KEY,
      'sk-keep',
      `expected ${agentId} to preserve OPENAI_API_KEY`,
    );
    assert.equal(
      env.CODEX_API_KEY,
      'sk-keep',
      `expected ${agentId} to preserve CODEX_API_KEY`,
    );
  }
});

// When the user has explicitly configured a BYOK Codex base URL through the
// Settings → Execution mode → Local CLI form, the configured API key in
// `agentCliEnv.codex.OPENAI_API_KEY` (or CODEX_API_KEY) flows through to the
// spawn alongside the base URL. The stripping helper must keep both in sync
// so the configured proxy actually authenticates.
test('spawnEnvForAgent applies configured codex env and preserves API key when base URL is configured', () => {
  const env = spawnEnvForAgent(
    'codex',
    { PATH: '/usr/bin' },
    {
      OPENAI_BASE_URL: 'https://proxy.example.com/v1',
      OPENAI_API_KEY: 'sk-configured',
    },
  );

  assert.equal(env.OPENAI_BASE_URL, 'https://proxy.example.com/v1');
  assert.equal(env.OPENAI_API_KEY, 'sk-configured');
});

// The dual-key shape every BYOK Codex user hits in production: prior session
// left OPENAI_API_KEY in the daemon's app-config, the user cleared the BYOK
// dialog but never opened Settings → Local CLI → Codex env to also clear
// OPENAI_API_KEY, then switched execution mode back to Local CLI. spawnEnv
// must strip the stale BYOK key so Codex CLI's own `codex login` wins.
test('spawnEnvForAgent strips stale configured OPENAI_API_KEY when configured base URL was also cleared', () => {
  const env = spawnEnvForAgent(
    'codex',
    { PATH: '/usr/bin' },
    {
      // Empty OPENAI_BASE_URL — i.e. user is on Local CLI mode without a
      // custom proxy. validateAgentCliEnv would drop the empty string in
      // practice; we pass it explicitly here to lock the spawn-side guard.
      OPENAI_API_KEY: 'sk-stale-byok',
    },
  );

  assert.equal('OPENAI_API_KEY' in env, false);
  assert.equal(env.PATH, '/usr/bin');
});

test('spawnEnvForAgent preserves Anthropic API credentials when ANTHROPIC_BASE_URL is set', () => {
  const env = spawnEnvForAgent('claude', {
    ANTHROPIC_API_KEY: 'sk-kimi',
    ANTHROPIC_AUTH_TOKEN: 'sk-token',
    ANTHROPIC_BASE_URL: 'https://api.moonshot.cn/v1',
    PATH: '/usr/bin',
  });

  assert.equal(env.ANTHROPIC_API_KEY, 'sk-kimi');
  assert.equal(env.ANTHROPIC_AUTH_TOKEN, 'sk-token');
  assert.equal(env.ANTHROPIC_BASE_URL, 'https://api.moonshot.cn/v1');
  assert.equal(env.PATH, '/usr/bin');
});

test('spawnEnvForAgent strips Anthropic API credentials when ANTHROPIC_BASE_URL is empty', () => {
  const env = spawnEnvForAgent('claude', {
    ANTHROPIC_API_KEY: 'sk-leak',
    ANTHROPIC_AUTH_TOKEN: 'sk-token-leak',
    ANTHROPIC_BASE_URL: '',
    PATH: '/usr/bin',
  });

  assert.equal('ANTHROPIC_API_KEY' in env, false);
  assert.equal('ANTHROPIC_AUTH_TOKEN' in env, false);
  assert.equal(env.PATH, '/usr/bin');
});

test('spawnEnvForAgent strips Anthropic API credentials when ANTHROPIC_BASE_URL is whitespace', () => {
  const env = spawnEnvForAgent('claude', {
    ANTHROPIC_API_KEY: 'sk-leak',
    ANTHROPIC_AUTH_TOKEN: 'sk-token-leak',
    ANTHROPIC_BASE_URL: '   ',
    PATH: '/usr/bin',
  });

  assert.equal('ANTHROPIC_API_KEY' in env, false);
  assert.equal('ANTHROPIC_AUTH_TOKEN' in env, false);
  assert.equal(env.PATH, '/usr/bin');
});

test('spawnEnvForAgent does not mutate the input env', () => {
  const original = { ANTHROPIC_API_KEY: 'sk-leak', PATH: '/usr/bin' };
  const env = spawnEnvForAgent('claude', original);

  assert.equal(original.ANTHROPIC_API_KEY, 'sk-leak');
  assert.notEqual(env, original);
});
