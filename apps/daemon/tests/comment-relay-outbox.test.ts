import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type CollabMemberRole,
  type PreviewComment,
  type WorkspaceCollabContext,
} from '@open-design/contracts';
import {
  closeDatabase,
  insertConversation,
  insertProject,
  openDatabase,
} from '../src/db.js';
import { createCollabCloudService } from '../src/collab/collab-cloud-service.js';
import {
  commentRelayLocalBindingMatches,
  createCommentRelayOutboxStore,
  type CommentRelayLocalProjectBinding,
} from '../src/collab/comment-relay-outbox.js';
import type { CollabCloudClient } from '../src/integrations/collab-cloud.js';

let tempDir: string | null = null;

afterEach(() => {
  closeDatabase();
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  tempDir = null;
});

function seededDb() {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-comment-relay-outbox-'));
  const db = openDatabase(tempDir);
  insertProject(db, { id: 'p1', name: 'Project', createdAt: 1, updatedAt: 1 });
  insertConversation(db, {
    id: 'conv-local',
    projectId: 'p1',
    title: 'Chat',
    createdAt: 1,
    updatedAt: 1,
  });
  return db;
}

function context(
  role: CollabMemberRole = 'member',
  patch: Partial<WorkspaceCollabContext> = {},
): WorkspaceCollabContext {
  return {
    workspaceId: 'workspace-a',
    workspaceType: 'team',
    workspaceMemberId: `member-${role}`,
    role,
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: null,
    providerMode: 'platform_credits',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 5, usedSeats: 3 }),
    permissions: buildWorkspacePermissions({ role, lifecycleState: 'active' }),
    teamId: 'team-a',
    displayName: role,
    ...patch,
  };
}

function comment(patch: Partial<PreviewComment> = {}): PreviewComment {
  return {
    id: 'comment-1',
    projectId: 'p1',
    conversationId: 'conv-local',
    filePath: 'index.html',
    elementId: 'hero',
    selector: '#hero',
    label: 'Hero',
    text: 'Hero',
    position: { x: 1, y: 2, width: 3, height: 4 },
    htmlHint: '<h1>',
    note: 'first note',
    status: 'open',
    createdAt: 10,
    updatedAt: 10,
    authorMemberId: 'member-member',
    ...patch,
  };
}

function clientWithPush(
  push: CollabCloudClient['pushComment'],
): CollabCloudClient {
  return { pushComment: push } as unknown as CollabCloudClient;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function waitForCondition(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await Promise.resolve();
  }
  throw new Error('condition did not become true');
}

describe('durable Team comment relay outbox', () => {
  it.each<CollabMemberRole>(['owner', 'admin', 'member'])(
    'delivers %s comments under the exact queued Workspace identity',
    async (role) => {
      const db = seededDb();
      const queuedContext = context(role);
      const calls: Array<{ teamId: string; memberId: string }> = [];
      const outbox = createCommentRelayOutboxStore(db, () => 100);
      const service = createCollabCloudService({
        client: clientWithPush(async (teamId, _projectId, payload) => {
          calls.push({ teamId, memberId: payload.memberId });
          return { seq: 7 };
        }),
        commentOutbox: outbox,
        resolveLocalProjectRelayBinding: () => ({
          workspaceId: 'workspace-a',
          ownerMemberId: 'project-owner',
        }),
        resolveRemoteProjectOwnerMemberId: async () => 'project-owner',
        listProjectIds: () => [],
        resolveProjectWorkspaceContext: async (_projectId, options) => {
          expect(options).toEqual({ fresh: true });
          return queuedContext;
        },
        resolveLocalConversationId: () => 'conv-local',
        mergeComment: () => false,
        now: () => 100,
        retryDelayMs: () => 0,
      });

      expect(service.enqueueComment(comment({ authorMemberId: queuedContext.workspaceMemberId }), queuedContext))
        .toBe(true);
      expect(outbox.count()).toBe(1);
      await service.flushPendingComments();

      expect(calls).toEqual([
        { teamId: 'team-a', memberId: queuedContext.workspaceMemberId },
      ]);
      expect(outbox.count()).toBe(0);
      service.dispose();
    },
  );

  it('retries a failed push after restart and confirms the cloud sequence', async () => {
    const db = seededDb();
    const queuedContext = context('member');
    const firstOutbox = createCommentRelayOutboxStore(db, () => 200);
    const firstService = createCollabCloudService({
      client: clientWithPush(async () => {
        throw new Error('Vela TLS unavailable');
      }),
      commentOutbox: firstOutbox,
      resolveLocalProjectRelayBinding: () => ({
        workspaceId: 'workspace-a',
        ownerMemberId: 'project-owner',
      }),
      resolveRemoteProjectOwnerMemberId: async () => 'project-owner',
      listProjectIds: () => [],
      resolveProjectWorkspaceContext: async () => queuedContext,
      resolveLocalConversationId: () => 'conv-local',
      mergeComment: () => false,
      now: () => 200,
      retryDelayMs: () => 0,
    });
    firstService.enqueueComment(comment(), queuedContext);
    await firstService.flushPendingComments();
    expect(firstOutbox.count()).toBe(1);
    firstService.dispose();

    // A new service + newly opened SQLite handle sees and drains the same row.
    closeDatabase();
    const reopened = openDatabase(tempDir!);
    const reopenedOutbox = createCommentRelayOutboxStore(reopened, () => 200);
    const confirmed: Array<{ commentId: string; seq: number }> = [];
    const secondService = createCollabCloudService({
      client: clientWithPush(async () => ({ seq: 42 })),
      commentOutbox: reopenedOutbox,
      resolveLocalProjectRelayBinding: () => ({
        workspaceId: 'workspace-a',
        ownerMemberId: 'project-owner',
      }),
      resolveRemoteProjectOwnerMemberId: async () => 'project-owner',
      listProjectIds: () => [],
      resolveProjectWorkspaceContext: async () => queuedContext,
      resolveLocalConversationId: () => 'conv-local',
      mergeComment: () => false,
      onCommentPushed: ({ commentId, seq }) => confirmed.push({ commentId, seq }),
      now: () => 200,
      retryDelayMs: () => 0,
    });
    await secondService.flushPendingComments();

    expect(reopenedOutbox.count()).toBe(0);
    expect(confirmed).toEqual([{ commentId: 'comment-1', seq: 42 }]);
    secondService.dispose();
  });

  it('retries in the running daemon after the relay recovers', async () => {
    const db = seededDb();
    const queuedContext = context('owner');
    let attempts = 0;
    const outbox = createCommentRelayOutboxStore(db, () => 250);
    const service = createCollabCloudService({
      client: clientWithPush(async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('temporary network failure');
        return { seq: 9 };
      }),
      commentOutbox: outbox,
      resolveLocalProjectRelayBinding: () => ({
        workspaceId: 'workspace-a',
        ownerMemberId: 'project-owner',
      }),
      resolveRemoteProjectOwnerMemberId: async () => 'project-owner',
      listProjectIds: () => [],
      resolveProjectWorkspaceContext: async () => queuedContext,
      resolveLocalConversationId: () => 'conv-local',
      mergeComment: () => false,
      now: () => 250,
      retryDelayMs: () => 0,
    });
    service.enqueueComment(comment({ authorMemberId: 'member-owner' }), queuedContext);

    await service.flushPendingComments();
    expect(attempts).toBe(1);
    expect(outbox.count()).toBe(1);
    await service.flushPendingComments();

    expect(attempts).toBe(2);
    expect(outbox.count()).toBe(0);
    service.dispose();
  });

  it('coalesces edits and delete tombstones without losing their latest state', async () => {
    const db = seededDb();
    const queuedContext = context('admin');
    const pushed: Array<{ note: string; deleted: boolean }> = [];
    const outbox = createCommentRelayOutboxStore(db, () => 300);
    const service = createCollabCloudService({
      client: clientWithPush(async (_teamId, _projectId, payload) => {
        pushed.push({ note: payload.note, deleted: payload.deleted === true });
        return { seq: pushed.length };
      }),
      commentOutbox: outbox,
      resolveLocalProjectRelayBinding: () => ({
        workspaceId: 'workspace-a',
        ownerMemberId: 'project-owner',
      }),
      resolveRemoteProjectOwnerMemberId: async () => 'project-owner',
      listProjectIds: () => [],
      resolveProjectWorkspaceContext: async () => queuedContext,
      resolveLocalConversationId: () => 'conv-local',
      mergeComment: () => false,
      now: () => 300,
      retryDelayMs: () => 0,
    });

    service.enqueueComment(comment(), queuedContext);
    service.enqueueComment(comment({ note: 'edited note', updatedAt: 20 }), queuedContext);
    expect(outbox.count()).toBe(1);
    await service.flushPendingComments();
    expect(pushed).toEqual([{ note: 'edited note', deleted: false }]);

    service.enqueueCommentDeletion(comment({ note: 'edited note', updatedAt: 20 }), queuedContext);
    await service.flushPendingComments();
    expect(pushed).toEqual([
      { note: 'edited note', deleted: false },
      { note: 'edited note', deleted: true },
    ]);
    expect(outbox.count()).toBe(0);
    service.dispose();
  });

  it('keeps a row pending across identity, Workspace, and Personal mismatches', async () => {
    const db = seededDb();
    const queuedContext = context('member');
    let resolved = context('member', { workspaceMemberId: 'other-member' });
    let pushes = 0;
    const outbox = createCommentRelayOutboxStore(db, () => 400);
    const service = createCollabCloudService({
      client: clientWithPush(async () => {
        pushes += 1;
        return { seq: 1 };
      }),
      commentOutbox: outbox,
      resolveLocalProjectRelayBinding: () => ({
        workspaceId: 'workspace-a',
        ownerMemberId: 'project-owner',
      }),
      resolveRemoteProjectOwnerMemberId: async () => 'project-owner',
      listProjectIds: () => [],
      resolveProjectWorkspaceContext: async () => resolved,
      resolveLocalConversationId: () => 'conv-local',
      mergeComment: () => false,
      now: () => 400,
      retryDelayMs: () => 0,
    });
    service.enqueueComment(comment(), queuedContext);

    await service.flushPendingComments();
    resolved = context('member', {
      workspaceId: 'workspace-b',
      teamId: 'team-b',
    });
    await service.flushPendingComments();
    resolved = context('member', {
      workspaceType: 'personal',
      workspaceId: 'workspace-personal',
    });
    delete (resolved as Partial<WorkspaceCollabContext>).teamId;
    await service.flushPendingComments();

    expect(pushes).toBe(0);
    expect(outbox.count()).toBe(1);

    resolved = queuedContext;
    await service.flushPendingComments();
    expect(pushes).toBe(1);
    expect(outbox.count()).toBe(0);
    service.dispose();
  });

  it('keeps the delivery pending when the remote catalog is unavailable', async () => {
    const db = seededDb();
    const queuedContext = context('member');
    let pushes = 0;
    const outbox = createCommentRelayOutboxStore(db, () => 500);
    const service = createCollabCloudService({
      client: clientWithPush(async () => {
        pushes += 1;
        return { seq: 1 };
      }),
      commentOutbox: outbox,
      resolveLocalProjectRelayBinding: () => ({
        workspaceId: 'workspace-a',
        ownerMemberId: 'project-owner',
      }),
      resolveRemoteProjectOwnerMemberId: async () => {
        throw new Error('catalog unavailable');
      },
      listProjectIds: () => [],
      resolveProjectWorkspaceContext: async () => queuedContext,
      resolveLocalConversationId: () => 'conv-local',
      mergeComment: () => false,
      now: () => 500,
      retryDelayMs: () => 0,
    });
    service.enqueueComment(comment(), queuedContext);
    await service.flushPendingComments();

    expect(pushes).toBe(0);
    expect(outbox.count()).toBe(1);
    service.dispose();
  });

  it.each([
    { name: 'remote unshare', remoteOwner: null },
    { name: 'remote owner conflict', remoteOwner: 'different-owner' },
  ])('terminally cancels after $name without pushing', async ({ remoteOwner }) => {
    const db = seededDb();
    const queuedContext = context('admin');
    let pushes = 0;
    const outbox = createCommentRelayOutboxStore(db, () => 600);
    const service = createCollabCloudService({
      client: clientWithPush(async () => {
        pushes += 1;
        return { seq: 1 };
      }),
      commentOutbox: outbox,
      resolveLocalProjectRelayBinding: () => ({
        workspaceId: 'workspace-a',
        ownerMemberId: 'project-owner',
      }),
      resolveRemoteProjectOwnerMemberId: async () => remoteOwner,
      listProjectIds: () => [],
      resolveProjectWorkspaceContext: async () => queuedContext,
      resolveLocalConversationId: () => 'conv-local',
      mergeComment: () => false,
      now: () => 600,
      retryDelayMs: () => 0,
    });
    service.enqueueComment(comment(), queuedContext);
    await service.flushPendingComments();

    expect(pushes).toBe(0);
    expect(outbox.count()).toBe(0);
    service.dispose();
  });

  it('reuses one fresh authority and one catalog snapshot for an exact identity batch', async () => {
    const db = seededDb();
    const queuedContext = context('member');
    let timestamp = 700;
    let authorityReads = 0;
    let catalogReads = 0;
    let legacyAuthorityReads = 0;
    let legacyCatalogReads = 0;
    const pushed: string[] = [];
    const outbox = createCommentRelayOutboxStore(db, () => timestamp++);
    const deps = Object.assign({
      client: clientWithPush(async (_teamId, projectId, payload) => {
        pushed.push(`${projectId}:${payload.id}`);
        return { seq: pushed.length };
      }),
      commentOutbox: outbox,
      resolveLocalProjectRelayBinding: () => ({
        workspaceId: 'workspace-a',
        ownerMemberId: 'project-owner',
      }),
      resolveProjectWorkspaceContext: async () => {
        legacyAuthorityReads += 1;
        return queuedContext;
      },
      resolveRemoteProjectOwnerMemberId: async () => {
        legacyCatalogReads += 1;
        return 'project-owner';
      },
      listProjectIds: () => [],
      resolveLocalConversationId: () => 'conv-local',
      mergeComment: () => false,
      now: () => 1_000,
      retryDelayMs: () => 0,
    }, {
      resolveCommentRelayWorkspaceContext: async () => {
        authorityReads += 1;
        return queuedContext;
      },
      listRemoteProjectRelayBindings: async () => {
        catalogReads += 1;
        return [
          { projectId: 'p1', ownerMemberId: 'project-owner' },
          { projectId: 'p2', ownerMemberId: 'project-owner' },
        ];
      },
    });
    const service = createCollabCloudService(deps);

    for (const [projectId, commentId] of [
      ['p1', 'comment-1'],
      ['p1', 'comment-2'],
      ['p2', 'comment-3'],
      ['p2', 'comment-4'],
    ] as const) {
      expect(service.enqueueComment(comment({ id: commentId, projectId }), queuedContext))
        .toBe(true);
    }

    await service.flushPendingComments();

    expect(authorityReads).toBe(1);
    expect(catalogReads).toBe(1);
    expect(legacyAuthorityReads).toBe(0);
    expect(legacyCatalogReads).toBe(0);
    expect(pushed).toHaveLength(4);
    expect(outbox.count()).toBe(0);
    service.dispose();
  });

  it('bounds independent project pushes while preserving each project order', async () => {
    const db = seededDb();
    const queuedContext = context('member');
    let timestamp = 800;
    let activePushes = 0;
    let maxActivePushes = 0;
    const started: string[] = [];
    const deliveries = new Map(
      [
        'p1:comment-1',
        'p1:comment-2',
        'p2:comment-3',
        'p3:comment-4',
        'p4:comment-5',
        'p5:comment-6',
      ].map((key) => [key, deferred<{ seq: number }>()]),
    );
    const outbox = createCommentRelayOutboxStore(db, () => timestamp++);
    const deps = Object.assign({
      client: clientWithPush(async (_teamId, projectId, payload) => {
        const key = `${projectId}:${payload.id}`;
        started.push(key);
        activePushes += 1;
        maxActivePushes = Math.max(maxActivePushes, activePushes);
        try {
          return await deliveries.get(key)!.promise;
        } finally {
          activePushes -= 1;
        }
      }),
      commentOutbox: outbox,
      resolveLocalProjectRelayBinding: () => ({
        workspaceId: 'workspace-a',
        ownerMemberId: 'project-owner',
      }),
      resolveProjectWorkspaceContext: async () => queuedContext,
      resolveRemoteProjectOwnerMemberId: async () => 'project-owner',
      listProjectIds: () => [],
      resolveLocalConversationId: () => 'conv-local',
      mergeComment: () => false,
      now: () => 1_000,
      retryDelayMs: () => 0,
    }, {
      resolveCommentRelayWorkspaceContext: async () => queuedContext,
      listRemoteProjectRelayBindings: async () =>
        ['p1', 'p2', 'p3', 'p4', 'p5'].map((projectId) => ({
          projectId,
          ownerMemberId: 'project-owner',
        })),
    });
    const service = createCollabCloudService(deps);
    for (const [projectId, commentId] of [
      ['p1', 'comment-1'],
      ['p1', 'comment-2'],
      ['p2', 'comment-3'],
      ['p3', 'comment-4'],
      ['p4', 'comment-5'],
      ['p5', 'comment-6'],
    ] as const) {
      expect(service.enqueueComment(comment({ id: commentId, projectId }), queuedContext))
        .toBe(true);
    }

    const flushing = service.flushPendingComments();
    try {
      await waitForCondition(() => started.length >= 4);
      expect(started).toEqual([
        'p1:comment-1',
        'p2:comment-3',
        'p3:comment-4',
        'p4:comment-5',
      ]);
      expect(started).not.toContain('p1:comment-2');
      expect(maxActivePushes).toBe(4);

      deliveries.get('p2:comment-3')!.resolve({ seq: 3 });
      await waitForCondition(() => started.includes('p5:comment-6'));
      expect(started).not.toContain('p1:comment-2');

      deliveries.get('p1:comment-1')!.resolve({ seq: 1 });
      await waitForCondition(() => started.includes('p1:comment-2'));
      expect(maxActivePushes).toBe(4);
    } finally {
      let seq = 10;
      for (const delivery of deliveries.values()) {
        delivery.resolve({ seq });
        seq += 1;
      }
      await flushing;
      service.dispose();
    }

    expect(outbox.count()).toBe(0);
  });

  it('keeps a newer revision queued when a batched push acknowledges an older payload', async () => {
    const db = seededDb();
    const queuedContext = context('member');
    let timestamp = 900;
    const firstPush = deferred<{ seq: number }>();
    const pushedNotes: string[] = [];
    const outbox = createCommentRelayOutboxStore(db, () => timestamp++);
    const deps = Object.assign({
      client: clientWithPush(async (_teamId, _projectId, payload) => {
        pushedNotes.push(payload.note);
        if (pushedNotes.length === 1) return firstPush.promise;
        return { seq: 2 };
      }),
      commentOutbox: outbox,
      resolveLocalProjectRelayBinding: () => ({
        workspaceId: 'workspace-a',
        ownerMemberId: 'project-owner',
      }),
      listProjectIds: () => [],
      resolveLocalConversationId: () => 'conv-local',
      mergeComment: () => false,
      now: () => 1_000,
      retryDelayMs: () => 0,
    }, {
      resolveCommentRelayWorkspaceContext: async () => queuedContext,
      listRemoteProjectRelayBindings: async () => [{
        projectId: 'p1',
        ownerMemberId: 'project-owner',
      }],
    });
    const service = createCollabCloudService(deps);
    service.enqueueComment(comment(), queuedContext);

    const firstFlush = service.flushPendingComments();
    await waitForCondition(() => pushedNotes.length === 1);
    service.enqueueComment(comment({ note: 'newer note', updatedAt: 20 }), queuedContext);
    firstPush.resolve({ seq: 1 });
    await firstFlush;

    expect(outbox.count()).toBe(1);
    await service.flushPendingComments();
    expect(pushedNotes).toEqual(['first note', 'newer note']);
    expect(outbox.count()).toBe(0);
    service.dispose();
  });

  it('does not lose a drain request when a newer same-project revision arrives during push', async () => {
    const db = seededDb();
    const queuedContext = context('member');
    let timestamp = 950;
    const firstPush = deferred<{ seq: number }>();
    const pushedNotes: string[] = [];
    const outbox = createCommentRelayOutboxStore(db, () => timestamp++);
    const deps = Object.assign({
      client: clientWithPush(async (_teamId, _projectId, payload) => {
        pushedNotes.push(payload.note);
        if (pushedNotes.length === 1) return firstPush.promise;
        return { seq: 2 };
      }),
      commentOutbox: outbox,
      resolveLocalProjectRelayBinding: () => ({
        workspaceId: 'workspace-a',
        ownerMemberId: 'project-owner',
      }),
      listProjectIds: () => [],
      resolveLocalConversationId: () => 'conv-local',
      mergeComment: () => false,
      now: () => 1_000,
      retryDelayMs: () => 0,
    }, {
      resolveCommentRelayWorkspaceContext: async () => queuedContext,
      listRemoteProjectRelayBindings: async () => [{
        projectId: 'p1',
        ownerMemberId: 'project-owner',
      }],
    });
    const service = createCollabCloudService(deps);
    service.enqueueComment(comment(), queuedContext);

    const firstFlush = service.flushPendingComments();
    await waitForCondition(() => pushedNotes.length === 1);
    service.enqueueComment(comment({ note: 'newer note', updatedAt: 20 }), queuedContext);
    // This is the same signal queuedCloudComment schedules in production.
    // It must join the active drain instead of becoming a dropped no-op.
    await service.flushPendingComments();
    firstPush.resolve({ seq: 1 });
    await firstFlush;

    expect(pushedNotes).toEqual(['first note', 'newer note']);
    expect(outbox.count()).toBe(0);
    service.dispose();
  });

  it('fails a batch closed before catalog or push when its fresh identity changed', async () => {
    const db = seededDb();
    const queuedContext = context('member');
    let catalogReads = 0;
    let pushes = 0;
    const outbox = createCommentRelayOutboxStore(db, () => 1_000);
    const deps = Object.assign({
      client: clientWithPush(async () => {
        pushes += 1;
        return { seq: 1 };
      }),
      commentOutbox: outbox,
      resolveLocalProjectRelayBinding: () => ({
        workspaceId: 'workspace-a',
        ownerMemberId: 'project-owner',
      }),
      listProjectIds: () => [],
      resolveLocalConversationId: () => 'conv-local',
      mergeComment: () => false,
      now: () => 1_000,
      retryDelayMs: () => 0,
    }, {
      resolveCommentRelayWorkspaceContext: async () =>
        context('member', { workspaceMemberId: 'different-member' }),
      listRemoteProjectRelayBindings: async () => {
        catalogReads += 1;
        return [{ projectId: 'p1', ownerMemberId: 'project-owner' }];
      },
    });
    const service = createCollabCloudService(deps);
    service.enqueueComment(comment(), queuedContext);

    await service.flushPendingComments();

    expect(catalogReads).toBe(0);
    expect(pushes).toBe(0);
    expect(outbox.count()).toBe(1);
    service.dispose();
  });

  it('does not let a stalled outbound batch block inbound comment pulls', async () => {
    const db = seededDb();
    const queuedContext = context('member');
    const stalledPush = deferred<{ seq: number }>();
    let pushStarted = false;
    let pulls = 0;
    const outbox = createCommentRelayOutboxStore(db, () => 1_100);
    const client = {
      pushComment: async () => {
        pushStarted = true;
        return stalledPush.promise;
      },
      registerMember: async () => ({
        memberId: 'member-member',
        displayName: 'member',
        role: 'member' as const,
      }),
      pullComments: async () => {
        pulls += 1;
        return {
          comments: [],
          latestSeq: 0,
          etag: null,
          notModified: true,
        };
      },
    } as unknown as CollabCloudClient;
    const deps = Object.assign({
      client,
      commentOutbox: outbox,
      resolveLocalProjectRelayBinding: () => ({
        workspaceId: 'workspace-a',
        ownerMemberId: 'project-owner',
      }),
      listProjectIds: () => ['p1'],
      resolveProjectWorkspaceContext: async () => queuedContext,
      resolveLocalConversationId: () => 'conv-local',
      mergeComment: () => false,
      now: () => 1_100,
      retryDelayMs: () => 0,
    }, {
      resolveCommentRelayWorkspaceContext: async () => queuedContext,
      listRemoteProjectRelayBindings: async () => [{
        projectId: 'p1',
        ownerMemberId: 'project-owner',
      }],
    });
    const service = createCollabCloudService(deps);
    service.enqueueComment(comment(), queuedContext);

    const polling = service.pollOnce();
    try {
      await waitForCondition(() => pushStarted);
      await waitForCondition(() => pulls === 1);
      expect(pulls).toBe(1);
    } finally {
      stalledPush.resolve({ seq: 1 });
      await polling;
      service.dispose();
    }
  });

  it.each<{
    name: string;
    binding: CommentRelayLocalProjectBinding;
  }>([
    {
      name: 'local unshare',
      binding: {
        workspaceId: 'workspace-a',
        visibility: 'personal',
        resourceState: 'active',
        createdByWorkspaceMemberId: 'project-owner',
      },
    },
    {
      name: 'local deletion',
      binding: {
        workspaceId: 'workspace-a',
        visibility: 'team',
        resourceState: 'deleted',
        createdByWorkspaceMemberId: 'project-owner',
      },
    },
    {
      name: 'local owner mismatch',
      binding: {
        workspaceId: 'workspace-a',
        visibility: 'team',
        resourceState: 'active',
        createdByWorkspaceMemberId: 'different-owner',
      },
    },
  ])('does not push after $name even while the remote catalog is stale', async ({ binding }) => {
    const db = seededDb();
    const queuedContext = context('member');
    let pushes = 0;
    const outbox = createCommentRelayOutboxStore(db, () => 1_200);
    const deps = Object.assign({
      client: clientWithPush(async () => {
        pushes += 1;
        return { seq: 1 };
      }),
      commentOutbox: outbox,
      resolveLocalProjectRelayBinding: () => ({
        workspaceId: 'workspace-a',
        ownerMemberId: 'project-owner',
      }),
      validateCommentRelayProjectBinding: (record: Parameters<
        typeof commentRelayLocalBindingMatches
      >[0]) => commentRelayLocalBindingMatches(record, binding),
      listProjectIds: () => [],
      resolveLocalConversationId: () => 'conv-local',
      mergeComment: () => false,
      now: () => 1_200,
      retryDelayMs: () => 0,
    }, {
      resolveCommentRelayWorkspaceContext: async () => queuedContext,
      listRemoteProjectRelayBindings: async () => [{
        projectId: 'p1',
        ownerMemberId: 'project-owner',
      }],
    });
    const service = createCollabCloudService(deps);
    service.enqueueComment(comment(), queuedContext);

    await service.flushPendingComments();

    expect(pushes).toBe(0);
    expect(outbox.count()).toBe(0);
    service.dispose();
  });

  it('handles a detached outbox failure after dispose without another delivery', async () => {
    const db = seededDb();
    const queuedContext = context('member');
    const stalledPush = deferred<{ seq: number }>();
    const errors: unknown[] = [];
    let pushStarted = false;
    let confirmations = 0;
    const outbox = createCommentRelayOutboxStore(db, () => 1_300);
    const client = {
      pushComment: async () => {
        pushStarted = true;
        return stalledPush.promise;
      },
      registerMember: async () => ({
        memberId: 'member-member',
        displayName: 'member',
        role: 'member' as const,
      }),
      pullComments: async () => ({
        comments: [],
        latestSeq: 0,
        etag: null,
        notModified: true,
      }),
    } as unknown as CollabCloudClient;
    const deps = Object.assign({
      client,
      commentOutbox: outbox,
      resolveLocalProjectRelayBinding: () => ({
        workspaceId: 'workspace-a',
        ownerMemberId: 'project-owner',
      }),
      listProjectIds: () => ['p1'],
      resolveProjectWorkspaceContext: async () => queuedContext,
      resolveLocalConversationId: () => 'conv-local',
      mergeComment: () => false,
      onCommentPushed: () => {
        confirmations += 1;
      },
      onError: (error: unknown) => errors.push(error),
      now: () => 1_300,
      retryDelayMs: () => 0,
    }, {
      resolveCommentRelayWorkspaceContext: async () => queuedContext,
      listRemoteProjectRelayBindings: async () => [{
        projectId: 'p1',
        ownerMemberId: 'project-owner',
      }],
    });
    const service = createCollabCloudService(deps);
    service.enqueueComment(comment(), queuedContext);

    await service.pollOnce();
    await waitForCondition(() => pushStarted);
    service.dispose();
    stalledPush.reject(new Error('relay stopped during shutdown'));
    await waitForCondition(() => errors.length === 1);

    expect(confirmations).toBe(0);
    expect(outbox.count()).toBe(1);
  });
});
