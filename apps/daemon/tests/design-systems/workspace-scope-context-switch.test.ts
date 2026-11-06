// Design-system catalog/create are data-plane operations. They must resolve
// their Workspace from the request identity, not from the daemon's mutable
// active/current Workspace. Otherwise two tabs can cross: an A request that
// lands after a B switch is listed/stamped as B.

import type http from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from '../../src/server.js';

type StartedServer = {
  url: string;
  server: http.Server;
  shutdown?: () => Promise<void> | void;
};

const CONTEXT_WS1 = {
  workspaceMemberId: 'member-switch',
  workspaceId: 'ws-switch-one',
  workspaceType: 'team',
  role: 'owner',
  memberStatus: 'active',
  lifecycleState: 'active',
};

const CONTEXT_WS2 = {
  workspaceMemberId: 'member-switch',
  workspaceId: 'ws-switch-two',
  workspaceType: 'personal',
  role: 'owner',
  memberStatus: 'active',
  lifecycleState: 'active',
};

// The dev/demo seam (`workspaceContext.set`), NOT `PUT /api/workspace/active`:
// this is deliberately the same shape as a Vela-Web-driven switch — the
// daemon's notion of "current" context changes, but no local pin is written.
async function setContext(baseUrl: string, context: unknown): Promise<void> {
  const resp = await fetch(`${baseUrl}/api/workspace/context`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(context),
  });
  expect(resp.ok).toBe(true);
}

function workspaceHeaders(context: typeof CONTEXT_WS1 | typeof CONTEXT_WS2): Record<string, string> {
  return {
    'x-od-workspace-id': context.workspaceId,
    'x-od-workspace-member-id': context.workspaceMemberId,
    'x-od-workspace-type': context.workspaceType,
    'x-od-workspace-role': context.role,
    'x-od-workspace-member-status': context.memberStatus,
    'x-od-workspace-lifecycle-state': context.lifecycleState,
  };
}

describe('GET/POST /api/design-systems — explicit request scope is isolated from daemon current Workspace', () => {
  let server: http.Server;
  let baseUrl: string;
  let shutdown: (() => Promise<void> | void) | undefined;

  beforeAll(async () => {
    const started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    baseUrl = started.url;
    server = started.server;
    shutdown = started.shutdown;
  });

  afterAll(async () => {
    await Promise.resolve(shutdown?.());
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('keeps the completely headerless signed-out/local lane unbound', async () => {
    const title = `local unbound ${Date.now()}`;
    const createdResponse = await fetch(`${baseUrl}/api/design-systems`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    expect(createdResponse.status).toBe(201);
    const created = (await createdResponse.json()) as {
      id: string;
      workspaceId?: string;
    };
    expect(created.workspaceId).toBeUndefined();

    const listedResponse = await fetch(`${baseUrl}/api/design-systems`);
    expect(listedResponse.status).toBe(200);
    const listed = (await listedResponse.json()) as {
      designSystems: Array<{ id: string }>;
    };
    expect(listed.designSystems.some((item) => item.id === created.id)).toBe(true);

    const scopedResponse = await fetch(`${baseUrl}/api/design-systems`, {
      headers: workspaceHeaders(CONTEXT_WS1),
    });
    expect(scopedResponse.status).toBe(200);
    const scoped = (await scopedResponse.json()) as {
      designSystems: Array<{ id: string }>;
    };
    expect(scoped.designSystems.some((item) => item.id === created.id)).toBe(false);

    const scopedDetailResponse = await fetch(
      `${baseUrl}/api/design-systems/${encodeURIComponent(created.id)}`,
      { headers: workspaceHeaders(CONTEXT_WS1) },
    );
    expect(scopedDetailResponse.status).toBe(403);

    const scopedFilesResponse = await fetch(
      `${baseUrl}/api/design-systems/${encodeURIComponent(created.id)}/files`,
      { headers: workspaceHeaders(CONTEXT_WS1) },
    );
    expect(scopedFilesResponse.status).toBe(403);
  });

  it('rejects a half-specified Workspace identity instead of treating it as local', async () => {
    const response = await fetch(`${baseUrl}/api/design-systems`, {
      headers: { 'x-od-workspace-id': 'ws-switch-one' },
    });
    expect(response.status).toBe(400);
  });

  it('keeps an A request on A after a legacy context write without creating ambient authority', async () => {
    await setContext(baseUrl, CONTEXT_WS2);

    const createResp1 = await fetch(`${baseUrl}/api/design-systems`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...workspaceHeaders(CONTEXT_WS1),
      },
      body: JSON.stringify({ title: `ws1 system ${Date.now()}` }),
    });
    expect(createResp1.status).toBe(201);
    const createdInWs1 = (await createResp1.json()) as { id: string; workspaceId?: string };
    expect(createdInWs1.workspaceId).toBe('ws-switch-one');

    const workspaceResp = await fetch(
      `${baseUrl}/api/design-systems/${encodeURIComponent(createdInWs1.id)}/workspace`,
      {
        method: 'POST',
        headers: workspaceHeaders(CONTEXT_WS1),
      },
    );
    expect(workspaceResp.status).toBe(201);
    const workspaceBody = await workspaceResp.json() as {
      project: { id: string };
    };
    const projectsResp = await fetch(
      `${baseUrl}/api/workspaces/${CONTEXT_WS1.workspaceId}/projects?view=all`,
      { headers: workspaceHeaders(CONTEXT_WS1) },
    );
    expect(projectsResp.status).toBe(200);
    const projectsBody = await projectsResp.json() as {
      projects: Array<{
        id: string;
        createdByWorkspaceMemberId?: string | null;
      }>;
    };
    expect(
      projectsBody.projects.find((project) => project.id === workspaceBody.project.id),
    ).toMatchObject({
      id: workspaceBody.project.id,
      createdByWorkspaceMemberId: CONTEXT_WS1.workspaceMemberId,
    });

    // The compatibility write no longer creates daemon-global data-plane
    // authority. Each tab's following request must remain self-contained.
    const ctxResp = await fetch(`${baseUrl}/api/workspace/context`);
    const ctxBody = (await ctxResp.json()) as { context: { workspaceId: string } | null };
    expect(ctxBody.context?.workspaceId).toBeUndefined();

    const listResp = await fetch(`${baseUrl}/api/design-systems`, {
      headers: workspaceHeaders(CONTEXT_WS1),
    });
    const listBody = (await listResp.json()) as {
      designSystems: Array<{ id: string; workspaceId?: string }>;
    };
    expect(listBody.designSystems.some((d) => d.id === createdInWs1.id)).toBe(true);

    const createResp2 = await fetch(`${baseUrl}/api/design-systems`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...workspaceHeaders(CONTEXT_WS2),
      },
      body: JSON.stringify({ title: `ws2 system ${Date.now()}` }),
    });
    expect(createResp2.status).toBe(201);
    const createdInWs2 = (await createResp2.json()) as { id: string; workspaceId?: string };
    expect(createdInWs2.workspaceId).toBe('ws-switch-two');

    const listWs1Resp = await fetch(`${baseUrl}/api/design-systems`, {
      headers: workspaceHeaders(CONTEXT_WS1),
    });
    const listWs1Body = (await listWs1Resp.json()) as { designSystems: Array<{ id: string }> };
    expect(listWs1Body.designSystems.some((d) => d.id === createdInWs1.id)).toBe(true);
    expect(listWs1Body.designSystems.some((d) => d.id === createdInWs2.id)).toBe(false);
  });
});

describe('resolveDesignSystemWorkspaceScope — stale local pins are never data-plane authority', () => {
  // This function's session-liveness gate (`collab.workspaceContext.lastKnown()`)
  // is untouched by the TTL-cache fix above — this suite exists to prove
  // removing that cache did not also disturb the gate. A fresh server
  // instance is used (rather than reusing the suite above) so its
  // `activeWorkspace` pin-file reader starts with an empty in-memory cache and
  // performs its first disk read AFTER the stale pin below is written —
  // mirroring a real daemon restart finding a leftover pin file on disk.
  let server: http.Server;
  let baseUrl: string;
  let shutdown: (() => Promise<void> | void) | undefined;

  beforeAll(async () => {
    // A stale local pin exactly like a real leftover from a previous identity
    // — `velaLogout` never clears this file (only a CONFIRMED member-removal
    // does; see `resolvePinnedWorkspace` in vela-workspace-context.ts).
    const dataDir = process.env.OD_DATA_DIR!;
    writeFileSync(
      path.join(dataDir, 'workspace-selection.json'),
      `${JSON.stringify({ workspaceId: 'ws-stale-pin' }, null, 2)}\n`,
    );
    // A design system claimed by the pinned workspace, seeded directly on
    // disk so this suite is independent of the other describe block's state.
    const dsDir = path.join(dataDir, 'design-systems', 'pinned-claim');
    mkdirSync(dsDir, { recursive: true });
    writeFileSync(path.join(dsDir, 'DESIGN.md'), '# Pinned claim\n\nSeeded directly on disk.\n');
    writeFileSync(
      path.join(dsDir, 'metadata.json'),
      `${JSON.stringify({ title: 'Pinned claim', workspaceId: 'ws-stale-pin' }, null, 2)}\n`,
    );

    const started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    baseUrl = started.url;
    server = started.server;
    shutdown = started.shutdown;
  });

  afterAll(async () => {
    await Promise.resolve(shutdown?.());
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('ignores a stale pin when an explicit request names another Workspace', async () => {
    const resp = await fetch(`${baseUrl}/api/design-systems`, {
      headers: workspaceHeaders(CONTEXT_WS2),
    });
    const body = (await resp.json()) as { designSystems: Array<{ id: string }> };
    expect(body.designSystems.some((d) => d.id === 'user:pinned-claim')).toBe(false);
  });

  it('quarantines a metadata-only claim without an exact member ownership envelope', async () => {
    const resp = await fetch(`${baseUrl}/api/design-systems`, {
      headers: workspaceHeaders({
        ...CONTEXT_WS1,
        workspaceId: 'ws-stale-pin',
      }),
    });
    const body = (await resp.json()) as { designSystems: Array<{ id: string }> };
    expect(body.designSystems.some((d) => d.id === 'user:pinned-claim')).toBe(false);
  });
});
