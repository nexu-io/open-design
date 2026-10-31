import { afterEach, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildWorkspacePermissions, buildWorkspaceSeatSummary, type WorkspaceCollabContext, type CommentFileState, type CollabCloudComment } from '@open-design/contracts';
import { closeDatabase, insertProject, insertConversation, openDatabase, mergeSyncedPreviewComment, listPreviewComments, getProjectPreviewComment, updatePreviewCommentStatus, updateProject } from '../src/db.js';
import { createVelaCliCollabClient } from '../src/collab/vela-cli-collab-client.js';
import { createCollabCloudService } from '../src/collab/collab-cloud-service.js';
import { createSqlitePublicFilePublicationStore, migratePublicFilePublications } from '../src/collab/public-file-publication-store.js';
import { migrateCommentRelayPublicationMappings, recordCommentRelayPublicationMapping, sourcePathForCurrentPublication } from '../src/collab/comment-relay-publication-mapping.js';

import { normalizeCurrentFileComment } from '../src/collab/comment-file-facts.js';

let root: string | undefined;
afterEach(() => { closeDatabase(); if (root) rmSync(root, { recursive: true, force: true }); root = undefined; });

it.each(['team', 'personal'] as const)('replays unmodified Vela cb44e7597d HTTP capture through adapter, service and SQLite (%s)', async (workspaceType) => {
  const wire = readFileSync(new URL('./fixtures/vela-share-downstream-cb44e7597d.json', import.meta.url), 'utf8');
  expect(createHash('sha256').update(wire).digest('hex')).toBe('1306f34a75b57468976c4133259d7aabc5b6d00cefc9f371ce3ae52ab2b70710');
  const captured = JSON.parse(wire);
  // Database event seq/timestamps in provenance are NOT transport fields.
  expect(captured.comments.every((comment: Record<string, unknown>) => !('seq' in comment))).toBe(true);
  expect(captured.comments[0]).not.toHaveProperty('createdAt');
  expect(captured.comments[2]).not.toHaveProperty('authorKind');
  expect(captured.comments[3]).not.toHaveProperty('filePath');
  expect(captured.comments[3]).not.toHaveProperty('label');
  root = mkdtempSync(join(tmpdir(), 'od-real-vela-wire-'));
  const db = openDatabase(root, { dataDir: root });
  const projectId = 'share-management-project';
  insertProject(db, { id: projectId, name: 'Capture', createdAt: 1, updatedAt: 1 });
  insertConversation(db, { id: 'local', projectId, title: 'Local', createdAt: 1, updatedAt: 1 });
  const context: WorkspaceCollabContext = {
    workspaceId: 'fixture-space', workspaceType, workspaceMemberId: 'member-owner',
    role: 'owner', memberStatus: 'active', lifecycleState: 'active', billingState: 'active',
    planId: null, providerMode: 'platform_credits', teamId: 'fixture-space',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 5, usedSeats: 1 }),
    permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }),
  };
  const calls: string[][] = [];
  let wireReply = wire;
  const received: unknown[] = [];
  const errors: unknown[] = [];
  const client = createVelaCliCollabClient({ run: async (args, workspaceId) => {
    expect(workspaceId).toBe(context.workspaceId);
    calls.push(args); return wireReply;
  } });
  const createService = () => createCollabCloudService({
    client, listProjectIds: () => [], resolveLocalConversationId: () => 'local',
    resolveProjectWorkspaceContext: async () => context,
    listPersonalCommentRelayFilePaths: () => new Set(['index.html']),
    resolveStoredCommentLocation: (id, commentId) => {
      const stored = getProjectPreviewComment(db, id, commentId);
      return stored ? { found: true, filePath: stored.filePath } : { found: false };
    },
    mergeComment: ({ projectId: id, conversationId, comment }) => {
      received.push(comment);
      const result = mergeSyncedPreviewComment(db, id, conversationId, comment);
      if (received.length === 2) {
        expect(listPreviewComments(db, id, conversationId).find((row) => row.id === comment.id)?.label).toBe('Hero heading');
      }
      return result;
    },
    onError: (error) => errors.push(error),
  });
  let service = createService();
  try {
    expect(await service.pullProject(projectId, context)).toBe(true);
    expect(errors).toEqual([]);
    expect(received).toEqual(captured.comments);
    const rows = listPreviewComments(db, projectId, 'local');
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.id === captured.comments[0].id)).toMatchObject({
      label: 'heading', authorKind: 'user', authorAppUserId: 'share-fixture-viewer-app', authorMemberId: undefined,
    });
    // Legacy wire has no creation time: preserve the note without presenting receipt as creation.
    expect(rows.find((row) => row.id === captured.comments[0].id)).toMatchObject({ createdAt: 0, updatedAt: 0, sortKey: 0 });
    expect(rows.find((row) => row.id === 'capture-member')).toMatchObject({
      authorMemberId: 'member-owner', authorAppUserId: undefined, createdAt: captured.comments[2].createdAt,
    });
    expect(rows.some((row) => row.id === captured.comments[3].id)).toBe(false);
    // Replaying the same captured bytes is a local retry probe, not another live HTTP capture.
    expect(await service.pullProject(projectId, context)).toBe(true);
    expect(listPreviewComments(db, projectId, 'local')).toHaveLength(2);
    expect(calls.map((args) => args.slice(3))).toEqual([
      ['--since-seq', '0', '--author-kinds', 'member,user'],
      ['--since-seq', '4', '--author-kinds', 'member,user'],
    ]);
    // A daemon restart replays from zero. This separately constructed future wire
    // supplies authoritative creation times; the original capture stays unchanged.
    const visitorId = captured.comments[0].id;
    const originalCreatedAt = Date.parse('2026-10-14T20:17:46.576+08:00');
    updatePreviewCommentStatus(db, projectId, 'local', visitorId, 'resolved');
    service.dispose();
    wireReply = JSON.stringify({ ...captured, comments: captured.comments.map((comment: Record<string, unknown>) =>
      comment.deleted ? comment : { ...comment,
        createdAt: comment.createdAt ?? originalCreatedAt,
        updatedAt: comment.updatedAt ?? comment.createdAt ?? originalCreatedAt,
      }) });
    service = createService();
    expect(await service.pullProject(projectId, context)).toBe(true);
    expect(calls.at(-1)?.slice(3)).toEqual(['--since-seq', '0', '--author-kinds', 'member,user']);
    expect(getProjectPreviewComment(db, projectId, visitorId)).toMatchObject({
      createdAt: originalCreatedAt, sortKey: originalCreatedAt, status: 'resolved',
      note: captured.comments[0].note,
    });
  } finally { service.dispose(); }
});

it.each(['team', 'private-team', 'personal', 'stopped', 'lookup-error', 'lookup-missing', 'ambiguous'] as const)('uses current source identity without electing an alias from local history: %s', async scenario => {
  const wire = readFileSync(new URL('./fixtures/vela-share-downstream-e9e4564dc.json', import.meta.url), 'utf8');
  const captured = JSON.parse(wire);
  expect(captured.comments[0].publicationSlug).toBe('share-management-slug');
  expect(captured.comments[2]).not.toHaveProperty('publicationSlug');
  expect(captured.comments[3]).not.toHaveProperty('publicationSlug');
  root = mkdtempSync(join(tmpdir(), 'od-alias-wire-'));
  const db = openDatabase(root);
  const projectId = 'share-management-project';
  insertProject(db, { id: projectId, name: 'Capture', createdAt: 1, updatedAt: 1 });
  insertConversation(db, { id: 'local', projectId, title: 'Local', createdAt: 1, updatedAt: 1 });
  migratePublicFilePublications(db); migrateCommentRelayPublicationMappings(db);
  const publications = createSqlitePublicFilePublicationStore(db);
  const scope = { resourceTeamId: 'fixture-space', ownerMemberId: 'member-owner', projectId, filePath: 'pages/source.html' };
  const sourceFileId = randomUUID();
  const state: CommentFileState = { schemaVersion: 1, revision: 1, files: [{ sourceFileId,
    sourceFilePath: scope.filePath, entryPath: 'index.html', resourceId: 'source-root', versionId: 'v1', retired: false }] };
  updateProject(db, projectId, { metadata: { _commentFiles: state } });
  // Keep the historical capture unchanged. This separately constructed current
  // protocol row is a controlled fixture, not a backfill of that old traffic.
  const modern: CollabCloudComment = { id: 'modern-guest', projectId, conversationId: 'remote', seq: 5,
    filePath: 'index.html', sourceFileId, sourceFilePath: scope.filePath, elementId: 'heading', selector: 'h1',
    label: 'Heading', text: '', htmlHint: '', note: 'Current guest feedback', status: 'open',
    position: { x: 0, y: 0, width: 1, height: 1 }, createdAt: 1010, updatedAt: 1011,
    authorKind: 'user', authorAppUserId: 'share-fixture-viewer-app', memberId: '' };
  const currentWire = JSON.stringify({ ...captured, comments: [...captured.comments, modern], latestSeq: 5 });
  db.transaction(() => {
    publications.set(scope, { slug: 'share-management-slug', url: 'https://example.test/s/share-management-slug', fileName: scope.filePath });
    recordCommentRelayPublicationMapping(db, scope, { ...publications.getRevision(scope)!, publicFilePath: 'index.html' });
  })();
  if (scenario === 'stopped') publications.delete(scope);
  if (scenario === 'ambiguous') {
    const conflictingScope = { ...scope, filePath: 'pages/conflict.html' };
    db.transaction(() => {
      publications.set(conflictingScope, { slug: 'share-management-slug', url: 'https://example.test/s/share-management-slug', fileName: conflictingScope.filePath });
      recordCommentRelayPublicationMapping(db, conflictingScope, { ...publications.getRevision(conflictingScope)!, publicFilePath: 'index.html' });
    })();
  }
  const context: WorkspaceCollabContext = {
    workspaceId: 'fixture-space', workspaceType: scenario === 'team' || scenario === 'private-team' ? 'team' : 'personal', workspaceMemberId: 'member-owner',
    role: 'owner', memberStatus: 'active', lifecycleState: 'active', billingState: 'active',
    planId: null, providerMode: 'platform_credits', teamId: 'fixture-space',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 5, usedSeats: 1 }),
    permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }),
  };
  const calls: string[][] = [];
  let mappingLookups = 0;
  const service = createCollabCloudService({
    client: createVelaCliCollabClient({ run: async args => { calls.push(args); return currentWire; } }),
    listProjectIds: () => [], resolveLocalConversationId: () => 'local',
    resolveProjectWorkspaceContext: async () => context,
    isMemberSyncProjectShared: () => scenario === 'team',
    listPersonalCommentRelayFilePaths: () => new Set(scenario === 'team' ? [] : [scope.filePath]),
    ...(scenario === 'lookup-missing' ? {} : {
      resolvePublishedCommentSourcePath: ({ publicationSlug, publishedPath }: { publicationSlug: string; publishedPath: string }) => {
        mappingLookups += 1;
        if (scenario === 'lookup-error') throw new Error('mapping unavailable');
        return sourcePathForCurrentPublication(db, { ...scope, slug: publicationSlug, publishedPath });
      },
    }),
    resolveStoredCommentLocation: (id, commentId) => {
      const stored = getProjectPreviewComment(db, id, commentId);
      return stored ? { found: true, filePath: stored.filePath } : { found: false };
    },
    mergeComment: ({ projectId: id, conversationId, comment }) => {
      const current = normalizeCurrentFileComment(state, comment);
      return current ? mergeSyncedPreviewComment(db, id, conversationId, current) : 'unchanged';
    },
  });
  try {
    // These are local alias-cache conditions, not changes to the authenticated
    // server's authorization verdict for this current source lifetime.
    expect(await service.pullProject(projectId, context)).toBe(true);
    const rows = listPreviewComments(db, projectId, 'local');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: modern.id, sourceFileId, filePath: scope.filePath,
      authorKind: 'user', authorAppUserId: modern.authorAppUserId, createdAt: modern.createdAt });
    expect(rows.some(row => captured.comments.some((old: { id: string }) => old.id === row.id))).toBe(false);
    expect(mappingLookups).toBe(0);
    await service.pullProject(projectId, context);
    expect(calls[1]?.slice(3, 5)).toEqual(['--since-seq', '5']);
  } finally { service.dispose(); }
});

// Fault/authorization cases below are controlled local scenarios, not new Vela captures.
it.each(['allowed', 'unpublished', 'foreign-project', 'absent', 'lookup-throws', 'lookup-unavailable', 'unknown-path', 'stopped', 'principal-changed', 'forged-file'] as const)(
  'personal tombstone preserves storage and next cursor/etag contract: %s', async (scenario) => {
    const wire = readFileSync(new URL('./fixtures/vela-share-downstream-cb44e7597d.json', import.meta.url), 'utf8');
    const adapter = createVelaCliCollabClient({ run: async () => wire });
    const decoded = await adapter.pullComments('fixture-space', 'share-management-project', 0);
    const target = decoded.comments[1]!;
    const tombstone = decoded.comments[3]!;
    root = mkdtempSync(join(tmpdir(), 'od-tombstone-scope-'));
    const db = openDatabase(root);
    for (const id of ['share-management-project', 'foreign']) {
      insertProject(db, { id, name: id, createdAt: 1, updatedAt: 1 });
      insertConversation(db, { id: `local-${id}`, projectId: id, title: 'Local', createdAt: 1, updatedAt: 1 });
    }
    const projectId = 'share-management-project';
    const storedProjectId = scenario === 'foreign-project' ? 'foreign' : projectId;
    if (scenario !== 'absent') mergeSyncedPreviewComment(db, storedProjectId, `local-${storedProjectId}`, {
      ...target, filePath: scenario === 'unpublished' || scenario === 'forged-file' ? 'private.html' : target.filePath,
    });
    const storedBefore = getProjectPreviewComment(db, storedProjectId, target.id);
    const context: WorkspaceCollabContext = {
      workspaceId: 'fixture-space', workspaceType: 'personal', workspaceMemberId: 'member-owner',
      role: 'owner', memberStatus: 'active', lifecycleState: 'active', billingState: 'active',
      planId: null, providerMode: 'platform_credits', teamId: 'fixture-space',
      seatSummary: buildWorkspaceSeatSummary({ seatLimit: 5, usedSeats: 1 }),
      permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }),
    };
    let freshContext = context;
    let active = true;
    const requests: Array<{ sinceSeq: number; etag: string | null | undefined }> = [];
    const errors: unknown[] = [];
    const blocked = ['lookup-throws', 'lookup-unavailable', 'unknown-path', 'stopped', 'principal-changed'].includes(scenario);
    const service = createCollabCloudService({
      client: { ...adapter, pullComments: async (_team: string, _project: string, sinceSeq: number, etag?: string | null) => {
        requests.push({ sinceSeq, etag });
        if (requests.length === 2) {
          if (scenario === 'stopped') active = false;
          if (scenario === 'principal-changed') freshContext = { ...context, workspaceMemberId: 'other-member' };
        }
        const initial = requests.length === 1;
        return { comments: initial ? [] : [scenario === 'forged-file' ? { ...tombstone, filePath: 'index.html' } : tombstone],
          latestSeq: initial ? 1 : 4, etag: initial ? 'etag-1' : 'etag-4', notModified: false };
      } },
      listProjectIds: () => [], resolveLocalConversationId: () => `local-${projectId}`,
      resolveProjectWorkspaceContext: async () => freshContext,
      listPersonalCommentRelayFilePaths: () => new Set(active ? ['index.html'] : []),
      ...(scenario === 'lookup-unavailable' ? {} : { resolveStoredCommentLocation: (id: string, commentId: string) => {
        if (scenario === 'lookup-throws') throw new Error('injected database lookup failure');
        const stored = getProjectPreviewComment(db, id, commentId);
        return stored ? { found: true as const, filePath: scenario === 'unknown-path' ? null : stored.filePath }
          : { found: false as const };
      } }),
      mergeComment: ({ projectId: id, conversationId, comment }) => mergeSyncedPreviewComment(db, id, conversationId, comment),
      onError: (error) => errors.push(error),
    });
    try {
      expect(await service.pullProject(projectId, context)).toBe(true);
      expect(await service.pullProject(projectId, context)).toBe(!blocked);
      expect(getProjectPreviewComment(db, storedProjectId, target.id)).toEqual(scenario === 'allowed' ? null : storedBefore);
      // Restore only simulated authority changes, not stored state or service cursors.
      active = true; freshContext = context;
      await service.pullProject(projectId, context);
      expect(requests).toEqual([
        { sinceSeq: 0, etag: undefined }, { sinceSeq: 1, etag: 'etag-1' },
        { sinceSeq: blocked ? 1 : 4, etag: blocked ? 'etag-1' : 'etag-4' },
      ]);
      const eventuallyDeleted = scenario === 'allowed' || scenario === 'stopped' || scenario === 'principal-changed';
      expect(getProjectPreviewComment(db, storedProjectId, target.id)).toEqual(eventuallyDeleted ? null : storedBefore);
      expect(errors).toHaveLength(['lookup-throws', 'lookup-unavailable', 'unknown-path'].includes(scenario) ? 2 : 0);
    } finally { service.dispose(); }
  },
);
