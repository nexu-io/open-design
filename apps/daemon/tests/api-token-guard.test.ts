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

import http from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isApiAuthDisabled, isApiTokenMiddlewareEnabled } from '../src/api-token-auth.js';
import { startServer } from '../src/server.js';

const PREVIOUS_TOKEN = process.env.OD_API_TOKEN;
const PREVIOUS_HOST  = process.env.OD_BIND_HOST;
const PREVIOUS_DISABLE_API_AUTH = process.env.OD_DISABLE_API_AUTH;

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
      server: http.Server;
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
      server: http.Server;
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

  it('accepts [::1] IPv6-loopback Host header as local without bearer', async () => {
    // Connect to 127.0.0.1 (so remoteAddress is loopback) but send
    // Host: [::1]:<port>, which the naive split(':')[0] would turn into
    // just '[' — the fix must parse it via normalizeLocalAuthority.
    const url = new URL(baseUrl);
    const resp = await new Promise<http.IncomingMessage>((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: Number(url.port),
        path: '/api/plugins',
        method: 'GET',
        headers: { Host: `[::1]:${url.port}` },
      }, resolve);
      req.on('error', reject);
      req.end();
    });
    expect(resp.statusCode).toBe(200);
    resp.resume();
  });

  it('POST /api/auth/set-token-cookie sets od-api-token cookie with valid bearer', async () => {
    const url = new URL(baseUrl);
    // Use http.request with a public-domain Host header so the
    // middleware actively verifies the Bearer token before the
    // handler sets the cookie.
    const resp = await new Promise<http.IncomingMessage>((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: Number(url.port),
        path: '/api/auth/set-token-cookie',
        method: 'POST',
        headers: {
          Host: `example.com:${url.port}`,
          Authorization: 'Bearer secret-test-token',
        },
      }, resolve);
      req.on('error', reject);
      req.end();
    });
    expect(resp.statusCode).toBe(200);
    const body = await new Response(resp).json();
    expect(body as Record<string, unknown>).toEqual({ ok: true });

    // Verify the Set-Cookie header contains the httpOnly cookie
    const setCookie = resp.headers['set-cookie'] || resp.headers['Set-Cookie'] || '';
    const cookieHeader = Array.isArray(setCookie) ? setCookie.join(', ') : String(setCookie);
    expect(cookieHeader).toContain('od-api-token=');
    expect(cookieHeader).toContain('HttpOnly');
    expect(cookieHeader).toContain('SameSite=Strict');
    expect(cookieHeader).toContain('Path=/');
  });

  it('POST /api/auth/set-token-cookie rejects without bearer', async () => {
    const url = new URL(baseUrl);
    // Use http.request with a public-domain Host header so
    // isLocalConnection returns false and the middleware actively
    // checks the Bearer token.
    const resp = await new Promise<http.IncomingMessage>((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: Number(url.port),
        path: '/api/auth/set-token-cookie',
        method: 'POST',
        headers: { Host: `example.com:${url.port}` },
      }, resolve);
      req.on('error', reject);
      req.end();
    });
    expect(resp.statusCode).toBe(401);
    resp.resume();
  });

  it('POST /api/auth/set-token-cookie rejects with wrong bearer', async () => {
    const url = new URL(baseUrl);
    const resp = await new Promise<http.IncomingMessage>((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: Number(url.port),
        path: '/api/auth/set-token-cookie',
        method: 'POST',
        headers: {
          Host: `example.com:${url.port}`,
          Authorization: 'Bearer wrong-token',
        },
      }, resolve);
      req.on('error', reject);
      req.end();
    });
    expect(resp.statusCode).toBe(401);
    resp.resume();
  });

  it('guarded static route loads after set-token-cookie mints the cookie', async () => {
    const url = new URL(baseUrl);

    // Step 1: mint the cookie via POST /api/auth/set-token-cookie
    const cookieResp = await new Promise<http.IncomingMessage>((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: Number(url.port),
        path: '/api/auth/set-token-cookie',
        method: 'POST',
        headers: {
          Host: `example.com:${url.port}`,
          Authorization: 'Bearer secret-test-token',
        },
      }, resolve);
      req.on('error', reject);
      req.end();
    });
    const rawCookie = (Array.isArray(cookieResp.headers['set-cookie'])
      ? cookieResp.headers['set-cookie'][0]
      : cookieResp.headers['set-cookie']) as string | undefined;
    expect(rawCookie).toBeDefined();
    // Strip attributes (HttpOnly, Path, SameSite) — the browser only sends
    // the name=value portion on subsequent requests.
    const cookieValue = rawCookie!.split(';')[0];
    expect(cookieValue).toMatch(/^od-api-token=.+/);
    cookieResp.resume();

    // Step 2: immediately request a guarded static asset with the cookie
    // but NO Bearer header — simulate the browser navigation race.
    // If the cookie is not yet set the response is 401; if it IS set
    // the guard passes and express.static returns 404 (no such file).
    const staticResp = await new Promise<http.IncomingMessage>((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: Number(url.port),
        path: '/frames/nonexistent-test-file',
        method: 'GET',
        headers: {
          Host: `example.com:${url.port}`,
          Cookie: cookieValue!,
        },
      }, resolve);
      req.on('error', reject);
      req.end();
    });
    // 401 = the guard rejected (failure); 404 = guard passed (success)
    expect(staticResp.statusCode).not.toBe(401);
    expect(staticResp.statusCode).toBe(404);
    staticResp.resume();
  });
});
