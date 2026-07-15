// Unit tests for the shared required-field readers every memory provider
// routes through. This is the single place the "field absent (malformed) vs
// field present with a falsy/empty value (legitimate)" distinction is made —
// see the file's own header comment for why it exists as a shared helper.
import { describe, expect, it } from 'vitest';

import { requiredField, requiredNonNullField } from '../../../src/providers/memory/response-fields';

describe('requiredField', () => {
  it('returns a present field, including a falsy/empty legitimate value', () => {
    expect(requiredField({ items: [1, 2] }, 'items', 'ctx')).toEqual([1, 2]);
    expect(requiredField({ items: [] as number[] }, 'items', 'ctx')).toEqual([]);
    expect(requiredField({ value: null }, 'value', 'ctx')).toBeNull();
    expect(requiredField({ value: 0 }, 'value', 'ctx')).toBe(0);
  });

  it('throws when the field is entirely absent, naming the context and field', () => {
    expect(() => requiredField({} as { items?: number[] }, 'items', 'Widget list request')).toThrow(
      "Widget list request succeeded without a 'items' field",
    );
  });

  it('treats a malformed non-object 2xx body as an absent field', () => {
    expect(() => requiredField(null as never, 'items' as never, 'Widget list request')).toThrow(
      "Widget list request succeeded without a 'items' field",
    );
  });
});

describe('requiredNonNullField', () => {
  it('returns a present, non-null value', () => {
    expect(requiredNonNullField({ entry: { id: 'a' } }, 'entry', 'ctx')).toEqual({ id: 'a' });
    expect(requiredNonNullField({ count: 0 }, 'count', 'ctx')).toBe(0);
  });

  it('throws when the field is absent', () => {
    expect(() => requiredNonNullField({} as { entry?: unknown }, 'entry', 'Widget save')).toThrow(
      "Widget save succeeded without a 'entry' field",
    );
  });

  it('throws when the field is present but null or undefined — there is no legitimate empty case', () => {
    expect(() => requiredNonNullField({ entry: null }, 'entry', 'Widget save')).toThrow(
      "Widget save succeeded without a 'entry' field",
    );
    expect(() => requiredNonNullField({ entry: undefined }, 'entry', 'Widget save')).toThrow(
      "Widget save succeeded without a 'entry' field",
    );
  });
});
