import type http from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

describe('project preview containment routes', () => {
  let server: http.Server;
  let baseUrl: string;
  const projectsToClean: string[] = [];

  beforeAll(async () => {
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  });

  afterAll(async () => {
    for (const id of projectsToClean.splice(0)) {
      await fetch(`${baseUrl}/api/projects/${id}`, { method: 'DELETE' }).catch(() => {});
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function createProject(metadata: Record<string, unknown> = {}): Promise<string> {
    const id = `preview-containment-${randomUUID()}`;
    const response = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id,
        name: 'Preview containment project',
        metadata,
      }),
    });
    expect(response.ok).toBe(true);
    projectsToClean.push(id);
    return id;
  }

  async function writeProjectFile(projectId: string, name: string, content: string): Promise<void> {
    const response = await fetch(`${baseUrl}/api/projects/${projectId}/files`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, content }),
    });
    expect(response.ok).toBe(true);
  }

  it('returns a scoped preview URL with sandbox guidance and serves it with an opaque-origin CSP', async () => {
    const projectId = await createProject({ entryFile: 'pages/index.html' });
    await writeProjectFile(
      projectId,
      'pages/index.html',
      '<!doctype html><title>Preview</title><link rel="stylesheet" href="../styles/app.css">',
    );
    await writeProjectFile(projectId, 'styles/app.css', 'body { color: black; }');

    const urlResponse = await fetch(
      `${baseUrl}/api/projects/${projectId}/preview-url?file=${encodeURIComponent('pages/index.html')}`,
    );
    expect(urlResponse.ok).toBe(true);
    expect(urlResponse.headers.get('cache-control')).toBe('no-store');
    const body = await urlResponse.json() as {
      url: string;
      file: string;
      csp: string;
      iframeSandbox: string;
      opaqueOrigin: true;
    };

    expect(body.file).toBe('pages/index.html');
    expect(body.url).toContain(`/api/projects/${projectId}/preview/`);
    expect(body.url).toMatch(/\/preview\/[A-Za-z0-9_-]{8,128}\/pages\/index\.html$/u);
    expect(body.iframeSandbox).toBe('allow-scripts allow-forms');
    expect(body.iframeSandbox).not.toContain('allow-same-origin');
    expect(body.csp).toContain('sandbox allow-scripts allow-forms');
    expect(body.csp).toContain("connect-src 'none'");
    expect(body.csp).not.toContain('allow-same-origin');
    expect(body.opaqueOrigin).toBe(true);

    const previewResponse = await fetch(`${baseUrl}${body.url}`, {
      headers: { Origin: 'null' },
    });
    expect(previewResponse.status).toBe(200);
    expect(previewResponse.headers.get('access-control-allow-origin')).toBe('*');
    expect(previewResponse.headers.get('cache-control')).toBe('no-store');
    expect(previewResponse.headers.get('x-content-type-options')).toBe('nosniff');
    const csp = previewResponse.headers.get('content-security-policy') ?? '';
    expect(csp).toContain('sandbox allow-scripts allow-forms');
    expect(csp).toContain("connect-src 'none'");
    expect(csp).not.toContain('allow-same-origin');
    expect(await previewResponse.text()).toContain('<title>Preview</title>');

    const scope = body.url.match(/\/preview\/([^/]+)\//u)?.[1];
    expect(scope).toBeTruthy();
    const assetResponse = await fetch(
      `${baseUrl}/api/projects/${projectId}/preview/${scope}/styles/app.css`,
      { headers: { Origin: 'null' } },
    );
    expect(assetResponse.status).toBe(200);
    expect(assetResponse.headers.get('access-control-allow-origin')).toBe('*');
    expect(assetResponse.headers.get('content-type')).toContain('text/css');
    expect(await assetResponse.text()).toContain('color: black');
  });

  it('rejects invalid preview scopes and escaping preview-url paths', async () => {
    const projectId = await createProject();
    await writeProjectFile(projectId, 'index.html', '<!doctype html>');

    const invalidScope = await fetch(`${baseUrl}/api/projects/${projectId}/preview/bad/index.html`);
    expect(invalidScope.status).toBe(400);

    const escapingPath = await fetch(
      `${baseUrl}/api/projects/${projectId}/preview-url?file=${encodeURIComponent('../index.html')}`,
    );
    expect(escapingPath.status).toBe(400);
  });
});
