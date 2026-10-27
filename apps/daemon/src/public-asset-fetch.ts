// Public asset download guard shared by brand extraction and stock images.
// Validate each redirect and the connection-time DNS answer to prevent SSRF/rebinding.
import { promises as dnsPromises, lookup as dnsLookupCb } from 'node:dns';
import type { LookupFunction } from 'node:net';

import { Agent } from 'undici';

import {
  isBlockedExternalApiHostname,
  isLoopbackApiHost,
} from '@open-design/contracts/api/connectionTest';

function isNonPublicHost(host: string): boolean {
  const h = host.toLowerCase();
  // IPv6 multicast (ff00::/8) — not covered by isBlockedExternalApiHostname,
  // which only special-cases `::`, ULA and link-local IPv6.
  if (/^ff[0-9a-f]{2}:/.test(h)) return true;
  // isLoopbackApiHost → 127.0.0.0/8, ::1, localhost.
  // isBlockedExternalApiHostname → 0.0.0.0/0.x, RFC1918, CGNAT (100.64/10),
  //   IPv4 link-local/metadata (169.254), IPv4 multicast (>=224), `::`,
  //   IPv6 link-local (fe80::/10) and ULA (fc00::/7).
  return isLoopbackApiHost(h) || isBlockedExternalApiHostname(h);
}

function isIpLiteral(host: string): boolean {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(':');
}

/**
 * Throw unless `url` is an http(s) URL whose host is a public address — checked
 * both as the literal host and, for a hostname, against every DNS answer.
 */
export async function assertPublicAssetUrl(url: string, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`invalid public asset url: ${String(url)}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`unsupported public asset protocol: ${parsed.protocol}`);
  }
  const host = parsed.hostname.replace(/^\[/, '').replace(/\]$/, '').toLowerCase();
  if (isNonPublicHost(host)) {
    throw new Error(`blocked non-public asset host: ${host}`);
  }
  if (!isIpLiteral(host)) {
    let addresses: Array<{ address: string }>;
    try {
      // Validation itself must obey the acquisition deadline, including a slow
      // resolver. The connection-time lookup below still pins the actual socket.
      addresses = await new Promise<Array<{ address: string }>>((resolve, reject) => {
        const abort = () => { signal?.removeEventListener('abort', abort); reject(signal?.reason); };
        signal?.addEventListener('abort', abort, { once: true });
        dnsPromises.lookup(host, { all: true }).then(resolve, reject).finally(() => signal?.removeEventListener('abort', abort));
      });
    } catch {
      signal?.throwIfAborted();
      // Let the actual fetch surface a resolution failure rather than masking it.
      return;
    }
    for (const { address } of addresses) {
      if (isNonPublicHost(String(address))) {
        throw new Error(
          `public asset host resolves to a non-public address: ${host} -> ${address}`,
        );
      }
    }
  }
}

type DnsLookupCb = typeof dnsLookupCb;

/**
 * Wrap a `dns.lookup`-shaped resolver so the resolved address is rejected when
 * it is non-public. Installed as the undici Agent's connection-time `lookup`, so
 * the address we validate IS the one the socket connects to — closing the
 * DNS-rebinding / TOCTOU gap that a separate pre-validation lookup leaves open
 * (an attacker-controlled name answering public for the check and private for
 * the connect). Uses the same `isNonPublicHost` predicate as
 * `assertPublicAssetUrl` so the connect-time and pre-check block sets can't
 * drift. Exported so the guard can be unit-tested without a live server.
 */
export function createValidatingLookup(lookupImpl: DnsLookupCb = dnsLookupCb): LookupFunction {
  const validatingLookup = (
    hostname: string,
    options: unknown,
    callback?: (err: Error | null, address?: unknown, family?: number) => void,
  ): void => {
    const cb = (typeof options === 'function' ? options : callback) as (
      err: Error | null,
      address?: unknown,
      family?: number,
    ) => void;
    const opts = (typeof options === 'function' ? {} : (options ?? {})) as Record<string, unknown>;
    (lookupImpl as unknown as (
      h: string,
      o: unknown,
      c: (e: Error | null, a?: unknown, f?: number) => void,
    ) => void)(hostname, opts, (err, address, family) => {
      if (err) return cb(err);
      const list = Array.isArray(address) ? address : [{ address, family }];
      for (const entry of list) {
        const addr = typeof entry === 'string' ? entry : (entry as { address: string }).address;
        if (isNonPublicHost(String(addr))) {
          return cb(new Error(`public asset host resolves to a non-public address: ${addr}`));
        }
      }
      return cb(null, address, family);
    });
  };
  return validatingLookup as unknown as LookupFunction;
}

const MAX_ASSET_REDIRECTS = 5;

// Pin SSRF validation to the actual outbound connection: the Agent resolves each
// host once at connect time and refuses the socket if that exact address is
// non-public. This is what defeats DNS rebinding — there is no separate
// pre-validation resolve to race. A single long-lived dispatcher (like
// plugins/plugin-asset-cache.ts) is reused across calls: it must NOT be closed
// per-request, since closing an undici Agent waits for the in-flight request,
// which only finishes once the caller has consumed the returned response body.
const publicAssetDispatcher = new Agent({
  connect: { lookup: createValidatingLookup() },
});

export async function fetchPublicAsset(
  url: string,
  init: RequestInit = {},
  options: { httpsOnly?: boolean; fetch?: typeof fetch } = {},
): Promise<Response> {
  let target = url;
  for (let hop = 0; ; hop += 1) {
    // Re-validate every hop's host (initial URL and each redirect target) before
    // the request, so a public site can't 3xx us into private space. The real
    // SSRF stop is the pinned dispatcher below; this is a cheap URL-level
    // pre-check (protocol, literal private IPs, redirect target).
    const parsed = new URL(target);
    if (options.httpsOnly && (parsed.protocol !== 'https:' || parsed.port || parsed.username || parsed.password)) throw new Error('invalid public image URL');
    await assertPublicAssetUrl(target, init.signal ?? undefined);
    const res = await (options.fetch ?? fetch)(target, {
      ...init,
      redirect: 'manual',
      dispatcher: publicAssetDispatcher as unknown as NonNullable<RequestInit['dispatcher']>,
    });
    const location =
      res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
    if (!location) return res;
    // Drain the redirect response body before following it or bailing out.
    if (res.body) await res.body.cancel().catch(() => {});
    if (hop >= MAX_ASSET_REDIRECTS) {
      throw new Error(`too many public asset redirects (> ${MAX_ASSET_REDIRECTS})`);
    }
    // Resolve a possibly-relative Location; the next loop re-validates it and the
    // same pinned dispatcher re-binds the new connection.
    target = new URL(location, target).toString();
  }
}
