// ---------------------------------------------------------------------------
// GUARDRAIL: the file-mutation routes keep workspace-artifact identity in sync.
//
// `renameWorkspaceArtifactPath` and `deleteWorkspaceArtifact` are unit-tested
// in `chat-artifacts-store.test.ts`. Nothing tested that a route ever CALLS
// them, and all three call sites sit inside a `try { … } catch { console.warn }`
// — so deleting the call, or throwing inside it, produced a green suite and a
// silently wrong workspace pointer:
//
//   * rename not followed  -> a card's click target still names the old path,
//                             which no longer exists.
//   * delete not tombstoned -> the identity stays live at a freed path, so a
//                             later file that takes the name inherits the
//                             deleted file's history instead of getting a
//                             fresh identity.
//
// Both delete routes are covered. They are separate handlers over the same
// bookkeeping (`/files/:name` and the `/raw/*` splat), so one can lose the call
// while the other keeps it.
// ---------------------------------------------------------------------------

import type http from 'node:http';
import { buildWorkspacePermissions, buildWorkspaceSeatSummary, type PreviewComment, type WorkspaceCollabContext } from '@open-design/contracts';
import express from 'express';
import { createServer } from 'node:http';
import { registerCollabSyncRoutes } from '../src/routes/collab-sync.js';
import { createCollabRuntime } from '../src/collab/runtime.js';
import { createPublicSharePublishingFixture } from './public-share-publishing-fixture.js';
import { mkdir, writeFile, mkdtemp, rm, readFile, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';
import { closeDatabase, openDatabase, updateProject, getProject, ensureWorkspaceProject, getProjectPreviewComment } from '../src/db.js';
import { createLocalCommentFiles } from '../src/collab/local-comment-files.js';
import { createSqlitePublicFilePublicationStore } from '../src/collab/public-file-publication-store.js';
import { createPublicFilePublicationRecorder } from '../src/collab/public-file-publication-recording.js';
import { enqueuePublishedFileComments } from '../src/collab/published-file-comment-backfill.js';
import { createCommentRelayOutboxStore } from '../src/collab/comment-relay-outbox.js';
import {
  ensureWorkspaceArtifactForPath,
  getWorkspaceArtifact,
  getLiveWorkspaceArtifactByPath,
} from '../src/chat-artifacts/store.js';

const projectId = 'proj-file-route-wiring';

describe('file mutation routes move workspace artifact identity', () => {
  let server: http.Server;
  let baseUrl: string;
  let dataDir: string;
  let projectDir: string;
  let conversationId: string;

  beforeAll(async () => {
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
    dataDir = process.env.OD_DATA_DIR!;
    const created = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: projectId, name: projectId }),
    });
    expect(created.status).toBe(200);
    conversationId = ((await created.json()) as { conversationId: string }).conversationId;
    projectDir = path.join(dataDir, 'projects', projectId);
    await mkdir(projectDir, { recursive: true });
  }, 60_000);

  afterAll(async () => {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    closeDatabase();
  });

  async function seedFileWithIdentity(name: string): Promise<string> {
    await writeFile(path.join(projectDir, name), Buffer.from(`bytes-for-${name}`, 'utf8'));
    const db = openDatabase(dataDir, { dataDir });
    const row = ensureWorkspaceArtifactForPath(db, {
      projectId,
      path: name,
      kind: 'html',
    });
    return row.id;
  }

  it('saves a new private annotation before first share using its local UUID, never a caller identity', async () => {
    const original = await seedFileWithIdentity('before-share.html');
    const response = await fetch(`${baseUrl}/api/projects/${projectId}/conversations/${conversationId}/comments`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        sourceFileId: '22222222-2222-4222-8222-222222222222', note: 'offline before sharing',
        target: { filePath: 'before-share.html', elementId: 'hero', selector: '#hero', label: 'Hero', text: '', htmlHint: '<h1>',
          position: { x: 1, y: 2, width: 3, height: 4 } },
      }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ comment: { sourceFileId: original, note: 'offline before sharing', selector: '#hero' } });
    const db = openDatabase(dataDir, { dataDir });
    expect(db.prepare('SELECT COUNT(*) AS n FROM public_file_publications WHERE project_id = ?').get(projectId)).toEqual({ n: 0 });
    expect(getProject(db, projectId)?.metadata?._commentFiles).toBeUndefined();
  });

  it('follows a rename instead of stranding the identity on the old path', async () => {
    const artifactId = await seedFileWithIdentity('before.html');

    const renamed = await fetch(`${baseUrl}/api/projects/${projectId}/files/rename`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ from: 'before.html', to: 'after.html' }),
    });
    expect(renamed.status).toBe(200);

    const db = openDatabase(dataDir, { dataDir });
    // Same identity, new path — not a second row, and not a stale pointer.
    expect(getWorkspaceArtifact(db, artifactId)?.currentPath).toBe('after.html');
    expect(getLiveWorkspaceArtifactByPath(db, projectId, 'before.html')).toBeNull();
    expect(getLiveWorkspaceArtifactByPath(db, projectId, 'after.html')?.id).toBe(artifactId);
  });

  it('tombstones the identity when DELETE /files/:name removes the file', async () => {
    const artifactId = await seedFileWithIdentity('doomed-by-name.html');

    const deleted = await fetch(
      `${baseUrl}/api/projects/${projectId}/files/doomed-by-name.html`,
      { method: 'DELETE' },
    );
    expect(deleted.status).toBe(200);

    const db = openDatabase(dataDir, { dataDir });
    const row = getWorkspaceArtifact(db, artifactId);
    expect(row?.deletedAt, 'the deleted file left a tombstone').toBeTruthy();
    expect(row?.currentPath).toBeNull();
    // The path is free again: a later file that takes the name must get its
    // own identity rather than inheriting this one's history.
    expect(getLiveWorkspaceArtifactByPath(db, projectId, 'doomed-by-name.html')).toBeNull();
  });

  it('pre-share folder deletion frees each HTML lifetime before same-path recreation', async () => {
    await mkdir(path.join(projectDir, 'nested'), { recursive: true });
    const original = await seedFileWithIdentity('nested/a.html');
    const deleted = await fetch(`${baseUrl}/api/projects/${projectId}/folders`, {
      method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: 'nested' }),
    });
    expect(deleted.status).toBe(200);
    const db = openDatabase(dataDir, { dataDir });
    expect(getWorkspaceArtifact(db, original)?.deletedAt).not.toBeNull();
    await mkdir(path.join(projectDir, 'nested'), { recursive: true });
    expect(await seedFileWithIdentity('nested/a.html')).not.toBe(original);
  });

  it('explicit working-folder replacement ends old local lifetimes; reopening the same folder does not', async () => {
    const external = await mkdtemp(path.join(os.tmpdir(), 'od-lifetime-rebind-'));
    const db = openDatabase(dataDir, { dataDir });
    try {
      const old = await seedFileWithIdentity('working.html');
      await writeFile(path.join(external, 'working.html'), 'new workspace');
      const replace = () => fetch(`${baseUrl}/api/projects/${projectId}/working-dir`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ baseDir: external }),
      });
      expect((await replace()).status).toBe(200);
      expect(getWorkspaceArtifact(db, old)?.deletedAt).not.toBeNull();
      const fresh = ensureWorkspaceArtifactForPath(db, { projectId, path: 'working.html', kind: 'html' });
      expect(fresh.id).not.toBe(old);
      expect((await replace()).status).toBe(200);
      expect(getWorkspaceArtifact(db, fresh.id)?.deletedAt).toBeNull();
    } finally {
      updateProject(db, projectId, { metadata: { kind: 'prototype' } });
      await rm(external, { recursive: true, force: true });
    }
  });

  it('rejects tracked HTML/folder rename before filesystem mutation; ordinary metadata cannot forge/erase facts', async () => {
    const original = await seedFileWithIdentity('tracked.html');
    const db = openDatabase(dataDir, { dataDir });
    const facts = { schemaVersion: 1, revision: 1, files: [{ sourceFileId: original, sourceFilePath: 'tracked.html',
      entryPath: 'tracked.html', resourceId: 'root', versionId: 'v1', retired: false }] };
    updateProject(db, projectId, { metadata: { kind: 'prototype', _commentFiles: facts } });
    const renamed = await fetch(`${baseUrl}/api/projects/${projectId}/files/rename`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ from: 'tracked.html', to: 'moved.html' }),
    });
    expect(renamed.status).toBe(409);
    expect(getWorkspaceArtifact(db, original)?.currentPath).toBe('tracked.html');
    const forged = await fetch(`${baseUrl}/api/projects/${projectId}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ metadata: { kind: 'prototype', _commentFiles: facts } }),
    });
    expect(forged.status).toBe(400);
    const harmless = await fetch(`${baseUrl}/api/projects/${projectId}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ metadata: { kind: 'prototype', entryFile: 'tracked.html' } }),
    });
    expect(harmless.status).toBe(200);
    expect(getProject(db, projectId)?.metadata?._commentFiles).toEqual(facts);
    updateProject(db, projectId, { metadata: { kind: 'prototype' } });
  });

  it.each([
    ['pages//a.html', 'pages/b.html'], ['pages\\a.html', 'pages/b.html'],
    ['pages', 'moved-folder'], ['spare.html', 'pages'],
    ['spare.html', 'pages//a.html'], ['spare.html', 'pages\\a.html'],
  ])('rejects tracked source/destination or ancestor %s -> %s without mutation', async (from, to) => {
    await mkdir(path.join(projectDir, 'pages'), { recursive: true });
    const original = await seedFileWithIdentity('pages/a.html');
    const spare = await seedFileWithIdentity('spare.html');
    const db = openDatabase(dataDir, { dataDir });
    const publications = createSqlitePublicFilePublicationStore(db);
    const scope = { projectId, resourceTeamId: 'rename-w', ownerMemberId: 'creator', sourceFileId: original, filePath: 'pages/a.html' };
    publications.set(scope, { slug: 'unchanged-rename-alias', url: null, fileName: 'a.html' });
    const alias = publications.get(scope);
    const revision = publications.getRevision(scope);
    const facts = { schemaVersion: 1, revision: 1, files: [{ sourceFileId: original, sourceFilePath: 'pages/a.html',
      entryPath: 'pages/a.html', resourceId: 'root', versionId: 'v1', retired: false }] };
    updateProject(db, projectId, { metadata: { kind: 'prototype', _commentFiles: facts } });
    try {
      const renamed = await fetch(`${baseUrl}/api/projects/${projectId}/files/rename`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ from, to }),
      });
      expect(renamed.status).toBe(409);
      expect(await readFile(path.join(projectDir, 'pages/a.html'), 'utf8')).toBe('bytes-for-pages/a.html');
      await expect(access(path.join(projectDir, 'pages/b.html'))).rejects.toThrow();
      expect(getWorkspaceArtifact(db, original)?.currentPath).toBe('pages/a.html');
      expect(getProject(db, projectId)?.metadata?._commentFiles).toEqual(facts);
      expect(getWorkspaceArtifact(db, spare)?.currentPath).toBe('spare.html');
      expect(await readFile(path.join(projectDir, 'spare.html'), 'utf8')).toBe('bytes-for-spare.html');
      expect(publications.get(scope)).toEqual(alias);
      expect(publications.getRevision(scope)).toEqual(revision);
    } finally {
      updateProject(db, projectId, { metadata: { kind: 'prototype' } });
      publications.delete(scope);
      await rm(path.join(projectDir, 'pages'), { recursive: true, force: true });
    }
  });

  it('offline annotation rejects canonical rename then shares the original UUID/path/time/anchor', async () => {
    const original = await seedFileWithIdentity('offline.html');
    const db = openDatabase(dataDir, { dataDir });
    const saved = await fetch(`${baseUrl}/api/projects/${projectId}/conversations/${conversationId}/comments`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ note: 'before share rename',
        target: { filePath: 'offline.html', elementId: 'hero', selector: '#hero', label: 'Hero', text: '', htmlHint: '<h1>',
          position: { x: 1, y: 2, width: 3, height: 4 } } }),
    });
    expect(saved.status).toBe(200);
    const { comment } = await saved.json() as { comment: PreviewComment };
    expect(comment.sourceFileId).toBe(original);
    expect(getProject(db, projectId)?.metadata?._commentFiles).toBeUndefined();
    const renamed = await fetch(`${baseUrl}/api/projects/${projectId}/files/rename`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ from: 'offline.html', to: 'offline-moved.html' }),
    });
    expect(renamed.status).toBe(409);
    expect(getWorkspaceArtifact(db, original)?.currentPath).toBe('offline.html');
    expect(await readFile(path.join(projectDir, 'offline.html'), 'utf8')).toBe('bytes-for-offline.html');
    await expect(access(path.join(projectDir, 'offline-moved.html'))).rejects.toThrow();
    ensureWorkspaceProject(db, { projectId, workspaceId: 'offline-w', visibility: 'personal',
      createdByWorkspaceMemberId: 'creator', resourceHubResourceId: 'offline-root' });
    // Production selected-publish HTTP pipeline on the SAME SQLite project.
    // Only catalog/resource/share CLI transport is synthetic; no remote acceptance claim.
    let state = { schemaVersion: 1, revision: 0, files: [] as unknown[] };
    const catalog = async (args: string[]) => {
      if (args[1] === 'register-resource') return JSON.stringify({ ok: true });
      if (args[1] === 'upsert') {
        const mutation = JSON.parse(args[6] ?? '')._commentFiles;
        state = { schemaVersion: 1, revision: 1, files: mutation.files.map((file: object) => ({ ...file,
          resourceId: mutation.resourceId, versionId: mutation.versionId })) };
      }
      return JSON.stringify({ projectId, workspaceId: 'offline-w', ownerMemberId: 'creator', resourceId: 'offline-root', metadata: { _commentFiles: state } });
    };
    const context: WorkspaceCollabContext = { workspaceId: 'offline-w', workspaceMemberId: 'creator', workspaceType: 'personal',
      role: 'owner', memberStatus: 'active', lifecycleState: 'active', billingState: 'active', planId: null, providerMode: 'platform_credits',
      seatSummary: buildWorkspaceSeatSummary({ seatLimit: 1, usedSeats: 1 }),
      permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }) };
    const runtime = createCollabRuntime({ workspaceContext: { current: async () => context } });
    const publications = createSqlitePublicFilePublicationStore(db);
    const fixture = createPublicSharePublishingFixture(db, publications, async () => JSON.stringify({ id: 'v1', version: 1 }),
      enqueuePublishedFileComments, { teamProject: catalog });
    const app = express(); app.use(express.json());
    const shareServer = createServer(app);
    const localFiles = createLocalCommentFiles(db);
    registerCollabSyncRoutes(app, { collab: runtime, publicFilePublicationStore: publications, ...fixture,
      sharePublishing: { ...fixture.sharePublishing!, sourceFileId: scope => localFiles.identity(scope.projectId, scope.filePath),
        admitFileReceipt: (scope, resourceId, versionId, entryPath) => localFiles.admit({ projectId: scope.projectId,
          workspaceId: 'offline-w', creatorMemberId: 'creator', resourceId, versionId,
          paths: [{ sourceFilePath: scope.filePath, entryPath }], run: catalog }) },
      recordPublicFilePublication: createPublicFilePublicationRecorder(db, publications, enqueuePublishedFileComments),
      verifyWorkspaceRequest: async () => context,
      resolveSharedProject: async () => ({ projectId, ownerMemberId: 'creator', sharedAt: new Date(1).toISOString() }),
      resolveSharedProjectOwner: async () => 'creator', resolveProjectDir: () => projectDir });
    try {
      await new Promise<void>(resolve => shareServer.listen(0, '127.0.0.1', resolve));
      const address = shareServer.address();
      if (!address || typeof address === 'string') throw new Error('missing share listener');
      const shared = await fetch(`http://127.0.0.1:${address.port}/api/projects/${projectId}/files/offline.html/publish-public`, {
        method: 'POST', headers: { 'x-od-workspace-id': 'offline-w', 'x-od-workspace-member-id': 'creator' },
      });
      expect(shared.status).toBe(200);
      expect(state.files).toEqual([expect.objectContaining({ sourceFileId: original, sourceFilePath: 'offline.html', entryPath: 'index.html' })]);
    } finally {
      await new Promise<void>(resolve => shareServer.close(() => resolve()));
      runtime.dispose();
    }
    expect(getProjectPreviewComment(db, projectId, comment.id)).toMatchObject(comment);
    expect(createCommentRelayOutboxStore(db).listDue(Date.now()).find(row => row.commentId === comment.id)?.comment)
      .toMatchObject({ sourceFileId: original, sourceFilePath: 'offline.html', createdAt: comment.createdAt,
        selector: '#hero', position: comment.position, note: comment.note });
  });

  it('tombstones the identity when DELETE /raw/* removes the file', async () => {
    const artifactId = await seedFileWithIdentity('doomed-by-raw.html');

    const deleted = await fetch(
      `${baseUrl}/api/projects/${projectId}/raw/doomed-by-raw.html`,
      { method: 'DELETE' },
    );
    expect(deleted.status).toBe(200);

    const db = openDatabase(dataDir, { dataDir });
    const row = getWorkspaceArtifact(db, artifactId);
    expect(row?.deletedAt, 'the deleted file left a tombstone').toBeTruthy();
    expect(row?.currentPath).toBeNull();
    expect(getLiveWorkspaceArtifactByPath(db, projectId, 'doomed-by-raw.html')).toBeNull();
  });
});
