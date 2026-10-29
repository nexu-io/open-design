import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createRemoteCompressionMiddleware,
  isCompressibleContentType,
} from '../src/http/remote-compression.js';

const LARGE_JSON = { items: Array.from({ length: 2000 }, (_, i) => ({ id: i, title: `plugin-${i}` })) };
const LARGE_JS = `export const data = ${JSON.stringify(LARGE_JSON)};\n`;

let server: http.Server | null = null;
let staticDir: string | null = null;

afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = null;
  if (staticDir) rmSync(staticDir, { recursive: true, force: true });
  staticDir = null;
});

async function startApp(remote: boolean): Promise<string> {
  const app = express();
  app.use(createRemoteCompressionMiddleware({ isLocalPeer: () => !remote }));
  staticDir = mkdtempSync(path.join(tmpdir(), 'od-remote-compression-'));
  writeFileSync(path.join(staticDir, 'chunk.js'), LARGE_JS);
  app.use('/static', express.static(staticDir));
  app.get('/api/large', (_req, res) => res.json(LARGE_JSON));
  app.get('/api/small', (_req, res) => res.json({ ok: true }));
  app.get('/_next/static/app.js', (_req, res) => res.type('text/javascript').send(LARGE_JS));
  app.get('/api/ndjson', (_req, res) => {
    res.type('application/x-ndjson');
    res.end(`${JSON.stringify(LARGE_JSON)}\n`);
  });
  app.get('/api/events', (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    res.write('data: first\n\n');
    setTimeout(() => res.end('data: second\n\n'), 200);
  });
  server = http.createServer(app);
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', () => resolve()));
  return `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
}

interface RawResponse {
  status: number | undefined;
  contentRange: string | undefined;
  encoding: string | undefined;
  vary: string | undefined;
  body: Buffer;
  /** Milliseconds from request start to the first body chunk. */
  firstChunkMs: number;
}

function get(url: string, headers: Record<string, string> = {}): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    let firstChunkMs = -1;
    http
      .get(url, { headers: { 'Accept-Encoding': 'gzip', ...headers } }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => {
          if (firstChunkMs < 0) firstChunkMs = Date.now() - started;
          chunks.push(chunk);
        });
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            contentRange: res.headers['content-range'],
            encoding: res.headers['content-encoding'],
            vary: res.headers.vary,
            body: Buffer.concat(chunks),
            firstChunkMs,
          }),
        );
      })
      .on('error', reject);
  });
}

describe('remote compression middleware', () => {
  it('gzips JSON and JavaScript for remote peers', async () => {
    const base = await startApp(true);

    const json = await get(`${base}/api/large`);
    expect(json.encoding).toBe('gzip');
    expect(json.vary).toMatch(/Accept-Encoding/i);
    expect(JSON.parse(gunzipSync(json.body).toString('utf8'))).toEqual(LARGE_JSON);
    expect(json.body.length).toBeLessThan(Buffer.byteLength(JSON.stringify(LARGE_JSON)) / 3);

    const js = await get(`${base}/_next/static/app.js`);
    expect(js.encoding).toBe('gzip');
    expect(gunzipSync(js.body).toString('utf8')).toBe(LARGE_JS);
  });

  it('leaves every response uncompressed for loopback peers', async () => {
    const base = await startApp(false);

    const json = await get(`${base}/api/large`);
    expect(json.encoding).toBeUndefined();
    expect(JSON.parse(json.body.toString('utf8'))).toEqual(LARGE_JSON);

    const js = await get(`${base}/_next/static/app.js`);
    expect(js.encoding).toBeUndefined();
  });

  it('never compresses a remote SSE stream, so its first event is not held back', async () => {
    const base = await startApp(true);

    const events = await get(`${base}/api/events`);
    expect(events.encoding).toBeUndefined();
    expect(events.body.toString('utf8')).toBe('data: first\n\ndata: second\n\n');
    // The first event must arrive before the handler ends the stream at 200ms;
    // a buffering compressor would hold it until end().
    expect(events.firstChunkMs).toBeLessThan(150);
  });

  it('never compresses a remote partial response, so the bytes match Content-Range', async () => {
    const base = await startApp(true);

    // A slice above the 1 KB threshold with an allowlisted type: compressing it
    // would keep 206 + Content-Range while sending gzip bytes instead of the slice.
    const slice = await get(`${base}/static/chunk.js`, { Range: 'bytes=0-2047' });
    expect(slice.status).toBe(206);
    expect(slice.contentRange).toBe(`bytes 0-2047/${Buffer.byteLength(LARGE_JS)}`);
    expect(slice.encoding).toBeUndefined();
    expect(slice.body.toString('utf8')).toBe(LARGE_JS.slice(0, 2048));

    // The full file through the same static mount is still compressed.
    expect((await get(`${base}/static/chunk.js`)).encoding).toBe('gzip');
  });

  it('skips content types outside the allowlist and bodies under the size threshold', async () => {
    const base = await startApp(true);

    expect((await get(`${base}/api/ndjson`)).encoding).toBeUndefined();
    expect((await get(`${base}/api/small`)).encoding).toBeUndefined();
  });
});

describe('isCompressibleContentType', () => {
  it('matches the media type and ignores parameters and case', () => {
    expect(isCompressibleContentType('application/json; charset=utf-8')).toBe(true);
    expect(isCompressibleContentType('Text/JavaScript; charset=UTF-8')).toBe(true);
    expect(isCompressibleContentType('text/event-stream')).toBe(false);
    expect(isCompressibleContentType('application/x-ndjson')).toBe(false);
    expect(isCompressibleContentType('image/png')).toBe(false);
    expect(isCompressibleContentType(undefined)).toBe(false);
  });
});
