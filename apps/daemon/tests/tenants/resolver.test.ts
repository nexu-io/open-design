/**
 * T016 — Tenant resolver middleware tests (RED before T017).
 *
 * Spec 101 contract:
 *   - specs/101-open-design-platform/contracts/tenant-resolution.contract.md
 *   - specs/101-open-design-platform/data-model.md (RequestTenantContext)
 *
 * THE 12-CASE MATRIX (drives the security boundary for the entire platform):
 *
 *   (1)  healthy — Host valid, JWT valid, o.slg matches subdomain → 200, ctx populated.
 *   (2)  reserved subdomain (api.opendesign...) → 404 byte-identical.
 *   (3)  regex mismatch (multi-dot or invalid chars) → 404 byte-identical.
 *   (4)  tenant not in registry → 404 byte-identical.
 *   (5)  tenant.open_design.enabled=false → 404 byte-identical.
 *   (6)  no __session cookie → 302 to Clerk sign-in with return URL preserved.
 *   (7)  JWT invalid signature → 401.
 *   (8)  JWT expired → 401.
 *   (9)  JWT missing org → 401.
 *   (10) CRITICAL: JWT valid for ceremonia, Host=ericedmeades.* → 404 byte-identical
 *                 (cross-tenant attempt — MUST be indistinguishable from (4)).
 *   (11) multi-level subdomain (a.b.opendesign.holalumina.com) → 404 byte-identical.
 *   (12) Host normalization (uppercase, trailing dot, port) → resolves consistently.
 *
 * Cases (2)+(3)+(4)+(5)+(10)+(11) MUST produce byte-identical 404 bodies, statuses,
 * and Content-Type/Content-Length headers — no information leak via response shape.
 */
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  tenantResolverMiddleware,
} from '../../src/tenants/resolver.js';
import type { RegistryIndex, TenantConfig } from '../../src/tenants/registry-loader.js';
import {
  DEFAULT_TEST_ISSUER,
  generateTestKeyPair,
  signTestToken,
  type TestKeyPair,
} from '../auth/mock-clerk-jwks.js';
import { getTenantContext } from '../../src/auth/tenant-context.js';

// ---------------------------------------------------------------------------
// Test harness — fake req/res that match the Express-style middleware shape.
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

function makeReq(opts: { host: string; cookie?: string; url?: string }): FakeReq {
  return {
    headers: {
      host: opts.host,
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
    },
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
    writeHead(status: number, ...rest: unknown[]) {
      (this as unknown as ServerResponse).statusCode = status;
      // Pull headers out of either signature (statusMessage, headers) | (headers).
      const maybeHeaders = rest.find(
        (arg) => arg !== null && typeof arg === 'object' && !Array.isArray(arg),
      ) as Record<string, string> | undefined;
      if (maybeHeaders) {
        for (const [k, v] of Object.entries(maybeHeaders)) {
          captured.headers[k.toLowerCase()] = String(v);
        }
      }
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
  reg.set('disabled-tenant', {
    customer_id: 'disabled-tenant',
    open_design: {
      enabled: false,
      wedge_endpoint: 'https://disabled-tenant.holalumina.com/api/open-design/lead-handoff',
      design_system: 'ericedmeades',
      vercel_team: 'ceremonia-89dd9b81',
      data_dir: '/data/disabled-tenant',
    },
  });
  return reg;
}

// ---------------------------------------------------------------------------
// Test setup — env + key material.
// ---------------------------------------------------------------------------

const ENV_KEYS = ['CLERK_FRONTEND_API', 'AUTHORIZED_PARTIES', 'CLERK_JWT_KEY'] as const;
type EnvKey = (typeof ENV_KEYS)[number];
let originalEnv: Record<EnvKey, string | undefined>;
let primaryKey: TestKeyPair;
let foreignKey: TestKeyPair;

function snapshotEnv(): Record<EnvKey, string | undefined> {
  const snap = {} as Record<EnvKey, string | undefined>;
  for (const k of ENV_KEYS) snap[k] = process.env[k];
  return snap;
}

function restoreEnv(snap: Record<EnvKey, string | undefined>): void {
  for (const k of ENV_KEYS) {
    if (snap[k] === undefined) delete process.env[k];
    else process.env[k] = snap[k];
  }
}

function setEnvForPrimaryKey(): void {
  process.env.CLERK_FRONTEND_API = DEFAULT_TEST_ISSUER;
  process.env.AUTHORIZED_PARTIES = 'https://app.holalumina.com';
  process.env.CLERK_JWT_KEY = primaryKey.publicKeyPem;
}

function buildClaims(orgSlug: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sub: 'user_2RfWKJREkjKbHZy0Wqa5qrHeAnb',
    sid: 'sess_2Ro7e2IxrffdqBboq8KfB6eGbIy',
    o: { id: 'org_2T0bBcDeFgHiJkLmNoPqRsTuVwX', slg: orgSlug, rol: 'admin' },
    azp: 'https://app.holalumina.com',
    ...overrides,
  };
}

beforeAll(async () => {
  originalEnv = snapshotEnv();
  primaryKey = await generateTestKeyPair('test-kid-primary');
  foreignKey = await generateTestKeyPair('test-kid-foreign');
});

afterEach(() => {
  restoreEnv(originalEnv);
});

// ---------------------------------------------------------------------------
// Helper — invoke the middleware end-to-end and capture next() vs response.
// ---------------------------------------------------------------------------

interface MiddlewareInvocation {
  captured: CapturedResponse;
  nextCalled: boolean;
  nextErr: unknown | undefined;
  ctxInsideNext: ReturnType<typeof getTenantContext> | undefined;
}

async function invoke(opts: {
  host: string;
  cookie?: string;
  url?: string;
  registry?: RegistryIndex;
}): Promise<MiddlewareInvocation> {
  const reg = opts.registry ?? buildRegistry();
  const middleware = tenantResolverMiddleware({ registry: reg });
  const req = makeReq({
    host: opts.host,
    ...(opts.cookie !== undefined ? { cookie: opts.cookie } : {}),
    ...(opts.url !== undefined ? { url: opts.url } : {}),
  });
  const { res, captured } = makeRes();

  let nextCalled = false;
  let nextErr: unknown | undefined;
  let ctxInsideNext: ReturnType<typeof getTenantContext> | undefined;

  await new Promise<void>((resolve) => {
    const done = () => resolve();
    const next = (err?: unknown) => {
      nextCalled = true;
      if (err !== undefined) nextErr = err;
      try {
        ctxInsideNext = getTenantContext();
      } catch {
        ctxInsideNext = undefined;
      }
      done();
    };
    // The middleware should either call next() or call res.end(). Either path
    // ends our awaited promise. Poll for `captured.ended` via a microtask hook
    // by overriding `end` to also resolve.
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

  return { captured, nextCalled, nextErr, ctxInsideNext };
}

// ---------------------------------------------------------------------------
// 12-case matrix
// ---------------------------------------------------------------------------

describe('tenantResolverMiddleware', () => {
  test('(1) healthy: valid Host + valid JWT (o.slg=ericedmeades) → 200 + ctx populated', async () => {
    setEnvForPrimaryKey();
    const token = await signTestToken(buildClaims('ericedmeades'), { keyPair: primaryKey });

    const result = await invoke({
      host: 'ericedmeades.opendesign.holalumina.com',
      cookie: `__session=${token}`,
    });

    expect(result.nextCalled).toBe(true);
    expect(result.nextErr).toBeUndefined();
    expect(result.captured.ended).toBe(false);
    expect(result.ctxInsideNext).toBeDefined();
    expect(result.ctxInsideNext?.tenant_id).toBe('ericedmeades');
    expect(result.ctxInsideNext?.clerk_user_id).toBe('user_2RfWKJREkjKbHZy0Wqa5qrHeAnb');
    expect(result.ctxInsideNext?.clerk_session_id).toBe('sess_2Ro7e2IxrffdqBboq8KfB6eGbIy');
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

  test('(2) reserved subdomain (api.opendesign...) → 404 byte-identical', async () => {
    setEnvForPrimaryKey();
    const result = await invoke({ host: 'api.opendesign.holalumina.com' });
    expect(result.nextCalled).toBe(false);
    expect(result.captured.status).toBe(404);
    expect(result.captured.body.toString('utf8')).toBe('Not Found\n');
    expect(result.captured.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(result.captured.headers['content-length']).toBe('10');
  });

  test('(3) regex mismatch (invalid chars) → 404 byte-identical', async () => {
    setEnvForPrimaryKey();
    const result = await invoke({ host: 'foo_bar.opendesign.holalumina.com' });
    expect(result.nextCalled).toBe(false);
    expect(result.captured.status).toBe(404);
    expect(result.captured.body.toString('utf8')).toBe('Not Found\n');
    expect(result.captured.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(result.captured.headers['content-length']).toBe('10');
  });

  test('(4) tenant not in registry → 404 byte-identical', async () => {
    setEnvForPrimaryKey();
    const result = await invoke({ host: 'nonexistent.opendesign.holalumina.com' });
    expect(result.nextCalled).toBe(false);
    expect(result.captured.status).toBe(404);
    expect(result.captured.body.toString('utf8')).toBe('Not Found\n');
    expect(result.captured.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(result.captured.headers['content-length']).toBe('10');
  });

  test('(5) tenant disabled → 404 byte-identical', async () => {
    setEnvForPrimaryKey();
    const result = await invoke({ host: 'disabled-tenant.opendesign.holalumina.com' });
    expect(result.nextCalled).toBe(false);
    expect(result.captured.status).toBe(404);
    expect(result.captured.body.toString('utf8')).toBe('Not Found\n');
    expect(result.captured.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(result.captured.headers['content-length']).toBe('10');
  });

  test('(6) no __session cookie → 302 to handshake endpoint with target_url preserved', async () => {
    setEnvForPrimaryKey();
    const result = await invoke({
      host: 'ericedmeades.opendesign.holalumina.com',
      url: '/projects/abc?ref=email',
    });
    expect(result.nextCalled).toBe(false);
    expect(result.captured.status).toBe(302);
    const location = result.captured.headers['location'];
    expect(location).toBeDefined();
    expect(location).toContain('https://app.holalumina.com/api/od-handshake');
    expect(location).toContain(
      encodeURIComponent('https://ericedmeades.opendesign.holalumina.com/projects/abc?ref=email'),
    );
    expect(result.captured.body.length).toBe(0);
  });

  test('(7) JWT invalid signature → 401', async () => {
    setEnvForPrimaryKey();
    const token = await signTestToken(buildClaims('ericedmeades'), { keyPair: foreignKey });

    const result = await invoke({
      host: 'ericedmeades.opendesign.holalumina.com',
      cookie: `__session=${token}`,
    });
    expect(result.nextCalled).toBe(false);
    expect(result.captured.status).toBe(401);
    expect(result.captured.body.toString('utf8')).toBe('Unauthorized\n');
  });

  test('(8) JWT expired → 302 to handshake (re-mint), NOT 401 dead-end', async () => {
    // Cookie outlives Clerk JWT by design (cookie Max-Age=30d, JWT TTL ~5min).
    // Stale JWT inside still-valid cookie is the COMMON case after the user
    // sits idle on the canvas. Bouncing through the handshake endpoint silently
    // mints a fresh JWT off the user's primary-host Clerk session instead of
    // dead-ending the user at 401 with no auto-recovery.
    setEnvForPrimaryKey();
    const nowSeconds = Math.floor(Date.now() / 1000);
    const token = await signTestToken(buildClaims('ericedmeades'), {
      keyPair: primaryKey,
      iat: nowSeconds - 600,
      exp: nowSeconds - 540,
      nbf: nowSeconds - 605,
    });

    const result = await invoke({
      host: 'ericedmeades.opendesign.holalumina.com',
      url: '/projects/xyz',
      cookie: `__session=${token}`,
    });
    expect(result.nextCalled).toBe(false);
    expect(result.captured.status).toBe(302);
    const location = result.captured.headers['location'];
    expect(location).toBeDefined();
    expect(location).toContain('https://app.holalumina.com/api/od-handshake');
    expect(location).toContain(
      encodeURIComponent('https://ericedmeades.opendesign.holalumina.com/projects/xyz'),
    );
    expect(result.captured.body.length).toBe(0);
  });

  test('(9) JWT missing org → 401', async () => {
    setEnvForPrimaryKey();
    const claims = buildClaims('ericedmeades', { o: undefined });
    const token = await signTestToken(claims, { keyPair: primaryKey });

    const result = await invoke({
      host: 'ericedmeades.opendesign.holalumina.com',
      cookie: `__session=${token}`,
    });
    expect(result.nextCalled).toBe(false);
    expect(result.captured.status).toBe(401);
    expect(result.captured.body.toString('utf8')).toBe('Unauthorized\n');
  });

  test('(10) CRITICAL: JWT o.slg=ceremonia, Host=ericedmeades → 404 byte-identical (cross-tenant)', async () => {
    setEnvForPrimaryKey();
    // Attacker has a valid Clerk session for tenant "ceremonia" — try to use it on Eric's subdomain.
    const token = await signTestToken(buildClaims('ceremonia'), { keyPair: primaryKey });

    const result = await invoke({
      host: 'ericedmeades.opendesign.holalumina.com',
      cookie: `__session=${token}`,
    });
    expect(result.nextCalled).toBe(false);
    expect(result.captured.status).toBe(404);
    expect(result.captured.body.toString('utf8')).toBe('Not Found\n');
    expect(result.captured.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(result.captured.headers['content-length']).toBe('10');
  });

  test('(11) multi-level subdomain → 404 byte-identical', async () => {
    setEnvForPrimaryKey();
    const result = await invoke({ host: 'a.b.opendesign.holalumina.com' });
    expect(result.nextCalled).toBe(false);
    expect(result.captured.status).toBe(404);
    expect(result.captured.body.toString('utf8')).toBe('Not Found\n');
    expect(result.captured.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(result.captured.headers['content-length']).toBe('10');
  });

  test('(12) Host normalization: uppercase + trailing dot + port → resolves to lowercase tenant', async () => {
    setEnvForPrimaryKey();
    const token = await signTestToken(buildClaims('ericedmeades'), { keyPair: primaryKey });

    const result = await invoke({
      host: 'ERICEDMEADES.OpenDesign.Holalumina.COM.:443',
      cookie: `__session=${token}`,
    });
    expect(result.nextCalled).toBe(true);
    expect(result.nextErr).toBeUndefined();
    expect(result.captured.ended).toBe(false);
    expect(result.ctxInsideNext?.tenant_id).toBe('ericedmeades');
  });

  // -------------------------------------------------------------------------
  // (13) REGRESSION — Bug 8: handshake URL param MUST override stale __session
  // cookie. Clerk sets a __session cookie at the parent domain (.holalumina.com)
  // when the user signs in to app.holalumina.com. That cookie is sent to every
  // subdomain. If the resolver reads the stale cookie first and only consumes
  // __od_handshake when no cookie is present, the user enters an infinite
  // redirect loop: stale cookie → step-7 expired → re-handshake → primary mints
  // fresh JWT → 302 back with __od_handshake=<fresh> → resolver sees stale
  // cookie again → loop. Fix: handshake consume runs BEFORE cookie read.
  // -------------------------------------------------------------------------

  test('(13) REGRESSION: handshake URL param overrides stale __session cookie (no redirect loop)', async () => {
    setEnvForPrimaryKey();
    const nowSeconds = Math.floor(Date.now() / 1000);
    // Stale parent-domain cookie (expired 10 min ago — would normally trigger
    // step-7 expired → re-handshake bounce, causing the loop).
    const staleCookieToken = await signTestToken(buildClaims('ericedmeades'), {
      keyPair: primaryKey,
      iat: nowSeconds - 1200,
      exp: nowSeconds - 600,
      nbf: nowSeconds - 1205,
    });
    // Fresh handshake JWT in URL — should win.
    const handshakeToken = await signTestToken(buildClaims('ericedmeades'), {
      keyPair: primaryKey,
    });

    const result = await invoke({
      host: 'ericedmeades.opendesign.holalumina.com',
      url: `/?__od_handshake=${handshakeToken}`,
      cookie: `__session=${staleCookieToken}`,
    });
    expect(result.nextCalled).toBe(false);
    expect(result.captured.status).toBe(302);
    // Redirect target must be clean URL (handshake param stripped), NOT a
    // bounce back to app.holalumina.com/api/od-handshake (the loop signature).
    const location = result.captured.headers['location'];
    expect(location).toBeDefined();
    expect(location).toBe('https://ericedmeades.opendesign.holalumina.com/');
    expect(location).not.toContain('app.holalumina.com/api/od-handshake');
    // Set-Cookie MUST be present — proves handshake-consume path ran, not the
    // expired-JWT re-handshake path (which never sets a cookie).
    const setCookie = result.captured.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    expect(setCookie).toContain(`__session=${handshakeToken}`);
    expect(setCookie).toContain('Domain=ericedmeades.opendesign.holalumina.com');
    expect(setCookie).toContain('Max-Age=2592000');
  });

  // -------------------------------------------------------------------------
  // Cross-cutting: byte-identical 404 — invariant across all 6 cases.
  // -------------------------------------------------------------------------

  test('byte-identical 404: cases 2, 3, 4, 5, 10, 11 produce byte-identical bodies + headers', async () => {
    setEnvForPrimaryKey();
    const crossTenantToken = await signTestToken(buildClaims('ceremonia'), { keyPair: primaryKey });

    const cases = [
      { label: '(2) reserved', host: 'api.opendesign.holalumina.com' },
      { label: '(3) regex mismatch', host: 'foo_bar.opendesign.holalumina.com' },
      { label: '(4) not in registry', host: 'nonexistent.opendesign.holalumina.com' },
      { label: '(5) disabled', host: 'disabled-tenant.opendesign.holalumina.com' },
      {
        label: '(10) cross-tenant',
        host: 'ericedmeades.opendesign.holalumina.com',
        cookie: `__session=${crossTenantToken}`,
      },
      { label: '(11) multi-level', host: 'a.b.opendesign.holalumina.com' },
    ];

    const results = await Promise.all(
      cases.map((c) =>
        invoke({
          host: c.host,
          ...(c.cookie !== undefined ? { cookie: c.cookie } : {}),
        }),
      ),
    );

    // Every case 404, with byte-identical body, content-type, and content-length.
    const reference = results[0]!.captured;
    for (let i = 0; i < results.length; i++) {
      const r = results[i]!.captured;
      expect(r.status).toBe(404);
      expect(r.body.equals(reference.body)).toBe(true);
      expect(r.headers['content-type']).toBe(reference.headers['content-type']);
      expect(r.headers['content-length']).toBe(reference.headers['content-length']);
    }
  });
});
