import type http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

// Red specs for #7040 — POST /api/runs minted failing runs on empty/
// oversized bodies.
describe('run creation input validation (#7040)', () => {
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

  it('rejects an empty run request before agent discovery', async () => {
    // #7040 — the no-source preflight must reject this before the multi-second
    // detectAgents() CLI probe. The repro without an explicit agentId paid ~16s
    // of agent discovery before the normalized gate returned 400, so assert the
    // empty body is rejected well under that (allowing for first-request lazy
    // init); a regression that lets agent discovery run would blow this budget.
    const startedAt = Date.now();
    const resp = await fetch(baseUrl + '/api/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const elapsedMs = Date.now() - startedAt;
    expect(resp.status).toBe(400);
    expect(elapsedMs).toBeLessThan(8000);
  });

  it('rejects a whitespace-only message', async () => {
    const resp = await fetch(baseUrl + '/api/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '   ' }),
    });
    expect(resp.status).toBe(400);
  });

  it('rejects malformed source fields', async () => {
    // Source-less bodies (non-string prompts) are rejected by the early
    // preflight before agent discovery. Bodies that carry a raw attachment or
    // plugin source but no resolvable one are rejected by the normalized gate;
    // give those an explicit agentId so the spec does not pay the multi-second
    // detectAgents() CLI probe on the way to that gate.
    const cases = [
      { message: {} },
      { message: 42 },
      { agentId: 'missing-agent', attachments: [null, 42] },
      { agentId: 'missing-agent', commentAttachments: [42] },
      { agentId: 'missing-agent', pluginId: 'definitely-not-installed' },
    ];
    for (const body of cases) {
      const resp = await fetch(baseUrl + '/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      expect(resp.status, JSON.stringify(body)).toBe(400);
    }
  });

  it('accepts attachments-only turns with an empty message', async () => {
    const id = 'att-only-' + Date.now();
    const create = await fetch(baseUrl + '/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name: 'Attachments Only' }),
    });
    expect(create.status).toBe(200);
    const convId = ((await create.json()) as { conversationId: string }).conversationId;
    const resp = await fetch(baseUrl + '/api/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'missing-agent-' + Date.now(),
        projectId: id,
        conversationId: convId,
        message: '',
        attachments: ['assets/no-prompt.png'],
      }),
    });
    expect(resp.status).toBe(202);
  });

  it('still accepts a normal prompt', async () => {
    // Explicit agentId keeps this spec off the multi-second detectAgents()
    // probe; the early/normalized gates run before agent detection anyway, so
    // the guard against false rejection is unchanged.
    const resp = await fetch(baseUrl + '/api/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: 'missing-agent', message: 'build a landing page' }),
    });
    expect(resp.status).not.toBe(400);
  });

  it('rejects an oversized JSON body at the route-level parser', async () => {
    const big = JSON.stringify({ message: 'x'.repeat(2 * 1024 * 1024) });
    const resp = await fetch(baseUrl + '/api/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: big,
    });
    expect(resp.status).toBe(413);
  });
});
