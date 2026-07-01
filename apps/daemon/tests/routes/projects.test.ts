/**
 * Coverage for `GET /api/projects/:id`. The route was extended (#451) to
 * include a derived `resolvedDir` field so the web client can address the
 * on-disk working directory directly without reconstructing it from the
 * daemon's internal projects root. Two cases:
 *   1. Folder-imported project — `resolvedDir === metadata.baseDir`.
 *   2. Native project — `resolvedDir === path.join(<projects root>, id)`.
 *
 * Pre-existing daemon test files cover specific subdomains
 * (folder-import-projects, project-status, project-watchers, ...);
 * none own this route, so a dedicated `projects-routes` file is cleaner
 * than expanding any of them.
 */
import type http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { mkdir, readdir, readFile, realpath, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../../src/server.js';

describe('GET /api/projects/:id resolvedDir', () => {
  let server: http.Server;
  let baseUrl: string;
  const tempDirs: string[] = [];

  beforeAll(async () => {
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  });

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    return new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function makeFolder(): string {
    const d = mkdtempSync(path.join(tmpdir(), 'od-projects-routes-'));
    tempDirs.push(d);
    return d;
  }

  it('returns resolvedDir === metadata.baseDir for an imported-folder project', async () => {
    const folder = makeFolder();
    await writeFile(path.join(folder, 'index.html'), '<!doctype html>');

    const importResp = await fetch(`${baseUrl}/api/import/folder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseDir: folder }),
    });
    expect(importResp.status).toBe(200);
    const importBody = (await importResp.json()) as {
      project: { id: string; metadata?: { baseDir?: string } };
    };
    const projectId = importBody.project.id;
    const baseDir = importBody.project.metadata?.baseDir;
    expect(baseDir).toBeTruthy();

    const detailResp = await fetch(`${baseUrl}/api/projects/${projectId}`);
    expect(detailResp.status).toBe(200);
    const detail = (await detailResp.json()) as {
      project: { id: string };
      resolvedDir: string;
    };
    expect(detail.project.id).toBe(projectId);
    expect(detail.resolvedDir).toBe(baseDir);
  });

  it('keeps imported-folder resolvedDir stable in sandbox mode', async () => {
    const folder = makeFolder();
    await writeFile(path.join(folder, 'index.html'), '<!doctype html>');

    const importResp = await fetch(`${baseUrl}/api/import/folder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseDir: folder }),
    });
    expect(importResp.status).toBe(200);
    const importBody = (await importResp.json()) as {
      project: { id: string; metadata?: { baseDir?: string } };
    };
    const projectId = importBody.project.id;
    const baseDir = importBody.project.metadata?.baseDir;
    expect(baseDir).toBeTruthy();

    await withSandboxMode(async () => {
      const detailResp = await fetch(`${baseUrl}/api/projects/${projectId}`);
      expect(detailResp.status).toBe(200);
      const detail = (await detailResp.json()) as {
        project: { id: string };
        resolvedDir: string;
      };
      expect(detail.project.id).toBe(projectId);
      expect(detail.resolvedDir).toBe(baseDir);
    });
  });

  it('returns resolvedDir under <projects root>/<id> for a native project', async () => {
    const projectId = `proj-routes-${Date.now()}`;
    const createResp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Native fixture',
        skillId: null,
        designSystemId: null,
      }),
    });
    expect(createResp.status).toBe(200);

    const detailResp = await fetch(`${baseUrl}/api/projects/${projectId}`);
    expect(detailResp.status).toBe(200);
    const detail = (await detailResp.json()) as {
      project: { id: string; metadata?: { baseDir?: string } };
      resolvedDir: string;
    };
    expect(detail.project.metadata?.baseDir).toBeUndefined();

    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
    const expected = path.join(dataDir, 'projects', projectId);
    expect(detail.resolvedDir).toBe(expected);
    expect(path.isAbsolute(detail.resolvedDir)).toBe(true);
  });

  it('fails GET /api/projects/:id?ensureDir=1 when a managed folder cannot be materialized', async () => {
    const projectId = `proj-ensure-fails-${Date.now()}`;
    const createResp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Native fixture',
        skillId: null,
        designSystemId: null,
      }),
    });
    expect(createResp.status).toBe(200);

    const detailResp = await fetch(`${baseUrl}/api/projects/${projectId}`);
    expect(detailResp.status).toBe(200);
    const detail = (await detailResp.json()) as { resolvedDir: string };
    tempDirs.push(detail.resolvedDir);
    await writeFile(detail.resolvedDir, 'not a directory');

    const ensureResp = await fetch(`${baseUrl}/api/projects/${projectId}?ensureDir=1`);
    expect(ensureResp.status).toBe(500);
    const body = (await ensureResp.json()) as { error?: { code?: string; message?: string } };
    expect(body.error?.code).toBe('PROJECT_DIR_MATERIALIZATION_FAILED');
    expect(body.error?.message).toMatch(/EEXIST|not a directory|file already exists/i);
  });

  it('persists skipDiscoveryBrief for batch-created projects', async () => {
    const projectId = `proj-skip-discovery-${Date.now()}`;
    const createResp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Batch fixture',
        skillId: null,
        designSystemId: 'default',
        metadata: { kind: 'prototype', platform: 'responsive' },
        skipDiscoveryBrief: true,
      }),
    });
    expect(createResp.status).toBe(200);
    const body = (await createResp.json()) as {
      project: { designSystemId?: string | null; metadata?: { skipDiscoveryBrief?: boolean } };
    };
    expect(body.project.designSystemId).toBe('default');
    expect(body.project.metadata?.skipDiscoveryBrief).toBe(true);
  });

  it('forks a seeded conversation through a selected message', async () => {
    const projectId = `proj-conv-fork-${Date.now()}`;
    const createProjectResp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Conversation fork fixture',
        skillId: null,
        designSystemId: null,
      }),
    });
    expect(createProjectResp.status).toBe(200);

    const sourceResp = await fetch(`${baseUrl}/api/projects/${projectId}/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Source', sessionMode: 'chat' }),
    });
    expect(sourceResp.status).toBe(200);
    const sourceBody = (await sourceResp.json()) as { conversation: { id: string } };
    const sourceId = sourceBody.conversation.id;
    const seedMessages = [
      { id: 'fork-user-1', role: 'user', content: 'first ask' },
      {
        id: 'fork-assistant-1',
        role: 'assistant',
        content: 'first answer',
        runId: 'source-run-1',
        runStatus: 'succeeded',
        lastRunEventId: 'evt-1',
      },
      { id: 'fork-user-2', role: 'user', content: 'second ask' },
      { id: 'fork-assistant-2', role: 'assistant', content: 'second answer' },
    ];
    for (const message of seedMessages) {
      const saveResp = await fetch(
        `${baseUrl}/api/projects/${projectId}/conversations/${sourceId}/messages/${message.id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message),
        },
      );
      expect(saveResp.status).toBe(200);
    }

    const forkResp = await fetch(`${baseUrl}/api/projects/${projectId}/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Fork',
        seedFromConversationId: sourceId,
        forkAfterMessageId: 'fork-assistant-1',
      }),
    });
    expect(forkResp.status).toBe(200);
    const forkBody = (await forkResp.json()) as {
      conversation: { id: string; title: string; sessionMode: string };
    };
    expect(forkBody.conversation.title).toBe('Fork');
    expect(forkBody.conversation.sessionMode).toBe('chat');

    const forkMessagesResp = await fetch(
      `${baseUrl}/api/projects/${projectId}/conversations/${forkBody.conversation.id}/messages`,
    );
    expect(forkMessagesResp.status).toBe(200);
    const forkMessagesBody = (await forkMessagesResp.json()) as {
      messages: Array<{
        id: string;
        role: string;
        content: string;
        runId?: string;
        runStatus?: string;
        lastRunEventId?: string;
      }>;
    };
    expect(forkMessagesBody.messages.map((message) => message.content)).toEqual([
      'first ask',
      'first answer',
    ]);
    expect(forkMessagesBody.messages.map((message) => message.id)).not.toContain(
      'fork-assistant-1',
    );
    expect(forkMessagesBody.messages[1]).toMatchObject({
      role: 'assistant',
      content: 'first answer',
    });
    expect(forkMessagesBody.messages[1]?.runId).toBeUndefined();
    expect(forkMessagesBody.messages[1]?.runStatus).toBeUndefined();
    expect(forkMessagesBody.messages[1]?.lastRunEventId).toBeUndefined();
  });

  it('forks from a client-supplied snapshot when the fork point was never persisted', async () => {
    // Regression: forking an assistant turn whose run errored / had its
    // connection reset before the message reached the database used to 404 on
    // `forkAfterMessageId` (the message is only in the browser), so the fork
    // silently failed and the user never switched into the new conversation.
    // The "Fork" action now sends the in-memory snapshot, which the daemon
    // copies even though the fork point is absent from the source DB.
    const projectId = `proj-conv-fork-snapshot-${Date.now()}`;
    const createProjectResp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Fork snapshot fixture',
        skillId: null,
        designSystemId: null,
      }),
    });
    expect(createProjectResp.status).toBe(200);

    const sourceResp = await fetch(`${baseUrl}/api/projects/${projectId}/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Source', sessionMode: 'chat' }),
    });
    expect(sourceResp.status).toBe(200);
    const sourceId = (
      (await sourceResp.json()) as { conversation: { id: string } }
    ).conversation.id;

    // Persist only the user turn. The assistant turn errored before it was
    // ever written, so it exists solely in the client's snapshot below.
    const saveUserResp = await fetch(
      `${baseUrl}/api/projects/${projectId}/conversations/${sourceId}/messages/ghost-user-1`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'ghost-user-1', role: 'user', content: 'enrich it' }),
      },
    );
    expect(saveUserResp.status).toBe(200);

    const forkResp = await fetch(`${baseUrl}/api/projects/${projectId}/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Fork',
        sessionMode: 'chat',
        seedFromConversationId: sourceId,
        forkAfterMessageId: 'ghost-assistant-1',
        seedMessages: [
          { id: 'ghost-user-1', role: 'user', content: 'enrich it' },
          {
            id: 'ghost-assistant-1',
            role: 'assistant',
            content: 'partial answer before reset',
            runId: 'dead-run-1',
            runStatus: 'failed',
            lastRunEventId: 'evt-dead',
            events: [{ kind: 'status', label: 'error', detail: 'Connection reset by server' }],
          },
          // Anything after the fork point must be dropped.
          { id: 'ghost-user-2', role: 'user', content: 'should not be copied' },
        ],
      }),
    });
    expect(forkResp.status).toBe(200);
    const forkId = (
      (await forkResp.json()) as { conversation: { id: string } }
    ).conversation.id;

    const forkMessagesResp = await fetch(
      `${baseUrl}/api/projects/${projectId}/conversations/${forkId}/messages`,
    );
    expect(forkMessagesResp.status).toBe(200);
    const forkMessages = (
      (await forkMessagesResp.json()) as {
        messages: Array<{
          id: string;
          role: string;
          content: string;
          runId?: string;
          runStatus?: string;
          lastRunEventId?: string;
        }>;
      }
    ).messages;

    // Cut at the (unpersisted) fork point — the trailing user turn is dropped.
    expect(forkMessages.map((m) => m.content)).toEqual([
      'enrich it',
      'partial answer before reset',
    ]);
    // Fresh ids, and the dead run pointers are not inherited.
    expect(forkMessages.map((m) => m.id)).not.toContain('ghost-assistant-1');
    expect(forkMessages[1]).toMatchObject({ role: 'assistant', content: 'partial answer before reset' });
    expect(forkMessages[1]?.runId).toBeUndefined();
    expect(forkMessages[1]?.runStatus).toBeUndefined();
    expect(forkMessages[1]?.lastRunEventId).toBeUndefined();
  });

  it('serves project files through raw and files path routes', async () => {
    const projectId = `proj-raw-route-${Date.now()}`;
    const createResp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Raw route fixture',
        skillId: null,
        designSystemId: null,
      }),
    });
    expect(createResp.status).toBe(200);

    const writeResp = await fetch(`${baseUrl}/api/projects/${projectId}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'index.html', content: '<!doctype html><h1>ok</h1>' }),
    });
    expect(writeResp.status).toBe(200);

    const rawResp = await fetch(`${baseUrl}/api/projects/${projectId}/raw/index.html`);
    expect(rawResp.status).toBe(200);
    expect(rawResp.headers.get('content-type')).toContain('text/html');
    expect(await rawResp.text()).toContain('<h1>ok</h1>');

    const fileResp = await fetch(`${baseUrl}/api/projects/${projectId}/files/index.html`);
    expect(fileResp.status).toBe(200);
    expect(await fileResp.text()).toContain('<h1>ok</h1>');
  });



  it('serves nested project html files through the raw route and allows Origin: null', async () => {
    const projectId = `proj-raw-nested-${Date.now()}`;
    const createResp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Nested raw route fixture',
        skillId: null,
        designSystemId: null,
      }),
    });
    expect(createResp.status).toBe(200);

    const writeResp = await fetch(`${baseUrl}/api/projects/${projectId}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'nested/demo/index.html', content: '<!doctype html><h1>nested ok</h1>' }),
    });
    expect(writeResp.status).toBe(200);

    const rawResp = await fetch(`${baseUrl}/api/projects/${projectId}/raw/nested/demo/index.html`, {
      headers: { Origin: 'null' },
    });
    expect(rawResp.status).toBe(200);
    expect(rawResp.headers.get('content-type')).toContain('text/html');
    expect(rawResp.headers.get('access-control-allow-origin')).toBe('*');
    expect(await rawResp.text()).toContain('<h1>nested ok</h1>');
  });
  it('rejects non-boolean skipDiscoveryBrief on POST /api/projects', async () => {
    const projectId = `proj-skip-discovery-bad-${Date.now()}`;
    const resp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Bad batch fixture',
        skipDiscoveryBrief: 'yes',
      }),
    });
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { error?: { code?: string; message?: string } };
    expect(body.error?.code).toBe('BAD_REQUEST');
    expect(body.error?.message).toMatch(/skipDiscoveryBrief/i);
  });

  it('rejects invalid metadata.linkedDirs on POST /api/projects', async () => {
    const projectId = `proj-bad-linked-${Date.now()}`;
    const resp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Bad linked dir',
        metadata: { kind: 'prototype', linkedDirs: ['/no/such/folder/here'] },
      }),
    });
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('INVALID_LINKED_DIR');
    // The project must not have been created.
    const detail = await fetch(`${baseUrl}/api/projects/${projectId}`);
    expect(detail.status).toBe(404);
  });

  it('accepts an existing metadata.linkedDirs on POST /api/projects', async () => {
    const dir = makeFolder();
    const projectId = `proj-good-linked-${Date.now()}`;
    const resp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Good linked dir',
        metadata: { kind: 'prototype', linkedDirs: [dir] },
      }),
    });
    expect(resp.status).toBe(200);
    const detail = await fetch(`${baseUrl}/api/projects/${projectId}`);
    expect(detail.status).toBe(200);
    const body = (await detail.json()) as { project?: { metadata?: { linkedDirs?: string[] } } };
    expect(body.project?.metadata?.linkedDirs?.length).toBe(1);
  });

  it('returns 404 with PROJECT_NOT_FOUND for unknown ids', async () => {
    const resp = await fetch(`${baseUrl}/api/projects/does-not-exist-${Date.now()}`);
    expect(resp.status).toBe(404);
    const body = (await resp.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('PROJECT_NOT_FOUND');
  });

  // Folder routes (#3516) must refuse to touch the filesystem for an unknown
  // project id. Without the guard, POST reaches createProjectFolder ->
  // ensureProject and would materialize a `.od/projects/<id>/...` directory
  // with no DB row, leaving orphaned state and breaking the invariant the
  // neighboring project-file routes rely on.
  it('returns 404 for unknown project folder routes without creating project files', async () => {
    const missingProjectId = `missing-folder-routes-${Date.now()}`;
    const requests = [
      fetch(`${baseUrl}/api/projects/${missingProjectId}/folders`),
      fetch(`${baseUrl}/api/projects/${missingProjectId}/folders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'orphan' }),
      }),
      fetch(`${baseUrl}/api/projects/${missingProjectId}/folders`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'orphan' }),
      }),
    ];

    for (const response of await Promise.all(requests)) {
      expect(response.status).toBe(404);
      const body = (await response.json()) as { error?: { code?: string } };
      expect(body.error?.code).toBe('PROJECT_NOT_FOUND');
    }

    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
    await expect(stat(path.join(dataDir, 'projects', missingProjectId))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('creates, lists, and deletes a folder for a real project', async () => {
    const projectId = `proj-folders-${Date.now()}`;
    const createResp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Folder fixture',
        skillId: null,
        designSystemId: null,
      }),
    });
    expect(createResp.status).toBe(200);

    const postResp = await fetch(`${baseUrl}/api/projects/${projectId}/folders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'references' }),
    });
    expect(postResp.status).toBe(200);
    const created = (await postResp.json()) as { folder: { path: string } };
    expect(created.folder.path).toContain('references');

    const listResp = await fetch(`${baseUrl}/api/projects/${projectId}/folders`);
    expect(listResp.status).toBe(200);
    const listed = (await listResp.json()) as { folders: Array<{ path: string }> };
    expect(listed.folders.some((f) => f.path.includes('references'))).toBe(true);

    const deleteResp = await fetch(`${baseUrl}/api/projects/${projectId}/folders`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: created.folder.path }),
    });
    expect(deleteResp.status).toBe(200);
    const deleted = (await deleteResp.json()) as { ok: boolean };
    expect(deleted.ok).toBe(true);
  });

  // PR #974: `fromTrustedPicker` is privileged the same way `baseDir`
  // is — only the HMAC-gated POST /api/import/folder may set it. POST
  // /api/projects (the generic create endpoint) and PATCH
  // /api/projects/:id must reject any client-supplied attempt to
  // acquire or flip the marker, otherwise a compromised renderer could
  // mark a previously-untrusted folder-imported project as trusted and
  // re-open the openPath bypass.
  it('rejects fromTrustedPicker on POST /api/projects', async () => {
    const projectId = `proj-trusted-${Date.now()}`;
    const resp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Smuggled trust',
        skillId: null,
        designSystemId: null,
        metadata: { kind: 'prototype', fromTrustedPicker: true },
      }),
    });
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { error?: { code?: string; message?: string } };
    expect(body.error?.code).toBe('BAD_REQUEST');
    expect(body.error?.message).toMatch(/fromTrustedPicker/i);
  });

  it('rejects orchestratorWorkspace on POST /api/projects', async () => {
    const projectId = `proj-orchestrator-create-${Date.now()}`;
    const resp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Smuggled scratch provenance',
        skillId: null,
        designSystemId: null,
        metadata: {
          kind: 'prototype',
          orchestratorWorkspace: {
            kind: 'scratch',
            sourceRef: 'main@abc123',
            writeback: 'external',
          },
        },
      }),
    });
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { error?: { code?: string; message?: string } };
    expect(body.error?.code).toBe('BAD_REQUEST');
    expect(body.error?.message).toMatch(/orchestratorWorkspace.*import\/folder/i);
  });

  it('rejects fromTrustedPicker on PATCH /api/projects/:id', async () => {
    // Create a vanilla native project, then try to PATCH the
    // trusted-picker marker onto it. The handler must refuse —
    // PATCHing privileged metadata fields is the same threat surface
    // as setting them on creation.
    const projectId = `proj-trusted-patch-${Date.now()}`;
    const createResp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Native fixture',
        skillId: null,
        designSystemId: null,
      }),
    });
    expect(createResp.status).toBe(200);

    const patchResp = await fetch(`${baseUrl}/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metadata: { kind: 'prototype', fromTrustedPicker: true } }),
    });
    expect(patchResp.status).toBe(400);
    const body = (await patchResp.json()) as { error?: { code?: string; message?: string } };
    expect(body.error?.code).toBe('BAD_REQUEST');
    expect(body.error?.message).toMatch(/fromTrustedPicker/i);
  });

  it('rejects valid orchestratorWorkspace on PATCH for OD-owned projects', async () => {
    const projectId = `proj-orchestrator-owned-${Date.now()}`;
    const createResp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Native fixture',
        skillId: null,
        designSystemId: null,
      }),
    });
    expect(createResp.status).toBe(200);

    const patchResp = await fetch(`${baseUrl}/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        metadata: {
          kind: 'prototype',
          orchestratorWorkspace: {
            kind: 'scratch',
            sourceRef: 'main@abc123',
            writeback: 'external',
          },
        },
      }),
    });
    expect(patchResp.status).toBe(400);
    const body = (await patchResp.json()) as { error?: { code?: string; message?: string } };
    expect(body.error?.code).toBe('BAD_REQUEST');
    expect(body.error?.message).toMatch(/orchestratorWorkspace.*import\/folder/i);
  });

  it('rejects malformed orchestratorWorkspace on PATCH /api/projects/:id', async () => {
    const projectId = `proj-orchestrator-patch-${Date.now()}`;
    const createResp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Native fixture',
        skillId: null,
        designSystemId: null,
      }),
    });
    expect(createResp.status).toBe(200);

    const patchResp = await fetch(`${baseUrl}/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        metadata: {
          kind: 'prototype',
          orchestratorWorkspace: {
            kind: 'scratch',
            source_reference: 'typo',
          },
        },
      }),
    });
    expect(patchResp.status).toBe(400);
    const body = (await patchResp.json()) as { error?: { code?: string; message?: string } };
    expect(body.error?.code).toBe('BAD_REQUEST');
    expect(body.error?.message).toMatch(/unsupported field: source_reference/i);
  });
});

// ---------------------------------------------------------------------------
// Project locations routes: GET, PUT, scan, and project creation under an
// external project location.
// ---------------------------------------------------------------------------
describe('project locations routes', () => {
  let server: http.Server;
  let baseUrl: string;
  const tempDirs: string[] = [];

  beforeAll(async () => {
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  });

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    return new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function makeTempDir(): string {
    const d = mkdtempSync(path.join(tmpdir(), 'od-proj-loc-routes-'));
    tempDirs.push(d);
    return d;
  }

  async function putProjectLocations(
    locations: Array<{ id?: string; name?: string; path: string }>,
  ): Promise<Response> {
    return fetch(`${baseUrl}/api/project-locations`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locations }),
    });
  }

  async function putAppConfig(config: Record<string, unknown>): Promise<Response> {
    return fetch(`${baseUrl}/api/app-config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
  }

  it('GET /api/project-locations returns built-in default plus empty external', async () => {
    const resp = await fetch(`${baseUrl}/api/project-locations`);
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { locations: Array<{ id: string; name: string; builtIn?: boolean; path: string }> };
    expect(body.locations).toHaveLength(1); // only default on fresh start
    const loc0 = body.locations[0]!;
    expect(loc0.id).toBe('default');
    expect(loc0.builtIn).toBe(true);
    expect(loc0.name).toBe('Open Design projects');
  });

  it('PUT /api/project-locations creates external roots and GET returns them alongside default', async () => {
    const extDir = makeTempDir();
    const resp = await putProjectLocations([
      { id: 'ext-root', name: 'External', path: extDir },
    ]);
    expect(resp.status).toBe(200);
    const putBody = (await resp.json()) as { locations: Array<{ id: string; builtIn?: boolean; path: string }> };
    expect(putBody.locations).toHaveLength(2);
    const putLoc0 = putBody.locations[0]!;
    const putLoc1 = putBody.locations[1]!;
    expect(putLoc0.id).toBe('default');
    expect(putLoc1.id).toBe('ext-root');
    expect(putLoc1.path).toBe(await realpath(extDir));

    // GET returns the same
    const getResp = await fetch(`${baseUrl}/api/project-locations`);
    expect(getResp.status).toBe(200);
    const getBody = (await getResp.json()) as { locations: Array<{ id: string; builtIn?: boolean; path: string }> };
    expect(getBody.locations).toHaveLength(2);
    const getLoc0 = getBody.locations[0]!;
    const getLoc1 = getBody.locations[1]!;
    expect(getLoc0.id).toBe('default');
    expect(getLoc1.id).toBe('ext-root');
  });

  it('POST /api/project-locations/scan returns empty result when no manifests found', async () => {
    const extDir = makeTempDir();
    await putProjectLocations([{ id: 'empty-ext', name: 'Empty', path: extDir }]);

    const scanResp = await fetch(`${baseUrl}/api/project-locations/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(scanResp.status).toBe(200);
    const body = (await scanResp.json()) as {
      scanned: number;
      imported: unknown[];
      existing: string[];
      skipped: unknown[];
    };
    expect(body.scanned).toBe(0);
    expect(body.imported).toEqual([]);
  });

  it('POST /api/project-locations/scan imports manifest-backed project and skips on re-scan', async () => {
    const extDir = makeTempDir();
    // Create a project directory with a valid manifest
    const projectDir = path.join(extDir, 'scan-test-proj');
    const odDir = path.join(projectDir, '.open-design');
    await mkdir(odDir, { recursive: true });
    const manifest = {
      schemaVersion: 1 as const,
      id: 'scan-test-proj',
      name: 'Scanned Project',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      skillId: null,
      designSystemId: null,
    };
    await writeFile(
      path.join(projectDir, '.open-design', 'project.json'),
      JSON.stringify(manifest, null, 2),
      'utf8',
    );

    // Register the location
    await putProjectLocations([{ id: 'scan-ext', name: 'Scan External', path: extDir }]);

    // First scan: should import
    const scan1 = await fetch(`${baseUrl}/api/project-locations/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(scan1.status).toBe(200);
    const body1 = (await scan1.json()) as {
      scanned: number;
      imported: Array<{ id: string; name: string; metadata?: { baseDir?: string; importedFrom?: string } }>;
      existing: string[];
      skipped: unknown[];
    };
    expect(body1.scanned).toBeGreaterThanOrEqual(1);
    expect(body1.imported).toHaveLength(1);
    const imported0 = body1.imported[0]!;
    expect(imported0.id).toBe('scan-test-proj');
    expect(imported0.name).toBe('Scanned Project');
    // The imported project should have metadata pointing at the external dir
    // (ensureProjectLocation calls realpath which resolves /var -> /private/var on macOS)
    expect(imported0.metadata?.baseDir).toBe(await realpath(projectDir));
    expect(imported0.metadata?.importedFrom).toBe('project-location');
    expect(body1.existing).toEqual([]);

    // Second scan: project already exists, should be in "existing"
    const scan2 = await fetch(`${baseUrl}/api/project-locations/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(scan2.status).toBe(200);
    const body2 = (await scan2.json()) as {
      scanned: number;
      imported: unknown[];
      existing: string[];
    };
    expect(body2.imported).toEqual([]);
    expect(body2.existing).toEqual(['scan-test-proj']);
  });

  it('POST /api/projects with projectLocationId creates project under external root and writes .open-design/project.json', async () => {
    const extDir = makeTempDir();
    // Register an external location
    await putProjectLocations([{ id: 'create-ext', name: 'Create External', path: extDir }]);

    const projectId = `ext-proj-${Date.now()}`;
    const createResp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'External Project',
        skillId: null,
        designSystemId: null,
        projectLocationId: 'create-ext',
      }),
    });
    expect(createResp.status).toBe(200);
    const createBody = (await createResp.json()) as {
      project: { id: string; metadata?: { baseDir?: string; importedFrom?: string; projectLocationId?: string } };
    };
    expect(createBody.project.id).toBe(projectId);
    expect(createBody.project.metadata?.importedFrom).toBe('project-location');
    expect(createBody.project.metadata?.projectLocationId).toBe('create-ext');

    // The project should be under <extDir>/<projectId> (ensureProjectLocation realpaths)
    const expectedProjectDir = await realpath(path.join(extDir, projectId));
    expect(createBody.project.metadata?.baseDir).toBe(expectedProjectDir);

    // Verify .open-design/project.json was written
    const manifestPath = path.join(expectedProjectDir, '.open-design', 'project.json');
    const manifestRaw = await import('node:fs/promises').then((m) => m.readFile(manifestPath, 'utf8'));
    const manifest = JSON.parse(manifestRaw);
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.id).toBe(projectId);
    expect(manifest.name).toBe('External Project');

    // GET /api/projects/:id resolvedDir equals the external project dir
    const detailResp = await fetch(`${baseUrl}/api/projects/${projectId}`);
    expect(detailResp.status).toBe(200);
    const detail = (await detailResp.json()) as { resolvedDir: string };
    expect(detail.resolvedDir).toBe(expectedProjectDir);
  });

  it('POST /api/projects uses the configured default project location when no location is supplied', async () => {
    const extDir = makeTempDir();
    const locationId = 'default-create-location';
    await putProjectLocations([{ id: locationId, name: 'Default External', path: extDir }]);
    const cfgResp = await putAppConfig({ defaultProjectLocationId: locationId });
    expect(cfgResp.status).toBe(200);

    const projectId = `default-location-project-${Date.now()}`;
    const createResp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Default location project',
        skillId: null,
        designSystemId: null,
      }),
    });
    expect(createResp.status).toBe(200);
    const body = (await createResp.json()) as {
      project: { metadata?: { baseDir?: string; projectLocationId?: string; importedFrom?: string } };
    };
    expect(body.project.metadata?.projectLocationId).toBe(locationId);
    expect(body.project.metadata?.importedFrom).toBe('project-location');
    expect(body.project.metadata?.baseDir).toBe(await realpath(path.join(extDir, projectId)));

    await putAppConfig({ defaultProjectLocationId: null });
    await putProjectLocations([]);
  });

  it('POST /api/projects falls back to built-in storage when configured default location is unavailable', async () => {
    await putProjectLocations([]);
    const cfgResp = await putAppConfig({ defaultProjectLocationId: 'missing-location' });
    expect(cfgResp.status).toBe(200);

    const projectId = `missing-default-project-${Date.now()}`;
    const createResp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Missing default project',
        skillId: null,
        designSystemId: null,
      }),
    });
    expect(createResp.status).toBe(200);
    const body = (await createResp.json()) as {
      project: { metadata?: { baseDir?: string; projectLocationId?: string } };
    };
    expect(body.project.metadata?.baseDir).toBeUndefined();
    expect(body.project.metadata?.projectLocationId).toBeUndefined();

    await putAppConfig({ defaultProjectLocationId: null });
  });

  it('PATCH /api/projects/:id preserves project-location provenance with baseDir', async () => {
    const extDir = makeTempDir();
    await putProjectLocations([{ id: 'patch-ext', name: 'Patch External', path: extDir }]);

    const projectId = `ext-patch-${Date.now()}`;
    const createResp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Patch External Project',
        projectLocationId: 'patch-ext',
      }),
    });
    expect(createResp.status).toBe(200);
    const createBody = (await createResp.json()) as {
      project: { metadata?: { baseDir?: string; importedFrom?: string; projectLocationId?: string } };
    };

    const patchResp = await fetch(`${baseUrl}/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metadata: { kind: 'prototype', skipDiscoveryBrief: true } }),
    });
    expect(patchResp.status).toBe(200);
    const patchBody = (await patchResp.json()) as {
      project: { metadata?: { baseDir?: string; importedFrom?: string; projectLocationId?: string; skipDiscoveryBrief?: boolean } };
    };
    expect(patchBody.project.metadata?.baseDir).toBe(createBody.project.metadata?.baseDir);
    expect(patchBody.project.metadata?.importedFrom).toBe('project-location');
    expect(patchBody.project.metadata?.projectLocationId).toBe('patch-ext');
    expect(patchBody.project.metadata?.skipDiscoveryBrief).toBe(true);
  });

  it('PATCH /api/projects/:id rejects metadata null for project-location projects', async () => {
    const extDir = makeTempDir();
    await putProjectLocations([{ id: 'patch-null-ext', name: 'Patch Null External', path: extDir }]);

    const projectId = `ext-patch-null-${Date.now()}`;
    const createResp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Patch Null External Project',
        projectLocationId: 'patch-null-ext',
      }),
    });
    expect(createResp.status).toBe(200);

    const patchResp = await fetch(`${baseUrl}/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metadata: null }),
    });
    expect(patchResp.status).toBe(400);
    const patchBody = (await patchResp.json()) as { error?: { code?: string; message?: string } };
    expect(patchBody.error?.code).toBe('BAD_REQUEST');
    expect(patchBody.error?.message).toMatch(/metadata cannot be cleared/i);
  });

  it('POST /api/projects with unknown projectLocationId returns 400', async () => {
    const projectId = `bad-loc-${Date.now()}`;
    const resp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Bad Location Project',
        projectLocationId: 'nonexistent-location-id',
      }),
    });
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { error?: { code?: string; message?: string } };
    expect(body.error?.code).toBe('BAD_REQUEST');
    expect(body.error?.message).toMatch(/project location/i);
  });

  it('POST /api/projects with invalid designSystemId does not create external project directory', async () => {
    const extDir = makeTempDir();
    await putProjectLocations([{ id: 'invalid-ds-ext', name: 'Invalid DS External', path: extDir }]);

    const projectId = `invalid-ds-${Date.now()}`;
    const resp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Invalid design system project',
        designSystemId: `missing-design-system-${Date.now()}`,
        projectLocationId: 'invalid-ds-ext',
      }),
    });

    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('DESIGN_SYSTEM_NOT_FOUND');
    await expect(readdir(extDir)).resolves.toEqual([]);
  });

  it('PUT /api/project-locations rejects non-array locations body', async () => {
    const resp = await fetch(`${baseUrl}/api/project-locations`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locations: 'not-an-array' }),
    });
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('BAD_REQUEST');
  });

  // -----------------------------------------------------------------------
  // Security boundaries — see #451 (project-locations) for context.
  // -----------------------------------------------------------------------

  it('POST /api/projects with projectLocationId rejects unsafe id "."', async () => {
    const extDir = makeTempDir();
    await putProjectLocations([{ id: 'sec-ext', name: 'Security External', path: extDir }]);

    const resp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: '.',
        name: 'Dot Project',
        projectLocationId: 'sec-ext',
      }),
    });
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { error?: { code?: string; message?: string } };
    expect(body.error?.code).toBe('BAD_REQUEST');
    expect(body.error?.message).toMatch(/invalid project id/i);
  });

  it('POST /api/projects with projectLocationId rejects unsafe id ".."', async () => {
    const extDir = makeTempDir();
    await putProjectLocations([{ id: 'sec-ext2', name: 'Security External 2', path: extDir }]);

    const resp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: '..',
        name: 'DotDot Project',
        projectLocationId: 'sec-ext2',
      }),
    });
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { error?: { code?: string; message?: string } };
    expect(body.error?.code).toBe('BAD_REQUEST');
    expect(body.error?.message).toMatch(/invalid project id/i);
  });

  it('POST /api/projects with projectLocationId rejects when target path already exists as a symlink', async () => {
    const extDir = makeTempDir();
    await putProjectLocations([{ id: 'sym-ext', name: 'Symlink External', path: extDir }]);

    const projectId = `symlink-proj-${Date.now()}`;
    const realTargetDir = path.join(extDir, 'real-target');
    await mkdir(realTargetDir, { recursive: true });

    // Pre-create a symlink at <extDir>/<projectId> pointing to another directory
    const symlinkPath = path.join(extDir, projectId);
    await symlink(realTargetDir, symlinkPath);

    const resp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Symlink Project',
        projectLocationId: 'sym-ext',
      }),
    });
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { error?: { code?: string; message?: string } };
    expect(body.error?.code).toBe('BAD_REQUEST');
  });

  it('PUT /api/project-locations rejects a root overlapping the daemon projects dir', async () => {
    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR required for daemon route tests');
    const projectsDir = path.join(dataDir, 'projects');

    const canonicalProjectsDir = await realpath(projectsDir);

    const resp = await putProjectLocations([
      { id: 'overlap-projects', name: 'Overlap Projects', path: canonicalProjectsDir },
    ]);

    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { error?: { code?: string; message?: string } };
    expect(body.error?.code).toBe('BAD_REQUEST');
    expect(body.error?.message).toMatch(/cannot overlap|daemon data/i);
  });

  it('PUT /api/project-locations rejects filesystem root "/" via isBlocked check', async () => {
    // isBlocked in linked-dirs.ts rejects the filesystem root.
    const resp = await putProjectLocations([
      { id: 'root-loc', name: 'Root', path: '/' },
    ]);
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { error?: { code?: string; message?: string } };
    expect(body.error?.code).toBe('BAD_REQUEST');
  });

  it('app-config bypass: PUT /api/app-config persists invalid path but GET /api/project-locations does not expose it', async () => {
    // Persist a projectLocations entry with a system-protected path ('/') via
    // the generic PUT /api/app-config route, which only validates format, not
    // safety. The GET /api/project-locations route must filter it out because
    // configuredProjectLocations() runs validateLinkedDirs + locationOverlapsDaemonData.
    const appCfgResp = await fetch(`${baseUrl}/api/app-config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectLocations: [
          { id: 'bad-root', name: 'Bad Root', path: '/' },
        ],
      }),
    });
    expect(appCfgResp.status).toBe(200);

    // Verify the persisted config (read back) contains the entry (format validation passed)
    const readCfgResp = await fetch(`${baseUrl}/api/app-config`);
    expect(readCfgResp.status).toBe(200);
    const cfgBody = (await readCfgResp.json()) as {
      config: { projectLocations?: Array<{ id: string; path: string }> };
    };
    // The entry was normalized and persisted
    const locs = cfgBody.config.projectLocations;
    expect(locs).toBeDefined();
    expect(locs!.length).toBeGreaterThanOrEqual(1);

    // But GET /api/project-locations must NOT expose it
    const locResp = await fetch(`${baseUrl}/api/project-locations`);
    expect(locResp.status).toBe(200);
    const locBody = (await locResp.json()) as {
      locations: Array<{ id: string }>;
    };
    const ids = locBody.locations.map((l) => l.id);
    expect(ids).toContain('default'); // built-in always present
    // The invalid location must not appear
    expect(ids).not.toContain('bad-root');

    // Clean up: remove the invalid projectLocations
    await fetch(`${baseUrl}/api/app-config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectLocations: [] }),
    });
  });

  it('app-config bypass: POST /api/projects with invalid persisted root id returns 400 unknown project location', async () => {
    // Persist a projectLocations entry with '/' via app-config.
    // The auto-generated id follows the loc_<base64url> pattern.
    const appCfgResp = await fetch(`${baseUrl}/api/app-config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectLocations: [
          { id: 'evil-root', name: 'Evil Root', path: '/' },
        ],
      }),
    });
    expect(appCfgResp.status).toBe(200);

    // Try to create a project under this location id. Since configuredProjectLocations
    // filters it, the lookup returns nothing → 400 "unknown project location".
    const projectId = `evil-proj-${Date.now()}`;
    const createResp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Evil Project',
        projectLocationId: 'evil-root',
      }),
    });
    expect(createResp.status).toBe(400);
    const body = (await createResp.json()) as { error?: { code?: string; message?: string } };
    expect(body.error?.code).toBe('BAD_REQUEST');
    expect(body.error?.message).toMatch(/unknown project location/i);

    // Clean up
    await fetch(`${baseUrl}/api/app-config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectLocations: [] }),
    });
  });

  it('removing an external location hides its projects but preserves DB history and disk files for re-scan', async () => {
    const extDir = makeTempDir();
    const locationId = 'unreg-loc';
    await putProjectLocations([{ id: locationId, name: 'Unreg External', path: extDir }]);

    // Create a project under this external location
    const projectId = `unreg-proj-${Date.now()}`;
    const createResp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Project To Unregister',
        skillId: null,
        designSystemId: null,
        projectLocationId: locationId,
      }),
    });
    expect(createResp.status).toBe(200);
    const createBody = (await createResp.json()) as {
      project: { id: string };
      conversationId: string;
    };
    expect(createBody.project.id).toBe(projectId);

    const messageId = `msg-${Date.now()}`;
    const messageResp = await fetch(`${baseUrl}/api/projects/${projectId}/conversations/${createBody.conversationId}/messages/${messageId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'user',
        content: 'restore this conversation after location re-add',
      }),
    });
    expect(messageResp.status).toBe(200);

    // Confirm the project is listed
    const listBefore = await fetch(`${baseUrl}/api/projects`);
    expect(listBefore.status).toBe(200);
    const beforeBody = (await listBefore.json()) as { projects: Array<{ id: string }> };
    expect(beforeBody.projects.some((p) => p.id === projectId)).toBe(true);

    // The project directory and manifest should exist on disk
    const expectedProjectDir = await realpath(path.join(extDir, projectId));
    const manifestPath = path.join(expectedProjectDir, '.open-design', 'project.json');
    const manifestBefore = await readFile(manifestPath, 'utf8');
    expect(JSON.parse(manifestBefore).id).toBe(projectId);

    // Remove the external location: PUT empty locations so the location is dropped.
    // This is an unmount/hide operation, not a destructive project delete.
    const removeResp = await putProjectLocations([]);
    expect(removeResp.status).toBe(200);
    const removeBody = (await removeResp.json()) as {
      locations: Array<{ id: string }>;
      removedProjectIds?: string[];
    };
    // The response must include removedProjectIds with our project
    expect(removeBody.removedProjectIds).toBeDefined();
    expect(removeBody.removedProjectIds).toContain(projectId);
    // Only the built-in default location should remain
    expect(removeBody.locations).toHaveLength(1);
    expect(removeBody.locations[0]!.id).toBe('default');

    // The project should no longer appear in GET /api/projects
    const listAfter = await fetch(`${baseUrl}/api/projects`);
    expect(listAfter.status).toBe(200);
    const afterBody = (await listAfter.json()) as { projects: Array<{ id: string }> };
    expect(afterBody.projects.some((p) => p.id === projectId)).toBe(false);

    // GET /api/projects/:id should return 404 while the location is unmounted.
    const detailResp = await fetch(`${baseUrl}/api/projects/${projectId}`);
    expect(detailResp.status).toBe(404);

    // The on-disk project directory and manifest must still be intact
    const manifestAfter = await readFile(manifestPath, 'utf8');
    expect(JSON.parse(manifestAfter).id).toBe(projectId);

    // Re-add the same base and scan: the existing DB row should be revealed,
    // not recreated from only the manifest, so conversation history survives.
    await putProjectLocations([{ id: locationId, name: 'Unreg External', path: extDir }]);
    const scanResp = await fetch(`${baseUrl}/api/project-locations/scan`, { method: 'POST' });
    expect(scanResp.status).toBe(200);
    const scanBody = (await scanResp.json()) as { imported: Array<{ id: string }>; existing: string[] };
    expect(scanBody.imported.some((p) => p.id === projectId)).toBe(false);
    expect(scanBody.existing).toContain(projectId);

    const listReadded = await fetch(`${baseUrl}/api/projects`);
    expect(listReadded.status).toBe(200);
    const readdedBody = (await listReadded.json()) as { projects: Array<{ id: string }> };
    expect(readdedBody.projects.some((p) => p.id === projectId)).toBe(true);

    const messagesResp = await fetch(`${baseUrl}/api/projects/${projectId}/conversations/${createBody.conversationId}/messages`);
    expect(messagesResp.status).toBe(200);
    const messagesBody = (await messagesResp.json()) as { messages: Array<{ id: string; content: string }> };
    expect(messagesBody.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: messageId,
          content: 'restore this conversation after location re-add',
        }),
      ]),
    );
  });
});

async function withSandboxMode<T>(run: () => Promise<T>): Promise<T> {
  const previous = process.env.OD_SANDBOX_MODE;
  process.env.OD_SANDBOX_MODE = '1';
  try {
    return await run();
  } finally {
    if (previous == null) delete process.env.OD_SANDBOX_MODE;
    else process.env.OD_SANDBOX_MODE = previous;
  }
}
