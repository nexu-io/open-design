import type http from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

// POST /api/projects derives `metadata.skipDiscoveryBrief` for Website Clone
// projects whose pending prompt already carries the target URL: the URL is
// the brief for that scenario, so the turn-1 discovery question form must
// not stall the run. An explicit client-provided flag wins in both
// directions, and other intents/kinds keep the normal discovery flow.
describe('web-clone project create skips discovery when a URL is present', () => {
  let server: http.Server;
  let baseUrl: string;
  const projectsToClean: string[] = [];

  beforeAll(async () => {
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  });

  afterAll(async () => {
    for (const id of projectsToClean.splice(0)) {
      await fetch(`${baseUrl}/api/projects/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }).catch(() => {});
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function createProject(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const id = `web-clone-discovery-${randomUUID()}`;
    projectsToClean.push(id);
    const resp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name: 'web-clone discovery gate', ...body }),
    });
    expect(resp.status).toBe(200);
    const json = (await resp.json()) as { project: { metadata: Record<string, unknown> | null } };
    return json.project.metadata ?? {};
  }

  it('sets skipDiscoveryBrief for a web-clone project whose prompt carries a URL', async () => {
    const metadata = await createProject({
      metadata: { kind: 'prototype', intent: 'web-clone' },
      pendingPrompt: '想要复刻的网站链接：https://nexu.io',
    });
    expect(metadata.skipDiscoveryBrief).toBe(true);
  });

  it('keeps discovery when the web-clone prompt has no URL yet', async () => {
    const metadata = await createProject({
      metadata: { kind: 'prototype', intent: 'web-clone' },
      pendingPrompt: '想要复刻的网站链接：',
    });
    expect(metadata.skipDiscoveryBrief).toBeUndefined();
  });

  it('lets an explicit client skipDiscoveryBrief=false win over the derivation', async () => {
    const metadata = await createProject({
      metadata: { kind: 'prototype', intent: 'web-clone' },
      pendingPrompt: 'clone https://nexu.io please',
      skipDiscoveryBrief: false,
    });
    expect(metadata.skipDiscoveryBrief).toBeUndefined();
  });

  it('does not derive the skip for non-web-clone projects with URLs', async () => {
    const metadata = await createProject({
      metadata: { kind: 'prototype' },
      pendingPrompt: 'build a landing page like https://nexu.io',
    });
    expect(metadata.skipDiscoveryBrief).toBeUndefined();
  });
});
