import express, { type Request } from 'express';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { registerDesignSystemToolRoutes } from '../src/routes/design-system-tool.js';

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
  writeFileSync(path.join(dir, 'design-tokens.json'), '{"format":"od-design-tokens/v1","tokens":[]}\n');
  writeFileSync(path.join(dir, 'tailwind-v4.css'), '@import "tailwindcss";\n');
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
      designTokens: 'design-tokens.json',
      tailwind: 'tailwind-v4.css',
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
  userRootForRequest?: (req: Request) => string;
  activeDesignSystemId: string | null;
  projectForRequest?: (
    req: Request,
    id: string,
  ) => { id: string; designSystemId?: string | null } | null | undefined;
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
      ...(options.userRootForRequest
        ? { userDesignSystemsDirFor: options.userRootForRequest }
        : {}),
    },
    projects: {
      getProject: (req, id) =>
        options.projectForRequest
          ? options.projectForRequest(req, id)
          : {
              id: 'project-1',
              designSystemId: options.activeDesignSystemId,
            },
    },
  });

  server = app.listen(0);
  await new Promise<void>((resolve) => server?.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('unexpected listen address');
  return `http://127.0.0.1:${address.port}`;
}

async function jsonFetch(
  url: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): Promise<JsonFetchResult> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer token',
      ...headers,
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

    const derived = await jsonFetch(`${baseUrl}/api/tools/design-systems/read`, {
      path: 'design-tokens.json',
    });

    expect(derived.status).toBe(200);
    expect(derived.body.file).toMatchObject({
      path: 'design-tokens.json',
      encoding: 'utf8',
      content: expect.stringContaining('od-design-tokens/v1'),
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

  it('resolves the token project through the request-scoped project reader', async () => {
    const builtInRoot = fresh();
    const userRoot = fresh();
    writeHybridDesignSystem(builtInRoot, 'pull-brand');
    const baseUrl = await startRouteServer({
      builtInRoot,
      userRoot,
      activeDesignSystemId: 'pull-brand',
      projectForRequest: (req, id) => {
        if (id !== 'project-1') return null;
        if (req.get('x-owner') !== 'bob') return null;
        return { id, designSystemId: 'pull-brand' };
      },
    });

    const denied = await jsonFetch(
      `${baseUrl}/api/tools/design-systems/read`,
      { path: 'preview/colors.html' },
      { 'x-owner': 'alice' },
    );
    expect(denied.status).toBe(404);
    expect(denied.body.error.code).toBe('DESIGN_SYSTEM_NOT_FOUND');

    const allowed = await jsonFetch(
      `${baseUrl}/api/tools/design-systems/read`,
      { path: 'preview/colors.html' },
      { 'x-owner': 'bob' },
    );
    expect(allowed.status).toBe(200);
    expect(allowed.body.file.content).toBe('<h1>Colors</h1>');
  });

  it('reads user design-system files from the request-scoped user root', async () => {
    const builtInRoot = fresh();
    const fallbackUserRoot = fresh();
    const aliceRoot = fresh();
    const bobRoot = fresh();
    writeHybridDesignSystem(aliceRoot, 'tenant-brand');
    writeHybridDesignSystem(bobRoot, 'tenant-brand');
    writeFileSync(path.join(aliceRoot, 'tenant-brand', 'preview', 'colors.html'), '<h1>Alice Colors</h1>');
    writeFileSync(path.join(bobRoot, 'tenant-brand', 'preview', 'colors.html'), '<h1>Bob Colors</h1>');
    const baseUrl = await startRouteServer({
      builtInRoot,
      userRoot: fallbackUserRoot,
      userRootForRequest: (req) => req.get('x-owner') === 'alice' ? aliceRoot : bobRoot,
      activeDesignSystemId: 'user:tenant-brand',
    });

    const alice = await jsonFetch(
      `${baseUrl}/api/tools/design-systems/read`,
      { path: 'preview/colors.html' },
      { 'x-owner': 'alice' },
    );
    expect(alice.status).toBe(200);
    expect(alice.body.file.content).toBe('<h1>Alice Colors</h1>');

    const bob = await jsonFetch(
      `${baseUrl}/api/tools/design-systems/read`,
      { path: 'preview/colors.html' },
      { 'x-owner': 'bob' },
    );
    expect(bob.status).toBe(200);
    expect(bob.body.file.content).toBe('<h1>Bob Colors</h1>');
  });
});
