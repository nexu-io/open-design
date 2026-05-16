/**
 * Proxy-trust utilities for daemons behind a reverse proxy or tunnel.
 *
 * When `OD_TRUST_PROXY` is set (e.g. "cloudflare", "nginx", "1"), the daemon
 * accepts `X-Forwarded-For` as the real client IP. Without it, only
 * `req.socket.remoteAddress` is trusted — a same-host proxy will always
 * appear as loopback and cannot bypass auth.
 *
 * This is opt-in: the default (no OD_TRUST_PROXY) is safe for LAN/Tailscale
 * where the daemon sees the real peer address directly.
 */

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
 * Returns the effective client IP for auth decisions.
 *
 * - When proxy is NOT trusted: returns `remoteAddress` directly.
 * - When proxy IS trusted: reads `X-Forwarded-For` and returns the first
 *   (leftmost) entry, which is the original client IP per RFC 7239.
 *   Falls back to `remoteAddress` if the header is absent or empty.
 */
export function extractEffectivePeer(
  remoteAddress: string | undefined,
  xForwardedFor: string | undefined,
): string {
  if (!isProxyTrusted()) return remoteAddress ?? '';
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
