// A loopback HTTP proxy that only lets a child process reach public addresses.
// yt-dlp makes its own requests and follows its own redirects, so a URL-level
// check before spawning it proves nothing about where it actually connects: a
// permitted entry page can still 3xx, or use an extractor, to reach loopback or
// private space. Pointing the downloader at this proxy moves every one of those
// connections through the same public-address policy the rest of the daemon uses.
//
// Resolution happens ONCE per connection and the socket then dials that exact
// address: resolving the name for a check and dialling the name again would
// leave a DNS-rebinding window between the two lookups.
import { promises as dnsPromises } from 'node:dns';
import { connect, createServer, isIP, type Server, type Socket } from 'node:net';
import { assertPublicAssetUrl } from '../public-asset-fetch.js';

export type EgressResolver = (host: string) => Promise<string[]>;
export type EgressAllow = (address: string, host: string, port: number) => Promise<boolean>;

export interface EgressProxy {
  /** `http://127.0.0.1:<port>` — pass to the child as its proxy. */
  url: string;
  close: () => Promise<void>;
}

export interface EgressProxyOptions {
  /**
   * Addresses to dial for a host. Defaults to the platform resolver; tests
   * inject their own so they can serve a loopback fixture.
   */
  resolve?: EgressResolver;
  /**
   * Whether a resolved address may be dialled. Defaults to the shared public
   * address policy, which rejects loopback, private, link-local, CGNAT,
   * multicast and metadata ranges.
   */
  allow?: EgressAllow;
}

const defaultResolve: EgressResolver = async (host) => {
  if (isIP(host)) return [host];
  const found = await dnsPromises.lookup(host, { all: true, verbatim: true });
  return found.map((entry) => entry.address);
};

const defaultAllow: EgressAllow = async (address, _host, port) => {
  try {
    await assertPublicAssetUrl(`http://${address.includes(':') ? `[${address}]` : address}:${port}/`);
    return true;
  } catch {
    return false;
  }
};

function splitAuthority(authority: string): { host: string; port: number } | null {
  // [::1]:8080 or host:443 or host
  const v6 = /^\[([^\]]+)\](?::(\d+))?$/.exec(authority);
  if (v6) return { host: v6[1]!, port: Number(v6[2] ?? 443) };
  const m = /^([^:]+)(?::(\d+))?$/.exec(authority);
  if (!m) return null;
  return { host: m[1]!, port: Number(m[2] ?? 443) };
}

/** The address a socket may dial for `host`, or null when none is allowed. */
async function pickAddress(
  host: string,
  port: number,
  resolve: EgressResolver,
  allow: EgressAllow,
): Promise<string | null> {
  const addresses = await resolve(host).catch(() => []);
  for (const address of addresses) {
    if (isIP(address) && await allow(address, host, port)) return address;
  }
  return null;
}

/**
 * Start the proxy on 127.0.0.1 and a free port. Every connection — a CONNECT
 * tunnel or a plain absolute-URI request — resolves its target once, checks the
 * resolved address, and dials that address. A refused target is answered with
 * 403 and never dialled, so the download fails instead of being reported
 * complete.
 */
export async function startEgressProxy(options: EgressProxyOptions = {}): Promise<EgressProxy> {
  const resolve = options.resolve ?? defaultResolve;
  const allow = options.allow ?? defaultAllow;
  const server: Server = createServer();
  const sockets = new Set<Socket>();

  const refuse = (socket: Socket) => {
    if (socket.writable) socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
  };

  server.on('connection', (socket: Socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => socket.destroy());
    let buffered = '';
    const onData = (chunk: Buffer) => {
      buffered += chunk.toString('latin1');
      const end = buffered.indexOf('\r\n\r\n');
      if (end < 0) {
        if (buffered.length > 16 * 1024) refuse(socket);
        return;
      }
      socket.off('data', onData);
      const head = buffered.slice(0, end);
      const rest = buffered.slice(end + 4);
      const [requestLine = ''] = head.split('\r\n');
      const [method = '', target = ''] = requestLine.split(' ');
      if (!method || !target) return refuse(socket);

      const tunnel = method.toUpperCase() === 'CONNECT';
      const authority = tunnel
        ? target
        : (() => { try { const u = new URL(target); return `${u.hostname}:${u.port || 80}`; } catch { return ''; } })();
      const dest = authority ? splitAuthority(authority) : null;
      if (!dest) return refuse(socket);

      void pickAddress(dest.host, dest.port, resolve, allow).then((address) => {
        if (!address) return refuse(socket);
        const upstream = connect({ host: address, port: dest.port }, () => {
          if (tunnel) {
            socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
          } else {
            upstream.write(`${head}\r\n\r\n`);
            if (rest) upstream.write(Buffer.from(rest, 'latin1'));
          }
          socket.pipe(upstream);
          upstream.pipe(socket);
        });
        sockets.add(upstream);
        upstream.on('close', () => sockets.delete(upstream));
        upstream.on('error', () => { upstream.destroy(); refuse(socket); });
      }).catch(() => refuse(socket));
    };
    socket.on('data', onData);
  });

  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((done) => server.close(() => done()));
    },
  };
}
