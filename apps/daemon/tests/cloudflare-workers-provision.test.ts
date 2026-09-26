import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CLOUDFLARE_LIST_MAX_PAGES,
  attachCloudflareWorkerDomain,
  cloudflareWorkersAssetHash,
  deployToCloudflareWorkers,
  detachCloudflareWorkerDomain,
  ensureCloudflareD1Database,
  ensureCloudflareR2Bucket,
  listCloudflareD1Databases,
  listCloudflareR2Buckets,
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
  domainsList?: unknown;
  session?: unknown;
  scriptPut?: unknown;
}

function makeFetch(overrides: FetchOverrides = {}, calls: Call[]) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push([url, init]);
    const method = (init?.method || 'GET').toUpperCase();
    if (method === 'POST' && url.includes('/d1/database')) return jsonResponse(overrides.d1Create ?? { success: true, result: { uuid: 'db-uuid-123' } });
    if (method === 'POST' && url.includes('/r2/buckets')) return jsonResponse(overrides.r2Create ?? { success: true, result: {} });
    if (url.includes('/workers/scripts?')) return jsonResponse({ success: true, result: [{ id: 'my-site', tag: 'tag-abc-123' }] });
    if (url.includes('/d1/database')) return jsonResponse(overrides.d1List ?? { success: true, result: [] });
    if (url.includes('/r2/buckets')) return jsonResponse(overrides.r2List ?? { success: true, result: { buckets: [] } });
    if (url.includes('/zones')) return jsonResponse(overrides.zones ?? { success: true, result: [] });
    if (url.includes('/workers/domains')) {
      if (method === 'GET') return jsonResponse(overrides.domainsList ?? { success: true, result: [] });
      return jsonResponse(overrides.domains ?? { success: true, result: {} });
    }
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

  it('returns the existing uuid without posting when the name matches (exact-name query)', async () => {
    const calls: Call[] = [];
    const fn = makeFetch({ d1List: { success: true, result: [{ name: 'my-db', uuid: 'existing-uuid' }] } }, calls);
    vi.stubGlobal('fetch', fn);
    const uuid = await ensureCloudflareD1Database({ token: 'tok-secret', accountId: 'acct_test' }, 'my-db');
    expect(uuid).toBe('existing-uuid');
    expect(calls.some((c) => c[0].includes('/d1/database') && c[1]?.method === 'POST')).toBe(false);
    const list = calls.find((c) => c[0].includes('/d1/database') && (c[1]?.method || 'GET') === 'GET');
    expect(list![0]).toContain('name=my-db');
  });

  it('fails closed on a list error instead of creating a duplicate database', async () => {
    const calls: Call[] = [];
    const fn = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      return jsonResponse({ success: false, errors: [{ message: 'upstream' }] }, 500);
    });
    vi.stubGlobal('fetch', fn);
    await expect(ensureCloudflareD1Database({ token: 'tok-secret', accountId: 'acct_test' }, 'my-db')).rejects.toMatchObject({ name: 'DeployError' });
    expect(calls.some((c) => c[1]?.method === 'POST')).toBe(false);
  });

  it('fails with CFW_D1_CREATE_FAILED when the create response carries no uuid', async () => {
    const calls: Call[] = [];
    const fn = makeFetch({ d1List: { success: true, result: [] }, d1Create: { success: true, result: { name: 'my-db' } } }, calls);
    vi.stubGlobal('fetch', fn);
    await expect(ensureCloudflareD1Database({ token: 'tok-secret', accountId: 'acct_test' }, 'my-db')).rejects.toMatchObject({
      name: 'DeployError',
      code: 'CFW_D1_CREATE_FAILED',
      status: 502,
    });
  });

  it('keeps paging a D1 list that carries no total_pages while pages are full', async () => {
    const calls: Call[] = [];
    const page1 = Array.from({ length: 100 }, (_, i) => ({ name: 'db-' + i, uuid: 'uuid-' + i }));
    const fn = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      if (url.includes('page=1&')) return jsonResponse({ success: true, result: page1, result_info: { count: 100, page: 1, per_page: 100, total_count: 101 } });
      return jsonResponse({ success: true, result: [{ name: 'my-db', uuid: 'uuid-last' }], result_info: { count: 1, page: 2, per_page: 100, total_count: 101 } });
    });
    vi.stubGlobal('fetch', fn);
    const dbs = await listCloudflareD1Databases('tok-secret', 'acct_test');
    expect(dbs).toHaveLength(101);
    expect(dbs.at(-1)).toEqual({ name: 'my-db', id: 'uuid-last' });
    expect(calls.filter((c) => c[0].includes('/d1/database')).length).toBe(2);
  });

  it('pages by the per_page Cloudflare applied, not the one requested, when the endpoint clamps it', async () => {
    const calls: Call[] = [];
    // 100 requested, 20 applied: page 1 is "short" against the request but full
    // against the response; total_count 25 means one more page exists.
    const page1 = Array.from({ length: 20 }, (_, i) => ({ name: 'db-' + i, uuid: 'uuid-' + i }));
    const page2 = Array.from({ length: 5 }, (_, i) => ({ name: 'db-' + (20 + i), uuid: 'uuid-' + (20 + i) }));
    const fn = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      const page = Number(new URL(url).searchParams.get('page'));
      if (page === 1) return jsonResponse({ success: true, result: page1, result_info: { count: 20, page: 1, per_page: 20, total_count: 25 } });
      return jsonResponse({ success: true, result: page2, result_info: { count: 5, page: 2, per_page: 20, total_count: 25 } });
    });
    vi.stubGlobal('fetch', fn);
    const dbs = await listCloudflareD1Databases('tok-secret', 'acct_test');
    expect(dbs).toHaveLength(25);
    expect(calls.filter((c) => c[0].includes('/d1/database')).length).toBe(2);
  });

  it('stops when an endpoint ignores page= and answers the same page again, without duplicating it', async () => {
    const calls: Call[] = [];
    const same = Array.from({ length: 100 }, (_, i) => ({ name: 'db-' + i, uuid: 'uuid-' + i }));
    const fn = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      // Full page, no result_info, identical on every page: the "keep paging
      // while full" fallback would otherwise never terminate.
      return jsonResponse({ success: true, result: same });
    });
    vi.stubGlobal('fetch', fn);
    const dbs = await listCloudflareD1Databases('tok-secret', 'acct_test');
    expect(dbs).toHaveLength(100);
    expect(new Set(dbs.map((db) => db.id)).size).toBe(100);
    expect(calls.filter((c) => c[0].includes('/d1/database')).length).toBe(2);
  });

  it('keeps the new items of a page that only partially repeats the previous one, and stops on the first page with nothing new', async () => {
    const calls: Call[] = [];
    const first = Array.from({ length: 100 }, (_, i) => ({ name: 'db-' + i, uuid: 'uuid-' + i }));
    // A database created between the two requests shifts the window: page 2
    // repeats 99 ids from page 1 and carries ONE resource never seen before.
    // Dropping the page whole would miss it — and a missed database becomes a
    // duplicate create. Page 3 repeats page 2 entirely: nothing new, stop.
    const shifted = [{ name: 'db-new', uuid: 'uuid-new' }, ...first.slice(0, 99)];
    const fn = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      const page = Number(new URL(url).searchParams.get('page'));
      return jsonResponse({ success: true, result: page === 1 ? first : shifted });
    });
    vi.stubGlobal('fetch', fn);
    const dbs = await listCloudflareD1Databases('tok-secret', 'acct_test');
    expect(dbs).toHaveLength(101);
    expect(new Set(dbs.map((db) => db.id)).size).toBe(101);
    expect(dbs.some((db) => db.id === 'uuid-new')).toBe(true);
    expect(calls.filter((c) => c[0].includes('/d1/database')).length).toBe(3);
  });

  it('caps the pages followed when every page is full and every id is new', async () => {
    const calls: Call[] = [];
    const fn = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      const page = Number(new URL(url).searchParams.get('page'));
      const result = Array.from({ length: 100 }, (_, i) => ({ name: 'db-' + page + '-' + i, uuid: 'uuid-' + page + '-' + i }));
      return jsonResponse({ success: true, result });
    });
    vi.stubGlobal('fetch', fn);
    const dbs = await listCloudflareD1Databases('tok-secret', 'acct_test');
    expect(calls.filter((c) => c[0].includes('/d1/database')).length).toBe(100);
    expect(dbs).toHaveLength(100 * 100);
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
    const list = calls.find((c) => c[0].includes('/r2/buckets') && (c[1]?.method || 'GET') === 'GET');
    expect(list![0]).toContain('name_contains=my-bucket');
    expect(list![0]).toContain('per_page=1000');
  });

  it('fails closed on a list error instead of posting a duplicate bucket', async () => {
    const calls: Call[] = [];
    const fn = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      return jsonResponse({ success: false, errors: [{ message: 'upstream' }] }, 500);
    });
    vi.stubGlobal('fetch', fn);
    await expect(ensureCloudflareR2Bucket({ token: 'tok-secret', accountId: 'acct_test' }, 'my-bucket')).rejects.toMatchObject({ name: 'DeployError' });
    expect(calls.some((c) => c[1]?.method === 'POST')).toBe(false);
  });

  it('follows result_info.cursor across R2 pages', async () => {
    const calls: Call[] = [];
    const fn = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      if (url.includes('cursor=')) return jsonResponse({ success: true, result: { buckets: [{ name: 'my-bucket' }] }, result_info: { cursor: '' } });
      return jsonResponse({ success: true, result: { buckets: [{ name: 'other' }] }, result_info: { cursor: 'c2', per_page: 20 } });
    });
    vi.stubGlobal('fetch', fn);
    const buckets = await listCloudflareR2Buckets('tok-secret', 'acct_test');
    expect(buckets.map((b) => b.name)).toEqual(['other', 'my-bucket']);
    expect(calls[1]![0]).toContain('cursor=c2');
  });

  it('stops the R2 cursor loop when a page adds no new bucket name', async () => {
    const calls: Call[] = [];
    const fn = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      // The cursor never advances and every page repeats the same bucket: only
      // the progress check can end this — the page ceiling must not be what
      // does it, so two requests prove the stop is the added-name count.
      return jsonResponse({ success: true, result: { buckets: [{ name: 'my-bucket' }] }, result_info: { cursor: 'stuck' } });
    });
    vi.stubGlobal('fetch', fn);
    const buckets = await listCloudflareR2Buckets('tok-secret', 'acct_test');
    expect(buckets.map((b) => b.name)).toEqual(['my-bucket']);
    expect(calls).toHaveLength(2);
  });

  it('bounds the R2 cursor loop at the shared page ceiling while every page adds a name', async () => {
    const calls: Call[] = [];
    let served = 0;
    const fn = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      served += 1;
      // A fresh bucket name per page keeps the progress check satisfied, so
      // only the ceiling can stop a cursor that never advances.
      return jsonResponse({ success: true, result: { buckets: [{ name: `bucket-${served}` }] }, result_info: { cursor: 'same' } });
    });
    vi.stubGlobal('fetch', fn);
    const buckets = await listCloudflareR2Buckets('tok-secret', 'acct_test');
    expect(calls).toHaveLength(CLOUDFLARE_LIST_MAX_PAGES);
    expect(buckets).toHaveLength(CLOUDFLARE_LIST_MAX_PAGES);
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

  it('a d1 create with no uuid fails before any asset upload or script PUT', async () => {
    const calls: Call[] = [];
    const fn = makeFetch({ d1List: { success: true, result: [] }, d1Create: { success: true, result: {} } }, calls);
    vi.stubGlobal('fetch', fn);
    await expect(
      deployToCloudflareWorkers({ ...base, config: { ...base.config, bindings: [{ type: 'd1', name: 'DB', databaseName: 'my-db' }] } }),
    ).rejects.toMatchObject({ name: 'DeployError', code: 'CFW_D1_CREATE_FAILED' });
    expect(calls.some((c) => c[0].includes('assets-upload-session'))).toBe(false);
    expect(calls.some((c) => c[0].includes('/workers/assets/upload'))).toBe(false);
    expect(calls.some((c) => c[1]?.method === 'PUT' && c[0].includes('/workers/scripts/'))).toBe(false);
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

  it('does not run a separate capability probe after the ensure calls succeeded', async () => {
    const calls: Call[] = [];
    const fn = makeFetch({ r2List: { success: true, result: { buckets: [{ name: 'my-bucket' }] } } }, calls);
    vi.stubGlobal('fetch', fn);
    await deployToCloudflareWorkers({ ...base, config: { ...base.config, bindings: [{ type: 'r2_bucket', name: 'BUCKET', bucketName: 'my-bucket' }] } });
    // exactly one R2 GET (the ensure lookup); no probe of /access/apps or /d1
    expect(calls.filter((c) => c[0].includes('/r2/buckets') && (c[1]?.method || 'GET') === 'GET')).toHaveLength(1);
    expect(calls.some((c) => c[0].includes('/access/apps'))).toBe(false);
    expect(calls.some((c) => c[0].includes('/d1/database'))).toBe(false);
  });

  it('does not create a D1 database or R2 bucket when the script name is invalid', async () => {
    const calls: Call[] = [];
    const fn = makeFetch({ d1List: { success: true, result: [] }, r2List: { success: true, result: { buckets: [] } } }, calls);
    vi.stubGlobal('fetch', fn);
    await expect(deployToCloudflareWorkers({
      ...base,
      config: {
        ...base.config,
        scriptName: 'Not_Valid',
        bindings: [
          { type: 'd1', name: 'DB', databaseName: 'my-db' },
          { type: 'r2_bucket', name: 'BUCKET', bucketName: 'my-bucket' },
        ],
      },
    })).rejects.toMatchObject({ name: 'DeployError', code: 'CFW_SCRIPT_UPLOAD_FAILED' });
    expect(calls.some((c) => c[0].includes('/d1/database'))).toBe(false);
    expect(calls.some((c) => c[0].includes('/r2/buckets'))).toBe(false);
  });

  it('does not create a D1 database when an asset path is invalid', async () => {
    const calls: Call[] = [];
    const fn = makeFetch({ d1List: { success: true, result: [] } }, calls);
    vi.stubGlobal('fetch', fn);
    await expect(deployToCloudflareWorkers({
      ...base,
      files: [INDEX, { file: '../escape.html', data: Buffer.from('<p>x</p>') }],
      config: { ...base.config, bindings: [{ type: 'd1', name: 'DB', databaseName: 'my-db' }] },
    })).rejects.toMatchObject({ name: 'DeployError', code: 'CFW_UPLOAD_FAILED' });
    expect(calls.some((c) => c[0].includes('/d1/database'))).toBe(false);
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

  it('stores the attached domain id so the DELETE route can be driven from stored state', async () => {
    const calls: Call[] = [];
    const fn = makeFetch({ domains: { success: true, result: { id: 'dom-42', hostname: 'app.example.com' } } }, calls);
    vi.stubGlobal('fetch', fn);
    const out = await deployToCloudflareWorkers({ ...base, customDomain });
    expect(out.providerMetadata?.customDomain).toEqual({ id: 'dom-42', hostname: 'app.example.com', url: 'https://app.example.com' });
    await expect(
      attachCloudflareWorkerDomain({ token: 'tok-secret', accountId: 'acct_test' }, { hostname: 'app.example.com', service: 'my-site', zone_id: 'zone-1' }),
    ).resolves.toBe('dom-42');
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

  function happyFetch(options: { accessProtected?: boolean } = {}) {
    const calls: Call[] = [];
    const fn = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      const method = (init?.method || 'GET').toUpperCase();
      // The Access perimeter probe is a GET (its challenge-body heuristic needs
      // a body); the Access-off readiness probe is a HEAD. Public deploy URLs
      // are the only fetches that leave api.cloudflare.com.
      if (method === 'HEAD' || !url.startsWith('https://api.cloudflare.com/')) {
        return options.accessProtected
          ? new Response('', { status: 302, headers: { location: 'https://acct-test.cloudflareaccess.com/cdn-cgi/access/login' } })
          : jsonResponse({}, 200);
      }
      if (url.includes('assets-upload-session')) {
        return jsonResponse({ success: true, result: { jwt: 'SESS', buckets: [[cloudflareWorkersAssetHash(INDEX)]] } });
      }
      if (url.includes('/workers/assets/upload')) return jsonResponse({ success: true, result: { jwt: 'COMPLETION' } });
      if (url.endsWith('/workers/subdomain')) return jsonResponse({ success: true, result: { subdomain: 'acct-test' } });
      if (url.includes('/subdomain')) return jsonResponse({ success: true, result: { enabled: true } });
      if (url.includes('/workers/scripts')) return jsonResponse({ success: true, result: [{ id: 'my-site', tag: 'tag-abc-123' }] });
      if (url.includes('/access/identity_providers')) return jsonResponse({ success: true, result: [{ id: 'otp-123', type: 'onetimepin', name: 'One-time PIN login' }] });
      if (url.includes('/access/apps')) {
        // The app LIST (GET /access/apps) must be an array — a non-array now fails closed.
        if (method === 'GET' && !/\/access\/apps\/[^/?]/.test(url)) return jsonResponse({ success: true, result: [] });
        return jsonResponse({ success: true, result: { id: 'app-123' } });
      }
      if (url.includes('/workers/domains')) {
        if ((init?.method || 'GET').toUpperCase() === 'GET') return jsonResponse({ success: true, result: [] });
        return jsonResponse({ success: true, result: {} });
      }
      return jsonResponse({ success: true, result: {} });
    });
    return { calls, fn };
  }

  it('records assets, script, subdomain (and access-app / custom-domain when set) in order', async () => {
    const { fn } = happyFetch({ accessProtected: true });
    vi.stubGlobal('fetch', fn);
    const out = await deployToCloudflareWorkers({
      ...base,
      access: { enabled: true, rule: { kind: 'emails', emails: ['dev@example.com'] } },
      customDomain: { hostname: 'app.example.com', zoneId: 'zone-1' },
    });
    const steps = stepsOf(out);
    // The Access app is created BEFORE the live script PUT (go-live ordering:
    // no unprotected window), so it precedes 'script' in the step log.
    expect(steps.map((s) => s.name)).toEqual(['assets', 'access-app', 'script', 'subdomain', 'custom-domain']);
    expect(steps.find((s) => s.name === 'assets')?.detail).toBe('1');
    expect(steps.find((s) => s.name === 'access-app')?.detail).toBe('app-123');
    expect(steps.find((s) => s.name === 'subdomain')?.detail).toBe('https://my-site.acct-test.workers.dev');
    expect(steps.find((s) => s.name === 'custom-domain')?.detail).toBe('app.example.com');
  });

  it('omits access-app and custom-domain steps when those options are unset', async () => {
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

  it('records a 5xx probe as a status, without naming the Worker for an edge answer', async () => {
    const fn = vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method || 'GET').toUpperCase();
      if (method === 'HEAD') return jsonResponse({}, 500);
      if (url.includes('assets-upload-session')) {
        return jsonResponse({ success: true, result: { jwt: 'SESS', buckets: [[cloudflareWorkersAssetHash(INDEX)]] } });
      }
      if (url.includes('/workers/assets/upload')) return jsonResponse({ success: true, result: { jwt: 'COMPLETION' } });
      if (url.includes('/workers/domains')) return jsonResponse({ success: true, result: [] });
      if (url.endsWith('/workers/subdomain')) return jsonResponse({ success: true, result: { subdomain: 'acct-test' } });
      if (url.includes('/subdomain')) return jsonResponse({ success: true, result: { enabled: true } });
      return jsonResponse({ success: true, result: {} });
    });
    vi.stubGlobal('fetch', fn);
    const out = await deployToCloudflareWorkers(base);
    // A 5xx here is as likely to be Cloudflare's own edge (520-527, an edge
    // 503) as the Worker throwing, and 1101 is a Workers *error code* the edge
    // reports in a body — never a status a HEAD can see. The probe reports the
    // status it got and nothing else; the report renders that status itself.
    expect(checkOf(out)).toEqual({ status: 500, ok: false });
  });

  it('attaches a partial steps log (with an error entry) to a failed deploy', async () => {
    const fn = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('assets-upload-session')) {
        return jsonResponse({ success: true, result: { jwt: 'SESS', buckets: [[cloudflareWorkersAssetHash(INDEX)]] } });
      }
      if (url.includes('/workers/assets/upload')) return jsonResponse({ success: true, result: { jwt: 'COMPLETION' } });
      if (url.includes('/workers/domains')) return jsonResponse({ success: true, result: [] });
      if (url.endsWith('/workers/subdomain')) return jsonResponse({ success: true, result: { subdomain: 'acct-test' } });
      // The settings read is load-bearing: an unreadable binding set refuses the
      // deploy instead of replacing it, so it has to SUCCEED here for the script
      // PUT to be the call that fails.
      if (url.includes('/workers/scripts?')) return jsonResponse({ success: true, result: [{ id: 'my-site', tag: 'tag-abc-123' }] });
      if (url.endsWith('/settings')) return jsonResponse({ success: true, result: { bindings: [] } });
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
