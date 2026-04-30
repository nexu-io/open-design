/**
 * Spec 101 T019 — Dev-tenant bypass middleware tests (RED before implementation).
 *
 * Contract source:
 *   specs/101-open-design-platform/contracts/clerk-jwt.contract.md (§ Dev-mode short-circuit)
 *
 * Behaviour matrix:
 *   (a) CLERK_DEV_BYPASS=true + NODE_ENV=development + ?dev_tenant=ericedmeades →
 *       runs `next()` inside a tenant context populated from the registry entry,
 *       with synthetic Clerk claims.
 *   (b) Same env, no ?dev_tenant query param → defers to the next middleware
 *       (calls next() WITHOUT establishing a tenant context).
 *   (c) Same env, ?dev_tenant=nonexistent (not in registry) → 404 byte-identical.
 *   (d) Same env, ?dev_tenant=api (reserved subdomain) → 404 byte-identical.
 *   (e) NODE_ENV=production overrides bypass → defers regardless of CLERK_DEV_BYPASS.
 *   (f) CLERK_DEV_BYPASS unset/false → defers without establishing context.
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { devTenantBypassMiddleware } from '../src/dev-tenant-bypass.js';
import type { RegistryIndex, TenantConfig } from '../src/tenants/registry-loader.js';
import { getTenantContext } from '../src/auth/tenant-context.js';

// ---------------------------------------------------------------------------
// Test harness — mirrors apps/daemon/tests/tenants/resolver.test.ts shape.
// ---------------------------------------------------------------------------

interface FakeReq {
  headers: Record<string, string | undefined>;
  url: string;
  method: string;
}

interface CapturedResponse {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
  ended: boolean;
}

function makeReq(opts: { url?: string }): FakeReq {
  return {
    headers: { host: 'ericedmeades.opendesign.holalumina.com' },
    url: opts.url ?? '/api/projects',
    method: 'GET',
  };
}

function makeRes(): { res: Partial<ServerResponse>; captured: CapturedResponse } {
  const captured: CapturedResponse = {
    status: 0,
    headers: {},
    body: Buffer.alloc(0),
    ended: false,
  };
  const res: Partial<ServerResponse> = {
    statusCode: 200,
    setHeader(name: string, value: string | number | readonly string[]) {
      captured.headers[name.toLowerCase()] = String(value);
      return this as unknown as ServerResponse;
    },
    getHeader(name: string) {
      return captured.headers[name.toLowerCase()];
    },
    end(chunk?: unknown) {
      captured.status = (this as unknown as ServerResponse).statusCode;
      if (chunk instanceof Buffer) captured.body = chunk;
      else if (typeof chunk === 'string') captured.body = Buffer.from(chunk, 'utf8');
      else if (chunk == null) captured.body = Buffer.alloc(0);
      else captured.body = Buffer.from(String(chunk), 'utf8');
      captured.ended = true;
      return this as unknown as ServerResponse;
    },
  };
  return { res, captured };
}

function buildRegistry(): RegistryIndex {
  const reg = new Map<string, TenantConfig>();
  reg.set('ericedmeades', {
    customer_id: 'ericedmeades',
    open_design: {
      enabled: true,
      wedge_endpoint: 'https://ericedmeades.holalumina.com/api/open-design/lead-handoff',
      design_system: 'ericedmeades',
      vercel_team: 'ceremonia-89dd9b81',
      data_dir: '/data/ericedmeades',
    },
  });
  reg.set('ceremonia', {
    customer_id: 'ceremonia',
    open_design: {
      enabled: true,
      wedge_endpoint: 'https://ceremonia.holalumina.com/api/open-design/lead-handoff',
      design_system: 'ceremonia',
      vercel_team: 'ceremonia-89dd9b81',
      data_dir: '/data/ceremonia',
    },
  });
  return reg;
}

interface InvokeResult {
  captured: CapturedResponse;
  nextCalled: boolean;
  ctxInsideNext: ReturnType<typeof getTenantContext> | undefined;
}

async function invoke(opts: { url?: string }): Promise<InvokeResult> {
  const middleware = devTenantBypassMiddleware(buildRegistry());
  const req = makeReq({ ...(opts.url !== undefined ? { url: opts.url } : {}) });
  const { res, captured } = makeRes();

  let nextCalled = false;
  let ctxInsideNext: ReturnType<typeof getTenantContext> | undefined;

  await new Promise<void>((resolve) => {
    const done = () => resolve();
    const next = () => {
      nextCalled = true;
      try {
        ctxInsideNext = getTenantContext();
      } catch {
        ctxInsideNext = undefined;
      }
      done();
    };
    const originalEnd = res.end!.bind(res);
    res.end = ((chunk?: unknown) => {
      const out = originalEnd(chunk);
      done();
      return out;
    }) as ServerResponse['end'];

    middleware(
      req as unknown as IncomingMessage,
      res as unknown as ServerResponse,
      next as (err?: unknown) => void,
    );
  });

  return { captured, nextCalled, ctxInsideNext };
}

// ---------------------------------------------------------------------------
// Env management.
// ---------------------------------------------------------------------------

const ENV_KEYS = ['CLERK_DEV_BYPASS', 'NODE_ENV'] as const;
type EnvKey = (typeof ENV_KEYS)[number];
let originalEnv: Record<EnvKey, string | undefined>;

beforeEach(() => {
  originalEnv = {} as Record<EnvKey, string | undefined>;
  for (const k of ENV_KEYS) originalEnv[k] = process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (originalEnv[k] === undefined) delete process.env[k];
    else process.env[k] = originalEnv[k];
  }
});

// ---------------------------------------------------------------------------
// Behaviour matrix.
// ---------------------------------------------------------------------------

describe('devTenantBypassMiddleware', () => {
  test('(a) bypass active + ?dev_tenant=ericedmeades → ctx populated, next() called', async () => {
    process.env.CLERK_DEV_BYPASS = 'true';
    process.env.NODE_ENV = 'development';

    const result = await invoke({ url: '/api/projects?dev_tenant=ericedmeades' });

    expect(result.nextCalled).toBe(true);
    expect(result.captured.ended).toBe(false);
    expect(result.ctxInsideNext).toBeDefined();
    expect(result.ctxInsideNext?.tenant_id).toBe('ericedmeades');
    expect(result.ctxInsideNext?.clerk_user_id).toBe('dev-user');
    expect(result.ctxInsideNext?.clerk_session_id).toBe('dev-session');
    expect(result.ctxInsideNext?.clerk_org_slug).toBe('ericedmeades');
    expect(result.ctxInsideNext?.design_system).toBe('ericedmeades');
    expect(result.ctxInsideNext?.wedge_endpoint).toBe(
      'https://ericedmeades.holalumina.com/api/open-design/lead-handoff',
    );
    expect(result.ctxInsideNext?.vercel_team).toBe('ceremonia-89dd9b81');
    expect(result.ctxInsideNext?.data_dir).toBe('/data/ericedmeades');
    expect(typeof result.ctxInsideNext?.request_id).toBe('string');
    expect(result.ctxInsideNext?.request_id.length).toBeGreaterThan(0);
  });

  test('(b) bypass active but no ?dev_tenant → defers (next without ctx)', async () => {
    process.env.CLERK_DEV_BYPASS = 'true';
    process.env.NODE_ENV = 'development';

    const result = await invoke({ url: '/api/projects' });

    expect(result.nextCalled).toBe(true);
    expect(result.captured.ended).toBe(false);
    expect(result.ctxInsideNext).toBeUndefined();
  });

  test('(c) bypass active + ?dev_tenant=nonexistent → 404 byte-identical', async () => {
    process.env.CLERK_DEV_BYPASS = 'true';
    process.env.NODE_ENV = 'development';

    const result = await invoke({ url: '/api/projects?dev_tenant=nonexistent' });

    expect(result.nextCalled).toBe(false);
    expect(result.captured.status).toBe(404);
    expect(result.captured.body.toString('utf8')).toBe('Not Found\n');
    expect(result.captured.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(result.captured.headers['content-length']).toBe('10');
  });

  test('(d) bypass active + ?dev_tenant=api (reserved) → 404 byte-identical', async () => {
    process.env.CLERK_DEV_BYPASS = 'true';
    process.env.NODE_ENV = 'development';

    const result = await invoke({ url: '/api/projects?dev_tenant=api' });

    expect(result.nextCalled).toBe(false);
    expect(result.captured.status).toBe(404);
    expect(result.captured.body.toString('utf8')).toBe('Not Found\n');
    expect(result.captured.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(result.captured.headers['content-length']).toBe('10');
  });

  test('(e) NODE_ENV=production → bypass refuses to activate, defers', async () => {
    process.env.CLERK_DEV_BYPASS = 'true';
    process.env.NODE_ENV = 'production';

    const result = await invoke({ url: '/api/projects?dev_tenant=ericedmeades' });

    // Defers: next() invoked, no ctx, no 404. Resolver downstream will handle.
    expect(result.nextCalled).toBe(true);
    expect(result.captured.ended).toBe(false);
    expect(result.ctxInsideNext).toBeUndefined();
  });

  test('(f) CLERK_DEV_BYPASS unset → defers regardless of ?dev_tenant', async () => {
    delete process.env.CLERK_DEV_BYPASS;
    process.env.NODE_ENV = 'development';

    const result = await invoke({ url: '/api/projects?dev_tenant=ericedmeades' });

    expect(result.nextCalled).toBe(true);
    expect(result.captured.ended).toBe(false);
    expect(result.ctxInsideNext).toBeUndefined();
  });
});
