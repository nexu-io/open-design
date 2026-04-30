/**
 * Tenant context (per-request) backed by Node's AsyncLocalStorage.
 *
 * Spec 101 — multi-tenant open-design platform.
 *
 * Constructed by the tenant-resolution middleware after subdomain → registry →
 * Clerk JWT verification succeeds. Read by every downstream handler that
 * touches tenant-scoped resources (Vercel team, data dir, wedge endpoint,
 * design system).
 *
 * Invariants:
 *   - Per-request, in-memory only. Never cached cross-request.
 *   - Snapshot of registry + JWT-derived values. No re-reads later in the
 *     request lifecycle (avoids TOCTOU).
 *   - `getTenantContext()` throws when called outside a `runWithTenantContext`
 *     scope — loud failure is preferred over silent default values that could
 *     leak across tenant boundaries.
 *
 * Contract source:
 *   - specs/101-open-design-platform/data-model.md (RequestTenantContext)
 *   - specs/101-open-design-platform/contracts/tenant-resolution.contract.md
 */

import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request tenant context. Constructed in tenant-resolution middleware,
 * propagated through async handlers via AsyncLocalStorage.
 */
export interface RequestTenantContext {
  /** Tenant id resolved from subdomain, validated against registry + Clerk JWT org claim. */
  tenant_id: string;
  /** UUIDv7 generated per request for log correlation / tracing. */
  request_id: string;
  /** Clerk user id from JWT `sub` claim. */
  clerk_user_id: string;
  /** Clerk session id from JWT `sid` claim. */
  clerk_session_id: string;
  /** Clerk organization slug from JWT `o.slg` claim — MUST equal tenant_id. */
  clerk_org_slug: string;
  /** Design system key — resolves to apps/daemon/src/design-systems/<key>/index.ts. */
  design_system: string;
  /** Per-tenant wedge endpoint URL (HTTPS). Snapshot of registry value. */
  wedge_endpoint: string;
  /** Vercel team slug used for per-tenant deploys. Snapshot of registry value. */
  vercel_team: string;
  /** Per-tenant data directory under daemon host's /data/ root. Snapshot of registry value. */
  data_dir: string;
}

const als = new AsyncLocalStorage<RequestTenantContext>();

/**
 * Read the tenant context for the current async scope.
 *
 * @throws Error("no tenant context active") when called outside a
 *   `runWithTenantContext` scope. Loud failure prevents silent cross-tenant
 *   leaks (e.g., a default tenant id being used when none was set).
 */
export function getTenantContext(): RequestTenantContext {
  const ctx = als.getStore();
  if (ctx === undefined) {
    throw new Error('no tenant context active');
  }
  return ctx;
}

/**
 * Read the tenant context if one is active, otherwise undefined.
 *
 * Use this for code paths that may legitimately run outside a tenant request
 * (boot-time validation, scheduled jobs, CLI tools). Prefer
 * `getTenantContext()` in any request-handler code path.
 */
export function getTenantContextOptional(): RequestTenantContext | undefined {
  return als.getStore();
}

/**
 * Run `fn` inside an async-local-storage scope bound to `ctx`.
 *
 * Resolves to whatever `fn` returns (sync or async). Nested calls are allowed;
 * the innermost scope wins for `getTenantContext()` calls inside it, and the
 * outer scope is restored automatically when the inner scope returns.
 */
export function runWithTenantContext<T>(
  ctx: RequestTenantContext,
  fn: () => Promise<T> | T,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    als.run(ctx, () => {
      try {
        Promise.resolve(fn()).then(resolve, reject);
      } catch (err) {
        reject(err);
      }
    });
  });
}
