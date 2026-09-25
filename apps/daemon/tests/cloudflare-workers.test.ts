import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CLOUDFLARE_WORKERS_PROVIDER_ID,
  isDeployProviderId,
  publicCloudflareWorkersConfig,
  readCloudflareWorkersConfig,
  readDeployConfig,
  SAVED_CLOUDFLARE_WORKERS_TOKEN_MASK,
  writeCloudflareWorkersConfig,
} from '../src/deploy.js';
import {
  cloudflareWorkersAssetHash,
  cloudflareWorkersScriptNameForProject,
  deployToCloudflareWorkers,
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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('cloudflare-workers config', () => {
  it('round-trips and masks the token', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'od-workers-config-'));
    const prior = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = dir;
    try {
      const saved = await writeCloudflareWorkersConfig({ token: 'tok-secret', accountId: 'acct_test', scriptName: 'my-site', compatibilityDate: '2025-01-01' });
      expect(saved.providerId).toBe(CLOUDFLARE_WORKERS_PROVIDER_ID);
      expect(saved.configured).toBe(true);
      expect(saved.tokenMask).toBe(SAVED_CLOUDFLARE_WORKERS_TOKEN_MASK);
      expect(saved.accountId).toBe('acct_test');
      expect(saved.scriptName).toBe('my-site');
      expect(saved).not.toHaveProperty('token');

      const raw = await readCloudflareWorkersConfig();
      expect(raw.token).toBe('tok-secret');
      expect(raw.accountId).toBe('acct_test');

      // writing the mask keeps the old token
      await writeCloudflareWorkersConfig({ token: SAVED_CLOUDFLARE_WORKERS_TOKEN_MASK });
      expect((await readCloudflareWorkersConfig()).token).toBe('tok-secret');
    } finally {
      process.env.OD_USER_STATE_DIR = prior;
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('requires token and account id', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'od-workers-config-'));
    const prior = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = dir;
    try {
      await expect(writeCloudflareWorkersConfig({ token: 'tok' })).rejects.toMatchObject({ code: 'CFW_ACCOUNT_ID_REQUIRED' });
      await expect(writeCloudflareWorkersConfig({ accountId: 'acct_test' })).rejects.toMatchObject({ code: 'CFW_TOKEN_REQUIRED' });
    } finally {
      process.env.OD_USER_STATE_DIR = prior;
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('dispatches and guards the provider id', () => {
    expect(isDeployProviderId('cloudflare-workers')).toBe(true);
    expect(isDeployProviderId('cloudflare-pages')).toBe(true);
    expect(isDeployProviderId('vercel-self')).toBe(true);
    expect(isDeployProviderId('nope')).toBe(false);
    expect(publicCloudflareWorkersConfig({ token: 'x', accountId: 'acct_test' }).configured).toBe(true);
    expect(readDeployConfig).toBeTypeOf('function');
  });
});

describe('cloudflare-workers hash and name', () => {
  it('matches the documented hash vector, including extensionless files', () => {
    const b64 = Buffer.from('<h1>hi</h1>').toString('base64');
    expect(cloudflareWorkersAssetHash(INDEX)).toBe(createHash('sha256').update(b64 + 'html').digest('hex').slice(0, 32));
    const noext = cloudflareWorkersAssetHash({ file: 'README', data: Buffer.from('<h1>hi</h1>') });
    expect(noext).toBe(createHash('sha256').update(b64).digest('hex').slice(0, 32));
  });

  it('slugs project names and rejects empty ones', () => {
    expect(cloudflareWorkersScriptNameForProject('My Site!')).toBe('my-site');
    expect(cloudflareWorkersScriptNameForProject('  a.b/c  ')).toBe('a-b-c');
    expect(() => cloudflareWorkersScriptNameForProject('!!!')).toThrow();
  });
});

describe('deployToCloudflareWorkers', () => {
  function happyFetch(overrides: Record<string, unknown> = {}) {
    const calls: Call[] = [];
    const fn = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      if (url.includes('assets-upload-session')) {
        const h = cloudflareWorkersAssetHash(INDEX);
        return jsonResponse(overrides.session ?? { success: true, result: { jwt: 'SESS', buckets: [[h]] } });
      }
      if (url.includes('/workers/assets/upload')) {
        return jsonResponse(overrides.upload ?? { success: true, result: { jwt: 'COMPLETION' } });
      }
      if (url.includes('/versions')) {
        return jsonResponse(overrides.version ?? { success: true, result: { id: 'v12345678' } });
      }
      if (url.endsWith('/workers/subdomain')) {
        return jsonResponse(overrides.subdomainGet ?? { success: true, result: { subdomain: 'acct-test' } });
      }
      if (url.includes('/subdomain')) {
        return jsonResponse(overrides.subdomainPost ?? { success: true, result: { enabled: true } });
      }
      // script PUT (production)
      return jsonResponse(overrides.scriptPut ?? { success: true, result: {} });
    });
    return { calls, fn };
  }

  const base = { config: { token: 'tok-secret', accountId: 'acct_test' }, files: [INDEX], projectName: 'My Site' };

  it('runs session -> buckets -> script PUT -> subdomain, using the session JWT', async () => {
    const { calls, fn } = happyFetch();
    vi.stubGlobal('fetch', fn);
    const out = await deployToCloudflareWorkers(base);
    const urls = calls.map((c) => c[0]);
    expect(urls[0]).toContain('assets-upload-session');
    expect(urls[1]).toContain('/workers/assets/upload');
    expect(urls[2]).toContain('/workers/scripts/my-site');
    expect(urls[3]).toContain('/workers/subdomain');
    expect(urls[4]).toContain('/workers/scripts/my-site/subdomain');
    expect(out.url).toBe('https://my-site.acct-test.workers.dev');

    const uploadCall = calls[1]!;
    expect(uploadCall[1]?.headers).toMatchObject({ Authorization: 'Bearer SESS' });
    expect(uploadCall[1]?.headers).not.toMatchObject({ Authorization: 'Bearer tok-secret' });

    const meta = await metadataOf(calls[2]!);
    expect(meta.bindings).toEqual([{ name: 'ASSETS', type: 'assets' }]);
    expect(meta.keep_bindings).toEqual(['secret_text', 'secret_key']);
    expect(meta.assets).toEqual({ jwt: 'COMPLETION' });
    expect(meta).not.toHaveProperty('workers_dev');
  });

  it('zero buckets means no upload calls and the session JWT is the completion JWT', async () => {
    const { calls, fn } = happyFetch({ session: { success: true, result: { jwt: 'SESS', buckets: [] } } });
    vi.stubGlobal('fetch', fn);
    await deployToCloudflareWorkers(base);
    expect(calls.some((c) => c[0].includes('/workers/assets/upload'))).toBe(false);
    const meta = await metadataOf(calls.find((c) => c[1]?.method === 'PUT')!);
    expect(meta.assets).toEqual({ jwt: 'SESS' });
  });

  it('uses a custom _worker.js as the module and does not upload it as an asset', async () => {
    const worker = { file: '_worker.js', data: Buffer.from('export default { fetch: () => new Response("ok") };') };
    const { calls, fn } = happyFetch();
    vi.stubGlobal('fetch', fn);
    await deployToCloudflareWorkers({ ...base, files: [INDEX, worker] });
    const sessionBody = JSON.parse(calls[0]![1]?.body as string) as { manifest: Record<string, unknown> };
    expect(Object.keys(sessionBody.manifest)).not.toContain('/_worker.js');
    const putCall = calls.find((c) => c[1]?.method === 'PUT')!;
    const body = putCall[1]?.body as FormData;
    const modulePart = body.get('index.js');
    expect(modulePart).toBeInstanceOf(Blob);
    expect(await (modulePart as Blob).text()).toContain('new Response("ok")');
  });

  it('preview uploads a version and never enables the production subdomain', async () => {
    const { calls, fn } = happyFetch();
    vi.stubGlobal('fetch', fn);
    const out = await deployToCloudflareWorkers({ ...base, target: 'preview' });
    expect(calls.some((c) => c[0].includes('/versions'))).toBe(true);
    expect(calls.some((c) => c[0].endsWith('/subdomain') && c[1]?.method === 'POST')).toBe(false);
    expect(calls.some((c) => c[0].endsWith('/workers/scripts/my-site') && c[1]?.method === 'PUT')).toBe(false);
    expect(out.url).toMatch(/^https:\/\/[a-z0-9]+-my-site\.acct-test\.workers\.dev$/);
  });

  it('maps 403 to PROVIDER_FORBIDDEN and never leaks the token', async () => {
    const fn403 = vi.fn(async (url: string) => {
      if (url.includes('assets-upload-session')) return jsonResponse({ success: false, errors: [{ message: 'forbidden' }] }, 403);
      return jsonResponse({ success: true, result: {} });
    });
    vi.stubGlobal('fetch', fn403);
    let err: unknown;
    try {
      await deployToCloudflareWorkers(base);
    } catch (e) {
      err = e;
    }
    expect(err).toMatchObject({ code: 'PROVIDER_FORBIDDEN' });
    expect(JSON.stringify(err)).not.toContain('tok-secret');
    expect(JSON.stringify(err)).not.toContain('SESS');
  });

  it('maps 413 to CFW_ASSET_TOO_LARGE', async () => {
    const fn = vi.fn(async (url: string) => {
      if (url.includes('assets-upload-session')) return jsonResponse({ success: false, errors: [{ message: 'too large' }] }, 413);
      return jsonResponse({ success: true, result: {} });
    });
    vi.stubGlobal('fetch', fn);
    await expect(deployToCloudflareWorkers(base)).rejects.toMatchObject({ code: 'CFW_ASSET_TOO_LARGE' });
  });

  it('retries 429 but not 400', async () => {
    let sessionCalls = 0;
    const fn429 = vi.fn(async (url: string) => {
      if (url.includes('assets-upload-session')) {
        sessionCalls += 1;
        if (sessionCalls === 1) return jsonResponse({ success: false }, 429);
        const h = cloudflareWorkersAssetHash(INDEX);
        return jsonResponse({ success: true, result: { jwt: 'SESS', buckets: [[h]] } });
      }
      if (url.includes('/workers/assets/upload')) return jsonResponse({ success: true, result: { jwt: 'COMPLETION' } });
      if (url.endsWith('/workers/subdomain')) return jsonResponse({ success: true, result: { subdomain: 'acct-test' } });
      if (url.includes('/subdomain')) return jsonResponse({ success: true, result: { enabled: true } });
      return jsonResponse({ success: true, result: {} });
    });
    vi.stubGlobal('fetch', fn429);
    await deployToCloudflareWorkers(base);
    expect(sessionCalls).toBe(2);

    let badCalls = 0;
    const fn400 = vi.fn(async (url: string) => {
      if (url.includes('assets-upload-session')) { badCalls += 1; return jsonResponse({ success: false, errors: [{ message: 'bad' }] }, 400); }
      return jsonResponse({ success: true, result: {} });
    });
    vi.stubGlobal('fetch', fn400);
    await expect(deployToCloudflareWorkers(base)).rejects.toThrow();
    expect(badCalls).toBe(1);
  });

  it('rejects an invalid scriptName before any network call', async () => {
    const fn = vi.fn(async () => jsonResponse({ success: true, result: {} }));
    vi.stubGlobal('fetch', fn);
    await expect(deployToCloudflareWorkers({ ...base, config: { token: 'tok', accountId: 'acct_test', scriptName: 'Bad_Name!' } })).rejects.toMatchObject({ code: 'CFW_SCRIPT_UPLOAD_FAILED' });
    expect(fn).not.toHaveBeenCalled();
  });

  it('rejects a traversal path before uploading', async () => {
    const fn = vi.fn(async () => jsonResponse({ success: true, result: {} }));
    vi.stubGlobal('fetch', fn);
    await expect(deployToCloudflareWorkers({ ...base, files: [{ file: '../evil.js', data: Buffer.from('x') }] })).rejects.toMatchObject({ code: 'CFW_UPLOAD_FAILED' });
    expect(fn).not.toHaveBeenCalled();
  });

  it('rejects a file over the 25 MiB limit', async () => {
    const big = Buffer.alloc(25 * 1024 * 1024 + 1, 1);
    const fn = vi.fn(async () => jsonResponse({ success: true, result: {} }));
    vi.stubGlobal('fetch', fn);
    await expect(deployToCloudflareWorkers({ ...base, files: [{ file: 'big.bin', data: big }] })).rejects.toMatchObject({ code: 'CFW_ASSET_TOO_LARGE' });
    expect(fn).not.toHaveBeenCalled();
  });

  it('rejects too many files', async () => {
    const many = Array.from({ length: 20001 }, (_, i) => ({ file: 'f' + i + '.txt', data: Buffer.from('x') }));
    const fn = vi.fn(async () => jsonResponse({ success: true, result: {} }));
    vi.stubGlobal('fetch', fn);
    await expect(deployToCloudflareWorkers({ ...base, files: many })).rejects.toMatchObject({ code: 'CFW_TOO_MANY_ASSETS' });
    expect(fn).not.toHaveBeenCalled();
  });
});
