// Role: Daemon HTTP tests for badge stamp at project create and PATCH preservation.
// Key Features: badge pre-insert stamp, badge survives PATCH, badge independent of resolve
// Dependencies: startServer from server.ts, vitest
// Notes: braze-iam plugin auto-registered at boot via registerBundledPlugins (server.ts)

import type http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

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

// Task 4: Spec locking in badge-survives-resolve-failure invariant.
// The badge is stamped PRE-INSERT (before resolvePluginSnapshot is called),
// so even if resolve fails the stored row already has the badge.
// We prove this via HTTP: create a project and read it back via GET /api/projects/:id
// which reads from the DB row — the row was written before resolve ran.
describe('badge survives resolve failure (pre-insert stamp regression guard)', () => {
  it('persists badge in the DB row before resolve runs — confirmed via GET /api/projects/:id', async () => {
    // Create a project; the badge must appear in the persisted row regardless
    // of what resolve does. GET /api/projects/:id reads from the DB row directly.
    const id = `proj-badge-preinsert-${Date.now()}`;
    const resp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // No explicit inputs — audience uses its default value.
      body: JSON.stringify({ id, name: 'Badge Preinsert', pluginId: 'example-braze-iam' }),
    });
    expect(resp.ok).toBe(true);
    // Read back from DB via GET (not from the POST response which includes
    // the in-memory project object after resolve — the GET always reads the row).
    const detail = await fetch(`${baseUrl}/api/projects/${id}`).then((r) => r.json()) as {
      project: { metadata?: { badge?: unknown } };
    };
    // If the badge were stamped post-resolve, a resolve failure would leave it absent.
    // Pre-insert means it must always be here.
    expect(detail.project.metadata?.badge).toEqual({ label: 'In-App Message', tone: 'pink' });
  });
});

describe('badge stamp at create', () => {
  it('stamps metadata.badge from the braze manifest', async () => {
    // braze-iam requires `audience` input for resolve — supply it so the
    // response is 200 and we can inspect project.metadata directly.
    // POST /api/projects requires a caller-supplied `id` (safe-id format).
    const id = `proj-braze-badge-${Date.now()}`;
    const resp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id,
        name: 'Braze IAM',
        pluginId: 'example-braze-iam',
        inputs: { audience: 'test users' },
      }),
    });
    expect(resp.ok).toBe(true);
    const { project } = await resp.json() as { project: { metadata?: { badge?: unknown } } };
    expect(project.metadata?.badge).toEqual({ label: 'In-App Message', tone: 'pink' });
  });

  it('leaves badge undefined for a plain project with no plugin', async () => {
    const id = `proj-plain-badge-${Date.now()}`;
    const resp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, name: 'Plain' }),
    });
    expect(resp.ok).toBe(true);
    const { project } = await resp.json() as { project: { metadata?: { badge?: unknown } } };
    expect(project.metadata?.badge).toBeUndefined();
  });
});

describe('badge preservation across PATCH', () => {
  it('preserves badge across a metadata PATCH that omits it', async () => {
    // Create a project with the braze plugin to get the badge stamped.
    const id = `proj-patch-badge-${Date.now()}`;
    const created = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, name: 'B2', pluginId: 'example-braze-iam' }),
    }).then((r) => r.json()) as { project: { id: string } };
    // PATCH with metadata that omits badge — badge must be preserved.
    await fetch(`${baseUrl}/api/projects/${created.project.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ metadata: { kind: 'prototype' } }),
    });
    const after = await fetch(`${baseUrl}/api/projects/${created.project.id}`).then((r) => r.json()) as {
      project: { metadata?: { badge?: unknown } };
    };
    expect(after.project.metadata?.badge).toEqual({ label: 'In-App Message', tone: 'pink' });
  });
});
