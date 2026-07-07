import { describe, expect, it } from 'vitest';
import {
  API_ERROR_CODES,
  createApiError,
  createApiErrorResponse,
  type ApiError,
} from '../src/errors.js';

describe('createApiError', () => {
  it('returns the minimal shape when only code and message are supplied', () => {
    const err = createApiError('NOT_FOUND', 'project missing');
    expect(err).toEqual({ code: 'NOT_FOUND', message: 'project missing' });
  });

  it('carries optional fields (details, retryable, requestId, taskId) through', () => {
    const err = createApiError('RATE_LIMITED', 'slow down', {
      details: { retryAfterMs: 1500 },
      retryable: true,
      requestId: 'req-1',
      taskId: 'task-9',
    });
    expect(err).toEqual({
      code: 'RATE_LIMITED',
      message: 'slow down',
      details: { retryAfterMs: 1500 },
      retryable: true,
      requestId: 'req-1',
      taskId: 'task-9',
    });
  });

  it('does not leak omitted optional fields onto the returned object', () => {
    const err = createApiError('UNAUTHORIZED', 'no token');
    expect(Object.keys(err).sort()).toEqual(['code', 'message']);
  });

  it('accepts every ApiErrorCode the contract exports', () => {
    for (const code of API_ERROR_CODES) {
      const err = createApiError(code, 'x');
      expect(err.code).toBe(code);
    }
  });
});

describe('createApiErrorResponse', () => {
  it('wraps an ApiError in the `{ error }` envelope', () => {
    const err: ApiError = { code: 'BAD_REQUEST', message: 'bad' };
    expect(createApiErrorResponse(err)).toEqual({ error: err });
  });

  it('round-trips through createApiError', () => {
    const resp = createApiErrorResponse(
      createApiError('VALIDATION_FAILED', 'invalid input', {
        details: { kind: 'validation', issues: [{ path: 'name', message: 'required' }] },
      }),
    );
    expect(resp.error.code).toBe('VALIDATION_FAILED');
    expect(resp.error.details).toEqual({
      kind: 'validation',
      issues: [{ path: 'name', message: 'required' }],
    });
  });
});
