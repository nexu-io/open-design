import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { spawnEnvForAgent } from '../../src/runtimes/env.js';

describe('byok-opencode global config isolation (#9365)', () => {
  it('isolates OPENCODE_TEST_HOME and XDG_CONFIG_HOME under OD_DATA_DIR and strips inherited global config pointers', () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'od-byok-opencode-isolation-'));
    try {
      const env = spawnEnvForAgent('byok-opencode', {
        OD_DATA_DIR: dataDir,
        PATH: '/usr/bin',
        HOME: '/Users/alice',
        XDG_CONFIG_HOME: '/Users/alice/.config',
        OPENCODE_TEST_HOME: '/Users/alice/.opencode-custom',
        OPENCODE_CONFIG: '/Users/alice/.config/opencode/opencode.json',
        OPENCODE_CONFIG_DIR: '/Users/alice/.config/opencode',
      });

      const expectedHome = join(dataDir, 'byok-opencode', 'opencode-home');
      expect(env.OPENCODE_TEST_HOME).toBe(expectedHome);
      expect(env.XDG_CONFIG_HOME).toBe(join(expectedHome, '.config'));
      expect(env.OPENCODE_CONFIG).toBeUndefined();
      expect(env.OPENCODE_CONFIG_DIR).toBeUndefined();
      expect(env.OPENCODE_DISABLE_PROJECT_CONFIG).toBe('true');
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('replaces mixed-case inherited XDG_CONFIG_HOME and OPENCODE_CONFIG keys without leaving duplicates', () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'od-byok-opencode-case-'));
    try {
      const env = spawnEnvForAgent('byok-opencode', {
        OD_DATA_DIR: dataDir,
        PATH: '/usr/bin',
        xdg_config_home: 'C:\\Users\\alice\\.config',
        opencode_test_home: 'C:\\Users\\alice\\.opencode',
        opencode_config: 'C:\\Users\\alice\\.config\\opencode\\opencode.jsonc',
        opencode_config_dir: 'C:\\Users\\alice\\.config\\opencode',
      });

      const expectedHome = join(dataDir, 'byok-opencode', 'opencode-home');
      expect(env.OPENCODE_TEST_HOME).toBe(expectedHome);
      expect(env.XDG_CONFIG_HOME).toBe(join(expectedHome, '.config'));
      expect(Object.keys(env).filter((k) => k.toUpperCase() === 'XDG_CONFIG_HOME')).toEqual(['XDG_CONFIG_HOME']);
      expect(Object.keys(env).filter((k) => k.toUpperCase() === 'OPENCODE_TEST_HOME')).toEqual(['OPENCODE_TEST_HOME']);
      expect(Object.keys(env).some((k) => k.toUpperCase() === 'OPENCODE_CONFIG')).toBe(false);
      expect(Object.keys(env).some((k) => k.toUpperCase() === 'OPENCODE_CONFIG_DIR')).toBe(false);
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('keeps local opencode using the user global config', () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'od-local-opencode-'));
    try {
      const env = spawnEnvForAgent('opencode', {
        OD_DATA_DIR: dataDir,
        PATH: '/usr/bin',
        XDG_CONFIG_HOME: '/Users/alice/.config',
        OPENCODE_TEST_HOME: '/Users/alice/.opencode-custom',
        OPENCODE_CONFIG: '/Users/alice/.config/opencode/opencode.json',
        OPENCODE_CONFIG_DIR: '/Users/alice/.config/opencode',
      });

      expect(env.XDG_CONFIG_HOME).toBe('/Users/alice/.config');
      expect(env.OPENCODE_TEST_HOME).toBe('/Users/alice/.opencode-custom');
      expect(env.OPENCODE_CONFIG).toBe('/Users/alice/.config/opencode/opencode.json');
      expect(env.OPENCODE_CONFIG_DIR).toBe('/Users/alice/.config/opencode');
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('preserves sandbox roots when OD_SANDBOX_MODE is enabled', () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'od-byok-opencode-sandbox-'));
    try {
      const env = spawnEnvForAgent('byok-opencode', {
        OD_DATA_DIR: dataDir,
        OD_SANDBOX_MODE: '1',
        PATH: '/usr/bin',
        XDG_CONFIG_HOME: '/Users/alice/.config',
      });

      expect(env.OPENCODE_TEST_HOME).toBe(join(dataDir, 'sandbox', 'agent-home', '.opencode'));
      expect(env.XDG_CONFIG_HOME).toBe(join(dataDir, 'sandbox', 'config'));
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('respects explicit configuredEnv overrides for byok-opencode', () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'od-byok-opencode-override-'));
    try {
      const customHome = join(dataDir, 'custom-home');
      const customConfig = join(dataDir, 'custom-config');
      const env = spawnEnvForAgent(
        'byok-opencode',
        {
          OD_DATA_DIR: dataDir,
          PATH: '/usr/bin',
          XDG_CONFIG_HOME: '/Users/alice/.config',
        },
        {
          OPENCODE_TEST_HOME: customHome,
          XDG_CONFIG_HOME: customConfig,
        },
      );

      expect(env.OPENCODE_TEST_HOME).toBe(customHome);
      expect(env.XDG_CONFIG_HOME).toBe(customConfig);
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
