import { describe, expect, it } from 'vitest';

import { formatShellElapsed } from '../../../src/runtime/chat/format';

// P0-24 Q1: a turn header writes the duration whenever it was measured,
// "0s" under a second, and no number only when it could not be measured.
describe('formatShellElapsed', () => {
  it('writes 0s for a measured turn shorter than a second', () => {
    expect(formatShellElapsed(0)).toBe('0s');
    expect(formatShellElapsed(450)).toBe('0s');
  });

  it('writes no number when the duration is unknown', () => {
    expect(formatShellElapsed(null)).toBeNull();
    expect(formatShellElapsed(undefined)).toBeNull();
    expect(formatShellElapsed(Number.NaN)).toBeNull();
    expect(formatShellElapsed(-5)).toBeNull();
  });

  it('keeps the existing coarse format above a second', () => {
    expect(formatShellElapsed(1_000)).toBe('1.0s');
    expect(formatShellElapsed(31_000)).toBe('31s');
    expect(formatShellElapsed(80_000)).toBe('1m 20s');
  });
});
