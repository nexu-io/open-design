import type http from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ensureWorkspaceProject, openDatabase } from '../src/db.js';
import { startServer } from '../src/server.js';

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

  it('binds runtime-created relative assets to the verified Workspace preview authority', async () => {
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

    const unscopedLogoResponse = await fetch(
      `${baseUrl}/api/projects/${projectId}/raw/logos/mark.png`,
    );
    expect(unscopedLogoResponse.status).toBe(400);
    expect(await unscopedLogoResponse.json()).toMatchObject({
      error: { code: 'WORKSPACE_CONTEXT_REQUIRED' },
    });

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


  it('still workspace-scopes <script src> after script-block shielding fix (#6949)', async () => {
    const workspaceId = `workspace-${randomUUID()}`;
    const workspaceMemberId = `member-${randomUUID()}`;
    const projectId = await createProject({ entryFile: 'index.html' });
    // Project root entry; relative src should resolve against the dir of index.html
    await writeProjectFile(
      projectId,
      'main.js',
      'console.log("hrp");',
    );
    await writeProjectFile(
      projectId,
      'index.html',
      [
        '<!doctype html><html><head><title>Test</title></head><body>',
        '<script src="./main.js"></script>',
        '<script>',
        '  var u = URL.revokeObjectURL;',
        '</script>',
        '</body></html>',
      ].join(''),
    );
    bindPersonalProject(projectId, workspaceId, workspaceMemberId);

    const scopeQuery = new URLSearchParams({
      workspaceId,
      workspaceMemberId,
      odPreviewBridge: 'scroll',
    });
    const response = await fetch(
      `${baseUrl}/api/projects/${projectId}/raw/index.html?${scopeQuery}`,
    );
    expect(response.status).toBe(200);
    const html = await response.text();
    // Inline script content must be preserved verbatim across cssUrl shielding.
    expect(html).toContain('var u = URL.revokeObjectURL;');
    // script src attribute MUST still be workspace-scoped by the assetAttr pass,
    // proving the script-block shielding only wraps the cssUrl pass and not the
    // earlier asset-attribute workspace-scoping pass.
    expect(html).toContain('/api/projects/');
    expect(html).toContain('workspaceId=');
    expect(html).toContain('workspaceMemberId=');
    // The scoped src should reference the resolved main.js path, not the
    // bare "./main.js" relative URL.
    expect(html).not.toContain('./main.js');
    expect(html).toContain('main.js');
  });

  it('skips rewriting url() inside <script> blocks to prevent JS corruption', async () => {
    const workspaceId = `workspace-${randomUUID()}`;
    const workspaceMemberId = `member-${randomUUID()}`;
    const projectId = await createProject({ entryFile: 'index.html' });
    await writeProjectFile(
      projectId,
      'index.html',
      [
        '<!doctype html><html><head><title>Test</title></head><body>',
        '<script>',
        '  var url = "http://example.com";',
        '  URL.revokeObjectURL(url);',
        '</script>',
        '</body></html>',
      ].join(''),
    );
    bindPersonalProject(projectId, workspaceId, workspaceMemberId);

    const scopeQuery = new URLSearchParams({
      workspaceId,
      workspaceMemberId,
      odPreviewBridge: 'scroll',
    });
    const response = await fetch(
      `${baseUrl}/api/projects/${projectId}/raw/index.html?${scopeQuery}`,
    );
    expect(response.status).toBe(200);
    const html = await response.text();
    // Verify script content is preserved verbatim and not rewritten
    expect(html).toContain('URL.revokeObjectURL(url)');
    expect(html).not.toContain('URL.revokeObjecturl(');
  });

  it('shields executable attributes (on*, srcdoc, javascript:) from the cssUrl pass', async () => {
    const workspaceId = `workspace-${randomUUID()}`;
    const workspaceMemberId = `member-${randomUUID()}`;
    const projectId = await createProject({ entryFile: 'index.html' });
    // Fixture covers the three executable-attribute shapes the cssUrl regex
    // previously corrupted:
    //   1. on*="...URL.revokeObjectURL(url)..." — inline event handler that
    //      contains a `url(` token which the cssUrl regex would rewrite as
    //      if it were CSS, corrupting the JS source.
    //   2. <iframe srcdoc="<style>...url(./nested.png)...</style>"> — a
    //      full subdocument whose nested CSS url() must NOT be rewritten
    //      because scoped workspace URLs leak the project path out of the
    //      iframe's own document boundary.
    //   3. href="javascript:..." — a JS scheme URL whose body must be
    //      preserved verbatim (no project scoping rewrite).
    //   4. (control) A real <style> url(./bg.png) and a real <img src=./a.png>
    //      MUST still be workspace-scoped, proving the shield only narrows
    //      the cssUrl pass and does not regress asset/img rewriting.
    await writeProjectFile(
      projectId,
      'index.html',
      [
        '<!doctype html><html><head><title>Test</title>',
        '<style>body{background:url(./bg.png)}</style>',
        '</head><body>',
        '<button onclick="URL.revokeObjectURL(url)">run</button>',
        '<a href="javascript:void(0)">x</a>',
        '<iframe srcdoc="<style>.x{background:url(./nested.png)}</style>"></iframe>',
        '<img src="./a.png">',
        '</body></html>',
      ].join(''),
    );
    bindPersonalProject(projectId, workspaceId, workspaceMemberId);

    const scopeQuery = new URLSearchParams({
      workspaceId,
      workspaceMemberId,
      odPreviewBridge: 'scroll',
    });
    const response = await fetch(
      `${baseUrl}/api/projects/${projectId}/raw/index.html?${scopeQuery}`,
    );
    expect(response.status).toBe(200);
    const html = await response.text();

    // 1. Inline event-handler executables are preserved verbatim.
    expect(html).toContain('onclick="URL.revokeObjectURL(url)"');
    expect(html).not.toContain('URL.revokeObjecturl(');
    // The cssUrl pass must not have inserted scoped project paths into the
    // onclick value.
    expect(html).not.toMatch(
      /onclick="[^"]*\/api\/projects\/[^"]*\/raw\//,
    );

    // 2. javascript: URLs are preserved verbatim.
    expect(html).toContain('href="javascript:void(0)"');
    expect(html).not.toMatch(
      /href="javascript:[^"]*\/api\/projects\//,
    );

    // 3. srcdoc subdocuments are preserved verbatim; nested url() is NOT
    //    rewritten because the iframe's own origin owns that CSS, not the
    //    daemon's workspace scope.
    expect(html).toContain(
      'srcdoc="<style>.x{background:url(./nested.png)}</style>"',
    );
    // The srcdoc value specifically must not contain a scoped project path
    // (the iframe document owns its own CSS url() — see assertion 4 for the
    // contrast: the parent <style> IS scoped, but srcdoc is not).
    const srcdocMatch = html.match(/srcdoc="([^"]*)"/);
    expect(srcdocMatch).toBeTruthy();
    expect(srcdocMatch?.[1]).not.toContain('/api/projects/');

    // 4. Control: real CSS url() in <style> IS workspace-scoped (proves the
    //    shield does not over-narrow and break the original #6932 fix).
    expect(html).toMatch(
      /url\([^)]*\/api\/projects\/[^/]+\/raw\/bg\.png[^)]*\)/,
    );
    // 4b. Control: <img src="./a.png"> IS workspace-scoped (proves assetAttr
    //     still runs; only cssUrl is shielded with executable content).
    expect(html).toMatch(
      /<img src="[^"]*\/api\/projects\/[^/]+\/raw\/a\.png[^"]*">/,
    );
  });

  it('does not let user-authored marker-like comments collide with script shielding', async () => {
    const workspaceId = `workspace-${randomUUID()}`;
    const workspaceMemberId = `member-${randomUUID()}`;
    const projectId = await createProject({ entryFile: 'index.html' });
    // Fixture: the input contains a comment that LOOKS like the
    // OD-SCRIPT-PLACEHOLDER-N marker the daemon used to use for script-block
    // shielding. With the new collision-safe markers (per-rewrite nonce +
    // input probe), the user's marker-like comment must survive unchanged,
    // and the inline script's URL.revokeObjectURL(url) call must ALSO survive
    // verbatim (i.e. it must not get restored into the user's marker slot).
    await writeProjectFile(
      projectId,
      'index.html',
      [
        '<!doctype html><html><head><title>Test</title></head><body>',
        '<!--OD-SCRIPT-PLACEHOLDER-0-->',
        '<script>URL.revokeObjectURL(url);</script>',
        '<!--OD-SCRIPT-PLACEHOLDER-1-->',
        '</body></html>',
      ].join(''),
    );
    bindPersonalProject(projectId, workspaceId, workspaceMemberId);

    const scopeQuery = new URLSearchParams({
      workspaceId,
      workspaceMemberId,
      odPreviewBridge: 'scroll',
    });
    const response = await fetch(
      `${baseUrl}/api/projects/${projectId}/raw/index.html?${scopeQuery}`,
    );
    expect(response.status).toBe(200);
    const html = await response.text();

    // User's marker-like comments survive verbatim (collision-safe markers
    // generated by the daemon are different per-rewrite and probe-confirmed
    // absent from the input before use).
    expect(html).toContain('<!--OD-SCRIPT-PLACEHOLDER-0-->');
    expect(html).toContain('<!--OD-SCRIPT-PLACEHOLDER-1-->');
    // Inline JS source survives verbatim — neither the body nor a placeholder
    // got dropped or relocated by a string-replace collision.
    expect(html).toContain('<script>URL.revokeObjectURL(url);</script>');
    // No marker of our own is leaked back to the client. The marker pattern
    // is `<!--OD-{BLOCKOPEN|BLOCKCLOSE|ATTROPEN|ATTRCLOSE}-SHIELD-{nonce}--`
    // (with optional `[0-9]+-{nonce}` re-roll suffix). The trailing `--` is a
    // regex literal that needs no escaping inside `[]`-free context.
    expect(html).not.toMatch(/<!--OD-(?:BLOCKOPEN|BLOCKCLOSE|ATTROPEN|ATTRCLOSE)-SHIELD-/);
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
