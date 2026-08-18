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

  it('rejects an empty run request', async () => {
    const resp = await fetch(baseUrl + '/api/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(resp.status).toBe(400);
  });

  it('rejects a whitespace-only message', async () => {
    const resp = await fetch(baseUrl + '/api/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '   ' }),
    });
    expect(resp.status).toBe(400);
  });

  it('still accepts a normal prompt', async () => {
    const resp = await fetch(baseUrl + '/api/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'build a landing page' }),
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
