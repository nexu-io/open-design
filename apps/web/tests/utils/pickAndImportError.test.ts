import { describe, expect, it } from 'vitest';

import { formatPickAndImportErrorDetails } from '../../src/utils/pickAndImportError';

describe('formatPickAndImportErrorDetails', () => {
  it('returns a non-empty string input unchanged', () => {
    expect(formatPickAndImportErrorDetails('disk full')).toBe('disk full');
  });

  it('returns undefined for empty string, null, or unsupported scalar input', () => {
    expect(formatPickAndImportErrorDetails('')).toBeUndefined();
    expect(formatPickAndImportErrorDetails(null)).toBeUndefined();
    expect(formatPickAndImportErrorDetails(42)).toBeUndefined();
  });

  it('surfaces error.message from a structured envelope', () => {
    expect(
      formatPickAndImportErrorDetails({ error: { message: 'permission denied' } }),
    ).toBe('permission denied');
  });

  it('appends nested reason in parentheses when both message and reason are present', () => {
    expect(
      formatPickAndImportErrorDetails({
        error: { message: 'open folder failed', details: { reason: 'not a directory' } },
      }),
    ).toBe('open folder failed (not a directory)');
  });

  it('returns undefined when the envelope has no usable message', () => {
    expect(formatPickAndImportErrorDetails({ error: {} })).toBeUndefined();
    expect(formatPickAndImportErrorDetails({ unrelated: true })).toBeUndefined();
    expect(formatPickAndImportErrorDetails({ error: { message: '' } })).toBeUndefined();
  });
});
