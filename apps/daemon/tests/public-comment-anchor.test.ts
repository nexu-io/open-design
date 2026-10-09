import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildWorkspacePermissions, buildWorkspaceSeatSummary, type WorkspaceCollabContext } from '@open-design/contracts';
import { closeDatabase, openDatabase, insertProject, insertConversation, ensureWorkspaceProject, getWorkspaceProjectByProjectId, getProjectCommentAnchorConversationId, getProjectPreviewComment, getLatestConversationIdForProject, listConversations, mergeSyncedPreviewComment, repairTeamProjectCommentAnchorConversations } from '../src/db.js';
import { createSqlitePublicFilePublicationStore } from '../src/collab/public-file-publication-store.js';
import { createPublicFilePublicationRecorder } from '../src/collab/public-file-publication-recording.js';
import { enqueuePublishedFileComments } from '../src/collab/published-file-comment-backfill.js';
import { readPublishedCommentBackfill } from '../src/collab/published-comment-backfill-state.js';
import { createShareFileMapping } from '../src/collab/share-file-mapping.js';
import { recordCommentRelayPublicationMapping, sourcePathForCurrentPublication } from '../src/collab/comment-relay-publication-mapping.js';
import { personalCommentRelayFilePaths } from '../src/collab/comment-relay-scope.js';
import { createCollabCloudService } from '../src/collab/collab-cloud-service.js';
import { createVelaCliCollabClient } from '../src/collab/vela-cli-collab-client.js';

let root: string | undefined;
afterEach(() => { closeDatabase(); if (root) rmSync(root, { recursive: true, force: true }); root = undefined; });
const scope = { resourceTeamId: 'workspace', ownerMemberId: 'owner', projectId: 'personal', filePath: 'pages/design.html' };
const publication = { slug: 'public-design', url: 'https://example.test/shared', fileName: scope.filePath };
const mapping = createShareFileMapping([{ sourcePath: scope.filePath, file: 'index.html' }]);
const context: WorkspaceCollabContext = {
  workspaceId: scope.resourceTeamId, workspaceMemberId: scope.ownerMemberId, workspaceType: 'personal',
  role: 'owner', memberStatus: 'active', lifecycleState: 'active', billingState: 'active',
  planId: null, providerMode: 'platform_credits', teamId: scope.resourceTeamId,
  seatSummary: buildWorkspaceSeatSummary({ seatLimit: 1, usedSeats: 1 }),
  permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }),
};
function setup() {
  root = mkdtempSync(join(tmpdir(), 'od-public-comment-anchor-'));
  const db = openDatabase(root, { dataDir: root });
  insertProject(db, { id: scope.projectId, name: 'Personal design', createdAt: 1, updatedAt: 1 });
  insertConversation(db, { id: 'ordinary-chat', projectId: scope.projectId, title: 'Design', createdAt: 1, updatedAt: 1 });
  ensureWorkspaceProject(db, { projectId: scope.projectId, workspaceId: scope.resourceTeamId,
    createdByWorkspaceMemberId: scope.ownerMemberId, visibility: 'personal', resourceState: 'active' });
  return { db, publications: createSqlitePublicFilePublicationStore(db) };
}
async function expectInbound(db: ReturnType<typeof openDatabase>) {
  const publications = createSqlitePublicFilePublicationStore(db);
  // Only the external CLI is substituted; eligibility, anchor lookup, alias mapping and merge are production code.
  const run = vi.fn(async () => JSON.stringify({ latestSeq: 1, comments: [{
    id: 'public-user-comment', authorKind: 'user', memberId: '', authorAppUserId: 'external-user', authorDisplayName: 'Guest',
    publicationSlug: publication.slug, filePath: 'index.html', elementId: 'hero', selector: '#hero', label: 'Hero',
    note: 'Increase heading size', status: 'open', position: { x: 1, y: 2, width: 30, height: 20 },
    createdAt: 10, updatedAt: 10, seq: 1,
  }] }));
  const service = createCollabCloudService({
    client: createVelaCliCollabClient({ run }), listProjectIds: () => [scope.projectId],
    resolveProjectWorkspaceContext: async () => context,
    resolveLocalConversationId: projectId => getProjectCommentAnchorConversationId(db, projectId),
    listPersonalCommentRelayFilePaths: (projectId, current) => personalCommentRelayFilePaths({
      projectId, context: current, binding: getWorkspaceProjectByProjectId(db, projectId), publications,
    }),
    resolvePublishedCommentSourcePath: ({ publicationSlug, publishedPath }) => sourcePathForCurrentPublication(db, {
      ...scope, slug: publicationSlug, publishedPath,
    }),
    mergeComment: ({ projectId, conversationId, comment }) => mergeSyncedPreviewComment(db, projectId, conversationId, comment),
  });
  try {
    await service.pollOnce();
    expect(run).toHaveBeenCalledWith(['comment', 'pull', scope.projectId, '--since-seq', '0', '--author-kinds', 'member,user'], scope.resourceTeamId, undefined);
    const anchor = getProjectCommentAnchorConversationId(db, scope.projectId);
    expect(anchor).toMatch(/^comment-anchor-/);
    expect(getProjectPreviewComment(db, scope.projectId, 'public-user-comment')).toMatchObject({
      conversationId: anchor, filePath: scope.filePath, authorKind: 'user', authorMemberId: undefined,
      authorAppUserId: 'external-user', authorDisplayName: 'Guest', note: 'Increase heading size',
    });
    expect(getLatestConversationIdForProject(db, scope.projectId)).toBe('ordinary-chat');
    expect(listConversations(db, scope.projectId).map(row => row.id)).toEqual(['ordinary-chat']);
  } finally { service.dispose(); }
}
it('first personal publication makes public user comments pullable into the shared internal anchor mechanism', async () => {
  const { db, publications } = setup();
  expect(getProjectCommentAnchorConversationId(db, scope.projectId)).toBeNull();
  const record = createPublicFilePublicationRecorder(db, publications, enqueuePublishedFileComments);
  record(scope, publication, mapping);
  // K1: no existing comments skips waiting/syncing without losing the link.
  expect(publications.get(scope)).toMatchObject(publication);
  expect(readPublishedCommentBackfill(db, { projectId: scope.projectId, workspaceId: scope.resourceTeamId,
    workspaceMemberId: scope.ownerMemberId, filePath: scope.filePath })).toMatchObject({
    state: 'succeeded', retryable: false, publicationRevision: publications.getRevision(scope)?.token,
  });
  await expectInbound(db);
  const anchor = getProjectCommentAnchorConversationId(db, scope.projectId);
  record(scope, publication, mapping);
  expect(getProjectCommentAnchorConversationId(db, scope.projectId)).toBe(anchor);
});
it.each(['unpublished', 'stopped', 'deleted'] as const)('startup does not enroll an ineligible personal project: %s', scenario => {
  const { db, publications } = setup();
  if (scenario !== 'unpublished') publications.set(scope, publication);
  if (scenario === 'stopped') publications.delete(scope);
  if (scenario === 'deleted') db.prepare("UPDATE workspace_projects SET resource_state = 'deleted' WHERE project_id = ?").run(scope.projectId);
  expect(repairTeamProjectCommentAnchorConversations(db, 20)).toEqual({ checked: 0, created: 0 });
  expect(getProjectCommentAnchorConversationId(db, scope.projectId)).toBeNull();
  expect(listConversations(db, scope.projectId).map(row => row.id)).toEqual(['ordinary-chat']);
});
it('publication failure rolls back its newly created anchor together with the publication', () => {
  const { db, publications } = setup();
  db.exec("CREATE TRIGGER reject_mapping BEFORE INSERT ON comment_relay_publication_mappings BEGIN SELECT RAISE(ABORT, 'mapping failed'); END");
  const record = createPublicFilePublicationRecorder(db, publications, enqueuePublishedFileComments);
  expect(() => record(scope, publication, mapping)).toThrow('mapping failed');
  expect(getProjectCommentAnchorConversationId(db, scope.projectId)).toBeNull();
  expect(publications.get(scope)).toBeNull();
  expect(listConversations(db, scope.projectId).map(row => row.id)).toEqual(['ordinary-chat']);
});
it('startup repairs an already published personal project after reopen without replacing its publication or ordinary chat', async () => {
  const { db, publications } = setup();
  // Historical persistent state: publication+mapping exist but no internal anchor, as in the failing runtime.
  db.transaction(() => {
    publications.set(scope, publication);
    recordCommentRelayPublicationMapping(db, scope, { ...publications.getRevision(scope)!, publicFilePath: 'index.html' });
  })();
  const revision = publications.getRevision(scope);
  expect(getProjectCommentAnchorConversationId(db, scope.projectId)).toBeNull();
  closeDatabase();
  const reopened = openDatabase(root!, { dataDir: root! });
  expect(repairTeamProjectCommentAnchorConversations(reopened, 20)).toEqual({ checked: 1, created: 1 });
  await expectInbound(reopened);
  const anchor = getProjectCommentAnchorConversationId(reopened, scope.projectId);
  expect(repairTeamProjectCommentAnchorConversations(reopened, 30)).toEqual({ checked: 1, created: 0 });
  expect(getProjectCommentAnchorConversationId(reopened, scope.projectId)).toBe(anchor);
  expect(createSqlitePublicFilePublicationStore(reopened).getRevision(scope)).toEqual(revision);
});
