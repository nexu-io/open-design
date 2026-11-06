import type http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from '../src/server.js';

// Regression guard for the HTTP keep-alive widening landed in #2557.
// AGENTS.md → "Bug follow-up workflow" asks risk/high daemon bugfixes to
// lead with a falsifiable spec. The bug being fixed is a 5s default
// `server.keepAliveTimeout` that's tighter than the in-band SSE keepalive
// cadence (`SSE_KEEPALIVE_INTERVAL_MS = 25_000`) — a future refactor of
// the `listen` callback could silently restore the Node default and the
// regression would not surface in any other test.
describe('startServer HTTP keep-alive tuning', () => {
  let server: http.Server;

  beforeAll(async () => {
    const started = await startServer({ port: 0, returnServer: true }) as {
      url: string;
      server: http.Server;
    };
    server = started.server;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('widens keepAliveTimeout above the in-band SSE keepalive (25s)', () => {
    // SSE_KEEPALIVE_INTERVAL_MS is 25_000; the listener must exceed it
    // comfortably so kept-alive sockets used around an SSE stream survive
    // routine client pauses.
    expect(server.keepAliveTimeout).toBeGreaterThanOrEqual(60_000);
  });

  it('keeps headersTimeout above keepAliveTimeout per Node convention', () => {
    // Node docs: `headersTimeout` must exceed `keepAliveTimeout`, otherwise
    // a slow-loris client can stall request parsing indefinitely.
    expect(server.headersTimeout).toBeGreaterThan(server.keepAliveTimeout);
  });
});
