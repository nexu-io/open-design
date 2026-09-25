import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  attachCloudflareWorkerDomain,
  cloudflareWorkersAssetHash,
  deployToCloudflareWorkers,
  detachCloudflareWorkerDomain,
  ensureCloudflareD1Database,
  ensureCloudflareR2Bucket,
  listCloudflareZones,
} from '../src/deploy/cloudflare-workers.js';

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

type Call = [string, RequestInit | undefined];

async function metadataOf(call: Call): Promise<Record<string, unknown>> {
  const body = call[1]?.body;
  if (!(body instanceof FormData)) throw new Error('expected FormData body');
  const part = body.get('metadata');
  if (!(part instanceof Blob)) throw new Error('expected metadata Blob');
  return JSON.parse(await part.text()) as Record<string, unknown>;
}

const INDEX = { file: 'index.html', data: Buffer.from('<h1>hi</h1>') };

interface FetchOverrides {
  d1List?: unknown;
  d1Create?: unknown;
  r2List?: unknown;
  r2Create?: unknown;
  zones?: unknown;
  domains?: unknown;
  session?: unknown;
  scriptPut?: unknown;
}

function makeFetch(overrides: FetchOverrides = {}, calls: Call[]) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push([url, init]);
    const method = (init?.method || 'GET').toUpperCase();
    if (method === 'POST' && url.includes('/d1/database')) return jsonResponse(overrides.d1Create ?? { success: true, result: { uuid: 'db-uuid-123' } });
    if (method === 'POST' && url.includes('/r2/buckets')) return jsonResponse(overrides.r2Create ?? { success: true, result: {} });
    if (url.includes('/d1/database')) return jsonResponse(overrides.d1List ?? { success: true, result: [] });
    if (url.includes('/r2/buckets')) return jsonResponse(overrides.r2List ?? { success: true, result: { buckets: [] } });
    if (url.includes('/zones')) return jsonResponse(overrides.zones ?? { success: true, result: [] });
    if (url.includes('/workers/domains')) return jsonResponse(overrides.domains ?? { success: true, result: {} });
    if (url.includes('assets-upload-session')) {
      return jsonResponse(overrides.session ?? { success: true, result: { jwt: 'SESS', buckets: [[cloudflareWorkersAssetHash(INDEX)]] } });
    }
    if (url.includes('/workers/assets/upload')) return jsonResponse({ success: true, result: { jwt: 'COMPLETION' } });
    if (url.includes('/versions')) return jsonResponse({ success: true, result: { id: 'v12345678' } });
    if (url.endsWith('/workers/subdomain')) return jsonResponse({ success: true, result: { subdomain: 'acct-test' } });
    if (url.includes('/subdomain')) return jsonResponse({ success: true, result: { enabled: true } });
    return jsonResponse(overrides.scriptPut ?? { success: true, result: {} });
  });
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ensureCloudflareD1Database', () => {
  it('creates and returns the uuid when the name does not resolve', async () => {
    const calls: Call[] = [];
    const fn = makeFetch({ d1List: { success: true, result: [{ name: 'other', uuid: 'other-uuid' }] } }, calls);
    vi.stubGlobal('fetch', fn);
    const uuid = await ensureCloudflareD1Database({ token: 'tok-secret', accountId: 'acct_test' }, 'my-db');
    expect(uuid).toBe('db-uuid-123');
    const post = calls.find((c) => c[0].includes('/d1/database') && c[1]?.method === 'POST');
    expect(post).toBeTruthy();
    expect(JSON.parse(post![1]!.body as string)).toEqual({ name: 'my-db' });
  });

  it('returns the existing uuid without posting when the name matches', async () => {
    const calls: Call[] = [];
    const fn = makeFetch({ d1List: { success: true, result: [{ name: 'my-db', uuid: 'existing-uuid' }] } }, calls);
    vi.stubGlobal('fetch', fn);
    const uuid = await ensureCloudflareD1Database({ token: 'tok-secret', accountId: 'acct_test' }, 'my-db');
    expect(uuid).toBe('existing-uuid');
    expect(calls.some((c) => c[0].includes('/d1/database') && c[1]?.method === 'POST')).toBe(false);
  });
});

describe('ensureCloudflareR2Bucket', () => {
  it('creates the bucket when the name does not resolve', async () => {
    const calls: Call[] = [];
    const fn = makeFetch({ r2List: { success: true, result: { buckets: [{ name: 'other' }] } } }, calls);
    vi.stubGlobal('fetch', fn);
    const name = await ensureCloudflareR2Bucket({ token: 'tok-secret', accountId: 'acct_test' }, 'my-bucket');
    expect(name).toBe('my-bucket');
    const post = calls.find((c) => c[0].includes('/r2/buckets') && c[1]?.method === 'POST');
    expect(post).toBeTruthy();
    expect(JSON.parse(post![1]!.body as string)).toEqual({ name: 'my-bucket' });
  });

  it('does not post when the bucket already exists', async () => {
    const calls: Call[] = [];
    const fn = makeFetch({ r2List: { success: true, result: { buckets: [{ name: 'my-bucket' }] } } }, calls);
    vi.stubGlobal('fetch', fn);
    const name = await ensureCloudflareR2Bucket({ token: 'tok-secret', accountId: 'acct_test' }, 'my-bucket');
    expect(name).toBe('my-bucket');
    expect(calls.some((c) => c[0].includes('/r2/buckets') && c[1]?.method === 'POST')).toBe(false);
  });
});

describe('deployToCloudflareWorkers ensure-on-bind', () => {
  const base = { config: { token: 'tok-secret', accountId: 'acct_test' }, files: [INDEX], projectName: 'My Site' };

  it('resolves a d1 binding before the script PUT and stamps the id into metadata', async () => {
    const calls: Call[] = [];
    const fn = makeFetch({ d1List: { success: true, result: [] } }, calls);
    vi.stubGlobal('fetch', fn);
    await deployToCloudflareWorkers({ ...base, config: { ...base.config, bindings: [{ type: 'd1', name: 'DB', databaseName: 'my-db' }] } });
    const createIndex = calls.findIndex((c) => c[0].includes('/d1/database') && c[1]?.method === 'POST');
    const putIndex = calls.findIndex((c) => c[1]?.method === 'PUT' && c[0].includes('/workers/scripts/'));
    expect(createIndex).toBeGreaterThanOrEqual(0);
    expect(putIndex).toBeGreaterThanOrEqual(0);
    expect(createIndex).toBeLessThan(putIndex);
    const meta = await metadataOf(calls[putIndex]!);
    expect(meta.bindings).toContainEqual({ type: 'd1', name: 'DB', id: 'db-uuid-123' });
  });

  it('ensures an r2 bucket before the script PUT', async () => {
    const calls: Call[] = [];
    const fn = makeFetch({ r2List: { success: true, result: { buckets: [] } } }, calls);
    vi.stubGlobal('fetch', fn);
    await deployToCloudflareWorkers({ ...base, config: { ...base.config, bindings: [{ type: 'r2_bucket', name: 'BUCKET', bucketName: 'my-bucket' }] } });
    const createIndex = calls.findIndex((c) => c[0].includes('/r2/buckets') && c[1]?.method === 'POST');
    const putIndex = calls.findIndex((c) => c[1]?.method === 'PUT' && c[0].includes('/workers/scripts/'));
    expect(createIndex).toBeGreaterThanOrEqual(0);
    expect(putIndex).toBeGreaterThanOrEqual(0);
    expect(createIndex).toBeLessThan(putIndex);
  });
});

describe('deployToCloudflareWorkers custom domain', () => {
  const base = { config: { token: 'tok-secret', accountId: 'acct_test' }, files: [INDEX], projectName: 'My Site' };
  const customDomain = { hostname: 'app.example.com', zoneId: 'zone-1' };

  it('attaches the domain after the subdomain enable on production and records it', async () => {
    const calls: Call[] = [];
    const fn = makeFetch({}, calls);
    vi.stubGlobal('fetch', fn);
    const out = await deployToCloudflareWorkers({ ...base, customDomain });
    const enableIndex = calls.findIndex((c) => c[1]?.method === 'POST' && c[0].includes('/subdomain'));
    const attachIndex = calls.findIndex((c) => c[1]?.method === 'PUT' && c[0].includes('/workers/domains'));
    expect(enableIndex).toBeGreaterThanOrEqual(0);
    expect(attachIndex).toBeGreaterThanOrEqual(0);
    expect(enableIndex).toBeLessThan(attachIndex);
    const attachCall = calls[attachIndex]!;
    expect(JSON.parse(attachCall[1]!.body as string)).toEqual({
      hostname: 'app.example.com',
      service: 'my-site',
      zone_id: 'zone-1',
      environment: 'production',
    });
    expect(out.providerMetadata?.customDomain).toEqual({ hostname: 'app.example.com', url: 'https://app.example.com' });
  });

  it('does not attach for a preview target', async () => {
    const calls: Call[] = [];
    const fn = makeFetch({}, calls);
    vi.stubGlobal('fetch', fn);
    await deployToCloudflareWorkers({ ...base, customDomain, target: 'preview' });
    expect(calls.some((c) => c[1]?.method === 'PUT' && c[0].includes('/workers/domains'))).toBe(false);
  });

  it('throws a DeployError when the domain attach fails', async () => {
    const calls: Call[] = [];
    const fn = makeFetch({ domains: { success: false, errors: [{ message: 'zone mismatch' }] } }, calls);
    vi.stubGlobal('fetch', fn);
    await expect(deployToCloudflareWorkers({ ...base, customDomain })).rejects.toMatchObject({ name: 'DeployError' });
  });
});

describe('listCloudflareZones', () => {
  it('maps result[] to id/name/status', async () => {
    const calls: Call[] = [];
    const fn = makeFetch({
      zones: { success: true, result: [
        { id: 'z1', name: 'example.com', status: 'active' },
        { id: 'z2', name: 'other.com', status: 'pending' },
      ] },
    }, calls);
    vi.stubGlobal('fetch', fn);
    const zones = await listCloudflareZones({ token: 'tok-secret', accountId: 'acct_test' });
    expect(zones).toEqual([
      { id: 'z1', name: 'example.com', status: 'active' },
      { id: 'z2', name: 'other.com', status: 'pending' },
    ]);
  });

  it('returns an empty list on a non-ok response', async () => {
    const calls: Call[] = [];
    const fn = makeFetch({ zones: { success: false, errors: [{ message: 'no' }] } }, calls);
    vi.stubGlobal('fetch', fn);
    await expect(listCloudflareZones({ token: 'tok-secret', accountId: 'acct_test' })).resolves.toEqual([]);
  });
});

describe('detachCloudflareWorkerDomain', () => {
  it('issues a DELETE for the domain id', async () => {
    const calls: Call[] = [];
    const fn = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      return jsonResponse({ success: true, result: { id: 'app.example.com' } });
    });
    vi.stubGlobal('fetch', fn);
    const deleted = await detachCloudflareWorkerDomain({ token: 'tok-secret', accountId: 'acct_test' }, 'app.example.com');
    expect(deleted).toBe(true);
    const del = calls.find((c) => c[1]?.method === 'DELETE');
    expect(del).toBeTruthy();
    expect(del![0]).toContain('/workers/domains/app.example.com');
  });

  it('treats a 404 as an already-gone no-op', async () => {
    const fn = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({ success: false, errors: [{ code: 10000, message: 'not found' }] }, 404),
    );
    vi.stubGlobal('fetch', fn);
    const deleted = await detachCloudflareWorkerDomain({ token: 'tok-secret', accountId: 'acct_test' }, 'app.example.com');
    expect(deleted).toBe(false);
  });
});

describe('attachCloudflareWorkerDomain conflict', () => {
  it('maps an already-bound error to CFW_DOMAIN_CONFLICT', async () => {
    const fn = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({ success: false, errors: [{ code: 10000, message: 'hostname is already attached to another worker' }] }, 400),
    );
    vi.stubGlobal('fetch', fn);
    await expect(
      attachCloudflareWorkerDomain(
        { token: 'tok-secret', accountId: 'acct_test' },
        { hostname: 'app.example.com', service: 'my-site', zone_id: 'zone-1' },
      ),
    ).rejects.toMatchObject({ name: 'DeployError', code: 'CFW_DOMAIN_CONFLICT' });
  });

  it('keeps the generic path for a non-conflict attach failure', async () => {
    const fn = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({ success: false, errors: [{ code: 10000, message: 'zone mismatch' }] }, 400),
    );
    vi.stubGlobal('fetch', fn);
    await expect(
      attachCloudflareWorkerDomain(
        { token: 'tok-secret', accountId: 'acct_test' },
        { hostname: 'app.example.com', service: 'my-site', zone_id: 'zone-1' },
      ),
    ).rejects.toMatchObject({ name: 'DeployError' });
  });
});

describe('deployToCloudflareWorkers deploy log', () => {
  const base = { config: { token: 'tok-secret', accountId: 'acct_test' }, files: [INDEX], projectName: 'My Site' };

  type Step = { name: string; status: 'done' | 'error'; detail?: string };

  function stepsOf(out: { providerMetadata?: Record<string, unknown> }): Step[] {
    return (out.providerMetadata?.steps ?? []) as Step[];
  }

  function checkOf(out: { providerMetadata?: Record<string, unknown> }): { status: number; ok: boolean; detail?: string } {
    return (out.providerMetadata?.check ?? {}) as { status: number; ok: boolean; detail?: string };
  }

  function happyFetch() {
    const calls: Call[] = [];
    const fn = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      const method = (init?.method || 'GET').toUpperCase();
      if (method === 'HEAD') return jsonResponse({}, 200);
      if (url.includes('assets-upload-session')) {
        return jsonResponse({ success: true, result: { jwt: 'SESS', buckets: [[cloudflareWorkersAssetHash(INDEX)]] } });
      }
      if (url.includes('/workers/assets/upload')) return jsonResponse({ success: true, result: { jwt: 'COMPLETION' } });
      if (url.endsWith('/workers/subdomain')) return jsonResponse({ success: true, result: { subdomain: 'acct-test' } });
      if (url.includes('/subdomain')) return jsonResponse({ success: true, result: { enabled: true } });
      if (url.includes('/workers/scripts')) return jsonResponse({ success: true, result: [{ id: 'my-site', tag: 'tag-abc-123' }] });
      if (url.includes('/workers/domains')) return jsonResponse({ success: true, result: {} });
      return jsonResponse({ success: true, result: {} });
    });
    return { calls, fn };
  }

  it('records assets, script, subdomain (and custom-domain when set) in order', async () => {
    const { fn } = happyFetch();
    vi.stubGlobal('fetch', fn);
    const out = await deployToCloudflareWorkers({
      ...base,
      customDomain: { hostname: 'app.example.com', zoneId: 'zone-1' },
    });
    const steps = stepsOf(out);
    expect(steps.map((s) => s.name)).toEqual(['assets', 'script', 'subdomain', 'custom-domain']);
    expect(steps.find((s) => s.name === 'assets')?.detail).toBe('1');
    expect(steps.find((s) => s.name === 'subdomain')?.detail).toBe('https://my-site.acct-test.workers.dev');
    expect(steps.find((s) => s.name === 'custom-domain')?.detail).toBe('app.example.com');
  });

  it('omits the custom-domain step when it is unset', async () => {
    const { fn } = happyFetch();
    vi.stubGlobal('fetch', fn);
    const out = await deployToCloudflareWorkers(base);
    expect(stepsOf(out).map((s) => s.name)).toEqual(['assets', 'script', 'subdomain']);
  });

  it('records a post-deploy check with status/ok on the workers.dev url', async () => {
    const { calls, fn } = happyFetch();
    vi.stubGlobal('fetch', fn);
    const out = await deployToCloudflareWorkers(base);
    const check = checkOf(out);
    expect(check.status).toBe(200);
    expect(check.ok).toBe(true);
    const head = calls.find((c) => c[1]?.method === 'HEAD');
    expect(head).toBeTruthy();
    expect(head![0]).toBe('https://my-site.acct-test.workers.dev');
    expect(head![1]).toMatchObject({ redirect: 'manual' });
  });

  it('flags worker-runtime-error detail when the probe returns 500', async () => {
    const fn = vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method || 'GET').toUpperCase();
      if (method === 'HEAD') return jsonResponse({}, 500);
      if (url.includes('assets-upload-session')) {
        return jsonResponse({ success: true, result: { jwt: 'SESS', buckets: [[cloudflareWorkersAssetHash(INDEX)]] } });
      }
      if (url.includes('/workers/assets/upload')) return jsonResponse({ success: true, result: { jwt: 'COMPLETION' } });
      if (url.endsWith('/workers/subdomain')) return jsonResponse({ success: true, result: { subdomain: 'acct-test' } });
      if (url.includes('/subdomain')) return jsonResponse({ success: true, result: { enabled: true } });
      return jsonResponse({ success: true, result: {} });
    });
    vi.stubGlobal('fetch', fn);
    const out = await deployToCloudflareWorkers(base);
    const check = checkOf(out);
    expect(check.status).toBe(500);
    expect(check.ok).toBe(false);
    expect(check.detail).toBe('worker-runtime-error');
  });

  it('attaches a partial steps log (with an error entry) to a failed deploy', async () => {
    const fn = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('assets-upload-session')) {
        return jsonResponse({ success: true, result: { jwt: 'SESS', buckets: [[cloudflareWorkersAssetHash(INDEX)]] } });
      }
      if (url.includes('/workers/assets/upload')) return jsonResponse({ success: true, result: { jwt: 'COMPLETION' } });
      if (url.endsWith('/workers/subdomain')) return jsonResponse({ success: true, result: { subdomain: 'acct-test' } });
      // script PUT fails
      return jsonResponse({ success: false, errors: [{ message: 'script upload failed' }] }, 400);
    });
    vi.stubGlobal('fetch', fn);
    let caught: unknown;
    try {
      await deployToCloudflareWorkers(base);
    } catch (err) {
      caught = err;
    }
    expect(caught).toMatchObject({ name: 'DeployError' });
    const steps = (caught as { steps?: Step[] } | null)?.steps;
    expect(Array.isArray(steps)).toBe(true);
    expect(steps!.map((s) => s.name)).toEqual(['assets', 'error']);
    expect(steps).toContainEqual({ name: 'error', status: 'error', detail: 'script upload failed' });
  });
});
