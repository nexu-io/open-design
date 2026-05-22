// Plan §3.K1 / spec §15.7 — bound-API-token guard.
//
// Two halves:
//   1. The daemon refuses to start with OD_BIND_HOST=0.0.0.0 when no
//      OD_API_TOKEN is set.
//   2. When OD_API_TOKEN is set, every /api/* request from a non-loopback
//      peer must carry `Authorization: Bearer <OD_API_TOKEN>`. The
//      health/version/status probes stay open for monitoring.
//
// Tests force the bearer-required code path by stamping the env vars
// before startServer. The daemon listens on 127.0.0.1 throughout (so
// the "refuse 0.0.0.0 without token" path is exercised by a separate
// negative case that constructs the start call directly).

import type http from 'node:http';
import os from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isOpenApiProbePath, startServer } from '../src/server.js';

const PREVIOUS_TOKEN = process.env.OD_API_TOKEN;
const PREVIOUS_HOST  = process.env.OD_BIND_HOST;

let server: http.Server | undefined;
let baseUrl = '';
let shutdown: (() => Promise<void> | void) | undefined;

afterEach(async () => {
  if (shutdown) await Promise.resolve(shutdown());
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = undefined;
  shutdown = undefined;
  if (PREVIOUS_TOKEN === undefined) delete process.env.OD_API_TOKEN;
  else process.env.OD_API_TOKEN = PREVIOUS_TOKEN;
  if (PREVIOUS_HOST === undefined) delete process.env.OD_BIND_HOST;
  else process.env.OD_BIND_HOST = PREVIOUS_HOST;
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
      server: http.Server;
      shutdown?: () => Promise<void> | void;
    };
    server = started.server;
    shutdown = started.shutdown;
    baseUrl = started.url;
    expect(baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:/);
  });
});

describe('bearer middleware', () => {
  beforeEach(async () => {
    process.env.OD_API_TOKEN = 'secret-test-token';
    const started = (await startServer({ port: 0, host: '127.0.0.1', returnServer: true })) as {
      url: string;
      server: http.Server;
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

  it('keeps health / version / daemon-status open without a bearer', async () => {
    for (const path of ['/api/health', '/api/version', '/api/daemon/status']) {
      const resp = await fetch(`${baseUrl}${path}`);
      expect(resp.status).toBe(200);
    }
  });

});

// Deterministic unit tests for the probe-path helper — always run regardless
// of what network interfaces the machine has.
describe('isOpenApiProbePath', () => {
  it('accepts the three stripped probe paths', () => {
    expect(isOpenApiProbePath('/health')).toBe(true);
    expect(isOpenApiProbePath('/version')).toBe(true);
    expect(isOpenApiProbePath('/daemon/status')).toBe(true);
  });

  it('rejects /api/-prefixed paths (regression: set used /api/health before fix)', () => {
    expect(isOpenApiProbePath('/api/health')).toBe(false);
    expect(isOpenApiProbePath('/api/version')).toBe(false);
    expect(isOpenApiProbePath('/api/daemon/status')).toBe(false);
  });

  it('rejects other api paths', () => {
    expect(isOpenApiProbePath('/agents')).toBe(false);
    expect(isOpenApiProbePath('/plugins')).toBe(false);
    expect(isOpenApiProbePath('')).toBe(false);
  });
});

// Integration test: connect via a real non-loopback IP so the loopback
// short-circuit is skipped and isOpenApiProbePath is the only bypass.
// Skipped explicitly when the machine has no external IPv4 interface.
const nonLoopbackIp = (Object.values(os.networkInterfaces()) as os.NetworkInterfaceInfo[][])
  .flat()
  .find((a) => a && !a.internal && a.family === 'IPv4')?.address ?? null;

describe.skipIf(!nonLoopbackIp)('bearer middleware — non-loopback probe path bypass', () => {
  beforeEach(async () => {
    process.env.OD_API_TOKEN = 'secret-test-token';
    const started = (await startServer({ port: 0, host: '0.0.0.0', returnServer: true })) as {
      url: string; server: http.Server; shutdown?: () => Promise<void> | void;
    };
    server = started.server;
    shutdown = started.shutdown;
    baseUrl = `http://${nonLoopbackIp}:${(server.address() as { port: number }).port}`;
  });

  it('probe paths return 200 without a bearer (non-loopback connection)', async () => {
    for (const path of ['/api/health', '/api/version', '/api/daemon/status']) {
      const resp = await fetch(`${baseUrl}${path}`);
      expect(resp.status).toBe(200);
    }
  });

  it('non-probe paths return 401 without a bearer (non-loopback connection)', async () => {
    const resp = await fetch(`${baseUrl}/api/agents`);
    expect(resp.status).toBe(401);
  });
});
