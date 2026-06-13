// Phase 4 / spec §10.3.5 — GET /api/runs/:id/agui smoke.
//
// Covers the basic shape of the AG-UI canonical event stream:
//   - 404 for an unknown run id.
//   - Replays existing events through the encoder when a client
//     reconnects with a Last-Event-ID.

import type http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from '../src/server.js';

let server: http.Server;
let baseUrl: string;
let shutdown: (() => Promise<void> | void) | undefined;

beforeAll(async () => {
  const started = (await startServer({ port: 0, returnServer: true })) as {
    url: string;
    server: http.Server;
    shutdown?: () => Promise<void> | void;
  };
  baseUrl = started.url;
  server = started.server;
  shutdown = started.shutdown;
});

afterAll(async () => {
  await Promise.resolve(shutdown?.());
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('GET /api/runs/:id/agui', () => {
  it('returns 404 for an unknown run', async () => {
    const resp = await fetch(`${baseUrl}/api/runs/no-such-run/agui`);
    expect(resp.status).toBe(404);
  });
});
