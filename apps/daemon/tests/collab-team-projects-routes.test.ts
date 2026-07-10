import { afterEach, describe, expect, it } from 'vitest';
import express from 'express';
import http from 'node:http';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type TeamProject,
  type WorkspaceCollabContext,
} from '@open-design/contracts';
import { registerCollabContextRoutes } from '../src/routes/collab-context.js';
import { createTeamProjectsLister } from '../src/collab/team-projects.js';
import type { WorkspaceContextProvider } from '../src/collab/workspace-context.js';
import type {
  ResourceHubClient,
  ResourceRecord,
} from '../src/integrations/resource-hub.js';

// A resource-hub index carrying one shared project and one shared design system.
// The lister must surface only the project, with the `project-` id prefix stripped
// back to the local projectId a member pulls + opens.
const HUB_RESOURCES: ResourceRecord[] = [
  {
    id: 'project-p1',
    teamId: 't1',
    kind: 'project',
    ownerMemberId: 'wm-owner',
    metadata: {
      name: 'Launch Deck',
      skillId: null,
      designSystemId: null,
      createdAt: 1_784_000_000_000,
      updatedAt: 1_784_000_060_000,
      metadata: { kind: 'deck' },
    },
    createdAt: '2026-07-01T00:00:00.000Z',
    deletedAt: null,
  },
  {
    id: 'ds-user-palette',
    teamId: 't1',
    kind: 'design_system',
    ownerMemberId: 'wm-owner',
    metadata: {},
    createdAt: '2026-07-02T00:00:00.000Z',
    deletedAt: null,
  },
];

/** A minimal hub client whose `listResources` returns the fixture above; only
 *  that method is exercised by the lister, so the rest is cast away. */
function fakeHubClient(resources: ResourceRecord[]): ResourceHubClient {
  return {
    listResources: async () => resources,
  } as unknown as ResourceHubClient;
}

/** A team workspace context so `contextToResourceHubPrincipal` yields a non-null
 *  principal (requires `workspaceType === 'team'` + `teamId`). */
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
    permissions: buildWorkspacePermissions({ role: 'member', lifecycleState: 'active' }),
    teamId: 't1',
  };
  return { current: async () => context };
}

/** A personal (off-team) context so the principal resolves to null. */
function personalContextProvider(): WorkspaceContextProvider {
  return { current: async () => null };
}

let server: http.Server | null = null;

afterEach(async () => {
  if (server) {
    const toClose = server;
    server = null;
    await new Promise<void>((resolve) => toClose.close(() => resolve()));
  }
});

async function startServer(deps: {
  workspaceContext: WorkspaceContextProvider;
  listTeamProjects: () => Promise<import('@open-design/contracts').TeamProject[]>;
}) {
  const app = express();
  app.use(express.json());
  registerCollabContextRoutes(app, deps);
  server = http.createServer(app);
  await new Promise<void>((resolve) => server!.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not bind to a TCP port');
  const base = `http://127.0.0.1:${address.port}`;
  return {
    async get(route: string) {
      const response = await fetch(`${base}${route}`);
      return { status: response.status, body: (await response.json()) as Record<string, any> };
    },
  };
}

describe('GET /api/workspace/projects/team', () => {
  it('returns only shared projects, prefix-stripped, from the hub index', async () => {
    const workspaceContext = teamContextProvider();
    const listTeamProjects = createTeamProjectsLister({
      workspaceContext,
      client: fakeHubClient(HUB_RESOURCES),
    });
    const api = await startServer({ workspaceContext, listTeamProjects });

    const res = await api.get('/api/workspace/projects/team');
    expect(res.status).toBe(200);
    // The design system is filtered out; the project's `project-` prefix is stripped.
    expect(res.body).toEqual({
      projects: [
        {
          projectId: 'p1',
          ownerMemberId: 'wm-owner',
          sharedAt: '2026-07-01T00:00:00.000Z',
          name: 'Launch Deck',
          skillId: null,
          designSystemId: null,
          createdAt: 1_784_000_000_000,
          updatedAt: 1_784_000_060_000,
          metadata: { kind: 'deck' },
        },
      ],
    });
  });

  it('lists shared projects through the vela resource CLI transport', async () => {
    const workspaceContext = teamContextProvider();
    const calls: string[][] = [];
    const listTeamProjects = createTeamProjectsLister({
      workspaceContext,
      env: { OD_RESOURCE_TRANSPORT: 'vela-cli', OD_TEAM_PROJECTS_TRANSPORT: 'resource-hub' },
      runVelaResource: async (args) => {
        calls.push(args);
        return JSON.stringify({ resources: HUB_RESOURCES });
      },
    });
    const api = await startServer({ workspaceContext, listTeamProjects });

    const res = await api.get('/api/workspace/projects/team');
    expect(res.status).toBe(200);
    expect(calls).toEqual([['shared', '--json']]);
    expect(res.body).toEqual({
      projects: [
        {
          projectId: 'p1',
          ownerMemberId: 'wm-owner',
          sharedAt: '2026-07-01T00:00:00.000Z',
          name: 'Launch Deck',
          skillId: null,
          designSystemId: null,
          createdAt: 1_784_000_000_000,
          updatedAt: 1_784_000_060_000,
          metadata: { kind: 'deck' },
        },
      ],
    });
  });

  it('lists shared projects through Vela team-project catalog when enabled', async () => {
    const workspaceContext = teamContextProvider();
    const projects: TeamProject[] = [
      {
        projectId: 'p1',
        ownerMemberId: 'wm-owner',
        sharedAt: '2026-07-01T00:00:00.000Z',
        name: 'Launch Deck',
      },
    ];
    const calls: string[] = [];
    const listTeamProjects = createTeamProjectsLister({
      workspaceContext,
      env: { OD_TEAM_PROJECTS_TRANSPORT: 'vela-cli', OD_RESOURCE_TRANSPORT: 'vela-cli' },
      runVelaResource: async () => {
        throw new Error('resource transport should not be used');
      },
      teamProjectCatalog: {
        list: async () => {
          calls.push('list');
          return projects;
        },
        upsert: async () => {},
        remove: async () => {},
      },
    });
    const api = await startServer({ workspaceContext, listTeamProjects });

    const res = await api.get('/api/workspace/projects/team');
    expect(res.status).toBe(200);
    expect(calls).toEqual(['list']);
    expect(res.body).toEqual({ projects });
  });

  it('returns an empty list off-team (no principal)', async () => {
    const workspaceContext = personalContextProvider();
    const listTeamProjects = createTeamProjectsLister({
      workspaceContext,
      client: fakeHubClient(HUB_RESOURCES),
    });
    const api = await startServer({ workspaceContext, listTeamProjects });

    const res = await api.get('/api/workspace/projects/team');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ projects: [] });
  });
});
