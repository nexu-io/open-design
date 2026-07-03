import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getArtifact, fetchProjectFile, handleMcpToolCall } from '../src/mcp.js';

// A minimal mock of the daemon's project file endpoints. Tests control
// the file list and per-file response via the opts object.
interface DaemonAppOpts {
  files?: Array<{ name: string }>;
  fileContent?: string;
  contentType?: string;
  contentLength?: number | null;
}

interface Harness {
  server: http.Server;
  baseUrl: string;
}

interface TextContent {
  type: string;
  text: string;
}

interface ArtifactBody {
  truncated: boolean;
  files: unknown[];
}

function firstText(content: TextContent[]): string {
  const item = content[0];
  if (item == null) throw new Error('expected MCP text content');
  return item.text;
}

function parseArtifactBody(text: string): ArtifactBody {
  return JSON.parse(text) as ArtifactBody;
}

function makeDaemonApp(opts: DaemonAppOpts = {}): Express {
  const { files = [], fileContent = 'body {}', contentType = 'text/css', contentLength = null } = opts;
  const app = express();

  app.get('/api/projects/:id', (_req, res) =>
    res.json({
      project: { id: _req.params.id, name: 'Test', metadata: { entryFile: 'index.html' } },
    }),
  );

  app.get('/api/projects/:id/files', (_req, res) => res.json({ files }));

  app.get('/api/projects/:id/raw/*splat', (_req, res) => {
    const headers: Record<string, string> = { 'content-type': contentType };
    if (contentLength != null) headers['content-length'] = String(contentLength);
    res.set(headers).send(fileContent);
  });

  return app;
}

function startServer(app: Express): Promise<Harness> {
  return new Promise((resolve) => {
    const tmp = http.createServer();
    tmp.listen(0, '127.0.0.1', () => {
      const { port } = tmp.address() as AddressInfo;
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
  let server: http.Server;
  let baseUrl: string;

  const fileList = Array.from({ length: 250 }, (_, i) => ({ name: `file${i}.css` }));

  beforeAll(async () => {
    const r = await startServer(makeDaemonApp({ files: fileList, fileContent: 'a {}', contentType: 'text/css' }));
    server = r.server;
    baseUrl = r.baseUrl;
  });

  afterAll(() => new Promise((resolve) => server.close(resolve)));

  it('caps at 200 files and sets truncated: true when the project has 250 files', async () => {
    const result = await getArtifact(baseUrl, PROJECT_ID, 'index.html', 'all', 10_000_000);
    const body = parseArtifactBody(firstText(result.content));
    expect(body.truncated).toBe(true);
    expect(body.files.length).toBe(200);
  });
});

describe('getArtifact maxBytes cap', () => {
  let server: http.Server;
  let baseUrl: string;

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
    const body = parseArtifactBody(firstText(result.content));
    expect(body.truncated).toBe(true);
    expect(body.files.length).toBeLessThan(10);
  });
});

describe('fetchProjectFile per-file size pre-check', () => {
  let server: http.Server;
  let baseUrl: string;

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
    expect(file.content?.length).toBe(10_000);
  });
});

describe('getArtifact truncated: true when per-file content-length pre-check fires (include=all)', () => {
  let server: http.Server;
  let baseUrl: string;

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
    const body = parseArtifactBody(firstText(result.content));
    expect(body.truncated).toBe(true);
    expect(body.files.length).toBe(1);
  });
});

describe('public MCP get_artifact active context defaults', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.get('/api/active', (_req, res) =>
      res.json({
        active: true,
        projectId: 'active-project',
        projectName: 'Active Project',
        fileName: 'landing.html',
        ageMs: 50,
      }),
    );
    app.get('/api/projects/:id', (_req, res) =>
      res.json({
        project: {
          id: 'active-project',
          name: 'Active Project',
          metadata: { entryFile: 'index.html' },
        },
      }),
    );
    app.get('/api/projects/:id/raw/*splat', (req, res) => {
      expect(req.params.id).toBe('active-project');
      expect(req.params.splat).toEqual(['landing.html']);
      res.set({ 'content-type': 'text/html' }).send('<!doctype html><h1>Active artifact</h1>');
    });
    const r = await startServer(app);
    server = r.server;
    baseUrl = r.baseUrl;
  });

  afterAll(() => new Promise((resolve) => server.close(resolve)));

  it('uses the active file ahead of metadata.entryFile when project and entry are omitted', async () => {
    const result = await handleMcpToolCall(baseUrl, 'get_artifact', { include: 'shallow' });
    const body = parseArtifactBody(firstText(result.content)) as ArtifactBody & {
      entryFile?: string;
      usedActiveContext?: { projectId?: string; fileName?: string };
    };
    expect(body.entryFile).toBe('landing.html');
    expect(body.files).toHaveLength(1);
    expect(body.usedActiveContext).toMatchObject({
      projectId: 'active-project',
      fileName: 'landing.html',
    });
  });
});

describe('public MCP get_artifact active context fallbacks', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.get('/api/active', (_req, res) =>
      res.json({
        active: true,
        projectId: 'active-project',
        projectName: 'Active Project',
        ageMs: 50,
      }),
    );
    app.get('/api/projects/:id', (req, res) =>
      res.json({
        project: {
          id: req.params.id,
          name: req.params.id === 'active-project' ? 'Active Project' : 'Explicit Project',
          metadata: { entryFile: 'index.html' },
        },
      }),
    );
    app.get('/api/projects/:id/raw/*splat', (req, res) => {
      res.set({ 'content-type': 'text/html' }).send(`<!doctype html><h1>${req.params.splat.join('/')}</h1>`);
    });
    const r = await startServer(app);
    server = r.server;
    baseUrl = r.baseUrl;
  });

  afterAll(() => new Promise((resolve) => server.close(resolve)));

  it('falls back to metadata.entryFile when the active project has no active file', async () => {
    const result = await handleMcpToolCall(baseUrl, 'get_artifact', { include: 'shallow' });
    const body = parseArtifactBody(firstText(result.content)) as ArtifactBody & {
      entryFile?: string;
      usedActiveContext?: { projectId?: string; fileName?: string | null };
      files?: Array<{ content?: string | null }>;
    };
    expect(body.entryFile).toBe('index.html');
    expect(body.usedActiveContext).toMatchObject({
      projectId: 'active-project',
      fileName: null,
    });
    expect(body.files?.[0]?.content).toContain('<h1>index.html</h1>');
  });

  it('does not stamp active context when project and entry are explicit', async () => {
    const result = await handleMcpToolCall(baseUrl, 'get_artifact', {
      project: PROJECT_ID,
      entry: 'explicit.html',
      include: 'shallow',
    });
    const body = parseArtifactBody(firstText(result.content)) as ArtifactBody & {
      entryFile?: string;
      usedActiveContext?: unknown;
      files?: Array<{ content?: string | null }>;
    };
    expect(body.entryFile).toBe('explicit.html');
    expect(body.usedActiveContext).toBeUndefined();
    expect(body.files?.[0]?.content).toContain('<h1>explicit.html</h1>');
  });
});
