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
// Residual: DNS rebinding (a name that resolves public here but private when the
// platform fetch re-resolves) is not defeated without a pinned dispatcher — the
// same limitation the codebase's other check-then-fetch SSRF guards carry.

import { promises as dnsPromises } from 'node:dns';

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

const MAX_BRAND_REDIRECTS = 5;

export async function fetchExternalBrandAsset(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  let target = url;
  for (let hop = 0; ; hop += 1) {
    // Re-validate every hop's host (initial URL and each redirect target) before
    // the request, so a public site can't 3xx us into private space.
    await assertPublicBrandUrl(target);
    const res = await fetch(target, { ...init, redirect: 'manual' });
    const location =
      res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
    if (!location) return res;
    // Drain the redirect response body before following it or bailing out.
    if (res.body) await res.body.cancel().catch(() => {});
    if (hop >= MAX_BRAND_REDIRECTS) {
      throw new Error(`too many brand asset redirects (> ${MAX_BRAND_REDIRECTS})`);
    }
    // Resolve a possibly-relative Location; the next loop re-validates it.
    target = new URL(location, target).toString();
  }
}
