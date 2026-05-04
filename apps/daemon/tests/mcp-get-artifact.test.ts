// @ts-nocheck
import http from 'node:http';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getArtifact, fetchProjectFile } from '../src/mcp.js';

// A minimal mock of the daemon's project file endpoints. Tests control
// the file list and per-file response via the opts object.
function makeDaemonApp(opts = {}) {
  const { files = [], fileContent = 'body {}', contentType = 'text/css', contentLength = null } = opts;
  const app = express();

  app.get('/api/projects/:id', (_req, res) =>
    res.json({
      project: { id: _req.params.id, name: 'Test', metadata: { entryFile: 'index.html' } },
    }),
  );

  app.get('/api/projects/:id/files', (_req, res) => res.json({ files }));

  app.get('/api/projects/:id/raw/*', (_req, res) => {
    const headers = { 'content-type': contentType };
    if (contentLength != null) headers['content-length'] = String(contentLength);
    res.set(headers).send(fileContent);
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

const PROJECT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

describe('getArtifact file-count cap (MAX_FILES = 200)', () => {
  let server;
  let baseUrl;

  const fileList = Array.from({ length: 250 }, (_, i) => ({ name: `file${i}.css` }));

  beforeAll(async () => {
    const r = await startServer(makeDaemonApp({ files: fileList, fileContent: 'a {}', contentType: 'text/css' }));
    server = r.server;
    baseUrl = r.baseUrl;
  });

  afterAll(() => new Promise((resolve) => server.close(resolve)));

  it('caps at 200 files and sets truncated: true when the project has 250 files', async () => {
    const result = await getArtifact(baseUrl, PROJECT_ID, 'index.html', 'all', 10_000_000);
    const body = JSON.parse(result.content[0].text);
    expect(body.truncated).toBe(true);
    expect(body.files.length).toBe(200);
  });
});

describe('getArtifact maxBytes cap', () => {
  let server;
  let baseUrl;

  // 10 files, each 200 bytes. With maxBytes=400 the third loop iteration
  // finds totalTextBytes >= maxBytes and sets truncated: true.
  const fileList = Array.from({ length: 10 }, (_, i) => ({ name: `file${i}.css` }));
  const fileContent = 'a'.repeat(200);

  beforeAll(async () => {
    const r = await startServer(makeDaemonApp({ files: fileList, fileContent, contentType: 'text/css' }));
    server = r.server;
    baseUrl = r.baseUrl;
  });

  afterAll(() => new Promise((resolve) => server.close(resolve)));

  it('stops fetching and sets truncated: true when byte cap is reached', async () => {
    const result = await getArtifact(baseUrl, PROJECT_ID, 'index.html', 'all', 400);
    const body = JSON.parse(result.content[0].text);
    expect(body.truncated).toBe(true);
    expect(body.files.length).toBeLessThan(10);
  });
});

describe('fetchProjectFile per-file size pre-check', () => {
  let server;
  let baseUrl;

  beforeAll(async () => {
    const r = await startServer(
      makeDaemonApp({ fileContent: 'x'.repeat(10_000), contentType: 'text/css', contentLength: 10_000 }),
    );
    server = r.server;
    baseUrl = r.baseUrl;
  });

  afterAll(() => new Promise((resolve) => server.close(resolve)));

  it('throws when content-length exceeds remainingBytes without reading the body', async () => {
    await expect(fetchProjectFile(baseUrl, PROJECT_ID, 'styles.css', 5_000)).rejects.toThrow(
      /exceeds remaining budget/,
    );
  });

  it('succeeds and returns content when remainingBytes is sufficient', async () => {
    const file = await fetchProjectFile(baseUrl, PROJECT_ID, 'styles.css', 20_000);
    expect(file.binary).toBe(false);
    expect(file.content.length).toBe(10_000);
  });
});

describe('getArtifact truncated: true when per-file content-length pre-check fires (include=all)', () => {
  let server;
  let baseUrl;

  // 5 files, each 250 bytes with explicit content-length.
  // maxBytes=400: file0 (remaining=400, size=250) fetches fine.
  // file1+ (remaining=150, size=250 > 150) hit the BudgetExceededError path.
  // totalTextBytes never reaches maxBytes, so only the pre-check path sets truncated.
  const fileList = Array.from({ length: 5 }, (_, i) => ({ name: `file${i}.css` }));
  const fileContent = 'a'.repeat(250);

  beforeAll(async () => {
    const r = await startServer(
      makeDaemonApp({ files: fileList, fileContent, contentType: 'text/css', contentLength: 250 }),
    );
    server = r.server;
    baseUrl = r.baseUrl;
  });

  afterAll(() => new Promise((resolve) => server.close(resolve)));

  it('sets truncated: true even when totalTextBytes never reaches maxBytes', async () => {
    const result = await getArtifact(baseUrl, PROJECT_ID, 'index.html', 'all', 400);
    const body = JSON.parse(result.content[0].text);
    expect(body.truncated).toBe(true);
    expect(body.files.length).toBe(1);
  });
});
