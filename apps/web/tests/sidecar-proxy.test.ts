import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createStandaloneBackendEnv,
  createStandaloneParentMonitorImport,
  createStandaloneServerArgs,
  normalizeDaemonProxyOriginHeader,
  resolveDaemonProxyTarget,
  resolveStandaloneBackendOrigin,
  resolveStandaloneServerEntry,
} from '../sidecar/server';

describe('resolveDaemonProxyTarget', () => {
  it('proxies allowlisted relative paths to the daemon origin', () => {
    const target = resolveDaemonProxyTarget('http://127.0.0.1:7456', '/api/projects?limit=10');

    expect(target?.href).toBe('http://127.0.0.1:7456/api/projects?limit=10');
  });

  it('does not let absolute request URLs replace the daemon origin', () => {
    const target = resolveDaemonProxyTarget(
      'http://127.0.0.1:7456',
      'http://169.254.169.254/api/latest/meta-data?token=1',
    );

    expect(target?.href).toBe('http://127.0.0.1:7456/api/latest/meta-data?token=1');
  });

  it('rejects non-daemon paths', () => {
    expect(resolveDaemonProxyTarget('http://127.0.0.1:7456', '/settings')).toBeNull();
  });
});

describe('resolveStandaloneServerEntry', () => {
  it('resolves the traced monorepo standalone server entry', async () => {
    const previousDistDir = process.env.OD_WEB_DIST_DIR;
    delete process.env.OD_WEB_DIST_DIR;
    const webRoot = await mkdtemp(join(tmpdir(), 'open-design-web-standalone-'));
    const nestedRoot = join(webRoot, '.next', 'standalone', 'apps', 'web');
    const fallbackRoot = join(webRoot, '.next', 'standalone');

    try {
      await mkdir(nestedRoot, { recursive: true });
      await mkdir(fallbackRoot, { recursive: true });
      await writeFile(join(nestedRoot, 'server.js'), '', 'utf8');
      await writeFile(join(fallbackRoot, 'server.js'), '', 'utf8');

      expect(resolveStandaloneServerEntry(webRoot)).toBe(join(nestedRoot, 'server.js'));
    } finally {
      if (previousDistDir == null) {
        delete process.env.OD_WEB_DIST_DIR;
      } else {
        process.env.OD_WEB_DIST_DIR = previousDistDir;
      }
      await rm(webRoot, { force: true, recursive: true });
    }
  });

  it('prefers a copied standalone resource root before package fallback entries', async () => {
    const previousDistDir = process.env.OD_WEB_DIST_DIR;
    delete process.env.OD_WEB_DIST_DIR;
    const webRoot = await mkdtemp(join(tmpdir(), 'open-design-web-package-'));
    const copiedRoot = await mkdtemp(join(tmpdir(), 'open-design-web-copied-'));
    const copiedWebRoot = join(copiedRoot, 'apps', 'web');
    const packageFallbackRoot = join(webRoot, '.next', 'standalone', 'apps', 'web');

    try {
      await mkdir(copiedWebRoot, { recursive: true });
      await mkdir(packageFallbackRoot, { recursive: true });
      await writeFile(join(copiedWebRoot, 'server.js'), '', 'utf8');
      await writeFile(join(packageFallbackRoot, 'server.js'), '', 'utf8');

      expect(resolveStandaloneServerEntry(webRoot, copiedRoot)).toBe(join(copiedWebRoot, 'server.js'));
    } finally {
      if (previousDistDir == null) {
        delete process.env.OD_WEB_DIST_DIR;
      } else {
        process.env.OD_WEB_DIST_DIR = previousDistDir;
      }
      await rm(webRoot, { force: true, recursive: true });
      await rm(copiedRoot, { force: true, recursive: true });
    }
  });

  it('can resolve a copied standalone resource without a web package root', async () => {
    const copiedRoot = await mkdtemp(join(tmpdir(), 'open-design-web-copied-only-'));
    const copiedWebRoot = join(copiedRoot, 'apps', 'web');

    try {
      await mkdir(copiedWebRoot, { recursive: true });
      await writeFile(join(copiedWebRoot, 'server.js'), '', 'utf8');

      expect(resolveStandaloneServerEntry(null, copiedRoot)).toBe(join(copiedWebRoot, 'server.js'));
    } finally {
      await rm(copiedRoot, { force: true, recursive: true });
    }
  });
});

describe('createStandaloneServerArgs', () => {
  it('preloads a parent monitor before running the standalone server entry', () => {
    const args = createStandaloneServerArgs('/tmp/open-design/server.js');

    expect(args).toHaveLength(3);
    expect(args[0]).toBe('--import');
    expect(args[1]).toBe(createStandaloneParentMonitorImport());
    expect(args[2]).toBe('/tmp/open-design/server.js');
  });

  it('uses a data import that exits when the recorded parent disappears', () => {
    const importSpecifier = createStandaloneParentMonitorImport('OD_TEST_PARENT_PID');
    const source = decodeURIComponent(importSpecifier.replace(/^data:text\/javascript,/, ''));

    expect(importSpecifier).toMatch(/^data:text\/javascript,/);
    expect(source).toContain('process.env["OD_TEST_PARENT_PID"]');
    expect(source).toContain('process.ppid === parentPid');
    expect(source).toContain('process.kill(parentPid, 0)');
    expect(source).toContain('process.exit(0)');
  });
});

describe('standalone backend binding', () => {
  it('keeps the hidden standalone backend on loopback even when the public sidecar host is wider', () => {
    const env = createStandaloneBackendEnv({
      baseEnv: { ...process.env, OD_HOST: '0.0.0.0' },
      parentPid: 1234,
      port: 5876,
    });

    expect(resolveStandaloneBackendOrigin(5876)).toBe('http://127.0.0.1:5876');
    expect(env.HOSTNAME).toBe('127.0.0.1');
    expect(env.PORT).toBe('5876');
    expect(env.NODE_ENV).toBe('production');
    expect(env.OD_STANDALONE_PARENT_PID).toBe('1234');
  });
});

describe('normalizeDaemonProxyOriginHeader', () => {
  it('normalizes the current web origin to the daemon origin', () => {
    expect(
      normalizeDaemonProxyOriginHeader({
        daemonOrigin: 'http://127.0.0.1:7456',
        origin: 'http://127.0.0.1:3000',
        webPort: 3000,
      }),
    ).toBe('http://127.0.0.1:7456');
  });

  it('accepts localhost as an equivalent loopback web origin', () => {
    expect(
      normalizeDaemonProxyOriginHeader({
        daemonOrigin: 'http://127.0.0.1:7456',
        origin: 'http://localhost:3000',
        webPort: 3000,
      }),
    ).toBe('http://127.0.0.1:7456');
  });

  it('does not rewrite unrelated browser origins', () => {
    expect(
      normalizeDaemonProxyOriginHeader({
        daemonOrigin: 'http://127.0.0.1:7456',
        origin: 'https://example.com',
        webPort: 3000,
      }),
    ).toBe('https://example.com');
  });

  it('preserves absent and null origins for daemon policy to handle', () => {
    expect(
      normalizeDaemonProxyOriginHeader({
        daemonOrigin: 'http://127.0.0.1:7456',
        origin: undefined,
        webPort: 3000,
      }),
    ).toBeUndefined();
    expect(
      normalizeDaemonProxyOriginHeader({
        daemonOrigin: 'http://127.0.0.1:7456',
        origin: 'null',
        webPort: 3000,
      }),
    ).toBe('null');
  });
});
