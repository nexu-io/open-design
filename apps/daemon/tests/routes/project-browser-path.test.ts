import * as nodeFs from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

import express, { type Express } from 'express';
import { createPathConfig } from '@open-design/path-config';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  registerProjectArtifactRoutes,
  registerProjectFileRoutes,
} from '../../src/routes/project/index.js';

async function startMiniServer(app: Express): Promise<{ baseUrl: string; server: http.Server }> {
  return await new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address == null || typeof address === 'string') {
        reject(new Error('mini server did not expose a TCP address'));
        return;
      }
      resolve({
        baseUrl: `http://127.0.0.1:${address.port}`,
        server,
      });
    });
    server.once('error', reject);
  });
}

async function stopMiniServer(server: http.Server): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

function browserPath(pathname: string): string {
  return createPathConfig('/open-design').withBasePath(pathname);
}

describe('browser-facing project URL serializers', () => {
  const tempRoots: string[] = [];
  const servers: http.Server[] = [];

  afterEach(async () => {
    for (const server of servers.splice(0)) await stopMiniServer(server);
    for (const root of tempRoots.splice(0)) rmSync(root, { force: true, recursive: true });
  });

  it('returns an origin-relative prefixed URL when saving an artifact', async () => {
    const artifactsRoot = mkdtempSync(path.join(tmpdir(), 'od-browser-artifact-'));
    tempRoots.push(artifactsRoot);
    const app = express();
    app.use(express.json());
    registerProjectArtifactRoutes(app, {
      http: { getBrowserPath: browserPath },
      uploads: {
        upload: {
          array: () => (_req: unknown, _res: unknown, next: (error?: unknown) => void) => next(),
        },
      },
      paths: { ARTIFACTS_DIR: artifactsRoot },
      node: { path, fs: nodeFs },
      artifacts: {
        sanitizeSlug: () => 'fixture',
        lintArtifact: () => [],
        renderFindingsForAgent: () => '',
      },
    } as any);
    const started = await startMiniServer(app);
    servers.push(started.server);

    const response = await fetch(`${started.baseUrl}/api/artifacts/save`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', host: '127.0.0.1:7456' },
      body: JSON.stringify({ identifier: 'fixture', html: '<!doctype html>' }),
    });
    expect(response.status).toBe(200);
    const body = await response.json() as { url: string };

    expect(body.url).toMatch(/^\/open-design\/artifacts\/[^/]+\/index\.html$/u);
    expect(new URL(body.url, 'https://web.example.test').origin).toBe('https://web.example.test');
    expect(body.url).not.toContain('127.0.0.1');
  });

  it('returns an origin-relative prefixed URL for project previews', async () => {
    const projectsRoot = mkdtempSync(path.join(tmpdir(), 'od-browser-preview-'));
    tempRoots.push(projectsRoot);
    const app = express();
    const projectFiles = {
      listFiles: vi.fn(),
      listProjectFolders: vi.fn(),
      createProjectFolder: vi.fn(),
      deleteProjectFolder: vi.fn(),
      searchProjectFiles: vi.fn(),
      readProjectFile: vi.fn(),
      resolveProjectDir: vi.fn(),
      resolveProjectFilePath: vi.fn(async () => ({ name: 'pages/index.html' })),
      parseByteRange: vi.fn(),
      renameProjectFile: vi.fn(),
      deleteProjectFile: vi.fn(),
      writeProjectFile: vi.fn(),
      sanitizeName: vi.fn(),
      sanitizePath: vi.fn(),
      ensureProject: vi.fn(),
    };
    registerProjectFileRoutes(app, {
      db: {},
      http: {
        getBrowserPath: browserPath,
        sendApiError: (res: any, status: number, _code: string, message: string) =>
          res.status(status).json({ error: message }),
        sendMulterError: vi.fn(),
      },
      paths: { PROJECTS_DIR: projectsRoot },
      uploads: { upload: {} },
      node: { fs: nodeFs },
      projectStore: {
        getProject: () => ({ id: 'demo', metadata: { entryFile: 'pages/index.html' } }),
      },
      projectFiles,
      documents: { buildDocumentPreview: vi.fn() },
      artifacts: { validateArtifactManifestInput: vi.fn() },
      projectPreviewScopes: { mint: () => 'scope12345678', validate: () => true },
    } as any);
    const started = await startMiniServer(app);
    servers.push(started.server);

    const response = await fetch(
      `${started.baseUrl}/api/projects/demo/preview-url?file=${encodeURIComponent('pages/index.html')}`,
      { headers: { host: '127.0.0.1:7456' } },
    );
    expect(response.status).toBe(200);
    const body = await response.json() as { url: string };

    expect(body.url).toBe('/open-design/api/projects/demo/preview/scope12345678/pages/index.html');
    expect(new URL(body.url, 'https://web.example.test').origin).toBe('https://web.example.test');
    expect(body.url).not.toContain('127.0.0.1');
  });
});
