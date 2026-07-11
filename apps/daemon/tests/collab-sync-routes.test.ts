import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type WorkspaceCollabContext,
} from '@open-design/contracts';
import {
  createCollabRuntime,
  type CollabRuntime,
  type CreateCollabRuntimeOptions,
} from '../src/collab/runtime.js';
import type { WorkspaceContextProvider } from '../src/collab/workspace-context.js';
import { projectResourceIdFor } from '../src/integrations/vela-team-projects.js';
import {
  registerCollabSyncRoutes,
  type PulledProjectStore,
  type RegisterCollabSyncRoutesDeps,
  type RegisterPulledProjectInput,
} from '../src/routes/collab-sync.js';
import { writeProjectManifest } from '../src/project-locations.js';

/** In-memory project store standing in for the daemon's SQLite-backed store, so
 *  a route test can assert register-on-pull without a real database. */
function fakeProjectStore(): PulledProjectStore & {
  projects: Map<string, RegisterPulledProjectInput>;
  registerCalls: number;
} {
  const projects = new Map<string, RegisterPulledProjectInput>();
  const store = {
    projects,
    registerCalls: 0,
    get: (projectId: string) => projects.get(projectId) ?? null,
    has: (projectId: string) => projects.has(projectId),
    register(input: RegisterPulledProjectInput) {
      store.registerCalls += 1;
      projects.set(input.id, input);
    },
    update(input: RegisterPulledProjectInput) {
      projects.set(input.id, input);
    },
  };
  return store;
}

/** A fixed team context whose `canShareProjects` bit is forced to the tested
 *  value, served by a minimal provider (no `set` seam). */
function fixedShareContextProvider(canShareProjects: boolean): WorkspaceContextProvider {
  const context: WorkspaceCollabContext = {
    workspaceId: 'ws-1',
    workspaceType: 'team',
    workspaceMemberId: 'wm-1',
    role: 'member',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: null,
    providerMode: 'platform_credits',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 5, usedSeats: 1 }),
    permissions: {
      ...buildWorkspacePermissions({ role: 'member', lifecycleState: 'active' }),
      canShareProjects,
    },
  };
  return { current: async () => context };
}

let server: http.Server | null = null;
let runtime: CollabRuntime | null = null;
const tempDirs: string[] = [];

afterEach(async () => {
  runtime?.dispose(); // cancel any pending debounce timers
  runtime = null;
  if (server) {
    const toClose = server;
    server = null;
    await new Promise<void>((resolve) => toClose.close(() => resolve()));
  }
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

async function startSyncServer(
  workspaceContext?: WorkspaceContextProvider,
  extraDeps?: Omit<RegisterCollabSyncRoutesDeps, 'collab'>,
  runtimeOptions?: Omit<CreateCollabRuntimeOptions, 'workspaceContext'>,
) {
  const app = express();
  app.use(express.json());
  runtime = createCollabRuntime({
    ...(runtimeOptions ?? {}),
    ...(workspaceContext ? { workspaceContext } : {}),
  });
  registerCollabSyncRoutes(app, { collab: runtime, ...extraDeps });
  server = http.createServer(app);
  await new Promise<void>((resolve) => server!.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not bind to a TCP port');
  const base = `http://127.0.0.1:${address.port}`;
  return {
    async json(
      route: string,
      options: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
    ) {
      const init: RequestInit = { method: options.method ?? 'GET' };
      if (options.body !== undefined) {
        init.headers = { 'content-type': 'application/json', ...options.headers };
        init.body = JSON.stringify(options.body);
      } else if (options.headers) {
        init.headers = options.headers;
      }
      const response = await fetch(`${base}${route}`, init);
      return { status: response.status, body: (await response.json()) as Record<string, any> };
    },
    // Publishing is async (flush → adapter → onPublished); poll until it lands.
    async awaitPublishedVersion(route: string, notEqualTo: number | null): Promise<number | null> {
      let version = notEqualTo;
      for (let i = 0; i < 40 && version === notEqualTo; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        version = (await this.json(route)).body.publishedVersion;
      }
      return version;
    },
  };
}

describe('collab sync routes', () => {
  it('keeps publish callbacks scoped to every workspace sharing the same project', async () => {
    const onPublished = vi.fn();
    const publish = vi.fn(async (input: { principal?: { memberId?: string } }) => ({
      version: input.principal?.memberId === 'member-a' ? 11 : 22,
    }));
    runtime = createCollabRuntime({
      adapter: { publish },
      onPublished,
    });
    const projectId = 'shared-project';
    const workspaceA = {
      memberId: 'member-a',
      teamId: 'workspace-a',
      role: 'admin' as const,
      lifecycleState: 'active' as const,
    };
    const workspaceB = {
      memberId: 'member-b',
      teamId: 'workspace-b',
      role: 'admin' as const,
      lifecycleState: 'active' as const,
    };

    runtime.requestTeamShare(projectId, workspaceA);
    runtime.requestTeamShare(projectId, workspaceB);

    for (let i = 0; i < 40 && (publish.mock.calls.length < 2 || onPublished.mock.calls.length < 2); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect((publish.mock.calls as unknown as Array<[Record<string, unknown>]>).map((call) => call[0])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ projectId, principal: workspaceA }),
        expect.objectContaining({ projectId, principal: workspaceB }),
      ]),
    );
    expect(onPublished.mock.calls.map((call) => call[0]?.principal)).toEqual(
      expect.arrayContaining([workspaceA, workspaceB]),
    );
    expect(runtime.publishedVersion(projectId, workspaceA)).toBe(11);
    expect(runtime.publishedVersion(projectId, workspaceB)).toBe(22);
    expect(runtime.projectOwnerMemberId(projectId, workspaceA)).toBe('member-a');
    expect(runtime.projectOwnerMemberId(projectId, workspaceB)).toBe('member-b');

    publish.mockClear();
    onPublished.mockClear();
    runtime.scheduler.notifyChanged(projectId, 'save');
    runtime.scheduler.runBoundary(projectId);

    for (
      let i = 0;
      i < 40 &&
      (publish.mock.calls.length < 2 ||
        runtime.publishedVersion(projectId, workspaceA) === null ||
        runtime.publishedVersion(projectId, workspaceB) === null);
      i += 1
    ) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect((publish.mock.calls as unknown as Array<[Record<string, unknown>]>).map((call) => call[0])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ projectId, reason: 'save', principal: workspaceA }),
        expect.objectContaining({ projectId, reason: 'save', principal: workspaceB }),
      ]),
    );
    expect(onPublished.mock.calls.map((call) => call[0]?.principal)).toEqual(
      expect.arrayContaining([workspaceA, workspaceB]),
    );
    expect(runtime.publishedVersion(projectId, workspaceA)).toBe(11);
    expect(runtime.publishedVersion(projectId, workspaceB)).toBe(22);
  });

  it('reports ordinary publish failures to every workspace sharing the same project', async () => {
    let failPublish = false;
    const onError = vi.fn();
    const publish = vi.fn(async (input: { principal?: { memberId?: string } }) => {
      if (failPublish) throw new Error('resource hub unavailable');
      return { version: input.principal?.memberId === 'member-a' ? 11 : 22 };
    });
    runtime = createCollabRuntime({
      adapter: { publish },
      onError,
    });
    const projectId = 'shared-project';
    const workspaceA = {
      memberId: 'member-a',
      teamId: 'workspace-a',
      role: 'admin' as const,
      lifecycleState: 'active' as const,
    };
    const workspaceB = {
      memberId: 'member-b',
      teamId: 'workspace-b',
      role: 'admin' as const,
      lifecycleState: 'active' as const,
    };

    runtime.requestTeamShare(projectId, workspaceA);
    runtime.requestTeamShare(projectId, workspaceB);

    for (
      let i = 0;
      i < 40 &&
      (publish.mock.calls.length < 2 ||
        runtime.publishedVersion(projectId, workspaceA) === null ||
        runtime.publishedVersion(projectId, workspaceB) === null);
      i += 1
    ) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    publish.mockClear();
    onError.mockClear();

    failPublish = true;
    runtime.scheduler.notifyChanged(projectId, 'change');
    runtime.scheduler.runBoundary(projectId);

    for (
      let i = 0;
      i < 40 &&
      (onError.mock.calls.length < 2 ||
        runtime.projectSyncState(projectId, workspaceA) !== 'sync_failed' ||
        runtime.projectSyncState(projectId, workspaceB) !== 'sync_failed');
      i += 1
    ) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(onError.mock.calls.map((call) => call[0]?.principal)).toEqual(
      expect.arrayContaining([workspaceA, workspaceB]),
    );
    expect(runtime.projectSyncState(projectId, workspaceA)).toBe('sync_failed');
    expect(runtime.projectSyncState(projectId, workspaceB)).toBe('sync_failed');
  });

  it('keeps team-project catalog resource ids scoped per workspace principal', async () => {
    const teamProjectCatalog = {
      list: vi.fn(),
      upsert: vi.fn(async () => null),
    };
    runtime = createCollabRuntime({
      teamProjectCatalog,
    });
    const projectId = 'landing';
    const workspaceA = {
      memberId: 'member-a',
      teamId: 'workspace-a',
      role: 'admin' as const,
      lifecycleState: 'active' as const,
    };
    const workspaceB = {
      memberId: 'member-b',
      teamId: 'workspace-b',
      role: 'admin' as const,
      lifecycleState: 'active' as const,
    };

    runtime.requestTeamShare(projectId, workspaceA);
    runtime.requestTeamShare(projectId, workspaceB);

    for (let i = 0; i < 40 && teamProjectCatalog.upsert.mock.calls.length < 2; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const resourceIds = (
      teamProjectCatalog.upsert.mock.calls as unknown as Array<[{
        resourceId?: string;
      }]>
    ).map((call) => call[0]?.resourceId);
    expect(resourceIds).toEqual(
      expect.arrayContaining([
        projectResourceIdFor(projectId, workspaceA),
        projectResourceIdFor(projectId, workspaceB),
      ]),
    );
    expect(projectResourceIdFor(projectId, workspaceA)).not.toBe(projectResourceIdFor(projectId, workspaceB));
  });

  it('restores persisted team-share principals after runtime restart', async () => {
    const projectId = 'shared-after-restart';
    const workspace = {
      memberId: 'member-owner',
      teamId: 'workspace-restart',
      role: 'member' as const,
      lifecycleState: 'active' as const,
    };
    const initialPublish = vi.fn(async () => ({ version: 1 }));
    runtime = createCollabRuntime({
      adapter: { publish: initialPublish },
    });
    runtime.requestTeamShare(projectId, workspace);
    for (let i = 0; i < 40 && initialPublish.mock.calls.length < 1; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    runtime.dispose();

    const publish = vi.fn(async () => ({ version: 2 }));
    runtime = createCollabRuntime({
      adapter: { publish },
    });
    runtime.rememberTeamShare(projectId, workspace, 'synced');

    expect(runtime.projectOwnerMemberId(projectId, workspace)).toBe('member-owner');
    runtime.scheduler.notifyChanged(projectId, 'change');
    runtime.scheduler.runBoundary(projectId);

    for (let i = 0; i < 40 && publish.mock.calls.length < 1; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({
      projectId,
      principal: workspace,
    }));
  });

  it('publishes on request and advances the published version monotonically', async () => {
    const api = await startSyncServer();
    expect((await api.json('/api/projects/p1/collab/status')).body.publishedVersion).toBeNull();

    const pub = await api.json('/api/projects/p1/collab/publish', { method: 'POST' });
    expect(pub.status).toBe(200);
    expect(pub.body.ok).toBe(true);

    const v1 = await api.awaitPublishedVersion('/api/projects/p1/collab/status', null);
    expect(v1).toBe(1);

    await api.json('/api/projects/p1/collab/publish', { method: 'POST' });
    const v2 = await api.awaitPublishedVersion('/api/projects/p1/collab/status', v1);
    expect(v2).toBe(2);
  });

  it('accepts a coalesced change notification', async () => {
    const api = await startSyncServer();
    const res = await api.json('/api/projects/p1/collab/changed', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('keeps published versions independent per project', async () => {
    const api = await startSyncServer();
    await api.json('/api/projects/a/collab/publish', { method: 'POST' });
    await api.awaitPublishedVersion('/api/projects/a/collab/status', null);
    expect((await api.json('/api/projects/b/collab/status')).body.publishedVersion).toBeNull();
  });

  it('reports local_only sync state before any share', async () => {
    const api = await startSyncServer();
    expect((await api.json('/api/projects/p1/collab/status')).body.syncState).toBe('local_only');
  });

  it('drives the visibility-to-sync team-share intent through to synced', async () => {
    const api = await startSyncServer(fixedShareContextProvider(true));
    const intent = await api.json('/api/projects/p1/collab/sync-intent', {
      method: 'POST',
      body: { event: 'project_team_share_requested', projectId: 'p1' },
    });
    expect(intent.status).toBe(200);
    // Team-share is user-facing: the route waits for a durable resource version
    // before reporting success, so teammates never see a catalog-only shell.
    expect(intent.body.syncState).toBe('synced');
    expect(intent.body.publishedVersion).toBe(1);
    expect((await api.json('/api/projects/p1/collab/status')).body.publishedVersion).toBe(1);
  });

  it('moves a team-shared project back to local_only on unshare intent', async () => {
    const api = await startSyncServer(fixedShareContextProvider(true));
    await api.json('/api/projects/p1/collab/sync-intent', {
      method: 'POST',
      body: { event: 'project_team_share_requested', projectId: 'p1' },
    });
    await api.awaitPublishedVersion('/api/projects/p1/collab/status', null);

    const unshare = await api.json('/api/projects/p1/collab/sync-intent', {
      method: 'POST',
      body: { event: 'project_team_unshare_requested', projectId: 'p1' },
    });

    expect(unshare.status).toBe(200);
    expect(unshare.body.syncState).toBe('local_only');
    const status = await api.json('/api/projects/p1/collab/status');
    expect(status.body.syncState).toBe('local_only');
    expect(status.body.publishedVersion).toBeNull();
  });

  it('accepts a visibility-changed intent as a no-op signal', async () => {
    const api = await startSyncServer();
    const res = await api.json('/api/projects/p1/collab/sync-intent', {
      method: 'POST',
      body: { event: 'project_visibility_changed', projectId: 'p1' },
    });
    expect(res.status).toBe(200);
    expect(res.body.syncState).toBe('local_only'); // visibility change alone doesn't publish
  });

  it('rejects an unknown sync intent event', async () => {
    const api = await startSyncServer();
    const res = await api.json('/api/projects/p1/collab/sync-intent', {
      method: 'POST',
      body: { event: 'nonsense', projectId: 'p1' },
    });
    expect(res.status).toBe(400);
  });

  it('refuses a team-share intent from a member without canShareProjects (server-side gate)', async () => {
    // The client hides the share affordance, but the daemon must not trust the
    // client — a member whose context lacks canShareProjects is refused (403),
    // and the project stays local_only (no publish is triggered).
    const api = await startSyncServer(fixedShareContextProvider(false));
    const res = await api.json('/api/projects/p1/collab/sync-intent', {
      method: 'POST',
      body: { event: 'project_team_share_requested', projectId: 'p1' },
    });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('WORKSPACE_PROJECT_SHARE_DENIED');
    expect((await api.json('/api/projects/p1/collab/status')).body.syncState).toBe('local_only');
  });

  it('refuses a team-share intent when no workspace context is available', async () => {
    const api = await startSyncServer({ current: async () => null });
    const res = await api.json('/api/projects/p1/collab/sync-intent', {
      method: 'POST',
      body: { event: 'project_team_share_requested', projectId: 'p1' },
    });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('WORKSPACE_PROJECT_SHARE_DENIED');
    expect((await api.json('/api/projects/p1/collab/status')).body.syncState).toBe('local_only');
  });

  it('honors a team-share intent from a member with canShareProjects', async () => {
    const api = await startSyncServer(fixedShareContextProvider(true));
    const res = await api.json('/api/projects/p1/collab/sync-intent', {
      method: 'POST',
      body: { event: 'project_team_share_requested', projectId: 'p1' },
    });
    expect(res.status).toBe(200);
    expect(res.body.syncState).toBe('synced');
    expect(res.body.publishedVersion).toBe(1);
  });

  it('treats an already shared project owned by another member as shared instead of republishing it', async () => {
    let publishCalls = 0;
    const api = await startSyncServer(
      fixedShareContextProvider(true),
      {
        resolveSharedProject: async () => ({
          projectId: 'p1',
          ownerMemberId: 'wm-owner',
          sharedAt: new Date(1).toISOString(),
          name: 'Owner Project',
        }),
        teamProjectCatalog: {
          upsert: async () => {
            throw new Error('catalog should not be written');
          },
          remove: async () => {},
        },
      },
      {
        adapter: {
          publish: async () => {
            publishCalls += 1;
            throw new Error('resource hub should not be called');
          },
          syncLatest: async () => null,
          pull: async () => {},
          unpublish: async () => {},
        },
      },
    );

    const res = await api.json('/api/projects/p1/collab/sync-intent', {
      method: 'POST',
      body: { event: 'project_team_share_requested', projectId: 'p1' },
    });

    expect(res.status).toBe(200);
    expect(res.body.syncState).toBe('synced');
    expect(publishCalls).toBe(0);
  });

  it('refuses to unshare a project owned by another member', async () => {
    const removes: string[] = [];
    const api = await startSyncServer(fixedShareContextProvider(true), {
      resolveSharedProject: async () => ({
        projectId: 'p1',
        ownerMemberId: 'wm-owner',
        sharedAt: new Date(1).toISOString(),
        name: 'Owner Project',
      }),
      teamProjectCatalog: {
        upsert: async () => {},
        remove: async (projectId) => {
          removes.push(projectId);
        },
      },
    });

    const res = await api.json('/api/projects/p1/collab/sync-intent', {
      method: 'POST',
      body: { event: 'project_team_unshare_requested', projectId: 'p1' },
    });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('WORKSPACE_PROJECT_UNSHARE_DENIED');
    expect(removes).toEqual([]);
  });

  it('writes and removes the Vela team-project catalog around share intents', async () => {
    const writes: unknown[] = [];
    const removes: string[] = [];
    const api = await startSyncServer(fixedShareContextProvider(true), {
      describeProject: () => ({
        name: 'Electric Studio 2',
        skillId: null,
        designSystemId: null,
        createdAt: 1,
        updatedAt: 2,
      }),
      teamProjectCatalog: {
        upsert: async (input) => {
          writes.push(input);
        },
        remove: async (projectId) => {
          removes.push(projectId);
        },
      },
    });

    const share = await api.json('/api/projects/p1/collab/sync-intent', {
      method: 'POST',
      body: { event: 'project_team_share_requested', projectId: 'p1' },
    });
    expect(share.status).toBe(200);
    expect(writes).toEqual([
      {
        projectId: 'p1',
        displayName: 'Electric Studio 2',
        syncState: 'synced',
        metadata: {
          name: 'Electric Studio 2',
          skillId: null,
          designSystemId: null,
          createdAt: 1,
          updatedAt: 2,
        },
      },
    ]);

    const unshare = await api.json('/api/projects/p1/collab/sync-intent', {
      method: 'POST',
      body: { event: 'project_team_unshare_requested', projectId: 'p1' },
    });
    expect(unshare.status).toBe(200);
    expect(removes).toEqual(['p1']);
  });

  it('does not pretend a project is shared when the Vela catalog write fails', async () => {
    const api = await startSyncServer(fixedShareContextProvider(true), {
      teamProjectCatalog: {
        upsert: async () => {
          throw new Error('catalog unavailable');
        },
        remove: async () => {},
      },
    });

    const res = await api.json('/api/projects/p1/collab/sync-intent', {
      method: 'POST',
      body: { event: 'project_team_share_requested', projectId: 'p1' },
    });
    expect(res.status).toBe(502);
    expect(res.body.error).toBe('TEAM_PROJECT_CATALOG_UNAVAILABLE');
    expect((await api.json('/api/projects/p1/collab/status')).body.syncState).toBe('local_only');
  });

  it('does not write the team catalog when resource publishing fails', async () => {
    const writes: unknown[] = [];
    const api = await startSyncServer(
      fixedShareContextProvider(true),
      {
        teamProjectCatalog: {
          upsert: async (input) => {
            writes.push(input);
          },
          remove: async () => {},
        },
      },
      {
        adapter: {
          publish: async () => {
            throw new Error('resource hub unavailable');
          },
          syncLatest: async () => null,
          pull: async () => {},
          unpublish: async () => {},
        },
      },
    );

    const res = await api.json('/api/projects/p1/collab/sync-intent', {
      method: 'POST',
      body: { event: 'project_team_share_requested', projectId: 'p1' },
    });

    expect(res.status).toBe(502);
    expect(res.body.error).toBe('TEAM_PROJECT_PUBLISH_UNAVAILABLE');
    expect(writes).toEqual([]);
    expect((await api.json('/api/projects/p1/collab/status')).body.syncState).toBe('sync_failed');
  });

  it('uses header-only workspace identity for sync intent, status, and pull', async () => {
    const api = await startSyncServer({ current: async () => null });
    const headers = {
      'x-od-workspace-id': 'ws-header',
      'x-od-workspace-member-id': 'member-header',
      'x-od-workspace-role': 'admin',
    };

    const intent = await api.json('/api/projects/p1/collab/sync-intent', {
      method: 'POST',
      headers,
      body: { event: 'project_team_share_requested', projectId: 'p1' },
    });
    expect(intent.status).toBe(200);
    expect(['pending_upload', 'synced']).toContain(intent.body.syncState);

    let status = await api.json('/api/projects/p1/collab/status', { headers });
    for (let i = 0; i < 40 && status.body.syncState !== 'synced'; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      status = await api.json('/api/projects/p1/collab/status', { headers });
    }
    expect(status.body).toMatchObject({
      syncState: 'synced',
      ownerMemberId: 'member-header',
      publishedVersion: 1,
    });

    const pull = await api.json('/api/projects/p1/collab/pull', { method: 'POST', headers });
    expect(pull.status).toBe(200);
    expect(pull.body.version).toBe(1);
  });

  it('pulls the published head for a member (null before any publish)', async () => {
    const api = await startSyncServer();
    const before = await api.json('/api/projects/p1/collab/pull', { method: 'POST' });
    expect(before.status).toBe(200);
    expect(before.body.version).toBeNull();

    await api.json('/api/projects/p1/collab/publish', { method: 'POST' });
    await api.awaitPublishedVersion('/api/projects/p1/collab/status', null);
    const after = await api.json('/api/projects/p1/collab/pull', { method: 'POST' });
    expect(after.body.version).toBe(1);
  });

  it('does not register a placeholder project when there is no published version to pull', async () => {
    const store = fakeProjectStore();
    const api = await startSyncServer(undefined, { projectStore: store });

    const pull = await api.json('/api/projects/unpublished-shared/collab/pull', { method: 'POST' });
    expect(pull.status).toBe(200);
    expect(pull.body.version).toBeNull();
    expect(store.has('unpublished-shared')).toBe(false);
  });

  it('fails the pull route when a pulled shared project cannot be registered locally', async () => {
    const api = await startSyncServer(undefined, {
      projectStore: {
        get: () => null,
        has: () => false,
        register: () => {
          throw new Error('project store unavailable');
        },
      },
      resolvePullDir: (projectId) => `/does/not/exist/${projectId}`,
    });

    await api.json('/api/projects/shared-register-fail/collab/publish', { method: 'POST' });
    await api.awaitPublishedVersion('/api/projects/shared-register-fail/collab/status', null);
    const pull = await api.json('/api/projects/shared-register-fail/collab/pull', { method: 'POST' });
    expect(pull.status).toBe(502);
    expect(pull.body.error).toBe('TEAM_PROJECT_PULL_REGISTER_UNAVAILABLE');
  });

  it('registers a pulled shared project locally so it appears in the project store', async () => {
    const store = fakeProjectStore();
    const api = await startSyncServer(undefined, {
      projectStore: store,
      resolvePullDir: (projectId) => `/does/not/exist/${projectId}`,
    });

    expect(store.has('shared-1')).toBe(false);
    await api.json('/api/projects/shared-1/collab/publish', { method: 'POST' });
    await api.awaitPublishedVersion('/api/projects/shared-1/collab/status', null);
    const pull = await api.json('/api/projects/shared-1/collab/pull', { method: 'POST' });
    expect(pull.status).toBe(200);

    // The pull registered a local project record. With no manifest under the
    // (non-existent) pull dir, it falls back to the placeholder name.
    expect(store.has('shared-1')).toBe(true);
    expect(store.projects.get('shared-1')?.name).toBe('共享项目');
  });

  it('prefers the hub project name and metadata when registering a pulled project', async () => {
    const store = fakeProjectStore();
    const api = await startSyncServer(undefined, {
      projectStore: store,
      resolvePullDir: (projectId) => `/does/not/exist/${projectId}`,
      resolveSharedProject: async (projectId) => ({
        projectId,
        ownerMemberId: 'wm-owner',
        sharedAt: '2026-07-09T00:00:00.000Z',
        name: 'Emerald Editorial',
        skillId: 'deck-builder',
        designSystemId: 'ds-emerald',
        createdAt: 123,
        updatedAt: 456,
        metadata: { kind: 'deck', entryFile: 'index.html' },
      }),
    });

    await api.json('/api/projects/shared-from-hub/collab/publish', { method: 'POST' });
    await api.awaitPublishedVersion('/api/projects/shared-from-hub/collab/status', null);
    const pull = await api.json('/api/projects/shared-from-hub/collab/pull', { method: 'POST' });
    expect(pull.status).toBe(200);

    const registered = store.projects.get('shared-from-hub');
    expect(registered?.name).toBe('Emerald Editorial');
    expect(registered?.skillId).toBe('deck-builder');
    expect(registered?.designSystemId).toBe('ds-emerald');
    expect(registered?.createdAt).toBe(123);
    expect(registered?.updatedAt).toBe(456);
    expect(registered?.metadata).toEqual({ kind: 'deck', entryFile: 'index.html' });
  });

  it('registers a pulled shared project under its real name from the manifest', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'od-pull-'));
    tempDirs.push(dir);
    // The shared tree carries the owner's project manifest; register-on-pull
    // reads it so the local record shows the real name after opening.
    await writeProjectManifest(dir, {
      schemaVersion: 1,
      id: 'shared-2',
      name: 'Team Roadmap',
      createdAt: 111,
      updatedAt: 222,
      skillId: 'live-artifact',
      designSystemId: 'ds-9',
    });

    const store = fakeProjectStore();
    const api = await startSyncServer(undefined, {
      projectStore: store,
      resolvePullDir: () => dir,
    });

    await api.json('/api/projects/shared-2/collab/publish', { method: 'POST' });
    await api.awaitPublishedVersion('/api/projects/shared-2/collab/status', null);
    await api.json('/api/projects/shared-2/collab/pull', { method: 'POST' });
    const registered = store.projects.get('shared-2');
    expect(registered?.name).toBe('Team Roadmap');
    expect(registered?.skillId).toBe('live-artifact');
    expect(registered?.designSystemId).toBe('ds-9');
    expect(registered?.createdAt).toBe(111);
    expect(registered?.updatedAt).toBe(222);
  });

  it('infers a pulled shared project name from the bundled skill manifest when no project manifest exists', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'od-pull-'));
    tempDirs.push(dir);
    await mkdir(path.join(dir, '.od-skills', 'fs-emerald'), { recursive: true });
    await writeFile(
      path.join(dir, '.od-skills', 'fs-emerald', 'open-design.json'),
      JSON.stringify({ title: 'Emerald Editorial', name: 'example-fs-emerald-editorial' }),
    );

    const store = fakeProjectStore();
    const api = await startSyncServer(undefined, {
      projectStore: store,
      resolvePullDir: () => dir,
    });

    await api.json('/api/projects/shared-skill/collab/publish', { method: 'POST' });
    await api.awaitPublishedVersion('/api/projects/shared-skill/collab/status', null);
    await api.json('/api/projects/shared-skill/collab/pull', { method: 'POST' });
    expect(store.projects.get('shared-skill')?.name).toBe('Emerald Editorial');
  });

  it('repairs an existing placeholder pulled project name once pulled files expose a title', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'od-pull-'));
    tempDirs.push(dir);
    await mkdir(path.join(dir, '.od-skills', 'fs-emerald'), { recursive: true });
    await writeFile(
      path.join(dir, '.od-skills', 'fs-emerald', 'open-design.json'),
      JSON.stringify({ title: 'Emerald Editorial' }),
    );

    const store = fakeProjectStore();
    store.register({
      id: 'shared-placeholder',
      name: '共享项目',
      skillId: null,
      designSystemId: null,
      createdAt: 1,
      updatedAt: 1,
    });

    const api = await startSyncServer(undefined, {
      projectStore: store,
      resolvePullDir: () => dir,
    });

    await api.json('/api/projects/shared-placeholder/collab/publish', { method: 'POST' });
    await api.awaitPublishedVersion('/api/projects/shared-placeholder/collab/status', null);
    await api.json('/api/projects/shared-placeholder/collab/pull', { method: 'POST' });
    expect(store.registerCalls).toBe(1);
    expect(store.projects.get('shared-placeholder')?.name).toBe('Emerald Editorial');
  });

  it('is idempotent — a pull for an already-local project does not re-register it', async () => {
    const store = fakeProjectStore();
    store.register({
      id: 'shared-3',
      name: 'Already Local',
      skillId: null,
      designSystemId: null,
      createdAt: 1,
      updatedAt: 1,
    });
    expect(store.registerCalls).toBe(1);

    const api = await startSyncServer(undefined, {
      projectStore: store,
      resolvePullDir: (projectId) => `/does/not/exist/${projectId}`,
    });

    await api.json('/api/projects/shared-3/collab/pull', { method: 'POST' });
    // Still exactly one registration; the existing record is left untouched.
    expect(store.registerCalls).toBe(1);
    expect(store.projects.get('shared-3')?.name).toBe('Already Local');
  });

  it('derives read-only from the hub at status time — no pull or in-memory record needed', async () => {
    const api = await startSyncServer(undefined, {
      resolveSharedProjectOwner: async (projectId) =>
        projectId === 'shared-ro' ? 'wm-owner' : null,
    });

    // Straight to status: no pull, no in-memory share record. A project the hub
    // lists as shared by wm-owner reports synced + that owner, so a non-owner
    // member's client (`shared && !isOwner`) renders it single-writer read-only.
    // Deriving every read is what makes read-only survive a daemon restart (which
    // clears the in-memory maps) and an already-pulled project opened without a
    // re-pull — the bug was the pull never recording this at all.
    const status = await api.json('/api/projects/shared-ro/collab/status');
    expect(status.body.syncState).toBe('synced');
    expect(status.body.ownerMemberId).toBe('wm-owner');
  });

  it('leaves a project the hub does not list editable (local_only)', async () => {
    const api = await startSyncServer(undefined, {
      resolveSharedProjectOwner: async () => null,
    });
    const status = await api.json('/api/projects/not-shared/collab/status');
    // Not team-shared → no read-only: the member keeps full edit on their own
    // local project. Read-only never fires just because a status probe ran.
    expect(status.body.syncState).toBe('local_only');
    expect(status.body.ownerMemberId).toBeNull();
  });
});
