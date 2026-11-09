import { buildWorkspacePermissions, buildWorkspaceSeatSummary, type WorkspaceCollabContext } from '@open-design/contracts';
import express from 'express';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { expect, it, vi } from 'vitest';
import { closeDatabase, ensureWorkspaceProject, getProject, getWorkspaceProjectByProjectId, insertProject, openDatabase, updateWorkspaceProject } from '../src/db.js';
import { createCollabRuntime } from '../src/collab/runtime.js';
import { createLocalPublicShareOwnership } from '../src/collab/local-public-share-ownership.js';
import { createSqlitePublicFilePublicationStore } from '../src/collab/public-file-publication-store.js';
import { registerCollabSyncRoutes } from '../src/routes/collab-sync.js';
import { createPublicSharePublishingFixture } from './public-share-publishing-fixture.js';

it.each(['publish-public', 'share-plan', 'cli-publish', 'cli-preflight'])('OPEND-4615: adopts an ownerless legacy project through the existing %s request', async endpoint => {
  const root = await mkdtemp(join(tmpdir(), 'od-legacy-public-share-'));
  const db = openDatabase(root, { dataDir: root });
  insertProject(db, { id: 'p', name: 'Pre-AMR project', createdAt: 100, updatedAt: 200 });
  ensureWorkspaceProject(db, {
    projectId: 'p', workspaceId: 'personal', visibility: 'personal', resourceState: 'active',
    createdByWorkspaceMemberId: null, updatedByWorkspaceMemberId: null,
    syncState: 'local_only', createdAt: 100, updatedAt: 200,
  });
  const context: WorkspaceCollabContext = {
    workspaceId: 'personal', workspaceMemberId: 'owner', workspaceType: 'personal', role: 'owner',
    memberStatus: 'active', lifecycleState: 'active', billingState: 'active', planId: null, providerMode: 'platform_credits',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 1, usedSeats: 1 }),
    permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }),
  };
  const runtime = createCollabRuntime({ workspaceContext: { current: async () => context } });
  const app = express();
  app.use(express.json());
  const store = createSqlitePublicFilePublicationStore(db);
  let uploads = 0;
  const publishing = createPublicSharePublishingFixture(db, store, async () => {
    uploads++;
    return JSON.stringify({ id: 'file-version', version: 1 });
  });
  registerCollabSyncRoutes(app, {
    collab: runtime, ...publishing,
    verifyWorkspaceRequest: async req => req.get('x-od-workspace-id') === context.workspaceId
      && req.get('x-od-workspace-member-id') === context.workspaceMemberId ? context : null,
    resolveSharedProject: async () => null,
    ...createLocalPublicShareOwnership(db),
    projectStore: { has: id => Boolean(getProject(db, id)), get: id => getProject(db, id), register: () => {} },
    resolveProjectDir: () => root,
    publicFilePublicationStore: store,
  });
  const server = createServer(app);
  try {
    await writeFile(join(root, 'index.html'), '<h1>Original historical content</h1>');
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('no listener');
    // No new request fields, claim endpoint, role headers, or client version negotiation.
    const base = `http://127.0.0.1:${address.port}`;
    if (endpoint.startsWith('cli-')) {
      const cli = process.env.OD_DAEMON_CLI_PATH;
      if (!cli) throw new Error('test setup did not build the daemon CLI');
      const { stdout } = await promisify(execFile)(process.execPath, [cli, 'project', 'share', endpoint.slice(4), 'p',
        '--path', 'index.html', '--workspace', 'personal', '--workspace-member', 'owner', '--daemon-url', base, '--json']);
      expect(JSON.parse(stdout)).not.toHaveProperty('error');
    } else {
      const response = await fetch(`${base}/api/projects/p/files/index.html/${endpoint}`, {
        method: 'POST', headers: { 'x-od-workspace-id': 'personal', 'x-od-workspace-member-id': 'owner' },
      });
      expect(response.status).toBe(200);
    }
    expect(getWorkspaceProjectByProjectId(db, 'p')).toMatchObject({
      workspaceId: 'personal', createdByWorkspaceMemberId: 'owner', createdAt: 100, updatedAt: 200,
    });
    expect(await readFile(join(root, 'index.html'), 'utf8')).toBe('<h1>Original historical content</h1>');
    expect(uploads).toBe(endpoint === 'publish-public' || endpoint === 'cli-publish' ? 1 : 0);
    if (endpoint === 'publish-public') {
      const scope = { projectId: 'p', filePath: 'index.html', resourceTeamId: 'personal', ownerMemberId: 'owner' };
      const slug = store.getRevision(scope)?.slug;
      expect(slug).toBeTruthy();
      const binding = getWorkspaceProjectByProjectId(db, 'p');
      const repeated = await fetch(`${base}/api/projects/p/files/index.html/publish-public`, {
        method: 'POST', headers: { 'x-od-workspace-id': 'personal', 'x-od-workspace-member-id': 'owner' },
      });
      expect(repeated.status).toBe(200);
      expect(store.getRevision(scope)?.slug).toBe(slug);
      expect(getWorkspaceProjectByProjectId(db, 'p')).toEqual(binding);
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    runtime.dispose();
    closeDatabase();
    await rm(root, { recursive: true, force: true });
  }
});

it.each(['forged-role', 'team-context', 'signed-out', 'wrong-workspace', 'directory-unavailable', 'changed-owner', 'invalid-body'] as const)(
  'OPEND-4615: does not claim or upload a legacy project with %s', async scenario => {
    const root = await mkdtemp(join(tmpdir(), 'od-legacy-share-denied-'));
    const db = openDatabase(root, { dataDir: root });
    insertProject(db, { id: 'p', name: 'Historical project', createdAt: 100, updatedAt: 200 });
    const original = ensureWorkspaceProject(db, {
      projectId: 'p', workspaceId: 'personal', visibility: 'personal', resourceState: 'active',
      createdByWorkspaceMemberId: null, syncState: 'local_only', createdAt: 100, updatedAt: 200,
    });
    const context: WorkspaceCollabContext = {
      workspaceId: 'personal', workspaceMemberId: 'owner', workspaceType: 'personal', role: 'owner',
      memberStatus: 'active', lifecycleState: 'active', billingState: 'active', planId: null, providerMode: 'platform_credits',
      seatSummary: buildWorkspaceSeatSummary({ seatLimit: 1, usedSeats: 1 }),
      permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }),
    };
    const runtime = createCollabRuntime({ workspaceContext: { current: async () => context } });
    const app = express();
    app.use(express.json());
    const upload = vi.fn(async () => JSON.stringify({ id: 'v1', version: 1 }));
    const store = createSqlitePublicFilePublicationStore(db);
    let verificationStarted!: () => void;
    let finishVerification!: () => void;
    const started = new Promise<void>(resolve => { verificationStarted = resolve; });
    const pending = new Promise<void>(resolve => { finishVerification = resolve; });
    const verifier = vi.fn(async () => {
      if (scenario === 'directory-unavailable') throw new Error('directory unavailable');
      if (scenario === 'forged-role') return { ...context, role: 'member' as const };
      if (scenario === 'team-context') return { ...context, workspaceType: 'team' as const };
      if (scenario === 'signed-out') return null;
      if (scenario === 'wrong-workspace') return { ...context, workspaceId: 'another-workspace' };
      if (scenario === 'changed-owner') {
        verificationStarted();
        await pending;
      }
      return context;
    });
    registerCollabSyncRoutes(app, {
      collab: runtime, ...createPublicSharePublishingFixture(db, store, upload),
      ...createLocalPublicShareOwnership(db), verifyWorkspaceRequest: verifier,
      resolveSharedProject: async () => null, resolveProjectDir: () => root,
      projectStore: { has: id => Boolean(getProject(db, id)), get: id => getProject(db, id), register: () => {} },
    });
    const server = createServer(app);
    try {
      await writeFile(join(root, 'index.html'), '<h1>Private content</h1>');
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('no listener');
      const request = fetch(`http://127.0.0.1:${address.port}/api/projects/p/files/index.html/publish-public`, {
        method: 'POST', headers: {
          'content-type': 'application/json', 'x-od-workspace-id': 'personal', 'x-od-workspace-member-id': 'owner',
          'x-od-workspace-role': 'owner', 'x-od-workspace-type': 'personal',
        },
        ...(scenario === 'invalid-body' ? { body: JSON.stringify({ claim: true }) } : {}),
      });
      if (scenario === 'changed-owner') {
        await started;
        updateWorkspaceProject(db, 'personal', 'p', { createdByWorkspaceMemberId: 'real-author', updatedAt: 200 });
        finishVerification();
      }
      const response = await request;
      expect(response.status).toBe(scenario === 'directory-unavailable' ? 503 : scenario === 'invalid-body' ? 400 : 403);
      expect(getWorkspaceProjectByProjectId(db, 'p')).toEqual({
        ...original, ...(scenario === 'changed-owner' ? { createdByWorkspaceMemberId: 'real-author' } : {}),
      });
      expect(upload).not.toHaveBeenCalled();
      if (scenario === 'invalid-body') expect(verifier).not.toHaveBeenCalled();
    } finally {
      finishVerification();
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
      runtime.dispose();
      closeDatabase();
      await rm(root, { recursive: true, force: true });
    }
  },
);
