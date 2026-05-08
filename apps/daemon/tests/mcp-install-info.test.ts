// @ts-nocheck
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SIDECAR_DEFAULTS, SIDECAR_ENV } from '@open-design/sidecar-proto';
import { isLocalSameOrigin } from '../src/server.js';

// The install-info endpoint is a self-contained handler that resolves
// absolute paths to node + cli.js so the Settings → MCP server panel
// can render snippets that work regardless of PATH. We re-build a
// minimal Express app with the same handler shape rather than booting
// the full daemon (which needs SQLite, sidecar, fs scaffolding).

interface InstallInfoOpts {
  cliPath: string;
  port: number;
  /** Stand-in for `process.env`. Lets each test simulate sidecar vs
   *  non-sidecar daemon launches and custom namespaces without
   *  mutating the real process env. */
  env?: NodeJS.ProcessEnv;
}

function makeInstallInfoApp({ cliPath, port, env = {} }: InstallInfoOpts) {
  const app = express();

  const TTL_MS = 5000;
  let cache: { t: number; payload: object } | null = null;
  let resolveCalls = 0;

  app.get('/api/mcp/install-info', (req, res) => {
    if (!isLocalSameOrigin(req, port)) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    const now = Date.now();
    if (cache && now - cache.t < TTL_MS) {
      return res.json(cache.payload);
    }
    resolveCalls += 1;
    const cliExists = fs.existsSync(cliPath);
    const nodeExists = fs.existsSync(process.execPath);
    const hints: string[] = [];
    if (!cliExists) hints.push('cli missing');
    if (!nodeExists) hints.push('node missing');

    // Mirror the production handler in apps/daemon/src/server.ts:
    // sidecar-bootstrapped daemons rely on IPC discovery in `od mcp`
    // and propagate namespace / IPC base through the snippet env;
    // non-sidecar (direct `od --port X`) launches bake the URL.
    const sidecarIpcPath = env[SIDECAR_ENV.IPC_PATH];
    const isSidecarMode = sidecarIpcPath != null && sidecarIpcPath.length > 0;
    const sidecarEnv: Record<string, string> = {};
    if (isSidecarMode) {
      const ns = env[SIDECAR_ENV.NAMESPACE];
      if (ns != null && ns !== SIDECAR_DEFAULTS.namespace) {
        sidecarEnv[SIDECAR_ENV.NAMESPACE] = ns;
      }
      const ipcBase = env[SIDECAR_ENV.IPC_BASE];
      if (ipcBase != null && ipcBase.length > 0) {
        sidecarEnv[SIDECAR_ENV.IPC_BASE] = ipcBase;
      }
    }
    const electronEnv = env.ELECTRON_RUN_AS_NODE === '1'
      ? { ELECTRON_RUN_AS_NODE: '1' }
      : null;
    const snippetEnv = { ...sidecarEnv, ...(electronEnv ?? {}) };
    const args = isSidecarMode
      ? [cliPath, 'mcp']
      : [cliPath, 'mcp', '--daemon-url', `http://127.0.0.1:${port}`];
    const payload = {
      command: process.execPath,
      args,
      ...(Object.keys(snippetEnv).length > 0 ? { env: snippetEnv } : {}),
      daemonUrl: `http://127.0.0.1:${port}`,
      platform: process.platform,
      cliExists,
      nodeExists,
      buildHint: hints.length ? hints.join(' ') : null,
    };
    cache = { t: now, payload };
    res.json(payload);
  });

  // Test-only escape hatch so assertions can prove the cache cold-paths.
  (app as any)._resolveCalls = () => resolveCalls;
  return app;
}

interface Harness {
  app: express.Express;
  server: http.Server;
  port: number;
  baseUrl: string;
}

async function startHarness(cliPath: string, env: NodeJS.ProcessEnv): Promise<Harness> {
  // Pick a free port first so the handler can compare against it for
  // isLocalSameOrigin.
  const port: number = await new Promise((resolveListen) => {
    const tmp = http.createServer();
    tmp.listen(0, '127.0.0.1', () => {
      const p = (tmp.address() as { port: number }).port;
      tmp.close(() => resolveListen(p));
    });
  });
  const app = makeInstallInfoApp({ cliPath, port, env });
  const server: http.Server = await new Promise((resolveStart) => {
    const handle = app.listen(port, '127.0.0.1', () => resolveStart(handle));
  });
  return { app, server, port, baseUrl: `http://127.0.0.1:${port}` };
}

describe('GET /api/mcp/install-info', () => {
  let tmpDir: string;
  let cliPath: string;
  // Tests share the tmpDir but each top-level case spins its own
  // app instance so different env configurations stay isolated.
  let nonSidecar: { server: http.Server; port: number; app: express.Express };

  beforeAll(
    () =>
      new Promise<void>((resolveBoot) => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-mcp-info-'));
        cliPath = path.join(tmpDir, 'cli.js');
        fs.writeFileSync(cliPath, '// stub\n', 'utf8');
        const tmp = http.createServer();
        tmp.listen(0, '127.0.0.1', () => {
          const port = (tmp.address() as { port: number }).port;
          tmp.close(() => {
            const app = makeInstallInfoApp({ cliPath, port, env: {} });
            const server = app.listen(port, '127.0.0.1', () => {
              nonSidecar = { server, port, app };
              resolveBoot();
            });
          });
        });
      }),
  );

  afterAll(
    () =>
      new Promise<void>((resolve) => {
        nonSidecar.server.close(() => {
          fs.rmSync(tmpDir, { recursive: true, force: true });
          resolve();
        });
      }),
  );

  it('non-sidecar launch bakes --daemon-url so custom ports keep working', async () => {
    const { port } = nonSidecar;
    const res = await fetch(`http://127.0.0.1:${port}/api/mcp/install-info`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.command).toBe(process.execPath);
    // Direct `od` launches have no IPC socket; the snippet bakes the
    // URL so the spawned `od mcp` reaches the right port without any
    // discovery.
    expect(body.args).toEqual([cliPath, 'mcp', '--daemon-url', `http://127.0.0.1:${port}`]);
    expect(body.env).toBeUndefined();
    expect(body.daemonUrl).toBe(`http://127.0.0.1:${port}`);
    expect(body.platform).toBe(process.platform);
    expect(body.cliExists).toBe(true);
    expect(body.nodeExists).toBe(true);
    expect(body.buildHint).toBeNull();
  });

  it('rejects cross-origin requests with 403', async () => {
    const { port } = nonSidecar;
    const res = await fetch(`http://127.0.0.1:${port}/api/mcp/install-info`, {
      headers: { Origin: 'https://evil.com' },
    });
    expect(res.status).toBe(403);
  });

  it('accepts requests with no Origin header (loopback fetch)', async () => {
    const { port } = nonSidecar;
    const res = await fetch(`http://127.0.0.1:${port}/api/mcp/install-info`);
    expect(res.status).toBe(200);
  });

  it('accepts requests with matching localhost Origin', async () => {
    const { port } = nonSidecar;
    const res = await fetch(`http://127.0.0.1:${port}/api/mcp/install-info`, {
      headers: { Origin: `http://127.0.0.1:${port}` },
    });
    expect(res.status).toBe(200);
  });

  it('caches the payload across rapid calls', async () => {
    const { port, app } = nonSidecar;
    const before = (app as any)._resolveCalls();
    await fetch(`http://127.0.0.1:${port}/api/mcp/install-info`);
    await fetch(`http://127.0.0.1:${port}/api/mcp/install-info`);
    await fetch(`http://127.0.0.1:${port}/api/mcp/install-info`);
    const after = (app as any)._resolveCalls();
    // 3 rapid calls add at most 1 fresh resolve, not 3.
    expect(after - before).toBeLessThanOrEqual(1);
  });

  it('sidecar default namespace omits --daemon-url and emits no env block', async () => {
    const { port, server } = await startHarness(cliPath, {
      [SIDECAR_ENV.IPC_PATH]: '/tmp/open-design/ipc/default/daemon.sock',
      [SIDECAR_ENV.NAMESPACE]: SIDECAR_DEFAULTS.namespace,
    });
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/mcp/install-info`);
      const body = await res.json();
      expect(body.args).toEqual([cliPath, 'mcp']);
      // Default namespace + default IPC base means the spawned `od mcp`
      // can derive the right socket without any env hints.
      expect(body.env).toBeUndefined();
    } finally {
      await new Promise<void>((done) => server?.close(() => done()));
    }
  });

  it('sidecar non-default namespace propagates OD_SIDECAR_NAMESPACE', async () => {
    const { port, server } = await startHarness(cliPath, {
      [SIDECAR_ENV.IPC_PATH]: '/tmp/open-design/ipc/foo/daemon.sock',
      [SIDECAR_ENV.NAMESPACE]: 'foo',
    });
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/mcp/install-info`);
      const body = await res.json();
      expect(body.args).toEqual([cliPath, 'mcp']);
      // Without this propagation the MCP client would launch `od mcp`
      // with no namespace env, fall back to "default", and miss the
      // foo daemon entirely.
      expect(body.env).toEqual({ [SIDECAR_ENV.NAMESPACE]: 'foo' });
    } finally {
      await new Promise<void>((done) => server?.close(() => done()));
    }
  });

  it('sidecar with custom IPC base propagates OD_SIDECAR_IPC_BASE', async () => {
    const { port, server } = await startHarness(cliPath, {
      [SIDECAR_ENV.IPC_PATH]: '/var/run/open-design/foo/daemon.sock',
      [SIDECAR_ENV.NAMESPACE]: 'foo',
      [SIDECAR_ENV.IPC_BASE]: '/var/run/open-design',
    });
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/mcp/install-info`);
      const body = await res.json();
      expect(body.env).toEqual({
        [SIDECAR_ENV.NAMESPACE]: 'foo',
        [SIDECAR_ENV.IPC_BASE]: '/var/run/open-design',
      });
    } finally {
      await new Promise<void>((done) => server?.close(() => done()));
    }
  });
});
