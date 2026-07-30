import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import { createCollabRuntime } from '../src/collab/runtime.js';
import type {
  CollabPresenceCloudClient,
  RegisterCollabPresenceRoutesDeps,
} from '../src/routes/collab-presence.js';
import {
  createCollabPresenceCloudClient,
  registerCollabPresenceRoutes,
} from '../src/routes/collab-presence.js';

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
  } = {},
) {
  const app = express();
  app.use(express.json());
  registerCollabPresenceRoutes(app, {
    collab: createCollabRuntime(),
    ...(cloud ? { cloud } : {}),
    ...(options.isProjectShared ? { isProjectShared: options.isProjectShared } : {}),
    ...(options.cloudAuthorizesProjectPresence
      ? { cloudAuthorizesProjectPresence: options.cloudAuthorizesProjectPresence }
      : {}),
    ...(options.verifyWorkspaceRequest
      ? { verifyWorkspaceRequest: options.verifyWorkspaceRequest }
      : {}),
  });
  server = http.createServer(app);
  await new Promise<void>((resolve) => server!.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not bind to a TCP port');
  const base = `http://127.0.0.1:${address.port}`;
  return {
    async json(route: string, options: { method?: string; body?: unknown } = {}) {
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

function presentIds(body: Record<string, any>): string[] {
  return (body.present as { memberId: string }[]).map((member) => member.memberId).sort();
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
      { op: 'list', projectId: 'p1' },
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
