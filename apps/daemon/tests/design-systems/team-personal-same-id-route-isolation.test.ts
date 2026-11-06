import express from 'express';
import type http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { workspaceContextFromDirectoryItem } from '../../src/collab/vela-workspace-context.js';
import { teamResourceWorkspaceRoot } from '../../src/collab/team-resource-materialization.js';
import {
  closeDatabase,
  ensureWorkspaceResource,
  getWorkspaceResource,
  getWorkspaceResourceByResourceId,
  openDatabase,
} from '../../src/db.js';
import { workspaceTeamDesignSystemBindingResourceId } from '../../src/design-systems/workspace-team-binding.js';
import { registerDesignSystemRoutes } from '../../src/routes/design-systems.js';

let server: http.Server | null = null;
let root: string | null = null;

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = null;
  }
  closeDatabase();
  if (root) rmSync(root, { recursive: true, force: true });
  root = null;
});

function listen(app: express.Express): Promise<string> {
  return new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      resolve(`http://127.0.0.1:${(server?.address() as { port: number }).port}`);
    });
  });
}

const workspaceId = 'workspace-a';
const memberId = 'owner-a';
const designSystemId = 'user:same-id';

function headers(role: 'owner' | 'member' = 'owner'): Record<string, string> {
  return {
    'x-od-workspace-id': workspaceId,
    'x-od-workspace-member-id': memberId,
    'x-od-workspace-type': 'team',
    'x-od-workspace-role': role,
    'x-od-workspace-member-status': 'active',
    'x-od-workspace-lifecycle-state': 'active',
  };
}

describe('Design System Team/Personal same-id route isolation', () => {
  it('routes Team file reads, archive, PATCH, and DELETE only to the exact Team root', async () => {
    root = mkdtempSync(path.join(os.tmpdir(), 'od-ds-same-id-routes-'));
    const userRoot = path.join(root, 'design-systems');
    const teamRoot = teamResourceWorkspaceRoot(userRoot, workspaceId);
    const db = openDatabase(root, { dataDir: path.join(root, 'data') });
    const teamBindingId = workspaceTeamDesignSystemBindingResourceId(
      workspaceId,
      designSystemId,
    );
    ensureWorkspaceResource(db, 'design_system', workspaceId, designSystemId, {
      visibility: 'personal',
      resourceState: 'active',
      createdByWorkspaceMemberId: memberId,
    });
    ensureWorkspaceResource(db, 'design_system', workspaceId, teamBindingId, {
      visibility: 'team',
      resourceState: 'active',
      createdByWorkspaceMemberId: memberId,
    });
    const teamSummary = {
      id: designSystemId,
      title: 'Team copy',
      category: 'Custom',
      summary: '',
      swatches: [],
      surface: 'web' as const,
      body: '# Team copy',
      source: 'user' as const,
      status: 'published' as const,
      isEditable: false,
      teamSynced: true,
      workspaceId,
    };

    const rootsSeen: string[] = [];
    const rememberRoot = <T>(value: T) => async (calledRoot: string) => {
      rootsSeen.push(calledRoot);
      return value;
    };
    const canMutateUserDesignSystem = vi.fn(async (calledRoot: string) => {
      rootsSeen.push(calledRoot);
      return true;
    });
    const deleteUserDesignSystem = vi.fn(rememberRoot(true));
    const updateUserDesignSystem = vi.fn(rememberRoot({
      id: designSystemId,
      title: 'Team renamed',
      category: 'Custom',
      summary: '',
      swatches: [],
      surface: 'web',
      body: '# Team renamed',
      source: 'user',
      status: 'published',
      isEditable: true,
    }));
    const listUserDesignSystemFiles = vi.fn(rememberRoot([{ path: 'DESIGN.md' }]));
    const readUserDesignSystemFile = vi.fn(rememberRoot({
      path: 'DESIGN.md',
      content: '# Team copy',
    }));
    const buildUserDesignSystemArchive = vi.fn(rememberRoot({
      baseName: 'Team copy',
      buffer: Buffer.from('team archive'),
    }));
    const revise = vi.fn(() => ({ id: 'revision-job', status: 'queued' }));
    const rebuildTokenContract = vi.fn(() => ({ id: 'token-job', status: 'queued' }));
    const prepareDesignTokenContractRebuild = vi.fn(async (calledRoot: string) => {
      rootsSeen.push(calledRoot);
      return {
        decision: {
          designSystemId,
          available: true,
          recommended: true,
          forced: false,
          reason: 'Token contract rebuild recommended.',
          triggers: ['quality report recommends rebuild'],
        },
        revision: {
          feedback: 'Team-only token rebuild.',
          sectionTitle: 'Token Contract',
          baseBody: '# Team copy',
          proposedBody: '# Team copy\n\n## Token Contract\n',
        },
      };
    });
    const listAllDesignSystems = vi.fn(async () => [teamSummary]);
    const readAvailableDesignSystem = vi.fn(async () => '# Team copy');
    const readAvailableDesignSystemPackageInfo = vi.fn(async () => null);
    const readAvailableDesignSystemStaticFile = vi.fn(async () => ({
      bytes: Buffer.from('<!doctype html><title>Team showcase</title>'),
      contentType: 'text/html; charset=utf-8',
      updatedAt: new Date(0).toUTCString(),
    }));
    const ensureUserDesignSystemWorkspaceProject = vi.fn(async () => ({
      project: { id: 'team-design-system-project' },
      files: [],
    }));
    const syncUserDesignSystemAssetsFromWorkspace = vi.fn(async () => ({
      ok: true as const,
      synced: [],
    }));

    const app = express();
    app.use(express.json());
    registerDesignSystemRoutes(app, {
      db,
      paths: {
        CRAFT_DIR: path.join(root, 'craft'),
        USER_DESIGN_SYSTEMS_DIR: userRoot,
      } as never,
      projectFiles: {} as never,
      projectStore: {} as never,
      verifyWorkspaceRequestAuthority: async (req: any) => ({
        ok: true as const,
        context: workspaceContextFromDirectoryItem({
          workspaceId: req.get('x-od-workspace-id'),
          workspaceName: 'Workspace A',
          workspaceType: 'team',
          workspaceMemberId: req.get('x-od-workspace-member-id'),
          role: req.get('x-od-workspace-role') === 'member' ? 'member' : 'owner',
          memberStatus: 'active',
          lifecycleState: 'active',
        }),
      }),
      workspaceResources: {
        getWorkspaceResource,
        getWorkspaceResourceByResourceId,
      },
      designSystems: {
        buildUserDesignSystemArchive: buildUserDesignSystemArchive as never,
        canMutateUserDesignSystem,
        createUserDesignSystem: async () => ({}) as never,
        deleteUserDesignSystem,
        ensureUserDesignSystemWorkspaceProject: ensureUserDesignSystemWorkspaceProject as never,
        listAllDesignSystems: listAllDesignSystems as never,
        listUserDesignSystemFiles: listUserDesignSystemFiles as never,
        listUserDesignSystemRevisions: async () => null,
        prepareDesignTokenContractRebuild: prepareDesignTokenContractRebuild as never,
        readAvailableDesignSystem,
        readAvailableDesignSystemPackageInfo,
        readAvailableDesignSystemStaticFile: readAvailableDesignSystemStaticFile as never,
        readDesignSystemWorkspaceTextFile: async () => null,
        readUserDesignSystemFile: readUserDesignSystemFile as never,
        renderDesignSystemPreview: () => '<!doctype html><title>Team preview</title>',
        renderDesignSystemShowcase: () => '<!doctype html><title>Team showcase fallback</title>',
        syncUserDesignSystemAssetsFromWorkspace,
        unshareTeamDesignSystemIfShared: async () => false,
        updateUserDesignSystem: updateUserDesignSystem as never,
        updateUserDesignSystemRevisionStatus: async () => null,
      },
      generationJobs: {
        get: () => null,
        rebuildTokenContract: rebuildTokenContract as never,
        revise: revise as never,
        start: () => ({}) as never,
      },
    });
    const baseUrl = await listen(app);
    const id = encodeURIComponent(designSystemId);

    expect((await fetch(`${baseUrl}/api/design-systems/${id}/files`, { headers: headers('member') })).status)
      .toBe(200);
    expect((await fetch(`${baseUrl}/api/design-systems/${id}/file?path=DESIGN.md`, { headers: headers('member') })).status)
      .toBe(200);
    expect((await fetch(`${baseUrl}/api/design-systems/${id}/archive`, { headers: headers('member') })).status)
      .toBe(200);
    expect((await fetch(`${baseUrl}/api/design-systems/${id}`, { headers: headers('member') })).status)
      .toBe(200);
    expect((await fetch(`${baseUrl}/api/design-systems/${id}/preview`, { headers: headers('member') })).status)
      .toBe(200);
    expect((await fetch(`${baseUrl}/api/design-systems/${id}/showcase`, { headers: headers('member') })).status)
      .toBe(200);
    expect((await fetch(`${baseUrl}/api/design-systems/${id}/static?path=system/index.html`, { headers: headers('member') })).status)
      .toBe(200);
    expect((await fetch(`${baseUrl}/api/design-systems/${id}/workspace`, {
      method: 'POST',
      headers: headers(),
    })).status).toBe(201);
    expect((await fetch(`${baseUrl}/api/design-systems/${id}/sync-assets`, {
      method: 'POST',
      headers: headers(),
    })).status).toBe(200);
    expect((await fetch(`${baseUrl}/api/design-systems/${id}/revision-jobs`, {
      method: 'POST',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedback: 'Team-only revision.' }),
    })).status).toBe(202);
    expect((await fetch(`${baseUrl}/api/design-systems/${id}/token-contract/rebuild-jobs`, {
      method: 'POST',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ force: true }),
    })).status).toBe(202);
    expect((await fetch(`${baseUrl}/api/design-systems/${id}`, {
      method: 'PATCH',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Team renamed' }),
    })).status).toBe(200);
    expect((await fetch(`${baseUrl}/api/design-systems/${id}`, {
      method: 'DELETE',
      headers: headers(),
    })).status).toBe(204);

    expect(rootsSeen.length).toBeGreaterThan(0);
    expect(new Set(rootsSeen)).toEqual(new Set([teamRoot]));
    expect(deleteUserDesignSystem).toHaveBeenCalledWith(teamRoot, designSystemId);
    expect(updateUserDesignSystem).toHaveBeenCalledWith(
      teamRoot,
      designSystemId,
      { title: 'Team renamed' },
    );
    expect(revise).toHaveBeenCalledWith(expect.objectContaining({
      designSystemId,
      root: teamRoot,
    }));
    expect(prepareDesignTokenContractRebuild).toHaveBeenCalledWith(
      teamRoot,
      designSystemId,
      { force: true },
    );
    expect(rebuildTokenContract).toHaveBeenCalledWith(expect.objectContaining({
      designSystemId,
      root: teamRoot,
    }));
    expect(listAllDesignSystems).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId,
      exactTeam: true,
    }));
    expect(readAvailableDesignSystem).toHaveBeenCalledWith(
      designSystemId,
      expect.objectContaining({ workspaceId, exactTeam: true }),
    );
    expect(readAvailableDesignSystemPackageInfo).toHaveBeenCalledWith(
      designSystemId,
      expect.objectContaining({ workspaceId, exactTeam: true }),
    );
    expect(readAvailableDesignSystemStaticFile).toHaveBeenCalledWith(
      designSystemId,
      expect.any(String),
      expect.objectContaining({ workspaceId, exactTeam: true }),
    );
    expect(ensureUserDesignSystemWorkspaceProject).toHaveBeenCalledWith(
      db,
      designSystemId,
      expect.objectContaining({ workspaceId, exactTeam: true }),
    );
    expect(syncUserDesignSystemAssetsFromWorkspace).toHaveBeenCalledWith(
      db,
      designSystemId,
      expect.objectContaining({ workspaceId, exactTeam: true }),
    );
    expect(getWorkspaceResource(db, 'design_system', workspaceId, designSystemId))
      .toBeTruthy();
    expect(getWorkspaceResource(db, 'design_system', workspaceId, teamBindingId))
      .toBeUndefined();
  });
});
