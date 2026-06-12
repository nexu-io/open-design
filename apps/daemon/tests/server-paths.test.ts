import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  resolveDaemonCliPath,
  resolveDaemonPluginPreviewsDir,
  resolveDaemonResourceRoot,
  resolveProjectRoot,
} from '../src/server.js';

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

  it('allows packaged launcher payload resources under the installation root', () => {
    const installationRoot = path.resolve(import.meta.dirname, '..', 'fixtures', 'installation');
    const configured = path.join(
      installationRoot,
      'launcher',
      'channels',
      'beta',
      'namespaces',
      'release-beta',
      'versions',
      '0.10.0-beta.15',
      'payload',
      'Open Design Beta.app',
      'Contents',
      'Resources',
      'open-design',
    );

    expect(resolveDaemonResourceRoot({ configured, safeBases: [installationRoot] })).toBe(configured);
  });

  it('rejects resource roots outside the safe bases', () => {
    const safeBase = path.resolve(import.meta.dirname, '..', 'fixtures', 'resources');
    const configured = path.resolve(import.meta.dirname, '..', 'fixtures-other', 'resources');

    expect(() => resolveDaemonResourceRoot({ configured, safeBases: [safeBase] })).toThrow(
      /OD_RESOURCE_ROOT must be under/,
    );
  });
});

describe('resolveDaemonPluginPreviewsDir', () => {
  it('resolves under the resource root in the packaged layout', () => {
    // Packaged: the prebundled daemon's PROJECT_ROOT is Resources/app (no data/),
    // but the bundled manifest lives under OD_RESOURCE_ROOT (Resources/open-design).
    const resourceRoot = '/Applications/Open Design.app/Contents/Resources/open-design';
    const projectRoot = '/Applications/Open Design.app/Contents/Resources/app';

    expect(
      resolveDaemonPluginPreviewsDir({ env: {}, resourceRoot, projectRoot }),
    ).toBe(path.join(resourceRoot, 'data', 'plugin-previews'));
  });

  it('falls back to the project root in the dev layout (no resource root)', () => {
    const projectRoot = path.resolve(import.meta.dirname, '../../..');

    expect(
      resolveDaemonPluginPreviewsDir({ env: {}, resourceRoot: undefined, projectRoot }),
    ).toBe(path.join(projectRoot, 'data', 'plugin-previews'));
  });

  it('honors an OD_PLUGIN_PREVIEWS_DIR override from the injected env', () => {
    const projectRoot = '/repo';

    // Absolute override passes through; a relative one resolves against projectRoot.
    expect(
      resolveDaemonPluginPreviewsDir({
        env: { OD_PLUGIN_PREVIEWS_DIR: '/abs/previews' },
        resourceRoot: '/res/open-design',
        projectRoot,
      }),
    ).toBe('/abs/previews');
    expect(
      resolveDaemonPluginPreviewsDir({
        env: { OD_PLUGIN_PREVIEWS_DIR: 'rel/previews' },
        resourceRoot: '/res/open-design',
        projectRoot,
      }),
    ).toBe(path.join(projectRoot, 'rel', 'previews'));
  });
});
