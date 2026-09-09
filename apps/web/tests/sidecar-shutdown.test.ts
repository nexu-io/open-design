import { createServer as createHttpServer } from 'node:http';
import { createConnection, type AddressInfo } from 'node:net';

import { describe, expect, it } from 'vitest';

import { createWebHttpServerShutdown } from '../sidecar/server';

describe('web sidecar HTTP shutdown', () => {
  it('force-closes a long-lived connection after the bounded drain window', async () => {
    const server = createHttpServer((_request, response) => {
      response.writeHead(200, {
        connection: 'keep-alive',
        'content-type': 'text/event-stream',
      });
      response.write('event: ready\ndata: {}\n\n');
    });
    const closeServer = createWebHttpServerShutdown(server, 25);

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    const socket = createConnection(port, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
      socket.once('error', reject);
      socket.once('connect', () => {
        socket.write([
          'GET /events HTTP/1.1',
          `Host: 127.0.0.1:${port}`,
          'Connection: keep-alive',
          '',
          '',
        ].join('\r\n'));
      });
      socket.once('data', () => resolve());
    });

    const socketClosed = new Promise<void>((resolve) => socket.once('close', () => resolve()));
    await expect(Promise.race([
      closeServer().then(() => 'closed'),
      new Promise<string>((resolve) => setTimeout(() => resolve('timed-out'), 500)),
    ])).resolves.toBe('closed');
    await expect(socketClosed).resolves.toBeUndefined();
    expect(server.listening).toBe(false);
  });

  it('is idempotent after a fast idle shutdown', async () => {
    const server = createHttpServer((_request, response) => response.end('ok'));
    const closeServer = createWebHttpServerShutdown(server, 25);

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    await closeServer();
    await expect(closeServer()).resolves.toBeUndefined();
  });

  it('retires upgraded sockets even when the HTTP server closes immediately', async () => {
    const server = createHttpServer();
    server.on('upgrade', (_request, socket) => {
      socket.write([
        'HTTP/1.1 101 Switching Protocols',
        'Connection: Upgrade',
        'Upgrade: test',
        '',
        '',
      ].join('\r\n'));
    });
    const closeServer = createWebHttpServerShutdown(server, 250);

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    const socket = createConnection(port, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
      socket.once('error', reject);
      socket.once('connect', () => {
        socket.write([
          'GET /upgrade HTTP/1.1',
          `Host: 127.0.0.1:${port}`,
          'Connection: Upgrade',
          'Upgrade: test',
          '',
          '',
        ].join('\r\n'));
      });
      socket.once('data', () => resolve());
    });

    const socketClosed = new Promise<void>((resolve) => socket.once('close', () => resolve()));
    await closeServer();
    await expect(socketClosed).resolves.toBeUndefined();
    expect(server.listening).toBe(false);
  });
});
