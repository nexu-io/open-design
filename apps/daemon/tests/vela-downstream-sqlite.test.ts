import { afterEach, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildWorkspacePermissions, buildWorkspaceSeatSummary, type WorkspaceCollabContext } from '@open-design/contracts';
import { closeDatabase, insertProject, insertConversation, openDatabase, mergeSyncedPreviewComment, listPreviewComments, getProjectPreviewComment } from '../src/db.js';
import { createVelaCliCollabClient } from '../src/collab/vela-cli-collab-client.js';
import { createCollabCloudService } from '../src/collab/collab-cloud-service.js';
import { createSqlitePublicFilePublicationStore, migratePublicFilePublications } from '../src/collab/public-file-publication-store.js';
import { migrateCommentRelayPublicationMappings, recordCommentRelayPublicationMapping, sourcePathForCurrentPublication } from '../src/collab/comment-relay-publication-mapping.js';

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
  const db = openDatabase(root);
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
  const received: unknown[] = [];
  const errors: unknown[] = [];
  const client = createVelaCliCollabClient({ run: async (args, workspaceId) => {
    expect(workspaceId).toBe(context.workspaceId);
    calls.push(args); return wire;
  } });
  const before = Date.now();
  const service = createCollabCloudService({
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
  try {
    expect(await service.pullProject(projectId, context)).toBe(true);
    expect(errors).toEqual([]);
    expect(received).toEqual(captured.comments);
    const rows = listPreviewComments(db, projectId, 'local');
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.id === captured.comments[0].id)).toMatchObject({
      label: 'heading', authorKind: 'user', authorAppUserId: 'share-fixture-viewer-app', authorMemberId: undefined,
    });
    expect(rows.find((row) => row.id === captured.comments[0].id)!.createdAt).toBeGreaterThanOrEqual(before);
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
  } finally { service.dispose(); }
});

it.each(['team', 'personal', 'stopped', 'lookup-error', 'lookup-missing', 'ambiguous'] as const)('replays e9e4564dc server-asserted alias into actual local source rows: %s', async scenario => {
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
    workspaceId: 'fixture-space', workspaceType: scenario === 'team' ? 'team' : 'personal', workspaceMemberId: 'member-owner',
    role: 'owner', memberStatus: 'active', lifecycleState: 'active', billingState: 'active',
    planId: null, providerMode: 'platform_credits', teamId: 'fixture-space',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 5, usedSeats: 1 }),
    permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }),
  };
  const calls: string[][] = [];
  const service = createCollabCloudService({
    client: createVelaCliCollabClient({ run: async args => { calls.push(args); return wire; } }),
    listProjectIds: () => [], resolveLocalConversationId: () => 'local',
    resolveProjectWorkspaceContext: async () => context,
    listPersonalCommentRelayFilePaths: () => new Set([scope.filePath]),
    ...(scenario === 'lookup-missing' ? {} : {
      resolvePublishedCommentSourcePath: ({ publicationSlug, publishedPath }: { publicationSlug: string; publishedPath: string }) => {
        if (scenario === 'lookup-error') throw new Error('mapping unavailable');
        return sourcePathForCurrentPublication(db, { ...scope, slug: publicationSlug, publishedPath });
      },
    }),
    resolveStoredCommentLocation: (id, commentId) => {
      const stored = getProjectPreviewComment(db, id, commentId);
      return stored ? { found: true, filePath: stored.filePath } : { found: false };
    },
    mergeComment: ({ projectId: id, conversationId, comment }) => mergeSyncedPreviewComment(db, id, conversationId, comment),
  });
  try {
    const fails = ['lookup-error', 'lookup-missing', 'ambiguous'].includes(scenario);
    expect(await service.pullProject(projectId, context)).toBe(!fails);
    const rows = listPreviewComments(db, projectId, 'local');
    if (scenario === 'stopped' || fails) expect(rows).toEqual([]);
    else {
      expect(rows.find(row => row.id === captured.comments[0].id)).toMatchObject({ filePath: scope.filePath, authorKind: 'user', authorAppUserId: 'share-fixture-viewer-app' });
      expect(rows.some(row => row.id === captured.comments[1].id)).toBe(false);
      // Historical member has no publication identity: never guess its source.
      expect(rows.find(row => row.id === 'capture-member')?.filePath).toBe(scenario === 'team' ? 'index.html' : undefined);
    }
    await service.pullProject(projectId, context);
    expect(calls[1]?.slice(3, 5)).toEqual(['--since-seq', fails ? '0' : '4']);
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
