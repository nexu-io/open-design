import { describe, expect, it } from 'vitest';
import { createAuthMiddleware, type AuthMiddlewareOptions } from '../src/auth-middleware.js';
import crypto from 'node:crypto';

function mockReq(overrides: {
  path?: string;
  method?: string;
  remoteAddress?: string;
  authorization?: string;
  apiKey?: string;
  cookie?: string;
  accept?: string;
  url?: string;
} = {}) {
  const headers: Record<string, string> = {};
  if (overrides.authorization) headers.authorization = overrides.authorization;
  if (overrides.apiKey) headers['x-api-key'] = overrides.apiKey;
  if (overrides.cookie) headers.cookie = overrides.cookie;
  if (overrides.accept) headers.accept = overrides.accept;
  return {
    path: overrides.path ?? '/api/projects',
    method: overrides.method ?? 'GET',
    url: overrides.url ?? '/api/projects',
    originalUrl: overrides.url ?? '/api/projects',
    socket: { remoteAddress: overrides.remoteAddress ?? '127.0.0.1' },
    headers,
  } as any;
}

function mockRes() {
  const res: any = { statusCode: 200, body: null, headers: {} as Record<string, string> };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (body: unknown) => { res.body = body; return res; };
  res.redirect = (code: number, url: string) => { res.statusCode = code; res.redirectUrl = url; return res; };
  res.setHeader = (k: string, v: string) => { res.headers[k] = v; return res; };
  return res;
}

function makeHash(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

function defaultOptions(overrides: Partial<AuthMiddlewareOptions> = {}): AuthMiddlewareOptions {
  const base: AuthMiddlewareOptions = {
    enabledRef: { value: true },
    networkExposed: true,
    isLocalPeer: (ip: string) => ip === '127.0.0.1' || ip === '::1',
    resolveHashes: async () => [makeHash('od_testkey123')],
    verifyKey: (candidate: string, hashes: string[]) => hashes.includes(makeHash(candidate)),
    resolveSession: () => false,
    extractSessionCookie: () => null,
  };
  // Merge enabledRef if provided, otherwise keep default
  if ('enabledRef' in overrides) return { ...base, ...overrides };
  if ('enabled' in (overrides as any)) {
    return { ...base, enabledRef: { value: (overrides as any).enabled }, ...overrides };
  }
  return { ...base, ...overrides };
}

describe('auth-middleware', () => {
  it('passes through when disabled and not network-exposed', async () => {
    const middleware = createAuthMiddleware(defaultOptions({ enabledRef: { value: false }, networkExposed: false }));
    const req = mockReq({ remoteAddress: '10.0.0.1' });
    const res = mockRes();
    let called = false;
    await middleware(req, res, () => { called = true; });
    expect(called).toBe(true);
  });

  it('allows public paths without auth', async () => {
    const middleware = createAuthMiddleware(defaultOptions());
    for (const path of ['/api/health', '/login', '/app-icon.svg', '/logo.svg']) {
      const req = mockReq({ path });
      const res = mockRes();
      let called = false;
      await middleware(req, res, () => { called = true; });
      expect(called).toBe(true);
    }
  });

  it('allows OPTIONS requests without auth', async () => {
    const middleware = createAuthMiddleware(defaultOptions());
    const req = mockReq({ method: 'OPTIONS' });
    const res = mockRes();
    let called = false;
    await middleware(req, res, () => { called = true; });
    expect(called).toBe(true);
  });

  it('allows public POST paths without auth', async () => {
    const middleware = createAuthMiddleware(defaultOptions());
    for (const path of ['/api/auth/login', '/api/auth/logout', '/api/auth/reset-keys']) {
      const req = mockReq({ path, method: 'POST' });
      const res = mockRes();
      let called = false;
      await middleware(req, res, () => { called = true; });
      expect(called).toBe(true);
    }
  });

  it('allows MCP OAuth callback without auth', async () => {
    const middleware = createAuthMiddleware(defaultOptions());
    const req = mockReq({ path: '/api/mcp/oauth/callback', method: 'GET' });
    const res = mockRes();
    let called = false;
    await middleware(req, res, () => { called = true; });
    expect(called).toBe(true);
  });

  it('rejects request without auth when enabled', async () => {
    const middleware = createAuthMiddleware(defaultOptions());
    const req = mockReq();
    const res = mockRes();
    await middleware(req, res, () => {});
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('UNAUTHORIZED');
  });

  it('allows request with valid Bearer token', async () => {
    const middleware = createAuthMiddleware(defaultOptions());
    const req = mockReq({ authorization: 'Bearer od_testkey123' });
    const res = mockRes();
    let called = false;
    await middleware(req, res, () => { called = true; });
    expect(called).toBe(true);
  });

  it('allows request with valid X-API-Key header', async () => {
    const middleware = createAuthMiddleware(defaultOptions());
    const req = mockReq({ apiKey: 'od_testkey123' });
    const res = mockRes();
    let called = false;
    await middleware(req, res, () => { called = true; });
    expect(called).toBe(true);
  });

  it('rejects request with invalid Bearer token', async () => {
    const middleware = createAuthMiddleware(defaultOptions());
    const req = mockReq({ authorization: 'Bearer wrong_key' });
    const res = mockRes();
    await middleware(req, res, () => {});
    expect(res.statusCode).toBe(401);
  });

  it('allows request with valid session cookie', async () => {
    let sessionToken = '';
    const middleware = createAuthMiddleware(defaultOptions({
      resolveSession: (token: string) => token === sessionToken,
      extractSessionCookie: (h: string | undefined) => {
        if (!h) return null;
        const prefix = 'od_session=';
        for (const part of h.split(';')) {
          const trimmed = part.trim();
          if (trimmed.startsWith(prefix)) return trimmed.slice(prefix.length);
        }
        return null;
      },
    }));
    sessionToken = 'valid-session-token';
    const req = mockReq({ cookie: 'od_session=valid-session-token' });
    const res = mockRes();
    let called = false;
    await middleware(req, res, () => { called = true; });
    expect(called).toBe(true);
  });

  it('redirects to /login for HTML accept when unauthenticated', async () => {
    const middleware = createAuthMiddleware(defaultOptions());
    const req = mockReq({ accept: 'text/html,application/xhtml+xml' });
    const res = mockRes();
    await middleware(req, res, () => {});
    expect(res.statusCode).toBe(302);
    expect(res.redirectUrl).toContain('/login');
  });

  it('allows localhost when enabled=false but networkExposed=true', async () => {
    const middleware = createAuthMiddleware(defaultOptions({ enabledRef: { value: false }, networkExposed: true }));
    const req = mockReq({ remoteAddress: '127.0.0.1' });
    const res = mockRes();
    let called = false;
    await middleware(req, res, () => { called = true; });
    expect(called).toBe(true);
  });

  it('blocks remote when enabled=false but networkExposed=true', async () => {
    const middleware = createAuthMiddleware(defaultOptions({ enabledRef: { value: false }, networkExposed: true }));
    const req = mockReq({ remoteAddress: '192.168.1.100' });
    const res = mockRes();
    await middleware(req, res, () => {});
    expect(res.statusCode).toBe(401);
  });

  it('reacts to runtime enabledRef changes', async () => {
    const ref = { value: false };
    const middleware = createAuthMiddleware(defaultOptions({ enabledRef: ref, networkExposed: true }));
    // Initially no keys — localhost allowed, remote blocked.
    let called = false;
    await middleware(mockReq({ remoteAddress: '127.0.0.1' }), mockRes(), () => { called = true; });
    expect(called).toBe(true);

    const remoteRes = mockRes();
    await middleware(mockReq({ remoteAddress: '192.168.1.100' }), remoteRes, () => {});
    expect(remoteRes.statusCode).toBe(401);

    // Keys added at runtime — now remote must authenticate.
    ref.value = true;
    const remoteRes2 = mockRes();
    await middleware(mockReq({ remoteAddress: '192.168.1.100' }), remoteRes2, () => {});
    expect(remoteRes2.statusCode).toBe(401);

    const validRes = mockRes();
    let validCalled = false;
    await middleware(mockReq({ remoteAddress: '192.168.1.100', authorization: 'Bearer od_testkey123' }), validRes, () => { validCalled = true; });
    expect(validCalled).toBe(true);
  });
});
