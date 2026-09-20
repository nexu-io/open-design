import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  resolveVelaManagedWebRuntime,
  velaManagedWebRuntimeForEnv,
} from '../../src/runtimes/vela-managed-web.js';
import { spawnEnvForAgent } from '../../src/runtimes/env.js';

// Build the two shapes pnpm produces for the same install: a hoisted symlink
// tree where the platform package and the meta package are directory siblings,
// and the isolated real store where they are not. `vela` is only ever resolved
// to the platform package; the runtime assets only ever exist in the meta one.
function createPnpmLayout(): { root: string; hoistedBin: string; storeBin: string } {
  const root = mkdtempSync(path.join(os.tmpdir(), 'vela-managed-web-'));
  const pnpm = path.join(root, 'node_modules', '.pnpm');

  const store = (name: string) =>
    path.join(pnpm, `@powerformer+${name}@1.0.0`, 'node_modules', '@powerformer', name);
  const platformStore = store('vela-cli-darwin-arm64');
  const metaStore = store('vela-cli');

  mkdirSync(path.join(platformStore, 'bin'), { recursive: true });
  const storeBin = path.join(platformStore, 'bin', 'vela');
  writeFileSync(storeBin, '');

  mkdirSync(path.join(metaStore, 'runtime'), { recursive: true });
  writeFileSync(path.join(metaStore, 'runtime', 'managed-web.mjs'), '');
  writeFileSync(path.join(metaStore, 'runtime', 'pi-web.mjs'), '');

  const hoisted = path.join(pnpm, 'node_modules', '@powerformer');
  mkdirSync(hoisted, { recursive: true });
  symlinkSync(platformStore, path.join(hoisted, 'vela-cli-darwin-arm64'));
  symlinkSync(metaStore, path.join(hoisted, 'vela-cli'));

  return {
    root,
    hoistedBin: path.join(hoisted, 'vela-cli-darwin-arm64', 'bin', 'vela'),
    storeBin,
  };
}

describe('vela managed web runtime resolution', () => {
  it('resolves both assets from the hoisted sibling tree', () => {
    const { hoistedBin } = createPnpmLayout();
    const resolved = resolveVelaManagedWebRuntime(hoistedBin);
    expect(resolved.webTools).toMatch(/vela-cli[/\\]runtime[/\\]managed-web\.mjs$/);
    expect(resolved.piWebExtension).toMatch(/vela-cli[/\\]runtime[/\\]pi-web\.mjs$/);
  });

  // The regression that cost the harness evaluation every Codex and Pi case:
  // pnpm's isolated store has no sibling meta package, so a resolver that only
  // looked next to the binary found nothing and vela hard-failed with "launch
  // through the Vela npm package". Walking up to `.pnpm` reaches the hoisted
  // tree from here.
  it('resolves both assets from the isolated real store', () => {
    const { storeBin } = createPnpmLayout();
    const resolved = resolveVelaManagedWebRuntime(storeBin);
    expect(resolved.webTools).toMatch(/managed-web\.mjs$/);
    expect(resolved.piWebExtension).toMatch(/pi-web\.mjs$/);
  });

  it('returns nothing when the package ships only one of the two assets', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'vela-partial-'));
    const meta = path.join(root, 'node_modules', '@powerformer', 'vela-cli');
    mkdirSync(path.join(meta, 'runtime'), { recursive: true });
    writeFileSync(path.join(meta, 'runtime', 'managed-web.mjs'), '');
    const binDir = path.join(
      root,
      'node_modules',
      '@powerformer',
      'vela-cli-darwin-arm64',
      'bin',
    );
    mkdirSync(binDir, { recursive: true });
    const bin = path.join(binDir, 'vela');
    writeFileSync(bin, '');

    expect(resolveVelaManagedWebRuntime(bin)).toEqual({
      webTools: null,
      piWebExtension: null,
    });
  });

  it('resolves nothing for an unknown or empty binary path', () => {
    expect(resolveVelaManagedWebRuntime(null)).toEqual({
      webTools: null,
      piWebExtension: null,
    });
    expect(resolveVelaManagedWebRuntime('   ')).toEqual({
      webTools: null,
      piWebExtension: null,
    });
    expect(
      resolveVelaManagedWebRuntime(path.join(os.tmpdir(), 'no-such-vela-bin')),
    ).toEqual({ webTools: null, piWebExtension: null });
  });

  it('seeds from VELA_BIN and prefers the caller-resolved binary', () => {
    const a = createPnpmLayout();
    const b = createPnpmLayout();
    expect(velaManagedWebRuntimeForEnv({ VELA_BIN: a.storeBin }).webTools).toContain(
      a.root,
    );
    // The path actually being spawned wins, so a Settings override or a native
    // relaunch cannot pair one release's binary with another's assets.
    expect(
      velaManagedWebRuntimeForEnv({ VELA_BIN: a.storeBin }, b.hoistedBin).webTools,
    ).toContain(b.root);
  });
});

describe('AMR spawn environment', () => {
  it('injects the managed web assets vela cannot find on its own', () => {
    const { storeBin, root } = createPnpmLayout();
    const env = spawnEnvForAgent(
      'amr',
      { VELA_BIN: storeBin, OD_NODE_BIN: '/usr/bin/node' },
      {},
      {},
    );
    expect(env.VELA_WEB_TOOLS).toContain(root);
    expect(env.VELA_WEB_TOOLS).toMatch(/managed-web\.mjs$/);
    expect(env.VELA_PI_WEB_EXTENSION).toMatch(/pi-web\.mjs$/);
    expect(env.VELA_NODE_BIN).toBe('/usr/bin/node');
    // The gate vela reads before it looks for any of the above.
    expect(env.VELA_ENABLE_PARALLEL_MCP).toBe('1');
  });

  it('never overrides values the caller already set', () => {
    const { storeBin } = createPnpmLayout();
    const env = spawnEnvForAgent(
      'amr',
      {
        VELA_BIN: storeBin,
        VELA_NODE_BIN: '/custom/node',
        VELA_WEB_TOOLS: '/custom/managed-web.mjs',
        VELA_PI_WEB_EXTENSION: '/custom/pi-web.mjs',
      },
      {},
      {},
    );
    expect(env.VELA_NODE_BIN).toBe('/custom/node');
    expect(env.VELA_WEB_TOOLS).toBe('/custom/managed-web.mjs');
    expect(env.VELA_PI_WEB_EXTENSION).toBe('/custom/pi-web.mjs');
  });

  it('leaves the variables unset when no vela package can be located', () => {
    const env = spawnEnvForAgent('amr', { OD_NODE_BIN: '/usr/bin/node' }, {}, {});
    expect(env.VELA_WEB_TOOLS).toBeUndefined();
    expect(env.VELA_PI_WEB_EXTENSION).toBeUndefined();
  });
});
