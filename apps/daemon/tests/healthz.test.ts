/**
 * Spec 101 T044 — `/healthz` operational endpoint tests (RED before implementation).
 *
 * Contract:
 *   - GET /healthz with NO auth, NO tenant resolution, NO Clerk session.
 *   - 200 + { status: 'ok', checks: { registry: 'ok', lumina: 'ok', vercel: 'ok' } }
 *     when all three subchecks succeed.
 *   - 503 + { status: 'degraded', checks: { ... per-check status } } when any
 *     subcheck fails (registry empty, lumina unreachable, vercel non-200).
 *
 * The handler is built as a pure factory so tests can inject:
 *   - a registry-size probe (no real YAML I/O),
 *   - a `fetch`-shaped function (no real network).
 */
import { describe, expect, test } from 'vitest';
import type { Request, Response } from 'express';

import { createHealthzHandler, type HealthzDeps } from '../src/healthz.js';

// ---------------------------------------------------------------------------
// Test harness — fake Express req/res capturing status + JSON body.
// ---------------------------------------------------------------------------

interface CapturedJson {
  status: number;
  body: unknown;
}

function makeRes(): { res: Response; captured: CapturedJson } {
  const captured: CapturedJson = { status: 0, body: undefined };
  interface FakeRes {
    statusCode: number;
    status(code: number): FakeRes;
    json(payload: unknown): FakeRes;
  }
  const fake: FakeRes = {
    statusCode: 200,
    status(code: number) {
      this.statusCode = code;
      captured.status = code;
      return this;
    },
    json(payload: unknown) {
      // Express defaults statusCode to 200 if .status() was never called.
      if (captured.status === 0) captured.status = this.statusCode ?? 200;
      captured.body = payload;
      return this;
    },
  };
  return { res: fake as unknown as Response, captured };
}

function makeReq(): Request {
  return { headers: {}, url: '/healthz', method: 'GET' } as unknown as Request;
}

// ---------------------------------------------------------------------------
// Mock helpers.
// ---------------------------------------------------------------------------

function mockOkResponse(status = 200): Response {
  // Mimics the `Response` shape we use (`.ok`, `.status`).
  return { ok: status >= 200 && status < 300, status } as unknown as Response;
}

function buildDeps(overrides: Partial<HealthzDeps> = {}): HealthzDeps {
  return {
    getRegistrySize: () => 1,
    luminaGatewayUrl: 'https://lumina.example/test',
    vercelApiToken: 'test-token',
    timeoutMs: 50,
    fetcher: (async () =>
      mockOkResponse(200) as unknown as globalThis.Response) as typeof fetch,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests.
// ---------------------------------------------------------------------------

describe('GET /healthz — happy path', () => {
  test('returns 200 with status=ok when registry, lumina, and vercel all succeed', async () => {
    const calls: string[] = [];
    const handler = createHealthzHandler(
      buildDeps({
        fetcher: (async (input: string | URL | Request) => {
          calls.push(String(input));
          return mockOkResponse(200) as unknown as globalThis.Response;
        }) as typeof fetch,
      }),
    );
    const { res, captured } = makeRes();
    await handler(makeReq(), res);
    expect(captured.status).toBe(200);
    expect(captured.body).toEqual({
      status: 'ok',
      checks: { registry: 'ok', lumina: 'ok', vercel: 'ok' },
    });
    // Both upstream URLs were probed.
    expect(calls).toContain('https://lumina.example/test');
    expect(calls).toContain('https://api.vercel.com/v2/user');
  });

  test('sends Authorization: Bearer <token> on the Vercel probe', async () => {
    const seen: Array<{ url: string; init: RequestInit | undefined }> = [];
    const handler = createHealthzHandler(
      buildDeps({
        fetcher: (async (input: string | URL | Request, init?: RequestInit) => {
          seen.push({ url: String(input), init });
          return mockOkResponse(200) as unknown as globalThis.Response;
        }) as typeof fetch,
      }),
    );
    await handler(makeReq(), makeRes().res);
    const vercelCall = seen.find((c) => c.url === 'https://api.vercel.com/v2/user');
    expect(vercelCall).toBeDefined();
    const headers = vercelCall?.init?.headers as Record<string, string> | undefined;
    expect(headers?.['Authorization']).toBe('Bearer test-token');
  });
});

describe('GET /healthz — degraded paths', () => {
  test('returns 503 + registry=empty when registry is empty', async () => {
    const handler = createHealthzHandler(
      buildDeps({ getRegistrySize: () => 0 }),
    );
    const { res, captured } = makeRes();
    await handler(makeReq(), res);
    expect(captured.status).toBe(503);
    const body = captured.body as { status: string; checks: Record<string, string> };
    expect(body.status).toBe('degraded');
    expect(body.checks.registry).toBe('empty');
    // The other subchecks still report what happened.
    expect(body.checks.lumina).toBeDefined();
    expect(body.checks.vercel).toBeDefined();
  });

  test('returns 503 + lumina=unreachable when Lumina probe rejects', async () => {
    const handler = createHealthzHandler(
      buildDeps({
        fetcher: (async (input: string | URL | Request) => {
          if (String(input) === 'https://lumina.example/test') {
            throw new Error('network timeout');
          }
          return mockOkResponse(200) as unknown as globalThis.Response;
        }) as typeof fetch,
      }),
    );
    const { res, captured } = makeRes();
    await handler(makeReq(), res);
    expect(captured.status).toBe(503);
    const body = captured.body as { status: string; checks: Record<string, string> };
    expect(body.status).toBe('degraded');
    expect(body.checks.registry).toBe('ok');
    expect(body.checks.lumina).toBe('unreachable');
    expect(body.checks.vercel).toBe('ok');
  });

  test('returns 503 + lumina=unreachable when Lumina returns a 5xx', async () => {
    const handler = createHealthzHandler(
      buildDeps({
        fetcher: (async (input: string | URL | Request) => {
          if (String(input) === 'https://lumina.example/test') {
            return mockOkResponse(503) as unknown as globalThis.Response;
          }
          return mockOkResponse(200) as unknown as globalThis.Response;
        }) as typeof fetch,
      }),
    );
    const { res, captured } = makeRes();
    await handler(makeReq(), res);
    expect(captured.status).toBe(503);
    const body = captured.body as { status: string; checks: Record<string, string> };
    expect(body.checks.lumina).toBe('unreachable');
  });

  test('returns 503 + vercel=unreachable when Vercel probe rejects', async () => {
    const handler = createHealthzHandler(
      buildDeps({
        fetcher: (async (input: string | URL | Request) => {
          if (String(input) === 'https://api.vercel.com/v2/user') {
            throw new Error('connect ECONNREFUSED');
          }
          return mockOkResponse(200) as unknown as globalThis.Response;
        }) as typeof fetch,
      }),
    );
    const { res, captured } = makeRes();
    await handler(makeReq(), res);
    expect(captured.status).toBe(503);
    const body = captured.body as { status: string; checks: Record<string, string> };
    expect(body.checks.registry).toBe('ok');
    expect(body.checks.lumina).toBe('ok');
    expect(body.checks.vercel).toBe('unreachable');
  });

  test('returns 503 + vercel=unreachable when Vercel returns 401 (token rejected)', async () => {
    const handler = createHealthzHandler(
      buildDeps({
        fetcher: (async (input: string | URL | Request) => {
          if (String(input) === 'https://api.vercel.com/v2/user') {
            return mockOkResponse(401) as unknown as globalThis.Response;
          }
          return mockOkResponse(200) as unknown as globalThis.Response;
        }) as typeof fetch,
      }),
    );
    const { res, captured } = makeRes();
    await handler(makeReq(), res);
    expect(captured.status).toBe(503);
    const body = captured.body as { status: string; checks: Record<string, string> };
    expect(body.checks.vercel).toBe('unreachable');
  });

  test('aggregates: when ALL three checks fail, body lists all three failures', async () => {
    const handler = createHealthzHandler(
      buildDeps({
        getRegistrySize: () => 0,
        fetcher: (async () => {
          throw new Error('all-down');
        }) as typeof fetch,
      }),
    );
    const { res, captured } = makeRes();
    await handler(makeReq(), res);
    expect(captured.status).toBe(503);
    const body = captured.body as { status: string; checks: Record<string, string> };
    expect(body.status).toBe('degraded');
    expect(body.checks.registry).toBe('empty');
    expect(body.checks.lumina).toBe('unreachable');
    expect(body.checks.vercel).toBe('unreachable');
  });
});

describe('GET /healthz — config errors are reported as degraded (not crashes)', () => {
  test('missing LUMINA_GATEWAY_URL → lumina=unconfigured + 503', async () => {
    const handler = createHealthzHandler(
      buildDeps({ luminaGatewayUrl: '' }),
    );
    const { res, captured } = makeRes();
    await handler(makeReq(), res);
    expect(captured.status).toBe(503);
    const body = captured.body as { status: string; checks: Record<string, string> };
    expect(body.checks.lumina).toBe('unconfigured');
  });

  test('missing VERCEL_API_TOKEN → vercel=unconfigured + 503', async () => {
    const handler = createHealthzHandler(
      buildDeps({ vercelApiToken: '' }),
    );
    const { res, captured } = makeRes();
    await handler(makeReq(), res);
    expect(captured.status).toBe(503);
    const body = captured.body as { status: string; checks: Record<string, string> };
    expect(body.checks.vercel).toBe('unconfigured');
  });
});
