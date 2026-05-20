import express from 'express';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { registerDesignSystemToolRoutes } from '../src/design-system-tool-routes.js';

type JsonFetchResult = { status: number; body: Record<string, any> };

let server: http.Server | undefined;

afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    if (!server) return resolve();
    server.close((error?: Error) => (error ? reject(error) : resolve()));
  });
  server = undefined;
});

function fresh(): string {
  return mkdtempSync(path.join(tmpdir(), 'od-design-system-tool-routes-'));
}

function writeHybridDesignSystem(root: string, id: string): string {
  const dir = path.join(root, id);
  mkdirSync(path.join(dir, 'preview'), { recursive: true });
  writeFileSync(path.join(dir, 'DESIGN.md'), '# Test\n');
  writeFileSync(path.join(dir, 'tokens.css'), ':root { --bg: #fff; }');
  writeFileSync(path.join(dir, 'components.html'), '<button>ok</button>');
  writeFileSync(path.join(dir, 'preview', 'colors.html'), '<h1>Colors</h1>');
  writeFileSync(path.join(dir, 'preview', 'spacing.html'), '<h1>Spacing</h1>');
  writeFileSync(path.join(dir, 'manifest.json'), `${JSON.stringify({
    schemaVersion: 'od-design-system-project/v1',
    id,
    name: 'Test',
    category: 'Imported',
    source: { type: 'local', path: '/tmp/source' },
    files: {
      design: 'DESIGN.md',
      tokens: 'tokens.css',
      components: 'components.html',
    },
    preview: {
      dir: 'preview',
      pages: [{ path: 'preview/colors.html', role: 'colors', title: 'Colors' }],
    },
  }, null, 2)}\n`);
  return dir;
}

async function startRouteServer(options: {
  builtInRoot: string;
  userRoot: string;
  activeDesignSystemId: string | null;
}): Promise<string> {
  const app = express();
  app.use(express.json());
  registerDesignSystemToolRoutes(app, {
    auth: {
      authorizeToolRequest: (_req, _res, operation) => {
        expect(operation).toBe('design-systems:read');
        return {
          token: 'token',
          runId: 'run-1',
          projectId: 'project-1',
          allowedEndpoints: ['/api/tools/design-systems/read'],
          allowedOperations: ['design-systems:read'],
          issuedAt: new Date(0).toISOString(),
          expiresAt: new Date(60_000).toISOString(),
        };
      },
    },
    http: {
      sendApiError: (res, status, code, message, extras = {}) => {
        res.status(status).json({ error: { code, message, ...extras } });
      },
    },
    paths: {
      DESIGN_SYSTEMS_DIR: options.builtInRoot,
      USER_DESIGN_SYSTEMS_DIR: options.userRoot,
    },
    projects: {
      getProject: () => ({
        id: 'project-1',
        designSystemId: options.activeDesignSystemId,
      }),
    },
  });

  server = app.listen(0);
  await new Promise<void>((resolve) => server?.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('unexpected listen address');
  return `http://127.0.0.1:${address.port}`;
}

async function jsonFetch(url: string, body: Record<string, unknown>): Promise<JsonFetchResult> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer token',
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as Record<string, any> };
}

describe('design-system pull tool route', () => {
  it('reads manifest-allowed files from the active design system', async () => {
    const builtInRoot = fresh();
    const userRoot = fresh();
    writeHybridDesignSystem(builtInRoot, 'pull-brand');
    const baseUrl = await startRouteServer({
      builtInRoot,
      userRoot,
      activeDesignSystemId: 'pull-brand',
    });

    const response = await jsonFetch(`${baseUrl}/api/tools/design-systems/read`, {
      path: 'preview/colors.html',
    });

    expect(response.status).toBe(200);
    expect(response.body.file).toMatchObject({
      path: 'preview/colors.html',
      encoding: 'utf8',
      content: '<h1>Colors</h1>',
    });
  });

  it('rejects unlisted files and non-active design-system ids', async () => {
    const builtInRoot = fresh();
    const userRoot = fresh();
    writeHybridDesignSystem(builtInRoot, 'pull-brand');
    const baseUrl = await startRouteServer({
      builtInRoot,
      userRoot,
      activeDesignSystemId: 'pull-brand',
    });

    const unlisted = await jsonFetch(`${baseUrl}/api/tools/design-systems/read`, {
      path: 'preview/spacing.html',
    });
    expect(unlisted.status).toBe(404);
    expect(unlisted.body.error.code).toBe('DESIGN_SYSTEM_FILE_NOT_FOUND');

    const mismatch = await jsonFetch(`${baseUrl}/api/tools/design-systems/read`, {
      designSystemId: 'other-brand',
      path: 'preview/colors.html',
    });
    expect(mismatch.status).toBe(403);
    expect(mismatch.body.error.code).toBe('DESIGN_SYSTEM_DENIED');
  });
});
