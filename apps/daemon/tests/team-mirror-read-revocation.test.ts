import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type http from 'node:http';

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

    await createProject(normalId);
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
    // Comment reads use their own context resolver rather than the generic
    // project gate, but must fail closed as well.
    expect(
      (
        await fetch(
          `${baseUrl}/api/projects/${revokedId}/conversations/${conversationId}/comments`,
        )
      ).status,
    ).toBe(403);
  });
});
