import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';

import { closeHttpServer } from '../src/sidecar/server.js';

describe('daemon sidecar HTTP shutdown', () => {
  let server: Server | null = null;

  afterEach(async () => {
    if (!server?.listening) return;
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = null;
  });

  it('force-closes long-lived responses when the graceful close timeout expires', async () => {
    server = createServer((_req, res) => {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write('event: open\ndata: {}\n\n');
    });
    await listen(server);

    const response = await fetch(`http://127.0.0.1:${port(server)}/events`);
    expect(response.status).toBe(200);

    const startedAt = Date.now();
    await closeHttpServer(server, { closeTimeoutMs: 50, idleCloseMs: 5 });

    expect(Date.now() - startedAt).toBeLessThan(1_000);
    expect(server.listening).toBe(false);
  });
});

async function listen(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
}

function port(server: Server): number {
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('server did not bind to a TCP port');
  }
  return address.port;
}
