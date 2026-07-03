import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

function stubGlobalFetch(fetchMock: any) {
  const wrappedFetchMock = vi.fn(async (input: any, init: any) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof Request
          ? input.url
          : String(input);
    if (url.includes('/git/trees/')) {
      try {
        return await fetchMock(input, init);
      } catch (err: any) {
        if (err.message && (err.message.includes('Unexpected fetch') || err.message.includes('unexpected fetch'))) {
          return new Response(JSON.stringify({ tree: [] }), { status: 200 });
        }
        throw err;
      }
    }
    return fetchMock(input, init);
  });
  vi.stubGlobal('fetch', wrappedFetchMock);
}


import {
  analyzeDeployPlan,
  buildDeployFilePlan,
  buildDeployFileSet,
  checkDeploymentUrl,
  checkNetlifyDeploymentLinks,
  checkRenderDeploymentLinks,
  chunkCloudflarePagesAssetUploads,
  CLOUDFLARE_PAGES_ASSET_MAX_BYTES,
  CLOUDFLARE_PAGES_PROVIDER_ID,
  cloudflarePagesAssetHash,
  cloudflarePagesProjectNameForProject,
  DEPLOY_PREFLIGHT_LARGE_ASSET_BYTES,
  DEPLOY_PREFLIGHT_LARGE_HTML_BYTES,
  deploymentUrlCandidates,
  deployToVercel,
  deployToCloudflarePages,
  deployToNetlify,
  deployToRailway,
  deployToRender,
  deployConfigPath,
  extractCssReferences,
  extractHtmlReferences,
  extractInlineCssReferences,
  injectDeployHookScript,
  isVercelProtectedResponse,
  listCloudflarePagesZones,
  NETLIFY_PROVIDER_ID,
  normalizeDeployHookScriptUrl,
  prepareDeployPreflight,
  publicDeployConfig,
  RAILWAY_PROVIDER_ID,
  readNetlifyConfig,
  readRailwayConfig,
  readVercelConfig,
  resolveReferencedPath,
  rewriteCssReferences,
  rewriteEntryHtmlReferences,
  SAVED_CLOUDFLARE_TOKEN_MASK,
  SAVED_GITHUB_TOKEN_MASK,
  SAVED_NETLIFY_TOKEN_MASK,
  SAVED_RAILWAY_TOKEN_MASK,
  SAVED_TOKEN_MASK,
  VERCEL_PROVIDER_ID,
  waitForReachableDeploymentUrl,
  writeCloudflarePagesConfig,
  writeNetlifyConfig,
  writeRailwayConfig,
  writeVercelConfig,
} from '../src/deploy.js';
import { closeDatabase, getDeployment, insertProject, openDatabase, upsertDeployment } from '../src/db.js';
import { ensureProject } from '../src/projects.js';

async function setupProject() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'od-deploy-test-'));
  const projectId = 'p1';
  const dir = await ensureProject(path.join(root, 'projects'), projectId);
  return { projectsRoot: path.join(root, 'projects'), projectId, dir };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  closeDatabase();
});

describe('deploy config', () => {
  it('stores Vercel credentials in vercel.json and returns only the public mask', async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'od-deploy-config-test-'));
    const priorStateRoot = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = stateRoot;
    try {
      const saved = await writeVercelConfig({
        token: 'vercel-token-secret',
        teamId: 'team_123',
        teamSlug: 'design-team',
      });

      expect(path.basename(deployConfigPath())).toBe('vercel.json');
      expect(saved).toEqual({
        providerId: VERCEL_PROVIDER_ID,
        configured: true,
        tokenMask: SAVED_TOKEN_MASK,
        teamId: 'team_123',
        teamSlug: 'design-team',
        target: 'preview',
      });
      expect(JSON.parse(await readFile(deployConfigPath(), 'utf8'))).toEqual({
        token: 'vercel-token-secret',
        teamId: 'team_123',
        teamSlug: 'design-team',
      });

      const maskedUpdate = await writeVercelConfig({
        token: SAVED_TOKEN_MASK,
        teamSlug: 'renamed-team',
      });

      expect(maskedUpdate.tokenMask).toBe(SAVED_TOKEN_MASK);
      expect(await readVercelConfig()).toEqual({
        token: 'vercel-token-secret',
        teamId: 'team_123',
        teamSlug: 'renamed-team',
      });
    } finally {
      if (priorStateRoot === undefined) delete process.env.OD_USER_STATE_DIR;
      else process.env.OD_USER_STATE_DIR = priorStateRoot;
      await rm(stateRoot, { recursive: true, force: true });
    }
  });

  it('keeps Vercel public config provider metadata stable', () => {
    expect(publicDeployConfig({
      token: 'vercel-token-secret',
      teamId: '',
      teamSlug: '',
    })).toEqual({
      providerId: VERCEL_PROVIDER_ID,
      configured: true,
      tokenMask: SAVED_TOKEN_MASK,
      teamId: '',
      teamSlug: '',
      target: 'preview',
    });
  });

  it('preserves saved Netlify and Railway secrets when masks or partial updates are submitted', async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'od-deploy-config-secret-preserve-'));
    const priorStateRoot = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = stateRoot;
    try {
      const netlifySaved = await writeNetlifyConfig({ token: 'netlify-token-secret', githubToken: 'netlify-github-secret' });
      expect(netlifySaved).toMatchObject({
        providerId: NETLIFY_PROVIDER_ID,
        configured: true,
        tokenMask: SAVED_NETLIFY_TOKEN_MASK,
        githubTokenMask: SAVED_GITHUB_TOKEN_MASK,
      });

      await writeNetlifyConfig({});
      expect(await readNetlifyConfig()).toEqual({ token: 'netlify-token-secret', githubToken: 'netlify-github-secret' });

      await writeNetlifyConfig({ token: SAVED_NETLIFY_TOKEN_MASK });
      expect(JSON.parse(await readFile(deployConfigPath(NETLIFY_PROVIDER_ID), 'utf8'))).toEqual({
        token: 'netlify-token-secret',
        githubToken: 'netlify-github-secret',
      });

      const railwaySaved = await writeRailwayConfig({
        token: 'railway-token-secret',
        githubToken: 'github-token-secret',
      });
      expect(railwaySaved).toMatchObject({
        providerId: RAILWAY_PROVIDER_ID,
        configured: true,
        tokenMask: SAVED_RAILWAY_TOKEN_MASK,
        githubTokenMask: SAVED_GITHUB_TOKEN_MASK,
      });

      await writeRailwayConfig({ token: SAVED_RAILWAY_TOKEN_MASK });
      expect(await readRailwayConfig()).toEqual({
        token: 'railway-token-secret',
        githubToken: 'github-token-secret',
      });

      await writeRailwayConfig({ githubToken: SAVED_GITHUB_TOKEN_MASK });
      expect(JSON.parse(await readFile(deployConfigPath(RAILWAY_PROVIDER_ID), 'utf8'))).toEqual({
        token: 'railway-token-secret',
        githubToken: 'github-token-secret',
      });
    } finally {
      if (priorStateRoot === undefined) delete process.env.OD_USER_STATE_DIR;
      else process.env.OD_USER_STATE_DIR = priorStateRoot;
      await rm(stateRoot, { recursive: true, force: true });
    }
  });

  it('stores Cloudflare Pages credentials separately from vercel.json', async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'od-deploy-config-test-'));
    const priorStateRoot = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = stateRoot;
    try {
      const saved = await writeCloudflarePagesConfig({
        token: 'cloudflare-token-secret',
        accountId: 'account_123',
      });

      expect(path.basename(deployConfigPath(CLOUDFLARE_PAGES_PROVIDER_ID))).toBe('cloudflare-pages.json');
      expect(path.basename(deployConfigPath(VERCEL_PROVIDER_ID))).toBe('vercel.json');
      expect(saved).toEqual({
        providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
        configured: true,
        tokenMask: SAVED_CLOUDFLARE_TOKEN_MASK,
        teamId: '',
        teamSlug: '',
        accountId: 'account_123',
        projectName: '',
        target: 'preview',
      });
      expect(JSON.parse(await readFile(deployConfigPath(CLOUDFLARE_PAGES_PROVIDER_ID), 'utf8'))).toEqual({
        token: 'cloudflare-token-secret',
        accountId: 'account_123',
        projectName: '',
      });

      const maskedUpdate = await writeCloudflarePagesConfig({
        token: SAVED_CLOUDFLARE_TOKEN_MASK,
        accountId: 'account_456',
      });

      expect(maskedUpdate.tokenMask).toBe(SAVED_CLOUDFLARE_TOKEN_MASK);
      expect(maskedUpdate.accountId).toBe('account_456');
      expect(JSON.parse(await readFile(deployConfigPath(CLOUDFLARE_PAGES_PROVIDER_ID), 'utf8'))).toEqual({
        token: 'cloudflare-token-secret',
        accountId: 'account_456',
        projectName: '',
      });

      const withDomainHints = await writeCloudflarePagesConfig({
        token: SAVED_CLOUDFLARE_TOKEN_MASK,
        accountId: 'account_456',
        cloudflarePages: {
          lastZoneId: 'zone-1',
          lastZoneName: 'example.com',
          lastDomainPrefix: 'demo',
        },
      });
      expect((withDomainHints as any).cloudflarePages).toEqual({
        lastZoneId: 'zone-1',
        lastZoneName: 'example.com',
        lastDomainPrefix: 'demo',
      });

      const withoutDomainPrefix = await writeCloudflarePagesConfig({
        token: SAVED_CLOUDFLARE_TOKEN_MASK,
        accountId: 'account_456',
        cloudflarePages: {
          lastZoneId: 'zone-1',
          lastZoneName: 'example.com',
        },
      });
      expect((withoutDomainPrefix as any).cloudflarePages).toEqual({
        lastZoneId: 'zone-1',
        lastZoneName: 'example.com',
      });
      expect(JSON.parse(await readFile(deployConfigPath(CLOUDFLARE_PAGES_PROVIDER_ID), 'utf8'))).toMatchObject({
        cloudflarePages: {
          lastZoneId: 'zone-1',
          lastZoneName: 'example.com',
        },
      });
      expect(JSON.parse(await readFile(deployConfigPath(CLOUDFLARE_PAGES_PROVIDER_ID), 'utf8')).cloudflarePages).not.toHaveProperty(
        'lastDomainPrefix',
      );
    } finally {
      if (priorStateRoot === undefined) delete process.env.OD_USER_STATE_DIR;
      else process.env.OD_USER_STATE_DIR = priorStateRoot;
      await rm(stateRoot, { recursive: true, force: true });
    }
  });

  it('requires Cloudflare Pages token and account id while deriving project names automatically', async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'od-deploy-config-required-'));
    const priorStateRoot = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = stateRoot;
    try {
      await expect(writeCloudflarePagesConfig({
        token: 'cloudflare-token-secret',
      })).rejects.toThrow(/account ID is required/i);
      await expect(writeCloudflarePagesConfig({
        accountId: 'account_123',
      })).rejects.toThrow(/API token is required/i);
      expect(cloudflarePagesProjectNameForProject('project-123', 'AI 生图网站')).toBe(
        'od-ai-project-123',
      );
      expect(cloudflarePagesProjectNameForProject('12345678', '中文项目')).toBe(
        'od-project-12345678',
      );
    } finally {
      if (priorStateRoot === undefined) delete process.env.OD_USER_STATE_DIR;
      else process.env.OD_USER_STATE_DIR = priorStateRoot;
      await rm(stateRoot, { recursive: true, force: true });
    }
  });
});

describe('vercel deploys', () => {
  it('resolves teamSlug to teamId and queries deployments with teamId', async () => {
    const requestedUrls: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
      const method = init?.method || (input instanceof Request ? input.method : 'GET');
      requestedUrls.push(`${method} ${url}`);

      if (url.includes('/v2/teams') && method === 'GET') {
        return new Response(JSON.stringify({
          teams: [
            { id: 'team_resolved_123', slug: 'my-team-slug' }
          ]
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (url.includes('/v13/deployments/vercel-dep-1') && method === 'GET') {
        return new Response(JSON.stringify({
          id: 'vercel-dep-1',
          readyState: 'READY',
          url: 'https://vercel-dep-1.vercel.app',
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (url.includes('/v13/deployments') && method === 'POST') {
        return new Response(JSON.stringify({
          id: 'vercel-dep-1',
          readyState: 'READY',
          url: 'https://vercel-dep-1.vercel.app',
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (url === 'https://vercel-dep-1.vercel.app' && method === 'HEAD') {
        return new Response('', { status: 200 });
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    stubGlobalFetch(fetchMock);

    const result = await deployToVercel({
      config: { token: 'vercel-token-secret', teamSlug: 'my-team-slug' },
      projectId: 'p1',
      files: [
        {
          file: 'index.html',
          data: Buffer.from('<!doctype html><h1>Hello Vercel</h1>'),
          contentType: 'text/html',
        },
      ],
    });

    expect(result).toMatchObject({
      providerId: VERCEL_PROVIDER_ID,
      url: 'https://vercel-dep-1.vercel.app',
      deploymentId: 'vercel-dep-1',
    });

    expect(requestedUrls).toContain('GET https://api.vercel.com/v2/teams');
    expect(requestedUrls).toContain('POST https://api.vercel.com/v13/deployments?teamId=team_resolved_123');
  });
});

describe('render deploys', () => {
  it('polls Render deploy and succeeds when state becomes live', async () => {
    const requestedUrls: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
      const method = init?.method || (input instanceof Request ? input.method : 'GET');
      requestedUrls.push(`${method} ${url}`);

      if (url === 'https://api.github.com/user' && method === 'GET') {
        return new Response(JSON.stringify({ login: 'octo' }), { status: 200 });
      }
      if (url === 'https://api.github.com/repos/octo/od-render-p1' && method === 'GET') {
        return new Response(JSON.stringify({ id: 123 }), { status: 200 });
      }
      if (url.startsWith('https://api.github.com/repos/octo/od-render-p1/contents/') && method === 'GET') {
        return new Response('', { status: 404 });
      }
      if (url.startsWith('https://api.github.com/repos/octo/od-render-p1/contents/') && method === 'PUT') {
        return new Response(JSON.stringify({ content: { sha: 'abc123' } }), { status: 200 });
      }
      if (url.includes('/owners') && method === 'GET') {
        return new Response(JSON.stringify([{ owner: { id: 'owner-1' } }]), { status: 200 });
      }
      if (url.includes('/services?limit=100') && method === 'GET') {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (url.includes('/services') && method === 'POST') {
        return new Response(JSON.stringify({
          id: 'render-service-1',
          url: 'https://od-render-p1.onrender.com',
        }), { status: 200 });
      }
      if (url.includes('/deploys?limit=1') && method === 'GET') {
        return new Response(JSON.stringify([{ deploy: { id: 'render-deploy-1' } }]), { status: 200 });
      }
      if (url.includes('/deploys/render-deploy-1') && method === 'GET') {
        return new Response(JSON.stringify({ status: 'live' }), { status: 200 });
      }
      if (url === 'https://od-render-p1.onrender.com' && method === 'HEAD') {
        return new Response('', { status: 200 });
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    stubGlobalFetch(fetchMock);

    const result = await deployToRender({
      config: { token: 'render-token-secret', githubToken: 'ghp-test-token' },
      projectId: 'p1',
      files: [
        {
          file: 'index.html',
          data: Buffer.from('<!doctype html><h1>Hello Render</h1>'),
          contentType: 'text/html',
        },
      ],
    });

    expect(result).toMatchObject({
      providerId: 'render',
      url: 'https://od-render-p1.onrender.com',
      deploymentId: 'render-service-1',
    });
    expect(requestedUrls).toContain('GET https://api.render.com/v1/services/render-service-1/deploys/render-deploy-1');
  });

  it('handles non-main default branch (e.g. master) on Render deploys', async () => {
    let serviceCreateBody: any = null;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
      const method = init?.method || (input instanceof Request ? input.method : 'GET');

      if (url === 'https://api.github.com/user' && method === 'GET') {
        return new Response(JSON.stringify({ login: 'octo' }), { status: 200 });
      }
      if (url === 'https://api.github.com/repos/octo/od-render-p1' && method === 'GET') {
        return new Response(JSON.stringify({ id: 123, default_branch: 'master' }), { status: 200 });
      }
      if (url.startsWith('https://api.github.com/repos/octo/od-render-p1/contents/') && method === 'GET') {
        return new Response('', { status: 404 });
      }
      if (url.startsWith('https://api.github.com/repos/octo/od-render-p1/contents/') && method === 'PUT') {
        return new Response(JSON.stringify({ content: { sha: 'abc123' } }), { status: 200 });
      }
      if (url.includes('/owners') && method === 'GET') {
        return new Response(JSON.stringify([{ owner: { id: 'owner-1' } }]), { status: 200 });
      }
      if (url.includes('/services?limit=100') && method === 'GET') {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (url.includes('/services') && method === 'POST') {
        serviceCreateBody = JSON.parse(String(init?.body ?? '{}'));
        return new Response(JSON.stringify({
          id: 'render-service-1',
          url: 'https://od-render-p1.onrender.com',
        }), { status: 200 });
      }
      if (url.includes('/deploys?limit=1') && method === 'GET') {
        return new Response(JSON.stringify([{ deploy: { id: 'render-deploy-1' } }]), { status: 200 });
      }
      if (url.includes('/deploys/render-deploy-1') && method === 'GET') {
        return new Response(JSON.stringify({ status: 'live' }), { status: 200 });
      }
      if (url === 'https://od-render-p1.onrender.com' && method === 'HEAD') {
        return new Response('', { status: 200 });
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    stubGlobalFetch(fetchMock);

    await deployToRender({
      config: { token: 'render-token-secret', githubToken: 'ghp-test-token' },
      projectId: 'p1',
      files: [
        {
          file: 'index.html',
          data: Buffer.from('<!doctype html><h1>Hello Render</h1>'),
          contentType: 'text/html',
        },
      ],
    });

    expect(serviceCreateBody?.branch).toBe('master');
  });

  it('throws DeployError when Render build fails', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
      const method = init?.method || (input instanceof Request ? input.method : 'GET');

      if (url === 'https://api.github.com/user' && method === 'GET') {
        return new Response(JSON.stringify({ login: 'octo' }), { status: 200 });
      }
      if (url === 'https://api.github.com/repos/octo/od-render-p1' && method === 'GET') {
        return new Response(JSON.stringify({ id: 123 }), { status: 200 });
      }
      if (url.startsWith('https://api.github.com/repos/octo/od-render-p1/contents/') && method === 'GET') {
        return new Response('', { status: 404 });
      }
      if (url.startsWith('https://api.github.com/repos/octo/od-render-p1/contents/') && method === 'PUT') {
        return new Response(JSON.stringify({ content: { sha: 'abc123' } }), { status: 200 });
      }
      if (url.includes('/owners') && method === 'GET') {
        return new Response(JSON.stringify([{ owner: { id: 'owner-1' } }]), { status: 200 });
      }
      if (url.includes('/services?limit=100') && method === 'GET') {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (url.includes('/services') && method === 'POST') {
        return new Response(JSON.stringify({
          id: 'render-service-1',
          url: 'https://od-render-p1.onrender.com',
        }), { status: 200 });
      }
      if (url.includes('/deploys?limit=1') && method === 'GET') {
        return new Response(JSON.stringify([{ deploy: { id: 'render-deploy-1' } }]), { status: 200 });
      }
      if (url.includes('/deploys/render-deploy-1') && method === 'GET') {
        return new Response(JSON.stringify({ status: 'build_failed' }), { status: 200 });
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    stubGlobalFetch(fetchMock);

    await expect(
      deployToRender({
        config: { token: 'render-token-secret', githubToken: 'ghp-test-token' },
        projectId: 'p1',
        files: [
          {
            file: 'index.html',
            data: Buffer.from('<!doctype html><h1>Hello Render</h1>'),
            contentType: 'text/html',
          },
        ],
      })
    ).rejects.toThrowError(/Render deployment failed with status: build_failed/);
  });

  it('aborts Render deploy status poll on timeout budget exhaustion', async () => {
    vi.useFakeTimers();
    let aborted = false;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : String(input);
      if (url === 'https://api.github.com/user') return new Response(JSON.stringify({ login: 'testuser' }), { status: 200 });
      if (url === 'https://api.github.com/repos/testuser/od-render-p1') return new Response(JSON.stringify({ id: 123, default_branch: 'main' }), { status: 200 });
      if (url.startsWith('https://api.github.com/repos/testuser/od-render-p1/git/trees/')) {
        return new Response(JSON.stringify({ tree: [] }), { status: 200 });
      }
      if (url.startsWith('https://api.github.com/repos/testuser/od-render-p1/contents/') && init?.method === 'PUT') return new Response(JSON.stringify({ content: { sha: 'sha' } }), { status: 200 });
      if (url.startsWith('https://api.github.com/repos/testuser/od-render-p1/contents/')) return new Response('', { status: 404 });
      if (url.includes('/owners')) return new Response(JSON.stringify([{ owner: { id: 'owner-1' } }]), { status: 200 });
      if (url.includes('/services?limit=100')) return new Response(JSON.stringify([]), { status: 200 });
      if (url.includes('/services') && init?.method === 'POST') {
        return new Response(JSON.stringify({ id: 'render-service-1', url: 'https://od-render-p1.onrender.com' }), { status: 200 });
      }
      if (url.includes('/deploys?limit=1')) return new Response(JSON.stringify([{ deploy: { id: 'render-deploy-1' } }]), { status: 200 });
      
      if (url.includes('/deploys/render-deploy-1')) {
        return new Promise<Response>((_, reject) => {
          if (init?.signal) {
            init.signal.addEventListener('abort', () => {
              aborted = true;
              reject(new DOMException('The user aborted a request.', 'AbortError'));
            });
          }
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    stubGlobalFetch(fetchMock);

    const deployPromise = deployToRender({
      config: { token: 'render-token-secret', githubToken: 'ghp-test-token' },
      projectId: 'p1',
      files: [
        {
          file: 'index.html',
          data: Buffer.from('<!doctype html><h1>Hello Render</h1>'),
          contentType: 'text/html',
        },
      ],
    });

    const assertionPromise = expect(deployPromise).rejects.toThrowError(/Render deployment poll timed out/);

    await vi.advanceTimersByTimeAsync(185_000);

    await assertionPromise;
    expect(aborted).toBe(true);
  });

  it('polls and resolves new Render deploy when trigger response lacks deploy_id and new deploy fails', async () => {
    let listDeploysCount = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
      const method = init?.method || (input instanceof Request ? input.method : 'GET');

      if (url === 'https://api.github.com/user' && method === 'GET') {
        return new Response(JSON.stringify({ login: 'octo' }), { status: 200 });
      }
      if (url === 'https://api.github.com/repos/octo/od-render-p1' && method === 'GET') {
        return new Response(JSON.stringify({ id: 123 }), { status: 200 });
      }
      if (url.startsWith('https://api.github.com/repos/octo/od-render-p1/contents/') && method === 'GET') {
        return new Response('', { status: 404 });
      }
      if (url.startsWith('https://api.github.com/repos/octo/od-render-p1/contents/') && method === 'PUT') {
        return new Response(JSON.stringify({ content: { sha: 'abc123' } }), { status: 200 });
      }
      if (url.includes('/owners') && method === 'GET') {
        return new Response(JSON.stringify([{ owner: { id: 'owner-1' } }]), { status: 200 });
      }
      if (url.includes('/services?limit=100') && method === 'GET') {
        return new Response(JSON.stringify([{ service: { id: 'render-service-1', name: 'od-render-p1', url: 'https://od-render-p1.onrender.com' } }]), { status: 200 });
      }
      if (url.includes('/services/render-service-1/deploys') && method === 'POST') {
        // Trigger response lacks deploy ID
        return new Response(JSON.stringify({}), { status: 200 });
      }
      if (url.includes('/services/render-service-1/deploys?limit=1') && method === 'GET') {
        listDeploysCount++;
        if (listDeploysCount === 1) {
          // Pre-trigger check
          return new Response(JSON.stringify([{ deploy: { id: 'old-deploy-id' } }]), { status: 200 });
        } else if (listDeploysCount === 2) {
          // First poll after trigger: still old deploy ID
          return new Response(JSON.stringify([{ deploy: { id: 'old-deploy-id' } }]), { status: 200 });
        } else {
          // Second poll after trigger: resolves new deploy ID
          return new Response(JSON.stringify([{ deploy: { id: 'new-failed-deploy-id' } }]), { status: 200 });
        }
      }
      if (url.includes('/deploys/new-failed-deploy-id') && method === 'GET') {
        return new Response(JSON.stringify({ status: 'build_failed' }), { status: 200 });
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    stubGlobalFetch(fetchMock);

    await expect(
      deployToRender({
        config: { token: 'render-token-secret', githubToken: 'ghp-test-token' },
        projectId: 'p1',
        files: [
          {
            file: 'index.html',
            data: Buffer.from('<!doctype html><h1>Hello Render</h1>'),
            contentType: 'text/html',
          },
        ],
        priorMetadata: { serviceId: 'render-service-1', serviceUrl: 'https://od-render-p1.onrender.com' },
      })
    ).rejects.toThrowError(/Render deployment failed with status: build_failed/);

    expect(listDeploysCount).toBeGreaterThanOrEqual(3);
  });

  it('polls Render deploy and self-heals when serviceId is stale (returns 404)', async () => {
    const requestedUrls: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
      const method = init?.method || (input instanceof Request ? input.method : 'GET');
      requestedUrls.push(`${method} ${url}`);

      if (url === 'https://api.github.com/user' && method === 'GET') {
        return new Response(JSON.stringify({ login: 'octo' }), { status: 200 });
      }
      if (url === 'https://api.github.com/repos/octo/od-render-p1' && method === 'GET') {
        return new Response(JSON.stringify({ id: 123 }), { status: 200 });
      }
      if (url.startsWith('https://api.github.com/repos/octo/od-render-p1/contents/') && method === 'GET') {
        return new Response('', { status: 404 });
      }
      if (url.startsWith('https://api.github.com/repos/octo/od-render-p1/contents/') && method === 'PUT') {
        return new Response(JSON.stringify({ content: { sha: 'abc123' } }), { status: 200 });
      }
      if (url.includes('/owners') && method === 'GET') {
        return new Response(JSON.stringify([{ owner: { id: 'owner-1' } }]), { status: 200 });
      }
      if (url.endsWith('/services/stale-service-id') && method === 'GET') {
        return new Response(JSON.stringify({ error: 'Service not found' }), { status: 404 });
      }
      if (url.includes('/services?limit=100') && method === 'GET') {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (url.includes('/services') && method === 'POST') {
        return new Response(JSON.stringify({
          id: 'new-service-id',
          url: 'https://od-render-p1.onrender.com',
        }), { status: 200 });
      }
      if (url.includes('/deploys?limit=1') && method === 'GET') {
        return new Response(JSON.stringify([{ deploy: { id: 'render-deploy-1' } }]), { status: 200 });
      }
      if (url.includes('/deploys/render-deploy-1') && method === 'GET') {
        return new Response(JSON.stringify({ status: 'live' }), { status: 200 });
      }
      if (url === 'https://od-render-p1.onrender.com' && method === 'HEAD') {
        return new Response('', { status: 200 });
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    stubGlobalFetch(fetchMock);

    const result = await deployToRender({
      config: { token: 'render-token-secret', githubToken: 'ghp-test-token' },
      projectId: 'p1',
      files: [
        {
          file: 'index.html',
          data: Buffer.from('<!doctype html><h1>Hello Render</h1>'),
          contentType: 'text/html',
        },
      ],
      priorMetadata: { serviceId: 'stale-service-id', serviceUrl: 'https://stale.onrender.com' },
    });

    expect(result).toMatchObject({
      providerId: 'render',
      url: 'https://od-render-p1.onrender.com',
      deploymentId: 'new-service-id',
    });
    expect(requestedUrls).toContain('GET https://api.render.com/v1/services/stale-service-id');
    expect(requestedUrls).toContain('POST https://api.render.com/v1/services');
  });

  it('throws DeployError when Render services lookup returns non-2xx API error (duplicate protection)', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : String(input);
      const method = init?.method || 'GET';

      if (url === 'https://api.github.com/user' && method === 'GET') {
        return new Response(JSON.stringify({ login: 'octo' }), { status: 200 });
      }
      if (url === 'https://api.github.com/repos/octo/od-render-p1' && method === 'GET') {
        return new Response(JSON.stringify({ id: 123 }), { status: 200 });
      }
      if (url.startsWith('https://api.github.com/repos/octo/od-render-p1/contents/') && method === 'GET') {
        return new Response('', { status: 404 });
      }
      if (url.startsWith('https://api.github.com/repos/octo/od-render-p1/contents/') && method === 'PUT') {
        return new Response(JSON.stringify({ content: { sha: 'abc123' } }), { status: 200 });
      }
      if (url.includes('/owners') && method === 'GET') {
        return new Response(JSON.stringify([{ owner: { id: 'owner-1' } }]), { status: 200 });
      }
      if (url.includes('/services?limit=100') && method === 'GET') {
        return new Response('Internal Server Error', { status: 500 });
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    stubGlobalFetch(fetchMock);

    await expect(
      deployToRender({
        config: { token: 'render-token-secret', githubToken: 'ghp-test-token' },
        projectId: 'p1',
        files: [
          {
            file: 'index.html',
            data: Buffer.from('<!doctype html><h1>Hello Render</h1>'),
            contentType: 'text/html',
          },
        ],
      })
    ).rejects.toThrowError(/Failed to search existing Render services: 500/);
  });

  it('throws DeployError when Render pre-trigger lookup fails and trigger response lacks deployId', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : String(input);
      const method = init?.method || 'GET';

      if (url === 'https://api.github.com/user' && method === 'GET') {
        return new Response(JSON.stringify({ login: 'octo' }), { status: 200 });
      }
      if (url === 'https://api.github.com/repos/octo/od-render-p1' && method === 'GET') {
        return new Response(JSON.stringify({ id: 123 }), { status: 200 });
      }
      if (url.startsWith('https://api.github.com/repos/octo/od-render-p1/contents/') && method === 'GET') {
        return new Response('', { status: 404 });
      }
      if (url.startsWith('https://api.github.com/repos/octo/od-render-p1/contents/') && method === 'PUT') {
        return new Response(JSON.stringify({ content: { sha: 'abc123' } }), { status: 200 });
      }
      if (url.includes('/owners') && method === 'GET') {
        return new Response(JSON.stringify([{ owner: { id: 'owner-1' } }]), { status: 200 });
      }
      if (url.includes('/services?limit=100') && method === 'GET') {
        return new Response(JSON.stringify([{ service: { id: 'render-service-1', name: 'od-render-p1', url: 'https://od-render-p1.onrender.com' } }]), { status: 200 });
      }
      if (url.includes('/services/render-service-1/deploys?limit=1') && method === 'GET') {
        return new Response('Internal Server Error', { status: 500 });
      }
      if (url.includes('/services/render-service-1/deploys') && method === 'POST') {
        return new Response(JSON.stringify({}), { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    stubGlobalFetch(fetchMock);

    await expect(
      deployToRender({
        config: { token: 'render-token-secret', githubToken: 'ghp-test-token' },
        projectId: 'p1',
        files: [
          {
            file: 'index.html',
            data: Buffer.from('<!doctype html><h1>Hello Render</h1>'),
            contentType: 'text/html',
          },
        ],
        priorMetadata: { serviceId: 'render-service-1', serviceUrl: 'https://od-render-p1.onrender.com' },
      })
    ).rejects.toThrowError(/baseline deployment ID could not be established/);
  });

  it('throws DeployError when Render trigger response omits id + latest deploy never advances', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : String(input);
      const method = init?.method || 'GET';

      if (url === 'https://api.github.com/user' && method === 'GET') {
        return new Response(JSON.stringify({ login: 'octo' }), { status: 200 });
      }
      if (url === 'https://api.github.com/repos/octo/od-render-p1' && method === 'GET') {
        return new Response(JSON.stringify({ id: 123 }), { status: 200 });
      }
      if (url.startsWith('https://api.github.com/repos/octo/od-render-p1/contents/') && method === 'GET') {
        return new Response('', { status: 404 });
      }
      if (url.startsWith('https://api.github.com/repos/octo/od-render-p1/contents/') && method === 'PUT') {
        return new Response(JSON.stringify({ content: { sha: 'abc123' } }), { status: 200 });
      }
      if (url.includes('/owners') && method === 'GET') {
        return new Response(JSON.stringify([{ owner: { id: 'owner-1' } }]), { status: 200 });
      }
      if (url.includes('/services?limit=100') && method === 'GET') {
        return new Response(JSON.stringify([{ service: { id: 'render-service-1', name: 'od-render-p1', url: 'https://od-render-p1.onrender.com' } }]), { status: 200 });
      }
      if (url.includes('/services/render-service-1/deploys?limit=1') && method === 'GET') {
        // Return the stale deploy ID
        return new Response(JSON.stringify([{ deploy: { id: 'render-deploy-old' } }]), { status: 200 });
      }
      if (url.includes('/services/render-service-1/deploys') && method === 'POST') {
        return new Response(JSON.stringify({}), { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    stubGlobalFetch(fetchMock);

    await expect(
      deployToRender({
        config: { token: 'render-token-secret', githubToken: 'ghp-test-token' },
        projectId: 'p1',
        files: [
          {
            file: 'index.html',
            data: Buffer.from('<!doctype html><h1>Hello Render</h1>'),
            contentType: 'text/html',
          },
        ],
        priorMetadata: { serviceId: 'render-service-1', serviceUrl: 'https://od-render-p1.onrender.com' },
      })
    ).rejects.toThrowError(/Failed to resolve new Render deployment after trigger/);
  });
});

describe('netlify and railway deploys', () => {
  it('polls Netlify deploy readiness and returns the live site URL first', async () => {
    const requestedUrls: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
      const method = init?.method || (input instanceof Request ? input.method : 'GET');
      requestedUrls.push(`${method} ${url}`);

      // GitHub user
      if (url === 'https://api.github.com/user' && method === 'GET') {
        return new Response(JSON.stringify({ login: 'testuser' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      // GitHub repo check (exists)
      if (url === 'https://api.github.com/repos/testuser/od-netlify-p1' && method === 'GET') {
        return new Response(JSON.stringify({ id: 123, name: 'od-netlify-p1' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      // GitHub deploy key creation
      if (url === 'https://api.github.com/repos/testuser/od-netlify-p1/keys' && method === 'POST') {
        return new Response(JSON.stringify({ id: 789 }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        });
      }
      // GitHub file upload
      if (url.startsWith('https://api.github.com/repos/testuser/od-netlify-p1/contents/') && method === 'GET') {
        return new Response('', { status: 404 });
      }
      if (url.startsWith('https://api.github.com/repos/testuser/od-netlify-p1/contents/') && method === 'PUT') {
        return new Response(JSON.stringify({ content: { sha: 'abc123' } }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (url.includes('/sites?name=od-p1') && method === 'GET') {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/deploy_keys') && method === 'POST') {
        return new Response(JSON.stringify({ id: 'deploy-key-1', public_key: 'ssh-rsa AAAAB3NzaC1...' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/sites') && method === 'POST') {
        return new Response(JSON.stringify({ id: 'site-1', site_id: 'site-1' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/sites/site-1') && method === 'PUT') {
        return new Response(JSON.stringify({ id: 'site-1', site_id: 'site-1' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/sites/site-1/builds') && method === 'POST') {
        return new Response(JSON.stringify({
          id: 'deploy-1',
          deploy_id: 'deploy-1',
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/deploys/deploy-1') && method === 'GET') {
        return new Response(JSON.stringify({
          id: 'deploy-1',
          state: 'ready',
          deploy_ssl_url: 'https://deploy--example.netlify.app',
          ssl_url: 'https://example.netlify.app',
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://example.netlify.app' && method === 'HEAD') {
        return new Response('', { status: 200 });
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    stubGlobalFetch(fetchMock);

    const result = await deployToNetlify({
      config: { token: 'netlify-token-secret', githubToken: 'ghp-test-token' },
      projectId: 'p1',
      projectsRoot: '/tmp/test-projects',
      files: [
        {
          file: 'index.html',
          data: Buffer.from('<!doctype html><h1>Hello</h1>'),
          contentType: 'text/html',
        },
      ],
    });

    expect(result).toMatchObject({
      providerId: NETLIFY_PROVIDER_ID,
      url: 'https://example.netlify.app',
      deploymentId: 'deploy-1',
      status: 'ready',
    });
    expect(requestedUrls).toContain('GET https://api.netlify.com/api/v1/deploys/deploy-1');
  });

  it('throws DeployError when existing site repository settings update fails', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
      const method = init?.method || (input instanceof Request ? input.method : 'GET');

      if (url === 'https://api.github.com/user' && method === 'GET') {
        return new Response(JSON.stringify({ login: 'testuser' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://api.github.com/repos/testuser/od-netlify-p1' && method === 'GET') {
        return new Response(JSON.stringify({ id: 123, name: 'od-netlify-p1' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://api.github.com/repos/testuser/od-netlify-p1/keys' && method === 'POST') {
        return new Response(JSON.stringify({ id: 789 }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.startsWith('https://api.github.com/repos/testuser/od-netlify-p1/contents/') && method === 'GET') {
        return new Response('', { status: 404 });
      }
      if (url.startsWith('https://api.github.com/repos/testuser/od-netlify-p1/contents/') && method === 'PUT') {
        return new Response(JSON.stringify({ content: { sha: 'abc123' } }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/deploy_keys') && method === 'POST') {
        return new Response(JSON.stringify({ id: 'deploy-key-1', public_key: 'ssh-rsa AAAAB3NzaC1...' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/deploy_keys/deploy-key-1') && method === 'GET') {
        return new Response(JSON.stringify({ id: 'deploy-key-1', public_key: 'ssh-rsa AAAAB3NzaC1...' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/sites/site-1') && method === 'GET') {
        return new Response(JSON.stringify({ id: 'site-1', site_id: 'site-1', deploy_key_id: 'deploy-key-1' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/sites/site-1') && method === 'PUT') {
        return new Response(JSON.stringify({ message: 'Repository settings update rejected' }), {
          status: 422,
          headers: { 'content-type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    stubGlobalFetch(fetchMock);

    await expect(
      deployToNetlify({
        config: { token: 'netlify-token-secret', githubToken: 'ghp-test-token' },
        projectId: 'p1',
        files: [
          {
            file: 'index.html',
            data: Buffer.from('<!doctype html><h1>Hello</h1>'),
            contentType: 'text/html',
          },
        ],
        priorMetadata: { siteId: 'site-1' },
      })
    ).rejects.toThrowError(/Repository settings update rejected/);
  });

  it('throws DeployError when fallback site repository settings update fails', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
      const method = init?.method || (input instanceof Request ? input.method : 'GET');

      if (url === 'https://api.github.com/user' && method === 'GET') {
        return new Response(JSON.stringify({ login: 'testuser' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://api.github.com/repos/testuser/od-netlify-p1' && method === 'GET') {
        return new Response(JSON.stringify({ id: 123, name: 'od-netlify-p1' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://api.github.com/repos/testuser/od-netlify-p1/keys' && method === 'POST') {
        return new Response(JSON.stringify({ id: 789 }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.startsWith('https://api.github.com/repos/testuser/od-netlify-p1/contents/') && method === 'GET') {
        return new Response('', { status: 404 });
      }
      if (url.startsWith('https://api.github.com/repos/testuser/od-netlify-p1/contents/') && method === 'PUT') {
        return new Response(JSON.stringify({ content: { sha: 'abc123' } }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/sites?name=od-p1') && method === 'GET') {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/deploy_keys') && method === 'POST') {
        return new Response(JSON.stringify({ id: 'deploy-key-1', public_key: 'ssh-rsa AAAAB3NzaC1...' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/sites') && method === 'POST') {
        const parsed = JSON.parse(init?.body ? String(init.body) : '{}');
        if (parsed.repo) {
          return new Response(JSON.stringify({ message: 'Direct create failed' }), {
            status: 400,
            headers: { 'content-type': 'application/json' },
          });
        } else {
          return new Response(JSON.stringify({ id: 'site-fallback', site_id: 'site-fallback' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
      }
      if (url.endsWith('/sites/site-fallback') && method === 'PUT') {
        return new Response(JSON.stringify({ message: 'Fallback update rejected' }), {
          status: 422,
          headers: { 'content-type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    stubGlobalFetch(fetchMock);

    await expect(
      deployToNetlify({
        config: { token: 'netlify-token-secret', githubToken: 'ghp-test-token' },
        projectId: 'p1',
        files: [
          {
            file: 'index.html',
            data: Buffer.from('<!doctype html><h1>Hello</h1>'),
            contentType: 'text/html',
          },
        ],
      })
    ).rejects.toThrowError(/Fallback update rejected/);
  });

  it('threads the actual GitHub repository visibility (private) to Netlify repo settings payload', async () => {
    const netlifyRepoPayloads: any[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
      const method = init?.method || (input instanceof Request ? input.method : 'GET');

      // GitHub user
      if (url === 'https://api.github.com/user' && method === 'GET') {
        return new Response(JSON.stringify({ login: 'testuser' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      // GitHub repo check (exists and is private)
      if (url === 'https://api.github.com/repos/testuser/od-netlify-p1' && method === 'GET') {
        return new Response(JSON.stringify({ id: 123, name: 'od-netlify-p1', private: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      // GitHub deploy key creation
      if (url === 'https://api.github.com/repos/testuser/od-netlify-p1/keys' && method === 'POST') {
        return new Response(JSON.stringify({ id: 789 }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        });
      }
      // GitHub file upload
      if (url.startsWith('https://api.github.com/repos/testuser/od-netlify-p1/contents/') && method === 'GET') {
        return new Response('', { status: 404 });
      }
      if (url.startsWith('https://api.github.com/repos/testuser/od-netlify-p1/contents/') && method === 'PUT') {
        return new Response(JSON.stringify({ content: { sha: 'abc123' } }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (url.includes('/sites?name=od-p1') && method === 'GET') {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/deploy_keys') && method === 'POST') {
        return new Response(JSON.stringify({ id: 'deploy-key-1', public_key: 'ssh-rsa AAAAB3NzaC1...' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/sites') && method === 'POST') {
        const parsed = JSON.parse(String(init?.body ?? '{}'));
        netlifyRepoPayloads.push(parsed.repo);
        return new Response(JSON.stringify({ id: 'site-1', site_id: 'site-1' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/sites/site-1/builds') && method === 'POST') {
        return new Response(JSON.stringify({
          id: 'deploy-1',
          deploy_id: 'deploy-1',
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/deploys/deploy-1') && method === 'GET') {
        return new Response(JSON.stringify({
          id: 'deploy-1',
          state: 'ready',
          deploy_ssl_url: 'https://deploy--example.netlify.app',
          ssl_url: 'https://example.netlify.app',
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://example.netlify.app' && method === 'HEAD') {
        return new Response('', { status: 200 });
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    stubGlobalFetch(fetchMock);

    await deployToNetlify({
      config: { token: 'netlify-token-secret', githubToken: 'ghp-test-token' },
      projectId: 'p1',
      files: [
        {
          file: 'index.html',
          data: Buffer.from('<!doctype html><h1>Hello</h1>'),
          contentType: 'text/html',
        },
      ],
    });

    expect(netlifyRepoPayloads.length).toBe(1);
    expect(netlifyRepoPayloads[0]).toMatchObject({
      provider: 'github',
      repo_id: 123,
      private: true,
    });
  });

  it('throws DeployError when Netlify build trigger fails with 4xx/5xx', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
      const method = init?.method || (input instanceof Request ? input.method : 'GET');

      // GitHub user
      if (url === 'https://api.github.com/user' && method === 'GET') {
        return new Response(JSON.stringify({ login: 'testuser' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      // GitHub repo check (exists)
      if (url === 'https://api.github.com/repos/testuser/od-netlify-p1' && method === 'GET') {
        return new Response(JSON.stringify({ id: 123, name: 'od-netlify-p1' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      // GitHub deploy key creation
      if (url === 'https://api.github.com/repos/testuser/od-netlify-p1/keys' && method === 'POST') {
        return new Response(JSON.stringify({ id: 789 }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        });
      }
      // GitHub file upload
      if (url.startsWith('https://api.github.com/repos/testuser/od-netlify-p1/contents/') && method === 'GET') {
        return new Response('', { status: 404 });
      }
      if (url.startsWith('https://api.github.com/repos/testuser/od-netlify-p1/contents/') && method === 'PUT') {
        return new Response(JSON.stringify({ content: { sha: 'abc123' } }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (url.includes('/sites?name=od-p1') && method === 'GET') {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/deploy_keys') && method === 'POST') {
        return new Response(JSON.stringify({ id: 'deploy-key-1', public_key: 'ssh-rsa AAAAB3NzaC1...' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/sites') && method === 'POST') {
        return new Response(JSON.stringify({ id: 'site-1', site_id: 'site-1' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      // Netlify builds fails
      if (url.endsWith('/sites/site-1/builds') && method === 'POST') {
        return new Response(JSON.stringify({ message: 'Build trigger rate limit exceeded' }), {
          status: 429,
          headers: { 'content-type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    stubGlobalFetch(fetchMock);

    await expect(
      deployToNetlify({
        config: { token: 'netlify-token-secret', githubToken: 'ghp-test-token' },
        projectId: 'p1',
        files: [
          {
            file: 'index.html',
            data: Buffer.from('<!doctype html><h1>Hello</h1>'),
            contentType: 'text/html',
          },
        ],
      })
    ).rejects.toThrowError(/Build trigger rate limit exceeded/);
  });

  it('reuses the existing Netlify deploy key on subsequent deploys', async () => {
    let deployKeysCreated = 0;
    let githubKeysAdded = 0;

    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
      const method = init?.method || (input instanceof Request ? input.method : 'GET');

      if (url === 'https://api.github.com/user' && method === 'GET') {
        return new Response(JSON.stringify({ login: 'testuser' }), { status: 200 });
      }
      if (url === 'https://api.github.com/repos/testuser/od-netlify-p1' && method === 'GET') {
        return new Response(JSON.stringify({ id: 123, name: 'od-netlify-p1' }), { status: 200 });
      }
      if (url === 'https://api.github.com/repos/testuser/od-netlify-p1/keys' && method === 'POST') {
        githubKeysAdded++;
        return new Response(JSON.stringify({ id: 789 }), { status: 201 });
      }
      if (url.startsWith('https://api.github.com/repos/testuser/od-netlify-p1/contents/') && method === 'GET') {
        return new Response('', { status: 404 });
      }
      if (url.startsWith('https://api.github.com/repos/testuser/od-netlify-p1/contents/') && method === 'PUT') {
        return new Response(JSON.stringify({ content: { sha: 'abc123' } }), { status: 201 });
      }
      if (url.includes('/sites?name=od-p1') && method === 'GET') {
        return new Response(JSON.stringify([{ id: 'site-1', site_id: 'site-1', deploy_key_id: 'existing-key-id' }]), { status: 200 });
      }
      if (url.endsWith('/sites/site-1') && method === 'GET') {
        return new Response(JSON.stringify({ id: 'site-1', site_id: 'site-1', deploy_key_id: 'existing-key-id' }), { status: 200 });
      }
      if (url.endsWith('/deploy_keys/existing-key-id') && method === 'GET') {
        return new Response(JSON.stringify({ id: 'existing-key-id', public_key: 'ssh-rsa AAAAB3NzaC1...' }), { status: 200 });
      }
      if (url.endsWith('/deploy_keys') && method === 'POST') {
        deployKeysCreated++;
        return new Response(JSON.stringify({ id: 'deploy-key-1', public_key: 'ssh-rsa AAAAB3NzaC1...' }), { status: 200 });
      }
      if (url.endsWith('/sites/site-1') && method === 'PUT') {
        return new Response(JSON.stringify({ id: 'site-1', site_id: 'site-1' }), { status: 200 });
      }
      if (url.endsWith('/sites/site-1/builds') && method === 'POST') {
        return new Response(JSON.stringify({ deploy_id: 'deploy-1' }), { status: 200 });
      }
      if (url.endsWith('/deploys/deploy-1') && method === 'GET') {
        return new Response(JSON.stringify({
          id: 'deploy-1',
          state: 'ready',
          deploy_ssl_url: 'https://deploy--example.netlify.app',
          ssl_url: 'https://example.netlify.app',
        }), { status: 200 });
      }
      if (url === 'https://example.netlify.app' && method === 'HEAD') {
        return new Response('', { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    stubGlobalFetch(fetchMock);

    // First deploy with priorMetadata containing deployKeyId
    const result = await deployToNetlify({
      config: { token: 'netlify-token-secret', githubToken: 'github-token-secret' },
      projectId: 'p1',
      files: [
        {
          file: 'index.html',
          data: Buffer.from('<!doctype html><h1>Hello</h1>'),
          contentType: 'text/html',
        },
      ],
      priorMetadata: { siteId: 'site-1', deployKeyId: 'existing-key-id' },
    });

    expect(result.providerMetadata?.deployKeyId).toBe('existing-key-id');
    expect(deployKeysCreated).toBe(0);
    expect(githubKeysAdded).toBe(1);
  });

  it('handles non-main default branch (e.g. master) on Netlify deploys', async () => {
    let updateSiteBody: any = null;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
      const method = init?.method || (input instanceof Request ? input.method : 'GET');

      if (url === 'https://api.github.com/user' && method === 'GET') {
        return new Response(JSON.stringify({ login: 'testuser' }), { status: 200 });
      }
      if (url === 'https://api.github.com/repos/testuser/od-netlify-p1' && method === 'GET') {
        return new Response(JSON.stringify({ id: 123, name: 'od-netlify-p1', default_branch: 'master' }), { status: 200 });
      }
      if (url === 'https://api.github.com/repos/testuser/od-netlify-p1/keys' && method === 'POST') {
        return new Response(JSON.stringify({ id: 789 }), { status: 201 });
      }
      if (url.startsWith('https://api.github.com/repos/testuser/od-netlify-p1/contents/') && method === 'GET') {
        return new Response('', { status: 404 });
      }
      if (url.startsWith('https://api.github.com/repos/testuser/od-netlify-p1/contents/') && method === 'PUT') {
        return new Response(JSON.stringify({ content: { sha: 'abc123' } }), { status: 201 });
      }
      if (url.includes('/sites?name=od-p1') && method === 'GET') {
        return new Response(JSON.stringify([{ id: 'site-1', site_id: 'site-1', deploy_key_id: 'existing-key-id' }]), { status: 200 });
      }
      if (url.endsWith('/sites/site-1') && method === 'GET') {
        return new Response(JSON.stringify({ id: 'site-1', site_id: 'site-1', deploy_key_id: 'existing-key-id' }), { status: 200 });
      }
      if (url.endsWith('/deploy_keys/existing-key-id') && method === 'GET') {
        return new Response(JSON.stringify({ id: 'existing-key-id', public_key: 'ssh-rsa AAAAB3NzaC1...' }), { status: 200 });
      }
      if (url.endsWith('/sites/site-1') && method === 'PUT') {
        updateSiteBody = JSON.parse(String(init?.body ?? '{}'));
        return new Response(JSON.stringify({ id: 'site-1', site_id: 'site-1' }), { status: 200 });
      }
      if (url.endsWith('/sites/site-1/builds') && method === 'POST') {
        return new Response(JSON.stringify({ deploy_id: 'deploy-1' }), { status: 200 });
      }
      if (url.endsWith('/deploys/deploy-1') && method === 'GET') {
        return new Response(JSON.stringify({
          id: 'deploy-1',
          state: 'ready',
          deploy_ssl_url: 'https://deploy--example.netlify.app',
          ssl_url: 'https://example.netlify.app',
        }), { status: 200 });
      }
      if (url === 'https://example.netlify.app' && method === 'HEAD') {
        return new Response('', { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    stubGlobalFetch(fetchMock);

    await deployToNetlify({
      config: { token: 'netlify-token-secret', githubToken: 'github-token-secret' },
      projectId: 'p1',
      files: [
        {
          file: 'index.html',
          data: Buffer.from('<!doctype html><h1>Hello</h1>'),
          contentType: 'text/html',
        },
      ],
      priorMetadata: { siteId: 'site-1', deployKeyId: 'existing-key-id' },
    });

    expect(updateSiteBody?.repo?.branch).toBe('master');
  });

  it('polls and resolves new Netlify deploy when trigger response lacks deploy_id and new deploy is delayed', async () => {
    let getDeploysCount = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
      const method = init?.method || (input instanceof Request ? input.method : 'GET');

      if (url === 'https://api.github.com/user' && method === 'GET') {
        return new Response(JSON.stringify({ login: 'testuser' }), { status: 200 });
      }
      if (url === 'https://api.github.com/repos/testuser/od-netlify-p1' && method === 'GET') {
        return new Response(JSON.stringify({ id: 123, name: 'od-netlify-p1' }), { status: 200 });
      }
      if (url === 'https://api.github.com/repos/testuser/od-netlify-p1/keys' && method === 'POST') {
        return new Response(JSON.stringify({ id: 789 }), { status: 201 });
      }
      if (url.startsWith('https://api.github.com/repos/testuser/od-netlify-p1/contents/') && method === 'GET') {
        return new Response('', { status: 404 });
      }
      if (url.startsWith('https://api.github.com/repos/testuser/od-netlify-p1/contents/') && method === 'PUT') {
        return new Response(JSON.stringify({ content: { sha: 'abc123' } }), { status: 201 });
      }
      if (url.includes('/sites?name=od-p1') && method === 'GET') {
        return new Response(JSON.stringify([{ id: 'site-1', site_id: 'site-1', deploy_key_id: 'existing-key-id' }]), { status: 200 });
      }
      if (url.endsWith('/sites/site-1') && method === 'GET') {
        return new Response(JSON.stringify({ id: 'site-1', site_id: 'site-1', deploy_key_id: 'existing-key-id' }), { status: 200 });
      }
      if (url.endsWith('/deploy_keys/existing-key-id') && method === 'GET') {
        return new Response(JSON.stringify({ id: 'existing-key-id', public_key: 'ssh-rsa AAAAB3NzaC1...' }), { status: 200 });
      }
      if (url.endsWith('/sites/site-1') && method === 'PUT') {
        return new Response(JSON.stringify({ id: 'site-1', site_id: 'site-1' }), { status: 200 });
      }
      if (url.endsWith('/sites/site-1/builds') && method === 'POST') {
        // Return success but omit deploy_id to trigger fallback
        return new Response(JSON.stringify({}), { status: 200 });
      }
      if (url.endsWith('/sites/site-1/deploys?per_page=1') && method === 'GET') {
        getDeploysCount++;
        if (getDeploysCount === 1) {
          // Latest deploy before the trigger attempt
          return new Response(JSON.stringify([{ id: 'deploy-old', state: 'ready' }]), { status: 200 });
        }
        if (getDeploysCount === 2) {
          // First check after trigger, new deploy hasn't shown up yet (returns old deploy ID)
          return new Response(JSON.stringify([{ id: 'deploy-old', state: 'ready' }]), { status: 200 });
        }
        // Second check after trigger, new deploy has shown up!
        return new Response(JSON.stringify([{ id: 'deploy-new', state: 'processing' }]), { status: 200 });
      }
      if (url.endsWith('/deploys/deploy-new') && method === 'GET') {
        return new Response(JSON.stringify({
          id: 'deploy-new',
          state: 'ready',
          deploy_ssl_url: 'https://deploy--example.netlify.app',
          ssl_url: 'https://example.netlify.app',
        }), { status: 200 });
      }
      if (url === 'https://example.netlify.app' && method === 'HEAD') {
        return new Response('', { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    stubGlobalFetch(fetchMock);

    const result = await deployToNetlify({
      config: { token: 'netlify-token-secret', githubToken: 'github-token-secret' },
      projectId: 'p1',
      files: [
        {
          file: 'index.html',
          data: Buffer.from('<!doctype html><h1>Hello</h1>'),
          contentType: 'text/html',
        },
      ],
      priorMetadata: { siteId: 'site-1', deployKeyId: 'existing-key-id' },
    });

    expect(result.deploymentId).toBe('deploy-new');
    expect(getDeploysCount).toBe(3); // 1 before trigger, 2 after trigger
  });

  it('creates a Railway project, service, deployment, and service domain from the UI-backed file set', async () => {
    const graphQlCalls: Array<{ query: string; variables: Record<string, unknown> }> = [];
    const uploadedPaths: string[] = [];
    const files = [
      {
        file: 'index.html',
        data: Buffer.from('<!doctype html><h1>Hello Railway</h1>'),
        contentType: 'text/html',
      },
    ];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
      const method = init?.method || (input instanceof Request ? input.method : 'GET');

      if (url === 'https://api.github.com/user' && method === 'GET') {
        return new Response(JSON.stringify({ login: 'octo' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://api.github.com/repos/octo/od-railway-p1' && method === 'GET') {
        return new Response(JSON.stringify({ id: 123 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.startsWith('https://api.github.com/repos/octo/od-railway-p1/contents/') && method === 'GET') {
        return new Response(JSON.stringify({ message: 'not found' }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.startsWith('https://api.github.com/repos/octo/od-railway-p1/contents/') && method === 'PUT') {
        const pathName = decodeURIComponent(url.split('/contents/')[1] ?? '');
        uploadedPaths.push(pathName);
        return new Response(JSON.stringify({ content: { path: pathName } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://backboard.railway.com/graphql/v2' && method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        graphQlCalls.push(body);
        const query = String(body.query ?? '');
        if (query.includes('query projects')) {
          return new Response(JSON.stringify({ data: { projects: { edges: [] } } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (query.includes('mutation projectCreate')) {
          return new Response(JSON.stringify({ data: { projectCreate: { id: 'railway-project-1', name: 'od-railway-p1' } } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (query.includes('query environments')) {
          return new Response(JSON.stringify({
            data: {
              environments: {
                edges: [{ node: { id: 'environment-1', name: 'production' } }],
              },
            },
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (query.includes('query services')) {
          return new Response(JSON.stringify({ data: { services: { edges: [] } } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (query.includes('query deployments')) {
          return new Response(JSON.stringify({
            data: {
              deployments: {
                edges: [{ node: { id: 'deploy-new', status: 'ACTIVE', url: 'https://od-railway-p1.up.railway.app' } }],
              },
            },
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (query.includes('query deployment(')) {
          return new Response(JSON.stringify({
            data: {
              deployment: {
                id: 'deploy-new',
                status: 'ACTIVE',
              },
            },
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (query.includes('mutation serviceCreate')) {
          return new Response(JSON.stringify({ data: { serviceCreate: { id: 'service-1', name: 'od-railway-p1' } } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (query.includes('mutation serviceInstanceDeploy')) {
          return new Response(JSON.stringify({ data: { serviceInstanceDeploy: true } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (query.includes('query domains')) {
          return new Response(JSON.stringify({ data: { domains: { serviceDomains: [] } } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (query.includes('mutation serviceDomainCreate')) {
          return new Response(JSON.stringify({
            data: {
              serviceDomainCreate: {
                id: 'domain-1',
                domain: 'od-railway-p1.up.railway.app',
              },
            },
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
      }
      if (url === 'https://od-railway-p1.up.railway.app' && method === 'HEAD') {
        return new Response('', { status: 200 });
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    stubGlobalFetch(fetchMock);

    const result = await deployToRailway({
      config: { token: 'railway-token-secret', githubToken: 'github-token-secret' },
      projectId: 'p1',
      projectsRoot: 'C:\\tmp\\projects',
      files,
    });

    expect(result).toMatchObject({
      providerId: RAILWAY_PROVIDER_ID,
      url: 'https://od-railway-p1.up.railway.app',
      deploymentId: 'deploy-new',
      status: 'ready',
      providerMetadata: {
        railwayProjectId: 'railway-project-1',
        environmentId: 'environment-1',
        serviceId: 'service-1',
        serviceUrl: 'https://od-railway-p1.up.railway.app',
        railwayDeployId: 'deploy-new',
      },
    });
    expect(uploadedPaths).toEqual(['index.html', 'Staticfile']);
    expect(files.find((file) => file.file === 'Staticfile')?.data).toBe('root: .\nindex_fallback: true\n');
    expect(graphQlCalls.some((call) => call.query.includes('mutation projectCreate'))).toBe(true);
    expect(graphQlCalls.some((call) => call.query.includes('mutation serviceCreate'))).toBe(true);
    expect(graphQlCalls.some((call) => call.query.includes('mutation serviceInstanceDeploy'))).toBe(false);
    expect(graphQlCalls.some((call) => call.query.includes('mutation serviceDomainCreate'))).toBe(true);
  });

  it('throws a non-2xx DeployError when Railway GraphQL API returns 200 OK with errors array', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
      const method = init?.method || (input instanceof Request ? input.method : 'GET');

      if (url === 'https://api.github.com/user' && method === 'GET') {
        return new Response(JSON.stringify({ login: 'octo' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://api.github.com/repos/octo/od-railway-p1' && method === 'GET') {
        return new Response(JSON.stringify({ id: 123 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.startsWith('https://api.github.com/repos/octo/od-railway-p1/contents/') && method === 'GET') {
        return new Response(JSON.stringify({ message: 'not found' }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.startsWith('https://api.github.com/repos/octo/od-railway-p1/contents/') && method === 'PUT') {
        return new Response(JSON.stringify({ content: { path: 'index.html' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://backboard.railway.com/graphql/v2' && method === 'POST') {
        return new Response(
          JSON.stringify({
            errors: [
              {
                message: 'Invalid Railway API Token',
              },
            ],
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        );
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    stubGlobalFetch(fetchMock);

    const files = [
      {
        file: 'index.html',
        data: Buffer.from('<!doctype html><h1>Hello Railway</h1>'),
        contentType: 'text/html',
      },
    ];

    await expect(
      deployToRailway({
        config: { token: 'railway-token-secret', githubToken: 'github-token-secret' },
        projectId: 'p1',
        files,
      })
    ).rejects.toThrowError(/Invalid Railway API Token/);

    try {
      await deployToRailway({
        config: { token: 'railway-token-secret', githubToken: 'github-token-secret' },
        projectId: 'p1',
        files,
      });
      throw new Error('Should have thrown');
    } catch (err: any) {
      expect(err.name).toBe('DeployError');
      expect(err.status).toBe(502);
    }
  });

  it('throws DeployError when both Railway deploy mutations fail', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
      const method = init?.method || (input instanceof Request ? input.method : 'GET');

      if (url === 'https://api.github.com/user' && method === 'GET') {
        return new Response(JSON.stringify({ login: 'octo' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://api.github.com/repos/octo/od-railway-p1' && method === 'GET') {
        return new Response(JSON.stringify({ id: 123 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.startsWith('https://api.github.com/repos/octo/od-railway-p1/contents/') && method === 'GET') {
        return new Response(JSON.stringify({ message: 'not found' }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.startsWith('https://api.github.com/repos/octo/od-railway-p1/contents/') && method === 'PUT') {
        return new Response(JSON.stringify({ content: { path: 'index.html' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://backboard.railway.com/graphql/v2' && method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        const query = String(body.query ?? '');
        if (query.includes('query projects')) {
          return new Response(JSON.stringify({ data: { projects: { edges: [] } } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (query.includes('mutation projectCreate')) {
          return new Response(JSON.stringify({ data: { projectCreate: { id: 'railway-project-1', name: 'od-railway-p1' } } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (query.includes('query environments')) {
          return new Response(
            JSON.stringify({
              data: {
                environments: {
                  edges: [{ node: { id: 'environment-1', name: 'production' } }],
                },
              },
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          );
        }
        if (query.includes('query services')) {
          return new Response(JSON.stringify({ data: { services: { edges: [] } } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (query.includes('query deployments')) {
          return new Response(JSON.stringify({
            data: {
              deployments: {
                edges: [{ node: { id: 'deploy-pre', status: 'ACTIVE', url: 'https://od-railway-p1.up.railway.app' } }],
              },
            },
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (query.includes('mutation serviceCreate')) {
          return new Response(JSON.stringify({ data: { serviceCreate: { id: 'service-1', name: 'od-railway-p1' } } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (query.includes('mutation serviceInstanceDeploy(')) {
          return new Response(
            JSON.stringify({
              errors: [
                {
                  message: 'Mutation serviceInstanceDeploy failed',
                },
              ],
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          );
        }
        if (query.includes('mutation serviceInstanceDeployV2')) {
          return new Response(
            JSON.stringify({
              errors: [
                {
                  message: 'Mutation serviceInstanceDeployV2 failed too',
                },
              ],
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          );
        }
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    stubGlobalFetch(fetchMock);

    const files = [
      {
        file: 'index.html',
        data: Buffer.from('<!doctype html><h1>Hello Railway</h1>'),
        contentType: 'text/html',
      },
    ];

    await expect(
      deployToRailway({
        config: { token: 'railway-token-secret', githubToken: 'github-token-secret' },
        projectId: 'p1',
        files,
        priorMetadata: { serviceId: 'service-1' },
      })
    ).rejects.toThrowError(/both V1 and V2 mutations failed/);
  });

  it('triggers Railway deployment mutation for existing services', async () => {
    const graphQlCalls: Array<{ query: string; variables: Record<string, unknown> }> = [];
    let triggered = false;
    const files = [
      {
        file: 'index.html',
        data: Buffer.from('<!doctype html><h1>Hello Railway</h1>'),
        contentType: 'text/html',
      },
    ];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
      const method = init?.method || (input instanceof Request ? input.method : 'GET');

      if (url === 'https://api.github.com/user' && method === 'GET') {
        return new Response(JSON.stringify({ login: 'octo' }), { status: 200 });
      }
      if (url === 'https://api.github.com/repos/octo/od-railway-p1' && method === 'GET') {
        return new Response(JSON.stringify({ id: 123 }), { status: 200 });
      }
      if (url.startsWith('https://api.github.com/repos/octo/od-railway-p1/contents/') && method === 'GET') {
        return new Response('', { status: 404 });
      }
      if (url.startsWith('https://api.github.com/repos/octo/od-railway-p1/contents/') && method === 'PUT') {
        return new Response(JSON.stringify({ content: { path: 'index.html' } }), { status: 200 });
      }
      if (url === 'https://backboard.railway.com/graphql/v2' && method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        graphQlCalls.push(body);
        const query = String(body.query ?? '');
        if (query.includes('query projects')) {
          return new Response(JSON.stringify({ data: { projects: { edges: [] } } }), { status: 200 });
        }
        if (query.includes('mutation projectCreate')) {
          return new Response(JSON.stringify({ data: { projectCreate: { id: 'railway-project-1', name: 'od-railway-p1' } } }), { status: 200 });
        }
        if (query.includes('query environments')) {
          return new Response(JSON.stringify({ data: { environments: { edges: [{ node: { id: 'environment-1', name: 'production' } }] } } }), { status: 200 });
        }
        if (query.includes('query services')) {
          return new Response(JSON.stringify({ data: { services: { edges: [{ node: { id: 'service-1', name: 'od-railway-p1' } }] } } }), { status: 200 });
        }
        if (query.includes('query deployments')) {
          const deployNode = triggered
            ? { id: 'deploy-new', status: 'ACTIVE', url: 'https://od-railway-p1.up.railway.app' }
            : { id: 'deploy-pre', status: 'ACTIVE', url: 'https://od-railway-p1.up.railway.app' };
          return new Response(JSON.stringify({
            data: {
              deployments: {
                edges: [{ node: deployNode }],
              },
            },
          }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        if (query.includes('query deployment(')) {
          return new Response(JSON.stringify({
            data: {
              deployment: {
                id: 'deploy-new',
                status: 'ACTIVE',
              },
            },
          }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        if (query.includes('mutation serviceInstanceDeploy')) {
          triggered = true;
          return new Response(JSON.stringify({ data: { serviceInstanceDeploy: true } }), { status: 200 });
        }
        if (query.includes('query domains')) {
          return new Response(JSON.stringify({ data: { domains: { serviceDomains: [{ domain: 'od-railway-p1.up.railway.app' }] } } }), { status: 200 });
        }
      }
      if (url === 'https://od-railway-p1.up.railway.app' && method === 'HEAD') {
        return new Response('', { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    stubGlobalFetch(fetchMock);

    await deployToRailway({
      config: { token: 'railway-token-secret', githubToken: 'github-token-secret' },
      projectId: 'p1',
      files,
      priorMetadata: { serviceId: 'service-1' },
    });

    expect(graphQlCalls.some((call) => call.query.includes('mutation serviceInstanceDeploy'))).toBe(true);
  });

  it('supplies the SHA during redeploy of a file > 1 MB by using the object+json media type', async () => {
    let getHeaders: Headers | undefined;
    let putBody: any;

    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
      const method = init?.method || (input instanceof Request ? input.method : 'GET');

      if (url === 'https://api.github.com/user' && method === 'GET') {
        return new Response(JSON.stringify({ login: 'octo' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://api.github.com/repos/octo/od-railway-p1' && method === 'GET') {
        return new Response(JSON.stringify({ id: 123 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.startsWith('https://api.github.com/repos/octo/od-railway-p1/contents/') && method === 'GET') {
        const headers = init?.headers as Record<string, string>;
        if (url.includes('large-image.png')) {
          getHeaders = new Headers(headers);
        }
        return new Response(
          JSON.stringify({
            type: 'file',
            size: 1500000,
            sha: 'existing-large-file-sha',
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        );
      }
      if (url.startsWith('https://api.github.com/repos/octo/od-railway-p1/contents/') && method === 'PUT') {
        putBody = JSON.parse(String(init?.body ?? '{}'));
        return new Response(JSON.stringify({ content: { sha: 'new-large-file-sha' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://backboard.railway.com/graphql/v2' && method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        const query = String(body.query ?? '');
        if (query.includes('query projects')) {
          return new Response(JSON.stringify({ data: { projects: { edges: [] } } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (query.includes('mutation projectCreate')) {
          return new Response(JSON.stringify({ data: { projectCreate: { id: 'railway-project-1', name: 'od-railway-p1' } } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (query.includes('query environments')) {
          return new Response(
            JSON.stringify({
              data: {
                environments: {
                  edges: [{ node: { id: 'environment-1', name: 'production' } }],
                },
              },
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          );
        }
        if (query.includes('query services')) {
          return new Response(JSON.stringify({ data: { services: { edges: [] } } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (query.includes('query deployments')) {
          return new Response(JSON.stringify({
            data: {
              deployments: {
                edges: [{ node: { id: 'deploy-new', status: 'ACTIVE', url: 'https://od-railway-p1.up.railway.app' } }],
              },
            },
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (query.includes('query deployment(')) {
          return new Response(JSON.stringify({
            data: {
              deployment: {
                id: 'deploy-new',
                status: 'ACTIVE',
              },
            },
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (query.includes('mutation serviceCreate')) {
          return new Response(JSON.stringify({ data: { serviceCreate: { id: 'service-1', name: 'od-railway-p1' } } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (query.includes('mutation serviceInstanceDeploy')) {
          return new Response(JSON.stringify({ data: { serviceInstanceDeploy: true } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (query.includes('query domains')) {
          return new Response(JSON.stringify({ data: { domains: { serviceDomains: [] } } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (query.includes('mutation serviceDomainCreate')) {
          return new Response(
            JSON.stringify({
              data: {
                serviceDomainCreate: {
                  id: 'domain-1',
                  domain: 'od-railway-p1.up.railway.app',
                },
              },
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          );
        }
      }
      if (url === 'https://od-railway-p1.up.railway.app' && method === 'HEAD') {
        return new Response('', { status: 200 });
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    stubGlobalFetch(fetchMock);

    const files = [
      {
        file: 'large-image.png',
        data: Buffer.alloc(1500000),
        contentType: 'image/png',
      },
    ];

    await deployToRailway({
      config: { token: 'railway-token-secret', githubToken: 'github-token-secret' },
      projectId: 'p1',
      files,
    });

    expect(getHeaders?.get('Accept')).toBe('application/vnd.github.object+json');
    expect(putBody?.sha).toBe('existing-large-file-sha');
  });

  it('skips uploading files to GitHub if the remote Git Blob SHA matches the local SHA', async () => {
    let putCalled = false;
    let getCalled = false;

    const content = '<!doctype html><h1>Hello Railway</h1>';
    const buf = Buffer.from(content);
    const header = `blob ${buf.length}\0`;
    const hasher = createHash('sha1');
    hasher.update(header);
    hasher.update(buf);
    const expectedSha = hasher.digest('hex');

    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
      const method = init?.method || (input instanceof Request ? input.method : 'GET');

      if (url === 'https://api.github.com/user' && method === 'GET') {
        return new Response(JSON.stringify({ login: 'octo' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://api.github.com/repos/octo/od-railway-p1' && method === 'GET') {
        return new Response(JSON.stringify({ id: 123 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.startsWith('https://api.github.com/repos/octo/od-railway-p1/contents/') && method === 'GET') {
        getCalled = true;
        const filename = url.split('/').pop() || '';
        let fileSha = expectedSha;
        let fileSize = buf.length;
        if (filename === 'Staticfile') {
          const staticfileContent = 'root: .\nindex_fallback: true\n';
          const sBuf = Buffer.from(staticfileContent);
          const sHeader = `blob ${sBuf.length}\0`;
          const sHasher = createHash('sha1');
          sHasher.update(sHeader);
          sHasher.update(sBuf);
          fileSha = sHasher.digest('hex');
          fileSize = sBuf.length;
        }
        return new Response(
          JSON.stringify({
            type: 'file',
            size: fileSize,
            sha: fileSha,
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        );
      }
      if (url.startsWith('https://api.github.com/repos/octo/od-railway-p1/contents/') && method === 'PUT') {
        putCalled = true;
        return new Response(JSON.stringify({ content: { sha: 'some-new-sha' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://backboard.railway.com/graphql/v2' && method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        const query = String(body.query ?? '');
        if (query.includes('query projects')) {
          return new Response(JSON.stringify({ data: { projects: { edges: [] } } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (query.includes('mutation projectCreate')) {
          return new Response(JSON.stringify({ data: { projectCreate: { id: 'railway-project-1', name: 'od-railway-p1' } } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (query.includes('query environments')) {
          return new Response(
            JSON.stringify({
              data: {
                environments: {
                  edges: [{ node: { id: 'environment-1', name: 'production' } }],
                },
              },
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          );
        }
        if (query.includes('query services')) {
          return new Response(JSON.stringify({ data: { services: { edges: [] } } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (query.includes('query deployments')) {
          return new Response(JSON.stringify({
            data: {
              deployments: {
                edges: [{ node: { id: 'deploy-new', status: 'ACTIVE', url: 'https://od-railway-p1.up.railway.app' } }],
              },
            },
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (query.includes('query deployment(')) {
          return new Response(JSON.stringify({
            data: {
              deployment: {
                id: 'deploy-new',
                status: 'ACTIVE',
              },
            },
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (query.includes('mutation serviceCreate')) {
          return new Response(JSON.stringify({ data: { serviceCreate: { id: 'service-1', name: 'od-railway-p1' } } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (query.includes('mutation serviceInstanceDeploy')) {
          return new Response(JSON.stringify({ data: { serviceInstanceDeploy: true } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (query.includes('query domains')) {
          return new Response(JSON.stringify({ data: { domains: { serviceDomains: [] } } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (query.includes('mutation serviceDomainCreate')) {
          return new Response(
            JSON.stringify({
              data: {
                serviceDomainCreate: {
                  id: 'domain-1',
                  domain: 'od-railway-p1.up.railway.app',
                },
              },
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          );
        }
      }
      if (url === 'https://od-railway-p1.up.railway.app' && method === 'HEAD') {
        return new Response('', { status: 200 });
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    stubGlobalFetch(fetchMock);

    const files = [
      {
        file: 'index.html',
        data: content,
        contentType: 'text/html',
      },
    ];

    await deployToRailway({
      config: { token: 'railway-token-secret', githubToken: 'github-token-secret' },
      projectId: 'p1',
      files,
    });

    expect(getCalled).toBe(true);
    expect(putCalled).toBe(false);
  });

  it('aborts Netlify deploy status poll on timeout budget exhaustion', async () => {
    vi.useFakeTimers();
    let aborted = false;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : String(input);
      if (url === 'https://api.github.com/user') return new Response(JSON.stringify({ login: 'testuser' }), { status: 200 });
      if (url === 'https://api.github.com/repos/testuser/od-netlify-p1') return new Response(JSON.stringify({ id: 123, default_branch: 'main' }), { status: 200 });
      if (url === 'https://api.github.com/repos/testuser/od-netlify-p1/keys' && init?.method === 'POST') {
        return new Response(JSON.stringify({ id: 789 }), { status: 201 });
      }
      if (url.startsWith('https://api.github.com/repos/testuser/od-netlify-p1/git/trees/')) {
        return new Response(JSON.stringify({ tree: [] }), { status: 200 });
      }
      if (url.startsWith('https://api.github.com/repos/testuser/od-netlify-p1/contents/') && init?.method === 'PUT') return new Response(JSON.stringify({ content: { sha: 'sha' } }), { status: 200 });
      if (url.startsWith('https://api.github.com/repos/testuser/od-netlify-p1/contents/')) return new Response('', { status: 404 });
      if (url.includes('/sites?name=od-p1')) return new Response(JSON.stringify([{ id: 'site-1', site_id: 'site-1', name: 'od-p1', deploy_key_id: 'existing-key-id' }]), { status: 200 });
      if (url.endsWith('/sites/site-1')) return new Response(JSON.stringify({ id: 'site-1', site_id: 'site-1', deploy_key_id: 'existing-key-id' }), { status: 200 });
      if (url.endsWith('/deploy_keys/existing-key-id')) {
        return new Response(JSON.stringify({ id: 'existing-key-id', public_key: 'ssh-rsa AAAAB3NzaC1...' }), { status: 200 });
      }
      if (url.endsWith('/sites/site-1/builds')) return new Response(JSON.stringify({ id: 'deploy-1', deploy_id: 'deploy-1' }), { status: 200 });
      
      if (url.includes('/deploys/deploy-1')) {
        return new Promise<Response>((_, reject) => {
          if (init?.signal) {
            init.signal.addEventListener('abort', () => {
              aborted = true;
              reject(new DOMException('The user aborted a request.', 'AbortError'));
            });
          }
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    stubGlobalFetch(fetchMock);

    const deployPromise = deployToNetlify({
      config: { token: 'netlify-token-secret', githubToken: 'ghp-test-token' },
      projectId: 'p1',
      files: [
        {
          file: 'index.html',
          data: Buffer.from('<!doctype html><h1>Hello</h1>'),
          contentType: 'text/html',
        },
      ],
    });

    const assertionPromise = expect(deployPromise).rejects.toThrowError(/Netlify deployment poll timed out/);

    await vi.advanceTimersByTimeAsync(65_000);

    await assertionPromise;
    expect(aborted).toBe(true);
  });

  it('reconciles files in GitHub repository and deletes stale files not in build plan', async () => {
    const deletedFiles: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : String(input);
      const method = init?.method || 'GET';

      if (url === 'https://api.github.com/user' && method === 'GET') {
        return new Response(JSON.stringify({ login: 'testuser' }), { status: 200 });
      }
      if (url === 'https://api.github.com/repos/testuser/od-netlify-p1' && method === 'GET') {
        return new Response(JSON.stringify({ id: 123, name: 'od-netlify-p1', default_branch: 'main' }), { status: 200 });
      }
      if (url === 'https://api.github.com/repos/testuser/od-netlify-p1/keys' && method === 'POST') {
        return new Response(JSON.stringify({ id: 789 }), { status: 201 });
      }
      if (url.startsWith('https://api.github.com/repos/testuser/od-netlify-p1/contents/')) {
        if (method === 'GET') {
          return new Response(JSON.stringify({ sha: 'some-sha' }), { status: 200 });
        }
        if (method === 'PUT') {
          return new Response(JSON.stringify({ content: { sha: 'new-sha' } }), { status: 200 });
        }
        if (method === 'DELETE') {
          const path = url.replace('https://api.github.com/repos/testuser/od-netlify-p1/contents/', '');
          deletedFiles.push(decodeURIComponent(path));
          return new Response(JSON.stringify({}), { status: 200 });
        }
      }
      if (url.startsWith('https://api.github.com/repos/testuser/od-netlify-p1/git/trees/')) {
        return new Response(
          JSON.stringify({
            tree: [
              { path: 'index.html', type: 'blob', sha: 'sha1' },
              { path: 'netlify.toml', type: 'blob', sha: 'sha2' },
              { path: 'stale.png', type: 'blob', sha: 'sha3' },
            ],
          }),
          { status: 200 }
        );
      }
      if (url.includes('/sites?name=od-p1')) return new Response(JSON.stringify([]), { status: 200 });
      if (url.endsWith('/deploy_keys')) return new Response(JSON.stringify({ id: 'key', public_key: 'pubkey' }), { status: 200 });
      if (url.endsWith('/sites')) return new Response(JSON.stringify({ id: 'site-1', site_id: 'site-1' }), { status: 200 });
      if (url.endsWith('/sites/site-1/builds')) return new Response(JSON.stringify({ id: 'deploy-1', deploy_id: 'deploy-1' }), { status: 200 });
      if (url.endsWith('/deploys/deploy-1')) {
        return new Response(JSON.stringify({ id: 'deploy-1', state: 'ready', ssl_url: 'https://example.netlify.app' }), { status: 200 });
      }
      if (url === 'https://example.netlify.app' && method === 'HEAD') {
        return new Response('', { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    stubGlobalFetch(fetchMock);

    await deployToNetlify({
      config: { token: 'netlify-token-secret', githubToken: 'ghp-test-token' },
      projectId: 'p1',
      files: [
        {
          file: 'index.html',
          data: Buffer.from('<!doctype html><h1>Hello</h1>'),
          contentType: 'text/html',
        },
      ],
    });

    expect(deletedFiles).toContain('stale.png');
    expect(deletedFiles).not.toContain('index.html');
    expect(deletedFiles).not.toContain('netlify.toml');
  });

  it('throws DeployError when Railway domains lookup and serviceDomainCreate both fail', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : String(input);
      const method = init?.method || 'GET';

      if (url === 'https://api.github.com/user' && method === 'GET') {
        return new Response(JSON.stringify({ login: 'testuser' }), { status: 200 });
      }
      if (url === 'https://api.github.com/repos/testuser/od-railway-p1' && method === 'GET') {
        return new Response(JSON.stringify({ id: 123, name: 'od-railway-p1', default_branch: 'main' }), { status: 200 });
      }
      if (url.startsWith('https://api.github.com/repos/testuser/od-railway-p1/contents/')) {
        if (method === 'GET') return new Response('', { status: 404 });
        if (method === 'PUT') return new Response(JSON.stringify({ content: { sha: 'sha' } }), { status: 200 });
      }
      if (url.startsWith('https://api.github.com/repos/testuser/od-railway-p1/git/trees/')) {
        return new Response(JSON.stringify({ tree: [] }), { status: 200 });
      }

      if (url === 'https://backboard.railway.com/graphql/v2' && method === 'POST') {
        const parsed = JSON.parse(String(init?.body ?? '{}'));
        const query = parsed.query || '';
        
        if (query.includes('query projects')) {
          return new Response(JSON.stringify({ data: { projects: { edges: [{ node: { id: 'proj-1', name: 'od-railway-p1' } }] } } }), { status: 200 });
        }
        if (query.includes('query environments')) {
          return new Response(JSON.stringify({ data: { environments: { edges: [{ node: { id: 'env-1', name: 'production' } }] } } }), { status: 200 });
        }
        if (query.includes('query services')) {
          return new Response(JSON.stringify({ data: { services: { edges: [{ node: { id: 'srv-1', name: 'od-railway-p1' } }] } } }), { status: 200 });
        }
        if (query.includes('query deployments')) {
          return new Response(JSON.stringify({
            data: {
              deployments: {
                edges: [{ node: { id: 'deploy-pre', status: 'ACTIVE', url: 'https://od-railway-p1.up.railway.app' } }],
              },
            },
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (query.includes('mutation serviceInstanceDeploy')) {
          return new Response(JSON.stringify({ data: { serviceInstanceDeploy: true } }), { status: 200 });
        }
        if (query.includes('query domains')) {
          return new Response(JSON.stringify({ data: { domains: { serviceDomains: [] } } }), { status: 200 });
        }
        if (query.includes('mutation serviceDomainCreate')) {
          return new Response(
            JSON.stringify({
              errors: [{ message: 'Service domain creation failed.' }],
            }),
            { status: 200 }
          );
        }
        throw new Error(`Unmatched Railway Query: ${query}`);
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    stubGlobalFetch(fetchMock);

    await expect(
      deployToRailway({
        config: { token: 'railway-token-secret', githubToken: 'github-token-secret' },
        projectId: 'p1',
        files: [
          {
            file: 'index.html',
            data: Buffer.from('<!doctype html><h1>Hello Railway</h1>'),
            contentType: 'text/html',
          },
        ],
      })
    ).rejects.toThrowError(/Service domain creation failed/);
  });

  it('polls and waits for the specific new Railway deployment rollout before checking reachability', async () => {
    let triggered = false;
    let deploymentPollCount = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : String(input);
      const method = init?.method || 'GET';

      if (url === 'https://api.github.com/user' && method === 'GET') {
        return new Response(JSON.stringify({ login: 'testuser' }), { status: 200 });
      }
      if (url === 'https://api.github.com/repos/testuser/od-railway-p1' && method === 'GET') {
        return new Response(JSON.stringify({ id: 123, name: 'od-railway-p1', default_branch: 'main' }), { status: 200 });
      }
      if (url.startsWith('https://api.github.com/repos/testuser/od-railway-p1/contents/')) {
        if (method === 'GET') return new Response('', { status: 404 });
        if (method === 'PUT') return new Response(JSON.stringify({ content: { sha: 'sha' } }), { status: 200 });
      }
      if (url.startsWith('https://api.github.com/repos/testuser/od-railway-p1/git/trees/')) {
        return new Response(JSON.stringify({ tree: [] }), { status: 200 });
      }

      if (url === 'https://backboard.railway.com/graphql/v2' && method === 'POST') {
        const parsed = JSON.parse(String(init?.body ?? '{}'));
        const query = parsed.query || '';
        if (query.includes('query projects')) {
          return new Response(JSON.stringify({ data: { projects: { edges: [{ node: { id: 'proj-1', name: 'od-railway-p1' } }] } } }), { status: 200 });
        }
        if (query.includes('query environments')) {
          return new Response(JSON.stringify({ data: { environments: { edges: [{ node: { id: 'env-1', name: 'production' } }] } } }), { status: 200 });
        }
        if (query.includes('query services')) {
          return new Response(JSON.stringify({ data: { services: { edges: [{ node: { id: 'srv-1', name: 'od-railway-p1' } }] } } }), { status: 200 });
        }
        if (query.includes('query deployments')) {
          const deployNode = triggered
            ? { id: 'deploy-new', status: 'ACTIVE', url: 'https://od-railway-p1.up.railway.app' }
            : { id: 'deploy-pre', status: 'ACTIVE', url: 'https://od-railway-p1.up.railway.app' };
          return new Response(JSON.stringify({
            data: {
              deployments: {
                edges: [{ node: deployNode }],
              },
            },
          }), { status: 200 });
        }
        if (query.includes('query deployment(')) {
          deploymentPollCount++;
          const status = deploymentPollCount >= 2 ? 'ACTIVE' : 'BUILDING';
          return new Response(JSON.stringify({
            data: {
              deployment: {
                id: 'deploy-new',
                status,
              },
            },
          }), { status: 200 });
        }
        if (query.includes('mutation serviceInstanceDeploy')) {
          triggered = true;
          return new Response(JSON.stringify({ data: { serviceInstanceDeploy: true } }), { status: 200 });
        }
        if (query.includes('query domains')) {
          return new Response(JSON.stringify({ data: { domains: { serviceDomains: [{ domain: 'od-railway-p1.up.railway.app' }] } } }), { status: 200 });
        }
      }
      if (url === 'https://od-railway-p1.up.railway.app' && method === 'HEAD') {
        return new Response('', { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    stubGlobalFetch(fetchMock);

    const result = await deployToRailway({
      config: { token: 'railway-token-secret', githubToken: 'github-token-secret' },
      projectId: 'p1',
      files: [{ file: 'index.html', data: Buffer.from('test'), contentType: 'text/html' }],
      priorMetadata: { serviceId: 'service-1' },
    });

    expect(result.status).toBe('ready');
    expect(deploymentPollCount).toBe(2);
  });

  it('throws DeployError if the new Railway deployment ID cannot be resolved', async () => {
    let triggered = false;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : String(input);
      const method = init?.method || 'GET';

      if (url === 'https://api.github.com/user' && method === 'GET') {
        return new Response(JSON.stringify({ login: 'testuser' }), { status: 200 });
      }
      if (url === 'https://api.github.com/repos/testuser/od-railway-p1' && method === 'GET') {
        return new Response(JSON.stringify({ id: 123, name: 'od-railway-p1', default_branch: 'main' }), { status: 200 });
      }
      if (url.startsWith('https://api.github.com/repos/testuser/od-railway-p1/contents/')) {
        if (method === 'GET') return new Response('', { status: 404 });
        if (method === 'PUT') return new Response(JSON.stringify({ content: { sha: 'sha' } }), { status: 200 });
      }
      if (url.startsWith('https://api.github.com/repos/testuser/od-railway-p1/git/trees/')) {
        return new Response(JSON.stringify({ tree: [] }), { status: 200 });
      }

      if (url === 'https://backboard.railway.com/graphql/v2' && method === 'POST') {
        const parsed = JSON.parse(String(init?.body ?? '{}'));
        const query = parsed.query || '';
        if (query.includes('query projects')) {
          return new Response(JSON.stringify({ data: { projects: { edges: [{ node: { id: 'proj-1', name: 'od-railway-p1' } }] } } }), { status: 200 });
        }
        if (query.includes('query environments')) {
          return new Response(JSON.stringify({ data: { environments: { edges: [{ node: { id: 'env-1', name: 'production' } }] } } }), { status: 200 });
        }
        if (query.includes('query services')) {
          return new Response(JSON.stringify({ data: { services: { edges: [{ node: { id: 'srv-1', name: 'od-railway-p1' } }] } } }), { status: 200 });
        }
        if (query.includes('query deployments')) {
          // Always return the pre-trigger deploy ID so the difference check fails
          return new Response(JSON.stringify({
            data: {
              deployments: {
                edges: [{ node: { id: 'deploy-pre', status: 'ACTIVE', url: 'https://od-railway-p1.up.railway.app' } }],
              },
            },
          }), { status: 200 });
        }
        if (query.includes('mutation serviceInstanceDeploy')) {
          triggered = true;
          return new Response(JSON.stringify({ data: { serviceInstanceDeploy: true } }), { status: 200 });
        }
        if (query.includes('query domains')) {
          return new Response(JSON.stringify({ data: { domains: { serviceDomains: [{ domain: 'od-railway-p1.up.railway.app' }] } } }), { status: 200 });
        }
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    stubGlobalFetch(fetchMock);

    await expect(
      deployToRailway({
        config: { token: 'railway-token-secret', githubToken: 'github-token-secret' },
        projectId: 'p1',
        files: [{ file: 'index.html', data: Buffer.from('test'), contentType: 'text/html' }],
        priorMetadata: { serviceId: 'service-1' },
      })
    ).rejects.toThrowError(/Failed to resolve new Railway deployment after trigger/);
  });

  it('throws DeployError if the new Railway deployment fails', async () => {
    let triggered = false;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : String(input);
      const method = init?.method || 'GET';

      if (url === 'https://api.github.com/user' && method === 'GET') {
        return new Response(JSON.stringify({ login: 'testuser' }), { status: 200 });
      }
      if (url === 'https://api.github.com/repos/testuser/od-railway-p1' && method === 'GET') {
        return new Response(JSON.stringify({ id: 123, name: 'od-railway-p1', default_branch: 'main' }), { status: 200 });
      }
      if (url.startsWith('https://api.github.com/repos/testuser/od-railway-p1/contents/')) {
        if (method === 'GET') return new Response('', { status: 404 });
        if (method === 'PUT') return new Response(JSON.stringify({ content: { sha: 'sha' } }), { status: 200 });
      }
      if (url.startsWith('https://api.github.com/repos/testuser/od-railway-p1/git/trees/')) {
        return new Response(JSON.stringify({ tree: [] }), { status: 200 });
      }

      if (url === 'https://backboard.railway.com/graphql/v2' && method === 'POST') {
        const parsed = JSON.parse(String(init?.body ?? '{}'));
        const query = parsed.query || '';
        if (query.includes('query projects')) {
          return new Response(JSON.stringify({ data: { projects: { edges: [{ node: { id: 'proj-1', name: 'od-railway-p1' } }] } } }), { status: 200 });
        }
        if (query.includes('query environments')) {
          return new Response(JSON.stringify({ data: { environments: { edges: [{ node: { id: 'env-1', name: 'production' } }] } } }), { status: 200 });
        }
        if (query.includes('query services')) {
          return new Response(JSON.stringify({ data: { services: { edges: [{ node: { id: 'srv-1', name: 'od-railway-p1' } }] } } }), { status: 200 });
        }
        if (query.includes('query deployments')) {
          const deployNode = triggered
            ? { id: 'deploy-new', status: 'ACTIVE', url: 'https://od-railway-p1.up.railway.app' }
            : { id: 'deploy-pre', status: 'ACTIVE', url: 'https://od-railway-p1.up.railway.app' };
          return new Response(JSON.stringify({
            data: {
              deployments: {
                edges: [{ node: deployNode }],
              },
            },
          }), { status: 200 });
        }
        if (query.includes('query deployment(')) {
          return new Response(JSON.stringify({
            data: {
              deployment: {
                id: 'deploy-new',
                status: 'FAILED',
              },
            },
          }), { status: 200 });
        }
        if (query.includes('mutation serviceInstanceDeploy')) {
          triggered = true;
          return new Response(JSON.stringify({ data: { serviceInstanceDeploy: true } }), { status: 200 });
        }
        if (query.includes('query domains')) {
          return new Response(JSON.stringify({ data: { domains: { serviceDomains: [{ domain: 'od-railway-p1.up.railway.app' }] } } }), { status: 200 });
        }
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    stubGlobalFetch(fetchMock);

    await expect(
      deployToRailway({
        config: { token: 'railway-token-secret', githubToken: 'github-token-secret' },
        projectId: 'p1',
        files: [{ file: 'index.html', data: Buffer.from('test'), contentType: 'text/html' }],
        priorMetadata: { serviceId: 'service-1' },
      })
    ).rejects.toThrowError(/Railway deployment failed with status: FAILED/);
  });

  it('throws DeployError when Railway pre-trigger lookup fails', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : String(input);
      const method = init?.method || 'GET';

      if (url === 'https://api.github.com/user' && method === 'GET') {
        return new Response(JSON.stringify({ login: 'octo' }), { status: 200 });
      }
      if (url === 'https://api.github.com/repos/octo/od-railway-p1' && method === 'GET') {
        return new Response(JSON.stringify({ id: 123 }), { status: 200 });
      }
      if (url.startsWith('https://api.github.com/repos/octo/od-railway-p1/contents/') && method === 'GET') {
        return new Response('', { status: 404 });
      }
      if (url.startsWith('https://api.github.com/repos/octo/od-railway-p1/contents/') && method === 'PUT') {
        return new Response(JSON.stringify({ content: { path: 'index.html' } }), { status: 200 });
      }
      if (url === 'https://backboard.railway.com/graphql/v2' && method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        const query = String(body.query ?? '');

        if (query.includes('query projects')) {
          return new Response(JSON.stringify({ data: { projects: { edges: [{ node: { id: 'railway-project-1', name: 'od-railway-p1' } }] } } }), { status: 200 });
        }
        if (query.includes('query environments')) {
          return new Response(JSON.stringify({
            data: {
              environments: {
                edges: [{ node: { id: 'environment-1', name: 'production' } }],
              },
            },
          }), { status: 200 });
        }
        if (query.includes('query services')) {
          return new Response(JSON.stringify({ data: { services: { edges: [{ node: { id: 'service-1', name: 'od-railway-p1' } }] } } }), { status: 200 });
        }
        if (query.includes('query deployments')) {
          // pre-trigger lookup query: fail!
          return new Response(JSON.stringify({
            errors: [{ message: 'Database error fetching deployments' }]
          }), { status: 200 });
        }
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    stubGlobalFetch(fetchMock);

    await expect(
      deployToRailway({
        config: { token: 'railway-token-secret', githubToken: 'github-token-secret' },
        projectId: 'p1',
        files: [{ file: 'index.html', data: Buffer.from('test'), contentType: 'text/html' }],
        priorMetadata: { railwayProjectId: 'railway-project-1', environmentId: 'environment-1', serviceId: 'service-1' },
      })
    ).rejects.toThrowError(/baseline deployment ID could not be established/);
  });

  it('aborts Railway deploy status poll on timeout budget exhaustion', async () => {
    vi.useFakeTimers();
    let aborted = false;
    let triggered = false;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : String(input);
      const method = init?.method || 'GET';

      if (url === 'https://api.github.com/user' && method === 'GET') {
        return new Response(JSON.stringify({ login: 'octo' }), { status: 200 });
      }
      if (url === 'https://api.github.com/repos/octo/od-railway-p1' && method === 'GET') {
        return new Response(JSON.stringify({ id: 123 }), { status: 200 });
      }
      if (url.startsWith('https://api.github.com/repos/octo/od-railway-p1/contents/') && method === 'GET') {
        return new Response('', { status: 404 });
      }
      if (url.startsWith('https://api.github.com/repos/octo/od-railway-p1/contents/') && method === 'PUT') {
        return new Response(JSON.stringify({ content: { path: 'index.html' } }), { status: 200 });
      }
      if (url === 'https://backboard.railway.com/graphql/v2' && method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        const query = String(body.query ?? '');

        if (query.includes('query projects')) {
          return new Response(JSON.stringify({ data: { projects: { edges: [{ node: { id: 'railway-project-1', name: 'od-railway-p1' } }] } } }), { status: 200 });
        }
        if (query.includes('query environments')) {
          return new Response(JSON.stringify({
            data: {
              environments: {
                edges: [{ node: { id: 'environment-1', name: 'production' } }],
              },
            },
          }), { status: 200 });
        }
        if (query.includes('query services')) {
          return new Response(JSON.stringify({ data: { services: { edges: [{ node: { id: 'service-1', name: 'od-railway-p1' } }] } } }), { status: 200 });
        }
        if (query.includes('query deployments')) {
          const deployNode = triggered
            ? { id: 'deploy-new', status: 'ACTIVE', url: 'https://od-railway-p1.up.railway.app' }
            : { id: 'deploy-pre', status: 'ACTIVE', url: 'https://od-railway-p1.up.railway.app' };
          return new Response(JSON.stringify({
            data: {
              deployments: {
                edges: [{ node: deployNode }],
              },
            },
          }), { status: 200 });
        }
        if (query.includes('query deployment(')) {
          return new Promise<Response>((_, reject) => {
            if (init?.signal) {
              init.signal.addEventListener('abort', () => {
                aborted = true;
                reject(new DOMException('The user aborted a request.', 'AbortError'));
              });
            }
          });
        }
        if (query.includes('mutation serviceInstanceDeploy')) {
          triggered = true;
          return new Response(JSON.stringify({ data: { serviceInstanceDeploy: true } }), { status: 200 });
        }
        if (query.includes('query domains')) {
          return new Response(JSON.stringify({ data: { domains: { serviceDomains: [{ domain: 'od-railway-p1.up.railway.app' }] } } }), { status: 200 });
        }
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    stubGlobalFetch(fetchMock);

    const deployPromise = deployToRailway({
      config: { token: 'railway-token-secret', githubToken: 'github-token-secret' },
      projectId: 'p1',
      files: [{ file: 'index.html', data: Buffer.from('test'), contentType: 'text/html' }],
      priorMetadata: { railwayProjectId: 'railway-project-1', environmentId: 'environment-1', serviceId: 'service-1' },
    });

    const assertionPromise = expect(deployPromise).rejects.toThrowError(/Railway deployment poll timed out/);

    await vi.advanceTimersByTimeAsync(185_000);

    await assertionPromise;
    expect(aborted).toBe(true);
  });

  it('throws a 502 DeployError when GitHub PUT upload fails', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : String(input);
      const method = init?.method || 'GET';

      if (url === 'https://api.github.com/user' && method === 'GET') {
        return new Response(JSON.stringify({ login: 'octo' }), { status: 200 });
      }
      if (url === 'https://api.github.com/repos/octo/od-railway-p1' && method === 'GET') {
        return new Response(JSON.stringify({ id: 123 }), { status: 200 });
      }
      if (url.startsWith('https://api.github.com/repos/octo/od-railway-p1/contents/') && method === 'GET') {
        return new Response('', { status: 404 });
      }
      if (url.startsWith('https://api.github.com/repos/octo/od-railway-p1/contents/') && method === 'PUT') {
        return new Response(JSON.stringify({ message: 'GitHub repository is temporarily unavailable' }), {
          status: 502,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    stubGlobalFetch(fetchMock);

    const files = [
      {
        file: 'index.html',
        data: Buffer.from('<!doctype html><h1>Hello</h1>'),
        contentType: 'text/html',
      },
    ];

    try {
      await deployToRailway({
        config: { token: 'railway-token-secret', githubToken: 'github-token-secret' },
        projectId: 'p1',
        files,
      });
      throw new Error('Should have thrown');
    } catch (err: any) {
      expect(err.name).toBe('DeployError');
      expect(err.status).toBe(502);
      expect(err.message).toContain('GitHub repository is temporarily unavailable');
    }
  });

  it('handles Netlify stale siteId (recovery flow)', async () => {
    let siteCreated = false;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
      const method = init?.method || (input instanceof Request ? input.method : 'GET');

      if (url === 'https://api.github.com/user' && method === 'GET') {
        return new Response(JSON.stringify({ login: 'testuser' }), { status: 200 });
      }
      if (url === 'https://api.github.com/repos/testuser/od-netlify-p1' && method === 'GET') {
        return new Response(JSON.stringify({ id: 123, name: 'od-netlify-p1' }), { status: 200 });
      }
      if (url === 'https://api.github.com/repos/testuser/od-netlify-p1/keys' && method === 'POST') {
        return new Response(JSON.stringify({ id: 789 }), { status: 201 });
      }
      if (url.startsWith('https://api.github.com/repos/testuser/od-netlify-p1/contents/') && method === 'GET') {
        return new Response('', { status: 404 });
      }
      if (url.startsWith('https://api.github.com/repos/testuser/od-netlify-p1/contents/') && method === 'PUT') {
        return new Response(JSON.stringify({ content: { sha: 'abc123' } }), { status: 201 });
      }
      if (url.endsWith('/sites/stale-site-id') && method === 'GET') {
        return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404 });
      }
      if (url.includes('/sites?name=od-p1') && method === 'GET') {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (url.endsWith('/deploy_keys') && method === 'POST') {
        return new Response(JSON.stringify({ id: 'deploy-key-new', public_key: 'ssh-rsa AAA...' }), { status: 200 });
      }
      if (url.endsWith('/sites') && method === 'POST') {
        siteCreated = true;
        return new Response(JSON.stringify({ id: 'site-new', ssl_url: 'https://new.netlify.app' }), { status: 200 });
      }
      if (url.endsWith('/sites/site-new') && method === 'PUT') {
        return new Response(JSON.stringify({ id: 'site-new' }), { status: 200 });
      }
      if (url.endsWith('/sites/site-new/builds') && method === 'POST') {
        return new Response(JSON.stringify({ deploy_id: 'deploy-new' }), { status: 200 });
      }
      if (url.endsWith('/deploys/deploy-new') && method === 'GET') {
        return new Response(JSON.stringify({
          id: 'deploy-new',
          state: 'ready',
          ssl_url: 'https://new.netlify.app',
        }), { status: 200 });
      }
      if (url === 'https://new.netlify.app' && method === 'HEAD') {
        return new Response('', { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    stubGlobalFetch(fetchMock);

    const result = await deployToNetlify({
      config: { token: 'netlify-token-secret', githubToken: 'github-token-secret' },
      projectId: 'p1',
      files: [
        {
          file: 'index.html',
          data: Buffer.from('<!doctype html><h1>Hello</h1>'),
          contentType: 'text/html',
        },
      ],
      priorMetadata: { siteId: 'stale-site-id' },
    });

    expect(result.deploymentId).toBe('deploy-new');
    expect(result.providerMetadata?.siteId).toBe('site-new');
    expect(siteCreated).toBe(true);
  });

  it('handles GitHub duplicate deploy key (already in use) and succeeds', async () => {
    let githubKeysAdded = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
      const method = init?.method || (input instanceof Request ? input.method : 'GET');

      if (url === 'https://api.github.com/user' && method === 'GET') {
        return new Response(JSON.stringify({ login: 'testuser' }), { status: 200 });
      }
      if (url === 'https://api.github.com/repos/testuser/od-netlify-p1' && method === 'GET') {
        return new Response(JSON.stringify({ id: 123, name: 'od-netlify-p1' }), { status: 200 });
      }
      if (url === 'https://api.github.com/repos/testuser/od-netlify-p1/keys' && method === 'POST') {
        githubKeysAdded++;
        return new Response(JSON.stringify({
          message: 'Validation Failed',
          errors: [{ resource: 'PublicKey', code: 'custom', message: 'key is already in use' }],
        }), { status: 422 });
      }
      if (url.startsWith('https://api.github.com/repos/testuser/od-netlify-p1/contents/') && method === 'GET') {
        return new Response('', { status: 404 });
      }
      if (url.startsWith('https://api.github.com/repos/testuser/od-netlify-p1/contents/') && method === 'PUT') {
        return new Response(JSON.stringify({ content: { sha: 'abc123' } }), { status: 201 });
      }
      if (url.includes('/sites?name=od-p1') && method === 'GET') {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (url.endsWith('/deploy_keys') && method === 'POST') {
        return new Response(JSON.stringify({ id: 'deploy-key-new', public_key: 'ssh-rsa AAA...' }), { status: 200 });
      }
      if (url.endsWith('/sites') && method === 'POST') {
        return new Response(JSON.stringify({ id: 'site-1', ssl_url: 'https://example.netlify.app' }), { status: 200 });
      }
      if (url.endsWith('/sites/site-1/builds') && method === 'POST') {
        return new Response(JSON.stringify({ deploy_id: 'deploy-1' }), { status: 200 });
      }
      if (url.endsWith('/deploys/deploy-1') && method === 'GET') {
        return new Response(JSON.stringify({
          id: 'deploy-1',
          state: 'ready',
          ssl_url: 'https://example.netlify.app',
        }), { status: 200 });
      }
      if (url === 'https://example.netlify.app' && method === 'HEAD') {
        return new Response('', { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    stubGlobalFetch(fetchMock);

    const result = await deployToNetlify({
      config: { token: 'netlify-token-secret', githubToken: 'github-token-secret' },
      projectId: 'p1',
      files: [
        {
          file: 'index.html',
          data: Buffer.from('<!doctype html><h1>Hello</h1>'),
          contentType: 'text/html',
        },
      ],
    });

    expect(result.deploymentId).toBe('deploy-1');
    expect(githubKeysAdded).toBe(1);
  });

  it('handles Railway stale project and service IDs (recovery flow)', async () => {
    let createdProject = false;
    let createdService = false;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
      const method = init?.method || (input instanceof Request ? input.method : 'GET');

      if (url === 'https://api.github.com/user' && method === 'GET') {
        return new Response(JSON.stringify({ login: 'octo' }), { status: 200 });
      }
      if (url === 'https://api.github.com/repos/octo/od-railway-p1' && method === 'GET') {
        return new Response(JSON.stringify({ id: 123 }), { status: 200 });
      }
      if (url.startsWith('https://api.github.com/repos/octo/od-railway-p1/contents/') && method === 'GET') {
        return new Response('', { status: 404 });
      }
      if (url.startsWith('https://api.github.com/repos/octo/od-railway-p1/contents/') && method === 'PUT') {
        return new Response(JSON.stringify({ content: { sha: 'abc123' } }), { status: 200 });
      }
      if (url === 'https://backboard.railway.com/graphql/v2' && method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        const query = String(body.query ?? '');

        // Stale checks fail
        if (query.includes('query project(') && body.variables.id === 'stale-project-id') {
          return new Response(JSON.stringify({ data: { project: null } }), { status: 200 });
        }
        if (query.includes('query service(') && body.variables.id === 'stale-service-id') {
          return new Response(JSON.stringify({ data: { service: null } }), { status: 200 });
        }

        // Resolving by name
        if (query.includes('query projects')) {
          return new Response(JSON.stringify({ data: { projects: { edges: [] } } }), { status: 200 });
        }
        if (query.includes('mutation projectCreate')) {
          createdProject = true;
          return new Response(JSON.stringify({ data: { projectCreate: { id: 'new-project-id', name: 'od-railway-p1' } } }), { status: 200 });
        }
        if (query.includes('query environments')) {
          return new Response(JSON.stringify({
            data: {
              environments: {
                edges: [{ node: { id: 'environment-1', name: 'production' } }],
              },
            },
          }), { status: 200 });
        }
        if (query.includes('query services')) {
          return new Response(JSON.stringify({ data: { services: { edges: [] } } }), { status: 200 });
        }
        if (query.includes('mutation serviceCreate')) {
          createdService = true;
          return new Response(JSON.stringify({ data: { serviceCreate: { id: 'new-service-id', name: 'od-railway-p1' } } }), { status: 200 });
        }
        if (query.includes('query deployments')) {
          return new Response(JSON.stringify({
            data: {
              deployments: {
                edges: [{ node: { id: 'deploy-new', status: 'ACTIVE', url: 'https://new.up.railway.app' } }],
              },
            },
          }), { status: 200 });
        }
        if (query.includes('query deployment(')) {
          return new Response(JSON.stringify({
            data: {
              deployment: {
                id: 'deploy-new',
                status: 'ACTIVE',
              },
            },
          }), { status: 200 });
        }
        if (query.includes('query domains')) {
          return new Response(JSON.stringify({ data: { domains: { serviceDomains: [] } } }), { status: 200 });
        }
        if (query.includes('mutation serviceDomainCreate')) {
          return new Response(JSON.stringify({
            data: {
              serviceDomainCreate: {
                id: 'domain-1',
                domain: 'new.up.railway.app',
              },
            },
          }), { status: 200 });
        }
      }
      if (url === 'https://new.up.railway.app' && method === 'HEAD') {
        return new Response('', { status: 200 });
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    stubGlobalFetch(fetchMock);

    const result = await deployToRailway({
      config: { token: 'railway-token-secret', githubToken: 'github-token-secret' },
      projectId: 'p1',
      files: [
        {
          file: 'index.html',
          data: Buffer.from('<!doctype html><h1>Hello</h1>'),
          contentType: 'text/html',
        },
      ],
      priorMetadata: { railwayProjectId: 'stale-project-id', serviceId: 'stale-service-id' },
    });

    expect(result.deploymentId).toBe('deploy-new');
    expect(result.providerMetadata?.railwayProjectId).toBe('new-project-id');
    expect(result.providerMetadata?.serviceId).toBe('new-service-id');
    expect(createdProject).toBe(true);
    expect(createdService).toBe(true);
  });

  it('throws DeployError when Netlify sites lookup returns non-2xx API error (duplicate protection)', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : String(input);
      const method = init?.method || 'GET';

      if (url === 'https://api.github.com/user' && method === 'GET') {
        return new Response(JSON.stringify({ login: 'testuser' }), { status: 200 });
      }
      if (url === 'https://api.github.com/repos/testuser/od-netlify-p1' && method === 'GET') {
        return new Response(JSON.stringify({ id: 123, name: 'od-netlify-p1' }), { status: 200 });
      }
      if (url === 'https://api.github.com/repos/testuser/od-netlify-p1/keys' && method === 'POST') {
        return new Response(JSON.stringify({ id: 789 }), { status: 201 });
      }
      if (url.startsWith('https://api.github.com/repos/testuser/od-netlify-p1/contents/') && method === 'GET') {
        return new Response('', { status: 404 });
      }
      if (url.startsWith('https://api.github.com/repos/testuser/od-netlify-p1/contents/') && method === 'PUT') {
        return new Response(JSON.stringify({ content: { sha: 'abc123' } }), { status: 201 });
      }
      if (url.includes('/sites?name=od-p1') && method === 'GET') {
        return new Response('Internal Server Error', { status: 500 });
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    stubGlobalFetch(fetchMock);

    await expect(
      deployToNetlify({
        config: { token: 'netlify-token-secret', githubToken: 'ghp-test-token' },
        projectId: 'p1',
        files: [
          {
            file: 'index.html',
            data: Buffer.from('<!doctype html><h1>Hello</h1>'),
            contentType: 'text/html',
          },
        ],
      })
    ).rejects.toThrowError(/Failed to search existing Netlify sites: 500/);
  });

  it('throws DeployError when Netlify pre-trigger lookup fails and trigger response lacks deploy_id', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : String(input);
      const method = init?.method || 'GET';

      if (url === 'https://api.github.com/user' && method === 'GET') {
        return new Response(JSON.stringify({ login: 'testuser' }), { status: 200 });
      }
      if (url === 'https://api.github.com/repos/testuser/od-netlify-p1' && method === 'GET') {
        return new Response(JSON.stringify({ id: 123, name: 'od-netlify-p1' }), { status: 200 });
      }
      if (url === 'https://api.github.com/repos/testuser/od-netlify-p1/keys' && method === 'POST') {
        return new Response(JSON.stringify({ id: 789 }), { status: 201 });
      }
      if (url.startsWith('https://api.github.com/repos/testuser/od-netlify-p1/contents/') && method === 'GET') {
        return new Response('', { status: 404 });
      }
      if (url.startsWith('https://api.github.com/repos/testuser/od-netlify-p1/contents/') && method === 'PUT') {
        return new Response(JSON.stringify({ content: { sha: 'abc123' } }), { status: 201 });
      }
      if (url.includes('/sites?name=od-p1') && method === 'GET') {
        return new Response(JSON.stringify([{ id: 'site-1', site_id: 'site-1', name: 'od-p1', ssl_url: 'https://example.netlify.app' }]), { status: 200 });
      }
      if (url.endsWith('/sites/site-1') && method === 'GET') {
        return new Response(JSON.stringify({ id: 'site-1', site_id: 'site-1', deploy_key_id: 'existing-key-id' }), { status: 200 });
      }
      if (url.endsWith('/sites/site-1') && method === 'PUT') {
        return new Response(JSON.stringify({ id: 'site-1', site_id: 'site-1' }), { status: 200 });
      }
      if (url.endsWith('/deploy_keys/existing-key-id') && method === 'GET') {
        return new Response(JSON.stringify({ id: 'existing-key-id', public_key: 'ssh-rsa AAAAB3NzaC1...' }), { status: 200 });
      }
      if (url.includes('/sites/site-1/deploys?per_page=1') && method === 'GET') {
        return new Response('Internal Server Error', { status: 500 });
      }
      if (url.endsWith('/sites/site-1/builds') && method === 'POST') {
        return new Response(JSON.stringify({}), { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    stubGlobalFetch(fetchMock);

    await expect(
      deployToNetlify({
        config: { token: 'netlify-token-secret', githubToken: 'ghp-test-token' },
        projectId: 'p1',
        files: [
          {
            file: 'index.html',
            data: Buffer.from('<!doctype html><h1>Hello</h1>'),
            contentType: 'text/html',
          },
        ],
      })
    ).rejects.toThrowError(/baseline deployment ID could not be established/);
  });
});

describe('deploy file set', () => {
  it('deploys a single html file as index.html', async () => {
    const { projectsRoot, projectId, dir } = await setupProject();
    await writeFile(path.join(dir, 'page.html'), '<!doctype html><h1>Hello</h1>');

    const files = await buildDeployFileSet(projectsRoot, projectId, 'page.html');

    expect(files.map((f) => f.file)).toEqual(['index.html']);
  });

  it('can include all visible project files while keeping the selected entry at index.html', async () => {
    const { projectsRoot, projectId, dir } = await setupProject();
    await mkdir(path.join(dir, 'screens'), { recursive: true });
    await writeFile(path.join(dir, 'index.html'), '<!doctype html><h1>Launcher</h1>');
    await writeFile(path.join(dir, 'index-v1.html'), '<!doctype html><h1>V1</h1>');
    await writeFile(path.join(dir, 'screens', 'k1-waiting.html'), '<!doctype html><h1>K1</h1>');
    await writeFile(path.join(dir, 'index-v1.html.artifact.json'), '{}');

    const files = await buildDeployFileSet(projectsRoot, projectId, 'index-v1.html', {
      includeProjectFiles: true,
    });
    const index = files.find((item) => item.file === 'index.html');

    expect(files.map((f) => f.file).sort()).toEqual([
      'index-v1.html',
      'index.html',
      'screens/k1-waiting.html',
    ]);
    expect(index?.sourcePath).toBe('index-v1.html');
    expect(index?.data.toString('utf8')).toContain('V1');
  });

  it('does not publish unreferenced files from linked-folder projects', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'od-deploy-linked-test-'));
    const projectsRoot = path.join(root, 'projects');
    const linkedDir = path.join(root, 'linked');
    const projectId = 'linked-p1';
    const metadata = { baseDir: linkedDir };
    await mkdir(path.join(linkedDir, 'src'), { recursive: true });
    await writeFile(path.join(linkedDir, 'index.html'), '<!doctype html><link rel="stylesheet" href="style.css"><h1>Linked</h1>');
    await writeFile(path.join(linkedDir, 'style.css'), 'body { color: black; }');
    await writeFile(path.join(linkedDir, 'README.md'), '# Private notes');
    await writeFile(path.join(linkedDir, 'src', 'app.ts'), 'export const secret = true;');

    const files = await buildDeployFileSet(projectsRoot, projectId, 'index.html', {
      metadata,
      includeProjectFiles: true,
    });

    expect(files.map((f) => f.file).sort()).toEqual([
      'index.html',
      'style.css',
    ]);
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

  it('extracts url() and @import refs from inline <style> blocks', () => {
    const refs = extractInlineCssReferences(
      '<!doctype html><style>@import "theme.css";body{background:url("bg.png")}</style>',
    );
    expect(refs.sort()).toEqual(['bg.png', 'theme.css']);
  });

  it('extracts url() refs from style="" attributes', () => {
    const refs = extractInlineCssReferences(
      "<div style=\"background:url('bg.png')\"></div><span style=\"--bg:url(/abs.png)\"></span>",
    );
    expect(refs.sort()).toEqual(['/abs.png', 'bg.png']);
  });

  it('skips style-like text inside scripts and comments', () => {
    const refs = extractInlineCssReferences(
      '<!-- <style>body{background:url("ghost.png")}</style> -->' +
        '<script>const css = \'<style>body{background:url("missing.png")}</style>\';</script>',
    );
    expect(refs).toEqual([]);
  });

  it('rewrites url() and @import refs in css content relative to baseDir', () => {
    expect(
      rewriteCssReferences(
        '@import "theme.css";body{background:url("bg.png")}',
        'sub',
      ),
    ).toBe('@import "sub/theme.css";body{background:url("sub/bg.png")}');
  });

  it('keeps remote, data, and absolute css refs intact when rewriting', () => {
    expect(
      rewriteCssReferences(
        'body{background:url("https://cdn.test/a.png");--data:url(data:image/png,abc);--root:url("/abs.png")}',
        'sub',
      ),
    ).toBe(
      'body{background:url("https://cdn.test/a.png");--data:url(data:image/png,abc);--root:url("/abs.png")}',
    );
  });

  it('bundles assets referenced from inline <style> blocks', async () => {
    const { projectsRoot, projectId, dir } = await setupProject();
    await mkdir(path.join(dir, 'assets'));
    await mkdir(path.join(dir, 'fonts'));
    await writeFile(
      path.join(dir, 'index.html'),
      '<!doctype html><style>' +
        '@import "theme.css";' +
        "body{background:url('assets/bg.png')}" +
        '@font-face{font-family:Custom;src:url("fonts/custom.woff2") format("woff2");}' +
        '</style>',
    );
    await writeFile(path.join(dir, 'theme.css'), 'body{color:red}');
    await writeFile(path.join(dir, 'assets', 'bg.png'), 'bg');
    await writeFile(path.join(dir, 'fonts', 'custom.woff2'), 'font');

    const files = await buildDeployFileSet(projectsRoot, projectId, 'index.html');

    expect(files.map((f) => f.file).sort()).toEqual([
      'assets/bg.png',
      'fonts/custom.woff2',
      'index.html',
      'theme.css',
    ]);
  });

  it('bundles assets referenced from style="" attributes', async () => {
    const { projectsRoot, projectId, dir } = await setupProject();
    await mkdir(path.join(dir, 'assets'));
    await writeFile(
      path.join(dir, 'index.html'),
      '<!doctype html><div style="background:url(\'assets/hero.png\')">x</div>',
    );
    await writeFile(path.join(dir, 'assets', 'hero.png'), 'hero');

    const files = await buildDeployFileSet(projectsRoot, projectId, 'index.html');

    expect(files.map((f) => f.file).sort()).toEqual(['assets/hero.png', 'index.html']);
  });

  it('rewrites inline <style> url() refs when entry is in a subdirectory', async () => {
    const { projectsRoot, projectId, dir } = await setupProject();
    await mkdir(path.join(dir, 'sub', 'assets'), { recursive: true });
    await writeFile(
      path.join(dir, 'sub', 'page.html'),
      '<!doctype html><style>body{background:url("assets/bg.png")}</style>',
    );
    await writeFile(path.join(dir, 'sub', 'assets', 'bg.png'), 'bg');

    const files = await buildDeployFileSet(projectsRoot, projectId, 'sub/page.html');
    const index = files.find((f) => f.file === 'index.html');

    expect(files.map((f) => f.file).sort()).toEqual(['index.html', 'sub/assets/bg.png']);
    expect(index?.data.toString('utf8')).toContain('url("sub/assets/bg.png")');
  });

  it('rewrites style="" url() refs when entry is in a subdirectory', async () => {
    const { projectsRoot, projectId, dir } = await setupProject();
    await mkdir(path.join(dir, 'sub'), { recursive: true });
    await writeFile(
      path.join(dir, 'sub', 'page.html'),
      "<!doctype html><div style=\"background:url('hero.png')\">x</div>",
    );
    await writeFile(path.join(dir, 'sub', 'hero.png'), 'hero');

    const files = await buildDeployFileSet(projectsRoot, projectId, 'sub/page.html');
    const index = files.find((f) => f.file === 'index.html');

    expect(files.map((f) => f.file).sort()).toEqual(['index.html', 'sub/hero.png']);
    expect(index?.data.toString('utf8')).toContain("url('sub/hero.png')");
  });

  it('reports inline <style> assets that are missing on disk', async () => {
    const { projectsRoot, projectId, dir } = await setupProject();
    await writeFile(
      path.join(dir, 'index.html'),
      '<!doctype html><style>body{background:url("assets/missing.png")}</style>',
    );

    await expect(
      buildDeployFileSet(projectsRoot, projectId, 'index.html'),
    ).rejects.toMatchObject({
      details: { missing: ['assets/missing.png'] },
    });
  });

  it('extracts and rewrites url() refs from <style> inside <svg>', async () => {
    const { projectsRoot, projectId, dir } = await setupProject();
    await mkdir(path.join(dir, 'sub', 'assets'), { recursive: true });
    await writeFile(
      path.join(dir, 'sub', 'page.html'),
      '<!doctype html><svg><style>circle{fill:url("assets/icon.svg")}</style></svg>',
    );
    await writeFile(path.join(dir, 'sub', 'assets', 'icon.svg'), '<svg/>');

    const files = await buildDeployFileSet(projectsRoot, projectId, 'sub/page.html');
    const index = files.find((f) => f.file === 'index.html');

    expect(files.map((f) => f.file).sort()).toEqual(['index.html', 'sub/assets/icon.svg']);
    expect(index?.data.toString('utf8')).toContain('url("sub/assets/icon.svg")');
  });

  it('does not rewrite <style>-like text inside <script> string literals', async () => {
    const { projectsRoot, projectId, dir } = await setupProject();
    await mkdir(path.join(dir, 'sub'), { recursive: true });
    const html =
      '<!doctype html><script>const tpl = \'<style>body{background:url("assets/bg.png")}</style>\';</script>';
    await writeFile(path.join(dir, 'sub', 'page.html'), html);

    const files = await buildDeployFileSet(projectsRoot, projectId, 'sub/page.html');
    const index = files.find((f) => f.file === 'index.html');

    // The fake <style> lives inside a JS string literal, so it must not
    // be processed as inline CSS: no asset is bundled and the script
    // body is preserved byte-for-byte.
    expect(files.map((f) => f.file)).toEqual(['index.html']);
    expect(index?.data.toString('utf8')).toContain(
      "const tpl = '<style>body{background:url(\"assets/bg.png\")}</style>';",
    );
  });

  it('does not rewrite <style>-like text inside HTML comments', () => {
    const html =
      '<!doctype html><!-- <style>body{background:url("ghost.png")}</style> --><h1>x</h1>';
    expect(rewriteEntryHtmlReferences(html, 'sub')).toBe(html);
  });

  it('runs in linear time on pathological unclosed url(', () => {
    const huge = '('.repeat(100_000);
    const input = `body{background:url${huge}}`;
    const startExtract = Date.now();
    const refs = extractCssReferences(input);
    expect(Date.now() - startExtract).toBeLessThan(500);
    expect(refs).toEqual([]);

    const startRewrite = Date.now();
    expect(rewriteCssReferences(input, 'sub')).toBe(input);
    expect(Date.now() - startRewrite).toBeLessThan(500);
  });
});

describe('deploy plan and analyzer', () => {
  async function setupProject() {
    const root = await mkdtemp(path.join(os.tmpdir(), 'od-deploy-plan-test-'));
    const projectId = 'p1';
    const dir = await ensureProject(path.join(root, 'projects'), projectId);
    return { projectsRoot: path.join(root, 'projects'), projectId, dir };
  }

  it('returns the file set plus missing and invalid lists without throwing', async () => {
    const { projectsRoot, projectId, dir } = await setupProject();
    await writeFile(
      path.join(dir, 'index.html'),
      '<!doctype html><meta name="viewport" content="width=device-width"><img src="missing.png">',
    );

    const plan = await buildDeployFilePlan(projectsRoot, projectId, 'index.html');
    expect(plan.entryPath).toBe('index.html');
    expect(plan.files.map((f) => f.file)).toEqual(['index.html']);
    expect(plan.missing).toEqual(['missing.png']);
    expect(plan.invalid).toEqual([]);
  });

  it('reports missing landing image variants from srcset and CSS backgrounds', async () => {
    const { projectsRoot, projectId, dir } = await setupProject();
    await mkdir(path.join(dir, 'assets'), { recursive: true });
    await writeFile(
      path.join(dir, 'index.html'),
      [
        '<!doctype html>',
        '<meta name="viewport" content="width=device-width">',
        '<link rel="stylesheet" href="styles.css">',
        '<picture>',
        '<source srcset="assets/hero.png 1x, assets/hero@2x.png 2x">',
        '<img src="assets/fallback.png" alt="">',
        '</picture>',
      ].join(''),
    );
    await writeFile(path.join(dir, 'styles.css'), 'body{background:url("assets/bg.png")}');
    await writeFile(path.join(dir, 'assets/hero.png'), 'hero');
    await writeFile(path.join(dir, 'assets/fallback.png'), 'fallback');

    const plan = await buildDeployFilePlan(projectsRoot, projectId, 'index.html');
    expect(plan.files.map((f) => f.file).sort()).toEqual([
      'assets/fallback.png',
      'assets/hero.png',
      'index.html',
      'styles.css',
    ]);
    expect(plan.missing.sort()).toEqual(['assets/bg.png', 'assets/hero@2x.png']);

    const { warnings } = analyzeDeployPlan(plan);
    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'broken-reference', path: 'assets/bg.png' }),
        expect.objectContaining({ code: 'broken-reference', path: 'assets/hero@2x.png' }),
      ]),
    );
  });

  it('flags missing assets as broken-reference warnings', () => {
    const { warnings } = analyzeDeployPlan({
      entryPath: 'index.html',
      html: '<!doctype html><meta name="viewport" content="width=device-width">',
      files: [
        { file: 'index.html', data: Buffer.from('<!doctype html>'), contentType: 'text/html', sourcePath: 'index.html' },
      ],
      missing: ['logo.png'],
      invalid: [],
    });
    expect(warnings).toContainEqual(
      expect.objectContaining({ code: 'broken-reference', path: 'logo.png' }),
    );
  });

  it('flags invalid references separately from missing ones', () => {
    const { warnings } = analyzeDeployPlan({
      entryPath: 'index.html',
      html: '<!doctype html><meta name="viewport" content="width=device-width">',
      files: [],
      missing: [],
      invalid: ['../escape.png'],
    });
    expect(warnings).toContainEqual(
      expect.objectContaining({ code: 'invalid-reference', path: '../escape.png' }),
    );
  });

  it('flags missing doctype and viewport', () => {
    const { warnings } = analyzeDeployPlan({
      entryPath: 'index.html',
      html: '<html><body><h1>hi</h1></body></html>',
      files: [],
    });
    const codes = warnings.map((w) => w.code).sort();
    expect(codes).toEqual(['no-doctype', 'no-viewport']);
  });

  it('flags missing doctype even when a fake doctype lives inside a <script> string', () => {
    const html =
      '<html>' +
      '<head><meta name="viewport" content="width=device-width">' +
      '<script>const tpl = `<!doctype html><html></html>`;</script>' +
      '</head><body><h1>hi</h1></body></html>';
    const { warnings } = analyzeDeployPlan({ entryPath: 'index.html', html, files: [] });
    expect(warnings.map((w: any) => w.code)).toContain('no-doctype');
  });

  it('accepts a doctype that follows a leading HTML comment and BOM', () => {
    const html =
      '﻿<!-- generated 2026-05-02 -->\n<!doctype html>' +
      '<meta name="viewport" content="width=device-width">' +
      '<h1>hi</h1>';
    const { warnings } = analyzeDeployPlan({ entryPath: 'index.html', html, files: [] });
    expect(warnings.map((w: any) => w.code)).not.toContain('no-doctype');
  });

  it('checks the doctype prolog without catastrophic backtracking on a comment-only entry', () => {
    // Regression: the prolog check's comment-run group used a lazy `[\s\S]*?`
    // body inside `(?:...)*`, so a comment-only entry with no doctype forced
    // 2^n backtracking — a ~250-byte HTML could hang the single-threaded
    // daemon for minutes (event-loop DoS on POST /deploy/preflight). The
    // tempered comment body makes each comment match deterministically.
    const html = '<!---->'.repeat(28) + '<html><body></body></html>';
    const start = performance.now();
    const { warnings } = analyzeDeployPlan({ entryPath: 'index.html', html, files: [] });
    const elapsedMs = performance.now() - start;
    // Correctness is preserved (no doctype -> still flagged) and the check is
    // linear: the tempered regex handles this in well under 1ms, whereas the
    // old lazy-body regex grew ~2x per added comment (seconds here, minutes
    // with a few more). The 500ms budget sits far above the fixed path (~100x
    // headroom, no false failures) yet well below the vulnerable time, so any
    // regression blows it.
    expect(warnings.map((w) => w.code)).toContain('no-doctype');
    expect(elapsedMs).toBeLessThan(500);
  });

  it('flags external scripts and stylesheets', () => {
    const { warnings } = analyzeDeployPlan({
      entryPath: 'index.html',
      html:
        '<!doctype html><meta name="viewport" content="width=device-width">' +
        '<link rel="stylesheet" href="https://cdn.test/x.css">' +
        '<script src="https://cdn.test/x.js"></script>',
      files: [],
    });
    const codes = warnings.map((w) => w.code).sort();
    expect(codes).toEqual(['external-script', 'external-stylesheet']);
    const ext = warnings.find((w) => w.code === 'external-script');
    expect(ext?.url).toBe('https://cdn.test/x.js');
  });

  it('does not flag protocol-relative scripts as external when they are in fact external', () => {
    const { warnings } = analyzeDeployPlan({
      entryPath: 'index.html',
      html:
        '<!doctype html><meta name="viewport" content="width=device-width">' +
        '<script src="//cdn.test/x.js"></script>',
      files: [],
    });
    expect(warnings).toContainEqual(
      expect.objectContaining({ code: 'external-script', url: '//cdn.test/x.js' }),
    );
  });

  it('flags large per-file assets but not the entry HTML', () => {
    const big = Buffer.alloc(DEPLOY_PREFLIGHT_LARGE_ASSET_BYTES + 1);
    const { warnings } = analyzeDeployPlan({
      entryPath: 'index.html',
      html: '<!doctype html><meta name="viewport" content="width=device-width">',
      files: [
        { file: 'index.html', data: Buffer.alloc(50), contentType: 'text/html', sourcePath: 'index.html' },
        { file: 'hero.jpg', data: big, contentType: 'image/jpeg', sourcePath: 'hero.jpg' },
      ],
    });
    expect(warnings).toContainEqual(
      expect.objectContaining({ code: 'large-asset', path: 'hero.jpg' }),
    );
    expect(warnings.some((w) => w.code === 'large-html')).toBe(false);
  });

  it('flags large entry HTML', () => {
    const huge = Buffer.alloc(DEPLOY_PREFLIGHT_LARGE_HTML_BYTES + 1);
    const { warnings } = analyzeDeployPlan({
      entryPath: 'index.html',
      html: '<!doctype html><meta name="viewport" content="width=device-width">',
      files: [
        { file: 'index.html', data: huge, contentType: 'text/html', sourcePath: 'index.html' },
      ],
    });
    expect(warnings).toContainEqual(
      expect.objectContaining({ code: 'large-html', path: 'index.html' }),
    );
  });

  it('reports large-html against the source entry path, not the renamed deploy file', () => {
    const huge = Buffer.alloc(DEPLOY_PREFLIGHT_LARGE_HTML_BYTES + 1);
    const { warnings } = analyzeDeployPlan({
      entryPath: 'pages/landing.html',
      html: '<!doctype html><meta name="viewport" content="width=device-width">',
      files: [
        { file: 'index.html', data: huge, contentType: 'text/html', sourcePath: 'pages/landing.html' },
      ],
    });
    const found = warnings.find((w: any) => w.code === 'large-html');
    expect(found?.path).toBe('pages/landing.html');
  });

  it('returns no warnings on a healthy entry HTML', () => {
    const { warnings, totalFiles, totalBytes } = analyzeDeployPlan({
      entryPath: 'index.html',
      html: '<!doctype html><meta name="viewport" content="width=device-width"><h1>Hello</h1>',
      files: [
        { file: 'index.html', data: Buffer.from('<!doctype html><h1>Hello</h1>'), contentType: 'text/html', sourcePath: 'index.html' },
      ],
    });
    expect(warnings).toEqual([]);
    expect(totalFiles).toBe(1);
    expect(totalBytes).toBeGreaterThan(0);
  });

  it('preflight payload includes provider, entry, file list, totals and warnings', async () => {
    const { projectsRoot, projectId, dir } = await setupProject();
    await mkdir(path.join(dir, 'assets'));
    await writeFile(
      path.join(dir, 'index.html'),
      '<!doctype html><meta name="viewport" content="width=device-width">' +
        '<script src="https://cdn.test/x.js"></script>' +
        '<img src="assets/logo.png">',
    );
    await writeFile(path.join(dir, 'assets', 'logo.png'), 'logo');

    const result = await prepareDeployPreflight(projectsRoot, projectId, 'index.html');
    expect(result.providerId).toBe('vercel-self');
    expect(result.entry).toBe('index.html');
    expect(result.totalFiles).toBe(2);
    expect(result.totalBytes).toBeGreaterThan(0);
    expect(result.files.map((f) => f.path).sort()).toEqual(['assets/logo.png', 'index.html']);
    const codes = result.warnings.map((w) => w.code);
    expect(codes).toContain('external-script');
    expect(codes).not.toContain('broken-reference');
  });

  it('preflight preserves provider identity when requested', async () => {
    const { projectsRoot, projectId, dir } = await setupProject();
    await writeFile(path.join(dir, 'index.html'), '<!doctype html><h1>Hello</h1>');

    const result = await prepareDeployPreflight(projectsRoot, projectId, 'index.html', {
      providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
    });
    expect(result.providerId).toBe(CLOUDFLARE_PAGES_PROVIDER_ID);
  });

  it('preflight reports broken references instead of throwing', async () => {
    const { projectsRoot, projectId, dir } = await setupProject();
    await writeFile(
      path.join(dir, 'index.html'),
      '<!doctype html><meta name="viewport" content="width=device-width"><img src="missing.png">',
    );

    const result = await prepareDeployPreflight(projectsRoot, projectId, 'index.html');
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'broken-reference', path: 'missing.png' }),
    );
    expect(result.totalFiles).toBe(1);
  });

  it('preflight rejects non-html entry names', async () => {
    const { projectsRoot, projectId, dir } = await setupProject();
    await writeFile(path.join(dir, 'data.json'), '{}');
    await expect(
      prepareDeployPreflight(projectsRoot, projectId, 'data.json'),
    ).rejects.toThrow(/HTML/);
  });

  it('buildDeployFileSet still throws when missing or invalid refs exist', async () => {
    const { projectsRoot, projectId, dir } = await setupProject();
    await writeFile(path.join(dir, 'index.html'), '<img src="missing.png">');
    await expect(
      buildDeployFileSet(projectsRoot, projectId, 'index.html'),
    ).rejects.toMatchObject({ details: { missing: ['missing.png'] } });
  });
});

describe('cloudflare pages deploys', () => {
  function customDomainRequestInfo(input: string | URL | Request, init?: RequestInit) {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof Request
          ? input.url
          : String(input);
    const method =
      init?.method || (input instanceof Request ? input.method : 'GET');
    return { url, method };
  }

  function createCustomDomainDeployMock(options: {
    dnsRecords?: Array<Record<string, unknown>>;
    dnsRecordsAfterDuplicate?: Array<Record<string, unknown>>;
    dnsCreateAlreadyExists?: boolean;
    dnsCreateRejectsComment?: boolean;
    pagesDomains?: Array<Record<string, unknown>>;
    customHeadStatus?: number;
  } = {}) {
    const indexHash = cloudflarePagesAssetHash({
      file: 'index.html',
      data: Buffer.from('hello index'),
    });
    const calls: Array<{ url: string; method: string; body?: unknown }> = [];
    let dnsCreateCount = 0;
    let dnsLookupCount = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const { url, method } = customDomainRequestInfo(input, init);
      calls.push({ url, method, body: init?.body });

      if (url.endsWith('/pages/projects/demo-pages') && method === 'GET') {
        return new Response(JSON.stringify({ success: true, result: { name: 'demo-pages' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/pages/projects/demo-pages/upload-token') && method === 'GET') {
        return new Response(JSON.stringify({ success: true, result: { jwt: 'pages-upload-jwt' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/pages/assets/check-missing') && method === 'POST') {
        return new Response(JSON.stringify({ success: true, result: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/pages/assets/upsert-hashes') && method === 'POST') {
        expect(JSON.parse(String(init?.body ?? '{}'))).toEqual({ hashes: [indexHash] });
        return new Response(JSON.stringify({ success: true, result: null }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/pages/projects/demo-pages/deployments') && method === 'POST') {
        return new Response(JSON.stringify({
          success: true,
          result: { id: 'dep_custom', url: 'https://d34527d9.demo-pages.pages.dev' },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://demo-pages.pages.dev' && method === 'HEAD') {
        return new Response('', { status: 200 });
      }
      if (url.endsWith('/zones/zone-1') && method === 'GET') {
        return new Response(JSON.stringify({
          success: true,
          result: { id: 'zone-1', name: 'example.com', status: 'active', type: 'full' },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/zones/zone-1/dns_records?') && method === 'GET') {
        dnsLookupCount += 1;
        const result = options.dnsRecordsAfterDuplicate && dnsLookupCount > 1
          ? options.dnsRecordsAfterDuplicate
          : options.dnsRecords ?? [];
        return new Response(JSON.stringify({ success: true, result }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/zones/zone-1/dns_records') && method === 'POST') {
        dnsCreateCount += 1;
        const body = JSON.parse(String(init?.body ?? '{}'));
        if (options.dnsCreateRejectsComment && dnsCreateCount === 1) {
          expect(body).toHaveProperty('comment');
          return new Response(JSON.stringify({
            success: false,
            errors: [{ message: 'comment is not allowed for this token' }],
          }), {
            status: 400,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (options.dnsCreateAlreadyExists && dnsCreateCount === 1) {
          return new Response(JSON.stringify({
            success: false,
            errors: [{ message: 'DNS record already exists' }],
          }), {
            status: 409,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ success: true, result: { id: 'dns-1', ...body } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/zones/zone-1/dns_records/dns-1') && method === 'PATCH') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        return new Response(JSON.stringify({ success: true, result: { id: 'dns-1', ...body } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/pages/projects/demo-pages/domains/demo.example.com') && method === 'GET') {
        const result = (options.pagesDomains ?? [])
          .find((domain) => domain.name === 'demo.example.com');
        if (!result) {
          return new Response(JSON.stringify({
            success: false,
            errors: [{ message: 'Custom domain not found' }],
          }), {
            status: 404,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({
          success: true,
          result,
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/pages/projects/demo-pages/domains') && method === 'POST') {
        return new Response(JSON.stringify({
          success: true,
          result: { name: 'demo.example.com', status: 'active' },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://demo.example.com' && method === 'HEAD') {
        return new Response('', { status: options.customHeadStatus ?? 200 });
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    return { calls, fetchMock };
  }

  async function deployWithCustomDomain(options: {
    priorMetadata?: Record<string, unknown>;
  } = {}) {
    return deployToCloudflarePages({
      config: {
        token: 'cloudflare-token-secret',
        accountId: 'account_123',
        projectName: 'demo-pages',
      },
      projectId: 'project-1',
      cloudflarePages: {
        zoneId: 'zone-1',
        zoneName: 'example.com',
        domainPrefix: 'demo',
      },
      priorMetadata: options.priorMetadata,
      files: [
        {
          file: 'index.html',
          data: Buffer.from('hello index'),
          contentType: 'text/html',
          sourcePath: 'index.html',
        },
      ],
    });
  }

  it('chunks asset uploads before posting to Cloudflare Pages', () => {
    const chunks = chunkCloudflarePagesAssetUploads(
      [
        { hash: 'a'.repeat(32), data: Buffer.from('one'), contentType: 'text/plain' },
        { hash: 'b'.repeat(32), data: Buffer.from('two'), contentType: 'text/plain' },
        { hash: 'c'.repeat(32), data: Buffer.from('three'), contentType: 'text/plain' },
      ],
      { maxFiles: 2, maxBytes: 10_000 },
    );

    expect(chunks.map((chunk) => chunk.map((file) => file.hash))).toEqual([
      ['a'.repeat(32), 'b'.repeat(32)],
      ['c'.repeat(32)],
    ]);
  });

  it('rejects Cloudflare Pages assets above the per-file upload limit', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
      const method =
        init?.method || (input instanceof Request ? input.method : 'GET');

      if (url.endsWith('/pages/projects/demo-pages') && method === 'GET') {
        return new Response(JSON.stringify({ success: true, result: { name: 'demo-pages' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/pages/projects/demo-pages/upload-token') && method === 'GET') {
        return new Response(JSON.stringify({ success: true, result: { jwt: 'pages-upload-jwt' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    stubGlobalFetch(fetchMock);

    await expect(deployToCloudflarePages({
      config: {
        token: 'cloudflare-token-secret',
        accountId: 'account_123',
        projectName: 'demo-pages',
      },
      files: [
        {
          file: 'huge.bin',
          data: Buffer.alloc(CLOUDFLARE_PAGES_ASSET_MAX_BYTES + 1),
          contentType: 'application/octet-stream',
          sourcePath: 'huge.bin',
        },
      ],
    })).rejects.toThrow(/25\.00 MiB or smaller/);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('creates missing projects and uploads assets before submitting a manifest', async () => {
    const requests: Array<{ url: string; method: string; body?: any; headers: Headers }> = [];
    const indexHash = cloudflarePagesAssetHash({
      file: 'index.html',
      data: Buffer.from('hello index'),
    });
    const assetHash = cloudflarePagesAssetHash({
      file: 'assets/style.css',
      data: Buffer.from('body { color: red; }'),
    });
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
      const method =
        init?.method || (input instanceof Request ? input.method : 'GET');
      const headers = new Headers(
        init?.headers || (input instanceof Request ? input.headers : undefined),
      );
      requests.push({ url, method, body: init?.body, headers });

      if (url.endsWith('/pages/projects/demo-pages') && method === 'GET') {
        return new Response(JSON.stringify({ success: false, errors: [{ message: 'not found' }] }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (url.endsWith('/pages/projects') && method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        expect(body).toEqual({
          name: 'demo-pages',
          production_branch: 'main',
        });
        return new Response(JSON.stringify({ success: true, result: { name: body.name } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (url.endsWith('/pages/projects/demo-pages/upload-token') && method === 'GET') {
        return new Response(JSON.stringify({ success: true, result: { jwt: 'pages-upload-jwt' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (url.endsWith('/pages/assets/check-missing') && method === 'POST') {
        expect(headers.get('authorization')).toBe('Bearer pages-upload-jwt');
        expect(JSON.parse(String(init?.body ?? '{}'))).toEqual({
          hashes: [indexHash, assetHash],
        });
        return new Response(JSON.stringify({ success: true, result: [indexHash, assetHash] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (url.endsWith('/pages/assets/upload') && method === 'POST') {
        expect(headers.get('authorization')).toBe('Bearer pages-upload-jwt');
        expect(JSON.parse(String(init?.body ?? '[]'))).toEqual([
          {
            key: indexHash,
            value: Buffer.from('hello index').toString('base64'),
            metadata: { contentType: 'text/html' },
            base64: true,
          },
          {
            key: assetHash,
            value: Buffer.from('body { color: red; }').toString('base64'),
            metadata: { contentType: 'text/css' },
            base64: true,
          },
        ]);
        return new Response(JSON.stringify({ success: true, result: null }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (url.endsWith('/pages/assets/upsert-hashes') && method === 'POST') {
        expect(headers.get('authorization')).toBe('Bearer pages-upload-jwt');
        expect(JSON.parse(String(init?.body ?? '{}'))).toEqual({
          hashes: [indexHash, assetHash],
        });
        return new Response(JSON.stringify({ success: true, result: null }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (url.endsWith('/pages/projects/demo-pages/deployments') && method === 'POST') {
        const form = init?.body as FormData;
        expect(form).toBeInstanceOf(FormData);
        const manifest = JSON.parse(String(form?.get('manifest') ?? '{}')) as Record<string, string>;
        expect(form.get('branch')).toBe('main');
        expect(form.get('pages_build_output_dir')).toBeNull();
        expect(manifest).toEqual({
          '/index.html': indexHash,
          '/assets/style.css': assetHash,
        });
        expect(form.get(indexHash)).toBeNull();
        expect(form.get(assetHash)).toBeNull();
        return new Response(JSON.stringify({
          success: true,
          result: { id: 'dep_123', url: 'https://d34527d9.demo-pages.pages.dev' },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (url === 'https://demo-pages.pages.dev' && method === 'HEAD') {
        return new Response('', { status: 200 });
      }
      if (url.endsWith('/zones/zone-1') && method === 'GET') {
        return new Response(JSON.stringify({
          success: true,
          result: { id: 'zone-1', name: 'example.com', status: 'active', type: 'full' },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    stubGlobalFetch(fetchMock);

    const result = await deployToCloudflarePages({
      config: {
        token: 'cloudflare-token-secret',
        accountId: 'account_123',
        projectName: 'demo-pages',
      },
      files: [
        {
          file: 'index.html',
          data: Buffer.from('hello index'),
          contentType: 'text/html',
          sourcePath: 'index.html',
        },
        {
          file: 'assets/style.css',
          data: Buffer.from('body { color: red; }'),
          contentType: 'text/css',
          sourcePath: 'assets/style.css',
        },
      ],
    });

    expect(result).toMatchObject({
      providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
      deploymentId: 'dep_123',
      url: 'https://demo-pages.pages.dev',
      status: 'ready',
    });
    expect(requests).toHaveLength(8);
    expect(requests[0]?.headers.get('authorization')).toBe('Bearer cloudflare-token-secret');
  });

  it('treats concurrent Cloudflare Pages project creation races as already satisfied', async () => {
    const indexHash = cloudflarePagesAssetHash({
      file: 'index.html',
      data: Buffer.from('hello index'),
    });
    let projectLookupCount = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
      const method =
        init?.method || (input instanceof Request ? input.method : 'GET');

      if (url.endsWith('/pages/projects/demo-pages') && method === 'GET') {
        projectLookupCount += 1;
        if (projectLookupCount === 1) {
          return new Response(JSON.stringify({ success: false, errors: [{ message: 'not found' }] }), {
            status: 404,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ success: true, result: { name: 'demo-pages' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (url.endsWith('/pages/projects') && method === 'POST') {
        return new Response(
          JSON.stringify({ success: false, errors: [{ message: 'Project already exists' }] }),
          { status: 409, headers: { 'content-type': 'application/json' } },
        );
      }

      if (url.endsWith('/pages/projects/demo-pages/upload-token') && method === 'GET') {
        return new Response(JSON.stringify({ success: true, result: { jwt: 'pages-upload-jwt' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (url.endsWith('/pages/assets/check-missing') && method === 'POST') {
        return new Response(JSON.stringify({ success: true, result: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (url.endsWith('/pages/assets/upsert-hashes') && method === 'POST') {
        expect(JSON.parse(String(init?.body ?? '{}'))).toEqual({ hashes: [indexHash] });
        return new Response(JSON.stringify({ success: true, result: null }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (url.endsWith('/pages/projects/demo-pages/deployments') && method === 'POST') {
        return new Response(JSON.stringify({
          success: true,
          result: { id: 'dep_123', url: 'https://d34527d9.demo-pages.pages.dev' },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (url === 'https://demo-pages.pages.dev' && method === 'HEAD') {
        return new Response('', { status: 200 });
      }
      if (url.endsWith('/zones/zone-1') && method === 'GET') {
        return new Response(JSON.stringify({
          success: true,
          result: { id: 'zone-1', name: 'example.com', status: 'active', type: 'full' },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    stubGlobalFetch(fetchMock);

    const result = await deployToCloudflarePages({
      config: {
        token: 'cloudflare-token-secret',
        accountId: 'account_123',
        projectName: 'demo-pages',
      },
      files: [
        {
          file: 'index.html',
          data: Buffer.from('hello index'),
          contentType: 'text/html',
          sourcePath: 'index.html',
        },
      ],
    });

    expect(result).toMatchObject({
      providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
      deploymentId: 'dep_123',
      url: 'https://demo-pages.pages.dev',
      status: 'ready',
    });
    expect(projectLookupCount).toBe(2);
  });

  it('rejects invalid custom-domain prefix before creating a Pages deployment', async () => {
    const fetchMock = vi.fn();
    stubGlobalFetch(fetchMock);

    await expect(deployToCloudflarePages({
      config: {
        token: 'cloudflare-token-secret',
        accountId: 'account_123',
        projectName: 'demo-pages',
      },
      projectId: 'project-1',
      cloudflarePages: {
        zoneId: 'zone-1',
        zoneName: 'example.com',
        domainPrefix: 'bad.prefix',
      },
      files: [],
    })).rejects.toThrow(/valid subdomain prefix/i);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects stale Cloudflare zone selections before creating a Pages deployment', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
      const method =
        init?.method || (input instanceof Request ? input.method : 'GET');
      if (url.endsWith('/zones/zone-1') && method === 'GET') {
        return new Response(JSON.stringify({
          success: true,
          result: { id: 'zone-1', name: 'other.example', status: 'active', type: 'full' },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    stubGlobalFetch(fetchMock);

    await expect(deployToCloudflarePages({
      config: {
        token: 'cloudflare-token-secret',
        accountId: 'account_123',
        projectName: 'demo-pages',
      },
      projectId: 'project-1',
      cloudflarePages: {
        zoneId: 'zone-1',
        zoneName: 'example.com',
        domainPrefix: 'demo',
      },
      files: [],
    })).rejects.toThrow(/zone selection/i);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('paginates Cloudflare Pages zones for large accounts', async () => {
    const pagesSeen: number[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      const requestUrl = new URL(url);
      expect(requestUrl.pathname).toBe('/client/v4/zones');
      expect(requestUrl.searchParams.get('account.id')).toBe('account_123');
      expect(requestUrl.searchParams.get('per_page')).toBe('100');
      const page = Number(requestUrl.searchParams.get('page') || '1');
      pagesSeen.push(page);
      const result = page === 1
        ? [{ id: 'zone-1', name: 'example.com', status: 'active', type: 'full' }]
        : [{ id: 'zone-2', name: 'example.org', status: 'active', type: 'full' }];
      return new Response(JSON.stringify({
        success: true,
        result,
        result_info: { page, per_page: 100, total_pages: 2 },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    stubGlobalFetch(fetchMock);

    await expect(listCloudflarePagesZones({
      token: 'cloudflare-token-secret',
      accountId: 'account_123',
      cloudflarePages: { lastZoneId: 'zone-2' },
    })).resolves.toEqual({
      zones: [
        { id: 'zone-1', name: 'example.com', status: 'active', type: 'full' },
        { id: 'zone-2', name: 'example.org', status: 'active', type: 'full' },
      ],
      cloudflarePages: { lastZoneId: 'zone-2' },
    });
    expect(pagesSeen).toEqual([1, 2]);
  });

  it('round-trips typed Cloudflare info while keeping provider metadata internal', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'od-deployment-db-test-'));
    try {
      const db = openDatabase(root, { dataDir: path.join(root, '.od') });
      insertProject(db, {
        id: 'project-1',
        name: 'Project 1',
        skillId: null,
        designSystemId: null,
        createdAt: 1,
        updatedAt: 1,
      });
      const saved = upsertDeployment(db, {
        id: 'deployment-1',
        projectId: 'project-1',
        fileName: 'index.html',
        providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
        url: 'https://demo-pages.pages.dev',
        deploymentId: 'dep-1',
        deploymentCount: 1,
        target: 'preview',
        status: 'link-delayed',
        cloudflarePages: {
          projectName: 'demo-pages',
          pagesDev: {
            url: 'https://demo-pages.pages.dev',
            status: 'ready',
          },
          customDomain: {
            hostname: 'demo.example.com',
            url: 'https://demo.example.com',
            zoneId: 'zone-1',
            zoneName: 'example.com',
            domainPrefix: 'demo',
            status: 'pending',
            dnsStatus: 'created',
            dnsRecordId: 'dns-1',
            dnsOwnership: 'marked',
            domainStatus: 'pending',
          },
        },
        providerMetadata: {
          cloudflarePagesProjectName: 'demo-pages',
          cloudflarePagesCustomDomain: {
            projectId: 'project-1',
            pagesProjectName: 'demo-pages',
            hostname: 'demo.example.com',
            marker: 'od:cfp:aaaaaaaaaaaa:bbbbbbbbbbbb',
            dnsRecordId: 'dns-1',
          },
        },
        createdAt: 1,
        updatedAt: 2,
      });
      const loaded = getDeployment(db, 'project-1', 'index.html', CLOUDFLARE_PAGES_PROVIDER_ID);
      if (!saved || !loaded) throw new Error('expected deployment roundtrip to be saved');

      expect(saved).toMatchObject({
        cloudflarePages: {
          customDomain: {
            hostname: 'demo.example.com',
            dnsRecordId: 'dns-1',
          },
        },
        providerMetadata: {
          cloudflarePagesProjectName: 'demo-pages',
          cloudflarePagesCustomDomain: {
            marker: 'od:cfp:aaaaaaaaaaaa:bbbbbbbbbbbb',
          },
        },
      });
      expect(loaded).toMatchObject(saved);
    } finally {
      closeDatabase();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('creates a Cloudflare DNS CNAME and Pages custom domain while keeping pages.dev primary', async () => {
    const indexHash = cloudflarePagesAssetHash({
      file: 'index.html',
      data: Buffer.from('hello index'),
    });
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
      const method =
        init?.method || (input instanceof Request ? input.method : 'GET');

      if (url.endsWith('/pages/projects/demo-pages') && method === 'GET') {
        return new Response(JSON.stringify({ success: true, result: { name: 'demo-pages' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/pages/projects/demo-pages/upload-token') && method === 'GET') {
        return new Response(JSON.stringify({ success: true, result: { jwt: 'pages-upload-jwt' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/pages/assets/check-missing') && method === 'POST') {
        return new Response(JSON.stringify({ success: true, result: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/pages/assets/upsert-hashes') && method === 'POST') {
        expect(JSON.parse(String(init?.body ?? '{}'))).toEqual({ hashes: [indexHash] });
        return new Response(JSON.stringify({ success: true, result: null }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/pages/projects/demo-pages/deployments') && method === 'POST') {
        return new Response(JSON.stringify({
          success: true,
          result: { id: 'dep_custom', url: 'https://d34527d9.demo-pages.pages.dev' },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://demo-pages.pages.dev' && method === 'HEAD') {
        return new Response('', { status: 200 });
      }
      if (url.endsWith('/zones/zone-1') && method === 'GET') {
        return new Response(JSON.stringify({
          success: true,
          result: { id: 'zone-1', name: 'example.com', status: 'active', type: 'full' },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/zones/zone-1/dns_records?') && method === 'GET') {
        expect(url).toContain('name=demo.example.com');
        return new Response(JSON.stringify({ success: true, result: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/zones/zone-1/dns_records') && method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        expect(body).toMatchObject({
          type: 'CNAME',
          name: 'demo.example.com',
          content: 'demo-pages.pages.dev',
          proxied: true,
          ttl: 1,
        });
        expect(body.comment).toMatch(/^od:cfp:[a-f0-9]{12}:[a-f0-9]{12}$/);
        return new Response(JSON.stringify({ success: true, result: { id: 'dns-1', ...body } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/pages/projects/demo-pages/domains/demo.example.com') && method === 'GET') {
        return new Response(JSON.stringify({
          success: false,
          errors: [{ message: 'Custom domain not found' }],
        }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/pages/projects/demo-pages/domains') && method === 'POST') {
        expect(JSON.parse(String(init?.body ?? '{}'))).toEqual({ name: 'demo.example.com' });
        return new Response(JSON.stringify({
          success: true,
          result: { name: 'demo.example.com', status: 'active' },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://demo.example.com' && method === 'HEAD') {
        return new Response('', { status: 200 });
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    stubGlobalFetch(fetchMock);

    const result = await deployToCloudflarePages({
      config: {
        token: 'cloudflare-token-secret',
        accountId: 'account_123',
        projectName: 'demo-pages',
      },
      projectId: 'project-1',
      cloudflarePages: {
        zoneId: 'zone-1',
        zoneName: 'example.com',
        domainPrefix: 'demo',
      },
      files: [
        {
          file: 'index.html',
          data: Buffer.from('hello index'),
          contentType: 'text/html',
          sourcePath: 'index.html',
        },
      ],
    });

    expect(result).toMatchObject({
      providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
      url: 'https://demo-pages.pages.dev',
      status: 'ready',
      cloudflarePages: {
        pagesDev: {
          url: 'https://demo-pages.pages.dev',
          status: 'ready',
        },
        customDomain: {
          hostname: 'demo.example.com',
          url: 'https://demo.example.com',
          status: 'ready',
          dnsStatus: 'created',
          dnsRecordId: 'dns-1',
          dnsOwnership: 'marked',
          domainStatus: 'active',
        },
      },
      providerMetadata: {
        cloudflarePagesProjectName: 'demo-pages',
        cloudflarePagesCustomDomain: {
          projectId: 'project-1',
          pagesProjectName: 'demo-pages',
          hostname: 'demo.example.com',
          dnsRecordId: 'dns-1',
        },
      },
    });
  });

  it('reuses an exact Cloudflare CNAME without mutating DNS', async () => {
    const { calls, fetchMock } = createCustomDomainDeployMock({
      dnsRecords: [{
        id: 'dns-existing',
        type: 'CNAME',
        name: 'demo.example.com',
        content: 'demo-pages.pages.dev',
      }],
    });
    stubGlobalFetch(fetchMock);

    const result = await deployWithCustomDomain();

    expect(result).toMatchObject({
      status: 'ready',
      cloudflarePages: {
        customDomain: {
          hostname: 'demo.example.com',
          status: 'ready',
          dnsStatus: 'reused',
          dnsRecordId: 'dns-existing',
          dnsOwnership: 'unmarked',
        },
      },
    });
    expect(calls.some((call) => (
      call.url.includes('/zones/zone-1/dns_records') &&
      (call.method === 'POST' || call.method === 'PATCH')
    ))).toBe(false);
  });

  it('reuses a concurrently created CNAME after Cloudflare reports a duplicate', async () => {
    const { calls, fetchMock } = createCustomDomainDeployMock({
      dnsRecords: [],
      dnsCreateAlreadyExists: true,
      dnsRecordsAfterDuplicate: [{
        id: 'dns-race',
        type: 'CNAME',
        name: 'demo.example.com',
        content: 'demo-pages.pages.dev',
      }],
    });
    stubGlobalFetch(fetchMock);

    const result = await deployWithCustomDomain();

    expect(result).toMatchObject({
      status: 'ready',
      cloudflarePages: {
        customDomain: {
          hostname: 'demo.example.com',
          status: 'ready',
          dnsStatus: 'reused',
          dnsRecordId: 'dns-race',
          dnsOwnership: 'unmarked',
        },
      },
    });
    expect(calls.filter((call) => call.url.includes('/zones/zone-1/dns_records?') && call.method === 'GET')).toHaveLength(2);
    expect(calls.filter((call) => call.url.endsWith('/zones/zone-1/dns_records') && call.method === 'POST')).toHaveLength(1);
  });

  it('reads an existing Cloudflare Pages custom domain without unsupported list pagination', async () => {
    const { calls, fetchMock } = createCustomDomainDeployMock({
      pagesDomains: [{ name: 'demo.example.com', status: 'active' }],
    });
    stubGlobalFetch(fetchMock);

    const result = await deployWithCustomDomain();

    expect(result).toMatchObject({
      status: 'ready',
      cloudflarePages: {
        customDomain: {
          hostname: 'demo.example.com',
          status: 'ready',
          domainStatus: 'active',
        },
      },
    });
    const domainLookupUrls = calls
      .filter((call) => call.url.includes('/pages/projects/demo-pages/domains/') && call.method === 'GET')
      .map((call) => call.url);
    expect(domainLookupUrls).toEqual([
      'https://api.cloudflare.com/client/v4/accounts/account_123/pages/projects/demo-pages/domains/demo.example.com',
    ]);
    expect(domainLookupUrls.every((url) => !url.includes('?'))).toBe(true);
    expect(calls.some((call) => call.url.endsWith('/pages/projects/demo-pages/domains') && call.method === 'POST')).toBe(false);
  });

  it('retries DNS creation without a comment when Cloudflare rejects comments', async () => {
    const { calls, fetchMock } = createCustomDomainDeployMock({
      dnsCreateRejectsComment: true,
    });
    stubGlobalFetch(fetchMock);

    const result = await deployWithCustomDomain();

    expect(result).toMatchObject({
      status: 'ready',
      cloudflarePages: {
        customDomain: {
          status: 'ready',
          dnsStatus: 'created',
          dnsRecordId: 'dns-1',
          dnsOwnership: 'unmarked',
        },
      },
    });
    const dnsCreateBodies = calls
      .filter((call) => call.url.endsWith('/zones/zone-1/dns_records') && call.method === 'POST')
      .map((call) => JSON.parse(String(call.body ?? '{}')));
    expect(dnsCreateBodies).toHaveLength(2);
    expect(dnsCreateBodies[0]).toHaveProperty('comment');
    expect(dnsCreateBodies[1]).not.toHaveProperty('comment');
  });

  it('does not patch an unowned different-target CNAME', async () => {
    const { calls, fetchMock } = createCustomDomainDeployMock({
      dnsRecords: [{
        id: 'dns-external',
        type: 'CNAME',
        name: 'demo.example.com',
        content: 'other.pages.dev',
      }],
    });
    stubGlobalFetch(fetchMock);

    const result = await deployWithCustomDomain();

    expect(result).toMatchObject({
      status: 'ready',
      cloudflarePages: {
        pagesDev: {
          url: 'https://demo-pages.pages.dev',
          status: 'ready',
        },
        customDomain: {
          hostname: 'demo.example.com',
          status: 'conflict',
          errorCode: 'cloudflare_dns_record_conflict',
          dnsStatus: 'conflict',
          dnsRecordId: 'dns-external',
          dnsOwnership: 'external',
          domainStatus: 'skipped',
        },
      },
    });
    expect(calls.some((call) => call.method === 'PATCH')).toBe(false);
    expect(calls.some((call) => call.url.endsWith('/pages/projects/demo-pages/domains') && call.method === 'POST')).toBe(false);
  });

  it('patches only a previously owned CNAME with matching marker metadata', async () => {
    const initial = createCustomDomainDeployMock();
    stubGlobalFetch(initial.fetchMock);
    const first = await deployWithCustomDomain();
    const priorMetadata = first.providerMetadata as Record<string, unknown>;
    const priorCustom = priorMetadata.cloudflarePagesCustomDomain as Record<string, unknown>;
    vi.unstubAllGlobals();

    const { calls, fetchMock } = createCustomDomainDeployMock({
      dnsRecords: [{
        id: 'dns-1',
        type: 'CNAME',
        name: 'demo.example.com',
        content: 'old-demo-pages.pages.dev',
        comment: priorCustom.marker,
      }],
    });
    stubGlobalFetch(fetchMock);

    const result = await deployWithCustomDomain({ priorMetadata });

    expect(result).toMatchObject({
      status: 'ready',
      cloudflarePages: {
        customDomain: {
          hostname: 'demo.example.com',
          status: 'ready',
          dnsStatus: 'patched',
          dnsRecordId: 'dns-1',
          dnsOwnership: 'marked',
        },
      },
    });
    const patchBodies = calls
      .filter((call) => call.url.endsWith('/zones/zone-1/dns_records/dns-1') && call.method === 'PATCH')
      .map((call) => JSON.parse(String(call.body ?? '{}')));
    expect(patchBodies).toEqual([expect.objectContaining({
      type: 'CNAME',
      name: 'demo.example.com',
      content: 'demo-pages.pages.dev',
      comment: priorCustom.marker,
    })]);
  });

  it('returns partial success with pages.dev when DNS custom-domain setup conflicts', async () => {
    const indexHash = cloudflarePagesAssetHash({
      file: 'index.html',
      data: Buffer.from('hello index'),
    });
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
      const method =
        init?.method || (input instanceof Request ? input.method : 'GET');

      if (url.endsWith('/pages/projects/demo-pages') && method === 'GET') {
        return new Response(JSON.stringify({ success: true, result: { name: 'demo-pages' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/pages/projects/demo-pages/upload-token') && method === 'GET') {
        return new Response(JSON.stringify({ success: true, result: { jwt: 'pages-upload-jwt' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/pages/assets/check-missing') && method === 'POST') {
        return new Response(JSON.stringify({ success: true, result: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/pages/assets/upsert-hashes') && method === 'POST') {
        expect(JSON.parse(String(init?.body ?? '{}'))).toEqual({ hashes: [indexHash] });
        return new Response(JSON.stringify({ success: true, result: null }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/pages/projects/demo-pages/deployments') && method === 'POST') {
        return new Response(JSON.stringify({
          success: true,
          result: { id: 'dep_conflict', url: 'https://d34527d9.demo-pages.pages.dev' },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://demo-pages.pages.dev' && method === 'HEAD') {
        return new Response('', { status: 200 });
      }
      if (url.endsWith('/zones/zone-1') && method === 'GET') {
        return new Response(JSON.stringify({
          success: true,
          result: { id: 'zone-1', name: 'example.com', status: 'active', type: 'full' },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/zones/zone-1/dns_records?') && method === 'GET') {
        return new Response(JSON.stringify({
          success: true,
          result: [{
            id: 'dns-existing',
            type: 'A',
            name: 'demo.example.com',
            content: '192.0.2.10',
          }],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    stubGlobalFetch(fetchMock);

    const result = await deployToCloudflarePages({
      config: {
        token: 'cloudflare-token-secret',
        accountId: 'account_123',
        projectName: 'demo-pages',
      },
      projectId: 'project-1',
      cloudflarePages: {
        zoneId: 'zone-1',
        zoneName: 'example.com',
        domainPrefix: 'demo',
      },
      files: [
        {
          file: 'index.html',
          data: Buffer.from('hello index'),
          contentType: 'text/html',
          sourcePath: 'index.html',
        },
      ],
    });

    expect(result).toMatchObject({
      providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
      url: 'https://demo-pages.pages.dev',
      status: 'ready',
      cloudflarePages: {
        pagesDev: {
          url: 'https://demo-pages.pages.dev',
          status: 'ready',
        },
        customDomain: {
          hostname: 'demo.example.com',
          status: 'conflict',
          errorCode: 'cloudflare_dns_record_conflict',
          dnsStatus: 'conflict',
          dnsRecordId: 'dns-existing',
          domainStatus: 'skipped',
        },
      },
    });
    expect(fetchMock.mock.calls.some(([input, init]) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      const method = init?.method || (input instanceof Request ? input.method : 'GET');
      return url.endsWith('/pages/projects/demo-pages/domains') && method === 'POST';
    })).toBe(false);
  });

  it('returns partial success with pages.dev when Pages custom-domain binding conflicts', async () => {
    const indexHash = cloudflarePagesAssetHash({
      file: 'index.html',
      data: Buffer.from('hello index'),
    });
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
      const method =
        init?.method || (input instanceof Request ? input.method : 'GET');

      if (url.endsWith('/pages/projects/demo-pages') && method === 'GET') {
        return new Response(JSON.stringify({ success: true, result: { name: 'demo-pages' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/pages/projects/demo-pages/upload-token') && method === 'GET') {
        return new Response(JSON.stringify({ success: true, result: { jwt: 'pages-upload-jwt' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/pages/assets/check-missing') && method === 'POST') {
        return new Response(JSON.stringify({ success: true, result: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/pages/assets/upsert-hashes') && method === 'POST') {
        expect(JSON.parse(String(init?.body ?? '{}'))).toEqual({ hashes: [indexHash] });
        return new Response(JSON.stringify({ success: true, result: null }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/pages/projects/demo-pages/deployments') && method === 'POST') {
        return new Response(JSON.stringify({
          success: true,
          result: { id: 'dep_domain_conflict', url: 'https://d34527d9.demo-pages.pages.dev' },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://demo-pages.pages.dev' && method === 'HEAD') {
        return new Response('', { status: 200 });
      }
      if (url.endsWith('/zones/zone-1') && method === 'GET') {
        return new Response(JSON.stringify({
          success: true,
          result: { id: 'zone-1', name: 'example.com', status: 'active', type: 'full' },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/zones/zone-1/dns_records?') && method === 'GET') {
        return new Response(JSON.stringify({ success: true, result: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/zones/zone-1/dns_records') && method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        return new Response(JSON.stringify({ success: true, result: { id: 'dns-1', ...body } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/pages/projects/demo-pages/domains/demo.example.com') && method === 'GET') {
        return new Response(JSON.stringify({
          success: false,
          errors: [{ message: 'Custom domain not found' }],
        }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/pages/projects/demo-pages/domains') && method === 'POST') {
        return new Response(JSON.stringify({
          success: false,
          errors: [{ message: 'Custom domain already exists' }],
        }), {
          status: 409,
          headers: { 'content-type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    stubGlobalFetch(fetchMock);

    const result = await deployToCloudflarePages({
      config: {
        token: 'cloudflare-token-secret',
        accountId: 'account_123',
        projectName: 'demo-pages',
      },
      projectId: 'project-1',
      cloudflarePages: {
        zoneId: 'zone-1',
        zoneName: 'example.com',
        domainPrefix: 'demo',
      },
      files: [
        {
          file: 'index.html',
          data: Buffer.from('hello index'),
          contentType: 'text/html',
          sourcePath: 'index.html',
        },
      ],
    });

    expect(result).toMatchObject({
      providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
      url: 'https://demo-pages.pages.dev',
      status: 'ready',
      cloudflarePages: {
        pagesDev: {
          url: 'https://demo-pages.pages.dev',
          status: 'ready',
        },
        customDomain: {
          hostname: 'demo.example.com',
          status: 'conflict',
          errorCode: 'cloudflare_domain_already_bound',
          dnsStatus: 'created',
          dnsRecordId: 'dns-1',
          domainStatus: 'conflict',
        },
      },
    });
  });

  // --- target / branch derivation tests (issue #4483) ---

  function makeMinimalCloudflareFetchMock(options: {
    previewDeployUrl?: string;
  } = {}) {
    const previewDeployUrl = options.previewDeployUrl ?? 'https://abc123.demo-pages.pages.dev';
    const capturedFormData: { branch: string | undefined } = { branch: undefined };
    const indexHash = cloudflarePagesAssetHash({
      file: 'index.html',
      data: Buffer.from('hello'),
    });
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
      const method =
        init?.method || (input instanceof Request ? input.method : 'GET');

      if (url.endsWith('/pages/projects/demo-pages') && method === 'GET') {
        return new Response(JSON.stringify({ success: true, result: { name: 'demo-pages' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/pages/projects/demo-pages/upload-token') && method === 'GET') {
        return new Response(JSON.stringify({ success: true, result: { jwt: 'pages-upload-jwt' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/pages/assets/check-missing') && method === 'POST') {
        return new Response(JSON.stringify({ success: true, result: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/pages/assets/upsert-hashes') && method === 'POST') {
        return new Response(JSON.stringify({ success: true, result: null }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/pages/projects/demo-pages/deployments') && method === 'POST') {
        const form = init?.body as FormData;
        capturedFormData.branch = form?.get('branch') as string | undefined ?? undefined;
        return new Response(JSON.stringify({
          success: true,
          result: { id: 'dep_preview_1', url: previewDeployUrl },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      // HEAD check — respond 200 for any URL so waitForReachableDeploymentUrl resolves
      if (method === 'HEAD') {
        return new Response('', { status: 200 });
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    return { fetchMock, capturedFormData, indexHash };
  }

  const minimalFiles = [
    {
      file: 'index.html',
      data: Buffer.from('hello'),
      contentType: 'text/html',
      sourcePath: 'index.html',
    },
  ] as const;

  const baseConfig = {
    token: 'cloudflare-token-secret',
    accountId: 'account_123',
    projectName: 'demo-pages',
  } as const;

  it('sends branch=preview to Cloudflare when target is preview', async () => {
    const { fetchMock, capturedFormData } = makeMinimalCloudflareFetchMock({
      previewDeployUrl: 'https://abc123.demo-pages.pages.dev',
    });
    vi.stubGlobal('fetch', fetchMock);

    await deployToCloudflarePages({
      config: { ...baseConfig },
      files: [...minimalFiles],
      target: 'preview',
    } as Parameters<typeof deployToCloudflarePages>[0]);

    // The deployment POST must carry branch='preview', not 'main'
    expect(capturedFormData.branch).toBe('preview');
  });

  it('sends branch=main to Cloudflare when target is production', async () => {
    const { fetchMock, capturedFormData } = makeMinimalCloudflareFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    await deployToCloudflarePages({
      config: { ...baseConfig },
      files: [...minimalFiles],
      target: 'production',
    } as Parameters<typeof deployToCloudflarePages>[0]);

    expect(capturedFormData.branch).toBe('main');
  });

  it('defaults to branch=main (production) when target is omitted', async () => {
    const { fetchMock, capturedFormData } = makeMinimalCloudflareFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    await deployToCloudflarePages({
      config: { ...baseConfig },
      files: [...minimalFiles],
    });

    expect(capturedFormData.branch).toBe('main');
  });

  it('returns the per-deploy preview URL (not the production root) for a preview deploy', async () => {
    const distinctPreviewUrl = 'https://abc123.demo-pages.pages.dev';
    const { fetchMock } = makeMinimalCloudflareFetchMock({ previewDeployUrl: distinctPreviewUrl });
    vi.stubGlobal('fetch', fetchMock);

    const result = await deployToCloudflarePages({
      config: { ...baseConfig },
      files: [...minimalFiles],
      target: 'preview',
    } as Parameters<typeof deployToCloudflarePages>[0]);

    // For a preview deploy the returned URL must be the per-deploy alias,
    // not the production root https://demo-pages.pages.dev
    expect(result.url).toBe(distinctPreviewUrl);
    expect(result.url).not.toBe('https://demo-pages.pages.dev');
  });

  it('still returns the production root URL for a production deploy', async () => {
    const { fetchMock } = makeMinimalCloudflareFetchMock({
      previewDeployUrl: 'https://abc123.demo-pages.pages.dev',
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await deployToCloudflarePages({
      config: { ...baseConfig },
      files: [...minimalFiles],
      target: 'production',
    } as Parameters<typeof deployToCloudflarePages>[0]);

    expect(result.url).toBe('https://demo-pages.pages.dev');
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

  it('uses provider-specific copy for missing public URLs', async () => {
    const result = await waitForReachableDeploymentUrl([], {
      providerLabel: 'Cloudflare Pages',
    });

    expect(result).toMatchObject({
      status: 'link-delayed',
      statusMessage: 'Cloudflare Pages did not return a public deployment URL.',
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
    expect(isVercelProtectedResponse(new Response(null, { headers }), 'Authentication Required')).toBe(true);
  });

  describe('checkNetlifyDeploymentLinks', () => {
    it('returns ready and checks URL reachability when netlify deploy state is ready', async () => {
      const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : String(input);
        if (url.includes('/deploys/dep-1')) {
          return new Response(JSON.stringify({
            state: 'ready',
            ssl_url: 'https://example.netlify.app',
          }), { status: 200 });
        }
        if (url === 'https://example.netlify.app') {
          return new Response('', { status: 200 });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      });
      stubGlobalFetch(fetchMock);

      const result = await checkNetlifyDeploymentLinks({
        deploymentId: 'dep-1',
        providerMetadata: { siteId: 'site-1', serviceUrl: 'https://example.netlify.app' },
      });
      expect(result).toEqual({
        status: 'ready',
        statusMessage: 'Public link is ready.',
      });
    });

    it('returns failed when netlify deploy state is error or rejected', async () => {
      const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : String(input);
        if (url.includes('/deploys/dep-1')) {
          return new Response(JSON.stringify({
            state: 'error',
            error_message: 'Build failed due to syntax error',
          }), { status: 200 });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      });
      stubGlobalFetch(fetchMock);

      const result = await checkNetlifyDeploymentLinks({
        deploymentId: 'dep-1',
        providerMetadata: { siteId: 'site-1', serviceUrl: 'https://example.netlify.app' },
      });
      expect(result).toEqual({
        status: 'failed',
        statusMessage: 'Build failed due to syntax error',
      });
    });

    it('returns link-delayed when netlify deploy is building or uploading', async () => {
      const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : String(input);
        if (url.includes('/deploys/dep-1')) {
          return new Response(JSON.stringify({
            state: 'building',
          }), { status: 200 });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      });
      stubGlobalFetch(fetchMock);

      const result = await checkNetlifyDeploymentLinks({
        deploymentId: 'dep-1',
        providerMetadata: { siteId: 'site-1', serviceUrl: 'https://example.netlify.app' },
      });
      expect(result).toEqual({
        status: 'link-delayed',
        statusMessage: 'Netlify deployment is currently: building.',
      });
    });
  });

  describe('checkRenderDeploymentLinks', () => {
    it('returns ready and checks URL reachability when render deploy status is live', async () => {
      const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : String(input);
        if (url.includes('/services/service-1/deploys/dep-1')) {
          return new Response(JSON.stringify({
            status: 'live',
          }), { status: 200 });
        }
        if (url === 'https://example.onrender.com') {
          return new Response('', { status: 200 });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      });
      stubGlobalFetch(fetchMock);

      const result = await checkRenderDeploymentLinks({
        deploymentId: 'service-1',
        providerMetadata: { serviceId: 'service-1', deployId: 'dep-1', serviceUrl: 'https://example.onrender.com' },
      });
      expect(result).toEqual({
        status: 'ready',
        statusMessage: 'Public link is ready.',
      });
    });

    it('returns failed when render deploy status is build_failed or canceled', async () => {
      const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : String(input);
        if (url.includes('/services/service-1/deploys/dep-1')) {
          return new Response(JSON.stringify({
            status: 'build_failed',
          }), { status: 200 });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      });
      stubGlobalFetch(fetchMock);

      const result = await checkRenderDeploymentLinks({
        deploymentId: 'service-1',
        providerMetadata: { serviceId: 'service-1', deployId: 'dep-1', serviceUrl: 'https://example.onrender.com' },
      });
      expect(result).toEqual({
        status: 'failed',
        statusMessage: 'Render deployment failed with status: build_failed.',
      });
    });

    it('returns link-delayed when render deploy is pre_build or building', async () => {
      const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : String(input);
        if (url.includes('/services/service-1/deploys/dep-1')) {
          return new Response(JSON.stringify({
            status: 'building',
          }), { status: 200 });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      });
      stubGlobalFetch(fetchMock);

      const result = await checkRenderDeploymentLinks({
        deploymentId: 'service-1',
        providerMetadata: { serviceId: 'service-1', deployId: 'dep-1', serviceUrl: 'https://example.onrender.com' },
      });
      expect(result).toEqual({
        status: 'link-delayed',
        statusMessage: 'Render deployment is currently: building.',
      });
    });
  });
});
