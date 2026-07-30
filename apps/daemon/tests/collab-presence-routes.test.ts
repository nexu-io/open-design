import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type WorkspaceCollabContext,
} from '@open-design/contracts';
import { createCollabRuntime } from '../src/collab/runtime.js';
import type {
  CollabPresenceCloudClient,
  RegisterCollabPresenceRoutesDeps,
} from '../src/routes/collab-presence.js';
import {
  createCollabPresenceCloudClient,
  registerCollabPresenceRoutes,
} from '../src/routes/collab-presence.js';
import { verifyWorkspaceRequestContext } from '../src/collab/request-workspace-context.js';
import { createCachedWorkspaceDirectoryFetcher } from '../src/collab/vela-workspace-context.js';

let server: http.Server | null = null;

afterEach(async () => {
  if (server) {
    const toClose = server;
    server = null;
    await new Promise<void>((resolve) => toClose.close(() => resolve()));
  }
});

async function startPresenceServer(
  cloud?: CollabPresenceCloudClient,
  options: {
    isProjectShared?: (projectId: string) => Promise<boolean>;
    cloudAuthorizesProjectPresence?: (projectId: string) => boolean;
    verifyWorkspaceRequest?: RegisterCollabPresenceRoutesDeps['verifyWorkspaceRequest'];
    verifyWorkspaceReadRequest?: RegisterCollabPresenceRoutesDeps['verifyWorkspaceReadRequest'];
    presenceListCacheFreshMs?: number;
    presenceListCacheNow?: () => number;
  } = {},
) {
  const app = express();
  app.use(express.json());
  const routes = registerCollabPresenceRoutes(app, {
    collab: createCollabRuntime(),
    ...(cloud ? { cloud } : {}),
    ...(options.isProjectShared ? { isProjectShared: options.isProjectShared } : {}),
    ...(options.cloudAuthorizesProjectPresence
      ? { cloudAuthorizesProjectPresence: options.cloudAuthorizesProjectPresence }
      : {}),
    ...(options.verifyWorkspaceRequest
      ? { verifyWorkspaceRequest: options.verifyWorkspaceRequest }
      : {}),
    ...(options.verifyWorkspaceReadRequest
      ? { verifyWorkspaceReadRequest: options.verifyWorkspaceReadRequest }
      : {}),
    ...(options.presenceListCacheFreshMs !== undefined
      ? { presenceListCacheFreshMs: options.presenceListCacheFreshMs }
      : {}),
    ...(options.presenceListCacheNow
      ? { presenceListCacheNow: options.presenceListCacheNow }
      : {}),
  });
  server = http.createServer(app);
  await new Promise<void>((resolve) => server!.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not bind to a TCP port');
  const base = `http://127.0.0.1:${address.port}`;
  return {
    routes,
    async json(
      route: string,
      options: {
        method?: string;
        body?: unknown;
        headers?: Record<string, string>;
      } = {},
    ) {
      const init: RequestInit = { method: options.method ?? 'GET' };
      if (options.headers) init.headers = options.headers;
      if (options.body !== undefined) {
        init.headers = {
          ...options.headers,
          'content-type': 'application/json',
        };
        init.body = JSON.stringify(options.body);
      }
      const response = await fetch(`${base}${route}`, init);
      return { status: response.status, body: (await response.json()) as Record<string, any> };
    },
  };
}

function presentIds(body: Record<string, any>): string[] {
  return (body.present as { memberId: string }[]).map((member) => member.memberId).sort();
}

function teamContext(
  workspaceId = 'w1',
  workspaceMemberId = 'm1',
): WorkspaceCollabContext {
  return {
    workspaceId,
    workspaceName: `Workspace ${workspaceId}`,
    workspaceType: 'team',
    teamId: workspaceId,
    workspaceMemberId,
    role: 'member',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: null,
    providerMode: 'platform_credits',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 5, usedSeats: 1 }),
    permissions: buildWorkspacePermissions({
      role: 'member',
      lifecycleState: 'active',
    }),
  };
}

describe('collab presence routes', () => {
  it('heartbeats a member and lists the present set', async () => {
    const api = await startPresenceServer();
    const hb = await api.json('/api/projects/p1/presence/heartbeat', {
      method: 'POST',
      body: { memberId: 'm1', name: 'Ada', role: 'owner' },
    });
    expect(hb.status).toBe(200);
    expect(hb.body.present).toEqual([{ memberId: 'm1', name: 'Ada', role: 'owner' }]);

    const list = await api.json('/api/projects/p1/presence');
    expect(list.status).toBe(200);
    expect(presentIds(list.body)).toEqual(['m1']);
  });

  it('removes a member on leave', async () => {
    const api = await startPresenceServer();
    await api.json('/api/projects/p1/presence/heartbeat', { method: 'POST', body: { memberId: 'm1' } });
    await api.json('/api/projects/p1/presence/heartbeat', { method: 'POST', body: { memberId: 'm2' } });
    const left = await api.json('/api/projects/p1/presence/leave', { method: 'POST', body: { memberId: 'm1' } });
    expect(left.status).toBe(200);
    expect(presentIds(left.body)).toEqual(['m2']);
  });

  it('rejects a heartbeat without a memberId', async () => {
    const api = await startPresenceServer();
    const res = await api.json('/api/projects/p1/presence/heartbeat', { method: 'POST', body: {} });
    expect(res.status).toBe(400);
  });

  it('scopes presence per project', async () => {
    const api = await startPresenceServer();
    await api.json('/api/projects/p1/presence/heartbeat', { method: 'POST', body: { memberId: 'm1' } });
    const other = await api.json('/api/projects/p2/presence');
    expect(other.body.present).toEqual([]);
  });

  it('proxies presence through a cloud client when configured', async () => {
    const calls: Array<{ op: string; projectId: string; input?: unknown }> = [];
    const cloud: CollabPresenceCloudClient = {
      async heartbeatPresence(projectId, input) {
        calls.push({ op: 'heartbeat', projectId, input });
        return [{ memberId: 'm1', name: 'Ada', role: 'owner', filePath: 'Typography' }];
      },
      async listPresence(projectId) {
        calls.push({ op: 'list', projectId });
        return [{ memberId: 'm1', name: 'Ada', role: 'owner' }];
      },
      async leavePresence(projectId, input) {
        calls.push({ op: 'leave', projectId, input });
        return [];
      },
    };
    const api = await startPresenceServer(cloud);

    const hb = await api.json('/api/projects/p1/presence/heartbeat', {
      method: 'POST',
      body: {
        memberId: 'm1',
        name: 'Ada',
        role: 'owner',
        clientId: 'client-1',
        filePath: 'Typography',
        activity: { label: '正在评论 Typography' },
      },
    });
    expect(hb.status).toBe(200);
    expect(hb.body.present).toEqual([
      { memberId: 'm1', name: 'Ada', role: 'owner', filePath: 'Typography' },
    ]);

    await api.json('/api/projects/p1/presence');
    await api.json('/api/projects/p1/presence/leave', {
      method: 'POST',
      body: { memberId: 'm1', clientId: 'client-1' },
    });

    expect(calls).toMatchObject([
      {
        op: 'heartbeat',
        projectId: 'p1',
        input: {
          member: { memberId: 'm1', name: 'Ada', role: 'owner', filePath: 'Typography', activity: { label: '正在评论 Typography' } },
          clientId: 'client-1',
          filePath: 'Typography',
          activity: { label: '正在评论 Typography' },
        },
      },
      { op: 'leave', projectId: 'p1', input: { memberId: 'm1', clientId: 'client-1' } },
    ]);
  });

  it('does not publish presence for a project that is no longer team-shared', async () => {
    const calls: Array<{ op: string; projectId: string; input?: unknown }> = [];
    const cloud: CollabPresenceCloudClient = {
      async heartbeatPresence(projectId, input) {
        calls.push({ op: 'heartbeat', projectId, input });
        return [{ memberId: 'm1', name: 'Ada', role: 'owner' }];
      },
      async listPresence(projectId) {
        calls.push({ op: 'list', projectId });
        return [{ memberId: 'm1', name: 'Ada', role: 'owner' }];
      },
      async leavePresence(projectId, input) {
        calls.push({ op: 'leave', projectId, input });
        return [];
      },
    };
    const api = await startPresenceServer(cloud, { isProjectShared: async () => false });

    const list = await api.json('/api/projects/p1/presence');
    const heartbeat = await api.json('/api/projects/p1/presence/heartbeat', {
      method: 'POST',
      body: { memberId: 'm1', name: 'Ada', role: 'owner' },
    });

    expect(list.status).toBe(200);
    expect(list.body.present).toEqual([]);
    expect(heartbeat.status).toBe(200);
    expect(heartbeat.body.present).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('delegates project authorization to an authoritative cloud presence route', async () => {
    const isProjectShared = vi.fn(async () => false);
    const calls: string[] = [];
    const cloud: CollabPresenceCloudClient = {
      async heartbeatPresence(projectId) {
        calls.push(`heartbeat:${projectId}`);
        return [{ memberId: 'm1', name: 'Ada', role: 'owner' }];
      },
      async listPresence(projectId) {
        calls.push(`list:${projectId}`);
        return [{ memberId: 'm1', name: 'Ada', role: 'owner' }];
      },
      async leavePresence() {
        return [];
      },
    };
    const api = await startPresenceServer(cloud, {
      isProjectShared,
      cloudAuthorizesProjectPresence: () => true,
    });

    const list = await api.json('/api/projects/p1/presence');
    const heartbeat = await api.json('/api/projects/p1/presence/heartbeat', {
      method: 'POST',
      body: { memberId: 'm1', name: 'Ada', role: 'owner' },
    });

    expect(list.status).toBe(200);
    expect(heartbeat.status).toBe(200);
    expect(calls).toEqual(['list:p1', 'heartbeat:p1']);
    expect(isProjectShared).not.toHaveBeenCalled();
  });

  it('uses the read authority lease and coalesces sequential cloud presence reads', async () => {
    const context = teamContext();
    let now = 1_000;
    const fetchDirectory = vi.fn(async () => ({
      ok: true as const,
      items: [{
        workspaceId: context.workspaceId,
        workspaceName: context.workspaceName ?? context.workspaceId,
        workspaceType: context.workspaceType,
        workspaceMemberId: context.workspaceMemberId,
        role: context.role,
        memberStatus: context.memberStatus,
        lifecycleState: context.lifecycleState,
      }],
    }));
    const cachedDirectory = createCachedWorkspaceDirectoryFetcher({
      fetchDirectory,
      identityKey: () => 'presence-reader',
      ttlMs: 5_000,
      now: () => now,
    });
    const verifyWorkspaceRequest = vi.fn(async () => {
      throw new Error('GET must not use fresh mutation authority');
    });
    const verifyWorkspaceReadRequest = vi.fn((req: unknown) =>
      verifyWorkspaceRequestContext({
        req,
        fetchWorkspaceDirectory: cachedDirectory,
      }));
    const listPresence = vi.fn(async () => [{ memberId: 'm1' }]);
    const api = await startPresenceServer(
      {
        heartbeatPresence: vi.fn(async () => []),
        listPresence,
        leavePresence: vi.fn(async () => []),
      },
      {
        verifyWorkspaceRequest,
        verifyWorkspaceReadRequest,
        cloudAuthorizesProjectPresence: () => true,
      },
    );

    const headers = {
      'x-od-workspace-id': context.workspaceId,
      'x-od-workspace-member-id': context.workspaceMemberId,
    };
    await expect(api.json('/api/projects/p1/presence', { headers })).resolves.toMatchObject({
      status: 200,
      body: { present: [{ memberId: 'm1' }] },
    });
    now += 4_999;
    await expect(api.json('/api/projects/p1/presence', { headers })).resolves.toMatchObject({
      status: 200,
      body: { present: [{ memberId: 'm1' }] },
    });

    expect(verifyWorkspaceReadRequest).toHaveBeenCalledTimes(2);
    expect(fetchDirectory).toHaveBeenCalledTimes(1);
    expect(verifyWorkspaceRequest).not.toHaveBeenCalled();
    expect(listPresence).toHaveBeenCalledTimes(1);
  });

  it('single-flights concurrent presence reads for one exact viewer scope', async () => {
    let resolveList:
      | ((present: Array<{ memberId: string }>) => void)
      | undefined;
    const listPresence = vi.fn(
      () =>
        new Promise<Array<{ memberId: string }>>((resolve) => {
          resolveList = resolve;
        }),
    );
    const context = teamContext();
    const api = await startPresenceServer(
      {
        heartbeatPresence: vi.fn(async () => []),
        listPresence,
        leavePresence: vi.fn(async () => []),
      },
      {
        verifyWorkspaceReadRequest: async () => ({ ok: true, context }),
        cloudAuthorizesProjectPresence: () => true,
      },
    );

    const first = api.json('/api/projects/p1/presence');
    const second = api.json('/api/projects/p1/presence');
    await vi.waitFor(() => expect(listPresence).toHaveBeenCalledTimes(1));
    resolveList?.([{ memberId: 'm1' }]);

    await expect(Promise.all([first, second])).resolves.toEqual([
      { status: 200, body: { present: [{ memberId: 'm1' }] } },
      { status: 200, body: { present: [{ memberId: 'm1' }] } },
    ]);
  });

  it('isolates cached presence by workspace, project, and viewer member', async () => {
    const listPresence = vi.fn(async (_projectId, context) => [
      { memberId: context?.workspaceMemberId ?? 'missing' },
    ]);
    const api = await startPresenceServer(
      {
        heartbeatPresence: vi.fn(async () => []),
        listPresence,
        leavePresence: vi.fn(async () => []),
      },
      {
        verifyWorkspaceReadRequest: async (req) => {
          const workspaceId = String(req.headers['x-test-workspace']);
          const workspaceMemberId = String(req.headers['x-test-member']);
          return {
            ok: true,
            context: teamContext(workspaceId, workspaceMemberId),
          };
        },
        cloudAuthorizesProjectPresence: () => true,
      },
    );
    const scopedGet = (projectId: string, workspaceId: string, memberId: string) =>
      api.json(`/api/projects/${projectId}/presence`, {
        headers: {
          'x-test-workspace': workspaceId,
          'x-test-member': memberId,
        },
      });

    await scopedGet('p1', 'w1', 'm1');
    await scopedGet('p1', 'w1', 'm2');
    await scopedGet('p1', 'w2', 'm1');
    await scopedGet('p2', 'w1', 'm1');
    await scopedGet('p1', 'w1', 'm1');

    expect(listPresence).toHaveBeenCalledTimes(4);
  });

  it('uses a virtual clock for TTL refresh and explicit hub invalidation', async () => {
    let now = 1_000;
    const listPresence = vi
      .fn()
      .mockResolvedValueOnce([{ memberId: 'first' }])
      .mockResolvedValueOnce([{ memberId: 'refreshed' }])
      .mockResolvedValueOnce([{ memberId: 'invalidated' }]);
    const context = teamContext();
    const api = await startPresenceServer(
      {
        heartbeatPresence: vi.fn(async () => []),
        listPresence,
        leavePresence: vi.fn(async () => []),
      },
      {
        verifyWorkspaceReadRequest: async () => ({ ok: true, context }),
        cloudAuthorizesProjectPresence: () => true,
        presenceListCacheFreshMs: 1_000,
        presenceListCacheNow: () => now,
      },
    );

    expect((await api.json('/api/projects/p1/presence')).body.present).toEqual([
      { memberId: 'first' },
    ]);
    now += 999;
    expect((await api.json('/api/projects/p1/presence')).body.present).toEqual([
      { memberId: 'first' },
    ]);
    expect(listPresence).toHaveBeenCalledTimes(1);

    now += 1;
    expect((await api.json('/api/projects/p1/presence')).body.present).toEqual([
      { memberId: 'first' },
    ]);
    await vi.waitFor(() => expect(listPresence).toHaveBeenCalledTimes(2));
    expect((await api.json('/api/projects/p1/presence')).body.present).toEqual([
      { memberId: 'refreshed' },
    ]);

    api.routes.invalidatePresence('p1', 'w1');
    expect((await api.json('/api/projects/p1/presence')).body.present).toEqual([
      { memberId: 'invalidated' },
    ]);
    expect(listPresence).toHaveBeenCalledTimes(3);
  });

  it('does not cache failed cloud presence reads', async () => {
    const listPresence = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary outage'))
      .mockResolvedValueOnce([{ memberId: 'm1' }]);
    const context = teamContext();
    const api = await startPresenceServer(
      {
        heartbeatPresence: vi.fn(async () => []),
        listPresence,
        leavePresence: vi.fn(async () => []),
      },
      {
        verifyWorkspaceReadRequest: async () => ({ ok: true, context }),
        cloudAuthorizesProjectPresence: () => true,
      },
    );

    expect((await api.json('/api/projects/p1/presence')).status).toBe(502);
    expect((await api.json('/api/projects/p1/presence')).status).toBe(200);
    expect(listPresence).toHaveBeenCalledTimes(2);
  });

  it('drops stale presence after a failed background refresh', async () => {
    let now = 1_000;
    const listPresence = vi
      .fn()
      .mockResolvedValueOnce([{ memberId: 'stale' }])
      .mockRejectedValueOnce(new Error('temporary outage'))
      .mockResolvedValueOnce([{ memberId: 'recovered' }]);
    const context = teamContext();
    const api = await startPresenceServer(
      {
        heartbeatPresence: vi.fn(async () => []),
        listPresence,
        leavePresence: vi.fn(async () => []),
      },
      {
        verifyWorkspaceReadRequest: async () => ({ ok: true, context }),
        cloudAuthorizesProjectPresence: () => true,
        presenceListCacheFreshMs: 1_000,
        presenceListCacheNow: () => now,
      },
    );

    expect((await api.json('/api/projects/p1/presence')).body.present).toEqual([
      { memberId: 'stale' },
    ]);
    now += 1_000;
    expect((await api.json('/api/projects/p1/presence')).body.present).toEqual([
      { memberId: 'stale' },
    ]);
    await vi.waitFor(() => expect(listPresence).toHaveBeenCalledTimes(2));
    expect((await api.json('/api/projects/p1/presence')).body.present).toEqual([
      { memberId: 'recovered' },
    ]);
    expect(listPresence).toHaveBeenCalledTimes(3);
  });

  it('denies reads after the authority lease expires without serving cached presence', async () => {
    const context = teamContext();
    let now = 1_000;
    let directoryItems = [{
      workspaceId: context.workspaceId,
      workspaceName: context.workspaceName ?? context.workspaceId,
      workspaceType: context.workspaceType,
      workspaceMemberId: context.workspaceMemberId,
      role: context.role,
      memberStatus: context.memberStatus,
      lifecycleState: context.lifecycleState,
    }];
    const fetchDirectory = vi.fn(async () => ({
      ok: true as const,
      items: directoryItems,
    }));
    const cachedDirectory = createCachedWorkspaceDirectoryFetcher({
      fetchDirectory,
      identityKey: () => 'revoked-presence-reader',
      ttlMs: 5_000,
      now: () => now,
    });
    const listPresence = vi.fn(async () => [{ memberId: 'm1' }]);
    const verifyWorkspaceReadRequest = vi.fn((req: unknown) =>
      verifyWorkspaceRequestContext({
        req,
        fetchWorkspaceDirectory: cachedDirectory,
      }));
    const api = await startPresenceServer(
      {
        heartbeatPresence: vi.fn(async () => []),
        listPresence,
        leavePresence: vi.fn(async () => []),
      },
      {
        verifyWorkspaceReadRequest,
        cloudAuthorizesProjectPresence: () => true,
      },
    );
    const headers = {
      'x-od-workspace-id': context.workspaceId,
      'x-od-workspace-member-id': context.workspaceMemberId,
    };

    expect((await api.json('/api/projects/p1/presence', { headers })).status).toBe(200);
    directoryItems = [];
    now += 4_999;
    expect((await api.json('/api/projects/p1/presence', { headers })).status).toBe(200);
    now += 1;
    expect((await api.json('/api/projects/p1/presence', { headers })).status).toBe(403);
    expect(fetchDirectory).toHaveBeenCalledTimes(2);
    expect(listPresence).toHaveBeenCalledTimes(1);
  });

  it('keeps heartbeat and leave on fresh authority and publishes their latest result', async () => {
    const context = teamContext();
    const verifyWorkspaceRequest = vi.fn(async () => ({
      ok: true as const,
      context,
    }));
    const verifyWorkspaceReadRequest = vi.fn(async () => ({
      ok: true as const,
      context,
    }));
    const heartbeatPresence = vi.fn(async () => [{ memberId: 'm1' }]);
    const leavePresence = vi.fn(async () => []);
    const listPresence = vi.fn(async () => {
      throw new Error('mutation result should prime the read cache');
    });
    const api = await startPresenceServer(
      { heartbeatPresence, listPresence, leavePresence },
      {
        verifyWorkspaceRequest,
        verifyWorkspaceReadRequest,
        cloudAuthorizesProjectPresence: () => true,
      },
    );

    expect((await api.json('/api/projects/p1/presence/heartbeat', {
      method: 'POST',
      body: { memberId: 'm1' },
    })).status).toBe(200);
    expect((await api.json('/api/projects/p1/presence')).body.present).toEqual([
      { memberId: 'm1' },
    ]);
    expect((await api.json('/api/projects/p1/presence/leave', {
      method: 'POST',
      body: { memberId: 'm1' },
    })).status).toBe(200);
    expect((await api.json('/api/projects/p1/presence')).body.present).toEqual([]);

    expect(verifyWorkspaceRequest).toHaveBeenCalledTimes(2);
    expect(verifyWorkspaceReadRequest).toHaveBeenCalledTimes(2);
    expect(listPresence).not.toHaveBeenCalled();
  });

  it('returns a retryable 503 without relay side effects when Workspace authority is unavailable', async () => {
    const heartbeatPresence = vi.fn(async () => []);
    const listPresence = vi.fn(async () => []);
    const leavePresence = vi.fn(async () => []);
    const isProjectShared = vi.fn(async () => true);
    const api = await startPresenceServer(
      { heartbeatPresence, listPresence, leavePresence },
      {
        isProjectShared,
        verifyWorkspaceRequest: async () => ({
          ok: false,
          status: 503,
          code: 'WORKSPACE_AUTHORITY_UNAVAILABLE',
          message: 'workspace membership authority is temporarily unavailable',
          retryable: true,
        }),
      },
    );

    const responses = [
      await api.json('/api/projects/p1/presence'),
      await api.json('/api/projects/p1/presence/heartbeat', {
        method: 'POST',
        body: { memberId: 'm1' },
      }),
      await api.json('/api/projects/p1/presence/leave', {
        method: 'POST',
        body: { memberId: 'm1' },
      }),
    ];

    for (const response of responses) {
      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({
        error: 'WORKSPACE_AUTHORITY_UNAVAILABLE',
        retryable: true,
      });
    }
    expect(isProjectShared).not.toHaveBeenCalled();
    expect(heartbeatPresence).not.toHaveBeenCalled();
    expect(listPresence).not.toHaveBeenCalled();
    expect(leavePresence).not.toHaveBeenCalled();
  });
});

describe('createCollabPresenceCloudClient', () => {
  // The routes read a present `cloud` as "the cloud owns presence", so an
  // absent transport MUST produce an absent dependency — not a relay that
  // dereferences nothing. See the factory's docblock.
  it('is absent when there is no collab transport', () => {
    expect(createCollabPresenceCloudClient(null, () => undefined)).toBeNull();
    expect(createCollabPresenceCloudClient(undefined, () => undefined)).toBeNull();
  });

  it('binds each call to the project workspace scope when a transport exists', async () => {
    const calls: string[] = [];
    const transport = {
      async heartbeatPresence(projectId: string, _input: unknown, workspaceId?: string) {
        calls.push(`heartbeat:${projectId}:${workspaceId}`);
        return [];
      },
      async listPresence(projectId: string, workspaceId?: string) {
        calls.push(`list:${projectId}:${workspaceId}`);
        return [];
      },
      async leavePresence(projectId: string, _input: unknown, workspaceId?: string) {
        calls.push(`leave:${projectId}:${workspaceId}`);
        return [];
      },
    };
    const cloud = createCollabPresenceCloudClient(
      transport,
      (projectId) => `ws-for-${projectId}`,
    );
    expect(cloud).not.toBeNull();

    await cloud!.heartbeatPresence('p1', { member: { memberId: 'm1' } });
    await cloud!.listPresence('p1');
    await cloud!.leavePresence('p1', { memberId: 'm1' });

    expect(calls).toEqual([
      'heartbeat:p1:ws-for-p1',
      'list:p1:ws-for-p1',
      'leave:p1:ws-for-p1',
    ]);
  });
});
