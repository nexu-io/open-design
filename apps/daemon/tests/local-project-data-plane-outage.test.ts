import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  closeDatabase,
  ensureWorkspaceProject,
  insertConversation,
  insertProject,
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

  it('keeps preview, files, comments, runs, and routines usable when Vela returns 503', async () => {
    const projectId = `local-outage-${randomUUID()}`;
    const mirrorProjectId = `readonly-mirror-outage-${randomUUID()}`;
    const conversationId = `conversation-${randomUUID()}`;
    const mirrorConversationId = `mirror-conversation-${randomUUID()}`;
    const workspaceId = `workspace-${randomUUID()}`;
    const memberId = `member-${randomUUID()}`;
    const now = Date.now();
    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required by the test harness');
    const db = openDatabase(process.cwd(), { dataDir });
    const projectDir = path.join(dataDir, 'projects', projectId);

    let workspaceDirectoryRequests = 0;
    authorityServer = http.createServer((req, res) => {
      if (req.url?.startsWith('/api/v1/workspaces')) {
        workspaceDirectoryRequests += 1;
      }
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'workspace directory unavailable' }));
    });
    await new Promise<void>((resolve) => authorityServer!.listen(0, '127.0.0.1', resolve));
    const authorityAddress = authorityServer.address();
    if (!authorityAddress || typeof authorityAddress === 'string') {
      throw new Error('authority server did not bind');
    }
    vi.stubEnv('OD_WORKSPACE_CONTEXT_SOURCE', 'vela');
    vi.stubEnv('VELA_API_URL', `http://127.0.0.1:${authorityAddress.port}`);
    vi.stubEnv('VELA_CONTROL_KEY', 'outage-test-control-key');
    vi.stubEnv('OD_COLLAB_TRANSPORT', 'off');
    vi.stubEnv('OD_RESOURCE_TRANSPORT', 'off');
    vi.stubEnv('OD_TEAM_PROJECTS_TRANSPORT', 'off');

    daemon = await startServer({ port: 0, returnServer: true }) as typeof daemon;
    if (!daemon) throw new Error('daemon failed to start');
    // Create the fixture after startup so the assertion measures only requests
    // caused by the exercised local data-plane endpoints, independent of
    // unrelated startup reconciliation for pre-existing shared projects.
    insertProject(db, {
      id: projectId,
      name: 'Local data plane outage fixture',
      createdAt: now,
      updatedAt: now,
    });
    insertConversation(db, {
      id: conversationId,
      projectId,
      title: 'Chat',
      createdAt: now,
      updatedAt: now,
    });
    ensureWorkspaceProject(db, {
      projectId,
      workspaceId,
      visibility: 'team',
      resourceState: 'active',
      createdByWorkspaceMemberId: memberId,
      updatedByWorkspaceMemberId: memberId,
      resourceHubResourceId: null,
      cloudTombstonedAt: null,
      syncState: 'local_only',
    });
    // This is the exact durable row shape written by
    // `materializePulledTeamMirror` for somebody else's shared project. A null
    // creator means the current member is a viewer, not an unattributed owner.
    insertProject(db, {
      id: mirrorProjectId,
      name: 'Read-only mirror outage fixture',
      createdAt: now,
      updatedAt: now,
    });
    insertConversation(db, {
      id: mirrorConversationId,
      projectId: mirrorProjectId,
      title: 'Shared comments',
      createdAt: now,
      updatedAt: now,
    });
    ensureWorkspaceProject(db, {
      projectId: mirrorProjectId,
      workspaceId,
      visibility: 'team',
      resourceState: 'active',
      createdByWorkspaceMemberId: null,
      updatedByWorkspaceMemberId: memberId,
      resourceHubResourceId: `hub-${mirrorProjectId}`,
      cloudTombstonedAt: null,
      syncState: 'synced',
    });
    await mkdir(projectDir, { recursive: true });
    await writeFile(
      path.join(projectDir, 'index.html'),
      '<!doctype html><title>Offline preview</title><h1 data-od-id="hero">Hero</h1>',
      'utf8',
    );
    const mirrorProjectDir = path.join(dataDir, 'projects', mirrorProjectId);
    await mkdir(mirrorProjectDir, { recursive: true });
    await writeFile(
      path.join(mirrorProjectDir, 'index.html'),
      '<!doctype html><title>Read-only mirror</title><h1>Owner content</h1>',
      'utf8',
    );
    const directoryRequestsAfterStartup = workspaceDirectoryRequests;
    const staleHeaders = {
      'x-od-workspace-id': workspaceId,
      'x-od-workspace-member-id': memberId,
      'x-od-workspace-type': 'team',
      'x-od-workspace-role': 'member',
      'x-od-workspace-member-status': 'removed',
      'x-od-workspace-lifecycle-state': 'locked',
      'x-od-workspace-can-share-projects': 'false',
      'x-od-workspace-can-write-synced-files': 'false',
    };

    const raw = await fetch(`${daemon.url}/api/projects/${projectId}/raw/index.html`);
    expect(raw.status).toBe(200);
    expect(await raw.text()).toContain('Offline preview');
    expect(workspaceDirectoryRequests, 'raw file read').toBe(directoryRequestsAfterStartup);

    const scope = await fetch(`${daemon.url}/api/projects/${projectId}/workspace-scope`);
    expect(scope.status).toBe(200);
    await expect(scope.json()).resolves.toMatchObject({
      scope: { kind: 'team', workspaceId },
    });
    expect(workspaceDirectoryRequests, 'workspace scope read').toBe(directoryRequestsAfterStartup);

    const previewUrl = await fetch(
      `${daemon.url}/api/projects/${projectId}/preview-url?file=index.html`,
    );
    expect(previewUrl.status).toBe(200);
    const previewPath = (await previewUrl.json() as { url: string }).url;
    const preview = await fetch(new URL(previewPath, daemon.url));
    expect(preview.status).toBe(200);
    expect(await preview.text()).toContain('Offline preview');
    expect(workspaceDirectoryRequests, 'preview read').toBe(directoryRequestsAfterStartup);

    const write = await fetch(`${daemon.url}/api/projects/${projectId}/files`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...staleHeaders },
      body: JSON.stringify({ name: 'offline.txt', content: 'saved locally' }),
    });
    expect(write.status).toBe(200);
    expect(workspaceDirectoryRequests, 'file write').toBe(directoryRequestsAfterStartup);

    const mirrorRead = await fetch(
      `${daemon.url}/api/projects/${mirrorProjectId}/raw/index.html`,
      { headers: staleHeaders },
    );
    expect(mirrorRead.status).toBe(200);
    expect(await mirrorRead.text()).toContain('Owner content');

    const mirrorWrite = await fetch(
      `${daemon.url}/api/projects/${mirrorProjectId}/files`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...staleHeaders },
        body: JSON.stringify({ name: 'must-not-write.txt', content: 'denied' }),
      },
    );
    expect(mirrorWrite.status).toBe(403);
    await expect(mirrorWrite.json()).resolves.toMatchObject({
      error: { code: 'WORKSPACE_PROJECT_PERMISSION_DENIED' },
    });

    const mirrorRun = await fetch(`${daemon.url}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...staleHeaders },
      body: JSON.stringify({
        projectId: mirrorProjectId,
        agentId: 'claude',
        message: 'must not run against a read-only mirror',
      }),
    });
    expect(mirrorRun.status).toBe(403);
    await expect(mirrorRun.json()).resolves.toMatchObject({
      error: { code: 'WORKSPACE_PROJECT_PERMISSION_DENIED' },
    });

    const mirrorComment = await fetch(
      `${daemon.url}/api/projects/${mirrorProjectId}/conversations/${mirrorConversationId}/comments`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...staleHeaders },
        body: JSON.stringify({
          note: 'viewer feedback saved during outage',
          target: {
            filePath: 'index.html',
            elementId: 'shared-heading',
            selector: 'h1',
            label: 'h1',
            text: 'Owner content',
            htmlHint: '<h1>',
            position: { x: 0, y: 0, width: 10, height: 10 },
          },
        }),
      },
    );
    expect(mirrorComment.status).toBe(200);
    expect(workspaceDirectoryRequests, 'read-only mirror access')
      .toBe(directoryRequestsAfterStartup);

    const run = await fetch(`${daemon.url}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...staleHeaders },
      body: JSON.stringify({
        projectId,
        agentId: 'claude',
        message: 'continue locally',
      }),
    });
    expect(run.status).toBe(202);
    expect(workspaceDirectoryRequests, 'run creation').toBe(directoryRequestsAfterStartup);

    const routine = await fetch(`${daemon.url}/api/routines`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...staleHeaders },
      body: JSON.stringify({
        name: 'Offline routine',
        prompt: 'Continue locally',
        schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
        target: { mode: 'create_each_run' },
        context: { workspaceScope: { workspaceId, workspaceMemberId: memberId } },
        enabled: false,
      }),
    });
    expect(routine.status).toBe(201);
    expect(workspaceDirectoryRequests, 'routine creation').toBe(directoryRequestsAfterStartup);

    const orbitConfig = await fetch(`${daemon.url}/api/app-config`, {
      method: 'PUT',
      headers: {
        origin: daemon.url,
        'content-type': 'application/json',
        ...staleHeaders,
      },
      body: JSON.stringify({
        orbit: { workspaceScope: { workspaceId, workspaceMemberId: memberId } },
      }),
    });
    expect(orbitConfig.status).toBe(200);
    expect(workspaceDirectoryRequests, 'Orbit config write').toBe(directoryRequestsAfterStartup);

    // Comment relay is an actual cloud boundary and may attempt a background
    // authority refresh. The local write must still succeed synchronously when
    // that refresh receives 503.
    const comment = await fetch(
      `${daemon.url}/api/projects/${projectId}/conversations/${conversationId}/comments`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...staleHeaders },
        body: JSON.stringify({
          note: 'saved during outage',
          target: {
            filePath: 'index.html',
            elementId: 'hero',
            selector: '[data-od-id="hero"]',
            label: 'h1',
            text: 'Hero',
            htmlHint: '<h1>',
            position: { x: 0, y: 0, width: 10, height: 10 },
          },
        }),
      },
    );
    expect(comment.status).toBe(200);
  });
});
