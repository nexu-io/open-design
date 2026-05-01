import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveDaemonResourceRoot, resolveProjectRoot } from '../src/server.js';

describe('resolveProjectRoot', () => {
  it('resolves the repository root from the source daemon directory', () => {
    const root = path.resolve(import.meta.dirname, '../../..');

    expect(resolveProjectRoot(path.join(root, 'apps', 'daemon'))).toBe(root);
  });

  it('resolves the repository root from the live TypeScript source directory', () => {
    const root = path.resolve(import.meta.dirname, '../../..');

    expect(resolveProjectRoot(path.join(root, 'apps', 'daemon', 'src'))).toBe(root);
  });

  it('resolves the repository root from the compiled daemon dist directory', () => {
    const root = path.resolve(import.meta.dirname, '../../..');

    expect(resolveProjectRoot(path.join(root, 'apps', 'daemon', 'dist'))).toBe(root);
  });

  it('resolves the repository root from the daemon src directory (tsx entry)', () => {
    const root = path.resolve(import.meta.dirname, '../../..');

    expect(resolveProjectRoot(path.join(root, 'apps', 'daemon', 'src'))).toBe(root);
  });
});

describe('resolveDaemonResourceRoot', () => {
  it('allows resource roots under an explicit safe base', () => {
    const safeBase = path.resolve(import.meta.dirname, '..', 'fixtures', 'resources');
    const configured = path.join(safeBase, 'packaged');

    expect(resolveDaemonResourceRoot({ configured, safeBases: [safeBase] })).toBe(configured);
  });

  it('allows a resource root equal to an explicit safe base', () => {
    const safeBase = path.resolve(import.meta.dirname, '..', 'fixtures', 'resources');

    expect(resolveDaemonResourceRoot({ configured: safeBase, safeBases: [safeBase] })).toBe(safeBase);
  });

  it('rejects resource roots outside the safe bases', () => {
    const safeBase = path.resolve(import.meta.dirname, '..', 'fixtures', 'resources');
    const configured = path.resolve(import.meta.dirname, '..', 'fixtures-other', 'resources');

    expect(() => resolveDaemonResourceRoot({ configured, safeBases: [safeBase] })).toThrow(
      /OD_RESOURCE_ROOT must be under/,
    );
  });
});
