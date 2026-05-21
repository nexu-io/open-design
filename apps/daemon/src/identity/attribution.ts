// Helper that turns an Identity (plus optional request context) into the
// flat {actorIdentityId, actorDisplayName, actorSourceIp} shape that
// `upsertMessage` and the history feature's revision-recording paths
// consume. Centralized so the actor_source_ip extraction logic (parse
// X-Forwarded-For first, fall back to req.socket.remoteAddress) lives
// in one place rather than getting copied at every call site.

import type { Identity } from './types.js';

export interface AttributionFields {
  actorIdentityId: string | null;
  actorDisplayName: string | null;
  actorSourceIp: string | null;
}

interface RequestLike {
  // Headers is loosely-typed (string-keyed dict of unknown) so any
  // Express-style Request structurally satisfies the contract. We
  // only read `x-forwarded-for` from it, narrowing the value at the
  // read site.
  headers?: Record<string, unknown> | undefined;
  socket?: { remoteAddress?: string | null | undefined } | undefined;
}

/**
 * Derive flat attribution fields for storing on `messages` /
 * `project_revisions` rows. Returns all-null when identity is null or
 * undefined (background paths that don't have identity in scope).
 *
 * When a request is provided, also resolves the source IP:
 *  1. The first comma-separated entry of `X-Forwarded-For` (the
 *     original client IP behind a reverse proxy).
 *  2. Falls back to `req.socket.remoteAddress` (the TCP peer; useful
 *     for direct-loopback callers like the desktop UI).
 *  3. Null when neither yields a string.
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
  const xff = req.headers?.['x-forwarded-for'];
  if (typeof xff === 'string') {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const sock = req.socket?.remoteAddress;
  return typeof sock === 'string' && sock.length > 0 ? sock : null;
}
