import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  closeDatabase,
  ensureWorkspaceProject,
  insertConversation,
  insertProject,
  listPreviewComments,
  openDatabase,
} from '../src/db.js';
import { startServer } from '../src/server.js';

describe('local project data plane during Workspace authority outage', () => {
  let daemon: {
    url: string;
    server: http.Server;
    shutdown?: () => Promise<void> | void;
  } | null = null;
  let authorityServer: http.Server | null = null;

  afterEach(async () => {
    if (daemon) {
      const current = daemon;
      daemon = null;
      await Promise.resolve(current.shutdown?.());
      current.server.closeAllConnections?.();
      if (current.server.listening) {
        await new Promise<void>((resolve) => current.server.close(() => resolve()));
      }
    }
    if (authorityServer) {
      const current = authorityServer;
      authorityServer = null;
      current.closeAllConnections?.();
      if (current.listening) {
        await new Promise<void>((resolve) => current.close(() => resolve()));
      }
    }
    vi.unstubAllEnvs();
    closeDatabase();
  });

  async function startOutageFixture() {
    let workspaceDirectoryRequests = 0;
    authorityServer = http.createServer((req, res) => {
      if (req.url?.startsWith('/api/v1/workspaces')) workspaceDirectoryRequests += 1;
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'workspace directory unavailable' }));
    });
    await new Promise<void>((resolve) => authorityServer!.listen(0, '127.0.0.1', resolve));
    const address = authorityServer.address();
    if (!address || typeof address === 'string') throw new Error('authority server did not bind');
    vi.stubEnv('OD_WORKSPACE_CONTEXT_SOURCE', 'vela');
    vi.stubEnv('VELA_API_URL', `http://127.0.0.1:${address.port}`);
    vi.stubEnv('VELA_CONTROL_KEY', 'outage-test-control-key');
    vi.stubEnv('OD_COLLAB_TRANSPORT', 'off');
    vi.stubEnv('OD_RESOURCE_TRANSPORT', 'off');
    vi.stubEnv('OD_TEAM_PROJECTS_TRANSPORT', 'off');

    daemon = await startServer({ port: 0, returnServer: true }) as typeof daemon;
    if (!daemon) throw new Error('daemon failed to start');
    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required by the test harness');
    const db = openDatabase(process.cwd(), { dataDir });
    return { url: daemon.url, db, dataDir, directoryRequests: () => workspaceDirectoryRequests };
  }

  async function seedProject(fixture: Awaited<ReturnType<typeof startOutageFixture>>) {
    const projectId = `local-outage-${randomUUID()}`;
    const conversationId = `conversation-${randomUUID()}`;
    const now = Date.now();
    // Seed after startup, independently of pre-existing project reconciliation.
    insertProject(fixture.db, { id: projectId, name: 'Outage fixture', createdAt: now, updatedAt: now });
    insertConversation(fixture.db, { id: conversationId, projectId, title: 'Chat', createdAt: now, updatedAt: now });
    const projectDir = path.join(fixture.dataDir, 'projects', projectId);
    await mkdir(projectDir, { recursive: true });
    await writeFile(path.join(projectDir, 'index.html'),
      '<!doctype html><title>Offline preview</title><h1 data-od-id="hero">Hero</h1>', 'utf8');
    return { projectId, conversationId, projectDir };
  }

  function commentBody() {
    return {
      note: 'saved during outage',
      target: {
        filePath: 'index.html', elementId: 'hero', selector: '[data-od-id="hero"]',
        label: 'h1', text: 'Hero', htmlHint: '<h1>',
        position: { x: 0, y: 0, width: 10, height: 10 },
      },
    };
  }

  it('keeps unbound preview, files, comments, runs, and routines usable during an authority outage', async () => {
    const fixture = await startOutageFixture();
    const { projectId, conversationId } = await seedProject(fixture);
    const directoryRequestsAtStart = fixture.directoryRequests();

    const raw = await fetch(`${fixture.url}/api/projects/${projectId}/raw/index.html`);
    expect(raw.status).toBe(200);
    expect(await raw.text()).toContain('Offline preview');

    const scope = await fetch(`${fixture.url}/api/projects/${projectId}/workspace-scope`);
    expect(scope.status).toBe(200);
    await expect(scope.json()).resolves.toMatchObject({ scope: { kind: 'unbound', workspaceId: null } });

    const previewUrl = await fetch(`${fixture.url}/api/projects/${projectId}/preview-url?file=index.html`);
    expect(previewUrl.status).toBe(200);
    const previewPath = (await previewUrl.json() as { url: string }).url;
    const preview = await fetch(new URL(previewPath, fixture.url));
    expect(preview.status).toBe(200);
    expect(await preview.text()).toContain('Offline preview');

    const write = await fetch(`${fixture.url}/api/projects/${projectId}/files`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'offline.txt', content: 'saved locally' }),
    });
    expect(write.status).toBe(200);
    const readBack = await fetch(`${fixture.url}/api/projects/${projectId}/raw/offline.txt`);
    expect(readBack.status).toBe(200);
    expect(await readBack.text()).toBe('saved locally');

    const commentPath = `${fixture.url}/api/projects/${projectId}/conversations/${conversationId}/comments`;
    const comment = await fetch(commentPath, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(commentBody()),
    });
    expect(comment.status, await comment.clone().text()).toBe(200);
    expect(listPreviewComments(fixture.db, projectId, conversationId)).toHaveLength(1);
    const comments = await fetch(commentPath);
    expect(comments.status).toBe(200);
    await expect(comments.json()).resolves.toMatchObject({ comments: [expect.objectContaining({ note: 'saved during outage' })] });

    const run = await fetch(`${fixture.url}/api/runs`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId, agentId: 'claude', message: 'continue locally' }),
    });
    expect(run.status, await run.clone().text()).toBe(202);

    const routine = await fetch(`${fixture.url}/api/routines`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Offline routine', prompt: 'Continue locally',
        schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
        target: { mode: 'create_each_run' }, enabled: false,
      }),
    });
    expect(routine.status, await routine.clone().text()).toBe(201);

    const config = await fetch(`${fixture.url}/api/app-config`, {
      method: 'PUT', headers: { origin: fixture.url, 'content-type': 'application/json' },
      body: JSON.stringify({ orbit: {} }),
    });
    expect(config.status).toBe(200);
    expect(fixture.directoryRequests(), 'unbound data plane must not need Workspace authority')
      .toBe(directoryRequestsAtStart);
  });

  it('fails closed for bound content and mutations while keeping local comment reads exactly scoped', async () => {
    const fixture = await startOutageFixture();
    const workspaceId = `workspace-${randomUUID()}`;
    const memberId = `member-${randomUUID()}`;
    const claimedHeaders = {
      'x-od-workspace-id': workspaceId,
      'x-od-workspace-member-id': memberId,
      'x-od-workspace-type': 'team',
      'x-od-workspace-role': 'owner',
      'x-od-workspace-member-status': 'active',
      'x-od-workspace-lifecycle-state': 'active',
      'x-od-workspace-can-share-projects': 'true',
      'x-od-workspace-can-write-synced-files': 'true',
    };
    for (const creator of [memberId, null]) {
      const { projectId, conversationId, projectDir } = await seedProject(fixture);
      ensureWorkspaceProject(fixture.db, {
        projectId, workspaceId, visibility: 'team', resourceState: 'active',
        createdByWorkspaceMemberId: creator, updatedByWorkspaceMemberId: memberId,
        resourceHubResourceId: creator ? null : `hub-${projectId}`,
        cloudTombstonedAt: null, syncState: creator ? 'local_only' : 'synced',
      });
      const headerless = await fetch(`${fixture.url}/api/projects/${projectId}/raw/index.html`);
      expect(headerless.status).toBe(400);
      await expect(headerless.json()).resolves.toMatchObject({ error: { code: 'WORKSPACE_CONTEXT_REQUIRED' } });

      const reads = [
        `/api/projects/${projectId}/raw/index.html`,
        `/api/projects/${projectId}/workspace-scope`,
        `/api/projects/${projectId}/preview-url?file=index.html`,
        `/api/projects/${projectId}/files`,
      ];
      for (const endpoint of reads) {
        const response = await fetch(`${fixture.url}${endpoint}`, { headers: claimedHeaders });
        expect(response.status, `${endpoint}: ${await response.clone().text()}`).toBe(503);
        await expect(response.json()).resolves.toMatchObject({ error: { code: 'WORKSPACE_AUTHORITY_UNAVAILABLE' } });
      }
      // Local comment reads have a separate namespace-only gate. They remain
      // available, but cannot borrow another Workspace's claimed identity.
      const commentPath = `${fixture.url}/api/projects/${projectId}/conversations/${conversationId}/comments`;
      const comments = await fetch(commentPath, { headers: claimedHeaders });
      expect(comments.status).toBe(200);
      await expect(comments.json()).resolves.toMatchObject({ comments: [] });
      const foreignComments = await fetch(commentPath, {
        headers: { ...claimedHeaders, 'x-od-workspace-id': `foreign-${workspaceId}` },
      });
      expect(foreignComments.status).toBe(403);
      await expect(foreignComments.json()).resolves.toMatchObject({
        error: { code: 'WORKSPACE_PROJECT_PERMISSION_DENIED' },
      });
      const writes = [
        { endpoint: `/api/projects/${projectId}/files`, body: { name: 'must-not-write.txt', content: 'denied' } },
        { endpoint: `/api/projects/${projectId}/conversations/${conversationId}/comments`, body: commentBody() },
        { endpoint: '/api/runs', body: { projectId, agentId: 'claude', message: 'must not run without authority' } },
      ];
      for (const { endpoint, body } of writes) {
        const response = await fetch(`${fixture.url}${endpoint}`, {
          method: 'POST', headers: { 'content-type': 'application/json', ...claimedHeaders }, body: JSON.stringify(body),
        });
        expect(response.status, `${endpoint}: ${await response.clone().text()}`).toBe(503);
        await expect(response.json()).resolves.toMatchObject({ error: { code: 'WORKSPACE_AUTHORITY_UNAVAILABLE' } });
      }
      await expect(access(path.join(projectDir, 'must-not-write.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
      expect(listPreviewComments(fixture.db, projectId, conversationId)).toEqual([]);
    }
    expect(fixture.directoryRequests(), 'claimed Owner headers never replace fresh directory authority').toBeGreaterThan(0);
  });
});
