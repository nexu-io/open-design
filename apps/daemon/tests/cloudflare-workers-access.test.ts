import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkDeploymentUrl, cloudflareOAuthTokensDir, configureCloudflareWorkersDataDir, isCloudflareAccessProtectedResponse, readCloudflareWorkersConfig, writeCloudflareWorkersConfig } from '../src/deploy.js';
import { setCloudflareOAuthToken } from '../src/integrations/cloudflare-tokens.js';
import {
  CLOUDFLARE_ACCESS_PERIMETER_RETRY_DEFAULTS,
  configureCloudflareAccessPerimeterRetry,
  deployToCloudflareWorkers,
  ownedCustomDomainsFromMetadata,
  pendingCustomDomainsFromMetadata,
  probeCloudflareWorkersCapabilities,
  vouchedCustomDomains,
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

// The real perimeter probe budget waits several seconds before it declares a
// URL unverified; the suites below assert that path and must not wait it out.
beforeEach(() => configureCloudflareAccessPerimeterRetry({ attempts: 2, baseMs: 1 }));
afterEach(() => configureCloudflareAccessPerimeterRetry());

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

  it('a `policy` rule references the policy by id and does not pin the app to the OTP identity provider', async () => {
    const { calls, fn } = accessFetch();
    vi.stubGlobal('fetch', fn);
    const out = await deployToCloudflareWorkers({
      ...base,
      access: { enabled: true, rule: { kind: 'policy', policyId: 'pol-corp-sso' } },
    });
    const createCall = calls.find((c) => c[0].endsWith('/access/apps') && c[1]?.method === 'POST');
    expect(createCall).toBeTruthy();
    const createBody = JSON.parse(createCall![1]?.body as string) as Record<string, unknown>;
    expect(createBody.policies).toEqual([{ id: 'pol-corp-sso', precedence: 1 }]);
    // The referenced policy may carry its own SSO IdPs: no allowed_idps, and no
    // OTP provider lookup or creation at all.
    expect(createBody).not.toHaveProperty('allowed_idps');
    expect(calls.some((c) => c[0].includes('/access/identity_providers'))).toBe(false);
    expect(out.providerMetadata).toMatchObject({ accessAppId: 'app-123' });
  });

  it('finds the app that claims the Worker on a later page of the Access apps list', async () => {
    const { calls, fn } = accessFetch({ accessUpdate: { success: true, result: { id: 'app-page2' } } });
    // Page 1 is full (100 unrelated apps, no result_info) so the lookup must
    // keep paging; the OpenDesign-owned app for this Worker sits on page 2.
    const filler = Array.from({ length: 100 }, (_, i) => ({
      id: 'other-' + i,
      name: 'Other ' + i,
      destinations: [{ type: 'worker', worker_id: 'tag-other-' + i }],
    }));
    const ours = {
      id: 'app-page2',
      name: 'my-site (OpenDesign)',
      destinations: [{ type: 'worker', worker_id: 'tag-abc-123' }],
    };
    const paged = vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method || 'GET').toUpperCase();
      if (method === 'GET' && /\/access\/apps\?page=\d+/.test(url)) {
        calls.push([url, init]);
        const page = Number(new URL(url).searchParams.get('page'));
        if (page === 1) return jsonResponse({ success: true, result: filler });
        if (page === 2) return jsonResponse({ success: true, result: [ours] });
        return jsonResponse({ success: true, result: [] });
      }
      return fn(url, init);
    });
    vi.stubGlobal('fetch', paged);
    const out = await deployToCloudflareWorkers({
      ...base,
      access: { enabled: true, rule: { kind: 'emails', emails: ['a@b.c'] } },
    });
    expect(calls.some((c) => c[0].includes('/access/apps?page=2'))).toBe(true);
    // Updated in place — no duplicate create for a Worker that is already claimed.
    expect(calls.some((c) => c[0].includes('/access/apps/app-page2') && c[1]?.method === 'PUT')).toBe(true);
    expect(calls.some((c) => c[0].endsWith('/access/apps') && c[1]?.method === 'POST')).toBe(false);
    expect(out.providerMetadata).toMatchObject({ accessAppId: 'app-page2' });
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

  it('claims the custom hostname on the Access app BEFORE attaching it, so the hostname is never live and uncovered', async () => {
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
    // A `public` destination on a hostname not yet routed to the Worker is
    // inert, so the pre-PUT app already claims the configured hostname …
    const createBody = JSON.parse(calls[createPos]![1]?.body as string) as { destinations: unknown[] };
    expect(createBody.destinations).toContainEqual({ type: 'public', uri: 'app.example.com' });
    // … and no covering PUT is needed after the attach: there is no window.
    expect(calls.some((c) => c[0].endsWith('/access/apps/app-123') && c[1]?.method === 'PUT')).toBe(false);
    const heads = calls.filter((c) => c[1]?.method === 'HEAD').map((c) => c[0]);
    expect(heads).toContain('https://my-site.acct-test.workers.dev');
    expect(heads).toContain('https://app.example.com');
    expect(out.providerMetadata).toMatchObject({
      accessVerified: true,
      customDomain: { id: 'dom-1', hostname: 'app.example.com' },
      ownedCustomDomains: [{ id: 'dom-1', hostname: 'app.example.com' }],
    });
  });

  it('covers every hostname routed to the script, detaches only the OWNED one the config dropped, and keeps a dashboard-attached hostname routed and covered', async () => {
    // dom-old was attached by a previous OpenDesign deploy (recorded on its
    // providerMetadata) and the config now names app.example.com: stale, detach.
    // dom-dash was attached in the Cloudflare dashboard to THIS script: foreign,
    // never detached, but it serves the Worker so it stays inside Access.
    // dom-other belongs to a different script and is returned only if
    // Cloudflare ignores the `service` filter — it must never be touched.
    const { calls, fn } = accessFetch({
      domainsList: {
        success: true,
        result: [
          { id: 'dom-old', hostname: 'Old.Example.com', service: 'my-site', zone_id: 'zone-1' },
          { id: 'dom-dash', hostname: 'dash.example.com', service: 'my-site', zone_id: 'zone-1' },
          { id: 'dom-other', hostname: 'other.example.com', service: 'other-script', zone_id: 'zone-1' },
        ],
      },
    });
    vi.stubGlobal('fetch', fn);
    const out = await deployToCloudflareWorkers({
      ...base,
      access: { enabled: true, rule: { kind: 'emails', emails: ['a@b.c'] } },
      customDomain: { hostname: 'app.example.com', zoneId: 'zone-1' },
      priorOwnedCustomDomains: [{ id: 'dom-old', hostname: 'old.example.com' }],
    });
    const listPos = calls.findIndex((c) => c[0].includes('/workers/domains?service=my-site') && (c[1]?.method || 'GET') === 'GET');
    const uploadPos = calls.findIndex((c) => c[0].includes('assets-upload-session'));
    const createPos = calls.findIndex((c) => c[0].endsWith('/access/apps') && c[1]?.method === 'POST');
    const attachPos = calls.findIndex((c) => c[0].includes('/workers/domains') && c[1]?.method === 'PUT');
    const detachPos = calls.findIndex((c) => c[0].endsWith('/workers/domains/dom-old') && c[1]?.method === 'DELETE');
    // Routed hostnames are known before anything is uploaded.
    expect(listPos).toBeGreaterThanOrEqual(0);
    expect(listPos).toBeLessThan(uploadPos);
    // The pre-PUT app covers everything routed (normalized) AND the configured
    // hostname; the foreign script's hostname is never ours.
    const createBody = JSON.parse(calls[createPos]![1]?.body as string) as { destinations: unknown[] };
    expect(createBody.destinations).toContainEqual({ type: 'public', uri: 'old.example.com' });
    expect(createBody.destinations).toContainEqual({ type: 'public', uri: 'dash.example.com' });
    expect(createBody.destinations).toContainEqual({ type: 'public', uri: 'app.example.com' });
    expect(createBody.destinations).not.toContainEqual({ type: 'public', uri: 'other.example.com' });
    // Exactly one PUT: the post-detach reconcile. No covering PUT after the
    // attach (the hostname was claimed up front).
    const accessPuts = calls
      .map((c, index) => ({ index, call: c }))
      .filter(({ call }) => call[0].endsWith('/access/apps/app-123') && call[1]?.method === 'PUT');
    expect(accessPuts).toHaveLength(1);
    const finalPut = accessPuts[0]!;
    expect(detachPos).toBeGreaterThan(attachPos);
    expect(finalPut.index).toBeGreaterThan(detachPos);
    const finalBody = JSON.parse(finalPut.call[1]?.body as string) as { destinations: unknown[] };
    expect(finalBody.destinations).toContainEqual({ type: 'public', uri: 'app.example.com' });
    expect(finalBody.destinations).toContainEqual({ type: 'public', uri: 'dash.example.com' });
    expect(finalBody.destinations).not.toContainEqual({ type: 'public', uri: 'old.example.com' });
    // Only the owned stale hostname is detached.
    expect(calls.filter((c) => c[1]?.method === 'DELETE' && c[0].includes('/workers/domains/')).map((c) => c[0])).toEqual([
      expect.stringContaining('/workers/domains/dom-old'),
    ]);
    const steps = (out.providerMetadata?.steps ?? []) as { name: string; detail?: string }[];
    expect(steps).toContainEqual({ name: 'custom-domain-detach', status: 'done', detail: 'old.example.com' });
    expect(out.providerMetadata).toMatchObject({
      accessVerified: true,
      ownedCustomDomains: [{ id: 'dom-1', hostname: 'app.example.com' }],
    });
  });

  it('matches an owned hostname by id when the record has one, and by hostname when it does not', async () => {
    const { calls, fn } = accessFetch({
      domainsList: {
        success: true,
        result: [
          { id: 'dom-by-id', hostname: 'renamed.example.com', service: 'my-site', zone_id: 'zone-1' },
          { id: 'dom-by-host', hostname: 'legacy.example.com', service: 'my-site', zone_id: 'zone-1' },
          { id: 'dom-dash', hostname: 'dash.example.com', service: 'my-site', zone_id: 'zone-1' },
        ],
      },
    });
    vi.stubGlobal('fetch', fn);
    await deployToCloudflareWorkers({
      ...base,
      priorOwnedCustomDomains: [
        // Same id, hostname since changed on Cloudflare: still ours.
        { id: 'dom-by-id', hostname: 'was.example.com' },
        // A record written before the attach response carried an id.
        { hostname: 'legacy.example.com' },
      ],
    });
    expect(calls.filter((c) => c[1]?.method === 'DELETE' && c[0].includes('/workers/domains/')).map((c) => c[0]).sort()).toEqual([
      expect.stringContaining('/workers/domains/dom-by-host'),
      expect.stringContaining('/workers/domains/dom-by-id'),
    ]);
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
      priorOwnedCustomDomains: [{ id: 'dom-1', hostname: 'app.example.com' }],
    });
    // The pre-PUT app already covers the configured hostname; a steady-state
    // redeploy must not churn an extra PUT.
    expect(calls.some((c) => c[0].endsWith('/access/apps') && c[1]?.method === 'POST')).toBe(true);
    expect(calls.some((c) => c[0].endsWith('/access/apps/app-123') && c[1]?.method === 'PUT')).toBe(false);
  });

  it('drops only the stale owned hostname when the configured hostname is already attached', async () => {
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
      priorOwnedCustomDomains: [
        { id: 'dom-1', hostname: 'app.example.com' },
        { id: 'dom-old', hostname: 'old.example.com' },
      ],
    });
    const detachPos = calls.findIndex((c) => c[0].endsWith('/workers/domains/dom-old') && c[1]?.method === 'DELETE');
    const puts = calls
      .map((c, index) => ({ index, call: c }))
      .filter(({ call }) => call[0].endsWith('/access/apps/app-123') && call[1]?.method === 'PUT');
    // One PUT only: the post-detach reconcile dropping the stale hostname.
    expect(puts).toHaveLength(1);
    expect(puts[0]!.index).toBeGreaterThan(detachPos);
    const finalBody = JSON.parse(puts[0]!.call[1]?.body as string) as { destinations: unknown[] };
    expect(finalBody.destinations).toContainEqual({ type: 'public', uri: 'app.example.com' });
    expect(finalBody.destinations).not.toContainEqual({ type: 'public', uri: 'old.example.com' });
  });

  it('drops the configured hostname from the Access app again when the attach fails (compensation) and surfaces the attach error', async () => {
    const { calls, fn } = accessFetch({
      domains: { success: false, errors: [{ message: 'attach denied' }] },
    });
    vi.stubGlobal('fetch', fn);
    await expect(
      deployToCloudflareWorkers({
        ...base,
        access: { enabled: true, rule: { kind: 'emails', emails: ['a@b.c'] } },
        customDomain: { hostname: 'app.example.com', zoneId: 'zone-1' },
      }),
    ).rejects.toThrow(/attach denied/);
    const createPos = calls.findIndex((c) => c[0].endsWith('/access/apps') && c[1]?.method === 'POST');
    const attachPos = calls.findIndex((c) => c[0].includes('/workers/domains') && c[1]?.method === 'PUT');
    const compensationPos = calls.findIndex((c) => c[0].endsWith('/access/apps/app-123') && c[1]?.method === 'PUT');
    expect(attachPos).toBeGreaterThan(createPos);
    expect(compensationPos).toBeGreaterThan(attachPos);
    const compensationBody = JSON.parse(calls[compensationPos]![1]?.body as string) as { destinations: unknown[] };
    expect(compensationBody.destinations).not.toContainEqual({ type: 'public', uri: 'app.example.com' });
    expect(compensationBody.destinations).toContainEqual({ type: 'worker', worker_id: 'tag-abc-123' });
    // Nothing was attached, so nothing is detached.
    expect(calls.some((c) => c[1]?.method === 'DELETE' && c[0].includes('/workers/domains/'))).toBe(false);
  });

  it('still surfaces the attach error when the compensation PUT itself fails', async () => {
    const { calls, fn } = accessFetch({
      domains: { success: false, errors: [{ message: 'attach denied' }] },
      accessUpdate: { success: false, errors: [{ message: 'cover denied' }] },
    });
    vi.stubGlobal('fetch', fn);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      deployToCloudflareWorkers({
        ...base,
        access: { enabled: true, rule: { kind: 'emails', emails: ['a@b.c'] } },
        customDomain: { hostname: 'app.example.com', zoneId: 'zone-1' },
      }),
    ).rejects.toThrow(/attach denied/);
    expect(calls.some((c) => c[0].endsWith('/access/apps/app-123') && c[1]?.method === 'PUT')).toBe(true);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('could not drop "app.example.com"'));
  });

  it('keeps an already-routed configured hostname on the Access app when its re-attach fails', async () => {
    const { calls, fn } = accessFetch({
      domainsList: {
        success: true,
        result: [{ id: 'dom-1', hostname: 'app.example.com', service: 'my-site', zone_id: 'zone-1' }],
      },
      domains: { success: false, errors: [{ message: 'attach denied' }] },
    });
    vi.stubGlobal('fetch', fn);
    await expect(
      deployToCloudflareWorkers({
        ...base,
        access: { enabled: true, rule: { kind: 'emails', emails: ['a@b.c'] } },
        customDomain: { hostname: 'app.example.com', zoneId: 'zone-1' },
        priorOwnedCustomDomains: [{ id: 'dom-1', hostname: 'app.example.com' }],
      }),
    ).rejects.toThrow(/attach denied/);
    // The hostname still serves the Worker: dropping it would expose it.
    expect(calls.some((c) => c[0].endsWith('/access/apps/app-123') && c[1]?.method === 'PUT')).toBe(false);
  });

  it('reports the hostname it attached on the error when the deploy fails afterwards, so the route can record it as owned', async () => {
    const { calls, fn } = accessFetch({
      domainsList: { success: true, result: [{ id: 'dom-old', hostname: 'old.example.com', service: 'my-site' }] },
      domainsDelete: { success: false, errors: [{ message: 'detach denied' }] },
    });
    vi.stubGlobal('fetch', fn);
    // The configured hostname attaches (dom-1); the stale owned hostname's
    // detach then fails. The attach already happened: Cloudflare routes
    // app.example.com to the script, and only the error can say we did that.
    await expect(
      deployToCloudflareWorkers({
        ...base,
        customDomain: { hostname: 'app.example.com', zoneId: 'zone-1' },
        priorOwnedCustomDomains: [{ id: 'dom-old', hostname: 'old.example.com' }],
      }),
    ).rejects.toMatchObject({
      message: 'detach denied',
      attachedCustomDomains: [{ id: 'dom-1', hostname: 'app.example.com' }],
    });
    expect(calls.some((c) => c[0].endsWith('/workers/domains') && c[1]?.method === 'PUT')).toBe(true);
  });

  it('reports no attached hostname when the deploy fails before or at the attach', async () => {
    const { fn } = accessFetch({ domains: { success: false, errors: [{ message: 'attach denied' }] } });
    vi.stubGlobal('fetch', fn);
    await expect(
      deployToCloudflareWorkers({ ...base, customDomain: { hostname: 'app.example.com', zoneId: 'zone-1' } }),
    ).rejects.toMatchObject({ message: 'attach denied', attachedCustomDomains: [] });
  });

  it('reports the stale owned hostnames it detached when the deploy fails afterwards, and not the one it could not', async () => {
    const inner = accessFetch({
      domainsList: {
        success: true,
        result: [
          { id: 'dom-a', hostname: 'a.example.com', service: 'my-site' },
          { id: 'dom-b', hostname: 'b.example.com', service: 'my-site' },
        ],
      },
    });
    const fn = vi.fn(async (url: string, init?: RequestInit) => {
      if ((init?.method || 'GET').toUpperCase() === 'DELETE' && url.endsWith('/workers/domains/dom-b')) {
        inner.calls.push([url, init]);
        return jsonResponse({ success: false, errors: [{ message: 'detach denied' }] });
      }
      return inner.fn(url, init);
    });
    vi.stubGlobal('fetch', fn);
    // a.example.com IS detached, then b.example.com's detach fails: only the
    // first is gone from Cloudflare, so only the first must stop being vouched for.
    await expect(
      deployToCloudflareWorkers({
        ...base,
        priorOwnedCustomDomains: [{ id: 'dom-a', hostname: 'a.example.com' }, { id: 'dom-b', hostname: 'b.example.com' }],
      }),
    ).rejects.toMatchObject({
      message: 'detach denied',
      detachedCustomDomains: [{ id: 'dom-a', hostname: 'a.example.com' }],
    });
    expect(inner.calls.some((c) => c[0].endsWith('/workers/domains/dom-a') && c[1]?.method === 'DELETE')).toBe(true);
  });

  it('awaits onBeforeAttach with the configured hostname before the attach call goes out', async () => {
    const { calls, fn } = accessFetch();
    vi.stubGlobal('fetch', fn);
    const attachPuts = () => calls.filter((c) => c[0].endsWith('/workers/domains') && c[1]?.method === 'PUT').length;
    const seen: Array<{ hostname: string; attachCallsSoFar: number }> = [];
    const out = await deployToCloudflareWorkers({
      ...base,
      customDomain: { hostname: 'app.example.com', zoneId: 'zone-1' },
      onBeforeAttach: async (hostname) => {
        seen.push({ hostname, attachCallsSoFar: attachPuts() });
      },
    });
    expect(seen).toEqual([{ hostname: 'app.example.com', attachCallsSoFar: 0 }]);
    expect(attachPuts()).toBe(1);
    expect(out.providerMetadata?.ownedCustomDomains).toEqual([{ id: 'dom-1', hostname: 'app.example.com' }]);
  });

  it('a throwing onBeforeAttach aborts the deploy before any attach call', async () => {
    const { calls, fn } = accessFetch();
    vi.stubGlobal('fetch', fn);
    await expect(
      deployToCloudflareWorkers({
        ...base,
        customDomain: { hostname: 'app.example.com', zoneId: 'zone-1' },
        onBeforeAttach: () => {
          throw new Error('write-ahead failed');
        },
      }),
    ).rejects.toMatchObject({ message: 'write-ahead failed', attachedCustomDomains: [] });
    expect(calls.some((c) => c[0].endsWith('/workers/domains') && c[1]?.method === 'PUT')).toBe(false);
  });

  it('treats a hostname a prior deploy wrote ahead of its attach as owned, by hostname', async () => {
    const { calls, fn } = accessFetch({
      domainsList: { success: true, result: [{ id: 'dom-p', hostname: 'pending.example.com', service: 'my-site' }] },
    });
    vi.stubGlobal('fetch', fn);
    // No record OWNS pending.example.com (the deploy that attached it never
    // wrote its record), but one wrote it ahead of the attach: reconcile it.
    const out = await deployToCloudflareWorkers({ ...base, priorPendingCustomDomains: ['pending.example.com'] });
    expect(calls.some((c) => c[0].endsWith('/workers/domains/dom-p') && c[1]?.method === 'DELETE')).toBe(true);
    expect(out.status).toBe('ready');
    expect(out.providerMetadata?.ownedCustomDomains).toEqual([]);
    expect(out.providerMetadata?.pendingCustomDomains).toBeUndefined();
  });

  it('a preview deploy carries pending write-ahead hostnames forward without promoting them to owned', async () => {
    const { fn } = accessFetch();
    vi.stubGlobal('fetch', fn);
    const out = await deployToCloudflareWorkers({
      ...base,
      target: 'preview',
      access: { enabled: false },
      priorOwnedCustomDomains: [{ id: 'dom-1', hostname: 'app.example.com' }],
      priorPendingCustomDomains: ['pending.example.com'],
    });
    expect(out.providerMetadata?.ownedCustomDomains).toEqual([{ id: 'dom-1', hostname: 'app.example.com' }]);
    expect(out.providerMetadata?.pendingCustomDomains).toEqual([{ hostname: 'pending.example.com' }]);
  });

  it('pendingCustomDomainsFromMetadata + vouchedCustomDomains: pending hostnames are vouched for by hostname, never duplicated over owned', () => {
    expect(pendingCustomDomainsFromMetadata({ pendingCustomDomains: [{ hostname: 'P.example.com' }, { hostname: 'p.example.com' }, { id: 'x' }, 'junk'] })).toEqual(['p.example.com']);
    expect(pendingCustomDomainsFromMetadata({ pendingCustomDomains: 'nope' })).toEqual([]);
    expect(pendingCustomDomainsFromMetadata(null)).toEqual([]);
    expect(vouchedCustomDomains([{ id: 'dom-1', hostname: 'app.example.com' }], ['app.example.com', 'p.example.com'])).toEqual([
      { id: 'dom-1', hostname: 'app.example.com' },
      { hostname: 'p.example.com' },
    ]);
  });

  it('detaches a dropped OWNED hostname even with Access off and no custom domain configured', async () => {
    const { calls, fn } = accessFetch({
      domainsList: { success: true, result: [{ id: 'dom-old', hostname: 'old.example.com', service: 'my-site' }] },
    });
    vi.stubGlobal('fetch', fn);
    const out = await deployToCloudflareWorkers({ ...base, priorOwnedCustomDomains: [{ id: 'dom-old', hostname: 'old.example.com' }] });
    expect(calls.some((c) => c[0].endsWith('/workers/domains/dom-old') && c[1]?.method === 'DELETE')).toBe(true);
    expect(out.status).toBe('ready');
    const steps = (out.providerMetadata?.steps ?? []) as { name: string }[];
    expect(steps.map((s) => s.name)).toContain('custom-domain-detach');
    expect(out.providerMetadata?.ownedCustomDomains).toEqual([]);
  });

  it('leaves a dashboard-attached hostname alone when no prior deploy recorded it', async () => {
    const { calls, fn } = accessFetch({
      domainsList: { success: true, result: [{ id: 'dom-dash', hostname: 'dash.example.com', service: 'my-site' }] },
    });
    vi.stubGlobal('fetch', fn);
    const out = await deployToCloudflareWorkers({ ...base });
    expect(calls.some((c) => c[1]?.method === 'DELETE' && c[0].includes('/workers/domains/'))).toBe(false);
    expect(out.status).toBe('ready');
    expect(out.providerMetadata?.ownedCustomDomains).toEqual([]);
  });

  it('never reports ready while an owned routed hostname could not be detached', async () => {
    const { fn } = accessFetch({
      domainsList: { success: true, result: [{ id: 'dom-old', hostname: 'old.example.com', service: 'my-site' }] },
      domainsDelete: { success: false, errors: [{ message: 'detach denied' }] },
    });
    vi.stubGlobal('fetch', fn);
    await expect(
      deployToCloudflareWorkers({
        ...base,
        access: { enabled: true, rule: { kind: 'emails', emails: ['a@b.c'] } },
        priorOwnedCustomDomains: [{ id: 'dom-old', hostname: 'old.example.com' }],
      }),
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

  it('withdraws the exposure this run created when the perimeter cannot be verified', async () => {
    const { calls, fn } = accessFetch({ head: () => new Response('', { status: 200 }) });
    const wrapped = vi.fn(async (url: string, init?: RequestInit) => {
      if ((init?.method || 'GET').toUpperCase() === 'GET' && url.endsWith('/workers/scripts/my-site/subdomain')) {
        calls.push([url, init]);
        // The route was OFF before this run: this run's enable is the exposure.
        return jsonResponse({ success: true, result: { enabled: false, previews_enabled: false } });
      }
      return fn(url, init);
    });
    vi.stubGlobal('fetch', wrapped);
    let caught: { name?: string; code?: string; attachedCustomDomains?: unknown; steps?: Array<{ name: string; status: string; detail?: string }> } | undefined;
    try {
      await deployToCloudflareWorkers({
        ...base,
        access: { enabled: true, rule: { kind: 'emails', emails: ['a@b.c'] } },
        customDomain: { hostname: 'app.example.com', zoneId: 'zone-1' },
      });
    } catch (err) {
      caught = err as typeof caught;
    }
    expect(caught).toMatchObject({ name: 'DeployError', code: 'CFW_ACCESS_UNVERIFIED' });
    const subdomainPosts = calls
      .filter((c) => c[0].endsWith('/workers/scripts/my-site/subdomain') && c[1]?.method === 'POST')
      .map((c) => JSON.parse(String(c[1]?.body)) as { enabled: boolean });
    expect(subdomainPosts.map((body) => body.enabled)).toEqual([true, false]);
    expect(calls.some((c) => c[1]?.method === 'DELETE' && c[0].endsWith('/workers/domains/dom-1'))).toBe(true);
    // Compensation runs only after the probes gave up, never before.
    const lastProbe = calls.reduce((last, c, index) => (c[1]?.method === 'HEAD' ? index : last), -1);
    const disablePos = calls.findIndex((c) => c[1]?.method === 'POST' && c[0].endsWith('/subdomain') && (JSON.parse(String(c[1]?.body)) as { enabled: boolean }).enabled === false);
    const detachPos = calls.findIndex((c) => c[1]?.method === 'DELETE' && c[0].endsWith('/workers/domains/dom-1'));
    expect(lastProbe).toBeGreaterThanOrEqual(0);
    expect(disablePos).toBeGreaterThan(lastProbe);
    expect(detachPos).toBeGreaterThan(lastProbe);
    // The detached hostname is no longer reported as this deploy's attachment,
    // so the route does not record an attachment that no longer exists.
    expect(caught?.attachedCustomDomains).toEqual([]);
    expect(caught?.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'subdomain-disable', status: 'done' }),
      expect.objectContaining({ name: 'custom-domain-detach', status: 'done', detail: 'app.example.com' }),
    ]));
  });

  it('leaves a workers.dev route that was already public alone when the perimeter cannot be verified', async () => {
    const { calls, fn } = accessFetch({ head: () => new Response('', { status: 200 }) });
    const wrapped = vi.fn(async (url: string, init?: RequestInit) => {
      if ((init?.method || 'GET').toUpperCase() === 'GET' && url.endsWith('/workers/scripts/my-site/subdomain')) {
        calls.push([url, init]);
        return jsonResponse({ success: true, result: { enabled: true, previews_enabled: true } });
      }
      return fn(url, init);
    });
    vi.stubGlobal('fetch', wrapped);
    await expect(
      deployToCloudflareWorkers({ ...base, access: { enabled: true, rule: { kind: 'emails', emails: ['a@b.c'] } } }),
    ).rejects.toMatchObject({ name: 'DeployError', code: 'CFW_ACCESS_UNVERIFIED' });
    const subdomainPosts = calls
      .filter((c) => c[0].endsWith('/workers/scripts/my-site/subdomain') && c[1]?.method === 'POST')
      .map((c) => JSON.parse(String(c[1]?.body)) as { enabled: boolean });
    expect(subdomainPosts.map((body) => body.enabled)).toEqual([true]);
    expect(calls.some((c) => c[1]?.method === 'DELETE' && c[0].includes('/workers/domains/'))).toBe(false);
  });

  it('does not detach a configured hostname that was routed to the script before this run', async () => {
    const { calls, fn } = accessFetch({
      head: () => new Response('', { status: 200 }),
      domainsList: { success: true, result: [{ id: 'dom-1', hostname: 'app.example.com', service: 'my-site' }] },
    });
    vi.stubGlobal('fetch', fn);
    let caught: { name?: string; code?: string; attachedCustomDomains?: unknown } | undefined;
    try {
      await deployToCloudflareWorkers({
        ...base,
        access: { enabled: true, rule: { kind: 'emails', emails: ['a@b.c'] } },
        customDomain: { hostname: 'app.example.com', zoneId: 'zone-1' },
      });
    } catch (err) {
      caught = err as typeof caught;
    }
    expect(caught).toMatchObject({ name: 'DeployError', code: 'CFW_ACCESS_UNVERIFIED' });
    // The hostname was live before this run; withdrawing it is not this run's
    // exposure to undo. It stays attached, and stays reported as attached so
    // the record keeps owning it.
    expect(calls.some((c) => c[1]?.method === 'DELETE' && c[0].includes('/workers/domains/'))).toBe(false);
    expect(caught?.attachedCustomDomains).toEqual([{ id: 'dom-1', hostname: 'app.example.com' }]);
  });

  it('reads the workers.dev state before enabling only when Access is on', async () => {
    const { calls, fn } = accessFetch();
    vi.stubGlobal('fetch', fn);
    await deployToCloudflareWorkers({ ...base, access: { enabled: false } });
    // Access-off deploy must not read the subdomain state first.
    expect(calls.some((c) => (c[1]?.method || 'GET') === 'GET' && c[0].endsWith('/workers/scripts/my-site/subdomain'))).toBe(false);
    const beforeSecond = calls.length;
    await deployToCloudflareWorkers({ ...base, access: { enabled: true, rule: { kind: 'emails', emails: ['a@b.c'] } } });
    // Scope to the Access-on deploy only: the state GET must precede the enable POST.
    const second = calls.slice(beforeSecond);
    const getPos = second.findIndex((c) => (c[1]?.method || 'GET') === 'GET' && c[0].endsWith('/workers/scripts/my-site/subdomain'));
    const postPos = second.findIndex((c) => c[1]?.method === 'POST' && c[0].endsWith('/workers/scripts/my-site/subdomain'));
    expect(getPos).toBeGreaterThanOrEqual(0);
    expect(postPos).toBeGreaterThan(getPos);
  });

  it('keeps probing a URL that is still propagating instead of failing on the first non-Access answer', async () => {
    configureCloudflareAccessPerimeterRetry({ attempts: 4, baseMs: 1 });
    let probes = 0;
    const { calls, fn } = accessFetch({
      head: () => {
        probes += 1;
        return probes < 3 ? new Response('', { status: 404 }) : accessRedirect();
      },
    });
    vi.stubGlobal('fetch', fn);
    const out = await deployToCloudflareWorkers({ ...base, access: { enabled: true, rule: { kind: 'emails', emails: ['a@b.c'] } } });
    expect(out.status).toBe('ready');
    expect(out.providerMetadata).toMatchObject({ accessVerified: true });
    expect(probes).toBe(3);
    expect(calls.some((c) => c[1]?.method === 'DELETE')).toBe(false);
    const subdomainPosts = calls
      .filter((c) => c[0].endsWith('/workers/scripts/my-site/subdomain') && c[1]?.method === 'POST')
      .map((c) => JSON.parse(String(c[1]?.body)) as { enabled: boolean });
    expect(subdomainPosts.map((body) => body.enabled)).toEqual([true]);
  });

  it('ships a probe budget wide enough for a workers.dev name still propagating', () => {
    const { attempts, baseMs, maxDelayMs } = CLOUDFLARE_ACCESS_PERIMETER_RETRY_DEFAULTS;
    let waitedMs = 0;
    for (let attempt = 0; attempt < attempts - 1; attempt += 1) waitedMs += Math.min(maxDelayMs, baseMs * 2 ** attempt);
    expect(attempts).toBeGreaterThanOrEqual(5);
    expect(waitedMs).toBeGreaterThanOrEqual(5000);
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

  it('a preview deploy carries the production custom-domain ownership forward on its record', async () => {
    const { calls, fn } = accessFetch();
    const wrapped = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/versions')) return jsonResponse({ success: true, result: { id: 'v12345678' } });
      return fn(url, init);
    });
    vi.stubGlobal('fetch', wrapped);
    const out = await deployToCloudflareWorkers({
      ...base,
      target: 'preview',
      access: { enabled: false },
      priorAccessAppId: 'app-123',
      priorOwnedCustomDomains: [{ id: 'dom-1', hostname: 'app.example.com' }, { hostname: 'legacy.example.com' }],
      priorCustomDomain: { id: 'dom-1', hostname: 'app.example.com', url: 'https://app.example.com' },
    });
    // The deploy route REPLACES the record's providerMetadata with this object,
    // so anything missing here is gone from the record: the next production
    // deploy would find app.example.com routed to the script but recorded
    // nowhere, classify it foreign, and never detach it.
    expect(out.providerMetadata).toMatchObject({
      accessAppId: 'app-123',
      ownedCustomDomains: [{ id: 'dom-1', hostname: 'app.example.com' }, { hostname: 'legacy.example.com' }],
      customDomain: { id: 'dom-1', hostname: 'app.example.com', url: 'https://app.example.com' },
    });
    expect(ownedCustomDomainsFromMetadata(out.providerMetadata)).toEqual([
      { id: 'dom-1', hostname: 'app.example.com' },
      { hostname: 'legacy.example.com' },
    ]);
    // Carrying ownership forward is bookkeeping only: a preview still never
    // touches custom-domain routing.
    expect(calls.some((c) => c[0].includes('/workers/domains') && c[1]?.method !== 'GET')).toBe(false);
  });

  it('a preview deploy with no prior ownership records an empty owned list and no custom domain', async () => {
    const { fn } = accessFetch();
    const wrapped = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/versions')) return jsonResponse({ success: true, result: { id: 'v12345678' } });
      return fn(url, init);
    });
    vi.stubGlobal('fetch', wrapped);
    const out = await deployToCloudflareWorkers({ ...base, target: 'preview', access: { enabled: false } });
    expect(out.providerMetadata?.ownedCustomDomains).toEqual([]);
    expect(out.providerMetadata).not.toHaveProperty('customDomain');
  });

  function accessFetchWithIdpCreateStatus(status: number) {
    const { calls, fn } = accessFetch({ idps: { success: true, result: [] } });
    const wrapped = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/access/identity_providers') && (init?.method || 'GET').toUpperCase() === 'POST') {
        calls.push([url, init]);
        return jsonResponse({ success: false, errors: [{ code: 1010, message: 'identity provider create failed' }] }, status);
      }
      return fn(url, init);
    });
    return { calls, fn: wrapped };
  }

  it.each([[401], [403]])('fails closed with the scope code when the OTP identity provider create is refused (HTTP %s)', async (status) => {
    const { calls, fn } = accessFetchWithIdpCreateStatus(status);
    vi.stubGlobal('fetch', fn);
    await expect(
      deployToCloudflareWorkers({ ...base, access: { enabled: true, rule: { kind: 'emails', emails: ['a@b.c'] } } }),
    ).rejects.toMatchObject({ name: 'DeployError', code: 'CFW_ACCESS_OTP_SCOPE_REQUIRED', status });
    expect(calls.some((c) => c[0].includes('/subdomain') && c[1]?.method === 'POST')).toBe(false);
  });

  it.each([[500], [429], [400]])('an OTP identity provider create failing with HTTP %s keeps its real status instead of the scope code', async (status) => {
    const { calls, fn } = accessFetchWithIdpCreateStatus(status);
    vi.stubGlobal('fetch', fn);
    let caught: { name?: string; code?: string; status?: number } | undefined;
    try {
      await deployToCloudflareWorkers({ ...base, access: { enabled: true, rule: { kind: 'emails', emails: ['a@b.c'] } } });
    } catch (err) {
      caught = err as { name?: string; code?: string; status?: number };
    }
    expect(caught).toMatchObject({ name: 'DeployError', status });
    expect(caught?.code).not.toBe('CFW_ACCESS_OTP_SCOPE_REQUIRED');
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

  it('keeps the prior app id on the record and pushes an access-app-retire error step when the Access-off delete fails', async () => {
    const { calls, fn } = accessFetch({ accessDelete: { success: false, errors: [{ message: 'delete denied' }] } });
    vi.stubGlobal('fetch', fn);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const out = await deployToCloudflareWorkers({ ...base, access: { enabled: false }, priorAccessAppId: 'app-123' });
    expect(calls.filter((c) => c[0].includes('/access/apps/') && c[1]?.method === 'DELETE')).toHaveLength(1);
    expect(out.status).toBe('ready');
    // The delete did not go through: the app may still exist and its id is the
    // only handle — it must survive on the record for the next retry.
    expect(out.providerMetadata).toMatchObject({ accessAppId: 'app-123', createdByOpenDesign: true });
    expect(out.providerMetadata?.accessProtected).toBeUndefined();
    const steps = (out.providerMetadata?.steps ?? []) as { name: string; status: string; detail?: string }[];
    expect(steps).toContainEqual({ name: 'access-app-retire', status: 'error', detail: expect.stringContaining('app-123') });
    expect(steps.find((s) => s.name === 'access-app-retire')?.detail).toContain('delete denied');
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('could not retire Access app app-123'));
  });

  it('keeps the prior app id when the retire lookup fails before the delete', async () => {
    const { calls, fn } = accessFetch({ accessGet: { success: false, errors: [{ message: 'lookup unavailable' }] } });
    vi.stubGlobal('fetch', fn);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const out = await deployToCloudflareWorkers({ ...base, access: { enabled: false }, priorAccessAppId: 'app-123' });
    expect(calls.some((c) => c[0].includes('/access/apps/') && c[1]?.method === 'DELETE')).toBe(false);
    expect(out.providerMetadata).toMatchObject({ accessAppId: 'app-123', createdByOpenDesign: true });
    const steps = (out.providerMetadata?.steps ?? []) as { name: string; status: string }[];
    expect(steps).toContainEqual(expect.objectContaining({ name: 'access-app-retire', status: 'error' }));
  });

  it('re-resolves the OAuth token before every Cloudflare call, so a token rotated mid-deploy is picked up', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'od-workers-token-rotate-'));
    const prior = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = dir;
    configureCloudflareWorkersDataDir(dir);
    try {
      const record = (accessToken: string) => ({
        accessToken,
        tokenType: 'Bearer',
        expiresAt: Date.now() + 3_600_000,
        generation: 0,
        savedAt: Date.now(),
      });
      await setCloudflareOAuthToken(cloudflareOAuthTokensDir(), record('token-A'));
      await writeCloudflareWorkersConfig({ credentialMode: 'oauth', accountId: 'acct_test', clientId: 'client-abc' });
      const { calls, fn } = accessFetch();
      // A reconnect in this daemon rotates the credential while the assets are
      // being uploaded (the token store is re-read by the provider, not captured).
      const rotating = vi.fn(async (url: string, init?: RequestInit) => {
        const resp = await fn(url, init);
        if (url.includes('assets-upload-session')) {
          await setCloudflareOAuthToken(cloudflareOAuthTokensDir(), record('token-B'));
        }
        return resp;
      });
      vi.stubGlobal('fetch', rotating);
      await deployToCloudflareWorkers({ ...base, config: { token: '', accountId: 'acct_test', credentialMode: 'oauth' } });
      const authOf = (call: Call) => (call[1]?.headers as Record<string, string> | undefined)?.Authorization;
      const session = calls.find((c) => c[0].includes('assets-upload-session'))!;
      const scriptPut = calls.find((c) => c[0].includes('/workers/scripts/') && c[1]?.method === 'PUT')!;
      const subdomainPost = calls.find((c) => c[0].endsWith('/subdomain') && c[1]?.method === 'POST')!;
      expect(authOf(session)).toBe('Bearer token-A');
      expect(authOf(scriptPut)).toBe('Bearer token-B');
      expect(authOf(subdomainPost)).toBe('Bearer token-B');
    } finally {
      process.env.OD_USER_STATE_DIR = prior;
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('a static API token is used as-is for every call', async () => {
    const { calls, fn } = accessFetch();
    vi.stubGlobal('fetch', fn);
    await deployToCloudflareWorkers(base);
    const auths = calls
      .filter((c) => (c[1]?.method || 'GET') !== 'HEAD' && !c[0].includes('/workers/assets/upload'))
      .map((c) => (c[1]?.headers as Record<string, string> | undefined)?.Authorization);
    expect(auths.length).toBeGreaterThan(0);
    expect(new Set(auths)).toEqual(new Set(['Bearer tok-secret']));
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
