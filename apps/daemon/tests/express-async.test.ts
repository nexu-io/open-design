import { describe, expect, it, vi } from 'vitest';

import { wrapExpressAsyncHandler } from '../src/express-async.js';

describe('wrapExpressAsyncHandler', () => {
  it('forwards rejected async route handlers to Express next()', async () => {
    const error = new Error('async route failed');
    const next = vi.fn();
    const handler = wrapExpressAsyncHandler(async (_req: unknown, _res: unknown, _next: unknown) => {
      throw error;
    });

    await handler({} as any, {} as any, next);

    expect(next).toHaveBeenCalledWith(error);
  });

  it('does not wrap Express error middleware', () => {
    function errorMiddleware(err: unknown, _req: unknown, _res: unknown, next: (error: unknown) => void) {
      next(err);
    }

    expect(wrapExpressAsyncHandler(errorMiddleware)).toBe(errorMiddleware);
  });
});
