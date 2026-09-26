import type http from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  CLOUDFLARE_PAGES_PROVIDER_ID,
  CLOUDFLARE_WORKERS_PROVIDER_ID,
  cloudflarePagesProjectNameForProject,
  commitCloudflareOAuthMode,
  configureCloudflareWorkersDataDir,
  deployConfigPath,
  VERCEL_PROVIDER_ID,
  SAVED_CLOUDFLARE_TOKEN_MASK,
} from '../src/deploy.js';
import { getDeploymentById, openDatabase } from '../src/db.js';
import { configureCloudflareAccessPerimeterRetry } from '../src/deploy/cloudflare-workers.js';
import { isAccessProtectedWorkersRecord, isRetainedUnverifiedExposure } from '../src/routes/deploy.js';
import { ensureProject } from '../src/projects.js';
import { startServer } from '../src/server.js';

describe('deploy provider routes', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const started = await startServer({ port: 0, returnServer: true }) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

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
    } finally {
      if (priorStateRoot === undefined) delete process.env.OD_USER_STATE_DIR;
      else process.env.OD_USER_STATE_DIR = priorStateRoot;
      await rm(stateRoot, { recursive: true, force: true });
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

  it('derives Cloudflare Pages project names from the OpenDesign project', async () => {
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
      if (url.endsWith(`/pages/projects/${expectedPagesProject}/deployments`) && method === 'POST') {
        const form = init?.body as FormData;
        captureFormData.branch = form?.get('branch') as string | undefined ?? undefined;
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

  // The other half of the same telemetry contract: a failure the provider
  // rejected is classified by ITS HTTP status client-side (HTTP_403 /
  // HTTP_429 / HTTP_502), and the client only falls back to that status when
  // the envelope code is generic. So the provider catch-alls must NOT stamp a
  // structured code — doing so would fold auth, quota and upstream faults into
  // one bucket, which is coarser than what production already had.
  it('leaves a provider-rejected deploy on the generic envelope code so the client keeps status bucketing', async () => {
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
        expect(body.error?.code).toBe('BAD_REQUEST');
      } finally {
        vi.unstubAllGlobals();
      }
    } finally {
      if (priorStateRoot === undefined) delete process.env.OD_USER_STATE_DIR;
      else process.env.OD_USER_STATE_DIR = priorStateRoot;
      await rm(stateRoot, { recursive: true, force: true });
    }
  });

  // Additive failure detail: status and envelope code stay exactly as above,
  // and `error.failure` adds what that generic code cannot say.
  it('adds a closed-token failure detail without changing status or envelope code', async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'od-deploy-route-failure-detail-'));
    const priorStateRoot = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = stateRoot;
    try {
      const projectId = await setupProjectAndVercelConfig('failure-detail', 'Failure detail test');
      const realFetch = globalThis.fetch;
      let providerResponse: () => Promise<Response> = async () => { throw new Error('unset'); };
      vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url =
          typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
        if (url.startsWith(baseUrl)) return realFetch(input, init);
        if (url.includes('/v13/deployments')) return providerResponse();
        throw new Error(`Unexpected fetch: ${url}`);
      }));
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const deploy = async () => {
        const resp = await realFetch(`${baseUrl}/api/projects/${projectId}/deploy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-od-request-id': 'req-deploy-0001' },
          body: JSON.stringify({ fileName: 'index.html', providerId: VERCEL_PROVIDER_ID }),
        });
        return { status: resp.status, body: await resp.json() as { error?: Record<string, unknown> } };
      };
      try {
        providerResponse = async () => new Response(
          JSON.stringify({ error: { code: 'too_many_requests', message: 'Too many requests.' } }),
          { status: 429, headers: { 'content-type': 'application/json' } },
        );
        const rejected = await deploy();
        expect(rejected.status).toBe(429);
        expect(rejected.body.error?.code).toBe('BAD_REQUEST');
        expect(rejected.body.error?.failure).toEqual({
          stage: 'provider', reason: 'provider_rejected', upstreamStatus: 429, upstreamCode: 'too_many_requests',
        });

        providerResponse = async () => { throw new TypeError('fetch failed'); };
        const unreachable = await deploy();
        expect(unreachable.status).toBe(400);
        expect(unreachable.body.error?.code).toBe('BAD_REQUEST');
        expect(unreachable.body.error?.failure).toEqual({ stage: 'provider', reason: 'provider_unreachable' });

        providerResponse = async () => new Response(
          JSON.stringify({ error: { code: 'forbidden', message: 'Not authorized', invalidToken: true } }),
          { status: 403, headers: { 'content-type': 'application/json' } },
        );
        const tokenRejected = await deploy();
        expect(tokenRejected.status).toBe(403);
        expect(tokenRejected.body.error?.code).toBe('PROVIDER_FORBIDDEN');
        expect(tokenRejected.body.error?.failure).toEqual({
          stage: 'provider', reason: 'provider_token_invalid', upstreamStatus: 403, upstreamCode: 'forbidden',
        });

        const lines = warn.mock.calls
          .filter(([label]) => label === '[od] deploy failure')
          .map(([, json]) => JSON.parse(String(json)) as Record<string, unknown>);
        expect(lines.map((line) => line.reason)).toEqual([
          'provider_rejected', 'provider_unreachable', 'provider_token_invalid',
        ]);
        expect(lines.every((line) => line.requestId === 'req-deploy-0001' && line.providerId === VERCEL_PROVIDER_ID)).toBe(true);
      } finally {
        warn.mockRestore();
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

  it('rejects the Workers zones picker without an account id instead of listing every visible zone', async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'od-deploy-route-workers-zones-'));
    const priorStateRoot = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = stateRoot;
    configureCloudflareWorkersDataDir(stateRoot);
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url.startsWith(baseUrl)) return realFetchFor()(input, init);
      throw new Error(`Unexpected fetch: ${url}`);
    });
    const realFetch = globalThis.fetch;
    const realFetchFor = () => realFetch;
    vi.stubGlobal('fetch', fetchMock);
    try {
      const resp = await fetch(`${baseUrl}/api/deploy/cloudflare-workers/zones`);
      expect(resp.status).toBe(400);
      expect(await resp.json()).toMatchObject({ error: { code: 'CFW_ACCOUNT_ID_REQUIRED' } });
      // no Cloudflare call was made
      expect(fetchMock.mock.calls.every(([input]) => String(input instanceof Request ? input.url : input).startsWith(baseUrl))).toBe(true);
    } finally {
      vi.unstubAllGlobals();
      if (priorStateRoot === undefined) delete process.env.OD_USER_STATE_DIR;
      else process.env.OD_USER_STATE_DIR = priorStateRoot;
      await rm(stateRoot, { recursive: true, force: true });
    }
  });

  it('propagates an OAuth credential failure from the Workers routes instead of collapsing it to "not configured"', async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'od-deploy-route-workers-oauth-'));
    const priorStateRoot = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = stateRoot;
    configureCloudflareWorkersDataDir(stateRoot);
    try {
      const saveResp = await fetch(`${baseUrl}/api/deploy/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: CLOUDFLARE_WORKERS_PROVIDER_ID, token: 'tok', accountId: 'acct_test' }),
      });
      expect(saveResp.status).toBe(200);
      // Flip to oauth with no stored OAuth token: the credential resolver throws.
      await commitCloudflareOAuthMode();

      // The resolver throws 401 CFW_OAUTH_RECONNECT_REQUIRED; the routes used to
      // swallow it into `configured:false` / `zones:[]` / CFW_TOKEN_REQUIRED.
      const caps = await fetch(`${baseUrl}/api/deploy/cloudflare-workers/capabilities`);
      expect(caps.status).toBe(401);
      const capsBody = await caps.json() as { error: { code: string }; configured?: boolean };
      expect(capsBody.configured).toBeUndefined();
      expect(capsBody.error.code).toBe('CFW_OAUTH_RECONNECT_REQUIRED');

      const zones = await fetch(`${baseUrl}/api/deploy/cloudflare-workers/zones`);
      expect(zones.status).toBe(401);
      expect((await zones.json() as { error: { code: string } }).error.code).toBe('CFW_OAUTH_RECONNECT_REQUIRED');

      const del = await fetch(`${baseUrl}/api/deploy/cloudflare-workers/domains/dom-1`, { method: 'DELETE' });
      expect(del.status).toBe(401);
      expect((await del.json() as { error: { code: string } }).error.code).toBe('CFW_OAUTH_RECONNECT_REQUIRED');
    } finally {
      if (priorStateRoot === undefined) delete process.env.OD_USER_STATE_DIR;
      else process.env.OD_USER_STATE_DIR = priorStateRoot;
      await rm(stateRoot, { recursive: true, force: true });
    }
  });

  it('refuses to detach a Workers custom domain routed to another script (409, no DELETE sent)', async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'od-deploy-route-workers-domain-foreign-'));
    const priorStateRoot = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = stateRoot;
    configureCloudflareWorkersDataDir(stateRoot);
    try {
      const dataDir = process.env.OD_DATA_DIR;
      if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
      const projectId = `workers-domain-owner-${Date.now()}`;
      const dir = await ensureProject(path.join(dataDir, 'projects'), projectId);
      await writeFile(path.join(dir, 'index.html'), '<!doctype html><h1>Hello</h1>');
      expect((await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: projectId, name: 'Domain owner', skillId: null, designSystemId: null }),
      })).status).toBe(200);
      expect((await fetch(`${baseUrl}/api/deploy/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: CLOUDFLARE_WORKERS_PROVIDER_ID,
          token: 'tok',
          accountId: 'acct_test',
          scriptName: 'my-site',
          customDomain: { hostname: 'mine.example.com', zoneId: 'zone-1' },
        }),
      })).status).toBe(200);

      const realFetch = globalThis.fetch;
      const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
      const cfCalls: Array<{ url: string; method: string }> = [];
      const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
        if (url.startsWith(baseUrl)) return realFetch(input, init);
        const method = (init?.method || 'GET').toUpperCase();
        cfCalls.push({ url, method });
        // --- the recording deploy (attaches mine.example.com as dom-mine) ---
        if (method === 'HEAD') return new Response('', { status: 200 });
        if (url.endsWith('/workers/subdomain')) return json({ success: true, result: { subdomain: 'acct-test' } });
        if (url.includes('assets-upload-session')) return json({ success: true, result: { jwt: 'SESS', buckets: [] } });
        if (method === 'GET' && url.includes('/workers/domains?')) return json({ success: true, result: [] });
        if (method === 'PUT' && url.endsWith('/workers/domains')) return json({ success: true, result: { id: 'dom-mine' } });
        // --- the detach route ---
        if (method === 'GET' && url.includes('/workers/domains/dom-foreign')) {
          return json({ success: true, result: { id: 'dom-foreign', hostname: 'app.example.com', service: 'someone-elses-worker', zone_id: 'zone-1' } });
        }
        if (method === 'GET' && url.includes('/workers/domains/dom-dash')) {
          // Routed to OUR script, but attached in the dashboard: not ours to detach.
          return json({ success: true, result: { id: 'dom-dash', hostname: 'dash.example.com', service: 'my-site', zone_id: 'zone-1' } });
        }
        if (method === 'GET' && url.includes('/workers/domains/dom-mine')) {
          return json({ success: true, result: { id: 'dom-mine', hostname: 'mine.example.com', service: 'my-site', zone_id: 'zone-1' } });
        }
        if (method === 'GET' && url.includes('/workers/domains/dom-moved')) {
          // The hostname OUR deploy attached, but Cloudflare now routes this id
          // to another Worker: the vouching record deployed `my-site`, not that.
          return json({ success: true, result: { id: 'dom-moved', hostname: 'mine.example.com', service: 'someone-elses-worker', zone_id: 'zone-1' } });
        }
        if (method === 'DELETE' && url.includes('/workers/domains/dom-mine')) {
          return json({ success: true, result: { id: 'dom-mine' } });
        }
        if (url.includes('/workers/scripts/') && method === 'PUT') return json({ success: true, result: {} });
        if (url.includes('/subdomain') && method === 'POST') return json({ success: true, result: { enabled: true } });
        // The deploy reads the script's modified_on before its PUT and the
        // workers.dev config before replacing it.
        if (method === 'GET' && url.includes('/workers/scripts?')) return json({ success: true, result: [] });
        if (method === 'GET' && url.endsWith('/subdomain')) return json({ success: true, result: { enabled: false, previews_enabled: false } });
        throw new Error(`Unexpected Cloudflare fetch: ${method} ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);
      try {
        // Before any OpenDesign deploy recorded it, even a hostname routed to
        // our script is not ours: the ownership rule is "we attached it".
        const unrecorded = await fetch(`${baseUrl}/api/deploy/cloudflare-workers/domains/dom-mine`, { method: 'DELETE' });
        expect(unrecorded.status).toBe(409);
        expect((await unrecorded.json() as { error: { code: string } }).error.code).toBe('CFW_DOMAIN_FOREIGN');

        // A real deploy attaches mine.example.com and records dom-mine as owned.
        const deployResp = await fetch(`${baseUrl}/api/projects/${projectId}/deploy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: 'index.html', providerId: CLOUDFLARE_WORKERS_PROVIDER_ID }),
        });
        expect(deployResp.status).toBe(200);
        expect((await deployResp.json() as { cloudflareWorkers: { customDomain: unknown } }).cloudflareWorkers.customDomain).toMatchObject({ hostname: 'mine.example.com' });

        const foreign = await fetch(`${baseUrl}/api/deploy/cloudflare-workers/domains/dom-foreign`, { method: 'DELETE' });
        expect(foreign.status).toBe(409);
        expect((await foreign.json() as { error: { code: string } }).error.code).toBe('CFW_DOMAIN_FOREIGN');

        const dashboard = await fetch(`${baseUrl}/api/deploy/cloudflare-workers/domains/dom-dash`, { method: 'DELETE' });
        expect(dashboard.status).toBe(409);
        expect((await dashboard.json() as { error: { code: string; message: string } }).error).toMatchObject({
          code: 'CFW_DOMAIN_FOREIGN',
          message: expect.stringContaining('not attached by an OpenDesign deployment'),
        });
        expect(cfCalls.some((c) => c.method === 'DELETE')).toBe(false);

        // A record vouches for the hostname, but the domain is routed to a
        // Worker that record never deployed: the vouching record's script must
        // be the domain's service, or the id is not ours to detach.
        const moved = await fetch(`${baseUrl}/api/deploy/cloudflare-workers/domains/dom-moved`, { method: 'DELETE' });
        expect(moved.status).toBe(409);
        expect((await moved.json() as { error: { code: string } }).error.code).toBe('CFW_DOMAIN_FOREIGN');
        expect(cfCalls.some((c) => c.method === 'DELETE')).toBe(false);

        // The configured script is renamed. mine.example.com stays routed to
        // the OLD script, and the record that attached it recorded that
        // script — so it stays detachable. Comparing against the CURRENT
        // config's script (`renamed-site`) stranded every hostname of the old
        // one with no way to remove it here.
        expect((await fetch(`${baseUrl}/api/deploy/config`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            providerId: CLOUDFLARE_WORKERS_PROVIDER_ID,
            token: 'tok',
            accountId: 'acct_test',
            scriptName: 'renamed-site',
            customDomain: { hostname: 'mine.example.com', zoneId: 'zone-1' },
          }),
        })).status).toBe(200);

        // Same route, the domain the OpenDesign deploy attached: detached.
        const mine = await fetch(`${baseUrl}/api/deploy/cloudflare-workers/domains/dom-mine`, { method: 'DELETE' });
        expect(mine.status).toBe(200);
        expect(await mine.json()).toEqual({ ok: true });
        expect(cfCalls.filter((c) => c.method === 'DELETE').map((c) => c.url)).toEqual([
          expect.stringContaining('/workers/domains/dom-mine'),
        ]);

        // Ownership goes with the attachment: the record stops vouching for
        // (and displaying) the hostname, so when the same hostname is attached
        // again from the dashboard it is foreign — not re-detached as "owned".
        const after = await (await fetch(`${baseUrl}/api/projects/${projectId}/deployments`)).json() as {
          deployments: Array<{ providerId: string; cloudflareWorkers?: { customDomain?: unknown } }>;
        };
        const record = after.deployments.find((d) => d.providerId === CLOUDFLARE_WORKERS_PROVIDER_ID);
        expect(record).toBeTruthy();
        expect(record?.cloudflareWorkers?.customDomain).toBeUndefined();
        const reattached = await fetch(`${baseUrl}/api/deploy/cloudflare-workers/domains/dom-mine`, { method: 'DELETE' });
        expect(reattached.status).toBe(409);
        expect((await reattached.json() as { error: { code: string } }).error.code).toBe('CFW_DOMAIN_FOREIGN');
        expect(cfCalls.filter((c) => c.method === 'DELETE')).toHaveLength(1);
      } finally {
        vi.unstubAllGlobals();
      }
    } finally {
      if (priorStateRoot === undefined) delete process.env.OD_USER_STATE_DIR;
      else process.env.OD_USER_STATE_DIR = priorStateRoot;
      await rm(stateRoot, { recursive: true, force: true });
    }
  });

  it('serves the Workers config route with CFW_CONFIG_CORRUPT when the file is unparsable, instead of a 500 on every route', async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'od-deploy-route-workers-corrupt-'));
    const priorStateRoot = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = stateRoot;
    configureCloudflareWorkersDataDir(stateRoot);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await mkdir(path.dirname(deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID)), { recursive: true });
      await writeFile(deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID), '{"token": "tok",', 'utf8');
      const getResp = await fetch(`${baseUrl}/api/deploy/config?providerId=${CLOUDFLARE_WORKERS_PROVIDER_ID}`);
      expect(getResp.status).toBe(200);
      expect(await getResp.json()).toMatchObject({ providerId: CLOUDFLARE_WORKERS_PROVIDER_ID, configured: false, configError: 'CFW_CONFIG_CORRUPT' });
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('CFW_CONFIG_CORRUPT'));
      const caps = await fetch(`${baseUrl}/api/deploy/cloudflare-workers/capabilities`);
      expect(caps.status).toBe(200);
      expect(await caps.json()).toMatchObject({ configured: false });
      // Saving the settings again heals the file.
      const saveResp = await fetch(`${baseUrl}/api/deploy/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: CLOUDFLARE_WORKERS_PROVIDER_ID, token: 'tok', accountId: 'acct_test' }),
      });
      expect(saveResp.status).toBe(200);
      const healed = await (await fetch(`${baseUrl}/api/deploy/config?providerId=${CLOUDFLARE_WORKERS_PROVIDER_ID}`)).json() as Record<string, unknown>;
      expect(healed).toMatchObject({ configured: true });
      expect(healed).not.toHaveProperty('configError');
    } finally {
      errorSpy.mockRestore();
      if (priorStateRoot === undefined) delete process.env.OD_USER_STATE_DIR;
      else process.env.OD_USER_STATE_DIR = priorStateRoot;
      await rm(stateRoot, { recursive: true, force: true });
    }
  });
  it('surfaces the Workers result as cloudflareWorkers on the deploy response and the deployments list (through the real db)', async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'od-deploy-route-workers-lift-'));
    const priorStateRoot = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = stateRoot;
    configureCloudflareWorkersDataDir(stateRoot);
    try {
      const dataDir = process.env.OD_DATA_DIR;
      if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
      const projectId = `workers-lift-${Date.now()}`;
      const dir = await ensureProject(path.join(dataDir, 'projects'), projectId);
      await writeFile(path.join(dir, 'index.html'), '<!doctype html><h1>Hello</h1>');
      expect((await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: projectId, name: 'Workers lift', skillId: null, designSystemId: null }),
      })).status).toBe(200);
      expect((await fetch(`${baseUrl}/api/deploy/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: CLOUDFLARE_WORKERS_PROVIDER_ID, token: 'tok', accountId: 'acct_test', scriptName: 'lift-check' }),
      })).status).toBe(200);

      const realFetch = globalThis.fetch;
      const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
      const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
        if (url.startsWith(baseUrl)) return realFetch(input, init);
        const method = (init?.method || 'GET').toUpperCase();
        // The post-deploy probe answers 503: the Worker is live but erroring.
        if (method === 'HEAD') return new Response('', { status: 503 });
        if (url.endsWith('/workers/subdomain')) return json({ success: true, result: { subdomain: 'acct-test' } });
        if (url.includes('assets-upload-session')) return json({ success: true, result: { jwt: 'SESS', buckets: [] } });
        if (method === 'GET' && url.includes('/workers/domains')) return json({ success: true, result: [] });
        return json({ success: true, result: {} });
      });
      vi.stubGlobal('fetch', fetchMock);
      try {
        const resp = await fetch(`${baseUrl}/api/projects/${projectId}/deploy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: 'index.html', providerId: CLOUDFLARE_WORKERS_PROVIDER_ID }),
        });
        expect(resp.status).toBe(200);
        const body = await resp.json() as Record<string, unknown>;
        expect(body.providerMetadata).toBeUndefined();
        expect(body.cloudflareWorkers).toMatchObject({
          check: { status: 503, ok: false, detail: 'worker-runtime-error' },
        });
        const steps = (body.cloudflareWorkers as { steps: Array<{ name: string }> }).steps.map((s) => s.name);
        expect(steps).toEqual(expect.arrayContaining(['assets', 'script', 'subdomain']));

        const listResp = await fetch(`${baseUrl}/api/projects/${projectId}/deployments`);
        expect(listResp.status).toBe(200);
        const list = await listResp.json() as { deployments: Array<Record<string, unknown>> };
        const workers = list.deployments.find((d) => d.providerId === CLOUDFLARE_WORKERS_PROVIDER_ID);
        expect(workers?.providerMetadata).toBeUndefined();
        expect(workers?.cloudflareWorkers).toMatchObject({ check: { status: 503, detail: 'worker-runtime-error' } });
      } finally {
        vi.unstubAllGlobals();
      }
    } finally {
      if (priorStateRoot === undefined) delete process.env.OD_USER_STATE_DIR;
      else process.env.OD_USER_STATE_DIR = priorStateRoot;
      await rm(stateRoot, { recursive: true, force: true });
    }
  });

  it('records the Access app a failed Workers deploy created, so the next deploy owns it instead of hitting CFW_ACCESS_APP_FOREIGN', async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'od-deploy-route-workers-access-orphan-'));
    const priorStateRoot = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = stateRoot;
    configureCloudflareWorkersDataDir(stateRoot);
    try {
      const dataDir = process.env.OD_DATA_DIR;
      if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
      const projectId = `workers-access-orphan-${Date.now()}`;
      const dir = await ensureProject(path.join(dataDir, 'projects'), projectId);
      await writeFile(path.join(dir, 'index.html'), '<!doctype html><h1>Hello</h1>');
      expect((await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: projectId, name: 'Workers access orphan', skillId: null, designSystemId: null }),
      })).status).toBe(200);
      expect((await fetch(`${baseUrl}/api/deploy/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: CLOUDFLARE_WORKERS_PROVIDER_ID,
          token: 'tok',
          accountId: 'acct_test',
          scriptName: 'access-orphan',
          access: { enabled: true, rule: { kind: 'emails', emails: ['a@b.c'] } },
        }),
      })).status).toBe(200);

      const realFetch = globalThis.fetch;
      const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
      let subdomainEnableFails = true;
      // The app list AFTER creation: the user renamed the app, so only the
      // recorded id (not the name marker) proves OpenDesign owns it.
      let listedApps: unknown[] = [];
      let appPosts = 0;
      let appPuts = 0;
      const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
        if (url.startsWith(baseUrl)) return realFetch(input, init);
        const method = (init?.method || 'GET').toUpperCase();
        if (method === 'HEAD') {
          return new Response('', { status: 302, headers: { location: 'https://acct-test.cloudflareaccess.com/cdn-cgi/access/login' } });
        }
        if (url.endsWith('/workers/subdomain')) return json({ success: true, result: { subdomain: 'acct-test' } });
        if (url.includes('assets-upload-session')) return json({ success: true, result: { jwt: 'SESS', buckets: [] } });
        if (method === 'GET' && url.includes('/workers/domains')) return json({ success: true, result: [] });
        if (method === 'POST' && url.endsWith('/workers/scripts/access-orphan/subdomain')) {
          if (subdomainEnableFails) {
            subdomainEnableFails = false;
            return json({ success: false, errors: [{ message: 'workers.dev enable unavailable' }] }, 500);
          }
          return json({ success: true, result: { enabled: true } });
        }
        if (method === 'PUT' && url.endsWith('/workers/scripts/access-orphan')) return json({ success: true, result: {} });
        if (url.includes('/workers/scripts')) return json({ success: true, result: [{ id: 'access-orphan', tag: 'tag-orphan' }] });
        if (url.includes('/access/identity_providers')) return json({ success: true, result: [{ id: 'otp-1', type: 'onetimepin', name: 'One-time PIN login' }] });
        if (url.includes('/access/apps/')) {
          if (method === 'PUT') {
            appPuts += 1;
            return json({ success: true, result: { id: 'app-orphan' } });
          }
          return json({ success: true, result: { id: 'app-orphan', destinations: [{ type: 'worker', worker_id: 'tag-orphan' }] } });
        }
        if (url.includes('/access/apps')) {
          if (method === 'POST') {
            appPosts += 1;
            listedApps = [{ id: 'app-orphan', name: 'Renamed by user', destinations: [{ type: 'worker', worker_id: 'tag-orphan' }] }];
            return json({ success: true, result: { id: 'app-orphan' } });
          }
          return json({ success: true, result: listedApps });
        }
        return json({ success: true, result: {} });
      });
      vi.stubGlobal('fetch', fetchMock);
      try {
        const body = JSON.stringify({ fileName: 'index.html', providerId: CLOUDFLARE_WORKERS_PROVIDER_ID });
        const first = await fetch(`${baseUrl}/api/projects/${projectId}/deploy`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
        expect(first.status).toBeGreaterThanOrEqual(500);
        expect(appPosts).toBe(1);

        // The failed attempt left a record that carries the app it created.
        const listResp = await fetch(`${baseUrl}/api/projects/${projectId}/deployments`);
        const list = await listResp.json() as { deployments: Array<Record<string, unknown>> };
        const orphaned = list.deployments.find((d) => d.providerId === CLOUDFLARE_WORKERS_PROVIDER_ID);
        expect(orphaned).toMatchObject({
          status: 'failed',
          cloudflareWorkers: { accessAppId: 'app-orphan', createdByOpenDesign: true },
        });
        // Ownership only: the failed attempt never gated the Worker, so it
        // must not pose as an Access deploy (which a link check could then
        // "verify" and promote to ready).
        expect((orphaned?.cloudflareWorkers as Record<string, unknown>).accessProtected).toBeUndefined();
        expect((orphaned?.cloudflareWorkers as Record<string, unknown>).accessVerified).toBeUndefined();
        expect(isAccessProtectedWorkersRecord({ providerMetadata: orphaned?.cloudflareWorkers })).toBe(false);

        // The retry updates OUR app in place instead of refusing it as foreign.
        const second = await fetch(`${baseUrl}/api/projects/${projectId}/deploy`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
        expect(second.status).toBe(200);
        const secondBody = await second.json() as Record<string, unknown>;
        expect(secondBody.cloudflareWorkers).toMatchObject({ accessProtected: true, accessAppId: 'app-orphan' });
        expect(secondBody.status).toBe('ready');
        expect(appPosts).toBe(1);
        expect(appPuts).toBe(1);
      } finally {
        vi.unstubAllGlobals();
      }
    } finally {
      if (priorStateRoot === undefined) delete process.env.OD_USER_STATE_DIR;
      else process.env.OD_USER_STATE_DIR = priorStateRoot;
      await rm(stateRoot, { recursive: true, force: true });
    }
  });

  it('a failed Workers deploy still reports the deploy error when its ownership bookkeeping cannot run', async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'od-deploy-route-workers-bookkeeping-'));
    const priorStateRoot = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = stateRoot;
    configureCloudflareWorkersDataDir(stateRoot);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const dataDir = process.env.OD_DATA_DIR;
      if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
      const stamp = Date.now();
      const projectId = `workers-bookkeeping-${stamp}`;
      const scriptName = `bookkeeping-${stamp}`;
      const dir = await ensureProject(path.join(dataDir, 'projects'), projectId);
      await writeFile(path.join(dir, 'index.html'), '<!doctype html><h1>Hello</h1>');
      expect((await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: projectId, name: 'Workers bookkeeping', skillId: null, designSystemId: null }),
      })).status).toBe(200);
      // Access on: the attempt creates the Access app and then fails, which is
      // exactly the failure shape whose ownership record the route persists.
      expect((await fetch(`${baseUrl}/api/deploy/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: CLOUDFLARE_WORKERS_PROVIDER_ID,
          token: 'tok',
          accountId: 'acct_test',
          scriptName,
          access: { enabled: true, rule: { kind: 'emails', emails: ['a@b.c'] } },
        }),
      })).status).toBe(200);

      const db = openDatabase(process.cwd(), { dataDir });
      // The deployments table goes unreadable mid-deploy: the failed-deploy
      // bookkeeping reads the record it is about to rewrite, so the whole
      // bookkeeping transaction fails.
      const dbProto = Object.getPrototypeOf(db) as { prepare: (sql: string) => unknown };
      const realPrepare = dbProto.prepare;
      let bookkeepingReadsFail = false;
      const prepareSpy = vi.spyOn(dbProto, 'prepare').mockImplementation(function (this: unknown, sql: string) {
        if (bookkeepingReadsFail && /from deployments/i.test(sql)) throw new Error('database is locked (test)');
        return realPrepare.call(this, sql);
      });

      const realFetch = globalThis.fetch;
      const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
      const cloudflareDown = () => json({ success: false, errors: [{ message: 'cloudflare unavailable (test)' }] }, 500);
      let release: () => void = () => {};
      const held = new Promise<void>((resolve) => { release = resolve; });
      let heldOnce = false;
      const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
        if (url.startsWith(baseUrl)) return realFetch(input, init);
        const method = (init?.method || 'GET').toUpperCase();
        if (method === 'HEAD') return new Response('', { status: 200 });
        if (!heldOnce) {
          // Hold the deploy at its first Cloudflare call, so the table can be
          // taken out from under it while the deploy is still in flight.
          heldOnce = true;
          await held;
        }
        if (url.endsWith('/workers/subdomain')) return json({ success: true, result: { subdomain: 'acct-test' } });
        if (url.includes('assets-upload-session')) return json({ success: true, result: { jwt: 'SESS', buckets: [] } });
        if (method === 'GET' && url.includes('/workers/domains')) return json({ success: true, result: [] });
        if (url.includes('/access/identity_providers')) return json({ success: true, result: [{ id: 'otp-1', type: 'onetimepin', name: 'One-time PIN login' }] });
        // Everything from the Access app onwards fails: the app is created
        // first, so the error carries the app id the route must record. A
        // lookup is served (it is not the failure under test) — what fails is
        // the attach PUT, and the workers.dev enable after it.
        if (url.includes('/access/apps/')) {
          if (method === 'PUT') return cloudflareDown();
          return json({ success: true, result: { id: 'app-bookkeeping', destinations: [{ type: 'worker', worker_id: 'tag-b' }] } });
        }
        if (url.includes('/access/apps')) {
          if (method === 'POST') return json({ success: true, result: { id: 'app-bookkeeping' } });
          return json({ success: true, result: [] });
        }
        if (method === 'PUT' && url.endsWith('/workers/scripts/' + scriptName)) return json({ success: true, result: {} });
        if (url.endsWith('/workers/scripts/' + scriptName + '/subdomain')) return cloudflareDown();
        if (url.includes('/workers/scripts')) return json({ success: true, result: [{ id: scriptName, tag: 'tag-b' }] });
        return json({ success: true, result: {} });
      });
      vi.stubGlobal('fetch', fetchMock);
      try {
        const body = JSON.stringify({ fileName: 'index.html', providerId: CLOUDFLARE_WORKERS_PROVIDER_ID });
        const deploying = fetch(`${baseUrl}/api/projects/${projectId}/deploy`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
        await new Promise((resolve) => setTimeout(resolve, 150));
        bookkeepingReadsFail = true;
        release();

        const resp = await deploying;
        prepareSpy.mockRestore();
        expect(resp.status).toBeGreaterThanOrEqual(500);
        const failureBody = await resp.json() as { error: { code: string; message: string } };
        // The DEPLOY error reaches the client. Without the guard the bookkeeping
        // failure replaces it — a generic error, which this route answers as a
        // 400 carrying its own message.
        expect(failureBody.error.message).toContain('cloudflare unavailable (test)');
        expect(JSON.stringify(failureBody)).not.toContain('database is locked');
        expect(warnSpy.mock.calls.some(([message]) => String(message).includes('failed-deploy bookkeeping'))).toBe(true);
      } finally {
        prepareSpy.mockRestore();
        vi.unstubAllGlobals();
      }
    } finally {
      warnSpy.mockRestore();
      if (priorStateRoot === undefined) delete process.env.OD_USER_STATE_DIR;
      else process.env.OD_USER_STATE_DIR = priorStateRoot;
      await rm(stateRoot, { recursive: true, force: true });
    }
  });

  it('a failed Workers deploy records the script it targeted, so a later deploy of a different script does not adopt its Access app', async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'od-deploy-route-workers-failed-scriptname-'));
    const priorStateRoot = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = stateRoot;
    configureCloudflareWorkersDataDir(stateRoot);
    try {
      const dataDir = process.env.OD_DATA_DIR;
      if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
      const projectId = `workers-failed-scriptname-${Date.now()}`;
      const dir = await ensureProject(path.join(dataDir, 'projects'), projectId);
      await writeFile(path.join(dir, 'index.html'), '<!doctype html><h1>A</h1>');
      await writeFile(path.join(dir, 'b.html'), '<!doctype html><h1>B</h1>');
      expect((await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: projectId, name: 'Workers failed scriptname', skillId: null, designSystemId: null }),
      })).status).toBe(200);
      const saveConfig = async (scriptName: string) => {
        expect((await fetch(`${baseUrl}/api/deploy/config`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            providerId: CLOUDFLARE_WORKERS_PROVIDER_ID,
            token: 'tok',
            accountId: 'acct_test',
            scriptName,
            access: { enabled: true, rule: { kind: 'emails', emails: ['a@b.c'] } },
          }),
        })).status).toBe(200);
      };
      await saveConfig('orphan-a');

      const realFetch = globalThis.fetch;
      const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
      let subdomainEnableFails = true;
      const listedApps: unknown[] = [];
      let appPosts = 0;
      let appPuts = 0;
      const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
        if (url.startsWith(baseUrl)) return realFetch(input, init);
        const method = (init?.method || 'GET').toUpperCase();
        if (method === 'HEAD') {
          return new Response('', { status: 302, headers: { location: 'https://acct-test.cloudflareaccess.com/cdn-cgi/access/login' } });
        }
        if (url.endsWith('/workers/subdomain')) return json({ success: true, result: { subdomain: 'acct-test' } });
        if (url.includes('assets-upload-session')) return json({ success: true, result: { jwt: 'SESS', buckets: [] } });
        if (method === 'GET' && url.includes('/workers/domains')) return json({ success: true, result: [] });
        if (method === 'POST' && /\/workers\/scripts\/orphan-[ab]\/subdomain$/.test(url)) {
          if (subdomainEnableFails) {
            subdomainEnableFails = false;
            return json({ success: false, errors: [{ message: 'workers.dev enable unavailable' }] }, 500);
          }
          return json({ success: true, result: { enabled: true } });
        }
        if (method === 'PUT' && /\/workers\/scripts\/orphan-[ab]$/.test(url)) return json({ success: true, result: {} });
        if (url.includes('/workers/scripts')) {
          return json({ success: true, result: [{ id: 'orphan-a', tag: 'tag-a' }, { id: 'orphan-b', tag: 'tag-b' }] });
        }
        if (url.includes('/access/identity_providers')) return json({ success: true, result: [{ id: 'otp-1', type: 'onetimepin', name: 'One-time PIN login' }] });
        if (url.includes('/access/apps/')) {
          if (method === 'PUT') {
            appPuts += 1;
            return json({ success: true, result: { id: 'app-1' } });
          }
          return json({ success: true, result: { id: 'app-1', destinations: [{ type: 'worker', worker_id: 'tag-a' }] } });
        }
        if (url.includes('/access/apps')) {
          if (method === 'POST') {
            appPosts += 1;
            const id = `app-${appPosts}`;
            listedApps.push({ id, name: 'Renamed by user', destinations: [{ type: 'worker', worker_id: appPosts === 1 ? 'tag-a' : 'tag-b' }] });
            return json({ success: true, result: { id } });
          }
          return json({ success: true, result: listedApps });
        }
        return json({ success: true, result: {} });
      });
      vi.stubGlobal('fetch', fetchMock);
      try {
        // Deploy A to script `orphan-a`: the Access app is created, then the
        // workers.dev enable fails. The failed record must remember it targeted
        // `orphan-a` — the script name is the join key the sibling scan uses.
        const first = await fetch(`${baseUrl}/api/projects/${projectId}/deploy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: 'index.html', providerId: CLOUDFLARE_WORKERS_PROVIDER_ID }),
        });
        expect(first.status).toBeGreaterThanOrEqual(500);
        expect(appPosts).toBe(1);

        // The global override now points every deploy at `orphan-b`. Without a
        // recorded script name, A's record would re-resolve to `orphan-b` and be
        // counted as a sibling of B — handing B the app that guards `orphan-a`.
        await saveConfig('orphan-b');
        const second = await fetch(`${baseUrl}/api/projects/${projectId}/deploy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: 'b.html', providerId: CLOUDFLARE_WORKERS_PROVIDER_ID }),
        });
        expect(second.status).toBe(200);
        const secondBody = await second.json() as Record<string, unknown>;
        expect(secondBody.cloudflareWorkers).toMatchObject({ accessProtected: true, accessAppId: 'app-2' });
        expect(appPosts).toBe(2);
        expect(appPuts).toBe(0);
      } finally {
        vi.unstubAllGlobals();
      }
    } finally {
      if (priorStateRoot === undefined) delete process.env.OD_USER_STATE_DIR;
      else process.env.OD_USER_STATE_DIR = priorStateRoot;
      await rm(stateRoot, { recursive: true, force: true });
    }
  });

  it('records the custom hostname a failed Workers deploy attached as owned, so a later detach is not refused as foreign', async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'od-deploy-route-workers-domain-orphan-'));
    const priorStateRoot = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = stateRoot;
    configureCloudflareWorkersDataDir(stateRoot);
    try {
      const dataDir = process.env.OD_DATA_DIR;
      if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
      const projectId = `workers-domain-orphan-${Date.now()}`;
      const dir = await ensureProject(path.join(dataDir, 'projects'), projectId);
      await writeFile(path.join(dir, 'index.html'), '<!doctype html><h1>Hello</h1>');
      expect((await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: projectId, name: 'Domain orphan', skillId: null, designSystemId: null }),
      })).status).toBe(200);
      const putConfig = async (hostname: string) => {
        expect((await fetch(`${baseUrl}/api/deploy/config`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            providerId: CLOUDFLARE_WORKERS_PROVIDER_ID,
            token: 'tok',
            accountId: 'acct_test',
            scriptName: 'my-site',
            customDomain: { hostname, zoneId: 'zone-1' },
          }),
        })).status).toBe(200);
      };
      await putConfig('old.example.com');

      const realFetch = globalThis.fetch;
      const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
      // What Cloudflare routes to the script right now, and whether the stale
      // hostname's detach goes through.
      let routed: Array<Record<string, string>> = [];
      let detachFails = false;
      const cfCalls: Array<{ url: string; method: string }> = [];
      const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
        if (url.startsWith(baseUrl)) return realFetch(input, init);
        const method = (init?.method || 'GET').toUpperCase();
        cfCalls.push({ url, method });
        if (method === 'HEAD') return new Response('', { status: 200 });
        if (url.endsWith('/workers/subdomain')) return json({ success: true, result: { subdomain: 'acct-test' } });
        if (url.includes('assets-upload-session')) return json({ success: true, result: { jwt: 'SESS', buckets: [] } });
        if (method === 'GET' && url.includes('/workers/domains?')) return json({ success: true, result: routed });
        if (method === 'PUT' && url.endsWith('/workers/domains')) {
          const body = JSON.parse(String(init?.body)) as { hostname: string };
          const id = body.hostname === 'old.example.com' ? 'dom-old' : 'dom-new';
          routed = [...routed.filter((d) => d.hostname !== body.hostname), { id, hostname: body.hostname, service: 'my-site', zone_id: 'zone-1' }];
          return json({ success: true, result: { id } });
        }
        if (method === 'GET' && /\/workers\/domains\/dom-(old|new)$/.test(url)) {
          const id = url.endsWith('dom-old') ? 'dom-old' : 'dom-new';
          const hostname = id === 'dom-old' ? 'old.example.com' : 'new.example.com';
          return json({ success: true, result: { id, hostname, service: 'my-site', zone_id: 'zone-1' } });
        }
        if (method === 'DELETE' && url.includes('/workers/domains/')) {
          if (detachFails) return json({ success: false, errors: [{ message: 'detach denied' }] }, 500);
          return json({ success: true, result: null });
        }
        if (url.includes('/workers/scripts/') && method === 'PUT') return json({ success: true, result: {} });
        if (url.includes('/subdomain') && method === 'POST') return json({ success: true, result: { enabled: true } });
        // The deploy reads the script's modified_on before its PUT and the
        // workers.dev config before replacing it.
        if (method === 'GET' && url.includes('/workers/scripts?')) return json({ success: true, result: [] });
        if (method === 'GET' && url.endsWith('/subdomain')) return json({ success: true, result: { enabled: false, previews_enabled: false } });
        throw new Error(`Unexpected Cloudflare fetch: ${method} ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);
      try {
        const body = JSON.stringify({ fileName: 'index.html', providerId: CLOUDFLARE_WORKERS_PROVIDER_ID });
        // A successful deploy attaches old.example.com and records it as owned.
        const first = await fetch(`${baseUrl}/api/projects/${projectId}/deploy`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
        expect(first.status).toBe(200);

        // The hostname changes. The next deploy attaches new.example.com, then
        // fails on the detach of the now-stale old.example.com: the attach
        // already happened, so new.example.com is routed to the script.
        await putConfig('new.example.com');
        detachFails = true;
        const second = await fetch(`${baseUrl}/api/projects/${projectId}/deploy`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
        expect(second.status).toBeGreaterThanOrEqual(400);
        expect(cfCalls.some((c) => c.method === 'PUT' && c.url.endsWith('/workers/domains'))).toBe(true);

        // Both hostnames are ours: the one the failed deploy attached AND the
        // one the prior deploy owned (a failed deploy never disowns anything).
        detachFails = false;
        const before = cfCalls.filter((c) => c.method === 'DELETE').length;
        const detachNew = await fetch(`${baseUrl}/api/deploy/cloudflare-workers/domains/dom-new?projectId=${encodeURIComponent(projectId)}`, { method: 'DELETE' });
        expect(detachNew.status).toBe(200);
        expect(await detachNew.json()).toEqual({ ok: true });
        const detachOld = await fetch(`${baseUrl}/api/deploy/cloudflare-workers/domains/dom-old?projectId=${encodeURIComponent(projectId)}`, { method: 'DELETE' });
        expect(detachOld.status).toBe(200);
        expect(cfCalls.filter((c) => c.method === 'DELETE').slice(before).map((c) => c.url)).toEqual([
          expect.stringContaining('/workers/domains/dom-new'),
          expect.stringContaining('/workers/domains/dom-old'),
        ]);
      } finally {
        vi.unstubAllGlobals();
      }
    } finally {
      if (priorStateRoot === undefined) delete process.env.OD_USER_STATE_DIR;
      else process.env.OD_USER_STATE_DIR = priorStateRoot;
      await rm(stateRoot, { recursive: true, force: true });
    }
  });

  it('a failed Workers deploy stops vouching for the stale hostnames it detached, and keeps vouching for the one it could not', async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'od-deploy-route-workers-detach-forget-'));
    const priorStateRoot = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = stateRoot;
    configureCloudflareWorkersDataDir(stateRoot);
    try {
      const dataDir = process.env.OD_DATA_DIR;
      if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
      const projectId = `workers-detach-forget-${Date.now()}`;
      const dir = await ensureProject(path.join(dataDir, 'projects'), projectId);
      await writeFile(path.join(dir, 'index.html'), '<!doctype html><h1>Hello</h1>');
      expect((await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: projectId, name: 'Workers detach-forget', skillId: null, designSystemId: null }),
      })).status).toBe(200);
      const putConfig = async (hostname: string) => {
        expect((await fetch(`${baseUrl}/api/deploy/config`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            providerId: CLOUDFLARE_WORKERS_PROVIDER_ID,
            token: 'tok',
            accountId: 'acct_test',
            scriptName: 'my-site',
            customDomain: { hostname, zoneId: 'zone-1' },
          }),
        })).status).toBe(200);
      };
      const realFetch = globalThis.fetch;
      const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
      const idFor = (hostname: string) => 'dom-' + hostname.split('.')[0];
      const hostnameFor = (id: string) => id.replace(/^dom-/, '') + '.example.com';
      // What Cloudflare routes to the script right now; detaches that are
      // refused; whether an attach lands but its response is lost.
      let routed: Array<Record<string, string>> = [];
      const detachFailsFor = new Set<string>();
      let attachResponseLost = false;
      const cfCalls: Array<{ url: string; method: string }> = [];
      const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
        if (url.startsWith(baseUrl)) return realFetch(input, init);
        const method = (init?.method || 'GET').toUpperCase();
        cfCalls.push({ url, method });
        if (method === 'HEAD') return new Response('', { status: 200 });
        if (url.endsWith('/workers/subdomain')) return json({ success: true, result: { subdomain: 'acct-test' } });
        if (url.includes('assets-upload-session')) return json({ success: true, result: { jwt: 'SESS', buckets: [] } });
        if (method === 'GET' && url.includes('/workers/domains?')) return json({ success: true, result: routed });
        if (method === 'PUT' && url.endsWith('/workers/domains')) {
          const body = JSON.parse(String(init?.body)) as { hostname: string };
          const id = idFor(body.hostname);
          routed = [...routed.filter((d) => d.hostname !== body.hostname), { id, hostname: body.hostname, service: 'my-site', zone_id: 'zone-1' }];
          if (attachResponseLost) return json({ success: false, errors: [{ message: 'attach response lost' }] }, 500);
          return json({ success: true, result: { id } });
        }
        const single = /\/workers\/domains\/(dom-[a-z]+)$/.exec(url);
        if (method === 'GET' && single) {
          const id = single[1]!;
          return json({ success: true, result: { id, hostname: hostnameFor(id), service: 'my-site', zone_id: 'zone-1' } });
        }
        if (method === 'DELETE' && single) {
          const id = single[1]!;
          if (detachFailsFor.has(id)) return json({ success: false, errors: [{ message: 'detach denied' }] }, 500);
          routed = routed.filter((d) => d.id !== id);
          return json({ success: true, result: null });
        }
        if (url.includes('/workers/scripts/') && method === 'PUT') return json({ success: true, result: {} });
        if (url.includes('/subdomain') && method === 'POST') return json({ success: true, result: { enabled: true } });
        // The deploy reads the script's modified_on before its PUT and the
        // workers.dev config before replacing it.
        if (method === 'GET' && url.includes('/workers/scripts?')) return json({ success: true, result: [] });
        if (method === 'GET' && url.endsWith('/subdomain')) return json({ success: true, result: { enabled: false, previews_enabled: false } });
        throw new Error(`Unexpected Cloudflare fetch: ${method} ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);
      const deployBody = JSON.stringify({ fileName: 'index.html', providerId: CLOUDFLARE_WORKERS_PROVIDER_ID });
      const deploy = () => fetch(`${baseUrl}/api/projects/${projectId}/deploy`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: deployBody });
      const detachRoute = (id: string) => fetch(`${baseUrl}/api/deploy/cloudflare-workers/domains/${id}?projectId=${encodeURIComponent(projectId)}`, { method: 'DELETE' });
      try {
        // a.example.com: attached and owned.
        await putConfig('a.example.com');
        expect((await deploy()).status).toBe(200);
        // b.example.com: attached, but the stale a.example.com cannot be
        // detached — the deploy fails and BOTH stay owned.
        await putConfig('b.example.com');
        detachFailsFor.add('dom-a');
        expect((await deploy()).status).toBeGreaterThanOrEqual(400);
        expect(routed.map((d) => d.hostname)).toEqual(['a.example.com', 'b.example.com']);
        // c.example.com: attached; a.example.com IS detached, then the detach
        // of b.example.com fails. The deploy fails with a.example.com gone.
        await putConfig('c.example.com');
        detachFailsFor.clear();
        detachFailsFor.add('dom-b');
        expect((await deploy()).status).toBeGreaterThanOrEqual(400);
        expect(cfCalls.some((c) => c.method === 'DELETE' && c.url.endsWith('/workers/domains/dom-a'))).toBe(true);
        expect(routed.map((d) => d.hostname)).toEqual(['b.example.com', 'c.example.com']);

        // No record vouches for a.example.com any more: a detach request for it
        // is refused as foreign and sends nothing to Cloudflare …
        detachFailsFor.clear();
        const deletesBefore = cfCalls.filter((c) => c.method === 'DELETE').length;
        const detachA = await detachRoute('dom-a');
        expect(detachA.status).toBe(409);
        expect(JSON.stringify(await detachA.json())).toContain('CFW_DOMAIN_FOREIGN');
        expect(cfCalls.filter((c) => c.method === 'DELETE').length).toBe(deletesBefore);
        // … while the hostname the deploy could not detach and the one it
        // attached are both still owned.
        for (const id of ['dom-b', 'dom-c']) {
          const resp = await detachRoute(id);
          expect(resp.status).toBe(200);
          expect(await resp.json()).toEqual({ ok: true });
        }
      } finally {
        vi.unstubAllGlobals();
      }
    } finally {
      if (priorStateRoot === undefined) delete process.env.OD_USER_STATE_DIR;
      else process.env.OD_USER_STATE_DIR = priorStateRoot;
      await rm(stateRoot, { recursive: true, force: true });
    }
  });

  it('a hostname written ahead of its attach is vouched for by hostname when the attach landed but its record never did', async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'od-deploy-route-workers-attach-write-ahead-'));
    const priorStateRoot = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = stateRoot;
    configureCloudflareWorkersDataDir(stateRoot);
    try {
      const dataDir = process.env.OD_DATA_DIR;
      if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
      const projectId = `workers-attach-write-ahead-${Date.now()}`;
      const dir = await ensureProject(path.join(dataDir, 'projects'), projectId);
      await writeFile(path.join(dir, 'index.html'), '<!doctype html><h1>Hello</h1>');
      expect((await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: projectId, name: 'Workers attach-write-ahead', skillId: null, designSystemId: null }),
      })).status).toBe(200);
      const putConfig = async (hostname: string) => {
        expect((await fetch(`${baseUrl}/api/deploy/config`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            providerId: CLOUDFLARE_WORKERS_PROVIDER_ID,
            token: 'tok',
            accountId: 'acct_test',
            scriptName: 'my-site',
            customDomain: { hostname, zoneId: 'zone-1' },
          }),
        })).status).toBe(200);
      };
      const realFetch = globalThis.fetch;
      const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
      const idFor = (hostname: string) => 'dom-' + hostname.split('.')[0];
      const hostnameFor = (id: string) => id.replace(/^dom-/, '') + '.example.com';
      // What Cloudflare routes to the script right now; detaches that are
      // refused; whether an attach lands but its response is lost.
      let routed: Array<Record<string, string>> = [];
      const detachFailsFor = new Set<string>();
      let attachResponseLost = false;
      const cfCalls: Array<{ url: string; method: string }> = [];
      const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
        if (url.startsWith(baseUrl)) return realFetch(input, init);
        const method = (init?.method || 'GET').toUpperCase();
        cfCalls.push({ url, method });
        if (method === 'HEAD') return new Response('', { status: 200 });
        if (url.endsWith('/workers/subdomain')) return json({ success: true, result: { subdomain: 'acct-test' } });
        if (url.includes('assets-upload-session')) return json({ success: true, result: { jwt: 'SESS', buckets: [] } });
        if (method === 'GET' && url.includes('/workers/domains?')) return json({ success: true, result: routed });
        if (method === 'PUT' && url.endsWith('/workers/domains')) {
          const body = JSON.parse(String(init?.body)) as { hostname: string };
          const id = idFor(body.hostname);
          routed = [...routed.filter((d) => d.hostname !== body.hostname), { id, hostname: body.hostname, service: 'my-site', zone_id: 'zone-1' }];
          if (attachResponseLost) return json({ success: false, errors: [{ message: 'attach response lost' }] }, 500);
          return json({ success: true, result: { id } });
        }
        const single = /\/workers\/domains\/(dom-[a-z]+)$/.exec(url);
        if (method === 'GET' && single) {
          const id = single[1]!;
          return json({ success: true, result: { id, hostname: hostnameFor(id), service: 'my-site', zone_id: 'zone-1' } });
        }
        if (method === 'DELETE' && single) {
          const id = single[1]!;
          if (detachFailsFor.has(id)) return json({ success: false, errors: [{ message: 'detach denied' }] }, 500);
          routed = routed.filter((d) => d.id !== id);
          return json({ success: true, result: null });
        }
        if (url.includes('/workers/scripts/') && method === 'PUT') return json({ success: true, result: {} });
        if (url.includes('/subdomain') && method === 'POST') return json({ success: true, result: { enabled: true } });
        // The deploy reads the script's modified_on before its PUT and the
        // workers.dev config before replacing it.
        if (method === 'GET' && url.includes('/workers/scripts?')) return json({ success: true, result: [] });
        if (method === 'GET' && url.endsWith('/subdomain')) return json({ success: true, result: { enabled: false, previews_enabled: false } });
        throw new Error(`Unexpected Cloudflare fetch: ${method} ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);
      const deployBody = JSON.stringify({ fileName: 'index.html', providerId: CLOUDFLARE_WORKERS_PROVIDER_ID });
      const deploy = () => fetch(`${baseUrl}/api/projects/${projectId}/deploy`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: deployBody });
      const detachRoute = (id: string) => fetch(`${baseUrl}/api/deploy/cloudflare-workers/domains/${id}?projectId=${encodeURIComponent(projectId)}`, { method: 'DELETE' });
      try {
        // The attach of c.example.com LANDS at Cloudflare, but its response is
        // lost: the deploy fails believing nothing was attached, so no record
        // owns the hostname — only the write-ahead vouches for it.
        await putConfig('c.example.com');
        attachResponseLost = true;
        expect((await deploy()).status).toBeGreaterThanOrEqual(400);
        expect(routed.map((d) => d.hostname)).toEqual(['c.example.com']);
        attachResponseLost = false;

        // The next deploy reconciles it as a stale OWNED hostname (by
        // hostname) instead of leaving it routed as foreign.
        await putConfig('d.example.com');
        expect((await deploy()).status).toBe(200);
        expect(cfCalls.some((c) => c.method === 'DELETE' && c.url.endsWith('/workers/domains/dom-c'))).toBe(true);
        expect(routed.map((d) => d.hostname)).toEqual(['d.example.com']);
      } finally {
        vi.unstubAllGlobals();
      }
    } finally {
      if (priorStateRoot === undefined) delete process.env.OD_USER_STATE_DIR;
      else process.env.OD_USER_STATE_DIR = priorStateRoot;
      await rm(stateRoot, { recursive: true, force: true });
    }
  });

  it('a Workers deploy takes the Access app and owned hostnames from EVERY record of the same script, not only the file being deployed', async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'od-deploy-route-workers-shared-ownership-'));
    const priorStateRoot = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = stateRoot;
    configureCloudflareWorkersDataDir(stateRoot);
    try {
      const dataDir = process.env.OD_DATA_DIR;
      if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
      const projectId = `workers-shared-ownership-${Date.now()}`;
      // Unique per run: the records this test leaves in the shared daemon DB
      // would otherwise be siblings of every later test that deploys a Worker
      // named `shared-script`, handing that deploy an Access app its mock
      // cannot serve (priorWorkersOwnershipForScript reads across projects).
      const scriptName = `shared-ownership-${Date.now()}`;
      const dir = await ensureProject(path.join(dataDir, 'projects'), projectId);
      await writeFile(path.join(dir, 'a.html'), '<!doctype html><h1>A</h1>');
      await writeFile(path.join(dir, 'b.html'), '<!doctype html><h1>B</h1>');
      expect((await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: projectId, name: 'Shared ownership', skillId: null, designSystemId: null }),
      })).status).toBe(200);
      // One global scriptName: every file deploys the SAME Worker, so the Access
      // app and the attached hostname are shared by every (project, file) record.
      const putConfig = async (customDomain: { hostname: string; zoneId: string } | null) => {
        expect((await fetch(`${baseUrl}/api/deploy/config`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            providerId: CLOUDFLARE_WORKERS_PROVIDER_ID,
            token: 'tok',
            accountId: 'acct_test',
            scriptName,
            access: { enabled: true, rule: { kind: 'emails', emails: ['a@b.c'] } },
            customDomain,
          }),
        })).status).toBe(200);
      };
      await putConfig({ hostname: 'app.example.com', zoneId: 'zone-1' });

      const realFetch = globalThis.fetch;
      const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
      let routed: Array<Record<string, string>> = [];
      // Listed under a user-chosen name once created: only a recorded id proves ownership.
      let listedApps: unknown[] = [];
      let appPosts = 0;
      const cfCalls: Array<{ url: string; method: string }> = [];
      const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
        if (url.startsWith(baseUrl)) return realFetch(input, init);
        const method = (init?.method || 'GET').toUpperCase();
        cfCalls.push({ url, method });
        if (method === 'HEAD') {
          return new Response('', { status: 302, headers: { location: 'https://acct-test.cloudflareaccess.com/cdn-cgi/access/login' } });
        }
        if (url.endsWith('/workers/subdomain')) return json({ success: true, result: { subdomain: 'acct-test' } });
        if (url.includes('assets-upload-session')) return json({ success: true, result: { jwt: 'SESS', buckets: [] } });
        if (method === 'GET' && url.includes('/workers/domains?')) return json({ success: true, result: routed });
        if (method === 'PUT' && url.endsWith('/workers/domains')) {
          const body = JSON.parse(String(init?.body)) as { hostname: string };
          routed = [...routed.filter((d) => d.hostname !== body.hostname), { id: 'dom-app', hostname: body.hostname, service: scriptName, zone_id: 'zone-1' }];
          return json({ success: true, result: { id: 'dom-app' } });
        }
        if (method === 'DELETE' && url.includes('/workers/domains/')) {
          routed = routed.filter((d) => !url.endsWith('/' + d.id));
          return json({ success: true, result: null });
        }
        if (method === 'PUT' && url.endsWith('/workers/scripts/' + scriptName)) return json({ success: true, result: {} });
        if (method === 'POST' && url.endsWith('/workers/scripts/' + scriptName + '/subdomain')) return json({ success: true, result: { enabled: true } });
        if (url.includes('/workers/scripts')) return json({ success: true, result: [{ id: scriptName, tag: 'tag-shared' }] });
        if (url.includes('/access/identity_providers')) return json({ success: true, result: [{ id: 'otp-1', type: 'onetimepin', name: 'One-time PIN login' }] });
        if (url.includes('/access/apps/')) {
          if (method === 'PUT') return json({ success: true, result: { id: 'app-shared' } });
          return json({ success: true, result: { id: 'app-shared', destinations: [{ type: 'worker', worker_id: 'tag-shared' }] } });
        }
        if (url.includes('/access/apps')) {
          if (method === 'POST') {
            appPosts += 1;
            listedApps = [{ id: 'app-shared', name: 'Renamed by user', destinations: [{ type: 'worker', worker_id: 'tag-shared' }] }];
            return json({ success: true, result: { id: 'app-shared' } });
          }
          return json({ success: true, result: listedApps });
        }
        return json({ success: true, result: {} });
      });
      vi.stubGlobal('fetch', fetchMock);
      try {
        const deploy = (fileName: string) => fetch(`${baseUrl}/api/projects/${projectId}/deploy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName, providerId: CLOUDFLARE_WORKERS_PROVIDER_ID }),
        });
        // a.html creates the Access app and attaches app.example.com. Both are
        // recorded on a.html's record and nowhere else.
        const first = await deploy('a.html');
        expect(first.status).toBe(200);
        expect(appPosts).toBe(1);
        expect(routed.map((d) => d.hostname)).toEqual(['app.example.com']);

        // The hostname is dropped from the config, then b.html deploys the SAME
        // script. b.html has no record of its own: the app and the hostname are
        // known only through a.html's record.
        await putConfig(null);
        const second = await deploy('b.html');
        expect(second.status).toBe(200);
        const secondBody = await second.json() as Record<string, unknown>;
        // It reuses the app a.html created instead of refusing it as foreign …
        expect(appPosts).toBe(1);
        expect(secondBody.cloudflareWorkers).toMatchObject({ accessProtected: true, accessAppId: 'app-shared' });
        // … and detaches the now-stale hostname a.html attached instead of
        // leaving it routed as a "foreign" hostname it will not touch.
        expect(cfCalls.some((c) => c.method === 'DELETE' && c.url.endsWith('/workers/domains/dom-app'))).toBe(true);
        expect(routed).toEqual([]);
      } finally {
        vi.unstubAllGlobals();
      }
    } finally {
      if (priorStateRoot === undefined) delete process.env.OD_USER_STATE_DIR;
      else process.env.OD_USER_STATE_DIR = priorStateRoot;
      await rm(stateRoot, { recursive: true, force: true });
    }
  });

  it('refuses a concurrent Cloudflare Workers deploy from a DIFFERENT project that resolves to the same script name', async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'od-deploy-route-workers-script-singleflight-'));
    const priorStateRoot = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = stateRoot;
    configureCloudflareWorkersDataDir(stateRoot);
    try {
      const dataDir = process.env.OD_DATA_DIR;
      if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
      const stamp = Date.now();
      const projectIds = [`workers-shared-a-${stamp}`, `workers-shared-b-${stamp}`];
      for (const projectId of projectIds) {
        const dir = await ensureProject(path.join(dataDir, 'projects'), projectId);
        await writeFile(path.join(dir, 'index.html'), '<!doctype html><h1>Hello</h1>');
        expect((await fetch(`${baseUrl}/api/projects`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: projectId, name: `Shared ${projectId}`, skillId: null, designSystemId: null }),
        })).status).toBe(200);
      }
      // A global scriptName override makes every project deploy the same Worker.
      expect((await fetch(`${baseUrl}/api/deploy/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: CLOUDFLARE_WORKERS_PROVIDER_ID, token: 'tok', accountId: 'acct_test', scriptName: 'shared-script' }),
      })).status).toBe(200);

      const realFetch = globalThis.fetch;
      let scriptPuts = 0;
      const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
      const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
        if (url.startsWith(baseUrl)) return realFetch(input, init);
        const method = (init?.method || 'GET').toUpperCase();
        if (url.endsWith('/workers/subdomain')) {
          await new Promise((resolve) => setTimeout(resolve, 400));
          return json({ success: true, result: { subdomain: 'acct-test' } });
        }
        if (url.includes('assets-upload-session')) return json({ success: true, result: { jwt: 'SESS', buckets: [] } });
        if (method === 'GET' && url.includes('/workers/domains')) return json({ success: true, result: [] });
        if (method === 'PUT' && url.endsWith('/workers/scripts/shared-script')) {
          scriptPuts += 1;
          return json({ success: true, result: {} });
        }
        if (url.includes('/subdomain')) return json({ success: true, result: { enabled: true } });
        if (method === 'HEAD') return new Response('', { status: 200 });
        return json({ success: true, result: {} });
      });
      vi.stubGlobal('fetch', fetchMock);
      try {
        const body = JSON.stringify({ fileName: 'index.html', providerId: CLOUDFLARE_WORKERS_PROVIDER_ID });
        const first = fetch(`${baseUrl}/api/projects/${projectIds[0]}/deploy`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
        await new Promise((resolve) => setTimeout(resolve, 150));
        const second = fetch(`${baseUrl}/api/projects/${projectIds[1]}/deploy`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
        const [r1, r2] = await Promise.all([first, second]);
        expect([r1.status, r2.status].sort()).toEqual([200, 409]);
        const rejected = r1.status === 409 ? r1 : r2;
        const rejectedBody = await rejected.json() as { error: { code: string; message: string } };
        expect(rejectedBody.error.code).toBe('DEPLOY_IN_PROGRESS');
        expect(rejectedBody.error.message).toContain('shared-script');
        expect(scriptPuts).toBe(1);
      } finally {
        vi.unstubAllGlobals();
      }
    } finally {
      if (priorStateRoot === undefined) delete process.env.OD_USER_STATE_DIR;
      else process.env.OD_USER_STATE_DIR = priorStateRoot;
      await rm(stateRoot, { recursive: true, force: true });
    }
  });

  it('refuses a second concurrent Cloudflare Workers deploy of the same project with 409 DEPLOY_IN_PROGRESS', async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'od-deploy-route-workers-singleflight-'));
    const priorStateRoot = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = stateRoot;
    configureCloudflareWorkersDataDir(stateRoot);
    try {
      const dataDir = process.env.OD_DATA_DIR;
      if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
      const projectId = `workers-singleflight-${Date.now()}`;
      const dir = await ensureProject(path.join(dataDir, 'projects'), projectId);
      await writeFile(path.join(dir, 'index.html'), '<!doctype html><h1>Hello</h1>');
      const createProjectResp = await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: projectId, name: 'Workers single flight', skillId: null, designSystemId: null }),
      });
      expect(createProjectResp.status).toBe(200);
      const saveResp = await fetch(`${baseUrl}/api/deploy/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: CLOUDFLARE_WORKERS_PROVIDER_ID, token: 'tok', accountId: 'acct_test', scriptName: 'single-flight' }),
      });
      expect(saveResp.status).toBe(200);

      const realFetch = globalThis.fetch;
      let scriptPuts = 0;
      const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
      const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
        if (url.startsWith(baseUrl)) return realFetch(input, init);
        const method = (init?.method || 'GET').toUpperCase();
        if (url.endsWith('/workers/subdomain')) {
          // Hold the first deploy here long enough for the second request to arrive.
          await new Promise((resolve) => setTimeout(resolve, 400));
          return json({ success: true, result: { subdomain: 'acct-test' } });
        }
        if (url.includes('assets-upload-session')) return json({ success: true, result: { jwt: 'SESS', buckets: [] } });
        if (method === 'GET' && url.includes('/workers/domains')) return json({ success: true, result: [] });
        if (method === 'PUT' && url.endsWith('/workers/scripts/single-flight')) {
          scriptPuts += 1;
          return json({ success: true, result: {} });
        }
        if (url.includes('/subdomain')) return json({ success: true, result: { enabled: true } });
        if (method === 'HEAD') return new Response('', { status: 200 });
        return json({ success: true, result: {} });
      });
      vi.stubGlobal('fetch', fetchMock);
      try {
        const body = JSON.stringify({ fileName: 'index.html', providerId: CLOUDFLARE_WORKERS_PROVIDER_ID });
        const first = fetch(`${baseUrl}/api/projects/${projectId}/deploy`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
        await new Promise((resolve) => setTimeout(resolve, 150));
        const second = fetch(`${baseUrl}/api/projects/${projectId}/deploy`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
        const [r1, r2] = await Promise.all([first, second]);
        const statuses = [r1.status, r2.status].sort();
        expect(statuses).toEqual([200, 409]);
        const rejected = r1.status === 409 ? r1 : r2;
        expect(await rejected.json()).toMatchObject({ error: { code: 'DEPLOY_IN_PROGRESS' } });
        expect(scriptPuts).toBe(1);

        // Once the first finished, a new deploy is admitted again.
        const third = await fetch(`${baseUrl}/api/projects/${projectId}/deploy`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
        expect(third.status).toBe(200);
      } finally {
        vi.unstubAllGlobals();
      }
    } finally {
      if (priorStateRoot === undefined) delete process.env.OD_USER_STATE_DIR;
      else process.env.OD_USER_STATE_DIR = priorStateRoot;
      await rm(stateRoot, { recursive: true, force: true });
    }
  });

  // Shared fixture for the Workers route tests below: one project with two
  // files that deploy the SAME script, a Cloudflare mock that tracks what is
  // routed to it, and helpers for the deploy / detach routes.
  type HeadMode = 'access' | 'plain' | 'unreachable';
  async function workersSiblingFixture(slug: string, options: { access?: boolean } = {}) {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), `od-deploy-route-workers-${slug}-`));
    const priorStateRoot = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = stateRoot;
    configureCloudflareWorkersDataDir(stateRoot);
    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
    const stamp = Date.now();
    const projectId = `workers-${slug}-${stamp}`;
    // Unique per run so the records this test leaves in the shared daemon DB
    // are nobody else's siblings (priorWorkersOwnershipForScript reads across
    // projects by script name).
    const scriptName = `${slug}-${stamp}`;
    const dir = await ensureProject(path.join(dataDir, 'projects'), projectId);
    await writeFile(path.join(dir, 'a.html'), '<!doctype html><h1>A</h1>');
    await writeFile(path.join(dir, 'b.html'), '<!doctype html><h1>B</h1>');
    expect((await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: projectId, name: `Workers ${slug}`, skillId: null, designSystemId: null }),
    })).status).toBe(200);
    const putConfig = async (input: { hostname?: string | null; access?: boolean }) => {
      expect((await fetch(`${baseUrl}/api/deploy/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: CLOUDFLARE_WORKERS_PROVIDER_ID,
          token: 'tok',
          accountId: 'acct_test',
          scriptName,
          customDomain: input.hostname ? { hostname: input.hostname, zoneId: 'zone-1' } : null,
          access: input.access ? { enabled: true, rule: { kind: 'emails', emails: ['a@b.c'] } } : { enabled: false },
        }),
      })).status).toBe(200);
    };
    const realFetch = globalThis.fetch;
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    const idFor = (hostname: string) => 'dom-' + hostname.split('.')[0];
    const state = {
      routed: [] as Array<Record<string, string>>,
      attachMode: 'ok' as 'ok' | 'refused' | 'transport',
      // What the public URLs answer to a HEAD: the Access login redirect, a
      // plain 200 (no gate), or no answer at all — one answer for every URL,
      // or a function choosing per URL.
      headMode: (options.access ? 'access' : 'plain') as HeadMode | ((url: string) => HeadMode),
      // The script's workers.dev route, as Cloudflare would report and store it.
      subdomainEnabled: true,
      cfCalls: [] as Array<{ url: string; method: string; dispatched: boolean }>,
      // Consumed once: the next non-HEAD Cloudflare call awaits it before it
      // answers, holding a deploy at its first API call.
      hold: null as null | (() => Promise<void>),
      // Consumed once: the next HEAD (a perimeter probe) awaits it before it
      // answers, holding a check-link inside its probe.
      headHold: null as null | (() => Promise<void>),
      // Whether turning the workers.dev route OFF (the exposure withdrawal)
      // succeeds at Cloudflare.
      subdomainDisableMode: 'ok' as 'ok' | 'error',
    };
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url.startsWith(baseUrl)) return realFetch(input, init);
      const method = (init?.method || 'GET').toUpperCase();
      state.cfCalls.push({ url, method, dispatched: init?.dispatcher !== undefined });
      if (method === 'HEAD') {
        if (state.headHold) {
          const headHold = state.headHold;
          state.headHold = null;
          await headHold();
        }
        const headMode = typeof state.headMode === 'function' ? state.headMode(url) : state.headMode;
        if (headMode === 'unreachable') throw new TypeError('fetch failed');
        return headMode === 'access'
          ? new Response('', { status: 302, headers: { location: 'https://acct-test.cloudflareaccess.com/cdn-cgi/access/login' } })
          : new Response('', { status: 200 });
      }
      if (state.hold) {
        const hold = state.hold;
        state.hold = null;
        await hold();
      }
      if (url.endsWith('/workers/subdomain')) return json({ success: true, result: { subdomain: 'acct-test' } });
      if (url.includes('assets-upload-session')) return json({ success: true, result: { jwt: 'SESS', buckets: [] } });
      if (method === 'GET' && url.includes('/workers/domains?')) return json({ success: true, result: state.routed });
      if (method === 'PUT' && url.endsWith('/workers/domains')) {
        const body = JSON.parse(String(init?.body)) as { hostname: string };
        const id = idFor(body.hostname);
        if (state.attachMode === 'refused') return json({ success: false, errors: [{ message: 'attach refused' }] }, 400);
        // The attach lands either way; on 'transport' its response is lost.
        state.routed = [...state.routed.filter((d) => d.hostname !== body.hostname), { id, hostname: body.hostname, service: scriptName, zone_id: 'zone-1' }];
        if (state.attachMode === 'transport') throw new TypeError('fetch failed');
        return json({ success: true, result: { id } });
      }
      const single = /\/workers\/domains\/(dom-[a-z]+)$/.exec(url);
      if (method === 'GET' && single) {
        const id = single[1]!;
        return json({ success: true, result: { id, hostname: id.replace(/^dom-/, '') + '.example.com', service: scriptName, zone_id: 'zone-1' } });
      }
      if (method === 'DELETE' && single) {
        state.routed = state.routed.filter((d) => d.id !== single[1]);
        return json({ success: true, result: null });
      }
      if (method === 'PUT' && url.endsWith('/workers/scripts/' + scriptName)) return json({ success: true, result: {} });
      if (url.endsWith('/workers/scripts/' + scriptName + '/subdomain')) {
        if (method === 'POST') {
          const body = JSON.parse(String(init?.body)) as { enabled?: unknown };
          if (body.enabled === false && state.subdomainDisableMode === 'error') {
            return json({ success: false, errors: [{ message: 'subdomain disable refused' }] }, 500);
          }
          if (typeof body.enabled === 'boolean') state.subdomainEnabled = body.enabled;
        }
        return json({ success: true, result: { enabled: state.subdomainEnabled, previews_enabled: false } });
      }
      if (url.includes('/workers/scripts')) return json({ success: true, result: [{ id: scriptName, tag: 'tag-shared' }] });
      if (url.includes('/access/identity_providers')) return json({ success: true, result: [{ id: 'otp-1', type: 'onetimepin', name: 'One-time PIN login' }] });
      if (url.includes('/access/apps/')) {
        if (method === 'PUT') return json({ success: true, result: { id: 'app-shared' } });
        return json({ success: true, result: { id: 'app-shared', destinations: [{ type: 'worker', worker_id: 'tag-shared' }] } });
      }
      if (url.includes('/access/apps')) {
        if (method === 'POST') return json({ success: true, result: { id: 'app-shared' } });
        return json({ success: true, result: [] });
      }
      throw new Error(`Unexpected Cloudflare fetch: ${method} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const deploy = (fileName: string, target: 'preview' | 'production' = 'production') => fetch(`${baseUrl}/api/projects/${projectId}/deploy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName, providerId: CLOUDFLARE_WORKERS_PROVIDER_ID, target }),
    });
    const checkLink = (deploymentId: string) => fetch(`${baseUrl}/api/projects/${projectId}/deployments/${encodeURIComponent(deploymentId)}/check-link`, { method: 'POST' });
    const detachRoute = (id: string) => fetch(`${baseUrl}/api/deploy/cloudflare-workers/domains/${id}?projectId=${encodeURIComponent(projectId)}`, { method: 'DELETE' });
    const listDeployments = async () => {
      const resp = await fetch(`${baseUrl}/api/projects/${projectId}/deployments`);
      expect(resp.status).toBe(200);
      return ((await resp.json()) as { deployments: Array<{ fileName: string; status: string; cloudflareWorkers?: Record<string, unknown> }> }).deployments;
    };
    const cleanup = async () => {
      vi.unstubAllGlobals();
      if (priorStateRoot === undefined) delete process.env.OD_USER_STATE_DIR;
      else process.env.OD_USER_STATE_DIR = priorStateRoot;
      await rm(stateRoot, { recursive: true, force: true });
    };
    return { state, projectId, scriptName, putConfig, deploy, checkLink, detachRoute, listDeployments, cleanup };
  }
  const scriptNameOf = (f: { scriptName: string }) => f.scriptName;

  it('a successful Workers deploy stops every sibling record vouching for the hostnames it detached', async () => {
    const f = await workersSiblingFixture('detach-success');
    try {
      // a.html attaches app.example.com; only a.html's record owns it.
      await f.putConfig({ hostname: 'app.example.com' });
      expect((await f.deploy('a.html')).status).toBe(200);
      expect(f.state.routed.map((d) => d.hostname)).toEqual(['app.example.com']);
      // The hostname is dropped and b.html deploys the same script: it detaches
      // the stale hostname a.html attached, and SUCCEEDS.
      await f.putConfig({ hostname: null });
      expect((await f.deploy('b.html')).status).toBe(200);
      expect(f.state.cfCalls.some((c) => c.method === 'DELETE' && c.url.endsWith('/workers/domains/dom-app'))).toBe(true);
      expect(f.state.routed).toEqual([]);
      // a.html's record must no longer vouch for it: a detach request for the
      // id is refused as foreign (the hostname is not OpenDesign's any more)
      // and nothing is sent to Cloudflare.
      const deletesBefore = f.state.cfCalls.filter((c) => c.method === 'DELETE').length;
      const detach = await f.detachRoute('dom-app');
      expect(detach.status).toBe(409);
      expect(JSON.stringify(await detach.json())).toContain('was not attached by an OpenDesign deployment');
      expect(f.state.cfCalls.filter((c) => c.method === 'DELETE').length).toBe(deletesBefore);
    } finally {
      await f.cleanup();
    }
  });

  it('turning Access off on one file clears the deleted Access app from every sibling record of the same script', async () => {
    const f = await workersSiblingFixture('retire-siblings', { access: true });
    try {
      await f.putConfig({ access: true });
      const first = await f.deploy('a.html');
      expect(first.status).toBe(200);
      expect(((await first.json()) as { cloudflareWorkers?: Record<string, unknown> }).cloudflareWorkers).toMatchObject({ accessProtected: true, accessAppId: 'app-shared' });
      // Access off, deployed through b.html: the app a.html recorded is deleted.
      await f.putConfig({ access: false });
      const second = await f.deploy('b.html');
      expect(second.status).toBe(200);
      expect(f.state.cfCalls.some((c) => c.method === 'DELETE' && c.url.endsWith('/access/apps/app-shared'))).toBe(true);
      // Neither record may keep reporting the Worker as protected by it.
      const deployments = await f.listDeployments();
      const a = deployments.find((d) => d.fileName === 'a.html');
      const b = deployments.find((d) => d.fileName === 'b.html');
      expect(a).toBeDefined();
      expect(b).toBeDefined();
      for (const record of [a!, b!]) {
        expect(record.cloudflareWorkers?.accessAppId).toBeUndefined();
        expect(record.cloudflareWorkers?.accessProtected).toBeUndefined();
      }
    } finally {
      await f.cleanup();
    }
  });

  it('a 4xx-refused attach drops the hostname write-ahead, while an ambiguous attach failure keeps it', async () => {
    const f = await workersSiblingFixture('attach-refused');
    try {
      // Cloudflare refuses the attach outright: nothing is routed, and the
      // write-ahead for a.example.com must not outlive the failure.
      await f.putConfig({ hostname: 'a.example.com' });
      f.state.attachMode = 'refused';
      expect((await f.deploy('a.html')).status).toBeGreaterThanOrEqual(400);
      expect(f.state.routed).toEqual([]);
      f.state.attachMode = 'ok';
      // Someone attaches a.example.com from the dashboard. A later deploy that
      // no longer names it must treat it as FOREIGN and leave it routed — a
      // surviving write-ahead would classify it as owned and detach it.
      f.state.routed = [{ id: 'dom-a', hostname: 'a.example.com', service: scriptNameOf(f), zone_id: 'zone-1' }];
      await f.putConfig({ hostname: null });
      expect((await f.deploy('a.html')).status).toBe(200);
      expect(f.state.cfCalls.some((c) => c.method === 'DELETE' && c.url.endsWith('/workers/domains/dom-a'))).toBe(false);
      expect(f.state.routed.map((d) => d.hostname)).toEqual(['a.example.com']);

      // The attach of b.example.com LANDS but its response is lost: only the
      // write-ahead vouches for it, and it must stay so the next deploy
      // reconciles the hostname as stale OWNED (by hostname).
      await f.putConfig({ hostname: 'b.example.com' });
      f.state.attachMode = 'transport';
      expect((await f.deploy('a.html')).status).toBeGreaterThanOrEqual(400);
      expect(f.state.routed.map((d) => d.hostname)).toEqual(['a.example.com', 'b.example.com']);
      f.state.attachMode = 'ok';
      await f.putConfig({ hostname: null });
      expect((await f.deploy('a.html')).status).toBe(200);
      expect(f.state.cfCalls.some((c) => c.method === 'DELETE' && c.url.endsWith('/workers/domains/dom-b'))).toBe(true);
      expect(f.state.cfCalls.some((c) => c.method === 'DELETE' && c.url.endsWith('/workers/domains/dom-a'))).toBe(false);
      expect(f.state.routed.map((d) => d.hostname)).toEqual(['a.example.com']);
    } finally {
      await f.cleanup();
    }
  });

  it('a successful production deploy resolves the attach write-ahead on every sibling record, not only its own', async () => {
    const f = await workersSiblingFixture('pending-siblings');
    try {
      // a.html's attach of a.example.com LANDS but its response is lost: only
      // a.html's write-ahead vouches for the hostname.
      await f.putConfig({ hostname: 'a.example.com' });
      f.state.attachMode = 'transport';
      expect((await f.deploy('a.html')).status).toBeGreaterThanOrEqual(400);
      f.state.attachMode = 'ok';
      expect(f.state.routed.map((d) => d.hostname)).toEqual(['a.example.com']);
      // A preview deploy of b.html carries the union of the script's
      // write-aheads forward onto b.html's record: a COPY of the pending entry.
      expect((await f.deploy('b.html', 'preview')).status).toBe(200);
      // a.html's production deploy drops the hostname: the strict routed list
      // proves a.example.com is (stale, vouched) and detaches it. Its own
      // write-ahead goes with the record replace; b.html's copy must go too.
      await f.putConfig({ hostname: null });
      expect((await f.deploy('a.html')).status).toBe(200);
      expect(f.state.cfCalls.some((c) => c.method === 'DELETE' && c.url.endsWith('/workers/domains/dom-a'))).toBe(true);
      expect(f.state.routed).toEqual([]);
      // Someone re-attaches a.example.com from the dashboard. A deploy of
      // b.html must treat it as FOREIGN and leave it routed: a surviving copy
      // of the write-ahead on b.html's record classified it owned and
      // detached it again.
      const deletesBefore = f.state.cfCalls.filter((c) => c.method === 'DELETE').length;
      f.state.routed = [{ id: 'dom-a', hostname: 'a.example.com', service: scriptNameOf(f), zone_id: 'zone-1' }];
      expect((await f.deploy('b.html')).status).toBe(200);
      expect(f.state.cfCalls.filter((c) => c.method === 'DELETE').length).toBe(deletesBefore);
      expect(f.state.routed.map((d) => d.hostname)).toEqual(['a.example.com']);
      // Nor does the detach route accept it: nothing vouches for it any more.
      const detach = await f.detachRoute('dom-a');
      expect(detach.status).toBe(409);
      expect(f.state.cfCalls.filter((c) => c.method === 'DELETE').length).toBe(deletesBefore);
    } finally {
      await f.cleanup();
    }
  });

  it('a failed deploy drops a released write-ahead from every sibling record, not only the live one', async () => {
    const f = await workersSiblingFixture('released-siblings');
    try {
      // The first attach is lost in transport, so a.html carries a write-ahead
      // for a.example.com; a preview of b.html copies it onto b.html's record.
      await f.putConfig({ hostname: 'a.example.com' });
      f.state.attachMode = 'transport';
      expect((await f.deploy('a.html')).status).toBeGreaterThanOrEqual(400);
      expect((await f.deploy('b.html', 'preview')).status).toBe(200);
      // The lost attach turns out NOT to have landed (nothing is routed), and
      // the retry is refused outright by Cloudflare: the hostname is released
      // — certainly not attached — so no record has anything to vouch for.
      f.state.routed = [];
      f.state.attachMode = 'refused';
      expect((await f.deploy('a.html')).status).toBeGreaterThanOrEqual(400);
      f.state.attachMode = 'ok';
      // Someone attaches a.example.com from the dashboard. A deploy of b.html
      // that no longer names it must leave it routed: b.html's surviving copy
      // of the write-ahead would classify it owned and detach it.
      f.state.routed = [{ id: 'dom-a', hostname: 'a.example.com', service: scriptNameOf(f), zone_id: 'zone-1' }];
      await f.putConfig({ hostname: null });
      expect((await f.deploy('b.html')).status).toBe(200);
      expect(f.state.cfCalls.some((c) => c.method === 'DELETE' && c.url.endsWith('/workers/domains/dom-a'))).toBe(false);
      expect(f.state.routed.map((d) => d.hostname)).toEqual(['a.example.com']);
    } finally {
      await f.cleanup();
    }
  });

  it('check-link on a deferred Access deploy runs the perimeter verdict over both URLs, never the plain reachability probe', async () => {
    const f = await workersSiblingFixture('deferred-access', { access: true });
    // The real perimeter budget waits several seconds per URL before it defers.
    configureCloudflareAccessPerimeterRetry({ attempts: 2, baseMs: 1 });
    try {
      // The workers.dev route is OFF before the deploy: this run turns it on,
      // and attaches a.example.com — both are ITS exposure.
      f.state.subdomainEnabled = false;
      f.state.headMode = 'unreachable';
      await f.putConfig({ hostname: 'a.example.com', access: true });
      const deployResp = await f.deploy('a.html');
      expect(deployResp.status).toBe(200);
      const deployed = (await deployResp.json()) as { id: string; status: string; url: string };
      expect(deployed.status).toBe('link-delayed');
      expect(f.state.subdomainEnabled).toBe(true);
      expect(f.state.routed.map((d) => d.hostname)).toEqual(['a.example.com']);

      // Still no answer: the record stays deferred; nothing is withdrawn.
      let before = f.state.cfCalls.length;
      let checked = await f.checkLink(deployed.id);
      expect(checked.status).toBe(200);
      expect(((await checked.json()) as { status: string }).status).toBe('link-delayed');
      expect(f.state.cfCalls.slice(before).every((c) => c.method === 'HEAD')).toBe(true);
      expect(f.state.subdomainEnabled).toBe(true);

      // The URLs now answer. workers.dev (the record's own `url`) challenges
      // with the Access gate, but the custom hostname answers a plain 200,
      // WITHOUT it. The generic probe of `existing.url` alone would have
      // promoted that to `ready`; the deferred path also probes the recorded
      // hostname, fails the deploy on it, and withdraws what the deploy
      // created: the workers.dev route goes back off and the attached hostname
      // is detached. (The verdict settles on the first unprotected URL, so the
      // ungated one has to come second for both probes to be observable.)
      f.state.headMode = (url) => (url === deployed.url ? 'access' : 'plain');
      before = f.state.cfCalls.length;
      checked = await f.checkLink(deployed.id);
      expect(checked.status).toBe(200);
      const failed = (await checked.json()) as { status: string; statusMessage?: string; reachableAt?: number; cloudflareWorkers?: Record<string, unknown> };
      expect(failed.status).toBe('failed');
      expect(failed.reachableAt).toBeUndefined();
      expect(failed.statusMessage).toContain('https://a.example.com is not behind Cloudflare Access');
      expect(failed.cloudflareWorkers?.check).toMatchObject({ ok: false, detail: 'CFW_ACCESS_UNVERIFIED' });
      const heads = f.state.cfCalls.slice(before).filter((c) => c.method === 'HEAD').map((c) => c.url);
      expect(heads).toContain(deployed.url);
      expect(heads).toContain('https://a.example.com');
      expect(f.state.subdomainEnabled).toBe(false);
      expect(f.state.cfCalls.slice(before).some((c) => c.method === 'DELETE' && c.url.endsWith('/workers/domains/dom-a'))).toBe(true);
      expect(f.state.routed).toEqual([]);
      // The record stops vouching for (and displaying) the detached hostname.
      const records = await f.listDeployments();
      expect(records.find((d) => d.fileName === 'a.html')?.cloudflareWorkers?.customDomain).toBeUndefined();

      // A fresh deferred deploy whose URLs then answer WITH the gate: ready,
      // and the gate is recorded as verified.
      f.state.headMode = 'unreachable';
      const again = await f.deploy('a.html');
      expect(again.status).toBe(200);
      const deferred = (await again.json()) as { id: string; status: string };
      expect(deferred.status).toBe('link-delayed');
      f.state.headMode = 'access';
      checked = await f.checkLink(deferred.id);
      expect(checked.status).toBe(200);
      const ready = (await checked.json()) as { status: string; reachableAt?: number; cloudflareWorkers?: Record<string, unknown> };
      expect(ready.status).toBe('ready');
      expect(typeof ready.reachableAt).toBe('number');
      expect(ready.cloudflareWorkers).toMatchObject({ accessProtected: true });
      // A later check of the ready record is still a perimeter verdict (the
      // record stays Access-protected), never a Cloudflare mutation.
      before = f.state.cfCalls.length;
      checked = await f.checkLink(deferred.id);
      expect(checked.status).toBe(200);
      expect(f.state.cfCalls.slice(before).every((c) => c.method === 'HEAD' || c.method === 'GET')).toBe(true);
    } finally {
      configureCloudflareAccessPerimeterRetry();
      await f.cleanup();
    }
  });

  it('classifies a record as Access-protected on the deploy marker alone, whatever its status', () => {
    // The marker only a deploy that gated the Worker writes — on the deferred
    // status, on a failed check's status, and on a verified ready record.
    expect(isAccessProtectedWorkersRecord({ status: 'link-delayed', providerMetadata: { accessVerified: false, accessProtected: true } })).toBe(true);
    expect(isAccessProtectedWorkersRecord({ status: 'failed', providerMetadata: { accessProtected: true, accessVerified: false, check: { ok: false, detail: 'CFW_ACCESS_UNVERIFIED' } } })).toBe(true);
    expect(isAccessProtectedWorkersRecord({ status: 'ready', providerMetadata: { accessProtected: true, accessVerified: true } })).toBe(true);
    // A FAILED deploy's ownership bookkeeping (accessAppId + createdByOpenDesign,
    // no gate marker) never gated the Worker: not Access-protected, so the
    // link check must not be able to "verify" it.
    expect(isAccessProtectedWorkersRecord({ status: 'failed', providerMetadata: { accessAppId: 'app-1', createdByOpenDesign: true } })).toBe(false);
    // The deferral marker without the gate marker (a hand-edited record) is
    // not one either; nor is a marker of the wrong shape.
    expect(isAccessProtectedWorkersRecord({ status: 'link-delayed', providerMetadata: { accessVerified: false } })).toBe(false);
    expect(isAccessProtectedWorkersRecord({ status: 'ready', providerMetadata: { accessProtected: 'true' } })).toBe(false);
    expect(isAccessProtectedWorkersRecord({ status: 'link-delayed', providerMetadata: undefined })).toBe(false);
    expect(isAccessProtectedWorkersRecord({ status: 'link-delayed', providerMetadata: [] })).toBe(false);
  });

  it('classifies an exposure as retained only once a check judged it ungated', () => {
    const exposure = { scriptName: 'site', subdomainEnabledByThisRun: true };
    // A failed check's verdict with something still to withdraw.
    expect(isRetainedUnverifiedExposure({ unverifiedExposure: exposure, check: { ok: false, detail: 'CFW_ACCESS_UNVERIFIED' } })).toBe(true);
    // A re-deferred failed record keeps the verdict: still retained.
    expect(isRetainedUnverifiedExposure({ unverifiedExposure: exposure, check: { ok: false, detail: 'CFW_ACCESS_UNVERIFIED' }, accessVerificationDeferred: 'no answer' })).toBe(true);
    // A deferred deploy's exposure awaits its verdict: not retained.
    expect(isRetainedUnverifiedExposure({ unverifiedExposure: exposure, accessVerificationDeferred: 'no answer' })).toBe(false);
    // Judged, with nothing left to withdraw.
    expect(isRetainedUnverifiedExposure({ check: { ok: false, detail: 'CFW_ACCESS_UNVERIFIED' } })).toBe(false);
    // Some other verdict, or a malformed exposure.
    expect(isRetainedUnverifiedExposure({ unverifiedExposure: exposure, check: { ok: true } })).toBe(false);
    expect(isRetainedUnverifiedExposure({ unverifiedExposure: { scriptName: '' }, check: { ok: false, detail: 'CFW_ACCESS_UNVERIFIED' } })).toBe(false);
  });

  it('check-link on a FAILED Access deploy takes the perimeter verdict, never the reachability probe', async () => {
    const f = await workersSiblingFixture('failed-access-checklink', { access: true });
    configureCloudflareAccessPerimeterRetry({ attempts: 2, baseMs: 1 });
    try {
      f.state.subdomainEnabled = false;
      f.state.headMode = 'unreachable';
      await f.putConfig({ hostname: 'a.example.com', access: true });
      const deployResp = await f.deploy('a.html');
      expect(deployResp.status).toBe(200);
      const deployed = (await deployResp.json()) as { id: string; status: string; url: string };
      expect(deployed.status).toBe('link-delayed');

      // The URLs answer WITHOUT the gate: the check fails the deploy and
      // withdraws its whole exposure (route off, hostname detached).
      f.state.headMode = 'plain';
      let checked = await f.checkLink(deployed.id);
      expect(checked.status).toBe(200);
      expect(((await checked.json()) as { status: string }).status).toBe('failed');
      expect(f.state.subdomainEnabled).toBe(false);
      expect(f.state.routed).toEqual([]);

      // The failed record's URL still answers a plain 200. The generic
      // reachability probe reads that as a ready link — on a gated Worker it
      // is the very exposure the deploy failed for. The record stays failed,
      // on the perimeter verdict, with nothing left to withdraw (probes only).
      let before = f.state.cfCalls.length;
      checked = await f.checkLink(deployed.id);
      expect(checked.status).toBe(200);
      const stillFailed = (await checked.json()) as { status: string; statusMessage?: string; reachableAt?: number; cloudflareWorkers?: Record<string, unknown> };
      expect(stillFailed.status).toBe('failed');
      expect(stillFailed.reachableAt).toBeUndefined();
      expect(stillFailed.statusMessage).toContain('is not behind Cloudflare Access');
      expect(stillFailed.cloudflareWorkers?.check).toMatchObject({ ok: false, detail: 'CFW_ACCESS_UNVERIFIED' });
      expect(f.state.cfCalls.slice(before).every((c) => c.method === 'HEAD')).toBe(true);

      // No answer at all: the failed record is deferred, not promoted.
      f.state.headMode = 'unreachable';
      checked = await f.checkLink(deployed.id);
      expect(checked.status).toBe(200);
      expect(((await checked.json()) as { status: string }).status).toBe('link-delayed');

      // The URL answers WITH the gate: the deploy is verified and ready, and
      // the failed check's verdict leaves the record with it.
      f.state.headMode = 'access';
      before = f.state.cfCalls.length;
      checked = await f.checkLink(deployed.id);
      expect(checked.status).toBe(200);
      const ready = (await checked.json()) as { status: string; reachableAt?: number; cloudflareWorkers?: Record<string, unknown> };
      expect(ready.status).toBe('ready');
      expect(typeof ready.reachableAt).toBe('number');
      expect(ready.cloudflareWorkers).toMatchObject({ accessProtected: true });
      expect(ready.cloudflareWorkers?.check).toBeUndefined();
      expect(f.state.cfCalls.slice(before).every((c) => c.method === 'HEAD')).toBe(true);
    } finally {
      configureCloudflareAccessPerimeterRetry();
      await f.cleanup();
    }
  });

  it('check-link retries a withdrawal the failed check could not finish, under the script single-flight and before it probes', async () => {
    const f = await workersSiblingFixture('retained-exposure', { access: true });
    configureCloudflareAccessPerimeterRetry({ attempts: 2, baseMs: 1 });
    const isDisable = (c: { url: string; method: string }) => c.method === 'POST' && c.url.endsWith('/workers/scripts/' + f.scriptName + '/subdomain');
    try {
      f.state.subdomainEnabled = false;
      f.state.headMode = 'unreachable';
      await f.putConfig({ hostname: 'a.example.com', access: true });
      const deployResp = await f.deploy('a.html');
      expect(deployResp.status).toBe(200);
      const deployed = (await deployResp.json()) as { id: string; status: string };
      expect(deployed.status).toBe('link-delayed');
      expect(f.state.subdomainEnabled).toBe(true);
      expect(f.state.routed.map((d) => d.hostname)).toEqual(['a.example.com']);

      // Ungated. The hostname detaches, but turning the workers.dev route back
      // off is refused: the deploy fails and that half of its exposure stays
      // recorded.
      f.state.headMode = 'plain';
      f.state.subdomainDisableMode = 'error';
      let checked = await f.checkLink(deployed.id);
      expect(checked.status).toBe(200);
      const failed = (await checked.json()) as { status: string; cloudflareWorkers?: { steps?: Array<Record<string, unknown>> } };
      expect(failed.status).toBe('failed');
      expect(failed.cloudflareWorkers?.steps).toContainEqual(expect.objectContaining({ name: 'subdomain-disable', status: 'error' }));
      expect(f.state.subdomainEnabled).toBe(true);
      expect(f.state.routed).toEqual([]);

      // The next check retries the withdrawal FIRST — before any probe — and
      // the record stays failed while the route still answers ungated.
      let before = f.state.cfCalls.length;
      checked = await f.checkLink(deployed.id);
      expect(checked.status).toBe(200);
      expect(((await checked.json()) as { status: string }).status).toBe('failed');
      const calls = f.state.cfCalls.slice(before);
      const firstDisable = calls.findIndex(isDisable);
      const firstProbe = calls.findIndex((c) => c.method === 'HEAD');
      expect(firstDisable).toBeGreaterThanOrEqual(0);
      expect(firstProbe).toBeGreaterThan(firstDisable);
      expect(f.state.subdomainEnabled).toBe(true);

      // Cloudflare accepts the disable now: the retry lands and nothing is
      // left to withdraw. With the route off the URL no longer answers, so the
      // verdict defers the record rather than promoting it.
      f.state.subdomainDisableMode = 'ok';
      f.state.headMode = 'unreachable';
      before = f.state.cfCalls.length;
      checked = await f.checkLink(deployed.id);
      expect(checked.status).toBe(200);
      const withdrawn = (await checked.json()) as { status: string; cloudflareWorkers?: { steps?: Array<Record<string, unknown>> } };
      expect(withdrawn.status).toBe('link-delayed');
      expect(withdrawn.cloudflareWorkers?.steps).toContainEqual(expect.objectContaining({ name: 'subdomain-disable', status: 'done' }));
      expect(f.state.cfCalls.slice(before).filter(isDisable).length).toBeGreaterThanOrEqual(1);
      expect(f.state.subdomainEnabled).toBe(false);

      // Nothing retained any more: a later check is probes only.
      before = f.state.cfCalls.length;
      checked = await f.checkLink(deployed.id);
      expect(checked.status).toBe(200);
      expect(f.state.cfCalls.slice(before).every((c) => c.method === 'HEAD')).toBe(true);
    } finally {
      configureCloudflareAccessPerimeterRetry();
      await f.cleanup();
    }
  });

  it('check-link refuses to withdraw a deferred deploy\'s exposure with 409 DEPLOY_IN_PROGRESS while a deploy of the script is in flight', async () => {
    const f = await workersSiblingFixture('deferred-singleflight', { access: true });
    configureCloudflareAccessPerimeterRetry({ attempts: 2, baseMs: 1 });
    try {
      // A deferred deploy: this run turned the workers.dev route on and
      // attached a.example.com; both are recorded as its exposure.
      f.state.subdomainEnabled = false;
      f.state.headMode = 'unreachable';
      await f.putConfig({ hostname: 'a.example.com', access: true });
      const deployResp = await f.deploy('a.html');
      expect(deployResp.status).toBe(200);
      const deployed = (await deployResp.json()) as { id: string; status: string };
      expect(deployed.status).toBe('link-delayed');
      expect(f.state.subdomainEnabled).toBe(true);
      expect(f.state.routed.map((d) => d.hostname)).toEqual(['a.example.com']);

      // The URLs now answer WITHOUT the gate, so a check-link would withdraw.
      // A deploy of the same script is admitted first and held at its first
      // Cloudflare call: the withdrawal must not race it.
      f.state.headMode = 'plain';
      let release: () => void = () => {};
      const held = new Promise<void>((resolve) => { release = resolve; });
      f.state.hold = () => held;
      const inflight = f.deploy('a.html');
      await new Promise((resolve) => setTimeout(resolve, 150));
      const before = f.state.cfCalls.length;
      const recordedBefore = (await f.listDeployments()).find((d) => d.fileName === 'a.html');
      expect(recordedBefore?.status).toBe('link-delayed');
      const refused = await f.checkLink(deployed.id);
      expect(refused.status).toBe(409);
      expect(await refused.json()).toMatchObject({ error: { code: 'DEPLOY_IN_PROGRESS' } });
      // Nothing was withdrawn: the probes ran, no route was turned off, no
      // hostname detached, and the record is still the deferred one.
      // (The held deploy's first, still-pending call may sit in the log; it is
      // not a withdrawal either.)
      const withdrawals = f.state.cfCalls.slice(before).filter((c) => c.method === 'DELETE' || (c.method === 'POST' && c.url.endsWith('/subdomain')));
      expect(withdrawals).toEqual([]);
      expect(f.state.subdomainEnabled).toBe(true);
      expect(f.state.routed.map((d) => d.hostname)).toEqual(['a.example.com']);
      // The deferral marker (`accessVerified: false`) lives in providerMetadata,
      // which publicDeployment strips and the lifted `cloudflareWorkers` view
      // does not carry; the public record is compared whole instead: still
      // link-delayed, its access-verify step still the deferred one, and not
      // rewritten by the refused check.
      const recordedAfter = (await f.listDeployments()).find((d) => d.fileName === 'a.html');
      expect(recordedAfter?.status).toBe('link-delayed');
      expect(recordedAfter?.cloudflareWorkers?.steps).toContainEqual(expect.objectContaining({ name: 'access-verify', status: 'done', detail: expect.stringMatching(/^deferred: /) }));
      expect(recordedAfter).toEqual(recordedBefore);

      // Once the deploy is released and finishes, the single-flight is free
      // again and a check-link is admitted.
      release();
      const finished = await inflight;
      expect([200, 502]).toContain(finished.status);
      const after = await f.checkLink(deployed.id);
      expect(after.status).toBe(200);
    } finally {
      configureCloudflareAccessPerimeterRetry();
      await f.cleanup();
    }
  });

  it('check-link applies a protected verdict against a RE-READ of the record, so a deploy that settled it during the probe is not overwritten', async () => {
    const f = await workersSiblingFixture('deferred-reread', { access: true });
    configureCloudflareAccessPerimeterRetry({ attempts: 2, baseMs: 1 });
    try {
      f.state.headMode = 'unreachable';
      await f.putConfig({ access: true });
      const deployResp = await f.deploy('a.html');
      expect(deployResp.status).toBe(200);
      const deployed = (await deployResp.json()) as { id: string; status: string };
      expect(deployed.status).toBe('link-delayed');

      // The URLs now answer WITH the gate. A check-link is held inside its
      // probe; meanwhile a deploy of the same file runs to completion and
      // settles the record as `ready` with its own result.
      f.state.headMode = 'access';
      let release: () => void = () => {};
      const held = new Promise<void>((resolve) => { release = resolve; });
      f.state.headHold = () => held;
      const checking = f.checkLink(deployed.id);
      await new Promise((resolve) => setTimeout(resolve, 150));
      const redeploy = await f.deploy('a.html');
      expect(redeploy.status).toBe(200);
      const settled = (await redeploy.json()) as { id: string; status: string };
      expect(settled.id).toBe(deployed.id);
      expect(settled.status).toBe('ready');
      const settledRecord = (await f.listDeployments()).find((d) => d.fileName === 'a.html');
      expect(settledRecord?.status).toBe('ready');

      // The probe's verdict (protected) arrives after the deploy finished. The
      // record it snapshotted before the probe is stale: written back, it
      // would replace the deploy's result with a promoted copy of the OLD
      // deferred record. Re-read under the lock, the record is no longer a
      // deferral and comes back untouched.
      release();
      const checked = await checking;
      expect(checked.status).toBe(200);
      expect(((await checked.json()) as { status: string; statusMessage?: string }).statusMessage).not.toBe('Cloudflare Access is verified on every public link.');
      expect((await f.listDeployments()).find((d) => d.fileName === 'a.html')).toEqual(settledRecord);
    } finally {
      configureCloudflareAccessPerimeterRetry();
      await f.cleanup();
    }
  });

  it('check-link answers 404 FILE_NOT_FOUND when the record is deleted while its probe is in flight, instead of 200 with a null body', async () => {
    const f = await workersSiblingFixture('deferred-record-gone', { access: true });
    configureCloudflareAccessPerimeterRetry({ attempts: 2, baseMs: 1 });
    try {
      // The deploy defers: the public URL does not answer yet.
      f.state.headMode = 'unreachable';
      await f.putConfig({ access: true });
      const deployResp = await f.deploy('a.html');
      expect(deployResp.status).toBe(200);
      const deployed = (await deployResp.json()) as { id: string; status: string };
      expect(deployed.status).toBe('link-delayed');

      const dataDir = process.env.OD_DATA_DIR;
      if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
      const db = openDatabase(process.cwd(), { dataDir });

      // The gate answers now, and the check-link is held inside its probe. The
      // record goes away underneath it (a project delete cascades its
      // deployments; any other writer that removes it looks the same), so the
      // verdict's re-read under the single-flight finds nothing to land on.
      f.state.headMode = 'access';
      let release: () => void = () => {};
      const held = new Promise<void>((resolve) => { release = resolve; });
      f.state.headHold = () => held;
      const checking = f.checkLink(deployed.id);
      await new Promise((resolve) => setTimeout(resolve, 150));
      db.prepare('DELETE FROM deployments WHERE project_id = ? AND id = ?').run(f.projectId, deployed.id);
      release();

      const checked = await checking;
      // A record that is gone is not a verdict: 404, never a 200 carrying null.
      expect(checked.status).toBe(404);
      expect(await checked.json()).toMatchObject({
        error: { code: 'FILE_NOT_FOUND', message: 'deployment not found' },
      });
    } finally {
      configureCloudflareAccessPerimeterRetry();
      await f.cleanup();
    }
  });

  it('check-link refuses to re-defer (unreachable verdict) with 409 DEPLOY_IN_PROGRESS while a deploy of the script is in flight', async () => {
    const f = await workersSiblingFixture('deferred-unreachable-singleflight', { access: true });
    configureCloudflareAccessPerimeterRetry({ attempts: 2, baseMs: 1 });
    try {
      f.state.headMode = 'unreachable';
      await f.putConfig({ access: true });
      const deployResp = await f.deploy('a.html');
      expect(deployResp.status).toBe(200);
      const deployed = (await deployResp.json()) as { id: string; status: string };
      expect(deployed.status).toBe('link-delayed');

      // Still no answer, and a deploy of the script is admitted and held at
      // its first Cloudflare call. Even a verdict that only re-defers is a
      // write over the record the deploy is about to replace: refused.
      let release: () => void = () => {};
      const held = new Promise<void>((resolve) => { release = resolve; });
      f.state.hold = () => held;
      const inflight = f.deploy('a.html');
      await new Promise((resolve) => setTimeout(resolve, 150));
      const recordedBefore = (await f.listDeployments()).find((d) => d.fileName === 'a.html');
      const refused = await f.checkLink(deployed.id);
      expect(refused.status).toBe(409);
      expect(await refused.json()).toMatchObject({ error: { code: 'DEPLOY_IN_PROGRESS' } });
      expect((await f.listDeployments()).find((d) => d.fileName === 'a.html')).toEqual(recordedBefore);

      release();
      const finished = await inflight;
      expect([200, 502]).toContain(finished.status);
    } finally {
      configureCloudflareAccessPerimeterRetry();
      await f.cleanup();
    }
  });

  it('the detach route refuses with 409 DEPLOY_IN_PROGRESS while a deploy of the hostname\'s script is in flight, and is admitted once it finished', async () => {
    const f = await workersSiblingFixture('detach-singleflight');
    try {
      await f.putConfig({ hostname: 'a.example.com' });
      expect((await f.deploy('a.html')).status).toBe(200);
      expect(f.state.routed.map((d) => d.hostname)).toEqual(['a.example.com']);

      // A deploy of the script is admitted and held at its first Cloudflare
      // call; it attaches (and writes ahead) the very hostname a detach
      // would remove.
      let release: () => void = () => {};
      const held = new Promise<void>((resolve) => { release = resolve; });
      f.state.hold = () => held;
      const inflight = f.deploy('a.html');
      await new Promise((resolve) => setTimeout(resolve, 150));
      const before = f.state.cfCalls.length;
      const refused = await f.detachRoute('dom-a');
      expect(refused.status).toBe(409);
      expect(await refused.json()).toMatchObject({ error: { code: 'DEPLOY_IN_PROGRESS' } });
      // Nothing was detached and no record stopped vouching for the hostname.
      expect(f.state.cfCalls.slice(before).some((c) => c.method === 'DELETE')).toBe(false);
      expect(f.state.routed.map((d) => d.hostname)).toEqual(['a.example.com']);

      release();
      expect((await inflight).status).toBe(200);
      expect(f.state.routed.map((d) => d.hostname)).toEqual(['a.example.com']);
      const admitted = await f.detachRoute('dom-a');
      expect(admitted.status).toBe(200);
      expect(f.state.cfCalls.some((c) => c.method === 'DELETE' && c.url.endsWith('/workers/domains/dom-a'))).toBe(true);
      expect(f.state.routed).toEqual([]);
    } finally {
      await f.cleanup();
    }
  });

  it('check-link on a deferred PREVIEW deploy does not probe the production hostname the record carries for display', async () => {
    const f = await workersSiblingFixture('deferred-preview', { access: true });
    configureCloudflareAccessPerimeterRetry({ attempts: 2, baseMs: 1 });
    try {
      // a.html's production deploy attaches and verifies a.example.com.
      await f.putConfig({ hostname: 'a.example.com', access: true });
      expect((await f.deploy('a.html')).status).toBe(200);
      expect(f.state.routed.map((d) => d.hostname)).toEqual(['a.example.com']);
      // b.html's PREVIEW deploy carries that hostname forward for display,
      // but does not route or verify it; its public URL does not answer yet.
      f.state.headMode = 'unreachable';
      const previewResp = await f.deploy('b.html', 'preview');
      expect(previewResp.status).toBe(200);
      const preview = (await previewResp.json()) as { id: string; status: string; url: string; target: string; cloudflareWorkers?: Record<string, unknown> };
      expect(preview.status).toBe('link-delayed');
      expect(preview.target).toBe('preview');
      expect(preview.url).not.toBe('https://a.example.com');
      expect(preview.cloudflareWorkers?.customDomain).toMatchObject({ hostname: 'a.example.com' });

      // The preview URL answers WITH the gate; the production hostname
      // answers a plain 200. The preview never deployed that hostname, so its
      // verdict must not be judged by it: ready, and the hostname not probed.
      f.state.headMode = (url) => (url === preview.url ? 'access' : 'plain');
      const before = f.state.cfCalls.length;
      const checked = await f.checkLink(preview.id);
      expect(checked.status).toBe(200);
      const ready = (await checked.json()) as { status: string; statusMessage?: string };
      expect(ready.status).toBe('ready');
      const heads = f.state.cfCalls.slice(before).filter((c) => c.method === 'HEAD').map((c) => c.url);
      expect(heads).toContain(preview.url);
      expect(heads).not.toContain('https://a.example.com');
      // Nothing was withdrawn: the production hostname stays attached.
      expect(f.state.routed.map((d) => d.hostname)).toEqual(['a.example.com']);
    } finally {
      configureCloudflareAccessPerimeterRetry();
      await f.cleanup();
    }
  });

  it('a failed check-link keeps the part of the exposure it could NOT withdraw recorded, and drops only what it did withdraw', async () => {
    const f = await workersSiblingFixture('deferred-partial-withdraw', { access: true });
    configureCloudflareAccessPerimeterRetry({ attempts: 2, baseMs: 1 });
    try {
      // This run turns the workers.dev route on and attaches a.example.com.
      f.state.subdomainEnabled = false;
      f.state.headMode = 'unreachable';
      await f.putConfig({ hostname: 'a.example.com', access: true });
      const deployResp = await f.deploy('a.html');
      expect(deployResp.status).toBe(200);
      const deployed = (await deployResp.json()) as { id: string; status: string };
      expect(deployed.status).toBe('link-delayed');
      expect(f.state.subdomainEnabled).toBe(true);
      const dataDir = process.env.OD_DATA_DIR;
      if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
      // The recorded exposure is not part of the public record (it is the
      // route's own bookkeeping), so it is read from the daemon's database.
      const db = openDatabase(process.cwd(), { dataDir });
      const recordedExposure = () => (getDeploymentById(db, f.projectId, deployed.id)?.providerMetadata as Record<string, unknown> | undefined)?.unverifiedExposure;
      expect(recordedExposure()).toEqual({
        scriptName: f.scriptName,
        subdomainEnabledByThisRun: true,
        detachableCustomDomains: [{ id: 'dom-a', hostname: 'a.example.com' }],
      });

      // The URLs answer WITHOUT the gate. The withdrawal detaches the hostname
      // but Cloudflare refuses to turn the workers.dev route back off.
      f.state.headMode = 'plain';
      f.state.subdomainDisableMode = 'error';
      const checked = await f.checkLink(deployed.id);
      expect(checked.status).toBe(200);
      const failed = (await checked.json()) as { status: string; cloudflareWorkers?: { steps?: Array<Record<string, unknown>> } };
      expect(failed.status).toBe('failed');
      expect(failed.cloudflareWorkers?.steps).toContainEqual(expect.objectContaining({ name: 'subdomain-disable', status: 'error' }));
      expect(failed.cloudflareWorkers?.steps).toContainEqual(expect.objectContaining({ name: 'custom-domain-detach', status: 'done', detail: 'a.example.com' }));
      expect(f.state.routed).toEqual([]);
      expect(f.state.subdomainEnabled).toBe(true);
      // The route is still public and still this deploy's to take down: it
      // stays recorded. The detached hostname does not.
      expect(recordedExposure()).toEqual({ scriptName: f.scriptName, subdomainEnabledByThisRun: true });
    } finally {
      configureCloudflareAccessPerimeterRetry();
      await f.cleanup();
    }
  });

  it('the detach route sends its Cloudflare calls through the proxy dispatcher', async () => {
    const f = await workersSiblingFixture('detach-proxy');
    const priorProxy = process.env.HTTPS_PROXY;
    try {
      await f.putConfig({ hostname: 'a.example.com' });
      expect((await f.deploy('a.html')).status).toBe(200);
      process.env.HTTPS_PROXY = 'http://127.0.0.1:9';
      const before = f.state.cfCalls.length;
      const detach = await f.detachRoute('dom-a');
      expect(detach.status).toBe(200);
      const routeCalls = f.state.cfCalls.slice(before);
      expect(routeCalls.map((c) => c.method)).toEqual(['GET', 'DELETE']);
      // The OAuth connect/refresh/revoke ride the user's proxy; a detach that
      // did not would fail on exactly the machines the connect worked on.
      expect(routeCalls.every((c) => c.dispatched)).toBe(true);
    } finally {
      if (priorProxy === undefined) delete process.env.HTTPS_PROXY;
      else process.env.HTTPS_PROXY = priorProxy;
      await f.cleanup();
    }
  });
});
