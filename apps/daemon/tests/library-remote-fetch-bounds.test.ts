// Regression: POST /api/library/ingest `{ url }` → fetchRemoteBytes had no
// deadline and buffered the whole response before checking MAX_REMOTE_BYTES
// whenever the upstream omitted Content-Length (chunked). A slow or endless
// remote resource could hang the ingest request indefinitely or grow daemon
// memory without bound (#9564).
//
// The production fetch is SSRF-guarded and refuses loopback, so these specs
// inject a plain `fetch` and drive fetchRemoteBytes against a real local HTTP
// server. Everything after the fetch call — deadline, Content-Length precheck,
// streamed size cap — is the production code path.

import type http from 'node:http';
import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';

import { fetchRemoteBytes } from '../src/routes/library.js';

const servers: http.Server[] = [];

async function serve(handler: http.RequestListener): Promise<string> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const { port } = server.address() as { port: number };
  return `http://127.0.0.1:${port}/asset`;
}

const plainFetch = (url: string, init?: RequestInit) => fetch(url, init);

afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

describe('fetchRemoteBytes resource bounds', () => {
  it('aborts an endless chunked body once it crosses the byte cap', async () => {
    const maxBytes = 256 * 1024;
    let sent = 0;
    let upstreamClosed = false;
    const url = await serve((req, res) => {
      // No Content-Length → Transfer-Encoding: chunked, so only a streamed
      // count can enforce the cap.
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      const chunk = Buffer.alloc(16 * 1024, 0x61);
      const timer = setInterval(() => {
        if (res.destroyed) return;
        res.write(chunk);
        sent += chunk.length;
      }, 1);
      res.on('close', () => {
        upstreamClosed = true;
        clearInterval(timer);
      });
      req.on('close', () => clearInterval(timer));
    });

    await expect(
      fetchRemoteBytes(url, { fetchImpl: plainFetch, maxBytes, timeoutMs: 10_000 }),
    ).rejects.toThrow(/too large/);

    // The read stopped near the cap instead of draining the stream.
    expect(sent).toBeLessThan(maxBytes * 8);
    await expect.poll(() => upstreamClosed, { timeout: 2_000 }).toBe(true);
  }, 5_000);

  it('gives up on a stalled response when the deadline passes', async () => {
    const url = await serve((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.write('partial'); // then never finish
    });

    const started = Date.now();
    await expect(
      fetchRemoteBytes(url, { fetchImpl: plainFetch, timeoutMs: 200 }),
    ).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(2_000);
  }, 5_000);

  it('rejects a declared Content-Length above the cap', async () => {
    const url = await serve((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': String(2048) });
      res.end(Buffer.alloc(2048));
    });

    await expect(
      fetchRemoteBytes(url, { fetchImpl: plainFetch, maxBytes: 1024 }),
    ).rejects.toThrow(/too large/);
  }, 5_000);

  it('returns the bytes and mime of a normal response', async () => {
    const body = Buffer.from('hello-asset');
    const url = await serve((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'image/png; charset=binary' });
      res.end(body);
    });

    const result = await fetchRemoteBytes(url, { fetchImpl: plainFetch, maxBytes: 1024 });
    expect(result.bytes.equals(body)).toBe(true);
    expect(result.mime).toBe('image/png');
  }, 5_000);
});
