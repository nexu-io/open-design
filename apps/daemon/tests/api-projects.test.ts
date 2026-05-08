// Spec 112 — coverage for /apps/daemon/src/routes/api-projects.ts.
// Caller: vitest test runner (auto-discovered via vitest.config.ts include glob).
// No duplicate file: no existing api-projects.test.ts in tests/.
// Data writes: only OS mkdtemp() temp dirs cleaned in afterEach. No production data.
//
// Test surface:
//   - positive create (200 + project_id + edit_url)
//   - positive publish (200 + published_url + vercel_project_id)
//   - missing-key 401 (no x-api-key header)
//   - key-mismatch 401 (wrong x-api-key for the tenant)
//   - slug-mismatch 403 (body.tenant_slug != subdomain-resolved)
//   - rate-limit 429 (11th create in same minute)
//   - PII safety (html_body content NEVER appears in logs)
//   - cross-tenant blocked on publish (tenant A cannot publish tenant B's project)

import { mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { mountApiProjectsRoutes } from '../src/routes/api-projects.js';

// ── Fixtures ───────────────────────────────────────────────────────────────

const CEREMONIA_KEY = 'od_test_ceremonia_key_32_hex_xxxxxxx';
const ERIC_KEY = 'od_test_eric_key_32_hex_xxxxxxxxxxxxxx';

interface ServerHandle {
  baseUrl: string;
  close: () => Promise<void>;
  capturedLogs: Array<Record<string, unknown>>;
  fakeProjects: Map<string, FakeProject>;
}

interface FakeProject {
  id: string;
  name: string;
  metadata: Record<string, unknown> | null;
}

interface BootOptions {
  apiKeys?: Record<string, string>;
  /** Override deploy result. Defaults to a stub returning a fake URL. */
  deploy?: (args: unknown) => Promise<{
    url: string;
    deploymentId?: string;
    status?: string;
    statusMessage?: string;
    reachableAt?: number;
  }>;
  /** Force buildFileSet to return a fake file set instead of touching disk. */
  buildFileSet?: () => Promise<unknown[]>;
}

async function bootServer(opts: BootOptions = {}): Promise<ServerHandle> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'od-spec112-test-'));
  const projectsDir = path.join(root, 'projects');

  const apiKeys = opts.apiKeys ?? {
    ceremonia: CEREMONIA_KEY,
    ericedmeades: ERIC_KEY,
  };

  const fakeProjects = new Map<string, FakeProject>();
  const capturedLogs: Array<Record<string, unknown>> = [];

  const app = express();
  app.use(express.json({ limit: '4mb' }));

  mountApiProjectsRoutes(app, {
    db: null,
    projectsDir,
    insertProject: (_db, p) => {
      fakeProjects.set(p.id, { id: p.id, name: p.name, metadata: p.metadata });
      return p;
    },
    getProject: (_db, id) => {
      const f = fakeProjects.get(id);
      if (!f) return null;
      return {
        id: f.id,
        name: f.name,
        skillId: null,
        designSystemId: null,
        pendingPrompt: null,
        metadata: f.metadata,
        createdAt: 0,
        updatedAt: 0,
      };
    },
    deploy: (opts.deploy ?? (async () => ({
      url: 'https://od-fake-deploy.vercel.app',
      deploymentId: 'dpl_fake_123',
      status: 'ready',
      statusMessage: 'Deployed.',
      reachableAt: Date.now(),
    }))) as never,
    buildFileSet: (opts.buildFileSet ?? (async () => [
      {
        file: 'index.html',
        data: Buffer.from('<h1>Welcome</h1>'),
        contentType: 'text/html',
        sourcePath: 'index.html',
      },
    ])) as never,
    loadVercelConfig: (async () => ({ token: 'fake_token' })) as never,
    readApiKeys: () => apiKeys,
    resolveTenantFromHost: (host) => {
      // Tests use Host header values like "ceremonia.test" or "eric.test".
      // The first label is the tenant_slug.
      if (!host) return null;
      const bare = host.split(':')[0]?.toLowerCase() ?? '';
      const parts = bare.split('.');
      const first = parts[0];
      if (!first || first.length === 0) return null;
      // Map test-hostname-shorthand → real slug.
      if (first === 'eric') return 'ericedmeades';
      return first;
    },
    logger: (line) => {
      capturedLogs.push({ ...line });
    },
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve()),
  );
  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  return {
    baseUrl,
    close: async () => {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
      await rm(root, { recursive: true, force: true });
    },
    capturedLogs,
    fakeProjects,
  };
}

async function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<{
  status: number;
  bodyText: string;
  bodyJson: unknown;
  headers: Record<string, string>;
}> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    // Non-JSON response — leave as text.
  }
  const hdrs: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    hdrs[k.toLowerCase()] = v;
  });
  return { status: res.status, bodyText: text, bodyJson: json, headers: hdrs };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('POST /api/projects (spec 112 — create)', () => {
  let handle: ServerHandle | null = null;
  afterEach(async () => {
    await handle?.close();
    handle = null;
  });

  it('positive create — 200 + project_id + edit_url', async () => {
    handle = await bootServer();
    const res = await postJson(
      `${handle.baseUrl}/api/projects`,
      {
        title: 'Welcome page',
        html_body: '<h1>Welcome</h1>',
        tenant_slug: 'ceremonia',
      },
      {
        'x-forwarded-host': 'ceremonia.test',
        'x-api-key': CEREMONIA_KEY,
      },
    );
    expect(res.status).toBe(200);
    const body = res.bodyJson as { project_id?: string; edit_url?: string };
    expect(typeof body.project_id).toBe('string');
    expect(body.project_id?.length ?? 0).toBeGreaterThan(8);
    expect(body.edit_url).toMatch(/projects\/.+\/edit/);

    // Project record was inserted under correct tenant.
    const fake = handle.fakeProjects.get(body.project_id ?? '');
    expect(fake).toBeDefined();
    expect((fake?.metadata as { tenant_slug?: string } | null)?.tenant_slug).toBe(
      'ceremonia',
    );
  });

  it('passthrough — no x-api-key header reaches the next handler (test app: 404)', async () => {
    handle = await bootServer();
    const res = await postJson(
      `${handle.baseUrl}/api/projects`,
      { title: 't', html_body: '<h1>h</h1>', tenant_slug: 'ceremonia' },
      { 'x-forwarded-host': 'ceremonia.test' /* no x-api-key */ },
    );
    // No x-api-key → passthrough → no UI handler in this test app → Express
    // 404. In production server.ts, the UI handler at line 526 receives the
    // call. This confirms the gate is "key-present-only".
    expect(res.status).toBe(404);
  });

  it('missing-key 401 — empty x-api-key header is rejected', async () => {
    handle = await bootServer();
    const res = await postJson(
      `${handle.baseUrl}/api/projects`,
      { title: 't', html_body: '<h1>h</h1>', tenant_slug: 'ceremonia' },
      {
        'x-forwarded-host': 'ceremonia.test',
        'x-api-key': '',
      },
    );
    expect(res.status).toBe(401);
    expect((res.bodyJson as { error?: string }).error).toBe('missing_key');
  });

  it('key-mismatch 401 — wrong x-api-key for the tenant', async () => {
    handle = await bootServer();
    const res = await postJson(
      `${handle.baseUrl}/api/projects`,
      { title: 't', html_body: '<h1>h</h1>', tenant_slug: 'ceremonia' },
      {
        'x-forwarded-host': 'ceremonia.test',
        'x-api-key': 'wrong_key_value_with_same_length_xxxx',
      },
    );
    expect(res.status).toBe(401);
    expect((res.bodyJson as { error?: string }).error).toBe('key_mismatch');
  });

  it('cross-tenant 401 — Ceremonia key against Eric subdomain', async () => {
    handle = await bootServer();
    const res = await postJson(
      `${handle.baseUrl}/api/projects`,
      { title: 't', html_body: '<h1>h</h1>', tenant_slug: 'ericedmeades' },
      {
        'x-forwarded-host': 'eric.test',
        'x-api-key': CEREMONIA_KEY, // valid for ceremonia, NOT for eric
      },
    );
    expect(res.status).toBe(401);
    expect((res.bodyJson as { error?: string }).error).toBe('key_mismatch');
  });

  it('slug-mismatch 403 — body.tenant_slug != subdomain-resolved', async () => {
    handle = await bootServer();
    const res = await postJson(
      `${handle.baseUrl}/api/projects`,
      {
        title: 't',
        html_body: '<h1>h</h1>',
        tenant_slug: 'ericedmeades' /* forged */,
      },
      {
        'x-forwarded-host': 'ceremonia.test',
        'x-api-key': CEREMONIA_KEY,
      },
    );
    expect(res.status).toBe(403);
    expect((res.bodyJson as { error?: string }).error).toBe('slug_mismatch');
  });

  it('rate-limit 429 — 11th create within same minute', async () => {
    handle = await bootServer();
    // Default limit is 10/min — 11th must 429.
    const headers = { 'x-forwarded-host': 'ceremonia.test', 'x-api-key': CEREMONIA_KEY };
    let lastRes: Awaited<ReturnType<typeof postJson>> | null = null;
    for (let i = 0; i < 11; i += 1) {
      lastRes = await postJson(
        `${handle.baseUrl}/api/projects`,
        { title: `p${i}`, html_body: '<h1>x</h1>', tenant_slug: 'ceremonia' },
        headers,
      );
    }
    expect(lastRes?.status).toBe(429);
    expect(lastRes?.headers['retry-after']).toBeDefined();
    const ra = Number(lastRes?.headers['retry-after']);
    expect(Number.isFinite(ra)).toBe(true);
    expect(ra).toBeGreaterThanOrEqual(1);
  });

  it('per-tenant rate limit — Eric is unaffected when Ceremonia is throttled', async () => {
    handle = await bootServer();
    // Burn Ceremonia's bucket
    for (let i = 0; i < 10; i += 1) {
      await postJson(
        `${handle.baseUrl}/api/projects`,
        { title: `p${i}`, html_body: '<h1>x</h1>', tenant_slug: 'ceremonia' },
        { 'x-forwarded-host': 'ceremonia.test', 'x-api-key': CEREMONIA_KEY },
      );
    }
    // Eric's bucket should still have headroom.
    const res = await postJson(
      `${handle.baseUrl}/api/projects`,
      { title: 'eric-1', html_body: '<h1>e</h1>', tenant_slug: 'ericedmeades' },
      { 'x-forwarded-host': 'eric.test', 'x-api-key': ERIC_KEY },
    );
    expect(res.status).toBe(200);
  });

  it('PII safety — html_body content does NOT appear in logs', async () => {
    handle = await bootServer();
    const secret = 'SECRET_PII_LANDING_COPY_DO_NOT_LEAK';
    await postJson(
      `${handle.baseUrl}/api/projects`,
      {
        title: 't',
        html_body: `<h1>${secret}</h1>`,
        tenant_slug: 'ceremonia',
      },
      { 'x-forwarded-host': 'ceremonia.test', 'x-api-key': CEREMONIA_KEY },
    );
    const allLogs = JSON.stringify(handle.capturedLogs);
    expect(allLogs).not.toContain(secret);
  });

  it('PII safety — api key value does NOT appear in logs', async () => {
    handle = await bootServer();
    await postJson(
      `${handle.baseUrl}/api/projects`,
      { title: 't', html_body: '<h1>x</h1>', tenant_slug: 'ceremonia' },
      { 'x-forwarded-host': 'ceremonia.test', 'x-api-key': CEREMONIA_KEY },
    );
    const allLogs = JSON.stringify(handle.capturedLogs);
    expect(allLogs).not.toContain(CEREMONIA_KEY);
  });
});

describe('POST /api/projects/:id/publish (spec 112 — publish)', () => {
  let handle: ServerHandle | null = null;
  afterEach(async () => {
    await handle?.close();
    handle = null;
  });

  it('positive publish — 200 + published_url + vercel_project_id', async () => {
    handle = await bootServer();
    // First, create a project so publish has something to publish.
    const created = await postJson(
      `${handle.baseUrl}/api/projects`,
      { title: 'p', html_body: '<h1>x</h1>', tenant_slug: 'ceremonia' },
      { 'x-forwarded-host': 'ceremonia.test', 'x-api-key': CEREMONIA_KEY },
    );
    const projectId = (created.bodyJson as { project_id?: string }).project_id;
    expect(projectId).toBeDefined();

    const res = await postJson(
      `${handle.baseUrl}/api/projects/${projectId}/publish`,
      { tenant_slug: 'ceremonia' },
      { 'x-forwarded-host': 'ceremonia.test', 'x-api-key': CEREMONIA_KEY },
    );
    expect(res.status).toBe(200);
    const body = res.bodyJson as {
      published_url?: string;
      vercel_project_id?: string;
    };
    expect(body.published_url).toBe('https://od-fake-deploy.vercel.app');
    expect(body.vercel_project_id).toBe('dpl_fake_123');
  });

  it('cross-tenant publish 404 — Eric cannot publish Ceremonia project', async () => {
    handle = await bootServer();
    const created = await postJson(
      `${handle.baseUrl}/api/projects`,
      { title: 'p', html_body: '<h1>x</h1>', tenant_slug: 'ceremonia' },
      { 'x-forwarded-host': 'ceremonia.test', 'x-api-key': CEREMONIA_KEY },
    );
    const projectId = (created.bodyJson as { project_id?: string }).project_id;

    const res = await postJson(
      `${handle.baseUrl}/api/projects/${projectId}/publish`,
      { tenant_slug: 'ericedmeades' },
      { 'x-forwarded-host': 'eric.test', 'x-api-key': ERIC_KEY },
    );
    // 404 (not 403) — we don't leak that the project exists in another tenant.
    expect(res.status).toBe(404);
    expect((res.bodyJson as { error?: string }).error).toBe('project_not_found');
  });

  it('publish slug-mismatch 403', async () => {
    handle = await bootServer();
    const created = await postJson(
      `${handle.baseUrl}/api/projects`,
      { title: 'p', html_body: '<h1>x</h1>', tenant_slug: 'ceremonia' },
      { 'x-forwarded-host': 'ceremonia.test', 'x-api-key': CEREMONIA_KEY },
    );
    const projectId = (created.bodyJson as { project_id?: string }).project_id;

    const res = await postJson(
      `${handle.baseUrl}/api/projects/${projectId}/publish`,
      { tenant_slug: 'ericedmeades' /* forged */ },
      { 'x-forwarded-host': 'ceremonia.test', 'x-api-key': CEREMONIA_KEY },
    );
    expect(res.status).toBe(403);
    expect((res.bodyJson as { error?: string }).error).toBe('slug_mismatch');
  });

  it('publish missing-key 401', async () => {
    handle = await bootServer();
    const res = await postJson(
      `${handle.baseUrl}/api/projects/some_id/publish`,
      { tenant_slug: 'ceremonia' },
      { 'x-forwarded-host': 'ceremonia.test', 'x-api-key': '' },
    );
    expect(res.status).toBe(401);
  });

  it('publish rate-limit 429 — 31st publish in same minute', async () => {
    handle = await bootServer();
    // Need a real project to publish. Each create burns 1 token from create
    // bucket but publish is a separate bucket.
    const created = await postJson(
      `${handle.baseUrl}/api/projects`,
      { title: 'p', html_body: '<h1>x</h1>', tenant_slug: 'ceremonia' },
      { 'x-forwarded-host': 'ceremonia.test', 'x-api-key': CEREMONIA_KEY },
    );
    const projectId = (created.bodyJson as { project_id?: string }).project_id;

    let lastRes: Awaited<ReturnType<typeof postJson>> | null = null;
    for (let i = 0; i < 31; i += 1) {
      lastRes = await postJson(
        `${handle.baseUrl}/api/projects/${projectId}/publish`,
        { tenant_slug: 'ceremonia' },
        { 'x-forwarded-host': 'ceremonia.test', 'x-api-key': CEREMONIA_KEY },
      );
    }
    expect(lastRes?.status).toBe(429);
    expect(lastRes?.headers['retry-after']).toBeDefined();
  });
});

describe('input validation', () => {
  let handle: ServerHandle | null = null;
  afterEach(async () => {
    await handle?.close();
    handle = null;
  });

  beforeEach(async () => {
    handle = await bootServer();
  });

  it('400 when title missing', async () => {
    const res = await postJson(
      `${handle!.baseUrl}/api/projects`,
      { html_body: '<h1>x</h1>', tenant_slug: 'ceremonia' },
      { 'x-forwarded-host': 'ceremonia.test', 'x-api-key': CEREMONIA_KEY },
    );
    expect(res.status).toBe(400);
    expect((res.bodyJson as { error?: string }).error).toBe(
      'title_must_be_string',
    );
  });

  it('400 when html_body missing', async () => {
    const res = await postJson(
      `${handle!.baseUrl}/api/projects`,
      { title: 't', tenant_slug: 'ceremonia' },
      { 'x-forwarded-host': 'ceremonia.test', 'x-api-key': CEREMONIA_KEY },
    );
    expect(res.status).toBe(400);
    expect((res.bodyJson as { error?: string }).error).toBe(
      'html_body_must_be_string',
    );
  });

  it('400 when title is empty string', async () => {
    const res = await postJson(
      `${handle!.baseUrl}/api/projects`,
      {
        title: '   ',
        html_body: '<h1>x</h1>',
        tenant_slug: 'ceremonia',
      },
      { 'x-forwarded-host': 'ceremonia.test', 'x-api-key': CEREMONIA_KEY },
    );
    expect(res.status).toBe(400);
    expect((res.bodyJson as { error?: string }).error).toBe('title_required');
  });
});
