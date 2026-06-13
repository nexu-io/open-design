import { describe, expect, it } from 'vitest';

import { API_ERROR_CODES, type ApiErrorCode } from '../src/errors';

describe('shared API error codes', () => {
  it('exposes AGENT_RUNTIME_DEF_INVALID for runtime-def validation failures', () => {
    // Chat-run startup emits this code through the shared SSE/status error
    // envelopes when a checked-in runtime def is invalid. Keeping the
    // assertion in the contracts package ensures contract-only refactors
    // cannot drop the literal without this package's own test lane failing.
    expect(API_ERROR_CODES).toContain('AGENT_RUNTIME_DEF_INVALID');
  });

  it('keeps AGENT_RUNTIME_DEF_INVALID assignable to ApiErrorCode', () => {
    const code: ApiErrorCode = 'AGENT_RUNTIME_DEF_INVALID';
    expect(code).toBe('AGENT_RUNTIME_DEF_INVALID');
  });
});
