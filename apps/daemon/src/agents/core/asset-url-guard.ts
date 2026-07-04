/**
 * @module agents/core/asset-url-guard
 *
 * SSRF asset-URL guard shared by the connection/ and byok/ concerns. Extracted
 * verbatim from connectionTest.ts so both a chat-tool download (byok) and the
 * CLI-agent media path (connection) route upstream-controlled URLs through one
 * DNS-resolving block-list before any bytes are fetched.
 */
import { promises as dnsPromises } from 'node:dns';
import {
  isBlockedExternalApiHostname,
  isLoopbackApiHost,
  validateBaseUrl,
  type BaseUrlValidationResult,
} from '@open-design/contracts/api/connectionTest';

export { validateBaseUrl } from '@open-design/contracts/api/connectionTest';

// DNS-aware companion to `validateBaseUrl`. The contracts-side check only
// inspects the literal hostname string, so a public DNS name pointing at
// internal infrastructure (`internal.example.com → 10.0.0.5`) slips through
// and the daemon ends up issuing a request to a private address on behalf of
// whichever caller supplied the base URL. Resolve the hostname and re-run
// the block-list against every address the system would actually connect to.
//
// Loopback is intentionally allowed for local LLM providers like Ollama; any
// hostname that resolves to a loopback address (including `*.localhost` per
// RFC 6761 and IPv4-mapped IPv6 loopback) follows that same carve-out.
//
// DNS lookup failures are *not* treated as a security signal — the caller is
// going to surface a connection error from `fetch` anyway, and turning a
// transient resolver hiccup into a 403 would just confuse users. The sync
// hostname check still rejected the obvious literal-IP cases before we ever
// got here.

/** A resolved DNS address entry — the IP string and address family (4 or 6). */
export type DnsLookupAddress = { address: string; family: number };

/**
 * Async DNS lookup function: resolves a hostname to all its addresses. Defaults
 * to `node:dns.promises.lookup(..., {all:true})`. Injectable for testing.
 */
export type DnsLookupFn = (hostname: string) => Promise<DnsLookupAddress[]>;

const defaultDnsLookup: DnsLookupFn = async (hostname) => {
  const result = await dnsPromises.lookup(hostname, { all: true, family: 0 });
  return result.map(({ address, family }) => ({ address, family }));
};

function looksLikeIpLiteral(hostname: string): boolean {
  const host = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return true;
  return host.includes(':');
}

/**
 * DNS-aware companion to `validateBaseUrl`. Resolves the hostname and re-checks
 * every returned IP against the SSRF block-list, catching DNS rebinding attacks
 * where a public hostname resolves to an RFC1918 / metadata-service address.
 * Loopback addresses pass through (Ollama and other local providers bind there).
 *
 * DNS lookup failures are not treated as a security signal — the subsequent
 * `fetch` will surface a connection error. Returns `validateBaseUrl`'s sync
 * result unchanged when the hostname is an IP literal or resolves to loopback.
 *
 * @param baseUrl The provider base URL string to validate.
 * @param lookup  Optional DNS resolver; defaults to `node:dns.promises.lookup`.
 * @returns A `BaseUrlValidationResult` discriminated union — callers check `.error`.
 */
export async function validateBaseUrlResolved(
  baseUrl: string,
  lookup: DnsLookupFn = defaultDnsLookup,
): Promise<BaseUrlValidationResult> {
  const sync = validateBaseUrl(baseUrl);
  if (sync.error || !sync.parsed) return sync;

  const hostname = sync.parsed.hostname.toLowerCase();
  if (isLoopbackApiHost(hostname)) return sync;
  if (looksLikeIpLiteral(hostname)) return sync;

  let addresses: DnsLookupAddress[];
  try {
    addresses = await lookup(hostname);
  } catch {
    return sync;
  }

  for (const addr of addresses) {
    const ip = String(addr.address).toLowerCase();
    if (isLoopbackApiHost(ip)) continue;
    if (isBlockedExternalApiHostname(ip)) {
      return { error: 'Internal IPs blocked', forbidden: true };
    }
  }

  return sync;
}

/**
 * SSRF guard for asset URLs handed back inside a successful API
 * response — typically a `data.url` or `data.video_url` that points
 * at the gateway's CDN, but is attacker-controllable when the
 * upstream gateway is compromised or misconfigured. Routes the URL
 * through `validateBaseUrlResolved` (DNS-resolve → reject loopback,
 * RFC1918, link-local, CGNAT, metadata-service IPs) and returns a
 * discriminated union so callers don't have to repeat the
 * `validated.error || !validated.parsed` plumbing.
 *
 * Two callers today:
 *   - `byok-tools.ts` for the chat-tool image/video downloads
 *   - `media.ts` `renderSenseAudioImage` for the CLI agent path
 * Both hand the URL straight to `fetch(...)` next, so pair this
 * guard with `redirect: 'error'` on the fetch to also block a
 * 3xx hop into private space.
 */
export async function assertExternalAssetUrl(
  rawUrl: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof rawUrl !== 'string' || !rawUrl) {
    return { ok: false, error: 'empty download url' };
  }
  const validated = await validateBaseUrlResolved(rawUrl);
  if (validated.error || !validated.parsed) {
    return {
      ok: false,
      error: validated.forbidden
        ? `blocked download url (${validated.error ?? 'internal address'})`
        : `invalid download url: ${validated.error ?? 'unknown reason'}`,
    };
  }
  return { ok: true };
}

/**
 * Validate an upstream-controlled asset URL and fetch it with the SSRF guard
 * pinned through redirects. Runs `assertExternalAssetUrl` on the literal URL
 * and forces `redirect: 'error'`, so a validated public URL that 302s into
 * loopback / RFC1918 / metadata space is rejected before any bytes are read.
 *
 * Throws on a blocked host — so the redirect bypass is impossible to forget at
 * call sites — and the platform fetch additionally throws when `redirect:
 * 'error'` encounters a 3xx. Callers keep their own `!resp.ok` HTTP-status
 * handling. The forced `redirect` is spread last so it overrides any value the
 * caller passed in `init`.
 */
export async function assertAndFetchExternalAsset(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const check = await assertExternalAssetUrl(url);
  if (!check.ok) throw new Error(check.error);
  return fetch(url, { ...init, redirect: 'error' });
}
