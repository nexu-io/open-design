// A historical file version must be reachable as a real HTML document on a
// real URL, not as a JSON string the host re-wraps into `srcdoc`.
//
// The version-history panel previews an old version by fetching
// `GET .../files/<name>/versions/<id>` (JSON, `content` is a string) and
// rendering that string through `srcDoc`. A `srcdoc`/`blob:` document has no
// directory semantics, so every relative `./app.js`, `../fonts/*.woff2`,
// stylesheet, image, and dynamic import inside the historical document fails
// to load. Users comparing versions see an unstyled — often blank — old
// version that was actually fine when it was captured.
//
// The invariant this file pins:
//
//   GET /api/projects/:id/version-preview/:versionId/<relPath>
//
//   * serves the EXACT bytes of that version for the HTML document that owns
//     the version id, and 404s any other version id on an HTML path,
//   * serves the CURRENT on-disk bytes for every non-HTML subresource under
//     the same prefix, so a browser's native relative-URL resolution lands on
//     the project's real assets,
//   * carries the same `?odPreviewBridge=` injection the current document gets
//     on /raw (buffered under the guard size, streamed above it),
//   * and is gated by the same project read authority as /raw.
//
// Harness note: the routes are mounted on a bare Express app and driven
// through real `http.IncomingMessage` / `http.ServerResponse` objects without
// binding a listening socket. That is still the real Express route stack, the
// real authority gate, and real file I/O — only the TCP transport is elided.

import express from 'express';
import type { Express, Response } from 'express';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import nodeFs, { mkdtempSync, rmSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildProjectFileVersionDocumentUrl } from '@open-design/contracts';

import {
  closeDatabase,
  ensureWorkspaceProject,
  getProject,
  getWorkspaceProject,
  getWorkspaceProjectByProjectId,
  insertProject,
  openDatabase,
} from '../src/db.js';
import { sendApiError } from '../src/http/api-errors.js';
import { createProjectFileVersion } from '../src/project-file-versions.js';
import {
  registerProjectFileRoutes,
  type RegisterProjectFileRoutesDeps,
} from '../src/routes/project/index.js';
import {
  createProjectFolder,
  deleteProjectFile,
  deleteProjectFolder,
  ensureProject,
  listFiles,
  listProjectFolders,
  parseByteRange,
  readProjectFile,
  renameProjectFile,
  resolveProjectDir,
  resolveProjectFilePath,
  sanitizeName,
  sanitizePath,
  searchProjectFiles,
  writeProjectFile,
} from '../src/projects.js';

const WORKSPACE_ID = 'ws-version-document-route';
const OWNER_MEMBER_ID = 'member-owner-version-document-route';
const OTHER_MEMBER_ID = 'member-other-version-document-route';

const V1_HTML = [
  '<!doctype html><html><head><title>Deck</title>',
  '<link rel="stylesheet" href="./theme.css">',
  '</head><body><h1>version-one-marker</h1>',
  '<script src="./app.js"></script></body></html>',
].join('');

const V2_HTML = [
  '<!doctype html><html><head><title>Deck</title>',
  '<link rel="stylesheet" href="./theme.css">',
  '</head><body><h1>version-two-marker</h1>',
  '<script src="./app.js"></script></body></html>',
].join('');

interface DispatchResponse {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
  text(): string;
  json(): any;
}

/**
 * Drive the mounted Express app with a real IncomingMessage/ServerResponse
 * pair and no listening socket. Response bytes are captured by replacing
 * `write`/`end`, which is what `res.json`, `res.send`, and `stream.pipe(res)`
 * all funnel through.
 */
function dispatch(
  app: Express,
  url: string,
  init: { method?: string; headers?: Record<string, string> } = {},
): Promise<DispatchResponse> {
  return new Promise<DispatchResponse>((resolve, reject) => {
    const socket = new Socket();
    const req = new IncomingMessage(socket);
    req.method = init.method ?? 'GET';
    req.url = url;
    const headers: Record<string, string> = { host: '127.0.0.1' };
    for (const [key, value] of Object.entries(init.headers ?? {})) {
      headers[key.toLowerCase()] = value;
    }
    req.headers = headers;
    req.push(null);

    const res = new ServerResponse(req);
    const chunks: Buffer[] = [];
    let settled = false;

    const toBuffer = (chunk: unknown, encoding?: unknown): Buffer => {
      if (Buffer.isBuffer(chunk)) return chunk;
      const enc = typeof encoding === 'string' ? (encoding as BufferEncoding) : 'utf8';
      return Buffer.from(String(chunk), enc);
    };

    const settle = () => {
      if (settled) return;
      settled = true;
      const responseHeaders: Record<string, string> = {};
      for (const [key, value] of Object.entries(res.getHeaders())) {
        if (value === undefined) continue;
        responseHeaders[key] = Array.isArray(value) ? value.join(', ') : String(value);
      }
      const body = Buffer.concat(chunks);
      resolve({
        status: res.statusCode,
        headers: responseHeaders,
        body,
        text: () => body.toString('utf8'),
        json: () => JSON.parse(body.toString('utf8')),
      });
    };

    const anyRes = res as any;
    anyRes.writeHead = (status: number, ...rest: unknown[]) => {
      res.statusCode = status;
      for (const candidate of rest) {
        if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
        for (const [key, value] of Object.entries(candidate as Record<string, unknown>)) {
          res.setHeader(key, value as never);
        }
      }
      return res;
    };
    anyRes.write = (chunk?: unknown, encoding?: unknown, cb?: unknown) => {
      if (chunk !== undefined && chunk !== null && typeof chunk !== 'function') {
        chunks.push(toBuffer(chunk, encoding));
      }
      const done = typeof encoding === 'function' ? encoding : cb;
      if (typeof done === 'function') (done as () => void)();
      return true;
    };
    anyRes.end = (chunk?: unknown, encoding?: unknown, cb?: unknown) => {
      if (chunk !== undefined && chunk !== null && typeof chunk !== 'function') {
        chunks.push(toBuffer(chunk, encoding));
      }
      const done = typeof chunk === 'function'
        ? chunk
        : typeof encoding === 'function'
          ? encoding
          : cb;
      if (typeof done === 'function') (done as () => void)();
      res.emit('finish');
      settle();
      return res;
    };

    try {
      (app as unknown as (r: IncomingMessage, s: ServerResponse) => void)(req, res);
    } catch (err) {
      reject(err);
    }
  });
}

describe('historical file version served as a real document URL', () => {
  let tempDir: string;
  let db: ReturnType<typeof openDatabase>;
  let app: Express;

  beforeAll(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-version-doc-'));
    db = openDatabase(tempDir, { dataDir: tempDir });
    app = express();
    registerProjectFileRoutes(app, {
      db,
      http: {
        sendApiError,
        sendMulterError: (res: Response, err: unknown) =>
          res.status(400).json({ error: { code: 'BAD_REQUEST', message: String(err) } }),
      },
      paths: {
        PROJECTS_DIR: tempDir,
        DESIGN_SYSTEMS_DIR: tempDir,
        USER_DESIGN_SYSTEMS_DIR: tempDir,
        RUNTIME_DATA_DIR: tempDir,
      },
      uploads: { upload: { single: () => (_req: unknown, _res: unknown, next: () => void) => next() } },
      node: { fs: nodeFs },
      projectStore: { getProject, getWorkspaceProject, getWorkspaceProjectByProjectId },
      projectFiles: {
        listFiles,
        listProjectFolders,
        createProjectFolder,
        deleteProjectFolder,
        searchProjectFiles,
        readProjectFile,
        resolveProjectDir,
        resolveProjectFilePath,
        parseByteRange,
        renameProjectFile,
        deleteProjectFile,
        writeProjectFile,
        sanitizeName,
        sanitizePath,
        ensureProject,
      },
      documents: { buildDocumentPreview: async () => ({}) },
      artifacts: { validateArtifactManifestInput: () => ({ ok: true }) },
      projectPreviewScopes: {
        mint: () => {
          throw new Error('preview scopes are not part of the version-document route');
        },
        expiresAt: () => undefined,
        resolve: () => undefined,
        resolveScope: () => null,
        renew: () => undefined,
        validate: () => false,
      },
      getResolvedPort: () => 0,
    } as unknown as RegisterProjectFileRoutesDeps);
  });

  afterAll(() => {
    closeDatabase();
    rmSync(tempDir, { recursive: true, force: true });
  });

  function createProject(prefix = 'version-doc'): string {
    const id = `${prefix}-${randomUUID()}`;
    const now = Date.now();
    insertProject(db, { id, name: 'Version document route project', createdAt: now, updatedAt: now });
    return id;
  }

  async function seedFile(projectId: string, name: string, content: string): Promise<void> {
    await ensureProject(tempDir, projectId);
    await writeProjectFile(tempDir, projectId, name, Buffer.from(content, 'utf8'), {});
  }

  async function seedVersion(projectId: string, name: string, content: string): Promise<string> {
    const version = await createProjectFileVersion(tempDir, projectId, name, content, {
      source: 'manual',
      promptSource: 'manual',
    });
    return version.id;
  }

  function documentUrl(projectId: string, versionId: string, relPath: string): string {
    const segments = relPath.split('/').map(encodeURIComponent).join('/');
    return `/api/projects/${encodeURIComponent(projectId)}`
      + `/version-preview/${encodeURIComponent(versionId)}/${segments}`;
  }

  /** Resolve a relative reference exactly the way a browser would. */
  function resolveFromDocument(docUrl: string, reference: string): string {
    const resolved = new URL(reference, `http://127.0.0.1${docUrl}`);
    return `${resolved.pathname}${resolved.search}`;
  }

  /** A project whose captured v1 differs from the file currently on disk. */
  async function seedTwoVersions(prefix?: string): Promise<{ projectId: string; v1: string }> {
    const projectId = prefix ? createProject(prefix) : createProject();
    await seedFile(projectId, 'index.html', V1_HTML);
    const v1 = await seedVersion(projectId, 'index.html', V1_HTML);
    await seedFile(projectId, 'index.html', V2_HTML);
    await seedVersion(projectId, 'index.html', V2_HTML);
    return { projectId, v1 };
  }

  it('is addressed by the shared contract URL builder', async () => {
    const { projectId, v1 } = await seedTwoVersions();

    // The host wires the version panel through this builder; if the builder
    // and the route ever disagree, the panel silently 404s.
    const built = buildProjectFileVersionDocumentUrl('', projectId, v1, 'pages/deck.html');
    expect(built).toBe(documentUrl(projectId, v1, 'pages/deck.html'));

    const served = await dispatch(
      app,
      buildProjectFileVersionDocumentUrl('', projectId, v1, 'index.html') ?? '',
    );
    expect(served.status).toBe(200);
    expect(served.text()).toContain('version-one-marker');

    expect(buildProjectFileVersionDocumentUrl('', projectId, '', 'index.html')).toBeNull();
    expect(buildProjectFileVersionDocumentUrl('', projectId, v1, '')).toBeNull();
  });

  it('serves the captured version bytes, not the file currently on disk', async () => {
    const { projectId, v1 } = await seedTwoVersions();

    const response = await dispatch(app, documentUrl(projectId, v1, 'index.html'));
    expect(response.status).toBe(200);
    expect(response.headers['content-type'] ?? '').toMatch(/^text\/html/);
    const html = response.text();
    expect(html).toContain('version-one-marker');
    expect(html).not.toContain('version-two-marker');

    // Sanity: the working file really did move on, so the assertion above is
    // not passing because both versions are identical.
    const current = await dispatch(app, `/api/projects/${projectId}/raw/index.html`);
    expect(current.text()).toContain('version-two-marker');
  });

  it("resolves the document's relative subresources to the project files on disk", async () => {
    const { projectId, v1 } = await seedTwoVersions();
    await seedFile(projectId, 'app.js', 'globalThis.__odVersionAsset = "app-js-on-disk";');
    await seedFile(projectId, 'theme.css', ':root { --od-version-asset: theme-css-on-disk; }');

    const docUrl = documentUrl(projectId, v1, 'index.html');

    const script = await dispatch(app, resolveFromDocument(docUrl, './app.js'));
    expect(script.status).toBe(200);
    expect(script.text()).toContain('app-js-on-disk');

    const stylesheet = await dispatch(app, resolveFromDocument(docUrl, './theme.css'));
    expect(stylesheet.status).toBe(200);
    expect(stylesheet.headers['content-type'] ?? '').toMatch(/^text\/css/);
    expect(stylesheet.text()).toContain('theme-css-on-disk');
  });

  it('resolves parent-relative subresources of a nested document', async () => {
    const projectId = createProject();
    await seedFile(projectId, 'pages/deck.html', V1_HTML);
    const v1 = await seedVersion(projectId, 'pages/deck.html', V1_HTML);
    await seedFile(projectId, 'fonts/brand.woff2', 'brand-font-on-disk');

    const docUrl = documentUrl(projectId, v1, 'pages/deck.html');
    const resolved = resolveFromDocument(docUrl, '../fonts/brand.woff2');
    expect(resolved).toBe(
      `/api/projects/${projectId}/version-preview/${v1}/fonts/brand.woff2`,
    );

    const font = await dispatch(app, resolved);
    expect(font.status).toBe(200);
    expect(font.text()).toContain('brand-font-on-disk');
  });

  it('injects only the requested preview bridges', async () => {
    const { projectId, v1 } = await seedTwoVersions();

    const plain = await dispatch(app, documentUrl(projectId, v1, 'index.html'));
    expect(plain.text()).not.toContain('data-od-url-snapshot-bridge');
    expect(plain.text()).not.toContain('data-od-url-scroll-bridge');

    const bridged = await dispatch(
      app,
      `${documentUrl(projectId, v1, 'index.html')}?odPreviewBridge=snapshot%2Cscroll`,
    );
    expect(bridged.status).toBe(200);
    const bridgedHtml = bridged.text();
    expect(bridgedHtml).toContain('data-od-url-snapshot-bridge');
    expect(bridgedHtml).toContain('data-od-url-scroll-bridge');
    // The document itself is still the captured version.
    expect(bridgedHtml).toContain('version-one-marker');
    expect(bridgedHtml).not.toContain('version-two-marker');
  });

  it('streams the bridge injection for a version above the guard size', async () => {
    const projectId = createProject('version-doc-large');
    const filler = `<p>${'v'.repeat(64)}</p>`.repeat(Math.ceil((2 * 1024 * 1024 + 4096) / 71));
    const large = '<!doctype html><html><head><title>Big</title></head>'
      + `<body><h1>version-one-marker</h1>${filler}</body></html>`;
    expect(large.length).toBeGreaterThan(2 * 1024 * 1024);
    await seedFile(projectId, 'big.html', large);
    const v1 = await seedVersion(projectId, 'big.html', large);
    await seedFile(projectId, 'big.html', '<!doctype html><html><body>version-two-marker</body></html>');

    const response = await dispatch(
      app,
      `${documentUrl(projectId, v1, 'big.html')}?odPreviewBridge=snapshot`,
    );
    expect(response.status).toBe(200);
    const html = response.text();
    expect(html).toContain('data-od-url-snapshot-bridge');
    expect(html).toContain('version-one-marker');
    expect(html).not.toContain('version-two-marker');
    expect(html.length).toBeGreaterThan(2 * 1024 * 1024);
  });

  it('refuses a version id that does not belong to the requested document', async () => {
    const { projectId } = await seedTwoVersions();

    const response = await dispatch(app, documentUrl(projectId, randomUUID(), 'index.html'));
    expect(response.status).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: 'VERSION_NOT_FOUND' } });
  });

  it('refuses to expose the internal version store through the route', async () => {
    const { projectId, v1 } = await seedTwoVersions();

    const response = await dispatch(
      app,
      `/api/projects/${encodeURIComponent(projectId)}`
      + `/version-preview/${encodeURIComponent(v1)}/.file-versions/manifest.json`,
    );
    expect(response.status).toBe(404);
  });

  it('404s an unknown project', async () => {
    const response = await dispatch(
      app,
      documentUrl(`missing-${randomUUID()}`, randomUUID(), 'index.html'),
    );
    expect(response.status).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: 'PROJECT_NOT_FOUND' } });
  });

  it('never writes into the project while serving history', async () => {
    const projectId = createProject();
    await seedFile(projectId, 'index.html', V1_HTML);
    const versionRoot = path.join(tempDir, projectId, '.file-versions');
    const before = await readdir(versionRoot).catch(() => [] as string[]);

    const response = await dispatch(app, documentUrl(projectId, randomUUID(), 'index.html'));
    expect(response.status).toBe(404);

    const after = await readdir(versionRoot).catch(() => [] as string[]);
    expect(after).toEqual(before);
  });

  describe('project read authority', () => {
    function memberHeaders(memberId: string, workspaceId = WORKSPACE_ID) {
      return {
        'x-od-workspace-id': workspaceId,
        'x-od-workspace-member-id': memberId,
        'x-od-workspace-type': 'team',
        'x-od-workspace-role': 'owner',
        'x-od-workspace-lifecycle-state': 'active',
        'x-od-workspace-member-status': 'active',
        'x-od-workspace-can-share-projects': 'true',
        'x-od-workspace-can-write-synced-files': 'true',
      };
    }

    async function seedWorkspaceBoundProject(): Promise<{ projectId: string; v1: string }> {
      const projectId = createProject('version-doc-ws');
      ensureWorkspaceProject(db, {
        projectId,
        workspaceId: WORKSPACE_ID,
        visibility: 'personal',
        createdByWorkspaceMemberId: OWNER_MEMBER_ID,
        syncState: 'synced',
      });
      await seedFile(projectId, 'index.html', V1_HTML);
      const v1 = await seedVersion(projectId, 'index.html', V1_HTML);
      await seedFile(projectId, 'app.js', 'globalThis.__od = 1;');
      return { projectId, v1 };
    }

    it('serves the owner of a workspace-bound project', async () => {
      const { projectId, v1 } = await seedWorkspaceBoundProject();
      const response = await dispatch(app, documentUrl(projectId, v1, 'index.html'), {
        headers: memberHeaders(OWNER_MEMBER_ID),
      });
      expect(response.status).toBe(200);
      expect(response.text()).toContain('version-one-marker');
    });

    it('refuses another member of the same workspace, exactly like /raw', async () => {
      const { projectId, v1 } = await seedWorkspaceBoundProject();
      const headers = memberHeaders(OTHER_MEMBER_ID);

      const raw = await dispatch(app, `/api/projects/${projectId}/raw/index.html`, { headers });
      const version = await dispatch(app, documentUrl(projectId, v1, 'index.html'), { headers });

      expect(raw.status).toBe(403);
      expect(version.status).toBe(raw.status);
      expect(version.json()).toMatchObject({
        error: { code: 'WORKSPACE_PROJECT_PERMISSION_DENIED' },
      });
    });

    it('refuses a foreign workspace identity, exactly like /raw', async () => {
      const { projectId, v1 } = await seedWorkspaceBoundProject();
      const headers = memberHeaders(OWNER_MEMBER_ID, 'ws-somebody-else');

      const raw = await dispatch(app, `/api/projects/${projectId}/raw/index.html`, { headers });
      const version = await dispatch(app, documentUrl(projectId, v1, 'index.html'), { headers });

      expect(raw.status).toBe(403);
      expect(version.status).toBe(raw.status);
    });

    it('refuses an incomplete workspace context, exactly like /raw', async () => {
      const { projectId, v1 } = await seedWorkspaceBoundProject();
      const headers = { 'x-od-workspace-id': WORKSPACE_ID };

      const raw = await dispatch(app, `/api/projects/${projectId}/raw/index.html`, { headers });
      const version = await dispatch(app, documentUrl(projectId, v1, 'index.html'), { headers });

      expect(raw.status).toBe(400);
      expect(version.status).toBe(raw.status);
      expect(version.json()).toMatchObject({
        error: { code: 'WORKSPACE_CONTEXT_INCOMPLETE' },
      });
    });

    it('gates a subresource read with the same authority as the document', async () => {
      const { projectId, v1 } = await seedWorkspaceBoundProject();
      const assetUrl = resolveFromDocument(documentUrl(projectId, v1, 'index.html'), './app.js');

      const denied = await dispatch(app, assetUrl, { headers: memberHeaders(OTHER_MEMBER_ID) });
      expect(denied.status).toBe(403);

      const allowed = await dispatch(app, assetUrl, { headers: memberHeaders(OWNER_MEMBER_ID) });
      expect(allowed.status).toBe(200);
    });

    it('accepts navigation-query identity the way /raw does for iframe loads', async () => {
      const { projectId, v1 } = await seedWorkspaceBoundProject();
      const base = documentUrl(projectId, v1, 'index.html');

      const allowed = await dispatch(
        app,
        `${base}?workspaceId=${encodeURIComponent(WORKSPACE_ID)}`
        + `&workspaceMemberId=${encodeURIComponent(OWNER_MEMBER_ID)}`,
      );
      expect(allowed.status).toBe(200);
      expect(allowed.text()).toContain('version-one-marker');

      const foreign = await dispatch(
        app,
        `${base}?workspaceId=${encodeURIComponent(WORKSPACE_ID)}`
        + `&workspaceMemberId=${encodeURIComponent(OTHER_MEMBER_ID)}`,
      );
      expect(foreign.status).toBe(403);
    });
  });
});
