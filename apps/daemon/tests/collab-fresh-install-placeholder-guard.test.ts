import { describe, expect, it, vi } from 'vitest';
import { createCollabPublishWatcher } from '../src/collab/collab-publish-watcher.js';
import { createCollabRuntime } from '../src/collab/runtime.js';
import {
  isUnmaterializedSharedPlaceholder,
  SHARED_PROJECT_PLACEHOLDER_METADATA_KEY,
} from '../src/collab/shared-project-placeholder.js';
import { createShouldPublish } from '../src/collab/should-publish.js';
import type { ResourceHubPrincipal } from '../src/collab/resource-principal.js';

// Red spec for 飞书 recvqzaDvUU6B3 — "uninstall wiped local files; after
// reinstall every shared project got emptied for the whole team".
//
// Reproduced live (feature-test hub, 2026-07-27): a daemon started on a FRESH
// data root, signed in as the same owner, registers a local "共享项目"
// placeholder row the moment the owner opens their own hub-shared project
// (`ensureSharedProjectPlaceholder`, routes/collab-sync.ts). The collab
// publish watcher then discovered that placeholder as a local project, the
// owner check passed (hub says owner === me), and the watcher's
// initial-publish-on-first-watch pushed the EMPTY placeholder directory to
// the resource hub as a brand-new published version — wiping the project's
// content (manifestDigest sha256:e3b0c442… = the empty tree) and its catalog
// display name for every team member, one project after another.
//
// The invariant under test (collab/shared-project-placeholder.ts): a local
// record still carrying the `sharedProjectPlaceholderAt` stamp is not content
// authority. It must never be watched for publish, and no scheduler-driven
// publish may run for it, until a pull materializes real hub content.
//
// Red evidence: before the guard existed, the first test failed on HEAD
// (origin/feat/workspace-team @ 09697edf3) with the watcher subscribing to
// `reinstalled-shared-project` and firing its initial publish.

const ACTIVE_OWNER_PRINCIPAL: ResourceHubPrincipal = {
  teamId: 't1',
  memberId: 'owner-1',
  role: 'owner',
  lifecycleState: 'active',
  workspaceType: 'team',
};

/** The exact local record shape `ensureSharedProjectPlaceholder` +
 *  `markSharedProjectPlaceholder` leave behind on a wiped data root. */
function placeholderRecord(now = Date.now()) {
  return {
    name: '共享项目',
    metadata: { [SHARED_PROJECT_PLACEHOLDER_METADATA_KEY]: now },
  };
}

describe('fresh-install shared-project placeholder must never publish (recvqzaDvUU6B3)', () => {
  it('does not attach a watcher or fire the initial publish for an unmaterialized placeholder the hub says I own', async () => {
    // The exact fresh-install state: the only local record for the project is
    // the placeholder `ensureSharedProjectPlaceholder` registers when the
    // owner opens their own shared project on a wiped data root. There is no
    // local content — publishing this state destroys the hub copy.
    const store = new Map<string, { name?: string | null; metadata?: unknown }>([
      ['reinstalled-shared-project', placeholderRecord()],
    ]);
    const notifyChanged = vi.fn();
    const subscribed: string[] = [];

    const shouldPublish = createShouldPublish({
      // The hub's catalog still lists the project and names this daemon's
      // member as its owner — that is what made the pre-guard code publish.
      resolveSharedProjectOwner: async () => 'owner-1',
      resolveProjectPrincipal: async () => ACTIVE_OWNER_PRINCIPAL,
      rememberTeamShare: vi.fn(),
      hasUnmaterializedPlaceholder: (projectId) =>
        isUnmaterializedSharedPlaceholder(store.get(projectId) ?? null),
    });

    const watcher = createCollabPublishWatcher({
      notifyChanged,
      listProjectIds: () => [...store.keys()],
      shouldPublish,
      subscribeFiles: (projectId) => {
        subscribed.push(projectId);
        return { unsubscribe: () => {} };
      },
    });

    await watcher.reconcile();

    // The wipe propagation is exactly these two calls happening: subscribe +
    // the initial "publish current (empty) content" notification.
    expect(subscribed).toEqual([]);
    expect(notifyChanged).not.toHaveBeenCalled();
  });

  it('resumes watching (and the initial publish) once the pull flow clears the placeholder stamp', async () => {
    const store = new Map<string, { name?: string | null; metadata?: unknown }>([
      ['reinstalled-shared-project', placeholderRecord()],
    ]);
    const notifyChanged = vi.fn();
    const watcher = createCollabPublishWatcher({
      notifyChanged,
      listProjectIds: () => [...store.keys()],
      shouldPublish: createShouldPublish({
        resolveSharedProjectOwner: async () => 'owner-1',
        resolveProjectPrincipal: async () => ACTIVE_OWNER_PRINCIPAL,
        rememberTeamShare: vi.fn(),
        hasUnmaterializedPlaceholder: (projectId) =>
          isUnmaterializedSharedPlaceholder(store.get(projectId) ?? null),
      }),
      subscribeFiles: () => ({ unsubscribe: () => {} }),
    });

    await watcher.reconcile();
    expect(notifyChanged).not.toHaveBeenCalled();

    // What the pull flow does after materializing real hub content locally:
    // registerPreparedPulledProject swaps the record and
    // markSharedProjectPlaceholder(projectId, false) drops the stamp.
    store.set('reinstalled-shared-project', { name: 'Real project', metadata: {} });

    await watcher.reconcile();
    expect(notifyChanged).toHaveBeenCalledTimes(1);
    expect(notifyChanged).toHaveBeenCalledWith(
      'reinstalled-shared-project',
      ACTIVE_OWNER_PRINCIPAL,
    );
  });

  it('blocks a scheduler-driven publish for a placeholder at the runtime choke point, without touching explicit shares', async () => {
    // Layer 2: even when a publish notification reaches the scheduler (e.g. a
    // direct POST /collab/publish nudge, or a watcher attached before the
    // stamp landed), the flush itself must refuse a placeholder.
    const store = new Map<string, { name?: string | null; metadata?: unknown }>([
      ['placeholder-project', placeholderRecord()],
      ['real-project', { name: 'Real', metadata: {} }],
    ]);
    const publish = vi.fn(async (_input: { projectId: string }) => ({ version: 7 }));
    const principal: ResourceHubPrincipal = {
      teamId: 't1',
      memberId: 'owner-1',
      role: 'owner',
      lifecycleState: 'active',
    };
    const runtime = createCollabRuntime({
      adapter: { publish },
      workspaceContext: {
        current: () =>
          Promise.resolve({
            workspaceType: 'team',
            workspaceId: 't1',
            workspaceMemberId: 'owner-1',
            memberStatus: 'active',
          } as never),
      },
      canPublishProjectContent: (projectId) =>
        !isUnmaterializedSharedPlaceholder(store.get(projectId) ?? null),
    });
    runtime.rememberTeamShare('placeholder-project', principal);
    runtime.rememberTeamShare('real-project', principal);

    // notifyChanged schedules the debounced publish; runBoundary flushes it
    // immediately (the exact POST /collab/changed + /collab/publish shape).
    runtime.scheduler.notifyChanged('placeholder-project');
    runtime.scheduler.runBoundary('placeholder-project');
    runtime.scheduler.notifyChanged('real-project');
    runtime.scheduler.runBoundary('real-project');
    await vi.waitFor(() => {
      expect(publish).toHaveBeenCalled();
    });

    const publishedIds = publish.mock.calls.map((call) => call[0].projectId);
    expect(publishedIds).toContain('real-project');
    expect(publishedIds).not.toContain('placeholder-project');

    // An explicit share is the user deliberately publishing their local
    // state; it never carries the stamp in practice and stays ungated.
    publish.mockClear();
    await runtime.requestTeamShare('brand-new-local-project', principal);
    expect(publish).toHaveBeenCalledTimes(1);

    runtime.dispose();
  });
});
