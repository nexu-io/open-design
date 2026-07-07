import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { createAdapterRegistry } from '../src/resource-sharing/adapters.js';

const paths = {
  USER_DESIGN_SYSTEMS_DIR: '/data/design-systems',
  USER_SKILLS_DIR: '/data/skills',
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

  it('resolveSourceDir returns the dir only when it exists', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'adapter-'));
    mkdirSync(path.join(root, 'my-skill'));
    const skill = createAdapterRegistry({ ...paths, USER_SKILLS_DIR: root }).get(
      'skill',
    );
    expect(skill?.resolveSourceDir('my-skill')).toBe(path.join(root, 'my-skill'));
    expect(skill?.resolveSourceDir('nope')).toBeNull();
  });
});
