import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { createAdapterRegistry } from '../src/resource-sharing/adapters.js';

const paths = {
  USER_DESIGN_SYSTEMS_DIR: '/data/design-systems',
  SKILL_ROOTS: ['/data/skills', '/app/skills'],
  RUNTIME_DATA_DIR: '/data',
};

describe('resource-sharing adapters', () => {
  it('registers all three kinds', () => {
    const registry = createAdapterRegistry(paths);
    expect([...registry.keys()].sort()).toEqual(['design_system', 'plugin', 'skill']);
  });

  it('maps each kind to its source root and a distinct team-copy namespace', async () => {
    const registry = createAdapterRegistry(paths);
    await expect(registry.get('skill')?.teamCopyDir('h1')).resolves.toBe(
      '/data/team-shared/skills/h1',
    );
    await expect(registry.get('plugin')?.teamCopyDir('h1')).resolves.toBe(
      '/data/team-shared/plugins/h1',
    );
    await expect(registry.get('design_system')?.teamCopyDir('h1')).resolves.toBe(
      '/data/team-shared/design-systems/h1',
    );
  });

  it('resolveSourceDir checks all daemon skill roots', async () => {
    const userRoot = mkdtempSync(path.join(tmpdir(), 'adapter-user-'));
    const bundledRoot = mkdtempSync(path.join(tmpdir(), 'adapter-bundled-'));
    mkdirSync(path.join(bundledRoot, 'built-in-skill'));
    const skill = createAdapterRegistry({
      ...paths,
      SKILL_ROOTS: [userRoot, bundledRoot],
    }).get('skill');
    await expect(skill?.resolveSourceDir('built-in-skill')).resolves.toBe(
      path.join(bundledRoot, 'built-in-skill'),
    );
    await expect(skill?.resolveSourceDir('nope')).resolves.toBeNull();
  });

  it('resolves plugin source dirs through the installed plugin record owner', async () => {
    const bundledRoot = mkdtempSync(path.join(tmpdir(), 'adapter-plugin-'));
    mkdirSync(path.join(bundledRoot, 'bundled-plugin'));
    const plugin = createAdapterRegistry(paths, {
      resolvePluginSourceDir: (localId) =>
        localId === 'bundled-plugin' ? path.join(bundledRoot, localId) : null,
    }).get('plugin');
    await expect(plugin?.resolveSourceDir('bundled-plugin')).resolves.toBe(
      path.join(bundledRoot, 'bundled-plugin'),
    );
    await expect(plugin?.resolveSourceDir('missing-plugin')).resolves.toBeNull();
  });
});
