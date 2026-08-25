// Plan §3.K1 / spec §15.7 — bound-API-token guard.
//
// Two halves:
//   1. The daemon refuses to start with OD_BIND_HOST=0.0.0.0 when no
//      OD_API_TOKEN is set.
//   2. When OD_API_TOKEN is set, every /api/* request from a non-loopback
//      peer must carry `Authorization: Bearer <OD_API_TOKEN>`. The
//      health/readiness/version probes stay open for monitoring.
//
// Tests force the bearer-required code path by stamping the env vars
// before startServer. The daemon listens on 127.0.0.1 throughout (so
// the "refuse 0.0.0.0 without token" path is exercised by a separate
// negative case that constructs the start call directly).

import { request as httpRequest, type OutgoingHttpHeaders, type Server } from 'node:http';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isApiAuthDisabled, isApiTokenMiddlewareEnabled } from '../src/api-token-auth.js';
import { startServer } from '../src/server.js';

const PREVIOUS_TOKEN = process.env.OD_API_TOKEN;
const PREVIOUS_HOST  = process.env.OD_BIND_HOST;
const PREVIOUS_DISABLE_API_AUTH = process.env.OD_DISABLE_API_AUTH;

let server: Server | undefined;
let baseUrl = '';
let shutdown: (() => Promise<void> | void) | undefined;
let staticDir: string | undefined;

function makeConnectionsAppearNonLoopback(target: Server): void {
  target.prependListener('connection', (socket) => {
    Object.defineProperty(socket, 'remoteAddress', {
      configurable: true,
      value: '172.18.0.1',
    });
  });
}

function requestWithBrowserHeaders(
  url: string,
  headers: OutgoingHttpHeaders,
): Promise<{ body: string; status: number | undefined }> {
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: target.hostname,
        port: target.port,
        path: target.pathname + target.search,
        method: 'GET',
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            body: Buffer.concat(chunks).toString('utf8'),
            status: res.statusCode,
          });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

afterEach(async () => {
  if (shutdown) await Promise.resolve(shutdown());
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = undefined;
  shutdown = undefined;
  if (staticDir) rmSync(staticDir, { force: true, recursive: true });
  staticDir = undefined;
  if (PREVIOUS_TOKEN === undefined) delete process.env.OD_API_TOKEN;
  else process.env.OD_API_TOKEN = PREVIOUS_TOKEN;
  if (PREVIOUS_HOST === undefined) delete process.env.OD_BIND_HOST;
  else process.env.OD_BIND_HOST = PREVIOUS_HOST;
  if (PREVIOUS_DISABLE_API_AUTH === undefined) delete process.env.OD_DISABLE_API_AUTH;
  else process.env.OD_DISABLE_API_AUTH = PREVIOUS_DISABLE_API_AUTH;
});

describe('bound-API-token guard', () => {
  it('refuses to start with OD_BIND_HOST=0.0.0.0 when OD_API_TOKEN is unset', async () => {
    delete process.env.OD_API_TOKEN;
    await expect(startServer({ port: 0, host: '0.0.0.0', returnServer: true }))
      .rejects.toThrow(/OD_API_TOKEN/);
  });

  it('starts on a public host when OD_API_TOKEN is set', async () => {
    process.env.OD_API_TOKEN = 'test-token-abc';
    // Bind to 127.0.0.1 (loopback) but pretend we crossed the guard
    // by setting the env var; the assertion is that startup succeeds.
    const started = (await startServer({ port: 0, host: '127.0.0.1', returnServer: true })) as {
      url: string;
      server: Server;
      shutdown?: () => Promise<void> | void;
    };
    server = started.server;
    shutdown = started.shutdown;
    baseUrl = started.url;
    expect(baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:/);
  });

  it('starts on a public host without OD_API_TOKEN when OD_DISABLE_API_AUTH=1', async () => {
    delete process.env.OD_API_TOKEN;
    process.env.OD_DISABLE_API_AUTH = '1';
    const started = (await startServer({ port: 0, host: '0.0.0.0', returnServer: true })) as {
      server: Server;
      shutdown?: () => Promise<void> | void;
    };
    server = started.server;
    shutdown = started.shutdown;
  });
});

describe('bearer middleware', () => {
  beforeEach(async () => {
    process.env.OD_API_TOKEN = 'secret-test-token';
    const started = (await startServer({ port: 0, host: '127.0.0.1', returnServer: true })) as {
      url: string;
      server: Server;
      shutdown?: () => Promise<void> | void;
    };
    baseUrl = started.url;
    server = started.server;
    shutdown = started.shutdown;
  });

  it('accepts loopback callers without a bearer (desktop UI flow)', async () => {
    // The HTTP test client is on the same machine → req.socket.remoteAddress
    // is 127.0.0.1 → middleware short-circuits.
    const resp = await fetch(`${baseUrl}/api/plugins`);
    expect(resp.status).toBe(200);
  });

  it('keeps health / readiness / version probes open without a bearer', async () => {
    for (const path of ['/api/health', '/api/ready', '/api/version']) {
      const resp = await fetch(`${baseUrl}${path}`);
      expect(resp.status).toBe(200);
    }
  });

  it('disables bearer middleware when OD_DISABLE_API_AUTH=1 even if OD_API_TOKEN is set', () => {
    expect(
      isApiTokenMiddlewareEnabled({
        ...process.env,
        OD_API_TOKEN: 'secret-test-token',
        OD_DISABLE_API_AUTH: '1',
      }),
    ).toBe(false);
    expect(
      isApiAuthDisabled({
        ...process.env,
        OD_DISABLE_API_AUTH: '1',
      }),
    ).toBe(true);
  });
});

describe('browser authentication for non-loopback Docker peers', () => {
  beforeEach(async () => {
    process.env.OD_API_TOKEN = 'secret-test-token';
    staticDir = mkdtempSync(path.join(os.tmpdir(), 'od-api-token-static-'));
    writeFileSync(path.join(staticDir, 'index.html'), '<!doctype html><div>docker shell</div>');

    const started = (await startServer({
      port: 0,
      host: '127.0.0.1',
      returnServer: true,
      staticDir,
    })) as {
      url: string;
      server: Server;
      shutdown?: () => Promise<void> | void;
    };
    baseUrl = started.url;
    server = started.server;
    shutdown = started.shutdown;
    makeConnectionsAppearNonLoopback(server);
  });

  it('authenticates the browser without weakening API clients or probes', async () => {
    const unauthenticatedShell = await fetch(`${baseUrl}/`);
    expect(unauthenticatedShell.status).toBe(401);
    expect(unauthenticatedShell.headers.get('www-authenticate')).toBe(
      'Basic realm="OpenDesign", charset="UTF-8"',
    );
    expect(unauthenticatedShell.headers.get('set-cookie')).toBeNull();
    expect(await unauthenticatedShell.text()).not.toContain('docker shell');

    const credentials = Buffer.from('open-design:secret-test-token').toString('base64');
    const basicApiResp = await fetch(`${baseUrl}/api/plugins`, {
      headers: { authorization: `Basic ${credentials}` },
    });
    expect(basicApiResp.status).toBe(200);

    const authenticatedShell = await fetch(`${baseUrl}/`, {
      headers: { authorization: `Basic ${credentials}` },
    });
    expect(authenticatedShell.status).toBe(200);
    expect(await authenticatedShell.text()).toContain('docker shell');

    const bearerResp = await fetch(`${baseUrl}/api/plugins`, {
      headers: { authorization: 'Bearer secret-test-token' },
    });
    expect(bearerResp.status).toBe(200);

    for (const probePath of ['/api/health', '/api/ready', '/api/version']) {
      const probeResp = await fetch(`${baseUrl}${probePath}`);
      expect(probeResp.status).toBe(200);
    }

    const invalidCredentials = [
      undefined,
      `Basic ${Buffer.from('open-design:wrong-token').toString('base64')}`,
      `Basic ${Buffer.from('admin:secret-test-token').toString('base64')}`,
      'Basic not-base64!',
      'Bearer wrong-token',
    ];

    for (const authorization of invalidCredentials) {
      const resp = await fetch(`${baseUrl}/api/plugins`, {
        ...(authorization ? { headers: { authorization } } : {}),
      });

      expect(resp.status).toBe(401);
      expect(resp.headers.get('www-authenticate')).toBe(
        'Basic realm="OpenDesign", charset="UTF-8"',
      );
    }
  });

  it('keeps the documented Docker browser host separate from powered previews', async () => {
    if (shutdown) await Promise.resolve(shutdown());
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
    shutdown = undefined;
    if (!staticDir) throw new Error('Expected Docker browser static fixture directory');

    const started = (await startServer({
      port: 0,
      host: '0.0.0.0',
      returnServer: true,
      staticDir,
    })) as {
      url: string;
      server: Server;
      shutdown?: () => Promise<void> | void;
    };
    baseUrl = started.url;
    server = started.server;
    shutdown = started.shutdown;
    makeConnectionsAppearNonLoopback(server);

    const port = new URL(baseUrl).port;
    const credentials = Buffer.from('open-design:secret-test-token').toString('base64');
    const browserHeaders = {
      authorization: `Basic ${credentials}`,
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
    };

    const documentedHost = await requestWithBrowserHeaders(`${baseUrl}/api/plugins`, {
      ...browserHeaders,
      host: `127.0.0.1:${port}`,
    });
    expect(documentedHost.status).toBe(200);

    const poweredPreviewHost = await requestWithBrowserHeaders(`${baseUrl}/api/plugins`, {
      ...browserHeaders,
      host: `localhost:${port}`,
    });
    expect(poweredPreviewHost.status).toBe(403);
    expect(JSON.parse(poweredPreviewHost.body)).toEqual({
      error: 'Powered preview origin cannot access this API route',
    });
  });
});
