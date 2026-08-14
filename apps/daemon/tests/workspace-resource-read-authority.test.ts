import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceCollabContext } from '@open-design/contracts';

import { registerPluginRoutes } from '../src/routes/plugins/index.js';
import { registerStaticResourceRoutes } from '../src/routes/static-resource.js';

const servers: Array<ReturnType<express.Express['listen']>> = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
});

const AUTHORITY: WorkspaceCollabContext = {
  workspaceId: 'workspace-team',
  workspaceName: 'Team',
  workspaceType: 'team',
  workspaceMemberId: 'member-1',
  role: 'owner',
  memberStatus: 'active',
  lifecycleState: 'active',
  billingState: 'active',
  planId: null,
  providerMode: 'platform_credits',
  seatSummary: {
    seatLimit: 1,
    usedSeats: 1,
    availableSeats: 0,
    isSeatFull: true,
  },
  permissions: {
    canManageMembers: true,
    canManageBilling: true,
    canInviteMembers: true,
    canManageAutoRecharge: true,
    canShareProjects: true,
    canWriteSyncedFiles: true,
    canViewWorkspaceSettings: true,
    canManageSharedResources: true,
  },
};

function verifier() {
  return vi.fn(async () => ({ ok: true as const, context: AUTHORITY }));
}

async function listen(app: express.Express): Promise<string> {
  const server = app.listen(0, '127.0.0.1');
  servers.push(server);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

function localHeaders(): Record<string, string> {
  return {
    'x-od-workspace-id': AUTHORITY.workspaceId,
    'x-od-workspace-member-id': AUTHORITY.workspaceMemberId,
    'x-od-workspace-type': AUTHORITY.workspaceType,
    'x-od-workspace-role': AUTHORITY.role,
    'x-od-workspace-member-status': AUTHORITY.memberStatus,
    'x-od-workspace-lifecycle-state': AUTHORITY.lifecycleState,
  };
}

describe('Workspace resource read authority wiring', () => {
  it('uses the settled verifier only for Skill and Design System catalog GETs', async () => {
    const app = express();
    const verifyWorkspaceReadAuthority = verifier();
    const verifyWorkspaceRequestAuthority = verifier();

    registerStaticResourceRoutes(app, {
      db: {} as never,
      http: {
        isLocalSameOrigin: () => true,
        resolvedPortRef: { current: 0 },
        sendApiError: (
          res: express.Response,
          status: number,
          code: string,
          message: string,
        ) => res.status(status).json({ error: code, message }),
      },
      paths: {
        PROJECT_ROOT: '',
        RUNTIME_DATA_DIR: '',
        RUNTIME_DATA_DIR_CANONICAL: '',
        DESIGN_SYSTEMS_DIR: '',
        USER_DESIGN_SYSTEMS_DIR: '',
        DESIGN_TEMPLATES_DIR: '',
        USER_DESIGN_TEMPLATES_DIR: '',
        SKILLS_DIR: '',
        USER_SKILLS_DIR: '',
        PROMPT_TEMPLATES_DIR: '',
        BUNDLED_PETS_DIR: '',
      },
      verifyWorkspaceReadAuthority,
      verifyWorkspaceRequestAuthority,
      resources: {
        listAllSkills: async () => [
          { id: 'skill-1', body: '# Skill', dir: '/unused' },
        ],
        listAllDesignTemplates: async () => [],
        listAllSkillLikeEntries: async () => [],
        listAllDesignSystems: async () => [],
        mimeFor: () => 'application/octet-stream',
      },
    } as unknown as Parameters<typeof registerStaticResourceRoutes>[1]);

    const baseUrl = await listen(app);
    const headers = localHeaders();
    const [skills, designSystems] = await Promise.all([
      fetch(`${baseUrl}/api/skills`, { headers }),
      fetch(`${baseUrl}/api/design-systems`, { headers }),
    ]);

    expect(skills.status).toBe(200);
    expect(designSystems.status).toBe(200);
    await expect(skills.json()).resolves.toEqual({
      skills: [{ id: 'skill-1', hasBody: true }],
    });
    await expect(designSystems.json()).resolves.toEqual({ designSystems: [] });
    expect(verifyWorkspaceReadAuthority).toHaveBeenCalledTimes(2);
    expect(verifyWorkspaceRequestAuthority).not.toHaveBeenCalled();

    const detail = await fetch(`${baseUrl}/api/skills/skill-1`, { headers });
    expect(detail.status).toBe(200);
    await expect(detail.json()).resolves.toMatchObject({
      id: 'skill-1',
      body: '# Skill',
    });
    expect(verifyWorkspaceRequestAuthority).toHaveBeenCalledTimes(1);
  });

  it('uses the settled verifier only for the Plugin catalog GET', async () => {
    const app = express();
    const verifyWorkspaceReadAuthority = verifier();
    const verifyWorkspaceRequestAuthority = verifier();
    const plugin = { id: 'plugin-1', source: '/unused/plugin-1' };

    registerPluginRoutes(app, {
      db: {
        prepare: () => ({ all: () => [], get: () => null, run: () => undefined }),
        transaction: (run: () => unknown) => () => run(),
      },
      authorizeProjectRequest: async () => ({ ok: true }),
      paths: {
        PROJECTS_DIR: '',
        PLUGIN_REGISTRY_ROOTS: [],
        PLUGIN_LOCKFILE_PATH: '',
      },
      ids: { randomId: () => 'unused' },
      projectStore: {},
      conversations: {},
      verifyWorkspaceReadAuthority,
      verifyWorkspaceRequestAuthority,
      plugins: {
        listInstalledPlugins: async () => [plugin],
        getInstalledPlugin: () => plugin,
        getWorkspacePlugin: async () => plugin,
      },
      helpers: {
        applyBakedPreviews: (plugins: unknown) => plugins,
        PLUGIN_PREVIEWS_DIR: '',
        requireLocalDaemonRequest: (
          _req: express.Request,
          _res: express.Response,
          next: express.NextFunction,
        ) => next(),
        sendApiError: (
          res: express.Response,
          status: number,
          code: string,
          message: string,
        ) => res.status(status).json({ error: code, message }),
      },
    } as unknown as Parameters<typeof registerPluginRoutes>[1]);

    const baseUrl = await listen(app);
    const headers = localHeaders();
    const listing = await fetch(`${baseUrl}/api/plugins`, { headers });

    expect(listing.status).toBe(200);
    await expect(listing.json()).resolves.toEqual({ plugins: [plugin] });
    expect(verifyWorkspaceReadAuthority).toHaveBeenCalledTimes(1);
    expect(verifyWorkspaceRequestAuthority).not.toHaveBeenCalled();

    const detail = await fetch(`${baseUrl}/api/plugins/plugin-1`, { headers });
    expect(detail.status).toBe(200);
    await expect(detail.json()).resolves.toEqual(plugin);
    expect(verifyWorkspaceRequestAuthority).toHaveBeenCalledTimes(1);
  });
});
