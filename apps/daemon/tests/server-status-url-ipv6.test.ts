// Regression coverage for the #6425 review: `startServer`'s reported status
// URL used to concatenate a bare (unbracketed) host into an `http://` string
// — `http://${reportHost}:${resolvedPort}` — which is only valid for
// hostnames and IPv4 literals. An IPv6 literal (e.g. a supported
// `OD_BIND_HOST=::1`) needs brackets: `new URL('http://::1:7456')` throws
// (the bare colons are ambiguous with the port separator), so every consumer
// of this URL — the sidecar, daemon-url.ts's conventional discovery, or any
// plain client fetching /api/mcp/install-info — would fail before it could
// even try to reach a real IPv6-bound daemon. `daemon-url.test.ts`'s own
// "accepts a conventional-path response whose url is IPv6 loopback" test
// only proves `isLoopbackHttpUrl` accepts a well-formed bracketed URL; it
// does not prove the daemon ever actually produces one. This test closes
// that producer/consumer gap directly against the real `startServer`.

import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { startServer } from '../src/server.js';

type StartedServer = {
  url: string;
  server: Server;
  shutdown?: () => Promise<void> | void;
};

describe('startServer status URL formatting', () => {
  let started: StartedServer | null = null;

  afterEach(async () => {
    // `shutdown` (startServer's returned shutdownDaemonRuns) drains daemon
    // work; it does NOT close the HTTP server itself, so that has to happen
    // separately or every test here leaks a live listener/open handle.
    await Promise.resolve(started?.shutdown?.());
    if (started?.server) {
      await new Promise<void>((resolve) => started?.server.close(() => resolve()));
    }
    started = null;
  });

  it('brackets an IPv6 bind host so the reported url is a valid, parseable URL', async () => {
    started = (await startServer({ port: 0, host: '::1', returnServer: true })) as StartedServer;

    // The core regression: this must not throw.
    const parsed = new URL(started.url);
    // WHATWG URL always brackets an IPv6 literal in `.hostname`.
    expect(parsed.hostname).toBe('[::1]');
    expect(started.url).toMatch(/^http:\/\/\[::1\]:\d+$/);
  });

  it('leaves an IPv4/hostname bind host unbracketed (no regression for the common case)', async () => {
    started = (await startServer({ port: 0, host: '127.0.0.1', returnServer: true })) as StartedServer;

    expect(started.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });
});
