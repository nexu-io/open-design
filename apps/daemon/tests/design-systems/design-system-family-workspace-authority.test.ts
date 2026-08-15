import express from 'express';
import type http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  closeDatabase,
  ensureWorkspaceResource,
  getWorkspaceResource,
  getWorkspaceResourceByResourceId,
  openDatabase,
} from '../../src/db.js';
import { workspaceContextFromDirectoryItem } from '../../src/collab/vela-workspace-context.js';
import { registerDesignSystemRoutes } from '../../src/routes/design-systems.js';

const DESIGN_SYSTEM_ID = 'user:workspace-a-system';
const WORKSPACE_ID = 'workspace-a';
const MEMBER_ID = 'member-a';

let server: http.Server | null = null;
let tempDir: string | null = null;

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = null;
  }
  closeDatabase();
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

function listen(app: express.Express): Promise<string> {
  return new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const address = server?.address() as { port: number };
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function paths(root: string) {
  return {
    CRAFT_DIR: path.join(root, 'craft'),
    USER_DESIGN_SYSTEMS_DIR: path.join(root, 'design-systems'),
  } as never;
}

function exactHeaders(): Record<string, string> {
  return {
    'x-od-workspace-id': WORKSPACE_ID,
    'x-od-workspace-member-id': MEMBER_ID,
  };
}

function otherMemberHeaders(): Record<string, string> {
  return {
    'x-od-workspace-id': WORKSPACE_ID,
    'x-od-workspace-member-id': 'member-b',
  };
}

async function startAuthorityServer(options: {
  visibility?: 'personal' | 'team';
  namespacedTeams?: boolean;
} = {}) {
  tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-ds-family-authority-'));
  const db = openDatabase(tempDir, { dataDir: tempDir });
  if (options.namespacedTeams) {
    ensureWorkspaceResource(
      db,
      'design_system',
      WORKSPACE_ID,
      DESIGN_SYSTEM_ID,
      {
        visibility: 'personal',
        resourceState: 'active',
        createdByWorkspaceMemberId: 'personal-owner',
      },
    );
    for (const [workspaceId, memberId] of [
      [WORKSPACE_ID, MEMBER_ID],
      ['workspace-b', 'member-b'],
    ] as const) {
      ensureWorkspaceResource(
        db,
        'design_system',
        workspaceId,
        `team-mirror:${workspaceId}:${encodeURIComponent(DESIGN_SYSTEM_ID)}`,
        {
          visibility: 'team',
          resourceState: 'active',
          createdByWorkspaceMemberId: memberId,
        },
      );
    }
  } else {
    ensureWorkspaceResource(
      db,
      'design_system',
      WORKSPACE_ID,
      DESIGN_SYSTEM_ID,
      {
        visibility: options.visibility ?? 'team',
        resourceState: 'active',
        createdByWorkspaceMemberId: MEMBER_ID,
      },
    );
  }
  const calls = {
    archive: vi.fn(async () => ({
      buffer: Buffer.from('zip'),
      baseName: 'workspace-a',
      title: 'Workspace A',
    })),
    files: vi.fn(async () => []),
    revisions: vi.fn(async () => []),
    static: vi.fn(async (_id: string, filePath: string) => ({
      bytes: Buffer.from(
        filePath === 'system/kit.html'
          ? '<html><img src="../assets/logo.png"></html>'
          : 'body',
      ),
      contentType: filePath === 'system/kit.html' ? 'text/html' : 'text/plain',
      updatedAt: 'Wed, 30 Jul 2026 00:00:00 GMT',
    })),
    update: vi.fn(async () => null),
  };
  const jobs = new Map<string, any>();
  const verifyWorkspaceRequestAuthority = vi.fn(async (req: any) => {
    const workspaceId = req.get('x-od-workspace-id')?.trim() ?? '';
    const workspaceMemberId = req.get('x-od-workspace-member-id')?.trim() ?? '';
    if (!workspaceId || !workspaceMemberId) {
      return {
        ok: false as const,
        status: 400 as const,
        code: 'WORKSPACE_CONTEXT_REQUIRED',
        message: 'exact workspace identity required',
      };
    }
    const accepted = options.namespacedTeams
      ? (
          (workspaceId === WORKSPACE_ID && (
            workspaceMemberId === MEMBER_ID || workspaceMemberId === 'member-other'
          ))
          || (workspaceId === 'workspace-b' && workspaceMemberId === 'member-b')
        )
      : workspaceId === WORKSPACE_ID
        && (workspaceMemberId === MEMBER_ID || workspaceMemberId === 'member-b');
    if (!accepted) {
      return {
        ok: false as const,
        status: 403 as const,
        code: 'WORKSPACE_ACCESS_DENIED',
        message: 'workspace identity mismatch',
      };
    }
    return {
      ok: true as const,
      context: workspaceContextFromDirectoryItem({
        workspaceId,
        workspaceName: 'Workspace A',
        workspaceType: 'team',
        workspaceMemberId,
        role: 'owner',
        memberStatus: 'active',
        lifecycleState: 'active',
      }),
    };
  });
  const summary = {
    id: DESIGN_SYSTEM_ID,
    title: 'Workspace A',
    category: 'Custom',
    summary: 'Workspace scoped',
    swatches: [],
    surface: 'web' as const,
    body: '# Workspace A',
    source: 'user' as const,
    status: 'draft' as const,
    isEditable: true,
  };
  const app = express();
  app.use(express.json());
  registerDesignSystemRoutes(app, {
    db,
    paths: paths(tempDir),
    projectFiles: {} as never,
    projectStore: {} as never,
    verifyWorkspaceRequestAuthority,
    workspaceResources: {
      getWorkspaceResource,
      getWorkspaceResourceByResourceId,
    },
    designSystems: {
      buildUserDesignSystemArchive: calls.archive,
      canMutateUserDesignSystem: async () => true,
      createUserDesignSystem: async () => summary,
      deleteUserDesignSystem: async () => true,
      ensureUserDesignSystemWorkspaceProject: async () => ({
        project: { id: 'project-a' },
        files: [],
      }) as never,
      listAllDesignSystems: async () => [summary],
      listUserDesignSystemFiles: calls.files,
      listUserDesignSystemRevisions: calls.revisions,
      prepareDesignTokenContractRebuild: async () => ({
        decision: { available: false },
      }) as never,
      readAvailableDesignSystem: async () => summary.body,
      readAvailableDesignSystemPackageInfo: async () => null,
      readAvailableDesignSystemStaticFile: calls.static,
      readDesignSystemWorkspaceTextFile: async () => null,
      readUserDesignSystemFile: async () => ({
        path: 'DESIGN.md',
        body: summary.body,
      }) as never,
      renderDesignSystemPreview: () => '<html>preview</html>',
      renderDesignSystemShowcase: () => '<html>showcase</html>',
      syncUserDesignSystemAssetsFromWorkspace: async () => ({
        ok: true,
        synced: [],
      }),
      unshareTeamDesignSystemIfShared: async () => false,
      updateUserDesignSystem: calls.update,
      updateUserDesignSystemRevisionStatus: async () => null,
    },
    generationJobs: {
      get: (id) => jobs.get(id) ?? null,
      rebuildTokenContract: () => ({}) as never,
      revise: () => ({}) as never,
      start: () => {
        const job = {
          id: 'job-a',
          status: 'queued',
          progress: 0,
          steps: [],
          createdAt: '2026-07-30T00:00:00.000Z',
          updatedAt: '2026-07-30T00:00:00.000Z',
        };
        jobs.set(job.id, job);
        return job as never;
      },
    },
  });
  return {
    baseUrl: await listen(app),
    calls,
    db,
    verifyWorkspaceRequestAuthority,
  };
}

describe('Design System route family exact Workspace authority', () => {
  it('denies another same-workspace owner every Personal read and mutation path', async () => {
    const { baseUrl, calls } = await startAuthorityServer({ visibility: 'personal' });
    const reads = [
      '',
      '/revisions',
      '/preview',
      '/showcase',
      '/static?path=tokens.css',
      '/files',
      '/file?path=DESIGN.md',
      '/archive',
    ];
    for (const suffix of reads) {
      const response = await fetch(
        `${baseUrl}/api/design-systems/${encodeURIComponent(DESIGN_SYSTEM_ID)}${suffix}`,
        { headers: otherMemberHeaders() },
      );
      expect(response.status, suffix).toBe(403);
    }
    const mutation = await fetch(
      `${baseUrl}/api/design-systems/${encodeURIComponent(DESIGN_SYSTEM_ID)}`,
      {
        method: 'PATCH',
        headers: { ...otherMemberHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Stolen' }),
      },
    );
    expect(mutation.status).toBe(403);
    expect(calls.update).not.toHaveBeenCalled();
  });

  it('keeps Team design systems readable by another verified active member', async () => {
    const { baseUrl } = await startAuthorityServer();
    const response = await fetch(
      `${baseUrl}/api/design-systems/${encodeURIComponent(DESIGN_SYSTEM_ID)}`,
      { headers: otherMemberHeaders() },
    );
    expect(response.status).toBe(200);
  });

  it('resolves identical Team ids through each Workspace-namespaced binding', async () => {
    const { baseUrl, db } = await startAuthorityServer({ namespacedTeams: true });
    for (const headers of [
      {
        ...exactHeaders(),
        'x-od-workspace-member-id': 'member-other',
      },
      {
        'x-od-workspace-id': 'workspace-b',
        'x-od-workspace-member-id': 'member-b',
      },
    ]) {
      const detail = await fetch(
        `${baseUrl}/api/design-systems/${encodeURIComponent(DESIGN_SYSTEM_ID)}`,
        { headers },
      );
      const files = await fetch(
        `${baseUrl}/api/design-systems/${encodeURIComponent(DESIGN_SYSTEM_ID)}/files`,
        { headers },
      );
      expect(detail.status).toBe(200);
      expect(files.status).toBe(200);
    }
    expect(getWorkspaceResourceByResourceId(db, 'design_system', DESIGN_SYSTEM_ID))
      .toMatchObject({
        workspaceId: WORKSPACE_ID,
        visibility: 'personal',
        createdByWorkspaceMemberId: 'personal-owner',
      });
    expect(getWorkspaceResourceByResourceId(
      db,
      'design_system',
      `team-mirror:${WORKSPACE_ID}:${encodeURIComponent(DESIGN_SYSTEM_ID)}`,
    )).toMatchObject({ workspaceId: WORKSPACE_ID, visibility: 'team' });
  });

  it('rejects every bound read before touching its backing store', async () => {
    const { baseUrl, calls } = await startAuthorityServer();
    const paths = [
      `/api/design-systems/${encodeURIComponent(DESIGN_SYSTEM_ID)}`,
      `/api/design-systems/${encodeURIComponent(DESIGN_SYSTEM_ID)}/revisions`,
      `/api/design-systems/${encodeURIComponent(DESIGN_SYSTEM_ID)}/preview`,
      `/api/design-systems/${encodeURIComponent(DESIGN_SYSTEM_ID)}/showcase`,
      `/api/design-systems/${encodeURIComponent(DESIGN_SYSTEM_ID)}/static?path=tokens.css`,
      `/api/design-systems/${encodeURIComponent(DESIGN_SYSTEM_ID)}/files`,
      `/api/design-systems/${encodeURIComponent(DESIGN_SYSTEM_ID)}/file?path=DESIGN.md`,
      `/api/design-systems/${encodeURIComponent(DESIGN_SYSTEM_ID)}/archive`,
    ];

    for (const requestPath of paths) {
      const response = await fetch(`${baseUrl}${requestPath}`);
      expect(response.status, requestPath).toBe(400);
    }

    expect(calls.archive).not.toHaveBeenCalled();
    expect(calls.files).not.toHaveBeenCalled();
    expect(calls.revisions).not.toHaveBeenCalled();
    expect(calls.static).not.toHaveBeenCalled();
  });

  it('accepts exact query scope for browser-owned showcase and static requests', async () => {
    const { baseUrl, calls, verifyWorkspaceRequestAuthority } =
      await startAuthorityServer();
    const scope =
      `workspaceId=${WORKSPACE_ID}&workspaceMemberId=${MEMBER_ID}`;
    const showcase = await fetch(
      `${baseUrl}/api/design-systems/${encodeURIComponent(DESIGN_SYSTEM_ID)}/showcase?${scope}`,
    );
    const staticFile = await fetch(
      `${baseUrl}/api/design-systems/${encodeURIComponent(DESIGN_SYSTEM_ID)}/static?path=tokens.css&${scope}`,
    );

    expect(showcase.status).toBe(200);
    expect(staticFile.status).toBe(200);
    expect(await showcase.text()).toContain(
      `path=assets%2Flogo.png&workspaceId=${WORKSPACE_ID}&workspaceMemberId=${MEMBER_ID}`,
    );
    expect(calls.static).toHaveBeenCalledWith(
      DESIGN_SYSTEM_ID,
      'system/kit.html',
      { workspaceId: WORKSPACE_ID, workspaceMemberId: MEMBER_ID, exactTeam: false },
    );
    expect(calls.static).toHaveBeenCalledWith(
      DESIGN_SYSTEM_ID,
      'tokens.css',
      { workspaceId: WORKSPACE_ID, workspaceMemberId: MEMBER_ID, exactTeam: false },
    );
    expect(verifyWorkspaceRequestAuthority).toHaveBeenCalledTimes(2);
  });

  it('rejects bound mutations before their first side effect', async () => {
    const { baseUrl, calls } = await startAuthorityServer();
    const requests = [
      { method: 'POST', path: 'workspace', body: {} },
      { method: 'POST', path: 'revision-jobs', body: { feedback: 'change' } },
      { method: 'POST', path: 'token-contract/rebuild-jobs', body: {} },
      { method: 'PATCH', path: 'revisions/r1', body: { status: 'accepted' } },
      { method: 'PATCH', path: '', body: { title: 'Changed' } },
      { method: 'POST', path: 'sync-assets', body: {} },
      { method: 'DELETE', path: '', body: undefined },
    ];

    for (const request of requests) {
      const suffix = request.path ? `/${request.path}` : '';
      const response = await fetch(
        `${baseUrl}/api/design-systems/${encodeURIComponent(DESIGN_SYSTEM_ID)}${suffix}`,
        {
          method: request.method,
          headers: request.body ? { 'content-type': 'application/json' } : {},
          ...(request.body ? { body: JSON.stringify(request.body) } : {}),
        },
      );
      expect(response.status, `${request.method} ${suffix}`).toBe(400);
    }

    expect(calls.update).not.toHaveBeenCalled();
  });

  it('pins generation job reads to the exact creating Workspace/member pair', async () => {
    const { baseUrl } = await startAuthorityServer();
    const started = await fetch(`${baseUrl}/api/design-systems/generation-jobs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...exactHeaders(),
      },
      body: JSON.stringify({ title: 'Workspace A' }),
    });
    expect(started.status).toBe(202);

    const missing = await fetch(
      `${baseUrl}/api/design-systems/generation-jobs/job-a`,
    );
    expect(missing.status).toBe(403);

    const exact = await fetch(
      `${baseUrl}/api/design-systems/generation-jobs/job-a`,
      { headers: exactHeaders() },
    );
    expect(exact.status).toBe(200);
  });
});
