import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import type { CollabCloudComment, CommentFileState } from '@open-design/contracts';
import { closeDatabase, openDatabase, insertProject, insertConversation, mergeSyncedPreviewComment, getProjectPreviewComment } from '../src/db.js';
import { ensureWorkspaceArtifactForPath } from '../src/chat-artifacts/store.js';
import { createCommentInboundStore } from '../src/collab/comment-inbound-store.js';
import { normalizeCurrentFileComment } from '../src/collab/comment-file-facts.js';
import { parseMemberPage } from '../src/integrations/collab-cloud.js';

it('advances a mixed page past unsupported identity-less wire rows without backfill or blocking modern comments', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'od-comment-mixed-page-'));
  try {
    const db = openDatabase(root, { dataDir: root });
    insertProject(db, { id: 'p', name: 'P', createdAt: 1, updatedAt: 1 });
    insertConversation(db, { id: 'c', projectId: 'p', title: 'C', createdAt: 1, updatedAt: 1 });
    const artifact = ensureWorkspaceArtifactForPath(db, { projectId: 'p', path: 'pages/a.html', kind: 'html' });
    const state: CommentFileState = { schemaVersion: 1, revision: 1, files: [{ sourceFileId: artifact.id,
      sourceFilePath: 'pages/a.html', entryPath: 'index.html', resourceId: 'root', versionId: 'v1', retired: false }] };
    const legacy: CollabCloudComment = { id: 'old-cloud', projectId: 'p', conversationId: 'remote', memberId: 'author', seq: 1,
      filePath: 'historical.html', elementId: 'hero', selector: '#hero', label: 'Hero', text: '', htmlHint: '', note: 'historical',
      position: { x: 0, y: 0, width: 1, height: 1 }, authorKind: 'member', status: 'open', createdAt: 1, updatedAt: 2 };
    mergeSyncedPreviewComment(db, 'p', 'c', { ...legacy, id: 'already-local' });
    const modern = { ...legacy, id: 'modern', seq: 2, note: 'current', filePath: 'index.html',
      sourceFileId: artifact.id, sourceFilePath: 'pages/a.html' };
    const page = parseMemberPage({ mode: 'snapshot', comments: [legacy, modern], hasMore: false, complete: true,
      nextPageToken: null, resumeToken: 'c3l1.r1', scopeToken: 'c3ls.scope', watermarkSeq: 2, scanThroughSeq: 2,
      handoff: { sinceSeq: 2, resumeToken: 'c3l1.r1', scopeToken: 'c3ls.scope' }, streamEpoch: 'epoch' }, 'snapshot', 'p');
    const store = createCommentInboundStore(db);
    const scope = { workspaceId: 'w', memberId: 'member', teamId: 'w', projectId: 'p' };
    expect(() => store.apply({ scope, query: { mode: 'snapshot' }, page, merge: incoming => {
      const normalized = normalizeCurrentFileComment(state, incoming);
      return normalized ? mergeSyncedPreviewComment(db, 'p', 'c', normalized) : 'unchanged';
    } })).not.toThrow();
    expect(store.read(scope)?.watermarkSeq).toBe(2);
    expect(getProjectPreviewComment(db, 'p', 'modern')).toMatchObject({ sourceFileId: artifact.id, filePath: 'pages/a.html', note: 'current' });
    expect(getProjectPreviewComment(db, 'p', 'old-cloud')).toBeNull();
    expect(getProjectPreviewComment(db, 'p', 'already-local')).toMatchObject({ filePath: 'historical.html', note: 'historical' });
    expect(getProjectPreviewComment(db, 'p', 'already-local')?.sourceFileId).toBeUndefined();
  } finally {
    closeDatabase();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
