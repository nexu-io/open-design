import { afterEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';

const { execFileMock } = vi.hoisted(() => ({ execFileMock: vi.fn() }));

vi.mock('node:child_process', () => ({ execFile: execFileMock }));
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
import { createCollabCloudService, previewCommentToCloud } from '../src/collab/collab-cloud-service.js';
import { commentRelayScope } from '../src/collab/comment-relay-scope.js';
import {
  createInMemoryPublicFilePublicationStore,
  createSqlitePublicFilePublicationStore,
  migratePublicFilePublications,
} from '../src/collab/public-file-publication-store.js';
import {
  commentRelayLocalBindingMatches,
  createCommentRelayOutboxStore,
  migrateCommentRelayOutbox,
  type CommentRelayLocalProjectBinding,
} from '../src/collab/comment-relay-outbox.js';
import { CollabCloudError, type CollabCloudClient } from '../src/integrations/collab-cloud.js';
import { createVelaCliCollabClient } from '../src/collab/vela-cli-collab-client.js';

let tempDir: string | null = null;

afterEach(() => {
  vi.useRealTimers();
  closeDatabase();
  execFileMock.mockReset();
  vi.unstubAllEnvs();
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
  it('starts with an empty durable outbox without pushing a comment', async () => {
    vi.useFakeTimers();
    const db = seededDb();
    const pushes = vi.fn(async () => ({ seq: 1 }));
    const service = createCollabCloudService({
      client: clientWithPush(pushes),
      commentOutbox: createCommentRelayOutboxStore(db, () => 0),
      listProjectIds: () => [],
      resolveLocalConversationId: () => 'conv-local',
      mergeComment: () => 'unchanged',
      now: () => 0,
    });

    service.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(pushes).not.toHaveBeenCalled();
    service.dispose();
  });

  it('keeps a materialized team member relay-eligible when the local mirror has no creator', () => {
    const teamMember = context('member', {
      workspaceId: 'ws-multi-client',
      teamId: 'ws-multi-client',
      workspaceMemberId: 'mem-multi-viewer',
    });

    expect(commentRelayScope({
      binding: {
        workspaceId: 'ws-multi-client',
        visibility: 'team',
        resourceState: 'active',
        createdByWorkspaceMemberId: null,
      },
      context: teamMember,
      projectId: 'project-1',
      filePath: 'index.html',
      publications: createInMemoryPublicFilePublicationStore(),
    })).toMatchObject({
      workspaceId: 'ws-multi-client',
      teamId: 'ws-multi-client',
      ownerMemberId: 'mem-multi-viewer',
      relayScope: 'team',
    });
  });

  it('backfills legacy personal file paths idempotently without touching malformed or unrelated rows', () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-comment-relay-legacy-'));
    const dbPath = path.join(tempDir, 'app.sqlite');
    let db = new Database(dbPath);
    db.exec(`
      CREATE TABLE comment_relay_outbox (
        workspace_id TEXT NOT NULL, workspace_member_id TEXT NOT NULL,
        team_id TEXT NOT NULL, relay_scope TEXT NOT NULL DEFAULT 'team',
        project_id TEXT NOT NULL, comment_id TEXT NOT NULL,
        expected_owner_member_id TEXT, payload_json TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1, attempt_count INTEGER NOT NULL DEFAULT 0,
        next_attempt_at INTEGER NOT NULL, last_error TEXT, created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (workspace_id, workspace_member_id, project_id, comment_id)
      );
    `);
    const insert = db.prepare(`
      INSERT INTO comment_relay_outbox (workspace_id, workspace_member_id, team_id, relay_scope,
        project_id, comment_id, expected_owner_member_id, payload_json, next_attempt_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 100, 100, 100)
    `);
    const payload = (id: string, filePath: string) => JSON.stringify(
      previewCommentToCloud(comment({ id, filePath }), 'owner-a'),
    );
    insert.run('workspace-a', 'owner-a', 'workspace-a', 'personal', 'p1', 'exact', 'owner-a', payload('exact', 'index.html'));
    insert.run('workspace-a', 'owner-a', 'workspace-a', 'personal', 'p1', 'other-file', 'owner-a', payload('other-file', 'other.html'));
    insert.run('workspace-a', 'owner-b', 'workspace-a', 'personal', 'p1', 'other-principal', 'owner-b', payload('other-principal', 'index.html'));
    insert.run('workspace-a', 'owner-a', 'workspace-a', 'team', 'p1', 'team-row', 'owner-a', payload('team-row', 'index.html'));
    insert.run('workspace-a', 'owner-a', 'workspace-a', 'personal', 'p1', 'malformed', 'owner-a', '{not json');

    migrateCommentRelayOutbox(db);
    migratePublicFilePublications(db);
    expect(db.prepare(`SELECT file_path FROM comment_relay_outbox WHERE comment_id = 'exact'`).get()).toEqual({ file_path: 'index.html' });
    expect(db.prepare(`SELECT file_path FROM comment_relay_outbox WHERE comment_id = 'malformed'`).get()).toEqual({ file_path: '' });
    migrateCommentRelayOutbox(db);
    db.close();
    db = new Database(dbPath);
    migrateCommentRelayOutbox(db);
    migratePublicFilePublications(db);

    const publications = createSqlitePublicFilePublicationStore(db, () => 100);
    const exactScope = { resourceTeamId: 'workspace-a', ownerMemberId: 'owner-a', projectId: 'p1', filePath: 'index.html' };
    publications.set(exactScope, { url: 'https://example.test/index', slug: 'index', fileName: 'index.html' });
    expect(publications.deleteIfRevisionMatches(exactScope, publications.getRevision(exactScope)!)).toBe(true);
    expect(db.prepare(`SELECT comment_id, file_path FROM comment_relay_outbox ORDER BY comment_id`).all()).toEqual([
      { comment_id: 'malformed', file_path: '' },
      { comment_id: 'other-file', file_path: 'other.html' },
      { comment_id: 'other-principal', file_path: 'index.html' },
      { comment_id: 'team-row', file_path: '' },
    ]);
    db.close();
  });

  it('rolls back publication deletion when personal outbox cancellation is aborted', () => {
    const db = seededDb();
    const scope = { resourceTeamId: 'workspace-a', ownerMemberId: 'owner-a', projectId: 'p1', filePath: 'index.html' };
    const publications = createSqlitePublicFilePublicationStore(db, () => 100);
    publications.set(scope, { url: 'https://example.test/index', slug: 'index', fileName: 'index.html' });
    const outbox = createCommentRelayOutboxStore(db, () => 100);
    outbox.enqueue({ workspaceId: 'workspace-a', workspaceMemberId: 'owner-a', teamId: 'workspace-a', relayScope: 'personal', projectId: 'p1', expectedOwnerMemberId: 'owner-a', comment: previewCommentToCloud(comment({ id: 'atomic-row' }), 'owner-a') });
    db.exec(`CREATE TRIGGER abort_personal_outbox_delete BEFORE DELETE ON comment_relay_outbox BEGIN SELECT RAISE(ABORT, 'forced cancellation failure'); END;`);

    const revision = publications.getRevision(scope)!;
    expect(() => publications.deleteIfRevisionMatches(scope, revision)).toThrow('forced cancellation failure');
    expect(publications.get(scope)?.slug).toBe('index');
    expect(outbox.listDue(100).map((record) => record.commentId)).toEqual(['atomic-row']);
    db.exec('DROP TRIGGER abort_personal_outbox_delete');
    expect(publications.deleteIfRevisionMatches(scope, revision)).toBe(true);
    expect(publications.get(scope)).toBeNull();
    expect(outbox.count()).toBe(0);
  });

  it('delivers an active personal owner publication through a durable outbox after restart', async () => {
    const db = seededDb();
    const owner = context('owner', {
      workspaceId: 'workspace-personal',
      workspaceType: 'personal',
      workspaceMemberId: 'personal-owner',
      teamId: '',
    });
    const binding: CommentRelayLocalProjectBinding = {
      workspaceId: owner.workspaceId,
      visibility: 'personal',
      resourceState: 'active',
      createdByWorkspaceMemberId: owner.workspaceMemberId,
    };
    const publications = createSqlitePublicFilePublicationStore(db, () => 100);
    publications.set({
      resourceTeamId: owner.workspaceId,
      ownerMemberId: owner.workspaceMemberId,
      projectId: 'p1',
      filePath: 'index.html',
    }, { url: 'https://example.test/share', slug: 'public-slug', fileName: 'index.html' });
    const scope = (projectId: string, filePath: string, current: WorkspaceCollabContext) =>
      commentRelayScope({ binding, context: current, projectId, filePath, publications });
    const firstOutbox = createCommentRelayOutboxStore(db, () => 100);
    const first = createCollabCloudService({
      client: clientWithPush(async () => { throw new Error('offline'); }),
      commentOutbox: firstOutbox,
      commentRelayScope: scope,
      resolveLocalProjectRelayBinding: () => ({ workspaceId: owner.workspaceId, ownerMemberId: owner.workspaceMemberId }),
      validateCommentRelayProjectBinding: (record) => commentRelayLocalBindingMatches(record, binding),
      resolveCommentRelayWorkspaceContext: async () => owner,
      listRemoteProjectRelayBindings: async () => [],
      listProjectIds: () => [], resolveLocalConversationId: () => 'conv-local', mergeComment: () => 'unchanged',
      now: () => 100, retryDelayMs: () => 0,
    });
    expect(first.enqueueComment(comment({ authorMemberId: owner.workspaceMemberId }), owner)).toBe(true);
    await first.flushPendingComments();
    expect(firstOutbox.count()).toBe(1);
    first.dispose();

    // A real restart closes the SQLite handle. Reopen both the durable outbox
    // and publication witness rather than merely constructing another service.
    closeDatabase();
    const reopened = openDatabase(tempDir!);
    const restartedPublications = createSqlitePublicFilePublicationStore(reopened, () => 100);
    const restartedScope = (projectId: string, filePath: string, current: WorkspaceCollabContext) =>
      commentRelayScope({ binding, context: current, projectId, filePath, publications: restartedPublications });
    const pushed: Array<{ teamId: string; projectId: string }> = [];
    const restartedOutbox = createCommentRelayOutboxStore(reopened, () => 100);
    const restarted = createCollabCloudService({
      client: clientWithPush(async (teamId, projectId) => { pushed.push({ teamId, projectId }); return { seq: 9 }; }),
      commentOutbox: restartedOutbox,
      commentRelayScope: restartedScope,
      resolveLocalProjectRelayBinding: () => ({ workspaceId: owner.workspaceId, ownerMemberId: owner.workspaceMemberId }),
      validateCommentRelayProjectBinding: (record) => commentRelayLocalBindingMatches(record, binding),
      resolveCommentRelayWorkspaceContext: async () => owner,
      listRemoteProjectRelayBindings: async () => [],
      listProjectIds: () => [], resolveLocalConversationId: () => 'conv-local', mergeComment: () => 'unchanged',
      now: () => 100, retryDelayMs: () => 0,
    });
    await restarted.flushPendingComments();
    expect(pushed).toEqual([{ teamId: owner.workspaceId, projectId: 'p1' }]);
    expect(restartedOutbox.count()).toBe(0);
    restarted.dispose();
  });
  it('fails closed for no publication, a different file, stopped publication, and a switched personal identity', async () => {
    const db = seededDb();
    const owner = context('owner', { workspaceId: 'workspace-personal', workspaceType: 'personal', workspaceMemberId: 'personal-owner', teamId: '' });
    const binding: CommentRelayLocalProjectBinding = { workspaceId: owner.workspaceId, visibility: 'personal', resourceState: 'active', createdByWorkspaceMemberId: owner.workspaceMemberId };
    const publications = createSqlitePublicFilePublicationStore(db);
    const scope = (projectId: string, filePath: string, current: WorkspaceCollabContext) =>
      commentRelayScope({ binding, context: current, projectId, filePath, publications });
    expect(scope('p1', 'index.html', owner)).toBeNull();
    publications.set({ resourceTeamId: owner.workspaceId, ownerMemberId: owner.workspaceMemberId, projectId: 'p1', filePath: 'index.html' }, { url: 'https://example.test/share', slug: 'public-slug', fileName: 'index.html' });
    expect(scope('p1', 'other.html', owner)).toBeNull();

    const outbox = createCommentRelayOutboxStore(db, () => 100);
    let freshIdentity = owner;
    let pushes = 0;
    const service = createCollabCloudService({
      client: clientWithPush(async () => { pushes += 1; return { seq: 1 }; }),
      commentOutbox: outbox, commentRelayScope: scope,
      resolveLocalProjectRelayBinding: () => ({ workspaceId: owner.workspaceId, ownerMemberId: owner.workspaceMemberId }),
      validateCommentRelayProjectBinding: (record) => commentRelayLocalBindingMatches(record, binding),
      resolveCommentRelayWorkspaceContext: async () => freshIdentity,
      listRemoteProjectRelayBindings: async () => [],
      listProjectIds: () => [], resolveLocalConversationId: () => 'conv-local', mergeComment: () => 'unchanged',
      now: () => 100, retryDelayMs: () => 0,
    });
    expect(service.enqueueComment(comment({ authorMemberId: owner.workspaceMemberId }), owner)).toBe(true);
    // Same-principal/different-file, project, and principal controls must stay.
    outbox.enqueue({ workspaceId: owner.workspaceId, workspaceMemberId: owner.workspaceMemberId, teamId: owner.workspaceId, relayScope: 'personal', projectId: 'p1', expectedOwnerMemberId: owner.workspaceMemberId, comment: previewCommentToCloud(comment({ id: 'other-file', filePath: 'other.html' }), owner.workspaceMemberId) });
    outbox.enqueue({ workspaceId: owner.workspaceId, workspaceMemberId: owner.workspaceMemberId, teamId: owner.workspaceId, relayScope: 'personal', projectId: 'p2', expectedOwnerMemberId: owner.workspaceMemberId, comment: previewCommentToCloud(comment({ id: 'other-project', projectId: 'p2' }), owner.workspaceMemberId) });
    outbox.enqueue({ workspaceId: owner.workspaceId, workspaceMemberId: 'other-owner', teamId: owner.workspaceId, relayScope: 'personal', projectId: 'p1', expectedOwnerMemberId: 'other-owner', comment: previewCommentToCloud(comment({ id: 'other-principal' }), 'other-owner') });
    outbox.enqueue({ workspaceId: owner.workspaceId, workspaceMemberId: owner.workspaceMemberId, teamId: owner.workspaceId, relayScope: 'team', projectId: 'p1', expectedOwnerMemberId: owner.workspaceMemberId, comment: previewCommentToCloud(comment({ id: 'team-row' }), owner.workspaceMemberId) });
    // A stop invalidates pre-stop rows even when the stable alias is immediately
    // republished; an active witness cannot safely distinguish their generation.
    const publicationScope = { resourceTeamId: owner.workspaceId, ownerMemberId: owner.workspaceMemberId, projectId: 'p1', filePath: 'index.html' };
    expect(publications.deleteIfRevisionMatches(publicationScope, publications.getRevision(publicationScope)!)).toBe(true);
    publications.set({ resourceTeamId: owner.workspaceId, ownerMemberId: owner.workspaceMemberId, projectId: 'p1', filePath: 'index.html' }, { url: 'https://example.test/share', slug: 'public-slug', fileName: 'index.html' });
    expect(outbox.listDue(100).map((record) => record.commentId).sort()).toEqual(['other-file', 'other-principal', 'other-project', 'team-row']);

    service.dispose();
    // Cancellation and the unrelated controls survive restart independently.
    closeDatabase();
    const reopened = openDatabase(tempDir!);
    const restartedPublications = createSqlitePublicFilePublicationStore(reopened, () => 100);
    const restartedScope = (projectId: string, filePath: string, current: WorkspaceCollabContext) =>
      commentRelayScope({ binding, context: current, projectId, filePath, publications: restartedPublications });
    const restartedOutbox = createCommentRelayOutboxStore(reopened, () => 100);
    const controls = restartedOutbox.listDue(100);
    expect(controls.map((record) => record.commentId).sort()).toEqual(['other-file', 'other-principal', 'other-project', 'team-row']);
    for (const record of controls) restartedOutbox.acknowledge(record);
    const restarted = createCollabCloudService({
      client: clientWithPush(async () => { pushes += 1; return { seq: 1 }; }),
      commentOutbox: restartedOutbox, commentRelayScope: restartedScope,
      resolveLocalProjectRelayBinding: () => ({ workspaceId: owner.workspaceId, ownerMemberId: owner.workspaceMemberId }),
      validateCommentRelayProjectBinding: (record) => commentRelayLocalBindingMatches(record, binding),
      resolveCommentRelayWorkspaceContext: async () => owner,
      listRemoteProjectRelayBindings: async () => [],
      listProjectIds: () => [], resolveLocalConversationId: () => 'conv-local', mergeComment: () => 'unchanged',
      now: () => 100, retryDelayMs: () => 0,
    });
    await restarted.flushPendingComments();
    expect(pushes).toBe(0);
    expect(restartedOutbox.count()).toBe(0);
    // A new post-resume revision still has the normal delivery path.
    expect(restarted.enqueueComment(comment({ id: 'after-resume', note: 'after-resume', authorMemberId: owner.workspaceMemberId }), owner)).toBe(true);
    await restarted.flushPendingComments();
    expect(pushes).toBe(1);
    expect(restartedOutbox.count()).toBe(0);
    restarted.dispose();
  });

  it.each([
    ['active file first', ['index.html', 'stopped.html']],
    ['stopped file first', ['stopped.html', 'index.html']],
  ] as const)('validates every personal publication in a mixed identity batch (%s)', async (_order, filePaths) => {
    const db = seededDb();
    const owner = context('owner', {
      workspaceId: 'workspace-personal',
      workspaceType: 'personal',
      workspaceMemberId: 'personal-owner',
      teamId: '',
    });
    const binding: CommentRelayLocalProjectBinding = {
      workspaceId: owner.workspaceId,
      visibility: 'personal',
      resourceState: 'active',
      createdByWorkspaceMemberId: owner.workspaceMemberId,
    };
    const publications = createSqlitePublicFilePublicationStore(db, () => 100);
    for (const filePath of filePaths) {
      publications.set({
        resourceTeamId: owner.workspaceId,
        ownerMemberId: owner.workspaceMemberId,
        projectId: 'p1',
        filePath,
      }, { url: `https://example.test/${filePath}`, slug: filePath, fileName: filePath });
    }
    const scope = (projectId: string, filePath: string, current: WorkspaceCollabContext) =>
      commentRelayScope({ binding, context: current, projectId, filePath, publications });
    const pushed: string[] = [];
    const outbox = createCommentRelayOutboxStore(db, () => 100);
    const service = createCollabCloudService({
      client: clientWithPush(async (_teamId, _projectId, payload) => {
        pushed.push(payload.filePath);
        return { seq: pushed.length };
      }),
      commentOutbox: outbox,
      commentRelayScope: scope,
      resolveLocalProjectRelayBinding: () => ({ workspaceId: owner.workspaceId, ownerMemberId: owner.workspaceMemberId }),
      validateCommentRelayProjectBinding: (record) => commentRelayLocalBindingMatches(record, binding),
      resolveCommentRelayWorkspaceContext: async () => owner,
      listRemoteProjectRelayBindings: async () => [],
      listProjectIds: () => [], resolveLocalConversationId: () => 'conv-local', mergeComment: () => 'unchanged',
      now: () => 100, retryDelayMs: () => 0,
    });
    for (const [index, filePath] of filePaths.entries()) {
      expect(service.enqueueComment(comment({ id: `comment-${index}`, filePath, authorMemberId: owner.workspaceMemberId }), owner)).toBe(true);
    }
    // This is deliberately after enqueue: the records share one durable owner
    // identity batch, but only the active publication may cross the relay.
    publications.delete({
      resourceTeamId: owner.workspaceId,
      ownerMemberId: owner.workspaceMemberId,
      projectId: 'p1',
      filePath: 'stopped.html',
    });

    await service.flushPendingComments();

    expect(pushed).toEqual(['index.html']);
    expect(outbox.count()).toBe(0);
    service.dispose();
  });

  it('does not let a stale different-creator project block a valid personal project in the same identity batch', async () => {
    const db = seededDb();
    const owner = context('owner', { workspaceId: 'workspace-personal', workspaceType: 'personal', workspaceMemberId: 'personal-owner', teamId: '' });
    const otherCreator = 'another-creator';
    let freshIdentity = owner;
    const bindings = new Map<string, CommentRelayLocalProjectBinding>([
      ['p1', { workspaceId: owner.workspaceId, visibility: 'personal', resourceState: 'active', createdByWorkspaceMemberId: owner.workspaceMemberId }],
      ['p2', { workspaceId: owner.workspaceId, visibility: 'personal', resourceState: 'active', createdByWorkspaceMemberId: otherCreator }],
    ]);
    const publications = createSqlitePublicFilePublicationStore(db, () => 100);
    for (const [projectId, creator] of [['p1', owner.workspaceMemberId], ['p2', otherCreator]] as const) {
      publications.set({ resourceTeamId: owner.workspaceId, ownerMemberId: creator, projectId, filePath: 'index.html' }, { url: `https://example.test/${projectId}`, slug: projectId, fileName: 'index.html' });
    }
    const scope = (projectId: string, filePath: string, current: WorkspaceCollabContext) =>
      commentRelayScope({ binding: bindings.get(projectId), context: current, projectId, filePath, publications });
    const pushed: string[] = [];
    const outbox = createCommentRelayOutboxStore(db, () => 100);
    const service = createCollabCloudService({
      client: clientWithPush(async (_teamId, projectId) => { pushed.push(projectId); return { seq: pushed.length }; }),
      commentOutbox: outbox, commentRelayScope: scope,
      resolveLocalProjectRelayBinding: (projectId) => {
        const binding = bindings.get(projectId);
        return binding ? { workspaceId: binding.workspaceId!, ownerMemberId: binding.createdByWorkspaceMemberId! } : null;
      },
      validateCommentRelayProjectBinding: (record) => commentRelayLocalBindingMatches(record, bindings.get(record.projectId)),
      resolveCommentRelayWorkspaceContext: async () => freshIdentity,
      listRemoteProjectRelayBindings: async () => [], listProjectIds: () => [], resolveLocalConversationId: () => 'conv-local', mergeComment: () => 'unchanged',
      now: () => 100, retryDelayMs: () => 0,
    });
    expect(service.enqueueComment(comment({ id: 'valid-p1', projectId: 'p1', authorMemberId: owner.workspaceMemberId }), owner)).toBe(true);
    // Simulate a row queued before p2's creator changed: it retains the same
    // durable principal batch, but its current creator scope is no longer ours.
    outbox.enqueue({ workspaceId: owner.workspaceId, workspaceMemberId: owner.workspaceMemberId, teamId: owner.workspaceId, relayScope: 'personal', projectId: 'p2', expectedOwnerMemberId: otherCreator, comment: previewCommentToCloud(comment({ id: 'stale-p2', projectId: 'p2' }), owner.workspaceMemberId) });

    await service.flushPendingComments();
    expect(pushed).toEqual(['p1']);
    expect(outbox.count()).toBe(0);

    // A later login/principal transition is not proof of an unpublish; it
    // leaves a newly queued active-file row deferred for retry.
    expect(service.enqueueComment(comment({ id: 'deferred-p1', projectId: 'p1', authorMemberId: owner.workspaceMemberId }), owner)).toBe(true);
    freshIdentity = { ...owner, workspaceMemberId: 'switched-account' };
    await service.flushPendingComments();
    expect(pushed).toEqual(['p1']);
    expect(outbox.count()).toBe(1);
    service.dispose();
  });

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
        mergeComment: () => 'unchanged',
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
      mergeComment: () => 'unchanged',
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
    const confirmed: Array<{ commentId: string; seq: number; authorKey: string | undefined; memberId: string }> = [];
    const secondService = createCollabCloudService({
      client: clientWithPush(async () => ({ seq: 42, authorKey: 'a'.repeat(64) })),
      commentOutbox: reopenedOutbox,
      resolveLocalProjectRelayBinding: () => ({
        workspaceId: 'workspace-a',
        ownerMemberId: 'project-owner',
      }),
      resolveRemoteProjectOwnerMemberId: async () => 'project-owner',
      listProjectIds: () => [],
      resolveProjectWorkspaceContext: async () => queuedContext,
      resolveLocalConversationId: () => 'conv-local',
      mergeComment: () => 'unchanged',
      onCommentPushed: ({ commentId, seq, authorKey, memberId }) => confirmed.push({ commentId, seq, authorKey, memberId }),
      now: () => 200,
      retryDelayMs: () => 0,
    });
    await secondService.flushPendingComments();

    expect(reopenedOutbox.count()).toBe(0);
    expect(confirmed).toEqual([{ commentId: 'comment-1', seq: 42, authorKey: 'a'.repeat(64), memberId: queuedContext.workspaceMemberId }]);
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
      mergeComment: () => 'unchanged',
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
      mergeComment: () => 'unchanged',
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
      mergeComment: () => 'unchanged',
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
      mergeComment: () => 'unchanged',
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
      mergeComment: () => 'unchanged',
      now: () => 600,
      retryDelayMs: () => 0,
    });
    service.enqueueComment(comment(), queuedContext);
    await service.flushPendingComments();

    expect(pushes).toBe(0);
    expect(outbox.count()).toBe(0);
    service.dispose();
  });

  it('reports a missing remote owner while conditionally acknowledging only that revision', async () => {
    const db = seededDb();
    const queuedContext = context('member');
    const outbox = createCommentRelayOutboxStore(db, () => 700);
    const catalog = deferred<Array<{ projectId: string; ownerMemberId: string }>>();
    const pushed: string[] = [];
    const confirmed: string[] = [];
    const errors: unknown[] = [];
    const service = createCollabCloudService({
      client: clientWithPush(async (_teamId, projectId) => {
        pushed.push(projectId);
        return { seq: pushed.length };
      }),
      commentOutbox: outbox,
      resolveLocalProjectRelayBinding: () => ({
        workspaceId: 'workspace-a',
        ownerMemberId: 'project-owner',
      }),
      listProjectIds: () => [],
      resolveLocalConversationId: () => 'conv-local',
      mergeComment: () => 'unchanged',
      resolveCommentRelayWorkspaceContext: async () => queuedContext,
      listRemoteProjectRelayBindings: async () => catalog.promise,
      onCommentPushed: ({ projectId }) => confirmed.push(projectId),
      onError: (error) => errors.push(error),
      now: () => 700,
      retryDelayMs: () => 0,
    });
    expect(service.enqueueComment(comment({ id: 'missing-owner', note: 'old revision' }), queuedContext)).toBe(true);
    expect(service.enqueueComment(comment({ id: 'valid-project', projectId: 'p2' }), queuedContext)).toBe(true);

    const flushing = service.flushPendingComments();
    await Promise.resolve();
    expect(service.enqueueComment(comment({ id: 'missing-owner', note: 'new revision', updatedAt: 20 }), queuedContext)).toBe(true);
    catalog.resolve([{ projectId: 'p2', ownerMemberId: 'project-owner' }]);
    await flushing;

    expect(pushed).toEqual(['p2']);
    expect(confirmed).toEqual(['p2']);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(Error);
    expect((errors[0] as Error).message).toContain('remote project owner missing');
    expect(outbox.count()).toBe(1);
    expect(outbox.listDue(700)[0]?.comment.note).toBe('new revision');
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
      mergeComment: () => 'unchanged',
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
      mergeComment: () => 'unchanged',
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
      mergeComment: () => 'unchanged',
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
      mergeComment: () => 'unchanged',
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
      mergeComment: () => 'unchanged',
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
      mergeComment: () => 'unchanged',
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
      mergeComment: () => 'unchanged',
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
      mergeComment: () => 'unchanged',
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

  it('acknowledges only the rejected revision for a structured 410 SHARE_STOPPED and does not resurrect it after SQLite reopen', async () => {
    const db = seededDb();
    const queuedContext = context('member');
    const outbox = createCommentRelayOutboxStore(db, () => 1_400);
    const stdout = fs.readFileSync(
      new URL('./fixtures/vela-cli-comment-push-share-stopped-927e0a62e7.stdout.json', import.meta.url),
      'utf8',
    );
    // Exercise the default runner: runVelaCommand captures stdout on its
    // rejected process-boundary error, then defaultRunVelaCollab must preserve
    // the structured terminal failure through runJson and the SQLite outbox.
    vi.stubEnv('VELA_BIN', process.execPath);
    vi.stubEnv('OD_DATA_DIR', '');
    execFileMock.mockImplementationOnce((_bin, _args, _options, callback) => {
      callback(new Error('unclassified command failure'), stdout, '');
      return { pid: 4321 };
    });
    const client = createVelaCliCollabClient();
    const errors: unknown[] = [];
    const confirmed: Array<{ commentId: string; seq: number }> = [];
    const service = createCollabCloudService({
      client,
      commentOutbox: outbox,
      resolveLocalProjectRelayBinding: () => ({ workspaceId: 'workspace-a', ownerMemberId: 'project-owner' }),
      resolveRemoteProjectOwnerMemberId: async () => 'project-owner',
      listProjectIds: () => [], resolveProjectWorkspaceContext: async () => queuedContext,
      resolveLocalConversationId: () => 'conv-local', mergeComment: () => 'unchanged',
      onCommentPushed: (event) => confirmed.push(event), onError: (error) => errors.push(error),
      now: () => 1_400, retryDelayMs: () => 0,
    });
    expect(service.enqueueComment(comment(), queuedContext)).toBe(true);
    await service.flushPendingComments();

    expect(outbox.count()).toBe(0);
    expect(confirmed).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(CollabCloudError);
    expect(errors[0]).toMatchObject({ status: 410, code: 'SHARE_STOPPED' });
    service.dispose();
    closeDatabase();

    const reopened = openDatabase(tempDir!);
    const restartedOutbox = createCommentRelayOutboxStore(reopened, () => 1_400);
    expect(restartedOutbox.count()).toBe(0);
  });

  it('keeps a newer queued revision when the in-flight older revision is terminally rejected', async () => {
    const db = seededDb();
    const queuedContext = context('member');
    const outbox = createCommentRelayOutboxStore(db, () => 1_500);
    const inFlight = deferred<void>();
    const service = createCollabCloudService({
      client: clientWithPush(async () => {
        await inFlight.promise;
        throw new CollabCloudError(410, 'SHARE_STOPPED');
      }),
      commentOutbox: outbox,
      resolveLocalProjectRelayBinding: () => ({ workspaceId: 'workspace-a', ownerMemberId: 'project-owner' }),
      resolveRemoteProjectOwnerMemberId: async () => 'project-owner',
      listProjectIds: () => [], resolveProjectWorkspaceContext: async () => queuedContext,
      resolveLocalConversationId: () => 'conv-local', mergeComment: () => 'unchanged',
      now: () => 1_500, retryDelayMs: () => 0,
    });
    service.enqueueComment(comment({ note: 'old' }), queuedContext);
    const flushing = service.flushPendingComments();
    await Promise.resolve();
    service.enqueueComment(comment({ note: 'new' }), queuedContext);
    inFlight.resolve();
    await flushing;

    const [pending] = outbox.listDue(1_500);
    expect(pending?.comment.note).toBe('new');
    expect(outbox.count()).toBe(1);
    service.dispose();
  });

  it.each([
    new CollabCloudError(429, 'RATE_LIMITED', 'SHARE_STOPPED'),
    new CollabCloudError(500, 'UPSTREAM_FAILURE', 'SHARE_STOPPED'),
    new CollabCloudError(410, 'ANOTHER_GONE_CODE', 'SHARE_STOPPED'),
    new Error('410 SHARE_STOPPED'),
  ])('retries non-terminal structured failures without using message text', async (failure) => {
    const db = seededDb();
    const queuedContext = context('member');
    const outbox = createCommentRelayOutboxStore(db, () => 1_600);
    let attempts = 0;
    const service = createCollabCloudService({
      client: clientWithPush(async () => { attempts += 1; throw failure; }),
      commentOutbox: outbox,
      resolveLocalProjectRelayBinding: () => ({ workspaceId: 'workspace-a', ownerMemberId: 'project-owner' }),
      resolveRemoteProjectOwnerMemberId: async () => 'project-owner',
      listProjectIds: () => [], resolveProjectWorkspaceContext: async () => queuedContext,
      resolveLocalConversationId: () => 'conv-local', mergeComment: () => 'unchanged',
      now: () => 1_600, retryDelayMs: () => 0,
    });
    service.enqueueComment(comment(), queuedContext);
    await service.flushPendingComments();
    await service.flushPendingComments();
    await service.flushPendingComments();
    expect(attempts).toBe(3);
    expect(outbox.count()).toBe(1);
    service.dispose();
  });

});
