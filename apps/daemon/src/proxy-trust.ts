/**
 * Proxy-trust utilities for daemons behind a reverse proxy or tunnel.
 *
 * When `OD_TRUST_PROXY` is set (e.g. "cloudflare", "nginx", "1"), the daemon
 * accepts `X-Forwarded-For` as the real client IP — but ONLY when the TCP
 * peer (remoteAddress) is loopback. A direct LAN/WAN client cannot spoof the
 * header to escalate privileges.
 *
 * This is opt-in: the default (no OD_TRUST_PROXY) is safe for LAN/Tailscale
 * where the daemon sees the real peer address directly.
 */

import net from 'node:net';

const TRUST_PROXY_VALUES = new Set([
  '1', 'true', 'yes',
  'cloudflare', 'nginx', 'caddy', 'traefik', 'apache',
  'tunnel', 'proxy',
]);

export function isProxyTrusted(): boolean {
  const val = process.env.OD_TRUST_PROXY?.trim().toLowerCase() ?? '';
  return TRUST_PROXY_VALUES.has(val);
}

/**
 * Returns true when the current request arrived over HTTPS — either directly
 * (TLS socket) or through a trusted proxy that set `X-Forwarded-Proto: https`.
 *
 * Use this instead of `isProxyTrusted()` when deciding whether to set the
 * `Secure` cookie flag: plain-HTTP reverse proxies do not satisfy the Secure
 * constraint, so a `Secure` cookie would be silently dropped by the browser.
 */
export function isRequestHttps(req: { socket?: { encrypted?: boolean }; headers: Record<string, string | string[] | undefined> }): boolean {
  if (req.socket?.encrypted) return true;
  if (isProxyTrusted()) {
    const proto = req.headers['x-forwarded-proto'];
    return typeof proto === 'string' && proto.trim().toLowerCase() === 'https';
  }
  return false;
}

/**
 * Returns true when `address` is a loopback peer (127.x.x.x, ::1, or
 * IPv4-mapped equivalents like ::ffff:127.0.0.1).
 */
export function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  let norm = address.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (norm.startsWith('::ffff:')) norm = norm.slice('::ffff:'.length);
  if (norm === '::1' || norm === '0:0:0:0:0:0:0:1') return true;
  if (net.isIP(norm) === 4) return norm === '127.0.0.1' || norm.startsWith('127.');
  return false;
}

/**
 * Returns the effective client IP for auth decisions.
 *
 * - When proxy is NOT trusted: returns `remoteAddress` directly.
 * - When proxy IS trusted AND the TCP peer is loopback: reads
 *   `X-Forwarded-For` and returns the first (leftmost) entry.
 * - When proxy IS trusted but the TCP peer is NOT loopback: ignores
 *   `X-Forwarded-For` to prevent spoofing by direct clients.
 */
export function extractEffectivePeer(
  remoteAddress: string | undefined,
  xForwardedFor: string | undefined,
): string {
  if (!isProxyTrusted()) return remoteAddress ?? '';
  if (!isLoopbackAddress(remoteAddress)) return remoteAddress ?? '';
  // No XFF header — when proxy trust is enabled and the TCP peer is
  // loopback, a missing XFF is ambiguous. Fail closed so a remote client
  // through a same-host proxy that omits the header cannot bypass guards.
  // Direct-localhost bootstrap/login flows check req.socket.remoteAddress
  // directly instead of using this helper.
  if (xForwardedFor === undefined) return '';
  // XFF present but empty/garbage — proxy is there but didn't forward a
  // real client IP. Fail closed so untrusted origins cannot slip through.
  const first = xForwardedFor.split(',')[0]?.trim();
  return first || '';
}

/**
 * Convenience: extract effective peer IP from an Express-like request object.
 */
export function effectivePeerFromReq(req: { socket?: { remoteAddress?: string | undefined }; headers: Record<string, string | string[] | undefined> }): string {
  return extractEffectivePeer(
    req.socket?.remoteAddress,
    req.headers['x-forwarded-for'] as string | undefined,
  );
}

/**
 * Determines whether a request originates from a truly local client,
 * safe for granting access to management-only endpoints.
 *
 * 1. TCP peer must be loopback (direct local or same-host proxy).
 * 2. If proxy trust is NOT enabled: trust the loopback peer directly.
 * 3. If proxy trust IS enabled AND the TCP peer is loopback:
 *    a. XFF present → use it: the real client behind the proxy must be loopback.
 *    b. XFF absent → disambiguate via Host/Origin headers:
 *       - Host/Origin are loopback → direct localhost browser → allow.
 *       - Host/Origin are non-loopback → proxy forwarded a remote client → deny.
 *       - Host/Origin absent → fail closed (deny).
 *
 * This prevents a same-host proxy that omits XFF from making a remote browser
 * look local, while preserving direct-localhost admin access when proxy trust
 * is enabled (e.g. an operator with OD_TRUST_PROXY=1 managing via 127.0.0.1).
 */
export function isLocalManagementRequest(req: {
  socket?: { remoteAddress?: string | undefined };
  headers: Record<string, string | string[] | undefined>;
}): boolean {
  const tcpPeer = req.socket?.remoteAddress;
  if (!isLoopbackAddress(tcpPeer)) return false;
  if (!isProxyTrusted()) return true;
  const xff = req.headers['x-forwarded-for'];
  if (xff !== undefined) {
    // XFF present — verify the real client behind the proxy is also loopback.
    const first = String(xff).split(',')[0]?.trim();
    if (!first) return false;
    return isLoopbackAddress(first);
  }
  // No XFF under proxy trust — disambiguate via Host/Origin.
  // A direct localhost browser sends Host: 127.0.0.1:port or
  // Host: localhost:port, and Origin: http://127.0.0.1:port.
  // A proxied remote client sends Host: public-domain:port.
  const origin = typeof req.headers['origin'] === 'string'
    ? req.headers['origin'] : undefined;
  if (origin) return isLoopbackOrigin(origin);
  const host = typeof req.headers['host'] === 'string'
    ? req.headers['host'] : undefined;
  if (host) return isLoopbackHost(host);
  // Neither Origin nor Host — fail closed.
  return false;
}

/**
 * Returns true when a Host header value (e.g. "127.0.0.1:7456",
 * "localhost:3000", "[::1]:7456") resolves to a loopback address.
 */
export function isLoopbackHost(host: string): boolean {
  // Strip port — handle IPv6 bracket notation.
  let hostname = host;
  if (hostname.startsWith('[')) {
    const close = hostname.indexOf(']');
    if (close >= 0) hostname = hostname.slice(1, close);
  } else {
    const colon = hostname.lastIndexOf(':');
    if (colon >= 0) hostname = hostname.slice(0, colon);
  }
  if (hostname === 'localhost') return true;
  return isLoopbackAddress(hostname);
}

/**
 * Returns true when an Origin header value (e.g. "http://127.0.0.1:7456",
 * "https://localhost:3000") resolves to a loopback host.
 */
export function isLoopbackOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return isLoopbackHost(url.host);
  } catch {
    return false;
  }
}
