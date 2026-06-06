import type http from 'node:http';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { chmod, mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';
import {
  projectUiPreviewRuntimeProxyTarget,
  stopAllProjectUiPreviewRuntimes,
} from '../src/project-ui-preview-runtime.js';

describe('POST /api/import/folder', () => {
  let server: http.Server;
  let baseUrl: string;
  const tempDirs: string[] = [];

  beforeAll(async () => {
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  });

  afterEach(async () => {
    await stopAllProjectUiPreviewRuntimes();
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    return new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function makeFolder(): string {
    const d = mkdtempSync(path.join(tmpdir(), 'od-import-'));
    tempDirs.push(d);
    return d;
  }

  async function importFolder(body: unknown) {
    return fetch(`${baseUrl}/api/import/folder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async function withSandboxMode<T>(run: () => Promise<T>): Promise<T> {
    const previous = process.env.OD_SANDBOX_MODE;
    process.env.OD_SANDBOX_MODE = '1';
    try {
      return await run();
    } finally {
      if (previous == null) delete process.env.OD_SANDBOX_MODE;
      else process.env.OD_SANDBOX_MODE = previous;
    }
  }

  it('creates a project rooted at the submitted folder', async () => {
    const folder = makeFolder();
    await writeFile(path.join(folder, 'index.html'), '<!doctype html>');

    const resp = await importFolder({ baseDir: folder });
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as {
      project: { id: string; metadata?: { baseDir?: string; importedFrom?: string } };
      conversationId: string;
      entryFile: string | null;
    };
    expect(body.project.metadata?.baseDir).toBeTruthy();
    expect(body.project.metadata?.importedFrom).toBe('folder');
    expect(body.conversationId).toBeTruthy();
    expect(body.entryFile).toBe('index.html');

    const tabsResp = await fetch(`${baseUrl}/api/projects/${body.project.id}/tabs`);
    expect(tabsResp.status).toBe(200);
    const tabs = (await tabsResp.json()) as {
      tabs: string[];
      active: string | null;
      hasSavedState?: boolean;
      updatedAt?: number;
    };
    expect(tabs).toMatchObject({ tabs: [], active: null, hasSavedState: true });
    expect(typeof tabs.updatedAt).toBe('number');
  });

  it('rejects folder imports in sandbox mode', async () => {
    await withSandboxMode(async () => {
      const folder = makeFolder();
      await writeFile(path.join(folder, 'index.html'), '<!doctype html>');

      const resp = await importFolder({ baseDir: folder });
      expect(resp.status).toBe(400);
      const body = (await resp.json()) as { error?: { message?: string } };
      expect(body.error?.message).toMatch(/OD_SANDBOX_MODE/i);
    });
  });

  it('rejects sandbox runs for imported folders before creating a run', async () => {
    const folder = makeFolder();
    await writeFile(path.join(folder, 'index.html'), '<!doctype html>');

    const importResp = await importFolder({ baseDir: folder });
    expect(importResp.status).toBe(200);
    const { project } = (await importResp.json()) as { project: { id: string } };

    await withSandboxMode(async () => {
      const runResp = await fetch(`${baseUrl}/api/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: 'claude',
          projectId: project.id,
          message: 'Inspect the imported project.',
        }),
      });
      expect(runResp.status).toBe(400);
      const body = (await runResp.json()) as { error?: { message?: string } };
      expect(body.error?.message).toMatch(/imported-folder projects.*OD_SANDBOX_MODE/i);
    });
  });

  it('rejects sandbox chat runs for imported folders before creating a run', async () => {
    const folder = makeFolder();
    await writeFile(path.join(folder, 'index.html'), '<!doctype html>');

    const importResp = await importFolder({ baseDir: folder });
    expect(importResp.status).toBe(200);
    const { project } = (await importResp.json()) as { project: { id: string } };

    await withSandboxMode(async () => {
      const chatResp = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: 'claude',
          projectId: project.id,
          message: 'Inspect the imported project.',
        }),
      });
      expect(chatResp.status).toBe(400);
      const body = (await chatResp.json()) as { error?: { message?: string } };
      expect(body.error?.message).toMatch(/imported-folder projects.*OD_SANDBOX_MODE/i);

      const runsResp = await fetch(`${baseUrl}/api/runs?projectId=${encodeURIComponent(project.id)}`);
      expect(runsResp.status).toBe(200);
      const runsBody = (await runsResp.json()) as { runs: unknown[] };
      expect(runsBody.runs).toHaveLength(0);
    });
  });

  it('opens imported-folder projects through host editor routes in sandbox mode', async () => {
    const folder = makeFolder();
    await writeFile(path.join(folder, 'index.html'), '<!doctype html>');
    const binDir = makeFolder();
    const cursorBin = path.join(
      binDir,
      process.platform === 'win32' ? 'cursor.cmd' : 'cursor',
    );
    await writeFile(
      cursorBin,
      process.platform === 'win32' ? '@echo off\r\nexit /b 0\r\n' : '#!/bin/sh\nexit 0\n',
    );
    await chmod(cursorBin, 0o755);

    const importResp = await importFolder({ baseDir: folder });
    expect(importResp.status).toBe(200);
    const { project } = (await importResp.json()) as { project: { id: string } };

    const previousPath = process.env.PATH;
    process.env.PATH = `${binDir}${path.delimiter}${previousPath ?? ''}`;
    try {
      await withSandboxMode(async () => {
        const resp = await fetch(`${baseUrl}/api/projects/${project.id}/open-in`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ editorId: 'cursor' }),
        });
        expect(resp.status).toBe(200);
        const body = (await resp.json()) as { path?: string };
        expect(body.path).toBe(await realpath(folder));
      });
    } finally {
      if (previousPath == null) delete process.env.PATH;
      else process.env.PATH = previousPath;
    }
  });

  it('still opens an imported-folder project record in sandbox mode', async () => {
    const folder = makeFolder();
    await writeFile(path.join(folder, 'index.html'), '<!doctype html>');

    const importResp = await importFolder({ baseDir: folder });
    expect(importResp.status).toBe(200);
    const { project } = (await importResp.json()) as { project: { id: string } };

    await withSandboxMode(async () => {
      const resp = await fetch(`${baseUrl}/api/projects/${project.id}`);
      expect(resp.status).toBe(200);
      const body = (await resp.json()) as {
        project?: { id?: string; metadata?: { baseDir?: string } };
      };
      expect(body.project?.id).toBe(project.id);
      expect(body.project?.metadata?.baseDir).toBeTruthy();
    });
  });

  it('rejects imported-folder project file listing in sandbox mode', async () => {
    const folder = makeFolder();
    await writeFile(path.join(folder, 'index.html'), '<!doctype html>');

    const importResp = await importFolder({ baseDir: folder });
    expect(importResp.status).toBe(200);
    const { project } = (await importResp.json()) as { project: { id: string } };

    await withSandboxMode(async () => {
      const resp = await fetch(`${baseUrl}/api/projects/${project.id}/files`);
      expect(resp.status).toBe(400);
      const body = (await resp.json()) as { error?: { message?: string } };
      expect(body.error?.message).toMatch(/imported-folder projects.*OD_SANDBOX_MODE/i);
    });
  });

  it('auto-detects the entry file when present', async () => {
    const folder = makeFolder();
    await writeFile(path.join(folder, 'index.html'), '');
    const resp = await importFolder({ baseDir: folder });
    const body = (await resp.json()) as { entryFile: string | null };
    expect(body.entryFile).toBe('index.html');
  });

  it('discovers static HTML UI surfaces with frontend dependencies', async () => {
    const folder = makeFolder();
    await mkdir(path.join(folder, 'assets'), { recursive: true });
    await mkdir(path.join(folder, 'fonts'), { recursive: true });
    await writeFile(
      path.join(folder, 'index.html'),
      '<!doctype html><link rel="stylesheet" href="./styles.css"><img src="./assets/hero.jpg"><script src="./app.js"></script>',
    );
    await writeFile(
      path.join(folder, 'styles.css'),
      "@import 'tailwindcss'; @font-face{font-family:Inter;src:url('./fonts/Inter.woff2')} body{background:url('./assets/bg.png')}",
    );
    await writeFile(path.join(folder, 'app.js'), "import { motion } from 'framer-motion';\nimport './more.css';\n");
    await writeFile(path.join(folder, 'more.css'), '.hero{color:red}');
    await writeFile(path.join(folder, 'assets/hero.jpg'), 'jpg');
    await writeFile(path.join(folder, 'assets/bg.png'), 'png');
    await writeFile(path.join(folder, 'fonts/Inter.woff2'), 'font');

    const importResp = await importFolder({ baseDir: folder });
    expect(importResp.status).toBe(200);
    const { project } = (await importResp.json()) as { project: { id: string } };

    const resp = await fetch(`${baseUrl}/api/projects/${project.id}/ui-surfaces`);
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as {
      surfaces: Array<{
        kind: string;
        route: string | null;
        entryFile: string;
        previewFile: string | null;
        previewRuntimeRoot: string | null;
        previewPath: string | null;
        previewStatus: string;
        sourceFiles: string[];
        styleFiles: string[];
        scriptFiles: string[];
        assetFiles: string[];
        fontFiles: string[];
        externalDependencies: Array<{ packageName: string; kind: string }>;
      }>;
    };
    expect(body.surfaces).toHaveLength(1);
    const surface = body.surfaces[0]!;
    expect(surface.kind).toBe('static-html');
    expect(surface.route).toBe('/');
    expect(surface.entryFile).toBe('index.html');
    expect(surface.previewFile).toBe('index.html');
    expect(surface.previewRuntimeRoot).toBeNull();
    expect(surface.previewPath).toBe('/');
    expect(surface.previewStatus).toBe('live-preview');
    expect(surface.sourceFiles).toContain('index.html');
    expect(surface.styleFiles).toEqual(expect.arrayContaining(['styles.css', 'more.css']));
    expect(surface.scriptFiles).toContain('app.js');
    expect(surface.assetFiles).toEqual(expect.arrayContaining(['assets/hero.jpg', 'assets/bg.png']));
    expect(surface.fontFiles).toContain('fonts/Inter.woff2');
    expect(surface.externalDependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ packageName: 'framer-motion', kind: 'animation' }),
        expect.objectContaining({ packageName: 'tailwindcss', kind: 'styling' }),
      ]),
    );
  });

  it('discovers Next route surfaces without expanding node_modules', async () => {
    const folder = makeFolder();
    await mkdir(path.join(folder, 'app/components'), { recursive: true });
    await writeFile(
      path.join(folder, 'package.json'),
      JSON.stringify({
        dependencies: {
          next: '16.0.0',
          react: '18.0.0',
          '@radix-ui/react-dialog': '1.0.0',
        },
      }),
    );
    await writeFile(path.join(folder, 'app/layout.tsx'), 'export default function Layout({children}){return children}');
    await writeFile(
      path.join(folder, 'app/page.tsx'),
      "import { Dialog } from '@radix-ui/react-dialog';\nimport { Hero } from './components/Hero';\nimport './page.css';\nexport default function Page(){return <Hero/>}",
    );
    await writeFile(path.join(folder, 'app/components/Hero.tsx'), 'export function Hero(){return <main>Hi</main>}');
    await writeFile(path.join(folder, 'app/page.css'), 'main{display:grid}');

    const importResp = await importFolder({ baseDir: folder });
    expect(importResp.status).toBe(200);
    const { project } = (await importResp.json()) as { project: { id: string } };

    const resp = await fetch(`${baseUrl}/api/projects/${project.id}/ui-surfaces`);
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as {
      surfaces: Array<{
        kind: string;
        route: string | null;
        framework: string | null;
        entryFile: string;
        previewRuntimeRoot: string | null;
        previewPath: string | null;
        previewStatus: string;
        sourceFiles: string[];
        styleFiles: string[];
        externalDependencies: Array<{ packageName: string; importPath?: string }>;
      }>;
    };
    const surface = body.surfaces.find((item) => item.entryFile === 'app/page.tsx');
    expect(surface).toBeTruthy();
    expect(surface?.kind).toBe('next-route');
    expect(surface?.route).toBe('/');
    expect(surface?.framework).toBe('Next.js');
    expect(surface?.previewRuntimeRoot).toBe('');
    expect(surface?.previewPath).toBe('/');
    expect(surface?.previewStatus).toBe('needs-setup');
    expect(surface?.sourceFiles).toEqual(
      expect.arrayContaining(['app/page.tsx', 'app/layout.tsx', 'app/components/Hero.tsx']),
    );
    expect(surface?.styleFiles).toContain('app/page.css');
    expect(surface?.externalDependencies).toEqual(
      expect.arrayContaining([expect.objectContaining({ packageName: '@radix-ui/react-dialog' })]),
    );
    expect(JSON.stringify(surface)).not.toContain('node_modules');
  });

  it('excludes Next API route files from UI surfaces', async () => {
    const folder = makeFolder();
    await mkdir(path.join(folder, 'pages/api'), { recursive: true });
    await mkdir(path.join(folder, 'src/pages/api'), { recursive: true });
    await writeFile(
      path.join(folder, 'package.json'),
      JSON.stringify({
        dependencies: {
          next: '16.0.0',
          react: '18.0.0',
        },
      }),
    );
    await writeFile(path.join(folder, 'pages/index.tsx'), 'export default function Home(){return <main>Home</main>}');
    await writeFile(path.join(folder, 'pages/api/hello.ts'), 'export default function handler(_req, res){res.status(200).json({ok:true})}');
    await writeFile(path.join(folder, 'src/pages/api/health.ts'), 'export default function handler(_req, res){res.status(200).json({ok:true})}');

    const importResp = await importFolder({ baseDir: folder });
    expect(importResp.status).toBe(200);
    const { project } = (await importResp.json()) as { project: { id: string } };

    const resp = await fetch(`${baseUrl}/api/projects/${project.id}/ui-surfaces`);
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as {
      surfaces: Array<{
        route: string | null;
        entryFile: string;
      }>;
    };
    const entryFiles = body.surfaces.map((surface) => surface.entryFile);
    const routes = body.surfaces.map((surface) => surface.route);

    expect(entryFiles).toContain('pages/index.tsx');
    expect(entryFiles).not.toContain('pages/api/hello.ts');
    expect(entryFiles).not.toContain('src/pages/api/health.ts');
    expect(routes).not.toContain('/api/hello');
    expect(routes).not.toContain('/api/health');
  });

  it('starts an imported app runtime for source-backed UI surfaces', async () => {
    const folder = makeFolder();
    await mkdir(path.join(folder, 'app/messages/[conversationId]'), { recursive: true });
    await mkdir(path.join(folder, 'node_modules'), { recursive: true });
    await writeFile(
      path.join(folder, 'package.json'),
      JSON.stringify({
        packageManager: 'pnpm@10.33.2',
        scripts: { dev: 'node server.mjs' },
        dependencies: {
          next: '16.0.0',
          react: '18.0.0',
        },
      }),
    );
    await writeFile(
      path.join(folder, 'server.mjs'),
      `
import http from 'node:http';
if (process.argv.includes('--')) {
  console.error('pnpm forwarded a literal -- separator');
  process.exit(1);
}
const port = Number(process.env.PORT || 0);
const server = http.createServer((req, res) => {
  if (req.url === '/styles.css') {
    res.setHeader('content-type', 'text/css');
    res.end("@font-face{font-family:Inter;src:url('/fonts/Inter.woff2')}body{font-family:Inter}");
    return;
  }
  if (req.method === 'POST' && req.url === '/submit') {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      res.setHeader('content-type', 'text/html');
      res.end('<!doctype html><h1>Posted</h1><p>Content-Type ' + req.headers['content-type'] + '</p><p>Body ' + body + '</p>');
    });
    return;
  }
  if (req.url === '/fonts/Inter.woff2') {
    res.setHeader('content-type', 'font/woff2');
    res.end('font');
    return;
  }
  res.setHeader('content-type', 'text/html');
  res.write('<!doctype html>');
  res.end('<html><head><link rel="stylesheet" href="/styles.css"><script type="module">import RefreshRuntime from "/@react-refresh"; import "/@vite/client";</script></head><body><form method="post" action="/submit"><input name="query" value="Search"></form><a href="/search">Search</a><h1>Preview ' + req.url + '</h1></body></html>');
});
server.listen(port, '127.0.0.1');
process.on('SIGTERM', () => server.close(() => process.exit(0)));
`,
    );
    await writeFile(path.join(folder, 'app/layout.tsx'), 'export default function Layout({children}){return children}');
    await writeFile(
      path.join(folder, 'app/messages/[conversationId]/page.tsx'),
      'export default function Page(){return <main>Messages</main>}',
    );

    const importResp = await importFolder({ baseDir: folder });
    expect(importResp.status).toBe(200);
    const { project } = (await importResp.json()) as { project: { id: string } };

    const surfacesResp = await fetch(`${baseUrl}/api/projects/${project.id}/ui-surfaces`);
    expect(surfacesResp.status).toBe(200);
    const surfacesBody = (await surfacesResp.json()) as {
      surfaces: Array<{
        id: string;
        entryFile: string;
        route: string | null;
        previewPath: string | null;
        previewRuntimeRoot: string | null;
        previewStatus: string;
      }>;
    };
    const surface = surfacesBody.surfaces.find((item) =>
      item.entryFile === 'app/messages/[conversationId]/page.tsx',
    );
    expect(surface).toEqual(expect.objectContaining({
      route: '/messages/:conversationId',
      previewPath: '/messages/preview',
      previewRuntimeRoot: '',
      previewStatus: 'source-mapped',
    }));

    const previewResp = await fetch(`${baseUrl}/api/projects/${project.id}/ui-preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryFile: surface?.entryFile }),
    });
    expect(previewResp.status).toBe(200);
    const previewBody = (await previewResp.json()) as {
      status: string;
      runtimeRoot: string | null;
      baseUrl: string | null;
      url: string | null;
      upstreamBaseUrl?: string | null;
      route: string | null;
    };
    expect(previewBody.status).toBe('ready');
    expect(previewBody.runtimeRoot).toBe('');
    expect(previewBody.route).toBe('/messages/preview');
    expect(previewBody.baseUrl).toMatch(
      new RegExp(`^/api/projects/${project.id}/ui-preview/proxy/[a-f0-9]{32}$`, 'u'),
    );
    expect(previewBody.url).toBe(`${previewBody.baseUrl}/messages/preview`);
    expect(previewBody.upstreamBaseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/u);

    const rendered = await fetch(`${baseUrl}${previewBody.url!}`);
    expect(rendered.status).toBe(200);
    const renderedHtml = await rendered.text();
    expect(renderedHtml).toContain('Preview /messages/preview');
    expect(renderedHtml).toContain(`<link rel="stylesheet" href="${previewBody.baseUrl}/styles.css">`);
    expect(renderedHtml).toContain(`from "${previewBody.baseUrl}/@react-refresh"`);
    expect(renderedHtml).toContain(`import "${previewBody.baseUrl}/@vite/client"`);
    expect(renderedHtml).toContain(`action="${previewBody.baseUrl}/submit"`);
    expect(renderedHtml).toContain(`<a href="${previewBody.baseUrl}/search">Search</a>`);
    expect(renderedHtml).toContain('data-od-url-snapshot-bridge');
    expect(renderedHtml).toContain("data.type === 'od:editable-snapshot'");
    expect(renderedHtml).toContain("type: 'od:editable-snapshot:result'");

    const postResp = await fetch(`${baseUrl}${previewBody.baseUrl!}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'query=Search&intent=preview',
    });
    expect(postResp.status).toBe(200);
    const postHtml = await postResp.text();
    expect(postHtml).toContain('Content-Type application/x-www-form-urlencoded');
    expect(postHtml).toContain('Body query=Search&intent=preview');

    const font = await fetch(`${baseUrl}${previewBody.baseUrl!}/fonts/Inter.woff2`, {
      headers: { Origin: 'null' },
    });
    expect(font.status).toBe(200);
    expect(font.headers.get('access-control-allow-origin')).toBe('*');

    const proxyToken = previewBody.baseUrl!.split('/').pop();
    expect(proxyToken).toBeTruthy();
    expect(projectUiPreviewRuntimeProxyTarget(project.id, proxyToken!)).not.toBeNull();
    const deleteResp = await fetch(`${baseUrl}/api/projects/${project.id}`, { method: 'DELETE' });
    expect(deleteResp.status).toBe(200);
    expect(projectUiPreviewRuntimeProxyTarget(project.id, proxyToken!)).toBeNull();
  });

  it('does not wait for a source-backed route render before returning the preview runtime', async () => {
    const folder = makeFolder();
    await mkdir(path.join(folder, 'app/messages/[conversationId]'), { recursive: true });
    await mkdir(path.join(folder, 'node_modules'), { recursive: true });
    await writeFile(
      path.join(folder, 'package.json'),
      JSON.stringify({
        packageManager: 'pnpm@10.33.2',
        scripts: { dev: 'node server.mjs' },
        dependencies: {
          next: '16.0.0',
          react: '18.0.0',
        },
      }),
    );
    await writeFile(
      path.join(folder, 'server.mjs'),
      `
import http from 'node:http';
const port = Number(process.env.PORT || 0);
const server = http.createServer((req, res) => {
  if (req.url === '/messages/preview') return;
  res.setHeader('content-type', 'text/html');
  res.end('<!doctype html><h1>Runtime reachable</h1>');
});
server.listen(port, '127.0.0.1');
process.on('SIGTERM', () => server.close(() => process.exit(0)));
`,
    );
    await writeFile(path.join(folder, 'app/layout.tsx'), 'export default function Layout({children}){return children}');
    await writeFile(
      path.join(folder, 'app/messages/[conversationId]/page.tsx'),
      'export default function Page(){return <main>Messages</main>}',
    );

    const importResp = await importFolder({ baseDir: folder });
    expect(importResp.status).toBe(200);
    const { project } = (await importResp.json()) as { project: { id: string } };

    const surfacesResp = await fetch(`${baseUrl}/api/projects/${project.id}/ui-surfaces`);
    const surfacesBody = (await surfacesResp.json()) as {
      surfaces: Array<{ entryFile: string; previewPath: string | null }>;
    };
    const surface = surfacesBody.surfaces.find((item) =>
      item.entryFile === 'app/messages/[conversationId]/page.tsx',
    );
    expect(surface?.previewPath).toBe('/messages/preview');

    const previewResp = await fetch(`${baseUrl}/api/projects/${project.id}/ui-preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryFile: surface?.entryFile }),
    });
    expect(previewResp.status).toBe(200);
    const previewBody = (await previewResp.json()) as {
      status: string;
      route: string | null;
      baseUrl: string | null;
      url: string | null;
    };
    expect(previewBody.status).toBe('ready');
    expect(previewBody.route).toBe('/messages/preview');
    expect(previewBody.baseUrl).toMatch(
      new RegExp(`^/api/projects/${project.id}/ui-preview/proxy/[a-f0-9]{32}$`, 'u'),
    );
    expect(previewBody.url).toBe(`${previewBody.baseUrl}/messages/preview`);
  });

  it('returns null entryFile when the folder has no html file', async () => {
    const folder = makeFolder();
    await writeFile(path.join(folder, 'README.md'), '# hi');
    const resp = await importFolder({ baseDir: folder });
    const body = (await resp.json()) as { entryFile: string | null };
    expect(body.entryFile).toBeNull();
  });

  it('rejects when baseDir is missing', async () => {
    const resp = await importFolder({});
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { error?: { message?: string } };
    expect(body.error?.message).toMatch(/baseDir required/i);
  });

  it('rejects when baseDir is empty', async () => {
    const resp = await importFolder({ baseDir: '   ' });
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { error?: { message?: string } };
    expect(body.error?.message).toMatch(/baseDir required/i);
  });

  it('rejects a relative baseDir', async () => {
    const resp = await importFolder({ baseDir: 'relative/path' });
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { error?: { message?: string } };
    expect(body.error?.message).toMatch(/absolute/i);
  });

  it('rejects a non-existent path', async () => {
    const resp = await importFolder({ baseDir: '/this/path/should/not/exist/od-test' });
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { error?: { message?: string } };
    expect(body.error?.message).toMatch(/not found/i);
  });

  it('rejects when the path points at a file', async () => {
    const folder = makeFolder();
    const filePath = path.join(folder, 'file.txt');
    await writeFile(filePath, 'hi');
    const resp = await importFolder({ baseDir: filePath });
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { error?: { message?: string } };
    expect(body.error?.message).toMatch(/directory/i);
  });

  it('rejects the filesystem root as an import folder', async () => {
    const root = path.parse(process.cwd()).root;
    const resp = await importFolder({ baseDir: root });
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { error?: { message?: string } };
    expect(body.error?.message).toMatch(/filesystem root/i);
  });

  // Security: a user-controlled symlink at baseDir would let writeProjectFile
  // escape the project sandbox at every later call (resolveSafe checks the
  // *literal* baseDir, but the OS follows symlinks at open() time). The
  // realpath() canonicalization at import collapses the chain so the stored
  // baseDir == what the kernel will write to.
  it('canonicalizes symlinks via realpath at import time', async () => {
    const realFolder = makeFolder();
    await writeFile(path.join(realFolder, 'index.html'), '');
    const linkParent = makeFolder();
    const linkPath = path.join(linkParent, 'sneaky');
    symlinkSync(realFolder, linkPath);

    const resp = await importFolder({ baseDir: linkPath });
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as {
      project: { metadata?: { baseDir?: string } };
    };
    // Stored baseDir must be the realpath, not the symlink path. Use
    // realpath on the temp folder too since macOS prefixes /private/.
    const expected = path.normalize(realFolder);
    expect(body.project.metadata?.baseDir).not.toBe(linkPath);
    // The stored baseDir resolves to realFolder (allowing for /private/ prefix)
    expect(
      body.project.metadata?.baseDir?.endsWith(path.basename(expected)),
    ).toBe(true);
  });

  // Defense against descendant-symlink escape: even after canonicalizing
  // the import-time baseDir, a symlink *inside* the imported folder
  // (e.g. assets -> /Users/me/.ssh) used to pass resolveSafe()'s string
  // check because the literal path stayed under baseDir, but the OS
  // followed the link at open() time and returned bytes from outside
  // the project. resolveSafeReal() canonicalizes each read/write/delete,
  // so any link reaching outside the project root is refused with a
  // 4xx instead of an exfiltration channel.
  // Defense against client-supplied baseDir on the generic create path:
  // /api/import/folder owns the realpath() + RUNTIME_DATA_DIR reentry
  // checks. POST /api/projects (and PATCH) must refuse a metadata.baseDir
  // payload outright, otherwise an attacker bypasses the import-time
  // sandbox guards.
  it('rejects baseDir on the generic POST /api/projects', async () => {
    const resp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: `tmp-${Date.now()}`,
        name: 'sneaky',
        metadata: { kind: 'prototype', baseDir: '/etc' },
      }),
    });
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { error?: { message?: string } };
    expect(body.error?.message).toMatch(/baseDir.*import\/folder/i);
  });

  // Same defense extended to the archive endpoint. resolveSafe() at the
  // archive root only did string-prefix validation; a directory symlink
  // like `docs -> /Users/me/.ssh` would pass and collectArchiveEntries()
  // would zip files outside the imported folder. resolveSafeReal() now
  // canonicalizes the archive root before walking it.
  it('refuses archive root that resolves outside the imported folder', async () => {
    const real = makeFolder();
    await writeFile(path.join(real, 'index.html'), '<!doctype html>');
    try {
      symlinkSync('/etc', path.join(real, 'docs'));
    } catch {
      return;
    }
    const importResp = await importFolder({ baseDir: real });
    const { project } = (await importResp.json()) as { project: { id: string } };
    const archive = await fetch(
      `${baseUrl}/api/projects/${project.id}/archive?root=docs`,
    );
    expect(archive.status).toBe(400);
  });

  // Regression for the patch-metadata wipe. updateProject() replaces
  // metadata wholesale, so a normal UI patch that omits baseDir would
  // silently detach the project from its imported folder. Verify the
  // route preserves baseDir even when the incoming patch doesn't
  // mention it.
  it('preserves metadata.baseDir when PATCH omits it', async () => {
    const real = makeFolder();
    await writeFile(path.join(real, 'index.html'), '');
    const importResp = await importFolder({ baseDir: real });
    const { project } = (await importResp.json()) as {
      project: { id: string; metadata: { baseDir: string } };
    };
    const originalBaseDir = project.metadata.baseDir;
    expect(originalBaseDir).toBeTruthy();

    // Patch unrelated metadata field. baseDir is not mentioned.
    const patchResp = await fetch(`${baseUrl}/api/projects/${project.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        metadata: { kind: 'prototype', linkedDirs: [] },
      }),
    });
    expect(patchResp.status).toBe(200);
    const after = (await patchResp.json()) as {
      project: { metadata: { baseDir?: string } };
    };
    expect(after.project.metadata.baseDir).toBe(originalBaseDir);
  });

  it('writes generated artifact files into metadata.baseDir instead of the daemon projects dir', async () => {
    const real = makeFolder();
    await writeFile(path.join(real, 'index.html'), '<!doctype html>');
    const importResp = await importFolder({ baseDir: real });
    expect(importResp.status).toBe(200);
    const { project } = (await importResp.json()) as {
      project: { id: string; metadata: { baseDir: string } };
    };

    const saveResp = await fetch(`${baseUrl}/api/projects/${project.id}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        artifact: true,
        artifactManifest: {
          exports: ['html'],
          kind: 'html',
          renderer: 'html',
          title: 'Generated',
        },
        content: '<!doctype html><h1>Generated</h1>',
        name: 'generated.html',
      }),
    });

    expect(saveResp.status).toBe(200);
    expect(await readFile(path.join(project.metadata.baseDir, 'generated.html'), 'utf8')).toContain(
      'Generated',
    );
    expect(
      await readFile(path.join(project.metadata.baseDir, 'generated.html.artifact.json'), 'utf8'),
    ).toContain('"entry": "generated.html"');

    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
    await expect(stat(path.join(dataDir, 'projects', project.id, 'generated.html'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('refuses raw reads through a descendant symlink that escapes the folder', async () => {
    const real = makeFolder();
    await mkdir(path.join(real, 'assets'));
    // Point a symlink at /etc/hosts (always exists, harmless to read,
    // but unambiguously outside the imported folder).
    try {
      symlinkSync('/etc/hosts', path.join(real, 'assets', 'leak.txt'));
    } catch {
      return;
    }
    const importResp = await importFolder({ baseDir: real });
    expect(importResp.status).toBe(200);
    const { project } = (await importResp.json()) as { project: { id: string } };

    const raw = await fetch(
      `${baseUrl}/api/projects/${project.id}/raw/assets/leak.txt`,
    );
    expect(raw.status).toBe(400);
  });

  it('refuses a symlink that resolves into the daemon data directory', async () => {
    // Create a symlink that points into the test's RUNTIME_DATA_DIR (the
    // tmpdir-based path the daemon is using). Without realpath, this would
    // bypass the RUNTIME_DATA_DIR-reentry check.
    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) {
      // Test setup didn't pin a data dir — skip this case rather than guess.
      return;
    }
    const linkParent = makeFolder();
    const linkPath = path.join(linkParent, 'into-data');
    try {
      symlinkSync(dataDir, linkPath);
    } catch {
      // Symlink creation may fail in restricted CI environments — skip.
      return;
    }
    const resp = await importFolder({ baseDir: linkPath });
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { error?: { message?: string } };
    expect(body.error?.message).toMatch(/data directory/i);
  });
});
