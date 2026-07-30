import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type http from 'node:http';

import { openDatabase } from '../src/db.js';
import { startServer } from '../src/server.js';

// #2 (team collab): once a project is moved out of the team, a former member's
// pulled local mirror must stop serving its files. The pull gate stamps a
// non-destructive `teamMirrorRevokedAt` flag on the local project; the read
// routes must then refuse to serve it (the bytes stay on disk, so a re-share
// clears the flag and restores access). A member's own local project — which
// never carries the flag — must keep reading normally.
describe('team mirror read revocation', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  async function createProject(id: string, metadata?: Record<string, unknown>) {
    const res = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, name: id, skillId: null, designSystemId: null, ...(metadata ? { metadata } : {}) }),
    });
    expect(res.status).toBe(200);
    return await res.json() as {
      conversationId?: string;
    };
  }

  async function addIndexHtml(id: string) {
    const res = await fetch(`${baseUrl}/api/projects/${id}/files`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'index.html', content: '<h1>mirror</h1>' }),
    });
    expect(res.status).toBe(200);
  }

  it('serves a normal project but 404s reads of a revoked team mirror', async () => {
    const suffix = Date.now();
    const normalId = `mirror-normal-${suffix}`;
    const revokedId = `mirror-revoked-${suffix}`;

    const normalProject = await createProject(normalId);
    await addIndexHtml(normalId);
    // A revoked mirror still has its bytes on disk (addIndexHtml writes them);
    // only the read routes must refuse.
    const revokedProject = await createProject(revokedId, {
      teamMirrorRevokedAt: suffix,
    });
    await addIndexHtml(revokedId);

    // The quarantine marker is durable. Restart so the production O(1)
    // revoked-project index hydrates from SQLite exactly as a member daemon
    // does after observing an unshare in an earlier process.
    await new Promise<void>((resolve) => server.close(() => resolve()));
    const restarted = (await startServer({
      port: 0,
      returnServer: true,
    })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = restarted.url;
    server = restarted.server;

    // Control: the member's own (unflagged) project reads normally.
    expect((await fetch(`${baseUrl}/api/projects/${normalId}/raw/index.html`)).status).toBe(200);
    expect((await fetch(`${baseUrl}/api/projects/${normalId}/files`)).status).toBe(200);
    expect((await fetch(`${baseUrl}/api/projects/${normalId}/files/index.html`)).status).toBe(200);

    // Revoked team mirror: content, metadata, conversation, status, tabs,
    // preview, live-artifact, and SSE entry points all refuse.
    expect((await fetch(`${baseUrl}/api/projects/${revokedId}/raw/index.html`)).status).toBe(404);
    expect((await fetch(`${baseUrl}/api/projects/${revokedId}/files`)).status).toBe(404);
    expect((await fetch(`${baseUrl}/api/projects/${revokedId}/files/index.html`)).status).toBe(404);
    const conversationId = revokedProject.conversationId;
    expect(conversationId).toBeTruthy();
    const deniedReadUrls = [
      `/api/projects/${revokedId}`,
      `/api/projects/${revokedId}/workspace-scope`,
      `/api/projects/${revokedId}/tabs`,
      `/api/projects/${revokedId}/events`,
      `/api/projects/${revokedId}/preview-url`,
      `/api/projects/${revokedId}/conversations`,
      `/api/projects/${revokedId}/conversations/${conversationId}/messages`,
      `/api/projects/${revokedId}/collab/status`,
      `/api/live-artifacts?projectId=${revokedId}`,
      `/api/live-artifacts/missing/preview?projectId=${revokedId}`,
    ];
    for (const url of deniedReadUrls) {
      expect(
        (await fetch(`${baseUrl}${url}`)).status,
        `expected ${url} to deny the revoked mirror`,
      ).toBe(404);
    }
    // Hot-path quarantine checks must use the startup-hydrated in-memory
    // index. Detail/files already need one project row for their response;
    // revocation must not add a second lookup. Comments need no project row
    // at all. Check both normal and revoked projects so the optimization
    // cannot accidentally become a revoked-only shortcut.
    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required for this test');
    const db = openDatabase(process.cwd(), { dataDir });
    const prepareSpy = vi.spyOn(db, 'prepare');
    const projectMetadataReads = () =>
      prepareSpy.mock.calls.filter(
        ([sql]) =>
          typeof sql === 'string'
          && /\bFROM projects WHERE id = \?/.test(sql),
      ).length;
    const expectProjectReads = async (
      url: string,
      expectedStatus: number,
      expectedReads: number,
    ) => {
      prepareSpy.mockClear();
      expect((await fetch(`${baseUrl}${url}`)).status).toBe(expectedStatus);
      expect(projectMetadataReads(), `unexpected project-row reads for ${url}`)
        .toBe(expectedReads);
    };
    try {
      await expectProjectReads(`/api/projects/${normalId}`, 200, 1);
      await expectProjectReads(`/api/projects/${revokedId}`, 404, 1);
      await expectProjectReads(`/api/projects/${normalId}/files`, 200, 1);
      await expectProjectReads(`/api/projects/${revokedId}/files`, 404, 1);
      await expectProjectReads(
        `/api/projects/${normalId}/conversations/${normalProject.conversationId}/comments`,
        200,
        0,
      );
      await expectProjectReads(
        `/api/projects/${revokedId}/conversations/${conversationId}/comments`,
        403,
        0,
      );
    } finally {
      prepareSpy.mockRestore();
    }
  });
});
