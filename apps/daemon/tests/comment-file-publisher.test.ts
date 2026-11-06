import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import type { CommentFileMutation, CommentFileState } from '@open-design/contracts';
import { closeDatabase, openDatabase, insertProject, ensureWorkspaceProject, updateProject, getProject } from '../src/db.js';
import { ensureWorkspaceArtifactForPath, getWorkspaceArtifact } from '../src/chat-artifacts/store.js';
import { createLocalCommentFiles } from '../src/collab/local-comment-files.js';
import { createCommentFilePublisher } from '../src/collab/comment-file-publisher.js';

it('production publication policy retires missing original facts before upload, then admits only committed HTML roster receipts', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'od-comment-publisher-'));
  try {
    const db = openDatabase(root, { dataDir: root });
    const filesRoot = path.join(root, 'files');
    fs.mkdirSync(filesRoot);
    fs.writeFileSync(path.join(filesRoot, 'kept.HTML'), '<h1>Kept</h1>');
    fs.writeFileSync(path.join(filesRoot, 'extra.htm'), '<h1>New</h1>');
    fs.writeFileSync(path.join(filesRoot, 'image.png'), 'not HTML');
    insertProject(db, { id: 'p', name: 'P', createdAt: 1, updatedAt: 1 });
    ensureWorkspaceProject(db, { projectId: 'p', workspaceId: 'w', visibility: 'personal', createdByWorkspaceMemberId: 'creator', resourceHubResourceId: 'root' });
    const originals = ['kept.HTML', 'missing.html'].map(filePath => ({ sourceFileId: ensureWorkspaceArtifactForPath(db,
      { projectId: 'p', path: filePath, kind: 'html' }).id, sourceFilePath: filePath, entryPath: filePath,
      resourceId: 'root', versionId: 'v1', retired: false }));
    let remote: CommentFileState = { schemaVersion: 1, revision: 1, files: originals };
    updateProject(db, 'p', { metadata: { _commentFiles: remote } });
    const mutations: CommentFileMutation[] = [];
    const run = vi.fn(async (args: string[]) => {
      if (args[1] === 'upsert') {
        const mutation = JSON.parse(args[6] ?? '')._commentFiles as CommentFileMutation;
        mutations.push(mutation);
        expect(mutation.baseRevision).toBe(remote.revision);
        const map = new Map(remote.files.map(file => [file.sourceFileId, file]));
        for (const file of mutation.files) {
          const { receipt, ...entry } = file;
          map.set(file.sourceFileId, { ...entry, resourceId: receipt?.resourceId ?? mutation.resourceId, versionId: receipt?.versionId ?? mutation.versionId });
        }
        remote = { schemaVersion: 1, revision: remote.revision + 1, files: [...map.values()] };
      }
      return JSON.stringify({ projectId: 'p', workspaceId: 'w', ownerMemberId: 'creator', resourceId: 'root', metadata: { _commentFiles: remote } });
    });
    const policy = createCommentFilePublisher({ db, localFiles: createLocalCommentFiles(db), runForWorkspace: () => run,
      resolveRoot: async () => filesRoot, listFiles: folder => fs.promises.readdir(folder) });
    const result = { versionId: 'v2' };
    const publish = vi.fn(async () => {
      expect(remote.files.find(file => file.sourceFilePath === 'missing.html')).toMatchObject({ retired: true, versionId: 'v1' });
      expect(remote.files.find(file => file.sourceFilePath === 'kept.HTML')).toMatchObject({ retired: false, versionId: 'v1' });
      return result;
    });
    expect(await policy('p', { teamId: 'w', memberId: 'creator', role: 'member', lifecycleState: 'active' }, publish)).toBe(result);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(mutations).toHaveLength(2);
    expect(mutations[1]?.files.map(file => file.sourceFilePath).sort()).toEqual(['extra.htm', 'kept.HTML']);
    expect(remote.files.find(file => file.sourceFilePath === 'kept.HTML')).toMatchObject({ sourceFileId: originals[0]?.sourceFileId, versionId: 'v2', retired: false });
    expect(remote.files.find(file => file.sourceFilePath === 'missing.html')).toMatchObject({ sourceFileId: originals[1]?.sourceFileId, versionId: 'v1', retired: true });
    expect(remote.files.some(file => file.sourceFilePath === 'image.png')).toBe(false);
    expect(getProject(db, 'p')?.metadata?._commentFiles).toEqual(remote);
    const missing = originals[1];
    if (!missing) throw new Error('missing original');
    expect(getWorkspaceArtifact(db, missing.sourceFileId)?.deletedAt).not.toBeNull();
  } finally {
    closeDatabase();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
