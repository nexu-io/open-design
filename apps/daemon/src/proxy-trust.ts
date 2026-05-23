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
  if (!xForwardedFor) return remoteAddress ?? '';
  const first = xForwardedFor.split(',')[0]?.trim();
  return first || (remoteAddress ?? '');
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
