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
import { openDatabase, closeDatabase, insertProject, ensureWorkspaceProject, getProject, getWorkspaceProject, getWorkspaceProjectByProjectId } from '../../src/db.js';
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
async function exercise(route: 'raw' | 'files', fail: boolean, missing = false) {
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
    const app = express(); app.use(express.json());
    registerProjectFileRoutes(app, {
      db, paths: { PROJECTS_DIR: projects }, http: { sendApiError: (res: express.Response, status: number, code: string, message: string) => res.status(status).json({ error: { code, message } }) },
      projectStore: { getProject, getWorkspaceProject, getWorkspaceProjectByProjectId }, projectFiles,
      node: { fs: nodeFs }, uploads: {}, documents: {}, artifacts: {}, projectPreviewScopes: {},
      publicFileMutations: createPublicFileMutations(),
      stopPublicFilesBeforeDelete: (id: string, filePath?: string) => stop({ ...scope, projectId: id }, filePath),
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
    expect(response.status).toBe(fail ? 400 : 200);
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
