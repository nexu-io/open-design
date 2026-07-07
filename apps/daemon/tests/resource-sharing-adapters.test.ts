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

  it('maps each kind to its source root and a distinct team-copy namespace', () => {
    const registry = createAdapterRegistry(paths);
    expect(registry.get('skill')?.teamCopyDir('h1')).toBe('/data/team-shared/skills/h1');
    expect(registry.get('plugin')?.teamCopyDir('h1')).toBe('/data/team-shared/plugins/h1');
    expect(registry.get('design_system')?.teamCopyDir('h1')).toBe(
      '/data/team-shared/design-systems/h1',
    );
  });

  it('resolveSourceDir checks all daemon skill roots', () => {
    const userRoot = mkdtempSync(path.join(tmpdir(), 'adapter-user-'));
    const bundledRoot = mkdtempSync(path.join(tmpdir(), 'adapter-bundled-'));
    mkdirSync(path.join(bundledRoot, 'built-in-skill'));
    const skill = createAdapterRegistry({
      ...paths,
      SKILL_ROOTS: [userRoot, bundledRoot],
    }).get('skill');
    expect(skill?.resolveSourceDir('built-in-skill')).toBe(
      path.join(bundledRoot, 'built-in-skill'),
    );
    expect(skill?.resolveSourceDir('nope')).toBeNull();
  });

  it('resolves plugin source dirs through the installed plugin record owner', () => {
    const bundledRoot = mkdtempSync(path.join(tmpdir(), 'adapter-plugin-'));
    mkdirSync(path.join(bundledRoot, 'bundled-plugin'));
    const plugin = createAdapterRegistry(paths, {
      resolvePluginSourceDir: (localId) =>
        localId === 'bundled-plugin' ? path.join(bundledRoot, localId) : null,
    }).get('plugin');
    expect(plugin?.resolveSourceDir('bundled-plugin')).toBe(
      path.join(bundledRoot, 'bundled-plugin'),
    );
    expect(plugin?.resolveSourceDir('missing-plugin')).toBeNull();
  });
});
