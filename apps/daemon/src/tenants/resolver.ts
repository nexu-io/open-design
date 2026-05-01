/**
 * T017 — Tenant resolver middleware.
 *
 * THE SECURITY BOUNDARY for the entire multi-tenant open-design platform.
 *
 * Spec 101 contracts:
 *   - specs/101-open-design-platform/contracts/tenant-resolution.contract.md
 *   - specs/101-open-design-platform/data-model.md (RequestTenantContext)
 *
 * Pipeline (per data-model.md Lifecycle):
 *   1. Parse Host header (strip port, strip trailing dot, lowercase) →
 *      derive subdomain by stripping `.opendesign.holalumina.com` suffix.
 *   2. Reserved-subdomain check (defense in depth — Caddy also rejects).
 *   3. Subdomain regex check (single label matching /^[a-z0-9-]+$/).
 *   4. Registry lookup by subdomain.
 *   5. open_design.enabled check.
 *   6. __session cookie presence check → 302 to Clerk sign-in.
 *   7. Clerk JWT verification via verifyClerkSession().
 *   8. JWT o.slg ↔ subdomain match check (cross-tenant prevention).
 *   9. Construct RequestTenantContext (snapshot all registry values).
 *   10. runWithTenantContext(ctx, () => next()).
 *
 * RESPONSE INVARIANTS (cross-tenant non-disclosure):
 *   - All "tenant-discovery" failures (cases 2/3/4/5/10/11 in test matrix) emit
 *     a byte-identical 404 response: status=404, body="Not Found\n",
 *     content-type="text/plain; charset=utf-8", content-length="10". This makes
 *     it impossible for an attacker to enumerate which tenants exist via
 *     response timing, body content, or header differences.
 *   - All JWT-stage failures emit 401 + "Unauthorized\n". The specific JWT
 *     failure kind (expired vs invalid_signature vs missing_org) is NOT
 *     surfaced in the response body — that information is logged server-side
 *     but never leaked to the caller.
 *   - Missing session cookie emits 302 to Clerk sign-in with the original URL
 *     preserved as `return` query param. This is the only legitimate redirect
 *     path through the middleware.
 *
 * Audit logging:
 *   Every middleware run emits a structured `tenant_resolution` log line via
 *   console.log (JSON). Step-failed events with `org_mismatch` are flagged
 *   via the `audit_severity: 'high'` field — those are likely cross-tenant
 *   attack signatures and must be reviewed.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';

import type { RegistryIndex, TenantConfig } from './registry-loader.js';
import { isReserved } from './reserved-subdomains.js';
import {
  verifyClerkSession,
  ClerkVerificationError,
} from '../auth/clerk-jwt.js';
import {
  runWithTenantContext,
  type RequestTenantContext,
} from '../auth/tenant-context.js';

// ---------------------------------------------------------------------------
// Constants — byte-identical response bodies + headers.
// ---------------------------------------------------------------------------

const PLATFORM_DOMAIN_SUFFIX = '.opendesign.holalumina.com';
const SIGN_IN_URL = 'https://app.holalumina.com/sign-in';
const SUBDOMAIN_PATTERN = /^[a-z0-9-]+$/;
const NOT_FOUND_BODY = 'Not Found\n';
const NOT_FOUND_BYTES = Buffer.byteLength(NOT_FOUND_BODY, 'utf8');
const UNAUTHORIZED_BODY = 'Unauthorized\n';
const UNAUTHORIZED_BYTES = Buffer.byteLength(UNAUTHORIZED_BODY, 'utf8');
const PLAINTEXT_CONTENT_TYPE = 'text/plain; charset=utf-8';

// ---------------------------------------------------------------------------
// Public API.
// ---------------------------------------------------------------------------

export interface TenantResolverDeps {
  /** Boot-time loaded tenant registry. Snapshot — never re-read at runtime. */
  registry: RegistryIndex;
}

export type ExpressLikeMiddleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: (err?: unknown) => void,
) => void;

/**
 * Construct the tenant-resolution middleware. Bind once at boot with the
 * loaded registry; resulting function is an Express-style `(req, res, next)`
 * handler.
 */
export function tenantResolverMiddleware(deps: TenantResolverDeps): ExpressLikeMiddleware {
  const { registry } = deps;

  return function tenantResolver(req, res, next): void {
    const requestId = randomUUID();
    const rawHost = readHost(req);
    const normalizedHost = normalizeHost(rawHost);

    // 1. Subdomain extraction — match against `*.opendesign.holalumina.com`.
    const subdomain = extractSubdomain(normalizedHost);

    if (subdomain === null) {
      logResolution({
        requestId,
        host: rawHost,
        subdomain: null,
        result: 'denied',
        stepFailed: 'subdomain_parse',
        statusCode: 404,
      });
      respondNotFound(res);
      return;
    }

    // 2. Reserved subdomain (defense in depth — Caddy also rejects these).
    if (isReserved(subdomain)) {
      logResolution({
        requestId,
        host: rawHost,
        subdomain,
        result: 'denied',
        stepFailed: 'reserved_subdomain',
        statusCode: 404,
      });
      respondNotFound(res);
      return;
    }

    // 3. Subdomain regex (single label kebab-case).
    if (!SUBDOMAIN_PATTERN.test(subdomain)) {
      logResolution({
        requestId,
        host: rawHost,
        subdomain,
        result: 'denied',
        stepFailed: 'subdomain_parse',
        statusCode: 404,
      });
      respondNotFound(res);
      return;
    }

    // 4. Registry lookup.
    const tenant = registry.get(subdomain);
    if (!tenant) {
      logResolution({
        requestId,
        host: rawHost,
        subdomain,
        result: 'denied',
        stepFailed: 'registry_lookup',
        statusCode: 404,
      });
      respondNotFound(res);
      return;
    }

    // 5. open_design.enabled check.
    const od = tenant.open_design;
    if (!od || od.enabled !== true) {
      logResolution({
        requestId,
        host: rawHost,
        subdomain,
        result: 'denied',
        stepFailed: 'tenant_disabled',
        statusCode: 404,
      });
      respondNotFound(res);
      return;
    }

    // 6. Session cookie check.
    const sessionToken = readSessionCookie(req);
    if (!sessionToken) {
      const returnUrl = `https://${subdomain}${PLATFORM_DOMAIN_SUFFIX}${req.url ?? '/'}`;
      // Use redirect_url (Clerk + app convention) so the sign-in page picks
      // it up via useSearchParams().get('redirect_url'). Older code shipped
      // ?return= which the app ignored, dropping the user on /cms.
      const location = `${SIGN_IN_URL}?redirect_url=${encodeURIComponent(returnUrl)}`;
      logResolution({
        requestId,
        host: rawHost,
        subdomain,
        result: 'redirect',
        stepFailed: 'no_session',
        statusCode: 302,
      });
      respondRedirect(res, location);
      return;
    }

    // 7. JWT verification + 8. org-vs-subdomain match.
    // Wrap async work in an IIFE so we don't change the middleware's sync
    // signature (Express middleware is sync; promises must be self-handled).
    void (async () => {
      let claims;
      try {
        claims = await verifyClerkSession(sessionToken);
      } catch (err) {
        const kind =
          err instanceof ClerkVerificationError ? err.kind : 'invalid';
        logResolution({
          requestId,
          host: rawHost,
          subdomain,
          result: 'denied',
          stepFailed: 'jwt_invalid',
          statusCode: 401,
          extra: { jwt_failure_kind: kind },
        });
        respondUnauthorized(res);
        return;
      }

      // 8. o.slg ↔ subdomain match. Mismatch is a cross-tenant attempt — emit
      // a byte-identical 404 (NOT 401, NOT 403). The audit log gets `high`
      // severity so operators can flag enumeration attacks.
      if (claims.o.slg !== subdomain) {
        logResolution({
          requestId,
          host: rawHost,
          subdomain,
          result: 'denied',
          stepFailed: 'org_mismatch',
          statusCode: 404,
          tenantResolved: claims.o.slg,
          userId: claims.sub,
          auditSeverity: 'high',
        });
        respondNotFound(res);
        return;
      }

      // 9. Construct RequestTenantContext (snapshot every value).
      const ctx: RequestTenantContext = {
        tenant_id: subdomain,
        clerk_user_id: claims.sub,
        clerk_session_id: claims.sid,
        clerk_org_slug: claims.o.slg,
        design_system: od.design_system,
        wedge_endpoint: od.wedge_endpoint,
        vercel_team: od.vercel_team,
        data_dir: od.data_dir,
        request_id: requestId,
      };

      logResolution({
        requestId,
        host: rawHost,
        subdomain,
        result: 'ok',
        stepFailed: null,
        statusCode: 200,
        tenantResolved: claims.o.slg,
        userId: claims.sub,
      });

      // 10. Hand off to the rest of the pipeline inside the tenant scope.
      runWithTenantContext(ctx, () => {
        next();
      }).catch((nextErr: unknown) => {
        next(nextErr);
      });
    })();
  };
}

// ---------------------------------------------------------------------------
// Internal helpers — host parsing, cookie extraction, response writers.
// ---------------------------------------------------------------------------

function readHost(req: IncomingMessage): string {
  // Prefer X-Forwarded-Host (Caddy reverse-proxy adds this). Fallback to Host.
  const forwarded = req.headers['x-forwarded-host'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    // X-Forwarded-Host can contain a list — first entry wins.
    const first = forwarded.split(',')[0];
    if (first) return first.trim();
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return forwarded[0];
  }
  return typeof req.headers['host'] === 'string' ? req.headers['host'] : '';
}

function normalizeHost(host: string): string {
  if (!host) return '';
  let h = host.trim().toLowerCase();
  // Strip port suffix (`:443`).
  const colonIndex = h.lastIndexOf(':');
  if (colonIndex !== -1) {
    h = h.slice(0, colonIndex);
  }
  // Strip trailing dot (`example.com.` → `example.com`).
  if (h.endsWith('.')) {
    h = h.slice(0, -1);
  }
  return h;
}

/**
 * Extract subdomain from `<sub>.opendesign.holalumina.com`. Returns null if
 * the host does not match the expected suffix.
 *
 * NOTE: this returns the literal substring before the suffix without further
 * validation — caller MUST run regex + reserved checks on the result.
 */
function extractSubdomain(host: string): string | null {
  if (!host.endsWith(PLATFORM_DOMAIN_SUFFIX)) return null;
  const sub = host.slice(0, host.length - PLATFORM_DOMAIN_SUFFIX.length);
  if (sub.length === 0) return null;
  return sub;
}

function readSessionCookie(req: IncomingMessage): string | null {
  const cookie = req.headers['cookie'];
  if (typeof cookie !== 'string' || cookie.length === 0) return null;
  // Naive parse — split on `; ` then `=`. No need for full RFC 6265 here:
  // Clerk sets exactly `__session=<jwt>` and the JWT is base64url+dots only.
  const parts = cookie.split(';');
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (name !== '__session') continue;
    const value = part.slice(eq + 1).trim();
    if (value.length === 0) return null;
    return value;
  }
  return null;
}

function respondNotFound(res: ServerResponse): void {
  res.statusCode = 404;
  res.setHeader('content-type', PLAINTEXT_CONTENT_TYPE);
  res.setHeader('content-length', String(NOT_FOUND_BYTES));
  res.end(NOT_FOUND_BODY);
}

function respondUnauthorized(res: ServerResponse): void {
  res.statusCode = 401;
  res.setHeader('content-type', PLAINTEXT_CONTENT_TYPE);
  res.setHeader('content-length', String(UNAUTHORIZED_BYTES));
  res.end(UNAUTHORIZED_BODY);
}

function respondRedirect(res: ServerResponse, location: string): void {
  res.statusCode = 302;
  res.setHeader('location', location);
  res.setHeader('content-length', '0');
  res.end();
}

// ---------------------------------------------------------------------------
// Audit logging — structured JSON to stdout. Operators consume via the
// daemon's existing log shipper.
// ---------------------------------------------------------------------------

interface ResolutionLogEntry {
  requestId: string;
  host: string;
  subdomain: string | null;
  result: 'ok' | 'redirect' | 'denied';
  stepFailed:
    | 'subdomain_parse'
    | 'reserved_subdomain'
    | 'registry_lookup'
    | 'tenant_disabled'
    | 'no_session'
    | 'jwt_invalid'
    | 'org_mismatch'
    | null;
  statusCode: number;
  tenantResolved?: string;
  userId?: string;
  auditSeverity?: 'high';
  extra?: Record<string, unknown>;
}

function logResolution(entry: ResolutionLogEntry): void {
  const payload: Record<string, unknown> = {
    event: 'tenant_resolution',
    request_id: entry.requestId,
    host: entry.host,
    subdomain: entry.subdomain,
    result: entry.result,
    step_failed: entry.stepFailed,
    status_code: entry.statusCode,
    tenant_resolved: entry.tenantResolved ?? null,
    user_id: entry.userId ?? null,
    timestamp: new Date().toISOString(),
  };
  if (entry.auditSeverity) payload['audit_severity'] = entry.auditSeverity;
  if (entry.extra) Object.assign(payload, entry.extra);
  // eslint-disable-next-line no-console -- structured stdout log line is the audit transport.
  console.log(JSON.stringify(payload));
}
