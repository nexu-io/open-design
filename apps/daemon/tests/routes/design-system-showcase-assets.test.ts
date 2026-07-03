import type http from 'node:http';
import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { registerDesignSystemRoutes } from '../../src/routes/design-systems.js';

let server: http.Server | null = null;

afterEach(async () => {
  if (!server) return;
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  server = null;
});

function listen(app: express.Express): Promise<string> {
  return new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const address = server?.address() as { port: number };
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function registerRoutes(app: express.Express, staticHtml: string | null) {
  registerDesignSystemRoutes(app, {
    db: {} as never,
    paths: {
      CRAFT_DIR: '',
      USER_DESIGN_SYSTEMS_DIR: '',
    } as never,
    projectFiles: {} as never,
    projectStore: {} as never,
    designSystems: {
      buildUserDesignSystemArchive: async () => null,
      createUserDesignSystem: async () => ({}) as never,
      deleteUserDesignSystem: async () => false,
      ensureUserDesignSystemWorkspaceProject: async () => null,
      listAllDesignSystems: async () => [],
      listUserDesignSystemFiles: async () => null,
      listUserDesignSystemRevisions: async () => null,
      prepareDesignTokenContractRebuild: async () => ({ decision: { available: false } }) as never,
      readAvailableDesignSystem: async (id: string) => (id === 'bento' ? '# Bento' : null),
      readAvailableDesignSystemPackageInfo: async () => null,
      readAvailableDesignSystemStaticFile: async (_id: string, filePath: string) =>
        staticHtml && filePath === 'system/kit.html'
          ? {
              bytes: Buffer.from(staticHtml, 'utf8'),
              contentType: 'text/html; charset=utf-8',
              updatedAt: 'Tue, 30 Jun 2026 00:00:00 GMT',
            }
          : null,
      readDesignSystemWorkspaceTextFile: async () => null,
      readUserDesignSystemFile: async () => null,
      renderDesignSystemPreview: () => '<!doctype html><title>preview</title>',
      renderDesignSystemShowcase: (id: string, body: string) =>
        `<!doctype html><title>${id} synthetic</title><main>${body}</main>`,
      updateUserDesignSystem: async () => null,
      updateUserDesignSystemRevisionStatus: async () => null,
    },
    generationJobs: {
      get: () => null,
      rebuildTokenContract: () => ({}) as never,
      revise: () => ({}) as never,
      start: () => ({}) as never,
    },
  });
}

describe('design-system showcase route', () => {
  it('serves packaged kit HTML and rewrites relative package assets', async () => {
    const app = express();
    registerRoutes(
      app,
      [
        '<!doctype html>',
        '<link rel="stylesheet" href="../tokens.css">',
        '<img src="./assets/logo.svg">',
        '<style>@font-face{src:url("../fonts/display.woff2?v=1")}</style>',
      ].join(''),
    );
    const baseUrl = await listen(app);

    const res = await fetch(`${baseUrl}/api/design-systems/bento/showcase`);
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('/api/design-systems/bento/static?path=tokens.css');
    expect(html).toContain('/api/design-systems/bento/static?path=system%2Fassets%2Flogo.svg');
    expect(html).toContain('/api/design-systems/bento/static?path=fonts%2Fdisplay.woff2&v=1');
    expect(html).not.toContain('bento synthetic');
  });

  it('keeps the generated showcase fallback when no packaged kit exists', async () => {
    const app = express();
    registerRoutes(app, null);
    const baseUrl = await listen(app);

    const res = await fetch(`${baseUrl}/api/design-systems/bento/showcase`);
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('bento synthetic');
  });
});
