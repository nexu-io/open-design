import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildWorkspacePermissions, buildWorkspaceSeatSummary, type WorkspaceCollabContext } from '@open-design/contracts';
import { closeDatabase, openDatabase, insertProject, insertConversation, upsertPreviewComment } from '../src/db.js';
import { ensureWorkspaceArtifactForPath } from '../src/chat-artifacts/store.js';
import { createSqlitePublicFilePublicationStore } from '../src/collab/public-file-publication-store.js';
import { createCommentRelayOutboxStore } from '../src/collab/comment-relay-outbox.js';
import { createPublishedCommentBackfillReconciler } from '../src/collab/published-comment-backfill-reconciler.js';
import { createCommentSyncStateService } from '../src/collab/comment-sync-state.js';
import { readPublishedCommentBackfill } from '../src/collab/published-comment-backfill-state.js';
import { createCollabCloudService } from '../src/collab/collab-cloud-service.js';
import { createVelaCliCollabClient } from '../src/collab/vela-cli-collab-client.js';

let root: string;
afterEach(() => { closeDatabase(); if (root) rmSync(root, { recursive: true, force: true }); });
function setup() {
  root = mkdtempSync(join(tmpdir(), 'od-comment-mainline-'));
  const db = openDatabase(root);
  insertProject(db, { id: 'p', name: 'p', createdAt: 1, updatedAt: 1 });
  insertConversation(db, { id: 'c', projectId: 'p', title: 'c', createdAt: 1, updatedAt: 1 });
  db.prepare(`INSERT INTO workspace_projects(project_id, workspace_id, visibility, resource_state,
    created_by_workspace_member_id, created_at, updated_at) VALUES('p','w','personal','active','m',1,1)`).run();
  const scope = { resourceTeamId: 'w', ownerMemberId: 'm', projectId: 'p', filePath: 'work.html',
    sourceFileId: ensureWorkspaceArtifactForPath(db, { projectId: 'p', path: 'work.html', kind: 'html' }).id };
  for (const id of ['a', 'b']) upsertPreviewComment(db, 'p', 'c', { id, note: id, authorMemberId: 'author', sourceFileId: scope.sourceFileId,
    target: { filePath: scope.filePath, elementId: 'hero', selector: '#hero', label: 'Hero', position: { x: 0, y: 0, width: 2, height: 2 } } });
  const outbox = createCommentRelayOutboxStore(db);
  const publications = createSqlitePublicFilePublicationStore(db);
  const publication = { slug: 's', url: 'https://example.test/s', fileName: scope.filePath };
  // A real committed publication exists before comments are prepared.
  publications.set(scope, publication);
  const revision = publications.getRevision(scope)!;
  const fact = { scope, publicationRevision: revision, publicFilePath: 'index.html', reopened: false, receipt: { resourceId: 'resource', versionId: 'version' } };
  const reconciler = createPublishedCommentBackfillReconciler(db, { listFacts: () => [fact] });
  const syncScope = { projectId: 'p', workspaceId: 'w', workspaceMemberId: 'm', filePath: scope.filePath };
  return { db, scope, publications, publication, revision, fact, outbox, reconciler, syncScope };
}

it('prepares from an existing fact during the old outbox drain and delivers without publishing', async () => {
  const s = setup();
  expect(s.outbox.count()).toBe(0);
  const context: WorkspaceCollabContext = { workspaceId: 'w', workspaceType: 'personal', workspaceMemberId: 'm',
    teamId: 'w', role: 'owner', memberStatus: 'active', lifecycleState: 'active', billingState: 'active', planId: null,
    providerMode: 'platform_credits', permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }),
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 1, usedSeats: 1 }) };
  const delivered: string[] = [];
  const service = createCollabCloudService({
    client: { ...createVelaCliCollabClient({ run: async () => { throw new Error('Publishing/CLI is forbidden'); } }),
      pushComment: async (_team, _project, comment) => { delivered.push(comment.id); return { seq: 1 }; } },
    commentOutbox: s.outbox, listProjectIds: () => [],
    preparePendingComments: () => s.reconciler.prepare(s.scope),
    resolveCommentRelayWorkspaceContext: async () => context,
    listRemoteProjectRelayBindings: async () => [{ projectId: 'p', ownerMemberId: 'm' }],
    validateCommentRelayProjectBinding: () => true,
    commentRelayScope: () => ({ relayScope: 'personal', workspaceId: 'w', teamId: 'w', ownerMemberId: 'm' }),
    resolveLocalConversationId: () => 'c', mergeComment: () => 'unchanged',
  });
  try {
    await service.flushPendingComments();
    await service.flushPendingComments();
    expect(delivered).toEqual(['a', 'b']);
    expect(s.outbox.count()).toBe(0);
    expect(s.publications.getRevision(s.scope)).toEqual(s.revision);
    expect(readPublishedCommentBackfill(s.db, s.syncScope)).toMatchObject({ state: 'succeeded', total: 2, synced: 2 });
  } finally { service.dispose(); }
});

it('rolls back partial enqueue, records safe comment failure and retries once without republishing', async () => {
  const s = setup();
  s.db.exec("CREATE TRIGGER fail_comment BEFORE INSERT ON comment_relay_outbox WHEN NEW.comment_id='b' BEGIN SELECT RAISE(ABORT,'private token'); END");
  const sync = createCommentSyncStateService(s.db, async () => true, {
    preparePendingComments: (scope, options) => s.reconciler.prepare({ resourceTeamId: scope.workspaceId,
      ownerMemberId: scope.workspaceMemberId, projectId: scope.projectId, ...(scope.filePath !== undefined ? { filePath: scope.filePath } : {}) }, options),
  });
  const failed = await sync.read(s.syncScope);
  expect(failed).toMatchObject({ pending: 0, lastError: 'COMMENT_SYNC_DELIVERY_FAILED', backfill: { state: 'failed', retryable: true, code: 'BACKFILL_ENQUEUE_FAILED' } });
  expect(JSON.stringify(failed)).not.toContain('private token');
  expect(s.publications.getRevision(s.scope)).toEqual(s.revision);
  expect(s.outbox.count()).toBe(0);
  await sync.retry(s.syncScope);
  expect(s.outbox.count()).toBe(0);
  s.db.exec('DROP TRIGGER fail_comment');
  expect(await sync.retry(s.syncScope)).toMatchObject({ pending: 2, backfill: { state: 'pending', total: 2 } });
  const rows = s.outbox.listDue(Date.now());
  await sync.retry(s.syncScope);
  await s.reconciler.prepare(s.scope);
  expect(s.outbox.listDue(Date.now())).toEqual(rows);
  expect(s.publications.getRevision(s.scope)).toEqual(s.revision);
});

it.each(['stop', 'revision'] as const)('ignores a stale fact after %s and cannot recreate a stopped queue', async change => {
  const s = setup();
  if (change === 'stop') s.publications.delete(s.scope);
  else s.publications.set(s.scope, s.publication);
  await s.reconciler.prepare(s.scope, { retryFailed: true });
  expect(s.outbox.count()).toBe(0);
  expect(readPublishedCommentBackfill(s.db, s.syncScope)).toBeUndefined();
});

it('retries transport through the existing batch without preparing it again', async () => {
  const s = setup(); await s.reconciler.prepare(s.scope);
  const row = s.outbox.listDue(Date.now())[0]!;
  s.outbox.defer(row, { nextAttemptAt: 9000000000000, error: 'offline' });
  const sync = createCommentSyncStateService(s.db, async () => true, {
    preparePendingComments: (_scope, options) => s.reconciler.prepare(s.scope, options),
  });
  await sync.retry(s.syncScope);
  const retried = s.outbox.listDue(Date.now()).find(item => item.commentId === row.commentId)!;
  expect(retried.revision).toBe(row.revision);
  expect(retried.eventKey).toBe(row.eventKey);
  expect(s.outbox.count()).toBe(2);
});

it('keeps failed fact reads unknown and rejects a foreign scope before enqueue', async () => {
  const s = setup();
  const unavailable = createPublishedCommentBackfillReconciler(s.db, { listFacts: () => { throw new Error('private credential'); } });
  await expect(unavailable.prepare(s.scope)).rejects.toThrow('COMMENT_BACKFILL_FACTS_UNAVAILABLE');
  const foreign = createPublishedCommentBackfillReconciler(s.db, { listFacts: () => [{ ...s.fact, scope: { ...s.scope, ownerMemberId: 'foreign' } }] });
  await expect(foreign.prepare(s.scope)).rejects.toThrow('COMMENT_BACKFILL_SCOPE_MISMATCH');
  expect(s.outbox.count()).toBe(0);
  expect(readPublishedCommentBackfill(s.db, s.syncScope)).toBeUndefined();
});

it('does not attach an old enqueue failure to a new publication or a stopped file', async () => {
  const s = setup();
  s.db.exec("CREATE TRIGGER fail_comment BEFORE INSERT ON comment_relay_outbox BEGIN SELECT RAISE(ABORT,'unavailable'); END");
  await s.reconciler.prepare(s.scope);
  expect(readPublishedCommentBackfill(s.db, s.syncScope)).toMatchObject({ state: 'failed' });
  s.publications.set(s.scope, s.publication);
  await s.reconciler.prepare(s.scope, { retryFailed: true });
  expect(readPublishedCommentBackfill(s.db, s.syncScope)).toBeUndefined();
  s.publications.delete(s.scope);
  await s.reconciler.prepare(s.scope, { retryFailed: true });
  expect(readPublishedCommentBackfill(s.db, s.syncScope)).toBeUndefined();
  expect(s.outbox.count()).toBe(0);
});

it('records failed comment admission, skips it on polls and admits once on explicit retry', async () => {
  const s = setup();
  let offline = true;
  let admissions = 0;
  const reconciler = createPublishedCommentBackfillReconciler(s.db, {
    listFacts: () => [s.fact],
    admitFact: async fact => {
      admissions++;
      expect(s.db.inTransaction).toBe(false);
      expect(fact.receipt).toEqual({ resourceId: 'resource', versionId: 'version' });
      if (offline) throw new Error('private remote admission error');
    },
  });
  await reconciler.prepare(s.scope);
  expect(readPublishedCommentBackfill(s.db, s.syncScope)).toMatchObject({
    state: 'failed', retryable: true, code: 'BACKFILL_ENQUEUE_FAILED',
  });
  expect(s.outbox.count()).toBe(0);
  expect(s.publications.getRevision(s.scope)).toEqual(s.revision);
  await reconciler.prepare(s.scope);
  expect(admissions).toBe(1);
  offline = false;
  await reconciler.prepare(s.scope, { retryFailed: true });
  const rows = s.outbox.listDue(Date.now());
  expect(rows).toHaveLength(2);
  expect(readPublishedCommentBackfill(s.db, s.syncScope)).toMatchObject({ state: 'pending', total: 2 });
  await reconciler.prepare(s.scope, { retryFailed: true });
  expect(admissions).toBe(2);
  expect(s.outbox.listDue(Date.now())).toEqual(rows);
  expect(s.publications.getRevision(s.scope)).toEqual(s.revision);
});

it.each(['stop', 'revision', 'stop-with-error'] as const)(
  'does not enqueue or record stale failure when %s races with comment admission', async change => {
    const s = setup();
    let release!: () => void;
    const admitted = new Promise<void>(resolve => { release = resolve; });
    let admissions = 0;
    const reconciler = createPublishedCommentBackfillReconciler(s.db, {
      listFacts: () => [s.fact],
      admitFact: async () => {
        admissions++;
        await admitted;
        if (change === 'stop-with-error') throw new Error('private late error');
      },
    });
    const preparing = reconciler.prepare(s.scope);
    expect(admissions).toBe(1);
    if (change === 'revision') s.publications.set(s.scope, s.publication);
    else s.publications.delete(s.scope);
    release();
    await preparing;
    expect(s.outbox.count()).toBe(0);
    expect(readPublishedCommentBackfill(s.db, s.syncScope)).toBeUndefined();
    expect(s.db.prepare('SELECT 1 FROM published_comment_backfill_batches').get()).toBeUndefined();
    await reconciler.prepare(s.scope, { retryFailed: true });
    expect(admissions).toBe(1);
  },
);
