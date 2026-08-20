import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type TeamProject,
  type WorkspaceCollabContext,
} from '@open-design/contracts';
import { createTeamProjectsLister } from '../src/collab/team-projects.js';
import type { WorkspaceContextProvider } from '../src/collab/workspace-context.js';
import {
  registerCollabContextRoutes,
  type RegisterCollabContextRoutesDeps,
} from '../src/routes/collab-context.js';

const PROJECTS: TeamProject[] = [
  {
    projectId: 'p1',
    ownerMemberId: 'wm-owner',
    sharedAt: '2026-07-01T00:00:00.000Z',
    name: 'Launch Deck',
  },
];

function teamContextProvider(): WorkspaceContextProvider {
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
    permissions: buildWorkspacePermissions({
      role: 'member',
      lifecycleState: 'active',
    }),
    teamId: 't1',
  };
  return { current: async () => context };
}

function personalContextProvider(): WorkspaceContextProvider {
  return { current: async () => null };
}

let server: http.Server | null = null;

afterEach(async () => {
  if (!server) return;
  const toClose = server;
  server = null;
  await new Promise<void>((resolve) => toClose.close(() => resolve()));
});

async function startServer(deps: {
  workspaceContext: WorkspaceContextProvider;
  listTeamProjects: (context: WorkspaceCollabContext) => Promise<TeamProject[]>;
  fetchWorkspaceDirectory?: () => Promise<{
    ok: boolean;
    items: Array<{
      workspaceId: string;
      workspaceName: string;
      workspaceType: 'personal' | 'team';
      workspaceMemberId: string;
      role: 'owner' | 'admin' | 'member';
      memberStatus: 'active' | 'removed';
      lifecycleState: 'active' | 'billing_past_due' | 'locked' | 'deleting' | 'deleted';
    }>;
  }>;
  verifyWorkspaceReadAuthority?: RegisterCollabContextRoutesDeps['verifyWorkspaceReadAuthority'];
}) {
  const app = express();
  app.use(express.json());
  registerCollabContextRoutes(app, {
    workspaceContext: deps.workspaceContext,
    listTeamProjects: deps.listTeamProjects,
    ...(deps.fetchWorkspaceDirectory
      ? { fetchWorkspaceDirectory: deps.fetchWorkspaceDirectory }
      : {}),
    ...(deps.verifyWorkspaceReadAuthority
      ? { verifyWorkspaceReadAuthority: deps.verifyWorkspaceReadAuthority }
      : {}),
  });
  server = http.createServer(app);
  await new Promise<void>((resolve) => server!.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('server did not bind to a TCP port');
  }
  return async (headers?: Record<string, string>) => {
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/workspace/projects/team`,
      headers ? { headers } : undefined,
    );
    return {
      status: response.status,
      body: (await response.json()) as Record<string, unknown>,
    };
  };
}

describe('GET /api/workspace/projects/team', () => {
  it('uses the settled exact-scope verifier without listing the account directory', async () => {
    const verified = teamContextProvider().current({});
    const fetchWorkspaceDirectory = vi.fn(async () => {
      throw new Error('directory should not run');
    });
    const get = await startServer({
      workspaceContext: teamContextProvider(),
      listTeamProjects: async () => PROJECTS,
      fetchWorkspaceDirectory,
      verifyWorkspaceReadAuthority: async () => ({
        ok: true,
        context: (await verified)!,
      }),
    });

    const response = await get({
      'x-od-workspace-id': 'ws-1',
      'x-od-workspace-member-id': 'wm-1',
      'x-od-workspace-type': 'team',
    });

    expect(response).toEqual({ status: 200, body: { projects: PROJECTS } });
    expect(fetchWorkspaceDirectory).not.toHaveBeenCalled();
  });

  it('uses the request workspace rather than the daemon ambient workspace', async () => {
    const seen: unknown[] = [];
    const listTeamProjects = async (scope: WorkspaceCollabContext) => {
      seen.push(scope);
      return PROJECTS;
    };
    const get = await startServer({
      workspaceContext: teamContextProvider(),
      listTeamProjects,
      fetchWorkspaceDirectory: async () => ({
        ok: true,
        items: [
          {
            workspaceId: 'team-a',
            workspaceName: 'Team A',
            workspaceType: 'team',
            workspaceMemberId: 'member-a',
            role: 'member',
            memberStatus: 'active',
            lifecycleState: 'active',
          },
        ],
      }),
    });

    const response = await get({
      'x-od-workspace-id': 'team-a',
      'x-od-workspace-member-id': 'member-a',
      'x-od-workspace-type': 'team',
    });

    expect(response.status).toBe(200);
    expect(seen).toEqual([
      expect.objectContaining({
        workspaceId: 'team-a',
        workspaceMemberId: 'member-a',
      }),
    ]);
  });

  it('lists projects through the injected Vela team-project catalog', async () => {
    const workspaceContext = teamContextProvider();
    const calls: string[] = [];
    const listTeamProjects = createTeamProjectsLister({
      env: { OD_WORKSPACE_CONTEXT_SOURCE: 'vela' },
      teamProjectCatalog: {
        list: async (workspaceId) => {
          calls.push(workspaceId ?? '');
          return PROJECTS;
        },
        get: async () => null,
        upsert: async () => {},
        remove: async () => {},
      },
    });
    const get = await startServer({
      workspaceContext,
      listTeamProjects: (context) => listTeamProjects(context.workspaceId),
      fetchWorkspaceDirectory: async () => ({
        ok: true,
        items: [
          {
            workspaceId: 'ws-1',
            workspaceName: 'Workspace 1',
            workspaceType: 'team',
            workspaceMemberId: 'wm-1',
            role: 'member',
            memberStatus: 'active',
            lifecycleState: 'active',
          },
        ],
      }),
    });

    const response = await get({
      'x-od-workspace-id': 'ws-1',
      'x-od-workspace-member-id': 'wm-1',
      'x-od-workspace-type': 'team',
    });
    expect(response.status).toBe(200);
    expect(calls).toEqual(['ws-1']);
    expect(response.body).toEqual({ projects: PROJECTS });
  });

  it('returns a retryable unavailable error when the team-project catalog throws', async () => {
    const get = await startServer({
      workspaceContext: teamContextProvider(),
      listTeamProjects: async () => {
        throw new Error('temporary Vela outage');
      },
      fetchWorkspaceDirectory: async () => ({
        ok: true,
        items: [
          {
            workspaceId: 'ws-1',
            workspaceName: 'Workspace 1',
            workspaceType: 'team',
            workspaceMemberId: 'wm-1',
            role: 'member',
            memberStatus: 'active',
            lifecycleState: 'active',
          },
        ],
      }),
    });

    const response = await get({
      'x-od-workspace-id': 'ws-1',
      'x-od-workspace-member-id': 'wm-1',
      'x-od-workspace-type': 'team',
    });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: {
        code: 'UPSTREAM_UNAVAILABLE',
        message: 'team project catalog is temporarily unavailable',
        retryable: true,
      },
    });
  });

  it('preserves a successful empty team-project catalog as a valid response', async () => {
    const get = await startServer({
      workspaceContext: teamContextProvider(),
      listTeamProjects: async () => [],
      fetchWorkspaceDirectory: async () => ({
        ok: true,
        items: [
          {
            workspaceId: 'ws-1',
            workspaceName: 'Workspace 1',
            workspaceType: 'team',
            workspaceMemberId: 'wm-1',
            role: 'member',
            memberStatus: 'active',
            lifecycleState: 'active',
          },
        ],
      }),
    });

    const response = await get({
      'x-od-workspace-id': 'ws-1',
      'x-od-workspace-member-id': 'wm-1',
      'x-od-workspace-type': 'team',
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ projects: [] });
  });

  it('returns an empty list off-team without invoking Vela', async () => {
    const workspaceContext = personalContextProvider();
    const listTeamProjects = createTeamProjectsLister({
      env: { OD_WORKSPACE_CONTEXT_SOURCE: 'vela' },
      teamProjectCatalog: {
        list: async () => {
          throw new Error('catalog should not be read off-team');
        },
        get: async () => null,
        upsert: async () => {},
        remove: async () => {},
      },
    });
    const get = await startServer({
      workspaceContext,
      listTeamProjects: (context) => listTeamProjects(context.workspaceId),
      fetchWorkspaceDirectory: async () => ({
        ok: true,
        items: [
          {
            workspaceId: 'personal-1',
            workspaceName: 'Personal',
            workspaceType: 'personal',
            workspaceMemberId: 'wm-personal',
            role: 'owner',
            memberStatus: 'active',
            lifecycleState: 'active',
          },
        ],
      }),
    });

    const response = await get({
      'x-od-workspace-id': 'personal-1',
      'x-od-workspace-member-id': 'wm-personal',
      'x-od-workspace-type': 'personal',
    });
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: 'WORKSPACE_ACCESS_DENIED' });
  });
});
