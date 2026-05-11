import type http from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  CLOUDFLARE_PAGES_PROVIDER_ID,
  cloudflarePagesProjectNameForProject,
  deployConfigPath,
  VERCEL_PROVIDER_ID,
  SAVED_CLOUDFLARE_TOKEN_MASK,
} from '../src/deploy.js';
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
});
