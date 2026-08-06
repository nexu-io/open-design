import { describe, expect, it, vi } from 'vitest';
import { createCollabRuntime, type CollabRuntime } from '../src/collab/runtime.js';

// recvqghymxqQQq follow-up: characterizes how long `syncState` actually stays
// 'pending_upload' after a local (owner-side) file edit on an already-shared
// project, per `markLocalChangePending` in ../src/collab/runtime.ts. The web
// client (apps/web/src/collab/collab-client.ts) only learns the current
// syncState via a fixed 5s poll unless something calls `checkStatusNow()`
// sooner — this test proves the transient window the poll has to land in is,
// with the default debounce and a fast (stub) publish, an order of magnitude
// shorter than that poll interval, so a blind 5s poll will usually observe
// 'synced' on both sides of the edit and never catch 'pending_upload'.
describe('collab runtime — owner upload-badge transient window', () => {
  it('flips pending_upload -> synced well inside the web client\'s 5s status-poll cadence', async () => {
    const runtime: CollabRuntime = createCollabRuntime({
      adapter: { publish: async () => ({ version: 2 }) },
    });
    try {
      const projectId = 'shared-project';
      const principal = {
        memberId: 'owner-1',
        teamId: 'team-1',
        role: 'admin' as const,
        lifecycleState: 'active' as const,
      };

      await runtime.requestTeamShare(projectId, principal);
      expect(runtime.projectSyncState(projectId, principal)).toBe('synced');

      // Simulate collab-publish-watcher.ts's onChange handler firing right
      // after chokidar observes a real file edit on disk.
      runtime.scheduler.notifyChanged(projectId, 'file-change');
      expect(runtime.projectSyncState(projectId, principal)).toBe('pending_upload');

      // Wait past the scheduler's default 400ms debounce plus a fast publish
      // — comfortably under CollabClient's 5_000ms DEFAULT_STATUS_POLL_MS.
      await new Promise((resolve) => setTimeout(resolve, 600));
      expect(runtime.projectSyncState(projectId, principal)).toBe('synced');
    } finally {
      runtime.dispose();
    }
  });
});

describe('collab runtime — member pull materialized version', () => {
  it('returns the version reported by the pull instead of a newer post-pull head', async () => {
    const syncLatest = vi.fn(async () => ({ version: 2 }));
    const runtime = createCollabRuntime({
      adapter: {
        publish: async () => null,
        pull: async () => ({ version: 1, versionId: 'v1' }),
        syncLatest,
      },
    });

    try {
      await expect(runtime.pullLatest('shared-project')).resolves.toEqual({ version: 1 });
      expect(syncLatest).not.toHaveBeenCalled();
    } finally {
      runtime.dispose();
    }
  });
});
