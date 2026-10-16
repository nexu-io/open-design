import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import type { CommentFileState, CommentFileMutation } from '@open-design/contracts';
import { closeDatabase, openDatabase, insertProject, ensureWorkspaceProject, getProject, updateProject, insertConversation, mergeSyncedPreviewComment, getProjectPreviewComment, upsertPreviewComment } from '../src/db.js';
import { ensureWorkspaceArtifactForPath, getWorkspaceArtifact } from '../src/chat-artifacts/store.js';
import { createLocalCommentFiles, trackedCommentFilePaths } from '../src/collab/local-comment-files.js';
import { normalizeCurrentFileComment } from '../src/collab/comment-file-facts.js';
import { createCommentInboundStore } from '../src/collab/comment-inbound-store.js';
import { parseMemberPage } from '../src/integrations/collab-cloud.js';
import { createSqlitePublicFilePublicationStore } from '../src/collab/public-file-publication-store.js';
import { createPublicFilePublicationRecorder } from '../src/collab/public-file-publication-recording.js';
import { enqueuePublishedFileComments } from '../src/collab/published-file-comment-backfill.js';
import { createCommentRelayOutboxStore } from '../src/collab/comment-relay-outbox.js';
import type { CollabCloudComment } from '@open-design/contracts';

let root: string | undefined;
afterEach(() => { closeDatabase(); if (root) fs.rmSync(root, { recursive: true, force: true }); });
function setup() {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'od-local-facts-'));
  const db = openDatabase(root, { dataDir: root });
  insertProject(db, { id: 'p', name: 'P', metadata: { kind: 'prototype', unrelated: 'keep' }, createdAt: 1, updatedAt: 1 });
  insertConversation(db, { id: 'c', projectId: 'p', title: 'C', createdAt: 1, updatedAt: 1 });
  ensureWorkspaceProject(db, { projectId: 'p', workspaceId: 'w', visibility: 'personal', createdByWorkspaceMemberId: 'creator', resourceHubResourceId: 'root' });
  return db;
}
function catalog() {
  let stored: CommentFileState = { schemaVersion: 1, revision: 0, files: [] };
  const run = vi.fn(async (args: string[]) => {
    if (args[1] === 'upsert') {
      const mutation = JSON.parse(args[6] ?? '')._commentFiles as CommentFileMutation;
      expect(args[4]).toBe('root');
      expect(mutation.baseRevision).toBe(stored.revision);
      const map = new Map(stored.files.map(fact => [fact.sourceFileId, fact]));
      for (const file of mutation.files) map.set(file.sourceFileId, { ...file, resourceId: mutation.resourceId, versionId: mutation.versionId });
      stored = { schemaVersion: 1, revision: stored.revision + 1, files: [...map.values()] };
    }
    return JSON.stringify({ projectId: 'p', workspaceId: 'w', ownerMemberId: 'creator', resourceId: 'root', metadata: { _commentFiles: stored } });
  });
  return { run, state: () => stored };
}
it('private selected receipt admission needs no alias or root upload; managed F1 retirement precedes same-path fresh F2', async () => {
  const db = setup();
  const cloud = catalog();
  const files = createLocalCommentFiles(db);
  const original = ensureWorkspaceArtifactForPath(db, { projectId: 'p', path: 'a.html', kind: 'html' });
  const offline = upsertPreviewComment(db, 'p', 'c', { sourceFileId: files.identity('p', 'a.html'), authorMemberId: 'creator', note: 'offline first',
    target: { filePath: 'a.html', elementId: 'hero', selector: '#hero', label: 'Hero', position: { x: 1, y: 2, width: 3, height: 4 } } });
  expect(cloud.run).not.toHaveBeenCalled();
  const input = { projectId: 'p', workspaceId: 'w', creatorMemberId: 'creator', resourceId: 'selected', versionId: 'v1',
    paths: [{ sourceFilePath: 'a.html', entryPath: 'index.html' }], run: cloud.run };
  await files.admit(input);
  const first = cloud.state().files[0];
  if (!first) throw new Error('missing admitted fact');
  expect(first.sourceFileId).toBe(original.id);
  const publications = createSqlitePublicFilePublicationStore(db);
  createPublicFilePublicationRecorder(db, publications, enqueuePublishedFileComments)(
    { sourceFileId: original.id, resourceTeamId: 'w', ownerMemberId: 'creator', projectId: 'p', filePath: 'a.html' },
    { slug: 'alias', url: null, fileName: 'a.html' }, [{ sourcePath: 'a.html', publishedPath: 'index.html' }]);
  expect(createCommentRelayOutboxStore(db).listDue(Date.now())[0]?.comment).toMatchObject({ sourceFileId: original.id,
    sourceFilePath: 'a.html', memberId: 'creator', createdAt: offline?.createdAt, selector: '#hero', note: 'offline first' });
  expect(getProject(db, 'p')?.metadata?.unrelated).toBe('keep');
  await files.retire({ ...input, fact: first });
  expect(cloud.state().files[0]).toEqual({ ...first, retired: true });
  expect(getWorkspaceArtifact(db, original.id)?.deletedAt).not.toBeNull();
  // Restart/reopen uses persisted retirement, not a remembered JS object.
  const reopened = createLocalCommentFiles(db);
  const secondId = reopened.identity('p', 'a.html');
  expect(secondId).not.toBe(first.sourceFileId);
  await reopened.admit({ ...input, versionId: 'fresh-v2' });
  expect(cloud.state().files).toContainEqual({ ...first, retired: true });
  expect(cloud.state().files).toContainEqual({ ...first, sourceFileId: secondId, versionId: 'fresh-v2' });
  expect(cloud.run.mock.calls.every(([args]) => args[0] === 'team-projects')).toBe(true);
});
it('rename tracking includes only exact durable new-protocol UUID/path associations in this project', () => {
  const db = setup();
  const files = createLocalCommentFiles(db);
  const target = (filePath: string) => ({ filePath, elementId: 'hero', selector: '#hero', label: 'Hero',
    position: { x: 1, y: 2, width: 3, height: 4 } });
  const tracked = files.identity('p', 'offline.html');
  upsertPreviewComment(db, 'p', 'c', { sourceFileId: tracked, note: 'new protocol', target: target('offline.html') });
  files.identity('p', 'untracked.html'); // artifact existence alone does not fence ordinary rename
  upsertPreviewComment(db, 'p', 'c', { note: 'historical', target: target('historical.html') });
  files.identity('p', 'historical.html'); // no historical UUID guess
  const mismatch = files.identity('p', 'actual.html');
  upsertPreviewComment(db, 'p', 'c', { sourceFileId: mismatch, note: 'different path', target: target('wrong.html') });
  insertProject(db, { id: 'other', name: 'Other', createdAt: 1, updatedAt: 1 });
  insertConversation(db, { id: 'other-c', projectId: 'other', title: 'Other', createdAt: 1, updatedAt: 1 });
  const foreign = files.identity('other', 'foreign.html');
  upsertPreviewComment(db, 'other', 'other-c', { sourceFileId: foreign, note: 'foreign', target: target('foreign.html') });
  upsertPreviewComment(db, 'p', 'c', { sourceFileId: foreign, note: 'not this artifact', target: target('foreign.html') });
  expect(trackedCommentFilePaths(db, 'p')).toEqual(['offline.html']);
  expect(trackedCommentFilePaths(db, 'other')).toEqual(['foreign.html']);
});

it('cannot mint/admit creator facts as a commenting member', async () => {
  const db = setup();
  const cloud = catalog();
  await expect(createLocalCommentFiles(db).admit({ projectId: 'p', workspaceId: 'w', creatorMemberId: 'member',
    resourceId: 'root', versionId: 'v1', paths: [{ sourceFilePath: 'a.html', entryPath: 'a.html' }], run: cloud.run })).rejects.toThrow();
  expect(cloud.run).not.toHaveBeenCalled();
});
it('unknown file proof rolls back earlier row and member page cursor/ledger together', () => {
  const db = setup();
  const id = ensureWorkspaceArtifactForPath(db, { projectId: 'p', path: 'a.html', kind: 'html' }).id;
  const state: CommentFileState = { schemaVersion: 1, revision: 1, files: [{ sourceFileId: id, sourceFilePath: 'a.html', entryPath: 'a.html', resourceId: 'root', versionId: 'v1', retired: false }] };
  updateProject(db, 'p', { metadata: { _commentFiles: state } });
  const event = { id: 'known', projectId: 'p', conversationId: 'remote', memberId: 'm', seq: 1,
    sourceFileId: id, sourceFilePath: 'a.html', filePath: 'index.html', elementId: 'e', selector: '#e',
    label: 'E', text: '', htmlHint: '', note: 'N', position: { x: 0, y: 0, width: 1, height: 1 },
    authorKind: 'member', createdAt: 1, updatedAt: 2, status: 'open' } as CollabCloudComment;
  const page = parseMemberPage({ mode: 'snapshot', comments: [event, { ...event, id: 'unknown', sourceFileId: '22222222-2222-4222-8222-222222222222', seq: 2 }],
    hasMore: false, complete: true, nextPageToken: null, resumeToken: 'c3l1.r1', scopeToken: 'c3ls.scope',
    watermarkSeq: 2, scanThroughSeq: 2, handoff: { sinceSeq: 2, resumeToken: 'c3l1.r1', scopeToken: 'c3ls.scope' }, streamEpoch: 'epoch' }, 'snapshot', 'p');
  const store = createCommentInboundStore(db);
  const scope = { workspaceId: 'w', memberId: 'member', teamId: 'w', projectId: 'p' };
  expect(() => store.apply({ scope, query: { mode: 'snapshot' }, page, merge: incoming => {
    const normalized = normalizeCurrentFileComment(state, incoming);
    return normalized ? mergeSyncedPreviewComment(db, 'p', 'c', normalized) : 'unchanged';
  } })).toThrow('COMMENT_FILE_AUTHORITY_UNAVAILABLE');
  expect(getProjectPreviewComment(db, 'p', 'known')).toBeNull();
  expect(store.read(scope)).toBeNull();
  expect(db.prepare('SELECT COUNT(*) AS n FROM comment_member_sync_known').get()).toEqual({ n: 0 });
});

it('refreshes selected-backed UUID to explicit Team root without relinking its independent alias', async () => {
  const db = setup();
  const cloud = catalog();
  const files = createLocalCommentFiles(db);
  const id = files.identity('p', 'a.html');
  const common = { projectId: 'p', workspaceId: 'w', creatorMemberId: 'creator', run: cloud.run };
  await files.admit({ ...common, resourceId: 'selected', versionId: 'selected-v1', paths: [{ sourceFilePath: 'a.html', entryPath: 'index.html' }] });
  const publications = createSqlitePublicFilePublicationStore(db);
  const scope = { sourceFileId: id, projectId: 'p', resourceTeamId: 'w', ownerMemberId: 'creator', filePath: 'a.html' };
  publications.set(scope, { slug: 'selected-alias', url: null, fileName: 'a.html' });
  await files.admit({ ...common, resourceId: 'root', versionId: 'root-v1', paths: [{ sourceFilePath: 'a.html', entryPath: 'a.html' }] });
  expect(cloud.state().files).toEqual([{ sourceFileId: id, sourceFilePath: 'a.html', entryPath: 'a.html', resourceId: 'root', versionId: 'root-v1', retired: false }]);
  expect(files.identity('p', 'a.html')).toBe(id);
  expect(publications.get(scope)?.slug).toBe('selected-alias');
});
