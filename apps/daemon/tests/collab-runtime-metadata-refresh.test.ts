import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createCollabRuntime, type CollabRuntime } from '../src/collab/runtime.js';
import type { ResourcePublishAdapter } from '../src/collab/publish-scheduler.js';
import type { ResourceHubPrincipal } from '../src/collab/resource-principal.js';
import {
  closeDatabase,
  ensureWorkspaceProject,
  insertProject,
  listTeamWorkspaceProjectShares,
  openDatabase,
  setWorkspaceProjectMetadataRefreshPending,
} from '../src/db.js';

describe('shared-project metadata refresh', () => {
  let runtime: CollabRuntime | null = null;

  afterEach(() => {
    runtime?.dispose();
    runtime = null;
    closeDatabase();
    vi.useRealTimers();
  });

  it('re-upserts an owner rename for every remembered Team share without publishing content', async () => {
    let projectName = 'Before rename';
    const publish = vi.fn();
    const upsert = vi.fn(async () => {});
    const adapter: ResourcePublishAdapter = {
      publish,
    };
    const principal: ResourceHubPrincipal = {
      memberId: 'owner-member',
      teamId: 'team-1',
      role: 'owner',
      lifecycleState: 'active',
    };
    runtime = createCollabRuntime({
      adapter,
      describeProject: () => ({ name: projectName }),
      teamProjectCatalog: {
        upsert,
        remove: vi.fn(async () => {}),
      },
    });
    runtime.rememberTeamShare('shared-project', principal, 'synced');

    projectName = 'Owner renamed project';
    runtime.refreshTeamProjectMetadata('shared-project');

    await vi.waitFor(() => {
      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'shared-project',
          displayName: 'Owner renamed project',
          metadata: expect.objectContaining({ name: 'Owner renamed project' }),
          syncState: 'synced',
        }),
        principal,
      );
    });
    expect(publish).not.toHaveBeenCalled();
  });

  it('retries a transient catalog failure with the exact remembered Team principal', async () => {
    vi.useFakeTimers();
    const upsert = vi.fn()
      .mockRejectedValueOnce(new Error('catalog temporarily unavailable'))
      .mockResolvedValue(undefined);
    const principal: ResourceHubPrincipal = {
      memberId: 'owner-member',
      teamId: 'team-1',
      role: 'owner',
      lifecycleState: 'active',
    };
    const onMetadataRefreshPending = vi.fn();
    const onMetadataRefreshComplete = vi.fn();
    runtime = createCollabRuntime({
      adapter: { publish: vi.fn() },
      describeProject: () => ({ name: 'Owner renamed project' }),
      teamProjectCatalog: {
        upsert,
        remove: vi.fn(async () => {}),
      },
      onMetadataRefreshPending,
      onMetadataRefreshComplete,
    });
    runtime.rememberTeamShare('shared-project', principal, 'synced');

    runtime.refreshTeamProjectMetadata('shared-project');
    await vi.advanceTimersByTimeAsync(0);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(runtime.projectSyncState('shared-project', principal)).toBe('synced');
    expect(onMetadataRefreshPending).toHaveBeenCalledWith({
      projectId: 'shared-project',
      principal,
    });
    expect(onMetadataRefreshComplete).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(999);
    expect(upsert).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        projectId: 'shared-project',
        displayName: 'Owner renamed project',
        metadata: expect.objectContaining({ name: 'Owner renamed project' }),
        syncState: 'synced',
      }),
      principal,
    );
    expect(runtime.projectSyncState('shared-project', principal)).toBe('synced');
    expect(onMetadataRefreshComplete).toHaveBeenCalledWith({
      projectId: 'shared-project',
      principal,
    });
  });

  it('does not re-upsert clean persisted Team shares during daemon startup', async () => {
    vi.useFakeTimers();
    const upsert = vi.fn(async () => {});
    runtime = createCollabRuntime({
      adapter: { publish: vi.fn() },
      describeProject: () => ({ name: 'Clean project' }),
      teamProjectCatalog: { upsert, remove: vi.fn(async () => {}) },
    });

    for (let index = 0; index < 100; index += 1) {
      runtime.rememberTeamShare(
        `shared-project-${index}`,
        {
          memberId: 'owner-member',
          teamId: 'team-1',
          role: 'owner',
          lifecycleState: 'active',
        },
        'synced',
      );
    }
    await vi.advanceTimersByTimeAsync(60_000);

    expect(upsert).not.toHaveBeenCalled();
  });

  it('re-upserts current metadata when a dirty persisted Team share is restored', async () => {
    vi.useFakeTimers();
    const upsert = vi.fn(async () => {});
    const principal: ResourceHubPrincipal = {
      memberId: 'owner-member',
      teamId: 'team-1',
      role: 'owner',
      lifecycleState: 'active',
    };
    runtime = createCollabRuntime({
      adapter: { publish: vi.fn() },
      describeProject: () => ({ name: 'Durable renamed project' }),
      teamProjectCatalog: {
        upsert,
        remove: vi.fn(async () => {}),
      },
    });

    runtime.rememberTeamShare(
      'shared-project',
      principal,
      'synced',
      { metadataRefreshPending: true },
    );
    await vi.advanceTimersByTimeAsync(0);

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'shared-project',
        displayName: 'Durable renamed project',
        syncState: 'synced',
      }),
      principal,
    );
  });

  it('cancels a pending metadata retry before removing the exact Team share', async () => {
    vi.useFakeTimers();
    const upsert = vi.fn()
      .mockRejectedValueOnce(new Error('catalog temporarily unavailable'))
      .mockResolvedValue(undefined);
    const remove = vi.fn(async () => {});
    const unpublish = vi.fn(async () => {});
    const principal: ResourceHubPrincipal = {
      memberId: 'owner-member',
      teamId: 'team-1',
      role: 'owner',
      lifecycleState: 'active',
    };
    runtime = createCollabRuntime({
      adapter: { publish: vi.fn(), unpublish },
      describeProject: () => ({ name: 'Owner renamed project' }),
      teamProjectCatalog: { upsert, remove },
    });
    runtime.rememberTeamShare('shared-project', principal, 'pending_upload');
    runtime.refreshTeamProjectMetadata('shared-project');
    await vi.advanceTimersByTimeAsync(0);
    expect(upsert).toHaveBeenCalledTimes(1);

    await runtime.requestTeamUnshare('shared-project', principal);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(unpublish).toHaveBeenCalledWith({
      projectId: 'shared-project',
      principal,
    });
    expect(remove).toHaveBeenCalledWith('shared-project', principal);
  });

  it('persists metadata repair separately from content sync state across restart', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'od-metadata-refresh-'));
    const dataDir = path.join(root, 'data');
    try {
      const now = Date.now();
      let db = openDatabase(root, { dataDir });
      insertProject(db, {
        id: 'shared-project',
        name: 'Renamed project',
        createdAt: now,
        updatedAt: now,
      });
      ensureWorkspaceProject(db, {
        projectId: 'shared-project',
        workspaceId: 'team-1',
        visibility: 'team',
        resourceState: 'active',
        createdByWorkspaceMemberId: 'owner-member',
        updatedByWorkspaceMemberId: 'owner-member',
        syncState: 'synced',
        createdAt: now,
        updatedAt: now,
      });

      setWorkspaceProjectMetadataRefreshPending(db, 'team-1', 'shared-project', true);
      closeDatabase();
      db = openDatabase(root, { dataDir });

      expect(listTeamWorkspaceProjectShares(db)).toEqual([
        expect.objectContaining({
          projectId: 'shared-project',
          workspaceId: 'team-1',
          syncState: 'synced',
          metadataRefreshPending: 1,
        }),
      ]);

      setWorkspaceProjectMetadataRefreshPending(db, 'team-1', 'shared-project', false);
      expect(listTeamWorkspaceProjectShares(db)[0]).toEqual(
        expect.objectContaining({
          syncState: 'synced',
          metadataRefreshPending: 0,
        }),
      );
    } finally {
      closeDatabase();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
