import express from 'express';
import type http from 'node:http';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import { registerStaticResourceRoutes } from '../src/routes/static-resource.js';

const servers: http.Server[] = [];
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => server.close(() => resolve())),
    ),
  );
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

function context(
  workspaceId: string,
  workspaceMemberId: string,
): WorkspaceCollabContext {
  return {
    workspaceId,
    workspaceName: workspaceId,
    workspaceType: 'team',
    workspaceMemberId,
    role: 'member',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: null,
    providerMode: 'platform_credits',
    seatSummary: {
      seatLimit: 5,
      usedSeats: 1,
      availableSeats: 4,
      isSeatFull: false,
    },
    permissions: {
      canManageMembers: false,
      canManageBilling: false,
      canInviteMembers: false,
      canManageAutoRecharge: false,
      canShareProjects: true,
      canWriteSyncedFiles: true,
      canViewWorkspaceSettings: true,
      canManageSharedResources: false,
    },
  } as WorkspaceCollabContext;
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'od-skill-navigation-scope-'));
  roots.push(root);
  const entries = new Map<string, {
    id: string;
    name: string;
    description: string;
    body: string;
    dir: string;
    source: 'user';
  }>();
  for (const workspaceId of ['workspace-a', 'workspace-b']) {
    const dir = path.join(root, workspaceId);
    await mkdir(path.join(dir, 'assets'), { recursive: true });
    await writeFile(
      path.join(dir, 'example.html'),
      `<img src="./assets/secret.txt"><p>${workspaceId}</p>`,
    );
    await writeFile(path.join(dir, 'assets', 'secret.txt'), `${workspaceId}-bytes`);
    entries.set(workspaceId, {
      id: 'same-skill',
      name: 'Same skill',
      description: workspaceId,
      body: `# ${workspaceId}`,
      dir,
      source: 'user',
    });
  }

  const app = express();
  const paths = {
    ARTIFACTS_DIR: path.join(root, 'artifacts'),
    BRANDS_DIR: path.join(root, 'brands'),
    BUNDLED_PETS_DIR: path.join(root, 'pets'),
    CRAFT_DIR: path.join(root, 'craft'),
    DESIGN_SYSTEMS_DIR: path.join(root, 'design-systems'),
    DESIGN_TEMPLATES_DIR: path.join(root, 'design-templates'),
    LIBRARY_DIR: path.join(root, 'library'),
    OD_BIN: path.join(root, 'od'),
    PROJECT_ROOT: root,
    PROJECTS_DIR: path.join(root, 'projects'),
    PROMPT_TEMPLATES_DIR: path.join(root, 'prompt-templates'),
    RUNTIME_DATA_DIR: path.join(root, 'data'),
    RUNTIME_DATA_DIR_CANONICAL: path.join(root, 'data'),
    SKILLS_DIR: path.join(root, 'skills'),
    USER_DESIGN_SYSTEMS_DIR: path.join(root, 'user-design-systems'),
    USER_DESIGN_TEMPLATES_DIR: path.join(root, 'user-design-templates'),
    USER_SKILLS_DIR: path.join(root, 'user-skills'),
  };
  registerStaticResourceRoutes(app, {
    db: {} as never,
    verifyWorkspaceRequestAuthority: async (req: any) => {
      const workspaceId = req.get('x-od-workspace-id')?.trim();
      const workspaceMemberId = req.get('x-od-workspace-member-id')?.trim();
      if (workspaceId === 'workspace-removed') {
        return {
          ok: false,
          status: 403,
          code: 'WORKSPACE_ACCESS_DENIED',
          message: 'removed',
        };
      }
      if (workspaceId === 'workspace-outage') {
        return {
          ok: false,
          status: 503,
          code: 'WORKSPACE_AUTHORITY_UNAVAILABLE',
          message: 'outage',
          retryable: true,
        };
      }
      return {
        ok: true,
        context: context(workspaceId, workspaceMemberId),
      };
    },
    http: {
      createSseResponse: () => undefined,
      getPublicBaseUrl: () => '',
      isLocalSameOrigin: () => true,
      requireLocalDaemonRequest: (_req: unknown, _res: unknown, next: () => void) =>
        next(),
      resolvedPortRef: { current: 0 },
      sendApiError: (
        res: express.Response,
        status: number,
        code: string,
        message: string,
        options?: { retryable?: boolean },
      ) =>
        res.status(status).json({
          error: code,
          message,
          ...(options?.retryable ? { retryable: true } : {}),
        }),
      sendLiveArtifactRouteError: () => undefined,
      sendMulterError: () => undefined,
    },
    paths,
    resources: {
      listAllDesignSystems: async () => [],
      resolveWorkspaceScope: async () => null,
      listAllSkills: async () => [],
      listAllDesignTemplates: async () => [],
      listAllSkillLikeEntries: (async (
          options?: { workspaceId?: string | null },
        ) => {
          const entry = options?.workspaceId
            ? entries.get(options.workspaceId)
            : undefined;
          return entry ? [entry] : [];
        }) as never,
      mimeFor: () => 'text/plain',
    },
  });
  const server = app.listen(0, '127.0.0.1');
  servers.push(server);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address() as { port: number };
  return `http://127.0.0.1:${address.port}`;
}

describe('Skill example and asset Workspace authority', () => {
  it('serves A and B copies of the same id and carries exact scope into nested assets', async () => {
    const baseUrl = await fixture();
    const example = await fetch(
      `${baseUrl}/api/skills/same-skill/example?workspaceId=workspace-a&workspaceMemberId=member-a`,
    );

    expect(example.status).toBe(200);
    const html = await example.text();
    expect(html).toContain('workspace-a');
    expect(html).not.toContain('workspace-b');
    expect(html).toContain(
      '/api/skills/same-skill/assets/secret.txt?workspaceId=workspace-a&workspaceMemberId=member-a',
    );

    const [assetA, assetB] = await Promise.all([
      fetch(
        `${baseUrl}/api/skills/same-skill/assets/secret.txt?workspaceId=workspace-a&workspaceMemberId=member-a`,
      ),
      fetch(
        `${baseUrl}/api/skills/same-skill/assets/secret.txt?workspaceId=workspace-b&workspaceMemberId=member-b`,
      ),
    ]);
    expect(await assetA.text()).toBe('workspace-a-bytes');
    expect(await assetB.text()).toBe('workspace-b-bytes');
  });

  it.each([
    ['workspace-removed', 403, 'WORKSPACE_ACCESS_DENIED'],
    ['workspace-outage', 503, 'WORKSPACE_AUTHORITY_UNAVAILABLE'],
  ] as const)(
    'returns authority failure for %s without serving another Workspace bytes',
    async (workspaceId, status, code) => {
      const baseUrl = await fixture();
      const response = await fetch(
        `${baseUrl}/api/skills/same-skill/assets/secret.txt?workspaceId=${workspaceId}&workspaceMemberId=member-a`,
      );

      expect(response.status).toBe(status);
      expect(await response.json()).toMatchObject({ error: code });
    },
  );

  it('rejects a partial navigation scope before resolving skill bytes', async () => {
    const baseUrl = await fixture();
    const response = await fetch(
      `${baseUrl}/api/skills/same-skill/assets/secret.txt?workspaceId=workspace-a`,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: 'WORKSPACE_CONTEXT_INCOMPLETE',
    });
  });
});
