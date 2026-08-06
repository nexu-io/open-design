import { access, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createWorkspaceOwnedDesignSystem,
  deleteWorkspaceOwnedDesignSystem,
} from '../../src/design-systems/workspace-owned-create.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('createWorkspaceOwnedDesignSystem', () => {
  const context = {
    workspaceId: 'ws-rollback',
    appUserId: 'user-rollback',
    workspaceMemberId: 'member-rollback',
    workspaceType: 'team' as const,
    workspaceTypeAsserted: 'team' as const,
    role: 'member' as const,
    memberStatus: 'active' as const,
    lifecycleState: 'active' as const,
    canShareProjects: true,
    canWriteSyncedFiles: true,
  };

  it('reserves orphan and Team logical ids before allocating Personal filesystem bytes', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'od-workspace-owned-ds-reserved-'));
    roots.push(root);
    const ensureWorkspaceResource = vi.fn((
      _type: string,
      workspaceId: string,
      resourceId: string,
      input: Record<string, unknown>,
    ) => ({ workspaceId, resourceId, ...input }));

    const created = await createWorkspaceOwnedDesignSystem(
      root,
      { title: 'Collision', artifactMode: 'agent-managed' },
      context,
      {
        ensureWorkspaceResource,
        listReservedResourceIds: () => ['user:collision'],
      },
    );

    expect(created.id).toBe('user:collision-2');
    expect(await readdir(root)).toEqual(['collision-2']);
  });

  it('rolls back a newly allocated directory when a binding race returns another owner', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'od-workspace-owned-ds-race-'));
    roots.push(root);
    const remove = vi.fn(async () => true);
    const create = vi.fn(async () => ({ id: 'user:race' } as never));
    const ensureWorkspaceResource = vi.fn(() => ({
      workspaceId: 'other-workspace',
      resourceId: 'user:race',
      visibility: 'personal',
      createdByWorkspaceMemberId: 'other-member',
    }));

    await expect(createWorkspaceOwnedDesignSystem(
      root,
      { title: 'Race', artifactMode: 'agent-managed' },
      context,
      {
        createUserDesignSystem: create,
        deleteUserDesignSystem: remove,
        ensureWorkspaceResource,
        listReservedResourceIds: () => [],
      },
    )).rejects.toThrow('DESIGN_SYSTEM_ID_CONFLICT');
    expect(remove).toHaveBeenCalledWith(root, 'user:race');
  });

  it('removes the just-created directory when the Workspace envelope write fails', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'od-workspace-owned-ds-'));
    roots.push(root);
    const ensureWorkspaceResource = vi.fn(() => {
      throw new Error('injected workspace_resources failure');
    });

    await expect(
      createWorkspaceOwnedDesignSystem(
        root,
        { title: 'Rollback fixture', artifactMode: 'agent-managed' },
        context,
        { ensureWorkspaceResource },
      ),
    ).rejects.toThrow('injected workspace_resources failure');

    expect(ensureWorkspaceResource).toHaveBeenCalledWith(
      'design_system',
      'ws-rollback',
      expect.stringMatching(/^user:/),
      {
        visibility: 'personal',
        resourceState: 'active',
        createdByWorkspaceMemberId: 'member-rollback',
        updatedByWorkspaceMemberId: 'member-rollback',
      },
    );
    expect(await readdir(root)).toEqual([]);
  });

  it('preserves headerless local creation without a Workspace envelope', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'od-local-owned-ds-'));
    roots.push(root);
    const ensureWorkspaceResource = vi.fn();

    const created = await createWorkspaceOwnedDesignSystem(
      root,
      { title: 'Local fixture', artifactMode: 'agent-managed' },
      null,
      { ensureWorkspaceResource },
    );

    expect(ensureWorkspaceResource).not.toHaveBeenCalled();
    await expect(access(path.join(root, created.id.slice('user:'.length), 'metadata.json')))
      .resolves.toBeUndefined();
  });
});

describe('deleteWorkspaceOwnedDesignSystem', () => {
  it('keeps the Workspace envelope when filesystem deletion fails', async () => {
    const deleteUserDesignSystem = vi.fn(async () => false);
    const deleteWorkspaceResourceByResourceId = vi.fn();

    await expect(deleteWorkspaceOwnedDesignSystem('/design-systems', 'user:brand', {
      deleteUserDesignSystem,
      deleteWorkspaceResourceByResourceId,
    })).resolves.toBe(false);

    expect(deleteUserDesignSystem).toHaveBeenCalledWith('/design-systems', 'user:brand');
    expect(deleteWorkspaceResourceByResourceId).not.toHaveBeenCalled();
  });

  it('removes the exact Workspace envelope after filesystem deletion succeeds', async () => {
    const deleteUserDesignSystem = vi.fn(async () => true);
    const deleteWorkspaceResourceByResourceId = vi.fn();

    await expect(deleteWorkspaceOwnedDesignSystem('/design-systems', 'user:brand', {
      deleteUserDesignSystem,
      deleteWorkspaceResourceByResourceId,
    })).resolves.toBe(true);

    expect(deleteWorkspaceResourceByResourceId).toHaveBeenCalledWith(
      'design_system',
      'user:brand',
    );
  });
});
