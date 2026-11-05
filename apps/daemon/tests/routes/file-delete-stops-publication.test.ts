import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import nodeFs from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { expect, it } from 'vitest';
import { openDatabase, closeDatabase, insertProject, ensureWorkspaceProject, getProject, getWorkspaceProject, getWorkspaceProjectByProjectId, updateProject } from '../../src/db.js';
import type { CommentFileMutation, CommentFileState } from '@open-design/contracts';
import { createCommentFileDeletion } from '../../src/collab/comment-file-deletion.js';
import { createLocalCommentFiles } from '../../src/collab/local-comment-files.js';
import { ensureWorkspaceArtifactForPath, getWorkspaceArtifact } from '../../src/chat-artifacts/store.js';
import * as projectFiles from '../../src/projects.js';
import { registerProjectFileRoutes } from '../../src/routes/project/index.js';
import { createSqlitePublicFilePublicationStore } from '../../src/collab/public-file-publication-store.js';
import { createProjectPublicFileStop } from '../../src/collab/project-public-file-stop.js';
import { createPublicFileMutations } from '../../src/collab/public-file-mutations.js';
import { workspaceContextFromDirectoryItem } from '../../src/collab/vela-workspace-context.js';

it.each(['raw', 'files'] as const)('DELETE %s stops only the selected publication before deleting actual bytes', async route => {
  await exercise(route, false);
});
it('failed stop preserves file bytes and durably records the exact residual', async () => {
  await exercise('raw', true);
});
it.each(['raw', 'files'] as const)('DELETE %s conceals internal paths in HTTP and CLI failures', async route => {
  await exercise(route, false, true);
});
it.each(['raw', 'files'] as const)('DELETE %s filesystem EACCES leaves F1 live, retry retires only after unlink', async route => {
  await exercise(route, false, false, true);
});
it.each(['raw', 'files'] as const)('DELETE %s post-unlink authority failure freezes old F1 until exact retry', async route => {
  await exercise(route, false, false, false, true);
});
async function exercise(route: 'raw' | 'files', fail: boolean, missing = false, fsReject = false, remoteReject = false) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-file-stop-'));
  const projects = path.join(root, 'projects');
  const db = openDatabase(root);
  let server: http.Server | undefined;
  try {
    const projectId = 'project';
    const scope = { resourceTeamId: 'workspace', ownerMemberId: 'owner', projectId };
    insertProject(db, { id: projectId, name: 'Deletion', createdAt: 1, updatedAt: 1 });
    ensureWorkspaceProject(db, { projectId, workspaceId: scope.resourceTeamId, visibility: 'personal', createdByWorkspaceMemberId: scope.ownerMemberId });
    await fs.mkdir(path.join(projects, projectId), { recursive: true });
    for (const file of ['index.html', 'sibling.html']) await fs.writeFile(path.join(projects, projectId, file), file);
    const store = createSqlitePublicFilePublicationStore(db);
    for (const filePath of ['index.html', 'sibling.html']) store.set({ ...scope, filePath }, { slug: filePath, fileName: filePath, url: null });
    const remote = new Set(['index.html', 'sibling.html']);
    const stop = createProjectPublicFileStop(store, async key => ({ ...scope, stop: async () => {
      expect(await fs.readFile(path.join(projects, projectId, key.filePath), 'utf8')).toBe(key.filePath);
      if (fail) throw new Error('offline');
      remote.delete(key.filePath);
    } }));
    const local = createLocalCommentFiles(db);
    const facts = ['index.html', 'sibling.html'].map(filePath => ({ sourceFileId: ensureWorkspaceArtifactForPath(db,
      { projectId, path: filePath, kind: 'html' }).id, sourceFilePath: filePath, entryPath: filePath,
      resourceId: 'root', versionId: 'v1', retired: false }));
    let catalog: CommentFileState = { schemaVersion: 1, revision: 1, files: facts };
    updateProject(db, projectId, { metadata: { _commentFiles: catalog } });
    let retirementRequests = 0;
    let authorityOffline = remoteReject;
    const deletion = createCommentFileDeletion({ db, localFiles: local, hasActiveRun: () => false,
      isPresent: async (_id, filePath) => fs.stat(path.join(projects, projectId, filePath)).then(() => true, error => {
        if (error.code === 'ENOENT') return false; throw error;
      }), stopPublicFiles: (key, target) => stop(key, target), runForWorkspace: () => async args => {
        if (authorityOffline) throw new Error('offline catalog');
        if (args[1] === 'upsert') {
          retirementRequests++;
          const mutation = JSON.parse(args[6]!)._commentFiles as CommentFileMutation;
          catalog = { schemaVersion: 1, revision: catalog.revision + 1, files: catalog.files.map(fact =>
            mutation.files.some(entry => entry.sourceFileId === fact.sourceFileId) ? { ...fact, retired: true } : fact) };
        }
        return JSON.stringify({ projectId, workspaceId: scope.resourceTeamId, ownerMemberId: scope.ownerMemberId,
          resourceId: 'root', metadata: { _commentFiles: catalog } });
      } });
    let rejectUnlink = fsReject;
    const app = express(); app.use(express.json());
    registerProjectFileRoutes(app, {
      db, paths: { PROJECTS_DIR: projects }, http: { sendApiError: (res: express.Response, status: number, code: string, message: string) => res.status(status).json({ error: { code, message } }) },
      projectStore: { getProject, getWorkspaceProject, getWorkspaceProjectByProjectId }, projectFiles: { ...projectFiles,
        deleteProjectFile: async (...args: Parameters<typeof projectFiles.deleteProjectFile>) => {
          if (rejectUnlink) throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
          await projectFiles.deleteProjectFile(...args);
        },
      },
      node: { fs: nodeFs }, uploads: {}, documents: {}, artifacts: {}, projectPreviewScopes: {},
      publicFileMutations: createPublicFileMutations(),
      stopPublicFilesBeforeDelete: deletion,
      verifyWorkspaceRequestAuthority: async () => ({ ok: true, context: workspaceContextFromDirectoryItem({ workspaceId: scope.resourceTeamId, workspaceMemberId: scope.ownerMemberId, workspaceName: 'W', workspaceType: 'personal', role: 'owner', memberStatus: 'active', lifecycleState: 'active' }) }),
    } as unknown as Parameters<typeof registerProjectFileRoutes>[1]);
    server = app.listen(0); await new Promise<void>(resolve => server!.once('listening', resolve));
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('missing port');
    if (missing) {
      const base = `http://127.0.0.1:${address.port}`;
      const response = await fetch(`${base}/api/projects/${projectId}/${route}/missing.html`, { method: 'DELETE', headers: { 'x-od-workspace-id': scope.resourceTeamId, 'x-od-workspace-member-id': scope.ownerMemberId } });
      expect(response.status).toBe(404);
      const text = await response.text();
      expect.soft(text).not.toContain(root);
      expect.soft(JSON.parse(text)).toEqual({ error: { code: 'FILE_NOT_FOUND', message: 'file not found' } });
      if (route === 'files') {
        const env = { ...process.env }; delete env.NODE_OPTIONS;
        const result = await promisify(execFile)(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('../../src/cli.ts', import.meta.url)), 'files', 'delete', projectId, 'missing.html', '--workspace', scope.resourceTeamId, '--workspace-member', scope.ownerMemberId, '--daemon-url', base, '--json'], { env, timeout: 15000 }).then(
          value => ({ ...value, code: 0 }),
          (error: { stdout: string; stderr: string; code: number }) => error,
        );
        expect(result.code).not.toBe(0);
        expect(result.stdout).toBe('');
        expect.soft(result.stderr).not.toContain(root);
        expect.soft(JSON.parse(result.stderr)).toMatchObject({ error: { code: 'FILE_NOT_FOUND', message: 'file not found' } });
      }
      expect(remote.size).toBe(2);
      return;
    }
    const response = await fetch(`http://127.0.0.1:${address.port}/api/projects/${projectId}/${route}/index.html`, { method: 'DELETE', headers: { 'x-od-workspace-id': scope.resourceTeamId, 'x-od-workspace-member-id': scope.ownerMemberId } });
    expect(response.status).toBe(fail || fsReject || remoteReject ? 400 : 200);
    if (fsReject || remoteReject) {
      expect(retirementRequests).toBe(0);
      expect(catalog.files).toEqual(facts);
      if (fsReject) expect(getWorkspaceArtifact(db, facts[0]!.sourceFileId)?.deletedAt).toBeNull();
      else expect(getWorkspaceArtifact(db, facts[0]!.sourceFileId)?.deletedAt).not.toBeNull();
      if (fsReject) {
        expect(await fs.readFile(path.join(projects, projectId, 'index.html'), 'utf8')).toBe('index.html');
        expect(local.identity(projectId, 'index.html')).toBe(facts[0]!.sourceFileId);
      } else {
        expect(() => local.identity(projectId, 'index.html')).toThrow('COMMENT_FILE_RETIREMENT_PENDING');
        await expect(fs.stat(path.join(projects, projectId, 'index.html'))).rejects.toMatchObject({ code: 'ENOENT' });
      }
      rejectUnlink = false;
      authorityOffline = false;
      const retry = await fetch(`http://127.0.0.1:${address.port}/api/projects/${projectId}/${route}/index.html`, { method: 'DELETE', headers: { 'x-od-workspace-id': scope.resourceTeamId, 'x-od-workspace-member-id': scope.ownerMemberId } });
      expect(retry.status).toBe(200);
      expect(retirementRequests).toBe(1);
      expect(catalog.files).toEqual(facts.map((fact, index) => ({ ...fact, retired: index === 0 })));
      expect(local.identity(projectId, 'index.html')).not.toBe(facts[0]!.sourceFileId);
      expect(local.identity(projectId, 'sibling.html')).toBe(facts[1]!.sourceFileId);
      return;
    }
    expect(remote.has('index.html')).toBe(fail);
    expect(remote.has('sibling.html')).toBe(true);
    expect(store.get({ ...scope, filePath: 'sibling.html' })).not.toBeNull();
    if (fail) {
      expect(await fs.readFile(path.join(projects, projectId, 'index.html'), 'utf8')).toBe('index.html');
      expect(store.listStops()).toEqual([expect.objectContaining({ ...scope, filePath: 'index.html', slug: 'index.html', failureCount: 1 })]);
    } else {
      await expect(fs.stat(path.join(projects, projectId, 'index.html'))).rejects.toMatchObject({ code: 'ENOENT' });
      expect(store.get({ ...scope, filePath: 'index.html' })).toBeNull();
    }
  } finally {
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    closeDatabase(); await fs.rm(root, { recursive: true, force: true });
  }
}
