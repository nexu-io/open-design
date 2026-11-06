import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { expect, it, vi } from 'vitest';
import type { CommentFileMutation, CommentFileState } from '@open-design/contracts';
import * as store from '../../src/db.js';
import * as projects from '../../src/projects.js';
import { registerImportRoutes } from '../../src/import-export-routes.js';
import { createCommentFileDeletion } from '../../src/collab/comment-file-deletion.js';
import { createLocalCommentFiles } from '../../src/collab/local-comment-files.js';
import { createPublicFileMutations } from '../../src/collab/public-file-mutations.js';
import { ensureWorkspaceArtifactForPath, getWorkspaceArtifact } from '../../src/chat-artifacts/store.js';
import { pendingCommentFileRetirements } from '../../src/collab/comment-file-retirements.js';

it.each(['local-rejection', 'remote-rejection'] as const)('working-root replacement retires after the local metadata commit, with exact retry: %s', async failure => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'od-rebind-retirement-'));
  let server: http.Server | undefined;
  try {
    const dataRoot = path.join(root, 'data');
    const projectsRoot = path.join(root, 'managed');
    const nextRoot = path.join(root, 'replacement');
    fs.mkdirSync(path.join(projectsRoot, 'p'), { recursive: true });
    fs.mkdirSync(nextRoot);
    fs.writeFileSync(path.join(projectsRoot, 'p', 'index.html'), 'original');
    fs.writeFileSync(path.join(nextRoot, 'index.html'), 'replacement');
    fs.writeFileSync(path.join(projectsRoot, 'p', 'b.html'), 'old local-only file');
    fs.writeFileSync(path.join(nextRoot, 'b.html'), 'different replacement file');
    const db = store.openDatabase(dataRoot, { dataDir: dataRoot });
    store.insertProject(db, { id: 'p', name: 'P', createdAt: 1, updatedAt: 1 });
    store.ensureWorkspaceProject(db, { projectId: 'p', workspaceId: 'w', visibility: 'personal', createdByWorkspaceMemberId: 'creator', resourceHubResourceId: 'root' });
    const local = createLocalCommentFiles(db);
    const oldId = ensureWorkspaceArtifactForPath(db, { projectId: 'p', path: 'index.html', kind: 'html' }).id;
    const localOnlyId = local.identity('p', 'b.html');
    store.insertConversation(db, { id: 'c', projectId: 'p', title: 'C', createdAt: 1, updatedAt: 1 });
    const localNote = store.upsertPreviewComment(db, 'p', 'c', { sourceFileId: localOnlyId,
      authorMemberId: 'creator', note: 'belongs only to the old root', target: { filePath: 'b.html',
        elementId: 'hero', selector: '#hero', label: 'Hero', position: { x: 0, y: 0, width: 1, height: 1 } } });
    if (!localNote) throw new Error('missing local note');
    let replacementLocalId: string | undefined;
    const fact = { sourceFileId: oldId, sourceFilePath: 'index.html', entryPath: 'index.html', resourceId: 'selected', versionId: 'v1', retired: false };
    let catalog: CommentFileState = { schemaVersion: 1, revision: 1, files: [fact] };
    store.updateProject(db, 'p', { metadata: { unrelated: 'keep', _commentFiles: catalog } });
    let rejectLocal = failure === 'local-rejection';
    let rejectRemote = failure === 'remote-rejection';
    const run = vi.fn(async (args: string[]) => {
      // Even the first authority read must follow committed local replacement.
      expect(store.getProject(db, 'p')?.metadata?.baseDir).toBe(fs.realpathSync(nextRoot));
      if (rejectRemote) throw new Error('offline');
      if (args[1] === 'upsert') {
        const mutation = JSON.parse(args[6]!)._commentFiles as CommentFileMutation;
        expect(mutation.files).toEqual([{ sourceFileId: oldId, sourceFilePath: 'index.html', entryPath: 'index.html', retired: true }]);
        catalog = { schemaVersion: 1, revision: 2, files: [{ ...fact, retired: true }] };
      }
      return JSON.stringify({ projectId: 'p', workspaceId: 'w', ownerMemberId: 'creator', resourceId: 'root', metadata: { _commentFiles: catalog } });
    });
    const stopPublicFiles = vi.fn(async () => {});
    const deletion = createCommentFileDeletion({ db, localFiles: local, hasActiveRun: () => false,
      stopPublicFiles, runForWorkspace: () => run, isPresent: async () => true });
    const app = express(); app.use(express.json());
    registerImportRoutes(app, {
      db, publicFileMutations: createPublicFileMutations(), stopPublicFilesBeforeDelete: deletion,
      enforceWorkspaceProjectMutation: async () => true,
      http: { sendApiError: (res: express.Response, status: number, code: string) => res.status(status).json({ error: code }) },
      uploads: { importUpload: { single: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next() } },
      node: { fs, path }, ids: {}, paths: { PROJECTS_DIR: projectsRoot, RUNTIME_DATA_DIR_CANONICAL: dataRoot },
      imports: projects, auth: { isDesktopAuthGateActive: () => false }, conversations: {}, validation: {},
      projectFiles: { setTabs: store.setTabs },
      projectStore: { ...store, updateProject: (...args: Parameters<typeof store.updateProject>) => {
        if (rejectLocal) throw new Error('local metadata write rejected');
        return store.updateProject(...args);
      } },
    } as unknown as Parameters<typeof registerImportRoutes>[1]);
    server = app.listen(0); await new Promise<void>(resolve => server!.once('listening', resolve));
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('missing port');
    const replace = () => fetch(`http://127.0.0.1:${address.port}/api/projects/p/working-dir`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ baseDir: nextRoot }),
    });
    expect((await replace()).status).toBe(400);
    expect(catalog.files).toEqual([fact]);
    if (rejectLocal) {
      expect(run).not.toHaveBeenCalled();
      expect(pendingCommentFileRetirements(db, 'p')).toEqual([]);
      expect(local.identity('p', 'index.html')).toBe(oldId);
      expect(store.getProject(db, 'p')?.metadata?.baseDir).toBeUndefined();
      expect(getWorkspaceArtifact(db, localOnlyId)?.deletedAt).toBeNull();
      expect(local.identity('p', 'b.html')).toBe(localOnlyId);
      expect(store.listPreviewComments(db, 'p', 'c').some(note => note.id === localNote.id)).toBe(true);
    } else {
      expect(pendingCommentFileRetirements(db, 'p')[0]?.committed).toBe(true);
      expect(() => local.identity('p', 'index.html')).toThrow('COMMENT_FILE_RETIREMENT_PENDING');
      expect.soft(getWorkspaceArtifact(db, localOnlyId)?.deletedAt).not.toBeNull();
      replacementLocalId = local.identity('p', 'b.html');
      expect.soft(replacementLocalId).not.toBe(localOnlyId);
      expect.soft(store.listPreviewComments(db, 'p', 'c').some(note => note.id === localNote.id)).toBe(false);
    }
    rejectLocal = false; rejectRemote = false;
    expect((await replace()).status).toBe(200);
    expect(catalog.files).toEqual([{ ...fact, retired: true }]);
    expect(pendingCommentFileRetirements(db, 'p')).toEqual([]);
    expect(local.identity('p', 'index.html')).not.toBe(oldId);
    expect(getWorkspaceArtifact(db, localOnlyId)?.deletedAt).not.toBeNull();
    expect(local.identity('p', 'b.html')).not.toBe(localOnlyId);
    if (replacementLocalId) expect(local.identity('p', 'b.html')).toBe(replacementLocalId);
    // A metadata-only retry finishes captured retirement, not another broad
    // stop of links published for genuine new-root files since the first call.
    expect(stopPublicFiles).toHaveBeenCalledTimes(failure === 'remote-rejection' ? 1 : 2);
    expect(store.listPreviewComments(db, 'p', 'c').some(note => note.id === localNote.id)).toBe(false);
    expect(store.getProject(db, 'p')?.metadata?.unrelated).toBe('keep');
    expect(store.getProject(db, 'p')?.metadata?._commentFiles).toEqual(catalog);
  } finally {
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    store.closeDatabase();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
