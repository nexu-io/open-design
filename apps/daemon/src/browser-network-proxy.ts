import http, { type ClientRequest, type IncomingMessage, type ServerResponse } from 'node:http';
import net, { type Socket } from 'node:net';
import type { Duplex } from 'node:stream';

import {
  resolveBrowserNetworkTarget,
  type BrowserNetworkPolicy,
} from './browser-network-policy.js';

export interface BrowserNetworkProxy {
  close: () => Promise<void>;
  port: number;
}

function proxyErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function requestUrl(request: IncomingMessage, fallbackProtocol = 'http:'): URL {
  const raw = request.url ?? '';
  if (/^https?:\/\//i.test(raw)) return new URL(raw);
  if (/^wss?:\/\//i.test(raw)) {
    const parsed = new URL(raw);
    parsed.protocol = parsed.protocol === 'wss:' ? 'https:' : 'http:';
    return parsed;
  }
  const host = request.headers.host;
  if (!host) throw new Error('proxy request is missing Host');
  return new URL(`${fallbackProtocol}//${host}${raw.startsWith('/') ? raw : `/${raw}`}`);
}

function upstreamHeaders(request: IncomingMessage, host: string): http.OutgoingHttpHeaders {
  const headers: http.OutgoingHttpHeaders = { ...request.headers, host };
  delete headers['proxy-authorization'];
  delete headers['proxy-connection'];
  return headers;
}

function writeProxyFailure(socket: Duplex, status: number, message: string): void {
  if (socket.destroyed) return;
  const body = `${message}\n`;
  socket.end(
    `HTTP/1.1 ${status} ${status === 403 ? 'Forbidden' : 'Bad Gateway'}\r\n`
    + 'Content-Type: text/plain; charset=utf-8\r\n'
    + `Content-Length: ${Buffer.byteLength(body)}\r\n`
    + 'Connection: close\r\n\r\n'
    + body,
  );
}

/**
 * Chrome is forced through this loopback proxy with its implicit localhost
 * bypass removed. The proxy resolves and connects to the exact vetted address,
 * closing the DNS-rebinding gap between URL validation and Chromium's socket.
 */
export async function createBrowserNetworkProxy(
  policy: BrowserNetworkPolicy = {},
): Promise<BrowserNetworkProxy> {
  const tunnels = new Set<Duplex>();
  const httpRequests = new Set<ClientRequest>();
  const httpSockets = new Set<Socket>();
  let closing = false;
  const server = http.createServer((request, response) => {
    void proxyHttpRequest(
      request,
      response,
      policy,
      httpRequests,
      httpSockets,
      () => closing,
    );
  });

  server.on('connect', (request, client, head) => {
    void proxyConnect(request, client, head, policy, tunnels);
  });
  server.on('upgrade', (request, client, head) => {
    void proxyUpgrade(request, client, head, policy, tunnels);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('browser network proxy did not bind a TCP port');
  }

  return {
    port: address.port,
    close: async () => {
      closing = true;
      for (const request of httpRequests) request.destroy();
      for (const socket of httpSockets) socket.destroy();
      httpRequests.clear();
      httpSockets.clear();
      for (const socket of tunnels) socket.destroy();
      tunnels.clear();
      if (!server.listening) return;
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

async function proxyHttpRequest(
  request: IncomingMessage,
  response: ServerResponse,
  policy: BrowserNetworkPolicy,
  httpRequests: Set<ClientRequest>,
  httpSockets: Set<Socket>,
  isClosing: () => boolean,
): Promise<void> {
  try {
    const target = await resolveBrowserNetworkTarget(requestUrl(request).href, policy);
    if (isClosing() || response.destroyed) {
      response.destroy();
      return;
    }
    const upstream = http.request({
      agent: false,
      family: target.family,
      headers: upstreamHeaders(request, target.url.host),
      host: target.address,
      method: request.method,
      path: `${target.url.pathname}${target.url.search}`,
      port: target.url.port ? Number(target.url.port) : 80,
    }, (upstreamResponse) => {
      if (response.destroyed) {
        upstreamResponse.destroy();
        return;
      }
      response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
      upstreamResponse.pipe(response);
      upstreamResponse.once('error', (error) => {
        if (!response.destroyed) response.destroy(error);
      });
    });
    httpRequests.add(upstream);
    const destroyUpstream = () => upstream.destroy();
    const forgetUpstream = () => {
      httpRequests.delete(upstream);
      request.off('aborted', destroyUpstream);
      request.off('error', destroyUpstream);
      response.off('close', destroyUpstream);
      response.off('error', destroyUpstream);
    };
    upstream.once('socket', (socket) => {
      httpSockets.add(socket);
      socket.once('close', () => httpSockets.delete(socket));
    });
    upstream.once('close', forgetUpstream);
    request.once('aborted', destroyUpstream);
    request.once('error', destroyUpstream);
    response.once('close', destroyUpstream);
    response.once('error', destroyUpstream);
    upstream.once('error', (error) => {
      if (!response.headersSent) response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
      response.end(`browser proxy upstream failed: ${proxyErrorMessage(error)}\n`);
    });
    request.pipe(upstream);
  } catch (error) {
    response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    response.end(`browser proxy blocked request: ${proxyErrorMessage(error)}\n`);
  }
}

async function proxyConnect(
  request: IncomingMessage,
  client: Duplex,
  head: Buffer,
  policy: BrowserNetworkPolicy,
  tunnels: Set<Duplex>,
): Promise<void> {
  const stopPendingClientError = guardPendingClient(client);
  try {
    const authority = request.url ?? '';
    const target = await resolveBrowserNetworkTarget(`https://${authority}`, policy);
    const upstream = net.connect({
      family: target.family,
      host: target.address,
      port: target.url.port ? Number(target.url.port) : 443,
    });
    let connected = false;
    trackBrowserNetworkTunnel(client, upstream, tunnels, (error) => {
      if (connected) return false;
      writeProxyFailure(client, 502, proxyErrorMessage(error));
      return true;
    });
    stopPendingClientError();
    upstream.once('connect', () => {
      connected = true;
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length > 0) upstream.write(head);
      client.pipe(upstream);
      upstream.pipe(client);
    });
  } catch (error) {
    writeProxyFailure(client, 403, `browser proxy blocked tunnel: ${proxyErrorMessage(error)}`);
  }
}

async function proxyUpgrade(
  request: IncomingMessage,
  client: Duplex,
  head: Buffer,
  policy: BrowserNetworkPolicy,
  tunnels: Set<Duplex>,
): Promise<void> {
  const stopPendingClientError = guardPendingClient(client);
  try {
    const target = await resolveBrowserNetworkTarget(requestUrl(request).href, policy);
    const upstream = net.connect({
      family: target.family,
      host: target.address,
      port: target.url.port ? Number(target.url.port) : 80,
    });
    let connected = false;
    trackBrowserNetworkTunnel(client, upstream, tunnels, (error) => {
      if (connected) return false;
      writeProxyFailure(client, 502, proxyErrorMessage(error));
      return true;
    });
    stopPendingClientError();
    upstream.once('connect', () => {
      connected = true;
      const headers = upstreamHeaders(request, target.url.host);
      const serialized = Object.entries(headers)
        .filter(([, value]) => value != null)
        .map(([name, value]) => `${name}: ${Array.isArray(value) ? value.join(', ') : String(value)}`)
        .join('\r\n');
      upstream.write(
        `${request.method ?? 'GET'} ${target.url.pathname}${target.url.search} HTTP/${request.httpVersion}\r\n`
        + `${serialized}\r\n\r\n`,
      );
      if (head.length > 0) upstream.write(head);
      client.pipe(upstream);
      upstream.pipe(client);
    });
  } catch (error) {
    writeProxyFailure(client, 403, `browser proxy blocked upgrade: ${proxyErrorMessage(error)}`);
  }
}

function guardPendingClient(client: Duplex): () => void {
  const onError = () => client.destroy();
  const stop = () => client.off('error', onError);
  client.on('error', onError);
  client.once('close', stop);
  return stop;
}

/**
 * A CONNECT/upgrade tunnel is one lifecycle even though Node exposes two
 * sockets. `pipe()` deliberately does not forward source errors, so both
 * endpoints need their own guard and either endpoint closing must tear down
 * its peer. Otherwise a normal Chrome TLS shutdown can surface EPIPE as an
 * uncaught daemon exception or leave a half-open upstream behind.
 */
export function trackBrowserNetworkTunnel(
  client: Duplex,
  upstream: Duplex,
  tunnels: Set<Duplex>,
  handleUpstreamConnectError?: (error: Error) => boolean,
): void {
  tunnels.add(client);
  tunnels.add(upstream);

  let clientClosed = false;
  let upstreamClosed = false;
  const destroyBoth = () => {
    if (!client.destroyed) client.destroy();
    if (!upstream.destroyed) upstream.destroy();
  };
  const forgetWhenClosed = () => {
    if (!clientClosed || !upstreamClosed) return;
    tunnels.delete(client);
    tunnels.delete(upstream);
    client.off('error', onClientError);
    upstream.off('error', onUpstreamError);
  };
  const onClientError = () => destroyBoth();
  const onUpstreamError = (error: Error) => {
    const responseOwnsClient = handleUpstreamConnectError?.(error) ?? false;
    if (!upstream.destroyed) upstream.destroy();
    if (!responseOwnsClient && !client.destroyed) client.destroy();
  };
  const onClientClose = () => {
    clientClosed = true;
    if (!upstream.destroyed) upstream.destroy();
    forgetWhenClosed();
  };
  const onUpstreamClose = () => {
    upstreamClosed = true;
    if (!client.destroyed) client.destroy();
    forgetWhenClosed();
  };

  client.on('error', onClientError);
  upstream.on('error', onUpstreamError);
  client.once('close', onClientClose);
  upstream.once('close', onUpstreamClose);
}
