import { EventEmitter } from 'node:events';
import { Duplex } from 'node:stream';
import { setImmediate } from 'node:timers/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';

const network = vi.hoisted(() => ({ createServer: vi.fn(), connect: vi.fn() }));
vi.mock('node:net', async (importOriginal) => ({
  ...await importOriginal<typeof import('node:net')>(),
  createServer: network.createServer,
  connect: network.connect,
}));

import { startEgressProxy } from '../../src/media/egress-proxy.js';

class FixtureSocket extends Duplex {
  readonly writes: Buffer[] = [];
  _read(): void {}
  _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.writes.push(Buffer.from(chunk));
    callback();
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function withProxy(
  check: (fixture: {
    client: FixtureSocket;
    upstream: FixtureSocket;
    dnsEntered: Promise<void>;
    connected: Promise<() => void>;
    releaseDns: () => void;
  }) => Promise<void>,
  allow = true,
): Promise<void> {
  const dnsEntered = deferred<void>();
  const dnsResult = deferred<string[]>();
  const connected = deferred<() => void>();
  const client = new FixtureSocket();
  const upstream = new FixtureSocket();
  const server = Object.assign(new EventEmitter(), {
    listen: (_port: number, _host: string, ready: () => void) => ready(),
    address: () => ({ port: 1 }),
    close: (done: () => void) => done(),
  });
  network.createServer.mockReturnValue(server);
  network.connect.mockImplementation((_options: unknown, ready: () => void) => {
    connected.resolve(ready);
    return upstream;
  });
  const proxy = await startEgressProxy({
    resolve: async () => { dnsEntered.resolve(); return dnsResult.promise; },
    allow: async () => allow,
  });
  server.emit('connection', client);
  try {
    await check({
      client, upstream, dnsEntered: dnsEntered.promise, connected: connected.promise,
      releaseDns: () => dnsResult.resolve(['127.0.0.1']),
    });
  } finally {
    dnsResult.resolve([]);
    client.destroy();
    upstream.destroy();
    await proxy.close();
  }
}

afterEach(() => vi.resetAllMocks());

describe('Motion egress proxy payload handoff', () => {
  for (const tunnel of [false, true]) {
    it.each(['coalesced', 'resolving', 'connecting'])(
      `${tunnel ? 'CONNECT' : 'HTTP POST'} preserves binary payload while %s`,
      async (timing) => {
        const payload = Buffer.from([0x00, 0xff, 0xc3, 0xa9, 0x80, 0x0d, 0x0a]);
        const head = Buffer.from(tunnel
          ? 'CONNECT entry.test:443 HTTP/1.1\r\nHost: entry.test:443\r\n\r\n'
          : `POST http://entry.test/metadata HTTP/1.1\r\nHost: entry.test\r\nContent-Length: ${payload.length}\r\n\r\n`);
        await withProxy(async ({ client, upstream, dnsEntered, connected, releaseDns }) => {
          client.push(timing === 'coalesced' ? Buffer.concat([head, payload]) : head);
          await dnsEntered;
          if (timing === 'resolving') { client.push(payload); await setImmediate(); }
          releaseDns();
          const finishConnection = await connected;
          if (timing === 'connecting') { client.push(payload); await setImmediate(); }
          finishConnection();
          await setImmediate();
          expect(Buffer.concat(upstream.writes)).toEqual(tunnel ? payload : Buffer.concat([head, payload]));
          if (tunnel) expect(Buffer.concat(client.writes).toString()).toContain('200 Connection Established');
        });
      },
    );
  }

  it('does not forward queued payload to a refused address', async () => {
    await withProxy(async ({ client, dnsEntered, releaseDns }) => {
      client.push(Buffer.from('POST http://entry.test/ HTTP/1.1\r\nHost: entry.test\r\nContent-Length: 3\r\n\r\n'));
      await dnsEntered;
      client.push(Buffer.from('abc'));
      releaseDns();
      await setImmediate();
      expect(network.connect).not.toHaveBeenCalled();
      expect(Buffer.concat(client.writes).toString()).toContain('403 Forbidden');
    }, false);
  });
});
