import type { PrepareCommentIdentityResponse, ProjectFileVersionResponse, ProjectFileResponse } from '@open-design/contracts';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import nodeFs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import { createCollabRuntime } from '../../src/collab/runtime.js';
import { registerCollabSyncRoutes } from '../../src/routes/collab-sync.js';
import { createSqlitePublicFilePublicationStore } from '../../src/collab/public-file-publication-store.js';
import { createPublicSharePublishingFixture } from '../public-share-publishing-fixture.js';
import { expect, it, vi } from 'vitest';
import { openDatabase, closeDatabase, insertProject, ensureWorkspaceProject, getProject, getWorkspaceProject, getWorkspaceProjectByProjectId } from '../../src/db.js';
import * as projectFiles from '../../src/projects.js';
import { registerProjectFileRoutes } from '../../src/routes/project/index.js';
import { workspaceContextFromDirectoryItem } from '../../src/collab/vela-workspace-context.js';
import { listProjectFileVersions } from '../../src/project-file-versions.js';

it.each(['personal', 'team'] as const)('explicit HTTP/CLI preparation uses %s write authority, real source save/readback, conflict and retry', async (visibility) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-comment-source-http-'));
  const projects = path.join(root, 'projects');
  const db = openDatabase(root);
  let server: http.Server | undefined;
  let busy = false;
  let authorityMode: 'normal' | 'unavailable' | 'reader' | 'locked' = 'normal';
  try {
    for (const id of ['project', 'other']) {
      insertProject(db, { id, name: id, createdAt: 1, updatedAt: 1 });
      ensureWorkspaceProject(db, { projectId: id, workspaceId: id === 'project' ? 'workspace' : 'foreign', visibility, createdByWorkspaceMemberId: 'owner' });
      await projectFiles.ensureProject(projects, id);
      await projectFiles.writeProjectFile(projects, id, 'index.html', Buffer.from('<h2 data-od-id="tool">A</h2><p>C</p>'));
    }
    const app = express(); app.use(express.json());
    // SAFETY: only routes exercised below use these supplied production dependencies.
    registerProjectFileRoutes(app, {
      db, paths: { PROJECTS_DIR: projects },
      http: { sendApiError: (res: express.Response, status: number, code: string, message: string) => res.status(status).json({ error: { code, message } }) },
      projectStore: { getProject, getWorkspaceProject, getWorkspaceProjectByProjectId },
      projectFiles: {
        ...projectFiles,
        // A passthrough preserves real saves while letting the test interpose
        // after route registration (the registrar otherwise captures a reference).
        writeProjectFile: (...args: Parameters<typeof projectFiles.writeProjectFile>) => projectFiles.writeProjectFile(...args),
      },
      node: { fs: nodeFs }, uploads: { upload: multer() }, documents: {}, artifacts: {}, projectPreviewScopes: {},
      isProjectEditingBusy: () => busy,
      verifyWorkspaceRequestAuthority: async (req: express.Request) => authorityMode === 'unavailable'
        ? { ok: false, status: 503, code: 'WORKSPACE_AUTHORITY_UNAVAILABLE', message: 'Fixture authority unavailable' }
        : { ok: true, context: workspaceContextFromDirectoryItem({
          workspaceId: 'workspace', workspaceMemberId: authorityMode === 'reader' ? 'reader' : req.get('x-od-workspace-member-id') ?? '', workspaceName: 'W', workspaceType: visibility,
          role: authorityMode !== 'reader' && req.get('x-od-workspace-member-id') === 'owner' ? 'owner' : 'member', memberStatus: 'active', lifecycleState: authorityMode === 'locked' ? 'locked' : 'active',
        }) },
    } as unknown as Parameters<typeof registerProjectFileRoutes>[1]);
    const ownerContext = workspaceContextFromDirectoryItem({ workspaceId: 'workspace', workspaceMemberId: 'owner', workspaceName: 'W', workspaceType: visibility, role: 'owner', memberStatus: 'active', lifecycleState: 'active' });
    const publicationStore = createSqlitePublicFilePublicationStore(db);
    const uploadOptions = { failUpload: true };
    const uploaded: string[] = [];
    registerCollabSyncRoutes(app, {
      collab: createCollabRuntime({ workspaceContext: { current: async () => ownerContext } }),
      publicFilePublicationStore: publicationStore,
      ...createPublicSharePublishingFixture(db, publicationStore, async (args) => {
        uploaded.push(await fs.readFile(path.join(args[3]!, 'index.html'), 'utf8'));
        return JSON.stringify({ id: 'v1', version: 1 });
      }, undefined, uploadOptions),
      verifyWorkspaceRequest: async (req) => req.get('x-od-workspace-member-id') === 'owner' ? ownerContext : null,
      resolveSharedProject: async (projectId) => ({ projectId, ownerMemberId: 'owner', sharedAt: new Date(1).toISOString() }),
      resolveProjectDir: async (projectId) => path.join(projects, projectId),
    });
    server = app.listen(0); await new Promise<void>((resolve) => server!.once('listening', resolve));
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('missing port');
    const base = `http://127.0.0.1:${address.port}`;
    const requestHttp = (url: string, options: RequestInit) => fetch(url, { ...options, signal: AbortSignal.timeout(5_000) });
    const endpoint = `${base}/api/projects/project/files/index.html/comment-identities/prepare`;
    const headers = (member = 'owner') => ({ 'content-type': 'application/json', 'x-od-workspace-id': 'workspace', 'x-od-workspace-member-id': member });
    const source = await fs.readFile(path.join(projects, 'project/index.html'), 'utf8');
    const prepare = (body: unknown, member = 'owner', url = endpoint) => requestHttp(url, { method: 'POST', headers: headers(member), body: JSON.stringify(body) });
    const request = { expectedSource: source, editingSettled: true };
    // Ordinary raw preview does not prepare or create history.
    expect((await requestHttp(`${base}/api/projects/project/raw/index.html`, { headers: headers() })).status).toBe(200);
    expect(await listProjectFileVersions(projects, 'project', 'index.html')).toHaveLength(0);
    const beforeProbe = await fs.readdir(path.join(projects, 'project'), { recursive: true });
    const passive = await requestHttp(`${base}/api/projects/project/files/index.html/versions?bootstrap=0`, { headers: headers() });
    expect(passive.status).toBe(200);
    expect((await passive.json() as { versions: unknown[] }).versions).toEqual([]);
    expect(await listProjectFileVersions(projects, 'project', 'index.html')).toHaveLength(0);
    expect(await fs.readdir(path.join(projects, 'project'), { recursive: true })).toEqual(beforeProbe);
    expect(await fs.readFile(path.join(projects, 'project/index.html'), 'utf8')).toBe(source);
    // The existing explicit history workflow keeps its default bootstrap behavior.
    await projectFiles.writeProjectFile(projects, 'project', 'default.html', Buffer.from('<p>Baseline</p>'));
    const defaultHistory = await requestHttp(`${base}/api/projects/project/files/default.html/versions`, { headers: headers() });
    expect(defaultHistory.status).toBe(200);
    expect((await defaultHistory.json() as { versions: unknown[] }).versions).toHaveLength(1);
    expect((await prepare(request, 'reader')).status).toBe(403);
    expect((await requestHttp(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) })).status).toBe(403);
    expect((await prepare(request, 'owner', `${base}/api/projects/other/files/index.html/comment-identities/prepare`)).status).toBe(403);
    authorityMode = 'reader';
    expect((await requestHttp(endpoint, { method: 'POST', headers: { ...headers(), 'x-od-workspace-role': 'owner', 'x-od-workspace-can-write-synced-files': 'true' }, body: JSON.stringify(request) })).status).toBe(403);
    authorityMode = 'locked';
    expect((await prepare(request)).status).toBe(403);
    authorityMode = 'unavailable';
    expect((await prepare(request)).status).toBe(503);
    authorityMode = 'normal';
    busy = true;
    expect((await prepare(request)).status).toBe(409);
    busy = false;
    expect((await prepare({ ...request, editingSettled: false })).status).toBe(409);
    expect((await prepare({ ...request, expectedSource: 'stale' })).status).toBe(409);
    expect(await fs.readFile(path.join(projects, 'project/index.html'), 'utf8')).toBe(source);
    const success = await prepare(request);
    expect(success.status).toBe(200);
    const result = await success.json() as PrepareCommentIdentityResponse;
    expect(result.changed).toBe(true);
    expect(result.source.replace(/ data-od-comment-id="[^"]+"/g, '')).toBe(source);
    expect(await fs.readFile(path.join(projects, 'project/index.html'), 'utf8')).toBe(result.source);
    const version = await requestHttp(`${base}/api/projects/project/files/index.html/versions/${result.version.id}`, { headers: headers() });
    expect((await version.json() as ProjectFileVersionResponse).content).toBe(result.source);
    const expectedPath = path.join(root, 'expected.html'); await fs.writeFile(expectedPath, result.source);
    const cli = await promisify(execFile)(process.execPath, [path.resolve('dist/cli.js'), 'files', 'prepare-comments', 'project', 'index.html', '--daemon-url', base, '--workspace', 'workspace', '--workspace-member', 'owner', '--prompt-file', expectedPath, '--json'], { timeout: 5_000 });
    expect(JSON.parse(cli.stdout)).toMatchObject({ changed: false, version: { id: result.version.id } });
    expect(await listProjectFileVersions(projects, 'project', 'index.html')).toHaveLength(1);
    // D3: real publish/save HTTP boundaries, failing only the external upload transport.
    const publishUrl = `${base}/api/projects/project/files/index.html/publish-public`;
    const failedPublish = await requestHttp(publishUrl, { method: 'POST', headers: headers() });
    expect(failedPublish.status).toBe(502);
    await failedPublish.arrayBuffer();
    expect(await fs.readFile(path.join(projects, 'project/index.html'), 'utf8')).toBe(result.source);
    const edited = result.source.replace('>A<', '>Later edit<');
    // D2: hold the actual JSON source save inside its version lock, then allow
    // preparation to read the old source and queue on that same real boundary.
    const realSave = projectFiles.writeProjectFile; const realRead = projectFiles.readProjectFile;
    let releaseSave!: () => void; let signalSave!: () => void; let signalRead!: () => void;
    const saveGate = new Promise<void>((r) => { releaseSave = r; });
    const saveEntered = new Promise<void>((r) => { signalSave = r; });
    const prepareRead = new Promise<void>((r) => { signalRead = r; });
    vi.spyOn(projectFiles, 'writeProjectFile').mockImplementationOnce(async (...args) => {
      signalSave(); await saveGate; return realSave(...args);
    });
    const saving = requestHttp(`${base}/api/projects/project/files`, { method: 'POST', headers: headers(), body: JSON.stringify({ name: 'index.html', content: edited, versionSource: 'manual' }) });
    await saveEntered;
    vi.spyOn(projectFiles, 'readProjectFile').mockImplementation(async (...args) => {
      const file = await realRead(...args); signalRead(); return file;
    });
    const stalePrepare = prepare({ editingSettled: true, expectedSource: result.source });
    await prepareRead;
    releaseSave();
    const save = await saving;
    expect((await stalePrepare).status).toBe(409);
    vi.restoreAllMocks();
    expect(save.status).toBe(200);
    expect((await save.json() as ProjectFileResponse).version?.id).not.toBe(result.version.id);
    uploadOptions.failUpload = false;
    const published = await requestHttp(publishUrl, { method: 'POST', headers: headers() });
    expect(published.status).toBe(200);
    await published.arrayBuffer();
    expect(uploaded).toEqual([edited]);
    expect(await fs.readFile(path.join(projects, 'project/index.html'), 'utf8')).toBe(edited);
    const retry = await prepare({ editingSettled: true, expectedSource: edited });
    expect((await retry.json() as PrepareCommentIdentityResponse).changed).toBe(false);
    expect(await listProjectFileVersions(projects, 'project', 'index.html')).toHaveLength(2);
  } finally {
    vi.restoreAllMocks();
    if (server) await new Promise<void>((resolve) => { server!.close(() => resolve()); server!.closeAllConnections(); });
    closeDatabase(); await fs.rm(root, { recursive: true, force: true });
  }
});
