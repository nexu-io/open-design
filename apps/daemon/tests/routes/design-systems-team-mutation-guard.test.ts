// recvqb6mfyqXLD: a design system materialized locally from a teammate's team
// share must not be editable, publish-toggleable, or deletable by a plain
// member — only the original sharer, or a workspace owner/admin, may mutate
// it (the same rule "who can unshare" already enforces). The UI hides the
// affordances (DesignSystemsTab.tsx `canManageTeamSynced`), but nothing
// stopped a direct PATCH/DELETE call before this guard: `canMutateUserDesignSystem`
// is the server-side enforcement point these specs pin down.
//
// Local mutations use persisted resource state. Browser lifecycle headers are
// only a stale UI snapshot and must not turn a network/control-plane problem
// into a failed local edit.

import type http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerDesignSystemRoutes } from '../../src/routes/design-systems.js';
import type { DesignSystemSummary } from '../../src/design-systems/index.js';
import {
  closeDatabase,
  ensureWorkspaceResource,
  getWorkspaceResource,
  getWorkspaceResourceByResourceId,
  openDatabase,
} from '../../src/db.js';
import { workspaceContextFromDirectoryItem } from '../../src/collab/vela-workspace-context.js';

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

const designSystemSummary: DesignSystemSummary = {
  id: 'user:teammate-ds',
  title: 'Teammate DS',
  category: 'Custom',
  summary: 'Synced from a teammate.',
  swatches: [],
  surface: 'web',
  body: '# Teammate DS',
  source: 'user',
  status: 'draft',
  isEditable: true,
};

function registerRoutes(app: express.Express, canMutate: (root: string, id: string, req: any) => Promise<boolean>) {
  tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-ds-mutation-guard-'));
  const db = openDatabase(tempDir, { dataDir: tempDir });
  ensureWorkspaceResource(db, 'design_system', 'ws-locked', 'user:mine', {
    visibility: 'personal',
    resourceState: 'active',
    createdByWorkspaceMemberId: 'member-1',
  });
  const updateUserDesignSystem = vi.fn(async () => ({ ...designSystemSummary, status: 'published' as const }));
  const deleteUserDesignSystem = vi.fn(async () => true);
  const updateUserDesignSystemRevisionStatus = vi.fn(async (_root: string, _id: string, revisionId: string, status: 'accepted' | 'rejected') => ({
    id: revisionId,
    designSystemId: designSystemSummary.id,
    status,
    feedback: 'Tighten the spacing scale.',
    baseBody: designSystemSummary.body,
    proposedBody: `${designSystemSummary.body}\nMore.`,
    createdAt: '2026-07-24T00:00:00.000Z',
    updatedAt: '2026-07-24T00:00:00.000Z',
  }));
  registerDesignSystemRoutes(app, {
    db,
    paths: {
      CRAFT_DIR: '',
      USER_DESIGN_SYSTEMS_DIR: '',
    } as never,
    projectFiles: {} as never,
    projectStore: {} as never,
    verifyWorkspaceRequestAuthority: async (req: any) => ({
      ok: true as const,
      context: workspaceContextFromDirectoryItem({
        workspaceId: req.get('x-od-workspace-id'),
        workspaceName: 'Locked fixture workspace',
        workspaceType: 'team',
        workspaceMemberId: req.get('x-od-workspace-member-id'),
        role: 'owner',
        memberStatus: 'active',
        lifecycleState: req.get('x-od-workspace-lifecycle-state') ?? 'active',
      }),
    }),
    workspaceResources: {
      getWorkspaceResource,
      getWorkspaceResourceByResourceId,
    },
    designSystems: {
      buildUserDesignSystemArchive: async () => null,
      canMutateUserDesignSystem: canMutate,
      createUserDesignSystem: async () => designSystemSummary,
      deleteUserDesignSystem,
      ensureUserDesignSystemWorkspaceProject: async () => null,
      listAllDesignSystems: async () => [designSystemSummary],
      listUserDesignSystemFiles: async () => null,
      listUserDesignSystemRevisions: async () => null,
      prepareDesignTokenContractRebuild: async () => ({ decision: { available: false } }) as never,
      readAvailableDesignSystem: async () => designSystemSummary.body,
      readAvailableDesignSystemPackageInfo: async () => null,
      readAvailableDesignSystemStaticFile: async () => null,
      readDesignSystemWorkspaceTextFile: async () => null,
      readUserDesignSystemFile: async () => null,
      renderDesignSystemPreview: () => '<!doctype html>',
      renderDesignSystemShowcase: () => '<!doctype html>',
      syncUserDesignSystemAssetsFromWorkspace: async () => ({ ok: false, reason: 'not-found' }),
      unshareTeamDesignSystemIfShared: async () => false,
      updateUserDesignSystem,
      updateUserDesignSystemRevisionStatus,
    },
    generationJobs: {
      get: () => null,
      rebuildTokenContract: () => ({}) as never,
      revise: () => ({}) as never,
      start: () => ({}) as never,
    },
  });
  return { updateUserDesignSystem, deleteUserDesignSystem, updateUserDesignSystemRevisionStatus };
}

describe('design system PATCH/DELETE team-share mutation guard', () => {
  it('rejects publishing/editing a team-synced design system the caller may not manage', async () => {
    const app = express();
    app.use(express.json());
    const { updateUserDesignSystem } = registerRoutes(app, async () => false);
    const baseUrl = await listen(app);

    const res = await fetch(`${baseUrl}/api/design-systems/user:teammate-ds`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'published' }),
    });

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe('WORKSPACE_RESOURCE_MANAGE_DENIED');
    expect(updateUserDesignSystem).not.toHaveBeenCalled();
  });

  it('rejects deleting a team-synced design system the caller may not manage', async () => {
    const app = express();
    app.use(express.json());
    const { deleteUserDesignSystem } = registerRoutes(app, async () => false);
    const baseUrl = await listen(app);

    const res = await fetch(`${baseUrl}/api/design-systems/user:teammate-ds`, { method: 'DELETE' });

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe('WORKSPACE_RESOURCE_MANAGE_DENIED');
    expect(deleteUserDesignSystem).not.toHaveBeenCalled();
  });

  it('still allows publishing/editing when the caller can manage the shared system (owner or workspace admin)', async () => {
    const app = express();
    app.use(express.json());
    const { updateUserDesignSystem } = registerRoutes(app, async () => true);
    const baseUrl = await listen(app);

    const res = await fetch(`${baseUrl}/api/design-systems/user:teammate-ds`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'published' }),
    });

    expect(res.status).toBe(200);
    expect(updateUserDesignSystem).toHaveBeenCalledOnce();
  });

  it('still allows deleting a personal (non-team-synced) design system', async () => {
    const app = express();
    app.use(express.json());
    const { deleteUserDesignSystem } = registerRoutes(app, async () => true);
    const baseUrl = await listen(app);

    const res = await fetch(`${baseUrl}/api/design-systems/user:mine`, {
      method: 'DELETE',
      headers: {
        'x-od-workspace-id': 'ws-locked',
        'x-od-workspace-member-id': 'member-1',
        'x-od-workspace-lifecycle-state': 'active',
      },
    });

    expect(res.status).toBe(204);
    expect(deleteUserDesignSystem).toHaveBeenCalledOnce();
  });

  // recvqb6mfyqXLD: the single-item GET decorates its response with the same
  // verdict, so any detail surface that reads off this endpoint (not just
  // DesignSystemsTab's own separate `/team` share lookup) can gate its own
  // Publish toggle / Save button / delete affordance on it.
  it('decorates GET /api/design-systems/:id with canMutate=false when the caller may not manage the share', async () => {
    const app = express();
    app.use(express.json());
    registerRoutes(app, async () => false);
    const baseUrl = await listen(app);

    const res = await fetch(`${baseUrl}/api/design-systems/user:teammate-ds`);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { canMutate?: boolean; designSystem?: { canMutate?: boolean } };
    expect(body.canMutate).toBe(false);
    expect(body.designSystem?.canMutate).toBe(false);
  });

  it('decorates GET /api/design-systems/:id with canMutate=true when the caller can manage the share', async () => {
    const app = express();
    app.use(express.json());
    registerRoutes(app, async () => true);
    const baseUrl = await listen(app);

    const res = await fetch(`${baseUrl}/api/design-systems/user:teammate-ds`);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { canMutate?: boolean };
    expect(body.canMutate).toBe(true);
  });
});

// recvqb6mfyqXLD: accepting/rejecting a design system revision commits (or
// discards) its proposed body onto the canonical design system — the same
// "edit" this route family gates everywhere else. Before this, a plain
// member viewing a teammate's team-synced design system could accept/reject
// its pending revision with no server-side check at all.
describe('design system revision accept/reject team-share mutation guard', () => {
  it('rejects resolving a pending revision on a team-synced design system the caller may not manage', async () => {
    const app = express();
    app.use(express.json());
    const { updateUserDesignSystemRevisionStatus } = registerRoutes(app, async () => false);
    const baseUrl = await listen(app);

    const res = await fetch(`${baseUrl}/api/design-systems/user:teammate-ds/revisions/rev-1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'accepted' }),
    });

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe('WORKSPACE_RESOURCE_MANAGE_DENIED');
    expect(updateUserDesignSystemRevisionStatus).not.toHaveBeenCalled();
  });

  it('still allows resolving a pending revision when the caller can manage the shared system', async () => {
    const app = express();
    app.use(express.json());
    const { updateUserDesignSystemRevisionStatus } = registerRoutes(app, async () => true);
    const baseUrl = await listen(app);

    const res = await fetch(`${baseUrl}/api/design-systems/user:teammate-ds/revisions/rev-1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'accepted' }),
    });

    expect(res.status).toBe(200);
    expect(updateUserDesignSystemRevisionStatus).toHaveBeenCalledOnce();
  });

  it('allows resolving a local revision despite a stale locked header', async () => {
    const app = express();
    app.use(express.json());
    const { updateUserDesignSystemRevisionStatus } = registerRoutes(app, async () => true);
    const baseUrl = await listen(app);

    const res = await fetch(`${baseUrl}/api/design-systems/user:mine/revisions/rev-1`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-od-workspace-id': 'ws-locked',
        'x-od-workspace-member-id': 'member-1',
        'x-od-workspace-lifecycle-state': 'locked',
      },
      body: JSON.stringify({ status: 'accepted' }),
    });

    expect(res.status).toBe(200);
    expect(updateUserDesignSystemRevisionStatus).toHaveBeenCalledOnce();
  });
});

describe('design system local mutations ignore stale Workspace lifecycle headers', () => {
  const lockedHeaders = {
    'x-od-workspace-id': 'ws-locked',
    'x-od-workspace-member-id': 'member-1',
    'x-od-workspace-lifecycle-state': 'locked',
  };

  it('allows publishing/editing when a stale request says the workspace is locked', async () => {
    const app = express();
    app.use(express.json());
    const { updateUserDesignSystem } = registerRoutes(app, async () => true);
    const baseUrl = await listen(app);

    const res = await fetch(`${baseUrl}/api/design-systems/user:mine`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...lockedHeaders },
      body: JSON.stringify({ status: 'published' }),
    });

    expect(res.status).toBe(200);
    expect(updateUserDesignSystem).toHaveBeenCalledOnce();
  });

  it('allows deleting when a stale request says the workspace is locked', async () => {
    const app = express();
    app.use(express.json());
    const { deleteUserDesignSystem } = registerRoutes(app, async () => true);
    const baseUrl = await listen(app);

    const res = await fetch(`${baseUrl}/api/design-systems/user:mine`, {
      method: 'DELETE',
      headers: lockedHeaders,
    });

    expect(res.status).toBe(204);
    expect(deleteUserDesignSystem).toHaveBeenCalledOnce();
  });

  it('allows deleting when a stale request says the workspace is deleted', async () => {
    const app = express();
    app.use(express.json());
    const { deleteUserDesignSystem } = registerRoutes(app, async () => true);
    const baseUrl = await listen(app);

    const res = await fetch(`${baseUrl}/api/design-systems/user:mine`, {
      method: 'DELETE',
      headers: { ...lockedHeaders, 'x-od-workspace-lifecycle-state': 'deleted' },
    });

    expect(res.status).toBe(204);
    expect(deleteUserDesignSystem).toHaveBeenCalledOnce();
  });

  it('still allows deleting an active (unlocked) workspace resource', async () => {
    const app = express();
    app.use(express.json());
    const { deleteUserDesignSystem } = registerRoutes(app, async () => true);
    const baseUrl = await listen(app);

    const res = await fetch(`${baseUrl}/api/design-systems/user:mine`, {
      method: 'DELETE',
      headers: { ...lockedHeaders, 'x-od-workspace-lifecycle-state': 'active' },
    });

    expect(res.status).toBe(204);
    expect(deleteUserDesignSystem).toHaveBeenCalledOnce();
  });
});
