import { execFile as execFileCallback } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

import {
  closeHttpServer,
  stopDaemonRuntime,
} from '../src/daemon-startup.js';

const execFile = promisify(execFileCallback);

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

  it('closes the listener while daemon cleanup finishes', async () => {
    server = createServer();
    await listen(server);
    let finishShutdown!: () => void;
    const shutdown = new Promise<void>((resolve) => {
      finishShutdown = resolve;
    });

    const stop = stopDaemonRuntime({
      server,
      shutdown: () => shutdown,
      url: `http://127.0.0.1:${port(server)}`,
    });

    await waitUntil(() => !server?.listening);
    expect(server.listening).toBe(false);
    finishShutdown();
    await stop;
    expect(server.listening).toBe(false);
  });

  it('keeps top-level await alive for unrefed shutdown work', async () => {
    const startupModule = new URL('../src/daemon-startup.ts', import.meta.url).href;
    const script = `
      import { createServer } from 'node:http';
      import { stopDaemonRuntime } from ${JSON.stringify(startupModule)};

      const server = createServer();
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      await stopDaemonRuntime({
        server,
        shutdown: () => new Promise((resolve) => setTimeout(resolve, 25).unref()),
        url: 'http://127.0.0.1',
      });
      process.stdout.write('stopped\\n');
    `;

    const result = await execFile(
      process.execPath,
      ['--input-type=module', '--eval', script],
      { cwd: process.cwd() },
    );
    expect(result.stdout).toBe('stopped\n');
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

async function waitUntil(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('condition did not become true');
}
