import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  closeDatabase,
  ensureWorkspaceProject,
  getWorkspaceProjectByProjectId,
  insertProject,
  openDatabase,
} from '../../src/db.js';
import {
  createMemberRemovalProjectReconciler,
  createVelaMemberRemovalTransferSource,
} from '../../src/collab/member-removal-transfer.js';
import { enforceLocalProjectDataPlaneRequest } from '../../src/collab/project-request-authority.js';

const workspaceId = 'team-mem009';
const removedMemberId = 'removed-member';
const ownerMemberId = 'owner-member';
const removedAt = '2026-10-22T10:00:00.000Z';
let dataDir = '';

afterEach(() => {
  closeDatabase();
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  dataDir = '';
});

function setup() {
  dataDir = mkdtempSync(path.join(tmpdir(), 'od-mem009-'));
  const db = openDatabase(dataDir, { dataDir });
  function project(id: string, workspace: string, creator: string, visibility: 'personal' | 'team') {
    insertProject(db, { id, name: id, createdAt: 1, updatedAt: 1 });
    ensureWorkspaceProject(db, {
      projectId: id,
      workspaceId: workspace,
      visibility,
      resourceState: 'active',
      createdByWorkspaceMemberId: creator,
      updatedByWorkspaceMemberId: creator,
      createdAt: 1,
      updatedAt: 1,
    });
  }
  project('old-private', workspaceId, removedMemberId, 'personal');
  project('old-shared', workspaceId, removedMemberId, 'team');
  project('other-workspace', 'team-other', removedMemberId, 'personal');
  project('rejoined-private', workspaceId, 'new-member-id', 'personal');
  return db;
}

describe('MEM-009 local project transfer', () => {
  it('uses an exact durable removal fact and keeps repeats, shared projects, and rejoined identity isolated', async () => {
    const db = setup();
    const source = {
      list: vi.fn(async () => [{ workspaceId, removedMemberId, ownerMemberId, removedAt }]),
    };
    const reconcile = createMemberRemovalProjectReconciler({ db, source });
    expect(await reconcile(workspaceId, ownerMemberId)).toBe(1);
    expect(await reconcile(workspaceId, ownerMemberId)).toBe(0);
    // The rejoined member's private row remains foreign, so a later read may
    // refetch the durable facts; the transfer itself remains idempotent.
    expect(source.list).toHaveBeenCalledTimes(2);
    expect(getWorkspaceProjectByProjectId(db, 'old-private')).toMatchObject({
      createdByWorkspaceMemberId: ownerMemberId,
      updatedByWorkspaceMemberId: ownerMemberId,
      transferredFromWorkspaceMemberId: removedMemberId,
      updatedAt: 1,
    });
    expect(getWorkspaceProjectByProjectId(db, 'old-shared')).toMatchObject({
      createdByWorkspaceMemberId: removedMemberId,
      visibility: 'team',
    });
    expect(getWorkspaceProjectByProjectId(db, 'other-workspace')).toMatchObject({
      createdByWorkspaceMemberId: removedMemberId,
    });
    expect(getWorkspaceProjectByProjectId(db, 'rejoined-private')).toMatchObject({
      createdByWorkspaceMemberId: 'new-member-id',
    });
  });

  it('keeps unverified and mismatched transfer facts from changing private ownership', async () => {
    const db = setup();
    const reconcile = createMemberRemovalProjectReconciler({
      db,
      source: { list: async () => [{ workspaceId, removedMemberId, ownerMemberId: 'other-owner', removedAt }] },
    });
    expect(await reconcile(workspaceId, ownerMemberId)).toBe(0);
    expect(getWorkspaceProjectByProjectId(db, 'old-private')).toMatchObject({
      createdByWorkspaceMemberId: removedMemberId,
    });
  });

  it('requires an exact identity for direct reads of transferred private content', async () => {
    const db = setup();
    await createMemberRemovalProjectReconciler({
      db,
      source: { list: async () => [{ workspaceId, removedMemberId, ownerMemberId, removedAt }] },
    })(workspaceId, ownerMemberId);
    const getBinding = (_db: unknown, _workspaceId: string, projectId: string) =>
      getWorkspaceProjectByProjectId(db, projectId);
    const byId = (_db: unknown, projectId: string) => getWorkspaceProjectByProjectId(db, projectId);
    async function mayRead(memberId?: string) {
      return enforceLocalProjectDataPlaneRequest({
        db,
        projectId: 'old-private',
        options: { mode: 'read' },
        req: {
          get(name: string) {
            if (!memberId) return undefined;
            if (name === 'x-od-workspace-id') return workspaceId;
            if (name === 'x-od-workspace-member-id') return memberId;
            return undefined;
          },
        },
        getWorkspaceProject: getBinding,
        getWorkspaceProjectByProjectId: byId,
      });
    }
    expect(await mayRead(ownerMemberId)).toBe(true);
    expect(await mayRead(removedMemberId)).toBe(false);
    expect(await mayRead('other-member')).toBe(false);
    expect(await mayRead()).toBe(false);
  });

  it('rejects malformed or foreign Workspace authority responses before any local write', async () => {
    const db = setup();
    const fetchImpl = vi.fn(async (_input: Parameters<typeof fetch>[0], _init?: RequestInit) => new Response(JSON.stringify({
      removals: [{ workspaceId: 'team-other', removedMemberId, ownerMemberId, removedAt }],
    }), { status: 200 }));
    const session = { apiUrl: 'https://amr.example.test', controlKey: 'test-control-key' } as any;
    const source = createVelaMemberRemovalTransferSource({
      configuredEnv: () => ({}),
      fetch: fetchImpl as typeof fetch,
      readSession: () => session,
    });
    await expect(createMemberRemovalProjectReconciler({ db, source })(workspaceId, ownerMemberId))
      .rejects.toThrow('invalid member removal transfer');
    expect(getWorkspaceProjectByProjectId(db, 'old-private')).toMatchObject({
      createdByWorkspaceMemberId: removedMemberId,
    });
    expect(fetchImpl.mock.calls[0]?.[0].toString()).toBe(
      'https://amr.example.test/api/v1/workspaces/team-mem009/member-removals',
    );
  });
});
