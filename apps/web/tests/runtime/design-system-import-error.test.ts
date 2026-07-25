import { describe, expect, it } from 'vitest';

import { designSystemImportErrorKey } from '../../src/runtime/design-system-import-error';

describe('designSystemImportErrorKey', () => {
  it('maps BAD_REQUEST to the invalid-import key', () => {
    expect(designSystemImportErrorKey({ code: 'BAD_REQUEST' })).toBe(
      'settings.designSystemsImportErrorInvalid',
    );
  });

  it('maps INTERNAL_ERROR to the internal-error key', () => {
    expect(designSystemImportErrorKey({ code: 'INTERNAL_ERROR' })).toBe(
      'settings.designSystemsImportErrorInternal',
    );
  });

  it('returns null for unknown codes', () => {
    expect(designSystemImportErrorKey({ code: 'SOMETHING_ELSE' })).toBeNull();
  });

  it('returns null when code is missing', () => {
    expect(designSystemImportErrorKey({})).toBeNull();
  });

  it('returns null for an empty code string', () => {
    expect(designSystemImportErrorKey({ code: '' })).toBeNull();
  });
});
