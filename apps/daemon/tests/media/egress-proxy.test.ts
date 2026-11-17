import { promises as dnsPromises } from 'node:dns';
import dns from 'node:dns';
import http, { type Server } from 'node:http';
import { connect } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startEgressProxy } from '../../src/media/egress-proxy.js';

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return (server.address() as { port: number }).port;
}
async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
function request(proxy: string, target: string, tunnel = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = connect(Number(new URL(proxy).port), '127.0.0.1');
    let reply = '', sent = false;
    socket.setTimeout(5_000, () => socket.destroy(new Error('proxy response deadline')));
    socket.on('error', reject);
    socket.on('connect', () => socket.write(tunnel
      ? `CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\n`
      : `GET ${target} HTTP/1.1\r\nHost: ${new URL(target).host}\r\nConnection: close\r\n\r\n`));
    socket.on('data', chunk => {
      reply += chunk.toString();
      if (tunnel && !sent && reply.includes('200 Connection Established')) {
        sent = true;
        socket.write('GET /film.mp4 HTTP/1.1\r\nHost: entry.test\r\nConnection: close\r\n\r\n');
      }
    });
    socket.on('close', () => resolve(reply));
  });
}

afterEach(() => vi.restoreAllMocks());

describe('Motion downloader egress proxy', () => {
  it.each([false, true])('connects only to the checked IP without a second DNS lookup (tunnel=%s)', async tunnel => {
    let hits = 0;
    const sink = http.createServer((_req, res) => { hits++; res.end('video fixture'); });
    const port = await listen(sink);
    const lookup = vi.spyOn(dnsPromises, 'lookup').mockResolvedValue([{ address: '127.0.0.1', family: 4 }] as never);
    const realLookup = dns.lookup;
    const connectionLookup = vi.spyOn(dns, 'lookup').mockImplementation(((host: string, ...args: unknown[]) => {
      // A second resolution of the same name would steer the socket elsewhere.
      if (host === 'entry.test') throw new Error('unchecked second DNS lookup');
      return (realLookup as Function)(host, ...args);
    }) as typeof dns.lookup);
    const allow = vi.fn(async (address: string, host: string) => address === '127.0.0.1' && host === 'entry.test');
    const proxy = await startEgressProxy({ allow });
    try {
      const reply = await request(proxy.url, tunnel ? `entry.test:${port}` : `http://entry.test:${port}/film.mp4`, tunnel);
      expect(reply).toContain('video fixture');
      expect(hits).toBe(1);
      expect(lookup).toHaveBeenCalledTimes(1);
      expect(allow).toHaveBeenCalledWith('127.0.0.1', 'entry.test', port);
      expect(connectionLookup.mock.calls.some(args => args[0] === 'entry.test')).toBe(false);
    } finally { await proxy.close(); await close(sink); }
  });

  it('rejects a hostname resolving to loopback before contacting the sink', async () => {
    let hits = 0;
    const sink = http.createServer((_req, res) => { hits++; res.end('must not be reached'); });
    const port = await listen(sink);
    vi.spyOn(dnsPromises, 'lookup').mockResolvedValue([{ address: '127.0.0.1', family: 4 }] as never);
    const proxy = await startEgressProxy();
    try {
      expect(await request(proxy.url, `private.test:${port}`, true)).toContain('403');
      expect(hits).toBe(0);
    } finally { await proxy.close(); await close(sink); }
  });

  it('checks the redirect destination separately and never contacts a refused sink', async () => {
    let sinkHits = 0;
    const sink = http.createServer((_req, res) => { sinkHits++; res.end('must not be reached'); });
    const sinkPort = await listen(sink);
    const location = `http://private.test:${sinkPort}/secret`;
    const entry = http.createServer((_req, res) => { res.writeHead(302, { location }); res.end(); });
    const entryPort = await listen(entry);
    const proxy = await startEgressProxy({ resolve: async () => ['127.0.0.1'], allow: async (_address, host) => host === 'entry.test' });
    try {
      const reply = await request(proxy.url, `http://entry.test:${entryPort}/start`);
      expect(reply).toContain(`location: ${location}`);
      expect(await request(proxy.url, location)).toContain('403');
      expect(sinkHits).toBe(0);
    } finally { await proxy.close(); await close(entry); await close(sink); }
  });
});
