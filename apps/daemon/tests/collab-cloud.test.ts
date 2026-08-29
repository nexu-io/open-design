import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type CollabCloudComment,
  type WorkspaceCollabContext,
} from '@open-design/contracts';
import {
  closeDatabase,
  deleteConversationAndRepairTeamCommentAnchor,
  deleteSyncedPreviewComment,
  ensureProjectCommentAnchorConversation,
  getLatestConversationIdForProject,
  getProjectCommentAnchorConversationId,
  insertConversation,
  insertProject,
  listConversations,
  listMessages,
  listPreviewComments,
  mergeSyncedPreviewComment,
  openDatabase,
  repairTeamProjectCommentAnchorConversations,
  ensureWorkspaceProject,
  upsertPreviewComment,
} from '../src/db.js';
import { createCollabCloudClient, type CollabCloudClient } from '../src/integrations/collab-cloud.js';
import {
  createCollabCloudService,
  previewCommentToCloud,
} from '../src/collab/collab-cloud-service.js';
import {
  createVelaCliCollabClient,
  shouldUseVelaCliCollabTransport,
} from '../src/collab/vela-cli-collab-client.js';
import type { WorkspaceContextProvider } from '../src/collab/workspace-context.js';

let tempDir: string | null = null;

afterEach(() => {
  closeDatabase();
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  tempDir = null;
});

function cloudComment(id: string, patch: Partial<CollabCloudComment> = {}): CollabCloudComment {
  return {
    id,
    projectId: 'p1',
    conversationId: 'conv-remote',
    memberId: 'm-author',
    seq: 0,
    note: `note ${id}`,
    filePath: 'index.html',
    elementId: 'hero',
    selector: '[data-od-id="hero"]',
    label: 'h1.hero',
    text: 'Hero',
    htmlHint: '<h1>',
    position: { x: 1, y: 2, width: 3, height: 4 },
    status: 'open',
    createdAt: 100,
    updatedAt: 100,
    ...patch,
  };
}

function seededDb() {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-collab-cloud-'));
  const db = openDatabase(tempDir);
  insertProject(db, { id: 'p1', name: 'Project', createdAt: 1, updatedAt: 1 });
  insertConversation(db, { id: 'conv-local', projectId: 'p1', title: 'Chat', createdAt: 1, updatedAt: 1 });
  return db;
}

function teamContext(patch: Partial<WorkspaceCollabContext> = {}): WorkspaceCollabContext {
  return {
    workspaceId: 'ws-1',
    workspaceType: 'team',
    workspaceMemberId: 'm-self',
    role: 'owner',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: null,
    providerMode: 'platform_credits',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 5, usedSeats: 1 }),
    permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }),
    teamId: 'team-1',
    displayName: '琼羽',
    ...patch,
  };
}

function fixedContextProvider(context: WorkspaceCollabContext | null): WorkspaceContextProvider {
  return { current: async () => context };
}

// —— previewCommentToCloud mapping ————————————————————————————————————————————

describe('previewCommentToCloud', () => {
  it('uses the comment author as memberId and carries the anchor/drift fields', () => {
    const cloud = previewCommentToCloud(
      {
        id: 'c1',
        projectId: 'p1',
        conversationId: 'conv-local',
        filePath: 'index.html',
        elementId: 'hero',
        selector: '[data-od-id="hero"]',
        label: 'h1.hero',
        text: 'Hero',
        position: { x: 1, y: 2, width: 3, height: 4 },
        htmlHint: '<h1>',
        note: 'looks off',
        status: 'open',
        createdAt: 10,
        updatedAt: 20,
        authorMemberId: 'm-author',
        anchorState: 'reanchored',
        anchoredVersion: 7,
        lastGoodPosition: { x: 5, y: 6, width: 7, height: 8 },
      } as any,
      'm-fallback',
    );
    expect(cloud.memberId).toBe('m-author');
    expect(cloud.anchorState).toBe('reanchored');
    expect(cloud.anchoredVersion).toBe(7);
    expect(cloud.lastGoodPosition).toEqual({ x: 5, y: 6, width: 7, height: 8 });
    expect(cloud.seq).toBe(0);
  });

  it('falls back to the sharing member when the comment has no author', () => {
    const cloud = previewCommentToCloud(
      {
        id: 'c1',
        projectId: 'p1',
        conversationId: 'conv-local',
        filePath: 'index.html',
        elementId: 'hero',
        selector: 's',
        label: 'l',
        text: 't',
        position: { x: 0, y: 0, width: 0, height: 0 },
        htmlHint: '',
        note: 'n',
        status: 'open',
        createdAt: 1,
        updatedAt: 1,
      } as any,
      'm-fallback',
    );
    expect(cloud.memberId).toBe('m-fallback');
  });
});

// —— mergeSyncedPreviewComment idempotency (real db) ——————————————————————————

describe('mergeSyncedPreviewComment', () => {
  it('inserts once and is a no-op on re-merge of the same id', () => {
    const db = seededDb();
    const comment = cloudComment('c1', {
      memberId: 'm-author',
      anchorState: 'anchored',
      anchoredVersion: 3,
    });
    expect(mergeSyncedPreviewComment(db, 'p1', 'conv-local', comment)).toBe(true);
    // Re-pull of the same cloud comment (same id) must not double-insert.
    expect(mergeSyncedPreviewComment(db, 'p1', 'conv-local', comment)).toBe(false);

    const stored = listPreviewComments(db, 'p1', 'conv-local');
    expect(stored).toHaveLength(1);
    expect(stored[0]!.id).toBe('c1');
    // The AUTHOR is preserved for cross-member attribution.
    expect(stored[0]!.authorMemberId).toBe('m-author');
    expect(stored[0]!.anchorState).toBe('anchored');
    expect(stored[0]!.anchoredVersion).toBe(3);
  });

  it('lands under the LOCAL conversation, not the cloud comment conversationId', () => {
    const db = seededDb();
    // comment.conversationId is 'conv-remote' (a foreign daemon's id) — merge must
    // re-home it onto the local conversation to satisfy the FK + be queryable.
    mergeSyncedPreviewComment(db, 'p1', 'conv-local', cloudComment('c1'));
    expect(listPreviewComments(db, 'p1', 'conv-local')).toHaveLength(1);
    expect(listPreviewComments(db, 'p1', 'conv-remote')).toHaveLength(0);
  });

  // —— multi-author coexistence on the SAME element (the顶掉 root cause) ————————

  it('keeps two members\' comments on the same element as distinct rows', () => {
    const db = seededDb();
    // A member's comment on `hero` is synced in...
    mergeSyncedPreviewComment(db, 'p1', 'conv-local', cloudComment('c-member', { memberId: 'm-member' }));
    // ...and the local user (a different author) comments on the SAME element.
    const own = upsertPreviewComment(db, 'p1', 'conv-local', {
      target: {
        filePath: 'index.html',
        elementId: 'hero',
        selector: '[data-od-id="hero"]',
        label: 'h1.hero',
        text: 'Hero',
        htmlHint: '<h1>',
        position: { x: 0, y: 0, width: 0, height: 0 },
      },
      note: 'owner note',
      authorMemberId: 'm-owner',
    });
    expect(own).not.toBeNull();
    const stored = listPreviewComments(db, 'p1', 'conv-local');
    // Both coexist — the local upsert did NOT clobber the synced member comment.
    expect(stored).toHaveLength(2);
    expect(stored.find((c) => c.authorMemberId === 'm-member')?.note).toBe('note c-member');
    expect(stored.find((c) => c.authorMemberId === 'm-owner')?.note).toBe('owner note');
  });

  it('merges two different-author comments on the same element without a collision', () => {
    const db = seededDb();
    expect(
      mergeSyncedPreviewComment(db, 'p1', 'conv-local', cloudComment('cA', { memberId: 'm-a' })),
    ).toBe(true);
    // Same element, different author + different id → a new distinct row (not IGNOREd).
    expect(
      mergeSyncedPreviewComment(db, 'p1', 'conv-local', cloudComment('cB', { memberId: 'm-b' })),
    ).toBe(true);
    expect(listPreviewComments(db, 'p1', 'conv-local')).toHaveLength(2);
  });

  // —— edit sync (UPSERT by updatedAt) ——————————————————————————————————————————

  it('applies a strictly-newer edit in place and ignores a stale one', () => {
    const db = seededDb();
    mergeSyncedPreviewComment(db, 'p1', 'conv-local', cloudComment('c1', { note: 'v1', updatedAt: 100 }));
    // Newer updatedAt → update in place.
    expect(
      mergeSyncedPreviewComment(db, 'p1', 'conv-local', cloudComment('c1', { note: 'v2', updatedAt: 200 })),
    ).toBe(true);
    expect(listPreviewComments(db, 'p1', 'conv-local')[0]!.note).toBe('v2');
    // Stale updatedAt → no-op, the fresher local content wins.
    expect(
      mergeSyncedPreviewComment(db, 'p1', 'conv-local', cloudComment('c1', { note: 'v0', updatedAt: 150 })),
    ).toBe(false);
    expect(listPreviewComments(db, 'p1', 'conv-local')[0]!.note).toBe('v2');
    // A re-pull at the same updatedAt is also a no-op (still one row).
    expect(
      mergeSyncedPreviewComment(db, 'p1', 'conv-local', cloudComment('c1', { note: 'v2', updatedAt: 200 })),
    ).toBe(false);
    expect(listPreviewComments(db, 'p1', 'conv-local')).toHaveLength(1);
  });

  // —— delete sync (tombstone) ——————————————————————————————————————————————————

  it('deletes the local comment on an inbound tombstone', () => {
    const db = seededDb();
    mergeSyncedPreviewComment(db, 'p1', 'conv-local', cloudComment('c1'));
    expect(listPreviewComments(db, 'p1', 'conv-local')).toHaveLength(1);
    // Tombstone removes it (delete wins regardless of updatedAt).
    expect(
      mergeSyncedPreviewComment(db, 'p1', 'conv-local', cloudComment('c1', { deleted: true, updatedAt: 1 })),
    ).toBe(true);
    expect(listPreviewComments(db, 'p1', 'conv-local')).toHaveLength(0);
    // A repeated tombstone is a no-op.
    expect(
      mergeSyncedPreviewComment(db, 'p1', 'conv-local', cloudComment('c1', { deleted: true })),
    ).toBe(false);
  });

  it('deleteSyncedPreviewComment removes by id, scoped to the project', () => {
    const db = seededDb();
    mergeSyncedPreviewComment(db, 'p1', 'conv-local', cloudComment('c1'));
    expect(deleteSyncedPreviewComment(db, 'other-project', 'c1')).toBe(false);
    expect(deleteSyncedPreviewComment(db, 'p1', 'c1')).toBe(true);
    expect(listPreviewComments(db, 'p1', 'conv-local')).toHaveLength(0);
  });
});

// —— createCollabCloudService poll + merge idempotency (fake client) —————————

/** An in-memory fake collab-cloud client honoring sinceSeq, matching the real
 *  client's method shape so the service runs unchanged against it. */
function fakeClient() {
  const comments: CollabCloudComment[] = [];
  const registered: Array<{ teamId: string; memberId: string; displayName: string; role: string }> = [];
  let seq = 0;
  const client = {
    isConfigured: () => true,
    registerMember: async (teamId: string, memberId: string, input: { displayName: string; role: string }) => {
      registered.push({ teamId, memberId, ...input });
      return { memberId, displayName: input.displayName, role: input.role as any };
    },
    listMembers: async () => registered.map((r) => ({ memberId: r.memberId, displayName: r.displayName, role: r.role as any })),
    pushComment: async (_teamId: string, _projectId: string, comment: CollabCloudComment) => {
      seq += 1;
      comments.push({ ...comment, seq });
      return { seq };
    },
    pullComments: async (_teamId: string, _projectId: string, sinceSeq: number) => {
      const next = comments.filter((c) => c.seq > sinceSeq).sort((a, b) => a.seq - b.seq);
      return { comments: next, latestSeq: seq, notModified: false, etag: `W/"seq-${seq}"` };
    },
  };
  return { client: client as unknown as CollabCloudClient, seed: (c: CollabCloudComment) => { seq += 1; comments.push({ ...c, seq }); }, registered };
}

describe('createCollabCloudService', () => {
  it('repairs a dedicated comment anchor for every active Team project and is idempotent', () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-collab-cloud-anchor-repair-'));
    const db = openDatabase(tempDir);
    for (const id of ['team-empty', 'team-existing', 'personal-empty', 'team-deleted']) {
      insertProject(db, { id, name: id, createdAt: 1, updatedAt: 1 });
    }
    insertConversation(db, {
      id: 'existing-conversation',
      projectId: 'team-existing',
      title: 'Existing',
      createdAt: 1,
      updatedAt: 1,
    });
    ensureWorkspaceProject(db, {
      projectId: 'team-empty',
      workspaceId: 'ws-1',
      visibility: 'team',
      resourceState: 'active',
    });
    ensureWorkspaceProject(db, {
      projectId: 'team-existing',
      workspaceId: 'ws-1',
      visibility: 'team',
      resourceState: 'active',
    });
    ensureWorkspaceProject(db, {
      projectId: 'personal-empty',
      workspaceId: 'ws-1',
      visibility: 'personal',
      resourceState: 'active',
    });
    ensureWorkspaceProject(db, {
      projectId: 'team-deleted',
      workspaceId: 'ws-1',
      visibility: 'team',
      resourceState: 'deleted',
    });

    expect(repairTeamProjectCommentAnchorConversations(db, 10)).toEqual({
      checked: 2,
      created: 2,
    });
    const teamEmptyAnchor = getProjectCommentAnchorConversationId(db, 'team-empty');
    expect(teamEmptyAnchor).toMatch(/^comment-anchor-/);
    const repairedId = getLatestConversationIdForProject(db, 'team-empty');
    expect(repairedId).not.toBeNull();
    expect(repairedId).not.toMatch(/^comment-anchor-/);
    expect(listConversations(db, 'team-empty').map((conversation) => conversation.id))
      .toEqual([repairedId]);
    const existingProjectConversations = listConversations(db, 'team-existing');
    expect(existingProjectConversations.map((conversation) => conversation.id))
      .toEqual(['existing-conversation']);
    expect(getLatestConversationIdForProject(db, 'team-existing'))
      .toBe('existing-conversation');
    const existingProjectAnchor = getProjectCommentAnchorConversationId(db, 'team-existing');
    expect(existingProjectAnchor).toMatch(/^comment-anchor-/);
    expect(getLatestConversationIdForProject(db, 'personal-empty')).toBeNull();
    expect(getLatestConversationIdForProject(db, 'team-deleted')).toBeNull();

    expect(repairTeamProjectCommentAnchorConversations(db, 20)).toEqual({
      checked: 2,
      created: 0,
    });
    expect(getLatestConversationIdForProject(db, 'team-empty')).toBe(repairedId);
    expect(
      getProjectCommentAnchorConversationId(db, 'team-existing'),
    ).toBe(existingProjectAnchor);
  });

  it('re-homes Team comments before deleting an ordinary conversation but preserves Personal cascade deletion', () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-collab-cloud-anchor-delete-'));
    const db = openDatabase(tempDir);
    for (const projectId of ['team-project', 'personal-project'] as const) {
      insertProject(db, { id: projectId, name: projectId, createdAt: 1, updatedAt: 1 });
      ensureWorkspaceProject(db, {
        projectId,
        workspaceId: 'ws-1',
        visibility: projectId === 'team-project' ? 'team' : 'personal',
        resourceState: 'active',
      });
    }
    insertConversation(db, {
      id: 'team-ordinary',
      projectId: 'team-project',
      title: 'Ordinary chat',
      createdAt: 3,
      updatedAt: 3,
    });
    insertConversation(db, {
      id: 'personal-last',
      projectId: 'personal-project',
      title: 'Personal chat',
      createdAt: 3,
      updatedAt: 3,
    });
    mergeSyncedPreviewComment(
      db,
      'team-project',
      'team-ordinary',
      cloudComment('team-comment', { projectId: 'team-project' }),
    );
    mergeSyncedPreviewComment(
      db,
      'personal-project',
      'personal-last',
      cloudComment('personal-comment', { projectId: 'personal-project' }),
    );

    expect(deleteConversationAndRepairTeamCommentAnchor(db, 'team-project', 'team-ordinary', 10)).toEqual({
      anchorCreated: true,
    });
    const teamAnchorId = getProjectCommentAnchorConversationId(db, 'team-project');
    expect(teamAnchorId).toMatch(/^comment-anchor-/);
    const replacementConversationId = getLatestConversationIdForProject(db, 'team-project');
    expect(replacementConversationId).not.toBeNull();
    expect(replacementConversationId).not.toBe(teamAnchorId);
    expect(listConversations(db, 'team-project').map((conversation) => conversation.id)).toEqual([
      replacementConversationId,
    ]);
    expect(listPreviewComments(db, 'team-project', teamAnchorId!)).toEqual([
      expect.objectContaining({
        id: 'team-comment',
        conversationId: teamAnchorId,
      }),
    ]);

    expect(deleteConversationAndRepairTeamCommentAnchor(db, 'personal-project', 'personal-last', 10)).toEqual({
      anchorCreated: false,
    });
    expect(getLatestConversationIdForProject(db, 'personal-project')).toBeNull();
    expect(listPreviewComments(db, 'personal-project', 'personal-last')).toEqual([]);
  });

  it('re-homes remote comments onto a stable empty local anchor', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-collab-cloud-anchor-'));
    const db = openDatabase(tempDir);
    insertProject(db, {
      id: 'p1',
      name: 'Pulled Team mirror',
      createdAt: 1,
      updatedAt: 1,
    });
    expect(getLatestConversationIdForProject(db, 'p1')).toBeNull();

    const firstAnchor = ensureProjectCommentAnchorConversation(db, 'p1', 2);
    expect(firstAnchor?.created).toBe(true);
    expect(ensureProjectCommentAnchorConversation(db, 'p1', 3)).toEqual({
      conversationId: firstAnchor?.conversationId,
      created: false,
    });
    insertConversation(db, {
      id: 'newer-ordinary-conversation',
      projectId: 'p1',
      title: 'Newer ordinary chat',
      createdAt: 4,
      updatedAt: 4,
    });
    expect(getLatestConversationIdForProject(db, 'p1')).toBe('newer-ordinary-conversation');
    expect(ensureProjectCommentAnchorConversation(db, 'p1', 5)).toEqual({
      conversationId: firstAnchor?.conversationId,
      created: false,
    });

    const { client, seed } = fakeClient();
    seed(cloudComment('remote-comment', {
      conversationId: 'owner-private-conversation',
      note: 'shared comment only',
    }));
    const service = createCollabCloudService({
      client,
      workspaceContext: fixedContextProvider(teamContext({ role: 'member' })),
      listProjectIds: () => [],
      resolveLocalConversationId: (projectId) =>
        getProjectCommentAnchorConversationId(db, projectId),
      mergeComment: ({ projectId, conversationId, comment }) =>
        mergeSyncedPreviewComment(db, projectId, conversationId, comment),
    });

    await expect(
      service.pullProject('p1', teamContext({ role: 'member' })),
    ).resolves.toBe(true);

    const conversations = listConversations(db, 'p1');
    expect(conversations.map((conversation) => conversation.id)).toEqual([
      'newer-ordinary-conversation',
    ]);
    expect(listMessages(db, firstAnchor!.conversationId)).toEqual([]);
    expect(
      listPreviewComments(db, 'p1', firstAnchor!.conversationId),
    ).toEqual([
      expect.objectContaining({
        id: 'remote-comment',
        conversationId: firstAnchor?.conversationId,
        note: 'shared comment only',
      }),
    ]);
    service.dispose();
  });

  it('polls, merges new comments once, and advances the cursor (no re-merge)', async () => {
    const { client, seed } = fakeClient();
    seed(cloudComment('c1'));
    seed(cloudComment('c2'));

    const merged = new Map<string, CollabCloudComment>();
    let mergeCalls = 0;

    const service = createCollabCloudService({
      client,
      workspaceContext: fixedContextProvider(teamContext()),
      listProjectIds: () => ['p1'],
      resolveProjectWorkspaceContext: async () => teamContext(),
      resolveLocalConversationId: () => 'conv-local',
      mergeComment: ({ comment }) => {
        mergeCalls += 1;
        if (merged.has(comment.id)) return false;
        merged.set(comment.id, comment);
        return true;
      },
    });

    await service.pollOnce();
    expect([...merged.keys()]).toEqual(['c1', 'c2']);
    expect(mergeCalls).toBe(2);

    // Second poll: sinceSeq is at the head → nothing new pulled → no more merges.
    await service.pollOnce();
    expect(merged.size).toBe(2);
    expect(mergeCalls).toBe(2);
    service.dispose();
  });

  it('stays fully dormant in a personal workspace (team-only resources plane)', async () => {
    // B's resources/collab plane rejects personal-workspace principals with
    // 403 missing_principal BY DESIGN. A personal context must therefore
    // yield no collab identity at all — no register, no pulls — instead of
    // hammering B with doomed CLI calls on every poll tick (observed as an
    // infinite `vela collab member register` 403 loop for fresh users).
    const { client, registered } = fakeClient();
    let pulls = 0;
    const wrapped = {
      ...(client as unknown as Record<string, unknown>),
      pullComments: async (...args: unknown[]) => {
        pulls += 1;
        return (client as unknown as { pullComments: (...a: unknown[]) => unknown }).pullComments(...args);
      },
    } as unknown as CollabCloudClient;
    const personal = teamContext({
      workspaceType: 'personal',
      workspaceId: 'ws-personal',
    });
    delete (personal as Partial<WorkspaceCollabContext>).teamId;
    delete (personal as Partial<WorkspaceCollabContext>).teamName;
    const service = createCollabCloudService({
      client: wrapped,
      workspaceContext: fixedContextProvider(personal),
      listProjectIds: () => ['p1'],
      resolveProjectWorkspaceContext: async () => personal,
      resolveLocalConversationId: () => 'conv-local',
      mergeComment: () => false,
    });
    await service.pollOnce();
    await service.pollOnce();
    expect(registered.length).toBe(0);
    expect(pulls).toBe(0);
    service.dispose();
  });

  it('registers the member once across polls, not on every cycle', async () => {
    const { client, registered } = fakeClient();
    const service = createCollabCloudService({
      client,
      workspaceContext: fixedContextProvider(teamContext({ displayName: '琼羽', role: 'owner' })),
      listProjectIds: () => ['p1'],
      resolveProjectWorkspaceContext: async () =>
        teamContext({ displayName: '琼羽', role: 'owner' }),
      resolveLocalConversationId: () => null,
      mergeComment: () => false,
    });
    // The identity is stable across cycles, so we must register exactly once
    // instead of spawning a `vela member register` process on every 5s tick.
    await service.pollOnce();
    await service.pollOnce();
    await service.pollOnce();
    expect(registered).toEqual([
      { teamId: 'team-1', memberId: 'm-self', displayName: '琼羽', role: 'owner' },
    ]);
    service.dispose();
  });

  it('skips a project with no local conversation to attach to', async () => {
    const { client, seed } = fakeClient();
    seed(cloudComment('c1'));
    let mergeCalls = 0;
    const service = createCollabCloudService({
      client,
      workspaceContext: fixedContextProvider(teamContext()),
      listProjectIds: () => ['p1'],
      resolveProjectWorkspaceContext: async () => teamContext(),
      resolveLocalConversationId: () => null, // member pulled the project, no chat yet
      mergeComment: () => { mergeCalls += 1; return true; },
    });
    await service.pollOnce();
    expect(mergeCalls).toBe(0);
    service.dispose();
  });

  it('pushes a tombstone (deleted: true) for a comment deletion', async () => {
    const { client } = fakeClient();
    const service = createCollabCloudService({
      client,
      workspaceContext: fixedContextProvider(teamContext()),
      listProjectIds: () => ['p1'],
      resolveLocalConversationId: () => 'conv-local',
      mergeComment: () => false,
    });
    await service.pushCommentDeletion({
      id: 'c1',
      projectId: 'p1',
      conversationId: 'conv-local',
      filePath: 'index.html',
      elementId: 'hero',
      selector: 's',
      label: 'l',
      text: 't',
      position: { x: 0, y: 0, width: 0, height: 0 },
      htmlHint: '',
      note: 'n',
      status: 'open',
      createdAt: 1,
      updatedAt: 1,
      authorMemberId: 'm-self',
    } as any, teamContext());
    const pulled = await client.pullComments('team-1', 'p1', 0);
    const tomb = pulled.comments.find((c) => c.id === 'c1');
    expect(tomb?.deleted).toBe(true);
    service.dispose();
  });

  it('is a full no-op off-team (no team context)', async () => {
    const { client, registered } = fakeClient();
    let mergeCalls = 0;
    const service = createCollabCloudService({
      client,
      workspaceContext: fixedContextProvider(null),
      listProjectIds: () => ['p1'],
      resolveProjectWorkspaceContext: async () => null,
      resolveLocalConversationId: () => 'conv-local',
      mergeComment: () => { mergeCalls += 1; return true; },
    });
    await service.pollOnce();
    expect(registered).toHaveLength(0);
    expect(mergeCalls).toBe(0);
    expect(
      await service.listMembers(teamContext({ workspaceType: 'personal' })),
    ).toEqual([]);
    service.dispose();
  });

  it('lists members from the explicit request workspace instead of ambient context', async () => {
    const { client } = fakeClient();
    const teamIds: string[] = [];
    const scopedClient = {
      ...client,
      listMembers: async (teamId: string) => {
        teamIds.push(teamId);
        return [];
      },
    } as unknown as CollabCloudClient;
    const service = createCollabCloudService({
      client: scopedClient,
      workspaceContext: fixedContextProvider(
        teamContext({ workspaceId: 'team-b', teamId: 'team-b' }),
      ),
      listProjectIds: () => [],
      resolveLocalConversationId: () => null,
      mergeComment: () => false,
    });

    await service.listMembers(
      teamContext({ workspaceId: 'team-a', teamId: 'team-a' }),
    );

    expect(teamIds).toEqual(['team-a']);
    service.dispose();
  });

  it('propagates a transient team directory failure instead of fabricating an empty roster', async () => {
    const { client } = fakeClient();
    const outage = new Error('member directory unavailable');
    const errors: unknown[] = [];
    const scopedClient = {
      ...client,
      listMembers: vi.fn(async () => {
        throw outage;
      }),
    } as unknown as CollabCloudClient;
    const service = createCollabCloudService({
      client: scopedClient,
      workspaceContext: fixedContextProvider(teamContext()),
      listProjectIds: () => [],
      resolveLocalConversationId: () => null,
      mergeComment: () => false,
      onError: (error) => errors.push(error),
    });

    await expect(service.listMembers(teamContext())).rejects.toBe(outage);
    expect(errors).toEqual([outage]);
    service.dispose();
  });

  it('keeps project comment operations on their explicit scope after ambient moves to B', async () => {
    const { client } = fakeClient();
    const calls: Array<{
      operation: string;
      teamId: string;
      memberId?: string;
    }> = [];
    const scopedClient = {
      ...client,
      pushComment: async (
        teamId: string,
        _projectId: string,
        comment: CollabCloudComment,
      ) => {
        calls.push({ operation: comment.deleted ? 'delete' : 'push', teamId, memberId: comment.memberId });
        return { seq: calls.length };
      },
      pullComments: async (teamId: string) => {
        calls.push({ operation: 'pull', teamId });
        return { comments: [], latestSeq: 0, etag: null, notModified: true };
      },
      listMembers: async (teamId: string) => {
        calls.push({ operation: 'resolve-member', teamId });
        return [{ memberId: 'owner-a', displayName: 'Owner A', role: 'owner' as const }];
      },
    } as unknown as CollabCloudClient;
    const service = createCollabCloudService({
      client: scopedClient,
      workspaceContext: fixedContextProvider(
        teamContext({
          workspaceId: 'workspace-b',
          workspaceMemberId: 'member-b',
          teamId: 'workspace-b',
        }),
      ),
      listProjectIds: () => [],
      resolveLocalConversationId: () => 'conv-local',
      mergeComment: () => false,
    });
    const projectContext = teamContext({
      workspaceId: 'workspace-a',
      workspaceMemberId: 'member-a',
      teamId: 'workspace-a',
    });
    const comment = {
      id: 'c-scoped',
      projectId: 'p1',
      conversationId: 'conv-local',
      filePath: 'index.html',
      elementId: 'hero',
      selector: 's',
      label: 'l',
      text: 't',
      position: { x: 0, y: 0, width: 0, height: 0 },
      htmlHint: '',
      note: 'n',
      status: 'open',
      createdAt: 1,
      updatedAt: 1,
    } as any;

    await service.pushComment(comment, projectContext);
    await service.pushCommentDeletion(comment, projectContext);
    await service.pullProject('p1', projectContext);
    await expect(
      service.resolveMember('owner-a', projectContext),
    ).resolves.toMatchObject({ displayName: 'Owner A' });

    expect(calls).toEqual([
      { operation: 'push', teamId: 'workspace-a', memberId: 'member-a' },
      { operation: 'delete', teamId: 'workspace-a', memberId: 'member-a' },
      { operation: 'pull', teamId: 'workspace-a' },
      { operation: 'resolve-member', teamId: 'workspace-a' },
    ]);
    service.dispose();
  });

  it('partitions pull cursors by workspace and member for the same project id', async () => {
    const sinceCalls: Array<{
      teamId: string;
      sinceSeq: number;
      etag: string | null | undefined;
    }> = [];
    const client = {
      pullComments: async (
        teamId: string,
        _projectId: string,
        sinceSeq: number,
        etag?: string | null,
      ) => {
        sinceCalls.push({ teamId, sinceSeq, etag });
        return {
          comments: [],
          latestSeq: 7,
          etag: `etag-${teamId}`,
          notModified: false,
        };
      },
    } as unknown as CollabCloudClient;
    const service = createCollabCloudService({
      client,
      listProjectIds: () => [],
      resolveLocalConversationId: () => 'conv-local',
      mergeComment: () => false,
    });
    const workspaceA = teamContext({
      workspaceId: 'workspace-a',
      workspaceMemberId: 'member-a',
      teamId: 'workspace-a',
    });
    const workspaceB = teamContext({
      workspaceId: 'workspace-b',
      workspaceMemberId: 'member-b',
      teamId: 'workspace-b',
    });

    await service.pullProject('same-project', workspaceA);
    await service.pullProject('same-project', workspaceB);
    await service.pullProject('same-project', workspaceA);

    expect(sinceCalls).toEqual([
      { teamId: 'workspace-a', sinceSeq: 0, etag: undefined },
      { teamId: 'workspace-b', sinceSeq: 0, etag: undefined },
      { teamId: 'workspace-a', sinceSeq: 7, etag: 'etag-workspace-a' },
    ]);
    service.dispose();
  });

  it('coalesces concurrent pulls for the same workspace member and project', async () => {
    let releasePull!: (value: {
      comments: CollabCloudComment[];
      latestSeq: number;
      etag: string | null;
      notModified: boolean;
    }) => void;
    const pendingPull = new Promise<{
      comments: CollabCloudComment[];
      latestSeq: number;
      etag: string | null;
      notModified: boolean;
    }>((resolve) => {
      releasePull = resolve;
    });
    const pullComments = vi.fn(() => pendingPull);
    const client = { pullComments } as unknown as CollabCloudClient;
    const service = createCollabCloudService({
      client,
      listProjectIds: () => [],
      resolveLocalConversationId: () => 'conv-local',
      mergeComment: () => false,
    });
    const context = teamContext({
      workspaceId: 'workspace-a',
      workspaceMemberId: 'member-a',
      teamId: 'team-a',
    });

    const first = service.pullProject('same-project', context);
    const second = service.pullProject('same-project', context);

    expect(pullComments).toHaveBeenCalledTimes(1);
    releasePull({
      comments: [],
      latestSeq: 0,
      etag: null,
      notModified: true,
    });
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    service.dispose();
  });

  it('shares one pull between the poll floor and a targeted hub/read pull', async () => {
    let releasePull!: (value: {
      comments: CollabCloudComment[];
      latestSeq: number;
      etag: string | null;
      notModified: boolean;
    }) => void;
    const pendingPull = new Promise<{
      comments: CollabCloudComment[];
      latestSeq: number;
      etag: string | null;
      notModified: boolean;
    }>((resolve) => {
      releasePull = resolve;
    });
    const pullComments = vi.fn(() => pendingPull);
    const context = teamContext({
      workspaceId: 'workspace-a',
      workspaceMemberId: 'member-a',
      teamId: 'team-a',
    });
    const client = {
      pullComments,
      registerMember: async () => ({
        memberId: 'member-a',
        displayName: 'Member A',
        role: 'member' as const,
      }),
    } as unknown as CollabCloudClient;
    const service = createCollabCloudService({
      client,
      listProjectIds: () => ['same-project'],
      resolveProjectWorkspaceContext: async () => context,
      resolveLocalConversationId: () => 'conv-local',
      mergeComment: () => false,
    });

    const targeted = service.pullProject('same-project', context);
    const poll = service.pollOnce();
    await Promise.resolve();
    await Promise.resolve();

    expect(pullComments).toHaveBeenCalledTimes(1);
    releasePull({
      comments: [],
      latestSeq: 0,
      etag: null,
      notModified: true,
    });
    await expect(Promise.all([targeted, poll])).resolves.toEqual([true, undefined]);
    service.dispose();
  });

  // —— pullProject redemption contract ——————————————————————————————————————
  // The hub `comment-changed` handler and `onCommentsRead` both DELETE the
  // project's dirty mark before firing this targeted pull. A single comment
  // only ever emits one hub event, so a pull that silently no-ops or fails
  // must report it (resolve false) — the caller restores the mark and the
  // next read retries. Without that signal the mark is burned for nothing
  // and the comment stays invisible until the project gains a live events
  // subscriber.

  it('pullProject resolves true when the targeted pull actually ran (mark redeemed)', async () => {
    const { client, seed } = fakeClient();
    seed(cloudComment('c1'));
    const merged: string[] = [];
    const service = createCollabCloudService({
      client,
      workspaceContext: fixedContextProvider(teamContext()),
      listProjectIds: () => [],
      resolveLocalConversationId: () => 'conv-local',
      mergeComment: ({ comment }) => { merged.push(comment.id); return true; },
    });
    await expect(service.pullProject('p1', teamContext())).resolves.toBe(true);
    expect(merged).toEqual(['c1']);
    // An up-to-date follow-up pull (nothing new) still counts as redeemed.
    await expect(service.pullProject('p1', teamContext())).resolves.toBe(true);
    service.dispose();
  });

  it('pullProject resolves false when there is no local conversation to merge into', async () => {
    const { client, seed } = fakeClient();
    seed(cloudComment('c1'));
    const service = createCollabCloudService({
      client,
      workspaceContext: fixedContextProvider(teamContext()),
      listProjectIds: () => [],
      resolveLocalConversationId: () => null,
      mergeComment: () => true,
    });
    await expect(service.pullProject('p1', teamContext())).resolves.toBe(false);
    service.dispose();
  });

  it('pullProject resolves false when the relay pull fails (error to onError, no throw)', async () => {
    const { client } = fakeClient();
    (client as { pullComments: unknown }).pullComments = async () => {
      throw new Error('relay unavailable');
    };
    const errors: unknown[] = [];
    const service = createCollabCloudService({
      client,
      workspaceContext: fixedContextProvider(teamContext()),
      listProjectIds: () => [],
      resolveLocalConversationId: () => 'conv-local',
      mergeComment: () => true,
      onError: (error) => errors.push(error),
    });
    await expect(service.pullProject('p1', teamContext())).resolves.toBe(false);
    expect(errors).toHaveLength(1);
    service.dispose();
  });

  it('pullProject resolves false off-team (no identity, nothing pulled)', async () => {
    const { client } = fakeClient();
    const service = createCollabCloudService({
      client,
      workspaceContext: fixedContextProvider(null),
      listProjectIds: () => [],
      resolveLocalConversationId: () => 'conv-local',
      mergeComment: () => true,
    });
    await expect(
      service.pullProject(
        'p1',
        teamContext({ workspaceType: 'personal', workspaceId: 'personal' }),
      ),
    ).resolves.toBe(false);
    service.dispose();
  });
});

// —— client wire behavior (injected fetch) ————————————————————————————————————

describe('collab-cloud client', () => {
  function jsonResponse(status: number, body: unknown, etag?: string): Response {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (etag) headers.etag = etag;
    return new Response(JSON.stringify(body), { status, headers });
  }

  it('attaches a bearer token and returns the pushed seq', async () => {
    const calls: Array<{ url: string; method: string; auth: string | null; body: unknown }> = [];
    const client = createCollabCloudClient({
      config: { baseUrl: 'http://cloud.local', token: 'secret' },
      fetch: (async (input: any, init: any) => {
        const req = new Request(input, init);
        calls.push({
          url: req.url,
          method: req.method,
          auth: req.headers.get('authorization'),
          body: init?.body ? JSON.parse(init.body) : undefined,
        });
        return jsonResponse(200, { ok: true, seq: 5 });
      }) as unknown as typeof fetch,
    });
    const result = await client.pushComment('team-1', 'p1', cloudComment('c1'));
    expect(result.seq).toBe(5);
    expect(calls[0]!.auth).toBe('Bearer secret');
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.url).toBe('http://cloud.local/teams/team-1/projects/p1/comments');
    expect((calls[0]!.body as any).comment.id).toBe('c1');
  });

  it('sends If-None-Match and treats a 304 as "not modified"', async () => {
    let seenIfNoneMatch: string | null = null;
    const client = createCollabCloudClient({
      config: { baseUrl: 'http://cloud.local', token: 'secret' },
      fetch: (async (input: any, init: any) => {
        const req = new Request(input, init);
        seenIfNoneMatch = req.headers.get('if-none-match');
        return new Response(null, { status: 304, headers: { etag: 'W/"seq-2"' } });
      }) as unknown as typeof fetch,
    });
    const result = await client.pullComments('team-1', 'p1', 2, 'W/"seq-2"');
    expect(seenIfNoneMatch).toBe('W/"seq-2"');
    expect(result.notModified).toBe(true);
    expect(result.comments).toEqual([]);
    expect(result.latestSeq).toBe(2);
  });
});

describe('VelaCliCollabClient', () => {
  it('uses the CLI transport when team/resource sync is already Vela-backed', () => {
    expect(shouldUseVelaCliCollabTransport({ OD_COLLAB_TRANSPORT: 'vela-cli' })).toBe(true);
    expect(shouldUseVelaCliCollabTransport({ OD_COLLAB_TRANSPORT: 'sdk' })).toBe(false);
    expect(shouldUseVelaCliCollabTransport({ OD_WORKSPACE_CONTEXT_SOURCE: 'vela' })).toBe(true);
    expect(shouldUseVelaCliCollabTransport({
      OD_WORKSPACE_CONTEXT_SOURCE: 'vela',
      OD_COLLAB_CLOUD_URL: 'http://legacy-fixture.local',
    })).toBe(true);
    expect(shouldUseVelaCliCollabTransport({ OD_TEAM_PROJECTS_TRANSPORT: 'vela-cli' })).toBe(true);
    expect(shouldUseVelaCliCollabTransport({ OD_RESOURCE_TRANSPORT: 'vela-cli' })).toBe(true);
    expect(shouldUseVelaCliCollabTransport({ OD_COLLAB_CLOUD_URL: 'http://fixture.local' })).toBe(false);
    expect(shouldUseVelaCliCollabTransport({})).toBe(false);
  });

  it('uses vela collab commands for comments, directory, and presence', async () => {
    const calls: string[][] = [];
    const workspaces: Array<string | undefined> = [];
    const client = createVelaCliCollabClient({
      run: async (args, workspaceId) => {
        calls.push(args);
        workspaces.push(workspaceId);
        if (args[0] === 'member' && args[1] === 'register') {
          return JSON.stringify({ member: { memberId: 'm-self', displayName: '麻薯', role: 'owner' } });
        }
        if (args[0] === 'comment' && args[1] === 'push') {
          return JSON.stringify({ seq: 7 });
        }
        if (args[0] === 'comment' && args[1] === 'pull') {
          return JSON.stringify({ latestSeq: 7, comments: [cloudComment('c1', { seq: 7 })] });
        }
        if (args[0] === 'presence' && args[1] === 'heartbeat') {
          return JSON.stringify({
            viewers: [
              {
                memberId: 'm-self',
                displayName: '麻薯',
                role: 'owner',
                filePath: 'Typography',
                activity: { label: '正在评论 Typography' },
                heartbeatAt: '2026-07-10T00:00:00.000Z',
              },
            ],
          });
        }
        return JSON.stringify({});
      },
    });

    await expect(client.registerMember('team-1', 'm-self', {
      displayName: '麻薯',
      role: 'owner',
    })).resolves.toEqual({ memberId: 'm-self', displayName: '麻薯', role: 'owner' });
    await expect(client.pushComment('team-1', 'p1', cloudComment('c1'))).resolves.toEqual({ seq: 7 });
    await expect(client.pullComments('team-1', 'p1', 0)).resolves.toMatchObject({
      latestSeq: 7,
      comments: [{ id: 'c1' }],
    });
    await expect(client.heartbeatPresence('p1', {
      member: { memberId: 'm-self', name: '麻薯', role: 'owner' },
      clientId: 'client-1',
      filePath: 'Typography',
      activity: { label: '正在评论 Typography' },
    }, 'team-1')).resolves.toEqual([
      {
        memberId: 'm-self',
        name: '麻薯',
        role: 'owner',
        filePath: 'Typography',
        activity: { label: '正在评论 Typography' },
        heartbeatAt: '2026-07-10T00:00:00.000Z',
      },
    ]);

    expect(calls[0]).toEqual(['member', 'register', '--display-name', '麻薯', '--role', 'owner']);
    expect(calls[1]?.slice(0, 3)).toEqual(['comment', 'push', 'p1']);
    expect(JSON.parse(calls[1]![4]!)).toMatchObject({ id: 'c1' });
    expect(calls[2]).toEqual(['comment', 'pull', 'p1', '--since-seq', '0']);
    expect(calls[3]).toEqual([
      'presence',
      'heartbeat',
      'p1',
      '--client-id',
      'client-1',
      '--display-name',
      '麻薯',
      '--file-path',
      'Typography',
      '--activity-json',
      JSON.stringify({ label: '正在评论 Typography' }),
    ]);
    expect(workspaces).toEqual(['team-1', 'team-1', 'team-1', 'team-1']);
  });

  it('does not turn sparse presence fallback fields into display metadata', async () => {
    const client = createVelaCliCollabClient({
      run: async () => JSON.stringify({
        viewers: [{
          memberId: 'member-id-1',
          displayName: 'member-id-1',
        }],
      }),
    });

    await expect(client.listPresence('p1', 'team-1')).resolves.toEqual([
      { memberId: 'member-id-1' },
    ]);
  });
});
