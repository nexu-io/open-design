import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { afterEach, beforeEach, vi } from 'vitest';
import {
  assertProjectIdValid,
  buildDeployFileSet,
  checkDeploymentUrl,
  deploymentUrlCandidates,
  deployToVercel,
  DeployError,
  extractCssReferences,
  extractHtmlReferences,
  generateProjectId,
  injectDeployHookScript,
  isVercelProtectedResponse,
  normalizeDeployHookScriptUrl,
  readVercelConfig,
  resolveReferencedPath,
  rewriteEntryHtmlReferences,
  waitForReachableDeploymentUrl,
} from '../src/deploy.js';
import { ensureProject } from '../src/projects.js';

async function setupProject() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'od-deploy-test-'));
  const projectId = 'p1';
  const dir = await ensureProject(path.join(root, 'projects'), projectId);
  return { projectsRoot: path.join(root, 'projects'), projectId, dir };
}

describe('deploy file set', () => {
  it('deploys a single html file as index.html', async () => {
    const { projectsRoot, projectId, dir } = await setupProject();
    await writeFile(path.join(dir, 'page.html'), '<!doctype html><h1>Hello</h1>');

    const files = await buildDeployFileSet(projectsRoot, projectId, 'page.html');

    expect(files.map((f) => f.file)).toEqual(['index.html']);
  });

  it('injects a closeable deploy hook script from cdn when configured', async () => {
    const { projectsRoot, projectId, dir } = await setupProject();
    await writeFile(path.join(dir, 'page.html'), '<!doctype html><body><h1>Hello</h1></body>');

    const files = await buildDeployFileSet(projectsRoot, projectId, 'page.html', {
      hookScriptUrl: 'https://cdn.example.com/open-design-hook.js',
    });
    const html = files.find((f) => f.file === 'index.html')?.data.toString('utf8') ?? '';

    expect(html).toContain(
      '<script src="https://cdn.example.com/open-design-hook.js" defer data-open-design-deploy-hook="true" data-closeable="true"></script></body>',
    );
  });

  it('includes referenced html and css assets', async () => {
    const { projectsRoot, projectId, dir } = await setupProject();
    await mkdir(path.join(dir, 'assets'));
    await writeFile(
      path.join(dir, 'index.html'),
      '<link href="style.css" rel="stylesheet"><script src="app.js"></script><img src="assets/logo.png">',
    );
    await writeFile(path.join(dir, 'style.css'), '@import "./theme.css"; body{background:url("assets/bg.png")}');
    await writeFile(path.join(dir, 'theme.css'), '@font-face{src:url("font.woff2")}');
    await writeFile(path.join(dir, 'app.js'), 'console.log("ok")');
    await writeFile(path.join(dir, 'font.woff2'), 'font');
    await writeFile(path.join(dir, 'assets', 'logo.png'), 'logo');
    await writeFile(path.join(dir, 'assets', 'bg.png'), 'bg');

    const files = await buildDeployFileSet(projectsRoot, projectId, 'index.html');

    expect(files.map((f) => f.file).sort()).toEqual([
      'app.js',
      'assets/bg.png',
      'assets/logo.png',
      'font.woff2',
      'index.html',
      'style.css',
      'theme.css',
    ]);
  });

  it('rewrites subdirectory html references to preserved project paths', async () => {
    const { projectsRoot, projectId, dir } = await setupProject();
    await mkdir(path.join(dir, 'sub', 'assets'), { recursive: true });
    await writeFile(
      path.join(dir, 'sub', 'page.html'),
      '<!doctype html><img src="assets/logo.png?cache=1#mark"><img src="/assets/root.png"><img srcset="assets/small.png 1x, assets/large.png 2x">',
    );
    await writeFile(path.join(dir, 'sub', 'assets', 'logo.png'), 'logo');
    await writeFile(path.join(dir, 'sub', 'assets', 'small.png'), 'small');
    await writeFile(path.join(dir, 'sub', 'assets', 'large.png'), 'large');
    await mkdir(path.join(dir, 'assets'));
    await writeFile(path.join(dir, 'assets', 'root.png'), 'root');

    const files = await buildDeployFileSet(projectsRoot, projectId, 'sub/page.html');
    const index = files.find((f) => f.file === 'index.html');

    expect(files.map((f) => f.file).sort()).toEqual([
      'assets/root.png',
      'index.html',
      'sub/assets/large.png',
      'sub/assets/logo.png',
      'sub/assets/small.png',
    ]);
    expect(index?.data.toString('utf8')).toContain('src="sub/assets/logo.png?cache=1#mark"');
    expect(index?.data.toString('utf8')).toContain('src="/assets/root.png"');
    expect(index?.data.toString('utf8')).toContain(
      'srcset="sub/assets/small.png 1x, sub/assets/large.png 2x"',
    );
  });

  it('keeps css content unchanged while deploying subdirectory css assets', async () => {
    const { projectsRoot, projectId, dir } = await setupProject();
    await mkdir(path.join(dir, 'sub', 'assets'), { recursive: true });
    await writeFile(path.join(dir, 'sub', 'page.html'), '<link href="style.css" rel="stylesheet">');
    await writeFile(path.join(dir, 'sub', 'style.css'), 'body{background:url("assets/bg.png")}');
    await writeFile(path.join(dir, 'sub', 'assets', 'bg.png'), 'bg');

    const files = await buildDeployFileSet(projectsRoot, projectId, 'sub/page.html');
    const index = files.find((f) => f.file === 'index.html');
    const css = files.find((f) => f.file === 'sub/style.css');

    expect(files.map((f) => f.file).sort()).toEqual([
      'index.html',
      'sub/assets/bg.png',
      'sub/style.css',
    ]);
    expect(index?.data.toString('utf8')).toContain('href="sub/style.css"');
    expect(css?.data.toString('utf8')).toBe('body{background:url("assets/bg.png")}');
  });

  it('rejects missing referenced local files', async () => {
    const { projectsRoot, projectId, dir } = await setupProject();
    await writeFile(path.join(dir, 'index.html'), '<img src="missing.png">');

    await expect(buildDeployFileSet(projectsRoot, projectId, 'index.html')).rejects.toMatchObject({
      details: { missing: ['missing.png'] },
    });
  });

  it('does not treat navigation hrefs as deploy dependencies', async () => {
    const { projectsRoot, projectId, dir } = await setupProject();
    await writeFile(
      path.join(dir, 'index.html'),
      '<!doctype html><a href="/pricing">Pricing</a><a href="contact">Contact</a>',
    );

    const files = await buildDeployFileSet(projectsRoot, projectId, 'index.html');
    const index = files.find((f) => f.file === 'index.html');

    expect(files.map((f) => f.file)).toEqual(['index.html']);
    expect(index?.data.toString('utf8')).toContain('href="/pricing"');
    expect(index?.data.toString('utf8')).toContain('href="contact"');
  });

  it('collects and rewrites unquoted asset attributes', async () => {
    const { projectsRoot, projectId, dir } = await setupProject();
    await mkdir(path.join(dir, 'sub', 'assets'), { recursive: true });
    await writeFile(
      path.join(dir, 'sub', 'page.html'),
      '<!doctype html><img src=assets/logo.png><video poster=assets/poster.png></video>',
    );
    await writeFile(path.join(dir, 'sub', 'assets', 'logo.png'), 'logo');
    await writeFile(path.join(dir, 'sub', 'assets', 'poster.png'), 'poster');

    const files = await buildDeployFileSet(projectsRoot, projectId, 'sub/page.html');
    const index = files.find((f) => f.file === 'index.html');

    expect(files.map((f) => f.file).sort()).toEqual([
      'index.html',
      'sub/assets/logo.png',
      'sub/assets/poster.png',
    ]);
    expect(index?.data.toString('utf8')).toContain('src=sub/assets/logo.png');
    expect(index?.data.toString('utf8')).toContain('poster=sub/assets/poster.png');
  });

  it('ignores arbitrary URI schemes in html references', async () => {
    const { projectsRoot, projectId, dir } = await setupProject();
    await writeFile(
      path.join(dir, 'index.html'),
      '<iframe src="about:blank"></iframe><a href="ftp://example.com/file">ftp</a><a href="sms:+15555550123">sms</a>',
    );

    const files = await buildDeployFileSet(projectsRoot, projectId, 'index.html');

    expect(files.map((f) => f.file)).toEqual(['index.html']);
  });

  it('ignores src-like text inside inline scripts', async () => {
    const { projectsRoot, projectId, dir } = await setupProject();
    await writeFile(
      path.join(dir, 'index.html'),
      '<!doctype html><script>const text = \'<img src="missing.png">\';</script>',
    );

    const files = await buildDeployFileSet(projectsRoot, projectId, 'index.html');

    expect(files.map((f) => f.file)).toEqual(['index.html']);
  });

  it('collects and rewrites unquoted stylesheet links', async () => {
    const { projectsRoot, projectId, dir } = await setupProject();
    await mkdir(path.join(dir, 'sub'), { recursive: true });
    await writeFile(path.join(dir, 'sub', 'page.html'), '<link href=style.css rel=stylesheet>');
    await writeFile(path.join(dir, 'sub', 'style.css'), 'body{color:red}');

    const files = await buildDeployFileSet(projectsRoot, projectId, 'sub/page.html');
    const index = files.find((f) => f.file === 'index.html');

    expect(files.map((f) => f.file).sort()).toEqual(['index.html', 'sub/style.css']);
    expect(index?.data.toString('utf8')).toContain('href=sub/style.css');
  });

  it('ignores remote, data, blob, mail, and anchor references', () => {
    const refs = extractHtmlReferences(
      '<a href="#x"></a><img src="https://x.test/a.png"><img src="data:image/png,abc"><script src="//cdn.test/a.js"></script><a href="mailto:a@test.com"></a>',
    )
      .map((ref) => resolveReferencedPath(ref, '.'))
      .filter(Boolean);

    expect(refs).toEqual([]);
  });

  it('extracts css imports and urls', () => {
    expect(extractCssReferences('@import "./theme.css"; body{background:url("img/bg.png")}')).toEqual([
      'img/bg.png',
      './theme.css',
    ]);
  });

  it('rewrites only local relative entry references', () => {
    expect(
      rewriteEntryHtmlReferences(
        '<a href="#x"></a><img src="https://x.test/a.png"><img src="data:image/png,abc"><script src="//cdn.test/a.js"></script><img src="asset.png">',
        'sub',
      ),
    ).toContain('src="sub/asset.png"');
  });

  it('ignores invalid deploy hook script urls', () => {
    expect(injectDeployHookScript('<body></body>', 'javascript:alert(1)')).toBe('<body></body>');
    expect(normalizeDeployHookScriptUrl('https://cdn.example.com/hook.js')).toBe(
      'https://cdn.example.com/hook.js',
    );
  });
});

describe('deployment link readiness', () => {
  async function withServer(
    handler: (req: IncomingMessage, res: ServerResponse) => void,
    run: (url: string) => Promise<void>,
  ) {
    const server = http.createServer(handler);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${address.port}`;
    try {
      await run(url);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  it('marks a reachable public URL as ready', async () => {
    await withServer((_req, res) => {
      res.writeHead(200);
      res.end('ok');
    }, async (url) => {
      await expect(checkDeploymentUrl(url)).resolves.toMatchObject({ reachable: true });
    });
  });

  it('keeps the URL when public link readiness times out', async () => {
    const result = await waitForReachableDeploymentUrl(['http://127.0.0.1:9'], {
      timeoutMs: 1,
      intervalMs: 1,
    });

    expect(result).toMatchObject({
      status: 'link-delayed',
      url: 'http://127.0.0.1:9',
    });
  });

  it('marks a Vercel authentication page as protected', async () => {
    await withServer((_req, res) => {
      res.writeHead(401, {
        server: 'Vercel',
        'set-cookie': '_vercel_sso_nonce=test; Path=/; HttpOnly',
        'content-type': 'text/html',
      });
      res.end('<title>Authentication Required</title><body>Vercel Authentication</body>');
    }, async (url) => {
      await expect(checkDeploymentUrl(url)).resolves.toMatchObject({
        reachable: false,
        status: 'protected',
      });
    });
  });

  it('returns protected without waiting for timeout', async () => {
    await withServer((_req, res) => {
      res.writeHead(401, { server: 'Vercel' });
      res.end('Authentication Required');
    }, async (url) => {
      const result = await waitForReachableDeploymentUrl([url], {
        timeoutMs: 5_000,
        intervalMs: 1_000,
      });

      expect(result).toMatchObject({
        status: 'protected',
        url,
      });
    });
  });

  it('uses the first reachable candidate URL', async () => {
    await withServer((_req, res) => {
      res.writeHead(204);
      res.end();
    }, async (url) => {
      const result = await waitForReachableDeploymentUrl(['http://127.0.0.1:9', url], {
        timeoutMs: 100,
        intervalMs: 1,
      });

      expect(result).toMatchObject({
        status: 'ready',
        url,
      });
    });
  });

  it('collects deployment URL aliases as candidates', () => {
    expect(
      deploymentUrlCandidates(
        { url: 'primary.vercel.app', alias: ['alias.vercel.app'] },
        { aliases: [{ domain: 'domain.vercel.app' }, 'plain.vercel.app'] },
      ),
    ).toEqual([
      'https://primary.vercel.app',
      'https://alias.vercel.app',
      'https://domain.vercel.app',
      'https://plain.vercel.app',
    ]);
  });

  it('recognizes Vercel protection signals', () => {
    const headers = new Headers({
      server: 'Vercel',
      'set-cookie': '_vercel_sso_nonce=test',
    });
    expect(isVercelProtectedResponse({ headers }, 'Authentication Required')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Spec 101 — Wave F-3 (T025 RED) / Wave G-1 (T026 GREEN)
// Multi-tenant ctx refactor for deployToVercel.
// ---------------------------------------------------------------------------

describe('deployToVercel — multi-tenant ctx refactor (spec 101 T025/T026)', () => {
  type FetchCall = { url: string; init?: RequestInit };
  let calls: FetchCall[];

  function makeFetchMock(opts: { ready?: boolean } = {}) {
    return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      calls.push({ url, init });

      if (url.startsWith('https://api.vercel.com/v13/deployments') && (init?.method ?? 'GET') === 'POST') {
        return new Response(
          JSON.stringify({
            id: 'dpl_test_1',
            uid: 'dpl_test_1',
            url: 'od-test-abc.vercel.app',
            readyState: opts.ready === false ? 'INITIALIZING' : 'READY',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      // poll lookup or other GETs — return ready immediately.
      if (url.startsWith('https://api.vercel.com/v13/deployments/')) {
        return new Response(
          JSON.stringify({
            id: 'dpl_test_1',
            url: 'od-test-abc.vercel.app',
            readyState: 'READY',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      // public-url reachability probe (HEAD/GET on the deployment URL).
      return new Response('ok', { status: 200 });
    });
  }

  const baseFiles = [
    {
      file: 'index.html',
      data: Buffer.from('<!doctype html><h1>hi</h1>', 'utf8'),
      contentType: 'text/html',
      sourcePath: 'index.html',
    },
  ];
  const baseConfig = { token: 'tok_test', teamId: '', teamSlug: '' };

  beforeEach(() => {
    calls = [];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('(a) composes project name as od-<tenant_id>-<projectId> (ericedmeades)', async () => {
    vi.stubGlobal('fetch', makeFetchMock());

    await deployToVercel({
      config: baseConfig,
      files: baseFiles,
      projectId: 'abc123',
      ctx: { tenant_id: 'ericedmeades', vercel_team: 'ceremonia-89dd9b81' },
    });

    const createCall = calls.find((c) => (c.init?.method ?? 'GET') === 'POST');
    expect(createCall).toBeDefined();
    const body = JSON.parse(String(createCall!.init!.body));
    expect(body.name).toBe('od-ericedmeades-abc123');
  });

  it('(b) composes project name as od-<tenant_id>-<projectId> (ceremonia)', async () => {
    vi.stubGlobal('fetch', makeFetchMock());

    await deployToVercel({
      config: baseConfig,
      files: baseFiles,
      projectId: 'abc123',
      ctx: { tenant_id: 'ceremonia', vercel_team: 'ceremonia-89dd9b81' },
    });

    const createCall = calls.find((c) => (c.init?.method ?? 'GET') === 'POST');
    const body = JSON.parse(String(createCall!.init!.body));
    expect(body.name).toBe('od-ceremonia-abc123');
  });

  it('(c) ctx.vercel_team takes precedence over config.teamId/teamSlug', async () => {
    vi.stubGlobal('fetch', makeFetchMock());

    await deployToVercel({
      config: { token: 'tok_test', teamId: 'team_from_config', teamSlug: 'slug_from_config' },
      files: baseFiles,
      projectId: 'abc123',
      ctx: { tenant_id: 'ceremonia', vercel_team: 'ceremonia-89dd9b81' },
    });

    const createCall = calls.find((c) => (c.init?.method ?? 'GET') === 'POST');
    expect(createCall!.url).toContain('slug=ceremonia-89dd9b81');
    expect(createCall!.url).not.toContain('team_from_config');
    expect(createCall!.url).not.toContain('slug_from_config');
  });

  it('(d) defense-in-depth: project name is always od-<tenant>-<id>, sanitized via safeVercelProjectName', async () => {
    vi.stubGlobal('fetch', makeFetchMock());

    // assertProjectIdValid will reject the malicious projectId at the boundary —
    // proving the guard prevents bypass even if a caller forgot to validate.
    await expect(
      deployToVercel({
        config: baseConfig,
        files: baseFiles,
        projectId: 'malicious/../../injection',
        ctx: { tenant_id: 'ericedmeades', vercel_team: 'ceremonia-89dd9b81' },
      }),
    ).rejects.toBeInstanceOf(DeployError);

    // For a legitimate projectId, the name composition is server-side:
    await deployToVercel({
      config: baseConfig,
      files: baseFiles,
      projectId: 'malicious-injection',
      ctx: { tenant_id: 'ericedmeades', vercel_team: 'ceremonia-89dd9b81' },
    });
    const createCall = calls.find((c) => (c.init?.method ?? 'GET') === 'POST');
    const body = JSON.parse(String(createCall!.init!.body));
    expect(body.name).toBe('od-ericedmeades-malicious-injection');
  });

  it('(e) tenant-A ctx cannot deploy under tenant-B project namespace', async () => {
    vi.stubGlobal('fetch', makeFetchMock());

    // Even though caller may try to manipulate projectId so the resulting URL
    // looks like od-tenant-b-..., assertProjectIdValid rejects path-traversal
    // / control chars; for valid characters the prefix is locked to ctx.tenant_id.
    await deployToVercel({
      config: baseConfig,
      files: baseFiles,
      projectId: 'b-foo',
      ctx: { tenant_id: 'ericedmeades', vercel_team: 'ceremonia-89dd9b81' },
    });

    const createCall = calls.find((c) => (c.init?.method ?? 'GET') === 'POST');
    const body = JSON.parse(String(createCall!.init!.body));
    expect(body.name.startsWith('od-ericedmeades-')).toBe(true);
    expect(body.name.startsWith('od-tenant-b-')).toBe(false);
  });

  it('(f) generateProjectId() returns a 12-char nanoid (URL-safe alphabet)', () => {
    const id = generateProjectId();
    expect(id).toHaveLength(12);
    // nanoid default alphabet: A-Za-z0-9_-
    expect(id).toMatch(/^[A-Za-z0-9_-]{12}$/);

    // Two consecutive calls produce different ids.
    expect(generateProjectId()).not.toBe(id);

    // assertProjectIdValid accepts generated ids without throwing.
    expect(() => assertProjectIdValid(id)).not.toThrow();
  });

  it('(g) missing ctx throws DeployError 400 with "tenant context required"', async () => {
    vi.stubGlobal('fetch', makeFetchMock());

    await expect(
      // @ts-expect-error — intentionally missing ctx for the test
      deployToVercel({ config: baseConfig, files: baseFiles, projectId: 'abc123' }),
    ).rejects.toMatchObject({
      name: 'DeployError',
      status: 400,
      message: expect.stringContaining('tenant context required'),
    });

    await expect(
      deployToVercel({
        config: baseConfig,
        files: baseFiles,
        projectId: 'abc123',
        ctx: { tenant_id: '', vercel_team: '' },
      }),
    ).rejects.toMatchObject({
      name: 'DeployError',
      status: 400,
      message: expect.stringContaining('tenant context required'),
    });
  });

  it('assertProjectIdValid rejects path separators, null bytes, and empty strings', () => {
    expect(() => assertProjectIdValid('')).toThrow(DeployError);
    expect(() => assertProjectIdValid('a/b')).toThrow(DeployError);
    expect(() => assertProjectIdValid('a b')).toThrow(DeployError);
    expect(() => assertProjectIdValid('../etc/passwd')).toThrow(DeployError);
    expect(() => assertProjectIdValid('valid_id-123')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Spec 101 — BUG-2 durable fix: auto-disable SSO protection on new od-* projects.
// disableProjectSsoProtection is called fire-and-forget from deployToVercel
// immediately after a successful /v13/deployments POST returns a projectId.
// ---------------------------------------------------------------------------

describe("deployToVercel — BUG-2 auto-disable SSO (spec-101 durable fix)", () => {
  type FetchCall = { url: string; init?: RequestInit };
  let calls: FetchCall[];

  function makeFetchMockWithProjectId(opts: { patchStatus?: number } = {}) {
    return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      calls.push({ url, init });

      // POST /v13/deployments — return response WITH projectId to trigger PATCH.
      if (url.startsWith("https://api.vercel.com/v13/deployments") && (init?.method ?? "GET") === "POST") {
        return new Response(
          JSON.stringify({
            id: "dpl_test_1",
            uid: "dpl_test_1",
            projectId: "prj_test_1",
            url: "od-test-abc.vercel.app",
            readyState: "READY",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      // PATCH /v9/projects/<projectId> — SSO disable call.
      if (url.includes("/v9/projects/") && init?.method === "PATCH") {
        const status = opts.patchStatus ?? 200;
        return new Response(
          status === 200 ? JSON.stringify({ id: "prj_test_1" }) : "error",
          { status, headers: { "content-type": "application/json" } },
        );
      }
      // Poll lookup GET on /v13/deployments/<id> — return READY immediately.
      if (url.startsWith("https://api.vercel.com/v13/deployments/")) {
        return new Response(
          JSON.stringify({
            id: "dpl_test_1",
            url: "od-test-abc.vercel.app",
            readyState: "READY",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      // Public-url reachability probe (HEAD/GET on the deployment URL).
      return new Response("ok", { status: 200 });
    });
  }

  const baseFiles = [
    {
      file: "index.html",
      data: Buffer.from("<!doctype html><h1>hi</h1>", "utf8"),
      contentType: "text/html",
      sourcePath: "index.html",
    },
  ];
  const baseConfig = { token: "tok_test", teamId: "", teamSlug: "" };

  beforeEach(() => {
    calls = [];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("(a) fires PATCH /v9/projects/<id> with {ssoProtection:null} after successful deploy", async () => {
    vi.stubGlobal("fetch", makeFetchMockWithProjectId());

    await deployToVercel({
      config: baseConfig,
      files: baseFiles,
      projectId: "abc123",
      ctx: { tenant_id: "ceremonia", vercel_team: "ceremonia-89dd9b81" },
    });

    const patchCall = calls.find(
      (c) => c.init?.method === "PATCH" && c.url.startsWith("https://api.vercel.com/v9/projects/prj_test_1"),
    );
    expect(patchCall).toBeDefined();
    expect(JSON.parse(String(patchCall!.init!.body)).ssoProtection).toBeNull();
  });

  it("(b) PATCH uses the same vercelTeamQuery (slug) as the create call", async () => {
    vi.stubGlobal("fetch", makeFetchMockWithProjectId());

    await deployToVercel({
      config: baseConfig,
      files: baseFiles,
      projectId: "abc123",
      ctx: { tenant_id: "ceremonia", vercel_team: "ceremonia-89dd9b81" },
    });

    const createCall = calls.find((c) => (c.init?.method ?? "GET") === "POST");
    const patchCall = calls.find(
      (c) => c.init?.method === "PATCH" && c.url.includes("/v9/projects/"),
    );
    expect(createCall).toBeDefined();
    expect(patchCall).toBeDefined();

    // Both URLs must carry the same team slug query — proves PATCH routes to the right team.
    const createSlug = new URL(createCall!.url).searchParams.get("slug");
    const patchSlug = new URL(patchCall!.url).searchParams.get("slug");
    expect(patchSlug).toBe(createSlug);
    expect(patchSlug).toBe("ceremonia-89dd9b81");
  });

  it("(c) PATCH 500 does NOT throw — deploy resolves successfully (fire-and-forget absorbs error)", async () => {
    vi.stubGlobal("fetch", makeFetchMockWithProjectId({ patchStatus: 500 }));

    const result = await deployToVercel({
      config: baseConfig,
      files: baseFiles,
      projectId: "abc123",
      ctx: { tenant_id: "ceremonia", vercel_team: "ceremonia-89dd9b81" },
    });

    expect(result).toMatchObject({
      providerId: "vercel-self",
      deploymentId: "dpl_test_1",
      target: "preview",
    });
  });

  it("(d) when Vercel response lacks projectId, no PATCH fires", async () => {
    // Use a custom mock that returns a deployment WITHOUT projectId.
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      calls.push({ url, init });

      if (url.startsWith("https://api.vercel.com/v13/deployments") && (init?.method ?? "GET") === "POST") {
        return new Response(
          JSON.stringify({
            id: "dpl_test_1",
            uid: "dpl_test_1",
            // projectId intentionally absent — PATCH must not fire
            url: "od-test-abc.vercel.app",
            readyState: "READY",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.startsWith("https://api.vercel.com/v13/deployments/")) {
        return new Response(
          JSON.stringify({ id: "dpl_test_1", url: "od-test-abc.vercel.app", readyState: "READY" }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("ok", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await deployToVercel({
      config: baseConfig,
      files: baseFiles,
      projectId: "abc123",
      ctx: { tenant_id: "ceremonia", vercel_team: "ceremonia-89dd9b81" },
    });

    const patchCall = calls.find(
      (c) => c.init?.method === "PATCH" && c.url.includes("/v9/projects/"),
    );
    expect(patchCall).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// v7 — readVercelConfig env fallback.
//
// When ~/.open-design/vercel.json is missing OR fields are empty, the daemon
// must fall back to VERCEL_API_TOKEN / VERCEL_TOKEN / VERCEL_TEAM_ID /
// VERCEL_TEAM_SLUG env vars. This lets the container survive without a
// persistent `~/.open-design/` volume — operators set env on the host and
// Lumina-managed deploys work without `PUT /api/deploy/config`.
// ---------------------------------------------------------------------------

describe('readVercelConfig env fallback (v7)', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    delete process.env.VERCEL_API_TOKEN;
    delete process.env.VERCEL_TOKEN;
    delete process.env.VERCEL_TEAM_ID;
    delete process.env.VERCEL_TEAM_SLUG;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('falls back to env vars when ~/.open-design/vercel.json is missing (ENOENT)', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'od-config-missing-'));
    process.env.OD_USER_STATE_DIR = tmp;
    process.env.VERCEL_API_TOKEN = 'env-token-abc';
    process.env.VERCEL_TEAM_ID = 'team_env_id';
    process.env.VERCEL_TEAM_SLUG = 'ceremonia-env-slug';

    const cfg = await readVercelConfig();
    expect(cfg.token).toBe('env-token-abc');
    expect(cfg.teamId).toBe('team_env_id');
    expect(cfg.teamSlug).toBe('ceremonia-env-slug');
  });

  it('prefers VERCEL_TOKEN when VERCEL_API_TOKEN absent', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'od-config-vtok-'));
    process.env.OD_USER_STATE_DIR = tmp;
    process.env.VERCEL_TOKEN = 'vercel-token-fallback';

    const cfg = await readVercelConfig();
    expect(cfg.token).toBe('vercel-token-fallback');
  });

  it('VERCEL_API_TOKEN wins over VERCEL_TOKEN when both set', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'od-config-both-'));
    process.env.OD_USER_STATE_DIR = tmp;
    process.env.VERCEL_API_TOKEN = 'api-token-wins';
    process.env.VERCEL_TOKEN = 'plain-token-loses';

    const cfg = await readVercelConfig();
    expect(cfg.token).toBe('api-token-wins');
  });

  it('falls back to env vars when vercel.json fields are empty strings', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'od-config-empty-'));
    process.env.OD_USER_STATE_DIR = tmp;
    await writeFile(
      path.join(tmp, 'vercel.json'),
      JSON.stringify({ token: '', teamId: '', teamSlug: '' }),
    );
    process.env.VERCEL_API_TOKEN = 'env-replaces-empty';
    process.env.VERCEL_TEAM_SLUG = 'ceremonia-env';

    const cfg = await readVercelConfig();
    expect(cfg.token).toBe('env-replaces-empty');
    expect(cfg.teamId).toBe('');
    expect(cfg.teamSlug).toBe('ceremonia-env');
  });

  it('prefers file value over env when both set (file is operator override)', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'od-config-pref-'));
    process.env.OD_USER_STATE_DIR = tmp;
    await writeFile(
      path.join(tmp, 'vercel.json'),
      JSON.stringify({
        token: 'file-token-wins',
        teamId: 'file-team',
        teamSlug: 'file-slug',
      }),
    );
    process.env.VERCEL_API_TOKEN = 'env-token-loses';
    process.env.VERCEL_TEAM_ID = 'env-team-loses';
    process.env.VERCEL_TEAM_SLUG = 'env-slug-loses';

    const cfg = await readVercelConfig();
    expect(cfg.token).toBe('file-token-wins');
    expect(cfg.teamId).toBe('file-team');
    expect(cfg.teamSlug).toBe('file-slug');
  });

  it('returns all-empty when neither file nor env set', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'od-config-bare-'));
    process.env.OD_USER_STATE_DIR = tmp;
    const cfg = await readVercelConfig();
    expect(cfg.token).toBe('');
    expect(cfg.teamId).toBe('');
    expect(cfg.teamSlug).toBe('');
  });
});
