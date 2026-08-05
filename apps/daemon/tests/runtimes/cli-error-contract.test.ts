import { describe, expect, it } from 'vitest';
import {
  RECOVERABLE_EXIT_CODES,
  normalizeRecoverableErrorCode,
  structuredErrorData,
} from '../../src/runtimes/cli-error-contract.js';

describe('CLI structured error contract', () => {
  it('normalizes daemon codes while preserving ordinary string codes', () => {
    expect(normalizeRecoverableErrorCode('DESKTOP_AUTH_PENDING', '')).toBe('desktop-auth-pending');
    expect(normalizeRecoverableErrorCode('FORBIDDEN', 'Desktop import token rejected')).toBe(
      'desktop-import-token-rejected',
    );
    expect(normalizeRecoverableErrorCode('project-not-found', '')).toBe('project-not-found');
    expect(normalizeRecoverableErrorCode(undefined, '')).toBeUndefined();
  });

  it('collects nested data, details, and retryability without mutating the error', () => {
    const error = {
      data: { projectId: 'p1' },
      details: { reason: 'stale' },
      retryable: true,
    };

    expect(structuredErrorData(error)).toEqual({
      projectId: 'p1',
      details: { reason: 'stale' },
      retryable: true,
    });
    expect(error).toEqual({
      data: { projectId: 'p1' },
      details: { reason: 'stale' },
      retryable: true,
    });
  });

  it('omits empty or non-object error data', () => {
    expect(structuredErrorData(null)).toBeUndefined();
    expect(structuredErrorData({ data: null, retryable: 'yes' })).toBeUndefined();
    expect(structuredErrorData({ data: {}, details: undefined, retryable: false })).toEqual({
      retryable: false,
    });
  });

  it('keeps stable recoverable process exit codes', () => {
    expect(RECOVERABLE_EXIT_CODES['daemon-not-running']).toBe(64);
    expect(RECOVERABLE_EXIT_CODES['desktop-import-token-rejected']).toBe(75);
    expect(Object.keys(RECOVERABLE_EXIT_CODES)).toHaveLength(13);
  });
});
