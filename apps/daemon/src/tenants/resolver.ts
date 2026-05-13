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
// Cross-domain handshake endpoint on the primary Clerk-auth host. The primary
// mints a short-lived JWT bound to the user's active session and 302s back to
// the satellite subdomain with `?__od_handshake=<jwt>`. The satellite (this
// middleware) consumes the token, sets the `__session` cookie on its own
// subdomain, and 302s to the clean URL. See web/src/app/api/od-handshake/.
const HANDSHAKE_URL = 'https://app.holalumina.com/api/od-handshake';
const HANDSHAKE_PARAM = '__od_handshake';
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

    // 6a. Cross-domain handshake path. The primary auth host (app.holalumina.com)
    // 302s here with `?__od_handshake=<jwt>` after the user has signed in.
    // The JWT is identical in shape to what Clerk would have set as
    // __session, so we run it through the same verifier. On success we set
    // __session as a Set-Cookie scoped to THIS subdomain (not the apex —
    // that would leak the cookie across tenants) and 302 to the same URL
    // with the handshake param stripped so the browser re-enters this
    // middleware on the next hop with a real cookie.
    //
    // CRITICAL: Process handshake BEFORE reading the session cookie. A stale
    // __session cookie may be present from a parent-domain Set-Cookie (Clerk
    // sets __session at .holalumina.com when the user signs in to
    // app.holalumina.com). That stale cookie would otherwise short-circuit
    // the handshake-consume branch, send the user to step 7, fail expired,
    // bounce to handshake → infinite loop. Fresh URL JWT always wins.
    const handshakeToken = readHandshakeToken(req);
    if (handshakeToken) {
      void (async () => {
        let claims;
        try {
          claims = await verifyClerkSession(handshakeToken);
        } catch (err) {
          const kind =
            err instanceof ClerkVerificationError ? err.kind : 'invalid';
          // Bug 9: when the handshake URL JWT is itself expired (Clerk
          // JWT TTL = 300s; network/processing latency + user idle can
          // exceed that between mint at primary and consume at satellite),
          // bounce back to the handshake endpoint to mint a fresh JWT
          // instead of 401. Without this, the cascade Bug 6+7+8 is
          // incomplete: stale-cookie → fresh handshake URL → expired
          // before consume → 401 → infinite reload. Only `expired`
          // triggers 302; other kinds (invalid_signature, malformed)
          // remain 401 since those indicate tampering.
          if (kind === 'expired') {
            logResolution({
              requestId,
              host: rawHost,
              subdomain,
              result: 'redirect',
              stepFailed: 'jwt_invalid',
              statusCode: 302,
              extra: {
                jwt_failure_kind: kind,
                source: 'handshake',
                action: 're_handshake',
              },
            });
            const cleanUrl = stripHandshakeParam(req.url ?? '/');
            const targetUrl = `https://${rawHost}${cleanUrl}`;
            respondRedirect(
              res,
              `${HANDSHAKE_URL}?target_url=${encodeURIComponent(targetUrl)}`,
            );
            return;
          }
          logResolution({
            requestId,
            host: rawHost,
            subdomain,
            result: 'denied',
            stepFailed: 'jwt_invalid',
            statusCode: 401,
            extra: { jwt_failure_kind: kind, source: 'handshake' },
          });
          respondUnauthorized(res);
          return;
        }
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
            extra: { source: 'handshake' },
          });
          respondNotFound(res);
          return;
        }
        const cleanUrl = stripHandshakeParam(req.url ?? '/');
        const cookieDomain = `${subdomain}${PLATFORM_DOMAIN_SUFFIX}`;
        // Cookie TTL = 30 days, matching design-tool industry standard
        // (Figma/Notion/Canva/Adobe). Non-technical users may stay on a
        // design canvas for hours or days across a single project; the
        // cookie must not die mid-session. The cookie is only a transport
        // for the JWT — every request re-verifies the JWT via
        // verifyClerkSession, so an expired JWT inside a long-lived cookie
        // is caught at step 7 and silently re-minted through the
        // handshake (~150ms round-trip). A SHORT cookie (300s, attempted
        // earlier) caused a worse bug: user filling a question form for
        // >5 min lost the cookie entirely, next fetch 302'd cross-origin
        // which browsers cannot follow with credentials → silent "Failed
        // to fetch" mid-session.
        const cookie =
          `__session=${handshakeToken}` +
          `; Domain=${cookieDomain}` +
          `; Path=/` +
          `; Max-Age=2592000` +
          `; Secure` +
          `; HttpOnly` +
          `; SameSite=Lax`;
        res.setHeader('Set-Cookie', cookie);
        logResolution({
          requestId,
          host: rawHost,
          subdomain,
          result: 'redirect',
          stepFailed: null,
          statusCode: 302,
          tenantResolved: claims.o.slg,
          userId: claims.sub,
          extra: { source: 'handshake', action: 'cookie_set' },
        });
        respondRedirect(res, `https://${cookieDomain}${cleanUrl}`);
      })();
      return;
    }

    // 6. Session cookie check.
    const sessionToken = readSessionCookie(req);
    if (!sessionToken) {
      // 6b. No cookie, no handshake → bounce to the primary handshake
      // endpoint. That endpoint reads the user's app.holalumina.com Clerk
      // session, mints a fresh JWT, and 302s back here with the handshake
      // param set. If the user is not signed in to the primary, the
      // handshake endpoint itself 302s to /sign-in first.
      //
      // EXCEPTION: /api/* requests cannot follow cross-origin 302s while
      // carrying cookies (browser fetch CORS). Return 401 instead so the
      // JS layer can surface a refresh prompt rather than silently failing
      // with "TypeError: Failed to fetch".
      const reqPath = req.url ?? '/';
      if (reqPath.startsWith('/api/')) {
        logResolution({
          requestId,
          host: rawHost,
          subdomain,
          result: 'denied',
          stepFailed: 'no_session',
          statusCode: 401,
          extra: { reason: 'api_request_no_session' },
        });
        respondUnauthorized(res);
        return;
      }
      const returnUrl = `https://${subdomain}${PLATFORM_DOMAIN_SUFFIX}${reqPath}`;
      const location = `${HANDSHAKE_URL}?target_url=${encodeURIComponent(returnUrl)}`;
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
        // EXPIRED JWT → bounce through handshake endpoint to mint fresh.
        // Without this, the user dead-ends at 401 once the JWT TTL elapses,
        // even though their primary-host Clerk session is still valid. The
        // handshake re-mint round-trip is fast (~150ms) and silent to the
        // user.
        //
        // EXCEPTION: /api/* requests cannot follow cross-origin 302s while
        // carrying cookies (browser fetch CORS). Return 401 instead so the
        // JS layer can surface a refresh prompt rather than silently failing
        // with "TypeError: Failed to fetch".
        if (kind === 'expired') {
          const reqPath = req.url ?? '/';
          if (reqPath.startsWith('/api/')) {
            logResolution({
              requestId,
              host: rawHost,
              subdomain,
              result: 'denied',
              stepFailed: 'jwt_invalid',
              statusCode: 401,
              extra: { jwt_failure_kind: kind, reason: 'api_request_expired_jwt' },
            });
            respondUnauthorized(res);
            return;
          }
          const returnUrl = `https://${subdomain}${PLATFORM_DOMAIN_SUFFIX}${reqPath}`;
          const location = `${HANDSHAKE_URL}?target_url=${encodeURIComponent(returnUrl)}`;
          logResolution({
            requestId,
            host: rawHost,
            subdomain,
            result: 'redirect',
            stepFailed: 'jwt_invalid',
            statusCode: 302,
            extra: { jwt_failure_kind: kind, action: 're_handshake' },
          });
          respondRedirect(res, location);
          return;
        }
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

/**
 * Read `__od_handshake=<jwt>` from the request's query string. Returns the
 * decoded JWT string, or null if absent / empty.
 */
function readHandshakeToken(req: IncomingMessage): string | null {
  const url = req.url ?? '';
  const queryIdx = url.indexOf('?');
  if (queryIdx === -1) return null;
  const qs = url.slice(queryIdx + 1);
  const prefix = `${HANDSHAKE_PARAM}=`;
  for (const part of qs.split('&')) {
    if (!part.startsWith(prefix)) continue;
    const raw = part.slice(prefix.length);
    if (raw.length === 0) return null;
    try {
      return decodeURIComponent(raw);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Strip the `__od_handshake` param from a URL, preserving every other query
 * pair. Used to redirect the browser to the "clean" target URL after the
 * handshake cookie is set.
 */
function stripHandshakeParam(url: string): string {
  const queryIdx = url.indexOf('?');
  if (queryIdx === -1) return url;
  const path = url.slice(0, queryIdx);
  const qs = url.slice(queryIdx + 1);
  const prefix = `${HANDSHAKE_PARAM}=`;
  const kept = qs.split('&').filter(
    (part) => part.length > 0 && !part.startsWith(prefix),
  );
  if (kept.length === 0) return path;
  return `${path}?${kept.join('&')}`;
}

/**
 * Read the __session cookie value from a request header.
 *
 * Bug 10 fix: browsers may carry MULTIPLE `__session` cookie attributes
 * (a host-only Set-Cookie residue from Clerk satellite SDK or pre-v7 daemon
 * sits in front of the daemon's domain cookie). The host-only one is empty
 * and shadows the real one because cookies are sent in attribute order.
 *
 * Previously this function returned `null` the moment it hit an empty
 * `__session=`, which caused every request to be treated as anonymous and
 * triggered an infinite handshake redirect loop. Now we skip empty values
 * and keep iterating, only returning `null` when no non-empty `__session`
 * is found.
 *
 * Exported for unit testing.
 */
export function readSessionCookie(req: IncomingMessage): string | null {
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
    if (value.length === 0) continue; // Bug 10: skip empty shadow, keep iterating
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
