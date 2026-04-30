/**
 * Spec 101 T019 — Dev-mode tenant short-circuit middleware.
 *
 * Wires before the production tenant resolver. When all of:
 *   - `process.env.CLERK_DEV_BYPASS === 'true'`
 *   - `process.env.NODE_ENV !== 'production'`
 *   - request URL has a `?dev_tenant=<id>` query param
 *
 * are true, this middleware skips Clerk JWT verification entirely and runs
 * the rest of the pipeline inside a synthetic tenant context built from the
 * registry entry for `<id>`.
 *
 * Otherwise it calls `next()` without establishing a context — the real
 * resolver (`tenantResolverMiddleware`) takes over.
 *
 * SECURITY INVARIANTS:
 *   - Refuses to activate when `NODE_ENV === 'production'`. Belt-and-suspenders:
 *     server.ts also throws at boot when both `CLERK_DEV_BYPASS=true` and
 *     `NODE_ENV=production` are observed.
 *   - Tenant lookup misses + reserved subdomains return the SAME 404
 *     byte-identical response shape as the real resolver — keeps response
 *     fingerprints consistent so any cross-tenant probe tooling cannot
 *     distinguish dev vs prod.
 *
 * Contract source:
 *   specs/101-open-design-platform/contracts/clerk-jwt.contract.md
 *   (§ Dev-mode short-circuit — NEVER in prod)
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';

import type { RegistryIndex } from './tenants/registry-loader.js';
import { isReserved } from './tenants/reserved-subdomains.js';
import {
  runWithTenantContext,
  type RequestTenantContext,
} from './auth/tenant-context.js';

// ---------------------------------------------------------------------------
// Constants — must match resolver.ts byte-identical 404 shape.
// ---------------------------------------------------------------------------

const NOT_FOUND_BODY = 'Not Found\n';
const NOT_FOUND_BYTES = Buffer.byteLength(NOT_FOUND_BODY, 'utf8');
const PLAINTEXT_CONTENT_TYPE = 'text/plain; charset=utf-8';

export type ExpressLikeMiddleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: (err?: unknown) => void,
) => void;

/**
 * Build the dev bypass middleware bound to a specific registry index.
 *
 * @param registry boot-time loaded tenant registry — never re-read at runtime.
 */
export function devTenantBypassMiddleware(registry: RegistryIndex): ExpressLikeMiddleware {
  return function devTenantBypass(req, res, next): void {
    // Hard fail-closed in production regardless of CLERK_DEV_BYPASS value.
    if (process.env.NODE_ENV === 'production') {
      next();
      return;
    }
    if (process.env.CLERK_DEV_BYPASS !== 'true') {
      next();
      return;
    }

    const devTenantId = readDevTenantQuery(req.url ?? '/');
    if (devTenantId === null) {
      next();
      return;
    }

    // Reserved subdomains are NEVER valid tenants — same response shape as
    // a true tenant miss to avoid leaking which slugs the platform reserves.
    if (isReserved(devTenantId)) {
      respondNotFound(res);
      return;
    }

    const tenant = registry.get(devTenantId);
    if (!tenant || !tenant.open_design || tenant.open_design.enabled !== true) {
      respondNotFound(res);
      return;
    }

    const od = tenant.open_design;
    const ctx: RequestTenantContext = {
      tenant_id: devTenantId,
      clerk_user_id: 'dev-user',
      clerk_session_id: 'dev-session',
      clerk_org_slug: devTenantId,
      design_system: od.design_system,
      wedge_endpoint: od.wedge_endpoint,
      vercel_team: od.vercel_team,
      data_dir: od.data_dir,
      request_id: randomUUID(),
    };

    // eslint-disable-next-line no-console -- structured stdout log line is the audit transport.
    console.log(
      JSON.stringify({
        event: 'tenant_resolution',
        request_id: ctx.request_id,
        host: req.headers['host'] ?? null,
        subdomain: devTenantId,
        result: 'ok',
        step_failed: null,
        status_code: 200,
        tenant_resolved: devTenantId,
        user_id: 'dev-user',
        bypass: 'dev_tenant_query',
        timestamp: new Date().toISOString(),
      }),
    );

    runWithTenantContext(ctx, () => {
      // Sentinel for the composed tenant pipeline (server.ts): tells the
      // wrapper that the bypass produced a tenant context and the resolver
      // should be skipped. Internal contract — not exposed to handlers.
      (req as { __od_bypass_active?: boolean }).__od_bypass_active = true;
      next();
    }).catch((nextErr: unknown) => {
      next(nextErr);
    });
  };
}

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

/**
 * Read `?dev_tenant=<id>` from a request URL. Returns the raw decoded value
 * (no further validation; reserved/registry checks happen in the caller).
 */
function readDevTenantQuery(url: string): string | null {
  const qIndex = url.indexOf('?');
  if (qIndex === -1) return null;
  const qs = url.slice(qIndex + 1);
  if (qs.length === 0) return null;
  // URLSearchParams handles encoding + repeated keys (first wins via .get).
  const params = new URLSearchParams(qs);
  const value = params.get('dev_tenant');
  if (value === null || value.length === 0) return null;
  return value;
}

function respondNotFound(res: ServerResponse): void {
  res.statusCode = 404;
  res.setHeader('content-type', PLAINTEXT_CONTENT_TYPE);
  res.setHeader('content-length', String(NOT_FOUND_BYTES));
  res.end(NOT_FOUND_BODY);
}
