// @ts-nocheck
import http from 'node:http';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getFile } from '../src/mcp.js';

const PROJECT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function makeDaemonApp(text, contentType = 'text/plain') {
  const app = express();
  app.get('/api/projects/:id/raw/*', (_req, res) => {
    res.set({ 'content-type': contentType }).send(text);
  });
  return app;
}

function startServer(app) {
  return new Promise((resolve) => {
    const tmp = http.createServer();
    tmp.listen(0, '127.0.0.1', () => {
      const { port } = tmp.address();
      tmp.close(() => {
        const server = app.listen(port, '127.0.0.1', () =>
          resolve({ server, baseUrl: `http://127.0.0.1:${port}` }),
        );
      });
    });
  });
}

const FIVE_HUNDRED_LINES = Array.from({ length: 500 }, (_, i) => `line ${i + 1}`).join('\n');

describe('getFile offset/limit slicing', () => {
  let server;
  let baseUrl;

  beforeAll(async () => {
    const r = await startServer(makeDaemonApp(FIVE_HUNDRED_LINES, 'text/plain'));
    server = r.server;
    baseUrl = r.baseUrl;
  });

  afterAll(() => new Promise((resolve) => server.close(resolve)));

  it('default args return the full file when totalLines <= 2000 and add no window marker', async () => {
    const r = await getFile(baseUrl, PROJECT_ID, 'file.txt', null, null);
    const textParts = r.content.map((c) => c.text);
    expect(textParts.some((t) => t.startsWith('[od:file-window'))).toBe(false);
    const body = textParts[textParts.length - 1];
    expect(body.split('\n').length).toBe(500);
    expect(body.split('\n')[0]).toBe('line 1');
    expect(body.split('\n')[499]).toBe('line 500');
  });

  it('limit caps the slice and stamps a truncation marker with totalLines', async () => {
    const r = await getFile(baseUrl, PROJECT_ID, 'file.txt', null, null, 0, 100);
    const textParts = r.content.map((c) => c.text);
    const marker = textParts.find((t) => t.startsWith('[od:file-window'));
    expect(marker).toBeDefined();
    expect(marker).toContain('offset=0');
    expect(marker).toContain('returnedLines=100');
    expect(marker).toContain('totalLines=500');
    expect(marker).toContain('offset=100');
    const body = textParts[textParts.length - 1];
    expect(body.split('\n').length).toBe(100);
    expect(body.split('\n')[0]).toBe('line 1');
    expect(body.split('\n')[99]).toBe('line 100');
  });

  it('offset returns a mid-file slice and the marker reflects start', async () => {
    const r = await getFile(baseUrl, PROJECT_ID, 'file.txt', null, null, 200, 50);
    const textParts = r.content.map((c) => c.text);
    const marker = textParts.find((t) => t.startsWith('[od:file-window'));
    expect(marker).toContain('offset=200');
    expect(marker).toContain('returnedLines=50');
    const body = textParts[textParts.length - 1];
    expect(body.split('\n')[0]).toBe('line 201');
    expect(body.split('\n')[49]).toBe('line 250');
  });

  it('offset past EOF returns empty slice but still stamps the marker (no truncation note)', async () => {
    const r = await getFile(baseUrl, PROJECT_ID, 'file.txt', null, null, 1000, 50);
    const textParts = r.content.map((c) => c.text);
    const marker = textParts.find((t) => t.startsWith('[od:file-window'));
    expect(marker).toContain('offset=500');
    expect(marker).toContain('returnedLines=0');
    expect(marker).toContain('totalLines=500');
    expect(marker).not.toContain('call get_file again');
    const body = textParts[textParts.length - 1];
    expect(body).toBe('');
  });
});

describe('getFile binary rejection unchanged', () => {
  let server;
  let baseUrl;

  beforeAll(async () => {
    const r = await startServer(makeDaemonApp('binary-bytes', 'image/png'));
    server = r.server;
    baseUrl = r.baseUrl;
  });

  afterAll(() => new Promise((resolve) => server.close(resolve)));

  it('returns an error result for binary mimes regardless of offset/limit', async () => {
    const r = await getFile(baseUrl, PROJECT_ID, 'logo.png', null, null, 0, 100);
    expect(r.isError).toBe(true);
    const text = r.content.map((c) => c.text).join('\n');
    expect(text).toMatch(/binary content is not yet supported/);
  });
});
