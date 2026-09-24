import { promises as dns } from 'node:dns';

import { assertSafePublicUrl, isPrivateAddress } from './plugins/plugin-asset-cache.js';

export type BrowserDnsLookup = typeof dns.lookup;

export interface BrowserNetworkPolicy {
  allowPrivateNetwork?: boolean;
  lookup?: BrowserDnsLookup;
}

export interface BrowserNetworkTarget {
  address: string;
  family: number;
  url: URL;
}

function isBrowserLocalUrl(rawUrl: string): boolean {
  if (rawUrl === 'about:blank') return true;
  return rawUrl.startsWith('data:') || rawUrl.startsWith('blob:');
}

/**
 * Website Clone drives a daemon-owned browser, so every network destination
 * must be checked at the privileged boundary. Literal private addresses and
 * hostnames resolving to loopback, RFC1918, link-local, metadata, CGNAT, or
 * multicast space are refused before Chromium can issue the request.
 */
export async function assertBrowserNetworkUrl(
  rawUrl: string,
  policy: BrowserNetworkPolicy = {},
): Promise<void> {
  if (isBrowserLocalUrl(rawUrl)) return;

  await resolveBrowserNetworkTarget(rawUrl, policy);
}

export async function resolveBrowserNetworkTarget(
  rawUrl: string,
  policy: BrowserNetworkPolicy = {},
): Promise<BrowserNetworkTarget> {
  let parsed: URL;

  if (policy.allowPrivateNetwork) {
    parsed = new URL(rawUrl);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
      throw new Error('browser destination must be an HTTP(S) URL without credentials');
    }
  } else {
    parsed = assertSafePublicUrl(rawUrl);
  }

  const lookup = policy.lookup ?? dns.lookup;
  const addresses = await lookup(parsed.hostname, { all: true, family: 0 });
  if (addresses.length === 0) {
    throw new Error('browser destination did not resolve');
  }
  for (const { address } of addresses) {
    if (!policy.allowPrivateNetwork && isPrivateAddress(address)) {
      throw new Error(`browser destination resolves to a private address: ${address}`);
    }
  }
  const selected = addresses[0];
  if (!selected) throw new Error('browser destination did not resolve');
  return { address: selected.address, family: selected.family, url: parsed };
}
