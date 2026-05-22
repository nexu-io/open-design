// Turns an Identity (plus optional request context) into the flat
// {actorIdentityId, actorDisplayName, actorSourceIp} shape that
// upsertMessage and the history feature's revision-recording paths
// consume. Centralized so source-IP resolution lives in one place.
//
// SECURITY — actor_source_ip is durable audit data; it MUST be
// trustworthy. This helper reads `req.ip`, which is Express's
// `trust proxy`-aware resolved client IP. With trust-proxy unset
// (the default) req.ip is the raw socket peer and any forwarded
// headers a direct caller sends are ignored. The daemon's
// trust-proxy config is plumbed from `OD_TRUST_PROXY` at startup
// (apps/daemon/src/server.ts); proxy-fronted deployments MUST set
// it to the proxy's identity for source IPs to reflect the real client.

import type { Identity } from './types.js';

export interface AttributionFields {
  actorIdentityId: string | null;
  actorDisplayName: string | null;
  actorSourceIp: string | null;
}

interface RequestLike {
  /**
   * Express's `trust proxy`-aware client IP. With trust-proxy unset,
   * this is the direct TCP peer (forwarded headers NOT considered);
   * with trust-proxy configured, Express walks the forwarded chain
   * from trusted hops only.
   */
  ip?: string | undefined;
  /** Fallback for synthetic/test contexts that bypass Express. */
  socket?: { remoteAddress?: string | null | undefined } | undefined;
}

/**
 * Derive flat attribution fields for storing on `messages` /
 * `project_revisions`. Returns all-null when identity is null
 * (background paths without identity in scope).
 *
 * When a request is provided, also resolves source IP via `req.ip`
 * with a fallback to `req.socket.remoteAddress`. Forwarded headers
 * are NEVER parsed by this helper — `app.set('trust proxy', …)` is
 * the only path that lets a forwarded IP land in `req.ip`.
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
  if (typeof req.ip === 'string' && req.ip.length > 0) return req.ip;
  // Fallback for synthetic test contexts (and defensive against
  // Express versions that don't populate req.ip for some reason).
  const sock = req.socket?.remoteAddress;
  return typeof sock === 'string' && sock.length > 0 ? sock : null;
}
