import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import type { CollabCloudComment } from '@open-design/contracts';
import { closeDatabase, openDatabase, insertProject, insertConversation, mergeSyncedPreviewComment, getProjectPreviewComment, listProjectPreviewComments, updateProject } from '../src/db.js';

let dir: string | undefined;
afterEach(() => { closeDatabase(); if (dir) fs.rmSync(dir, { recursive: true, force: true }); });
const f1 = '11111111-1111-4111-8111-111111111111';
const f2 = '22222222-2222-4222-8222-222222222222';
function setup() {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-comment-lifetime-'));
  const db = openDatabase(dir);
  insertProject(db, { id: 'p', name: 'P', createdAt: 1, updatedAt: 1 });
  insertConversation(db, { id: 'c', projectId: 'p', title: 'C', createdAt: 1, updatedAt: 1 });
  return db;
}
function event() {
  return { id: 'new', projectId: 'p', conversationId: 'remote', memberId: 'member', seq: 1,
    sourceFileId: f1, sourceFilePath: 'pages/a.html', filePath: 'pages/a.html',
    elementId: 'a', selector: '#a', label: 'A', text: 'A', htmlHint: '<h1>',
    note: 'before first share', position: { x: 1, y: 2, width: 3, height: 4 },
    status: 'open', authorKind: 'member', authorKey: 'actor', createdAt: 10, updatedAt: 20 } as CollabCloudComment;
}
it('persists immutable source identity without a local publication or alias; preserves author/time/anchor', () => {
  const db = setup();
  mergeSyncedPreviewComment(db, 'p', 'c', event());
  expect(getProjectPreviewComment(db, 'p', 'new')).toMatchObject({ sourceFileId: f1,
    filePath: 'pages/a.html', authorMemberId: 'member', authorKey: 'actor', createdAt: 10,
    updatedAt: 20, selector: '#a', note: 'before first share' });
});
it('current-file lists exclude F1 after retirement and same-path F2 admission', () => {
  const db = setup();
  mergeSyncedPreviewComment(db, 'p', 'c', event());
  updateProject(db, 'p', { metadata: { _commentFiles: { schemaVersion: 1, revision: 2, files: [
    { sourceFileId: f1, sourceFilePath: 'pages/a.html', entryPath: 'pages/a.html', resourceId: 'root', versionId: 'v1', retired: true },
    { sourceFileId: f2, sourceFilePath: 'pages/a.html', entryPath: 'pages/a.html', resourceId: 'root', versionId: 'v2', retired: false },
  ] } } });
  expect(listProjectPreviewComments(db, 'p')).toEqual([]);
  expect(getProjectPreviewComment(db, 'p', 'new')).not.toBeNull();
});
