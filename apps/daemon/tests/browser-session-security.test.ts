import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { createServer, request } from 'node:http';
import { createConnection, createServer as createTcpServer, type Socket } from 'node:net';
import { PassThrough, type Duplex } from 'node:stream';

import { describe, expect, it, vi } from 'vitest';

import { WEB_CLONE_CDP_METHODS } from '../src/browser-cdp.js';
import {
  createBrowserNetworkProxy,
  trackBrowserNetworkTunnel,
} from '../src/browser-network-proxy.js';
import { assertBrowserNetworkUrl, type BrowserDnsLookup } from '../src/browser-network-policy.js';
import { removeBrowserProfile, terminateBrowserProcess } from '../src/browser-sessions.js';

// Website Clone is a primary UI + od CLI generation path. Its agent runs in a
// sandbox, while the daemon-owned Chrome process has host privileges. These
// tests pin the broker as a strict privilege boundary: no raw/general CDP and
// no file, loopback, private-network, or metadata navigation can cross it.
describe('Website Clone browser broker security boundary', () => {
  it.each([
    'file:///etc/passwd',
    'http://127.0.0.1:3000/admin',
    'http://169.254.169.254/latest/meta-data/',
    'http://[::1]:7456/api/app-config',
  ])('rejects a privileged destination: %s', async (url) => {
    await expect(assertBrowserNetworkUrl(url)).rejects.toThrow();
  });

  it('rejects a public-looking hostname when DNS resolves it into private space', async () => {
    const lookup = vi.fn().mockResolvedValue([{ address: '10.20.30.40', family: 4 }]) as unknown as BrowserDnsLookup;

    await expect(assertBrowserNetworkUrl('https://attacker.example/private', { lookup }))
      .rejects.toThrow(/private address/);
  });

  it('allows public HTTP(S) destinations after DNS validation', async () => {
    const lookup = vi.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]) as unknown as BrowserDnsLookup;

    await expect(assertBrowserNetworkUrl('https://example.com/', { lookup })).resolves.toBeUndefined();
  });

  it('forces the actual Chromium HTTP connection through the private-address guard', async () => {
    let targetHits = 0;
    const target = createServer((_request, response) => {
      targetHits += 1;
      response.end('secret');
    });
    await new Promise<void>((resolve) => target.listen(0, '127.0.0.1', resolve));
    const address = target.address();
    if (!address || typeof address === 'string') throw new Error('target did not bind');
    const proxy = await createBrowserNetworkProxy();
    try {
      const response = await requestThroughProxy(proxy.port, `http://127.0.0.1:${address.port}/secret`);
      expect(response.status).toBe(403);
      expect(response.body).toContain('blocked request');
      expect(targetHits).toBe(0);
    } finally {
      await proxy.close();
      await new Promise<void>((resolve) => target.close(() => resolve()));
    }
  });

  it.each(['client', 'upstream'] as const)(
    'contains a normal HTTPS tunnel EPIPE from the %s endpoint and tears down its peer',
    async (source) => {
      const client = new PassThrough();
      const upstream = new PassThrough();
      const tunnels = new Set<Duplex>();
      const clientClosed = new Promise<void>((resolve) => client.once('close', () => resolve()));
      const upstreamClosed = new Promise<void>((resolve) => upstream.once('close', () => resolve()));

      trackBrowserNetworkTunnel(client, upstream, tunnels);
      const socketError = Object.assign(new Error('normal HTTPS tunnel teardown'), { code: 'EPIPE' });
      expect(() => (source === 'client' ? client : upstream).emit('error', socketError)).not.toThrow();

      await Promise.all([clientClosed, upstreamClosed]);
      expect(client.destroyed).toBe(true);
      expect(upstream.destroyed).toBe(true);
      expect(tunnels.size).toBe(0);
    },
  );

  it('closes an HTTPS CONNECT peer and keeps the proxy available for the next browser tunnel', async () => {
    const targetSockets = new Set<Socket>();
    const target = createTcpServer((socket) => {
      targetSockets.add(socket);
      socket.on('error', () => undefined);
      socket.once('close', () => targetSockets.delete(socket));
    });
    await new Promise<void>((resolve) => target.listen(0, '127.0.0.1', resolve));
    const targetAddress = target.address();
    if (!targetAddress || typeof targetAddress === 'string') throw new Error('target did not bind');
    const proxy = await createBrowserNetworkProxy({ allowPrivateNetwork: true });

    try {
      const first = await connectTunnel(proxy.port, targetAddress.port);
      first.on('error', () => undefined);
      await waitFor(() => targetSockets.size === 1);
      first.destroy();
      await waitFor(() => targetSockets.size === 0);

      // A daemon-fatal uncaughtException would prevent this follow-up tunnel,
      // which represents the next browser session using the same broker.
      const second = await connectTunnel(proxy.port, targetAddress.port);
      second.on('error', () => undefined);
      expect(second.destroyed).toBe(false);
      second.destroy();
      await waitFor(() => targetSockets.size === 0);
    } finally {
      await proxy.close();
      for (const socket of targetSockets) socket.destroy();
      await new Promise<void>((resolve) => target.close(() => resolve()));
    }
  });

  it('tears down an ordinary HTTP upstream when the browser client disconnects', async () => {
    const targetSockets = new Set<Socket>();
    const target = createServer((_request, response) => {
      response.writeHead(200);
      response.write('partial response');
    });
    target.on('connection', (socket) => {
      targetSockets.add(socket);
      socket.on('error', () => undefined);
      socket.once('close', () => targetSockets.delete(socket));
    });
    await new Promise<void>((resolve) => target.listen(0, '127.0.0.1', resolve));
    const targetAddress = target.address();
    if (!targetAddress || typeof targetAddress === 'string') throw new Error('target did not bind');
    const proxy = await createBrowserNetworkProxy({ allowPrivateNetwork: true });
    const client = openHttpStreamThroughProxy(proxy.port, targetAddress.port);

    try {
      await client.responseStarted;
      expect(targetSockets.size).toBe(1);
      client.request.destroy();
      await waitFor(() => targetSockets.size === 0);
    } finally {
      client.request.destroy();
      await proxy.close();
      for (const socket of targetSockets) socket.destroy();
      await new Promise<void>((resolve) => target.close(() => resolve()));
    }
  });

  it('does not retain ordinary HTTP upstreams across repeated proxy lifecycles', async () => {
    const targetSockets = new Set<Socket>();
    const target = createServer((_request, response) => {
      response.writeHead(200);
      response.write('partial response');
    });
    target.on('connection', (socket) => {
      targetSockets.add(socket);
      socket.on('error', () => undefined);
      socket.once('close', () => targetSockets.delete(socket));
    });
    await new Promise<void>((resolve) => target.listen(0, '127.0.0.1', resolve));
    const targetAddress = target.address();
    if (!targetAddress || typeof targetAddress === 'string') throw new Error('target did not bind');

    try {
      for (let iteration = 0; iteration < 3; iteration += 1) {
        const proxy = await createBrowserNetworkProxy({ allowPrivateNetwork: true });
        const client = openHttpStreamThroughProxy(proxy.port, targetAddress.port);
        try {
          await client.responseStarted;
          expect(targetSockets.size).toBe(1);
          await proxy.close();
          await waitFor(() => targetSockets.size === 0);
        } finally {
          client.request.destroy();
          await proxy.close();
        }
      }
    } finally {
      for (const socket of targetSockets) socket.destroy();
      await new Promise<void>((resolve) => target.close(() => resolve()));
    }
  });

  it('exposes only the CDP methods required by the staged recon adapter', () => {
    expect(WEB_CLONE_CDP_METHODS).toEqual(new Set([
      'Emulation.setDeviceMetricsOverride',
      'Input.dispatchMouseEvent',
      'Network.enable',
      'Network.getCookies',
      'Network.getResponseBody',
      'Page.captureScreenshot',
      'Page.enable',
      'Page.getLayoutMetrics',
      'Page.navigate',
      'Runtime.enable',
      'Runtime.evaluate',
    ]));
    expect(WEB_CLONE_CDP_METHODS.has('Browser.getVersion')).toBe(false);
    expect(WEB_CLONE_CDP_METHODS.has('Fetch.disable')).toBe(false);
    expect(WEB_CLONE_CDP_METHODS.has('Target.createTarget')).toBe(false);
  });
});

async function requestThroughProxy(proxyPort: number, url: string): Promise<{ body: string; status: number }> {
  return new Promise((resolve, reject) => {
    const outbound = request({
      headers: { host: new URL(url).host },
      host: '127.0.0.1',
      method: 'GET',
      path: url,
      port: proxyPort,
    }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.once('end', () => resolve({ body, status: response.statusCode ?? 0 }));
    });
    outbound.once('error', reject);
    outbound.end();
  });
}

async function connectTunnel(proxyPort: number, targetPort: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port: proxyPort });
    let response = '';
    const onError = (error: Error) => reject(error);
    const onData = (chunk: Buffer) => {
      response += chunk.toString('latin1');
      if (!response.includes('\r\n\r\n')) return;
      socket.off('data', onData);
      socket.off('error', onError);
      if (!response.startsWith('HTTP/1.1 200')) {
        reject(new Error(`CONNECT failed: ${response}`));
        socket.destroy();
        return;
      }
      resolve(socket);
    };
    socket.once('error', onError);
    socket.on('data', onData);
    socket.once('connect', () => {
      socket.write(`CONNECT 127.0.0.1:${targetPort} HTTP/1.1\r\nHost: 127.0.0.1:${targetPort}\r\n\r\n`);
    });
  });
}

function openHttpStreamThroughProxy(proxyPort: number, targetPort: number): {
  request: ReturnType<typeof request>;
  responseStarted: Promise<void>;
} {
  let responseStartedResolve: (() => void) | undefined;
  let responseStartedReject: ((error: Error) => void) | undefined;
  const responseStarted = new Promise<void>((resolve, reject) => {
    responseStartedResolve = resolve;
    responseStartedReject = reject;
  });
  const outbound = request({
    headers: { host: `127.0.0.1:${targetPort}` },
    host: '127.0.0.1',
    path: `http://127.0.0.1:${targetPort}/stream`,
    port: proxyPort,
  }, (response) => {
    response.once('data', () => responseStartedResolve?.());
  });
  outbound.on('error', (error) => responseStartedReject?.(error));
  outbound.end();
  return { request: outbound, responseStarted };
}

async function waitFor(condition: () => boolean, timeoutMs = 1_000): Promise<void> {
  const startedAt = Date.now();
  while (!condition()) {
    if (Date.now() - startedAt >= timeoutMs) throw new Error('condition timed out');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('Website Clone browser process cleanup', () => {
  it('waits for a SIGTERM-resistant browser to exit after SIGKILL before deleting its profile', async () => {
    const child = new EventEmitter() as EventEmitter & {
      exitCode: number | null;
      kill: (signal?: NodeJS.Signals | number) => boolean;
      signalCode: NodeJS.Signals | null;
    };
    child.exitCode = null;
    child.signalCode = null;
    const signals: Array<NodeJS.Signals | number | undefined> = [];
    child.kill = (signal) => {
      signals.push(signal);
      if (signal === 'SIGKILL') {
        setTimeout(() => {
          child.exitCode = 137;
          child.signalCode = 'SIGKILL';
          child.emit('exit', 137, 'SIGKILL');
        }, 5);
      }
      return true;
    };
    const removeProfile = vi.fn(async () => {
      expect(child.exitCode).toBe(137);
    });

    await terminateBrowserProcess(
      child as unknown as ChildProcess,
      'locked-profile',
      removeProfile,
      { forcedMs: 50, gracefulMs: 1 },
    );

    expect(signals).toEqual(['SIGTERM', 'SIGKILL']);
    expect(removeProfile).toHaveBeenCalledWith('locked-profile');
  });

  it('retries transient Windows-style profile deletion failures with bounded backoff', async () => {
    const locked = Object.assign(new Error('file is locked'), { code: 'EPERM' });
    const remove = vi.fn()
      .mockRejectedValueOnce(locked)
      .mockRejectedValueOnce(locked)
      .mockResolvedValueOnce(undefined);
    const delay = vi.fn().mockResolvedValue(undefined);

    await removeBrowserProfile('profile', remove, delay);

    expect(remove).toHaveBeenCalledTimes(3);
    expect(delay).toHaveBeenNthCalledWith(1, 100);
    expect(delay).toHaveBeenNthCalledWith(2, 200);
  });
});
