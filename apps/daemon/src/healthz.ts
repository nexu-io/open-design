/**
 * Spec 101 T044 — `/healthz` operational endpoint.
 *
 * THIS ENDPOINT MUST BE WIRED BEFORE THE TENANT RESOLVER MIDDLEWARE.
 *
 * Caddy and external load-balancer healthchecks hit this URL with no Clerk
 * session, no tenant subdomain, and no platform credentials. Any tenant-aware
 * middleware in front of `/healthz` would 404/redirect the probe and the
 * container would be marked unhealthy on every check.
 *
 * Subchecks (run in parallel):
 *   1. Tenant registry: snapshot loaded at boot has at least one tenant.
 *   2. Lumina gateway: HEAD request against `LUMINA_GATEWAY_URL` (≤2s).
 *   3. Vercel API: GET https://api.vercel.com/v2/user with bearer token (≤2s).
 *
 * Response shape:
 *   - 200: { status: 'ok', checks: { registry: 'ok', lumina: 'ok', vercel: 'ok' } }
 *   - 503: { status: 'degraded', checks: { ... per-check status } }
 *
 * Per-check status values:
 *   - 'ok'           — subcheck passed.
 *   - 'empty'        — registry has zero tenants (unique to registry).
 *   - 'unconfigured' — required env var is missing.
 *   - 'unreachable'  — network failure, timeout, or non-2xx HTTP status.
 */

import type { Request, Response } from 'express';

const VERCEL_PROBE_URL = 'https://api.vercel.com/v2/user';
const DEFAULT_TIMEOUT_MS = 2000;

export type CheckStatus = 'ok' | 'empty' | 'unconfigured' | 'unreachable';

export interface HealthzChecks {
  registry: CheckStatus;
  lumina: CheckStatus;
  vercel: CheckStatus;
}

export interface HealthzResponseBody {
  status: 'ok' | 'degraded';
  checks: HealthzChecks;
}

/** Injected dependencies — every external interaction is replaceable in tests. */
export interface HealthzDeps {
  /** Returns the loaded registry's tenant count. Read at boot, not at request time. */
  getRegistrySize: () => number;
  /** Resolved value of `process.env.LUMINA_GATEWAY_URL`. Empty string = unconfigured. */
  luminaGatewayUrl: string;
  /** Resolved value of `process.env.VERCEL_API_TOKEN`. Empty string = unconfigured. */
  vercelApiToken: string;
  /** Per-probe timeout in milliseconds. Defaults to 2000ms when not provided. */
  timeoutMs?: number;
  /** `fetch`-shaped probe. Defaults to global `fetch`. */
  fetcher?: typeof fetch;
}

export type HealthzHandler = (req: Request, res: Response) => Promise<void>;

// ---------------------------------------------------------------------------
// Public factory.
// ---------------------------------------------------------------------------

export function createHealthzHandler(deps: HealthzDeps): HealthzHandler {
  const fetcher = deps.fetcher ?? globalThis.fetch;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return async function healthz(_req: Request, res: Response): Promise<void> {
    const [registry, lumina, vercel] = await Promise.all([
      Promise.resolve(checkRegistry(deps.getRegistrySize)),
      checkLumina(deps.luminaGatewayUrl, fetcher, timeoutMs),
      checkVercel(deps.vercelApiToken, fetcher, timeoutMs),
    ]);

    const checks: HealthzChecks = { registry, lumina, vercel };
    const allOk = registry === 'ok' && lumina === 'ok' && vercel === 'ok';
    const body: HealthzResponseBody = {
      status: allOk ? 'ok' : 'degraded',
      checks,
    };
    res.status(allOk ? 200 : 503).json(body);
  };
}

// ---------------------------------------------------------------------------
// Subchecks — each returns a discrete CheckStatus, never throws.
// ---------------------------------------------------------------------------

function checkRegistry(getSize: () => number): CheckStatus {
  try {
    const size = getSize();
    return size > 0 ? 'ok' : 'empty';
  } catch {
    // Registry probe should be in-memory; treat any throw as empty/degraded.
    return 'empty';
  }
}

async function checkLumina(
  url: string,
  fetcher: typeof fetch,
  timeoutMs: number,
): Promise<CheckStatus> {
  if (!url) return 'unconfigured';
  return probeReachable(url, fetcher, timeoutMs, { method: 'HEAD' });
}

async function checkVercel(
  token: string,
  fetcher: typeof fetch,
  timeoutMs: number,
): Promise<CheckStatus> {
  if (!token) return 'unconfigured';
  return probeReachable(VERCEL_PROBE_URL, fetcher, timeoutMs, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
}

/**
 * Issue a request with an AbortController-backed timeout. Returns 'ok' for any
 * 2xx response; everything else (non-2xx, network error, abort) maps to
 * 'unreachable'. Errors are intentionally swallowed — `/healthz` MUST NOT throw
 * because Express would otherwise emit a 500 + HTML error page that confuses
 * load balancers expecting JSON.
 */
async function probeReachable(
  url: string,
  fetcher: typeof fetch,
  timeoutMs: number,
  init: RequestInit,
): Promise<CheckStatus> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetcher(url, { ...init, signal: controller.signal });
    return res.ok ? 'ok' : 'unreachable';
  } catch {
    return 'unreachable';
  } finally {
    clearTimeout(timer);
  }
}
