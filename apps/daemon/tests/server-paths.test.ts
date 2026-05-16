import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveDaemonCliPath, resolveDaemonResourceRoot, resolveProjectRoot } from '../src/server.js';

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

describe('resolveDaemonCliPath', () => {
  it('resolves the od CLI from the daemon package root', () => {
    const packageRoot = path.resolve(import.meta.dirname, '..');

    expect(resolveDaemonCliPath()).toBe(path.join(packageRoot, 'dist', 'cli.js'));
  });

  it('uses the packaged daemon CLI path override before package resolution', () => {
    expect(resolveDaemonCliPath({ OD_DAEMON_CLI_PATH: '/app/prebundled/daemon-cli.mjs' })).toBe(
      '/app/prebundled/daemon-cli.mjs',
    );
  });

  it('uses OD_BIN as a fallback override for bundled wrapper invocations', () => {
    expect(resolveDaemonCliPath({ OD_BIN: '/app/prebundled/daemon-cli.mjs' })).toBe(
      '/app/prebundled/daemon-cli.mjs',
    );
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
