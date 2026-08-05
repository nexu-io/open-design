import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import zlib from 'node:zlib';

import {
  isCompressibleMime,
  isImmutableNextAsset,
  CACHE_IMMUTABLE,
  CACHE_NO_STORE,
  createCompressionMiddleware,
  createStaticMiddleware,
} from '../src/static-serving.js';

function request(
  server: http.Server,
  opts: { path: string; headers?: Record<string, string> },
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as { port: number };
    const req = http.request(
      { host: '127.0.0.1', port: addr.port, path: opts.path, headers: opts.headers ?? {} },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.end();
  });
}

function createTestServer(tmpDir: string): Promise<http.Server> {
  const app = express();
  app.use(createCompressionMiddleware());
  app.use(createStaticMiddleware(tmpDir));
  return new Promise((resolve, reject) => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
    srv.on('error', reject);
  });
}

// --- Pure unit tests ---

describe('isCompressibleMime()', () => {
  it('accepts common web text types', () => {
    expect(isCompressibleMime('text/html')).toBe(true);
    expect(isCompressibleMime('text/css')).toBe(true);
    expect(isCompressibleMime('application/javascript')).toBe(true);
    expect(isCompressibleMime('application/json')).toBe(true);
    expect(isCompressibleMime('image/svg+xml')).toBe(true);
  });
  it('strips charset qualifiers', () => {
    expect(isCompressibleMime('text/html; charset=utf-8')).toBe(true);
  });
  it('rejects binary/compressed types', () => {
    expect(isCompressibleMime('image/png')).toBe(false);
    expect(isCompressibleMime('video/mp4')).toBe(false);
    expect(isCompressibleMime('application/zip')).toBe(false);
  });
  it('rejects SSE', () => {
    expect(isCompressibleMime('text/event-stream')).toBe(false);
  });
  it('handles empty input', () => {
    expect(isCompressibleMime('')).toBe(false);
  });
});

describe('isImmutableNextAsset()', () => {
  it('matches /_next/static/ sub-paths', () => {
    expect(isImmutableNextAsset('/_next/static/chunks/main-abc123.js')).toBe(true);
    expect(isImmutableNextAsset('/_next/static/css/app.css')).toBe(true);
  });
  it('does NOT match HTML or other paths', () => {
    expect(isImmutableNextAsset('/')).toBe(false);
    expect(isImmutableNextAsset('/index.html')).toBe(false);
    expect(isImmutableNextAsset('/_next/data/build/page.json')).toBe(false);
  });
});

// --- Integration: cache-control ---

describe('cache-control headers', () => {
  let tmpDir: string;
  let server: http.Server;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-cache-test-'));
    fs.writeFileSync(path.join(tmpDir, 'index.html'), '<html><body>hi</body></html>');
    const chunksDir = path.join(tmpDir, '_next', 'static', 'chunks');
    fs.mkdirSync(chunksDir, { recursive: true });
    fs.writeFileSync(path.join(chunksDir, 'main-abc123.js'), 'console.log("hello")');
    const cssDir = path.join(tmpDir, '_next', 'static', 'css');
    fs.mkdirSync(cssDir, { recursive: true });
    fs.writeFileSync(path.join(cssDir, 'app-def456.css'), 'body{margin:0}');
    server = await createTestServer(tmpDir);
  }, 10_000);

  afterAll(() => { server?.close(); if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('HTML → no-cache policy', async () => {
    const { status, headers } = await request(server, { path: '/index.html' });
    expect(status).toBe(200);
    expect(headers['cache-control']).toBe(CACHE_NO_STORE);
  }, 10_000);

  it('hashed JS chunk → immutable policy', async () => {
    const { status, headers } = await request(server, { path: '/_next/static/chunks/main-abc123.js' });
    expect(status).toBe(200);
    expect(headers['cache-control']).toBe(CACHE_IMMUTABLE);
  }, 10_000);

  it('hashed CSS → immutable policy', async () => {
    const { status, headers } = await request(server, { path: '/_next/static/css/app-def456.css' });
    expect(status).toBe(200);
    expect(headers['cache-control']).toBe(CACHE_IMMUTABLE);
  }, 10_000);
});

// --- Integration: compression ---

describe('compression middleware', () => {
  let tmpDir: string;
  let server: http.Server;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-compress-test-'));
    const staticDir = path.join(tmpDir, '_next', 'static', 'chunks');
    fs.mkdirSync(staticDir, { recursive: true });
    fs.writeFileSync(path.join(staticDir, 'big-deadbeef.js'), 'var x=' + JSON.stringify('a'.repeat(2000)) + ';');
    server = await createTestServer(tmpDir);
  }, 10_000);

  afterAll(() => { server?.close(); if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('gzip-encodes when client sends Accept-Encoding: gzip', async () => {
    const { status, headers, body } = await request(server, {
      path: '/_next/static/chunks/big-deadbeef.js',
      headers: { 'Accept-Encoding': 'gzip' },
    });
    expect(status).toBe(200);
    expect(headers['content-encoding']).toBe('gzip');
    expect(headers['vary']).toMatch(/Accept-Encoding/i);
    expect(zlib.gunzipSync(body).toString('utf8')).toContain('var x=');
  }, 10_000);

  it('brotli-encodes when client sends Accept-Encoding: br', async () => {
    const { status, headers, body } = await request(server, {
      path: '/_next/static/chunks/big-deadbeef.js',
      headers: { 'Accept-Encoding': 'br' },
    });
    expect(status).toBe(200);
    expect(headers['content-encoding']).toBe('br');
    expect(headers['vary']).toMatch(/Accept-Encoding/i);
    expect(zlib.brotliDecompressSync(body).toString('utf8')).toContain('var x=');
  }, 10_000);

  it('prefers brotli when client sends Accept-Encoding: gzip, br', async () => {
    const { status, headers } = await request(server, {
      path: '/_next/static/chunks/big-deadbeef.js',
      headers: { 'Accept-Encoding': 'gzip, br' },
    });
    expect(status).toBe(200);
    expect(headers['content-encoding']).toBe('br');
  }, 10_000);

  it('serves uncompressed when no Accept-Encoding', async () => {
    const { status, headers, body } = await request(server, { path: '/_next/static/chunks/big-deadbeef.js' });
    expect(status).toBe(200);
    expect(headers['content-encoding']).toBeUndefined();
    expect(body.toString('utf8')).toContain('var x=');
  }, 10_000);

  it('404 for missing assets', async () => {
    const { status } = await request(server, {
      path: '/_next/static/chunks/missing.js',
      headers: { 'Accept-Encoding': 'gzip' },
    });
    expect(status).toBe(404);
  }, 10_000);
});

// --- Integration: API routes are NOT compressed ---

describe('API routes bypass compression', () => {
  let server: http.Server;

  beforeAll(async () => {
    const app = express();
    app.use(createCompressionMiddleware());
    // Simulate a JSON API route mounted after the middleware
    app.get('/api/health', (_req, res) => {
      res.json({ ok: true });
    });
    app.get('/api/projects/123/events', (_req, res) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.write('data: ping\n\n');
      res.end();
    });
    server = await new Promise((resolve, reject) => {
      const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
      srv.on('error', reject);
    });
  }, 10_000);

  afterAll(() => { server?.close(); });

  it('does not compress /api/health JSON even with Accept-Encoding: br', async () => {
    const addr = server.address() as { port: number };
    const { status, headers } = await new Promise<{ status: number; headers: http.IncomingHttpHeaders }>((resolve, reject) => {
      const req = http.request(
        { host: '127.0.0.1', port: addr.port, path: '/api/health', headers: { 'Accept-Encoding': 'gzip, br' } },
        (res) => {
          res.resume();
          res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers }));
          res.on('error', reject);
        },
      );
      req.on('error', reject);
      req.end();
    });
    expect(status).toBe(200);
    expect(headers['content-encoding']).toBeUndefined();
  }, 10_000);

  it('does not compress SSE routes', async () => {
    const addr = server.address() as { port: number };
    const { status, headers } = await new Promise<{ status: number; headers: http.IncomingHttpHeaders }>((resolve, reject) => {
      const req = http.request(
        { host: '127.0.0.1', port: addr.port, path: '/api/projects/123/events', headers: { 'Accept-Encoding': 'gzip, br' } },
        (res) => {
          res.resume();
          res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers }));
          res.on('error', reject);
        },
      );
      req.on('error', reject);
      req.end();
    });
    expect(status).toBe(200);
    expect(headers['content-encoding']).toBeUndefined();
  }, 10_000);
});
