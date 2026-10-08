// Red spec for issue #6074 (HTML instead of JSON on /api/*).
//
// When the web sidecar starts without a usable daemon origin (`OD_PORT`
// missing or 0), `createDaemonProxyHandler` fell `/api`, `/artifacts`, and
// `/frames` requests through to the Next.js fallback, whose catch-all route
// answers every path with 200 text/html. Browser API calls then died parsing
// HTML ("Unexpected token '<'") and agent detection silently came back empty.
//
// The spec: daemon-routed pathnames with no configured daemon origin must be
// answered as the connection-level outage they are, using the same plain-text
// 502 shape the proxy already synthesizes for a dead daemon, so the client's
// isDaemonProxyConnectionFailure recognizes them. Non-daemon paths keep
// falling through to the SPA shell.

import { createServer as createHttpServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import { createDaemonProxyHandler } from '../sidecar/server';

type FallbackBehavior = (request: IncomingMessage, response: ServerResponse) => void;

const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()!();
});

async function startProxy(
  daemonOrigin: string | null,
  fallback: FallbackBehavior,
): Promise<{ port: number; fallbackCalls: () => number }> {
  let calls = 0;
  const proxy: HttpServer = createHttpServer(
    createDaemonProxyHandler(daemonOrigin, async (request, response) => {
      calls += 1;
      await fallback(request, response);
    }),
  );
  await new Promise<void>((resolve) => {
    proxy.listen(0, '127.0.0.1', () => resolve());
  });
  cleanups.push(async () => {
    await new Promise<void>((resolve) => {
      proxy.close(() => resolve());
    });
    proxy.closeAllConnections();
  });
  return {
    port: (proxy.address() as AddressInfo).port,
    fallbackCalls: () => calls,
  };
}

function spaShellFallback(_request: IncomingMessage, response: ServerResponse): void {
  response.statusCode = 200;
  response.setHeader('content-type', 'text/html; charset=utf-8');
  response.end('<!DOCTYPE html><html><body>app shell</body></html>');
}

async function startJsonUpstream(): Promise<number> {
  const upstream = createHttpServer((_request, response) => {
    response.statusCode = 200;
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ ok: true }));
  });
  await new Promise<void>((resolve) => {
    upstream.listen(0, '127.0.0.1', () => resolve());
  });
  cleanups.push(async () => {
    await new Promise<void>((resolve) => {
      upstream.close(() => resolve());
    });
    upstream.closeAllConnections();
  });
  return (upstream.address() as AddressInfo).port;
}

describe('createDaemonProxyHandler without a daemon origin', () => {
  it('answers daemon-routed paths with a connection failure instead of the SPA shell', async () => {
    const proxy = await startProxy(null, spaShellFallback);

    const response = await fetch(`http://127.0.0.1:${proxy.port}/api/auth/session`, { method: 'POST' });

    expect(response.status).toBe(502);
    expect(response.headers.get('content-type') ?? '').toContain('text/plain');
    expect(await response.text()).toContain('ECONNREFUSED');
    expect(proxy.fallbackCalls()).toBe(0);
  });

  it('keeps serving non-daemon paths through the SPA fallback', async () => {
    const proxy = await startProxy(null, spaShellFallback);

    const response = await fetch(`http://127.0.0.1:${proxy.port}/settings`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type') ?? '').toContain('text/html');
    expect(proxy.fallbackCalls()).toBe(1);
  });

  it('still proxies daemon-routed paths once a daemon origin is configured', async () => {
    const upstreamPort = await startJsonUpstream();
    const proxy = await startProxy(`http://127.0.0.1:${upstreamPort}`, spaShellFallback);

    const response = await fetch(`http://127.0.0.1:${proxy.port}/api/version`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(proxy.fallbackCalls()).toBe(0);
  });
});
