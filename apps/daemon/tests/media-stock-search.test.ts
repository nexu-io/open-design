import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promises as dns } from 'node:dns';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { imageSize, stockSearch, StockSearchServiceError } from '../src/media/stock-search.js';
import { searchVelaStockPhotos, type StockSearchServiceReport } from '../src/media/vela-stock-search.js';

const JPEG = Buffer.from([255,216,255,192,0,17,8,3,32,4,176,3,1,34,0]);
const candidate = (id = 'hero') => ({ id, status: 'ok' as const, provider: 'pexels' as const,
  downloadUrl: 'https://images.pexels.com/photos/1/test.jpeg', alt: 'Dog in a park', sourceUrl: 'https://www.pexels.com/photo/1/',
  author: 'Ann', license: 'Pexels License', attempts: [] });
const report = (ids = ['hero']): StockSearchServiceReport => ({ providers: ['pexels'], slots: ids.map(candidate) });
const fetchImage = () => (async () => new Response(new Uint8Array(JPEG))) as typeof fetch;

describe('company stock search and authorized local downloads', () => {
  let cwd: string;
  beforeEach(async () => { cwd = await mkdtemp(path.join(os.tmpdir(), 'od-stock-')); });
  afterEach(async () => { await rm(cwd, { recursive: true, force: true }); });

  it('downloads through the company service without reading a provider key and records attribution', async () => {
    const search = vi.fn(async () => report());
    const fetcher = vi.fn(fetchImage());
    const result = await stockSearch({ cwd, slots: [{ id: 'hero', query: 'dog' }], search, fetch: fetcher });
    expect(result.slots[0]).toMatchObject({ status: 'ok', path: 'assets/stock/hero.jpg', width: 1200, height: 800 });
    expect(search).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual' });
    expect(fetcher.mock.calls[0]?.[1]?.headers).toBeUndefined();
    expect(JSON.parse(await readFile(path.join(cwd, 'assets/stock/credits.json'), 'utf8'))[0]).toMatchObject({ author: 'Ann', license: 'Pexels License' });
  });

  it('rejects an HTML error page returned with HTTP 200 instead of saving a successful image', async () => {
    const result = await stockSearch({ cwd, slots: [{ id: 'hero', query: 'dog' }], search: async () => report(),
      fetch: (async () => new Response('<html>upstream unavailable</html>')) as typeof fetch });
    expect(result.slots[0]?.status).toBe('error');
    await expect(readFile(path.join(cwd, 'assets/stock/hero.jpg'))).rejects.toThrow();
  });

  it('returns terminal failed and missing slots without retrying the service or redownloading successes', async () => {
    const search = vi.fn(async (): Promise<StockSearchServiceReport> => ({ providers: ['pexels', 'pixabay'], slots: [candidate('a'),
      { id: 'b', status: 'error', error: 'provider_unavailable', attempts: [] }, { id: 'c', status: 'not_found', attempts: [] }] }));
    const fetcher = vi.fn(fetchImage());
    const result = await stockSearch({ cwd, slots: ['a','b','c'].map(id => ({ id, query: 'dog' })), search, fetch: fetcher });
    expect(result.slots.map(slot => slot.status)).toEqual(['ok', 'error', 'not_found']);
    expect(search).toHaveBeenCalledTimes(1); expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('sanitizes an unavailable service and does not repeat its request', async () => {
    const search = vi.fn(async () => { throw new Error('key=sensitive-upstream-key'); });
    await expect(stockSearch({ cwd, slots: [{ id: 'hero', query: 'dog' }], search })).rejects.toThrow(StockSearchServiceError);
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('downloads a future channel from a public HTTPS CDN without a client supplier allowlist', async () => {
    const fetcher = vi.fn(fetchImage());
    const result = await stockSearch({ cwd, slots: [{ id: 'hero', query: 'dog' }],
      search: async () => ({ providers: ['future-library'], slots: [{ ...candidate(), provider: 'future-library', downloadUrl: 'https://93.184.216.34/future.jpg' }] }), fetch: fetcher });
    expect(result.slots[0]).toMatchObject({ status: 'ok', provider: 'future-library' });
    expect(fetcher.mock.calls[0]?.[1]?.dispatcher).toBeDefined();
  });

  it('blocks private and HTTP redirect targets before contacting them', async () => {
    for (const location of ['https://169.254.169.254/latest/meta-data/', 'http://93.184.216.35/image.jpg']) {
      const fetcher = vi.fn(async () => new Response(null, { status: 302, headers: { location } }));
      const result = await stockSearch({ cwd, slots: [{ id: 'hero', query: 'dog' }], search: async () => report(), fetch: fetcher as typeof fetch });
      expect(result.slots[0]?.status).toBe('error');
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });

  it('bounds DNS pre-validation by the same image-download timeout', async () => {
    const lookup = vi.spyOn(dns, 'lookup').mockImplementation(() => new Promise(() => {}));
    const fetcher = vi.fn(fetchImage());
    try {
      const result = await stockSearch({ cwd, slots: [{ id: 'hero', query: 'dog' }], search: async () => report(), fetch: fetcher, requestTimeoutMs: 5 });
      expect(result.slots[0]).toMatchObject({ status: 'error', error: 'stock image download timed out' });
      expect(fetcher).not.toHaveBeenCalled();
    } finally { lookup.mockRestore(); }
  });

  it('bounds the whole acquisition and retains server results after the budget expires', async () => {
    let now = 0;
    const search = vi.fn(async () => { now = 20; return report(); });
    const fetcher = vi.fn(fetchImage());
    const result = await stockSearch({ cwd, slots: [{ id: 'hero', query: 'dog' }], search, fetch: fetcher, now: () => now, budgetMs: 10 });
    expect(result.slots[0]?.status).toBe('budget_exceeded'); expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(['http://127.0.0.1/internal', 'https://127.0.0.1/internal', 'https://user:password@images.pexels.com/x'])('rejects unsafe download URL %s', async (downloadUrl) => {
    const fetcher = vi.fn(fetchImage());
    const result = await stockSearch({ cwd, slots: [{ id: 'hero', query: 'dog' }],
      search: async () => ({ providers: ['pexels'], slots: [{ ...candidate(), downloadUrl }] }), fetch: fetcher });
    expect(result.slots[0]?.status).toBe('error'); expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects a declared oversized download before reading its body', async () => {
    const result = await stockSearch({ cwd, slots: [{ id: 'hero', query: 'dog' }], search: async () => report(),
      fetch: (async () => new Response(new Uint8Array(JPEG), { headers: { 'content-length': String(11 * 1024 * 1024) } })) as typeof fetch });
    expect(result.slots[0]?.status).toBe('error');
  });

  it('keeps normalized IDs distinct and merges attribution across calls', async () => {
    const ids = ['Hero', 'hero', '狗狗', '猫咪', 'hero image', 'hero-image'];
    const result = await stockSearch({ cwd, slots: ids.map(id => ({ id, query: 'dog' })), search: async () => report(ids), fetch: fetchImage() });
    expect(new Set(result.slots.map(slot => slot.path)).size).toBe(ids.length);
    await stockSearch({ cwd, slots: [{ id: 'extra', query: 'dog' }], search: async () => report(['extra']), fetch: fetchImage() });
    expect(JSON.parse(await readFile(path.join(cwd, 'assets/stock/credits.json'), 'utf8'))).toHaveLength(7);
  });

  it.each([{ concurrency: 0 }, { budgetMs: Infinity }, { requestTimeoutMs: -1 }])('rejects invalid execution limits %j', async (limits) => {
    const search = vi.fn(async () => report());
    await expect(stockSearch({ cwd, slots: [{ id: 'hero', query: 'dog' }], search, ...limits })).rejects.toThrow('positive integer');
    expect(search).not.toHaveBeenCalled();
  });
  it('rejects duplicate IDs before executing', async () => {
    const search = vi.fn(async () => report());
    await expect(stockSearch({ cwd, slots: [{ id: 'hero', query: 'dog' }, { id: 'hero', query: 'cat' }], search })).rejects.toThrow('distinct');
    expect(search).not.toHaveBeenCalled();
  });
  it('keeps acquisition successful when optional logging fails', async () => {
    const result = await stockSearch({ cwd, slots: [{ id: 'hero', query: 'dog' }], search: async () => report(), fetch: fetchImage(), onAttempt: () => { throw new Error('logging unavailable'); } });
    expect(result.slots[0]?.status).toBe('ok'); expect(imageSize(JPEG)).toEqual({ width: 1200, height: 800 });
  });
});

it('Vela stock adapter sends one stdin request using the existing workspace/login environment', async () => {
  const runner = vi.fn(async () => JSON.stringify({ providers: ['pexels'], slots: [{ id: 'hero', status: 'not_found', attempts: [] }] }));
  const result = await searchVelaStockPhotos({ slots: [{ id: 'hero', query: 'dog' }], requestTimeoutMs: 12000, budgetMs: 180000, concurrency: 6, workspaceId: 'workspace-one' }, runner);
  expect(result.slots[0]?.status).toBe('not_found');
  expect(runner).toHaveBeenCalledTimes(1);
  expect(runner.mock.calls[0]).toMatchObject([['media', 'stock-search', '--request-file', '-', '--json'], { configuredEnv: { VELA_WORKSPACE_ID: 'workspace-one' }, timeoutMs: 185000 }]);
});

it('rejects a malformed Vela response before trusting it', async () => {
  const input = { slots: [{ id: 'hero', query: 'dog' }], requestTimeoutMs: 12000, budgetMs: 180000, concurrency: 6 };
  for (const body of [{ slots: [] }, { providers: ['unknown'], slots: [] }, { providers: ['pexels'], slots: [{ id: 'different', status: 'ok', attempts: [] }] }]) {
    await expect(searchVelaStockPhotos(input, async () => JSON.stringify(body))).rejects.toThrow('invalid stock service');
  }
});

it('accepts three configured channels while rejecting repeated channel attempts', async () => {
  const input = { slots: [{ id: 'hero', query: 'dog' }], requestTimeoutMs: 12000, budgetMs: 180000, concurrency: 6 };
  const providers = ['company-pixabay', 'company-pexels', 'future-library'];
  const attempts = providers.map(provider => ({ provider, stage: 'search', status: 'error', timestamp: new Date().toISOString(), duration_ms: 1, http_status: 503 }));
  const body = { providers, slots: [{ id: 'hero', status: 'error', attempts }] };
  const runner = vi.fn(async (..._args: Parameters<typeof import("../src/integrations/vela-command.js").runVelaCommand>) => JSON.stringify(body));
  expect((await searchVelaStockPhotos(input, runner)).slots[0]?.attempts).toHaveLength(3);
  expect(JSON.parse(String(runner.mock.calls[0]![1]!.input))).toMatchObject({ max_attempts: 6 });
  body.slots[0]!.attempts[1] = attempts[0]!;
  await expect(searchVelaStockPhotos(input, async () => JSON.stringify(body))).rejects.toThrow('invalid stock service slot');
});


it('clears configured and ambient workspace selection for a proven account-scoped stock call', async () => {
  const runner = vi.fn(async () => JSON.stringify({ providers: ['pexels'], slots: [{ id: 'hero', status: 'not_found', attempts: [] }] }));
  await searchVelaStockPhotos({ slots: [{ id: 'hero', query: 'dog' }], requestTimeoutMs: 12000, budgetMs: 180000, concurrency: 6 }, runner);
  expect(runner.mock.calls[0]).toMatchObject([['media', 'stock-search', '--request-file', '-', '--json'], {
    configuredEnv: { VELA_WORKSPACE_ID: '', VELA_INVOCATION_SOURCE: 'open-design' },
  }]);
});
