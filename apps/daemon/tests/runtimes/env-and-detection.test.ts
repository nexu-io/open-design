import { symlinkSync } from 'node:fs';
import { test } from 'vitest';
import { homedir } from 'node:os';
import {
  assert, chmodSync, detectAgents, inspectAgentExecutableResolution, join, minimalAgentDef, mkdirSync, mkdtempSync, opencode, resolveAgentExecutable, rmSync, spawnEnvForAgent, tmpdir, withEnvSnapshot, withPlatform, writeFileSync,
} from './helpers/test-helpers.js';
import { isCursorAuthFailureText } from '../../src/runtimes/auth.js';

const fsTest = process.platform === 'win32' ? test.skip : test;

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

test('spawnEnvForAgent expands configured env home paths', () => {
  const env = spawnEnvForAgent('codex', { PATH: '/usr/bin' }, {
    CODEX_HOME: '~/.codex-alt',
    CODEX_CACHE: '~',
  });

  assert.equal(env.CODEX_HOME, join(homedir(), '.codex-alt'));
  assert.equal(env.CODEX_CACHE, homedir());
  assert.equal(env.PATH, '/usr/bin');
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
        'https://github.com/deepseek-ai/DeepSeek-TUI/blob/main/README.md',
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
