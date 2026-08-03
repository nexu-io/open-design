import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  assertPackagedRootWebBasePath,
  PACKAGED_NAMESPACE_BASE_ROOT_ENV,
  resolvePackagedNamespaceBaseRoot,
} from '../src/config.js';

describe('packaged web base path boundary', () => {
  it('allows the default root deployment', () => {
    expect(() => assertPackagedRootWebBasePath({})).not.toThrow();
    expect(() => assertPackagedRootWebBasePath({ OD_WEB_BASE_PATH: '' })).not.toThrow();
  });

  it('fails clearly when a self-hosted prefix leaks into packaged runtime', () => {
    expect(() => assertPackagedRootWebBasePath({ OD_WEB_BASE_PATH: '/open-design' })).toThrow(
      /not supported by the packaged desktop runtime/,
    );
  });
});

describe('resolvePackagedNamespaceBaseRoot', () => {
  it('lets a historical handoff preserve the already-resolved namespace base root', () => {
    const inheritedRoot = join('C:', 'tools-pack', 'runtime', 'namespaces');
    const bakedRoot = join('C:', 'Users', 'Nexu', 'AppData', 'Roaming', 'Open Design', 'namespaces');

    expect(resolvePackagedNamespaceBaseRoot(bakedRoot, join('C:', 'fallback'), {
      [PACKAGED_NAMESPACE_BASE_ROOT_ENV]: inheritedRoot,
    })).toBe(resolve(inheritedRoot));
  });

  it('falls back to the payload config and then Electron userData', () => {
    const bakedRoot = join('C:', 'packaged', 'namespaces');
    const userDataRoot = join('C:', 'user-data');

    expect(resolvePackagedNamespaceBaseRoot(bakedRoot, userDataRoot, {})).toBe(resolve(bakedRoot));
    expect(resolvePackagedNamespaceBaseRoot(undefined, userDataRoot, {})).toBe(
      join(userDataRoot, 'namespaces'),
    );
  });
});
