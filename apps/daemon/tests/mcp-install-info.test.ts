// @ts-nocheck
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import express from 'express';
import { SIDECAR_DEFAULTS, SIDECAR_ENV } from '@open-design/sidecar-proto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { isLocalSameOrigin } from '../src/origin-validation.js';
import { buildMcpInstallPayload } from '../src/mcp-install-info.js';

// The install-info endpoint is a self-contained handler that resolves
// absolute paths to node + cli.js so the Settings → MCP server panel
// can render snippets that work regardless of PATH. We re-build a
// minimal Express app rather than booting the full daemon (which needs
// SQLite, sidecar, fs scaffolding), but the payload itself is built by
// the same exported helper the production handler uses, so any shape
// divergence (env, args, buildHint) would fail this test.

interface InstallInfoOpts {
  cliPath: string;
  port: number;
  /** Stand-in for `process.env`. Lets each test simulate sidecar vs
   *  non-sidecar daemon launches and custom namespaces without
   *  mutating the real process env. */
  env?: NodeJS.ProcessEnv;
  /** Stand-in for the daemon's resolved RUNTIME_DATA_DIR (issue #848).
   *  Pinned in the snippet env so IDE-spawned MCP processes write to
   *  the same directory the daemon already uses. */
  dataDir: string;
}

function makeInstallInfoApp({ cliPath, port, env = {}, dataDir }: InstallInfoOpts) {
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

    // Mirror the production handler's sidecar detection so this test
    // exercises the same path; the helper below is the same one
    // server.ts calls.
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
    const payload = buildMcpInstallPayload({
      cliPath,
      cliExists: fs.existsSync(cliPath),
      execPath: process.execPath,
      nodeExists: fs.existsSync(process.execPath),
      port,
      platform: process.platform,
      dataDir,
      electronAsNode: env.ELECTRON_RUN_AS_NODE === '1',
      isSidecarMode,
      sidecarEnv,
    });
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

async function startHarness(
  cliPath: string,
  env: NodeJS.ProcessEnv,
  dataDir: string,
): Promise<Harness> {
  // Pick a free port first so the handler can compare against it for
  // isLocalSameOrigin.
  const port: number = await new Promise((resolveListen) => {
    const tmp = http.createServer();
    tmp.listen(0, '127.0.0.1', () => {
      const p = (tmp.address() as { port: number }).port;
      tmp.close(() => resolveListen(p));
    });
  });
  const app = makeInstallInfoApp({ cliPath, port, env, dataDir });
  const server: http.Server = await new Promise((resolveStart) => {
    const handle = app.listen(port, '127.0.0.1', () => resolveStart(handle));
  });
  return { app, server, port, baseUrl: `http://127.0.0.1:${port}` };
}

describe('GET /api/mcp/install-info', () => {
  let tmpDir: string;
  let cliPath: string;
  let dataDir: string;
  // Tests share the tmpDir but each top-level case spins its own
  // app instance so different env configurations stay isolated.
  let nonSidecar: { server: http.Server; port: number; app: express.Express };

  beforeAll(
    () =>
      new Promise<void>((resolveBoot) => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-mcp-info-'));
        cliPath = path.join(tmpDir, 'cli.js');
        fs.writeFileSync(cliPath, '// stub\n', 'utf8');
        dataDir = path.join(tmpDir, 'data');
        fs.mkdirSync(dataDir, { recursive: true });
        const tmp = http.createServer();
        tmp.listen(0, '127.0.0.1', () => {
          const port = (tmp.address() as { port: number }).port;
          tmp.close(() => {
            const app = makeInstallInfoApp({ cliPath, port, env: {}, dataDir });
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

  afterEach(() => {
    delete process.env.OD_ALLOWED_ORIGINS;
    delete process.env.OD_BIND_HOST;
  });

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
    // env always carries OD_DATA_DIR (issue #848); no sidecar keys in
    // a non-sidecar launch.
    expect(body.env).toEqual({ OD_DATA_DIR: dataDir });
    expect(body.daemonUrl).toBe(`http://127.0.0.1:${port}`);
    expect(body.platform).toBe(process.platform);
    expect(body.cliExists).toBe(true);
    expect(body.nodeExists).toBe(true);
    expect(body.buildHint).toBeNull();
  });

  it('pins OD_DATA_DIR in the env so IDE-spawned MCP processes write to the daemon data dir (issue #848)', async () => {
    const { port } = nonSidecar;
    const res = await fetch(`http://127.0.0.1:${port}/api/mcp/install-info`);
    const body = await res.json();
    expect(body.env).toBeDefined();
    expect(body.env.OD_DATA_DIR).toBe(dataDir);
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

  it('accepts explicitly configured deployment origins', async () => {
    const { port } = nonSidecar;
    process.env.OD_ALLOWED_ORIGINS = `https://od.example.com,http://203.0.113.10:${port}`;
    const res = await fetch(`http://127.0.0.1:${port}/api/mcp/install-info`, {
      headers: {
        Host: 'od.example.com',
        Origin: 'https://od.example.com',
      },
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

  it('sidecar default namespace omits --daemon-url and emits only OD_DATA_DIR', async () => {
    const { port, server } = await startHarness(
      cliPath,
      {
        [SIDECAR_ENV.IPC_PATH]: '/tmp/open-design/ipc/default/daemon.sock',
        [SIDECAR_ENV.NAMESPACE]: SIDECAR_DEFAULTS.namespace,
      },
      dataDir,
    );
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/mcp/install-info`);
      const body = await res.json();
      expect(body.args).toEqual([cliPath, 'mcp']);
      // Default namespace + default IPC base means the spawned `od mcp`
      // can derive the right socket without any sidecar env hints. The
      // OD_DATA_DIR pin still rides along so the data dir is correct.
      expect(body.env).toEqual({ OD_DATA_DIR: dataDir });
    } finally {
      await new Promise<void>((done) => server?.close(() => done()));
    }
  });

  it('sidecar non-default namespace propagates OD_SIDECAR_NAMESPACE alongside OD_DATA_DIR', async () => {
    const { port, server } = await startHarness(
      cliPath,
      {
        [SIDECAR_ENV.IPC_PATH]: '/tmp/open-design/ipc/foo/daemon.sock',
        [SIDECAR_ENV.NAMESPACE]: 'foo',
      },
      dataDir,
    );
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/mcp/install-info`);
      const body = await res.json();
      expect(body.args).toEqual([cliPath, 'mcp']);
      // Without this propagation the MCP client would launch `od mcp`
      // with no namespace env, fall back to "default", and miss the
      // foo daemon entirely.
      expect(body.env).toEqual({
        OD_DATA_DIR: dataDir,
        [SIDECAR_ENV.NAMESPACE]: 'foo',
      });
    } finally {
      await new Promise<void>((done) => server?.close(() => done()));
    }
  });

  it('sidecar with custom IPC base propagates OD_SIDECAR_IPC_BASE alongside OD_DATA_DIR', async () => {
    const { port, server } = await startHarness(
      cliPath,
      {
        [SIDECAR_ENV.IPC_PATH]: '/var/run/open-design/foo/daemon.sock',
        [SIDECAR_ENV.NAMESPACE]: 'foo',
        [SIDECAR_ENV.IPC_BASE]: '/var/run/open-design',
      },
      dataDir,
    );
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/mcp/install-info`);
      const body = await res.json();
      expect(body.env).toEqual({
        OD_DATA_DIR: dataDir,
        [SIDECAR_ENV.NAMESPACE]: 'foo',
        [SIDECAR_ENV.IPC_BASE]: '/var/run/open-design',
      });
    } finally {
      await new Promise<void>((done) => server?.close(() => done()));
    }
  });
});
