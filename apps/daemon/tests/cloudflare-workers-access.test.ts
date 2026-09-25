import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkDeploymentUrl, cloudflareOAuthTokensDir, configureCloudflareWorkersDataDir, isCloudflareAccessProtectedResponse, readCloudflareWorkersConfig, writeCloudflareWorkersConfig } from '../src/deploy.js';
import { setCloudflareOAuthToken } from '../src/integrations/cloudflare-tokens.js';
import {
  deployToCloudflareWorkers,
  probeCloudflareWorkersCapabilities,
} from '../src/deploy/cloudflare-workers.js';

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

function accessRedirect(): Response {
  return new Response('', { status: 302, headers: { location: 'https://acct-test.cloudflareaccess.com/cdn-cgi/access/login' } });
}

type Call = [string, RequestInit | undefined];

const INDEX = { file: 'index.html', data: Buffer.from('<h1>hi</h1>') };
const base = { config: { token: 'tok-secret', accountId: 'acct_test' }, files: [INDEX], projectName: 'My Site' };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

type AccessOverrides = Record<string, unknown> & { head?: (url: string) => Response };

function accessFetch(overrides: AccessOverrides = {}) {
  const calls: Call[] = [];
  // Apps created via POST are remembered so a later find-by-tag (the final
  // reconcile after a custom-domain attach) sees them, as the real API would.
  const createdApps: Array<Record<string, unknown>> = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push([url, init]);
    if ((init?.method || 'GET').toUpperCase() === 'HEAD') {
      // Public URLs of an Access-protected deploy answer with the login redirect.
      return overrides.head ? overrides.head(url) : accessRedirect();
    }
    if (url.includes('/workers/domains')) {
      const method = (init?.method || 'GET').toUpperCase();
      if (method === 'GET') return jsonResponse(overrides.domainsList ?? { success: true, result: [] });
      if (method === 'DELETE') return jsonResponse(overrides.domainsDelete ?? { success: true, result: null });
      return jsonResponse(overrides.domains ?? { success: true, result: { id: 'dom-1' } });
    }
    if (url.includes('assets-upload-session')) {
      return jsonResponse(overrides.session ?? { success: true, result: { jwt: 'SESS', buckets: [] } });
    }
    if (url.includes('/workers/assets/upload')) {
      return jsonResponse(overrides.upload ?? { success: true, result: { jwt: 'COMPLETION' } });
    }
    if (url.endsWith('/workers/subdomain')) {
      return jsonResponse(overrides.subdomainGet ?? { success: true, result: { subdomain: 'acct-test' } });
    }
    if (url.includes('/workers/scripts')) {
      return jsonResponse(overrides.scripts ?? { success: true, result: [{ id: 'my-site', tag: 'tag-abc-123' }] });
    }
    if (url.includes('/access/identity_providers')) {
      if ((init?.method || 'GET').toUpperCase() === 'POST') {
        return jsonResponse(overrides.idpCreate ?? { success: true, result: { id: 'otp-new' } });
      }
      return jsonResponse(overrides.idps ?? { success: true, result: [{ id: 'otp-123', type: 'onetimepin', name: 'One-time PIN login' }] });
    }
    if (url.includes('/access/apps/')) {
      const method = (init?.method || 'GET').toUpperCase();
      if (method === 'DELETE') return jsonResponse(overrides.accessDelete ?? { success: true, result: { id: 'app-123' } });
      if (method === 'PUT') return jsonResponse(overrides.accessUpdate ?? { success: true, result: { id: 'app-123' } });
      return jsonResponse(overrides.accessGet ?? {
        success: true,
        result: { id: 'app-123', destinations: [{ type: 'worker', worker_id: 'tag-abc-123' }, { type: 'preview_worker', worker_id: 'tag-abc-123' }] },
      });
    }
    if (url.includes('/access/apps')) {
      const method = (init?.method || 'GET').toUpperCase();
      if (method === 'POST') {
        const createBody = JSON.parse(String(init?.body ?? '{}')) as { name?: unknown; destinations?: unknown };
        const createOverride = overrides.accessCreate as { success?: boolean; result?: Record<string, unknown> } | undefined;
        const createSucceeded = !createOverride || createOverride.success !== false;
        const id = createOverride?.result?.id ?? 'app-123';
        if (createSucceeded) {
          createdApps.push({ id, name: createBody.name, destinations: createBody.destinations ?? [] });
        }
        return jsonResponse(overrides.accessCreate ?? { success: true, result: { id, uid: 'app-uid-123' } });
      }
      return jsonResponse(overrides.accessList ?? { success: true, result: createdApps });
    }
    if (url.endsWith('/user')) {
      return jsonResponse(overrides.user ?? { success: true, result: { email: 'me@example.com' } });
    }
    if (url.includes('/subdomain')) {
      return jsonResponse(overrides.subdomainPost ?? { success: true, result: { enabled: true } });
    }
    return jsonResponse(overrides.scriptPut ?? { success: true, result: {} });
  });
  return { calls, fn };
}

describe('cloudflare-workers access config', () => {
  it('round-trips the access rule', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'od-workers-access-'));
    const prior = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = dir;
    configureCloudflareWorkersDataDir(dir);
    try {
      await writeCloudflareWorkersConfig({
        token: 'tok', accountId: 'acct_test',
        access: { enabled: true, rule: { kind: 'emails', emails: ['a@b.c', 'd@e.f'] } },
      });
      const raw = await readCloudflareWorkersConfig();
      expect(raw.access).toEqual({ enabled: true, rule: { kind: 'emails', emails: ['a@b.c', 'd@e.f'] } });
    } finally {
      process.env.OD_USER_STATE_DIR = prior;
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('deployToCloudflareWorkers access (fail-closed)', () => {
  it('creates the Access app before exposing the subdomain', async () => {
    const { calls, fn } = accessFetch();
    vi.stubGlobal('fetch', fn);
    const out = await deployToCloudflareWorkers({
      ...base,
      access: { enabled: true, rule: { kind: 'emails', emails: ['a@b.c'] } },
    });
    const createPos = calls.findIndex((c) => c[0].endsWith('/access/apps') && c[1]?.method === 'POST');
    const exposePos = calls.findIndex((c) => c[0].includes('/subdomain') && c[1]?.method === 'POST');
    expect(createPos).toBeGreaterThanOrEqual(0);
    expect(exposePos).toBeGreaterThan(createPos);

    const createBody = JSON.parse(calls[createPos]![1]?.body as string) as Record<string, unknown>;
    expect(createBody.type).toBe('self_hosted');
    expect(createBody.domain).toBeUndefined();
    expect(createBody.allowed_idps).toEqual(['otp-123']);
    expect(createBody.destinations).toEqual([
      { type: 'worker', worker_id: 'tag-abc-123' },
      { type: 'preview_worker', worker_id: 'tag-abc-123' },
    ]);
    expect(createBody.policies).toEqual([
      { name: 'Allow', decision: 'allow', include: [{ email: { email: 'a@b.c' } }], precedence: 1 },
    ]);
    expect(out.providerMetadata).toMatchObject({ accessProtected: true, accessAppId: 'app-123', createdByOpenDesign: true });
  });

  it('updates the existing app in place when a prior deploy already claimed the Worker', async () => {
    const { calls, fn } = accessFetch({
      accessList: {
        success: true,
        result: [
          {
            id: 'app-existing',
            name: 'my-site (OpenDesign)',
            destinations: [
              { type: 'worker', worker_id: 'tag-abc-123' },
              { type: 'preview_worker', worker_id: 'tag-abc-123' },
            ],
          },
        ],
      },
      accessUpdate: { success: true, result: { id: 'app-existing' } },
    });
    vi.stubGlobal('fetch', fn);
    const out = await deployToCloudflareWorkers({
      ...base,
      access: { enabled: true, rule: { kind: 'emails', emails: ['a@b.c'] } },
      priorAccessAppId: 'app-existing',
    });
    const putCall = calls.find((c) => c[0].includes('/access/apps/app-existing') && c[1]?.method === 'PUT');
    expect(putCall).toBeTruthy();
    const putBody = JSON.parse(putCall![1]?.body as string) as Record<string, unknown>;
    expect(putBody.allowed_idps).toEqual(['otp-123']);
    expect(calls.some((c) => c[0].endsWith('/access/apps') && c[1]?.method === 'POST')).toBe(false);
    expect(out.providerMetadata).toMatchObject({ accessAppId: 'app-existing' });
  });

  it('refuses to overwrite a user-managed Access app that claims the Worker', async () => {
    const { calls, fn } = accessFetch({
      accessList: {
        success: true,
        result: [{ id: 'app-theirs', name: 'Corp SSO', destinations: [{ type: 'worker', worker_id: 'tag-abc-123' }] }],
      },
    });
    vi.stubGlobal('fetch', fn);
    await expect(
      deployToCloudflareWorkers({ ...base, access: { enabled: true, rule: { kind: 'emails', emails: ['a@b.c'] } } }),
    ).rejects.toMatchObject({ name: 'DeployError', code: 'CFW_ACCESS_APP_FOREIGN', status: 409 });
    expect(calls.some((c) => c[0].includes('/access/apps') && (c[1]?.method === 'PUT' || c[1]?.method === 'POST'))).toBe(false);
    expect(calls.some((c) => c[0].includes('/access/apps') && c[1]?.method === 'DELETE')).toBe(false);
    // Access is reconciled BEFORE the live PUT, so nothing new went live either.
    expect(calls.some((c) => c[1]?.method === 'PUT' && c[0].endsWith('/workers/scripts/my-site'))).toBe(false);
  });

  it('adds a public destination for the custom hostname and verifies both URLs land on Access', async () => {
    const { calls, fn } = accessFetch();
    vi.stubGlobal('fetch', fn);
    const out = await deployToCloudflareWorkers({
      ...base,
      access: { enabled: true, rule: { kind: 'emails', emails: ['a@b.c'] } },
      customDomain: { hostname: 'app.example.com', zoneId: 'zone-1' },
    });
    const createPos = calls.findIndex((c) => c[0].endsWith('/access/apps') && c[1]?.method === 'POST');
    const attachPos = calls.findIndex((c) => c[0].includes('/workers/domains') && c[1]?.method === 'PUT');
    expect(createPos).toBeGreaterThanOrEqual(0);
    expect(attachPos).toBeGreaterThan(createPos);
    // The pre-PUT app must NOT claim the custom hostname before it is attached.
    const createBody = JSON.parse(calls[createPos]![1]?.body as string) as { destinations: unknown[] };
    expect(createBody.destinations).not.toContainEqual({ type: 'public', uri: 'app.example.com' });
    // The covering PUT (after the domain attach) claims the now-attached hostname.
    const finalPutPos = calls.findIndex((c) => c[0].endsWith('/access/apps/app-123') && c[1]?.method === 'PUT');
    expect(finalPutPos).toBeGreaterThan(attachPos);
    const finalBody = JSON.parse(calls[finalPutPos]![1]?.body as string) as { destinations: unknown[] };
    expect(finalBody.destinations).toContainEqual({ type: 'public', uri: 'app.example.com' });
    const heads = calls.filter((c) => c[1]?.method === 'HEAD').map((c) => c[0]);
    expect(heads).toContain('https://my-site.acct-test.workers.dev');
    expect(heads).toContain('https://app.example.com');
    expect(out.providerMetadata).toMatchObject({ accessVerified: true, customDomain: { id: 'dom-1', hostname: 'app.example.com' } });
  });

  it('covers every hostname Cloudflare routes to the script and detaches the ones the config dropped', async () => {
    // A previous deploy attached old.example.com; the config now names
    // app.example.com. other.example.com belongs to a different script and is
    // returned only if Cloudflare ignores the `service` filter — it must never
    // be touched.
    const { calls, fn } = accessFetch({
      domainsList: {
        success: true,
        result: [
          { id: 'dom-old', hostname: 'Old.Example.com', service: 'my-site', zone_id: 'zone-1' },
          { id: 'dom-other', hostname: 'other.example.com', service: 'other-script', zone_id: 'zone-1' },
        ],
      },
    });
    vi.stubGlobal('fetch', fn);
    const out = await deployToCloudflareWorkers({
      ...base,
      access: { enabled: true, rule: { kind: 'emails', emails: ['a@b.c'] } },
      customDomain: { hostname: 'app.example.com', zoneId: 'zone-1' },
    });
    const listPos = calls.findIndex((c) => c[0].includes('/workers/domains?service=my-site') && (c[1]?.method || 'GET') === 'GET');
    const uploadPos = calls.findIndex((c) => c[0].includes('assets-upload-session'));
    const createPos = calls.findIndex((c) => c[0].endsWith('/access/apps') && c[1]?.method === 'POST');
    const attachPos = calls.findIndex((c) => c[0].includes('/workers/domains') && c[1]?.method === 'PUT');
    const detachPos = calls.findIndex((c) => c[0].endsWith('/workers/domains/dom-old') && c[1]?.method === 'DELETE');
    // Routed hostnames are known before anything is uploaded.
    expect(listPos).toBeGreaterThanOrEqual(0);
    expect(listPos).toBeLessThan(uploadPos);
    // The pre-PUT app covers the still-routed hostname (normalized) but NOT the
    // configured hostname it cannot yet serve; the foreign script's hostname is
    // never ours.
    const createBody = JSON.parse(calls[createPos]![1]?.body as string) as { destinations: unknown[] };
    expect(createBody.destinations).toContainEqual({ type: 'public', uri: 'old.example.com' });
    expect(createBody.destinations).not.toContainEqual({ type: 'public', uri: 'app.example.com' });
    expect(createBody.destinations).not.toContainEqual({ type: 'public', uri: 'other.example.com' });
    // The covering PUT (immediately after attach, before any detach) closes the
    // perimeter over everything routed at that instant: the configured hostname
    // AND the still-attached stale one.
    const accessPuts = calls
      .map((c, index) => ({ index, call: c }))
      .filter(({ call }) => call[0].endsWith('/access/apps/app-123') && call[1]?.method === 'PUT');
    expect(accessPuts).toHaveLength(2);
    const coveringPut = accessPuts[0]!;
    const finalPut = accessPuts[1]!;
    expect(coveringPut.index).toBeGreaterThan(attachPos);
    expect(coveringPut.index).toBeLessThan(detachPos);
    const coveringBody = JSON.parse(coveringPut.call[1]?.body as string) as { destinations: unknown[] };
    expect(coveringBody.destinations).toContainEqual({ type: 'public', uri: 'app.example.com' });
    expect(coveringBody.destinations).toContainEqual({ type: 'public', uri: 'old.example.com' });
    // After the stale hostname is detached, the app drops it and keeps only the
    // configured one; the foreign hostname is never detached.
    expect(finalPut.index).toBeGreaterThan(detachPos);
    const finalBody = JSON.parse(finalPut.call[1]?.body as string) as { destinations: unknown[] };
    expect(finalBody.destinations).toContainEqual({ type: 'public', uri: 'app.example.com' });
    expect(finalBody.destinations).not.toContainEqual({ type: 'public', uri: 'old.example.com' });
    expect(detachPos).toBeGreaterThan(createPos);
    expect(calls.some((c) => c[0].includes('/workers/domains/dom-other'))).toBe(false);
    const steps = (out.providerMetadata?.steps ?? []) as { name: string; detail?: string }[];
    expect(steps).toContainEqual({ name: 'custom-domain-detach', status: 'done', detail: 'old.example.com' });
    expect(out.providerMetadata).toMatchObject({ accessVerified: true });
  });

  it('does not re-PUT the Access app when the configured hostname is already attached and nothing is stale', async () => {
    const { calls, fn } = accessFetch({
      domainsList: {
        success: true,
        result: [{ id: 'dom-1', hostname: 'app.example.com', service: 'my-site', zone_id: 'zone-1' }],
      },
    });
    vi.stubGlobal('fetch', fn);
    await deployToCloudflareWorkers({
      ...base,
      access: { enabled: true, rule: { kind: 'emails', emails: ['a@b.c'] } },
      customDomain: { hostname: 'app.example.com', zoneId: 'zone-1' },
    });
    // The pre-PUT app already covers the configured hostname; a steady-state
    // redeploy must not churn an extra PUT.
    expect(calls.some((c) => c[0].endsWith('/access/apps') && c[1]?.method === 'POST')).toBe(true);
    expect(calls.some((c) => c[0].endsWith('/access/apps/app-123') && c[1]?.method === 'PUT')).toBe(false);
  });

  it('skips the covering PUT and only drops the stale hostname when the configured hostname is already attached', async () => {
    const { calls, fn } = accessFetch({
      domainsList: {
        success: true,
        result: [
          { id: 'dom-1', hostname: 'app.example.com', service: 'my-site', zone_id: 'zone-1' },
          { id: 'dom-old', hostname: 'old.example.com', service: 'my-site', zone_id: 'zone-1' },
        ],
      },
    });
    vi.stubGlobal('fetch', fn);
    await deployToCloudflareWorkers({
      ...base,
      access: { enabled: true, rule: { kind: 'emails', emails: ['a@b.c'] } },
      customDomain: { hostname: 'app.example.com', zoneId: 'zone-1' },
    });
    const detachPos = calls.findIndex((c) => c[0].endsWith('/workers/domains/dom-old') && c[1]?.method === 'DELETE');
    const puts = calls
      .map((c, index) => ({ index, call: c }))
      .filter(({ call }) => call[0].endsWith('/access/apps/app-123') && call[1]?.method === 'PUT');
    // One PUT only: the post-detach reconcile dropping the stale hostname. The
    // covering PUT is skipped because the configured hostname was already routed.
    expect(puts).toHaveLength(1);
    expect(puts[0]!.index).toBeGreaterThan(detachPos);
    const finalBody = JSON.parse(puts[0]!.call[1]?.body as string) as { destinations: unknown[] };
    expect(finalBody.destinations).toContainEqual({ type: 'public', uri: 'app.example.com' });
    expect(finalBody.destinations).not.toContainEqual({ type: 'public', uri: 'old.example.com' });
  });

  it('detaches the just-attached hostname when the covering PUT fails, so no public hostname is left behind', async () => {
    const { calls, fn } = accessFetch({
      accessUpdate: { success: false, errors: [{ message: 'cover denied' }] },
    });
    vi.stubGlobal('fetch', fn);
    await expect(
      deployToCloudflareWorkers({
        ...base,
        access: { enabled: true, rule: { kind: 'emails', emails: ['a@b.c'] } },
        customDomain: { hostname: 'app.example.com', zoneId: 'zone-1' },
      }),
    ).rejects.toThrow(/cover denied/);
    const failedPutPos = calls.findIndex((c) => c[0].endsWith('/access/apps/app-123') && c[1]?.method === 'PUT');
    const detachPos = calls.findIndex((c) => c[0].endsWith('/workers/domains/dom-1') && c[1]?.method === 'DELETE');
    expect(failedPutPos).toBeGreaterThanOrEqual(0);
    expect(detachPos).toBeGreaterThan(failedPutPos);
  });

  it('re-lists to find the domain id when the attach returns none, and still detaches it on covering-PUT failure', async () => {
    const { calls, fn } = accessFetch({
      accessUpdate: { success: false, errors: [{ message: 'cover denied' }] },
      // attach succeeds but omits an id (some Cloudflare responses return null id)
      domains: { success: true, result: {} },
    });
    // First GET /workers/domains is the pre-attach listing (empty, so the
    // covering PUT runs); the second is the catch's re-list, which returns the
    // id Cloudflare assigned.
    let domainsGets = 0;
    const wrapped = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/workers/domains') && (init?.method || 'GET').toUpperCase() === 'GET') {
        domainsGets += 1;
        if (domainsGets > 1) {
          return jsonResponse({ success: true, result: [{ id: 'dom-9', hostname: 'app.example.com', service: 'my-site' }] });
        }
      }
      return fn(url, init);
    });
    vi.stubGlobal('fetch', wrapped);
    await expect(
      deployToCloudflareWorkers({
        ...base,
        access: { enabled: true, rule: { kind: 'emails', emails: ['a@b.c'] } },
        customDomain: { hostname: 'app.example.com', zoneId: 'zone-1' },
      }),
    ).rejects.toThrow(/cover denied/);
    expect(calls.some((c) => c[0].endsWith('/workers/domains/dom-9') && c[1]?.method === 'DELETE')).toBe(true);
  });

  it('still surfaces the covering-PUT error when the compensation detach itself fails', async () => {
    const { calls, fn } = accessFetch({
      accessUpdate: { success: false, errors: [{ message: 'cover denied' }] },
      domainsDelete: { success: false, errors: [{ message: 'detach denied' }] },
    });
    vi.stubGlobal('fetch', fn);
    await expect(
      deployToCloudflareWorkers({
        ...base,
        access: { enabled: true, rule: { kind: 'emails', emails: ['a@b.c'] } },
        customDomain: { hostname: 'app.example.com', zoneId: 'zone-1' },
      }),
    ).rejects.toThrow(/cover denied/);
    expect(calls.some((c) => c[0].endsWith('/workers/domains/dom-1') && c[1]?.method === 'DELETE')).toBe(true);
  });

  it('detaches a dropped hostname even with Access off and no custom domain configured', async () => {
    const { calls, fn } = accessFetch({
      domainsList: { success: true, result: [{ id: 'dom-old', hostname: 'old.example.com', service: 'my-site' }] },
    });
    vi.stubGlobal('fetch', fn);
    const out = await deployToCloudflareWorkers({ ...base });
    expect(calls.some((c) => c[0].endsWith('/workers/domains/dom-old') && c[1]?.method === 'DELETE')).toBe(true);
    expect(out.status).toBe('ready');
    const steps = (out.providerMetadata?.steps ?? []) as { name: string }[];
    expect(steps.map((s) => s.name)).toContain('custom-domain-detach');
  });

  it('never reports ready while a routed hostname could not be detached', async () => {
    const { fn } = accessFetch({
      domainsList: { success: true, result: [{ id: 'dom-old', hostname: 'old.example.com', service: 'my-site' }] },
      domainsDelete: { success: false, errors: [{ message: 'detach denied' }] },
    });
    vi.stubGlobal('fetch', fn);
    await expect(
      deployToCloudflareWorkers({ ...base, access: { enabled: true, rule: { kind: 'emails', emails: ['a@b.c'] } } }),
    ).rejects.toMatchObject({ name: 'DeployError', message: 'detach denied' });
  });

  it('fails closed before any upload when the attached-domains list cannot be read', async () => {
    const { calls, fn } = accessFetch({ domainsList: { success: false, errors: [{ message: 'domains unavailable' }] } });
    vi.stubGlobal('fetch', fn);
    await expect(
      deployToCloudflareWorkers({ ...base, access: { enabled: true, rule: { kind: 'emails', emails: ['a@b.c'] } } }),
    ).rejects.toMatchObject({ name: 'DeployError', message: 'domains unavailable' });
    expect(calls.some((c) => c[0].includes('assets-upload-session'))).toBe(false);
    expect(calls.some((c) => c[1]?.method === 'PUT' && c[0].includes('/workers/scripts/'))).toBe(false);
  });

  it('a preview deploy keeps every routed hostname on the shared Access app', async () => {
    const { calls, fn } = accessFetch({
      domainsList: { success: true, result: [{ id: 'dom-old', hostname: 'old.example.com', service: 'my-site' }] },
      accessList: {
        success: true,
        result: [{ id: 'app-123', name: 'my-site (OpenDesign)', destinations: [{ type: 'worker', worker_id: 'tag-abc-123' }] }],
      },
    });
    vi.stubGlobal('fetch', fn);
    await deployToCloudflareWorkers({
      ...base,
      target: 'preview',
      access: { enabled: true, rule: { kind: 'emails', emails: ['a@b.c'] } },
    });
    const put = calls.find((c) => c[0].endsWith('/access/apps/app-123') && c[1]?.method === 'PUT');
    const body = JSON.parse(put![1]?.body as string) as { destinations: unknown[] };
    expect(body.destinations).toContainEqual({ type: 'public', uri: 'old.example.com' });
    // A preview never reconciles production routing.
    expect(calls.some((c) => c[1]?.method === 'DELETE' && c[0].includes('/workers/domains/'))).toBe(false);
  });

  it('fails closed when the Access apps list answers 200 with success:false (no duplicate create)', async () => {
    const { calls, fn } = accessFetch({ accessList: { success: false, errors: [{ message: 'apps list degraded' }] } });
    vi.stubGlobal('fetch', fn);
    await expect(
      deployToCloudflareWorkers({ ...base, access: { enabled: true, rule: { kind: 'emails', emails: ['a@b.c'] } } }),
    ).rejects.toMatchObject({ name: 'DeployError', message: 'apps list degraded' });
    expect(calls.some((c) => c[0].endsWith('/access/apps') && c[1]?.method === 'POST')).toBe(false);
    expect(calls.some((c) => c[0].includes('/subdomain') && c[1]?.method === 'POST')).toBe(false);
  });

  it('fails closed when the Access apps list answers 200 with a non-array result', async () => {
    const { calls, fn } = accessFetch({ accessList: { success: true, result: { id: 'not-a-list' } } });
    vi.stubGlobal('fetch', fn);
    await expect(
      deployToCloudflareWorkers({ ...base, access: { enabled: true, rule: { kind: 'emails', emails: ['a@b.c'] } } }),
    ).rejects.toMatchObject({ name: 'DeployError' });
    expect(calls.some((c) => c[0].endsWith('/access/apps') && c[1]?.method === 'POST')).toBe(false);
  });

  it('resolves "only me" from the stored OAuth email without calling GET /user, before any upload', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'od-workers-self-oauth-'));
    const prior = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = dir;
    configureCloudflareWorkersDataDir(dir);
    try {
      await setCloudflareOAuthToken(cloudflareOAuthTokensDir(), {
        accessToken: 'oauth-acc',
        tokenType: 'Bearer',
        email: 'me@stored.example',
        expiresAt: Date.now() + 3_600_000,
        generation: 0,
        savedAt: Date.now(),
      });
      await writeCloudflareWorkersConfig({ credentialMode: 'oauth', accountId: 'acct_test', clientId: 'client-abc' });
      // GET /user is NOT permitted for this connection — the stored record must carry the deploy.
      const { calls, fn } = accessFetch({ user: { success: false, errors: [{ code: 10000, message: 'no permission' }] } });
      vi.stubGlobal('fetch', fn);
      const out = await deployToCloudflareWorkers({
        ...base,
        config: { token: '', accountId: 'acct_test', credentialMode: 'oauth' },
        access: { enabled: true, rule: { kind: 'self' } },
      });
      expect(calls.some((c) => c[0].endsWith('/user'))).toBe(false);
      const createPos = calls.findIndex((c) => c[0].endsWith('/access/apps') && c[1]?.method === 'POST');
      const createBody = JSON.parse(calls[createPos]![1]?.body as string) as { policies: { include: unknown[] }[] };
      expect(createBody.policies[0]!.include).toEqual([{ email: { email: 'me@stored.example' } }]);
      expect(out.providerMetadata).toMatchObject({ accessProtected: true, accessVerified: true });
    } finally {
      process.env.OD_USER_STATE_DIR = prior;
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('fails "only me" before any upload when no email can be resolved', async () => {
    const { calls, fn } = accessFetch({ user: { success: false, errors: [{ code: 10000, message: 'no permission' }] } });
    vi.stubGlobal('fetch', fn);
    await expect(
      deployToCloudflareWorkers({ ...base, access: { enabled: true, rule: { kind: 'self' } } }),
    ).rejects.toMatchObject({ name: 'DeployError', code: 'CFW_ACCESS_SELF_EMAIL' });
    expect(calls.some((c) => c[0].includes('assets-upload-session'))).toBe(false);
  });

  it('does not report ready when a public URL is not behind Access', async () => {
    const { fn } = accessFetch({
      head: (url) => (url === 'https://app.example.com' ? new Response('', { status: 200 }) : accessRedirect()),
    });
    vi.stubGlobal('fetch', fn);
    await expect(
      deployToCloudflareWorkers({
        ...base,
        access: { enabled: true, rule: { kind: 'emails', emails: ['a@b.c'] } },
        customDomain: { hostname: 'app.example.com', zoneId: 'zone-1' },
      }),
    ).rejects.toMatchObject({ name: 'DeployError', code: 'CFW_ACCESS_UNVERIFIED' });
  });

  it('fails closed (no fallback create, no live PUT) when the scripts list errors', async () => {
    const { calls, fn } = accessFetch({ scripts: { success: false, errors: [{ message: 'upstream' }] } });
    // make the scripts list a 500 rather than a 200-with-error envelope
    const wrapped = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/workers/scripts?')) {
        calls.push([url, init]);
        return jsonResponse({ success: false, errors: [{ message: 'upstream' }] }, 500);
      }
      return fn(url, init);
    });
    vi.stubGlobal('fetch', wrapped);
    await expect(
      deployToCloudflareWorkers({ ...base, access: { enabled: true, rule: { kind: 'emails', emails: ['a@b.c'] } } }),
    ).rejects.toMatchObject({ name: 'DeployError' });
    expect(calls.some((c) => c[0].includes('/access/apps') && c[1]?.method === 'POST')).toBe(false);
    expect(calls.some((c) => c[1]?.method === 'PUT' && c[0].endsWith('/workers/scripts/my-site'))).toBe(false);
  });

  it('a transient IdP list failure is not mis-reported as a missing OTP scope', async () => {
    const { calls, fn } = accessFetch();
    const wrapped = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/access/identity_providers') && (init?.method || 'GET').toUpperCase() === 'GET') {
        calls.push([url, init]);
        return jsonResponse({ success: false, errors: [{ message: 'upstream' }] }, 500);
      }
      return fn(url, init);
    });
    vi.stubGlobal('fetch', wrapped);
    let caught: { code?: string } | undefined;
    try {
      await deployToCloudflareWorkers({ ...base, access: { enabled: true, rule: { kind: 'emails', emails: ['a@b.c'] } } });
    } catch (err) {
      caught = err as { code?: string };
    }
    expect(caught).toBeTruthy();
    expect(caught?.code).not.toBe('CFW_ACCESS_OTP_SCOPE_REQUIRED');
    expect(calls.some((c) => c[0].includes('/access/identity_providers') && c[1]?.method === 'POST')).toBe(false);
  });

  it('retains a prior Access app that still guards a different (renamed) Worker', async () => {
    const { calls, fn } = accessFetch({
      accessGet: { success: true, result: { id: 'app-old', destinations: [{ type: 'worker', worker_id: 'tag-OLD' }] } },
    });
    vi.stubGlobal('fetch', fn);
    const out = await deployToCloudflareWorkers({
      ...base,
      access: { enabled: true, rule: { kind: 'emails', emails: ['a@b.c'] } },
      priorAccessAppId: 'app-old',
    });
    expect(calls.some((c) => c[0].includes('/access/apps/') && c[1]?.method === 'DELETE')).toBe(false);
    const steps = (out.providerMetadata?.steps ?? []) as Array<{ name: string; detail?: string }>;
    expect(steps).toContainEqual({ name: 'access-app-prior-retained', status: 'done', detail: 'app-old' });
  });

  it('adopts an existing app carrying the OpenDesign name when no app id was recorded (failed first deploy)', async () => {
    const { calls, fn } = accessFetch({
      accessList: {
        success: true,
        result: [{ id: 'app-orphan', name: 'my-site (OpenDesign)', destinations: [{ type: 'worker', worker_id: 'tag-abc-123' }] }],
      },
      accessUpdate: { success: true, result: { id: 'app-orphan' } },
    });
    vi.stubGlobal('fetch', fn);
    const out = await deployToCloudflareWorkers({
      ...base,
      access: { enabled: true, rule: { kind: 'emails', emails: ['a@b.c'] } },
    });
    expect(calls.some((c) => c[0].includes('/access/apps/app-orphan') && c[1]?.method === 'PUT')).toBe(true);
    expect(calls.some((c) => c[0].endsWith('/access/apps') && c[1]?.method === 'POST')).toBe(false);
    expect(out.providerMetadata).toMatchObject({ accessAppId: 'app-orphan', accessProtected: true });
  });

  it('still refuses an app with a foreign name even when it claims the same Worker', async () => {
    const { fn } = accessFetch({
      accessList: {
        success: true,
        result: [{ id: 'app-theirs', name: 'my-site (Corp SSO)', destinations: [{ type: 'worker', worker_id: 'tag-abc-123' }] }],
      },
    });
    vi.stubGlobal('fetch', fn);
    await expect(
      deployToCloudflareWorkers({ ...base, access: { enabled: true, rule: { kind: 'emails', emails: ['a@b.c'] } } }),
    ).rejects.toMatchObject({ code: 'CFW_ACCESS_APP_FOREIGN' });
  });

  it('retries the Access perimeter check before declaring the deploy unverified', async () => {
    let heads = 0;
    const { calls, fn } = accessFetch({
      // A hostname whose certificate/route is still propagating answers 404
      // once, then challenges with the Access login as expected.
      head: () => (heads++ === 0 ? new Response('', { status: 404 }) : accessRedirect()),
    });
    vi.stubGlobal('fetch', fn);
    const out = await deployToCloudflareWorkers({
      ...base,
      access: { enabled: true, rule: { kind: 'emails', emails: ['a@b.c'] } },
    });
    expect(out.providerMetadata).toMatchObject({ accessVerified: true });
    expect(calls.filter((c) => c[1]?.method === 'HEAD').length).toBe(2);
  });

  it('annotates a failure after the Access app was created with the app id, so the route can record it', async () => {
    const { fn } = accessFetch();
    const wrapped = vi.fn(async (url: string, init?: RequestInit) => {
      if ((init?.method || 'GET').toUpperCase() === 'POST' && url.endsWith('/workers/scripts/my-site/subdomain')) {
        return jsonResponse({ success: false, errors: [{ message: 'workers.dev enable unavailable' }] }, 500);
      }
      return fn(url, init);
    });
    vi.stubGlobal('fetch', wrapped);
    let caught: { code?: string; steps?: Array<{ name: string; status: string; detail?: string }> } | undefined;
    try {
      await deployToCloudflareWorkers({ ...base, access: { enabled: true, rule: { kind: 'emails', emails: ['a@b.c'] } } });
    } catch (err) {
      caught = err as typeof caught;
    }
    expect(caught).toBeTruthy();
    expect(caught?.steps).toContainEqual({ name: 'access-app', status: 'done', detail: 'app-123' });
  });

  it('turning access off retains a prior app that no longer references this Worker', async () => {
    const { calls, fn } = accessFetch({
      accessGet: { success: true, result: { id: 'app-old', destinations: [{ type: 'worker', worker_id: 'tag-OLD' }] } },
    });
    vi.stubGlobal('fetch', fn);
    await deployToCloudflareWorkers({ ...base, access: { enabled: false }, priorAccessAppId: 'app-old' });
    expect(calls.some((c) => c[0].includes('/access/apps/') && c[1]?.method === 'DELETE')).toBe(false);
  });

  it('a preview deploy with Access off never deletes the production Access app', async () => {
    const { calls, fn } = accessFetch();
    const wrapped = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/versions')) return jsonResponse({ success: true, result: { id: 'v12345678' } });
      return fn(url, init);
    });
    vi.stubGlobal('fetch', wrapped);
    await deployToCloudflareWorkers({ ...base, target: 'preview', access: { enabled: false }, priorAccessAppId: 'app-123' });
    expect(calls.some((c) => c[0].includes('/access/apps/') && c[1]?.method === 'DELETE')).toBe(false);
  });

  it('fails closed when the OTP identity provider cannot be created', async () => {
    const { calls, fn } = accessFetch({
      idps: { success: true, result: [] },
      idpCreate: { success: false, errors: [{ code: 1010, error: 'auth.forbidden' }] },
    });
    vi.stubGlobal('fetch', fn);
    await expect(
      deployToCloudflareWorkers({ ...base, access: { enabled: true, rule: { kind: 'emails', emails: ['a@b.c'] } } }),
    ).rejects.toMatchObject({ name: 'DeployError', code: 'CFW_ACCESS_OTP_SCOPE_REQUIRED' });
    expect(calls.some((c) => c[0].includes('/subdomain') && c[1]?.method === 'POST')).toBe(false);
  });

  it('an Access create failure makes zero exposure calls', async () => {
    const { calls, fn } = accessFetch({
      accessCreate: { success: false, errors: [{ code: 10000, message: 'no permission' }] },
    });
    vi.stubGlobal('fetch', fn);
    await expect(
      deployToCloudflareWorkers({ ...base, access: { enabled: true, rule: { kind: 'self' } } }),
    ).rejects.toBeTruthy();
    expect(calls.some((c) => c[0].includes('/subdomain') && c[1]?.method === 'POST')).toBe(false);
  });

  it('turning access off deletes only the recorded app id', async () => {
    const { calls, fn } = accessFetch();
    vi.stubGlobal('fetch', fn);
    await deployToCloudflareWorkers({ ...base, access: { enabled: false }, priorAccessAppId: 'app-123' });
    const deletes = calls.filter((c) => c[0].includes('/access/apps/') && c[1]?.method === 'DELETE');
    expect(deletes).toHaveLength(1);
    expect(deletes[0]![0]).toContain('/access/apps/app-123');
    expect(calls.some((c) => c[0].endsWith('/access/apps') && c[1]?.method === 'POST')).toBe(false);
  });

  it('does not touch Access when disabled and no prior app', async () => {
    const { calls, fn } = accessFetch();
    vi.stubGlobal('fetch', fn);
    await deployToCloudflareWorkers(base);
    expect(calls.some((c) => c[0].includes('/access/apps'))).toBe(false);
  });
});

describe('probeCloudflareWorkersCapabilities access', () => {
  function probeFetch(accessCode: number) {
    const fn = vi.fn(async (url: string) => {
      if (url.includes('/access/apps')) return jsonResponse({ success: false, errors: [{ code: accessCode }] }, 403);
      if (url.includes('/workers/scripts')) return jsonResponse({ success: true, result: [] });
      if (url.includes('/workers/subdomain')) return jsonResponse({ success: true, result: { subdomain: 'acct-test' } });
      if (url.includes('/r2/buckets')) return jsonResponse({ success: false, errors: [{ code: 10042 }] }, 403);
      if (url.includes('/d1/database')) return jsonResponse({ success: false, errors: [{ code: 10000 }] }, 401);
      return jsonResponse({ success: false, errors: [{ code: 10000 }] }, 403);
    });
    return fn;
  }

  it('labels access-not-enabled vs no-permission', async () => {
    vi.stubGlobal('fetch', probeFetch(9999));
    let caps = await probeCloudflareWorkersCapabilities({ token: 'tok', accountId: 'acct_test' });
    expect(caps.access).toBe(false);
    expect(caps.accessReason).toBe('access-not-enabled');

    vi.stubGlobal('fetch', probeFetch(10000));
    caps = await probeCloudflareWorkersCapabilities({ token: 'tok', accountId: 'acct_test' });
    expect(caps.access).toBe(false);
    expect(caps.accessReason).toBe('no-permission');
  });
});

describe('cloudflare access check-link classification', () => {
  it('classifies an Access login redirect as protected', async () => {
    const fn = vi.fn(async () => new Response('', { status: 302, headers: { location: 'https://acct-test.cloudflareaccess.com/cdn-cgi/access/login' } }));
    vi.stubGlobal('fetch', fn);
    const result = await checkDeploymentUrl('https://my-site.acct-test.workers.dev');
    expect(result.reachable).toBe(false);
    expect(result.status).toBe('protected');
  });

  it('classifies a connection failure as unreachable, not protected', async () => {
    const fn = vi.fn(async () => { throw new Error('ECONNREFUSED'); });
    vi.stubGlobal('fetch', fn);
    const result = await checkDeploymentUrl('https://my-site.acct-test.workers.dev');
    expect(result.reachable).toBe(false);
    expect(result.status).toBeUndefined();
  });

  it('recognizes the Access login page body', () => {
    const resp = new Response('<html>Cloudflare Access</html>', { status: 401 });
    expect(isCloudflareAccessProtectedResponse(resp, '<html>Cloudflare Access login</html>')).toBe(true);
    expect(isCloudflareAccessProtectedResponse(new Response('ok'), 'plain page')).toBe(false);
  });
});
