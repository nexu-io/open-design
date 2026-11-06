import type { Request } from 'express';
import { createApiError, type ApiError } from '@open-design/contracts';
import type { RouteInputContext } from './types.js';

export function rawInput(req: Request): RouteInputContext {
  return {
    body: req.body,
    query: (req.query ?? {}) as Record<string, unknown>,
    params: (req.params ?? {}) as Record<string, string>,
  };
}

export function validationError(
  message: string,
  issues: Array<{ path: string; message: string }> = [],
): ApiError {
  if (issues.length === 0) {
    return createApiError('BAD_REQUEST', message);
  }
  return createApiError('BAD_REQUEST', message, {
    details: { kind: 'validation', issues } as unknown as NonNullable<ApiError['details']>,
  });
}
