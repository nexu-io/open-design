// SSRF guard for brand-extraction outbound requests. The seed/logo/imagery
// fallbacks, the primary prefetch, and the font harvester all take a
// user-supplied site URL and then follow
// sub-resource URLs (`<link rel=stylesheet>`, `@font-face src`, favicon,
// og:image, `<img>`) discovered inside the fetched HTML. Those hrefs are
// attacker-influenced, so without a guard a page can point the daemon at
// cloud-metadata (169.254.169.254), RFC1918/CGNAT, link-local, or loopback
// services — a blind (second-order) SSRF.
//
// A brand's public website is never on a private/loopback address, so we reject
// every non-public host. Unlike the shared `assertExternalAssetUrl`, this also
// blocks loopback (that guard allows it for local API providers, which is wrong
// here) and resolves the hostname so a public name that A/AAAA-records into
// private space is caught too. Redirects are followed manually with a hop limit
// and every `Location` re-validated before the next request, so ordinary
// public-to-public redirects (http->https, apex->www, CDN hops) still work while
// a public host that 3xx's into private space is refused.
//
// DNS rebinding (a name that resolves public during validation but private when
// the platform fetch re-resolves for the socket) is defeated by pinning the
// validation to the connection: `fetchExternalBrandAsset` installs a
// connection-time `lookup` (see `createValidatingLookup`) that rejects the
// socket if the resolved address is non-public, so the address we validate IS
// the address we connect to — no separate pre-validation lookup to rebind
// around. Same pattern as `plugins/plugin-asset-cache.ts`.

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
export async function assertPublicBrandUrl(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`invalid brand asset url: ${String(url)}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`unsupported brand asset protocol: ${parsed.protocol}`);
  }
  const host = parsed.hostname.replace(/^\[/, '').replace(/\]$/, '').toLowerCase();
  if (isNonPublicHost(host)) {
    throw new Error(`blocked non-public brand asset host: ${host}`);
  }
  if (!isIpLiteral(host)) {
    let addresses: Array<{ address: string }>;
    try {
      addresses = await dnsPromises.lookup(host, { all: true });
    } catch {
      // Let the actual fetch surface a resolution failure rather than masking it.
      return;
    }
    for (const { address } of addresses) {
      if (isNonPublicHost(String(address))) {
        throw new Error(
          `brand asset host resolves to a non-public address: ${host} -> ${address}`,
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
 * `assertPublicBrandUrl` so the connect-time and pre-check block sets can't
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
          return cb(new Error(`brand asset host resolves to a non-public address: ${addr}`));
        }
      }
      return cb(null, address, family);
    });
  };
  return validatingLookup as unknown as LookupFunction;
}

const MAX_BRAND_REDIRECTS = 5;

// Pin SSRF validation to the actual outbound connection: the Agent resolves each
// host once at connect time and refuses the socket if that exact address is
// non-public. This is what defeats DNS rebinding — there is no separate
// pre-validation resolve to race. A single long-lived dispatcher (like
// plugins/plugin-asset-cache.ts) is reused across calls: it must NOT be closed
// per-request, since closing an undici Agent waits for the in-flight request,
// which only finishes once the caller has consumed the returned response body.
const brandAssetDispatcher = new Agent({
  connect: { lookup: createValidatingLookup() },
});

export async function fetchExternalBrandAsset(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  let target = url;
  for (let hop = 0; ; hop += 1) {
    // Re-validate every hop's host (initial URL and each redirect target) before
    // the request, so a public site can't 3xx us into private space. The real
    // SSRF stop is the pinned dispatcher below; this is a cheap URL-level
    // pre-check (protocol, literal private IPs, redirect target).
    await assertPublicBrandUrl(target);
    const res = await fetch(target, {
      ...init,
      redirect: 'manual',
      dispatcher: brandAssetDispatcher as unknown as NonNullable<RequestInit['dispatcher']>,
    });
    const location =
      res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
    if (!location) return res;
    // Drain the redirect response body before following it or bailing out.
    if (res.body) await res.body.cancel().catch(() => {});
    if (hop >= MAX_BRAND_REDIRECTS) {
      throw new Error(`too many brand asset redirects (> ${MAX_BRAND_REDIRECTS})`);
    }
    // Resolve a possibly-relative Location; the next loop re-validates it and the
    // same pinned dispatcher re-binds the new connection.
    target = new URL(location, target).toString();
  }
}
