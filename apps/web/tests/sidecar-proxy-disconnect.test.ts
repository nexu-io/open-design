import {
  createServer,
  request as createRequest,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo, Socket } from 'node:net';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDaemonProxyHandler } from '../sidecar/server';

const cleanups: (() => Promise<void> | void)[] = [];

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()!();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

function closed(socket: Socket): Promise<void> {
  return new Promise((resolve) => { socket.once('close', () => resolve()); });
}

async function listen(server: Server): Promise<number> {
  const sockets = new Set<Socket>();
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve); });
  cleanups.push(async () => {
    const stopped = new Promise<void>((resolve) => { server.close(() => resolve()); });
    for (const socket of sockets) socket.destroy();
    await stopped;
  });
  return (server.address() as AddressInfo).port;
}

async function startProxy(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
  observeResponse?: (response: ServerResponse) => void,
): Promise<number> {
  const daemonPort = await listen(createServer(handler));
  const proxyHandler = createDaemonProxyHandler(
    `http://127.0.0.1:${daemonPort}`,
    async (_request, response) => { response.end('fallback'); },
  );
  return await listen(createServer((request, response) => {
    observeResponse?.(response);
    proxyHandler(request, response);
  }));
}

function browserRequest(port: number, method = 'GET') {
  const client = createRequest({ host: '127.0.0.1', port, path: '/api/events', method });
  // An intentional browser abort can report ECONNRESET before any headers.
  client.on('error', () => {});
  cleanups.push(() => { client.destroy(); });
  return client;
}

describe('sidecar daemon proxy browser cancellation', () => {
  it('closes the daemon socket when the browser disconnects mid-SSE', async () => {
    const upstreamClosed = deferred<void>();
    const proxyPort = await startProxy((request, response) => {
      request.socket.once('close', () => upstreamClosed.resolve());
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.write('data: first event\n\n');
    });
    const client = browserRequest(proxyPort);
    const firstEvent = deferred<string>();
    client.once('response', (response) => {
      response.once('data', (chunk: Buffer) => {
        firstEvent.resolve(chunk.toString());
        client.destroy();
      });
    });
    client.end();

    expect(await firstEvent.promise).toContain('data: first event');
    await upstreamClosed.promise;
  });

  it('closes the daemon socket when the browser leaves before response headers', async () => {
    const upstreamRequest = deferred<IncomingMessage>();
    const downstreamResponse = deferred<ServerResponse>();
    let requests = 0;
    let warmedSocket: Socket | undefined;
    const proxyPort = await startProxy((request, response) => {
      requests += 1;
      if (requests === 1) {
        warmedSocket = request.socket;
        response.end('warm up the keep-alive pool');
        return;
      }
      upstreamRequest.resolve(request);
    }, (response) => {
      if (requests === 1) downstreamResponse.resolve(response);
    });
    const warmup = await fetch(`http://127.0.0.1:${proxyPort}/api/events`);
    expect(await warmup.text()).toBe('warm up the keep-alive pool');

    const client = browserRequest(proxyPort);
    client.end();
    const request = await upstreamRequest.promise;
    expect(request.socket).toBe(warmedSocket);
    const endResponse = vi.spyOn(await downstreamResponse.promise, 'end');
    const upstreamClosed = closed(request.socket);

    client.destroy();

    await upstreamClosed;
    expect(requests).toBe(2);
    expect(endResponse).not.toHaveBeenCalled();
  });

  it.each([
    ['POST', 'partial upload'],
    ['PUT', 'x'.repeat(512 * 1024 + 1)],
  ])('closes the daemon socket for an aborted streamed %s upload', async (method, body) => {
    const upstreamData = deferred<IncomingMessage>();
    const proxyPort = await startProxy((request) => {
      request.on('error', () => {});
      request.once('data', () => upstreamData.resolve(request));
    });
    const client = browserRequest(proxyPort, method);
    client.write(body);
    const request = await upstreamData.promise;
    const upstreamClosed = closed(request.socket);

    client.destroy();

    await upstreamClosed;
    expect(request.complete).toBe(false);
  });

  it.each([
    ['GET', 200, 'complete response'],
    ['HEAD', 200, ''],
    ['GET', 204, ''],
    ['POST', 200, 'complete upload'],
  ])('preserves a completed %s response with status %s', async (method, status, body) => {
    const receivedBody = deferred<string>();
    const proxyPort = await startProxy((request, response) => {
      let uploaded = '';
      request.on('data', (chunk: Buffer) => { uploaded += chunk.toString(); });
      request.on('end', () => {
        receivedBody.resolve(uploaded);
        response.writeHead(status);
        response.end(body);
      });
    });
    const client = browserRequest(proxyPort, method);
    const result = new Promise<{ status: number | undefined; body: string }>((resolve, reject) => {
      client.once('error', reject);
      client.once('response', (response) => {
        let text = '';
        response.on('data', (chunk: Buffer) => { text += chunk.toString(); });
        response.once('error', reject);
        response.once('end', () => resolve({ status: response.statusCode, body: text }));
      });
    });
    client.end(method === 'POST' ? 'uploaded body' : undefined);

    expect(await result).toEqual({ status, body });
    expect(await receivedBody.promise).toBe(method === 'POST' ? 'uploaded body' : '');
  });
});
