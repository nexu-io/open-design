import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { buildWorkspacePermissions, buildWorkspaceSeatSummary, type PreviewComment, type WorkspaceCollabContext } from '@open-design/contracts';
import { createCollabCloudService } from '../src/collab/collab-cloud-service.js';
import { commentRelayScope } from '../src/collab/comment-relay-scope.js';
import { commentRelayLocalBindingMatches, commentRelayRecordPromotedToTeam, createCommentRelayOutboxStore, migrateCommentRelayOutbox, type CommentRelayLocalProjectBinding } from '../src/collab/comment-relay-outbox.js';
import { createSqlitePublicFilePublicationStore, migratePublicFilePublications } from '../src/collab/public-file-publication-store.js';
import { recordCommentRelayPublicationMapping } from '../src/collab/comment-relay-publication-mapping.js';
import { createPublicFileMutations } from '../src/collab/public-file-mutations.js';
import type { CollabCloudClient } from '../src/integrations/collab-cloud.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
function fixture() {
  const db = new Database(':memory:');
  migratePublicFilePublications(db); migrateCommentRelayOutbox(db);
  const publications = createSqlitePublicFilePublicationStore(db);
  const scope = { resourceTeamId: 'w', ownerMemberId: 'owner', projectId: 'p', filePath: 'nested/public.html' };
  publications.set(scope, { slug: 'public', url: null, fileName: 'public.html' });
  const publication = { ...publications.getRevision(scope)!, publicFilePath: 'public.html' };
  db.transaction(() => recordCommentRelayPublicationMapping(db, scope, publication))();
  let binding: CommentRelayLocalProjectBinding = { workspaceId: 'w', visibility: 'team', resourceState: 'active', createdByWorkspaceMemberId: 'owner' };
  let context: WorkspaceCollabContext = {
    workspaceId: 'w', teamId: 'w', workspaceMemberId: 'owner', workspaceType: 'team', role: 'owner',
    memberStatus: 'active', lifecycleState: 'active', billingState: 'active', planId: null, providerMode: 'platform_credits',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 3, usedSeats: 2 }),
    permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }),
  };
  let time = 100;
  const transitions = createPublicFileMutations();
  const outbox = createCommentRelayOutboxStore(db, () => time);
  const push = vi.fn<CollabCloudClient['pushComment']>().mockResolvedValue({ seq: 1 });
  const resolveAuthority = vi.fn(async () => context);
  const resolveCatalog = vi.fn(async () => [{ projectId: 'p', ownerMemberId: 'owner' }]);
  const service = createCollabCloudService({
    client: { pushComment: push } as unknown as CollabCloudClient, commentOutbox: outbox,
    listProjectIds: () => [], resolveLocalConversationId: () => 'c', mergeComment: () => 'unchanged',
    resolveLocalProjectRelayBinding: () => ({ workspaceId: binding.workspaceId!, ownerMemberId: binding.createdByWorkspaceMemberId! }),
    validateCommentRelayProjectBinding: record => commentRelayLocalBindingMatches(record, binding),
    isCommentRelayRecordPromotedToTeam: record => commentRelayRecordPromotedToTeam(record, binding),
    captureCommentRelayProjectBinding: transitions.captureReconciliation,
    commentRelayScope: (projectId, filePath, current) => commentRelayScope({ binding, context: current, projectId, filePath, publications }),
    resolveCommentRelayWorkspaceContext: resolveAuthority,
    listRemoteProjectRelayBindings: resolveCatalog,
    now: () => time, retryDelayMs: () => 10,
  });
  const comment: PreviewComment = { id: 'comment', projectId: 'p', conversationId: 'c', filePath: scope.filePath,
    elementId: 'hero', selector: '#hero', label: 'Hero', text: 'Hero', position: { x: 1, y: 2, width: 3, height: 4 },
    htmlHint: '<h1>', note: 'edited', status: 'open', createdAt: 1, updatedAt: 2, authorMemberId: 'owner' };
  return { db, publications, scope, publication, outbox, push, service, transitions, resolveAuthority, resolveCatalog, comment,
    get binding() { return binding; }, set binding(value) { binding = value; },
    get context() { return context; }, set context(value) { context = value; },
    advance: () => { time += 10; },
    demote: () => transitions.withMoves(['p'], async () => { binding = { ...binding, visibility: 'personal' }; }),
    close: () => { service.dispose(); db.close(); },
  };
}

describe('OPEND-3855 pending creator mutations across explicit demotion', () => {
  it.each(['delete', 'edit', 'add'] as const)('delivers the deferred %s with original event identity and exact publication path', async mutation => {
    const f = fixture();
    try {
      if (mutation === 'delete') f.service.enqueueCommentDeletion(f.comment, f.context);
      else f.service.enqueueComment({ ...f.comment, note: mutation === 'add' ? 'new annotation' : 'edited annotation' }, f.context);
      const original = f.outbox.listDue(100)[0]!;
      f.push.mockRejectedValueOnce(new Error('deterministic transient relay failure'));
      await f.service.flushPendingComments();
      expect(f.outbox.count()).toBe(1);
      await f.demote(); f.advance();
      await f.service.flushPendingComments();
      expect(f.push).toHaveBeenCalledTimes(2);
      const delivered = f.push.mock.calls[1]!;
      expect(delivered[0]).toBe('w');
      expect(delivered[2]).toMatchObject({ id: original.comment.id, filePath: 'public.html', publicationSlug: 'public', ...(mutation === 'delete' ? { deleted: true } : { note: mutation === 'add' ? 'new annotation' : 'edited annotation' }) });
      expect(delivered[3]).toBe(mutation === 'delete' ? createHash('sha256').update(`compact-delete-v1:${original.eventKey}`).digest('hex') : original.eventKey);
      expect(f.outbox.count()).toBe(0);
      expect(f.publications.getRevision(f.scope)).toEqual({ slug: f.publication.slug, token: f.publication.token });
    } finally { f.close(); }
  });
});

it.each(['unpublished', 'stopped', 'other-file', 'deleted-project', 'rehome', 'owner-changed', 'foreign-member', 'mapping-missing', 'mapping-stale'] as const)(
  'cancels demoted records outside current creator/exact publication authority: %s', async scenario => {
    const f = fixture();
    try {
      if (scenario === 'foreign-member') f.context = { ...f.context, workspaceMemberId: 'peer' };
      f.service.enqueueCommentDeletion({ ...f.comment, ...(scenario === 'other-file' ? { filePath: 'private.html' } : {}) }, f.context);
      expect(f.outbox.count()).toBe(1);
      await f.demote();
      if (scenario === 'unpublished' || scenario === 'stopped') f.publications.delete(f.scope);
      if (scenario === 'deleted-project') f.binding = { ...f.binding, resourceState: 'deleted' };
      if (scenario === 'rehome') f.binding = { ...f.binding, workspaceId: 'other' };
      if (scenario === 'owner-changed') f.binding = { ...f.binding, createdByWorkspaceMemberId: 'other-owner' };
      if (scenario === 'mapping-missing') f.db.prepare('DELETE FROM comment_relay_publication_mappings').run();
      if (scenario === 'mapping-stale') f.publications.set(f.scope, { slug: 'replacement', url: null, fileName: 'public.html' });
      await f.service.flushPendingComments();
      expect(f.push).not.toHaveBeenCalled();
      expect(f.outbox.count()).toBe(0);
    } finally { f.close(); }
  },
);

it.each(['success', 'remote-ack-failure'] as const)('retains a pending deletion during staged demotion, then follows %s', async outcome => {
  const f = fixture();
  try {
    f.service.enqueueCommentDeletion(f.comment, f.context);
    const original = f.outbox.listDue(100)[0]!;
    const staged = deferred<void>(); const remote = deferred<void>();
    const moving = f.transitions.withMoves(['p'], async () => {
      f.binding = { ...f.binding, visibility: 'personal' };
      staged.resolve(); await remote.promise;
      if (outcome === 'remote-ack-failure') {
        f.binding = { ...f.binding, visibility: 'team' };
        throw new Error('deterministic remote ACK failure');
      }
    });
    const completion = moving.catch(error => error);
    await staged.promise;
    await f.service.flushPendingComments();
    expect(f.push).not.toHaveBeenCalled(); expect(f.outbox.count()).toBe(1);
    remote.resolve(); await completion; f.advance();
    expect(f.outbox.listDue(110)[0]!.eventKey).toBe(original.eventKey);
    await f.service.flushPendingComments();
    expect(f.push).toHaveBeenCalledTimes(1); expect(f.outbox.count()).toBe(0);
    expect(f.push.mock.calls[0]![2].deleted).toBe(true);
  } finally { f.close(); }
});

it.each(['demote', 'rollback'] as const)('does not discard or send stale normalization when a move %s crosses fresh authority resolution', async outcome => {
  const f = fixture();
  try {
    f.service.enqueueCommentDeletion(f.comment, f.context);
    const authority = deferred<WorkspaceCollabContext>(); const entered = deferred<void>();
    f.resolveAuthority.mockImplementationOnce(() => { entered.resolve(); return authority.promise; });
    const draining = f.service.flushPendingComments(); await entered.promise;
    await f.transitions.withMoves(['p'], async () => {
      f.binding = { ...f.binding, visibility: 'personal' };
      if (outcome === 'rollback') f.binding = { ...f.binding, visibility: 'team' };
    });
    authority.resolve(f.context); await draining;
    expect(f.push).not.toHaveBeenCalled(); expect(f.outbox.count()).toBe(1);
    f.advance(); await f.service.flushPendingComments();
    expect(f.push).toHaveBeenCalledTimes(1); expect(f.outbox.count()).toBe(0);
  } finally { f.close(); }
});

it('lane/revision rescope preserves the tombstone and rejects an old ACK, defer or rescope', async () => {
  const f = fixture();
  try {
    f.service.enqueueCommentDeletion(f.comment, f.context);
    const team = f.outbox.listDue(100)[0]!;
    await f.demote();
    expect(f.outbox.rescopeToPersonal!(team)).toBe(true);
    const personal = f.outbox.listDue(100)[0]!;
    expect(personal).toMatchObject({ relayScope: 'personal', revision: team.revision + 1, comment: team.comment, eventKey: team.eventKey, publication: f.publication });
    expect(f.outbox.acknowledge(team, 'delivered')).toBe(false);
    expect(f.outbox.defer(team, { nextAttemptAt: 999, error: 'old' })).toBe(false);
    expect(f.outbox.rescopeToPersonal!(team)).toBe(false);
    expect(f.outbox.isCurrent!(team)).toBe(false);
    expect(f.outbox.acknowledge(personal, 'delivered')).toBe(true);
  } finally { f.close(); }
});

it('an in-flight personal delivery ACK cannot delete a newer mutation in the same lane', async () => {
  const f = fixture();
  try {
    f.service.enqueueComment(f.comment, f.context); await f.demote();
    const receipt = deferred<{ seq: number }>(); const entered = deferred<void>();
    f.push.mockImplementationOnce(() => { entered.resolve(); return receipt.promise; });
    const draining = f.service.flushPendingComments(); await entered.promise;
    const personal = f.outbox.listDue(100)[0]!;
    f.service.enqueueCommentDeletion(f.comment, f.context);
    const newer = f.outbox.listDue(100)[0]!;
    expect(newer.revision).toBeGreaterThan(personal.revision);
    expect(newer.eventKey).not.toBe(personal.eventKey);
    receipt.resolve({ seq: 1 }); await draining;
    expect(f.outbox.listDue(100)[0]).toEqual(newer);
    await f.service.flushPendingComments();
    expect(f.push).toHaveBeenCalledTimes(2); expect(f.outbox.count()).toBe(0);
  } finally { f.close(); }
});

it('a later record in an awaited project lane cannot push after stop or owner change', async () => {
  const f = fixture();
  try {
    f.service.enqueueComment(f.comment, f.context);
    f.service.enqueueCommentDeletion({ ...f.comment, id: 'second' }, f.context);
    await f.demote();
    const receipt = deferred<{ seq: number }>(); const entered = deferred<void>();
    f.push.mockImplementationOnce(() => { entered.resolve(); return receipt.promise; });
    const draining = f.service.flushPendingComments(); await entered.promise;
    f.binding = { ...f.binding, createdByWorkspaceMemberId: 'replacement-owner' };
    receipt.resolve({ seq: 1 }); await draining;
    expect(f.push).toHaveBeenCalledTimes(1); expect(f.outbox.count()).toBe(1);
    f.advance(); await f.service.flushPendingComments();
    expect(f.push).toHaveBeenCalledTimes(1); expect(f.outbox.count()).toBe(0);
  } finally { f.close(); }
});

it('the existing creator personal-to-team upgrade still delivers its pending deletion', async () => {
  const f = fixture();
  try {
    await f.demote(); f.service.enqueueCommentDeletion(f.comment, f.context);
    const original = f.outbox.listDue(100)[0]!;
    await f.transitions.withMoves(['p'], async () => { f.binding = { ...f.binding, visibility: 'team' }; });
    await f.service.flushPendingComments();
    expect(f.push).toHaveBeenCalledTimes(1); expect(f.outbox.count()).toBe(0);
    expect(f.push.mock.calls[0]![3]).toBe(createHash('sha256').update(`compact-delete-v1:${original.eventKey}`).digest('hex'));
  } finally { f.close(); }
});

it.each(['member', 'workspace'] as const)('does not rescope using a changed fresh authenticated %s', async changed => {
  const f = fixture();
  try {
    f.service.enqueueCommentDeletion(f.comment, f.context);
    await f.demote();
    const original = f.outbox.listDue(100)[0]!;
    const valid = f.context;
    f.context = changed === 'member' ? { ...valid, workspaceMemberId: 'peer' } : { ...valid, workspaceId: 'other' };
    await f.service.flushPendingComments();
    expect(f.push).not.toHaveBeenCalled(); expect(f.outbox.count()).toBe(1);
    f.advance();
    expect(f.outbox.listDue(110)[0]).toMatchObject({ relayScope: 'team', revision: original.revision, eventKey: original.eventKey });
    f.context = valid;
    await f.service.flushPendingComments();
    expect(f.push).toHaveBeenCalledTimes(1); expect(f.outbox.count()).toBe(0);
  } finally { f.close(); }
});

it('a newer team deletion queued while fresh authority is pending owns the rescope lane', async () => {
  const f = fixture();
  try {
    f.service.enqueueComment(f.comment, f.context);
    const authority = deferred<WorkspaceCollabContext>(); const entered = deferred<void>();
    await f.demote();
    f.resolveAuthority.mockImplementationOnce(() => { entered.resolve(); return authority.promise; });
    const draining = f.service.flushPendingComments(); await entered.promise;
    // A mutation admitted earlier in the team lane lands after the drain snapshot.
    const old = f.outbox.listDue(100)[0]!;
    f.outbox.enqueue({ workspaceId: old.workspaceId, workspaceMemberId: old.workspaceMemberId,
      teamId: old.teamId, relayScope: 'team', projectId: old.projectId,
      expectedOwnerMemberId: old.expectedOwnerMemberId, comment: { ...old.comment, deleted: true } });
    const newer = f.outbox.listDue(100)[0]!;
    authority.resolve(f.context); await draining;
    expect(f.push).not.toHaveBeenCalled(); expect(f.outbox.listDue(100)[0]).toEqual(newer);
    await f.service.flushPendingComments();
    expect(f.push).toHaveBeenCalledTimes(1); expect(f.push.mock.calls[0]![2].deleted).toBe(true);
    expect(f.outbox.count()).toBe(0);
  } finally { f.close(); }
});

it.each(['stop', 'workspace', 'owner'] as const)('rechecks %s before a later personal-lane push', async change => {
  const f = fixture();
  try {
    f.service.enqueueComment(f.comment, f.context);
    f.service.enqueueCommentDeletion({ ...f.comment, id: 'second' }, f.context);
    await f.demote();
    const receipt = deferred<{ seq: number }>(); const entered = deferred<void>();
    f.push.mockImplementationOnce(() => { entered.resolve(); return receipt.promise; });
    const draining = f.service.flushPendingComments(); await entered.promise;
    if (change === 'stop') f.publications.delete(f.scope);
    if (change === 'workspace') f.binding = { ...f.binding, workspaceId: 'replacement-workspace' };
    if (change === 'owner') f.binding = { ...f.binding, createdByWorkspaceMemberId: 'replacement-owner' };
    receipt.resolve({ seq: 1 }); await draining;
    expect(f.push).toHaveBeenCalledTimes(1);
    f.advance(); await f.service.flushPendingComments();
    expect(f.push).toHaveBeenCalledTimes(1); expect(f.outbox.count()).toBe(0);
  } finally { f.close(); }
});

it('a catalog response completing across a failed move cannot discard the staged team revision', async () => {
  const f = fixture();
  try {
    // No active public file: rollback must still keep the original Team relay.
    f.publications.delete(f.scope);
    f.service.enqueueCommentDeletion(f.comment, f.context);
    const catalog = deferred<Array<{ projectId: string; ownerMemberId: string }>>();
    const entered = deferred<void>();
    f.resolveCatalog.mockImplementationOnce(() => { entered.resolve(); return catalog.promise; });
    const draining = f.service.flushPendingComments(); await entered.promise;
    await f.transitions.withMoves(['p'], async () => {
      f.binding = { ...f.binding, visibility: 'personal' };
      f.binding = { ...f.binding, visibility: 'team' };
    });
    catalog.resolve([]); await draining;
    expect(f.push).not.toHaveBeenCalled(); expect(f.outbox.count()).toBe(1);
    f.advance(); await f.service.flushPendingComments();
    expect(f.push).toHaveBeenCalledTimes(1); expect(f.outbox.count()).toBe(0);
  } finally { f.close(); }
});
