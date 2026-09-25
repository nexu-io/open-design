import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CLOUDFLARE_WORKERS_PROVIDER_ID,
  commitCloudflareOAuthMode,
  configureCloudflareWorkersDataDir,
  isDeployProviderId,
  publicCloudflareWorkersConfig,
  readCloudflareWorkersConfig,
  readDeployConfig,
  SAVED_CLOUDFLARE_WORKERS_TOKEN_MASK,
  writeCloudflareOAuthIdentity,
  writeCloudflareWorkersConfig,
} from '../src/deploy.js';
import {
  cloudflareWorkersAssetHash,
  cloudflareWorkersScriptNameForProject,
  resolveWorkerScriptName,
  deployToCloudflareWorkers,
} from '../src/deploy/cloudflare-workers.js';

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

const SCRIPTS_LIST = { success: true, result: [{ id: 'my-site', tag: 'tag-abc-123', modified_on: '2020-01-01T00:00:00Z' }] };

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
    configureCloudflareWorkersDataDir(dir);
    try {
      const saved = await writeCloudflareWorkersConfig({ token: 'tok-secret', accountId: 'acct_test', scriptName: 'my-site', compatibilityDate: '2025-01-01' });
      expect(saved.providerId).toBe(CLOUDFLARE_WORKERS_PROVIDER_ID);
      expect(saved.configured).toBe(true);
      expect(saved.tokenMask).toBe(SAVED_CLOUDFLARE_WORKERS_TOKEN_MASK);
      expect(saved.accountId).toBe('acct_test');
      expect(saved.scriptName).toBe('my-site');
      expect(saved.credentialMode).toBe('token');
      expect(saved).not.toHaveProperty('token');

      const raw = await readCloudflareWorkersConfig();
      expect(raw.token).toBe('tok-secret');
      expect(raw.accountId).toBe('acct_test');
      expect(raw.credentialMode).toBe('token');

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
    configureCloudflareWorkersDataDir(dir);
    try {
      await expect(writeCloudflareWorkersConfig({ token: 'tok' })).rejects.toMatchObject({ code: 'CFW_ACCOUNT_ID_REQUIRED' });
      await expect(writeCloudflareWorkersConfig({ accountId: 'acct_test' })).rejects.toMatchObject({ code: 'CFW_TOKEN_REQUIRED' });
    } finally {
      process.env.OD_USER_STATE_DIR = prior;
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('persists the OAuth identity without flipping the credential authority', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'od-workers-config-'));
    const prior = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = dir;
    configureCloudflareWorkersDataDir(dir);
    try {
      // The identity (clientId/redirectUri) is persisted, but credentialMode stays
      // 'token' until commitCloudflareOAuthMode runs after token persistence.
      const saved = await writeCloudflareOAuthIdentity({ clientId: 'client-123', redirectUri: 'http://127.0.0.1:56122/callback' });
      expect(saved.clientId).toBe('client-123');
      expect(saved.credentialMode).toBe('token');

      await commitCloudflareOAuthMode();
      const raw = await readCloudflareWorkersConfig();
      expect(raw.clientId).toBe('client-123');
      expect(raw.credentialMode).toBe('oauth');

      // OAuth mode is configured by account + client (no static token).
      expect(publicCloudflareWorkersConfig({ credentialMode: 'oauth', accountId: 'acct_test', clientId: 'client-123' }).configured).toBe(true);
      expect(publicCloudflareWorkersConfig({ credentialMode: 'oauth', clientId: 'client-123' }).configured).toBe(false);
      // token mode still requires a static token.
      expect(publicCloudflareWorkersConfig({ credentialMode: 'token', accountId: 'acct_test', clientId: 'client-123' }).configured).toBe(false);
    } finally {
      process.env.OD_USER_STATE_DIR = prior;
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects an empty or invalid Access rule at write time instead of persisting it and deploying public', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'od-workers-config-'));
    const prior = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = dir;
    configureCloudflareWorkersDataDir(dir);
    try {
      await writeCloudflareWorkersConfig({ token: 'tok', accountId: 'acct_test' });
      // typo'd field (`email` for `emails`) → unrecognised rule
      await expect(writeCloudflareWorkersConfig({ access: { enabled: true, rule: { kind: 'emails', email: ['a@b.c'] } as never } }))
        .rejects.toMatchObject({ code: 'CFW_ACCESS_EMPTY_RULE' });
      // empty rule shapes (truthy objects, but no principal)
      await expect(writeCloudflareWorkersConfig({ access: { enabled: true, rule: { kind: 'emails', emails: [] } } }))
        .rejects.toMatchObject({ code: 'CFW_ACCESS_EMPTY_RULE' });
      await expect(writeCloudflareWorkersConfig({ access: { enabled: true, rule: { kind: 'emailDomain', emailDomain: '   ' } } }))
        .rejects.toMatchObject({ code: 'CFW_ACCESS_EMPTY_RULE' });
      await expect(writeCloudflareWorkersConfig({ access: { enabled: true } }))
        .rejects.toMatchObject({ code: 'CFW_ACCESS_EMPTY_RULE' });
      // nothing was persisted: read still sees no access
      expect((await readCloudflareWorkersConfig()).access).toBeUndefined();
      // a valid rule is normalized (trimmed) and round-trips identically
      const saved = await writeCloudflareWorkersConfig({ access: { enabled: true, rule: { kind: 'emailDomain', emailDomain: ' example.com ' } } });
      expect(saved.access).toEqual({ enabled: true, rule: { kind: 'emailDomain', emailDomain: 'example.com' } });
      expect((await readCloudflareWorkersConfig()).access).toEqual({ enabled: true, rule: { kind: 'emailDomain', emailDomain: 'example.com' } });
      // disabling still works and clears the rule
      await writeCloudflareWorkersConfig({ access: { enabled: false } });
      expect((await readCloudflareWorkersConfig()).access).toEqual({ enabled: false });
    } finally {
      process.env.OD_USER_STATE_DIR = prior;
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects a custom domain without a zoneId and malformed bindings at write time', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'od-workers-config-'));
    const prior = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = dir;
    configureCloudflareWorkersDataDir(dir);
    try {
      await writeCloudflareWorkersConfig({ token: 'tok', accountId: 'acct_test' });
      await expect(writeCloudflareWorkersConfig({ customDomain: { hostname: 'app.example.com' } as never }))
        .rejects.toMatchObject({ code: 'CFW_CUSTOM_DOMAIN_INVALID' });
      expect((await readCloudflareWorkersConfig()).customDomain).toBeUndefined();
      const saved = await writeCloudflareWorkersConfig({ customDomain: { hostname: ' app.example.com ', zoneId: 'zone-1' } });
      expect(saved.customDomain).toEqual({ hostname: 'app.example.com', zoneId: 'zone-1' });

      await expect(writeCloudflareWorkersConfig({ bindings: [null] as never }))
        .rejects.toMatchObject({ code: 'CFW_BINDINGS_INVALID' });
      await expect(writeCloudflareWorkersConfig({ bindings: [{ type: 'r2_bucket', name: 'ASSETS', bucketName: 'b' }] }))
        .rejects.toMatchObject({ code: 'CFW_BINDINGS_INVALID' });
      await expect(writeCloudflareWorkersConfig({ bindings: [{ type: 'r2_bucket', name: '1BAD', bucketName: 'b' }] }))
        .rejects.toMatchObject({ code: 'CFW_BINDINGS_INVALID' });
      await expect(writeCloudflareWorkersConfig({ bindings: [{ type: 'r2_bucket', name: 'BUCKET' }] }))
        .rejects.toMatchObject({ code: 'CFW_BINDINGS_INVALID' });
      await expect(writeCloudflareWorkersConfig({ bindings: [{ type: 'd1', name: 'DB' }] }))
        .rejects.toMatchObject({ code: 'CFW_BINDINGS_INVALID' });
      await writeCloudflareWorkersConfig({ bindings: [{ type: 'd1', name: 'DB', databaseName: 'my-db' }, { type: 'r2_bucket', name: 'BUCKET', bucketName: 'b' }] });
      expect((await readCloudflareWorkersConfig()).bindings).toEqual([
        { type: 'd1', name: 'DB', databaseName: 'my-db' },
        { type: 'r2_bucket', name: 'BUCKET', bucketName: 'b' },
      ]);
    } finally {
      process.env.OD_USER_STATE_DIR = prior;
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('serializes the OAuth identity write with the mode commit (no lost update)', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'od-workers-config-'));
    const prior = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = dir;
    configureCloudflareWorkersDataDir(dir);
    try {
      await writeCloudflareWorkersConfig({ token: 'tok', accountId: 'acct_test' });
      // Both read-modify-writes start in the same tick. Without the mutex the
      // identity write reads mode 'token', then overwrites the committed 'oauth'.
      await Promise.all([
        commitCloudflareOAuthMode(),
        writeCloudflareOAuthIdentity({ clientId: 'client-xyz', redirectUri: 'http://127.0.0.1:1/cb' }),
      ]);
      const raw = await readCloudflareWorkersConfig();
      expect(raw.credentialMode).toBe('oauth');
      expect(raw.clientId).toBe('client-xyz');
      expect(raw.token).toBe('tok');
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

  it('resolves the deploy script name the same way for the route single-flight key and the provider', () => {
    expect(resolveWorkerScriptName(undefined, 'My Site!')).toBe('my-site');
    expect(resolveWorkerScriptName('', 'My Site!')).toBe('my-site');
    expect(resolveWorkerScriptName('custom-name', 'My Site!')).toBe('custom-name');
    expect(() => resolveWorkerScriptName('Bad Name', 'My Site!')).toThrow(/Invalid Workers script name/);
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
      if (url.includes('/workers/scripts?')) {
        return jsonResponse(overrides.scripts ?? SCRIPTS_LIST);
      }
      if (url.includes('/workers/domains')) {
        if ((init?.method || 'GET').toUpperCase() === 'GET') return jsonResponse(overrides.domainsList ?? { success: true, result: [] });
        return jsonResponse(overrides.domains ?? { success: true, result: { id: 'dom-1' } });
      }
      if (url.endsWith('/workers/subdomain')) {
        return jsonResponse(overrides.subdomainGet ?? { success: true, result: { subdomain: 'acct-test' } });
      }
      if (url.includes('/subdomain')) {
        if ((init?.method || 'GET').toUpperCase() === 'GET') {
          return jsonResponse(overrides.scriptSubdomainGet ?? { success: true, result: { enabled: true } });
        }
        return jsonResponse(overrides.subdomainPost ?? { success: true, result: { enabled: true } });
      }
      // script PUT (production)
      return jsonResponse(overrides.scriptPut ?? { success: true, result: {} });
    });
    return { calls, fn };
  }

  const base = { config: { token: 'tok-secret', accountId: 'acct_test' }, files: [INDEX], projectName: 'My Site' };

  it('runs subdomain lookup -> session -> buckets -> script PUT -> subdomain enable, using the session JWT', async () => {
    const { calls, fn } = happyFetch();
    vi.stubGlobal('fetch', fn);
    const out = await deployToCloudflareWorkers(base);
    const urls = calls.map((c) => c[0]);
    // The account subdomain and the script's attached custom domains are
    // resolved BEFORE anything is uploaded, so an account without workers.dev
    // (or an unreconcilable domain set) fails before a new version goes live.
    expect(urls[0]).toContain('/workers/subdomain');
    expect(urls[1]).toContain('/workers/domains?service=my-site');
    expect(urls[2]).toContain('assets-upload-session');
    expect(urls[3]).toContain('/workers/assets/upload');
    expect(urls[4]).toContain('/workers/scripts/my-site');
    expect(urls[5]).toContain('/workers/scripts/my-site/subdomain');
    expect(out.url).toBe('https://my-site.acct-test.workers.dev');

    const uploadCall = calls[3]!;
    expect(uploadCall[1]?.headers).toMatchObject({ Authorization: 'Bearer SESS' });
    expect(uploadCall[1]?.headers).not.toMatchObject({ Authorization: 'Bearer tok-secret' });

    const meta = await metadataOf(calls[4]!);
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
    const sessionCall = calls.find((c) => c[0].includes('assets-upload-session'))!;
    const sessionBody = JSON.parse(sessionCall[1]?.body as string) as { manifest: Record<string, unknown> };
    expect(Object.keys(sessionBody.manifest)).not.toContain('/_worker.js');
    const putCall = calls.find((c) => c[1]?.method === 'PUT')!;
    const body = putCall[1]?.body as FormData;
    const modulePart = body.get('index.js');
    expect(modulePart).toBeInstanceOf(Blob);
    expect(await (modulePart as Blob).text()).toContain('new Response("ok")');
  });

  it('preview uploads a version, never PUTs the live script, and enables previews without flipping production', async () => {
    const { calls, fn } = happyFetch({ scriptSubdomainGet: { success: true, result: { enabled: false, previews_enabled: false } } });
    vi.stubGlobal('fetch', fn);
    const out = await deployToCloudflareWorkers({ ...base, target: 'preview' });
    expect(calls.some((c) => c[0].includes('/versions'))).toBe(true);
    expect(calls.some((c) => c[0].endsWith('/workers/scripts/my-site') && c[1]?.method === 'PUT')).toBe(false);
    // previews_enabled is turned on so the preview URL resolves, but the
    // production workers.dev exposure state (enabled:false) is preserved.
    const enable = calls.find((c) => c[0].endsWith('/subdomain') && c[1]?.method === 'POST');
    expect(enable).toBeTruthy();
    expect(JSON.parse(enable![1]?.body as string)).toEqual({ enabled: false, previews_enabled: true });
    expect(out.url).toMatch(/^https:\/\/[a-z0-9]+-my-site\.acct-test\.workers\.dev$/);

    // The preview version metadata must carry the assets binding + JWT so the
    // preview URL can actually serve the deployed HTML/assets (not env.ASSETS=undefined).
    const versionCall = calls.find((c) => c[0].includes('/versions'))!;
    const meta = await metadataOf(versionCall);
    expect(meta.bindings).toEqual([{ name: 'ASSETS', type: 'assets' }]);
    expect(meta.assets).toEqual({ jwt: 'COMPLETION' });
  });

  it('maps 403 to PROVIDER_FORBIDDEN and never leaks the token', async () => {
    const fn403 = vi.fn(async (url: string) => {
      if (url.includes('/workers/domains')) return jsonResponse({ success: true, result: [] });
      if (url.endsWith('/workers/subdomain')) return jsonResponse({ success: true, result: { subdomain: 'acct-test' } });
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
      if (url.includes('/workers/domains')) return jsonResponse({ success: true, result: [] });
      if (url.endsWith('/workers/subdomain')) return jsonResponse({ success: true, result: { subdomain: 'acct-test' } });
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
      if (url.includes('/workers/domains')) return jsonResponse({ success: true, result: [] });
      if (url.endsWith('/workers/subdomain')) return jsonResponse({ success: true, result: { subdomain: 'acct-test' } });
      if (url.includes('/subdomain')) return jsonResponse({ success: true, result: { enabled: true } });
      return jsonResponse({ success: true, result: {} });
    });
    vi.stubGlobal('fetch', fn429);
    await deployToCloudflareWorkers(base);
    expect(sessionCalls).toBe(2);

    let badCalls = 0;
    const fn400 = vi.fn(async (url: string) => {
      if (url.includes('/workers/domains')) return jsonResponse({ success: true, result: [] });
      if (url.endsWith('/workers/subdomain')) return jsonResponse({ success: true, result: { subdomain: 'acct-test' } });
      if (url.includes('assets-upload-session')) { badCalls += 1; return jsonResponse({ success: false, errors: [{ message: 'bad' }] }, 400); }
      return jsonResponse({ success: true, result: {} });
    });
    vi.stubGlobal('fetch', fn400);
    await expect(deployToCloudflareWorkers(base)).rejects.toThrow();
    expect(badCalls).toBe(1);
  });

  it('preview requires an existing production Worker and fails before any asset upload', async () => {
    const { calls, fn } = happyFetch({ scripts: { success: true, result: [] } });
    vi.stubGlobal('fetch', fn);
    await expect(deployToCloudflareWorkers({ ...base, target: 'preview' }))
      .rejects.toMatchObject({ name: 'DeployError', code: 'CFW_PREVIEW_REQUIRES_PRODUCTION' });
    expect(calls.some((c) => c[0].includes('assets-upload-session'))).toBe(false);
    expect(calls.some((c) => c[0].includes('/versions'))).toBe(false);
  });

  it('preview skips the subdomain POST when previews are already enabled', async () => {
    const { calls, fn } = happyFetch({ scriptSubdomainGet: { success: true, result: { enabled: true, previews_enabled: true } } });
    vi.stubGlobal('fetch', fn);
    await deployToCloudflareWorkers({ ...base, target: 'preview' });
    expect(calls.some((c) => c[0].endsWith('/subdomain') && c[1]?.method === 'POST')).toBe(false);
  });

  it('fails before the live PUT when the account has no workers.dev subdomain and no custom domain', async () => {
    const { calls, fn } = happyFetch({ subdomainGet: { success: true, result: {} } });
    vi.stubGlobal('fetch', fn);
    await expect(deployToCloudflareWorkers(base)).rejects.toMatchObject({ name: 'DeployError', code: 'CFW_SUBDOMAIN_FAILED' });
    expect(calls.some((c) => c[1]?.method === 'PUT' && c[0].includes('/workers/scripts/'))).toBe(false);
    expect(calls.some((c) => c[0].includes('assets-upload-session'))).toBe(false);
  });

  it('deploys a custom-domain-only account without workers.dev and reports the custom URL', async () => {
    const { calls, fn } = happyFetch({ subdomainGet: { success: true, result: {} } });
    vi.stubGlobal('fetch', fn);
    const out = await deployToCloudflareWorkers({ ...base, customDomain: { hostname: 'app.example.com', zoneId: 'zone-1' } });
    expect(out.url).toBe('https://app.example.com');
    expect(calls.some((c) => c[0].endsWith('/subdomain') && c[1]?.method === 'POST')).toBe(false);
    expect(calls.some((c) => c[1]?.method === 'PUT' && c[0].includes('/workers/domains'))).toBe(true);
  });

  it('treats a 5xx on the script PUT as committed when the script was modified after the deploy started (no JWT retry)', async () => {
    let puts = 0;
    const { calls, fn } = happyFetch({
      scripts: { success: true, result: [{ id: 'my-site', tag: 'tag-abc-123', modified_on: new Date(Date.now() + 60_000).toISOString() }] },
    });
    const wrapped = vi.fn(async (url: string, init?: RequestInit) => {
      if ((init?.method || 'GET').toUpperCase() === 'PUT' && url.endsWith('/workers/scripts/my-site')) {
        puts += 1;
        return jsonResponse({ success: false, errors: [{ message: 'upstream timeout' }] }, 502);
      }
      return fn(url, init);
    });
    vi.stubGlobal('fetch', wrapped);
    const out = await deployToCloudflareWorkers(base);
    expect(out.status).toBe('ready');
    expect(puts).toBe(1);
    expect(calls.some((c) => c[0].endsWith('/subdomain') && c[1]?.method === 'POST')).toBe(true);
  });

  it('retries the script PUT after a 5xx only when the script was NOT modified, then fails closed', async () => {
    let puts = 0;
    const { fn } = happyFetch();
    const wrapped = vi.fn(async (url: string, init?: RequestInit) => {
      if ((init?.method || 'GET').toUpperCase() === 'PUT' && url.endsWith('/workers/scripts/my-site')) {
        puts += 1;
        return jsonResponse({ success: false, errors: [{ message: 'upstream timeout' }] }, 502);
      }
      return fn(url, init);
    });
    vi.stubGlobal('fetch', wrapped);
    await expect(deployToCloudflareWorkers(base)).rejects.toMatchObject({ name: 'DeployError' });
    expect(puts).toBe(3);
  });

  it('rejects malformed bindings before any network call', async () => {
    const fn = vi.fn(async () => jsonResponse({ success: true, result: {} }));
    vi.stubGlobal('fetch', fn);
    await expect(deployToCloudflareWorkers({ ...base, config: { ...base.config, bindings: [null as never] } }))
      .rejects.toMatchObject({ name: 'DeployError', code: 'CFW_BINDINGS_INVALID' });
    await expect(deployToCloudflareWorkers({ ...base, config: { ...base.config, bindings: [{ type: 'r2_bucket', name: 'ASSETS', bucketName: 'b' }] } }))
      .rejects.toMatchObject({ name: 'DeployError', code: 'CFW_BINDINGS_INVALID' });
    expect(fn).not.toHaveBeenCalled();
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
