// Red spec for the packaged-client 502 storm (proxy half).
//
// The web sidecar proxies every /api request to the daemon over pooled
// keep-alive sockets. When the daemon side of one of those sockets goes away
// between requests — its 120s keep-alive window closing while the pooled
// socket is being picked up, a daemon restart, any server-side close racing
// the proxy's write — the proxied request dies with ECONNRESET and the proxy
// synthesizes a 502 the daemon never sent. In the packaged client this
// surfaced as recurring `PUT /api/workspace/billing/interests/:clientId` 502s
// even though that daemon route has no 502 path at all.
//
// The spec: an idempotent request with a small replayable body that fails
// with a connection reset on a REUSED pooled socket, before any response
// bytes arrived, must be retried once on a fresh connection instead of
// surfacing a synthesized 502. Non-idempotent methods must never be replayed.

import { createServer as createNetServer, type Server as NetServer, type Socket } from 'node:net';
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import { createDaemonProxyHandler } from '../sidecar/server';

/**
 * A daemon stand-in that serves exactly one request per kept-alive socket on
 * its first connection, then hard-closes that socket as soon as the next
 * request has been fully written into it — the deterministic equivalent of
 * the daemon closing a pooled connection the proxy just reused. Every later
 * connection behaves normally, so a single fresh-socket retry succeeds.
 */
function startFlakyDaemon(): Promise<{
  port: number;
  requestLog: string[];
  close: () => Promise<void>;
}> {
  const requestLog: string[] = [];
  let connectionIndex = 0;
  const sockets = new Set<Socket>();

  const server: NetServer = createNetServer((socket) => {
    connectionIndex += 1;
    const connection = connectionIndex;
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    let pending = Buffer.alloc(0);
    let served = 0;

    socket.on('data', (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      for (;;) {
        const headerEnd = pending.indexOf('\r\n\r\n');
        if (headerEnd === -1) return;
        const header = pending.subarray(0, headerEnd).toString('utf8');
        const contentLength = Number(
          /content-length:\s*(\d+)/i.exec(header)?.[1] ?? '0',
        );
        const total = headerEnd + 4 + contentLength;
        if (pending.length < total) return;
        pending = pending.subarray(total);
        served += 1;
        const requestLine = header.split('\r\n')[0] ?? '';
        requestLog.push(`conn${connection} ${requestLine}`);
        if (connection === 1 && served > 1) {
          // The daemon closed this kept-alive socket right after the proxy
          // reused it: the request was fully written, no response will come.
          socket.destroy();
          return;
        }
        const body = JSON.stringify({ ok: true, connection, served });
        socket.write(
          'HTTP/1.1 200 OK\r\n'
            + 'content-type: application/json\r\n'
            + `content-length: ${Buffer.byteLength(body)}\r\n`
            + 'connection: keep-alive\r\n'
            + '\r\n'
            + body,
        );
      }
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        port: (server.address() as AddressInfo).port,
        requestLog,
        close: async () => {
          for (const socket of sockets) socket.destroy();
          await new Promise<void>((resolveClose) => {
            server.close(() => resolveClose());
          });
        },
      });
    });
  });
}

const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()!();
});

async function startProxy(daemonPort: number): Promise<number> {
  const proxy: HttpServer = createHttpServer(
    createDaemonProxyHandler(`http://127.0.0.1:${daemonPort}`, async (_request, response) => {
      response.statusCode = 404;
      response.end('fallback');
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
  return (proxy.address() as AddressInfo).port;
}

describe('sidecar daemon proxy keep-alive resilience', () => {
  it('replays an idempotent request once when the daemon resets a reused pooled socket', async () => {
    const daemon = await startFlakyDaemon();
    cleanups.push(daemon.close);
    const proxyPort = await startProxy(daemon.port);
    const url = `http://127.0.0.1:${proxyPort}/api/workspace/billing/interests/c1`;
    const init = {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ generation: '1', interests: [] }),
    } as const;

    const first = await fetch(url, init);
    expect(first.status).toBe(200);

    // Give the proxy time to release the daemon socket back into its pool.
    await new Promise((resolve) => setTimeout(resolve, 100));

    const second = await fetch(url, init);
    expect(second.status).toBe(200);
    expect(daemon.requestLog.some((line) => line.startsWith('conn2 '))).toBe(true);
  });

  it('never replays a non-idempotent request', async () => {
    const daemon = await startFlakyDaemon();
    cleanups.push(daemon.close);
    const proxyPort = await startProxy(daemon.port);
    const url = `http://127.0.0.1:${proxyPort}/api/projects/p1/presence/heartbeat`;
    const init = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ memberId: 'm1' }),
    } as const;

    const first = await fetch(url, init);
    expect(first.status).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const second = await fetch(url, init);
    expect(second.status).toBe(502);
    expect(daemon.requestLog.some((line) => line.startsWith('conn2 '))).toBe(false);
  });
});
