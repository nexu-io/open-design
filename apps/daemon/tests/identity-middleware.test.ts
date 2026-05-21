import { describe, expect, it, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { createIdentityMiddleware } from '../src/identity/middleware.js';

function fakeReq(): Request {
  return { headers: {}, socket: { remoteAddress: '127.0.0.1' } } as unknown as Request;
}

const fakeRes = {} as Response;

describe('createIdentityMiddleware', () => {
  it('attaches the resolved identity to req.identity and calls next', () => {
    const middleware = createIdentityMiddleware({});
    const req = fakeReq();
    const next = vi.fn() as unknown as NextFunction;

    middleware(req, fakeRes, next);

    expect(req.identity).toBeDefined();
    expect(req.identity?.id).toBe('local:default');
    expect(req.identity?.source).toBe('local-fallback');
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it('honors the explicit env passed to the factory', () => {
    const middleware = createIdentityMiddleware({ OD_LOCAL_IDENTITY: 'Weston' });
    const req = fakeReq();
    const next = vi.fn() as unknown as NextFunction;

    middleware(req, fakeRes, next);

    expect(req.identity?.displayName).toBe('Weston');
  });

  it('produces a fresh Identity per request (does not share references across calls)', () => {
    const middleware = createIdentityMiddleware({ OD_LOCAL_IDENTITY: 'Tester' });
    const reqA = fakeReq();
    const reqB = fakeReq();
    const next = vi.fn() as unknown as NextFunction;

    middleware(reqA, fakeRes, next);
    middleware(reqB, fakeRes, next);

    expect(reqA.identity).not.toBe(reqB.identity);
    // Both should still have the same logical content
    expect(reqA.identity?.displayName).toBe('Tester');
    expect(reqB.identity?.displayName).toBe('Tester');
  });

  it('does not throw when req has no socket or headers', () => {
    const middleware = createIdentityMiddleware({});
    const minimalReq = {} as unknown as Request;
    const next = vi.fn() as unknown as NextFunction;

    expect(() => middleware(minimalReq, fakeRes, next)).not.toThrow();
    expect(minimalReq.identity).toBeDefined();
    expect(next).toHaveBeenCalledTimes(1);
  });
});
