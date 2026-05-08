// Spec 112 — per-tenant x-api-key authentication for the multi-tenant REST API.
// Caller: /tmp/open-design/apps/daemon/src/routes/api-projects.ts
// Test: /tmp/open-design/apps/daemon/tests/api-projects.test.ts
// No data files: env var OPENDESIGN_API_KEYS only; HTTP headers only.
//
// Two-layer guard:
//   1. resolve tenant_slug from request subdomain (e.g.
//      ceremonia.opendesign.holalumina.com → "ceremonia")
//   2. look up OPENDESIGN_API_KEYS[tenant_slug] and constant-time compare
//      with the x-api-key request header
//
// Then enforces body.tenant_slug === resolved_tenant_from_subdomain. This is
// what defeats cross-tenant URL forging: even if Aya holds a valid Ceremonia
// key, posting to ericedmeades.opendesign.holalumina.com with
// body.tenant_slug=ericedmeades 401s on the key check, and
// body.tenant_slug=ceremonia 403s on the slug check.
//
// This middleware is mounted on /api/projects only (NOT on UI routes). UI
// routes continue to use Clerk session cookies. There is no JWT decoding
// here — this is server-to-server auth for the openclaw skill.

import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export type ApiKeyMap = Record<string, string>;

export interface ResolvedTenant {
  tenant_slug: string;
}

declare global {
  // Express.Request augmentation — attaches the resolved tenant to the
  // request so route handlers don't have to re-parse the subdomain.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      resolved_tenant?: ResolvedTenant;
    }
  }
}

interface AuthDeps {
  /** Override env-var read for tests. Returns the key map. */
  readApiKeys?: () => ApiKeyMap;
  /** Override the host-header parse for tests. Returns tenant_slug or null. */
  resolveTenantFromHost?: (host: string | undefined) => string | null;
}

/**
 * Parse the OPENDESIGN_API_KEYS env var as a {tenant_slug: api_key} JSON map.
 * Throws on malformed JSON so the daemon fails closed at startup if an
 * operator typoed the secret. Returns an empty map if the env var is unset
 * (which means no /api/projects calls will succeed — fail-safe default).
 */
export function readApiKeysFromEnv(): ApiKeyMap {
  const raw = process.env['OPENDESIGN_API_KEYS'];
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'parse error';
    throw new Error(`OPENDESIGN_API_KEYS is not valid JSON: ${msg}`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('OPENDESIGN_API_KEYS must be a JSON object {tenant: key}');
  }
  const map: ApiKeyMap = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v !== 'string' || v.length === 0) {
      throw new Error(`OPENDESIGN_API_KEYS["${k}"] must be a non-empty string`);
    }
    map[k] = v;
  }
  return map;
}

/**
 * Extract tenant_slug from a host header like
 *   ceremonia.opendesign.holalumina.com → "ceremonia"
 *
 * Returns null when the host doesn't match the expected pattern. The pattern
 * is configurable via OPENDESIGN_HOST_SUFFIX (default
 * ".opendesign.holalumina.com"). Local dev / tests can set the suffix to
 * something like ".opendesign.localhost" to exercise this path.
 */
export function resolveTenantFromHostHeader(
  host: string | undefined,
): string | null {
  if (!host) return null;
  // strip port if present (e.g. "ceremonia.opendesign.localhost:7456")
  const bare = host.split(':')[0]?.toLowerCase() ?? '';
  if (!bare) return null;

  const suffix = (process.env['OPENDESIGN_HOST_SUFFIX'] ?? '.opendesign.holalumina.com')
    .toLowerCase();
  if (!bare.endsWith(suffix)) return null;

  const slugPart = bare.slice(0, bare.length - suffix.length);
  if (slugPart.length === 0) return null;
  // slug must be a single label — no further dots
  if (slugPart.includes('.')) return null;
  // basic sanity: lowercase letters, digits, hyphens only
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(slugPart)) return null;
  return slugPart;
}

function constantTimeEqual(a: string, b: string): boolean {
  // timingSafeEqual requires equal-length buffers; length-mismatch is leaked
  // anyway via response timing in practice, but we still avoid throwing.
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  return timingSafeEqual(bufA, bufB);
}

/**
 * Express middleware factory. Resolves tenant_slug from the host, looks up
 * the expected api key, and validates the x-api-key header.
 *
 * On success, attaches `req.resolved_tenant = { tenant_slug }` and calls
 * next(). On failure, sends a sanitized JSON error and does NOT call next().
 *
 * The body.tenant_slug check is NOT done here — it's a per-route concern
 * (see assertBodyTenantSlug below) because some future endpoints might not
 * carry a body slug.
 */
export function apiKeyAuth(deps: AuthDeps = {}) {
  return function apiKeyAuthMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    let keys: ApiKeyMap;
    try {
      keys = (deps.readApiKeys ?? readApiKeysFromEnv)();
    } catch {
      // Misconfigured env — fail closed, but don't leak the parse error.
      res.status(500).json({ error: 'auth_misconfigured' });
      return;
    }

    const hostHeader =
      (req.headers['x-forwarded-host'] as string | undefined) ??
      (req.headers['host'] as string | undefined);
    const resolveTenant =
      deps.resolveTenantFromHost ?? resolveTenantFromHostHeader;
    const tenantSlug = resolveTenant(hostHeader);
    if (!tenantSlug) {
      res.status(401).json({ error: 'unknown_tenant' });
      return;
    }

    const expected = keys[tenantSlug];
    if (!expected) {
      // No key configured for this tenant — treat as missing key, not 500,
      // because operators should not learn from response codes whether a
      // tenant exists or whether their key is wrong.
      res.status(401).json({ error: 'missing_key' });
      return;
    }

    const provided = req.headers['x-api-key'];
    if (typeof provided !== 'string' || provided.length === 0) {
      res.status(401).json({ error: 'missing_key' });
      return;
    }

    if (!constantTimeEqual(provided, expected)) {
      res.status(401).json({ error: 'key_mismatch' });
      return;
    }

    req.resolved_tenant = { tenant_slug: tenantSlug };
    next();
  };
}

/**
 * Per-route guard: assert the request body's `tenant_slug` field matches the
 * subdomain-resolved tenant. Returns true on match, false on mismatch (and
 * sends the 403 response). Routes call this AFTER apiKeyAuth has set
 * req.resolved_tenant.
 */
export function assertBodyTenantSlug(req: Request, res: Response): boolean {
  const resolved = req.resolved_tenant?.tenant_slug;
  if (!resolved) {
    // Should never happen — apiKeyAuth must run first. Defensive 500.
    res.status(500).json({ error: 'auth_misordered' });
    return false;
  }
  const bodySlug = (req.body as { tenant_slug?: unknown } | undefined)
    ?.tenant_slug;
  if (typeof bodySlug !== 'string' || bodySlug.length === 0) {
    res.status(400).json({ error: 'missing_tenant_slug' });
    return false;
  }
  if (bodySlug !== resolved) {
    res.status(403).json({ error: 'slug_mismatch' });
    return false;
  }
  return true;
}
