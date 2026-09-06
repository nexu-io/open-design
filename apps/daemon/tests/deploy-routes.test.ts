import http from 'node:http';
import express from 'express';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  CLOUDFLARE_PAGES_PROVIDER_ID,
  cloudflarePagesProjectNameForProject,
  DeployError,
  deployConfigPath,
  DISPLAYDEV_PROVIDER_ID,
  VERCEL_PROVIDER_ID,
  SAVED_CLOUDFLARE_TOKEN_MASK,
  SAVED_DISPLAYDEV_TOKEN_MASK,
} from '../src/deploy.js';
import {
  publicDeployment,
  publicDeployments,
} from '../src/deploy/deployment-response.js';
import { openDatabase, upsertDeployment } from '../src/db.js';
import { ensureProject } from '../src/projects.js';
import { registerDeployRoutes } from '../src/routes/deploy.js';
import { startServer } from '../src/server.js';

describe('deploy provider routes', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  });

  const runtimeDisplayDevConfigPath = () => {
    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
    return deployConfigPath(DISPLAYDEV_PROVIDER_ID, dataDir);
  };

  beforeEach(async () => {
    await rm(runtimeDisplayDevConfigPath(), { force: true });
  });

  afterAll(async () => {
    await rm(runtimeDisplayDevConfigPath(), { force: true });
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function createDisplayDevPublishFixture() {
    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
    const projectId = `displaydev-draft-${Date.now()}`;
    const dir = await ensureProject(path.join(dataDir, 'projects'), projectId);
    await writeFile(path.join(dir, 'quarterly.html'), '<!doctype html><h1>Quarterly report</h1>');
    const projectResponse = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: projectId, name: 'Draft settings', skillId: null, designSystemId: null }),
    });
    expect(projectResponse.status).toBe(200);
    const configResponse = await fetch(`${baseUrl}/api/deploy/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providerId: DISPLAYDEV_PROVIDER_ID,
        token: 'sk_live_saved',
        displayDev: { defaultArtifactName: 'Q3 Report' },
      }),
    });
    expect(configResponse.status).toBe(200);
    return {
      savedConfig: await readFile(runtimeDisplayDevConfigPath(), 'utf8'),
      publish: (displayDev: Record<string, unknown>) => fetch(
        `${baseUrl}/api/projects/${projectId}/deploy`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: 'quarterly.html', providerId: DISPLAYDEV_PROVIDER_ID, displayDev }),
        },
      ),
    };
  }

  function mockDisplayDevDraftPublish(upstreamStatus = 201) {
    const publishes: Array<{
      url: string;
      method: string;
      authorization: string | null;
      name: unknown;
      savedConfig: string;
    }> = [];
    const realFetch = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
      if (url.startsWith(baseUrl)) return realFetch(input, init);
      if (
        (url === 'https://api.display.dev/v1/artifacts' && method === 'POST') ||
        (url === 'https://api.display.dev/v1/public/artifacts' && method === 'POST') ||
        (url === 'https://api.display.dev/v1/artifacts/draft1234' && method === 'PUT')
      ) {
        if (!(init?.body instanceof FormData)) throw new Error('Expected FormData body');
        const authorization = new Headers(init.headers).get('Authorization');
        publishes.push({
          url,
          method,
          authorization,
          name: init.body.get('name'),
          savedConfig: await readFile(runtimeDisplayDevConfigPath(), 'utf8'),
        });
        if (upstreamStatus >= 400) {
          return new Response(JSON.stringify({ error: 'display.dev is unavailable' }), { status: upstreamStatus });
        }
        return new Response(JSON.stringify({
          shortId: 'draft1234',
          ...(authorization
            ? { name: 'Current artifact', url: 'https://public.dsp.so/draft1234', version: publishes.length }
            : {
                previewUrl: 'https://public.dsp.so/draft1234',
                claimUrl: 'https://app.display.dev/claim?code=draft1234',
                expiresAt: '2026-09-25T00:00:00.000Z',
              }),
        }), { status: upstreamStatus });
      }
      if (url === 'https://api.display.dev/v1/artifacts/draft1234' && method === 'GET') {
        return new Response(JSON.stringify({
          shortId: 'draft1234',
          currentVersion: publishes.length,
          visibility: 'company',
          sharedWith: [],
        }), { status: 200 });
      }
      throw new Error(`Unexpected provider request: ${method} ${url}`);
    }));
    return publishes;
  }

  it.each([
    { mode: 'api-key', upstreamStatus: 201 },
    { mode: 'api-key', upstreamStatus: 503 },
    { mode: 'anonymous', upstreamStatus: 201 },
    { mode: 'anonymous', upstreamStatus: 503 },
  ])(
    'preserves seeded display.dev settings for a request-scoped $mode publish returning $upstreamStatus',
    async ({ mode, upstreamStatus }) => {
      const fixture = await createDisplayDevPublishFixture();
      const publishes = mockDisplayDevDraftPublish(upstreamStatus);
      try {
        const response = await fixture.publish({
          authentication: mode === 'api-key'
            ? { mode, apiKey: 'sk_live_invocation' }
            : { mode },
        });
        const text = await response.text();
        expect(response.status, text).toBe(upstreamStatus === 201 ? 200 : 503);
        expect(publishes).toEqual([{
          url: `https://api.display.dev/v1/${mode === 'anonymous' ? 'public/' : ''}artifacts`,
          method: 'POST',
          authorization: mode === 'api-key' ? 'Bearer sk_live_invocation' : null,
          name: 'Q3 Report',
          savedConfig: fixture.savedConfig,
        }]);
        expect(JSON.parse(text)).not.toHaveProperty('savedDisplayDevConfig');
        expect(await readFile(runtimeDisplayDevConfigPath(), 'utf8')).toBe(fixture.savedConfig);
      } finally {
        vi.unstubAllGlobals();
      }
    },
  );

  it.each([
    { mode: 'anonymous', upstreamStatus: 201 },
    { mode: 'anonymous', upstreamStatus: 503 },
    { mode: 'authenticated', upstreamStatus: 201 },
    { mode: 'authenticated', upstreamStatus: 503 },
  ])(
    'uses the cleared draft name for a $mode create returning $upstreamStatus and saves only after success',
    async ({ mode, upstreamStatus }) => {
      const fixture = await createDisplayDevPublishFixture();
      const publishes = mockDisplayDevDraftPublish(upstreamStatus);
      try {
        const response = await fixture.publish({
          saveDefaults: true,
          authentication: mode === 'anonymous'
            ? { mode: 'anonymous', save: true }
            : { mode: 'saved-key' },
        });
        const text = await response.text();
        expect(response.status, text).toBe(upstreamStatus === 201 ? 200 : 503);
        expect(publishes).toEqual([{
          url: `https://api.display.dev/v1/${mode === 'anonymous' ? 'public/' : ''}artifacts`,
          method: 'POST',
          authorization: mode === 'authenticated' ? 'Bearer sk_live_saved' : null,
          name: mode === 'authenticated' ? 'quarterly' : null,
          savedConfig: fixture.savedConfig,
        }]);
        const savedConfig = await readFile(runtimeDisplayDevConfigPath(), 'utf8');
        if (upstreamStatus === 201) {
          const saved = JSON.parse(savedConfig);
          expect(saved.token).toBe(mode === 'authenticated' ? 'sk_live_saved' : '');
          expect(saved.displayDev?.defaultArtifactName).toBeUndefined();
          expect(JSON.parse(text)).toMatchObject({
            savedDisplayDevConfig: { configured: mode === 'authenticated' },
          });
        } else {
          expect(savedConfig).toBe(fixture.savedConfig);
          expect(JSON.parse(text)).not.toHaveProperty('savedDisplayDevConfig');
        }
      } finally {
        vi.unstubAllGlobals();
      }
    },
  );

  const displayDevNameDraftCases: Array<{
    label: string;
    selection: Record<string, unknown>;
    expectedName: string;
    expectedDefault: string;
  }> = [
    { label: 'omitted defaults', selection: {}, expectedName: 'Q3 Report', expectedDefault: 'Q3 Report' },
    { label: 'unchanged default', selection: { name: 'Q3 Report', saveDefaults: true }, expectedName: 'Q3 Report', expectedDefault: 'Q3 Report' },
    { label: 'nonempty override', selection: { name: 'Q4 Report', saveDefaults: true }, expectedName: 'Q4 Report', expectedDefault: 'Q4 Report' },
    { label: 'one-off override', selection: { name: 'One-off report' }, expectedName: 'One-off report', expectedDefault: 'Q3 Report' },
    { label: 'disabled default save', selection: { saveDefaults: false }, expectedName: 'Q3 Report', expectedDefault: 'Q3 Report' },
    { label: 'explicit blank name', selection: { name: '  ', saveDefaults: true }, expectedName: 'quarterly', expectedDefault: '' },
    { label: 'cleared name without authentication override', selection: { saveDefaults: true }, expectedName: 'quarterly', expectedDefault: '' },
    { label: 'cleared name with request API key', selection: { saveDefaults: true, authentication: { mode: 'api-key', apiKey: 'sk_live_invocation' } }, expectedName: 'quarterly', expectedDefault: '' },
  ];

  it.each(displayDevNameDraftCases)(
    'preserves display.dev create-name semantics for $label',
    async ({ selection, expectedName, expectedDefault }) => {
      const fixture = await createDisplayDevPublishFixture();
      const publishes = mockDisplayDevDraftPublish();
      try {
        const response = await fixture.publish(selection);
        const text = await response.text();
        expect(response.status, text).toBe(200);
        expect(publishes).toHaveLength(1);
        expect(publishes[0]).toMatchObject({
          method: 'POST', name: expectedName, savedConfig: fixture.savedConfig,
        });
        const savedConfig = await readFile(runtimeDisplayDevConfigPath(), 'utf8');
        const saved = JSON.parse(savedConfig);
        expect(saved.token).toBe('sk_live_saved');
        expect(saved.displayDev?.defaultArtifactName ?? '').toBe(expectedDefault);
        if (selection.saveDefaults !== true) expect(savedConfig).toBe(fixture.savedConfig);
      } finally {
        vi.unstubAllGlobals();
      }
    },
  );

  it('keeps the current owned display.dev name when an update clears its saved name default', async () => {
    const fixture = await createDisplayDevPublishFixture();
    const publishes = mockDisplayDevDraftPublish();
    try {
      const created = await fixture.publish({ name: 'Current artifact' });
      expect(created.status, await created.text()).toBe(200);
      const updated = await fixture.publish({ saveDefaults: true });
      expect(updated.status, await updated.text()).toBe(200);
      expect(publishes).toHaveLength(2);
      expect(publishes[1]).toMatchObject({
        method: 'PUT', name: null, savedConfig: fixture.savedConfig,
      });
      const saved = JSON.parse(await readFile(runtimeDisplayDevConfigPath(), 'utf8'));
      expect(saved.token).toBe('sk_live_saved');
      expect(saved.displayDev?.defaultArtifactName).toBeUndefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects a saved-key publish when another client has cleared the key', async () => {
    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
    const projectId = `displaydev-cleared-key-${Date.now()}`;
    const dir = await ensureProject(path.join(dataDir, 'projects'), projectId);
    await writeFile(path.join(dir, 'index.html'), '<!doctype html><h1>Private draft</h1>');
    const projectResponse = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: projectId, name: 'Saved key race', skillId: null, designSystemId: null }),
    });
    expect(projectResponse.status).toBe(200);
    const saveConfig = (input: Record<string, unknown>) => fetch(`${baseUrl}/api/deploy/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId: DISPLAYDEV_PROVIDER_ID, ...input }),
    });
    const savedResponse = await saveConfig({ token: 'sk_liveLocalSecret' });
    expect(savedResponse.status).toBe(200);
    await expect(savedResponse.json()).resolves.toMatchObject({ configured: true, tokenMask: SAVED_DISPLAYDEV_TOKEN_MASK });
    expect((await saveConfig({ clearToken: true })).status).toBe(200);
    const beforeStaleSave = await readFile(runtimeDisplayDevConfigPath(), 'utf8');
    const staleSave = await saveConfig({
      token: SAVED_DISPLAYDEV_TOKEN_MASK,
      displayDev: { defaultArtifactName: 'Must not save' },
    });
    expect(staleSave.status).toBe(409);
    await expect(staleSave.json()).resolves.toMatchObject({ error: { code: 'CONFLICT' } });
    expect(await readFile(runtimeDisplayDevConfigPath(), 'utf8')).toBe(beforeStaleSave);

    const realFetch = globalThis.fetch;
    const providerFetch = vi.fn();
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.startsWith(baseUrl)) return realFetch(input, init);
      providerFetch(input, init);
      throw new Error(`Unexpected provider request: ${url}`);
    }));
    try {
      const response = await fetch(`${baseUrl}/api/projects/${projectId}/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: 'index.html',
          providerId: DISPLAYDEV_PROVIDER_ID,
          displayDev: { authentication: { mode: 'saved-key' } },
        }),
      });
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({ error: { code: 'CONFLICT' } });
      expect(providerFetch).not.toHaveBeenCalled();
      for (const apiKey of ['Bearer ', 'Bearer\t', '  Bearer  ']) {
        const invalidKeyResponse = await fetch(`${baseUrl}/api/projects/${projectId}/deploy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: 'index.html', providerId: DISPLAYDEV_PROVIDER_ID,
            displayDev: { authentication: { mode: 'api-key', apiKey } },
          }),
        });
        expect(invalidKeyResponse.status).toBe(400);
        await expect(invalidKeyResponse.json()).resolves.toMatchObject({ error: { code: 'BAD_REQUEST' } });
      }
      expect(providerFetch).not.toHaveBeenCalled();
      const history = await fetch(`${baseUrl}/api/projects/${projectId}/deployments`);
      await expect(history.json()).resolves.toEqual({ deployments: [] });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('dispatches deploy config reads and writes by providerId', async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'od-deploy-route-config-'));
    const priorStateRoot = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = stateRoot;
    try {
      const saveResp = await fetch(`${baseUrl}/api/deploy/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
          token: 'cloudflare-token-secret',
          accountId: 'account_123',
        }),
      });
      expect(saveResp.status).toBe(200);
      expect(await saveResp.json()).toMatchObject({
        providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
        configured: true,
        tokenMask: SAVED_CLOUDFLARE_TOKEN_MASK,
        accountId: 'account_123',
        projectName: '',
      });

      const getResp = await fetch(
        `${baseUrl}/api/deploy/config?providerId=${CLOUDFLARE_PAGES_PROVIDER_ID}`,
      );
      expect(getResp.status).toBe(200);
      expect(await getResp.json()).toMatchObject({
        providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
        configured: true,
        tokenMask: SAVED_CLOUDFLARE_TOKEN_MASK,
        accountId: 'account_123',
        projectName: '',
      });
      expect(JSON.parse(await readFile(deployConfigPath(CLOUDFLARE_PAGES_PROVIDER_ID), 'utf8'))).toEqual({
        token: 'cloudflare-token-secret',
        accountId: 'account_123',
        projectName: '',
      });

      const maskedResp = await fetch(`${baseUrl}/api/deploy/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
          token: SAVED_CLOUDFLARE_TOKEN_MASK,
          accountId: 'account_456',
        }),
      });
      expect(maskedResp.status).toBe(200);
      expect(await maskedResp.json()).toMatchObject({
        providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
        configured: true,
        tokenMask: SAVED_CLOUDFLARE_TOKEN_MASK,
        accountId: 'account_456',
        projectName: '',
      });
      expect(JSON.parse(await readFile(deployConfigPath(CLOUDFLARE_PAGES_PROVIDER_ID), 'utf8'))).toEqual({
        token: 'cloudflare-token-secret',
        accountId: 'account_456',
        projectName: '',
      });

      const emptyDisplayResp = await fetch(
        `${baseUrl}/api/deploy/config?providerId=${DISPLAYDEV_PROVIDER_ID}`,
      );
      expect(emptyDisplayResp.status).toBe(200);
      expect(await emptyDisplayResp.json()).toMatchObject({
        providerId: DISPLAYDEV_PROVIDER_ID,
        configured: false,
        tokenMask: '',
      });

      const displayResp = await fetch(`${baseUrl}/api/deploy/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: DISPLAYDEV_PROVIDER_ID,
          token: 'Bearer dsp_live_secret',
          displayDev: {
            defaultArtifactName: 'Demo',
          },
        }),
      });
      expect(displayResp.status).toBe(200);
      expect(await displayResp.json()).toMatchObject({
        providerId: DISPLAYDEV_PROVIDER_ID,
        configured: true,
        tokenMask: SAVED_DISPLAYDEV_TOKEN_MASK,
        displayDev: {
          defaultArtifactName: 'Demo',
        },
      });

      const ignoredApiUrlResp = await fetch(`${baseUrl}/api/deploy/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: DISPLAYDEV_PROVIDER_ID,
          apiUrl: 'https://attacker.example.test',
        }),
      });
      expect(ignoredApiUrlResp.status).toBe(200);
      expect(await ignoredApiUrlResp.json()).not.toHaveProperty('apiUrl');

      const invalidDisplayDefaultCases: Array<[unknown, string]> = [
        [
          'bad',
          'display.dev settings must be an object.',
        ],
        [[] as unknown, 'display.dev settings must be an object.'],
        [
          { defaultArtifactName: 123 },
          'display.dev defaultArtifactName must be a string.',
        ],
      ];
      for (const [displayDev, message] of invalidDisplayDefaultCases) {
        const invalidDefaultResp = await fetch(`${baseUrl}/api/deploy/config`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            providerId: DISPLAYDEV_PROVIDER_ID,
            displayDev,
          }),
        });
        expect(invalidDefaultResp.status).toBe(400);
        expect(await invalidDefaultResp.json()).toMatchObject({
          error: {
            code: 'BAD_REQUEST',
            message,
          },
        });
      }

      await writeFile(
        runtimeDisplayDevConfigPath(),
        JSON.stringify({
        token: 'dsp_live_secret',
        apiUrl: 'api.display.test:3331',
      }),
      );
      const invalidSavedDisplayResp = await fetch(
        `${baseUrl}/api/deploy/config?providerId=${DISPLAYDEV_PROVIDER_ID}`,
      );
      expect(invalidSavedDisplayResp.status).toBe(400);
      expect(await invalidSavedDisplayResp.json()).toMatchObject({
        error: {
          code: 'BAD_REQUEST',
          message: 'display.dev API URL must be a valid HTTP or HTTPS URL.',
        },
      });
    } finally {
      if (priorStateRoot === undefined) delete process.env.OD_USER_STATE_DIR;
      else process.env.OD_USER_STATE_DIR = priorStateRoot;
      await rm(stateRoot, { recursive: true, force: true });
    }
  });

  it('rejects display.dev deploys when the saved API URL is malformed', async () => {
    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'od-displaydev-invalid-config-route-'));
    const priorStateRoot = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = stateRoot;
    try {
      const projectId = `displaydev-invalid-config-${Date.now()}`;
      const dir = await ensureProject(path.join(dataDir, 'projects'), projectId);
      await writeFile(path.join(dir, 'index.html'), '<!doctype html><h1>Hello</h1>');
      const createProjectResp = await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: projectId,
          name: 'display.dev invalid config route test',
          skillId: null,
          designSystemId: null,
        }),
      });
      expect(createProjectResp.status).toBe(200);
      await writeFile(
        runtimeDisplayDevConfigPath(),
        JSON.stringify({
        token: 'dsp_live_secret',
        apiUrl: 'api.display.test:3331',
      }),
      );

      const realFetch = globalThis.fetch;
      const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof Request
              ? input.url
              : String(input);
        if (url.startsWith(baseUrl)) return realFetch(input, init);
        throw new Error(`unexpected external fetch: ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);
      const resp = await fetch(`${baseUrl}/api/projects/${projectId}/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: 'index.html',
          providerId: DISPLAYDEV_PROVIDER_ID,
        }),
      });

      expect(resp.status).toBe(400);
      expect(await resp.json()).toMatchObject({
        error: {
          code: 'BAD_REQUEST',
          message: 'display.dev API URL must be a valid HTTP or HTTPS URL.',
        },
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
      if (priorStateRoot === undefined) delete process.env.OD_USER_STATE_DIR;
      else process.env.OD_USER_STATE_DIR = priorStateRoot;
      await rm(stateRoot, { recursive: true, force: true });
    }
  });

  it('maps display.dev publish network failures to upstream unavailable', async () => {
    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'od-displaydev-network-route-'));
    const priorStateRoot = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = stateRoot;
    try {
      const projectId = `displaydev-network-${Date.now()}`;
      const dir = await ensureProject(path.join(dataDir, 'projects'), projectId);
      await writeFile(path.join(dir, 'index.html'), '<!doctype html><h1>Hello</h1>');

      const createProjectResp = await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: projectId,
          name: 'display.dev network route test',
          skillId: null,
          designSystemId: null,
        }),
      });
      expect(createProjectResp.status).toBe(200);

      const realFetch = globalThis.fetch;
      const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof Request
              ? input.url
              : String(input);
        if (url.startsWith(baseUrl)) return realFetch(input, init);
        throw new TypeError('fetch failed');
      });
      vi.stubGlobal('fetch', fetchMock);
      try {
        const deployResp = await fetch(`${baseUrl}/api/projects/${projectId}/deploy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: 'index.html',
            providerId: DISPLAYDEV_PROVIDER_ID,
          }),
        });
        const deployText = await deployResp.text();
        expect(deployResp.status, deployText).toBe(502);
        expect(JSON.parse(deployText)).toMatchObject({
          error: {
            code: 'UPSTREAM_UNAVAILABLE',
            message: 'display.dev is unreachable.',
          },
        });
      } finally {
        vi.unstubAllGlobals();
      }
    } finally {
      if (priorStateRoot === undefined) delete process.env.OD_USER_STATE_DIR;
      else process.env.OD_USER_STATE_DIR = priorStateRoot;
      await rm(stateRoot, { recursive: true, force: true });
    }
  });

  it('rejects malformed anonymous display.dev 2xx responses before persistence', async () => {
    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
    const projectId = `displaydev-malformed-success-${Date.now()}`;
      const dir = await ensureProject(path.join(dataDir, 'projects'), projectId);
      await writeFile(path.join(dir, 'index.html'), '<!doctype html><h1>Hello</h1>');

    const createProjectResp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'display.dev malformed success route test',
        skillId: null,
        designSystemId: null,
      }),
    });
      expect(createProjectResp.status).toBe(200);

      const realFetch = globalThis.fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof Request
              ? input.url
              : String(input);
        if (url.startsWith(baseUrl)) return realFetch(input, init);
        return new Response(
          JSON.stringify({
            shortId: 'anon1234',
            previewUrl: 'https://display.dsp.so/anon1234-demo',
          }),
          {
            status: 201,
            headers: { 'content-type': 'application/json' },
          },
        );
      }),
    );
    try {
        const deployResp = await fetch(`${baseUrl}/api/projects/${projectId}/deploy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: 'index.html',
            providerId: DISPLAYDEV_PROVIDER_ID,
          }),
        });
      expect(deployResp.status).toBe(502);
      await expect(deployResp.json()).resolves.toMatchObject({
        error: {
          code: 'UPSTREAM_UNAVAILABLE',
          message: 'display.dev returned an invalid claim URL.',
        },
      });

        const deploymentsResp = await fetch(`${baseUrl}/api/projects/${projectId}/deployments`);
        expect(deploymentsResp.status).toBe(200);
      await expect(deploymentsResp.json()).resolves.toEqual({
        deployments: [],
      });
    } finally {
        vi.unstubAllGlobals();
      }
  });

  it('rejects an off-provider display.dev preview URL without probing it', async () => {
    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
    const projectId = `displaydev-preview-origin-${Date.now()}`;
      const dir = await ensureProject(path.join(dataDir, 'projects'), projectId);
      await writeFile(path.join(dir, 'index.html'), '<!doctype html><h1>Hello</h1>');
    expect(
      (
        await fetch(`${baseUrl}/api/projects`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: projectId,
            name: 'display.dev preview origin route test',
            skillId: null,
            designSystemId: null,
          }),
        })
      ).status,
    ).toBe(200);

    let offProviderRequests = 0;

      const realFetch = globalThis.fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof Request
              ? input.url
              : String(input);
        if (url.startsWith(baseUrl)) return realFetch(input, init);
        if (url === 'http://127.0.0.1:4311/private') {
          offProviderRequests += 1;
          return new Response('', { status: 200 });
        }
        return new Response(
          JSON.stringify({
            shortId: 'anon-origin',
            previewUrl: 'http://127.0.0.1:4311/private',
            claimUrl: 'https://app.display.dev/claim?code=origin',
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          }),
          {
            status: 201,
            headers: { 'content-type': 'application/json' },
          },
        );
      }),
    );
    try {
      const response = await fetch(`${baseUrl}/api/projects/${projectId}/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: 'index.html',
          providerId: DISPLAYDEV_PROVIDER_ID,
        }),
      });
      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toMatchObject({
        error: {
          code: 'UPSTREAM_UNAVAILABLE',
          message:
            'display.dev returned a deployment URL outside the configured provider origin.',
        },
      });
      expect(offProviderRequests).toBe(0);
      const deployments = await fetch(`${baseUrl}/api/projects/${projectId}/deployments`);
      await expect(deployments.json()).resolves.toEqual({ deployments: [] });
    } finally {
        vi.unstubAllGlobals();
      }
  });

  it('lists Cloudflare Pages zones for saved account credentials', async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'od-deploy-route-zones-'));
    const priorStateRoot = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = stateRoot;
    try {
      const saveResp = await fetch(`${baseUrl}/api/deploy/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
          token: 'cloudflare-token-secret',
          accountId: 'account_123',
          cloudflarePages: {
            lastZoneId: 'zone-1',
            lastZoneName: 'example.com',
            lastDomainPrefix: 'demo',
          },
        }),
      });
      expect(saveResp.status).toBe(200);

      const realFetch = globalThis.fetch;
      const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof Request
              ? input.url
              : String(input);
        if (url.startsWith(baseUrl)) return realFetch(input, init);
        expect(url).toContain('/zones?');
        expect(url).toContain('account.id=account_123');
        return new Response(JSON.stringify({
          success: true,
          result: [{ id: 'zone-1', name: 'example.com', status: 'active', type: 'full' }],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      });
      vi.stubGlobal('fetch', fetchMock);
      try {
        const zonesResp = await fetch(`${baseUrl}/api/deploy/cloudflare-pages/zones`);
        expect(zonesResp.status).toBe(200);
        expect(await zonesResp.json()).toEqual({
          zones: [{ id: 'zone-1', name: 'example.com', status: 'active', type: 'full' }],
          cloudflarePages: {
            lastZoneId: 'zone-1',
            lastZoneName: 'example.com',
            lastDomainPrefix: 'demo',
          },
        });
      } finally {
        vi.unstubAllGlobals();
      }
    } finally {
      if (priorStateRoot === undefined) delete process.env.OD_USER_STATE_DIR;
      else process.env.OD_USER_STATE_DIR = priorStateRoot;
      await rm(stateRoot, { recursive: true, force: true });
    }
  });

  it('dispatches deploy preflight by providerId', async () => {
    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
    const projectId = `deploy-route-${Date.now()}`;
    const dir = await ensureProject(path.join(dataDir, 'projects'), projectId);
    await writeFile(
      path.join(dir, 'index.html'),
      '<!doctype html><meta name="viewport" content="width=device-width"><h1>Hello</h1>',
    );

    const resp = await fetch(`${baseUrl}/api/projects/${projectId}/deploy/preflight`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: 'index.html',
        providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
      }),
    });

    expect(resp.status).toBe(200);
    expect(await resp.json()).toMatchObject({
      providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
      entry: 'index.html',
      totalFiles: 1,
    });
  });

  it('keeps display.dev preflight aligned with the single-file publish set', async () => {
    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
    const projectId = `displaydev-preflight-${Date.now()}`;
      const dir = await ensureProject(path.join(dataDir, 'projects'), projectId);
    await writeFile(
      path.join(dir, 'index.html'),
      '<!doctype html><meta name="viewport" content="width=device-width"><h1>Hello</h1>',
    );
    await writeFile(
      path.join(dir, 'unused.html'),
      '<!doctype html><meta name="viewport" content="width=device-width"><h1>Unused</h1>',
    );

    const resp = await fetch(`${baseUrl}/api/projects/${projectId}/deploy/preflight`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: 'index.html',
        providerId: DISPLAYDEV_PROVIDER_ID,
      }),
    });

    expect(resp.status).toBe(200);
    const body = (await resp.json()) as {
      files: Array<{ path: string }>;
      [key: string]: unknown;
    };
    expect(body).toMatchObject({
      providerId: DISPLAYDEV_PROVIDER_ID,
      entry: 'index.html',
      totalFiles: 1,
    });
    expect(body.files.map((file) => file.path).sort()).toEqual(['index.html']);
  });

  it('serializes concurrent authenticated display.dev deploys for the same file', async () => {
    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
    const stateRoot = await mkdtemp(
      path.join(os.tmpdir(), 'od-displaydev-concurrent-route-'),
    );
    const priorStateRoot = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = stateRoot;
    const projectId = `displaydev-concurrent-${Date.now()}`;
      const dir = await ensureProject(path.join(dataDir, 'projects'), projectId);
    await mkdir(path.join(dir, 'sandbox'), { recursive: true });
    await writeFile(
      path.join(dir, 'sandbox', 'index.html'),
      '<!doctype html><h1>Hello</h1>',
    );
    try {
      expect(
        (
          await fetch(`${baseUrl}/api/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: projectId,
              name: 'Concurrent display.dev route test',
              skillId: null,
              designSystemId: null,
            }),
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await fetch(`${baseUrl}/api/deploy/config`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              providerId: DISPLAYDEV_PROVIDER_ID,
              token: 'dsp_live_secret',
            }),
          })
        ).status,
      ).toBe(200);

      let releaseCreate!: () => void;
      const createGate = new Promise<void>((resolve) => {
        releaseCreate = resolve;
      });
      let createCalls = 0;
      let updateCalls = 0;

      const realFetch = globalThis.fetch;
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof Request
              ? input.url
              : String(input);
        const method = init?.method || (input instanceof Request ? input.method : 'GET');
        if (url.startsWith(baseUrl)) return realFetch(input, init);
          if (url.endsWith('/v1/artifacts') && method === 'POST') {
            createCalls += 1;
            await createGate;
            return new Response(
              JSON.stringify({
                shortId: 'owned-lock',
                url: 'https://display.dsp.so/owned-lock',
                version: 1,
                name: 'index',
              }),
              {
            status: 201,
            headers: { 'content-type': 'application/json' },
          },
            );
          }
          if (url.endsWith('/v1/artifacts/owned-lock') && method === 'GET') {
            return new Response(
              JSON.stringify({
                shortId: 'owned-lock',
                currentVersion: 1,
                visibility: 'company',
                sharedWith: [],
              }),
              {
            status: 200,
            headers: { 'content-type': 'application/json', etag: '"v1"' },
          },
            );
          }
          if (url.endsWith('/v1/artifacts/owned-lock') && method === 'PUT') {
            updateCalls += 1;
            return new Response(
              JSON.stringify({
                shortId: 'owned-lock',
                url: 'https://display.dsp.so/owned-lock',
                version: 2,
                name: 'index',
              }),
              {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
            );
          }
        throw new Error(`Unexpected fetch: ${method} ${url}`);
        }),
      );
      try {
        const request = (fileName: string) =>
          fetch(`${baseUrl}/api/projects/${projectId}/deploy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileName,
              providerId: DISPLAYDEV_PROVIDER_ID,
              displayDev: {
                name: 'Canonical preview',
                saveDefaults: true,
                authentication: {
                  mode: 'api-key',
                  apiKey: 'dsp_live_secret',
                  save: true,
                },
              },
            }),
          });
        const first = request('sandbox//index.html');
        const second = request('sandbox\\index.html');
        await vi.waitFor(() => expect(createCalls).toBe(1));
        expect(updateCalls).toBe(0);
        releaseCreate();

        const responses = await Promise.all([first, second]);
        const bodies = await Promise.all(
          responses.map(async (response) => {
            const text = await response.text();
            expect(response.status, text).toBe(200);
            expect(JSON.parse(text)).toMatchObject({
              savedDisplayDevConfig: {
                providerId: DISPLAYDEV_PROVIDER_ID,
                tokenMask: SAVED_DISPLAYDEV_TOKEN_MASK,
                displayDev: { defaultArtifactName: 'Canonical preview' },
              },
            });
            expect(text).not.toContain('dsp_live_secret');
            return JSON.parse(text) as {
              deploymentCount: number;
              fileName: string;
            };
          }),
        );
        expect(createCalls).toBe(1);
        expect(updateCalls).toBe(1);
        expect(bodies.map((body) => body.deploymentCount).sort()).toEqual([
          1, 2,
        ]);
        expect(bodies.map((body) => body.fileName)).toEqual([
          'sandbox/index.html',
          'sandbox/index.html',
        ]);
        const deploymentsResponse = await fetch(`${baseUrl}/api/projects/${projectId}/deployments`);
        expect(deploymentsResponse.status).toBe(200);
        await expect(deploymentsResponse.json()).resolves.toMatchObject({
          deployments: [{ fileName: 'sandbox/index.html', deploymentCount: 2 }],
        });
        const savedConfig = await fetch(
        `${baseUrl}/api/deploy/config?providerId=${DISPLAYDEV_PROVIDER_ID}`,
      );
        expect(savedConfig.status).toBe(200);
        await expect(savedConfig.json()).resolves.toMatchObject({
          configured: true,
          displayDev: { defaultArtifactName: 'Canonical preview' },
        });
      } finally {
        vi.unstubAllGlobals();
      }
    } finally {
      if (priorStateRoot === undefined) delete process.env.OD_USER_STATE_DIR;
      else process.env.OD_USER_STATE_DIR = priorStateRoot;
      await rm(stateRoot, { recursive: true, force: true });
    }
  });

  it('migrates a legacy noncanonical deployment before redeploying', async () => {
    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
    const projectId = `displaydev-legacy-path-${Date.now()}`;
      const dir = await ensureProject(path.join(dataDir, 'projects'), projectId);
    await mkdir(path.join(dir, 'sandbox'), { recursive: true });
    await writeFile(
      path.join(dir, 'sandbox', 'index.html'),
      '<!doctype html><h1>Hello</h1>',
    );
    expect(
      (
        await fetch(`${baseUrl}/api/projects`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: projectId,
            name: 'display.dev legacy path migration test',
            skillId: null,
            designSystemId: null,
          }),
        })
      ).status,
    ).toBe(200);
    await writeFile(
      runtimeDisplayDevConfigPath(),
      JSON.stringify({
        token: 'dsp_live_secret',
        apiUrl: 'https://api.display.dev',
      }),
    );
    const db = openDatabase(process.cwd(), { dataDir });
    upsertDeployment(db, {
      id: 'legacy-path-deployment',
      projectId,
      fileName: 'sandbox//index.html',
      providerId: DISPLAYDEV_PROVIDER_ID,
      url: 'https://display.dsp.so/owned-legacy',
      deploymentId: 'owned-legacy',
      deploymentCount: 4,
      target: 'preview',
      status: 'ready',
      providerMetadata: {
        displayDev: {
          mode: 'authenticated',
          shortId: 'owned-legacy',
          visibility: 'company',
          sharedWith: [],
        },
      },
      createdAt: 1,
      updatedAt: 1,
    });

      const realFetch = globalThis.fetch;
    let createCalls = 0;
    let updateCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof Request
              ? input.url
              : String(input);
        const method = init?.method ?? 'GET';
        if (url.startsWith(baseUrl)) return realFetch(input, init);
        if (url.endsWith('/v1/artifacts') && method === 'POST') {
          createCalls += 1;
        }
        if (url.endsWith('/v1/artifacts/owned-legacy') && method === 'PUT') {
          updateCalls += 1;
          return new Response(
            JSON.stringify({
              shortId: 'owned-legacy',
              url: 'https://display.dsp.so/owned-legacy',
              version: 6,
              name: 'index',
            }),
            {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
          );
        }
        if (url.endsWith('/v1/artifacts/owned-legacy') && method === 'GET') {
          return new Response(
            JSON.stringify({
              shortId: 'owned-legacy',
              currentVersion: 5,
              visibility: 'company',
              sharedWith: [],
            }),
            {
              status: 200,
              headers: {
                'content-type': 'application/json',
                etag: '"v5"',
              },
            },
          );
        }
        throw new Error(`Unexpected fetch: ${method} ${url}`);
      }),
    );
    try {
      const response = await fetch(
        `${baseUrl}/api/projects/${projectId}/deploy`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: 'sandbox/index.html',
            providerId: DISPLAYDEV_PROVIDER_ID,
          }),
        },
      );
      const text = await response.text();
      expect(response.status, text).toBe(200);
      expect(JSON.parse(text)).toMatchObject({
        id: 'legacy-path-deployment',
        fileName: 'sandbox/index.html',
        deploymentCount: 5,
      });
      expect(createCalls).toBe(0);
      expect(updateCalls).toBe(1);

      const listResponse = await fetch(`${baseUrl}/api/projects/${projectId}/deployments`);
      await expect(listResponse.json()).resolves.toMatchObject({
        deployments: [
          {
            id: 'legacy-path-deployment',
            fileName: 'sandbox/index.html',
            deploymentCount: 5,
          },
        ],
      });
    } finally {
        vi.unstubAllGlobals();
      }
  });

  it('does not infer display.dev claim state when an API key is saved', async () => {
    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'od-displaydev-claim-route-'));
    const priorStateRoot = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = stateRoot;
    const projectId = `displaydev-claim-${Date.now()}`;
      const dir = await ensureProject(path.join(dataDir, 'projects'), projectId);
      await writeFile(path.join(dir, 'index.html'), '<!doctype html><h1>Hello</h1>');
    try {
      const createProjectResp = await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: projectId,
          name: 'display.dev claim route test',
          skillId: null,
          designSystemId: null,
        }),
      });
      expect(createProjectResp.status).toBe(200);

      const realFetch = globalThis.fetch;
      let previewReachable = true;
      const fetchMock = vi.fn(
        async (input: string | URL | Request, init?: RequestInit) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof Request
              ? input.url
              : String(input);
        const method = init?.method || (input instanceof Request ? input.method : 'GET');
        if (url.startsWith(baseUrl)) return realFetch(input, init);
        if (url.endsWith('/v1/public/artifacts') && method === 'POST') {
            return new Response(
              JSON.stringify({
            shortId: 'anon1234',
            previewUrl: 'https://public.dsp.so/anon1234',
            claimUrl: 'https://app.display.dev/claim?code=claim_123',
            expiresAt: '2026-06-26T00:00:00.000Z',
              }),
              {
            status: 201,
            headers: { 'content-type': 'application/json' },
          },
            );
        }
          if (
            url === 'https://public.dsp.so/anon1234' &&
            (method === 'HEAD' || method === 'GET')
          ) {
            return new Response('', { status: previewReachable ? 200 : 404 });
        }
        throw new Error(`Unexpected fetch: ${method} ${url}`);
        },
      );
      vi.stubGlobal('fetch', fetchMock);
      try {
        const deployResp = await fetch(`${baseUrl}/api/projects/${projectId}/deploy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: 'index.html',
            providerId: DISPLAYDEV_PROVIDER_ID,
          }),
        });
        const deployText = await deployResp.text();
        expect(deployResp.status, deployText).toBe(200);
        const deployment = JSON.parse(deployText) as { id: string };
        expect(deployment).toMatchObject({
          providerId: DISPLAYDEV_PROVIDER_ID,
          url: 'https://public.dsp.so/anon1234',
          displayDev: {
            mode: 'anonymous',
            shortId: 'anon1234',
            claimUrl: 'https://app.display.dev/claim?code=claim_123',
            expiresAt: '2026-06-26T00:00:00.000Z',
          },
        });

        previewReachable = false;

        const checkResp = await fetch(`${baseUrl}/api/projects/${projectId}/deployments/${deployment.id}/check-link`, {
          method: 'POST',
        });
        expect(checkResp.status).toBe(200);
        expect(await checkResp.json()).toMatchObject({
          status: 'link-delayed',
          displayDev: {
            mode: 'anonymous',
            shortId: 'anon1234',
            claimUrl: 'https://app.display.dev/claim?code=claim_123',
          },
        });

        const saveResp = await fetch(`${baseUrl}/api/deploy/config`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            providerId: DISPLAYDEV_PROVIDER_ID,
            token: 'Bearer dsp_live_secret',
            displayDevClaim: { projectId, fileName: 'index.html' },
          }),
        });
      expect(saveResp.status).toBe(200);

        const deploymentsResp = await fetch(`${baseUrl}/api/projects/${projectId}/deployments`);
        expect(deploymentsResp.status).toBe(200);
        const deploymentsBody = (await deploymentsResp.json()) as { deployments: Array<any> };
        expect(deploymentsBody.deployments[0]).toMatchObject({
          providerId: DISPLAYDEV_PROVIDER_ID,
          displayDev: {
            mode: 'anonymous',
            shortId: 'anon1234',
            claimUrlRedacted: true,
            expiresAt: '2026-06-26T00:00:00.000Z',
          },
        });
        expect(deploymentsBody.deployments[0]?.displayDev).not.toHaveProperty(
          'claimUrl',
        );
        expect(deploymentsBody.deployments[0]).not.toHaveProperty('providerMetadata');
      } finally {
        vi.unstubAllGlobals();
      }
    } finally {
      if (priorStateRoot === undefined) delete process.env.OD_USER_STATE_DIR;
      else process.env.OD_USER_STATE_DIR = priorStateRoot;
      await rm(stateRoot, { recursive: true, force: true });
    }
  });

  it('keeps authenticated display.dev deploy responses successful when access hydration fails', async () => {
    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'od-displaydev-hydration-fail-route-'));
    const priorStateRoot = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = stateRoot;
    const projectId = `displaydev-hydration-fail-${Date.now()}`;
      const dir = await ensureProject(path.join(dataDir, 'projects'), projectId);
      await writeFile(path.join(dir, 'index.html'), '<!doctype html><h1>Hello</h1>');
    try {
      const createProjectResp = await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: projectId,
          name: 'display.dev hydration failure route test',
          skillId: null,
          designSystemId: null,
        }),
      });
      expect(createProjectResp.status).toBe(200);

      const saveVercelResp = await fetch(`${baseUrl}/api/deploy/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: VERCEL_PROVIDER_ID,
          token: 'vercel-token-secret',
        }),
      });
      expect(saveVercelResp.status).toBe(200);

      const saveResp = await fetch(`${baseUrl}/api/deploy/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: DISPLAYDEV_PROVIDER_ID,
          token: 'Bearer dsp_live_secret',
          displayDev: {
            defaultVisibility: 'private',
            defaultSharedWith: ['fallback@example.com'],
          },
        }),
      });
      expect(saveResp.status).toBe(200);

      let artifactGetCalls = 0;

      const realFetch = globalThis.fetch;
      const fetchMock = vi.fn(
        async (input: string | URL | Request, init?: RequestInit) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof Request
              ? input.url
              : String(input);
        const method = init?.method || (input instanceof Request ? input.method : 'GET');
        if (url.startsWith(baseUrl)) return realFetch(input, init);
        if (url.includes('/v13/deployments') && method === 'POST') {
          return new Response(JSON.stringify({
            id: 'vercel-hydration-ok',
            readyState: 'READY',
            url: 'vercel-hydration.example',
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url.includes('/v13/deployments/vercel-hydration-ok') && method === 'GET') {
          return new Response(JSON.stringify({
            id: 'vercel-hydration-ok',
            readyState: 'READY',
            url: 'vercel-hydration.example',
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url === 'https://vercel-hydration.example' && method === 'HEAD') {
          return new Response('', { status: 200 });
        }
        if (url.endsWith('/v1/artifacts') && method === 'POST') {
            return new Response(
              JSON.stringify({
            shortId: 'owned1234',
            url: 'https://display.dsp.so/owned1234-demo',
            version: 1,
                name: 'demo',
              }),
              {
            status: 201,
            headers: { 'content-type': 'application/json' },
          },
            );
        }
        if (url.endsWith('/v1/artifacts/owned1234') && method === 'GET') {
          artifactGetCalls += 1;
          if (artifactGetCalls === 1) {
            return new Response(JSON.stringify({ error: 'temporary display.dev outage' }), {
              status: 503,
              headers: { 'content-type': 'application/json' },
            });
          }
          return new Response(JSON.stringify({ error: 'temporary display.dev outage on list' }), {
            status: 503,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url === 'https://display.dsp.so/owned1234-demo' && method === 'HEAD') {
          return new Response('', { status: 200 });
        }
        throw new Error(`Unexpected fetch: ${method} ${url}`);
        },
      );
      vi.stubGlobal('fetch', fetchMock);
      try {
        const vercelResp = await fetch(`${baseUrl}/api/projects/${projectId}/deploy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: 'index.html',
            providerId: VERCEL_PROVIDER_ID,
          }),
        });
        const vercelText = await vercelResp.text();
        expect(vercelResp.status, vercelText).toBe(200);
        const deployResp = await fetch(`${baseUrl}/api/projects/${projectId}/deploy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: 'index.html',
            providerId: DISPLAYDEV_PROVIDER_ID,
          }),
        });
        const deployText = await deployResp.text();
        expect(deployResp.status, deployText).toBe(200);
        const deployBody = JSON.parse(deployText);
        expect(deployBody).toMatchObject({
          providerId: DISPLAYDEV_PROVIDER_ID,
          url: 'https://display.dsp.so/owned1234-demo',
          status: 'ready',
          displayDev: {
            mode: 'authenticated',
            shortId: 'owned1234',
            accessSettingsMissing: true,
          },
        });
        expect(artifactGetCalls).toBe(1);

        const deploymentsResp = await fetch(`${baseUrl}/api/projects/${projectId}/deployments`);
        const deploymentsText = await deploymentsResp.text();
        expect(deploymentsResp.status, deploymentsText).toBe(200);
        const deploymentsBody = JSON.parse(deploymentsText) as { deployments: Array<any> };
        expect(deploymentsBody.deployments).toEqual(expect.arrayContaining([
          expect.objectContaining({
            providerId: VERCEL_PROVIDER_ID,
            url: 'https://vercel-hydration.example',
            status: 'ready',
          }),
          expect.objectContaining({
            providerId: DISPLAYDEV_PROVIDER_ID,
            url: 'https://display.dsp.so/owned1234-demo',
          }),
        ]));
        const displayDevDeployment = deploymentsBody.deployments.find(
          (deployment) => deployment.providerId === DISPLAYDEV_PROVIDER_ID,
        );
        expect(displayDevDeployment).toMatchObject({
          displayDev: {
            mode: 'authenticated',
            shortId: 'owned1234',
            accessSettingsMissing: true,
          },
        });
        expect(artifactGetCalls).toBe(1);

        const detailResp = await fetch(
          `${baseUrl}/api/projects/${projectId}/deployments/${encodeURIComponent(displayDevDeployment.id)}`,
        );
        expect(detailResp.status).toBe(503);
        expect(artifactGetCalls).toBe(2);
      } finally {
        vi.unstubAllGlobals();
      }
    } finally {
      if (priorStateRoot === undefined) delete process.env.OD_USER_STATE_DIR;
      else process.env.OD_USER_STATE_DIR = priorStateRoot;
      await rm(stateRoot, { recursive: true, force: true });
    }
  });

  it.each([
    {
      upstreamStatus: 404,
      message: 'display.dev artifact was not found',
    },
    {
      upstreamStatus: 403,
      message: 'display.dev access denied',
    },
    {
      upstreamStatus: 409,
      message: 'display.dev version conflict',
    },
  ])(
    'keeps display.dev deploy responses successful when upstream $upstreamStatus access hydration fails',
    async ({ upstreamStatus, message }) => {
    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
      const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'od-displaydev-upstream-code-route-'));
    const priorStateRoot = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = stateRoot;
      const projectId = `displaydev-upstream-code-${upstreamStatus}-${Date.now()}`;
      const dir = await ensureProject(path.join(dataDir, 'projects'), projectId);
      await writeFile(path.join(dir, 'index.html'), '<!doctype html><h1>Hello</h1>');
      try {
        const createProjectResp = await fetch(`${baseUrl}/api/projects`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: projectId,
            name: `display.dev upstream ${upstreamStatus} route test`,
            skillId: null,
            designSystemId: null,
          }),
        });
      expect(createProjectResp.status).toBe(200);

        const saveResp = await fetch(`${baseUrl}/api/deploy/config`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            providerId: DISPLAYDEV_PROVIDER_ID,
            token: 'Bearer dsp_live_secret',
          }),
        });
      expect(saveResp.status).toBe(200);

      const realFetch = globalThis.fetch;
        const fetchMock = vi.fn(
          async (input: string | URL | Request, init?: RequestInit) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof Request
              ? input.url
              : String(input);
        const method = init?.method || (input instanceof Request ? input.method : 'GET');
        if (url.startsWith(baseUrl)) return realFetch(input, init);
          if (url.endsWith('/v1/artifacts') && method === 'POST') {
              return new Response(
                JSON.stringify({
              shortId: 'owned1234',
              url: 'https://display.dsp.so/owned1234-demo',
              version: 1,
                  name: 'demo',
                }),
                {
            status: 201,
            headers: { 'content-type': 'application/json' },
          },
              );
          }
          if (url.endsWith('/v1/artifacts/owned1234') && method === 'GET') {
            return new Response(JSON.stringify({ error: message }), {
              status: upstreamStatus,
              headers: { 'content-type': 'application/json' },
            });
          }
        if (url === 'https://display.dsp.so/owned1234-demo' && method === 'HEAD') {
          return new Response('', { status: 200 });
        }
        throw new Error(`Unexpected fetch: ${method} ${url}`);
          },
        );
      vi.stubGlobal('fetch', fetchMock);
        try {
          const deployResp = await fetch(`${baseUrl}/api/projects/${projectId}/deploy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileName: 'index.html',
              providerId: DISPLAYDEV_PROVIDER_ID,
            }),
          });
          const deployText = await deployResp.text();
          expect(deployResp.status, deployText).toBe(200);
          const deployBody = JSON.parse(deployText);
          expect(deployBody).toMatchObject({
            providerId: DISPLAYDEV_PROVIDER_ID,
            url: 'https://display.dsp.so/owned1234-demo',
            status: 'ready',
            displayDev: {
              mode: 'authenticated',
              shortId: 'owned1234',
              accessSettingsMissing: true,
            },
          });
        } finally {
          vi.unstubAllGlobals();
        }
      } finally {
      if (priorStateRoot === undefined) delete process.env.OD_USER_STATE_DIR;
      else process.env.OD_USER_STATE_DIR = priorStateRoot;
      await rm(stateRoot, { recursive: true, force: true });
    }
    },
  );

  it('omits display.dev access overrides and never fetches its stored preview URL', async () => {
    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'od-displaydev-owned-route-'));
    const priorStateRoot = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = stateRoot;
    const projectId = `displaydev-owned-${Date.now()}`;
      const dir = await ensureProject(path.join(dataDir, 'projects'), projectId);
      await writeFile(path.join(dir, 'index.html'), '<!doctype html><h1>Hello</h1>');
    try {
      const createProjectResp = await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: projectId,
          name: 'display.dev owned route test',
          skillId: null,
          designSystemId: null,
        }),
      });
      expect(createProjectResp.status).toBe(200);

      const saveResp = await fetch(`${baseUrl}/api/deploy/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: DISPLAYDEV_PROVIDER_ID,
          token: 'Bearer dsp_live_secret',
          displayDev: {
            defaultArtifactName: 'Config default',
            defaultVisibility: 'company',
            defaultSharedWith: ['default@example.com'],
          },
        }),
      });
      expect(saveResp.status).toBe(200);

      const updateBodies: Array<{
        name: unknown;
        visibility: unknown;
        sharedWith: unknown[];
        clearSharedWith: unknown;
      }> = [];
      const createAuthHeaders: string[] = [];
      const accessReadAuthHeaders: string[] = [];
      const updateAuthHeaders: string[] = [];
      const updateIfMatchHeaders: string[] = [];
      let accessReadFailure: { status: number; message: string } | null = null;
      let previewStatus = 200;
      let previewProbeGate: Promise<void> | null = null;
      let previewProbeCalls = 0;
      const authHeader = (headers: RequestInit['headers'] | undefined) => {
        if (!headers) return '';
        if (headers instanceof Headers) return headers.get('Authorization') || '';
        if (Array.isArray(headers)) {
          const found = headers.find(([key]) => key?.toLowerCase() === 'authorization');
          return typeof found?.[1] === 'string' ? found[1] : '';
        }
        const value = (headers as Record<string, string | undefined>).Authorization
          || (headers as Record<string, string | undefined>).authorization;
        return value || '';
      };
      const requestHeader = (headers: RequestInit['headers'] | undefined, name: string) => {
        if (!headers) return '';
        if (headers instanceof Headers) return headers.get(name) || '';
        if (Array.isArray(headers)) {
          const found = headers.find(([key]) => key?.toLowerCase() === name.toLowerCase());
          return typeof found?.[1] === 'string' ? found[1] : '';
        }
        const value = (headers as Record<string, string | undefined>)[name]
          || (headers as Record<string, string | undefined>)[name.toLowerCase()];
        return value || '';
      };

      const realFetch = globalThis.fetch;
      const fetchMock = vi.fn(
        async (input: string | URL | Request, init?: RequestInit) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof Request
              ? input.url
              : String(input);
        const method = init?.method || (input instanceof Request ? input.method : 'GET');
        if (url.startsWith(baseUrl)) return realFetch(input, init);
        if (url.endsWith('/v1/artifacts') && method === 'POST') {
          createAuthHeaders.push(authHeader(init?.headers));
            return new Response(
              JSON.stringify({
            shortId: 'owned1234',
            url: 'https://display.dsp.so/owned1234-demo',
            version: 1,
                name: 'demo',
              }),
              {
            status: 201,
            headers: { 'content-type': 'application/json' },
          },
            );
        }
        if (url.endsWith('/v1/artifacts/owned1234') && method === 'GET') {
            accessReadAuthHeaders.push(authHeader(init?.headers));
            if (accessReadFailure) {
              return new Response(
                JSON.stringify({ error: accessReadFailure.message }),
                {
                  status: accessReadFailure.status,
              headers: { 'content-type': 'application/json' },
                },
              );
          }
            return new Response(
              JSON.stringify({
            shortId: 'owned1234',
            url: 'https://display.dsp.so/owned1234-demo',
            currentVersion: 1,
            visibility: 'private',
            sharedWith: ['person@example.com'],
              }),
              {
            status: 200,
            headers: { 'content-type': 'application/json', etag: '"v1"' },
          },
            );
          }
          if (
            url === 'https://display.dsp.so/owned1234-demo' &&
            (method === 'HEAD' || method === 'GET')
          ) {
            previewProbeCalls += 1;
            if (previewProbeGate) await previewProbeGate;
            return new Response('', { status: previewStatus });
        }
        if (url.endsWith('/v1/artifacts/owned1234') && method === 'PUT') {
          if (!(init?.body instanceof FormData)) throw new Error('Expected FormData body');
          updateAuthHeaders.push(authHeader(init?.headers));
          updateIfMatchHeaders.push(requestHeader(init?.headers, 'If-Match'));
          updateBodies.push({
            name: init.body.get('name'),
            visibility: init.body.get('visibility'),
            sharedWith: init.body.getAll('sharedWith'),
            clearSharedWith: init.body.get('clearSharedWith'),
          });
            return new Response(
              JSON.stringify({
            shortId: 'owned1234',
            url: 'https://display.dsp.so/owned1234-demo',
            version: 2,
                name: 'demo',
              }),
              {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
            );
        }
        throw new Error(`Unexpected fetch: ${method} ${url}`);
        },
      );
      vi.stubGlobal('fetch', fetchMock);
      try {
        const firstDeployResp = await fetch(
          `${baseUrl}/api/projects/${projectId}/deploy`,
          {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: 'index.html',
            providerId: DISPLAYDEV_PROVIDER_ID,
            displayDev: {
              visibility: 'private',
              sharedWith: ['person@example.com'],
                authentication: {
                  mode: 'api-key',
                  apiKey: 'dsp_live_request_secret',
                },
            },
          }),
          },
        );
        const firstDeployText = await firstDeployResp.text();
        expect(firstDeployResp.status, firstDeployText).toBe(200);
        expect(JSON.parse(firstDeployText)).toMatchObject({
          providerId: DISPLAYDEV_PROVIDER_ID,
          target: 'preview',
          displayDev: {
            mode: 'authenticated',
            shortId: 'owned1234',
            visibility: 'private',
            sharedWith: ['person@example.com'],
          },
        });

        const secondDeployResp = await fetch(`${baseUrl}/api/projects/${projectId}/deploy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: 'index.html',
            providerId: DISPLAYDEV_PROVIDER_ID,
          }),
        });
        const secondDeployText = await secondDeployResp.text();
        expect(secondDeployResp.status, secondDeployText).toBe(200);
        const secondDeployment = JSON.parse(secondDeployText) as { id: string };
        expect(secondDeployment).toMatchObject({
          providerId: DISPLAYDEV_PROVIDER_ID,
          displayDev: {
            mode: 'authenticated',
            shortId: 'owned1234',
            visibility: 'private',
            sharedWith: ['person@example.com'],
          },
        });

        expect(updateBodies).toEqual([
          {
          name: null,
          visibility: null,
          sharedWith: [],
          clearSharedWith: null,
          },
        ]);
        expect(createAuthHeaders).toEqual(['Bearer dsp_live_request_secret']);
        expect(accessReadAuthHeaders[0]).toBe('Bearer dsp_live_request_secret');
        expect(updateAuthHeaders).toEqual(['Bearer dsp_live_secret']);
        expect(updateIfMatchHeaders).toEqual(['"v1"']);

        let releasePreviewProbe!: () => void;
        previewProbeGate = new Promise<void>((resolve) => {
          releasePreviewProbe = resolve;
        });
        const checkDuringRedeploy = fetch(`${baseUrl}/api/projects/${projectId}/deployments/${secondDeployment.id}/check-link`, {
          method: 'POST',
        });
        await vi.waitFor(() => expect(previewProbeCalls).toBeGreaterThan(0));
        const redeployDuringCheck = fetch(`${baseUrl}/api/projects/${projectId}/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: 'index.html',
          providerId: DISPLAYDEV_PROVIDER_ID,
        }),
      });
        await new Promise((resolve) => setTimeout(resolve, 25));
        expect(updateBodies).toHaveLength(1);
        previewProbeGate = null;
        releasePreviewProbe();
        const [concurrentCheckResponse, concurrentRedeployResponse] =
          await Promise.all([checkDuringRedeploy, redeployDuringCheck]);
        expect(concurrentCheckResponse.status).toBe(200);
        expect(concurrentRedeployResponse.status).toBe(200);
        expect(updateBodies).toHaveLength(2);
        await expect(concurrentRedeployResponse.json()).resolves.toMatchObject({
          deploymentCount: 3,
          displayDev: { shortId: 'owned1234' },
        });
        const finalDeploymentResponse = await fetch(
          `${baseUrl}/api/projects/${projectId}/deployments/${secondDeployment.id}`,
        );
        expect(finalDeploymentResponse.status).toBe(200);
        await expect(finalDeploymentResponse.json()).resolves.toMatchObject({
          url: 'https://display.dsp.so/owned1234-demo',
          deploymentCount: 3,
          displayDev: {
            mode: 'authenticated',
            shortId: 'owned1234',
          },
        });

        const checkResp = await fetch(`${baseUrl}/api/projects/${projectId}/deployments/${secondDeployment.id}/check-link`, {
          method: 'POST',
        });
        const checkText = await checkResp.text();
        expect(checkResp.status, checkText).toBe(200);
        const checkBody = JSON.parse(checkText);
        expect(checkBody).toMatchObject({
          status: 'ready',
          displayDev: {
            mode: 'authenticated',
            shortId: 'owned1234',
            visibility: 'private',
            sharedWith: ['person@example.com'],
          },
        });
        expect(checkBody.statusMessage).toBe('Public link is ready.');

        previewStatus = 401;
        const protectedCheckResp = await fetch(`${baseUrl}/api/projects/${projectId}/deployments/${secondDeployment.id}/check-link`, {
          method: 'POST',
        });
        const protectedCheckText = await protectedCheckResp.text();
        expect(protectedCheckResp.status, protectedCheckText).toBe(200);
        expect(JSON.parse(protectedCheckText)).toMatchObject({
          status: 'protected',
          statusMessage:
            'Authentication is required to open this display.dev preview.',
        });
        previewStatus = 200;

        accessReadFailure = {
          status: 503,
          message: 'temporary display.dev outage on check-link',
        };
        const failedCheckResp = await fetch(`${baseUrl}/api/projects/${projectId}/deployments/${secondDeployment.id}/check-link`, {
          method: 'POST',
        });
        const failedCheckText = await failedCheckResp.text();
        expect(failedCheckResp.status, failedCheckText).toBe(503);
        expect(JSON.parse(failedCheckText)).toMatchObject({
          error: {
            code: 'UPSTREAM_UNAVAILABLE',
            message: 'temporary display.dev outage on check-link',
          },
        });

        accessReadFailure = {
          status: 404,
          message: 'display.dev artifact not found',
        };
        const missingPriorResp = await fetch(`${baseUrl}/api/projects/${projectId}/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: 'index.html',
          providerId: DISPLAYDEV_PROVIDER_ID,
        }),
      });
        const missingPriorText = await missingPriorResp.text();
        expect(missingPriorResp.status, missingPriorText).toBe(502);
        expect(JSON.parse(missingPriorText)).toMatchObject({
          error: {
            code: 'UPSTREAM_UNAVAILABLE',
            message:
              'display.dev artifact was not found or is not accessible with this API key.',
          },
        });
      } finally {
        vi.unstubAllGlobals();
      }
    } finally {
      if (priorStateRoot === undefined) delete process.env.OD_USER_STATE_DIR;
      else process.env.OD_USER_STATE_DIR = priorStateRoot;
      await rm(stateRoot, { recursive: true, force: true });
    }
  });

  it('rejects display.dev deploys with referenced assets before publishing externally', async () => {
    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'od-displaydev-multifile-route-'));
    const priorStateRoot = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = stateRoot;
    const projectId = `displaydev-multifile-${Date.now()}`;
      const dir = await ensureProject(path.join(dataDir, 'projects'), projectId);
    await writeFile(
      path.join(dir, 'index.html'),
      '<!doctype html><link rel="stylesheet" href="style.css"><h1>Hello</h1>',
    );
    await writeFile(path.join(dir, 'style.css'), 'h1 { color: rebeccapurple; }');
    try {
      const createProjectResp = await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: projectId,
          name: 'display.dev multi-file route test',
          skillId: null,
          designSystemId: null,
        }),
      });
      expect(createProjectResp.status).toBe(200);

      const realFetch = globalThis.fetch;
      const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof Request
              ? input.url
              : String(input);
        if (url.startsWith(baseUrl)) return realFetch(input, init);
        throw new Error(`No external display.dev fetch expected for multi-file rejection: ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);
      try {
        const deployResp = await fetch(`${baseUrl}/api/projects/${projectId}/deploy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: 'index.html',
            providerId: DISPLAYDEV_PROVIDER_ID,
          }),
        });
        expect(deployResp.status).toBe(400);
        const deployBody = (await deployResp.json()) as {
          error?: { message?: string; details?: { unsupportedFiles?: string[] } };
        };
        expect(deployBody.error?.message).toMatch(/single-file HTML previews/i);
        expect(deployBody.error?.details?.unsupportedFiles).toEqual(['style.css']);
      } finally {
        vi.unstubAllGlobals();
      }
    } finally {
      if (priorStateRoot === undefined) delete process.env.OD_USER_STATE_DIR;
      else process.env.OD_USER_STATE_DIR = priorStateRoot;
      await rm(stateRoot, { recursive: true, force: true });
    }
  });

  it('derives Cloudflare Pages project names from the Open Design project', async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'od-deploy-route-auto-project-'));
    const priorStateRoot = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = stateRoot;
    const projectId = 'cf-route-123456';
    const expectedPagesProject = 'od-ai-cf-route-123';
    try {
      const createProjectResp = await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: projectId,
          name: 'AI 生图网站',
          skillId: null,
          designSystemId: null,
        }),
      });
      expect(createProjectResp.status).toBe(200);

      const createFileResp = await fetch(`${baseUrl}/api/projects/${projectId}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'index.html',
          content: '<!doctype html><h1>Hello</h1>',
          artifactManifest: {
            version: 1,
            kind: 'html',
            title: 'Index',
            entry: 'index.html',
            renderer: 'html',
            exports: ['html'],
          },
        }),
      });
      expect(createFileResp.status).toBe(200);

      const saveResp = await fetch(`${baseUrl}/api/deploy/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
          token: 'cloudflare-token-secret',
          accountId: 'account_123',
        }),
      });
      expect(saveResp.status).toBe(200);

      const realFetch = globalThis.fetch;
      const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof Request
              ? input.url
              : String(input);
        const method = init?.method || (input instanceof Request ? input.method : 'GET');
        if (url.startsWith(baseUrl)) return realFetch(input, init);
        if (url.endsWith(`/pages/projects/${expectedPagesProject}`) && method === 'GET') {
          return new Response(JSON.stringify({ success: false, errors: [{ message: 'not found' }] }), {
            status: 404,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url.endsWith('/pages/projects') && method === 'POST') {
          const body = JSON.parse(String(init?.body ?? '{}'));
          expect(body).toMatchObject({
            name: expectedPagesProject,
            production_branch: 'main',
          });
          return new Response(JSON.stringify({ success: true, result: { name: body.name } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url.endsWith(`/pages/projects/${expectedPagesProject}/upload-token`) && method === 'GET') {
          return new Response(JSON.stringify({ success: true, result: { jwt: 'pages-upload-jwt' } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url.endsWith('/pages/assets/check-missing') && method === 'POST') {
          const body = JSON.parse(String(init?.body ?? '{}')) as { hashes?: string[] };
          expect(Array.isArray(body.hashes)).toBe(true);
          expect(body.hashes?.length).toBeGreaterThan(0);
          return new Response(JSON.stringify({ success: true, result: body.hashes }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url.endsWith('/pages/assets/upload') && method === 'POST') {
          const body = JSON.parse(String(init?.body ?? '[]')) as Array<{
            key?: string;
            value?: string;
            metadata?: { contentType?: string };
            base64?: boolean;
          }>;
          expect(body).toHaveLength(1);
          expect(body[0]?.base64).toBe(true);
          expect(body[0]?.metadata?.contentType).toMatch(/^text\/html/);
          expect(body[0]?.key).toMatch(/^[a-f0-9]{32}$/);
          expect(body[0]?.value).toEqual(expect.any(String));
          return new Response(JSON.stringify({ success: true, result: null }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url.endsWith('/pages/assets/upsert-hashes') && method === 'POST') {
          const body = JSON.parse(String(init?.body ?? '{}')) as { hashes?: string[] };
          expect(Array.isArray(body.hashes)).toBe(true);
          expect(body.hashes?.length).toBeGreaterThan(0);
          return new Response(JSON.stringify({ success: true, result: null }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url.endsWith(`/pages/projects/${expectedPagesProject}/deployments`) && method === 'POST') {
          const form = init?.body as FormData;
          const manifest = JSON.parse(String(form.get('manifest') ?? '{}')) as Record<string, string>;
          expect(Object.keys(manifest)).toContain('/index.html');
          expect(form.get('branch')).toBe('main');
          expect(form.get('pages_build_output_dir')).toBeNull();
          return new Response(JSON.stringify({
            success: true,
            result: { id: 'cf_dep_123', url: `https://d34527d9.${expectedPagesProject}.pages.dev` },
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url === `https://${expectedPagesProject}.pages.dev` && method === 'HEAD') {
          return new Response('', { status: 200 });
        }
        throw new Error(`Unexpected fetch: ${method} ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);
      try {
        const deployResp = await fetch(`${baseUrl}/api/projects/${projectId}/deploy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: 'index.html',
            providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
          }),
        });
        const deployBody = await deployResp.text();
        expect(deployResp.status, deployBody).toBe(200);
        const deployment = JSON.parse(deployBody) as { id: string };
        expect(deployment).toMatchObject({
          providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
          deploymentId: 'cf_dep_123',
          url: `https://${expectedPagesProject}.pages.dev`,
          status: 'ready',
          cloudflarePages: {
            projectName: expectedPagesProject,
            pagesDev: {
              url: `https://${expectedPagesProject}.pages.dev`,
              status: 'ready',
            },
          },
        });
        expect(deployment).not.toHaveProperty('providerMetadata');

        const renameResp = await fetch(`${baseUrl}/api/projects/${projectId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Renamed project after deploy' }),
        });
        expect(renameResp.status).toBe(200);

        const checkResp = await fetch(`${baseUrl}/api/projects/${projectId}/deployments/${deployment.id}/check-link`, {
          method: 'POST',
        });
        expect(checkResp.status).toBe(200);
        expect(await checkResp.json()).toMatchObject({
          url: `https://${expectedPagesProject}.pages.dev`,
          status: 'ready',
        });
      } finally {
        vi.unstubAllGlobals();
      }
    } finally {
      if (priorStateRoot === undefined) delete process.env.OD_USER_STATE_DIR;
      else process.env.OD_USER_STATE_DIR = priorStateRoot;
      await rm(stateRoot, { recursive: true, force: true });
    }
  });

  it('rejects invalid Cloudflare custom-domain selection before Pages deploy', async () => {
    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'od-deploy-route-invalid-domain-'));
    const priorStateRoot = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = stateRoot;
    const projectId = `cf-invalid-${Date.now()}`;
    const dir = await ensureProject(path.join(dataDir, 'projects'), projectId);
    await writeFile(path.join(dir, 'index.html'), '<!doctype html><h1>Hello</h1>');
    try {
      const createProjectResp = await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: projectId,
          name: 'Invalid domain test',
          skillId: null,
          designSystemId: null,
        }),
      });
      expect(createProjectResp.status).toBe(200);

      const saveResp = await fetch(`${baseUrl}/api/deploy/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
          token: 'cloudflare-token-secret',
          accountId: 'account_123',
        }),
      });
      expect(saveResp.status).toBe(200);

      const realFetch = globalThis.fetch;
      const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof Request
              ? input.url
              : String(input);
        if (url.startsWith(baseUrl)) return realFetch(input, init);
        throw new Error(`No external fetch expected before invalid-prefix rejection: ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);
      try {
        const deployResp = await fetch(`${baseUrl}/api/projects/${projectId}/deploy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: 'index.html',
            providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
            cloudflarePages: {
              zoneId: 'zone-1',
              zoneName: 'example.com',
              domainPrefix: 'bad.prefix',
            },
          }),
        });
        expect(deployResp.status).toBe(400);
        expect(await deployResp.text()).toMatch(/valid subdomain prefix/i);
      } finally {
        vi.unstubAllGlobals();
      }
    } finally {
      if (priorStateRoot === undefined) delete process.env.OD_USER_STATE_DIR;
      else process.env.OD_USER_STATE_DIR = priorStateRoot;
      await rm(stateRoot, { recursive: true, force: true });
    }
  });

  it('refreshes Cloudflare Pages custom-domain API status during check-link', async () => {
    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'od-deploy-route-domain-check-'));
    const priorStateRoot = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = stateRoot;
    const projectId = `cf-domain-check-${Date.now()}`;
    const expectedPagesProject = cloudflarePagesProjectNameForProject(projectId, 'Domain check test');
    const dir = await ensureProject(path.join(dataDir, 'projects'), projectId);
    await writeFile(path.join(dir, 'index.html'), '<!doctype html><h1>Hello</h1>');
    try {
      const createProjectResp = await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: projectId,
          name: 'Domain check test',
          skillId: null,
          designSystemId: null,
        }),
      });
      expect(createProjectResp.status).toBe(200);

      const saveResp = await fetch(`${baseUrl}/api/deploy/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
          token: 'cloudflare-token-secret',
          accountId: 'account_123',
        }),
      });
      expect(saveResp.status).toBe(200);

      const realFetch = globalThis.fetch;
      let domainListCount = 0;
      const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof Request
              ? input.url
              : String(input);
        const method = init?.method || (input instanceof Request ? input.method : 'GET');
        if (url.startsWith(baseUrl)) return realFetch(input, init);
        if (url.endsWith(`/pages/projects/${expectedPagesProject}`) && method === 'GET') {
          return new Response(JSON.stringify({ success: true, result: { name: expectedPagesProject } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url.endsWith(`/pages/projects/${expectedPagesProject}/upload-token`) && method === 'GET') {
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
        if (url.endsWith(`/pages/projects/${expectedPagesProject}/deployments`) && method === 'POST') {
          return new Response(JSON.stringify({
            success: true,
            result: { id: 'cf_dep_domain_check', url: `https://d34527d9.${expectedPagesProject}.pages.dev` },
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url === `https://${expectedPagesProject}.pages.dev` && method === 'HEAD') {
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
        if (url.endsWith(`/pages/projects/${expectedPagesProject}/domains/demo.example.com`) && method === 'GET') {
          domainListCount += 1;
          if (domainListCount === 1) {
            return new Response(JSON.stringify({
              success: false,
              errors: [{ message: 'Custom domain not found' }],
            }), {
              status: 404,
              headers: { 'content-type': 'application/json' },
            });
          }
          const result = {
            name: 'demo.example.com',
            status: domainListCount === 2 ? 'pending' : 'active',
            validation_data: { txt_name: '_cf-custom-hostname.demo.example.com' },
            verification_data: { cname: `${expectedPagesProject}.pages.dev` },
          };
          return new Response(JSON.stringify({ success: true, result }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url.endsWith(`/pages/projects/${expectedPagesProject}/domains`) && method === 'POST') {
          expect(JSON.parse(String(init?.body ?? '{}'))).toEqual({ name: 'demo.example.com' });
          return new Response(JSON.stringify({
            success: true,
            result: { name: 'demo.example.com', status: 'pending' },
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
      vi.stubGlobal('fetch', fetchMock);
      try {
        const deployResp = await fetch(`${baseUrl}/api/projects/${projectId}/deploy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: 'index.html',
            providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
            cloudflarePages: {
              zoneId: 'zone-1',
              zoneName: 'example.com',
              domainPrefix: 'demo',
            },
          }),
        });
        const deployBody = await deployResp.text();
        expect(deployResp.status, deployBody).toBe(200);
        const deployment = JSON.parse(deployBody) as { id: string };
        expect(deployment).toMatchObject({
          providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
          url: `https://${expectedPagesProject}.pages.dev`,
          status: 'link-delayed',
          cloudflarePages: {
            pagesDev: { url: `https://${expectedPagesProject}.pages.dev`, status: 'ready' },
            customDomain: {
              hostname: 'demo.example.com',
              status: 'pending',
              domainStatus: 'pending',
            },
          },
        });
        expect(deployment).not.toHaveProperty('providerMetadata');

        const pendingResp = await fetch(`${baseUrl}/api/projects/${projectId}/deployments/${deployment.id}/check-link`, {
          method: 'POST',
        });
        expect(pendingResp.status).toBe(200);
        const pending = await pendingResp.json();
        expect(pending).toMatchObject({
          url: `https://${expectedPagesProject}.pages.dev`,
          status: 'link-delayed',
          cloudflarePages: {
            customDomain: {
              hostname: 'demo.example.com',
              status: 'pending',
              domainStatus: 'pending',
              pagesDomainStatus: 'pending',
            },
          },
        });
        expect(pending).not.toHaveProperty('providerMetadata');

        const readyResp = await fetch(`${baseUrl}/api/projects/${projectId}/deployments/${deployment.id}/check-link`, {
          method: 'POST',
        });
        expect(readyResp.status).toBe(200);
        const ready = await readyResp.json();
        expect(ready).toMatchObject({
          url: `https://${expectedPagesProject}.pages.dev`,
          status: 'ready',
          cloudflarePages: {
            customDomain: {
              hostname: 'demo.example.com',
              status: 'ready',
              domainStatus: 'active',
              pagesDomainStatus: 'active',
              validationData: { txt_name: '_cf-custom-hostname.demo.example.com' },
              verificationData: { cname: `${expectedPagesProject}.pages.dev` },
            },
          },
        });
        expect(ready).not.toHaveProperty('providerMetadata');
      } finally {
        vi.unstubAllGlobals();
      }
    } finally {
      if (priorStateRoot === undefined) delete process.env.OD_USER_STATE_DIR;
      else process.env.OD_USER_STATE_DIR = priorStateRoot;
      await rm(stateRoot, { recursive: true, force: true });
    }
  });

  it('keeps Vercel deploy payload free of Cloudflare custom-domain fields', async () => {
    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'od-deploy-route-vercel-payload-'));
    const priorStateRoot = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = stateRoot;
    const projectId = `vercel-payload-${Date.now()}`;
    const dir = await ensureProject(path.join(dataDir, 'projects'), projectId);
    await writeFile(path.join(dir, 'index.html'), '<!doctype html><h1>Hello</h1>');
    await writeFile(path.join(dir, 'index-v1.html'), '<!doctype html><h1>V1</h1>');
    await mkdir(path.join(dir, 'screens'), { recursive: true });
    await writeFile(path.join(dir, 'screens', 'k1-waiting.html'), '<!doctype html><h1>K1</h1>');
    try {
      const createProjectResp = await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: projectId,
          name: 'Vercel payload test',
          skillId: null,
          designSystemId: null,
        }),
      });
      expect(createProjectResp.status).toBe(200);

      const saveResp = await fetch(`${baseUrl}/api/deploy/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: VERCEL_PROVIDER_ID,
          token: 'vercel-token-secret',
        }),
      });
      expect(saveResp.status).toBe(200);

      const realFetch = globalThis.fetch;
      const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof Request
              ? input.url
              : String(input);
        const method = init?.method || (input instanceof Request ? input.method : 'GET');
        if (url.startsWith(baseUrl)) return realFetch(input, init);
        if (url.includes('/v13/deployments') && method === 'POST') {
          const body = JSON.parse(String(init?.body ?? '{}'));
          expect(body).not.toHaveProperty('cloudflarePages');
          expect(JSON.stringify(body)).not.toContain('example.com');
          expect(body.files.map((item: { file: string }) => item.file).sort()).toEqual([
            'index-v1.html',
            'index.html',
            'screens/k1-waiting.html',
          ]);
          return new Response(JSON.stringify({
            id: 'vercel-dep-1',
            readyState: 'READY',
            url: 'vercel.example',
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url.includes('/v13/deployments/vercel-dep-1') && method === 'GET') {
          return new Response(JSON.stringify({
            id: 'vercel-dep-1',
            readyState: 'READY',
            url: 'vercel.example',
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url === 'https://vercel.example' && method === 'HEAD') {
          return new Response('', { status: 200 });
        }
        throw new Error(`Unexpected fetch: ${method} ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);
      try {
        const deployResp = await fetch(`${baseUrl}/api/projects/${projectId}/deploy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: 'index.html',
            providerId: VERCEL_PROVIDER_ID,
            cloudflarePages: {
              zoneId: 'zone-1',
              zoneName: 'example.com',
              domainPrefix: 'demo',
            },
          }),
        });
        expect(deployResp.status).toBe(200);
        expect(await deployResp.json()).toMatchObject({
          providerId: VERCEL_PROVIDER_ID,
          url: 'https://vercel.example',
          status: 'ready',
        });
      } finally {
        vi.unstubAllGlobals();
      }
    } finally {
      if (priorStateRoot === undefined) delete process.env.OD_USER_STATE_DIR;
      else process.env.OD_USER_STATE_DIR = priorStateRoot;
      await rm(stateRoot, { recursive: true, force: true });
    }
  });

  // --- target threading tests (issue #4483) ---

  function makeCfPagesMockForRouteTarget(options: {
    previewDeployUrl: string;
    captureFormData: { branch: string | undefined };
    expectedPagesProject: string;
  }) {
    const { previewDeployUrl, captureFormData, expectedPagesProject } = options;

      const realFetch = globalThis.fetch;
    return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof Request
              ? input.url
              : String(input);
        const method = init?.method || (input instanceof Request ? input.method : 'GET');
        if (url.startsWith(baseUrl)) return realFetch(input, init);
        if (url.endsWith(`/pages/projects/${expectedPagesProject}`) && method === 'GET') {
          return new Response(JSON.stringify({ success: true, result: { name: expectedPagesProject } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url.endsWith(`/pages/projects/${expectedPagesProject}/upload-token`) && method === 'GET') {
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
      if (
        url.endsWith(`/pages/projects/${expectedPagesProject}/deployments`) && method === 'POST'
      ) {
          const form = init?.body as FormData;
        captureFormData.branch =
          (form?.get('branch') as string | undefined) ?? undefined;
        return new Response(JSON.stringify({
          success: true,
          result: { id: 'cf_dep_target_test', url: previewDeployUrl },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (method === 'HEAD') {
        return new Response('', { status: 200 });
      }
        throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
  }

  it('threads target=preview from POST body into the deployment record', async () => {
    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'od-deploy-route-target-preview-'));
    const priorStateRoot = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = stateRoot;
    const projectId = `cf-target-preview-${Date.now()}`;
    const expectedPagesProject = cloudflarePagesProjectNameForProject(projectId, 'Target preview test');
    const dir = await ensureProject(path.join(dataDir, 'projects'), projectId);
    await writeFile(path.join(dir, 'index.html'), '<!doctype html><h1>Hello</h1>');
    try {
      const createProjectResp = await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: projectId,
          name: 'Target preview test',
          skillId: null,
          designSystemId: null,
        }),
      });
      expect(createProjectResp.status).toBe(200);

      const saveResp = await fetch(`${baseUrl}/api/deploy/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
          token: 'cloudflare-token-secret',
          accountId: 'account_123',
        }),
      });
      expect(saveResp.status).toBe(200);

      const captureFormData: { branch: string | undefined } = { branch: undefined };
      const fetchMock = makeCfPagesMockForRouteTarget({
        previewDeployUrl: `https://abc123.${expectedPagesProject}.pages.dev`,
        captureFormData,
        expectedPagesProject,
      });
      vi.stubGlobal('fetch', fetchMock);
      try {
        const deployResp = await fetch(`${baseUrl}/api/projects/${projectId}/deploy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: 'index.html',
            providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
            target: 'preview',
          }),
        });
        const deployBody = await deployResp.text();
        expect(deployResp.status, deployBody).toBe(200);
        const deployment = JSON.parse(deployBody) as { target: string };
        // Route must persist the actual requested target, not always 'preview'
        expect(deployment.target).toBe('preview');
      } finally {
        vi.unstubAllGlobals();
      }
    } finally {
      if (priorStateRoot === undefined) delete process.env.OD_USER_STATE_DIR;
      else process.env.OD_USER_STATE_DIR = priorStateRoot;
      await rm(stateRoot, { recursive: true, force: true });
    }
  });

  it('threads target=production from POST body into the deployment record', async () => {
    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'od-deploy-route-target-prod-'));
    const priorStateRoot = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = stateRoot;
    const projectId = `cf-target-prod-${Date.now()}`;
    const expectedPagesProject = cloudflarePagesProjectNameForProject(projectId, 'Target prod test');
    const dir = await ensureProject(path.join(dataDir, 'projects'), projectId);
    await writeFile(path.join(dir, 'index.html'), '<!doctype html><h1>Hello</h1>');
    try {
      const createProjectResp = await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: projectId,
          name: 'Target prod test',
          skillId: null,
          designSystemId: null,
        }),
      });
      expect(createProjectResp.status).toBe(200);

      const saveResp = await fetch(`${baseUrl}/api/deploy/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
          token: 'cloudflare-token-secret',
          accountId: 'account_123',
        }),
      });
      expect(saveResp.status).toBe(200);

      const captureFormData: { branch: string | undefined } = { branch: undefined };
      const fetchMock = makeCfPagesMockForRouteTarget({
        previewDeployUrl: `https://abc123.${expectedPagesProject}.pages.dev`,
        captureFormData,
        expectedPagesProject,
      });
      vi.stubGlobal('fetch', fetchMock);
      try {
        const deployResp = await fetch(`${baseUrl}/api/projects/${projectId}/deploy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: 'index.html',
            providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
            target: 'production',
          }),
        });
        const deployBody = await deployResp.text();
        expect(deployResp.status, deployBody).toBe(200);
        const deployment = JSON.parse(deployBody) as { target: string };
        // An explicit target='production' in the body must be reflected in
        // the persisted record; the current code hardcodes 'preview' and will fail.
        expect(deployment.target).toBe('production');
      } finally {
        vi.unstubAllGlobals();
      }
    } finally {
      if (priorStateRoot === undefined) delete process.env.OD_USER_STATE_DIR;
      else process.env.OD_USER_STATE_DIR = priorStateRoot;
      await rm(stateRoot, { recursive: true, force: true });
    }
  });

  // --- target validation tests (P1 finding on PR #4576) ---

  /**
   * Helper: minimal project + CF config setup, no fetch mock needed.
   * Returns the projectId so callers can POST to /deploy.
   */
  async function setupProjectAndCfConfig(
    stateRoot: string,
    projectIdPrefix: string,
    projectName: string,
  ): Promise<string> {
    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
    const projectId = `${projectIdPrefix}-${Date.now()}`;
    const dir = await ensureProject(path.join(dataDir, 'projects'), projectId);
    await writeFile(path.join(dir, 'index.html'), '<!doctype html><h1>Hello</h1>');
    const createProjectResp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: projectId, name: projectName, skillId: null, designSystemId: null }),
    });
    expect(createProjectResp.status).toBe(200);
    const saveResp = await fetch(`${baseUrl}/api/deploy/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
        token: 'cloudflare-token-secret',
        accountId: 'account_123',
      }),
    });
    expect(saveResp.status).toBe(200);
    return projectId;
  }

  it('rejects a misspelled target value with HTTP 400 and does not invoke Cloudflare deploy', async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'od-deploy-route-invalid-target-typo-'));
    const priorStateRoot = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = stateRoot;
    try {
      const projectId = await setupProjectAndCfConfig(stateRoot, 'cf-invalid-typo', 'Invalid target typo test');

      // Stub fetch so any accidental external call fails loudly — the route
      // must return 400 BEFORE attempting a Cloudflare API call.
      const realFetch = globalThis.fetch;
      const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof Request
              ? input.url
              : String(input);
        if (url.startsWith(baseUrl)) return realFetch(input, init);
        throw new Error(`No Cloudflare deploy call expected for an invalid target: ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);
      try {
        const deployResp = await fetch(`${baseUrl}/api/projects/${projectId}/deploy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: 'index.html',
            providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
            target: 'preveiw', // deliberate typo — not 'preview' or 'production'
          }),
        });
        // Must reject with 400, not silently coerce to 'production'
        expect(deployResp.status).toBe(400);
        // Cloudflare deploy endpoint must never have been called
        const cfDeployCalls = fetchMock.mock.calls.filter((args) => {
          const u = typeof args[0] === 'string' ? args[0] : args[0] instanceof Request ? args[0].url : String(args[0]);
          return !u.startsWith(baseUrl);
        });
        expect(cfDeployCalls).toHaveLength(0);
      } finally {
        vi.unstubAllGlobals();
      }
    } finally {
      if (priorStateRoot === undefined) delete process.env.OD_USER_STATE_DIR;
      else process.env.OD_USER_STATE_DIR = priorStateRoot;
      await rm(stateRoot, { recursive: true, force: true });
    }
  });

  it('rejects an empty-string target value with HTTP 400 and does not invoke Cloudflare deploy', async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'od-deploy-route-invalid-target-empty-'));
    const priorStateRoot = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = stateRoot;
    try {
      const projectId = await setupProjectAndCfConfig(stateRoot, 'cf-invalid-empty', 'Invalid target empty test');

      const realFetch = globalThis.fetch;
      const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof Request
              ? input.url
              : String(input);
        if (url.startsWith(baseUrl)) return realFetch(input, init);
        throw new Error(`No Cloudflare deploy call expected for an empty-string target: ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);
      try {
        const deployResp = await fetch(`${baseUrl}/api/projects/${projectId}/deploy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: 'index.html',
            providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
            target: '', // supplied but empty — not a valid value, not the same as omitted
          }),
        });
        // An explicitly supplied empty string is an invalid target; must be 400
        expect(deployResp.status).toBe(400);
        const cfDeployCalls = fetchMock.mock.calls.filter((args) => {
          const u = typeof args[0] === 'string' ? args[0] : args[0] instanceof Request ? args[0].url : String(args[0]);
          return !u.startsWith(baseUrl);
        });
        expect(cfDeployCalls).toHaveLength(0);
      } finally {
        vi.unstubAllGlobals();
      }
    } finally {
      if (priorStateRoot === undefined) delete process.env.OD_USER_STATE_DIR;
      else process.env.OD_USER_STATE_DIR = priorStateRoot;
      await rm(stateRoot, { recursive: true, force: true });
    }
  });

  // Regression guards — these must PASS both before and after the fix to pin
  // the correct contract for the two valid explicit values and the omitted case.

  it('defaults to target=production and records production in the deployment when no target is sent', async () => {
    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'od-deploy-route-target-default-'));
    const priorStateRoot = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = stateRoot;
    const projectId = `cf-target-default-${Date.now()}`;
    const expectedPagesProject = cloudflarePagesProjectNameForProject(projectId, 'Target default test');
    const dir = await ensureProject(path.join(dataDir, 'projects'), projectId);
    await writeFile(path.join(dir, 'index.html'), '<!doctype html><h1>Hello</h1>');
    try {
      const createProjectResp = await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: projectId,
          name: 'Target default test',
          skillId: null,
          designSystemId: null,
        }),
      });
      expect(createProjectResp.status).toBe(200);

      const saveResp = await fetch(`${baseUrl}/api/deploy/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
          token: 'cloudflare-token-secret',
          accountId: 'account_123',
        }),
      });
      expect(saveResp.status).toBe(200);

      const captureFormData: { branch: string | undefined } = { branch: undefined };
      const fetchMock = makeCfPagesMockForRouteTarget({
        previewDeployUrl: `https://abc123.${expectedPagesProject}.pages.dev`,
        captureFormData,
        expectedPagesProject,
      });
      vi.stubGlobal('fetch', fetchMock);
      try {
        const deployResp = await fetch(`${baseUrl}/api/projects/${projectId}/deploy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: 'index.html',
            providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
            // no target field — should default to production
          }),
        });
        const deployBody = await deployResp.text();
        expect(deployResp.status, deployBody).toBe(200);
        const deployment = JSON.parse(deployBody) as { target: string };
        // When target is not supplied the deployment record must say 'production',
        // not 'preview' (which is the current hardcoded behaviour)
        expect(deployment.target).toBe('production');
      } finally {
        vi.unstubAllGlobals();
      }
    } finally {
      if (priorStateRoot === undefined) delete process.env.OD_USER_STATE_DIR;
      else process.env.OD_USER_STATE_DIR = priorStateRoot;
      await rm(stateRoot, { recursive: true, force: true });
    }
  });

  // --- Vercel production-target rejection tests (P2 review finding on PR #4576) ---
  //
  // Vercel production-target deploys are out of scope for this PR (which only
  // adds target support for Cloudflare Pages). The route must reject
  // providerId === VERCEL_PROVIDER_ID + resolved target === 'production' with
  // HTTP 400 / BAD_REQUEST *before* attempting any deploy call, instead of
  // silently deploying as preview.

  /**
   * Helper: minimal project + Vercel config setup, no fetch mock needed.
   * Returns the projectId so callers can POST to /deploy.
   */
  async function setupProjectAndVercelConfig(
    projectIdPrefix: string,
    projectName: string,
  ): Promise<string> {
    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
    const projectId = `${projectIdPrefix}-${Date.now()}`;
    const dir = await ensureProject(path.join(dataDir, 'projects'), projectId);
    await writeFile(path.join(dir, 'index.html'), '<!doctype html><h1>Hello</h1>');
    const createProjectResp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: projectId, name: projectName, skillId: null, designSystemId: null }),
    });
    expect(createProjectResp.status).toBe(200);
    const saveResp = await fetch(`${baseUrl}/api/deploy/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providerId: VERCEL_PROVIDER_ID,
        token: 'vercel-token-secret',
      }),
    });
    expect(saveResp.status).toBe(200);
    return projectId;
  }

  function makeVercelDeployMock() {
    const realFetch = globalThis.fetch;
    return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
      const method = init?.method || (input instanceof Request ? input.method : 'GET');
      if (url.startsWith(baseUrl)) return realFetch(input, init);
      if (url.includes('/v13/deployments') && method === 'POST') {
        return new Response(JSON.stringify({
          id: 'vercel-dep-still-works',
          readyState: 'READY',
          url: 'vercel-still-works.example',
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/v13/deployments/vercel-dep-still-works') && method === 'GET') {
        return new Response(JSON.stringify({
          id: 'vercel-dep-still-works',
          readyState: 'READY',
          url: 'vercel-still-works.example',
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://vercel-still-works.example' && method === 'HEAD') {
        return new Response('', { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
  }

  // Every deploy failure used to flatten to the envelope's BAD_REQUEST, so a
  // missing token, a non-HTML file, an unresolved asset reference and an
  // oversized asset were indistinguishable once the client mirrored the code
  // into `artifact_deploy_result.error_code` — in production that collapsed
  // into one opaque HTTP_400 bucket we could not act on. Distinct causes must
  // carry distinct codes.
  it('surfaces a specific error code for a non-HTML deploy instead of a generic BAD_REQUEST', async () => {
    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'od-deploy-route-error-code-'));
    const priorStateRoot = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = stateRoot;
    try {
      const projectId = await setupProjectAndVercelConfig('deploy-error-code', 'Deploy error code test');
      await writeFile(path.join(dataDir, 'projects', projectId, 'notes.txt'), 'not html');

      const resp = await fetch(`${baseUrl}/api/projects/${projectId}/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: 'notes.txt', providerId: VERCEL_PROVIDER_ID }),
      });
      const text = await resp.text();
      expect(resp.status, text).toBe(400);
      const body = JSON.parse(text) as { error?: { code?: string; message?: string } };
      expect(body.error?.code).toBe('NOT_HTML');
      expect(body.error?.message).toMatch(/HTML/i);
    } finally {
      if (priorStateRoot === undefined) delete process.env.OD_USER_STATE_DIR;
      else process.env.OD_USER_STATE_DIR = priorStateRoot;
      await rm(stateRoot, { recursive: true, force: true });
    }
  });

  it('maps a provider-rejected deploy to the canonical status-specific API code', async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'od-deploy-route-provider-status-'));
    const priorStateRoot = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = stateRoot;
    try {
      const projectId = await setupProjectAndVercelConfig('provider-status', 'Provider status test');

      const realFetch = globalThis.fetch;
      const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url =
          typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
        if (url.startsWith(baseUrl)) return realFetch(input, init);
        if (url.includes('/v13/deployments')) {
          return new Response(JSON.stringify({ error: { code: 'too_many_requests', message: 'Too many requests.' } }), {
            status: 429,
            headers: { 'content-type': 'application/json' },
          });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);
      try {
        const resp = await realFetch(`${baseUrl}/api/projects/${projectId}/deploy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: 'index.html', providerId: VERCEL_PROVIDER_ID }),
        });
      const text = await resp.text();
        expect(resp.status, text).toBe(429);
        const body = JSON.parse(text) as { error?: { code?: string } };
        expect(body.error?.code).toBe('RATE_LIMITED');
      } finally {
        vi.unstubAllGlobals();
      }
    } finally {
      if (priorStateRoot === undefined) delete process.env.OD_USER_STATE_DIR;
      else process.env.OD_USER_STATE_DIR = priorStateRoot;
      await rm(stateRoot, { recursive: true, force: true });
    }
  });

  // A provider failure whose CAUSE is known — not merely its status — still
  // earns a specific code.
  it('reports PROVIDER_FORBIDDEN when the provider names a permission failure', async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'od-deploy-route-provider-forbidden-'));
    const priorStateRoot = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = stateRoot;
    try {
      const projectId = await setupProjectAndVercelConfig('provider-forbidden', 'Provider forbidden test');
      const realFetch = globalThis.fetch;
      const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url =
          typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
        if (url.startsWith(baseUrl)) return realFetch(input, init);
        if (url.includes('/v13/deployments')) {
          return new Response(JSON.stringify({ error: { code: 'forbidden', message: 'Not authorized.' } }), {
            status: 403,
            headers: { 'content-type': 'application/json' },
          });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);
      try {
        const resp = await realFetch(`${baseUrl}/api/projects/${projectId}/deploy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: 'index.html', providerId: VERCEL_PROVIDER_ID }),
        });
        const text = await resp.text();
        expect(resp.status, text).toBe(403);
        const body = JSON.parse(text) as { error?: { code?: string } };
        expect(body.error?.code).toBe('PROVIDER_FORBIDDEN');
      } finally {
        vi.unstubAllGlobals();
      }
    } finally {
      if (priorStateRoot === undefined) delete process.env.OD_USER_STATE_DIR;
      else process.env.OD_USER_STATE_DIR = priorStateRoot;
      await rm(stateRoot, { recursive: true, force: true });
    }
  });

  // The config-save route is the only place CF_TOKEN_REQUIRED can surface, so
  // it needs the same passthrough as the deploy route — otherwise the code is
  // dead on arrival.
  it('surfaces CF_TOKEN_REQUIRED when saving a Cloudflare Pages config without a token', async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'od-deploy-route-cf-token-'));
    const priorStateRoot = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = stateRoot;
    try {
      const resp = await fetch(`${baseUrl}/api/deploy/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: CLOUDFLARE_PAGES_PROVIDER_ID, accountId: 'acct-1' }),
      });
      const text = await resp.text();
      expect(resp.status, text).toBe(400);
      const body = JSON.parse(text) as { error?: { code?: string } };
      expect(body.error?.code).toBe('CF_TOKEN_REQUIRED');
    } finally {
      if (priorStateRoot === undefined) delete process.env.OD_USER_STATE_DIR;
      else process.env.OD_USER_STATE_DIR = priorStateRoot;
      await rm(stateRoot, { recursive: true, force: true });
    }
  });

  it('rejects vercel-self target=production with 400 BAD_REQUEST before attempting a deploy', async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'od-deploy-route-vercel-prod-reject-'));
    const priorStateRoot = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = stateRoot;
    try {
      const projectId = await setupProjectAndVercelConfig('vercel-prod-reject', 'Vercel production reject test');

      // Use a fetch mock that WOULD happily complete a Vercel deploy if the
      // route called it — this is the same mock the "still works" companion
      // tests use for a legitimate preview deploy. If the route's guard is
      // missing (today's bug), the deploy proceeds and this mock lets it
      // succeed with 200, which is exactly the silent-preview-deploy bug
      // this test must catch. A correct fix never reaches this mock at all.
      const fetchMock = makeVercelDeployMock();
      vi.stubGlobal('fetch', fetchMock);
      try {
        const deployResp = await fetch(`${baseUrl}/api/projects/${projectId}/deploy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: 'index.html',
            providerId: VERCEL_PROVIDER_ID,
            target: 'production',
          }),
        });
        const bodyText = await deployResp.text();
        // Must reject with 400, not silently deploy as preview (the bug: this
        // currently returns 200 with a deployment that is actually 'preview').
        expect(deployResp.status, bodyText).toBe(400);
        const body = JSON.parse(bodyText) as { error?: { code?: string; message?: string } };
        expect(body.error?.code).toBe('BAD_REQUEST');
        expect(body.error?.message).toMatch(/production|target/i);

        // The Vercel deploy endpoint must never have been called — the route
        // must reject before attempting any deploy call.
        const vercelDeployCalls = fetchMock.mock.calls.filter((args) => {
          const u = typeof args[0] === 'string' ? args[0] : args[0] instanceof Request ? args[0].url : String(args[0]);
          return !u.startsWith(baseUrl);
        });
        expect(vercelDeployCalls).toHaveLength(0);
      } finally {
        vi.unstubAllGlobals();
      }
    } finally {
      if (priorStateRoot === undefined) delete process.env.OD_USER_STATE_DIR;
      else process.env.OD_USER_STATE_DIR = priorStateRoot;
      await rm(stateRoot, { recursive: true, force: true });
    }
  });

  it('rejects displaydev-self target=production before attempting a deploy', async () => {

      const realFetch = globalThis.fetch;
    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof Request
              ? input.url
              : String(input);
        if (url.startsWith(baseUrl)) return realFetch(input, init);
        throw new Error(`Unexpected provider request: ${url}`);
      },
    );
      vi.stubGlobal('fetch', fetchMock);
    try {
      const deployResp = await fetch(`${baseUrl}/api/projects/unused/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: 'index.html',
          providerId: DISPLAYDEV_PROVIDER_ID,
          target: 'production',
        }),
      });
        const bodyText = await deployResp.text();
      expect(deployResp.status, bodyText).toBe(400);
        const body = JSON.parse(bodyText) as { error?: { code?: string; message?: string } };
        expect(body.error?.code).toBe('BAD_REQUEST');
      expect(body.error?.message).toMatch(
        /display\.dev.*production|production.*display\.dev/i,
      );
      expect(
        fetchMock.mock.calls.filter(([input]) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof Request
              ? input.url
              : String(input);
          return !url.startsWith(baseUrl);
        }),
      ).toHaveLength(0);
    } finally {
        vi.unstubAllGlobals();
      }
  });

  it('still deploys vercel-self successfully when target=preview is explicit (no regression)', async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'od-deploy-route-vercel-preview-ok-'));
    const priorStateRoot = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = stateRoot;
    try {
      const projectId = await setupProjectAndVercelConfig('vercel-preview-ok', 'Vercel preview still works test');

      const fetchMock = makeVercelDeployMock();
      vi.stubGlobal('fetch', fetchMock);
      try {
        const deployResp = await fetch(`${baseUrl}/api/projects/${projectId}/deploy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: 'index.html',
            providerId: VERCEL_PROVIDER_ID,
            target: 'preview',
          }),
        });
        const bodyText = await deployResp.text();
        expect(deployResp.status, bodyText).toBe(200);
        const deployment = JSON.parse(bodyText) as { providerId: string; url: string; status: string };
        expect(deployment).toMatchObject({
          providerId: VERCEL_PROVIDER_ID,
          url: 'https://vercel-still-works.example',
          status: 'ready',
        });
      } finally {
        vi.unstubAllGlobals();
      }
    } finally {
      if (priorStateRoot === undefined) delete process.env.OD_USER_STATE_DIR;
      else process.env.OD_USER_STATE_DIR = priorStateRoot;
      await rm(stateRoot, { recursive: true, force: true });
    }
  });

  it('still deploys vercel-self successfully when target is omitted (no regression)', async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'od-deploy-route-vercel-omitted-ok-'));
    const priorStateRoot = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = stateRoot;
    try {
      const projectId = await setupProjectAndVercelConfig('vercel-omitted-ok', 'Vercel omitted target still works test');

      const fetchMock = makeVercelDeployMock();
      vi.stubGlobal('fetch', fetchMock);
      try {
        const deployResp = await fetch(`${baseUrl}/api/projects/${projectId}/deploy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: 'index.html',
            providerId: VERCEL_PROVIDER_ID,
            // no target field — must keep working exactly as before the fix.
          }),
        });
        const bodyText = await deployResp.text();
        expect(deployResp.status, bodyText).toBe(200);
        const deployment = JSON.parse(bodyText) as { providerId: string; url: string; status: string };
        expect(deployment).toMatchObject({
          providerId: VERCEL_PROVIDER_ID,
          url: 'https://vercel-still-works.example',
          status: 'ready',
        });
      } finally {
        vi.unstubAllGlobals();
      }
    } finally {
      if (priorStateRoot === undefined) delete process.env.OD_USER_STATE_DIR;
      else process.env.OD_USER_STATE_DIR = priorStateRoot;
      await rm(stateRoot, { recursive: true, force: true });
    }
  });
});

describe('display.dev deployment response authority', () => {
  const deployment = {
    id: 'deployment-1',
    projectId: 'project-1',
    fileName: 'index.html',
    providerId: DISPLAYDEV_PROVIDER_ID,
    url: 'https://display.dsp.so/owned1234-demo',
    deploymentId: 'owned1234',
    deploymentCount: 1,
    target: 'preview',
    status: 'ready',
    providerMetadata: {
      displayDev: {
        mode: 'authenticated',
        shortId: 'owned1234',
        visibility: 'company',
        sharedWith: ['recipient@example.com'],
      },
    },
    createdAt: 1,
    updatedAt: 1,
  };

  async function startAuthorityServer(input: {
    authorizeProjectRequest: (...args: any[]) => Promise<boolean>;
    fetchDisplayDevArtifactAccessSettings?: () => Promise<
      Record<string, unknown>
    >;
  }) {
    const app = express();
    app.use(express.json());
    const getDeploymentById = vi.fn(() => deployment);
    const fetchDisplayDevArtifactAccessSettings = vi.fn(
      input.fetchDisplayDevArtifactAccessSettings ??
        (async () => ({
          visibility: 'company',
          sharedWith: ['recipient@example.com'],
        })),
    );
    registerDeployRoutes(app, {
      db: {},
      http: {
        sendApiError: (
          res: express.Response,
          status: number,
          code: string,
          message: string,
          init?: { details?: unknown },
        ) => res.status(status).json({ error: { code, message, ...init } }),
      },
      paths: { PROJECTS_DIR: '/unused' },
      ids: { randomUUID: () => 'unused' },
      projectStore: { getProject: () => ({ id: 'project-1' }) },
      authorizeProjectRequest: input.authorizeProjectRequest,
      deploy: {
        VERCEL_PROVIDER_ID,
        CLOUDFLARE_PAGES_PROVIDER_ID,
        DISPLAYDEV_PROVIDER_ID,
        DeployError,
        listDeployments: () => [deployment],
        publicDeployments,
        getDeploymentById,
        publicDeployment,
        readDeployConfig: async () => ({ token: 'dsp_live_secret' }),
        fetchDisplayDevArtifactAccessSettings,
      },
    } as any);

    const server = http.createServer(app);
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('server did not bind');
    return {
      baseUrl: `http://127.0.0.1:${address.port}`,
      getDeploymentById,
      fetchDisplayDevArtifactAccessSettings,
      close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    };
  }

  it('keeps the read-authorized deployment list free of display.dev recipients', async () => {
    const authorizeProjectRequest = vi.fn(async () => true);
    const api = await startAuthorityServer({ authorizeProjectRequest });
    try {
      const response = await fetch(
        `${api.baseUrl}/api/projects/project-1/deployments`,
      );
      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).not.toContain('recipient@example.com');
      expect(JSON.parse(text)).toMatchObject({
        deployments: [
          {
          displayDev: {
            mode: 'authenticated',
            shortId: 'owned1234',
            accessSettingsMissing: true,
          },
        },
        ],
      });
      expect(authorizeProjectRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'project-1',
        { mode: 'read' },
      );
      expect(api.fetchDisplayDevArtifactAccessSettings).not.toHaveBeenCalled();
    } finally {
      await api.close();
    }
  });

  it('requires writeFiles authority before hydrating display.dev deployment detail', async () => {
    const authorizeProjectRequest = vi.fn(
      async (_req, res: express.Response) => {
        res
          .status(403)
          .json({ error: { code: 'WORKSPACE_PROJECT_PERMISSION_DENIED' } });
        return false;
      },
    );
    const api = await startAuthorityServer({ authorizeProjectRequest });
    try {
      const response = await fetch(
        `${api.baseUrl}/api/projects/project-1/deployments/deployment-1`,
      );
      expect(response.status).toBe(403);
      expect(authorizeProjectRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'project-1',
        { mode: 'write', capability: 'writeFiles' },
      );
      expect(api.getDeploymentById).not.toHaveBeenCalled();
      expect(api.fetchDisplayDevArtifactAccessSettings).not.toHaveBeenCalled();
    } finally {
      await api.close();
    }
  });

  it('returns display.dev recipients to a write-authorized detail request', async () => {
    const authorizeProjectRequest = vi.fn(async () => true);
    const api = await startAuthorityServer({
      authorizeProjectRequest,
      fetchDisplayDevArtifactAccessSettings: async () => ({
        visibility: 'public',
        sharedWith: ['recipient@example.com'],
      }),
    });
    try {
      const response = await fetch(
        `${api.baseUrl}/api/projects/project-1/deployments/deployment-1`,
      );
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      await expect(response.json()).resolves.toMatchObject({
        displayDev: {
          mode: 'authenticated',
          shortId: 'owned1234',
          visibility: 'public',
          sharedWith: ['recipient@example.com'],
        },
      });
      expect(authorizeProjectRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'project-1',
        { mode: 'write', capability: 'writeFiles' },
      );
      expect(api.fetchDisplayDevArtifactAccessSettings).toHaveBeenCalledTimes(
        1,
      );
    } finally {
      await api.close();
    }
  });
});
