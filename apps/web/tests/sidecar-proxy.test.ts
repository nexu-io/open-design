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
  resolveNextBundlerOptions,
  resolveStandaloneBackendOrigin,
  resolveStandaloneServerEntry,
  startWebSidecar,
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

  it('accepts a listening standalone backend before the app root responds to HTTP', async () => {
    const previousOutputMode = process.env.OD_WEB_OUTPUT_MODE;
    const previousStandaloneRoot = process.env.OD_WEB_STANDALONE_ROOT;
    const previousStartupTimeout = process.env.OD_STANDALONE_STARTUP_TIMEOUT_MS;
    const standaloneRoot = await mkdtemp(join(tmpdir(), 'open-design-web-slow-http-'));
    const runtimeRoot = await mkdtemp(join(tmpdir(), 'open-design-web-runtime-'));
    const fakeWebRoot = join(standaloneRoot, 'apps', 'web');

    try {
      await mkdir(fakeWebRoot, { recursive: true });
      await writeFile(
        join(fakeWebRoot, 'server.js'),
        `
import { createServer } from 'node:net';

const server = createServer(() => {
  // Keep accepted sockets open. A TCP readiness probe should pass, but an
  // HTTP HEAD/GET probe against "/" will hang until its client timeout.
});

server.listen(Number(process.env.PORT), process.env.HOSTNAME || '127.0.0.1');
process.on('SIGTERM', () => server.close(() => process.exit(0)));
`,
        'utf8',
      );

      process.env.OD_WEB_OUTPUT_MODE = 'standalone';
      process.env.OD_WEB_STANDALONE_ROOT = standaloneRoot;
      process.env.OD_STANDALONE_STARTUP_TIMEOUT_MS = '3000';

      const handle = await startWebSidecar({
        app: 'web',
        base: runtimeRoot,
        ipc: join(runtimeRoot, 'web.sock'),
        mode: 'runtime',
        namespace: 'slow-http',
        source: 'tools-pack',
      });

      try {
        await expect(handle.status()).resolves.toMatchObject({ state: 'running' });
      } finally {
        await handle.stop();
      }
    } finally {
      if (previousOutputMode == null) delete process.env.OD_WEB_OUTPUT_MODE;
      else process.env.OD_WEB_OUTPUT_MODE = previousOutputMode;
      if (previousStandaloneRoot == null) delete process.env.OD_WEB_STANDALONE_ROOT;
      else process.env.OD_WEB_STANDALONE_ROOT = previousStandaloneRoot;
      if (previousStartupTimeout == null) delete process.env.OD_STANDALONE_STARTUP_TIMEOUT_MS;
      else process.env.OD_STANDALONE_STARTUP_TIMEOUT_MS = previousStartupTimeout;
      await rm(standaloneRoot, { force: true, recursive: true });
      await rm(runtimeRoot, { force: true, recursive: true });
    }
  });

  it('does not treat a hijacked backend port as standalone readiness', async () => {
    const previousOutputMode = process.env.OD_WEB_OUTPUT_MODE;
    const previousStandaloneRoot = process.env.OD_WEB_STANDALONE_ROOT;
    const previousStartupTimeout = process.env.OD_STANDALONE_STARTUP_TIMEOUT_MS;
    const standaloneRoot = await mkdtemp(join(tmpdir(), 'open-design-web-hijacked-port-'));
    const runtimeRoot = await mkdtemp(join(tmpdir(), 'open-design-web-hijacked-runtime-'));
    const fakeWebRoot = join(standaloneRoot, 'apps', 'web');
    let handle: Awaited<ReturnType<typeof startWebSidecar>> | undefined;

    try {
      await mkdir(fakeWebRoot, { recursive: true });
      await writeFile(
        join(fakeWebRoot, 'server.js'),
        `
import { createServer } from 'node:net';

const host = process.env.HOSTNAME || '127.0.0.1';
const port = Number(process.env.PORT);
let sawProbe = false;
const dummyServer = createServer((socket) => {
  socket.end();
  if (!sawProbe) {
    sawProbe = true;
    process.exit(70);
  }
});

dummyServer.listen(port, host, () => {
  const intendedServer = createServer();
  intendedServer.once('error', () => {
    // Keep the dummy listener alive until the readiness probe connects, then
    // surface the failed intended bind like a port-race crash.
  });
  intendedServer.listen(port, host);
});

process.on('SIGTERM', () => dummyServer.close(() => process.exit(0)));
`,
        'utf8',
      );

      process.env.OD_WEB_OUTPUT_MODE = 'standalone';
      process.env.OD_WEB_STANDALONE_ROOT = standaloneRoot;
      process.env.OD_STANDALONE_STARTUP_TIMEOUT_MS = '1000';

      await expect((async () => {
        handle = await startWebSidecar({
          app: 'web',
          base: runtimeRoot,
          ipc: join(runtimeRoot, 'web.sock'),
          mode: 'runtime',
          namespace: 'hijacked-port',
          source: 'tools-pack',
        });
      })()).rejects.toThrow(/standalone Next\.js server exited before readiness/);
    } finally {
      await handle?.stop();
      if (previousOutputMode == null) delete process.env.OD_WEB_OUTPUT_MODE;
      else process.env.OD_WEB_OUTPUT_MODE = previousOutputMode;
      if (previousStandaloneRoot == null) delete process.env.OD_WEB_STANDALONE_ROOT;
      else process.env.OD_WEB_STANDALONE_ROOT = previousStandaloneRoot;
      if (previousStartupTimeout == null) delete process.env.OD_STANDALONE_STARTUP_TIMEOUT_MS;
      else process.env.OD_STANDALONE_STARTUP_TIMEOUT_MS = previousStartupTimeout;
      await rm(standaloneRoot, { force: true, recursive: true });
      await rm(runtimeRoot, { force: true, recursive: true });
    }
  });
});

describe('resolveNextBundlerOptions', () => {
  it('uses webpack for local dev by default to avoid stale Turbopack chunk graphs', () => {
    const previous = process.env.OD_WEB_DEV_BUNDLER;
    delete process.env.OD_WEB_DEV_BUNDLER;

    try {
      expect(resolveNextBundlerOptions(true)).toEqual({ webpack: true });
    } finally {
      if (previous == null) delete process.env.OD_WEB_DEV_BUNDLER;
      else process.env.OD_WEB_DEV_BUNDLER = previous;
    }
  });

  it('lets local developers explicitly opt back into Turbopack', () => {
    const previous = process.env.OD_WEB_DEV_BUNDLER;
    process.env.OD_WEB_DEV_BUNDLER = 'turbopack';

    try {
      expect(resolveNextBundlerOptions(true)).toEqual({ turbopack: true });
    } finally {
      if (previous == null) delete process.env.OD_WEB_DEV_BUNDLER;
      else process.env.OD_WEB_DEV_BUNDLER = previous;
    }
  });

  it('does not force a bundler for production mode', () => {
    expect(resolveNextBundlerOptions(false)).toEqual({});
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

  it('normalizes matching private LAN browser origins to the daemon origin', () => {
    expect(
      normalizeDaemonProxyOriginHeader({
        daemonOrigin: 'http://127.0.0.1:7456',
        origin: 'http://192.168.3.23:8085',
        requestHost: '192.168.3.23:8085',
        webPort: 8085,
      }),
    ).toBe('http://127.0.0.1:7456');
  });

  it('does not normalize mismatched private LAN origins', () => {
    expect(
      normalizeDaemonProxyOriginHeader({
        daemonOrigin: 'http://127.0.0.1:7456',
        origin: 'http://192.168.3.23:8085',
        requestHost: '192.168.3.24:8085',
        webPort: 8085,
      }),
    ).toBe('http://192.168.3.23:8085');
  });

  it('normalizes matching wildcard configured dev origins to the daemon origin', () => {
    const previous = process.env.OD_ALLOWED_DEV_ORIGINS;
    process.env.OD_ALLOWED_DEV_ORIGINS = '*.local-origin.dev';
    try {
      expect(
        normalizeDaemonProxyOriginHeader({
          daemonOrigin: 'http://127.0.0.1:7456',
          origin: 'http://app.local-origin.dev:8085',
          requestHost: 'app.local-origin.dev:8085',
          webPort: 8085,
        }),
      ).toBe('http://127.0.0.1:7456');
    } finally {
      if (previous == null) delete process.env.OD_ALLOWED_DEV_ORIGINS;
      else process.env.OD_ALLOWED_DEV_ORIGINS = previous;
    }
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
