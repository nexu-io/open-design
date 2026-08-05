import { afterEach, describe, expect, it } from 'vitest';
import express from 'express';
import http from 'node:http';
import { TeamResourceCopyForbiddenError } from '@open-design/contracts';
import { registerTeamResourceRoutes } from '../src/routes/team-resources.js';
import {
  createDevTeamResourceStateProvider,
  enforceTeamResourceCopyAllowed,
} from '../src/collab/team-resource-state.js';

let server: http.Server | null = null;

afterEach(async () => {
  if (server) {
    const toClose = server;
    server = null;
    await new Promise<void>((resolve) => toClose.close(() => resolve()));
  }
});

async function startServer() {
  const app = express();
  app.use(express.json());
  registerTeamResourceRoutes(app, { teamResources: createDevTeamResourceStateProvider() });
  server = http.createServer(app);
  await new Promise<void>((resolve) => server!.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not bind to a TCP port');
  const base = `http://127.0.0.1:${address.port}`;
  return {
    async req(route: string, options: { method?: string; body?: unknown } = {}) {
      const init: RequestInit = { method: options.method ?? 'GET' };
      if (options.body !== undefined) {
        init.headers = { 'content-type': 'application/json' };
        init.body = JSON.stringify(options.body);
      }
      const response = await fetch(`${base}${route}`, init);
      return { status: response.status, body: (await response.json()) as Record<string, any> };
    },
  };
}

describe('team resource routes (D1 state + D3 enforcement)', () => {
  it('treats an unregistered resource as personal and allows the copy', async () => {
    const api = await startServer();
    expect((await api.req('/api/workspace/resources/plugin/p1/state')).body).toEqual({ scope: 'personal' });
    const check = await api.req('/api/workspace/resources/plugin/p1/copy-check', { method: 'POST' });
    expect(check.status).toBe(200);
    expect(check.body.allowed).toBe(true);
  });

  it('allows copying an active team resource', async () => {
    const api = await startServer();
    await api.req('/api/workspace/resources/design-system/ds1/state', {
      method: 'PUT',
      body: { scope: 'team', state: 'active' },
    });
    const check = await api.req('/api/workspace/resources/design-system/ds1/copy-check', { method: 'POST' });
    expect(check.status).toBe(200);
    expect(check.body.allowed).toBe(true);
  });

  it('REJECTS copying a frozen team resource with a 403 WORKSPACE_RESOURCE_FROZEN', async () => {
    const api = await startServer();
    await api.req('/api/workspace/resources/skill/s1/state', {
      method: 'PUT',
      body: { scope: 'team', state: 'frozen' },
    });
    expect((await api.req('/api/workspace/resources/skill/s1/state')).body).toEqual({
      scope: 'team',
      state: 'frozen',
    });
    const check = await api.req('/api/workspace/resources/skill/s1/copy-check', { method: 'POST' });
    expect(check.status).toBe(403);
    expect(check.body.error.code).toBe('WORKSPACE_RESOURCE_FROZEN');
  });

  it('rejects an invalid resource kind', async () => {
    const api = await startServer();
    const res = await api.req('/api/workspace/resources/nonsense/x/state');
    expect(res.status).toBe(400);
  });
});

describe('enforceTeamResourceCopyAllowed (route-layer guard the copy-out routes call)', () => {
  it('passes for an unregistered (personal) resource', async () => {
    const provider = createDevTeamResourceStateProvider();
    await expect(
      enforceTeamResourceCopyAllowed(provider, { kind: 'plugin', resourceId: 'p1' }),
    ).resolves.toBeUndefined();
  });

  it('throws a coded error for a frozen team resource', async () => {
    const provider = createDevTeamResourceStateProvider();
    provider.set?.({ kind: 'plugin', resourceId: 'p1' }, { scope: 'team', state: 'frozen' });
    await expect(
      enforceTeamResourceCopyAllowed(provider, { kind: 'plugin', resourceId: 'p1' }),
    ).rejects.toBeInstanceOf(TeamResourceCopyForbiddenError);
  });
});
