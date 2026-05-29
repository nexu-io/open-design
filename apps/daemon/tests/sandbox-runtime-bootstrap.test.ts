import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test, vi } from 'vitest';

function withEnvSnapshot<T>(
  keys: readonly string[],
  run: () => T | Promise<T>,
): T | Promise<T> {
  const snapshot = new Map(keys.map((key) => [key, process.env[key]]));
  const restore = () => {
    for (const key of keys) {
      const value = snapshot.get(key);
      if (value == null) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };

  let result: T | Promise<T>;
  try {
    result = run();
  } catch (error) {
    restore();
    throw error;
  }
  if (result instanceof Promise) {
    return result.finally(restore);
  }
  restore();
  return result;
}

test('sandbox runtime registry ignores host-local agent profiles at module load', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'od-sandbox-registry-'));
  const dataDir = path.join(root, 'data');
  const hostHome = path.join(root, 'host-home');
  const hostConfigDir = path.join(hostHome, '.open-design');
  const hostConfig = path.join(hostConfigDir, 'agents.local.json');
  const sandboxConfigDir = path.join(
    dataDir,
    'sandbox',
    'agent-home',
    '.open-design',
  );
  const sandboxConfig = path.join(sandboxConfigDir, 'agents.local.json');

  try {
    mkdirSync(hostConfigDir, { recursive: true });
    mkdirSync(sandboxConfigDir, { recursive: true });
    writeFileSync(
      hostConfig,
      JSON.stringify({
        agents: [{ id: 'host-wrapper', baseAgent: 'claude', bin: 'host-wrapper' }],
      }),
    );
    writeFileSync(
      sandboxConfig,
      JSON.stringify({
        agents: [
          {
            id: 'sandbox-wrapper',
            baseAgent: 'claude',
            bin: 'sandbox-wrapper',
          },
        ],
      }),
    );

    await withEnvSnapshot(
      ['OD_SANDBOX_MODE', 'OD_DATA_DIR', 'OD_AGENT_PROFILES_CONFIG'],
      async () => {
        process.env.OD_SANDBOX_MODE = '1';
        process.env.OD_DATA_DIR = dataDir;
        process.env.OD_AGENT_PROFILES_CONFIG = hostConfig;

        vi.resetModules();
        vi.doMock('node:os', async () => ({
          ...(await vi.importActual<typeof import('node:os')>('node:os')),
          homedir: () => hostHome,
        }));
        const { AGENT_DEFS } = await import('../src/runtimes/registry.js');
        const ids = AGENT_DEFS.map((def) => def.id);

        assert.equal(ids.includes('host-wrapper'), false);
        assert.equal(ids.includes('sandbox-wrapper'), true);
      },
    );
  } finally {
    vi.doUnmock('node:os');
    vi.resetModules();
    rmSync(root, { recursive: true, force: true });
  }
});

test('sandbox runtime registry ignores implicit profiles without OD_DATA_DIR', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'od-sandbox-registry-missing-data-'));
  const hostHome = path.join(root, 'host-home');
  const hostConfigDir = path.join(hostHome, '.open-design');
  const hostConfig = path.join(hostConfigDir, 'agents.local.json');

  try {
    mkdirSync(hostConfigDir, { recursive: true });
    writeFileSync(
      hostConfig,
      JSON.stringify({
        agents: [{ id: 'host-wrapper', baseAgent: 'claude', bin: 'host-wrapper' }],
      }),
    );

    await withEnvSnapshot(
      ['OD_SANDBOX_MODE', 'OD_DATA_DIR', 'OD_AGENT_PROFILES_CONFIG'],
      async () => {
        process.env.OD_SANDBOX_MODE = '1';
        delete process.env.OD_DATA_DIR;
        delete process.env.OD_AGENT_PROFILES_CONFIG;

        vi.resetModules();
        vi.doMock('node:os', async () => ({
          ...(await vi.importActual<typeof import('node:os')>('node:os')),
          homedir: () => hostHome,
        }));
        const { AGENT_DEFS } = await import('../src/runtimes/registry.js');
        const ids = AGENT_DEFS.map((def) => def.id);

        assert.equal(ids.includes('host-wrapper'), false);
      },
    );
  } finally {
    vi.doUnmock('node:os');
    vi.resetModules();
    rmSync(root, { recursive: true, force: true });
  }
});
