import { expect, it, vi } from 'vitest';
import express from 'express';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildWorkspacePermissions, buildWorkspaceSeatSummary, type PreviewComment, type WorkspaceCollabContext } from '@open-design/contracts';
import {
  closeDatabase, confirmPreviewCommentPinSeq, getWorkspaceProjectByProjectId, insertConversation, insertProject,
  listPreviewComments, openDatabase, upsertPreviewComment,
} from '../src/db.js';
import { createCollabRuntime } from '../src/collab/runtime.js';
import { registerCollabSyncRoutes } from '../src/routes/collab-sync.js';
import { createPublicFilePublicationRecorder } from '../src/collab/public-file-publication-recording.js';
import { createSqlitePublicFilePublicationStore, migratePublicFilePublications } from '../src/collab/public-file-publication-store.js';
import { enqueuePublishedFileComments } from '../src/collab/published-file-comment-backfill.js';
import { readPublishedCommentBackfill } from '../src/collab/published-comment-backfill-state.js';
import { createCommentRelayOutboxStore, commentRelayLocalBindingMatches } from '../src/collab/comment-relay-outbox.js';
import { createCollabCloudService } from '../src/collab/collab-cloud-service.js';
import { createVelaCliCollabClient } from '../src/collab/vela-cli-collab-client.js';
import { commentRelayScope } from '../src/collab/comment-relay-scope.js';
import { isPrivateTeamProjectOfCreator, markPublishedTeamProjectVisible } from '../src/collab/public-share-team-visibility.js';
import { runVelaResourceCommand } from '../src/collab/vela-cli-resource-adapter.js';
import { readVelaControlApiContext } from '../src/integrations/vela.js';
import { createPublicSharePublishingFixture } from './public-share-publishing-fixture.js';
import { commentRelayRecordPromotedToTeam } from '../src/collab/comment-relay-outbox.js';

vi.mock('../src/collab/vela-cli-resource-adapter.js', async importOriginal => ({
  ...await importOriginal<typeof import('../src/collab/vela-cli-resource-adapter.js')>(), runVelaResourceCommand: vi.fn(),
}));
vi.mock('../src/integrations/vela.js', () => ({ readVelaControlApiContext: vi.fn() }));

const FILE = 'pages/local.html';
const target = { filePath: FILE, elementId: 'hero', selector: 'h1', label: 'Hero', position: { x: 0, y: 0, width: 1, height: 1 } };

// Integration defect (share P0, t-backfill.log): a private project in a TEAM
// workspace lost its existing comments on the share page, dropped comments
// written right after publishing, and later showed two pins numbered 1.
it('publishing a private team-workspace project makes it team-visible before backfill, so comments are delivered once with distinct pins', async () => {
  const root = await mkdtemp(join(tmpdir(), 'od-publish-team-private-'));
  const db = openDatabase(root);
  const context: WorkspaceCollabContext = {
    workspaceId: 'w', teamId: 'w', workspaceMemberId: 'owner', workspaceType: 'team', role: 'owner',
    memberStatus: 'active', lifecycleState: 'active', billingState: 'active', planId: null, providerMode: 'platform_credits',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 3, usedSeats: 2 }),
    permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }),
  };
  const runtime = createCollabRuntime({ workspaceContext: { current: async () => context } });
  const app = express(); app.use(express.json());
  const server = createServer(app);
  let catalogued = false;
  try {
    await mkdir(join(root, 'pages'));
    await writeFile(join(root, 'pages', 'local.html'), '<h1 data-od-id="hero">Published</h1>');
    insertProject(db, { id: 'p', name: 'Project', createdAt: 1, updatedAt: 1 });
    insertConversation(db, { id: 'a', projectId: 'p', title: 'a', createdAt: 1, updatedAt: 1 });
    db.prepare(`INSERT INTO workspace_projects(project_id,workspace_id,visibility,resource_state,created_by_workspace_member_id,created_at,updated_at)
      VALUES('p','w','personal','active','owner',1,1)`).run();
    for (const id of ['first', 'second']) upsertPreviewComment(db, 'p', 'a', { id, note: id, authorMemberId: 'owner', target });
    migratePublicFilePublications(db);
    const store = createSqlitePublicFilePublicationStore(db);
    const queue = createCommentRelayOutboxStore(db);
    vi.mocked(readVelaControlApiContext).mockReturnValue({ profile: 'test', apiUrl: 'https://hub.example.test', controlKey: 'synthetic', user: null, configMtimeMs: null });
    vi.mocked(runVelaResourceCommand).mockReset();
    vi.mocked(runVelaResourceCommand).mockImplementation(async () => JSON.stringify({ id: 'v1', version: 1 }));
    const fixture = createPublicSharePublishingFixture(db, store, runVelaResourceCommand, enqueuePublishedFileComments);
    registerCollabSyncRoutes(app, {
      collab: runtime, publicFilePublicationStore: store, ...fixture,
      sharePublishing: {
        ...fixture.sharePublishing!,
        // Registration in the team catalog: from here on the remote catalog lists it.
        ensureProject: async (scope, principal) => {
          catalogued = true;
          return { projectId: scope.projectId, ownerMemberId: principal.memberId, sharedAt: new Date(1).toISOString() };
        },
      },
      recordPublicFilePublication: createPublicFilePublicationRecorder(db, store, enqueuePublishedFileComments),
      verifyWorkspaceRequest: async req => req.get('x-od-workspace-id') === 'w' ? context : null,
      // Private project: not in the team catalog until this publish registers it.
      resolveSharedProject: async () => null, resolveSharedProjectOwner: async () => null,
      resolveLocalPublicShareOwner: () => 'owner',
      isPrivateTeamProjectOfCreator: (projectId, principal) => isPrivateTeamProjectOfCreator(db, projectId, principal),
      markPublishedTeamProjectVisible: (projectId, principal) => markPublishedTeamProjectVisible(db, projectId, principal),
      resolveProjectDir: () => root,
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('HTTP listener unavailable');
    const response = await fetch(`http://127.0.0.1:${address.port}/api/projects/p/files/${FILE}/publish-public`, {
      method: 'POST', headers: { 'x-od-workspace-id': 'w', 'x-od-workspace-member-id': 'owner' },
    });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ status: 'published', madeTeamVisible: true });
    expect(getWorkspaceProjectByProjectId(db, 'p')).toMatchObject({ visibility: 'team', createdByWorkspaceMemberId: 'owner' });
    // The backfill is queued as Team relay, which a team workspace can deliver.
    expect(queue.listDue(Date.now()).map(row => [row.comment.id, row.relayScope])).toEqual([['first', 'team'], ['second', 'team']]);

    const delivered: Array<{ id: string; seq: number }> = [];
    const relay = createCollabCloudService({
      client: createVelaCliCollabClient({ run: async (_args, _workspaceId, options) => {
        const comment = JSON.parse(String(options?.input)) as { id: string };
        delivered.push({ id: comment.id, seq: delivered.length + 1 });
        return JSON.stringify({ seq: delivered.length });
      } }),
      commentOutbox: queue, listProjectIds: () => [], retryDelayMs: () => 0,
      resolveCommentRelayWorkspaceContext: async () => context,
      listRemoteProjectRelayBindings: async () => catalogued ? [{ projectId: 'p', ownerMemberId: 'owner' }] : [],
      validateCommentRelayProjectBinding: record => commentRelayLocalBindingMatches(record, getWorkspaceProjectByProjectId(db, record.projectId)),
      resolveLocalProjectRelayBinding: projectId => {
        const binding = getWorkspaceProjectByProjectId(db, projectId);
        return binding ? { workspaceId: binding.workspaceId, ownerMemberId: binding.createdByWorkspaceMemberId } : null;
      },
      commentRelayScope: (projectId, filePath, ctx) => commentRelayScope({ projectId, filePath, context: ctx,
        binding: getWorkspaceProjectByProjectId(db, projectId), publications: store }),
      onCommentPushed: ({ projectId, commentId, seq }) => { confirmPreviewCommentPinSeq(db, projectId, commentId, seq); },
      resolveLocalConversationId: () => 'a', mergeComment: () => 'unchanged',
    });
    try {
      // A comment written right after publishing is relay-eligible and queued.
      expect(commentRelayScope({ projectId: 'p', filePath: FILE, context,
        binding: getWorkspaceProjectByProjectId(db, 'p'), publications: store })).toMatchObject({ relayScope: 'team' });
      const fresh = upsertPreviewComment(db, 'p', 'a', { id: 'third', note: 'third', authorMemberId: 'owner', target },
        { pinPendingCloudConfirm: true }) as unknown as PreviewComment;
      expect(relay.enqueueComment(fresh, context)).toBe(true);

      await relay.flushPendingComments();
      expect(delivered.map(item => item.id)).toEqual(['first', 'second', 'third']);
      expect(queue.count()).toBe(0);
      expect(readPublishedCommentBackfill(db, { projectId: 'p', workspaceId: 'w', workspaceMemberId: 'owner', filePath: FILE }))
        .toMatchObject({ state: 'succeeded', retryable: false });
      const pins = listPreviewComments(db, 'p', 'a').map(comment => [comment.id, comment.pinSeq]);
      expect(pins).toEqual(expect.arrayContaining([['first', 1], ['second', 2], ['third', 3]]));
    } finally { relay.dispose(); }
  } finally {
    if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    runtime.dispose(); closeDatabase(); await rm(root, { recursive: true, force: true }); vi.clearAllMocks();
  }
});

// Rows queued as personal relay by the pre-fix publish path (or before this
// daemon learned the project turned team-visible) must not be cancelled for a
// state that is only transient: defer while private-in-team, then re-queue as
// Team relay once the creator's row is team-visible.
it('a personal backfill queued in a team workspace is deferred, then delivered as Team relay once the project turns team-visible', async () => {
  const root = await mkdtemp(join(tmpdir(), 'od-relay-team-private-'));
  const db = openDatabase(root);
  const context: WorkspaceCollabContext = {
    workspaceId: 'w', teamId: 'w', workspaceMemberId: 'owner', workspaceType: 'team', role: 'owner',
    memberStatus: 'active', lifecycleState: 'active', billingState: 'active', planId: null, providerMode: 'platform_credits',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 3, usedSeats: 2 }),
    permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }),
  };
  try {
    insertProject(db, { id: 'p', name: 'Project', createdAt: 1, updatedAt: 1 });
    insertConversation(db, { id: 'a', projectId: 'p', title: 'a', createdAt: 1, updatedAt: 1 });
    db.prepare(`INSERT INTO workspace_projects(project_id,workspace_id,visibility,resource_state,created_by_workspace_member_id,created_at,updated_at)
      VALUES('p','w','personal','active','owner',1,1)`).run();
    for (const id of ['first', 'second']) upsertPreviewComment(db, 'p', 'a', { id, note: id, authorMemberId: 'owner', target });
    migratePublicFilePublications(db);
    const store = createSqlitePublicFilePublicationStore(db);
    const queue = createCommentRelayOutboxStore(db);
    const scope = { resourceTeamId: 'w', ownerMemberId: 'owner', projectId: 'p', filePath: FILE };
    createPublicFilePublicationRecorder(db, store, enqueuePublishedFileComments)(
      scope, { slug: 'stable', url: 'https://viewer.example.test/s', fileName: FILE }, [{ sourcePath: FILE, publishedPath: 'index.html' }]);
    expect(queue.listDue(Date.now()).map(row => row.relayScope)).toEqual(['personal', 'personal']);

    const delivered: string[] = [];
    const errors: string[] = [];
    const relay = createCollabCloudService({
      client: createVelaCliCollabClient({ run: async (_args, _workspaceId, options) => {
        delivered.push((JSON.parse(String(options?.input)) as { id: string }).id);
        return JSON.stringify({ seq: delivered.length });
      } }),
      commentOutbox: queue, listProjectIds: () => [], retryDelayMs: () => 0,
      onError: error => { errors.push(error instanceof Error ? error.message : String(error)); },
      resolveCommentRelayWorkspaceContext: async () => context,
      listRemoteProjectRelayBindings: async () => [{ projectId: 'p', ownerMemberId: 'owner' }],
      validateCommentRelayProjectBinding: record => commentRelayLocalBindingMatches(record, getWorkspaceProjectByProjectId(db, record.projectId)),
      isCommentRelayRecordPromotedToTeam: record => commentRelayRecordPromotedToTeam(record, getWorkspaceProjectByProjectId(db, record.projectId)),
      commentRelayScope: (projectId, filePath, ctx) => commentRelayScope({ projectId, filePath, context: ctx,
        binding: getWorkspaceProjectByProjectId(db, projectId), publications: store }),
      resolveLocalConversationId: () => 'a', mergeComment: () => 'unchanged',
    });
    const backfill = () => readPublishedCommentBackfill(db, { projectId: 'p', workspaceId: 'w', workspaceMemberId: 'owner', filePath: FILE });
    try {
      await relay.flushPendingComments();
      expect(delivered).toEqual([]);
      expect(queue.count()).toBe(2);
      expect(errors).toEqual(['comment relay awaiting team visibility', 'comment relay awaiting team visibility']);
      expect(backfill()).toMatchObject({ state: 'failed', retryable: true, code: 'BACKFILL_DELIVERY_DEFERRED' });

      expect(markPublishedTeamProjectVisible(db, 'p', { memberId: 'owner', teamId: 'w', role: 'owner', lifecycleState: 'active', workspaceType: 'team' })).toBe(true);
      await relay.flushPendingComments();
      expect(delivered).toEqual(['first', 'second']);
      expect(queue.count()).toBe(0);
      expect(backfill()).toMatchObject({ state: 'succeeded', retryable: false });
    } finally { relay.dispose(); }
  } finally {
    closeDatabase(); await rm(root, { recursive: true, force: true });
  }
});

it('a personal record never promoted to team is cancelled after bounded deferral, not retried forever', async () => {
  const root = await mkdtemp(join(tmpdir(), 'od-relay-team-private-cap-'));
  const db = openDatabase(root);
  const context = {
    workspaceId: 'w', teamId: 'w', workspaceMemberId: 'owner', workspaceType: 'team', role: 'owner',
    memberStatus: 'active', lifecycleState: 'active', billingState: 'active', planId: null, providerMode: 'platform_credits',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 3, usedSeats: 2 }),
    permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }),
  } as WorkspaceCollabContext;
  try {
    insertProject(db, { id: 'p', name: 'Project', createdAt: 1, updatedAt: 1 });
    insertConversation(db, { id: 'a', projectId: 'p', title: 'a', createdAt: 1, updatedAt: 1 });
    db.prepare(`INSERT INTO workspace_projects(project_id,workspace_id,visibility,resource_state,created_by_workspace_member_id,created_at,updated_at)
      VALUES('p','w','personal','active','owner',1,1)`).run();
    upsertPreviewComment(db, 'p', 'a', { id: 'first', note: 'first', authorMemberId: 'owner', target });
    migratePublicFilePublications(db);
    const store = createSqlitePublicFilePublicationStore(db);
    const queue = createCommentRelayOutboxStore(db);
    createPublicFilePublicationRecorder(db, store, enqueuePublishedFileComments)(
      { resourceTeamId: 'w', ownerMemberId: 'owner', projectId: 'p', filePath: FILE },
      { slug: 'stable', url: 'https://viewer.example.test/s', fileName: FILE }, [{ sourcePath: FILE, publishedPath: 'index.html' }]);
    const relay = createCollabCloudService({
      client: createVelaCliCollabClient({ run: async () => { throw new Error('must not push'); } }),
      commentOutbox: queue, listProjectIds: () => [], retryDelayMs: () => 0, onError: () => {},
      resolveCommentRelayWorkspaceContext: async () => context,
      listRemoteProjectRelayBindings: async () => [],
      validateCommentRelayProjectBinding: record => commentRelayLocalBindingMatches(record, getWorkspaceProjectByProjectId(db, record.projectId)),
      commentRelayScope: (projectId, filePath, ctx) => commentRelayScope({ projectId, filePath, context: ctx,
        binding: getWorkspaceProjectByProjectId(db, projectId), publications: store }),
      resolveLocalConversationId: () => 'a', mergeComment: () => 'unchanged',
    });
    try {
      let passes = 0;
      while (queue.count() > 0 && passes < 100) { await relay.flushPendingComments(); passes += 1; }
      expect(queue.count()).toBe(0);
      expect(passes).toBeGreaterThan(10);
      expect(passes).toBeLessThan(100);
      expect(readPublishedCommentBackfill(db, { projectId: 'p', workspaceId: 'w', workspaceMemberId: 'owner', filePath: FILE }))
        .toMatchObject({ state: 'failed', retryable: false, code: 'BACKFILL_DELIVERY_DISCARDED' });
    } finally { relay.dispose(); }
  } finally {
    closeDatabase(); await rm(root, { recursive: true, force: true });
  }
});

it('only the same creator in the same workspace is re-queued as Team relay', () => {
  const record = {
    workspaceId: 'w', workspaceMemberId: 'owner', teamId: 'w', relayScope: 'personal' as const, projectId: 'p', commentId: 'c',
    expectedOwnerMemberId: 'owner', comment: {} as never, eventKey: 'event-key', revision: 1, attemptCount: 0, nextAttemptAt: 0,
  };
  const team = { workspaceId: 'w', visibility: 'team', resourceState: 'active', createdByWorkspaceMemberId: 'owner' };
  expect(commentRelayRecordPromotedToTeam(record, team)).toBe(true);
  expect(commentRelayRecordPromotedToTeam(record, { ...team, visibility: 'personal' })).toBe(false);
  expect(commentRelayRecordPromotedToTeam(record, { ...team, workspaceId: 'other' })).toBe(false);
  expect(commentRelayRecordPromotedToTeam(record, { ...team, createdByWorkspaceMemberId: 'someone-else' })).toBe(false);
  expect(commentRelayRecordPromotedToTeam(record, { ...team, resourceState: 'deleted' })).toBe(false);
  expect(commentRelayRecordPromotedToTeam({ ...record, relayScope: 'team' }, team)).toBe(false);
});

// Integration rerun (share P0, 2026-09-27): registering the project in the team
// catalog lets a concurrent catalog reconcile (hub `team-projects-changed`, a
// project list read) rebind the row to team before publish-public marks it.
// The publish still made the project team-visible, so it must say so; otherwise
// the UI keeps showing "only me" and the CLI never prints its notice.
async function publishWithCatalogRace(initialVisibility: 'personal' | 'team') {
  const root = await mkdtemp(join(tmpdir(), 'od-publish-team-race-'));
  const db = openDatabase(root);
  const context: WorkspaceCollabContext = {
    workspaceId: 'w', teamId: 'w', workspaceMemberId: 'owner', workspaceType: 'team', role: 'owner',
    memberStatus: 'active', lifecycleState: 'active', billingState: 'active', planId: null, providerMode: 'platform_credits',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 3, usedSeats: 2 }),
    permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }),
  };
  const runtime = createCollabRuntime({ workspaceContext: { current: async () => context } });
  const app = express(); app.use(express.json());
  const server = createServer(app);
  try {
    await mkdir(join(root, 'pages'));
    await writeFile(join(root, 'pages', 'local.html'), '<h1 data-od-id="hero">Published</h1>');
    insertProject(db, { id: 'p', name: 'Project', createdAt: 1, updatedAt: 1 });
    insertConversation(db, { id: 'a', projectId: 'p', title: 'a', createdAt: 1, updatedAt: 1 });
    db.prepare(`INSERT INTO workspace_projects(project_id,workspace_id,visibility,resource_state,created_by_workspace_member_id,created_at,updated_at)
      VALUES('p','w',?,'active','owner',1,1)`).run(initialVisibility);
    migratePublicFilePublications(db);
    const store = createSqlitePublicFilePublicationStore(db);
    vi.mocked(readVelaControlApiContext).mockReturnValue({ profile: 'test', apiUrl: 'https://hub.example.test', controlKey: 'synthetic', user: null, configMtimeMs: null });
    vi.mocked(runVelaResourceCommand).mockReset();
    vi.mocked(runVelaResourceCommand).mockImplementation(async () => JSON.stringify({ id: 'v1', version: 1 }));
    const fixture = createPublicSharePublishingFixture(db, store, runVelaResourceCommand, enqueuePublishedFileComments);
    registerCollabSyncRoutes(app, {
      collab: runtime, publicFilePublicationStore: store, ...fixture,
      sharePublishing: {
        ...fixture.sharePublishing!,
        ensureProject: async (scope, principal) => {
          // The catalog reconcile wins the race and binds the row to team first.
          db.prepare(`UPDATE workspace_projects SET visibility='team', sync_state='synced' WHERE project_id='p'`).run();
          return { projectId: scope.projectId, ownerMemberId: principal.memberId, sharedAt: new Date(1).toISOString() };
        },
      },
      recordPublicFilePublication: createPublicFilePublicationRecorder(db, store, enqueuePublishedFileComments),
      verifyWorkspaceRequest: async req => req.get('x-od-workspace-id') === 'w' ? context : null,
      resolveSharedProject: async () => null, resolveSharedProjectOwner: async () => null,
      resolveLocalPublicShareOwner: () => 'owner',
      isPrivateTeamProjectOfCreator: (projectId, principal) => isPrivateTeamProjectOfCreator(db, projectId, principal),
      markPublishedTeamProjectVisible: (projectId, principal) => markPublishedTeamProjectVisible(db, projectId, principal),
      resolveProjectDir: () => root,
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('HTTP listener unavailable');
    const response = await fetch(`http://127.0.0.1:${address.port}/api/projects/p/files/${FILE}/publish-public`, {
      method: 'POST', headers: { 'x-od-workspace-id': 'w', 'x-od-workspace-member-id': 'owner' },
    });
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  } finally {
    if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    runtime.dispose(); closeDatabase(); await rm(root, { recursive: true, force: true }); vi.clearAllMocks();
  }
}

it('reports madeTeamVisible when a catalog reconcile marked the private project team-visible first', async () => {
  const { status, body } = await publishWithCatalogRace('personal');
  expect(status).toBe(200);
  expect(body).toMatchObject({ status: 'published', madeTeamVisible: true });
});

it('does not report madeTeamVisible for a project that was already team-visible before publishing', async () => {
  const { status, body } = await publishWithCatalogRace('team');
  expect(status).toBe(200);
  expect(body.madeTeamVisible).toBeUndefined();
});
