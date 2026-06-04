import os from 'node:os';
import path from 'node:path';
import { existsSync, mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';

import {
  applySandboxRuntimeEnv,
  ensureSandboxRuntimeDirs,
  isSandboxModeEnabled,
  resolveSandboxRuntimeConfig,
} from '../src/sandbox-mode.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

function tempDataDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'od-sandbox-mode-'));
  tempDirs.push(dir);
  return dir;
}

describe('sandbox mode env parsing', () => {
  it('is disabled when OD_SANDBOX_MODE is unset or false-like', () => {
    expect(isSandboxModeEnabled({})).toBe(false);
    expect(isSandboxModeEnabled({ OD_SANDBOX_MODE: '0' })).toBe(false);
    expect(isSandboxModeEnabled({ OD_SANDBOX_MODE: 'false' })).toBe(false);
  });

  it('is enabled for explicit true-like values', () => {
    expect(isSandboxModeEnabled({ OD_SANDBOX_MODE: '1' })).toBe(true);
    expect(isSandboxModeEnabled({ OD_SANDBOX_MODE: 'true' })).toBe(true);
    expect(isSandboxModeEnabled({ OD_SANDBOX_MODE: 'YES' })).toBe(true);
  });

  it('rejects ambiguous non-empty values', () => {
    expect(() => isSandboxModeEnabled({ OD_SANDBOX_MODE: 'sandbox' })).toThrow(
      'OD_SANDBOX_MODE must be one of',
    );
  });
});

describe('sandbox runtime roots', () => {
  it('keeps all run-scoped roots under OD_DATA_DIR', () => {
    const dataDir = tempDataDir();
    const config = resolveSandboxRuntimeConfig(true, dataDir);

    expect(config.enabled).toBe(true);
    for (const dir of Object.values(config.roots)) {
      expect(dir === dataDir || dir.startsWith(dataDir + path.sep)).toBe(true);
    }
  });

  it('creates scoped runtime directories only when enabled', () => {
    const dataDir = tempDataDir();
    const enabled = resolveSandboxRuntimeConfig(true, dataDir);
    const disabled = resolveSandboxRuntimeConfig(false, dataDir);

    ensureSandboxRuntimeDirs(disabled);
    expect(existsSync(enabled.roots.agentHomeDir)).toBe(false);

    ensureSandboxRuntimeDirs(enabled);
    expect(existsSync(enabled.roots.agentHomeDir)).toBe(true);
    expect(existsSync(enabled.roots.previewStateDir)).toBe(true);
    expect(existsSync(enabled.roots.toolConfigDir)).toBe(true);
  });

  it('pins agent home and tool config env to sandbox roots', () => {
    const dataDir = tempDataDir();
    const config = resolveSandboxRuntimeConfig(true, dataDir);
    const env = applySandboxRuntimeEnv(
      {
        HOME: '/real/home',
        CODEX_HOME: '/real/home/.codex',
        CLAUDE_CONFIG_DIR: '/real/home/.claude',
        OPENCODE_TEST_HOME: '/real/home/.opencode',
        NPM_CONFIG_USERCONFIG: '/real/home/.npmrc',
        OD_DATA_DIR: dataDir,
        PATH: '/bin',
      },
      config,
    );

    expect(env.HOME).toBe(config.roots.agentHomeDir);
    expect(env.USERPROFILE).toBe(config.roots.agentHomeDir);
    expect(env.OD_AGENT_HOME).toBe(config.roots.agentHomeDir);
    expect(env.CODEX_HOME).toBe(path.join(config.roots.agentHomeDir, '.codex'));
    expect(env.CLAUDE_CONFIG_DIR).toBe(path.join(config.roots.configDir, 'claude'));
    expect(env.OPENCODE_TEST_HOME).toBe(path.join(config.roots.agentHomeDir, '.opencode'));
    expect(env.NPM_CONFIG_USERCONFIG).toBe(path.join(config.roots.toolConfigDir, 'npmrc'));
    expect(env.PATH).toBe('/bin');
  });
});
