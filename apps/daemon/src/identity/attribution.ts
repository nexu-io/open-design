// Helper that turns an Identity (plus optional request context) into the
// flat {actorIdentityId, actorDisplayName, actorSourceIp} shape that
// `upsertMessage` and the history feature's revision-recording paths
// consume. Centralized so the source-IP resolution logic lives in one
// place rather than getting copied at every call site.
//
// SECURITY (P0-fix #15) — actor_source_ip is durable audit data; it
// MUST be trustworthy. We no longer parse `X-Forwarded-For` directly
// inside this helper. Instead the helper reads `req.ip`, which is
// Express's `trust proxy`-aware resolved client IP:
//   - With `app.set('trust proxy', false)` (the default): req.ip is
//     `req.socket.remoteAddress`, regardless of any forwarded headers
//     a direct client might send. Spoofed `X-Forwarded-For` values are
//     ignored.
//   - With `app.set('trust proxy', 'loopback' | <IP> | <CIDR> | N)`:
//     Express resolves req.ip from the rightmost forwarded hop that
//     comes from a trusted source.
// The daemon's trust-proxy config is plumbed from `OD_TRUST_PROXY` at
// startup (`apps/daemon/src/server.ts`); deployments fronted by a
// reverse proxy (Tailscale Serve, nginx, Cloudflare Tunnel, …) MUST
// set this env var to the proxy's identity for source IPs to reflect
// the real client.

import type { Identity } from './types.js';

export interface AttributionFields {
  actorIdentityId: string | null;
  actorDisplayName: string | null;
  actorSourceIp: string | null;
}

interface RequestLike {
  /**
   * Express's `trust proxy`-aware client IP. With trust-proxy unset,
   * this is the direct TCP peer (forwarded headers are NOT considered).
   * With trust-proxy configured, Express walks the forwarded chain
   * from trusted hops only. We rely entirely on this resolution rather
   * than parsing forwarded headers ourselves so spoofed headers from
   * untrusted callers can't reach the audit field.
   */
  ip?: string | undefined;
  /**
   * Fallback raw socket address — used when `req.ip` is unavailable
   * (e.g., synthetic/test contexts that don't go through Express).
   */
  socket?: { remoteAddress?: string | null | undefined } | undefined;
}

/**
 * Derive flat attribution fields for storing on `messages` /
 * `project_revisions` rows. Returns all-null when identity is null or
 * undefined (background paths that don't have identity in scope).
 *
 * When a request is provided, also resolves the source IP via
 * `req.ip` (Express trust-proxy-aware) with a fallback to
 * `req.socket.remoteAddress` for non-Express test contexts. Forwarded
 * headers are NEVER parsed by this helper — the daemon-side
 * `app.set('trust proxy', …)` config is the only path that lets a
 * forwarded IP land in `req.ip`.
 *
 * For non-HTTP code paths (scheduler-fired routines, background
 * reconciliation), pass no req; source IP stays null.
 */
export function attributionFromIdentity(
  identity: Identity | null | undefined,
  req?: RequestLike,
): AttributionFields {
  if (!identity) {
    return { actorIdentityId: null, actorDisplayName: null, actorSourceIp: null };
  }
  return {
    actorIdentityId: identity.id,
    actorDisplayName: identity.displayName,
    actorSourceIp: extractSourceIp(req),
  };
}

function extractSourceIp(req?: RequestLike): string | null {
  if (!req) return null;
  // Express's trust-proxy-resolved client IP is the trusted answer.
  if (typeof req.ip === 'string' && req.ip.length > 0) return req.ip;
  // Fallback for synthetic test contexts (and defensive against
  // Express versions that don't populate req.ip for some reason).
  const sock = req.socket?.remoteAddress;
  return typeof sock === 'string' && sock.length > 0 ? sock : null;
}
