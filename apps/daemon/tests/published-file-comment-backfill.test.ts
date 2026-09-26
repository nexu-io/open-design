import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import express from 'express';
import { buildWorkspacePermissions, buildWorkspaceSeatSummary, type WorkspaceCollabContext, type CollabCloudComment, type CommentSyncState } from '@open-design/contracts';
import { closeDatabase, openDatabase, insertProject, insertConversation, upsertPreviewComment, getWorkspaceProjectByProjectId } from '../src/db.js';
import { createSqlitePublicFilePublicationStore, migratePublicFilePublications } from '../src/collab/public-file-publication-store.js';
import { createCommentRelayOutboxStore, commentRelayLocalBindingMatches } from '../src/collab/comment-relay-outbox.js';
import { enqueuePublishedFileComments } from '../src/collab/published-file-comment-backfill.js';
import { readPublishedCommentBackfill } from '../src/collab/published-comment-backfill-state.js';
import { createCommentSyncStateService } from '../src/collab/comment-sync-state.js';
import { registerCommentSyncStateRoutes } from '../src/routes/project/comments.js';
import { createPublicFilePublicationRecorder } from '../src/collab/public-file-publication-recording.js';
import { createShareFileMapping } from '../src/collab/share-file-mapping.js';
import { recordPublishedCommentMutation, sourcePathForCurrentPublication } from '../src/collab/comment-relay-publication-mapping.js';
import { createCollabCloudService } from '../src/collab/collab-cloud-service.js';
import { createVelaCliCollabClient } from '../src/collab/vela-cli-collab-client.js';
import { commentRelayScope } from '../src/collab/comment-relay-scope.js';
let root: string | undefined;
afterEach(() => { closeDatabase(); if (root) rmSync(root, { recursive: true, force: true }); root = undefined; });
function setup() {
  root = mkdtempSync(join(tmpdir(), 'od-backfill-'));
  const db = openDatabase(root);
  migratePublicFilePublications(db);
  const scope = { resourceTeamId: 'w', ownerMemberId: 'owner', projectId: 'p', filePath: 'pages/work.html' };
  for (const projectId of ['p', 'other']) {
    insertProject(db, { id: projectId, name: projectId, createdAt: 1, updatedAt: 1 });
    for (const name of ['a', 'b', 'comment-anchor-inbound']) {
      insertConversation(db, { id: `${name}-${projectId}`, projectId, title: name, createdAt: 1, updatedAt: 1 });
    }
  }
  db.prepare(`INSERT INTO workspace_projects(project_id, workspace_id, visibility, resource_state,
    created_by_workspace_member_id, created_at, updated_at) VALUES('p','w','personal','active','owner',1,1)`).run();
  const add = (id: string, conversationId = 'a-p', filePath = scope.filePath, projectId = 'p', authorMemberId = 'original') =>
    upsertPreviewComment(db, projectId, conversationId, { id, authorMemberId, note: id,
      target: { filePath, elementId: 'hero', selector: '#hero', label: 'Hero', position: { x: 0, y: 0, width: 2, height: 2 } } });
  const publications = createSqlitePublicFilePublicationStore(db);
  const publication = { slug: 'stable', url: 'https://example.test/s/stable', fileName: scope.filePath };
  const outbox = createCommentRelayOutboxStore(db);
  const publish = () => db.transaction(() => {
    publications.set(scope, publication);
    return enqueuePublishedFileComments(db, { scope, publicationRevision: publications.getRevision(scope)!, publicFilePath: 'index.html' });
  })();
  return { db, scope, add, publications, publication, outbox, publish };
}
it('composes the real publisher recorder, planner mapping and durable queue across stable-alias updates', () => {
  const s = setup(); s.add('a'); s.add('b', 'b-p'); s.add('private', 'a-p', 'private.html');
  const mapping = createShareFileMapping([{ sourcePath: s.scope.filePath, file: 'index.html' }]);
  const record = createPublicFilePublicationRecorder(s.db, s.publications, enqueuePublishedFileComments);
  const first = record(s.scope, s.publication, mapping);
  const oldRows = s.outbox.listDue(Date.now());
  expect(oldRows.map(row => row.comment.id)).toEqual(['a', 'b']);
  expect(oldRows.every(row => row.publication?.token === first.token && row.publication.publicFilePath === 'index.html')).toBe(true);
  s.add('a', 'a-p');
  const second = record(s.scope, s.publication, mapping);
  expect(second.slug).toBe(first.slug); expect(second.token).not.toBe(first.token);
  expect(s.outbox.isPublicationCurrent!(oldRows[0]!)).toBe(false);
  const currentRows = s.outbox.listDue(Date.now());
  expect(currentRows).toHaveLength(2);
  expect(currentRows.every(row => row.publication?.token === second.token)).toBe(true);
  expect(s.publications.get(s.scope)?.url).toBe(s.publication.url);
  expect(s.db.inTransaction).toBe(false);
});
it('real recorder restores previous publication, queue and mapping when a later comment enqueue fails', () => {
  const s = setup(); s.add('a');
  const record = createPublicFilePublicationRecorder(s.db, s.publications, enqueuePublishedFileComments);
  const mapping = createShareFileMapping([{ sourcePath: s.scope.filePath, file: 'index.html' }]);
  const previous = record(s.scope, s.publication, mapping);
  const oldRows = s.outbox.listDue(Date.now());
  const oldMapping = s.db.prepare('SELECT * FROM comment_relay_publication_mappings').all();
  s.add('b', 'b-p');
  s.db.exec("CREATE TRIGGER reject_second BEFORE INSERT ON comment_relay_outbox WHEN NEW.comment_id='b' BEGIN SELECT RAISE(ABORT,'queue failed'); END");
  expect(() => record(s.scope, s.publication, mapping)).toThrow('queue failed');
  expect(s.publications.getRevision(s.scope)).toEqual(previous);
  expect(s.outbox.listDue(Date.now())).toEqual(oldRows);
  expect(s.db.prepare('SELECT * FROM comment_relay_publication_mappings').all()).toEqual(oldMapping);
  expect(s.db.inTransaction).toBe(false);
});
it('real recorder refuses unmapped file without replacing previously durable state', () => {
  const s = setup(); s.add('a'); s.publish();
  const revision = s.publications.getRevision(s.scope);
  const rows = s.outbox.listDue(Date.now());
  const record = createPublicFilePublicationRecorder(s.db, s.publications, enqueuePublishedFileComments);
  const other = createShareFileMapping([{ sourcePath: 'other.html', file: 'index.html' }]);
  expect(() => record(s.scope, s.publication, other)).toThrow('SHARE_ENTRY_MAPPING_UNAVAILABLE');
  expect(s.publications.getRevision(s.scope)).toEqual(revision);
  expect(s.outbox.listDue(Date.now())).toEqual(rows);
});

it.each(['active', 'stopped', 'republished-without-mapping', 'wrong-team', 'wrong-owner', 'wrong-project', 'wrong-slug', 'wrong-path'] as const)(
  'reverse mapping requires the exact active publication identity: %s', scenario => {
    const s = setup(); s.publish();
    if (scenario === 'stopped') s.publications.delete(s.scope);
    if (scenario === 'republished-without-mapping') s.publications.set(s.scope, s.publication);
    const path = sourcePathForCurrentPublication(s.db, {
      resourceTeamId: scenario === 'wrong-team' ? 'other' : s.scope.resourceTeamId,
      ownerMemberId: scenario === 'wrong-owner' ? 'other' : s.scope.ownerMemberId,
      projectId: scenario === 'wrong-project' ? 'other' : s.scope.projectId,
      slug: scenario === 'wrong-slug' ? 'other' : s.publication.slug,
      publishedPath: scenario === 'wrong-path' ? 'other.html' : 'index.html',
    });
    expect(path).toBe(scenario === 'active' ? s.scope.filePath : null);
  },
);
it('separates two aliases both packaged as index.html and never borrows the other after stop', () => {
  const s = setup(); s.publish();
  const otherScope = { ...s.scope, filePath: 'other.html' };
  createPublicFilePublicationRecorder(s.db, s.publications, enqueuePublishedFileComments)(
    otherScope, { ...s.publication, slug: 'other-alias' },
    createShareFileMapping([{ sourcePath: otherScope.filePath, file: 'index.html' }]),
  );
  const input = { resourceTeamId: s.scope.resourceTeamId, ownerMemberId: s.scope.ownerMemberId,
    projectId: s.scope.projectId, slug: s.publication.slug, publishedPath: 'index.html' };
  expect(sourcePathForCurrentPublication(s.db, input)).toBe(s.scope.filePath);
  expect(sourcePathForCurrentPublication(s.db, { ...input, slug: 'other-alias' })).toBe('other.html');
  s.publications.delete(s.scope);
  expect(sourcePathForCurrentPublication(s.db, input)).toBeNull();
});
it('rejects an ambiguous persisted alias instead of picking a source file', () => {
  const s = setup(); s.publish();
  const otherScope = { ...s.scope, filePath: 'other.html' };
  createPublicFilePublicationRecorder(s.db, s.publications, enqueuePublishedFileComments)(
    otherScope, s.publication, createShareFileMapping([{ sourcePath: otherScope.filePath, file: 'index.html' }]),
  );
  expect(() => sourcePathForCurrentPublication(s.db, { resourceTeamId: s.scope.resourceTeamId,
    ownerMemberId: s.scope.ownerMemberId, projectId: s.scope.projectId,
    slug: s.publication.slug, publishedPath: 'index.html' })).toThrow('SHARE_COMMENT_MAPPING_AMBIGUOUS');
});

it('includes all conversations of exactly one file, preserves ids/authors and never reauthors inbound users', () => {
  const s = setup();
  s.add('a'); s.add('b', 'b-p'); s.add('other-file', 'a-p', 'private.html'); s.add('other-project', 'a-other', s.scope.filePath, 'other');
  s.add('remote', 'comment-anchor-inbound-p'); s.add('web', 'a-p'); s.add('legacy', 'a-p', s.scope.filePath, 'p', '');
  s.db.prepare("UPDATE preview_comments SET author_kind='user',author_app_user_id='app-user' WHERE id='web'").run();
  expect(s.publish()).toEqual({ enqueued: 3, skippedInbound: 2 });
  expect(s.outbox.listDue(Date.now()).map(row => [row.comment.id, row.comment.memberId, row.comment.filePath, row.publication?.publicFilePath])).toEqual([
    ['a', 'original', s.scope.filePath, 'index.html'], ['b', 'original', s.scope.filePath, 'index.html'], ['legacy', '', s.scope.filePath, 'index.html'],
  ]);
  expect(readPublishedCommentBackfill(s.db, { projectId: 'p', workspaceId: 'w', workspaceMemberId: 'owner', filePath: s.scope.filePath })).toMatchObject({
    state: 'pending', filePath: s.scope.filePath, retryable: false,
  });
  s.publish(); expect(s.outbox.count()).toBe(3);
});
it('K5 deletion-only resume tracks its stopped tombstone, retryable failure and remote ACK', async () => {
  const s = setup(); s.add('only'); s.publish();
  const original = s.outbox.listDue(Date.now())[0]!;
  s.outbox.acknowledge(original, 'delivered');
  s.publications.delete(s.scope);
  s.db.transaction(() => {
    expect(recordPublishedCommentMutation(s.db, s.scope, { ...original.comment, deleted: true,
      updatedAt: original.comment.updatedAt + 1 })).toBe(true);
    s.db.prepare("DELETE FROM preview_comments WHERE id='only'").run();
  })();
  const resumed = s.publish();
  expect(resumed.enqueued).toBe(1);
  expect(s.outbox.listDue(Date.now()).map(row => [row.comment.id, row.comment.deleted])).toEqual([['only', true]]);
  const app = express(); const server = createServer(app);
  registerCommentSyncStateRoutes(app, { db: s.db, service: createCommentSyncStateService(s.db, async () => true),
    authorize: async req => req.get('x-od-workspace-member-id') === 'owner'
      ? { ok: true, context: { workspaceId: 'w', workspaceMemberId: 'owner' } as WorkspaceCollabContext }
      : { ok: false, status: 403, code: 'DENIED', message: 'denied' } });
  let relay: ReturnType<typeof createCollabCloudService> | undefined;
  try {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('listener failed');
  const statusUrl = `http://127.0.0.1:${address.port}/api/projects/p/comment-sync-state?filePath=pages%2Fwork.html`;
  const getStatus = async (): Promise<CommentSyncState> => {
    const response = await fetch(statusUrl, { headers: { 'x-od-workspace-member-id': 'owner' } });
    expect(response.status).toBe(200); return await response.json() as CommentSyncState;
  };
  expect((await getStatus()).backfill).toMatchObject({ state: 'pending', retryable: false, publicationRevision: s.publications.getRevision(s.scope)!.token });
  const context: WorkspaceCollabContext = { workspaceId: 'w', workspaceType: 'personal', workspaceMemberId: 'owner',
    teamId: 'w', role: 'owner', memberStatus: 'active', lifecycleState: 'active', billingState: 'active', planId: null,
    providerMode: 'platform_credits', permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }),
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 1, usedSeats: 1 }) };
  let offline = true;
  const delivered: CollabCloudComment[] = [];
  relay = createCollabCloudService({
    client: { ...createVelaCliCollabClient({ run: async () => { throw new Error('unexpected CLI'); } }),
      pushComment: async (_team, _project, comment) => {
        if (offline) throw new Error('offline');
        delivered.push(comment);
        return { seq: 2 };
      } },
    commentOutbox: s.outbox, listProjectIds: () => [], retryDelayMs: () => 0,
    resolveCommentRelayWorkspaceContext: async () => context,
    listRemoteProjectRelayBindings: async () => [{ projectId: 'p', ownerMemberId: 'owner' }],
    validateCommentRelayProjectBinding: row => commentRelayLocalBindingMatches(row, getWorkspaceProjectByProjectId(s.db, row.projectId)),
    commentRelayScope: (projectId, filePath, ctx) => commentRelayScope({ projectId, filePath, context: ctx,
      binding: getWorkspaceProjectByProjectId(s.db, projectId), publications: s.publications }),
    resolveLocalConversationId: () => 'a-p', mergeComment: () => 'unchanged',
  });
    await relay.flushPendingComments();
    expect((await getStatus()).backfill).toMatchObject({ state: 'failed', retryable: true });
    expect(s.outbox.count()).toBe(1);
    offline = false;
    await relay.flushPendingComments();
    expect(delivered).toMatchObject([{ id: 'only', deleted: true, filePath: 'index.html' }]);
    expect(s.outbox.count()).toBe(0);
    expect((await getStatus()).backfill).toMatchObject({ state: 'succeeded', retryable: false });
  } finally {
    relay?.dispose();
    if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
it('requires publication transaction and exact current witness', () => {
  const s = setup(); s.add('a'); s.publications.set(s.scope, s.publication);
  const input = { scope: s.scope, publicationRevision: s.publications.getRevision(s.scope)!, publicFilePath: 'index.html' };
  expect(() => enqueuePublishedFileComments(s.db, input)).toThrow('transaction');
  s.publications.set(s.scope, s.publication);
  expect(() => s.db.transaction(() => enqueuePublishedFileComments(s.db, input))()).toThrow('stale');
  expect(s.outbox.count()).toBe(0);
});
it('rolls back publication and ALL queued rows if any enqueue fails', () => {
  const s = setup(); s.add('a'); s.add('b', 'b-p');
  s.db.exec("CREATE TRIGGER fail_backfill BEFORE INSERT ON comment_relay_outbox WHEN NEW.comment_id='b' BEGIN SELECT RAISE(ABORT,'injected'); END");
  expect(s.publish).toThrow('injected'); expect(s.outbox.count()).toBe(0); expect(s.publications.get(s.scope)).toBeNull();
});
it('persists mapping and intent across database reopen', () => {
  const s = setup(); s.add('a'); s.publish(); const before = s.outbox.listDue(Date.now());
  closeDatabase(); const reopened = openDatabase(root!);
  const queue = createCommentRelayOutboxStore(reopened);
  expect(queue.listDue(Date.now())).toEqual(before); expect(queue.isPublicationCurrent!(before[0]!)).toBe(true);
});
it.each(['normal', 'stop', 'republish', 'delete', 'switch', 'retry', 'stop-inflight', 'republish-inflight', 'republish-new-intents'] as const)('delivery is mapped, retryable and scoped: %s', async scenario => {
  const s = setup(); s.add('a');
  const inFlightChange = ['stop-inflight', 'republish-inflight', 'republish-new-intents'].includes(scenario);
  if (inFlightChange) s.add('b', 'b-p');
  s.publish();
  const deferredSignal = () => {
    let resolve = () => {};
    const promise = new Promise<void>(done => { resolve = done; });
    return { promise, resolve };
  };
  const entered = deferredSignal();
  const release = deferredSignal();
  const context: WorkspaceCollabContext = { workspaceId: 'w', workspaceType: 'personal', workspaceMemberId: 'owner',
    teamId: 'w', role: 'owner', memberStatus: 'active', lifecycleState: 'active', billingState: 'active', planId: null,
    providerMode: 'platform_credits', permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }),
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 1, usedSeats: 1 }) };
  if (scenario === 'stop') s.publications.delete(s.scope);
  if (scenario === 'republish') s.publications.set(s.scope, s.publication);
  if (scenario === 'delete') s.db.prepare("UPDATE workspace_projects SET resource_state='deleted' WHERE project_id='p'").run();
  let switched = scenario === 'switch'; let fails = scenario === 'retry';
  const sent: CollabCloudComment[] = [];
  const service = createCollabCloudService({
    client: { ...createVelaCliCollabClient({ run: async () => { throw new Error('unexpected CLI'); } }),
      pushComment: async (_team, _project, comment) => {
        if (fails) throw new Error('offline');
        sent.push(comment);
        if (inFlightChange && sent.length === 1) { entered.resolve(); await release.promise; }
        return { seq: 1 };
      } },
    commentOutbox: s.outbox, listProjectIds: () => [], retryDelayMs: () => 0,
    resolveCommentRelayWorkspaceContext: async () => switched ? { ...context, workspaceMemberId: 'other' } : context,
    listRemoteProjectRelayBindings: async () => [{ projectId: 'p', ownerMemberId: 'owner' }],
    validateCommentRelayProjectBinding: record => commentRelayLocalBindingMatches(record, getWorkspaceProjectByProjectId(s.db, record.projectId)),
    commentRelayScope: (projectId, filePath, ctx) => commentRelayScope({ projectId, filePath, context: ctx,
      binding: getWorkspaceProjectByProjectId(s.db, projectId), publications: s.publications }),
    resolveLocalConversationId: () => 'a-p', mergeComment: () => 'unchanged',
  });
  try {
    const draining = service.flushPendingComments();
    if (inFlightChange) {
      // Race against drain completion too: a regression that skips the first
      // push must fail here, rather than hang waiting for an unreachable signal.
      await Promise.race([entered.promise, draining]);
      expect(sent).toHaveLength(1);
      if (scenario === 'stop-inflight') s.publications.delete(s.scope);
      else if (scenario === 'republish-new-intents') {
        s.db.prepare("UPDATE preview_comments SET note='new publication content' WHERE id='a'").run();
        createPublicFilePublicationRecorder(s.db, s.publications, enqueuePublishedFileComments)(
          s.scope, s.publication, createShareFileMapping([{ sourcePath: s.scope.filePath, file: 'index.html' }]),
        );
      } else s.publications.set(s.scope, s.publication);
      release.resolve();
    }
    await draining;
    expect(sent).toHaveLength(scenario === 'normal' || inFlightChange ? 1 : 0);
    expect(s.outbox.count()).toBe(scenario === 'republish-new-intents' ? 2 : scenario === 'retry' || scenario === 'switch' ? 1 : 0);
    fails = false; switched = false;
    await service.flushPendingComments();
    if (scenario === 'republish-new-intents') {
      expect(sent.map(comment => comment.id)).toEqual(['a', 'a', 'b']);
      expect(sent[1]).toMatchObject({ note: 'new publication content', memberId: 'original', filePath: 'index.html' });
      expect(s.outbox.count()).toBe(0);
    } else if (['normal', 'retry', 'switch', 'stop-inflight', 'republish-inflight'].includes(scenario)) {
      expect(sent).toHaveLength(1); expect(sent[0]).toMatchObject({ id: 'a', memberId: 'original', filePath: 'index.html' });
      expect(s.outbox.count()).toBe(0);
    } else expect(sent).toEqual([]);
  } finally { release.resolve(); service.dispose(); }
});

it.each(['pending-edit', 'after-ack', 'restart', 'stopped', 'republished', 'other-principal', 'other-file'] as const)(
  'ordinary enqueue consumes only a current exact publication mapping: %s', scenario => {
    const s = setup(); s.add('a'); s.publish();
    const original = s.outbox.listDue(Date.now())[0]!;
    if (scenario !== 'pending-edit') s.outbox.acknowledge(original);
    if (scenario === 'stopped') s.publications.delete(s.scope);
    if (scenario === 'republished') s.publications.set(s.scope, s.publication);
    let queue = s.outbox;
    if (scenario === 'restart') { closeDatabase(); queue = createCommentRelayOutboxStore(openDatabase(root!)); }
    queue.enqueue({
      workspaceId: original.workspaceId,
      workspaceMemberId: scenario === 'other-principal' ? 'other' : original.workspaceMemberId,
      teamId: original.teamId, relayScope: original.relayScope, projectId: original.projectId,
      expectedOwnerMemberId: original.expectedOwnerMemberId,
      comment: { ...original.comment, note: 'new edit', filePath: scenario === 'other-file' ? 'unpublished.html' : original.comment.filePath },
    });
    const rows = queue.listDue(Date.now());
    expect(rows).toHaveLength(1);
    expect(rows[0]!.comment.note).toBe('new edit');
    expect(rows[0]!.publication).toEqual(['pending-edit', 'after-ack', 'restart'].includes(scenario) ? original.publication : undefined);
  },
);
it('rolls back mapping as well as publication/queue on failed transaction', () => {
  const s = setup(); s.add('a');
  s.db.exec("CREATE TRIGGER fail_mapping_backfill BEFORE INSERT ON comment_relay_outbox BEGIN SELECT RAISE(ABORT,'injected'); END");
  expect(s.publish).toThrow('injected');
  expect(s.db.prepare('SELECT COUNT(*) AS n FROM comment_relay_publication_mappings').get()).toEqual({ n: 0 });
});
it('records an empty published file mapping so later new comments need no republish', () => {
  const s = setup(); expect(s.publish()).toEqual({ enqueued: 0, skippedInbound: 0 });
  expect(s.outbox.count()).toBe(0);
  expect(s.db.prepare('SELECT file_path, public_file_path FROM comment_relay_publication_mappings').all())
    .toEqual([{ file_path: s.scope.filePath, public_file_path: 'index.html' }]);
  expect(readPublishedCommentBackfill(s.db, { projectId: 'p', workspaceId: 'w', workspaceMemberId: 'owner', filePath: s.scope.filePath }))
    .toMatchObject({ state: 'succeeded', retryable: false });
});
