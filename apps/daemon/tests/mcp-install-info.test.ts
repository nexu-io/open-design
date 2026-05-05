// @ts-nocheck
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isLocalSameOrigin } from '../src/server.js';

// The install-info endpoint is a self-contained handler that resolves
// absolute paths to node + cli.js so the Settings → MCP server panel
// can render snippets that work regardless of PATH. We re-build a
// minimal Express app with the same handler shape rather than booting
// the full daemon (which needs SQLite, sidecar, fs scaffolding).

interface InstallInfoOpts {
  cliPath: string;
  port: number;
}

function makeInstallInfoApp({ cliPath, port }: InstallInfoOpts) {
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
    const payload = {
      command: process.execPath,
      args: [cliPath, 'mcp', '--daemon-url', `http://127.0.0.1:${port}`],
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

describe('GET /api/mcp/install-info', () => {
  let server: http.Server;
  let baseUrl: string;
  let port: number;
  let tmpDir: string;
  let cliPath: string;
  let app: express.Express;

  beforeAll(
    () =>
      new Promise<void>((resolve) => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-mcp-info-'));
        cliPath = path.join(tmpDir, 'cli.js');
        fs.writeFileSync(cliPath, '// stub\n', 'utf8');
        // listen on a random free port; capture so isLocalSameOrigin
        // can compare the Host header
        const tmp = http.createServer();
        tmp.listen(0, '127.0.0.1', () => {
          port = (tmp.address() as { port: number }).port;
          tmp.close(() => {
            app = makeInstallInfoApp({ cliPath, port });
            server = app.listen(port, '127.0.0.1', () => resolve());
          });
        });
      }),
  );

  afterAll(
    () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          fs.rmSync(tmpDir, { recursive: true, force: true });
          resolve();
        });
      }),
  );

  it('returns command, args, platform, daemonUrl', async () => {
    const res = await fetch(`${baseUrl ?? `http://127.0.0.1:${port}`}/api/mcp/install-info`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.command).toBe(process.execPath);
    expect(body.args).toEqual([cliPath, 'mcp', '--daemon-url', `http://127.0.0.1:${port}`]);
    expect(body.daemonUrl).toBe(`http://127.0.0.1:${port}`);
    expect(body.platform).toBe(process.platform);
    expect(body.cliExists).toBe(true);
    expect(body.nodeExists).toBe(true);
    expect(body.buildHint).toBeNull();
  });

  it('rejects cross-origin requests with 403', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/mcp/install-info`, {
      headers: { Origin: 'https://evil.com' },
    });
    expect(res.status).toBe(403);
  });

  it('accepts requests with no Origin header (loopback fetch)', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/mcp/install-info`);
    expect(res.status).toBe(200);
  });

  it('accepts requests with matching localhost Origin', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/mcp/install-info`, {
      headers: { Origin: `http://127.0.0.1:${port}` },
    });
    expect(res.status).toBe(200);
  });

  it('caches the payload across rapid calls', async () => {
    const before = (app as any)._resolveCalls();
    await fetch(`http://127.0.0.1:${port}/api/mcp/install-info`);
    await fetch(`http://127.0.0.1:${port}/api/mcp/install-info`);
    await fetch(`http://127.0.0.1:${port}/api/mcp/install-info`);
    const after = (app as any)._resolveCalls();
    // The first call may go through or may hit the cache from earlier
    // tests; what matters is that 3 rapid calls add at most 1 fresh
    // resolve, not 3.
    expect(after - before).toBeLessThanOrEqual(1);
  });
});
