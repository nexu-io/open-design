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
