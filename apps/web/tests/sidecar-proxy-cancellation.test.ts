import { createServer, get, type RequestListener, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createDaemonProxyHandler } from '../sidecar/server';

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => {
    server.close(() => resolve());
    server.closeAllConnections();
  })));
});

async function listen(server: Server): Promise<number> {
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return (server.address() as AddressInfo).port;
}

async function proxy(handler: RequestListener): Promise<string> {
  const daemonPort = await listen(createServer(handler));
  const proxyPort = await listen(createServer(createDaemonProxyHandler(
    `http://127.0.0.1:${daemonPort}`,
    async (_request, response) => { response.writeHead(404).end(); },
  )));
  return `http://127.0.0.1:${proxyPort}/api/projects/p/conversations/c/messages`;
}

describe('packaged proxy cancellation', () => {
  it('closes a backpressured upstream when the client cancels a transcript', async () => {
    let closed = false;
    let blocked = false;
    let requests = 0;
    const url = await proxy((_request, response) => {
      requests++;
      response.setHeader('content-type', 'application/x-ndjson');
      response.on('close', () => { closed = true; });
      const chunk = `${JSON.stringify({ type: 'message', message: { content: 'x'.repeat(128 * 1024) } })}\n`;
      const pump = () => {
        while (!response.destroyed) {
          if (!response.write(chunk)) {
            blocked = true;
            response.once('drain', pump);
            return;
          }
        }
      };
      pump();
    });
    await new Promise<void>((resolve, reject) => {
      get(url, response => {
        response.once('data', () => {
          response.pause();
          response.destroy();
          resolve();
        });
        response.on('error', reject);
      }).on('error', reject);
    });
    await expect.poll(() => closed, { timeout: 2_000 }).toBe(true);
    expect(blocked).toBe(true);
    expect(requests).toBe(1);
  });

  it('cancels upstream while waiting for response headers without retrying', async () => {
    let upstream: ServerResponse | undefined;
    let requests = 0;
    const url = await proxy((_request, response) => { requests++; upstream = response; });
    const client = get(url);
    client.on('error', () => {});
    await expect.poll(() => upstream != null).toBe(true);
    client.destroy();
    await expect.poll(() => upstream?.destroyed).toBe(true);
    expect(requests).toBe(1);
  });

  it('preserves an upstream interruption as a failed body read', async () => {
    const url = await proxy((_request, response) => {
      response.setHeader('content-type', 'application/x-ndjson');
      response.write('{"type":"message"}\n');
      setImmediate(() => response.destroy());
    });
    const response = await fetch(url);
    await expect(response.text()).rejects.toThrow();
  });

  it('finishes a complete stream normally', async () => {
    const body = '{"type":"end","count":0}\n';
    const url = await proxy((_request, response) => {
      response.setHeader('content-type', 'application/x-ndjson');
      response.end(body);
    });
    expect(await (await fetch(url)).text()).toBe(body);
  });
});
