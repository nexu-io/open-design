import { afterEach, expect, it } from 'vitest';
import { buildWorkspacePermissions, buildWorkspaceSeatSummary, type WorkspaceCollabContext } from '@open-design/contracts';
import { CollabCloudError, type CollabCloudClient } from '../src/integrations/collab-cloud.js';
import { createCollabCloudService } from '../src/collab/collab-cloud-service.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeDatabase, openDatabase } from '../src/db.js';
import { createSqlitePublicFilePublicationStore, migratePublicFilePublications } from '../src/collab/public-file-publication-store.js';
import { createCommentRelayOutboxStore } from '../src/collab/comment-relay-outbox.js';
import {
  markPublishedCommentBackfillOutcome,
  readPublishedCommentBackfill,
  recordPublishedCommentBackfill,
} from '../src/collab/published-comment-backfill-state.js';

let root: string | undefined;
afterEach(() => { closeDatabase(); if (root) rmSync(root, { recursive: true, force: true }); root = undefined; });

function setup() {
  root = mkdtempSync(join(tmpdir(), 'od-published-comment-backfill-state-'));
  const db = openDatabase(root);
  migratePublicFilePublications(db);
  const scope = { resourceTeamId: 'workspace-a', ownerMemberId: 'member-a', projectId: 'project-a', filePath: 'a.html' };
  const publications = createSqlitePublicFilePublicationStore(db, () => 1);
  publications.set(scope, { slug: 'share-a', url: 'https://example.test/a', fileName: 'a.html' });
  const revision = publications.getRevision(scope)!;
  const subject = { projectId: scope.projectId, workspaceId: scope.resourceTeamId, workspaceMemberId: scope.ownerMemberId, filePath: scope.filePath };
  return { db, scope, publications, revision, subject };
}

it.each(['delivered', 'stopped'] as const)('uses actual relay receipt %s, never dequeuing alone', async outcome => {
  const { db, scope, revision, subject } = setup();
  const outbox = createCommentRelayOutboxStore(db, () => 1);
  db.transaction(() => recordPublishedCommentBackfill(db, { scope, publicationRevision: revision, commentIds: ['a'] }))();
  outbox.enqueue({ workspaceId: scope.resourceTeamId, workspaceMemberId: scope.ownerMemberId, teamId: scope.resourceTeamId, relayScope: 'team', projectId: scope.projectId, expectedOwnerMemberId: scope.ownerMemberId,
    comment: { id: 'a', filePath: scope.filePath } as never, publication: { ...revision, publicFilePath: 'index.html' } });
  const context: WorkspaceCollabContext = { workspaceId: scope.resourceTeamId, workspaceMemberId: scope.ownerMemberId, teamId: scope.resourceTeamId, workspaceType: 'team', role: 'owner', memberStatus: 'active', lifecycleState: 'active', billingState: 'active', providerMode: 'platform_credits', planId: null,
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 1, usedSeats: 1 }), permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }) };
  let offline = true; let pushes = 0;
  const service = createCollabCloudService({ commentOutbox: outbox,
    client: { pushComment: async () => { pushes++; if (offline) throw new Error('transport secret omitted'); if (outcome === 'stopped') throw new CollabCloudError(410, 'SHARE_STOPPED'); return { seq: 1 }; } } as unknown as CollabCloudClient,
    resolveLocalProjectRelayBinding: () => ({ workspaceId: scope.resourceTeamId, ownerMemberId: scope.ownerMemberId }),
    resolveProjectWorkspaceContext: async () => context, resolveRemoteProjectOwnerMemberId: async () => scope.ownerMemberId,
    listProjectIds: () => [], resolveLocalConversationId: () => 'local', mergeComment: () => 'unchanged', now: () => 1, retryDelayMs: () => 0 });
  try {
    await service.flushPendingComments();
    expect(readPublishedCommentBackfill(db, subject)).toMatchObject({ state: 'failed', retryable: true });
    expect(outbox.count()).toBe(1);
    offline = false; await service.flushPendingComments();
    expect(pushes).toBe(2); expect(outbox.count()).toBe(0);
    expect(readPublishedCommentBackfill(db, subject)).toMatchObject({ state: outcome === 'delivered' ? 'succeeded' : 'failed', retryable: false });
  } finally { service.dispose(); }
});

it('fences older in-flight ACK/defer from a newer publication and isolates subjects', () => {
  const { db, scope, publications, revision, subject } = setup();
  const outbox = createCommentRelayOutboxStore(db, () => 1);
  const enqueue = (publication: typeof revision) => outbox.enqueue({ workspaceId: scope.resourceTeamId, workspaceMemberId: scope.ownerMemberId, teamId: scope.resourceTeamId, relayScope: 'team', projectId: scope.projectId, expectedOwnerMemberId: scope.ownerMemberId, comment: { id: 'a', filePath: scope.filePath } as never, publication: { ...publication, publicFilePath: 'index.html' } });
  db.transaction(() => recordPublishedCommentBackfill(db, { scope, publicationRevision: revision, commentIds: ['a'] }))();
  enqueue(revision); const old = outbox.listDue(1)[0]!;
  publications.set(scope, { slug: revision.slug, url: 'https://example.test/a', fileName: scope.filePath });
  const current = publications.getRevision(scope)!;
  db.transaction(() => recordPublishedCommentBackfill(db, { scope, publicationRevision: current, commentIds: ['a'] }))();
  enqueue(current);
  expect(outbox.acknowledge(old, 'delivered')).toBe(false);
  expect(outbox.defer(old, { nextAttemptAt: 9, error: 'stale failure' })).toBe(false);
  expect(readPublishedCommentBackfill(db, subject)).toMatchObject({ state: 'pending', publicationRevision: current.token });
  expect(readPublishedCommentBackfill(db, { ...subject, workspaceMemberId: 'other' })).toBeUndefined();
  expect(readPublishedCommentBackfill(db, { ...subject, workspaceId: 'other' })).toBeUndefined();
  expect(readPublishedCommentBackfill(db, { ...subject, filePath: 'other.html' })).toBeUndefined();
  expect(outbox.acknowledge(outbox.listDue(1)[0]!, 'delivered')).toBe(true);
  expect(readPublishedCommentBackfill(db, subject)?.state).toBe('succeeded');
});

it('persists the exact initial batch and exposes empty and pending current states only', () => {
  const { db, scope, revision, subject } = setup();
  db.transaction(() => recordPublishedCommentBackfill(db, { scope, publicationRevision: revision, commentIds: [] }))();
  expect(readPublishedCommentBackfill(db, subject)).toEqual({ state: 'succeeded', filePath: 'a.html', publicationRevision: revision.token, retryable: false });
  expect(readPublishedCommentBackfill(db, { projectId: subject.projectId, workspaceId: subject.workspaceId, workspaceMemberId: subject.workspaceMemberId })).toBeUndefined();

  const next = { ...scope, filePath: 'b.html' };
  const publications = createSqlitePublicFilePublicationStore(db);
  publications.set(next, { slug: 'share-b', url: 'https://example.test/b', fileName: 'b.html' });
  const nextRevision = publications.getRevision(next)!;
  db.transaction(() => recordPublishedCommentBackfill(db, { scope: next, publicationRevision: nextRevision, commentIds: ['initial'] }))();
  expect(readPublishedCommentBackfill(db, { ...subject, filePath: 'b.html' })).toEqual({ state: 'pending', filePath: 'b.html', publicationRevision: nextRevision.token, retryable: false });
});

it('requires delivered receipts for every initial member and keeps failures file and revision scoped', () => {
  const { db, scope, publications, revision, subject } = setup();
  db.transaction(() => recordPublishedCommentBackfill(db, { scope, publicationRevision: revision, commentIds: ['a', 'b'] }))();
  const record = (commentId: string) => ({ workspaceId: scope.resourceTeamId, workspaceMemberId: scope.ownerMemberId, projectId: scope.projectId, commentId, comment: { filePath: scope.filePath }, publication: { slug: revision.slug, token: revision.token, publicFilePath: 'index.html' } });
  markPublishedCommentBackfillOutcome(db, record('a'), 'delivered');
  markPublishedCommentBackfillOutcome(db, record('late'), 'delivered');
  expect(readPublishedCommentBackfill(db, subject)?.state).toBe('pending');
  markPublishedCommentBackfillOutcome(db, record('b'), 'deferred');
  expect(readPublishedCommentBackfill(db, subject)).toEqual({ state: 'failed', filePath: 'a.html', publicationRevision: revision.token, retryable: true, code: 'BACKFILL_DELIVERY_DEFERRED' });
  markPublishedCommentBackfillOutcome(db, record('b'), 'delivered');
  expect(readPublishedCommentBackfill(db, subject)?.state).toBe('succeeded');
  // Once this publication's initial value arrived, a later ordinary edit
  // failing transport is K8, not a retroactive failure of that backfill.
  markPublishedCommentBackfillOutcome(db, record('a'), 'deferred');
  expect(readPublishedCommentBackfill(db, subject)?.state).toBe('succeeded');
  db.transaction(() => recordPublishedCommentBackfill(db, { scope, publicationRevision: revision, commentIds: ['a', 'b', 'late'] }))();
  expect(readPublishedCommentBackfill(db, subject)?.state).toBe('succeeded');

  publications.set(scope, { slug: 'share-a', url: 'https://example.test/a', fileName: 'a.html' });
  expect(readPublishedCommentBackfill(db, subject)).toBeUndefined();
  markPublishedCommentBackfillOutcome(db, record('a'), 'discarded');
  expect(readPublishedCommentBackfill(db, subject)).toBeUndefined();
});

it('marks queue removal as a safe discard by default, but succeeds only with explicit delivered receipts after reopen', () => {
  const { db, scope, revision, subject } = setup();
  db.transaction(() => recordPublishedCommentBackfill(db, { scope, publicationRevision: revision, commentIds: ['a', 'b'] }))();
  const outbox = createCommentRelayOutboxStore(db, () => 1);
  const enqueue = (id: string) => outbox.enqueue({
    workspaceId: scope.resourceTeamId, workspaceMemberId: scope.ownerMemberId, teamId: scope.resourceTeamId,
    relayScope: 'personal', projectId: scope.projectId, expectedOwnerMemberId: scope.ownerMemberId,
    comment: { id, filePath: scope.filePath } as never,
    publication: { slug: revision.slug, token: revision.token, publicFilePath: 'index.html' },
  });
  enqueue('a');
  expect(outbox.acknowledge(outbox.listDue(1)[0]!)).toBe(true);
  expect(readPublishedCommentBackfill(db, subject)).toEqual({ state: 'failed', filePath: 'a.html', publicationRevision: revision.token, retryable: false, code: 'BACKFILL_DELIVERY_DISCARDED' });

  enqueue('b');
  expect(outbox.defer(outbox.listDue(1)[0]!, { nextAttemptAt: 1, error: 'credential=secret' })).toBe(true);
  expect(readPublishedCommentBackfill(db, subject)).toMatchObject({ retryable: false, code: 'BACKFILL_DELIVERY_DISCARDED' });
  enqueue('a');
  enqueue('b');
  for (const row of outbox.listDue(1)) expect(outbox.acknowledge(row, 'delivered')).toBe(true);
  closeDatabase();
  const reopened = openDatabase(root!);
  expect(readPublishedCommentBackfill(reopened, subject)).toEqual({ state: 'succeeded', filePath: 'a.html', publicationRevision: revision.token, retryable: false });
});
