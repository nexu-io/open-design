import type http from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ensureWorkspaceProject, openDatabase } from '../src/db.js';
import { startServer } from '../src/server.js';
import { rewriteOutsideExecutableHtmlRanges } from '../src/routes/project/index.js';

describe('project preview containment routes', () => {
  let server: http.Server;
  let baseUrl: string;
  const projectsToClean: string[] = [];
  const cleanupWorkspaceHeaders = new Map<string, Record<string, string>>();

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
      const headers = cleanupWorkspaceHeaders.get(id);
      await fetch(`${baseUrl}/api/projects/${id}`, {
        method: 'DELETE',
        ...(headers ? { headers } : {}),
      }).catch(() => {});
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

  function workspaceHeaders(workspaceId: string, workspaceMemberId: string): Record<string, string> {
    return {
      'x-od-workspace-id': workspaceId,
      'x-od-workspace-member-id': workspaceMemberId,
      'x-od-workspace-type': 'personal',
      'x-od-workspace-role': 'member',
      'x-od-workspace-member-status': 'active',
      'x-od-workspace-lifecycle-state': 'active',
      'x-od-workspace-can-share-projects': 'true',
      'x-od-workspace-can-write-synced-files': 'true',
    };
  }

  function bindPersonalProject(
    projectId: string,
    workspaceId: string,
    workspaceMemberId: string,
  ): void {
    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required by the daemon test harness');
    const db = openDatabase(process.cwd(), { dataDir });
    ensureWorkspaceProject(db, {
      projectId,
      workspaceId,
      visibility: 'personal',
      resourceState: 'active',
      createdByWorkspaceMemberId: workspaceMemberId,
      updatedByWorkspaceMemberId: workspaceMemberId,
      resourceHubResourceId: null,
      cloudTombstonedAt: null,
      syncState: 'local_only',
    });
    cleanupWorkspaceHeaders.set(projectId, workspaceHeaders(workspaceId, workspaceMemberId));
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
      expiresAt: number;
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
    expect(body.expiresAt).toBeGreaterThan(Date.now());

    const renewalScope = /\/preview\/([^/]+)\//u.exec(body.url)?.[1];
    expect(renewalScope).toBeTruthy();
    const rejectedRenewal = await fetch(
      `${baseUrl}/api/projects/${projectId}/preview/${renewalScope}/renew`,
      { method: 'POST' },
    );
    expect(rejectedRenewal.status).toBe(403);
    const renewal = await fetch(
      `${baseUrl}/api/projects/${projectId}/preview/${renewalScope}/renew`,
      {
        method: 'POST',
        headers: { 'x-od-preview-scope-renewal': '1' },
      },
    );
    expect(renewal.status).toBe(200);
    const renewed = await renewal.json() as { expiresAt: number };
    expect(renewed.expiresAt).toBeGreaterThanOrEqual(body.expiresAt);

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

  it('preserves script contents while rewriting workspace-scoped asset URLs', async () => {
    const workspaceId = `workspace-${randomUUID()}`;
    const workspaceMemberId = `member-${randomUUID()}`;
    const projectId = await createProject({ entryFile: 'index.html' });
    const script = [
      'const src = "assets/runtime.png";',
      'const markup = \'<link href="styles/runtime.css">'
        + '<img src="assets/runtime.png" srcset="assets/runtime.png 1x">\';',
      "const cssText = 'background: url(\"assets/runtime.png\")';",
      "const url = 'blob:preview'; URL.revokeObjectURL(url);",
    ].join(' ');
    const inlineHandler = 'URL.revokeObjectURL(url)';
    const dataUrl = 'data:text/html,<script>URL.revokeObjectURL(url)</script>';
    const newlineJavascriptUrl = 'java\nscript:URL.revokeObjectURL(url)';
    const tabJavascriptUrl = 'java\tscript:URL.revokeObjectURL(url)';
    const vbscriptUrl = 'vbscript:URL.revokeObjectURL(url)';
    const xlinkJavascriptUrl = "javascript:url('assets/executable.svg')";
    const xlinkDataUrl = "data:image/svg+xml,<svg onload=url('assets/data.svg')></svg>";
    await writeProjectFile(
      projectId,
      'index.html',
      [
        '<!doctype html>',
        '<html><head>',
        '<!-- code sample: <script> -->',
        '<textarea><script></textarea>',
        '<script src="assets/external.js"></script>',
        `<script>${script}</script>`,
        '</head><body>',
        `<button onclick="${inlineHandler}" style="background: url(assets/button.png)">Revoke</button>`,
        `<img src="assets/image.png" srcset="assets/image-1x.png 1x" onerror="${inlineHandler}">`,
        `<link onload="${inlineHandler}" href="assets/theme-before.css" rel="stylesheet">`,
        `<link href="assets/theme-after.css" onload="${inlineHandler}" rel="stylesheet">`,
        `<iframe src="${dataUrl}"></iframe>`,
        `<a href="${newlineJavascriptUrl}">Newline executable URL</a>`,
        `<a href="${tabJavascriptUrl}">Tab executable URL</a>`,
        `<a href="${vbscriptUrl}">Legacy executable URL</a>`,
        `<svg><a xlink:href="${xlinkJavascriptUrl}">Namespaced executable URL</a></svg>`,
        `<svg><a xlink:href="${xlinkDataUrl}">Namespaced data URL</a></svg>`,
        '<style>.hero { background: url("assets/background.png"); }</style>',
        '</body></html>',
      ].join(''),
    );
    bindPersonalProject(projectId, workspaceId, workspaceMemberId);

    const scopeQuery = new URLSearchParams({ workspaceId, workspaceMemberId });
    const response = await fetch(
      `${baseUrl}/api/projects/${projectId}/raw/index.html?${scopeQuery}`,
    );
    expect(response.status).toBe(200);
    const html = await response.text();
    const scopedAssetUrl = (assetPath: string) =>
      `/api/projects/${projectId}/raw/${assetPath}?workspaceId=${workspaceId}`
      + `&workspaceMemberId=${workspaceMemberId}`;

    expect(html).toContain(`<script>${script}</script>`);
    expect(html).toContain(
      `onclick="${inlineHandler}" style="background: url(${scopedAssetUrl('assets/button.png')})"`,
    );
    expect(html).toContain(`<script src="${scopedAssetUrl('assets/external.js')}">`);
    expect(html).toContain(
      `<img src="${scopedAssetUrl('assets/image.png')}"`
      + ` srcset="${scopedAssetUrl('assets/image-1x.png')} 1x" onerror="${inlineHandler}">`,
    );
    expect(html).toContain(`srcset="${scopedAssetUrl('assets/image-1x.png')} 1x"`);
    expect(html).toContain(
      `<link onload="${inlineHandler}" href="${scopedAssetUrl('assets/theme-before.css')}"`,
    );
    expect(html).toContain(
      `<link href="${scopedAssetUrl('assets/theme-after.css')}" onload="${inlineHandler}"`,
    );
    expect(html).toContain(`<iframe src="${dataUrl}"></iframe>`);
    expect(html).toContain(`<a href="${newlineJavascriptUrl}">Newline executable URL</a>`);
    expect(html).toContain(`<a href="${tabJavascriptUrl}">Tab executable URL</a>`);
    expect(html).toContain(`<a href="${vbscriptUrl}">Legacy executable URL</a>`);
    expect(html).toContain(`xlink:href="${xlinkJavascriptUrl}"`);
    expect(html).toContain(`xlink:href="${xlinkDataUrl}"`);
    expect(html).toContain(`url("${scopedAssetUrl('assets/background.png')}")`);
  });

  it('serves generated PNG assets through preview scopes and clearly 404s missing image references', async () => {
    const projectId = await createProject({ entryFile: 'index.html' });
    await writeProjectFile(
      projectId,
      'index.html',
      '<!doctype html><title>PNG Preview</title><img src="assets/hero.png"><img src="assets/missing.png">',
    );
    await writeProjectFile(projectId, 'assets/hero.png', 'png-bytes');

    const urlResponse = await fetch(
      `${baseUrl}/api/projects/${projectId}/preview-url?file=${encodeURIComponent('index.html')}`,
    );
    expect(urlResponse.ok).toBe(true);
    const body = await urlResponse.json() as { url: string };
    const scope = body.url.match(/\/preview\/([^/]+)\//u)?.[1];
    expect(scope).toBeTruthy();

    const existingAsset = await fetch(
      `${baseUrl}/api/projects/${projectId}/preview/${scope}/assets/hero.png`,
      { headers: { Origin: 'null' } },
    );
    expect(existingAsset.status).toBe(200);
    expect(existingAsset.headers.get('access-control-allow-origin')).toBe('*');
    expect(existingAsset.headers.get('content-type')).toContain('image/png');
    expect(await existingAsset.text()).toBe('png-bytes');

    const missingAsset = await fetch(
      `${baseUrl}/api/projects/${projectId}/preview/${scope}/assets/missing.png`,
      { headers: { Origin: 'null' } },
    );
    expect(missingAsset.status).toBe(404);
    expect(missingAsset.headers.get('access-control-allow-origin')).toBe('*');
    expect(missingAsset.headers.get('content-type')).toContain('application/json');
    const missingBody = await missingAsset.json() as { error?: { message?: string } };
    expect(missingBody.error?.message).toContain('ENOENT');
    expect(missingBody.error?.message).toContain('assets/missing.png');
  });

  it('derives Workspace authority for headerless project previews and their runtime-created assets', async () => {
    const workspaceId = `workspace-${randomUUID()}`;
    const workspaceMemberId = `member-${randomUUID()}`;
    const projectId = await createProject({ entryFile: 'brand.html' });
    await writeProjectFile(
      projectId,
      'brand.html',
      [
        '<!doctype html><html><head><title>Brand</title></head><body>',
        '<script type="application/json" id="brand">{"logo":"logos/mark.png"}</script>',
        '<script>const img = document.createElement("img"); img.src = JSON.parse(document.querySelector("#brand").textContent).logo; document.body.append(img);</script>',
        '</body></html>',
      ].join(''),
    );
    await writeProjectFile(projectId, 'logos/mark.png', 'brand-logo-bytes');
    bindPersonalProject(projectId, workspaceId, workspaceMemberId);

    const scopeQuery = new URLSearchParams({ workspaceId, workspaceMemberId });
    const scopedPlainRawResponse = await fetch(
      `${baseUrl}/api/projects/${projectId}/raw/brand.html?${scopeQuery}`,
    );
    expect(scopedPlainRawResponse.status).toBe(200);
    expect(await scopedPlainRawResponse.text()).not.toContain('<base href=');

    const unscopedRawResponse = await fetch(
      `${baseUrl}/api/projects/${projectId}/raw/brand.html`,
    );
    expect(unscopedRawResponse.status).toBe(200);
    expect(await unscopedRawResponse.text()).not.toContain('<base href=');

    const unscopedLogoResponse = await fetch(
      `${baseUrl}/api/projects/${projectId}/raw/logos/mark.png`,
    );
    expect(unscopedLogoResponse.status).toBe(200);
    expect(await unscopedLogoResponse.text()).toBe('brand-logo-bytes');

    const previewUrlResponse = await fetch(
      `${baseUrl}/api/projects/${projectId}/preview-url?file=brand.html`,
    );
    expect(previewUrlResponse.status).toBe(200);
    const previewUrlBody = await previewUrlResponse.json() as { url?: string };
    expect(previewUrlBody.url).toMatch(
      new RegExp(`^/api/projects/${projectId}/preview/[A-Za-z0-9_-]{8,128}/brand\\.html$`, 'u'),
    );
    const headerlessPreviewResponse = await fetch(
      new URL(previewUrlBody.url!, baseUrl),
    );
    expect(headerlessPreviewResponse.status).toBe(200);
    expect(await headerlessPreviewResponse.text()).toContain('<title>Brand</title>');

    scopeQuery.append('odPreviewBridge', 'scroll');
    const rawResponse = await fetch(
      `${baseUrl}/api/projects/${projectId}/raw/brand.html?${scopeQuery}`,
    );
    expect(rawResponse.status).toBe(200);
    const html = await rawResponse.text();
    const baseHref = html.match(/<base\s+href="([^"]+)"/i)?.[1];
    expect(baseHref).toMatch(
      new RegExp(`^/api/projects/${projectId}/preview/[A-Za-z0-9_-]{8,128}/$`, 'u'),
    );
    expect(html).toContain('data-od-project-preview-base');
    expect(html).toContain('data-od-preview-base-bridge');
    expect(html).toContain("type: 'od:preview-base-scope'");

    const workspaceScope = /\/preview\/([^/]+)\//u.exec(baseHref!)?.[1];
    const workspaceRenewal = await fetch(
      `${baseUrl}/api/projects/${projectId}/preview/${workspaceScope}/renew`,
      {
        method: 'POST',
        headers: { 'x-od-preview-scope-renewal': '1' },
      },
    );
    expect(workspaceRenewal.status).toBe(200);

    // The browser resolves runtime-created `img.src = "logos/mark.png"`
    // against <base>. A query-scoped raw document cannot do this because URL
    // resolution never inherits the document query string.
    const runtimeLogoUrl = new URL('logos/mark.png', new URL(baseHref!, baseUrl));
    expect(runtimeLogoUrl.search).toBe('');
    expect(runtimeLogoUrl.pathname).toContain(`/api/projects/${projectId}/preview/`);
    const logoResponse = await fetch(runtimeLogoUrl);
    expect(logoResponse.status).toBe(200);
    expect(await logoResponse.text()).toBe('brand-logo-bytes');

    const wrongWorkspaceQuery = new URLSearchParams({
      workspaceId: `wrong-${randomUUID()}`,
      workspaceMemberId,
      odPreviewBridge: 'scroll',
    });
    const wrongWorkspaceResponse = await fetch(
      `${baseUrl}/api/projects/${projectId}/raw/brand.html?${wrongWorkspaceQuery}`,
    );
    expect(wrongWorkspaceResponse.status).toBe(403);
    expect(await wrongWorkspaceResponse.text()).not.toContain('/preview/');

    const foreignProjectId = await createProject({ entryFile: 'brand.html' });
    await writeProjectFile(foreignProjectId, 'logos/mark.png', 'foreign-logo-bytes');
    bindPersonalProject(
      foreignProjectId,
      `foreign-workspace-${randomUUID()}`,
      `foreign-member-${randomUUID()}`,
    );
    const borrowedTokenUrl = new URL(runtimeLogoUrl);
    borrowedTokenUrl.pathname = borrowedTokenUrl.pathname.replace(projectId, foreignProjectId);
    const borrowedTokenResponse = await fetch(borrowedTokenUrl);
    expect(borrowedTokenResponse.status).toBe(404);
  });

  it('serves minted preview HTML and assets without bearer headers when API token auth is enabled', async () => {
    const previousToken = process.env.OD_API_TOKEN;
    const token = `preview-token-${randomUUID()}`;
    process.env.OD_API_TOKEN = token;
    let tokenServer: http.Server | undefined;
    let shutdown: (() => Promise<void> | void) | undefined;
    let tokenBaseUrl = '';
    const projectId = `preview-token-${randomUUID()}`;

    try {
      const started = (await startServer({ port: 0, returnServer: true })) as {
        url: string;
        server: http.Server;
        shutdown?: () => Promise<void> | void;
      };
      tokenBaseUrl = started.url;
      tokenServer = started.server;
      shutdown = started.shutdown;
      const authHeaders = {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      };

      const createResponse = await fetch(`${tokenBaseUrl}/api/projects`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          id: projectId,
          name: 'Token preview containment project',
          metadata: { entryFile: 'pages/index.html' },
        }),
      });
      expect(createResponse.ok).toBe(true);

      const writeIndex = await fetch(`${tokenBaseUrl}/api/projects/${projectId}/files`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          name: 'pages/index.html',
          content: '<!doctype html><title>Hosted Preview</title><link rel="stylesheet" href="../styles/app.css">',
        }),
      });
      expect(writeIndex.ok).toBe(true);

      const writeAsset = await fetch(`${tokenBaseUrl}/api/projects/${projectId}/files`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          name: 'styles/app.css',
          content: 'body { color: rebeccapurple; }',
        }),
      });
      expect(writeAsset.ok).toBe(true);

      const urlResponse = await fetch(
        `${tokenBaseUrl}/api/projects/${projectId}/preview-url?file=${encodeURIComponent('pages/index.html')}`,
        { headers: { authorization: `Bearer ${token}` } },
      );
      expect(urlResponse.ok).toBe(true);
      const body = await urlResponse.json() as { url: string };
      const scope = body.url.match(/\/preview\/([^/]+)\//u)?.[1];
      expect(scope).toBeTruthy();

      const previewResponse = await fetch(`${tokenBaseUrl}${body.url}`, {
        headers: { Origin: 'null' },
      });
      expect(previewResponse.status).toBe(200);
      expect(previewResponse.headers.get('access-control-allow-origin')).toBe('*');
      expect(await previewResponse.text()).toContain('<title>Hosted Preview</title>');

      const assetResponse = await fetch(
        `${tokenBaseUrl}/api/projects/${projectId}/preview/${scope}/styles/app.css`,
        { headers: { Origin: 'null' } },
      );
      expect(assetResponse.status).toBe(200);
      expect(await assetResponse.text()).toContain('rebeccapurple');

      const forgedResponse = await fetch(
        `${tokenBaseUrl}/api/projects/${projectId}/preview/${randomUUID()}/pages/index.html`,
        { headers: { Origin: 'null' } },
      );
      expect(forgedResponse.status).toBe(404);
    } finally {
      if (tokenBaseUrl) {
        await fetch(`${tokenBaseUrl}/api/projects/${projectId}`, {
          method: 'DELETE',
          headers: { authorization: `Bearer ${token}` },
        }).catch(() => {});
      }
      if (shutdown) await Promise.resolve(shutdown());
      if (tokenServer) await new Promise<void>((resolve) => tokenServer!.close(() => resolve()));
      if (previousToken === undefined) delete process.env.OD_API_TOKEN;
      else process.env.OD_API_TOKEN = previousToken;
    }
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

describe('project preview HTML rewriting', () => {
  const rewriteReference = (reference: string): string => `/preview/${reference}`;

  it('preserves scripts while rewriting CSS URLs elsewhere in the document', () => {
    const script = "const css = 'url(\"assets/runtime.png\")'; "
      + "const url = 'blob:preview'; URL.revokeObjectURL(url);";
    const html = [
      '<!doctype html><html><head>',
      '<!-- code sample: <script> -->',
      '<textarea><script></textarea>',
      `<script>${script}</script>`,
      '</head><body>',
      '<style>.hero { background: url("assets/hero.png"); }</style>',
      '</body></html>',
    ].join('');

    const rewritten = rewriteOutsideExecutableHtmlRanges(html, (chunk) =>
      chunk.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (match, quote: string, reference: string) => {
        const rewrittenReference = rewriteReference(reference);
        return rewrittenReference === reference
          ? match
          : `url(${quote}${rewrittenReference}${quote})`;
      }));

    expect(rewritten).toContain(`<script>${script}</script>`);
    expect(rewritten).toContain('url("/preview/assets/hero.png")');
  });

  it('preserves executable HTML attributes while rewriting CSS URLs', () => {
    const html = [
      '<button onclick="URL.revokeObjectURL(url)" style="background: url(assets/hero.png)">Revoke</button>',
      '<a href="javascript:URL.revokeObjectURL(url)">Revoke</a>',
      '<iframe srcdoc="<script>URL.revokeObjectURL(url)</script>"></iframe>',
    ].join('');

    const rewritten = rewriteOutsideExecutableHtmlRanges(html, (chunk) =>
      chunk.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (_match, quote: string, reference: string) =>
        `url(${quote}${rewriteReference(reference)}${quote})`));

    expect(rewritten).toContain(
      'onclick="URL.revokeObjectURL(url)" style="background: url(/preview/assets/hero.png)"',
    );
    expect(rewritten).toContain('href="javascript:URL.revokeObjectURL(url)"');
    expect(rewritten).toContain('srcdoc="<script>URL.revokeObjectURL(url)</script>"');
  });

  it('preserves an unclosed script through the end of the document', () => {
    const html = '<script>const url = "blob:preview"; URL.revokeObjectURL(url)';

    expect(rewriteOutsideExecutableHtmlRanges(html, (chunk) =>
      chunk.replace('blob:preview', rewriteReference('blob:preview')))).toBe(html);
  });

  it('treats a self-closing slash on an HTML script as unclosed', () => {
    const html = '<script/>const url = "blob:preview"; URL.revokeObjectURL(url)';

    expect(rewriteOutsideExecutableHtmlRanges(html, (chunk) =>
      chunk.replace('blob:preview', rewriteReference('blob:preview')))).toBe(html);
  });

  it('continues rewriting after a self-closing SVG script', () => {
    const html = '<svg><script src="runtime.js" /></svg>'
      + '<style>body { background: url(assets/hero.png); }</style>';

    expect(rewriteOutsideExecutableHtmlRanges(html, (chunk) =>
      chunk.replace('assets/hero.png', rewriteReference('assets/hero.png'))))
      .toContain('url(/preview/assets/hero.png)');
  });

  it('avoids collisions with protected range markers already in the document', () => {
    const script = 'const marker = "__OD_PROTECTED_HTML_RANGE_";';
    const html = `<style>.__OD_PROTECTED_HTML_RANGE_ { background: url(assets/hero.png); }</style>`
      + `<script>${script}</script>`;

    const rewritten = rewriteOutsideExecutableHtmlRanges(html, (chunk) =>
      chunk.replace('assets/hero.png', rewriteReference('assets/hero.png')));

    expect(rewritten).toContain('.__OD_PROTECTED_HTML_RANGE_');
    expect(rewritten).toContain('url(/preview/assets/hero.png)');
    expect(rewritten).toContain(`<script>${script}</script>`);
  });

  it('bounds marker allocation for long prefix-like input', () => {
    const script = 'const url = "blob:preview"; URL.revokeObjectURL(url);';
    const html = `${'_'.repeat(100_000)}__OD_PROTECTED_HTML_RANGE_`
      + `<style>body { background: url(assets/hero.png); }</style>`
      + `<script>${script}</script>`;
    const startedAt = performance.now();

    const rewritten = rewriteOutsideExecutableHtmlRanges(html, (chunk) =>
      chunk.replace('assets/hero.png', rewriteReference('assets/hero.png')));

    expect(performance.now() - startedAt).toBeLessThan(2_000);
    expect(rewritten).toContain('url(/preview/assets/hero.png)');
    expect(rewritten).toContain(`<script>${script}</script>`);
  }, 15_000);
});
